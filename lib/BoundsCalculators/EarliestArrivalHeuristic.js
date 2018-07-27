const ConnectionProvider = require("../ConnectionProviders/LinkedConnections/LCConnectionProvider");

const WARN_CONN_OUT_OF_ORDER = "WARNING: connection not provided in order (ascending departure time). Discarding connection.";
const WARN_CONN_INCONSISTENT = "WARNING: invalid connection: departure time must be before arrival time. Discarding connection.";

class EarliestArrivalHeuristic {
    constructor(baseUrl, ISDCalculator, ldfetch) {
        this.baseUrl = baseUrl;
        this.connectionProvider = new ConnectionProvider(baseUrl, ldfetch, { "backward": false });
        this.stops = [];
        this.tripStructure = {};
        this.trips = [];
        this.profile = {};
        this.ISDCalculator = ISDCalculator;
        this.currentDepartureTime = undefined;
    }

    discover(connection) {
        // Check for data inconsistencies
        if (connection.departureTime < this.currentDepartureTime) {
            //console.warn(WARN_CONN_OUT_OF_ORDER);
            return false;
        } else if (connection.departureTime > connection.arrivalTime) {
            //console.warn(WARN_CONN_INCONSISTENT);
            return false;
        } else {
            this.currentDepartureTime = connection.departureTime;
            // Check if the stops of the connection are already known,
            // if not, initialize profile entries
            [connection.departureStop, connection.arrivalStop].forEach(stop => {
                if (this.stops.indexOf(stop) === -1) {
                    this.profile[stop] = Infinity;
                    this.stops.push(stop);
                }
            });
            // Check if trip of the connection is already known,
            // if not, initialize tripStructure entry
            if (this.trips.indexOf(connection["gtfs:trip"]) === -1) {
                this.tripStructure[connection["gtfs:trip"]] = false;
                this.trips.push(connection["gtfs:trip"]);
            }
        }
        return true;
    }

    async calculateUpperBound(departureStop, departureTime, arrivalStop) {
        this.stops.push(departureStop);
        this.stops.push(arrivalStop);
        this.profile[arrivalStop] = Infinity;
        this.currentDepartureTime = departureTime;
        let departureISDs = await this.ISDCalculator.getInterstopDistancesForStop(departureStop);
        let maxArrival = new Date(departureTime.getTime() + (3600 * 2 * 1000));

        departureISDs.forEach(isd => {
            let arrivalStop = isd.stop1;
            if (arrivalStop === departureStop) {
                arrivalStop = isd.stop2;
            }
            this.profile[arrivalStop] = new Date(departureTime.getTime() + isd.duration);
        });

        this.connectionProvider.setLowerBound(departureTime);
        let connection = await this.connectionProvider.read();
        while (!this.discover(connection)) {
            connection = await this.connectionProvider.read();
        }
        while (connection != null && this.profile[arrivalStop] > connection.departureTime && connection.departureTime <= maxArrival) {
            if (this.discover(connection)) {
                if (this.tripStructure[connection["gtfs:trip"]] || this.profile[connection.departureStop] <= connection.departureTime) {
                    this.tripStructure[connection["gtfs:trip"]] = true;
                    if (connection.arrivalTime < this.profile[connection.arrivalStop]) {
                        let arrivalISDs = await this.ISDCalculator.getInterstopDistancesForStop(connection.arrivalStop);
                        arrivalISDs.forEach(isd => {
                            let arrivalTime = new Date(connection.arrivalTime.getTime() + isd.duration);
                            let arrivalStop = isd.stop1;
                            if (arrivalStop === connection.arrivalStop) {
                                arrivalStop = isd.stop2;
                            }
                            if (arrivalTime < this.profile[arrivalStop]) {
                                this.profile[arrivalStop] = arrivalTime;
                            }
                        });
                    }
                }
            }
            connection = await this.connectionProvider.read();
        }

        let earliestArrival = this.profile[arrivalStop];
        if (earliestArrival < Infinity) {
            let diff = earliestArrival - departureTime;
            return new Date(departureTime.getTime() + 2 * diff);
        } else {
            return null;
        }
    }
}

module.exports = EarliestArrivalHeuristic;
