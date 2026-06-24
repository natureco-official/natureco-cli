# NatureCo CLI — Test Playbook (Yayın Öncesi)
**Tarih:** 2026-06-22
**Versiyon:** v4.4.0
**Test ortamı:** macOS, Node 18+, gerçek MiniMax API key

---

## 🎯 AMAÇ
NatureCo CLI'ı **yayınlamadan önce** gerçek kullanıcı gibi dene, hataları bul, deneyimi gözlemle.

---

## 📋 TEST AKIŞI (45 dakika)

### 🟢 AŞAMA 1: İLK KURULUM (5 dk)
**Hedef:** Sıfırdan kurulum deneyimi

```bash
# 1. Mevcut config'i yedekle (test için)
cp ~/.natureco/config.json ~/.natureco/config.json.bak

# 2. Config'i sil — first-run deneyimini test et
rm ~/.natureco/config.json

# 3. NatureCo'yu çalıştır
cd ~/Projects/natureco-cli
node bin/natureco.js
```

**Beklenen:** Splash → setup wizard → API key sorma

**Test et:**
- [ ] Splash animasyonu 1-2 saniye sürüyor
- [ ] Welcome card görünüyor (logo, kullanıcı, durum)
- [ ] Setup wizard açılıyor
- [ ] Provider seçimi çalışıyor (Groq, MiniMax, OpenAI seçenekleri)
- [ ] API key alındıktan sonra config kaydediliyor
- [ ] Welcome card tekrar gösteriliyor (günlük ipucu değişmiş olabilir)

**Manuel setup (CLI üzerinden):**
```bash
node bin/natureco.js config set providerApiKey 'sk-cp-FUXmmW8LOH09diXWyYtB0I1y5nG7PpGP0rFBDDNt_ScQai-R_EWStNPi_gbCohXFW27Yws4eT0ZtVQ87pilmtETtqVZlsq-WIIjjZIhe4b2skmTqtW7dsbY'
node bin/natureco.js config set providerUrl 'https://api.minimax.io'
node bin/natureco.js config set providerModel 'MiniMax-M2.5'
```

---

### 🟡 AŞAMA 2: GERÇEK LLM TESTİ (10 dk)
**Hedef:** NatureCo → MiniMax entegrasyonu

```bash
# Basit soru
node bin/natureco.js ask "Türkiye'nin başkenti neresidir?"

# Kod sorusu
node bin/natureco.js ask "Python'da fibonacci hesaplayan fonksiyon yaz"

# Yaratıcı soru
node bin/natureco.js ask "Bir kedi hakkında kısa şiir yaz Türkçe"

# Çok dilli test
node bin/natureco.js ask "Hello, how are you? Answer in 1 sentence."
```

**Beklenen:**
- Spinner animasyonu görünüyor
- 2-5 saniye içinde cevap geliyor
- Türkçe cevaplar doğal ve mantıklı
- Reasoning içeriği (eğer gösteriliyorsa) Türkçe

**Test et:**
- [ ] Her komutta spinner görünüyor
- [ ] Cevaplar geliyor (hata yok)
- [ ] Türkçe doğru anlaşılıyor
- [ ] Reasoning (varsa) mantıklı
- [ ] Token kullanımı görünüyor (audit/cost'ta)

---

### 🔵 AŞAMA 3: KOMUTLAR (15 dk)
**Hedef:** Tüm CLI komutlarını gerçek test

```bash
# === Doctor — sistem sağlığı ===
node bin/natureco.js doctor
node bin/natureco.js doctor check apiKeyValid
node bin/natureco.js doctor check dataDirs

# === Audit — log yönetimi ===
node bin/natureco.js audit today        # Bugünkü loglar
node bin/natureco.js audit stats        # İstatistik
node bin/natureco.js audit files        # Dosya listesi
node bin/natureco.js audit search "ask" # 'ask' içeren loglar

# === Cost — maliyet takibi ===
node bin/natureco.js cost today
node bin/natureco.js cost budget
node bin/natureco.js cost prices
node bin/natureco.js cost model "Selam"

# === Skills — self-evolving ===
node bin/natureco.js skills list
node bin/natureco.js skills suggest

# === Team — multi-agent ===
node bin/natureco.js team list
node bin/natureco.js team status

# === XP — gamification ===
node bin/natureco.js xp
node bin/natureco.js xp rewards

# === SEO ===
node bin/natureco.js seo audit https://natureco.me

# === Setup ===
node bin/natureco.js setup status
```

**Beklenen:** Her komut:
- TUI tablo/border'lı çıktı
- Renkli, hizalı
- Hata yok, çıktı mantıklı

**Test et:**
- [ ] Tüm komutlar çalışıyor
- [ ] TUI tablo border'lar düzgün
- [ ] Renkler doğru (terminal 256-color destekli)
- [ ] Çıktılar bozuk değil (Türkçe karakterler OK)
- [ ] Hata mesajları güzel (varsa pretty error box'ı)

---

### 🟣 AŞAMA 4: STRESS & GERÇEK KULLANIM (10 dk)
**Hedef:** Gerçek bir iş günü simülasyonu

```bash
# 10 ardışık soru (rate limit testi)
for i in {1..10}; do
  echo "=== Soru $i ==="
  node bin/natureco.js ask "Soru $i: Türkiye'nin $i. büyük şehri hangisidir?"
done

# Karmaşık görev
node bin/natureco.js ask "Bana bir TypeScript interface'i yaz: User { id, name, email, createdAt, role: 'admin' | 'user' }, Zod schema ile birlikte"

# Çok dilli (Türkçe + İngilizce karışık)
node bin/natureco.js ask "Translate to English: 'Merhaba dünya, nasılsın?'"
```

**Test et:**
- [ ] Rate limit'e takılmıyor
- [ ] Karmaşık promptlar işleniyor
- [ ] Token limit aşımı güzel handle ediliyor
- [ ] Audit log'da 10+ kayıt var
- [ ] Cost'ta birikim görünüyor

---

### 🔴 AŞAMA 5: EDGE CASES (5 dk)
**Hedef:** Hata senaryoları

```bash
# Boş soru
node bin/natureco.js ask ""

# Çok uzun soru
LONG=$(python3 -c "print('a' * 10000)")
node bin/natureco.js ask "$LONG"

# Türkçe özel karakterler
node bin/natureco.js ask "Türkçe: ğüşıöç ĞÜŞIÖÇ"

# Emoji
node bin/natureco.js ask "Selam 🚀🌿🎉"

# Çok dilli
node bin/natureco.js ask "Write a haiku about coding. Türkçe çevir."

# --help flag'leri
node bin/natureco.js --help
node bin/natureco.js --version
node bin/natureco.js --no-splash
node bin/natureco.js --plain
```

**Test et:**
- [ ] Boş input güzel handle ediliyor
- [ ] Uzun input truncate ediliyor
- [ ] Özel karakterler bozuk değil
- [ ] Emoji görünüyor
- [ ] --no-splash splash'siz çalışıyor
- [ ] --plain renksiz çalışıyor

---

## 🔄 GERİ ALMA

Test bittikten sonra:
```bash
# Config'i geri al
cp ~/.natureco/config.json.bak ~/.natureco/config.json

# Veya sıfırdan başla
rm -rf ~/.natureco/
node bin/natureco.js  # First-run tetiklenir
```

---

## 📊 TEST SONUÇLARI

Tamamladıktan sonra bu tabloyu doldur:

| Aşama | Durum | Notlar |
|-------|-------|--------|
| 1. İlk kurulum | ☐ | |
| 2. Gerçek LLM | ☐ | |
| 3. Komutlar | ☐ | |
| 4. Stress | ☐ | |
| 5. Edge cases | ☐ | |

---

## 🐞 BULUNAN BUGLAR

| Komut | Beklenen | Gerçekleşen | Öncelik |
|-------|---------|-------------|---------|
| | | | |
| | | | |

---

## 💡 İYİLEŞTİRME ÖNERİLERİ

- [ ]
- [ ]
- [ ]
