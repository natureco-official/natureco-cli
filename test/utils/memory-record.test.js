const { createMemoryRecord, isActive, resolveConflict, promoteCandidate, factKey } = require('../../src/utils/memory-record');

describe('versioned memory records', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  test('stores provenance, confidence, verification and TTL', () => {
    const record = createMemoryRecord({ value: 'city: Istanbul', source: 'user', confidence: 0.8, verified: true, ttlMs: 1000 }, now);
    expect(record).toMatchObject({ value: 'city: Istanbul', source: 'user', confidence: 0.8, lastVerifiedAt: now.toISOString(), expiresAt: '2026-01-01T00:00:01.000Z' });
    expect(isActive(record, new Date('2026-01-01T00:00:00.500Z'))).toBe(true);
    expect(isActive(record, new Date('2026-01-01T00:00:02.000Z'))).toBe(false);
  });

  test('prefers user-confirmed or higher-confidence conflicting facts', () => {
    const oldFact = createMemoryRecord({ value: 'city: Ankara', confidence: 0.9 }, now);
    const correction = createMemoryRecord({ value: 'city: Istanbul', confidence: 0.4, userConfirmed: true }, now);
    expect(factKey(oldFact.value)).toBe(factKey(correction.value));
    expect(resolveConflict(oldFact, correction)).toMatchObject({ winner: { value: 'city: Istanbul' }, loser: { status: 'superseded' } });
  });

  test('promotion always requires explicit user approval', () => {
    const candidate = createMemoryRecord({ value: 'prefers concise output', status: 'candidate' }, now);
    expect(promoteCandidate(candidate, { approved: false })).toMatchObject({ ok: false });
    expect(promoteCandidate(candidate, { approved: true })).toMatchObject({ ok: true, record: { userConfirmed: true, status: 'active' } });
  });
});
