'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomicSync, readJsonSafeSync } = require('./atomic-file');

const PAIRINGS_FILE = path.join(os.homedir(), '.natureco', 'pairings.json');

function loadPairings() {
  const value = readJsonSafeSync(PAIRINGS_FILE, []);
  return Array.isArray(value) ? value : [];
}

function savePairings(pairings) {
  fs.mkdirSync(path.dirname(PAIRINGS_FILE), { recursive: true, mode: 0o700 });
  writeJsonAtomicSync(PAIRINGS_FILE, pairings, { mode: 0o600 });
}

function genCode() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function findPairing(pairings, channel, senderId, status) {
  const sender = String(senderId);
  return pairings.find(item => item.channel === channel && String(item.senderId) === sender && item.status === status);
}

function createPairingEntry(channel, senderId) {
  const sender = String(senderId);
  return {
    id: `pair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    code: genCode(), channel, senderId: sender, nodeName: `${channel}:${sender}`,
    status: 'pending', createdAt: new Date().toISOString(),
  };
}

function ensurePendingPairing(channel, senderId) {
  const pairings = loadPairings();
  const existing = findPairing(pairings, channel, senderId, 'pending');
  if (existing) return existing;
  const entry = createPairingEntry(channel, senderId);
  pairings.push(entry);
  savePairings(pairings);
  return entry;
}

function isPaired(channel, senderId) {
  return !!findPairing(loadPairings(), channel, senderId, 'approved');
}

module.exports = {
  PAIRINGS_FILE, loadPairings, savePairings, genCode, ensurePendingPairing, isPaired,
  _internals: { findPairing, createPairingEntry },
};
