# Security Audit Summary — natureco-cli

**Denetim:** 3 turluk güvenlik incelemesi
**Bulgular:** 9 gerçek, kanıtlanmış açık
**Düzeltme tarihi:** 2026-07-08 (sürüm 5.43.0)
**Doğrulama:** 567 test yeşil (+29 güvenlik regresyonu), ESLint temiz, `npm run smoke` geçti

Her bulgu için kırmızı→yeşil regresyon testi eklendi. Aşağıda önem sırasına göre listelenmiştir.

| # | Önem | Bulgu | Dosya(lar) | Durum | Test |
|---|------|-------|-----------|-------|------|
| 1 | Kritik/RCE | shell_command onay/güvenlik akışını atlıyordu | `src/tools/shell_command.js`, `src/utils/tool-runner.js` | ✅ Düzeltildi | `security-hardening.test.js` |
| 2 | Yüksek | isSafeCommand prefix bypass (`echo hi; rm -rf ~`) | `src/utils/approvals.js` | ✅ Düzeltildi | `security-hardening.test.js` |
| 3 | Orta | config.json 0644 (dünya-okunabilir API key) | `src/utils/config.js` | ✅ Düzeltildi | `security-permissions.test.js` |
| 4 | Orta | WhatsApp session dizini zayıf izinler | `src/commands/gateway-server.js` | ✅ Düzeltildi | (izin kontrolü, POSIX) |
| 5 | Düşük | document_extract + pgrep/adb shell injection | `document_extract.js`, `social_open.js`, `youtube_ac.js`, `phone_control_enhanced.js` | ✅ Düzeltildi | `security-permissions.test.js` |
| 6 | Kritik/RCE | Skill indirme (keyfi repo) → prompt injection zinciri | `src/tools/skills_download.js`, `src/tools/skills_autoload.js` | ✅ Düzeltildi | `skills-download-security.test.js` |
| 7 | Yüksek | Kanal gönderen doğrulaması yok + hafıza sızıntısı | `src/commands/gateway-server.js` | ✅ Düzeltildi | `channel-gate-security.test.js` |
| 8 | Kritik | admin-rpc auth'suz + 0.0.0.0 dinliyor | `src/commands/admin-rpc.js` | ✅ Düzeltildi | `admin-rpc-security.test.js` |
| 9 | Kritik/persistence | cron_create sistem crontab'ına kontrolsüz yazıyor | `src/tools/cron_create.js` | ✅ Düzeltildi | `cron-security.test.js` |

## Düzeltme özetleri

**1 + 6 (RCE zinciri):** Madde 6 (keyfi skill indirme → system-prompt enjeksiyonu) ile madde 1 (`shell_command` bypass) birlikte tam bir uzaktan kod çalıştırma zinciri oluşturuyordu. İkisi de kapatıldı: skill indirme yalnızca `KNOWN_REPOS` + kullanıcı onaylı allowlist ile; `shell_command` artık `bash.js` ile aynı `checkCommand`/`isDangerousCommand`/onay akışından geçiyor.

**2:** `isSafeCommand` artık shell metakarakteri (`; && | \` $() > …`) içeren hiçbir komutu "safe" saymıyor; prefix eşleşmesi kelime sınırında; `node -e` (inline eval) güvenli listeden çıkarıldı.

**3 + 4:** Hassas dosya/dizinler (config.json + API key yedekleri, WhatsApp oturum dosyaları) artık `0600`/`0700` ile, eski kurulumlar için `chmod` fallback ile korunuyor.

**5:** Kullanıcı/model girdisi içeren tüm `execSync(\`...${...}\`)` desenleri `execFileSync` (shell yok) veya tırnak-farkındalıklı tokenizer'a çevrildi.

**7:** Ortak `channelGate` helper'ı — allow-list kuruluysa yetkisiz göndereni engeller; kurulu değilse yanıt verir ama kişisel hafızayı system prompt'a **enjekte etmez** (anonim kanaldan hafıza sızıntısını önler).

**8:** admin-rpc artık `127.0.0.1`'e bind (opsiyonel `--expose` ile 0.0.0.0, token yine zorunlu) + her istekte `Authorization: Bearer <token>` (`~/.natureco/admin-token`, 0600) + `config.get` yanıtında secret maskeleme (`reveal:true` ile açılır).

**9:** cron_create tehlikeli komutu reddeder; sistem crontab'ına yazma varsayılan olarak kapalı (schema'da parametre yok → ajan tetikleyemez), yalnızca uygulama-içi `crons.json`'a yazar (natureco daemon kontrollü çalıştırır).

## Kalan not (defense-in-depth)
- Madde 6'da ana vektör (keyfi repo indirme) kapatıldı. Elle `~/.natureco/skills/` altına konan skill'ler için per-skill ilk-kullanım onayı gelecek bir iyileştirme olarak değerlendirilebilir; şimdilik autoload ham içerik enjeksiyonu kaldırıldı.
- `--expose` ile admin-rpc'yi dışa açmak yalnızca güvenilir ağda ve token ile önerilir.
