'use strict';

const tracker = require('./tracker');

module.exports = torrent => {
  tracker.getPeersUdp(torrent, peers => {
    console.log("get peers success:", peers);
  });
};
