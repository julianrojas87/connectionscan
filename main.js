const InfinityISDCalculator = require("./lib/ISDCalculators/InfinityISDCalculator");
const LCConnectionProvider = require("./lib/ConnectionProviders/LinkedConnections/LCConnectionProvider");
const EarliestArrivalHeuristic = require("./lib/BoundsCalculators/EarliestArrivalHeuristic");
const CSA = require("./lib/CSA");
const ldfetch = require("ldfetch");


let stop1 = "http://irail.be/stations/NMBS/008896008"; // Kortrijk
let stop2 = "http://irail.be/stations/NMBS/008812005"; // Brussel-Noord

let ldf = new ldfetch();

//Show HTTP Requests and response times
var httpStartTimes = {};
var httpResponseTimes = {};
ldf.on('request', function (url) {
  httpStartTimes[url] = new Date();
});

ldf.on('redirect', function (obj) {
  httpStartTimes[obj.to] = httpStartTimes[obj.from];
});

ldf.on('response', function (url) {
  httpResponseTimes[url] = (new Date()).getTime() - httpStartTimes[url].getTime();
  console.error('HTTP GET - ' + url + ' (' + httpResponseTimes[url] + 'ms)');
});

let irailCP = new LCConnectionProvider("https://graph.irail.be/sncb/connections", ldf);
let infinityISDC = new InfinityISDCalculator(60*1000); // 1 minute transfer time
let boundsCalculator = new EarliestArrivalHeuristic("https://graph.irail.be/sncb/connections", infinityISDC, ldf);
let csa = new CSA(irailCP, infinityISDC, boundsCalculator, false);
csa.getJourneys(stop1, stop2, new Date("2018-03-01T08:00:00Z"), 5).then(journeys => {
    console.log(JSON.stringify(journeys, null, 4));
});
