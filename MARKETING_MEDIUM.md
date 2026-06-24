# I Built a 47-Tool Terminal AI Agent That Actually Works (NatureCo CLI v5.0)

*Published on NatureCo Engineering Blog — 8 minute read*

## The problem with existing terminal AI agents

If you've used OpenClaw, Aider, Cline, or any of the "AI agent for your terminal" tools, you've probably experienced this:

> *"Let me search for that file..."* → no output
> *"I'll run that command..."* → nothing happens
> *"Generating image..."* → "OpenAI API key required"

You pay $50-200/month and half the tools don't work. The agent promises the world but delivers half.

I spent **$80/month on OpenClaw** for six months. The breaking point came when I asked it to **add a calendar event** for "tomorrow 3pm" and it told me:

> "I don't have direct access to your calendar. However, here's how you can do it manually..."

**This was a 60-tool agent.** But it couldn't do the most basic thing — interact with my actual computer.

So I built my own.

## What I built

**NatureCo CLI v5.0** — a terminal-native AI agent with **47 working tools**, persistent memory, and full macOS native integration.

```bash
npm install -g natureco-cli
natureco setup
natureco repl
```

That's it. Three commands. The setup wizard takes 60 seconds. The REPL remembers you forever.

## Architecture decisions

### 1. Tools, not features

I have **47 tools** instead of OpenClaw's 60+. But every single one was tested with real inputs and actually works.

The categories:
- **AI & Media (5):** image generation (with free Pollinations fallback), vision analysis, TTS, LLM delegation, canvas
- **Files & Search (6):** read, write, list, filesystem, glob search, content search (ripgrep)
- **System & Shell (5):** bash, Python/Node sandbox, single shell, HTTP requests, git
- **Web (6):** search (Exa, DuckDuckGo), readability extractor, scraping, browser automation
- **macOS Native (6):** Calendar, Reminders, Notes, Notification Center, app open/quit (via AppleScript)
- **Productivity (5):** todo list, kanban board, memory search, cron scheduler, notebook edit
- **System Tools (4):** sub-agent delegation, skill marketplace, auto-skill loading, skill management

### 2. Persistent memory — the killer feature

```bash
$ natureco repl

You  Merhaba, benim adım Parton. CEO'yum NatureCo'da.
AI   Merhaba Parton! Not aldım — NatureCo CEO'sun.

You  Naruto'yu sever misin?
AI   Ben bir yapay zeka asistanıyım, ama anime konuşabiliriz.

You  /exit

# 1 hafta sonra:
$ natureco repl
Bot:    İchigo
Kullanıcı: Parton (gencay)
Memory: 4 fact öğrenildi
       • NatureCo CEO'su
       • İstanbul'da yaşıyor
       • Anime sever
       • Geliştirici

You  Hatırlıyor musun beni?
AI   Elbette Parton! Sen NatureCo'nun CEO'susun, İstanbul'da yaşıyorsun, anime seviyorsun. Geçen hafta Naruto hakkında konuşmuştuk.

You  /exit
```

This is **not** a demo. Every fact, every memory, is stored in `~/.natureco/memory/<username>.json` and persists across sessions, across machines (with cloud sync coming), across providers.

### 3. Tool calling — properly implemented

OpenAI-compatible function calling is the standard. Most providers support it. **MiniMax** supports it but with a special endpoint: `/v1/text/chatcompletion_v2`.

Most agents use streaming, get text content, and ignore `tool_calls`. I had to:
- Send `tools: [...]` parameter on every request
- Parse streaming `delta.tool_calls` (they arrive in chunks)
- Execute the tool with `tool-runner`
- Send the result back as a `tool` message
- Loop until the model stops calling tools (max 5 iterations to prevent infinite loops)

When it works, it's magic:

```
You  Yarın saat 14'te doktor randevum var

AI   🔧 Tool: calendar_add
     Args: {"title":"Doktor randevusu","startDate":"+1 day 14:00"}
     ✓ Sonuç: Takvime eklendi: "Doktor randevusu"
```

That's a real Apple Calendar event, created via AppleScript, in 2 seconds.

### 4. macOS native without third-party APIs

Calendar, Reminders, Notes, Notification Center, app control — all via **AppleScript**. No OAuth, no API keys, no third-party services.

```javascript
// calendar_add.js
const script = `
  tell application "Calendar"
    set targetCal to ${calScript}
    set startDate to ${startScript}
    make new event at end of events of targetCal with properties {summary:"${title}"}
    save
  end tell
`;
await runAppleScript(script);
```

First call will prompt for permission. Subsequent calls are automatic.

### 5. Skill marketplace — community-driven

```bash
natureco skills marketplace           # List 5 official
natureco skills install-mp seo-audit  # Install
natureco skills search-mp telegram    # Search
natureco skills remove-mp seo-audit   # Uninstall
```

5 official skills today: **seo-audit**, **code-review**, **git-commit**, **telegram-bot**, **morning-briefing**.

The vision: every user can publish their own skill. Community contribution. Local-first (no cloud dependency).

### 6. Cost-first design

```
OpenClaw:   $80/month
Claude.ai:  $20/month (web) + API
NatureCo:   $5-15/month (Groq + MiniMax)
            + free tier (Pollinations images, Pollinations vision)
```

I use Groq for fast stuff (llama-3.3-70b), MiniMax for reasoning (M2.5), Pollinations for images (free). Total bill: **$8-12/month**.

## What I learned

### 1. Tool reliability > tool count

OpenClaw had 60+ tools. I have 47. **But every one of mine works.** Test with real inputs. If a tool fails 1 in 10 times, it's broken.

### 2. Persistent memory is the killer feature

The day I added persistent memory, the tool became **actually useful**. No more "Hi, I'm a developer who works on X". Just continuous context across sessions.

### 3. Tool calling is hard

OpenAI-compatible function calling looks easy. It's not. Streaming tool_calls arrive in chunks. Multi-turn execution needs careful loop management. Error handling for failed tools. Token counting for tool definitions. Auto-fallback when API fails.

### 4. macOS is the easiest platform to integrate with

AppleScript + System Events gives you access to almost everything: Calendar, Reminders, Notes, apps, notifications, clipboard, screenshots. No third-party SDKs, no rate limits.

## What's next

- **v5.1:** Plugin marketplace (like VS Code extensions)
- **v5.2:** Voice mode (Whisper STT + TTS in REPL)
- **v6.0:** Multi-agent collaboration (NatureCo + Codex + Ollama + local LLM)

## Try it

```bash
npm install -g natureco-cli
natureco setup
natureco repl
```

GitHub: https://github.com/natureco/natureco-cli
npm: https://www.npmjs.com/package/natureco-cli
Documentation: https://natureco.me/cli

Built by Parton & Sasuke (AI pair) over 5 months.
MIT licensed.

---

*Have you built something similar? What's your experience with terminal AI agents? Let me know in the comments.*
