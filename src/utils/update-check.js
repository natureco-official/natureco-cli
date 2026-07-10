/**
 * update-check — hafif, engellemesiz yeni-sürüm bildirimi.
 *
 * NEDEN: Kullanıcılar eski sürümde takılı kalıyor ve aradaki farkı bilmiyor
 * (örn. v5.13'te 10 skill vardı; 319 skill v5.21'de geldi — eski sürümdeki
 * kullanıcılar "skill'ler yok" sanıyor). CLI hiç güncelleme uyarısı vermiyordu.
 *
 * TASARIM:
 * - Registry'ye en fazla 24 saatte bir sorulur; sonuç ~/.natureco/update-check.json
 *   içinde saklanır.
 * - Bildirim SENKRON olarak önbellekten basılır (ağ beklenmez, CLI yavaşlamaz);
 *   arka plandaki tazeleme isteği socket.unref() ile süreci canlı tutmaz.
 * - Ağ hatası sessizce yutulur — güncelleme kontrolü asla komutu bozamaz.
 * - Yalnız TTY'de basılır (pipe/script çıktısı kirlenmez).
 * - NATURECO_NO_UPDATE_CHECK=1 ile tamamen kapatılır.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const CACHE_FILE = path.join(os.homedir(), '.natureco', 'update-check.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 saat
const REGISTRY_URL = 'https://registry.npmjs.org/natureco-cli/latest';

/** "5.47.1" > "5.13.0" gibi basit semver karşılaştırması (a > b → 1, a < b → -1). */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}

function writeCache(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf8');
  } catch { /* önbellek kritik değil */ }
}

/** Arka planda registry'den son sürümü çek ve önbelleğe yaz. Süreci canlı tutmaz. */
function refreshInBackground() {
  try {
    const req = https.get(REGISTRY_URL, { timeout: 3000, headers: { Accept: 'application/json' } }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const latest = JSON.parse(body).version;
          if (latest) writeCache({ lastCheck: Date.now(), latest });
        } catch { /* bozuk yanıt — yut */ }
      });
      res.on('error', () => {});
    });
    // Süreç, istek bitmeden çıkabilsin (hızlı komutları 3sn bekletme)
    req.on('socket', (s) => { try { s.unref(); } catch {} });
    req.on('timeout', () => { try { req.destroy(); } catch {} });
    req.on('error', () => {});
  } catch { /* ağ yok — sessiz */ }
}

/**
 * CLI başlangıcında çağrılır: önbellekte daha yeni sürüm görünüyorsa tek satır
 * bildirim basar; önbellek bayatsa arka planda tazeler.
 */
function maybeNotify(currentVersion) {
  if (process.env.NATURECO_NO_UPDATE_CHECK === '1') return;
  if (!process.stdout.isTTY) return;

  const cache = readCache();

  if (cache && cache.latest && compareVersions(cache.latest, currentVersion) > 0) {
    // chalk'a bağımlı olmadan soluk sarı bildirim
    const dim = '\x1b[2m', yellow = '\x1b[33m', cyan = '\x1b[36m', reset = '\x1b[0m';
    console.log(`${yellow}⬆ Yeni sürüm: v${currentVersion} → v${cache.latest}${reset} ${dim}—${reset} ${cyan}npm install -g natureco-cli${reset} ${dim}(yeni skill'ler ve araçlar içerir)${reset}`);
  }

  if (!cache || (Date.now() - (cache.lastCheck || 0)) > CHECK_INTERVAL_MS) {
    refreshInBackground();
  }
}

module.exports = { maybeNotify, compareVersions, _internal: { readCache, writeCache, refreshInBackground, CACHE_FILE } };
