# Note 5 — Skills & Tools

> **NatureCo CLI'ın skill'leri, tool'ları, channels, integrations.**
> Güncelleme: 24 Haziran 2026

## Skills (Mevcut)

### natureco-cli-release
**Konum:** `skills/natureco-cli-release/`
**Ne zaman:** NatureCo CLI release/publish işlemi
**İçerik:** NatureCo CLI release workflow, npm publish, version bump kuralları
**Detay:** `skills/natureco-cli-release/SKILL.md` içinde

### Yeni Skill Ekleme

```bash
# 1. Klasör oluştur
mkdir -p skills/<yeni-skill>/

# 2. SKILL.md oluştur
cat > skills/<yeni-skill>/SKILL.md << 'EOF'
---
name: <skill-name>
description: <1 cümle, ne zaman tetiklenir>
version: 1.0.0
author: Patron
license: MIT
---

# <Skill Adı>

## Ne Zaman Kullanılır
- <durum 1>
- <durum 2>

## Kullanım
\`\`\`bash
<komut>
\`\`\`

## Pitfalls
- ❌ <yapma 1>
- ✅ <yap 1>
EOF

# 3. Test et — ajan otomatik yükler
```

## SKILL.md Yapısı

```
skill-name/
├── SKILL.md              # ZORUNLU
├── scripts/              # OPSİYONEL
│   └── main.py
├── references/           # OPSİYONEL
│   └── api.md
├── assets/               # OPSİYONEL
│   └── template.txt
└── tests/                # OPSİYONEL
```

## Channels (10 Mesajlaşma Platformu)

| Channel | Kullanım |
|---------|----------|
| **Telegram** | Bot API, polling/webhook, slash-prefix komutlar |
| **WhatsApp** | whatsapp-web.js, QR code auth |
| **iMessage** | macOS Messages.app bridge |
| **Discord** | discord.js, slash commands |
| **Slack** | Slack API, slash-prefix |
| **SMS** | Twilio |
| **Matrix** | (opsiyonel) |
| **Signal** | (opsiyonel) |
| **Teams** | Microsoft Graph API |
| **Email** | SMTP/IMAP |

### Channel Single-Consumer Warning

**Telegram, WhatsApp, iMessage** gibi platformlarda **tek consumer** kuralı var. Eğer başka bir gateway aynı bot token'ı kullanıyorsa, bu gateway update'leri alamaz. Çözüm: Diğer consumer'ı durdur.

### Slash-Prefix Pattern (iMessage, WhatsApp)

```python
# Bot only responds to messages starting with /
if not text.startswith('/'):
    return  # ignore, not a command
```

Bu echo loop'ları önler — bot kendi cevaplarına tekrar cevap vermez.

## MCP (Model Context Protocol)

- **SDK:** `@modelcontextprotocol/sdk`
- **Konum:** `src/mcp/`
- **Komut:** `natureco mcp`
- **Amaç:** Harici tool'ları (filesystem, GitHub, database) entegre et

## Tools (57)

### Core
- `read_file`, `write_file`, `patch`, `search_files`
- `terminal`, `execute_code`
- `web_search`, `web_extract`, `browser_*`
- `image_generate`, `text_to_speech`

### Memory & Sessions
- `memory` (tool), `session_search`
- `skills_list`, `skill_view`, `skill_manage`

### Delegation
- `delegate_task` (subagent'lara iş dağıtma)

### Vision
- `vision_analyze` (ekran görüntüsü analizi)
- `browser_vision` (browser'da görsel)

## Integrations (Proje Düzeyinde)

| Integration | Amaç |
|-------------|------|
| **GitHub** | PR, issue, release, Contents API |
| **Cloudflare** | Worker, Pages, R2 |
| **Firebase** | Auth, RTDB, Storage |
| **Supabase** | PostgreSQL, auth |
| **Notion** | Roadmap, docs |
| **Tavily** | Web search |
| **Lemon Squeezy** | Billing (CodeDNA) |

## System Tools

| Tool | Açıklama |
|------|----------|
| **todo** | Görev listesi yönetimi |
| **memory** | Kalıcı hafıza (sınırlı 2200 char) |
| **session_search** | Geçmiş session arama |
| **skill_manage** | Skill oluşturma/güncelleme |

## Build & Deploy

### Local Dev
```bash
git clone https://github.com/natureco-official/natureco-cli.git
cd natureco-cli
npm install
npm link  # global symlink
```

### npm Publish
```bash
npm login
npm publish --access public
```

### Install Methods
```bash
# npm
npm install -g natureco-cli

# Direct
curl -fsSL https://raw.githubusercontent.com/natureco-official/natureco-cli/main/install.sh | bash

# Windows
irm https://raw.githubusercontent.com/natureco-official/natureco-cli/main/install.ps1 | iex

# Dev
git clone ... && cd natureco-cli && npm install
```

## CLI Yapısı (Typer)

```python
import typer
app = typer.Typer(name="natureco", add_completion=False)

@app.command()
def chat():
    """Interactive chat with the AI."""
    ...

@app.command()
def code():
    """Code-focused agent."""
    ...

if __name__ == "__main__":
    app()
```

## Channels Detay

### Telegram
- Bot token: BotFather'dan alınır
- Polling vs Webhook: Polling önerilen (single-consumer)
- Slash commands: `/start`, `/help`, `/reset`

### WhatsApp
- QR code ile auth
- Session persistence (`~/.natureco/whatsapp-session/`)
- Slash-prefix: `/`, `!`

### iMessage
- macOS Messages.app bridge
- `imsg` CLI kullanılır
- Pairing mode varsayılan, allowlist için `natureco imessage allow <numara>`

### Discord
- discord.js
- Slash commands (yeni API)
- Webhooks ile real-time

### Slack
- Bolt SDK
- Slash commands
- Real-time events

## Performans & Güvenlik

- **Rate limiting:** Channel başına ayrı
- **Token güvenliği:** `~/.natureco/` altında, chmod 600
- **Sandbox:** `danger.js` ile risk değerlendirme (HIGH risk onay ister)
- **Audit log:** Tüm kritik işlemler loglanır
