# Notes — Index

> **Bu sharded hafıza dosyalarıdır. SOUL.md sadece bu index'e yönlendirir, detay sharded dosyalardadır.**
> **Güncelleme: 24 Haziran 2026**

## Dosya Haritası

| Dosya | İçerik | Ne Zaman Oku |
|-------|--------|--------------|
| **INDEX.md** (bu dosya) | Index, navigation, sistem açıklaması | Her session başı |
| **note1.md** | Patron bilgileri (Gencay), NatureCo CLI kimliği, çalışma tarzı | Persona/karakter işi |
| **note2.md** | Proje yapısı, 120+ komut, build/publish workflow | Komut/release işi |
| **note3.md** | Tokens, dosya yolları, kırmızı çizgiler, masking çözümleri | Token/publish işi |
| **note4.md** | Workflow template'leri (npm release, git push, test) | Release/publish işi |
| **note5.md** | Skills & tools, MCP, channels, integrations | Skill/tool yönetimi |

## Kullanım

Detaylı bilgiye ihtiyaç olduğunda:
```bash
# Önce bu dosyaya bak
cat soul/notes/INDEX.md

# İlgili sharded dosyayı oku
cat soul/notes/note1.md  # Patron & persona
cat soul/notes/note2.md  # Proje yapısı
# vs.
```

## Sharding Kuralları

1. **SOUL.md** her session başında yüklenir (sadece bu index bilgisi + kritik path'ler)
2. **Detay gerektiğinde** ilgili `notes/note{N}.md` dosyası `read_file` ile okunur
3. **Yeni bilgi** ilgili sharded dosyaya eklenir + SOUL.md'de kısa referans kalır
4. **Sonsuz ölçeklenebilir:** `note6.md`, `note7.md`... eklenebilir

## Master Reference (SOUL.md'de tutulan kısımlar)

- **Patron:** Gencay Olgun, "Patron" diye hitap (asla "Parton" değil)
- **Ajan kanalı:** Telegram (varsayılan), WhatsApp, iMessage, Discord, Slack
- **Token:** `/Users/gencay/Projects/natureco-cli/.npmrc` (chmod 600)
- **GitHub:** `natureco-official/natureco-cli`
- **Çilek emoji yasağı:** 🍓 ASLA kullanma
- **Patch cascade:** 5+ → minor bump
- **Latest version:** v5.6.46 (npm)
- **Estetik:** Legacy CLI tarzı (bold cyan + kategori başlıkları + emoji + Panel), İngilizce-first
- **Session kuralı:** "Benden onay bekleme her zaman devam et ben dur diyane kadar"
