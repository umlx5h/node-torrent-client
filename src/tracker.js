'use strict';

const dgram = require('dgram');
const Buffer = require('buffer').Buffer;
const urlParse = require('url').parse;
const crypto = require('crypto');
const torrentParser = require('./torrent-parser');
const axios = require('axios')
const bencode = require('bencode')
const util = require('./util');

module.exports.getPeersTcp = (torrent, callback) => {
  let url = "";
  if ('announce-list' in torrent) {
    const trackerList = torrent['announce-list'].filter(el => el[0].includes('http')).map(el => el[0]);
    if (trackerList.length !== 0) {
      url = trackerList[0].toString('utf8');
      console.log('selected tracker:', url);
    } else {
      url = torrent.announce.toString('utf8');
    }
  }
  console.log('tracker url:', url);

  // 3. send announce request
  let trackerUrl = null;

  const hex = torrentParser.infoHash(torrent, false)
  let info_hash = "";
  for (let count = 0; count < hex.length; count+=2) {
    info_hash += "%" + hex[count] + hex[count+1]
  }
  console.log(info_hash);

  const params = {
    info_hash: info_hash,
    peer_id: "abcdeabcdeabcdeabcde",
    port: "6881",
    uploaded: "0",
    downloaded: "0",
    compact: "1",
    left: torrentParser.size(torrent, false)
  }

  const announceUri = axios.getUri({url, params}).replace(/%25/g, "%");
  console.log(announceUri);

  function group(iterable, groupSize) {
    let groups = [];
    for (let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize));
    }
    return groups;
  }

  // return
  axios.get(announceUri, {responseType: 'arraybuffer'}).then(res => {
    let announceResp = bencode.decode(res.data)
    console.log(announceResp.peers);

    let peers = group(announceResp.peers, 6).map(address => {
      return {
        ip: address.slice(0, 4).join('.'),
        port: address.readUInt16BE(4)
      }
    })

    callback(peers);
  }).catch(err => {
    console.log(err.message);
  })
}

module.exports.getPeersUdp = (torrent, callback) => {
  const socket = dgram.createSocket('udp4');
  let url = "";
  if ('announce-list' in torrent) {
    const tcpTrackerList = torrent['announce-list'].filter(el => el[0].includes('udp://')).map(el => el[0]);
    if (tcpTrackerList.length !== 0) {
      url = tcpTrackerList[0].toString('utf8');
      console.log('selected tracker:', url);
    }
  } else {
    url = torrent.announce.toString('utf8');
  }
  console.log('tracker url:', url);

  // 1. send connect request
  udpSend(socket, buildConnReq(), url);

  socket.on('message', response => {
    console.log('connected', response);
    if (respType(response) === 'connect') {
      // 2. receive and parse connect response
      const connResp = parseConnResp(response);
      // 3. send announce request
      const announceReq = buildAnnounceReq(connResp.connectionId, torrent);
      udpSend(socket, announceReq, url);
    } else if (respType(response) === 'announce') {
      // 4. parse announce response
      const announceResp = parseAnnounceResp(response);
      // 5. pass peers to callback
      callback(announceResp.peers);
    }
  });
};

function udpSend(socket, message, rawUrl, callback=(err)=>{
  if (err) console.log(err);
}) {
  const url = urlParse(rawUrl);
  socket.send(message, 0, message.length, url.port, url.hostname, callback);
}

function respType(resp) {
  const action = resp.readUInt32BE(0);
  if (action === 0) return 'connect';
  if (action === 1) return 'announce';
}

function buildConnReq() {
  const buf = Buffer.allocUnsafe(16);

  // connection id
  buf.writeUInt32BE(0x417, 0);
  buf.writeUInt32BE(0x27101980, 4);
  // action
  buf.writeUInt32BE(0, 8);
  // transaction id
  crypto.randomBytes(4).copy(buf, 12);

  return buf;
}

function parseConnResp(resp) {
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8)
  }
}

function buildAnnounceReq(connId, torrent, port=6881) {
  const buf = Buffer.allocUnsafe(98);

  // connection id
  connId.copy(buf, 0);
  // action
  buf.writeUInt32BE(1, 8);
  // transaction id
  crypto.randomBytes(4).copy(buf, 12);
  // info hash
  torrentParser.infoHash(torrent).copy(buf, 16);
  // peerId
  util.genId().copy(buf, 36);
  // downloaded
  Buffer.alloc(8).copy(buf, 56);
  // left
  torrentParser.size(torrent).copy(buf, 64);
  // uploaded
  Buffer.alloc(8).copy(buf, 72);
  // event
  buf.writeUInt32BE(0, 80);
  // ip address
  buf.writeUInt32BE(0, 80);
  // key
  crypto.randomBytes(4).copy(buf, 88);
  // num want
  buf.writeInt32BE(-1, 92);
  // port
  buf.writeUInt16BE(port, 96);

  return buf;
}

function parseAnnounceResp(resp) {
  function group(iterable, groupSize) {
    let groups = [];
    for (let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize));
    }
    return groups;
  }

  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    leechers: resp.readUInt32BE(8),
    seeders: resp.readUInt32BE(12),
    peers: group(resp.slice(20), 6).map(address => {
      return {
        ip: address.slice(0, 4).join('.'),
        port: address.readUInt16BE(4)
      }
    })
  }
}
