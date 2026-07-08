# NatureCo CLI

[![npm version](https://img.shields.io/npm/v/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)]()
[![Downloads](https://img.shields.io/npm/dm/natureco-cli)](https://www.npmjs.com/package/natureco-cli)
[![Stars](https://img.shields.io/github/stars/natureco-official/natureco-cli)](https://github.com/natureco-official/natureco-cli)

> **The power of AI, now at your fingertips.**
> *Discover the speed of the terminal with NatureCo.*

A terminal-native AI agent CLI — chat, write code, automate workflows, and connect **Telegram / Discord / Slack / WhatsApp / iMessage** and more.

**A Claude Code & OpenClaw alternative** · Multi-agent orchestration · Cross-session memory · Dangerous-command approval · 12 providers, 200+ models · 57+ tools · 10 messaging channels.

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

## ✨ Features

### 🤖 AI & Chat
- **Persistent REPL** — cross-session memory; your bot remembers you across restarts.
- **Multi-provider** — 12 providers, 200+ models. Bring your own API key.
- **Slash commands** — `/memory`, `/help`, `/skills`, `/model`, `/clear`.
- **Streaming output** with live tool-call visibility and a thinking indicator.

### 💻 Coding Agent (Claude Code alternative)
- **Agentic tool loop** — reads, edits, searches, runs, and verifies your code.
- **57+ tools** — file ops, glob/grep search, shell, git, HTTP, code execution, notebooks, and more.
- **Multi-agent orchestration** — the agent can spawn focused sub-agents (`sub_agent`) and produce step-by-step plans (`plan`) before acting.
- **Skills** — progressive-disclosure skill system; load domain expertise on demand with `skill_view`.

### 🧠 Memory & Sessions
- **Cross-session memory** — facts, preferences, and project context persist between sessions.
- **Tree memory** — structured, categorized long-term knowledge (`memory_tree`).
- **Sessions** — resume any past conversation; full session history on disk.

### 📡 10 Messaging Channels
Connect your agent to **Telegram, Discord, Slack, WhatsApp, iMessage, Mattermost, IRC, Signal, SMS (Twilio), and Webhooks** — run them all through a single gateway.

### 🛡️ Security & Safety
- **Dangerous-command approval** — risky shell commands are gated by a two-tier policy (`deny` / `allowlist` / `full`).
- **Sandboxed execution** — tools enforce their own guards; no path bypasses the approval flow.
- **Command-injection safe** — structured process spawning (`execFileSync`), no shell string interpolation.
- **Sender allow-lists** — per-channel access control; personal memory is never injected for unauthorized senders.
- **Local-only admin RPC** — bound to `127.0.0.1`, mandatory bearer token, secrets masked by default.
- **Secure at rest** — config and session files stored with `0600`/`0700` permissions.
- **Audited** — see [`SECURITY_AUDIT_SUMMARY.md`](SECURITY_AUDIT_SUMMARY.md).

### ⚙️ Automation & Scheduling
- **Cron jobs** — schedule recurring tasks (`natureco cron`). App-managed by default; system crontab is opt-in and approval-gated.
- **Webhooks** — inbound/outbound HTTP callbacks.
- **Cost tracking** — per-day token/cost reporting (`natureco cost`).

---

## 📋 Commands

A quick tour — run `natureco help` for the full list (120+ commands).

| Command | Description |
|---------|-------------|
| `natureco setup` | Interactive first-run wizard |
| `natureco chat` | Start the persistent chat REPL |
| `natureco code [file]` | Launch the coding agent |
| `natureco run <script>` | Run a Markdown workflow script |
| `natureco gateway start` | Start all configured messaging channels |
| `natureco memory <list\|status>` | Inspect cross-session memory |
| `natureco sessions` | List / resume past sessions |
| `natureco skills list` | List available skills |
| `natureco cron <add\|list\|remove>` | Manage scheduled tasks |
| `natureco cost` | Token & cost report |
| `natureco security [audit]` | Run a local security audit |
| `natureco config list` | Show configuration |
| `natureco doctor` | Full system health check |

**In-REPL slash commands:** `/help`, `/memory`, `/model`, `/bot`, `/skills`, `/sessions`, `/clear`, `/exit`.

---

## 🌐 Provider Support (12 providers, 200+ models)

Anthropic (Claude), OpenAI (GPT), Google (Gemini), MiniMax, Groq, Ollama (local), and more — all selectable in the setup wizard.

```bash
# Re-run provider selection any time
natureco setup

# Wizard flow: Provider → API Key → Model → Bot name
natureco models        # list available models for your provider
```

> The agent adapts to each provider's native tool-calling style automatically (OpenAI-style `tool_calls` JSON or agentic-text XML), so the same tools and memory work everywhere.

---

## 🔄 vs. Other CLIs

| | NatureCo CLI | Claude Code | OpenClaw |
|---|---|---|---|
| Multi-provider (12+) | ✅ | ❌ (Anthropic only) | ⚠️ limited |
| Messaging channels | ✅ 10 | ❌ | ❌ |
| Cross-session memory | ✅ | ⚠️ | ⚠️ |
| Multi-agent orchestration | ✅ | ✅ | ⚠️ |
| Dangerous-command approval | ✅ | ✅ | ⚠️ |
| Cost tracking | ✅ | ⚠️ | ❌ |
| Cron / automation | ✅ | ❌ | ❌ |

---

## 🛠️ Requirements

- **Node.js ≥ 18**
- An API key from at least one supported provider (or a local Ollama install)
- macOS, Windows, or Linux

Optional, for richer functionality: `ripgrep` (faster search — falls back to a pure-Node scanner), `python3` (for `code_execution`), `git`.

---

## 🚀 Examples

**Simple chat**
```bash
natureco chat
  💬 You ▸ create a file racing-game.html on my Desktop with a small canvas racing game
  AI     🔧 write_file ✓
  Done — racing-game.html created on your Desktop.
```

**Connect a Telegram bot**
```bash
natureco channel telegram --token <BOT_TOKEN>
natureco gateway start
```

**Schedule a recurring task**
```bash
natureco cron add --name daily-brief --schedule "0 9 * * *" --command "..."
```

**Pipe a one-shot request**
```bash
echo "summarize package.json" | natureco chat
```

---

## 🔌 Integrations

- **Webhooks** — inbound/outbound HTTP callbacks.
- **Cron** — recurring or one-off scheduled tasks.
- **MCP (Model Context Protocol)** — connect external MCP servers.

---

## 🤝 Contributing

```bash
git clone https://github.com/natureco-official/natureco-cli
cd natureco-cli
npm install
npm test        # run the test suite (vitest)
npm run lint    # eslint
npm run smoke   # sanity check
```

Contributions are welcome — please open an issue or PR.

---

## 📄 License

MIT © NatureCo — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgements

Built for developers who want the power of an AI agent without leaving the terminal. Inspired by Claude Code and the open agent ecosystem.
