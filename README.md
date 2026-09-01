# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen)]()
[![Downloads](https://img.shields.io/npm/dm/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![Stars](https://img.shields.io/github/stars/natureco-official/natureco-cli)](https://github.com/natureco-official/natureco-cli)

> **The power of AI, now at your fingertips.**
> *Discover the speed of the terminal with NatureCo.*

Most AI coding CLIs lock you into one vendor's model and stop at your editor. **NatureCo doesn't.** One agent, **18 providers** to choose from, that writes and ships your code, remembers what matters across sessions, and — uniquely — runs your **Telegram, Discord, Slack, WhatsApp, and iMessage bots** from the same install. Swap providers without losing memory. Automate without duct tape. Never send another risky `rm -rf` without a confirmation prompt.

**A Claude Code & OpenClaw alternative, built to not box you in:** Multi-agent orchestration · Cross-session memory backed by a real git-native memory engine ([Urðr](https://github.com/natureco-official/urdr)) · Token-budgeted context · Dangerous-command approval on every shell path · 18 providers with live model discovery · 91 tools · 103 commands · 14 channels (9 stable messaging + 4 experimental + webhooks).

**Why teams pick it over the alternatives:**
- 🔓 **No vendor lock-in** — switch between OpenAI, Anthropic, Gemini, MiniMax, or 8 more providers with one command; your memory and workflows carry over.
- 🧠 **Memory that's actually durable** — backed by a git-native, hash-chained architecture, not a JSON blob that silently corrupts.
- 💬 **It lives where your team already talks** — the same agent answers in your terminal, your Telegram bot, and your Slack workspace.
- 🛡️ **Guardrails by default** — every shell command is risk-scored before it runs; nothing destructive executes without your say-so.
- 🌍 **Genuinely cross-platform** — audited and live-tested on macOS, Windows, and Linux, not just "should work."

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

# 2. First-run setup wizard (provider, model, bot name)
natureco setup

# 3. Start chatting
natureco chat

# 4. Or launch the coding agent
natureco code
```

**Ready in 30 seconds.** On first launch, the wizard walks you through it: pick a provider → enter your API key → choose a model → name your bot. That's it.

> **Cross-platform:** works natively on **macOS, Windows, and Linux**. Core tools (file, search, shell, git, code execution, web, memory) are OS-agnostic; platform-specific helpers degrade gracefully.

---

## 🆕 What's New

| Version | Highlights |
|---------|-----------|
| **v6.2.0** | **Chat and code on your ChatGPT subscription.** If you already pay for ChatGPT Plus/Pro, `natureco chat` and `natureco code` can run on it — no API key, no per-token bill. Usage is reported from the provider's own count rather than an estimate. Claude subscriptions are detected too (chat wiring is ChatGPT-only for now). Requests go through OpenAI's own `codex` client: your token is never touched and no client is impersonated. |
| **v6.1.0** | **Reasoning models, context accuracy, self-improvement core.** Support for `reasoning_content` and `max_completion_tokens` (without which the o-series and gpt-5 family returned 400 on every request); token estimation corrected for non-Latin text, where the flat `chars/4` rule undercounted by up to 3×; and a skill-distillation loop that will not learn away its own guardrails. |
| **v6.0.1** | **Protections that were silently inert.** Approval policy now fails closed instead of falling back to full access when its file is corrupt; permission rules match tool aliases so a `read(...)` rule actually covers `read_file`. |
| **v6.0.0** | **Security and release hardening.** Zero known npm audit findings, Node 22.13+ support, lazy command loading, side-effect-free help, multi-version CI, stronger coverage/lint gates, pinned skill sources with SHA-256 provenance, and a CycloneDX runtime SBOM. |
| **v5.71.9** | **Native mouse behavior is restored on the main Code screen.** Wheel scrollback, text selection and right-click stay owned by the terminal; Natureco enables mouse tracking only inside the `Ctrl+O` tool transcript and releases it again on close. |
| **v5.71.8** | **Interactive slash-command palette in Natureco Code.** Type `/` to see commands, keep typing to filter, navigate with Up/Down, and select with Enter or Tab; commands requiring arguments remain editable. |
| **v5.71.7** | **Mouse-wheel scrolling now works in Natureco Code.** Using the wheel from the normal view opens the fully expanded tool transcript and scrolls immediately; wheel, arrow and page-key navigation work alongside clickable expand/collapse cards. |
| **v5.71.6** | **Switch models inside Code with `/model`.** Natureco scans the active provider's live model catalog, offers numbered selection, persists the choice, and falls back to one shared current catalog also used by setup, `models`, `infer`, and `capability`. Provider presets now include current GPT-5.6, Claude 5, Gemini 3.x, MiniMax M2.7, Grok 4.5 and other current families. |
| **v5.71.5** | **Complete edit diffs and direct card clicks.** File-edit cards now show the complete bounded red/green patch in normal output instead of hiding the actual change behind `(+N lines)`. While the prompt is waiting, clicking a tool card or its `(+N lines)` footer opens the full transcript directly; compact non-edit cards explicitly advertise `Ctrl+O`. |

See [`CHANGELOG.md`](CHANGELOG.md) for the full release history.

### Slash-Prefix Command System

On **iMessage and WhatsApp**, only messages starting with `/` are processed as commands:

```
You  > /hello how are you?
AI   Hey! 🙌 Doing great — how about you?

You  > /tell me a joke
AI   Sure! A classic programmer joke...
```

Regular messages are **skipped** (loop prevention), so:
- ✅ The bot never replies to its own messages
- ✅ No echo loops
- ✅ Only `/`-prefixed messages reach the AI

### Dangerous-Command Approval

A smart approval system that prompts **only for risky operations**:

```bash
# Auto-approved (safe)
natureco memory write "favorite color is red"
✓ Memory added

# Approval required (risky)
rm -rf node_modules
🔴 HIGH RISK: file-deletion command
Continue? (Y/n)
```

**Risk detection:**
- `rm -rf`, `sudo`, `dd if=` → 🔴 HIGH
- `chmod 777`, `mv` → 🟡 MEDIUM
- `mv .env` → 🔴 (sensitive file)

Two-tier policy (`deny` / `allowlist` / `full`) applies to **every** shell path — no tool bypasses it.

---

## ✨ Features

### 🤖 AI & Chat
- **91 tools** — file ops, web search, image generation, code execution, memory, automation, channels, and more
- **Interactive REPL** — read_file, edit_file, bash, multi-turn conversation
- **Slash commands** — `/memory`, `/help`, `/skills`, `/model`, `/clear`
- **Streaming output** with live tool-call visibility and a thinking indicator
- **Persistent memory** — fact-based, cross-session
- **Token-budgeted context** — recent relevant turns are retained without repeatedly sending oversized code and tool output

### 💻 Coding Agent (Claude Code alternative)
- **Read / Write / Edit** multi-file operations
- **Sandboxed shell execution** with the approval flow
- **Multi-agent orchestration** — spawn focused sub-agents and plan before acting
- **Skills** — progressive-disclosure expertise loaded on demand via `skill_view`
- **Verify loop** — the agent runs and tests the code it writes
- **Reliable follow-ups** — references such as “the game you just created” retain the current coding-session context
- **Context profiles** — Efficient (1,024), Balanced (2,048), and Quality (8,192) workflow-history token budgets

### ⚡ Token Economy

NatureCo uses progressive disclosure and bounded context instead of sending every skill, tool result, and old response on every request:

- Skills are discovered with `skill_find` and loaded only when needed with `skill_view`.
- System, internal tool, and empty messages are excluded from workflow history.
- Recent user/assistant turns are kept within the selected token profile.
- Oversized generated code is truncated in later prompts while the file path and conversational intent remain available.
- `natureco ask` stays tool-free by default; use `--tools` only when an action is required.

For a 32,000-character previous response, the Balanced profile bounds repeated history to about 2,048 tokens instead of roughly 8,000—a reduction of approximately 74% for that repeated context.

### 👁️ Verified GUI Automation

MiniMax Token Plan users need no extra key: NatureCo automatically sends screenshots to MiniMax VLM while keeping the M-series model for chat. A separate OpenAI-compatible vision provider remains an optional override:

```bash
natureco config set guiVisionProviderUrl https://api.openai.com/v1
natureco config set guiVisionApiKey "$OPENAI_API_KEY"
natureco config set guiVisionModel gpt-4.1-mini
```

NatureCo reports GUI success only after a state-changing action, a changed screen, and a separate visual verification with explicit evidence. Purchasing, booking, sending, or other consequential actions should still be reviewed at the final confirmation step.

### 📡 14 Channels — 9 stable · 4 experimental · webhooks

| Platform | Connect | Notes |
|----------|---------|-------|
| **Telegram** | `natureco telegram connect` | ✅ |
| **WhatsApp** | `natureco whatsapp connect` | ✅ (Baileys) |
| **iMessage** | `natureco imessage connect` | ✅ (imsg CLI) |
| **Discord** | `natureco discord connect` | Token |
| **Slack** | `natureco slack connect` | Token |
| **Mattermost** | `natureco mattermost connect` | URL |
| **IRC** | `natureco irc connect` | Server |
| **Signal** | `natureco signal connect` | signal-cli |
| **SMS** | `natureco sms connect` | Twilio |
| **Matrix** | `natureco matrix connect` | ⚠️ Experimental |
| **Teams** | `natureco teams connect` | ⚠️ Experimental |
| **Google Chat** | `natureco googlechat connect` | ⚠️ Experimental |
| **Zalo** | `natureco zalo connect` | ⚠️ Experimental |
| **Webhooks** | `natureco webhooks list` | ✅ |

**Gateway:** `natureco gateway start` — run all channels in a single process. Per-channel sender allow-lists keep unauthorized users out, and personal memory is never leaked to them.

### 🌿 NatureCo Native
- **NatureHub** sharing (social feed)
- **Medium** article drafting/publishing
- **SEO** analysis (score 0–100)
- **XP & levels** (gamification)

### 🛡️ Security & Observability
- **Dangerous-command approval** — risk detection on every shell path
- **Command-injection safe** — structured process spawning (`execFileSync`), no shell string interpolation
- **Local-only admin RPC** — bound to `127.0.0.1`, mandatory bearer token, secrets masked by default
- **Secure at rest** — config, backups, and session files stored `0600`/`0700`
- **Audit logs** — every operation recorded
- **Cost tracking** — AI spend by today/week/month/budget
- **Security audit** — `natureco security audit`

### ⚙️ Automation & Scheduling
- **Cron jobs** — `natureco cron add` (app-managed by default; system crontab is opt-in and approval-gated)
- **Hooks** — event-driven automation
- **Webhooks** — HTTP callbacks
- **Tasks (Kanban)** — `natureco tasks`

---

## 📋 Commands (A–Z, 103 commands)

### 🤖 AI & Chat

| Command | Description |
|---------|-------------|
| `natureco chat` | Interactive REPL chat (91 tools available) |
| `natureco chat --resume` | Resume the previous session |
| `natureco code` | Coding agent (write apps/scripts) |
| `natureco code <file>` | Coding agent on a specific file |
| `natureco run <script>` | Run a Markdown workflow script |
| `natureco ask "<question>"` | One-shot question to the AI |
| `natureco bots` | List available bots |
| `natureco models` | Manage provider models |
| `natureco ultrareview <file>` | Deep code review |
| `natureco abonelik durum` | Which subscriptions are usable on this machine |
| `natureco abonelik kullan` | Run chat/code on your subscription instead of an API key |
| `natureco abonelik birak` | Switch back to your previous provider |
| `natureco abonelik modeller` | Models available on the subscription |
| `natureco abonelik kota` | Subscription quota and reset time |

`natureco code` uses its chat-style input box in VT-capable terminals (Windows Terminal,
Cupertino Terminal, and VS Code included). Set `NATURECO_PLAIN_INPUT=1` to use the
classic readline prompt on older or incompatible terminals. `NO_COLOR` keeps the box
but removes its colors.

**In-REPL slash commands:**
```
/clear         Clear the screen
/bot           Switch bot
/skills        Show active skills
/memory        Memory status
/memory clear  Clear memory
/commands      List all commands
/help          Help
exit / quit    Exit
```

### ⚙️ Setup & Config

```bash
natureco setup         # First-run setup wizard
natureco login         # Enter API key
natureco logout        # Log out
natureco init          # Initialize a project (create SOUL.md)
natureco doctor        # System health check
natureco doctor --fix  # Auto-fix
natureco config list   # Show configuration
natureco config set <key> <value>
natureco configure     # Interactive config
natureco update        # Update the CLI
natureco completion bash|powershell
```

### 📡 Channels (14: 9 stable, 4 experimental, webhooks)

```bash
# All channels
natureco channels              # List connected channels
natureco channels add <type>   # Add a channel
natureco channels remove <type>

# Telegram
natureco telegram connect      # Save token
natureco telegram chatid       # Auto-detect chat ID
natureco telegram allow <id>   # Allow a chat
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

natureco sessions list         # All sessions
natureco sessions show <id>    # Session details
```

### 🔌 Skills, MCP, Plugins

```bash
natureco skills list           # Active skills
natureco skills install <name>
natureco skills remove <name>

natureco mcp list              # MCP servers
natureco mcp add <name> <url>

natureco plugins list
natureco plugins install <name>
```

### ⏰ Automation

```bash
natureco cron add              # Scheduled task
natureco cron list
natureco cron remove --name <name>

natureco hooks list            # Event hooks
natureco hooks create

natureco tasks list            # Kanban (todo)
natureco tasks add
natureco tasks done <id>

natureco webhooks list         # Webhook URLs
natureco webhooks add <url>

natureco dashboard             # Web dashboard (localhost)
```

### 🔍 Developer Tools

```bash
natureco git status            # Git status
natureco git diff              # Diff
natureco git log               # Commit log
natureco git branches          # Branch list

natureco audit today           # Today's operations
natureco audit stats           # Statistics
natureco audit files           # File changes

natureco cost today            # Today's AI cost
natureco cost week
natureco cost month
natureco cost budget 50        # $50 limit

natureco security audit        # Sensitive-file / config scan

natureco logs                  # Log files
```

### 🌿 NatureCo Native

```bash
natureco naturehub post <text> # Share to NatureHub
natureco naturehub feed        # View the feed

natureco seo audit natureco.me # SEO analysis (score)

natureco medium draft          # Medium article draft
natureco medium publish <file> # Publish

natureco xp rewards            # XP & levels
natureco xp leaderboard
```

### 🛡️ Management

```bash
natureco reset --scope config  # Reset
natureco reset --scope memory
natureco reset --scope sessions
natureco reset --scope all --yes

natureco uninstall

natureco approvals             # Approval management
natureco approvals allow <cmd>

natureco admin-rpc start       # Local admin RPC (127.0.0.1, bearer-token auth)
```

---

## 🌐 Provider Support (18 providers, live model discovery)

| Provider | Models | API Key |
|----------|--------|---------|
| **OpenAI** | GPT-5.6 Sol, Terra, Luna | OpenAI |
| **Anthropic** | Claude Fable 5, Opus 5, Sonnet 5, Haiku 4.5 | Anthropic |
| **Gemini** | Gemini 3.6 Flash, 3.5 Flash/Lite, 3.1 | Google |
| **Groq** | GPT-OSS, Qwen 3.6, Compound | Groq |
| **DeepSeek** | Chat, Reasoner | DeepSeek |
| **Ollama** | Installed local models (live) | — |
| **MiniMax** | M2.7, M2.5, M2.1, M2 | MiniMax |
| **OpenRouter** | 400+ models (live) | OpenRouter |
| **Mistral** | Medium 3.5, Small 4, Codestral | Mistral |
| **Cohere** | Command A, Command R | Cohere |
| **xAI** | Grok 4.5 | xAI |
| **Together** | MiniMax M3, Qwen 3.7, Kimi K3, DeepSeek V4 | Together |
| **Perplexity** | Sonar, Reasoning, Deep Research | Perplexity |
| **DeepInfra** | Qwen Coder, GPT-OSS, DeepSeek, GLM | DeepInfra |
| **Fireworks** | GPT-OSS serverless models | Fireworks |
| **NatureCo** | Default, Fast, Reasoner routing | NatureCo |
| **Moonshot/Kimi** | Kimi K3, K2.5, K2 Thinking + live catalog | Moonshot AI |
| **Z.ai/GLM** | GLM 5.1, 5 Turbo, 4.7 + live catalog | Z.ai |

```bash
# Provider selection lives in the wizard
natureco setup
# Wizard: Provider → API Key → Model → Bot name

# List models
natureco models list --provider openai
natureco models list --provider anthropic

# Inside `natureco code`: list/select or switch directly
/model
/model MiniMax-M2.7
```

> The agent adapts to each provider's native tool-calling style automatically (OpenAI-style `tool_calls` JSON or agentic-text XML), so the same tools and memory work everywhere.

---

## 🔄 vs. Other CLIs

| Feature | NatureCo | Claude Code | Hermes | OpenClaw |
|---------|----------|-------------|--------|----------|
| Multi-provider | ✅ 18 | ❌ Anthropic | ✅ 8 | ❌ |
| Model catalogue | ✅ live + fallback | ❌ | ✅ | ❌ |
| Multi-agent orchestration | ✅ | ✅ | ⚠️ | ⚠️ |
| Dangerous-command approval | ✅ | ✅ | ✅ | ⚠️ |
| Multi-channel | ✅ 14 (9 stable) | ❌ | ✅ (Python) | ❌ |
| Persistent memory | ✅ Git-native (Urðr) | ✅ | ✅ | ❌ |
| Tool-output path anonymization | ✅ | ❌ | ❌ | ❌ |
| XP / gamification | ✅ | ❌ | ❌ | ❌ |
| SEO / Medium / NatureHub native | ✅ | ❌ | ❌ | ❌ |
| Cross-platform (macOS/Win/Linux) | ✅ Audited + CI-verified | ✅ | ⚠️ | ⚠️ |
| MIT licensed | ✅ | ✅ | ❌ | ❌ |
| npm package | ✅ | ❌ | ❌ | ❌ |
| Built-in tools | ✅ 91 | ✅ ~30 | ✅ ~25 | ✅ ~40 |
| Cron + Hooks + Webhooks | ✅ | ❌ | ✅ | ❌ |

---

## 🛠️ System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **Node.js** | 22.13 | 22.x or 24.x |
| **RAM** | 256 MB | 512 MB |
| **Disk** | 100 MB | 500 MB (with cache) |
| **OS** | macOS 12, Win 10, Ubuntu 20 | macOS 14+, Win 11, Ubuntu 22 |
| **Internet** | Required | — |

**Optional** for richer functionality: `ripgrep` (faster search — falls back to a pure-Node scanner), `python3` (for `code_execution`), `git`.

---

## 🚀 Real Examples

### 1. Simple chat
```
$ natureco chat
Provider: api.minimax.io
Model: MiniMax-M2.5
Bot: naruto

👋 Hi! I'm naruto, boss.

You  > who are you?
AI   I'm naruto, your NatureCo CLI assistant. 91 tools active,
     memory persisted, channels ready.

You  > create racing-game.html on my Desktop with a small canvas racing game
AI   🔧 write_file ✓
     Done — racing-game.html created on your Desktop.
```

### 2. Connect a Telegram bot
```
$ natureco telegram connect
? Telegram bot token: *** (from BotFather)
✓ Token saved
Bot ID: telegram_1782204289029

$ natureco telegram chatid
⏳ Bot running, waiting for the first message...
[send /start from Telegram]
✓ Chat ID detected: 6139455189

$ natureco gateway start
[gateway] Gateway running (PID 77765)
[telegram] watching for inbound
[telegram] Inbound from +90****44: "hello"
[telegram] Reply sent (117 chars)
```

### 3. iMessage slash command
```
$ natureco imessage connect
? imsg CLI path: /opt/homebrew/bin/imsg
✓ Connected

$ natureco imessage allow +90****4449
✓ Allowed: +90****4449

$ natureco gateway start
[imessage] watching for new messages (streaming)
[imessage] Inbound from +90****4449: "/who are you"
[imessage] Slash command: /who are you
[imessage] Reply sent (178 chars)
```

### 4. Coding agent — a small app
```
$ natureco code
NatureCo Code Agent v5

You  > create notes.py — add/list/delete notes, stored as JSON

Tool: write_file (2303 bytes)
Tool: bash (python3 notes.py)
✅ Note added: Groceries
✅ Note added: Meeting
✅ Total: 3 notes
✅ Deleted: ID 2

📂 notes.py (2303 bytes)
```

---

## 🔌 Integrations

### Webhook
```bash
# HTTP callback URLs
natureco webhooks add https://example.com/hook

# Incoming webhook (POST)
POST /webhook/<id>
Content-Type: application/json
{"event": "...", "data": {...}}
```

### Cron (scheduled tasks)
```bash
# Every 5 minutes
natureco cron add \
  --name "hello-task" \
  --schedule "*/5 * * * *" \
  --command "echo 'Hello!'"

# One-off
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
- 🔒 **Security:** [`SECURITY.md`](SECURITY.md) · [`SBOM.cdx.json`](SBOM.cdx.json) · [`SKILL_PROVENANCE.json`](SKILL_PROVENANCE.json)
- 📝 **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)

---

## 🤝 Contributing

PRs and issues are welcome!

```bash
# Clone the repo
git clone https://github.com/natureco-official/natureco-cli.git
cd natureco-cli

# Install
npm install

# Test (vitest)
npm test

# Lint
npm run lint

# Smoke check
npm run smoke
```

---

## 📄 License

MIT © [NatureCo](https://github.com/natureco-official)

---

## 🙏 Acknowledgements

- [OpenAI](https://openai.com) — GPT API
- [Anthropic](https://anthropic.com) — Claude API
- [MiniMax](https://api.minimax.io) — AI provider
- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web
- [imsg](https://github.com/steipete/imsg) — iMessage CLI
- [ripgrep](https://github.com/BurntSushi/ripgrep) — fast search

---

<p align="center">
  <b>The power of AI, now at your fingertips.</b><br>
  <i>Discover the speed of the terminal with NatureCo.</i>
</p>

<p align="center">
  Made with 🌿 for developers who live in the terminal.
</p>

---

---

## More from NatureCo

- [**Cupertino Terminal**](https://github.com/natureco-official/cupertino-terminal) — A macOS-grade terminal for Windows, macOS and Linux — Rust core, no Electron, with a built-in end-to-end encrypted P2P remote shell
- [**Urðr**](https://github.com/natureco-official/urdr) — Tree-structured memory for AI coding agents — plain Markdown you can `git diff`, no vector database
- [**CodeDNA**](https://github.com/natureco-official/codedna) — How much of a commit was written by AI, and does its author actually understand it?
- [**NatureCo SDK**](https://github.com/natureco-official/natureco-sdk) — JavaScript SDK for the NatureCo API — build AI chatbots and ship them anywhere
- [**Skuld**](https://github.com/natureco-official/natureco-skuld) — An agentic coding workspace that will not claim success it cannot prove — every change goes through a verification gate before it is reported as done
- [**Verðandi**](https://github.com/natureco-official/verdandi) — Task-context compiler for AI coding agents — indexes with the TypeScript AST so the agent stops burning tokens hunting for the right file

<sub>Part of the **NatureCo** ecosystem — [natureco.me](https://natureco.me) · NatureCo ekosisteminin parçası</sub>
