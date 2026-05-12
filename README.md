# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()

Terminal-native AI agent CLI — chat with your bots, automate workflows, and connect Telegram, Discord, Slack & WhatsApp. A powerful alternative to Claude Code & OpenClaw.

## ✨ Features

- **🤖 Universal LLM Provider Support** — Connect to any OpenAI-compatible API (Groq, OpenAI, Together, Fireworks, DeepSeek, OpenRouter, Ollama, LM Studio) or Anthropic
- **🛠️ Local Tool Execution** — Bash commands, file operations (read_file, write_file, list_dir) — AI executes tools locally with automatic retry loop
- **🔒 Security Layer** — Base64 encoding for tool results, dangerous command blocking, content truncation
- **🎯 Smart Tool Selection** — AI automatically chooses the right tool based on file type and task
- **🌐 Web Dashboard** — Beautiful glassmorphism UI at localhost:3848 with animated gradients
- **📝 Code Analysis** — Deep code review with security, performance, quality scoring
- **💾 Memory System** — Persistent conversation memory per session
- **📊 System Health** — Built-in doctor command with auto-fix

## 🚀 Quick Start

```bash
# Install globally
npm install -g natureco-cli

# Run setup wizard (v2.x - universal provider support)
natureco setup   # provider URL, API key, model seç

# Start chatting
natureco chat    # terminal agent hazır
```

## 📋 Commands

### Temel Komutlar

| Komut | Açıklama |
|-------|----------|
| `natureco` | Gateway ekranını açar — sistem durumu, aktif bot, skill sayısı |
| `natureco setup` | Kurulum sihirbazı — API key, bot seç, AI provider, model seç, entegrasyonlar |
| `natureco login` | API key ile giriş yapar |
| `natureco logout` | Çıkış yapar, config'i temizler |
| `natureco help` | Tüm komutları ve örnekleri listeler |
| `natureco doctor` | Sistem sağlık kontrolü — Node, API, bot, skill, entegrasyon |
| `natureco doctor --fix` | Sorunları otomatik onarır |
| `natureco update` | Yeni versiyon kontrolü |

### Sohbet

| Komut | Açıklama |
|-------|----------|
| `natureco chat` | Varsayılan botla sohbet (yoksa interaktif seçim) |
| `natureco chat Bot Adı` | Belirli botla sohbet (boşluklu isimler desteklenir) |
| `natureco chat Nature Bot V3` | Çok kelimeli bot adları otomatik birleştirilir |
| `natureco chat --resume` | En son oturuma devam eder |
| `natureco ask "soru"` | Tek seferlik soru sorar |
| `natureco run script.md` | Markdown dosyasını prompt olarak gönderir |
| `natureco bots` | Tüm botları listeler |

**Chat İçi Komutlar:**

| Komut | Açıklama |
|-------|----------|
| `/clear` | Ekranı temizler |
| `/bot` | Bot listesi gösterir veya bot değiştirir |
| `/bot Bot Adı` | Belirli bota geçer |
| `/skills` | Aktif skill'leri gösterir |
| `/memory` | Hafıza durumunu gösterir |
| `/memory clear` | Hafızayı temizler |
| `/commands` | Özel komutları listeler |
| `/ultrareview` | Son kod bloğunu detaylı inceler |
| `/help` | Chat yardımını gösterir |
| `exit` / `quit` | Sohbetten çıkar |
| `Ctrl+B` | Görevi arka plana al |

### Skill Sistemi

| Komut | Açıklama |
|-------|----------|
| `natureco skills` | Yüklü skill'leri listeler |
| `natureco skills install slug` | NatureHub'dan skill yükler |
| `natureco skills install clawhub:slug` | ClawHub'dan skill yükler |
| `natureco skills browse` | Popüler skill listesi, interaktif seçim |
| `natureco skills search "sorgu"` | Skill arar |
| `natureco skills remove slug` | Skill'i kaldırır |
| `natureco skills create ad` | Yeni skill şablonu oluşturur |

### Entegrasyonlar

| Komut | Açıklama |
|-------|----------|
| `natureco telegram connect` | Telegram botunu bağlar (token + user ID) |
| `natureco discord connect` | Discord botunu bağlar |
| `natureco slack connect` | Slack workspace'ine bağlanır |
| `natureco whatsapp connect` | WhatsApp QR kod ile bağlanır (Baileys) |
| `natureco whatsapp status` | WhatsApp bağlantı durumu ve izin listesi |
| `natureco whatsapp allow <numara>` | İzin listesine numara ekler |
| `natureco whatsapp disconnect` | WhatsApp bağlantısını keser |

### MCP Sunucuları

| Komut | Açıklama |
|-------|----------|
| `natureco mcp list` | Bağlı MCP sunucularını listeler |
| `natureco mcp add` | MCP sunucu ekler (filesystem, github, postgres...) |
| `natureco mcp templates` | Hazır MCP şablonlarını listeler |
| `natureco mcp enable <name>` | MCP sunucusunu aktif eder |
| `natureco mcp disable <name>` | MCP sunucusunu devre dışı bırakır |

### Otomasyon

| Komut | Açıklama |
|-------|----------|
| `natureco ultrareview dosya.js` | Kod inceleme — güvenlik, performans, kalite puanlar |
| `natureco git review` | Staged değişiklikleri inceletir |
| `natureco git commit` | AI ile commit mesajı üretir |
| `natureco cron add` | Zamanlanmış görev oluşturur |
| `natureco cron list` | Cron görevlerini listeler |
| `natureco cron start` | Cron daemon'unu başlatır |
| `natureco hooks create tip` | Hook oluşturur (pre-message, post-message...) |
| `natureco commands create ad` | Özel /komut oluşturur |
| `natureco migrate --from openclaw` | OpenClaw'dan migration (memory, crons, skills, scripts) |

### Gateway & Dashboard

| Komut | Açıklama |
|-------|----------|
| `natureco gateway start` | Gateway'i arka planda başlatır (WhatsApp otomatik) |
| `natureco gateway stop` | Gateway'i durdurur |
| `natureco gateway status` | Gateway durumu (son 10 log) |
| `natureco gateway logs` | Tüm logları gösterir (~/.natureco/gateway.log) |
| `natureco dashboard` | Web arayüzü açar (localhost:3848) |
| `natureco dashboard stop` | Dashboard'u durdurur |
| `natureco dashboard status` | Dashboard durumunu kontrol eder |

### Yapılandırma

| Komut | Açıklama |
|-------|----------|
| `natureco config list` | Tüm ayarları gösterir |
| `natureco config get key` | Belirli ayarı gösterir |
| `natureco config set key val` | Ayar değiştirir |
| `natureco init` | Proje klasörü oluşturur (.natureco/) |

## 🔌 Integrations

### Telegram

Telegram botunuzu bağlayın, mesajları alın ve yanıtlayın. Bot token ve kullanıcı ID ile kimlik doğrulama.

```bash
natureco telegram connect
```

### Discord

Discord botlarını entegre edin. Sunucu kanalları, DM'ler ve slash komutları desteklenir.

```bash
natureco discord connect
```

### Slack

Slack workspace'lerine bağlanın. Kanal ve DM mesajlarını yönetin.

```bash
natureco slack connect
```

### WhatsApp

WhatsApp hesaplarını QR kod ile bağlayın. Baileys kütüphanesi ile tam medya desteği.

```bash
# İlk bağlantı (QR kod)
natureco whatsapp connect

# Gateway ile otomatik başlat
natureco gateway start

# İzin listesine numara ekle
natureco whatsapp allow 905551234567

# Durum kontrolü
natureco whatsapp status
```

**WhatsApp Özellikleri:**
- QR kod ile terminal'de bağlantı
- Session persistence (~/.natureco/whatsapp-sessions/)
- İzin listesi kontrolü (son 10 hane karşılaştırma)
- Gateway ile otomatik başlatma
- OpenClaw-style logging
- Auto-reconnect (515, 408 hata kodları)
- Çoklu mesaj formatı desteği (text, caption, buttons, list...)

## 🌐 Gateway Server

Arka planda çalışan gateway sunucusu. WhatsApp otomatik başlatma, OpenClaw-style logging, health check.

```bash
# Gateway'i başlat (arka planda)
natureco gateway start

# Logları canlı izle
tail -f ~/.natureco/gateway.log

# Durum kontrolü
natureco gateway status

# Durdur
natureco gateway stop
```

**Gateway Özellikleri:**
- Detached process (terminal kapatılsa bile çalışır)
- WhatsApp otomatik başlatma (config'de kayıtlıysa)
- OpenClaw-style log formatı: `[timestamp] [module] message`
- Health check her 60 saniyede
- Auto-restart on connection loss (10s delay)
- Platform-aware stop (SIGTERM → SIGKILL / taskkill)
- Tüm loglar ~/.natureco/gateway.log dosyasında

## 🎨 Dashboard

Localhost:3848'de çalışan web arayüzü. Glassmorphism tasarım, animated gradient arka plan.

```bash
natureco dashboard
```

**Dashboard Özellikleri:**
- Modern glassmorphism UI
- Animated gradient background (natureco.me/landing ile aynı)
- Sol sidebar: Aktif bot, diğer botlar, kanallar, skill'ler, hafıza, sessions, sistem, cron jobs
- Sağ chat alanı: Bot avatar, model bilgisi, version badge
- Typing indicator (üç nokta animasyonu)
- Türkçe karakter desteği
- Responsive tasarım

## 💾 Memory System

Bot hafızası — kullanıcı adı, bot adı, lakap, tercihler ve facts. Her bot için ayrı hafıza.

**Memory Özellikleri:**
- **Bot Name:** Bot'un adı (memory'den veya agents/ klasöründen)
- **User Name:** Kullanıcının adı
- **Nickname:** Kullanıcının lakabı
- **Facts:** Kullanıcı hakkında bilgiler (max 15, score'a göre sıralı)
- **Preferences:** Kullanıcı tercihleri
- **Auto-Extract:** Mesajlardan otomatik bilgi çıkarma
- **Score System:** Her fact'in score'u var, eski facts decay oluyor

```bash
# Hafızayı göster
natureco chat
/memory

# Hafızayı temizle
/memory clear
```

**Memory Format:**
```json
{
  "name": "Gencay",
  "botName": "İchigo",
  "nickname": "Parton",
  "facts": [
    { "value": "Timezone: UTC+3", "score": 6, "updatedAt": "2025-01-12" },
    { "value": "Yazılımcı", "score": 5, "updatedAt": "2025-01-12" }
  ],
  "preferences": [],
  "lastSeen": "2025-01-12T10:30:00.000Z"
}
```

## 🐰 Terminal UI

Minimal ve temiz terminal arayüzü. Tavşan ASCII art, progress bar animasyonu, renkli çıktılar.

**UI Özellikleri:**
- **Startup Animation:** Tavşan ASCII art + progress bar (Memory, Skills, Gateway)
- **Header:** Terminal genişliği kadar separator, bot adı, model, timezone
- **Message Format:** `You  mesaj` (gray) → `İchigo  cevap` (cyan)
- **Loading:** `●○○ ○●○ ○○●` animasyonu (300ms)
- **Colors:** Hata (red), başarı (green), bot adı (cyan), kullanıcı (gray)
- **No Emoji:** Temiz, minimal tasarım

```
  (\\_/)
  (•ᴥ•)
  />🌿

────────────────────────────────────────
NatureCo · İchigo · llama-3.1 · UTC+3
────────────────────────────────────────
Session · /clear /bot /skills /memory /help · Ctrl+C to exit
────────────────────────────────────────
Memory: Gencay · 67 facts   Skills: 28   Crons: 21 active
────────────────────────────────────────

You  merhaba
İchigo  Merhaba! Nasıl yardımcı olabilirim?
```

## 🔄 Migration from OpenClaw

OpenClaw'dan NatureCo'ya geçiş yapın. Memory, crons, skills, scripts ve WhatsApp session'ları otomatik migrate edilir.

```bash
# OpenClaw'dan migrate et
natureco migrate --from openclaw

# Özel OpenClaw dizini
natureco migrate --from openclaw --openclaw-dir /path/to/.openclaw
```

**Migrate Edilen Veriler:**
- **Memory:** USER.md → universal-provider.json (name, nickname, timezone, notes)
- **Memory Files:** MEMORY.md ve memory/*.md → facts (max 15, deduplicated)
- **Bot Name:** agents/ klasör adından veya cron job adlarından
- **Cron Jobs:** jobs.json → crons.json (path normalization, duplicate check)
- **Telegram:** allowFrom → config
- **WhatsApp:** Session → whatsapp-sessions (number normalization)
- **Scripts:** workspace/scripts → .natureco/workspace/scripts (path fixes, package.json)
- **Skills:** workspace/skills → .natureco/skills
- **.env:** Workspace .env dosyası kopyalanır

**Migration Özellikleri:**
- Path normalization (Windows → Unix)
- Duplicate detection (crons, facts)
- WhatsApp number normalization (JID → clean phone)
- Bot name extraction (agents/, cron jobs, MEMORY.md)
- Facts filtering (skip tables, commands, emojis)

## 🎨 Dashboard

Localhost:3848'de çalışan web arayüzü. Glassmorphism tasarım, animated gradient arka plan.

```bash
natureco dashboard
```

**Dashboard Özellikleri:**
- Modern glassmorphism UI
- Animated gradient background (natureco.me/landing ile aynı)
- Sol sidebar: Aktif bot, diğer botlar, kanallar, skill'ler, hafıza, sessions, sistem, cron jobs
- Sağ chat alanı: Bot avatar, model bilgisi, version badge
- Typing indicator (üç nokta animasyonu)
- Türkçe karakter desteği
- Responsive tasarım

## 🤖 Custom AI Providers

NatureCo dışında kendi AI provider'ınızı kullanın. Setup sırasında veya config ile ayarlayın.

**Desteklenen Provider'lar:**
- **OpenAI:** GPT-5.5, GPT-5.4, GPT-5, GPT-4.1, GPT-4o, o3, o4 Mini
- **Anthropic:** Claude Opus 4.7/4.6/4.5, Sonnet 4.6/4.5, Haiku 4.5/3.5
- **Groq:** Llama 3.3 70B, Llama 3.1 8B/70B, Mixtral 8x7B, Gemma 2 9B
- **Gemini:** 2.5 Pro/Flash, 2.0 Flash, 1.5 Pro/Flash

```bash
# Setup sırasında provider ve model seç
natureco setup

# Config ile değiştir
natureco config set aiProvider openai
natureco config set aiModel gpt-4o
```

## 📁 File Structure

```
~/.natureco/
├── config.json              # Ana yapılandırma
├── gateway.pid              # Gateway process ID
├── gateway.log              # Gateway logları
├── dashboard.pid            # Dashboard process ID
├── skills/                  # Yüklü skill'ler
├── memory/                  # Bot hafızaları
├── history/                 # Chat geçmişi
├── sessions/                # Chat oturumları
├── whatsapp-sessions/       # WhatsApp session'ları
│   └── {bot_id}/           # Bot bazında session
└── cron.json               # Cron görevleri
```

## 🔧 Configuration

Config dosyası: `~/.natureco/config.json`

**v2.x Örnek Config (Universal Provider):**
```json
{
  "providerUrl": "https://api.groq.com/openai/v1",
  "providerApiKey": "gsk_xxx",
  "providerModel": "llama-3.3-70b-versatile",
  "debug": false,
  "skills": { "enabled": true, "list": [] },
  "mcpServers": {}
}
```

**Desteklenen Provider'lar:**
- Groq: `https://api.groq.com/openai/v1`
- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com`
- Together AI: `https://api.together.xyz/v1`
- Fireworks AI: `https://api.fireworks.ai/inference/v1`
- DeepSeek: `https://api.deepseek.com/v1`
- OpenRouter: `https://openrouter.ai/api/v1`
- Ollama (local): `http://localhost:11434/v1`
- LM Studio (local): `http://localhost:1234/v1`

**Config Komutları:**
```bash
# Provider değiştir
natureco config set providerUrl https://api.openai.com/v1
natureco config set providerApiKey sk-xxx
natureco config set providerModel gpt-4o

# Debug mode
natureco config set debug true

# Tüm ayarları göster
natureco config list
```

## 📚 Support

- **Documentation:** [natureco.me/docs](https://natureco.me/docs)
- **CLI Docs:** [natureco.me/cli](https://natureco.me/cli)
- **npm Package:** [npmjs.com/package/natureco-cli](https://www.npmjs.com/package/natureco-cli)
- **API Reference:** [natureco.me/api](https://natureco.me/docs/sdk))
- **GitHub:** [github.com/natureco/cli](github.com/natureco-official/natureco-cli)

## 📝 License

MIT © NatureCo

---

**Version:** 2.14.5 | **Node.js:** >=16.0.0 | **Platform:** macOS, Windows, Linux

