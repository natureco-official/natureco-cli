---
name: caveman-compress
description: Doğal dil dosyalarını (CLAUDE.md, memory, todo, preferences) caveman formatına sıkıştırır. Token tasarrufu. Teknik içerik (kod, URL, path) korunur. /caveman-compress FILEPATH veya "compress memory file" tetikleyicisi.
metadata: {"natureco": {"requires": {"bins": ["python3"]}, "os": ["darwin","linux","win32"]}}
---

# Caveman Compress Skill

Doğal dil dosyalarını caveman-speak'e sıkıştır. Input token tasarrufu. Compressed dosya orijinalin yerine geçer. Backup `FILE.original.md` olarak saklanır.

## Tetikleyici

`/caveman-compress  filepath` veya "compress memory file" dediğinde.

## Sıkıştırma Kuralları

### ÇIKAR
- Article: a, an, the
- Filler: just, really, basically, actually, simply, essentially, generally
- Pleasantries: "sure", "certainly", "of course", "happy to"
- Hedging: "it might be worth", "you could consider"
- Redundant: "in order to" → "to", "make sure to" → "ensure"
- Connective fluff: "however", "furthermore", "additionally"

### KORU (Asla değiştirme)
- Kod blokları (fenced ``` ve indented)
- Inline code (`backtick`)
- URL'ler ve linkler (tam URL, markdown link)
- File paths (`/src/components/...`)
- Komutlar (`npm install`, `git commit`, `docker build`)
- Teknik terimler (kütüphane, API, protokol isimleri)
- Özel isimler (proje, kişi, şirket)
- Tarihler, versiyon, numerik değerler
- Env değişkenleri (`$HOME`, `NODE_ENV`)

### YAPIYI KORU
- Tüm markdown başlıkları (tam metin)
- Bullet point hiyerarşisi (nesting)
- Numaralı listeler (numaralar)
- Tablolar (hücre metni sıkıştırılabilir, yapı korunur)
- Frontmatter/YAML header

### SIKIŞTIR
- Kısa eş anlamlı: "big" not "extensive", "fix" not "implement a solution for"
- Fragment OK: "Run tests before commit" not "You should always run tests before committing"
- "you should", "make sure to", "remember to" → sadece eylemi söyle
- Aynı şeyi söyleyen fazla bullet'ları birleştir
- Birden fazla örnek aynı pattern'i gösteriyorsa bir tane bırak

## KRİTİK KURAL

```...``` içindeki her şey **TAM KORUNMALI**. Yapma:
- comment silme
- spacing kaldırma
- satır sırası değiştirme
- komut kısaltma
- hiçbir şeyi basitleştirme

Inline code (`...`) da tam korunmalı. Backtick içinde değişiklik yapma.

## Pattern

**ÖNCE:**
> You should always make sure to run the test suite before pushing any changes to the main branch. This is important because it helps catch bugs early and prevents broken builds from being deployed to production.

**SONRA:**
> Run tests before push to main. Catch bugs early, prevent broken prod deploys.

**ÖNCE:**
> The application uses a microservices architecture with the following components. The API gateway handles all incoming requests and routes them to the appropriate service. The authentication service is responsible for managing user sessions and JWT tokens.

**SONRA:**
> Microservices architecture. API gateway route all requests to services. Auth service manage user sessions + JWT tokens.

## Sınırlar

- **Sadece** doğal dil dosyaları sıkıştır (.md, .txt, .typ, extensionless)
- **Asla** değiştirme: .py, .js, .ts, .json, .yaml, .yml, .toml, .env, .lock, .css, .html, .xml, .sql, .sh
- Karışık içerikte **sadece prose** kısımlarını sıkıştır
- Emin değilsen → değiştirme
- Backup `FILE.original.md` olarak saklanır, **asla onu sıkıştırma**
