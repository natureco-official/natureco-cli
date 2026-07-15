const { buildWindowsClickScript, buildWindowsScrollScript, TRANSIENT_AX_ERROR } = require('../../src/utils/platform-gui');

describe('transient Accessibility API failure detection', () => {
  it('recognizes kAXErrorFailure (-25200), a transient failure common right after an app launches', () => {
    expect(TRANSIENT_AX_ERROR.test('36:54: execution error: System Events got an error: -25200. (-25200)')).toBe(true);
  });

  it('does not misclassify unrelated AppleScript errors as transient', () => {
    expect(TRANSIENT_AX_ERROR.test('Not authorized to send Apple events. (-1743)')).toBe(false);
  });
});

describe('Windows GUI automation scripts', () => {
  it('clicks via user32 mouse_event, not SendKeys (SendKeys has no {CLICK} code)', () => {
    const script = buildWindowsClickScript(10, 20);
    expect(script).not.toContain('SendKeys');
    expect(script).toContain('mouse_event(2, 0, 0, 0, 0)');
    expect(script).toContain('mouse_event(4, 0, 0, 0, 0)');
    expect(script).toContain('New-Object System.Drawing.Point(10, 20)');
  });

  it('double-clicks by repeating the down/up sequence', () => {
    const script = buildWindowsClickScript(10, 20, { doubleClick: true });
    expect(script.match(/mouse_event\(2, 0, 0, 0, 0\)/g)).toHaveLength(2);
  });

  it('right-clicks with the right-button flags', () => {
    const script = buildWindowsClickScript(0, 0, { button: 'right' });
    expect(script).toContain('mouse_event(8, 0, 0, 0, 0)');
    expect(script).toContain('mouse_event(16, 0, 0, 0, 0)');
  });

  it('scrolls via the mouse wheel event, not literal SendKeys text', () => {
    const script = buildWindowsScrollScript(-80);
    expect(script).not.toContain('SendKeys');
    expect(script).toContain('mouse_event(0x0800');
  });
});
