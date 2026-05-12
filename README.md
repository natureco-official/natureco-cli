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

### Core Commands

| Command | Description |
|---------|-------------|
| `natureco` | Opens gateway screen — system status, active bot, skill count |
| `natureco setup` | Setup wizard — API key, bot selection, AI provider, model, integrations |
| `natureco login` | Login with API key |
| `natureco logout` | Logout and clear config |
| `natureco help` | List all commands with examples |
| `natureco doctor` | System health check — Node, API, bot, skills, integrations |
| `natureco doctor --fix` | Auto-fix detected issues |
| `natureco update` | Check for new version |

### Chat

| Command | Description |
|---------|-------------|
| `natureco chat` | Chat with default bot (interactive selection if none) |
| `natureco chat Bot Name` | Chat with specific bot (spaces supported) |
| `natureco chat Nature Bot V3` | Multi-word bot names auto-joined |
| `natureco chat --resume` | Resume latest session |
| `natureco ask "question"` | One-time question |
| `natureco run script.md` | Send markdown file as prompt |
| `natureco bots` | List all bots |

**In-Chat Commands:**

| Command | Description |
|---------|-------------|
| `/clear` | Clear screen |
| `/bot` | Show bot list or switch bot |
| `/bot Bot Name` | Switch to specific bot |
| `/skills` | Show active skills |
| `/memory` | Show memory status |
| `/memory clear` | Clear memory |
| `/commands` | List custom commands |
| `/ultrareview` | Deep review last code block |
| `/help` | Show chat help |
| `exit` / `quit` | Exit chat |
| `Ctrl+B` | Move task to background |

### Skill System

| Command | Description |
|---------|-------------|
| `natureco skills` | List installed skills |
| `natureco skills install slug` | Install skill from NatureHub |
| `natureco skills install clawhub:slug` | Install skill from ClawHub |
| `natureco skills browse` | Browse popular skills, interactive selection |
| `natureco skills search "query"` | Search skills |
| `natureco skills remove slug` | Remove skill |
| `natureco skills create name` | Create new skill template |

### Integrations

| Command | Description |
|---------|-------------|
| `natureco telegram connect` | Connect Telegram bot (token + user ID) |
| `natureco discord connect` | Connect Discord bot |
| `natureco slack connect` | Connect to Slack workspace |
| `natureco whatsapp connect` | Connect WhatsApp with QR code (Baileys) |
| `natureco whatsapp status` | WhatsApp connection status and allow list |
| `natureco whatsapp allow <number>` | Add number to allow list |
| `natureco whatsapp disconnect` | Disconnect WhatsApp |

### MCP Servers

| Command | Description |
|---------|-------------|
| `natureco mcp list` | List connected MCP servers |
| `natureco mcp add` | Add MCP server (filesystem, github, postgres...) |
| `natureco mcp templates` | List ready-made MCP templates |
| `natureco mcp enable <name>` | Enable MCP server |
| `natureco mcp disable <name>` | Disable MCP server |

### Automation

| Command | Description |
|---------|-------------|
| `natureco ultrareview file.js` | Code review — security, performance, quality scores |
| `natureco git review` | Review staged changes |
| `natureco git commit` | Generate commit message with AI |
| `natureco cron add` | Create scheduled task |
| `natureco cron list` | List cron jobs |
| `natureco cron start` | Start cron daemon |
| `natureco hooks create type` | Create hook (pre-message, post-message...) |
| `natureco commands create name` | Create custom /command |
| `natureco migrate --from openclaw` | Migrate from OpenClaw (memory, crons, skills, scripts) |

### Gateway & Dashboard

| Command | Description |
|---------|-------------|
| `natureco gateway start` | Start gateway in background (WhatsApp auto-start) |
| `natureco gateway stop` | Stop gateway |
| `natureco gateway status` | Gateway status (last 10 logs) |
| `natureco gateway logs` | Show all logs (~/.natureco/gateway.log) |
| `natureco dashboard` | Open web UI (localhost:3848) |
| `natureco dashboard stop` | Stop dashboard |
| `natureco dashboard status` | Check dashboard status |

### Configuration

| Command | Description |
|---------|-------------|
| `natureco config list` | Show all settings |
| `natureco config get key` | Get specific setting |
| `natureco config set key val` | Change setting |
| `natureco init` | Create project folder (.natureco/) |

## 🔌 Integrations

### Telegram

Connect your Telegram bot, receive and respond to messages. Authentication with bot token and user ID.

```bash
natureco telegram connect
```

### Discord

Integrate Discord bots. Server channels, DMs, and slash commands supported.

```bash
natureco discord connect
```

### Slack

Connect to Slack workspaces. Manage channel and DM messages.

```bash
natureco slack connect
```

### WhatsApp

Connect WhatsApp accounts with QR code. Full media support with Baileys library.

```bash
# Initial connection (QR code)
natureco whatsapp connect

# Auto-start with gateway
natureco gateway start

# Add number to allow list
natureco whatsapp allow 905551234567

# Check status
natureco whatsapp status
```

**WhatsApp Features:**
- QR code connection in terminal
- Session persistence (~/.natureco/whatsapp-sessions/)
- Allow list control (last 10 digits comparison)
- Gateway auto-start
- OpenClaw-style logging
- Auto-reconnect (515, 408 error codes)
- Multiple message format support (text, caption, buttons, list...)

## 🌐 Gateway Server

Background gateway server. WhatsApp auto-start, OpenClaw-style logging, health check.

```bash
# Start gateway (background)
natureco gateway start

# Watch logs live
tail -f ~/.natureco/gateway.log

# Check status
natureco gateway status

# Stop
natureco gateway stop
```

**Gateway Features:**
- Detached process (runs even if terminal closed)
- WhatsApp auto-start (if saved in config)
- OpenClaw-style log format: `[timestamp] [module] message`
- Health check every 60 seconds
- Auto-restart on connection loss (10s delay)
- Platform-aware stop (SIGTERM → SIGKILL / taskkill)
- All logs in ~/.natureco/gateway.log

## 🎨 Dashboard

Web UI running on localhost:3848. Glassmorphism design, animated gradient background.

```bash
natureco dashboard
```

**Dashboard Features:**
- Modern glassmorphism UI
- Animated gradient background (same as natureco.me/landing)
- Left sidebar: Active bot, other bots, channels, skills, memory, sessions, system, cron jobs
- Right chat area: Bot avatar, model info, version badge
- Typing indicator (three dots animation)
- Turkish character support
- Responsive design

## 💾 Memory System

Bot memory — user name, bot name, nickname, preferences, and facts. Separate memory per bot.

**Memory Features:**
- **Bot Name:** Bot's name (from memory or agents/ folder)
- **User Name:** User's name
- **Nickname:** User's nickname
- **Facts:** Information about user (max 15, sorted by score)
- **Preferences:** User preferences
- **Auto-Extract:** Automatic information extraction from messages
- **Score System:** Each fact has a score, old facts decay

```bash
# Show memory
natureco chat
/memory

# Clear memory
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
    { "value": "Developer", "score": 5, "updatedAt": "2025-01-12" }
  ],
  "preferences": [],
  "lastSeen": "2025-01-12T10:30:00.000Z"
}
```

## 🐰 Terminal UI

Minimal and clean terminal interface. Rabbit ASCII art, progress bar animation, colored output.

**UI Features:**
- **Startup Animation:** Rabbit ASCII art + progress bar (Memory, Skills, Gateway)
- **Header:** Full terminal width separator, bot name, model, timezone
- **Message Format:** `You  message` (gray) → `İchigo  response` (cyan)
- **Loading:** `●○○ ○●○ ○○●` animation (300ms)
- **Colors:** Error (red), success (green), bot name (cyan), user (gray)
- **No Emoji:** Clean, minimal design

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

You  hello
İchigo  Hello! How can I help you?
```

## 🔄 Migration from OpenClaw

Migrate from OpenClaw to NatureCo. Memory, crons, skills, scripts, and WhatsApp sessions auto-migrated.

```bash
# Migrate from OpenClaw
natureco migrate --from openclaw

# Custom OpenClaw directory
natureco migrate --from openclaw --openclaw-dir /path/to/.openclaw
```

**Migrated Data:**
- **Memory:** USER.md → universal-provider.json (name, nickname, timezone, notes)
- **Memory Files:** MEMORY.md and memory/*.md → facts (max 15, deduplicated)
- **Bot Name:** From agents/ folder name or cron job names
- **Cron Jobs:** jobs.json → crons.json (path normalization, duplicate check)
- **Telegram:** allowFrom → config
- **WhatsApp:** Session → whatsapp-sessions (number normalization)
- **Scripts:** workspace/scripts → .natureco/workspace/scripts (path fixes, package.json)
- **Skills:** workspace/skills → .natureco/skills
- **.env:** Workspace .env file copied

**Migration Features:**
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

