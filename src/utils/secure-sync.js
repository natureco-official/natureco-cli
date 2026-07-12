'use strict';

const crypto = require('crypto');

function deriveKey(syncKey, salt) { return crypto.scryptSync(String(syncKey), salt, 32); }

function encryptSyncPayload(payload, options = {}) {
  if (!options.syncKey) throw new Error('syncKey is required');
  if (!options.deviceId) throw new Error('deviceId is required');
  const salt = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const key = deriveKey(options.syncKey, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const header = { version: 1, deviceId: options.deviceId, revision: options.revision || 1, clock: options.clock || { [options.deviceId]: options.revision || 1 }, createdAt: new Date().toISOString() };
  cipher.setAAD(Buffer.from(JSON.stringify(header)));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { ...header, algorithm: 'aes-256-gcm', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
}

function decryptSyncPayload(envelope, options = {}) {
  if (!options.syncKey) throw new Error('syncKey is required');
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') throw new Error('unsupported sync envelope');
  const header = { version: envelope.version, deviceId: envelope.deviceId, revision: envelope.revision, clock: envelope.clock, createdAt: envelope.createdAt };
  try {
    const key = deriveKey(options.syncKey, Buffer.from(envelope.salt, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(JSON.stringify(header))); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return { header, payload: JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8')) };
  } catch { throw new Error('sync payload authentication failed'); }
}

function compareClocks(left = {}, right = {}) {
  const devices = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftAhead = false, rightAhead = false;
  for (const device of devices) {
    const l = left[device] || 0, r = right[device] || 0;
    if (l > r) leftAhead = true; if (r > l) rightAhead = true;
  }
  if (leftAhead && rightAhead) return 'concurrent';
  if (leftAhead) return 'after';
  if (rightAhead) return 'before';
  return 'equal';
}

function mergeSyncRecords(local = [], remote = []) {
  const records = new Map(); const conflicts = [];
  for (const item of [...local, ...remote]) {
    if (!item?.id) continue;
    const existing = records.get(item.id);
    if (!existing) { records.set(item.id, item); continue; }
    const relation = compareClocks(existing.clock, item.clock);
    if (relation === 'before') records.set(item.id, item);
    else if (relation === 'concurrent' && JSON.stringify(existing.value) !== JSON.stringify(item.value)) {
      conflicts.push({ id: item.id, local: existing, remote: item });
      const winner = existing.userConfirmed !== item.userConfirmed
        ? (item.userConfirmed ? item : existing)
        : (String(item.updatedAt || '') > String(existing.updatedAt || '') ? item : existing);
      records.set(item.id, winner);
    }
  }
  return { records: [...records.values()], conflicts };
}

module.exports = { encryptSyncPayload, decryptSyncPayload, compareClocks, mergeSyncRecords };
