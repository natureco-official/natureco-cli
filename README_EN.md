# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)]()
[![Downloads](https://img.shields.io/npm/dm/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![Stars](https://img.shields.io/github/stars/natureco-official/natureco-cli)](https://github.com/natureco-official/natureco-cli)

> **The Power of AI, now at your fingertips.**
> *Explore the Speed of Terminal with NatureCo.*

Terminal-native AI agent CLI — chat, write code, automate workflows, connect **Telegram / Discord / Slack / WhatsApp / iMessage**.

**Claude Code alternative** · Multi-agent orchestration · Slash-prefix system · Dangerous Command Approval · 12 providers, 200+ models · 57 tools · 10 messaging platforms · 3-file personality system

```
███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗ ███████╗ ██████╗  ██████╗
████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔════╝██╔════╝ ██╔═══██╗
██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝█████╗  ██║      ██║   ██║
██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══╝  ██║      ██║   ██║
██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║███████╗╚██████╗ ╚██████╔╝
╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚═════╝
```

---

## 🚀 Quick Start

```bash
# 1. Install
npm install -g natureco-cli

# 2. First-time setup wizard (provider, model, bot name)
natureco setup

# 3. Start chatting
natureco chat

# 4. Or run the code agent
natureco code
```

**Ready in 30 seconds.** On first launch, the wizard greets you: choose provider → enter API key → pick a model → set bot name. That's it.

---

## 🆕 v5.6.x What's New

### v5.6.47 — Sharded Memory System

The agent's personality & working notes are now **sharded across 6 files** for infinite scalability:

```
soul/
├── SOUL.md           ← index + critical references
└── notes/
    ├── INDEX.md      ← file map, navigation
    ├── note1.md      ← Patron & persona
    ├── note2.md      ← project structure, 120+ commands
    ├── note3.md      ← tokens, red lines, masking fixes
    ├── note4.md      ← 7-step release workflow
    └── note5.md      ← skills, tools, channels, MCP
```

- **Infinite scalability** — add `note6.md`, `note7.md`... as needed
- **Cross-project pattern** — mirrors `/Users/gencay/.hermes/sasuke-notes*.md`
- **No memory loss** — detailed context in 6 sharded files, only references in SOUL.md
- **Patch-cascade safe** — release workflow documented in `note4.md` so future releases are consistent

### Slash-Prefix Command System

On **iMessage and WhatsApp**, messages starting with `/` are now treated as commands:

```
You  > /hello how are you
AI   Hello! 🙌 How's it going?

You  > /tell me a joke
AI   Sure! A computer joke...
```

Normal messages are **skipped** (loop prevention). This means:
- ✅ Bot won't reply to its own messages
- ✅ No echo loops
- ✅ Only `/`-prefixed messages go to AI

### Dangerous Command Approval

Smart approval system. **Only risky operations** require confirmation:

```bash
# Auto-approved (safe)
natureco memory write "favorite color is red"
✓ Memory added

# Confirmation required (risky)
natureco rm -rf node_modules
🔴 HIGH RISK: File deletion command
Continue? (Y/n)
```

**Risk detection:**
- `rm -rf`, `sudo`, `dd if=` → 🔴 HIGH
- `chmod 777`, `mv` → 🟡 MEDIUM
- `mv .env` → 🔴 (sensitive file)

### v5.6.0 — v5.6.43 Changelog

| Version | Feature |
|---------|---------|
| **v5.6.0** | Postinstall + API key validation + reset command |
| **v5.6.1** | Groq tool filter (9 essential tools) |
| **v5.6.3** | Provider tier wizard |
| **v5.6.4** | Full model catalog (12 providers, 200+ models) |
| **v5.6.5** | Token limit fix + SOUL injection optimization |
| **v5.6.6** | Inline tool filter (BLOCKED_TOOL_NAMES) |
| **v5.6.7** | Memory auto-create in setup |
| **v5.6.8** | Dynamic hard-coded prefix (botName) |
| **v5.6.21** | Smart approval system + tool result path anonymization |
| **v5.6.22** | 8 bug fixes (read_file priority, ~expansion, memory search, grep fix, git auto-find, etc.) |
| **v5.6.27** | imsg send `--to` flag fix |
| **v5.6.31** | `imsg watch --json` streaming |
| **v5.6.39** | iMessage is_from_me filter |
| **v5.6.40** | Echo loop prevention (30s) |
| **v5.6.41-42** | Slash-prefix system (iMessage/WhatsApp) |
| **v5.6.43** | WhatsApp slash + cron endpoint fix |
| **v5.6.46** | README overhaul (hero slogan, ASCII banner, badges) |
| **v5.6.47** | **SOUL SHARDED** — Sharded memory system (`soul/notes/{INDEX,note1-5}.md`) |

---

## ✨ Features

### 🤖 AI & Chat
- **57 Tools** — file ops, web search, image generation, code execution, memory
- **Interactive REPL** — read_file, edit_file, bash, multi-turn
- **Slash Commands** — `/memory`, `/help`, `/skills`, `/clear`
- **Agentic Mode** (`--agent`) — autonomous task completion
- **Persistent Memory** — fact-based, cross-session

### 💻 Code Agent (Claude Code Alternative)
- **Read/Write/Edit** multi-file operations
- **Bash execution** — sandboxed shell
- **Streaming syntax highlighting** — real-time
- **Slash commands** — `/summary`, `/done`
- **Approval prompt** — write/delete confirmation

### 📡 10 Messaging Platforms

| Platform | Command | Status |
|----------|---------|--------|
| **Telegram** | `natureco telegram connect` | ✅ |
| **WhatsApp** | `natureco whatsapp connect` | ✅ (Baileys) |
| **iMessage** | `natureco imessage connect` | ✅ (imsg CLI) |
| **Discord** | `natureco discord connect` | Token required |
| **Slack** | `natureco slack connect` | Token required |
| **Mattermost** | `natureco mattermost connect` | URL required |
| **IRC** | `natureco irc connect` | Server required |
| **Signal** | `natureco signal connect` | signal-cli |
| **SMS** | `natureco sms connect` | Twilio |
| **Webhooks** | `natureco webhooks list` | ✅ |

**Gateway:** `natureco gateway start` — manages all channels in one process.

### 🌿 NatureCo Native
- **NatureHub** sharing (social feed)
- **Medium** article draft/publish
- **SEO** analysis (0-100 score)
- **XP & Level** system (gamification)

### 🛡️ Security & Monitoring
- **Dangerous Command Approval** — risk detection
- **Audit logs** — all operations logged
- **Cost tracking** — AI cost monitoring (today/week/month/budget)
- **Security audit** — sensitive file scanning
- **Path anonymization** — `~/` masking in tool output

### ⚙️ Automation & Scheduling
- **Cron jobs** — `natureco cron add`
- **Hooks** — event-driven automation
- **Webhooks** — HTTP callbacks
- **Tasks (Kanban)** — `natureco tasks`

---

## 📋 Commands (A-Z, 120+ Commands)

### 🤖 AI & Chat

| Command | Description |
|---------|-------------|
| `natureco chat` | Interactive REPL chat (57 tools active) |
| `natureco chat --resume` | Resume last session |
| `natureco code` | Code agent (write apps/scripts) |
| `natureco code <file>` | Code agent on specific file |
| `natureco run <script>` | Run markdown script |
| `natureco ask "<question>"` | One-shot question to AI |
| `natureco bots` | List available bots |
| `natureco models` | Manage provider models |
| `natureco ultrareview <file>` | Deep code review |

**REPL slash commands:**
```
/clear      Clear screen
/bot        Switch bot
/skills     Show active skills
/memory     Show memory
/memory clear  Clear memory
/commands   List all commands
/help       Help
exit / quit Exit
```

### ⚙️ Setup & Config

```bash
natureco setup         # First-time setup wizard
natureco login         # API key login
natureco logout        # Logout
natureco init          # Init project (create SOUL.md)
natureco doctor        # System health check
natureco doctor --fix  # Auto-fix issues
natureco config list   # Show configuration
natureco config set <key> <value>
natureco configure     # Interactive config
natureco update        # Update CLI
natureco completion bash|powershell
```

### 📡 Channels (10 Messaging Platforms)

```bash
# All channels
natureco channels              # List connected channels
natureco channels add <type>   # Add new channel
natureco channels remove <type>

# Telegram
natureco telegram connect     # Save token
natureco telegram chatid       # Auto-detect chat ID
natureco telegram allow <id>   # Allow chat
natureco telegram status

# WhatsApp (Baileys)
natureco whatsapp connect
natureco whatsapp status

# iMessage (imsg CLI)
natureco imessage connect
natureco imessage status
natureco imessage allow <number>
natureco imessage send <number> <message>

# Discord, Slack, Mattermost, IRC, Signal, SMS, Webhooks
natureco discord connect
natureco slack connect
natureco mattermost connect
natureco irc connect
natureco signal connect
natureco sms connect
natureco webhooks list

# Gateway — start all channels
natureco gateway start
natureco gateway stop
natureco gateway status
```

### 🧠 Memory & Sessions

```bash
natureco memory write "favorite color is red"
natureco memory write "user_name=patron"
natureco memory search "color"
natureco memory status
natureco memory list
natureco memory clear
natureco memory export
natureco memory import <file>

natureco sessions list        # All sessions
natureco sessions show <id>   # Session details
```

### 🔌 Skills, MCP, Plugins

```bash
natureco skills list         # Active skills
natureco skills install <name>
natureco skills remove <name>

natureco mcp list             # MCP servers
natureco mcp add <name> <url>

natureco plugins list
natureco plugins install <name>
```

### ⏰ Automation

```bash
natureco cron add            # Scheduled task
natureco cron list
natureco cron remove <id>

natureco hooks list          # Event hooks
natureco hooks create

natureco tasks list          # Kanban (Todo)
natureco tasks add
natureco tasks done <id>

natureco webhooks list        # Webhook URLs
natureco webhooks add <url>

natureco dashboard            # Web dashboard (port 7421)
```

### 🔍 Developer Tools

```bash
natureco git status          # Git status
natureco git diff            # Diff
natureco git log             # Commit log
natureco git branches        # Branch list

natureco audit today         # Today's operations
natureco audit stats         # Statistics
natureco audit files         # File changes

natureco cost today          # Today's AI cost
natureco cost week
natureco cost month
natureco cost budget 50      # $50 limit

natureco security audit      # Sensitive file scan

natureco logs                # Log files
```

### 🌿 NatureCo Native

```bash
natureco naturehub post <text>      # NatureHub post
natureco naturehub feed             # View feed

natureco seo audit natureco.me     # SEO analysis (score)

natureco medium draft              # Medium article draft
natureco medium publish <file>     # Publish

natureco xp rewards                # XP & level
natureco xp leaderboard
```

### 🛡️ Administration

```bash
natureco reset --scope config      # Reset
natureco reset --scope memory
natureco reset --scope sessions
natureco reset --scope all --yes

natureco uninstall

natureco approvals                 # Approval management
natureco approvals allow <cmd>
```

---

## 🌐 Provider Support (12 Providers, 200+ Models)

| Provider | Models | API Key |
|----------|--------|---------|
| **OpenAI** | GPT-5, GPT-4.1, o3, GPT-4o | OpenAI |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku | Anthropic |
| **Gemini** | 2.5 Pro, 2.0 Flash, Gemma | Google |
| **Groq** | Llama 3.3, Mixtral | Groq |
| **DeepSeek** | R1, Chat V3 | DeepSeek |
| **Ollama** | Llama, Qwen (local) | - |
| **MiniMax** | M2.5, M2 | MiniMax |
| **OpenRouter** | 15+ models (multi-provider) | OpenRouter |
| **Mistral** | Large, Small, Codestral | Mistral |
| **Cohere** | Command R+, Embed | Cohere |
| **xAI** | Grok 2, Grok Beta | xAI |
| **Together** | Llama, Mixtral, Qwen | Together |

```bash
# Provider selection in wizard
natureco setup
# Wizard: Provider → API Key → Model → Bot name

# List models
natureco models list --provider openai
natureco models list --provider anthropic
```

---

## 🔄 vs Other CLIs

| Feature | NatureCo | Claude Code | Hermes | OpenClaw |
|---------|----------|-------------|--------|----------|
| Multi-provider | ✅ 12 | ❌ Anthropic | ✅ 8 | ❌ |
| 200+ models | ✅ | ❌ | ✅ | ❌ |
| Slash-prefix | ✅ v5.6 | ❌ | ❌ | ❌ |
| Dangerous Command Approval | ✅ v5.6 | ❌ | ✅ | ❌ |
| Multi-channel (10 platforms) | ✅ | ❌ | ✅ (Python) | ❌ |
| Persistent memory | ✅ | ✅ | ✅ | ❌ |
| Tool result anonymization | ✅ v5.6 | ❌ | ❌ | ❌ |
| XP/Gamification | ✅ | ❌ | ❌ | ❌ |
| SEO/Medium/NatureHub native | ✅ | ❌ | ❌ | ❌ |
| MIT licensed | ✅ | ✅ | ❌ | ❌ |
| npm package | ✅ v5.6 | ❌ | ❌ | ❌ |
| 57 tools | ✅ | ✅ ~30 | ✅ ~25 | ✅ ~40 |
| Cron + Hooks + Webhooks | ✅ | ❌ | ✅ | ❌ |

---

## 🛠️ System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Node.js** | 18.x | 20.x (LTS) |
| **RAM** | 256 MB | 512 MB |
| **Disk** | 100 MB | 500 MB (with cache) |
| **OS** | macOS 12, Win 10, Ubuntu 20 | macOS 14+, Win 11, Ubuntu 22 |
| **Internet** | Required | - |

**Dependencies:** only 18 npm packages. Lightweight.

---

## 🚀 Real Examples

### 1. Simple Chat
```
$ natureco chat
Provider: api.minimax.io
Model: MiniMax-M2.5
Bot: naruto

👋 Hello! I'm naruto, your AI assistant.

You  > who are you?
AI   I'm naruto, NatureCo CLI's Turkish AI assistant. 57 tools active,
     memory preserved, channels ready.

You  > tell me a joke
AI   Sure! A computer joke: ...
```

### 2. Telegram Bot Connection
```
$ natureco telegram connect
? Telegram bot token: *** (from BotFather)
✓ Token already saved: 889****729:AAGJ9PX4j...
Bot ID: telegram_1782204289029

$ natureco telegram chatid
⏳ Bot running, waiting for first message...
[Send /start on Telegram]
✓ Chat ID detected: 6139455189

$ natureco gateway start
[gateway] Gateway running (PID 77765)
[telegram] watching for inbound
[telegram] Inbound from +90****44: "hello"
[telegram] Sending to AI provider...
[telegram] Reply sent (117 chars)
```

### 3. iMessage Slash Command
```
$ natureco imessage connect
? imsg CLI path: /opt/homebrew/bin/imsg
✓ Connection established

$ natureco imessage allow +90****4449
✓ Allowed: +90****4449

$ natureco gateway start
[imessage] watching for new messages (streaming)

[Send /who are you on iMessage]
[imessage] Inbound from +90****4449: "/who are you"
[imessage] Slash command: /who are you
[imessage] Reply sent (178 chars)
```

### 4. Code Agent — Simple App
```
$ natureco code
NatureCo Code Agent v5

You  > create notes.py, with add/list/delete, save to JSON file

Tool: write_file (2303 bytes)
Tool: bash (python3 notes.py)
✅ Note added: Shopping
✅ Note added: Meeting
✅ Note added: Book
✅ Total: 3 notes
✅ Delete success: ID 2

📂 /Users/gencay/Downloads/notes.py (2303 bytes)
```

---

## 🔌 Integrations

### Webhook
```bash
# HTTP callback URLs
natureco webhooks add https://example.com/hook

# incoming webhook (POST)
POST /webhook/<id>
Content-Type: application/json
{"event": "...", "data": {...}}
```

### Cron (Scheduled Task)
```bash
# Every 5 minutes
natureco cron add \
  --name "hello-task" \
  --schedule "*/5 * * * *" \
  --command "echo 'Hello!'"

# One-time
natureco cron add --at "2026-12-31T23:59"
```

### MCP (Model Context Protocol)
```bash
natureco mcp add filesystem npx -y @modelcontextprotocol/server-filesystem
natureco mcp add github npx -y @modelcontextprotocol/server-github
```

---

## 📚 Documentation

- 🌐 **Homepage:** [natureco.me/cli](https://natureco.me/cli)
- 📖 **Command reference:** [natureco.me/cli/commands](https://natureco.me/cli/commands)
- 🎓 **Tutorial:** [natureco.me/cli/getting-started](https://natureco.me/cli/getting-started)
- 🔧 **API:** [natureco.me/cli/api](https://natureco.me/cli/api)
- 💬 **Discord community:** [discord.gg/4FwumbWph](https://discord.gg/4FwumbWph)
- 🐦 **Twitter/X:** [@naturecoofficial](https://twitter.com/naturecoofficial)

---

## 🤝 Contributing

PRs and issues are welcome!

```bash
# Clone the repo
git clone https://github.com/natureco-official/natureco-cli.git
cd cli

# Install
npm install

# Test
npm test

# Lint
npm run lint

# Build
npm run build
```

**Contributors:** [CONTRIBUTORS.md](https://github.com/natureco-official/natureco-cli/blob/main/CONTRIBUTORS.md)

---

## 📄 License

MIT © [NatureCo](https://github.com/natureco-official)

---

## 🙏 Acknowledgments

- [OpenAI](https://openai.com) — GPT API
- [Anthropic](https://anthropic.com) — Claude API
- [MiniMax](https://api.minimax.io) — AI provider
- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web
- [imsg](https://github.com/steipete/imsg) — iMessage CLI
- [ripgrep](https://github.com/BurntSushi/ripgrep) — fast search

---

<p align="center">
  <b>The Power of AI, now at your fingertips.</b><br>
  <i>Explore the Speed of Terminal with NatureCo.</i>
</p>

<p align="center">
  Made with 🌿 in Turkey
</p>