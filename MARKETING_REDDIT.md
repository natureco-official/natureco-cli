**Title:** I built a 47-tool terminal AI agent in 5 months that replaces OpenClaw at 1/10th the cost (NatureCo CLI v5.0)

**Body:**

After spending $80/month on OpenClaw and getting frustrated with broken tools, I decided to build my own. **NatureCo CLI v5.0** is now published to npm with **47 working tools**, persistent memory, and macOS native integration.

**Key features:**

🤖 **Tool calling that actually works** — Full OpenAI-compatible function calling. The model picks tools, the CLI executes them (real bash, real Python sandbox, real HTTP), results stream back. **All 47 tools tested and working.**

💾 **Persistent REPL** — Type `natureco repl`, talk to AI. Close it, come back tomorrow, type `natureco repl` again — it remembers everything. Auto-extracts facts about you ("user prefers Turkish", "user is CEO of NatureCo").

🎨 **Custom TUI engine** — Built from scratch in 750 lines. Round borders, progress bars, tables, status pills. No Ink, no blessed, zero dependencies.

🍎 **macOS native** — Apple Calendar, Reminders, Notes, app control via AppleScript. Setup wizard actually has all 10 channels now.

🛒 **Skill marketplace** — Install community skills with one command. SEO audit, code review, conventional commits, Telegram bot wizard, morning briefing — all built-in.

💰 **Cost tracking built in** — Tracks usage per provider/model, 21 models priced, budget alerts.

🔒 **Security-first** — JSONL audit log, 22-pattern secret scanner, approval policies (ask/allowlist/deny/full).

**The interesting bits:**

- **Multi-turn tool execution**: Model can chain tools, e.g., "find all TODO files" → grep for "FIXME" → write a summary. Up to 5 iterations per message.
- **Auto-fallback for free usage**: Image generation defaults to Pollinations.ai (free), only uses DALL-E if API key set.
- **macOS permissions are handled gracefully**: If Calendar access denied, gives clear instructions on how to enable.
- **Provider-agnostic**: Works with Groq, OpenAI, Anthropic, MiniMax, OpenRouter, Together, DeepSeek, Ollama, Firecrawl.

**What I learned building this:**

1. **Tool reliability matters more than tool count.** OpenClaw had 60+ tools but half silently failed. I have 47 and every single one was tested with real inputs.
2. **Persistent memory is the killer feature for terminal agents.** Once users don't have to repeat themselves, it becomes actually useful.
3. **MiniMax API supports OpenAI function calling but with a special endpoint** (`/v1/text/chatcompletion_v2` instead of `/v1/chat/completions`). Once I figured that out, MiniMax became a great budget provider.
4. **AppleScript is the secret weapon for macOS integration.** No third-party APIs needed for Calendar/Reminders/Notes.

**Stats:**
- 47 tools, 165+ files
- ~5000 lines of code
- 0 external TUI/UI dependencies
- MIT licensed, npm published
- Built in 5 months by one person

**Try it:** `npm install -g natureco-cli && natureco setup`

GitHub: https://github.com/natureco/natureco-cli
npm: https://www.npmjs.com/package/natureco-cli

Happy to answer questions about the architecture, the tool calling system, or the persistent memory implementation.