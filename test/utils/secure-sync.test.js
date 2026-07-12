const { encryptSyncPayload, decryptSyncPayload, compareClocks, mergeSyncRecords } = require('../../src/utils/secure-sync');

describe('encrypted multi-device sync', () => {
  test('encrypts, authenticates and decrypts a payload', () => {
    const envelope = encryptSyncPayload({ facts: [{ id: '1', value: 'x' }] }, { syncKey: 'shared-secret', deviceId: 'mac', revision: 2 });
    expect(JSON.stringify(envelope)).not.toContain('"value":"x"');
    expect(decryptSyncPayload(envelope, { syncKey: 'shared-secret' })).toMatchObject({ header: { deviceId: 'mac', revision: 2 }, payload: { facts: [{ value: 'x' }] } });
    expect(() => decryptSyncPayload(envelope, { syncKey: 'wrong' })).toThrow(/authentication failed/);
  });

  test('detects vector-clock ordering and concurrency', () => {
    expect(compareClocks({ a: 2 }, { a: 1 })).toBe('after');
    expect(compareClocks({ a: 1 }, { a: 1 })).toBe('equal');
    expect(compareClocks({ a: 2, b: 0 }, { a: 1, b: 2 })).toBe('concurrent');
  });

  test('merges newer records and surfaces concurrent conflicts', () => {
    const local = [{ id: '1', value: 'Ankara', clock: { mac: 2 }, updatedAt: '2026-01-01' }];
    const remote = [{ id: '1', value: 'Istanbul', clock: { phone: 2 }, updatedAt: '2026-02-01', userConfirmed: true }];
    const result = mergeSyncRecords(local, remote);
    expect(result.conflicts).toHaveLength(1);
    expect(result.records[0].value).toBe('Istanbul');
  });
});
