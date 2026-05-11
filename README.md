# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()

Terminal-native AI agent CLI — chat with your bots, automate workflows, and connect Telegram, Discord, Slack & WhatsApp. A powerful alternative to Claude Code & OpenClaw.

## ✨ Features

- **🤖 Multi-Bot Chat** — Interactive conversations with AI bots, support for multi-word bot names, auto-selection when no default
- **🔌 Multi-Platform Integration** — Telegram, Discord, Slack, WhatsApp (QR code auth with Baileys)
- **🎯 Skill System** — Extend capabilities with NatureHub and ClawHub skills
- **🔧 MCP Support** — Model Context Protocol servers for filesystem, GitHub, databases
- **🌐 Web Dashboard** — Beautiful glassmorphism UI at localhost:3848 with animated gradients
- **⚡ Gateway Server** — Background process with WhatsApp auto-start, OpenClaw-style logging
- **🎨 Custom AI Providers** — OpenAI, Anthropic, Groq, Gemini with model selection
- **📝 Code Analysis** — Deep code review with security, performance, quality scoring
- **🔄 Automation** — Cron jobs, hooks, custom commands, background tasks
- **💾 Memory System** — Persistent conversation memory per bot
- **📊 System Health** — Built-in doctor command with auto-fix

## 🚀 Quick Start

```bash
# Install globally
npm install -g natureco-cli

# Run setup wizard
natureco setup

# Start chatting
natureco chat
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

**Örnek Config:**
```json
{
  "apiKey": "nc_...",
  "defaultBot": "Nature Bot",
  "defaultBotId": "bot_123",
  "aiProvider": "openai",
  "aiModel": "gpt-4o",
  "telegramToken": "...",
  "discordToken": "...",
  "whatsappConnected": true,
  "whatsappBotId": "bot_123",
  "whatsappPhone": "905551234567@s.whatsapp.net",
  "whatsappAllowedNumbers": ["905551234567", "905422842631"]
}
```

## 📚 Support

- **Documentation:** [natureco.me/docs](https://natureco.me/docs)
- **CLI Docs:** [natureco.me/cli](https://natureco.me/cli)
- **npm Package:** [npmjs.com/package/natureco-cli](https://www.npmjs.com/package/natureco-cli)
- **API Reference:** [natureco.me/api](https://natureco.me/api)
- **GitHub:** [github.com/natureco/cli](https://github.com/natureco/cli)

## 📝 License

MIT © NatureCo

---

**Version:** 1.0.51 | **Node.js:** >=16.0.0 | **Platform:** macOS, Windows, Linux

