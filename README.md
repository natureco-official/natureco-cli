# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)]()
[![Downloads](https://img.shields.io/npm/dm/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![Stars](https://img.shields.io/github/stars/natureco-official/natureco-cli)](https://github.com/natureco-official/natureco-cli)

> **Yapay Zekânın Gücü artık parmaklarının ucunda.**
> *Terminalin hızını NatureCo ile keşfet.*

Terminal-native AI agent CLI — sohbet et, kod yaz, workflow'ları otomatikleştir, **Telegram / Discord / Slack / WhatsApp / iMessage** bağla.

**Claude Code alternatifi** · Multi-agent orkestrasyon · Slash-prefix sistemi · Dangerous Command Approval · 12 provider, 200+ model · 57 tool · 10 mesajlaşma kanalı · 3-dosya kişilik sistemi

```
███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗
████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗
██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║
██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║
██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝
╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝
```

---

## 🚀 Hızlı Başlangıç

```bash
# 1. Kur
npm install -g natureco-cli

# 2. İlk kurulum sihirbazı (provider, model, bot adı)
natureco setup

# 3. Sohbet başlat
natureco chat

# 4. Veya kod ajanı
natureco code
```

**30 saniyede hazır.** İlk açılışta sihirbaz seni karşılar: provider seç → API key gir → model seç → bot adı belirle. Hepsi bu.

---

## 🆕 v5.6.x Yenilikler

### Slash-Prefix Komut Sistemi

**İMessage ve WhatsApp'ta** artık `/` ile başlayan mesajlar komut olarak işlenir:

```
You  > /selam nasılsın
AI   Selam selam! 🙌 Nasıl gidiyor?

You  > /bana bir fıkra anlat
AI   Tabii! Bilgisayar fıkrası...
```

Normal mesajlar **skip edilir** (döngü önleme). Bu sayede:
- ✅ Bot kendi mesajına cevap vermez
- ✅ Echo loop oluşmaz
- ✅ Sadece `/` ile başlayanlar AI'a gider

### Dangerous Command Approval

Akıllı onay sistemi. **Sadece riskli işlemlerde** onay ister:

```bash
# Otomatik onay (güvenli)
natureco memory write "favori renk kırmızı"
✓ Memory eklendi

# Onay gerekli (riskli)
natureco rm -rf node_modules
🔴 YÜKSEK RISK: Dosya silme komutu
Devam edilsin mi? (Y/n)
```

**Risk tespiti:**
- `rm -rf`, `sudo`, `dd if=` → 🔴 YÜKSEK
- `chmod 777`, `mv` → 🟡 ORTA
- `mv .env` → 🔴 (hassas dosya)

### v5.6.0 — v5.6.43 Diğer

| Versiyon | Yenilik |
|----------|---------|
| **v5.6.0** | Postinstall + API key validation + reset komutu |
| **v5.6.1** | Groq tool filter (9 temel tool) |
| **v5.6.3** | Provider tier wizard |
| **v5.6.4** | Tam model kataloğu (12 provider, 200+ model) |
| **v5.6.5** | Token limit fix + SOUL injection optimizasyonu |
| **v5.6.6** | Inline tool filter (BLOCKED_TOOL_NAMES) |
| **v5.6.7** | Memory auto-create in setup |
| **v5.6.8** | Hard-coded prefix dinamik (botName) |
| **v5.6.21** | Akıllı onay sistemi + tool result yol gizleme |
| **v5.6.22** | 8 bug fix (read_file priority, ~expansion, memory search, grep fix, git auto-find, vb.) |
| **v5.6.27** | imsg send `--to` flag fix |
| **v5.6.31** | `imsg watch --json` streaming |
| **v5.6.39** | iMessage is_from_me filtresi |
| **v5.6.40** | Echo loop prevention (30sn) |
| **v5.6.41-42** | Slash-prefix sistemi (iMessage/WhatsApp) |
| **v5.6.43** | WhatsApp slash + cron endpoint fix |

---

## ✨ Özellikler

### 🤖 AI & Sohbet
- **57 Tool** — file ops, web search, image generation, code execution, memory
- **İnteraktif REPL** — read_file, edit_file, bash, multi-turn
- **Slash Komutlar** — `/memory`, `/help`, `/skills`, `/clear`
- **Agentic Mod** (`--agent`) — autonomous task completion
- **Persistent Memory** — fact-based, cross-session

### 💻 Kod Ajanı (Claude Code Alternatifi)
- **Read/Write/Edit** multi-file operations
- **Bash execution** — sandboxed shell
- **Streaming syntax highlighting** — gerçek zamanlı
- **Slash komutlar** — `/summary`, `/done`
- **Approval prompt** — yazma/silme onayı

### 📡 10 Mesajlaşma Kanalı

| Platform | Bağlantı | Test |
|----------|----------|------|
| **Telegram** | `natureco telegram connect` | ✅ |
| **WhatsApp** | `natureco whatsapp connect` | ✅ (Baileys) |
| **iMessage** | `natureco imessage connect` | ✅ (imsg CLI) |
| **Discord** | `natureco discord connect` | Token |
| **Slack** | `natureco slack connect` | Token |
| **Mattermost** | `natureco mattermost connect` | URL |
| **IRC** | `natureco irc connect` | Server |
| **Signal** | `natureco signal connect` | signal-cli |
| **SMS** | `natureco sms connect` | Twilio |
| **Webhooks** | `natureco webhooks list` | ✅ |

**Gateway:** `natureco gateway start` — tüm kanalları tek process'te yönet.

### 🌿 NatureCo Native
- **NatureHub** paylaşımı (sosyal akış)
- **Medium** makale taslağı/yayını
- **SEO** analizi (skor 0-100)
- **XP & Seviye** sistemi (gamification)

### 🛡️ Güvenlik & Gözlem
- **Dangerous Command Approval** — risk tespiti
- **Audit logs** — tüm işlemler kayıt
- **Cost tracking** — AI maliyet takibi (today/week/month/budget)
- **Security audit** — hassas dosya taraması
- **Path anonymization** — tool output'ta `~/` ile gizleme

### ⚙️ Otomasyon & Zamanlama
- **Cron jobs** — `natureco cron add`
- **Hooks** — event-driven automation
- **Webhooks** — HTTP callback
- **Tasks (Kanban)** — `natureco tasks`

---

## 📋 Komutlar (A'dan Z'ye, 120+ Komut)

### 🤖 AI & Sohbet

| Komut | Açıklama |
|-------|----------|
| `natureco chat` | İnteraktif REPL sohbet (57 tool aktif) |
| `natureco chat --resume` | Önceki oturumu devam ettir |
| `natureco code` | Kod ajanı (uygulama/script yazma) |
| `natureco code <file>` | Belirli dosyada kod ajanı |
| `natureco run <script>` | Markdown script çalıştır |
| `natureco ask "<soru>"` | Tek soru AI'a sor |
| `natureco bots` | Mevcut botları listele |
| `natureco models` | Provider modellerini yönet |
| `natureco ultrareview <file>` | Derin kod incelemesi |

**REPL içi slash komutları:**
```
/clear      Ekranı temizle
/bot        Bot değiştir
/skills     Aktif skill'leri göster
/memory     Memory durumu
/memory clear  Memory temizle
/commands   Tüm komutlar
/help       Yardım
exit / quit Çıkış
```

### ⚙️ Setup & Konfig

```bash
natureco setup         # İlk kurulum sihirbazı
natureco login         # API key girişi
natureco logout        # Çıkış
natureco init          # Proje başlat (SOUL.md oluştur)
natureco doctor        # Sistem sağlık kontrolü
natureco doctor --fix  # Otomatik düzeltme
natureco config list   # Konfigürasyonu göster
natureco config set <key> <value>
natureco configure     # İnteraktif konfig
natureco update        # CLI güncelle
natureco completion bash|powershell
```

### 📡 Kanallar (10 Mesajlaşma Platformu)

```bash
# Tüm kanallar
natureco channels              # Bağlı kanallar listele
natureco channels add <type>   # Yeni kanal
natureco channels remove <type>

# Telegram
natureco telegram connect     # Token kaydet
natureco telegram chatid       # Chat ID otomatik bul
natureco telegram allow <id>   # Chat'e izin ver
natureco telegram status

# WhatsApp (Baileys)
natureco whatsapp connect
natureco whatsapp status

# iMessage (imsg CLI)
natureco imessage connect
natureco imessage status
natureco imessage allow <numara>
natureco imessage send <numara> <mesaj>

# Discord, Slack, Mattermost, IRC, Signal, SMS, Webhooks
natureco discord connect
natureco slack connect
natureco mattermost connect
natureco irc connect
natureco signal connect
natureco sms connect
natureco webhooks list

# Gateway — tüm kanalları başlat
natureco gateway start
natureco gateway stop
natureco gateway status
```

### 🧠 Memory & Sessions

```bash
natureco memory write "favori renk kırmızı"
natureco memory write "user_name=patron"
natureco memory search "renk"
natureco memory status
natureco memory list
natureco memory clear
natureco memory export
natureco memory import <dosya>

natureco sessions list        # Tüm oturumlar
natureco sessions show <id>   # Oturum detayı
```

### 🔌 Skill, MCP, Plugin

```bash
natureco skills list         # Aktif skill'ler
natureco skills install <name>
natureco skills remove <name>

natureco mcp list             # MCP server'ları
natureco mcp add <name> <url>

natureco plugins list
natureco plugins install <name>
```

### ⏰ Otomasyon

```bash
natureco cron add            # Zamanlı görev
natureco cron list
natureco cron remove <id>

natureco hooks list          # Event hook'ları
natureco hooks create

natureco tasks list          # Kanban (Todo)
natureco tasks add
natureco tasks done <id>

natureco webhooks list        # Webhook URL'leri
natureco webhooks add <url>

natureco dashboard            # Web dashboard (port 7421)
```

### 🔍 Geliştirici Araçları

```bash
natureco git status          # Git durumu
natureco git diff            # Diff
natureco git log             # Commit log
natureco git branches        # Branch listesi

natureco audit today         # Bugünkü işlemler
natureco audit stats         # İstatistikler
natureco audit files         # Dosya değişiklikleri

natureco cost today          # Bugünkü AI maliyeti
natureco cost week
natureco cost month
natureco cost budget 50      # $50 limit

natureco security audit      # Hassas dosya taraması

natureco logs                # Log dosyaları
```

### 🌿 NatureCo Native

```bash
natureco naturehub post <text>      # NatureHub paylaşımı
natureco naturehub feed             # Akışı gör

natureco seo audit natureco.me     # SEO analizi (skor)

natureco medium draft              # Medium makale taslağı
natureco medium publish <file>     # Yayınla

natureco xp rewards                # XP & seviye
natureco xp leaderboard
```

### 🛡️ Yönetim

```bash
natureco reset --scope config      # Sıfırla
natureco reset --scope memory
natureco reset --scope sessions
natureco reset --scope all --yes

natureco uninstall

natureco approvals                 # Onay yönetimi
natureco approvals allow <cmd>
```

---

## 🌐 Provider Desteği (12 Provider, 200+ Model)

| Provider | Modeller | API Key |
|----------|----------|---------|
| **OpenAI** | GPT-5, GPT-4.1, o3, GPT-4o | OpenAI |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku | Anthropic |
| **Gemini** | 2.5 Pro, 2.0 Flash, Gemma | Google |
| **Groq** | Llama 3.3, Mixtral | Groq |
| **DeepSeek** | R1, Chat V3 | DeepSeek |
| **Ollama** | Llama, Qwen (local) | - |
| **MiniMax** | M2.5, M2 | MiniMax |
| **OpenRouter** | 15+ model (multi-provider) | OpenRouter |
| **Mistral** | Large, Small, Codestral | Mistral |
| **Cohere** | Command R+, Embed | Cohere |
| **xAI** | Grok 2, Grok Beta | xAI |
| **Together** | Llama, Mixtral, Qwen | Together |

```bash
# Provider seçimi sihirbazda
natureco setup
# Sihirbaz: Provider → API Key → Model → Bot adı

# Model listesi
natureco models list --provider openai
natureco models list --provider anthropic
```

---

## 🔄 vs Diğer CLI'lar

| Özellik | NatureCo | Claude Code | Hermes | OpenClaw |
|---------|----------|-------------|--------|----------|
| Multi-provider | ✅ 12 | ❌ Anthropic | ✅ 8 | ❌ |
| 200+ model | ✅ | ❌ | ✅ | ❌ |
| Slash-prefix | ✅ v5.6 | ❌ | ❌ | ❌ |
| Dangerous Command Approval | ✅ v5.6 | ❌ | ✅ | ❌ |
| Multi-channel (10 platform) | ✅ | ❌ | ✅ (Python) | ❌ |
| Persistent memory | ✅ | ✅ | ✅ | ❌ |
| Tool result anonimleştirme | ✅ v5.6 | ❌ | ❌ | ❌ |
| XP/Gamification | ✅ | ❌ | ❌ | ❌ |
| SEO/Medium/NatureHub native | ✅ | ❌ | ❌ | ❌ |
| Türkçe yerelleştirme | ✅ %100 | ❌ | Kısmi | ❌ |
| MIT lisanslı | ✅ | ✅ | ❌ | ❌ |
| npm paketi | ✅ v5.6 | ❌ | ❌ | ❌ |
| 57 tool | ✅ | ✅ ~30 | ✅ ~25 | ✅ ~40 |
| Cron + Hooks + Webhooks | ✅ | ❌ | ✅ | ❌ |

---

## 🛠️ Sistem Gereksinimleri

| Gereksinim | Minimum | Önerilen |
|------------|---------|----------|
| **Node.js** | 18.x | 20.x (LTS) |
| **RAM** | 256 MB | 512 MB |
| **Disk** | 100 MB | 500 MB (cache ile) |
| **OS** | macOS 12, Win 10, Ubuntu 20 | macOS 14+, Win 11, Ubuntu 22 |
| **İnternet** | Gereklidir | - |

**Bağımlılıklar:** sadece 18 npm paketi. Hafif.

---

## 🚀 Gerçek Örnekler

### 1. Basit Sohbet
```
$ natureco chat
Provider: api.minimax.io
Model: MiniMax-M2.5
Bot: naruto

👋 Merhaba! Ben naruto, patron.

You  > sen kimsin?
AI   Ben naruto, NatureCo CLI'nin Türkçe yapay zekâ asistanıyım. 57 tool aktif,
     hafıza korunuyor, kanallar hazır.

You  > bana bir fıkra anlat
AI   Temel bir bilgisayar fıkrası: ...
```

### 2. Telegram Bot Bağlantısı
```
$ natureco telegram connect
? Telegram bot token: *** (BotFather'dan)
✓ Token zaten kayıtlı: 889****729:AAGJ9PX4j...
Bot ID: telegram_1782204289029

$ natureco telegram chatid
⏳ Bot çalıştırılıyor, ilk mesajı bekliyorum...
[Telegram'dan /start yaz]
✓ Chat ID algılandı: 6139455189

$ natureco gateway start
[gateway] Gateway running (PID 77765)
[telegram] watching for inbound
[telegram] Inbound from +90****44: "selam"
[telegram] Sending to AI provider...
[telegram] Reply sent (117 chars)
```

### 3. iMessage Slash Komutu
```
$ natureco imessage connect
? imsg CLI yolu: /opt/homebrew/bin/imsg
✓ Bağlantı kuruldu

$ natureco imessage allow +90****4449
✓ İzin verildi: +90****4449

$ natureco gateway start
[imessage] watching for new messages (streaming)

[Telegram'da /start yaz]
[iMessage'da /sen kimsin yaz]
[imessage] Inbound from +90****4449: "/sen kimsin"
[imessage] Slash command: /sen kimsin
[imessage] Reply sent (178 chars)
```

### 4. Kod Ajanı — Basit Uygulama
```
$ natureco code
NatureCo Code Agent v5

You  > notes.py olustur, not ekleme/listeleme/silme, JSON dosyasi

Tool: write_file (2303 bytes)
Tool: bash (python3 notes.py)
✅ Not eklendi: Alışveriş
✅ Not eklendi: Toplantı
✅ Not eklendi: Kitap
✅ Toplam: 3 not
✅ Silme başarılı: ID 2

📂 /Users/gencay/Downloads/notes.py (2303 bytes)
```

---

## 🔌 Entegrasyonlar

### Webhook
```bash
# HTTP callback URL'leri
natureco webhooks add https://example.com/hook

# incoming webhook (POST)
POST /webhook/<id>
Content-Type: application/json
{"event": "...", "data": {...}}
```

### Cron (Zamanlı Görev)
```bash
# Her 5 dakikada bir
natureco cron add \
  --name "selam-gorevi" \
  --schedule "*/5 * * * *" \
  --command "echo 'Selam!'"

# Tek seferlik
natureco cron add --at "2026-12-31T23:59"
```

### MCP (Model Context Protocol)
```bash
natureco mcp add filesystem npx -y @modelcontextprotocol/server-filesystem
natureco mcp add github npx -y @modelcontextprotocol/server-github
```

---

## 📚 Dokümantasyon

- 🌐 **Ana sayfa:** [natureco.me/cli](https://natureco.me/cli)
- 📖 **Komut referansı:** [natureco.me/cli/commands](https://natureco.me/cli/commands)
- 🎓 **Tutorial:** [natureco.me/cli/getting-started](https://natureco.me/cli/getting-started)
- 🔧 **API:** [natureco.me/cli/api](https://natureco.me/cli/api)
- 💬 **Discord topluluğu:** [discord.gg/4FwumbWph](https://discord.gg/4FwumbWph)
- 🐦 **Twitter/X:** [@naturecoofficial](https://twitter.com/naturecoofficial)

---

## 🤝 Katkıda Bulunma

PR'ler ve issue'lar kabul edilir!

```bash
# Repo'yu klonla
git clone https://github.com/natureco-official/natureco-cli.git
cd cli

# Kur
npm install

# Test
npm test

# Lint
npm run lint

# Build
npm run build
```

**Katkıda bulunanlar:** [CONTRIBUTORS.md](https://github.com/natureco-official/natureco-cli/blob/main/CONTRIBUTORS.md)

---

## 📄 Lisans

MIT © [NatureCo](https://github.com/natureco)

---

## 🙏 Teşekkürler

- [OpenAI](https://openai.com) — GPT API
- [Anthropic](https://anthropic.com) — Claude API
- [MiniMax](https://api.minimax.io) — AI provider
- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web
- [imsg](https://github.com/steipete/imsg) — iMessage CLI
- [ripgrep](https://github.com/BurntSushi/ripgrep) — fast search

---

<p align="center">
  <b>Yapay Zekânın Gücü artık parmaklarının ucunda.</b><br>
  <i>Terminalin hızını NatureCo ile keşfet.</i>
</p>

<p align="center">
  Made with 🌿 in Turkey
</p>