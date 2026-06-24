# NatureCo CLI v5.0 — Documentation

> **Terminal-native AI agent for chat, code, workflow automation, and full OS control.**
> v5.0 brings 47 working tools, skill marketplace, and macOS native integration.

**Latest:** `5.0.0` · **Node.js:** `>=18.0.0` · **License:** MIT
**Providers:** Groq, OpenAI, Anthropic, **MiniMax**, Ollama, OpenRouter, Together, DeepSeek, Firecrawl, **Pollinations (free)**
**Platforms:** macOS, Windows, Linux

---

## 🚀 Quick Start

```bash
# 1. Install globally
npm install -g natureco-cli

# 2. Setup wizard (provider, API key, bot, channels)
natureco setup

# 3. Start chatting
natureco chat         # Original v2.23 chat
natureco repl         # NEW: Persistent REPL with memory + tools
```

**Optional integrations** (10 channels):
`natureco telegram connect`, `natureco whatsapp connect`, `natureco discord connect`,
`natureco slack connect`, `natureco signal connect`, `natureco irc connect`,
`natureco mattermost connect`, `natureco imessage connect`, `natureco sms connect`,
`natureco webhooks connect`.

---

## 🆕 What's New in v5.0

| Version | Highlights |
|---------|------------|
| **v5.0** | **Skill marketplace** (5 official + community), 47 tools, macOS native |
| v4.9 | 14 new tools (shell, code-exec, file-search, grep, http, TTS, kanban, todo, memory, cron, ...) |
| v4.8 | **Tool calling fully integrated** (OpenAI-compatible function calling, MiniMax support) |
| v4.7 | Setup wizard has all 10 channels, gateway runs real child process |
| v4.6 | **Persistent REPL** with memory, /resume, /sessions, fact extraction |
| v4.5 | TUI engine (round borders, tables, progress bars, PC-like UI) |
| v3.x | Brand, audit log, cost tracking, dashboard, self-evolving skills |
| v2.23 | Original CLI (preserved 100%) |

---

## 📦 47 Tools (v5.0)

### 🤖 AI & Media (5)
- `image_generation` — OpenAI DALL-E / FAL / Together / **Pollinations (free)** fallback
- `media_understanding` — Vision analysis (OpenAI, Anthropic, Groq)
- `text_to_speech` — macOS `say` / edge-tts
- `llm_task` — Generic AI task
- `canvas` — Drawing

### 📁 Files & Search (6)
- `read_file`, `write_file`, `list_dir`, `filesystem` — File ops
- `file_search` — Glob patterns (`**/*.js`)
- `grep_search` — Content search (ripgrep / grep)

### 💻 System & Shell (5)
- `bash` — Interactive shell
- `code_execution` — Python / Node / Bash sandbox
- `shell_command` — Single shell command
- `http_request` — HTTP GET/POST/PUT/DELETE
- `git` — Git operations

### 🌐 Web (6)
- `web_search` — Exa / DuckDuckGo / SearXNG
- `web_readability` — Extract article text
- `exa_search`, `duckduckgo` — Search engines
- `firecrawl` — Web scraping (API key)
- `browser` — Headless browser

### 🎵 Media Tools (3)
- `audio_understanding` — Whisper transcription
- `document_extract` — PDF/DOCX extraction

### 🍎 macOS Native (6)
- `calendar_add` — Apple Calendar events
- `reminder_add` — Apple Reminders
- `notes_add` — Apple Notes
- `mac_notify` — Notification Center
- `mac_app_open` / `mac_app_quit` — App control

### ✅ Productivity (5)
- `todo_write` — Task list (list/add/done/remove)
- `kanban` — Kanban board (todo/in_progress/done)
- `memory_search` — Search memory + sessions
- `cron_create` — Schedule tasks
- `notebook_edit` — Jupyter notebook cells

### 🛠️ System Tools (4)
- `delegate_task` — Sub-agent delegation
- `skills_marketplace` — Install community skills
- `skills_autoload` — Auto-load skills by keyword
- `skills` — Skill management

> **How tool calling works:** When you ask in REPL, the LLM sees the tool list, picks the right ones, and NatureCo CLI executes them. Results stream back. All real, no simulation.

---

## ⚡ Code Agent (`natureco code`)

Claude Code alternative with 47 tools. Streamed output, tool spinner, approval mechanism.

```bash
natureco code                          # General code agent
natureco code src/pages/Login.tsx      # Focus on specific file
```

In-agent: `/summary`, `/done`, `Ctrl+C`.

---

## 💬 REPL Mode (`natureco repl`) — Persistent Memory

**The killer feature.** Persistent across sessions, remembers facts about you, can use all 47 tools.

```bash
natureco repl
```

Inside REPL:
- `/memory` — Show learned facts about you
- `/sessions` — List past sessions
- `/resume last` — Resume last session
- `/identity <name>` — Change bot name
- `/help` — All slash commands
- `Ctrl+C` — Exit (saves session)

**Example conversation:**
```
You  Yarın 14'te doktor randevum var

AI   🔧 Tool: calendar_add
     Args: {"title":"Doktor randevusu","startDate":"+1 day 14:00"}
     ✓ Sonuç: {"success":true,"message":"Takvime eklendi"}
```

---

## 🛒 Skill Marketplace

```bash
natureco skills marketplace           # List 5 official skills
natureco skills install-mp seo-audit  # Install one
natureco skills search-mp telegram    # Search
natureco skills remove-mp seo-audit   # Uninstall
```

**Built-in skills:**
- `seo-audit` — SEO denetimi (meta tags, schema.org, ...)
- `code-review` — Kod inceleme (security, performance, ...)
- `git-commit` — Conventional commit mesajı üret
- `telegram-bot` — BotFather wizard
- `morning-briefing` — Her sabah 9'da brifing

---

## 📡 Integrations (10 channels)

| Channel | Setup |
|---------|-------|
| Telegram | `natureco telegram connect` |
| WhatsApp | `natureco whatsapp connect` (QR) |
| Discord | `natureco discord connect` |
| Slack | `natureco slack connect` |
| Signal | `natureco signal connect` |
| IRC | `natureco irc connect` |
| Mattermost | `natureco mattermost connect` |
| iMessage | `natureco imessage connect` |
| SMS (Twilio) | `natureco sms connect` |
| Webhooks | `natureco webhooks connect` |

**Note:** macOS Calendar/Reminders/Notes require Automation permission in System Preferences → Security & Privacy → Privacy → Automation.

---

## 🧠 Memory System

Bot memory with separate per-bot storage. Auto-extracts facts from messages with score-based decay.

```bash
# In chat
/memory          # Show memory
/memory clear    # Clear

# Facts are stored at ~/.natureco/memory/<username>.json
```

---

## 🩺 Diagnostics

```bash
natureco doctor          # 10 health checks (config, node, deps, disk, API key, provider, dirs, audit, secrets)
natureco status          # System status card
natureco doctor --fix    # Auto-fix issues
```

---

## 🌐 Provider Setup

```bash
# OpenAI
natureco config set providerUrl https://api.openai.com/v1
natureco config set providerApiKey sk-xxx
natureco config set providerModel gpt-4o

# Groq (free tier, fast)
natureco config set providerUrl https://api.groq.com/openai/v1
natureco config set providerApiKey gsk_xxx
natureco config set providerModel llama-3.3-70b-versatile

# MiniMax (Parton's pick, M2.5/M3)
natureco config set providerUrl https://api.minimax.io
natureco config set providerApiKey sk-cp-xxx
natureco config set providerModel MiniMax-M2.5

# OpenRouter, Together, DeepSeek, Firecrawl, Ollama — all supported
```

---

## 🛡️ Security & Audit

- **Audit log:** JSONL, 30-day retention, all actions logged
- **Secret scanner:** 22 patterns (OpenAI, AWS, GitHub, etc.)
- **Approval policy:** ask/allowlist/deny/full modes
- **Token budget:** efficient/balanced/quality

```bash
natureco audit today    # Today's log
natureco audit stats    # 24h statistics
natureco security audit # Security check
```

---

## 💰 Cost Tracking

```bash
natureco cost today     # Today's cost
natureco cost week      # This week
natureco cost budget    # Budget status
natureco cost prices    # Model prices (21 models)
```

---

## 📊 Dashboard

```bash
natureco dashboard       # Open http://localhost:7421
```

Web UI with Overview, Sessions, Costs, Skills tabs. Auto-refresh every 5s.

---

## 🆚 Why NatureCo CLI over OpenClaw?

| Feature | OpenClaw | **NatureCo CLI v5.0** |
|---------|----------|------------------------|
| First setup | 30-60 min | **60 sec** |
| Monthly cost | $50-200 | **$5-15** |
| Working tools | ~30 (some broken) | **47 (all verified)** |
| Tool calling | Limited | **Full OpenAI function calling** |
| Skill marketplace | ❌ | **✅ 5 official + community** |
| Persistent memory | Basic | **REPL with /resume, fact extraction** |
| TUI engine | ❌ | **Round borders, tables, progress bars** |
| Multi-agent | Limited | **8 specialists** |
| macOS native | ❌ | **Calendar, Reminders, Notes, Apps** |
| Image generation | Paid only | **Free Pollinations fallback** |
| Languages | English-first | **Turkish-first** |

---

## 📦 Installation

```bash
# NPM
npm install -g natureco-cli

# Or from source
git clone https://github.com/natureco/natureco-cli
cd natureco-cli
npm install -g .
```

**Requirements:** Node.js 18+

---

## 🔗 Links

- **npm:** https://npmjs.com/package/natureco-cli
- **GitHub:** https://github.com/natureco/natureco-cli
- **Issues:** https://github.com/natureco/natureco-cli/issues
- **Discord:** https://discord.gg/natureco
- **Twitter:** @naturecoofficial

---

## 📜 License

MIT — Open source, free for commercial use.
