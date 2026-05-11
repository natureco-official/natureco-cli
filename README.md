# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()

Terminal-native AI agent CLI — chat with your bots, automate workflows, and connect Telegram, Discord, Slack & more. A powerful alternative to Claude Code & OpenClaw.

## Features

- **Terminal-Native Chat** — Interactive conversations with your AI bots directly from the command line with full context awareness
- **Multi-Platform Integration** — Connect Telegram, Discord, Slack, and WhatsApp bots with simple commands and QR code authentication
- **Skill System** — Extend bot capabilities with NatureHub and ClawHub skills (thousands of pre-built skills available)
- **MCP Support** — Integrate Model Context Protocol servers for filesystem, GitHub, databases, and custom tools
- **AI-Powered Git** — Automated code review, intelligent commit messages, and PR generation with context-aware analysis
- **Web Dashboard** — Beautiful glassmorphism UI at localhost:3848 for browser-based chat and bot management
- **WebSocket Gateway** — Real-time bidirectional communication server for custom integrations and live updates
- **Automation Tools** — Schedule cron jobs, create hooks, and build custom commands for workflow automation
- **Code Analysis** — Deep code review with security, performance, and quality scoring via ultrareview command
- **System Health** — Built-in doctor command checks Node.js, API keys, integrations, and auto-fixes common issues

## Quick Start

```bash
# Install globally
npm install -g natureco-cli

# Login with your API key
natureco login

# Start chatting
natureco chat
```

## Commands

### Temel Komutlar

| Komut | Açıklama |
|-------|----------|
| `natureco` | Gateway ekranını açar — sistem durumu, aktif bot, skill sayısı |
| `natureco setup` | Kurulum sihirbazını başlatır — API key, bot seç, Telegram/Discord bağla |
| `natureco login` | API key ile giriş yapar, config'e kaydeder |
| `natureco logout` | Çıkış yapar, config'i temizler |
| `natureco help` | Tüm komutları ve örnekleri listeler |
| `natureco doctor` | Sistem sağlık kontrolü — Node, API key, bot, skill, entegrasyon durumu |
| `natureco doctor --fix` | Sorunları otomatik onarır — güncellemeleri yükler, config'i yeniler |
| `natureco update` | Yeni versiyon var mı kontrol eder |

### Sohbet

| Komut | Açıklama |
|-------|----------|
| `natureco chat` | Varsayılan botla interaktif sohbet başlatır |
| `natureco chat "Bot Adı"` | Belirli bir botla sohbet başlatır |
| `natureco chat --resume` | En son oturuma devam eder |
| `natureco ask "soru"` | Tek seferlik soru sorar, cevap alır, çıkar |
| `natureco run script.md` | Markdown dosyasını bota prompt olarak gönderir |
| `natureco bots` | Tüm botlarınızı listeler (ID, provider, durum) |

**Chat İçi Komutlar:**

| Komut | Açıklama |
|-------|----------|
| `/clear` | Ekranı temizler |
| `/bot` | Bot listesini gösterir veya bot değiştirir |
| `/skills` | Aktif skill'leri gösterir |
| `/memory` | Hafıza durumunu gösterir |
| `/commands` | Özel komutları listeler |
| `/help` | Chat yardımını gösterir |
| `exit` veya `quit` | Sohbetten çıkar |

### Skill Sistemi

| Komut | Açıklama |
|-------|----------|
| `natureco skills` | Yüklü skill'leri listeler (kaynak, açıklama) |
| `natureco skills install slug` | NatureHub'dan skill yükler |
| `natureco skills install clawhub:slug` | ClawHub'dan skill yükler (binlerce skill) |
| `natureco skills browse` | Popüler skill listesini gösterir, interaktif seçim |
| `natureco skills search "sorgu"` | Skill arar |
| `natureco skills remove slug` | Skill'i kaldırır |
| `natureco skills create ad` | Yeni skill şablonu oluşturur |

### Entegrasyonlar

| Komut | Açıklama |
|-------|----------|
| `natureco telegram connect` | Telegram botunu bağlar (token + kullanıcı ID) |
| `natureco discord connect` | Discord botunu bağlar |
| `natureco slack connect` | Slack workspace'ine bağlanır |
| `natureco whatsapp connect` | WhatsApp'ı QR kod ile bağlar |

### MCP Sunucuları

| Komut | Açıklama |
|-------|----------|
| `natureco mcp list` | Bağlı MCP sunucularını listeler |
| `natureco mcp add` | MCP sunucu ekler (filesystem, github, postgres...) |
| `natureco mcp templates` | Hazır MCP şablonlarını listeler |

### Otomasyon

| Komut | Açıklama |
|-------|----------|
| `natureco ultrareview dosya.js` | Kodu derinlemesine inceler — güvenlik, performans, kalite puanlar |
| `natureco git review` | Staged değişiklikleri bota inceletir |
| `natureco git commit` | AI ile commit mesajı üretir ve commit atar |
| `natureco cron add` | Zamanlanmış görev oluşturur (her gün, her X saatte) |
| `natureco cron list` | Cron görevlerini listeler |
| `natureco cron start` | Cron daemon'unu başlatır |
| `natureco cron stop` | Cron daemon'unu durdurur |
| `natureco hooks create tip` | Hook oluşturur (pre-message, post-message, on-start...) |
| `natureco commands create ad` | Özel /komut oluşturur (chat'te /ad ile kullan) |

### Arayüz & Sunucular

| Komut | Açıklama |
|-------|----------|
| `natureco dashboard` | Web arayüzünü açar (localhost:3848) — tarayıcıda chat |
| `natureco dashboard stop` | Dashboard'u durdurur |
| `natureco dashboard status` | Dashboard durumunu kontrol eder |
| `natureco gateway start` | WebSocket sunucusunu başlatır (ws://localhost:3847) |
| `natureco gateway stop` | Gateway'i durdurur |
| `natureco gateway status` | Gateway durumunu kontrol eder |
| `natureco config list` | Tüm ayarları gösterir |
| `natureco config set key val` | Ayar değiştirir (örn: defaultBot, theme) |
| `natureco init` | Mevcut klasörde .natureco/ proje klasörü oluşturur |

## Integrations

### Telegram

Connect your Telegram bot to receive and respond to messages directly through NatureCo. Supports both bot token and user ID authentication.

```bash
natureco telegram connect
```

### Discord

Integrate Discord bots with full support for server channels, DMs, and slash commands. Seamless setup with OAuth2 flow.

```bash
natureco discord connect
```

### Slack

Connect to Slack workspaces and enable bot interactions in channels and direct messages. Supports Slack App authentication.

```bash
natureco slack connect
```

### WhatsApp

Link WhatsApp accounts using QR code authentication. Send and receive messages through your AI bot with full media support.

```bash
natureco whatsapp connect
```

## Dashboard

Launch a beautiful web interface at `localhost:3848` with glassmorphism design and dark mode. Features include:

- Real-time chat with all your bots
- Bot switching and configuration
- Skill and MCP management
- Live system stats and health monitoring
- Responsive design for desktop and mobile

```bash
natureco dashboard
```

![Dashboard Preview](https://natureco.me/assets/cli-dashboard.png)

## Support

- **Documentation:** [natureco.me/docs](https://natureco.me/docs)
- **CLI Docs:** [natureco.me/cli](https://natureco.me/cli)
- **npm Package:** [npmjs.com/package/natureco-cli](https://www.npmjs.com/package/natureco-cli)
- **GitHub Issues:** [github.com/natureco/cli/issues](https://github.com/natureco/cli/issues)
- **API Reference:** [natureco.me/api](https://natureco.me/api)

## License

MIT © NatureCo

---

**Version:** 1.0.21 | **Node.js:** >=18.0.0 | **Platform:** macOS, Windows, Linux
