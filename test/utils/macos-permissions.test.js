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

  it('maps the undefined-"mouse"-variable AppleScript error to Accessibility settings', () => {
    const result = classifyMacAutomationError('55:60: execution error: mouse değişkeni tanımlanmamış. (-2753)');
    expect(result.permission).toBe('accessibility');
    expect(result.settingsUrl).toContain('Privacy_Accessibility');
  });

  it('maps the classic "assistive devices" AppleScript error to Accessibility settings', () => {
    const result = classifyMacAutomationError('System Events got an error: osascript is not allowed access for assistive devices.');
    expect(result.permission).toBe('accessibility');
  });
});
