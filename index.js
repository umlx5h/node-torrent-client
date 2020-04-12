'use strict';

const fs = require('fs');
const bencode = require('bencode');
const tracker = require('./tracker');
const torrentParser = require('./torrent-parser');

const filePath = process.argv[2];

const torrent = torrentParser.open(filePath);

// console.log(torrent);
// console.log(torrent['announce-list'].find(element => element[0].includes('udp://tracker.filetracker.pl'))[0]);

tracker.getPeers(torrent, peers => {
  console.log('list of peers: ', peers);
});
