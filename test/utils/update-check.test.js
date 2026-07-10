/**
 * update-check — yeni-sürüm bildirimi (v5.48) testleri.
 *
 * Kullanıcılar eski sürümde takılı kalıyordu (v5.13'te 10 skill vardı, 319'u
 * v5.21 getirdi) ve CLI güncelleme uyarısı vermiyordu → "skill'ler/araçlar
 * görünmüyor" raporları. Bu testler sürüm karşılaştırmasını ve bildirimin
 * güvenlik kapılarını (TTY, opt-out) kilitler.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { maybeNotify, compareVersions } from '../../src/utils/update-check.js';

describe('compareVersions — basit semver', () => {
  it('büyük/küçük/eşit doğru sıralanır', () => {
    expect(compareVersions('5.21.0', '5.13.0')).toBe(1);
    expect(compareVersions('5.13.0', '5.21.0')).toBe(-1);
    expect(compareVersions('5.47.1', '5.47.1')).toBe(0);
  });

  it('çok haneli parçalar sayısal karşılaştırılır (5.10 > 5.9)', () => {
    expect(compareVersions('5.10.0', '5.9.9')).toBe(1);
    expect(compareVersions('10.0.0', '9.99.99')).toBe(1);
  });

  it('patch farkı yakalanır', () => {
    expect(compareVersions('5.47.2', '5.47.1')).toBe(1);
  });

  it('bozuk girdi çökmez', () => {
    expect(() => compareVersions('abc', '1.2.3')).not.toThrow();
    expect(compareVersions('', '0.0.0')).toBe(0);
  });
});

describe('maybeNotify — güvenlik kapıları', () => {
  afterEach(() => {
    delete process.env.NATURECO_NO_UPDATE_CHECK;
    vi.restoreAllMocks();
  });

  it('TTY değilken hiçbir şey basmaz (pipe/script çıktısı kirlenmez)', () => {
    const spy = vi.spyOn(console, 'log');
    const origTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    maybeNotify('0.0.1'); // her sürümden eski — bildirilecek olsa basardı
    Object.defineProperty(process.stdout, 'isTTY', { value: origTTY, configurable: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('NATURECO_NO_UPDATE_CHECK=1 ile tamamen susar', () => {
    const spy = vi.spyOn(console, 'log');
    process.env.NATURECO_NO_UPDATE_CHECK = '1';
    const origTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    maybeNotify('0.0.1');
    Object.defineProperty(process.stdout, 'isTTY', { value: origTTY, configurable: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('hata durumunda fırlatmaz (komutu asla bozmaz)', () => {
    expect(() => maybeNotify(undefined)).not.toThrow();
  });
});
