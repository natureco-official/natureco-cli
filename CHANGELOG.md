# Changelog

All notable changes to NatureCo CLI will be documented in this file.

## [5.7.1] - 2026-06-25 — "BUG FIX SPRINT"

Comprehensive audit-driven sprint: 7 real runtime bugs fixed, 6 new
utility modules with ~90%+ test coverage, ESLint + flat config installed,
test scripts wired to vitest (previously `npm test` was just running
`--help`). Pure quality / stability — no public API change.

### 🐛 Fixed (runtime bugs)
- **REPL `/system <text>` crashed with TypeError** (`commands/repl.js`):
  systemPrompt was `const` but the slash handler reassigned it. → `let`.
- **Telegram + IRC + SMS message handlers ReferenceError on every inbound**
  (`commands/gateway-server.js`): `cleanCommand` variable never declared
  in those scopes. Added `stripSlashPrefix(text)` helper mirroring the
  v5.6.41+ WhatsApp transform; all three channels now derive it correctly.
- **Tool-alias rewrites threw ReferenceError** (`utils/tools.js`): typo
  `TOOL_ALIASES[t.name]` where the local was `ALIAS_MAP`. Fixed.
- **5 silent `no-undef` ReferenceErrors** across `commands/{chat,nodes,
  gateway,config}.js` + `utils/error.js` — missing `require()` calls
  that had been hidden by CommonJS load-order side effects (would
  crash on a fresh process or worker restart).

### 🔒 Security
- **exec-approvals.json was world-readable (0644)** — local privilege
  escalation hedef. Now 0o600 (file) + 0o700 (parent dir), with
  auto-tightening of pre-existing loose installs. Removed dangling
  `APPROVALS_SOCKET_PATH` constant + unused `net` require (socket never
  existed; storage is the JSON file).
- **Anthropic `system` field sent as `''` or `undefined`** (api.js): now
  always non-empty via `extractSystemForAnthropic(messages)` helper with
  a meaningful default. Prevents 400 "system: cannot be empty" on
  recent Messages API revisions + unanchored-model drift.

### ⚙️ Reliability
- **Crash-safe atomic file writes** for sessions, history, memory,
  approvals (new `utils/atomic-file.js`: temp-write + rename(2)).
  Prior `fs.writeFileSync` left truncated JSON on SIGTERM / OOM /
  power loss.
- **Memory fact cap silent fail fixed** (`tools/memory_write.js`): the
  hardcoded `slice(0, 15)` ran BEFORE push, so once 15 high-score
  facts were saved, every new write was the next iteration's eviction
  victim — silently. Now: `MAX_FACTS_PER_USER` default 50 (env
  `NATURECO_MAX_FACTS`), cap applied AFTER push, just-written fact
  pinned at top, `console.warn` on breach (`NATURECO_QUIET_MEMORY=1`
  to silence).
- **Global `unhandledRejection` + `uncaughtException` handlers**
  (`utils/process-errors.js`, installed as the first statement in
  `bin/natureco.js`): structured audit log entry + friendly Turkish
  stderr + exit 1, instead of Node's default ugly stack dump.
- **Dashboard port + host de-hardcoded** (`utils/ports.js`):
  `NATURECO_DASHBOARD_PORT` + `NATURECO_DASHBOARD_HOST` env overrides
  with range/format validation. Previously 7421 was inlined in two
  separate modules; drift risk eliminated.

### 🧹 Refactor (DRY)
- **Streaming tool-call delta accumulator** extracted to
  `utils/streaming-tools.js`. The per-index buffer + string-concat
  pattern was duplicated in `utils/api.js` and `commands/repl.js` —
  any drift between them would silently break tool calling on
  Groq / MiniMax / DeepSeek / OpenAI.
- **Provider detection** centralized in `utils/provider-detect.js`.
  Three call sites (`utils/api.js`, `commands/setup.js`) used three
  different versions of the URL→provider mapping; the setup.js variant
  was already incorrect (missed `minimax.cn`). Helper makes
  `detectProvider`, `isMiniMax`, `isAnthropic`, `isGroq`, `isOllama`
  the single source of truth.

### 🧪 Testing
- **`npm test` actually runs tests now** — was previously just
  `node bin/natureco.js help` (a load-smoke). Wired to `vitest run`.
- **+95 unit tests** across 9 new spec files. Coverage of the new
  utility modules: streaming-tools 97%, provider-detect 100%,
  process-errors 88%, ports ~93%, atomic-file ~93%, memory_write
  internals ~85%.
- **Test suite: 12 files / 270 tests → 21 files / 365 tests.**
- `@vitest/coverage-v8` dev dep added; `npm run test:coverage` works.
- **prepublishOnly gate strengthened**: now runs `node --check` +
  `eslint --quiet` + `vitest run` in sequence. A broken publish to
  `npm install -g natureco-cli` users is now strictly blocked.

### 🔧 Tooling
- **ESLint v9 flat config added** (`eslint.config.js`):
  `@eslint/js` recommended + warn-level checks for unused-vars,
  useless-escape, case-declarations, control-regex. Test files get
  ES-module sourceType + vitest globals; `src/tools/browser*.js`
  get browser globals for Playwright page.evaluate context.
  Scripts: `npm run lint`, `lint:fix`, `lint:errors-only`.
  After the no-undef fixes: 0 errors (293 unused-vars warnings
  remain for a follow-up sprint).

## [5.7.0] - 2026-06-24 - SOUL SCRUBBED (MINOR)

### Security
- Personal paths removed from README (Users/gencay/.hermes/sasuke-notes*.md and Downloads/notes.py)
- soul/ directory removed from repo (7 files: AGENTS, IDENTITY, SOUL, notes/{INDEX,note1-5}.md)
  - Note: files remain in git history; use git filter-repo for full purge
- Internal docs ignored via .gitignore (DEPLOY_*, LAUNCH, AUDIT, TEST_PLAYBOOK, etc.)

### Changed
- Minor version bump 5.6.48 -> 5.7.0 (patch cascade rule: 5+ consecutive patches)

## [5.6.48] - 2026-06-24 — "README SHARDED"

### 📚 Documentation
- **README.md + README_EN.md updated** for v5.6.47
  - v5.6.47 + v5.6.46 added to "Recent Releases" table
  - New "v5.6.47 — Sharded Memory System" hero section in "What's New"
  - Folder structure diagram (`soul/notes/{INDEX,note1-5}.md`)
  - Cross-project reference to `sasuke-notes*.md`
- npm registry will reflect updated README on next publish

## [5.6.47] - 2026-06-24 — "SOUL SHARDED"

### ✨ Added
- **soul/notes/ — Sharded memory system for NatureCo CLI agent**
  - `INDEX.md` (2 KB) — file map, navigation
  - `note1.md` (3 KB) — Patron & persona (Gencay, "Patron" hitap, çilek yasağı)
  - `note2.md` (4 KB) — Project structure, 120+ commands, build/publish workflow
  - `note3.md` (3.8 KB) — Tokens, red lines, masking fixes (npm `.npmrc`, PyPI `/tmp/pypi_token.txt`, GitHub `/Users/gencay/.natureco/github_token`)
  - `note4.md` (6 KB) — 7-step release workflow (local commit → tag → push → publish → cache-bust → GitHub release → verify)
  - `note5.md` (5 KB) — Skills, tools, channels, MCP, integrations
- **SOUL.md updated** to index-based: "read soul/notes/INDEX.md" + 1-line quick reference
- **Infinite scalability** — `note6.md`, `note7.md`... as needed
- **Pattern mirrors** `/Users/gencay/.hermes/sasuke-notes*.md` for cross-project memory
- 1009 + 125 = 1134 new lines, ~28 KB detailed context

## [5.6.46] - 2026-06-24 — "README OVERHAUL"

### 📚 Documentation
- **README.md full rewrite** — 5.6.x serisine uygun:
  - Hero slogan: "Yapay Zekânın Gücü artık parmaklarının ucunda / Terminalin hızını NatureCo ile keşfet"
  - ASCII art banner
  - Node badge: `>=16.0.0` (package.json engines ile uyumlu)
  - npm version, downloads, GitHub stars badge'leri
  - Quick Start 4 adım: install → setup → chat → code
  - 51 komut / 10 kategori, gerçek örnekler
  - Discord `https://discord.gg/4FwumbWph`, Twitter `https://twitter.com/naturecoofficial`
  - GitHub: `natureco-official/natureco-cli`
  - Karşılaştırma tablosu (Claude Code / Hermes / OpenClaw)
  - 30s setup wizard tanıtımı

### 🎯 Versiyon Notu
- 5.6.45 → 5.6.46 (patch bump, README-only release)
- Kod değişikliği yok, npm sayfası güncellendi
- Yeni kullanıcılar README üzerinden kurulum yapabilir

---

## [4.2.0] - 2026-06-22 — "LAUNCH READY"

### 🚀 Headline
**v4.2.0 ile NatureCo CLI npm'e publish'a hazır.** OpenClaw'ın açık ara üstünü.

### ✨ Added
- **package.json launch-ready:**
  - Açıklayıcı description, 18 keywords (SEO optimize)
  - `repository`, `bugs`, `homepage`, `author` (Gencay Olgun) alanları
  - `postinstall` script: `natureco doctor` otomatik çalışır
  - `prepublishOnly`: syntax check + test
  - Files: README, CHANGELOG, AUDIT, DEPLOY docs dahil
- **LAUNCH.md** — Pazarlama materyali:
  - Reddit/HN/Twitter/Medium/Discord mesajları (Parton imzalı)
  - Hedef kitle segmentleri
  - 30-gün başarı metrikleri
  - Launch checklist
- **npm publish adımları** dokümante edildi

### 📊 Final İstatistikler
- 152 JS dosyası (8 yeni eklendi)
- 32K+ satır kod
- 11 utility modülü (5 yeni)
- 95+ CLI komutu (8 yeni)
- 8 phase, 0 blocking bug
- v2.23.32 → v4.2.0 (8 minor versiyon)

### 🎯 Hedef
- İlk hafta: 1,000 npm indirme
- İlk ay: 500 GitHub yıldız, 200 aktif kullanıcı

---

## 🏁 TÜM PHASE'LER TAMAMLANDI

- [x] Phase 0: Audit
- [x] Phase 1: Brand & Onboarding (v3.0.0)
- [x] Phase 2: Defense-in-Depth (v3.1.0)
- [x] Phase 3: Self-Evolving Skills (v3.2.0)
- [x] Phase 4: Cost-Optimized (v3.3.0)
- [x] Phase 5: Developer Experience (v3.4.0)
- [x] Phase 6: NatureCo Native (v4.0.0)
- [x] Phase 7: Multi-Agent (v4.1.0)
- [x] Phase 8: Launch Ready (v4.2.0)

**OpenClaw'ın yerini almaya hazırız.** 🌿

### 🤖 Headline
Tek agent değil, **agent ağı**. OpenClaw single-agent — NatureCo multi-agent.

### ✨ Added
- **`src/utils/sub-agent.js`** genişletildi: 3 → 8 agent tipi
  - `explore`, `general`, `review` (mevcut)
  - **Yeni:** `seo`, `content`, `security`, `translator`, `debugger`
  - Her biri farklı system prompt ile uzmanlaşmış
- **`natureco team`** — Multi-agent orkestrasyon komutu
  - `team list`: 8 agent tipi ve açıklamaları
  - `team status`: Son çalışan agent istatistikleri (toplam/çalışan/tamamlanan/başarısız)
  - `team spawn <type> <task>`: Tek agent çalıştır (token kullanım raporu ile)
  - `team parallel '<json>'`: N agent paralel çalıştır, sonuçları birleştir
- **Mevcut `spawnSubAgent`/`spawnParallel` altyapısı** zaten vardı (Phase 7 bunu sadece genişletti)

### 🔜 Final Phase
- v4.2.0 — Phase 8: Launch & marketing

### 🌿 Headline
Generic agent değil, **NatureCo platformunun native parçası**. OpenClaw generic — NatureCo natureco.me'ye özel.

### ✨ Added
- **`natureco naturehub`** — Nature Hub topluluk akışına içerik yayınla (post|list|trending|config)
  - Token tabanlı, `natureco config set naturehubToken`
  - Offline: yerel JSONL'e kaydeder, API hazır olunca gönderir
- **`natureco medium`** — Parton'un ayda 4 makale hedefi için (draft|publish|list)
  - Markdown dosyasından taslak/yayın
  - Medium integration token gerektirir
  - Yerel taslak kayıt (`~/.natureco/medium-drafts/`)
- **`natureco seo`** — URL SEO denetimi (audit|meta|speed)
  - Title, description, canonical, OG, Twitter Card, schema.org
  - H1-H3 heading analizi, image alt kontrolü
  - Word count ve 100-üzerinden skor
  - **Test: natureco.me → 71/100, H1 eksik bildirildi**
- **`natureco xp`** — Gamification (stats|leaderboard|rewards)
  - 8 seviye: Tohum → Galaksi (0 → 12,000 XP)
  - 7 farklı ödül (sticker → Founder statüsü)
  - XP history (son 100 kayıt)

### 🎯 Phase 6 Canlı Test
- **SEO audit natureco.me**: 71/100 skor, H1 eksikliği, title uzunluğu tespit edildi
- **XP sistemi**: 0 XP, Lv.1 Tohum, sonraki Filiz (100 XP)

### 🔜 Coming
- v4.1.0 — Phase 7: Multi-agent orkestrasyon (sub-agents)
- v4.2.0 — Phase 8: Launch & marketing

### 🖥️ Headline
OpenClaw "kara kutu". NatureCo CLI **şeffaf** — tüm veriler tek bir local dashboard'da.

### ✨ Added
- **`src/utils/dashboard-server.js`** — Local web dashboard
  - Port 7421, vanilla JS + HTML (framework yok)
  - 6 widget: bugünkü maliyet, yüklü skill, aktif cron, audit kayıtları, provider bazlı maliyet, self-evolving proposals, son tool çağrıları
  - Otomatik 5 saniyede bir yenileme (auto-refresh)
  - JSON API endpoint (`/api`)
  - PID file ile kolay durdurma
- **`src/commands/dashboard.js`** — `natureco dashboard [start|status|stop|url]`
  - Port kontrolü (zaten çalışıyor mu?)
  - Process kill ile temiz shutdown
  - macOS/Windows/Linux uyumlu tarayıcı açma

### 📊 Phase 5 Dashboard Test
- HTTP 200, 8575 byte HTML
- API JSON: tüm Phase 3 proposal verileri görünüyor
- Real-time auto-refresh çalışıyor

### 🔜 Coming
- v4.0.0 — Phase 6: NatureCo özgü entegrasyonlar (naturehub, medium, seo)
- v4.1.0 — Phase 7: Multi-agent orkestrasyon
- v4.2.0 — Phase 8: Launch & marketing

### 💰 Headline
OpenClaw kullanıcıları ayda $50-200 token faturası ödüyor. NatureCo hedef: $5-15/ay akıllı routing ile.

### ✨ Added
- **`src/utils/cost-tracker.js`** — Maliyet hesaplama ve model router
  - 21 model × provider için güncel fiyat tablosu (Groq, OpenAI, Anthropic, DeepSeek, Together, Fireworks, Ollama)
  - Token → USD dönüşümü (input/output ayrı)
  - **Model router**: 4 karmaşıklık seviyesi (simple/medium/complex/creative)
    - Basit soru → llama-3.1-8b-instant ($0.05 in)
    - Kod → llama-3.3-70b-versatile veya claude-sonnet
    - Yaratıcı yazı → claude-sonnet veya gpt-4o
  - **Otomatik karmaşıklık tahmini**: prompt içeriğinden (kod işaretleri, anahtar kelimeler, uzunluk)
  - **Bütçe sistemi**: günlük $5, aylık $100 limit, %75 uyarı, %90 otomatik downgrade
- **`src/commands/cost.js`** — `natureco cost [today|week|month|all|budget|set|model|prices]`
  - Renkli bar chart'lar
  - Provider ve model bazlı breakdown
  - Bütçe durumu görselleştirmesi
- **`bin/natureco.js`** — `cost` komutu kayıtlı

### 📊 Phase 4 Test Sonucu
- 3 farklı provider kullanımı kaydedildi → $0.0252 toplam
- Basit prompt: `groq:llama-3.1-8b-instant` önerildi (en ucuz)
- Karmaşık kod prompt: `groq:llama-3.3-70b-versatile` önerildi
- Bütçe görsel: %1 kullanım (günlük limit $5)

### 🔜 Coming
- v3.4.0 — Phase 5: Geliştirici deneyimi (dashboard)
- v4.0.0 — Phase 6-8: NatureCo native + launch

### 🧠 Headline
Kullanımın tekrar eden pattern'lerinden otomatik skill oluştur. Hermes Agent'tan ilham, NatureCo uyarlaması.

### ✨ Added
- **`src/utils/pattern-detector.js`** — Tool çağrı pattern detector
  - Normalize: URL'ler, dosya yolları, sayılar, UUID'ler, ISO tarihler, email'ler, hex string'ler generic hale getirilir
  - Sliding window (son 1-5 çağrı)
  - Aynı pattern 3+ kez tekrar → proposal oluştur
  - 24 saat cooldown (aynı pattern'i tekrar önerme)
  - Persistent log: `~/.natureco/patterns.json`
  - Proposal kayıt: `~/.natureco/skill-proposals.json`
- **`src/commands/skills.js`** — 4 yeni alt komut:
  - `skills suggest` — Bekleyen proposal'ları göster
  - `skills accept <id>` — Proposal'ı SKILL.md olarak oluştur
  - `skills reject <id>` — Proposal'ı reddet
  - `skills forget` — Pattern hafızasını sıfırla
- **Otomatik SKILL.md üretimi** — accepted proposal'lardan `~/.natureco/skills/<name>/SKILL.md`
- **Audit entegrasyonu** — Her skill kabulü `SKILL_AUTO` action'ı olarak loglanır

### 🐛 Fixed
- Pattern detector'da fingerprint bug'ı: normalize edilmiş string'ler tekrar normalize ediliyordu (boş pattern üretiyordu)

### 🔜 Coming
- v3.3.0 — Phase 4: Maliyet optimizasyonu (model router, token budget)
- v3.4.0 — Phase 5: Geliştirici deneyimi (dashboard)

### 🛡️ Headline
OpenClaw'ın en zayıf olduğu alan: güvenlik. v3.1.0 ile NatureCo CLI artık OpenClaw'tan **açık ara daha güvenli**.

### ✨ Added
- **`src/utils/audit.js`** — Merkezi audit log sistemi (JSONL, 30 gün retention, async, non-blocking)
  - 19 action tipi (command, approval, tool, auth, secret, config, cron, skill, error, info)
  - 24 saat istatistik, dosya bazlı günlük log'lar, auto-cleanup
- **`src/utils/secret-scanner.js`** — 22 bilinen secret pattern tespiti (OpenAI, Anthropic, Groq, AWS, GitHub, Slack, Stripe, Tavily, HuggingFace, Replicate, Firecrawl, NatureCo, JWT, private key, vs)
  - Shannon entropi analizi (bilinmeyen format yüksek entropi secret'lar)
  - Otomatik maskeleme (`sk-a***9012`)
  - Cross-platform dosya tarama (skip: node_modules, .git, dist, lock files)
- **`src/commands/audit.js`** — `natureco audit [today|stats|show|search|files|cleanup|tail]`
  - Renkli action kategorileri
  - 24 saat bar chart
  - Canlı tail modu (yeni kayıtları real-time göster)
- **`bin/natureco.js`** — `audit` komutu kayıtlı
- **`src/commands/doctor.js`** — 2 yeni check:
  - `auditLog`: Audit dizini yazılabilir mi?
  - `secretsClean`: Çalışma dizininde secret var mı?

### 📊 Phase 2 Doctor Sonuçları
- **10 check** toplam (Phase 1'de 8, ilk halde 5)
- 6/10 geçti (fresh setup'ta config henüz yok — beklenen)

### 🔜 Coming
- v3.2.0 — Phase 3: Self-evolving skills
- v3.3.0 — Phase 4: Maliyet optimizasyonu
- v3.4.0 — Phase 5: Geliştirici deneyimi

### 🔥 Headline
OpenClaw'dan daha güvenli, daha hızlı, daha ucuz. İlk kurulum 60 saniye.

### ✨ Added
- **First-run auto-detection** (`bin/natureco.js`) — `natureco` (boş argüman) kurulum yoksa otomatik setup wizard'a yönlendirir
- **`src/utils/branding.js`** — merkezi brand kimliği (renkler, ASCII art, daily tip)
- **Doctor 3 yeni check:** `apiKeyValid`, `providerReachable`, `dataDirs` (auto-fix ile)
- **Setup wizard** artık tam NatureCo logosuyla açılıyor (eski ASCII cat yerine)
- **README v3.0 notları + OpenClaw karşılaştırma tablosu**

### 🐛 Fixed
- **Doctor `diskSpace` bug:** `os.freemem()` (RAM) kullanıyordu, artık gerçek disk alanı (`df -k`, Windows: `Get-PSDrive`)
- **README/package.json versiyon senkron:** 2.19.1 → 3.0.0
- **README Node engine:** >=16 → >=18 (package.json ile uyumlu)

### 📁 Audit (Phase 0)
- 152 JS dosyası, syntax %100 temiz, 0 require hatası
- 10 TODO/FIXME, 10 boş fonksiyon, 5 deprecated existsSync tespit edildi
- AUDIT.md oluşturuldu

### 🔜 Coming in next versions
- v3.1.0 — Phase 2: Defense-in-depth güvenlik (approval v2, audit log, sandbox)
- v3.2.0 — Phase 3: Self-evolving skills
- v3.3.0 — Phase 4: Maliyet optimizasyonu (model router)
- v3.4.0 — Phase 5: Geliştirici deneyimi (dashboard)
- v4.0.0 — Phase 6-8: NatureCo native + launch

## [1.0.0] - 2026-05-10

### Added

#### Core Features
- **First-Time Setup Wizard**
  - Automatic setup on first run
  - Interactive API key validation with live check
  - Bot selection from user's bots
  - Optional Telegram integration
  - Creates `~/.natureco/` directory structure
  - Beautiful boxed interface
  - Can be run manually with `natureco setup`

- **Authentication System**
  - Login/logout with API key
  - Secure storage in `~/.natureco/config.json`
  - Support for both `nco_` and `nc_` key formats

- **Bot Management**
  - List available bots
  - Interactive chat with bots
  - Bot switching within chat

- **Gateway Screen**
  - Beautiful boxed interface
  - Login status display
  - Active bot information
  - Skill and MCP server counts

#### Project Management
- **Project Initialization**
  - `natureco init` command
  - Creates `.natureco/` folder structure
  - Interactive bot and skill selection
  - Generates `config.json` and `AGENTS.md`

- **Configuration System**
  - Global config: `~/.natureco/config.json`
  - Project config: `.natureco/config.json`
  - Get/set/list commands
  - Hierarchical config management

#### Skills System
- **Three-Tier Hierarchy**
  - Built-in skills (code-review, summarize, translate)
  - User skills (`~/.natureco/skills/`)
  - Project skills (`.natureco/skills/`)

- **Skill Management**
  - List installed skills
  - Install from NatureHub
  - Remove skills
  - Update all skills
  - Create new skill templates

- **Skill Features**
  - Automatic prompt injection in chat
  - Requirement gating (bins, env vars, OS)
  - SKILL.md format with frontmatter
  - Metadata validation

#### Chat Features
- **Interactive Chat**
  - Real-time conversation with bots
  - Readline interface with arrow key support
  - Command history (last 100 commands)
  - Conversation history saved to `~/.natureco/history/`

- **Chat Commands**
  - `/clear` - Clear screen
  - `/bot [name]` - Switch bot or list bots
  - `/skills` - Show active skills
  - `/help` - Show chat help
  - `exit`, `quit` - Exit chat

- **Quick Commands**
  - `natureco ask "<question>"` - Single-shot questions
  - `natureco run <script.md>` - Run markdown scripts
  - Pipe support for ask command

#### MCP Server Support
- **Server Management**
  - List MCP servers
  - Add servers (interactive or template-based)
  - Remove servers
  - Test connections
  - Enable/disable servers

- **Ready Templates**
  - `filesystem` - File system operations
  - `github` - GitHub operations
  - `postgres` - PostgreSQL database
  - `sqlite` - SQLite database
  - `brave-search` - Web search

- **Configuration**
  - Stored in `~/.natureco/config.json`
  - Environment variable support
  - Auto-approve lists
  - Disable/enable flags

#### AGENTS.md Support
- Project-specific bot instructions
- Automatic prompt injection in chat
- Markdown format
- Created during `natureco init`

#### Update System
- **Auto-Update Notifications**
  - Checks every 24 hours
  - Notifies when new version available
  - Uses update-notifier package

- **Manual Update Check**
  - `natureco update` command
  - Shows current and latest versions
  - Provides update instructions

#### UI/UX
- Colorful terminal interface with chalk
- Loading animations with spinners
- Boxed gateway screen
- Monospace formatting
- Error messages in Turkish
- Cross-platform support (Windows, macOS, Linux)

### Technical Details

#### Dependencies
- `chalk@4.1.2` - Terminal colors
- `commander@11.1.0` - CLI framework
- `inquirer@8.2.7` - Interactive prompts
- `boxen@5.1.2` - Terminal boxes
- `ora@5.4.1` - Spinners
- `conf@10.2.0` - Config management
- `update-notifier@6.0.2` - Update notifications

#### API Integration
- Base URL: `https://api.natureco.me`
- Endpoints:
  - `GET /api/v1/bots` - List bots
  - `POST /api/agent/chat` - Chat with bot
- Headers:
  - `Authorization: Bearer <apiKey>`
  - `X-User-ID: cli-user`
- Platform identifier: `cli`

#### File Structure
```
~/.natureco/
├── config.json          # Global config
├── skills/              # User skills
└── history/             # Chat history
    └── <bot-id>.json

.natureco/               # Project folder
├── config.json          # Project config
├── AGENTS.md            # Bot instructions
└── skills/              # Project skills
```

### Commands

```bash
natureco                    # Gateway screen (runs setup if needed)
natureco setup              # Run setup wizard
natureco login              # Login
natureco logout             # Logout
natureco bots               # List bots
natureco chat <bot>         # Start chat
natureco ask "<question>"   # Quick question
natureco run <script.md>    # Run script
natureco init               # Initialize project
natureco skills [action]    # Manage skills
natureco mcp [action]       # Manage MCP servers
natureco config <action>    # Manage config
natureco update             # Check updates
natureco help               # Show help
```

### Requirements
- Node.js >= 18.0.0 (for native fetch)
- npm or yarn
- NatureCo API key

### License
MIT

## [4.9.1] - 2026-06-22 — "SELF-COMPLETE TOOLSET"

### Yeni: 14 Tool Eklendi (Toplam: 45)
Parton'un vizyonu: "kendi araçlarimi ekle". Hermes'te olan araçlarin aynisi.

#### macOS Native Tools (6 yeni)
- **calendar_add** - macOS Calendar'a etkinlik ekle (AppleScript)
- **reminder_add** - macOS Reminders'a hatirlatici
- **notes_add** - Apple Notes'a not
- **mac_notify** - Notification Center bildirimi
- **mac_app_open** / **mac_app_quit** - Uygulama kontrol

#### Sistem & Shell (5 yeni)
- **code_execution** - Python/Node/Bash sandbox
- **shell_command** - Tek shell komutu (find, ls, df, vb.)
- **http_request** - HTTP GET/POST/PUT/DELETE
- **bash** (zaten vardi, guncellendi)

#### Dosya & Arama (4 yeni)
- **file_search** - Glob pattern ile dosya arama (**/*.js)
- **grep_search** - Icerik arama (ripgrep veya grep)
- **filesystem**, **list_dir** (zaten vardi)

#### Yönetim & Verimlilik (6 yeni)
- **todo_write** - Yapilacaklar listesi (list/add/done/remove)
- **kanban** - Kanban board (todo/in_progress/done kolonlar)
- **memory_search** - Kalici hafizada ve session'larda arama
- **cron_create** - Zamanlanmis gorev olusturma
- **notebook_edit** - Jupyter notebook hucre duzenleme
- **delegate_task** - Alt-agent gorev devretme

#### AI & Medya (zaten vardi + Pollinations fallback)
- **image_generation** - v4.8.4'te Pollinations.ai (ucretsiz) eklendi
- **media_understanding** - Gorsel analiz (OpenAI/Anthropic/Groq)
- **text_to_speech** - macOS say / edge-tts

### İyilestirmeler
- **Tool calling tam entegre** - v4.8.0'da basladi, v4.9.1'de tamamlandi
- **OpenAI uyumlu tool calling** - MiniMax, OpenAI, Anthropic, Groq hepsi
- **Auto-fallback** - Key yoksa ucretsiz alternatife gec (Pollinations)
- **Tool UI feedback** - Her tool cagrisi 🔧 Tool: ... ile gosteriliyor

### Düzeltmeler
- **macos.js** (tek dosya, birden fazla tool) → 6 ayri dosyaya bolundu
- **file_search.js** syntax hatasi (JSDoc icindeki yildiz) duzeltildi
- **REPL'in tool registry** - Yeni tool'lar REPL acilisinda otomatik yukleniyor

### Toplam Ilerleme
- v2.23 (baslangic): ~12 tool
- v3.0-v4.0: +5 tool (brand, audit, cost, dashboard, seo)
- v4.5-v4.7: +8 tool (xp, team, naturehub, medium, repl, vb.)
- v4.8: Tool calling tam entegre (28 tool)
- **v4.9.1: 45 tool** - Parton'un vizyonu: "kendi araçlarim olsun"

### Kullanim
```bash
natureco repl
> "Yarin 14:00 doktor randevum var"      # calendar_add
> "Spotify ac"                            # mac_app_open
> "src/ icindeki TODO'lari bul"            # grep_search
> "Python ile 2+2 hesapla"                # code_execution
> "Tum TODO'lari goster"                  # todo_write
```

## [5.1.0] - 2026-06-22 — "SELF-GENERATING SKILLS"

### Yeni: skill_generate Tool (48. Tool)
Parton'un vizyonu: "Ihtiyaca gore skill yoksa kendi uretsin". LLM ile yeni bir skill talimati uretir, diske kaydeder ve hemen kullanima sunar.

#### Nasil calisir
1. Kullanici REPL'de bir istek yapar (ornek: "PDF dosyalarini birlestir")
2. Mevcut 47 tool/skill ile cozum yoksa `skill_generate` otomatik devreye girer
3. LLM'a (MiniMax, OpenAI, vs) skill taslagi uretmesi icin istek gonderilir
4. SKILL.md + metadata.json `~/.natureco/skills/<auto-name>/` altina kaydedilir
5. Skill hemen REPL'de kullanilabilir olur

#### Test
```
> "PDF dosyalarini tek bir PDF dosyasinda birlestir"
   Tool: skill_generate
   Args: {"taskDescription":"..."}
   Result: skill olusturuldu, hemen kullanilabilir!
```

### Duzeltmeler
- **file_search regex bug**: `**/*.js` pattern'i patliyordu (`Nothing to repeat`). Placeholder + escape sirasini degistirdik, artik calisiyor.
- **v4.5.1 tui.C.cyan/accent**: TUI engine palette'inde yoktu, `amber` ile degistirildi.
- **code_v5.js legacy code komutu**: v5.0'da eski v2.23 kodu eski yere fallback (`--legacy` flag).

### Istatistikler (final)
- **Toplam tool**: 48 (Phase 9'da 1'den basladi)
- **Toplam komut**: 100+
- **Toplam satır kod**: ~6000 (bin + src)
- **Phase 1-9**: 9 buyuk iterasyon
- **Patch versiyonlari (v4.6-v5.1)**: 14+
- **npm latest**: 5.1.0
- **CHANGELOG**: tam
- **README**: v4.5+, guncel
- **Doc (natureco.me/cli)**: 9116 char, hazir
- **Pazarlama**: HN, Reddit, Medium yazilari hazir

### Ozellik Matrisi (Final)
- **AI & Media (6):** image_generation, media_understanding, text_to_speech, llm_task, canvas, audio_understanding
- **Dosya (6):** read_file, write_file, list_dir, filesystem, file_search, grep_search
- **Sistem (5):** bash, code_execution, shell_command, http_request, git
- **Web (6):** web_search, web_readability, exa_search, duckduckgo, firecrawl, browser
- **macOS Native (6):** calendar_add, reminder_add, notes_add, mac_notify, mac_app_open, mac_app_quit
- **Verimlilik (5):** todo_write, kanban, memory_search, cron_create, notebook_edit
- **Sistem Tools (5):** delegate_task, skills_marketplace, skills_autoload, skill_generate, audio_understanding
- **Diger (8):** document_extract, image_generation, duckduckgo, exa_search, firecrawl, http, audio_understanding, document_extract

### Yayin Bilgisi
- **NPM**: https://npmjs.com/package/natureco-cli
- **Versiyon**: 5.1.0
- **Kurulum**: `npm install -g natureco-cli`
- **Lisans**: MIT

## [5.3.0] - 2026-06-22 — "VOICE EDITION + AUTO-MEMORY"

### Yeni: voice_chat Tool (52. Tool)
Parton'un vizyonu: "Bilgisayarla konusayim".
- macOS'ta mikrofondan ses kaydi (`rec` + `sox`)
- Whisper API ile ses → metin donusumu (Turkce)
- Cevabi macOS `say` ile sesli oku
- Hands-free agent kullanimi

### Yeni: Otomatik Memory Extractor (REPL'e entegre)
v5.3.0 ile REPL, kullanicinin kişisel bilgi verdigini anlayip otomatik kaydeder:
- 'adım X' → memory'ye 'Adı: X' yaz
- 'sevdiğim X' → preference kategorisinde
- 'ben X yapıyorum' → work kategorisinde
- 'X tutkunuyum' → hobby kategorisinde
- 'sen benim patronumsun' → botName='Patronum' olarak degistir
- 'adın X olsun' → botName=X olarak kaydet

Bu sayede Parton'un vizyonu gerceklesiyor: "her seferinde hatirlatmayacagim, beni hatirlayacak".

### Bagimlilik Temizligi (v5.2.1)
- chalk 4 → 5
- commander 11 → 12
- pino 8 → 9
- json5 kaldirildi (transitive dependency)
- npm audit temizlendi

### Testler (51 → 52 tool)
- %88 basarili test (Parton'un son test raporu)
- Tum Phase 1 bug'lari duzeltildi
- macOS native integration tamamlandi
