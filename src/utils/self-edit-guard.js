/**
 * self-edit-guard — paketin KENDİ kaynak koduna yazmayı varsayılan olarak kapatır.
 *
 * GÜVENLİK (v5.51.1): SELF.md "kendini onar" protokolü ajana kendi kaynağını
 * düzenlemeyi öğretir; Tek Beyin ise güvenilir mesajlaşma kanallarına terminal
 * eşdeğeri araç erişimi verir. İkisi birleşince, allow-list'teki bir hesaptan
 * (ya da ajanın okuduğu içeriğe gizlenmiş prompt injection'dan) gelen bir mesaj,
 * kurulu paketin kodunu gözetimsiz değiştirebilirdi. Kural:
 *
 *   - Hedef paket kurulum kökü altındaysa (veya herhangi bir node_modules/
 *     natureco-cli altındaysa) yazma VARSAYILAN OLARAK REDDEDİLİR.
 *   - Bilinçli açma: NATURECO_ALLOW_SELF_EDIT=1 env ya da config allowSelfEdit:true.
 *   - KANAL KAYNAKLI çağrılarda (NATURECO_CHANNEL_ORIGIN=1; channel-brain koyar)
 *     bayrak AÇIK OLSA BİLE koşulsuz red — kanalda interaktif onay gösterilemez.
 *
 * Symlink/junction hilesi kapalıdır: hedef, var olan en derin atası üzerinden
 * realpath'e çözülür (~/.natureco/tools bağlantısı paketin içine açılır!).
 */

const fs = require('fs');
const path = require('path');

function packageRoot() {
  try { return fs.realpathSync(path.join(__dirname, '..', '..')); }
  catch { return path.resolve(__dirname, '..', '..'); }
}

// Windows'ta yol karşılaştırması harf-duyarsız olmalı
function _norm(p) {
  return process.platform === 'win32' ? String(p).toLowerCase() : String(p);
}

// Hedef henüz yoksa bile symlink çözümü yapabilmek için var olan en derin
// atayı realpath'le, kalan kuyruğu üstüne ekle.
function realTarget(p) {
  let cur = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  try { cur = fs.realpathSync(cur); } catch { /* erişilemedi — çözümsüz devam */ }
  return tail.length ? path.join(cur, ...tail) : cur;
}

function isSelfPath(targetPath) {
  if (!targetPath) return false;
  const real = _norm(realTarget(targetPath));
  const root = _norm(packageRoot());
  if (real === root || real.startsWith(root + path.sep)) return true;
  // Başka bir konumdaki natureco-cli kurulumu da "kendi kaynağı" sayılır
  return /[\\/]node_modules[\\/]natureco-cli([\\/]|$)/i.test(real);
}

/**
 * @returns {{allowed: boolean, error?: string, reason?: string}}
 */
function checkSelfEdit(targetPath) {
  if (!isSelfPath(targetPath)) return { allowed: true };

  if (process.env.NATURECO_CHANNEL_ORIGIN === '1') {
    return {
      allowed: false,
      reason: 'self-edit-channel',
      error: 'Güvenlik: natureco-cli kaynak kodu mesajlaşma kanalı üzerinden HİÇBİR KOŞULDA düzenlenemez (interaktif onay gösterilemiyor). Bu işlem yalnızca terminalden, NATURECO_ALLOW_SELF_EDIT=1 ile yapılabilir.',
    };
  }

  if (process.env.NATURECO_ALLOW_SELF_EDIT === '1') return { allowed: true };
  try {
    const { getConfig } = require('./config');
    if (getConfig().allowSelfEdit === true) return { allowed: true };
  } catch { /* config okunamadı — güvenli tarafta kal (red) */ }

  return {
    allowed: false,
    reason: 'self-edit-disabled',
    error: 'Güvenlik: hedef, natureco-cli kurulumunun kendi kaynak kodu altında. Kendini-onarma varsayılan olarak kapalıdır; kullanıcı bilinçli olarak açmalı: NATURECO_ALLOW_SELF_EDIT=1 (veya config allowSelfEdit:true). Ayrıntı: paket kökündeki SELF.md.',
  };
}

module.exports = { checkSelfEdit, isSelfPath, _internal: { packageRoot, realTarget } };
