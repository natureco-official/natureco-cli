# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)]()
[![Downloads](https://img.shields.io/npm/dm/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![Stars](https://img.shields.io/github/stars/natureco-official/natureco-cli)](https://github.com/natureco-official/natureco-cli)

> **The power of AI, now at your fingertips.**
> *Discover the speed of the terminal with NatureCo.*

Most AI coding CLIs lock you into one vendor's model and stop at your editor. **NatureCo doesn't.** One agent, **12 providers** to choose from, that writes and ships your code, remembers what matters across sessions, and — uniquely — runs your **Telegram, Discord, Slack, WhatsApp, and iMessage bots** from the same install. Swap providers without losing memory. Automate without duct tape. Never send another risky `rm -rf` without a confirmation prompt.

**A Claude Code & OpenClaw alternative, built to not box you in:** Multi-agent orchestration · Cross-session memory backed by a real git-native memory engine ([Urðr](https://github.com/natureco-official/urdr)) · Token-budgeted context · Dangerous-command approval on every shell path · 12 providers, 200+ models · 91 tools · 8 messaging channels.

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
| **v5.69.0 – v5.69.4** | **Windows/macOS GUI automation reliability + real CI enforcement:** fixed AppleScript injection and locale-ambiguous date parsing across 6 macOS automation tools, a Windows `SendKeys` assembly-loading bug, and a Windows `timeout` command that failed under piped stdin — all found via genuine live-device testing, not just automated tests. |
| **v5.68.0 – v5.68.6** | **Full command-surface security audit:** every `src/commands/` file (107 files) audited and fixed — credential masking, path-traversal validation, honest success/failure reporting (commands no longer silently claim success on failure), plus full test coverage added for all 91 built-in tools. |
| **v5.66.0 – v5.67.6** | **Real Urðr memory engine integration:** `natureco`'s persistent memory (`memory write`, `memory search`, `code` session context) is now genuinely backed by [Urðr](https://github.com/natureco-official/urdr)'s git-native, hash-chained memory architecture — not just an in-repo JSON file — with automatic legacy fallback. Also: 10 shell-injection fixes converting `execSync` string-building to safe `execFileSync` argv arrays, and a Turkish-locale filename bug fix across 25 files. |
| **v5.65.6** | **Survives the just-launched-app race:** GUI actions right after opening an app no longer fail on a transient `kAXErrorFailure (-25200)` — `osaScript` retries once, and `mac_app_open` waits for the UI to settle. |
| **v5.65.5** | **Fewer false-negative timeouts:** `osascript` timeout raised from 10s to 20s so slow-but-successful GUI actions (typing, saving) aren't misreported as failures. |
| **v5.65.4** | **Accessible mouse_position errors:** the raw "mouse variable undefined" AppleScript error is now classified as a missing Accessibility permission, with the same actionable guidance as every other GUI action. |
| **v5.65.3** | **Real Windows mouse/scroll automation:** click and scroll now use a real `user32.dll` mouse event instead of a non-existent SendKeys code, and macOS screenshot permission failures are always detected. |
| **v5.65.2** | **Reliable macOS automation recovery:** simple open requests stop after success, stale browser profiles retry once, and Screen Recording/Accessibility failures provide precise Cupertino Terminal permission guidance. |
| **v5.65.0** | **Persistent browser agent:** visible system Chrome/Chromium, persistent login/storage, and reliable `snapshot → @ref click/fill → verify` automation replace one-shot headless browsing. |
| **v5.64.7** | **Resilient GUI vision:** invalid action parameters and truncated vision JSON are rejected safely and retried instead of crashing macOS automation. |
| **v5.64.6** | **Reliable MiniMax tool calls:** XML parameters are converted to their declared schema types, fixing `computer_use_loop` failures such as `maxSteps: expected number, got string`. |
| **v5.64.5** | **Deterministic GUI recovery:** visible web tasks use one verified GUI loop; failures expose their concrete reason and stop blind browser/AppleScript fallback chains. |
| **v5.64.4** | **Unified MiniMax media:** the existing MiniMax key now powers `MiniMax-VL-01` analysis, `image-01` generation, `MiniMax-Hailuo-2.3` video, and verified GUI vision—no second key required. |
| **v5.64.3** | **Evidence-based GUI completion:** desktop actions require a changed screen plus independent visual evidence before success. MiniMax screenshots use the Token Plan VLM with the existing provider key. |
| **v5.64.2** | **Reliable macOS GUI automation:** tool names stay visible in REPL transcripts, visual tasks use a verified screenshot loop, MiniMax GUI routing avoids duplicate paths, and failed/unverified actions no longer claim success. |
| **v5.64.1** | **Reliable follow-ups + lower token cost:** `natureco code` now preserves same-session context across workflow calls and caps repeated history by token budget (1,024 / 2,048 / 8,192). Provider labels are rendered correctly. |
| **v5.64.0** | **Unified secure agent foundation:** one execution gateway, hard-stop guardrails, schema-validated tools, rollback/checkpoints, sourced memory, resilient channel delivery, OS keychains and encrypted sync. |
| **v5.43.0** | **Security:** 9 vulnerabilities fixed in a 3-round audit (RCE chain, admin-rpc auth, cron persistence, channel access control). See [`SECURITY_AUDIT_SUMMARY.md`](SECURITY_AUDIT_SUMMARY.md). |
| **v5.42.0** | **Token optimization** — prompts trimmed by ~76% (skill index made compact; big cost savings on multi-step tasks). |
| **v5.41.0** | **Multi-agent orchestration** — the agent can spawn focused sub-agents (`sub_agent`) and produce step-by-step plans (`plan`) before acting. |
| **v5.40.0** | **Cross-session memory** correctness fix — facts are saved and recalled reliably across sessions. |
| **v5.39.0** | **Cross-platform** — first-class Windows/macOS/Linux support (pure-Node search fallback, platform-aware helpers). |
| **v5.38.0** | git command-injection fix + `code_execution`/`http_request` improvements. |

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

### 📡 8 Messaging Channels

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

## 📋 Commands (A–Z, 120+ commands)

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

### 📡 Channels (10 messaging platforms)

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

## 🌐 Provider Support (12 providers, 200+ models)

| Provider | Models | API Key |
|----------|--------|---------|
| **OpenAI** | GPT-5, GPT-4.1, o3, GPT-4o | OpenAI |
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku | Anthropic |
| **Gemini** | 2.5 Pro, 2.0 Flash, Gemma | Google |
| **Groq** | Llama 3.3, Mixtral | Groq |
| **DeepSeek** | R1, Chat V3 | DeepSeek |
| **Ollama** | Llama, Qwen (local) | — |
| **MiniMax** | M2.5, M2 | MiniMax |
| **OpenRouter** | 15+ models (multi-provider) | OpenRouter |
| **Mistral** | Large, Small, Codestral | Mistral |
| **Cohere** | Command R+, Embed | Cohere |
| **xAI** | Grok 2, Grok Beta | xAI |
| **Together** | Llama, Mixtral, Qwen | Together |

```bash
# Provider selection lives in the wizard
natureco setup
# Wizard: Provider → API Key → Model → Bot name

# List models
natureco models list --provider openai
natureco models list --provider anthropic
```

> The agent adapts to each provider's native tool-calling style automatically (OpenAI-style `tool_calls` JSON or agentic-text XML), so the same tools and memory work everywhere.

---

## 🔄 vs. Other CLIs

| Feature | NatureCo | Claude Code | Hermes | OpenClaw |
|---------|----------|-------------|--------|----------|
| Multi-provider | ✅ 12 | ❌ Anthropic | ✅ 8 | ❌ |
| 200+ models | ✅ | ❌ | ✅ | ❌ |
| Multi-agent orchestration | ✅ | ✅ | ⚠️ | ⚠️ |
| Dangerous-command approval | ✅ | ✅ | ✅ | ⚠️ |
| Multi-channel (8 platforms) | ✅ | ❌ | ✅ (Python) | ❌ |
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
| **Node.js** | 18.x | 20.x (LTS) |
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
- 🔒 **Security:** [`SECURITY_AUDIT_SUMMARY.md`](SECURITY_AUDIT_SUMMARY.md)
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

<sub>Part of the **NatureCo** ecosystem — [natureco.me](https://natureco.me) · NatureCo ekosisteminin parçası</sub>
