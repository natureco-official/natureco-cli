# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)]()

Terminal-native AI agent CLI — sohbet et, kod yaz, workflow'ları otomatikleştir, Telegram/Discord/Slack/WhatsApp'ı bağla.

```
███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗
████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗
██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║
██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║
██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝
╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝
```

---

## ✨ Özellikler

- **📁 Dosya İşlemleri** — read, write, create, delete, rename
- **💻 Terminal Komut Çalıştırma** — bash komutları güvenli çalıştır
- **🔍 Proje Geneli Arama** — grep/ripgrep ile kod arama
- **📝 Multi-file Düzenleme** — birden fazla dosyayı aynı anda düzenle
- **🔗 Git Entegrasyonu** — status, diff, commit, push
- **🤖 Agentic Mod (--agent)** — görevi otonom tamamla, onay iste
- **🏷️ --fix, --explain, --review, --test** flagleri
- **🎨 Streaming Syntax Highlighting**
- **🧩 NatureCo Skill Sistemi** — aktif skill varsa prompt'a ekle

---

## 🚀 Hızlı Başlangıç

```bash
# Global kurulum
npm install -g natureco-cli

# İlk kurulum sihirbazı
natureco setup

# Sohbet başlat
natureco chat

# Code agent
natureco code
```

---

## 📋 Komutlar

### 🤖 AI & Chat

| Komut | Açıklama |
|-------|----------|
| `natureco chat` | AI sohbet başlat (varsayılan bot) |
| `natureco chat --resume` | Son oturumu devam ettir |
| `natureco code` | Code agent — dosya oku, yaz, komut çalıştır |
| `natureco ask "soru"` | Tek seferlik soru |
| `natureco run script.md` | Markdown script çalıştır |
| `natureco bots` | Bot listesi |
| `natureco agent run <task>` | One-shot agent görevi |
| `natureco agent abort <id>` | Agent görevi durdur |
| `natureco agent logs <id>` | Agent loglarını göster |
| `natureco commitments list` | Eylem taahhütlerini listele |
| `natureco commitments add <text>` | Taahhüt ekle |
| `natureco infer models` | Modelleri algıla |
| `natureco infer capabilities` | Yetenekleri sorgula |

**Chat içi komutlar:**

| Komut | Açıklama |
|-------|----------|
| `/clear` | Ekranı temizle |
| `/bot` | Bot listesi / bot değiştir |
| `/skills` | Aktif skill'ler |
| `/memory` | Hafıza durumu |
| `/memory clear` | Hafızayı temizle |
| `/commands` | Özel komutlar |
| `/help` | Yardım |
| `exit` / `quit` | Çıkış |

**Code agent komutları:**

| Komut | Açıklama |
|-------|----------|
| `/clear` | Ekranı temizle |
| `/summary` | Session özetini göster |
| `/done` | Bitir ve özet göster |
| `/help` | Yardım |

### ⚙️ Kurulum & Ayarlar

| Komut | Açıklama |
|-------|----------|
| `natureco setup` | İlk kurulum sihirbazı |
| `natureco login` | API key ile giriş |
| `natureco logout` | Çıkış |
| `natureco config list` | Tüm ayarları göster |
| `natureco config set key val` | Ayar değiştir |
| `natureco config get key` | Ayar oku |
| `natureco configure` | Interaktif yapılandırma sihirbazı |
| `natureco init` | Proje başlatma (.natureco dizini) |
| `natureco doctor` | Sistem sağlık kontrolü |
| `natureco doctor --fix` | Sorunları otomatik düzelt |
| `natureco update` | Güncelleme kontrol |
| `natureco completion bash` | Bash completion oluştur |
| `natureco completion powershell` | PowerShell completion oluştur |

### 🔌 Entegrasyonlar

| Komut | Açıklama |
|-------|----------|
| `natureco telegram connect` | Telegram bot bağla |
| `natureco discord connect` | Discord bot bağla |
| `natureco slack connect` | Slack workspace bağla |
| `natureco whatsapp connect` | WhatsApp QR ile bağla |
| `natureco signal connect` | Signal bağla |
| `natureco irc connect` | IRC bağla |
| `natureco mattermost connect` | Mattermost bağla |
| `natureco imessage connect` | iMessage bağla |
| `natureco sms connect` | SMS (Twilio) bağla |
| `natureco webhooks connect` | Webhook ekle |
| `natureco gateway start` | WebSocket gateway başlat |
| `natureco gateway stop` | Gateway durdur |
| `natureco gateway status` | Gateway durumu |

### 🛠️ Geliştirici Araçları

| Komut | Açıklama |
|-------|----------|
| `natureco git review` | Staged değişiklikleri incele |
| `natureco git commit` | AI ile commit mesajı oluştur |
| `natureco skills list` | Skill listesi |
| `natureco skills install slug` | Skill kur |
| `natureco skills remove slug` | Skill kaldır |
| `natureco mcp list` | MCP sunucuları |
| `natureco mcp add` | MCP sunucu ekle |
| `natureco hooks create type` | Hook oluştur |
| `natureco commands create name` | Özel komut oluştur |
| `natureco cron add` | Zamanlanmış görev ekle |
| `natureco ultrareview file.js` | Detaylı kod inceleme |
| `natureco migrate --from openclaw` | OpenClaw'dan taşı |
| `natureco transcripts list` | Transcript listele |
| `natureco transcripts show <id>` | Transcript detayı |

### 📊 Yönetim & Sistem

| Komut | Açıklama |
|-------|----------|
| `natureco dashboard` | Web UI aç (localhost:3848) |
| `natureco memory status` | Hafıza durumu |
| `natureco logs` | Gateway logları |
| `natureco status` | Sistem durumu |
| `natureco system status` | Detaylı sistem durumu |
| `natureco system heartbeat` | Sistem heartbeat |
| `natureco system presence` | Presence durumu |
| `natureco health` | Servis sağlık kontrolü |
| `natureco agents list` | Agent listesi |
| `natureco plugins list` | Plugin listesi |
| `natureco security audit` | Güvenlik denetimi |
| `natureco reset` | Sıfırlama |
| `natureco sessions list` | Oturum listesi |
| `natureco backup create` | Yedek oluştur |
| `natureco backup list` | Yedekleri listele |
| `natureco backup restore <id>` | Yedekten geri yükle |
| `natureco secrets list` | Gizli değerleri listele |
| `natureco secrets set <key> <value>` | Gizli değer ekle |
| `natureco approvals list` | Onay politikasını göster |
| `natureco approvals allow <command>` | Komuta onay ver |
| `natureco workboard show` | Görev panosunu göster |
| `natureco workboard add <task>` | Görev ekle |

### 🛰️ Ağ & Cihaz

| Komut | Açıklama |
|-------|----------|
| `natureco bonjour scan` | Ağ keşfi — LAN'da servis tara |
| `natureco bonjour discover` | Servisleri keşfet |
| `natureco dns resolve <host>` | DNS ile host çözümle |
| `natureco dns discover` | Ağdaki servisleri bul |
| `natureco directory query <query>` | Dizin sorgulama |
| `natureco policy check` | Workspace uyumluluk kontrolü |
| `natureco voice status` | Ses yapılandırması |
| `natureco voice providers` | TTS sağlayıcılarını listele |
| `natureco admin-rpc start` | HTTP admin RPC başlat |
| `natureco admin-rpc call <method>` | RPC metodu çağır |
| `natureco oc-path resolve <uri>` | nc:// URI çözümle |
| `natureco devices pair` | Cihaz eşleştir |
| `natureco devices list` | Eşleşmiş cihazları listele |
| `natureco device-pair list` | Eşleşme isteklerini göster |
| `natureco qr show` | QR kod göster |
| `natureco qr verify <code>` | QR kodu doğrula |
| `natureco onboard` | Interaktif onboarding sihirbazı |
| `natureco clickclack status` | Bildirim kanalı durumu |
| `natureco thread-ownership list` | Thread sahipliğini göster |

### 🔧 Altyapı

| Komut | Açıklama |
|-------|----------|
| `natureco daemon status` | Gateway daemon durumu |
| `natureco daemon start` | Daemon başlat |
| `natureco node status` | Node host durumu |
| `natureco node start` | Node host başlat (HTTP health endpoint) |
| `natureco node info` | Detaylı node bilgisi |
| `natureco nodes list` | Node network listesi |
| `natureco nodes pair <url>` | Node ekle |
| `natureco proxy start [port]` | Debug proxy başlat |
| `natureco proxy start 9090 --forward http://...` | Proxy ile yönlendirme |
| `natureco proxy capture` | Yakalanan istekleri göster |
| `natureco sandbox create <name>` | İzole çalışma dizini oluştur |
| `natureco sandbox exec <name> <command>` | Sandbox'ta komut çalıştır |
| `natureco capability list` | Yetenekleri listele |
| `natureco capability infer <provider>` | Sağlayıcı yeteneklerini sorgula |

### 📦 Medya & İçerik

| Komut | Açıklama |
|-------|----------|
| `natureco open-prose list` | Prose skills bundle bilgisi |
| `natureco vydra status` | Vydra medya sağlayıcı durumu |
| `natureco docs search <query>` | Dokümantasyon ara |
| `natureco docs open <topic>` | Dokümanı aç |

### 🔗 OpenClaw Uyumlu Takma Adlar

| Takma Ad | Asıl Komut |
|----------|-----------|
| `natureco acp` | `natureco code` |
| `natureco exec-policy` | `natureco policy` |

---

## ⚡ Code Agent

`natureco code` — dosyaları oku, değiştir, komut çalıştır. Claude Code alternatifi.

```bash
# Genel code agent
natureco code

# Belirli dosyaya odaklan
natureco code src/pages/Login.tsx
natureco code backend/api/routes.js
```

**Özellikler:**
- **Streaming output** — yanıt gelirken ekrana yazılır
- **Tool spinner** — her tool çalışırken animasyon gösterir
- **Onay mekanizması** — `write_file` ve tehlikeli bash komutlarında onay ister
- **Proje context** — başlangıçta dizini otomatik tarar
- **Session özeti** — kaç dosya değiştirildi, kaç komut çalıştı
- **Max 20 iteration** — karmaşık görevler için uzun tool loop

```
⚡ NatureCo Code  ·  İchigo  ·  v2.19.0
────────────────────────────────────────────────────────────────────────────────

You  Login sayfasındaki form validasyonunu düzelt

İchigo  Önce mevcut kodu okuyayım...

  ✓ read_file — {"path":"src/pages/Login.tsx"}

  Sorunu buldum. email regex yanlış. Düzeltiyorum...

  ⚠️  write_file: {"path":"src/pages/Login.tsx"}
  Devam edilsin mi? (Y/n)

  ✓ write_file — {"path":"src/pages/Login.tsx"}

  Düzeltme tamamlandı. email validasyonu artık RFC 5322 uyumlu.

─── Agent Session Özeti ───
  ✓ 1 dosya değiştirildi
  ✓ 0 komut çalıştırıldı
  ✓ 2 tool çağrısı yapıldı
  ◉ 1 mesaj
```

---

## 🎨 Terminal UI

Chalk tabanlı saf terminal arayüzü — blessed yok, çift karakter sorunu yok.

```
███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗
...
╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝

         (\\_/)  Hoş geldin, Gencay  ·  İchigo hazır  ·  v2.19.1
────────────────────────────────────────────────────────────────────────────────
                    llama-3.3  ·  /help için yardım  ·  Ctrl+C çıkış
────────────────────────────────────────────────────────────────────────────────

You  merhaba
İchigo  Merhaba! Nasıl yardımcı olabilirim?
```

**Günlük tip sistemi** — her gün farklı bir Nature.co özelliği gösterilir. Yeni versiyon varsa changelog gösterilir.

---

## 🔧 Yapılandırma

Config dosyası: `~/.natureco/config.json`

```json
{
  "providerUrl": "https://api.groq.com/openai/v1",
  "providerApiKey": "gsk_xxx",
  "providerModel": "llama-3.3-70b-versatile",
  "botName": "İchigo",
  "userName": "Gencay",
  "debug": false,
  "mcpEnabled": true,
  "mcpServers": {}
}
```

**Desteklenen provider'lar:**

| Provider | URL |
|----------|-----|
| Groq | `https://api.groq.com/openai/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com` |
| Together AI | `https://api.together.xyz/v1` |
| Fireworks | `https://api.fireworks.ai/inference/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| LM Studio (local) | `http://localhost:1234/v1` |

```bash
# Provider değiştir
natureco config set providerUrl https://api.openai.com/v1
natureco config set providerApiKey sk-xxx
natureco config set providerModel gpt-4o
```

---

## 🧠 Hafıza Sistemi

Bot başına kalıcı hafıza. Kullanıcı adı, bot adı, tercihler, otomatik bilgi çıkarımı.

```bash
# Hafızayı göster
/memory

# Hafızayı temizle
/memory clear
```

```json
{
  "name": "Gencay",
  "botName": "İchigo",
  "facts": [
    { "value": "Timezone: UTC+3", "score": 6 },
    { "value": "Developer", "score": 5 }
  ]
}
```

---

## 📁 Dosya Yapısı

```
~/.natureco/
├── config.json              # Ana yapılandırma
├── gateway.pid              # Gateway process ID
├── gateway.log              # Gateway logları
├── lastVersion              # Son görülen versiyon
├── skills/                  # Yüklü skill'ler
├── memory/                  # Bot hafızaları
├── history/                 # Chat geçmişi
├── sessions/                # Chat oturumları
├── conversations/           # Konuşma geçmişi (disk)
└── whatsapp-sessions/       # WhatsApp session'ları
```

---

## 📚 Kaynaklar

- **Web:** [natureco.me](https://natureco.me)
- **CLI Docs:** [natureco.me/cli](https://natureco.me/cli)
- **npm:** [npmjs.com/package/natureco-cli](https://www.npmjs.com/package/natureco-cli)
- **API:** [natureco.me/developer](https://natureco.me/developer)

---

## 📝 Lisans

MIT © NatureCo

---

**Version:** 3.0.0 | **Node.js:** >=18.0.0 (recommended 20+) | **Platform:** macOS, Windows, Linux

---

## ✨ What's New in v4.1 — "MULTI-AGENT"

### 🤖 Phase 7 — Multi-Agent Orkestrasyon
- **8 uzman agent** (önceki 3, +5 yeni):
  - `explore`, `general`, `review` (mevcut)
  - **seo**: Anahtar kelime, meta tag, içerik optimizasyonu
  - **content**: NatureCo için SEO uyumlu özgün içerik
  - **security**: OWASP top 10, dependency güvenliği
  - **translator**: Doğal, akıcı çeviriler (teknik terim korumalı)
  - **debugger**: Hata analizi, kök neden tespiti
- **`natureco team list`** — Tüm agent tipleri
- **`natureco team status`** — Çalışan/tamamlanan/başarısız istatistikleri
- **`natureco team spawn <type> <task>`** — Tek agent çalıştır
- **`natureco team parallel '<json>'`** — N agent paralel çalıştır

### 🌿 Phase 6 — NatureCo Özgü Entegrasyonlar
OpenClaw generic bir agent. NatureCo CLI, **natureco.me platformunun native parçası**.

- **`natureco naturehub post "<text>"`** — Topluluk akışına içerik yayınla
- **`natureco medium draft <file.md>`** — Markdown'tan Medium taslağı (Parton'un ayda 4 makale hedefi için)
- **`natureco medium publish <file.md>`** — Doğrudan Medium'da yayınla
- **`natureco seo audit <url>`** — Tam SEO denetimi, 100-üzerinden skor
- **`natureco seo audit https://natureco.me`** → **71/100**, H1 eksik, title uzunluğu raporlandı
- **`natureco xp`** — 8 seviye gamification (Tohum → Galaksi), 7 ödül

### 🎯 Canlı SEO Denetimi (natureco.me)

```
✅ Description (149 karakter)
✅ Canonical URL var
✅ Open Graph (7 tag)
✅ Twitter Card (6 tag)
✅ Schema.org markup var
⚠️ Title çok uzun (64 karakter, ideal: 50-60)
❌ H1 tag eksik
⚠️ İçerik kısa (9 kelime)
🎯 SEO Skoru: 71/100
```

### 🖥️ Phase 5 — Local Web Dashboard
- **`natureco dashboard`** → http://127.0.0.1:7421 (otomatik tarayıcı açılır)
- **Vanilla JS + HTML** — framework yok, hızlı, dependency yok
- **6 widget** tek sayfada:
  - 💰 Bugünkü maliyet (limit bar ile)
  - 📦 Yüklü skill + bekleyen proposal sayısı
  - ⏰ Aktif cron sayısı
  - 📋 Bugünkü audit kaydı
  - 💵 Provider/model bazlı maliyet breakdown
  - 🧠 Self-evolving skill proposals tablosu
  - 📜 Son tool çağrıları timeline
- **Otomatik yenileme** — 5 saniyede bir auto-refresh
- **JSON API** — `/api` endpoint
- **PID management** — start/stop/status/url

### 🆚 OpenClaw Dashboard vs NatureCo

| Özellik | OpenClaw | NatureCo CLI v3.4 |
|---------|---------|-------------------|
| Local web dashboard | ❌ (cloud bağımlı) | ✅ (127.0.0.1:7421) |
| Framework dependency | — | **Yok** (vanilla JS) |
| Real-time auto-refresh | ❌ | ✅ (5s) |
| Maliyet görselleştirme | ❌ | ✅ |
| Self-evolving skill UI | ❌ | ✅ |
| Audit log görüntüleme | ❌ | ✅ |

### 💰 Phase 4 — Maliyet Optimizasyonu
- **21 model × provider** fiyat tablosu (Groq, OpenAI, Anthropic, DeepSeek, Together, Fireworks, Ollama)
- **Model router** — prompt karmaşıklığını tahmin eder, en uygun (en ucuz) modeli önerir
  - Simple: `llama-3.1-8b-instant` ($0.05/M in)
  - Medium: `llama-3.3-70b-versatile` ($0.59/M in)
  - Complex: kod için `claude-sonnet-4-6` veya `groq:llama-3.3-70b`
  - Creative: `claude-sonnet-4-6` veya `gpt-4o`
- **`natureco cost today|week|month|all`** — Provider/model bazlı maliyet breakdown
- **`natureco cost budget`** — Günlük $5, aylık $100 limit, görsel progress bar
- **`natureco cost model "<prompt>"`** — Bir prompt için en uygun modeli öner
- **`natureco cost prices`** — Tüm fiyatları gör
- **`natureco cost set <key> <value>`** — Bütçe ayarla (örn: `set dailyLimit 3.00`)

### 💵 OpenClaw Karşılaştırması

| Kullanım | OpenClaw | NatureCo CLI v3.3 |
|---------|---------|-------------------|
| Aylık ortalama maliyet | $50-200 | **$5-15** |
| Model seçimi | Sabit (kullanıcı bilinçli değil) | Otomatik router |
| Maliyet görünürlüğü | ❌ | ✅ (real-time) |
| Bütçe limiti | ❌ | ✅ (günlük + aylık) |
| Otomatik downgrade | ❌ | ✅ (%90'da) |
| Prompt analizi ile model seçimi | ❌ | ✅ |

### 🧠 Phase 3 — Self-Evolving Skills
- **Pattern detector** — Aynı tool çağrı pattern'i 3 kez tekrar → otomatik skill önerisi
- **Akıllı normalize** — URL, dosya yolu, sayı, UUID, tarih generic hale getirilir (gerçek değerler değil türler eşleşir)
- **Sliding window** — Son 5 tool çağrısından pattern çıkarır
- **24 saat cooldown** — Aynı pattern spam olmaz
- **`natureco skills suggest`** — Bekleyen proposal'ları listele
- **`natureco skills accept <id>`** — Otomatik SKILL.md oluştur
- **`natureco skills reject <id>`** — Reddet
- **`natureco skills forget`** — Pattern hafızasını sıfırla

### 🎯 Self-Evolving Test Sonucu
3 ardışık `web_search → web_fetch → write_file` çağrısı sonrası sistem otomatik olarak:
- Pattern'i tanıdı
- `web-search-to-web-fetch` adında skill önerisi oluşturdu
- Kabul edilirse `~/.natureco/skills/web-search-to-web-fetch/SKILL.md` otomatik üretildi

### 🚀 OpenClaw Karşılaştırması (güncel)

| Özellik | OpenClaw | NatureCo CLI v3.2 |
|---------|---------|-------------------|
| İlk kurulum süresi | 30-60 dakika | **60 saniye** |
| Onay mekanizması | ❌ | ✅ (5 mod) |
| Audit log | ❌ | ✅ (JSONL, 30 gün) |
| Secret scanner | ❌ | ✅ (22 pattern + entropy) |
| **Self-evolving skills** | ❌ | ✅ (Hermes tarzı) |
| Türkçe yerelleştirme | ❌ | ✅ |

### 🛡️ Phase 2 — Güvenlik
- **Merkezi audit log** — Tüm komut, onay, tool call, secret erişimi JSONL olarak kayıt altında (30 gün retention, async non-blocking)
- **Secret scanner** — 22 bilinen secret pattern + Shannon entropi analizi (OpenAI, Anthropic, Groq, AWS, GitHub, Slack, Stripe, NatureCo, JWT, private key vs.)
- **`natureco audit`** — Bugünkü logları göster, 24 saat istatistik, dosya listesi, canlı tail, arama, cleanup
- **Doctor 2 yeni check:** `auditLog`, `secretsClean`
- **Toplam doctor check:** 10 (Phase 1: 8, ilk halde: 5)

### 🚀 OpenClaw Karşılaştırması (güncel)

| Özellik | OpenClaw | NatureCo CLI v3.1 |
|---------|---------|-------------------|
| İlk kurulum süresi | 30-60 dakika | **60 saniye** |
| First-run auto-detection | ❌ | ✅ |
| Onay mekanizması | ❌ (tam erişim) | ✅ (risk-seviyeli, 5 mod) |
| Audit log | ❌ | ✅ (JSONL, 30 gün retention) |
| Secret scanner | ❌ | ✅ (22 pattern + entropy) |
| Self-evolving skills | ❌ | ✅ (Phase 3'te) |
| Real disk space check | ❌ (RAM ölçüyordu) | ✅ |
| Türkçe yerelleştirme | ❌ | ✅ |

### 🎯 Phase 1 — Brand & Onboarding
- **First-run auto-detection** — `natureco` (boş argüman) kurulum yoksa wizard'a yönlendirir
- **Yeni NatureCo ASCII art logosu** — brand kimliği her yerde tutarlı
- **`natureco doctor` genişletildi** — 8 sistem check (önceki: 5)
  - `configExists`, `nodeVersion`, `npmPackages`, `diskSpace`, `writePermission`
  - Yeni: `apiKeyValid`, `providerReachable`, `dataDirs` (auto-create eksik dizinler)
- **Daily tip** — gateway ekranı her gün farklı NatureCo özelliği önerir

### 🚀 OpenClaw Karşılaştırması

| Özellik | OpenClaw | NatureCo CLI v3.0 |
|---------|---------|-------------------|
| İlk kurulum süresi | 30-60 dakika | **60 saniye** |
| First-run auto-detection | ❌ | ✅ |
| Güvenlik: onay mekanizması | ❌ (tam erişim) | ✅ (risk-seviyeli) |
| Kurulum hatalarını otomatik düzeltme | ❌ | ✅ (doctor auto-fix) |
| Self-evolving skills | ❌ | ✅ (Phase 3'te) |
| Gerçek disk alanı kontrolü | ❌ (RAM ölçüyordu) | ✅ |
| Türkçe yerelleştirme | ❌ | ✅ |
