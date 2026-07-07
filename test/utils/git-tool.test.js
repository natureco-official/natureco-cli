/**
 * git aracı — v5.38 güvenlik + esneklik regresyonları.
 *
 * Neden: git.js eskiden `execSync('git log ' + args)` ile string komut kuruyordu →
 * args içindeki ";", "&&", "$()" shell'de çalışıyordu (komut enjeksiyonu). Ayrıca
 * agentic-runner'daki `git remote add` / `git push` blokları bu ÖZEL aracı hiç
 * görmüyordu (bypass). Bu testler enjeksiyonun ve remote-yazma bypass'ının geri
 * gelmemesini kilitler.
 */
import { describe, it, expect } from 'vitest';
import git from '../../src/tools/git.js';

describe('git aracı — tokenizeArgs (shell enjeksiyonu imkansiz)', () => {
  it('shell metakarakterlerini AYRI komut degil, argüman token\'i olarak parçalar', () => {
    // ";" ve "&&" birer git argümanı token'ı olur — asla ayrı bir shell komutu değil.
    const t = git._tokenizeArgs('-n 1; echo PWNED && rm -rf /');
    expect(t).toContain('1;');       // ";" bir sonraki komutu BAŞLATMAZ
    expect(t).toContain('echo');     // düz argüman olarak kalır
    expect(t).toContain('&&');       // operatör değil, token
    // execFileSync bu diziyi shell:false ile geçirir → hiçbiri yorumlanmaz.
  });

  it('tırnaklı parçaları korur', () => {
    expect(git._tokenizeArgs('"tek parça" ayrı')).toEqual(['tek parça', 'ayrı']);
  });

  it('boş/undefined args -> boş dizi', () => {
    expect(git._tokenizeArgs('')).toEqual([]);
    expect(git._tokenizeArgs(undefined)).toEqual([]);
  });
});

describe('git aracı — remote yazma guard (bypass kapatıldı)', () => {
  for (const sub of ['add', 'set-url', 'remove', 'rm', 'rename']) {
    it(`remote ${sub} engellenir (git çağrılmadan önce)`, () => {
      const r = git.execute({ operation: 'remote', args: `${sub} origin https://evil.example/x` });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/engellend|guvenlik/i);
    });
  }
});

describe('git aracı — esnek giriş + bilinmeyen operasyon', () => {
  it('bilinmeyen operasyon net hata döndürür (sessiz başarısızlık yok)', () => {
    const r = git.execute({ operation: 'kesinlikle-yok' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Bilinmeyen git islemi/i);
  });

  it('operation yoksa args/command\'dan ilk token operation olur', () => {
    // "push ..." güvenli değil ama parse'ın operation'ı çıkardığını görmek için
    // bilinmeyen bir operasyon kullan → "Bilinmeyen git islemi: foo" almalıyız.
    const r = git.execute({ command: 'foo bar baz' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/foo/i);
  });
});
