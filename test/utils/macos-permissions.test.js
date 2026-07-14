const { classifyMacAutomationError } = require('../../src/utils/macos-permissions');

describe('macOS automation permission diagnostics', () => {
  it('maps screencapture display failure to Screen Recording settings', () => {
    const result = classifyMacAutomationError('could not create image from display');
    expect(result.permission).toBe('screen-recording');
    expect(result.settingsUrl).toContain('Privacy_ScreenCapture');
    expect(result.error).toContain('Cupertino Terminal');
  });

  it('maps AppleScript authorization failures to Accessibility settings', () => {
    const result = classifyMacAutomationError('Not authorized to send Apple events. (-1743)');
    expect(result.permission).toBe('accessibility');
    expect(result.settingsUrl).toContain('Privacy_Accessibility');
  });
});
