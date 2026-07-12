import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';

describe('REPL English localization', () => {
  let replInternal;
  let logSpy;

  beforeAll(() => {
    const i18n = require('../../src/utils/i18n');
    i18n.setLangCache('en');
    replInternal = require('../../src/commands/repl')._internal;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    logSpy.mockRestore();
    require('../../src/utils/i18n').setLangCache('tr');
  });

  it('renders the complete help menu in English', () => {
    replInternal.printHelp();
    const output = logSpy.mock.calls.flat().join('\n');

    expect(output).toContain('REPL Commands');
    expect(output).toContain('Show memory');
    expect(output).toContain('Plan mode');
    expect(output).toContain('Save session manually');
    expect(output).toContain('System health check');
    expect(output).toContain('Start web dashboard');
    expect(output).not.toMatch(/göster|temizle|Oturumu|Sistem sağlığı|Yüklü|Bağlı|görevleri|gerekli|başlat/);
  });

  it('keeps all command descriptions available', () => {
    expect(Object.values(replInternal.CLI_COMMANDS).every(command => command.desc && command.run)).toBe(true);
  });
});
