/**
 * REPL, yapılandırılmış MCP sunucularının araçlarını da tanımalı.
 *
 * Regresyon: REPL araç listesini yalnızca yerleşik manifestten kuruyordu, bu
 * yüzden `natureco chat` içinde hiçbir MCP sunucusu görünmüyordu — `natureco
 * code` ise aynı sunucuyu sorunsuz yüklüyordu. Kullanıcı için semptom sessizdi:
 * doğru yapılandırma, sıfır araç, sıfır hata.
 *
 * Düzeltme geri alındığında bu dosyadaki ilk iki test düşer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const repl = requireCjs('../src/commands/repl.js');
const { warmMcpTools, getToolDefs } = repl._internal;

function fakeApi(tools) {
  return {
    startMcpServers: vi.fn(async () => {}),
    getMcpTools: vi.fn(() => tools),
    executeMcpTool: vi.fn(async () => ({ success: true, output: 'ok' })),
  };
}

const ledgerTools = [
  { name: 'borc_ekle', description: 'Borç ekle', _mcpServer: 'dukkan_ledger',
    inputSchema: { type: 'object', properties: { tutar: { type: 'number' } }, required: ['tutar'] } },
  { name: 'onay_ver', description: 'Onayla', _mcpServer: 'dukkan_ledger',
    inputSchema: { type: 'object', properties: { islem_id: { type: 'number' } }, required: ['islem_id'] } },
];

const config = { mcpServers: { dukkan_ledger: { command: 'node', args: ['x.js'] } } };

describe('REPL MCP araç yükleme', () => {
  beforeEach(async () => {
    // Her testte temiz başla: warmMcpTools önbelleği sıfırlar.
    await warmMcpTools({ api: fakeApi([]), config: {} });
  });

  it('ısıtmadan sonra MCP araçlarını araç listesine katar', async () => {
    await warmMcpTools({ api: fakeApi(ledgerTools), config });
    const names = getToolDefs().map(t => t.name);
    expect(names).toContain('mcp__dukkan_ledger__borc_ekle');
    expect(names).toContain('mcp__dukkan_ledger__onay_ver');
  });

  it('MCP araçlarını çalıştırılabilir biçimde verir (executeTool bunu çözebilmeli)', async () => {
    await warmMcpTools({ api: fakeApi(ledgerTools), config });
    const tool = getToolDefs().find(t => t.name === 'mcp__dukkan_ledger__borc_ekle');
    expect(typeof tool.execute).toBe('function');
    expect(tool.parameters.properties).toHaveProperty('tutar');
    await expect(tool.execute({ tutar: 100 })).resolves.toBe('ok');
  });

  it('yerleşik araçları düşürmez', async () => {
    await warmMcpTools({ api: fakeApi(ledgerTools), config });
    const names = getToolDefs().map(t => t.name);
    expect(names).toContain('read_file');
    expect(names.filter(n => n.startsWith('mcp__'))).toHaveLength(2);
  });

  it('sunucu yapılandırılmamışsa liste yalnızca yerleşiklerden oluşur', async () => {
    await warmMcpTools({ api: fakeApi(ledgerTools), config: {} });
    expect(getToolDefs().some(t => t.name.startsWith('mcp__'))).toBe(false);
    expect(getToolDefs().length).toBeGreaterThan(0);
  });

  it('bozuk bir MCP sunucusu REPL\'i araçsız bırakmaz', async () => {
    const patlayanApi = {
      startMcpServers: vi.fn(async () => { throw new Error('sunucu ayağa kalkmadı'); }),
      getMcpTools: vi.fn(() => []),
      executeMcpTool: vi.fn(),
    };
    await warmMcpTools({ api: patlayanApi, config });
    const names = getToolDefs().map(t => t.name);
    expect(names).toContain('read_file');
    expect(names.some(n => n.startsWith('mcp__'))).toBe(false);
  });
});
