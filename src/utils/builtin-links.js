/**
 * builtin-links — yerleşik skill ve araçları ~/.natureco altında GÖRÜNÜR yapar.
 *
 * Saha raporu (v5.48 sonrası): "~/.natureco içinde skill/araç yok". Yerleşikler
 * npm paketinin içinde yaşar (node_modules/natureco-cli/...) ve işlevsel olarak
 * çalışırlar; ama kullanıcı "sistem dosyalarında" göremiyor. Kopyalamak yerine
 * dizin bağlantısı kurulur (Windows: junction — yönetici GEREKTİRMEZ; unix: symlink):
 *
 *   ~/.natureco/skills-builtin  →  <paket>/skills      (yerleşik skill'ler)
 *   ~/.natureco/tools           →  <paket>/src/tools   (araç kaynakları)
 *
 * Kazanımlar: gezinilebilir + paket güncellenince otomatik güncel + sıfır kopya.
 * Skill keşfi bu bağlantıları TARAMAZ (çift sayım olmaz) — bu salt görünürlük.
 * Kullanıcının kendi skill'leri ~/.natureco/skills'te yaşamaya devam eder.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const LINKS = [
  { name: 'skills-builtin', target: path.join(__dirname, '..', '..', 'skills') },
  { name: 'tools', target: path.join(__dirname, '..', 'tools') },
];

/**
 * Bağlantıları kurar/onarır. Hızlıdır (birkaç lstat) — her CLI açılışında çağrılır.
 * @param {string} [baseDir] test için ~/.natureco yerine kullanılacak dizin
 */
function ensureBuiltinLinks(baseDir) {
  const base = baseDir || path.join(os.homedir(), '.natureco');
  for (const { name, target } of LINKS) {
    try {
      if (!fs.existsSync(target)) continue; // paket bozuksa sessiz geç
      const linkPath = path.join(base, name);

      let st = null;
      try { st = fs.lstatSync(linkPath); } catch { /* yok — kurulacak */ }

      if (st) {
        if (st.isSymbolicLink()) {
          // Mevcut bağlantı doğru hedefe mi işaret ediyor? (npm prefix değişmiş olabilir)
          let ok = false;
          try { ok = fs.realpathSync(linkPath) === fs.realpathSync(target); } catch { /* kırık link */ }
          if (ok) continue;
          fs.unlinkSync(linkPath); // yanlış/kırık — yeniden kur
        } else {
          // Gerçek dosya/klasör (bağlantı değil): kullanıcı verisi olabilir — DOKUNMA
          continue;
        }
      }

      fs.mkdirSync(base, { recursive: true });
      fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch { /* bağlantı kurulamazsa komutu bozma — görünürlük kritik işlev değil */ }
  }
}

module.exports = { ensureBuiltinLinks, _internal: { LINKS } };
