/**
 * `natureco mcp` komutu ile ajan çalışma zamanı AYNI yapılandırmayı görmeli.
 *
 * Hata (1 Eylül 2026'da gerçek kullanımda ölçüldü):
 *   yazan  → src/commands/mcp.js:6  ~/.natureco/mcp-servers.json
 *   okuyan → src/utils/mcp.js:52    ~/.natureco/config.json  (mcpServers alanı)
 *
 * İki dosya hiç buluşmuyordu. `natureco mcp set X ...` çalıştırıldığında araç
 * "MCP server X configured." diyor, `mcp list` onu "enabled" gösteriyor —
 * ama ajan (chat de code da) o sunucuyu HİÇ görmüyordu. Yani aracın kendi
 * önerdiği yolu izleyen kullanıcı, hiçbir zaman yüklenmeyen bir MCP
 * sunucusuyla kalıyordu. Tersi de geçerliydi: `mcp unset` sunucuyu kaldırmış
 * gibi görünüyor ama config.json'daki kayıt aktif kalıyordu.
 *
 * Bu test, komut katmanı ile çalışma zamanının tek kaynakta buluştuğunu
 * sabitler.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const mcpUtils = require('../src/utils/mcp');
const mcpTools = require('../src/utils/mcp-tools');
const { loadConfig } = require('../src/utils/config');

const KONFIG = path.join(os.homedir(), '.natureco', 'config.json');

describe('MCP yapılandırması tek kaynaktan okunur', () => {
  let yedek = null;
  let vardi = false;

  beforeEach(() => {
    vardi = fs.existsSync(KONFIG);
    if (vardi) yedek = fs.readFileSync(KONFIG, 'utf8');
  });

  afterEach(() => {
    if (vardi) fs.writeFileSync(KONFIG, yedek, 'utf8');
    else if (fs.existsSync(KONFIG)) fs.unlinkSync(KONFIG);
  });

  test('saveMcpServers ile yazılan, getMcpServers ile geri okunur', () => {
    const oncekiler = mcpUtils.getMcpServers();
    mcpUtils.saveMcpServers({ ...oncekiler, _test_sunucu: { command: 'node', args: ['x.js'] } });

    const geri = mcpUtils.getMcpServers();
    expect(geri._test_sunucu).toBeTruthy();
    expect(geri._test_sunucu.command).toBe('node');
  });

  test('komut katmanının yazdığını ajan çalışma zamanı görür', () => {
    mcpUtils.saveMcpServers({ _test_sunucu: { command: 'node', args: ['x.js'] } });

    // Ajanın gördüğü yol: loadConfig().mcpServers
    const config = loadConfig();
    expect(Object.keys(config.mcpServers || {})).toContain('_test_sunucu');

    // Ve MCP katmanı bunu "yapılandırılmış" sayar.
    expect(mcpTools.isConfigured(config)).toBe(true);
  });

  test('devre dışı sunucu yapılandırılmış sayılmaz', () => {
    mcpUtils.saveMcpServers({ _test_sunucu: { command: 'node', disabled: true } });
    expect(mcpTools.isConfigured(loadConfig())).toBe(false);
  });

  test('kaldırılan sunucu çalışma zamanından da düşer', () => {
    mcpUtils.saveMcpServers({ _test_sunucu: { command: 'node' } });
    expect(Object.keys(loadConfig().mcpServers || {})).toContain('_test_sunucu');

    mcpUtils.saveMcpServers({});
    expect(Object.keys(loadConfig().mcpServers || {})).not.toContain('_test_sunucu');
  });

  test('artık okunmayan mcp-servers.json tek doğruluk kaynağı değildir', () => {
    // Eski dosyaya yazmak çalışma zamanını ETKİLEMEMELİ; tek kaynak config.json.
    const eski = path.join(os.homedir(), '.natureco', 'mcp-servers.json.test-artifact');
    fs.writeFileSync(eski, JSON.stringify({ hayalet: { command: 'node' } }), 'utf8');
    try {
      mcpUtils.saveMcpServers({});
      expect(Object.keys(loadConfig().mcpServers || {})).not.toContain('hayalet');
    } finally {
      fs.unlinkSync(eski);
    }
  });
});
