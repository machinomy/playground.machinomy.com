"use strict";

const express    = require("express"),
      bodyParser = require('body-parser'),
      machinomy  = require("machinomy");

const BASE = "http://playground.machinomy.com";

const settings = machinomy.configuration.receiver();
let paywall = new machinomy.Paywall(settings.account, BASE);

let app = express();
app.use(bodyParser.json());
app.use(paywall.middleware());

app.get("/hello", paywall.guard(1000, function (req, res) {
    res.write("Have just received 1000 wei.\n");
    res.end("Hello, meat world!");
}));

app.listen(8080, function(_) {
    console.log(`Waiting at ${BASE}/hello`);
});
