const { _internals } = require('../../src/utils/pairing-store');

describe('pairing store', () => {
  test('finds only matching channel, sender and status', () => {
    const pairings = [{ channel: 'signal', senderId: '+90', status: 'approved' }];
    expect(_internals.findPairing(pairings, 'signal', '+90', 'approved')).toBe(pairings[0]);
    expect(_internals.findPairing(pairings, 'telegram', '+90', 'approved')).toBeUndefined();
  });

  test('creates a pending channel-bound pairing without secrets', () => {
    const entry = _internals.createPairingEntry('telegram', 42);
    expect(entry).toMatchObject({ channel: 'telegram', senderId: '42', status: 'pending' });
    expect(entry.id).toMatch(/^pair_/);
    expect(entry.code.length).toBeGreaterThan(8);
  });
});
