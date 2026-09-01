/**
 * İzin kuralları: sessizce düşmemeli, dokümante edilen biçim gerçekten çalışmalı.
 *
 * Ölçülen üç hata (1 Eylül 2026):
 *
 * 1) parsePermissionRule regex'i `[a-zA-Z_]+` idi — TİRE ve RAKAM kabul
 *    etmiyordu. MCP araç adları mcp-tools.js:24'te `mcp__<sunucu>__<arac>`
 *    biçiminde üretiliyor ve tireyi koruyor; dolayısıyla
 *    "mcp__brave-search__web_search(*)": "deny" gibi bir kural hiç
 *    yüklenmiyordu. Düşen kural loglanmıyordu da.
 *
 * 2) checkPermission eşleşme bulamayınca 'allow' döndüğü için, ayrıştırılamayan
 *    bir "deny" kuralı sessizce "izin ver"e dönüşüyordu — fail-open.
 *
 * 3) Docblock'un önerdiği kısa adlar (Read/Edit/Bash) gerçek araç adlarıyla
 *    (read_file/edit_file/bash) birebir karşılaştırıldığı için HİÇ eşleşmiyordu.
 *    Kullanıcı `Read(~/.ssh/**)` yazıp SSH anahtarlarını koruduğunu sanıyordu.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const permissions = require('../../src/utils/permissions');

const KONFIG = path.join(os.homedir(), '.natureco', 'config.json');

function kurallariYaz(perms) {
  const mevcut = fs.existsSync(KONFIG) ? JSON.parse(fs.readFileSync(KONFIG, 'utf8')) : {};
  fs.writeFileSync(KONFIG, JSON.stringify({ ...mevcut, permissions: perms }, null, 2), 'utf8');
}

describe('izin kuralları', () => {
  let yedek = null;
  let vardi = false;

  beforeEach(() => {
    vardi = fs.existsSync(KONFIG);
    if (vardi) yedek = fs.readFileSync(KONFIG, 'utf8');
    fs.mkdirSync(path.dirname(KONFIG), { recursive: true });
  });

  afterEach(() => {
    if (vardi) fs.writeFileSync(KONFIG, yedek, 'utf8');
    else if (fs.existsSync(KONFIG)) fs.unlinkSync(KONFIG);
  });

  test('tireli araç adı (MCP) artık düşmüyor', () => {
    kurallariYaz({ 'mcp__brave-search__web_search(*)': 'deny' });
    const sonuc = permissions.checkPermission('mcp__brave-search__web_search', { q: 'test' });
    expect(sonuc.action).toBe('deny');
  });

  test('rakam içeren araç adı düşmüyor', () => {
    kurallariYaz({ 'mcp__s3__delete(*)': 'deny' });
    expect(permissions.checkPermission('mcp__s3__delete', {}).action).toBe('deny');
  });

  test('dokümante edilen Bash(...) kuralı gerçek bash aracına uygulanır', () => {
    kurallariYaz({ 'Bash(*rm *)': 'deny' });
    expect(permissions.checkPermission('bash', { command: 'rm -rf tmp' }).action).toBe('deny');
  });

  test('dokümante edilen Read(~/.ssh/**) kuralı gerçek read_file aracına uygulanır', () => {
    kurallariYaz({ 'Read(~/.ssh/**)': 'deny' });
    const gizli = path.join(os.homedir(), '.ssh', 'id_rsa').replace(/\\/g, '/');
    expect(permissions.checkPermission('read_file', { path: gizli }).action).toBe('deny');
  });

  test('Read kuralı ilgisiz dosyayı engellemez', () => {
    kurallariYaz({ 'Read(~/.ssh/**)': 'deny' });
    expect(permissions.checkPermission('read_file', { path: '/tmp/not.txt' }).action).toBe('allow');
  });

  test('kural yokken varsayılan allow korunur', () => {
    kurallariYaz({});
    expect(permissions.checkPermission('read_file', { path: '/tmp/x' }).action).toBe('allow');
  });

  test('ask eylemi korunur', () => {
    kurallariYaz({ 'Edit(*)': 'ask' });
    expect(permissions.checkPermission('edit_file', { path: 'a.txt' }).action).toBe('ask');
  });

  test('geçersiz kural sessizce yok sayılmaz (uyarı basar)', () => {
    const uyarilar = [];
    const eski = console.error;
    console.error = (...a) => uyarilar.push(a.join(' '));
    try {
      kurallariYaz({ 'Bozuk Kural Bicimi': 'deny' });
      permissions.checkPermission('read_file', { path: '/tmp/x' });
    } finally {
      console.error = eski;
    }
    expect(uyarilar.join('\n')).toMatch(/Geçersiz izin kuralı/);
  });
});
