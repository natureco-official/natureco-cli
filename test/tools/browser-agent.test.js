const browser = require('../../src/tools/browser');

describe('persistent browser agent helpers', () => {
  it('finds an installed system browser without bundling Chromium', () => {
    const expected = browser._test.chromeCandidates('darwin')[1];
    expect(browser._test.findChrome('darwin', value => value === expected)).toBe(expected);
  });

  it('allows only http/https navigation', () => {
    expect(browser._test.safeUrl('https://natureco.me/landing')).toBe('https://natureco.me/landing');
    expect(() => browser._test.safeUrl('file:///etc/passwd')).toThrow(/http\/https/);
    expect(() => browser._test.safeUrl('javascript:alert(1)')).toThrow(/http\/https/);
  });

  it('requires snapshot refs instead of guessed selectors', () => {
    expect(browser._test.refSelector('@e12')).toBe('[data-natureco-ref="e12"]');
    expect(() => browser._test.refSelector('#submit')).toThrow(/fresh @e reference/);
  });

  it('publishes the observe-act action surface', () => {
    const actions = browser.inputSchema.properties.action.enum;
    for (const action of ['open', 'snapshot', 'click', 'fill', 'type', 'press', 'current_url', 'close']) expect(actions).toContain(action);
  });
});
