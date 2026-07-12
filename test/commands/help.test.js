const { providerHostname } = require('../../src/commands/help');

describe('help provider display', () => {
  it.each([
    ['https://api.minimax.io/v1', 'api.minimax.io'],
    ['http://localhost:11434/v1', 'localhost'],
    ['custom-provider.example/v1', 'custom-provider.example'],
  ])('renders %s as %s', (providerUrl, expected) => {
    expect(providerHostname(providerUrl)).toBe(expected);
  });
});
