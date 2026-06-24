# Note 2 — Proje Yapısı

> **NatureCo CLI projesinin yapısı, komutları, build/publish workflow.**
> Güncelleme: 24 Haziran 2026

## Proje Konumu

- **Source:** `/Users/gencay/Projects/natureco-cli`
- **npm:** https://www.npmjs.com/package/natureco-cli
- **GitHub:** `natureco-official/natureco-cli`
- **Latest:** v5.6.46
- **License:** MIT
- **Node:** >= 16.0.0 (engines)

## Klasör Yapısı

```
natureco-cli/
├── package.json              # Versiyon + bağımlılıklar
├── bin/natureco.js           # CLI entry point
├── src/
│   ├── commands/             # Typer komutları (120+)
│   ├── tools/                # Tool implementasyonları (57)
│   ├── channels/             # Telegram, Discord, Slack, WhatsApp, iMessage
│   ├── utils/                # Yardımcılar (memory, skills, tools, vb.)
│   └── ...
├── skills/                   # Skill'ler (natureco-cli-release, vb.)
├── soul/                     # SOUL/IDENTITY/AGENTS
│   └── notes/                # SHARDED NOTES (INDEX, note1-5)
├── .natureco/                # Config
├── README.md
├── CHANGELOG.md
├── LAUNCH.md
├── AUDIT.md
├── DEPLOY_v*.md
├── install.sh / install.ps1
├── vitest.config.js
└── test/
```

## Komutlar (120+, 10 kategori)

### Core
- `natureco` — Gateway ekranı
- `natureco setup` — Kurulum sihirbazı
- `natureco login` / `logout` — API key giriş/çıkış
- `natureco doctor` — Sistem sağlık kontrolü (5.6.43+)
- `natureco help` — Tüm komutlar

### Chat
- `natureco chat` — İnteraktif sohbet
- `natureco code` — Kod ajanı
- `natureco ask` — Soru-cevap
- `natureco run` — Tek seferlik çalıştırma

### Channels (10 mesajlaşma platformu)
- `telegram`, `discord`, `slack`, `whatsapp`, `imessage`
- `sms` ve diğerleri

### Tools
- `natureco tools` — Tool listesi
- `natureco mcp` — MCP servers
- `natureco skills` — Skill yönetimi

### Memory & History
- `natureco memory` — Kalıcı hafıza
- `natureco history` — Geçmiş

### System
- `natureco config` — Ayar yönetimi
- `natureco update` — Güncelleme
- `natureco status` — Sistem durumu

## Stack

- **Node.js:** >= 16.0.0
- **12 provider:** anthropic, openai, google, mistral, groq, ollama, xai, minimax, openrouter, ...
- **200+ model:** Tüm provider'lardan
- **57 tool:** Dosya, terminal, web, arama, görsel, müzik, ...
- **3-dosya kişilik sistemi:** SOUL, IDENTITY, AGENTS
- **MCP desteği:** Model Context Protocol
- **Skills sistemi:** Dinamik yetenek yükleme
- **Memory sistemi:** Kalıcı hafıza

## Bağımlılıklar (Yaklaşık)

```json
{
  "dependencies": {
    "typer": "...",
    "rich": "...",
    "anthropic-sdk": "...",
    "openai": "...",
    "telegram-bot-api": "...",
    "discord.js": "...",
    "whatsapp-web.js": "...",
    "@modelcontextprotocol/sdk": "...",
    "...": "..."
  }
}
```

## Test & Doğrulama

```bash
# 1. Syntax check
node --check bin/natureco.js

# 2. Help test
node bin/natureco.js help

# 3. Doctor
natureco doctor

# 4. Setup test
natureco setup --show

# 5. Update check
natureco update --check
```

## Versiyon Geçmişi (24 Haz 2026 itibarıyla)

- **5.6.46** (latest) — README overhaul (İngilizce, hero slogan, badges, ASCII banner, 120+ komut, comparison table)
- **5.6.45** (önceki) — Son minor stable

## Build & Publish (npm)

```bash
cd /Users/gencay/Projects/natureco-cli

# 1. Version
# Edit package.json version
# Edit CHANGELOG.md

# 2. Test
node --check bin/natureco.js
npm test

# 3. Publish
npm publish --access public

# 4. Git
git add -A
git -c user.name="Parton" -c user.email="gencay@natureco.me" commit -m "release: vX.Y.Z <description>"
git tag -a vX.Y.Z -m "vX.Y.Z - <description>"
git push origin master
git push origin vX.Y.Z

# 5. GitHub release
gh release create vX.Y.Z --generate-notes
```

## Install Scripts

- `install.sh` — Linux/macOS kurulum
- `install.ps1` — Windows PowerShell kurulum
- `npm install -g natureco-cli` — npm üzerinden (en kolay)
- `git clone` + `pip install -e .` — dev ortamı
