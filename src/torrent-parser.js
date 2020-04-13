'use strict';

const fs = require('fs');
const bencode = require('bencode');
const crypto = require('crypto');
const bignum = require('bignum');

module.exports.open = (filepath) => {
  return bencode.decode(fs.readFileSync(filepath));
};

module.exports.infoHash = (torrent, isBuffer=true) => {
  const info = bencode.encode(torrent.info);

  if (!isBuffer) {
    return crypto.createHash('sha1').update(info).digest('hex');
  }
  return crypto.createHash('sha1').update(info).digest();
};

module.exports.size = (torrent, isBuffer=true) => {
  const size = torrent.info.files ?
    torrent.info.files.map(file => file.length).reduce((a, b) => a + b) :
    torrent.info.length;

  if (!isBuffer) {
    return size;
  }
  return bignum.toBuffer(size, {size: 8});
};
