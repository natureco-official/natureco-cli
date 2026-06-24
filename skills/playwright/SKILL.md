---
name: playwright
description: Microsoft Playwright MCP ile browser otomasyonu. Sayfa açma, tıklama, form doldurma, ekran görüntüsü alma, accessibility snapshot ve JavaScript çalıştırma.
metadata: {"natureco": {"requires": {"bins": ["npx", "node"]}, "os": ["darwin","linux","win32"]}}
---

# Playwright Skill (Browser Otomasyonu)

Microsoft'un `@playwright/mcp` server'ı ile gerçek browser'da (Chromium/Firefox/WebKit) işlem yap.

## Ne Zaman Kullan

- Web sayfası açıp DOM'u incelemek (sadece HTML değil, gerçek JS çalıştırma)
- Buton tıklamak, form doldurmak, hover/drag/scroll
- Ekran görüntüsü almak
- Accessibility snapshot için (model pixel yerine yapı görsün)
- Sayfada JavaScript çalıştırmak (veri çekmek veya davranış test etmek)
- Multi-step akış (login, search, checkout) test etmek
- UI end-to-end doğrulaması

**Kullanma:** basit HTML scraping için `curl` + `web_extract` yeterli.

## Kurulum

```bash
# Claude Code'a MCP server olarak ekle
claude mcp add playwright npx @playwright/mcp@latest

# Proje-scoped
claude mcp add playwright -s project npx @playwright/mcp@latest
```

İlk çalıştırmada npx `@playwright/mcp` ve Playwright browser bundle (~150 MB) indirilir.

## Tool'lar (En Sık Kullanılanlar)

### Navigasyon
- `browser_navigate(url)` — URL aç
- `browser_navigate_back()` / `browser_navigate_forward()`
- `browser_close()`

### Gözlem
- `browser_snapshot()` — **en kullanışlı tool**. Accessibility tree + element ref'leri (`[ref=42]`)
- `browser_take_screenshot(filename?, fullPage?, type?)` — PNG/JPEG screenshot
- `browser_console_messages(onlyErrors?)` — console.log çıktısı
- `browser_evaluate(function)` — sayfada JS çalıştır

### Etkileşim
- `browser_click(element, ref)`
- `browser_type(element, ref, text, slowly?)`
- `browser_hover(element, ref)`
- `browser_drag(fromElement, fromRef, toElement, toRef)`
- `browser_select_option(element, ref, values)`
- `browser_press_key(key)` — Enter, Escape, Tab, ArrowDown
- `browser_scroll(direction, amount?)` — up/down/left/right

### Bekleme
- `browser_wait_for(time?, text?, textGone?)`

### Tablar
- `browser_tabs(action, index?)` — list/new/select/close

## Önerilen Workflow

1. `browser_navigate(url)` → `browser_snapshot()` (tersi değil!)
2. Major DOM değişiklikten sonra **mutlaka** yeni snapshot
3. **Snapshot tercih et**, screenshot sadece visual review için
4. Veri çekmek için `browser_evaluate` daha hızlı
5. İş bitince `browser_close()`

## Login Pattern

```
1. browser_navigate("https://example.com/login")
2. browser_snapshot()
3. browser_type("Email", "[ref=12]", "user@example.com")
4. browser_type("Password", "[ref=14]", "...")
5. browser_click("Sign in", "[ref=18]")
6. browser_snapshot()  # giriş doğrula
```

## Konfigürasyon

```bash
claude mcp add playwright npx @playwright/mcp@latest -e HEADLESS=false  # görünür browser
claude mcp add playwright npx @playwright/mcp@latest -e BROWSER=firefox
claude mcp add playwright npx @playwright/mcp@latest -e ISOLATED=true    # temiz profil
```

Env değişkenleri:
- `HEADLESS` — true (default) veya false
- `BROWSER` — chromium, firefox, webkit, msedge
- `ISOLATED` — true = ephemeral profile
- `VIEWPORT_SIZE` — default 1280x720
- `USER_DATA_DIR` — persistent profil yolu
- `CAPTURE_MODE` — screenshot/snapshot/none

## Sınırlamalar

- Dosya download dialog'ları native değil → JS ile tetikle
- Bazı siteler automation'ı algılar → stealth plugin veya USER_DATA_DIR kullan
- ~300 MB per browser context
- Cold start 5-10sn
- WebSocket/SSE sayfalar flaky olabilir → generous timeout

## Debug

- `browser_console_messages()` — genelde click'in neden başarısız olduğunu gösterir
- Click işe yaramadıysa → fresh snapshot al (ref değişmiş olabilir)
- CAPTCHA/login gibi durumlar için `ISOLATED=false` ve gerçek USER_DATA_DIR

## Reference

- Server: https://github.com/microsoft/playwright-mcp
- Playwright: https://playwright.dev/docs/intro
- MCP Spec: https://modelcontextprotocol.io
