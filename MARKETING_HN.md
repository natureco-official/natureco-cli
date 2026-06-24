Show HN: NatureCo CLI – 47-tool AI agent that actually works (v5.0)

Hi HN,

I built NatureCo CLI, a terminal-native AI agent with a focus on **real working tools** rather than feature bloat.

**What makes it different from OpenClaw/Cline/Aider:**

1. **47 tools, all tested** — bash, file ops, grep, HTTP, Python/Node sandbox, **OpenAI-compatible tool calling** with multi-turn execution. Unlike OpenClaw where some tools silently fail.

2. **Persistent REPL with memory** — Type `natureco repl`, it remembers you across sessions. Stores facts like "user is CEO of NatureCo", auto-extracts from conversation. `/sessions`, `/resume last`, `/memory` all work.

3. **TUI engine** — Built my own from scratch (no Ink, no blessed, no dependencies). Round borders, progress bars, tables, status pills. About 750 lines of code.

4. **macOS native** — Apple Calendar, Reminders, Notes, app control via AppleScript. `natureco setup` is a real wizard (4 steps including channels).

5. **Skill marketplace** — `natureco skills install-mp seo-audit` installs from local registry. 5 official + community contributions.

6. **OpenClaw alternative at $5/month vs $50-200** — Cost tracking built in.

**Architecture:**
- OpenAI-compatible function calling (works with Groq, OpenAI, Anthropic, MiniMax, OpenRouter, etc.)
- OpenAI-compatible providers with auto-fallback (Pollinations for free image gen)
- JSONL audit log with 30-day retention, 22 secret patterns scanner
- Sub-process gateway (port 3847) for multi-channel operation

**Why I built this:** OpenClaw was eating $80/month and half the tools didn't work. Built my own in 9 phases, then kept iterating. Now I'm publishing it.

**Tech:** Node.js, vanilla (no fancy frameworks). Streaming, tool calling, multi-turn execution. About 5000 lines.

Try: `npm install -g natureco-cli && natureco setup`

GitHub: https://github.com/natureco/natureco-cli
npm: https://npmjs.com/package/natureco-cli

Feedback welcome. Especially on tool ergonomics and the persistent memory system.

**Edit:** v5.0.0 just published — 47 tools, skill marketplace, macOS native integration.