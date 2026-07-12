'use strict';

const crypto = require('crypto');

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function factKey(value, category = 'general') {
  const text = String(value || '').trim().toLowerCase();
  const subject = text.includes(':') ? text.split(':', 1)[0] : text.split(/\s+(?:is|=|likes?|prefers?|seviyor|yaşıyor)\s+/i, 1)[0];
  return `${category}:${subject.trim()}`;
}

function createMemoryRecord(input = {}, now = new Date()) {
  const createdAt = now.toISOString();
  const ttlMs = input.ttlMs == null ? null : Math.max(0, Number(input.ttlMs));
  return {
    id: input.id || `mem_${crypto.randomBytes(8).toString('hex')}`,
    value: String(input.value || '').trim(), category: input.category || 'general',
    score: clamp(Number(input.score ?? 5), 0, 10),
    source: input.source || 'unknown', confidence: clamp(Number(input.confidence ?? 0.5), 0, 1),
    createdAt: input.createdAt || createdAt, updatedAt: createdAt,
    lastVerifiedAt: input.lastVerifiedAt || (input.verified ? createdAt : null),
    expiresAt: ttlMs == null ? null : new Date(now.getTime() + ttlMs).toISOString(),
    status: input.status || 'active', userConfirmed: input.userConfirmed === true,
  };
}

function isActive(record, now = new Date()) {
  if (!record || record.status === 'rejected' || record.status === 'superseded') return false;
  return !record.expiresAt || new Date(record.expiresAt).getTime() > now.getTime();
}

function resolveConflict(existing, incoming) {
  if (!existing) return { winner: incoming, loser: null, reason: 'new' };
  if (existing.value === incoming.value) {
    const merged = { ...existing, ...incoming, id: existing.id, createdAt: existing.createdAt, confidence: Math.max(existing.confidence || 0, incoming.confidence || 0) };
    return { winner: merged, loser: null, reason: 'same-value' };
  }
  const existingWeight = (existing.userConfirmed ? 2 : 0) + (existing.confidence || 0);
  const incomingWeight = (incoming.userConfirmed ? 2 : 0) + (incoming.confidence || 0);
  if (incomingWeight > existingWeight) return { winner: incoming, loser: { ...existing, status: 'superseded' }, reason: 'higher-confidence' };
  return { winner: existing, loser: { ...incoming, status: 'rejected' }, reason: 'existing-preferred' };
}

function promoteCandidate(record, approval) {
  if (!approval?.approved) return { ok: false, error: 'user approval required' };
  return { ok: true, record: { ...record, status: 'active', userConfirmed: true, lastVerifiedAt: new Date().toISOString(), confidence: Math.max(record.confidence || 0, 0.9) } };
}

module.exports = { createMemoryRecord, isActive, resolveConflict, promoteCandidate, factKey };
