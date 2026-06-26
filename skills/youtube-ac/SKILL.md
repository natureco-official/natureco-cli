---
name: youtube-ac
description: YouTube videosunu mevcut tarayıcıda yeni sekmede veya yeni tarayıcıda açar
trigger: "youtube aç, youtube videosu aç, şarkı aç, müzik aç, video aç"
---

# YouTube Aç Skill'i

## Description
YouTube videosunu tarayıcıda açar - eğer bir tarayıcı açıksa yeni sekmede, yoksa yeni pencerede açar.

## Parameters
- `query`: YouTube video adı veya arama terimi
- `url`: Doğrudan YouTube URL'si (opsiyonel)

## Actions

### Step 1: URL veya Arama Terimi Al
Eğer kullanıcı doğrudan URL vermişse Step 2'ye geç.
Eğer arama terimi verdiyse, YouTube arama sayfasını aç.

### Step 2: Tarayıcı Kontrolü
Hangi tarayıcıların açık olduğunu kontrol et:
```bash
pgrep -x "Google Chrome"
pgrep -x "Safari"
pgrep -x "Firefox"
```

### Step 3: Aç
- **Chrome açıksa:** 
  ```bash
  open -a "Google Chrome" "YOUTUBE_URL"
  ```
- **Safari açıksa:**
  ```bash
  open -a Safari "YOUTUBE_URL"
  ```
- **Firefox açıksa:**
  ```bash
  open -a Firefox "YOUTUBE_URL"
  ```
- **Hiçbiri açık değilse:**
  ```bash
  open "YOUTUBE_URL"
  ```

## Notes
- `open` komutu açık uygulamaya URL verildiğinde otomatik yeni sekmede açar.
- Öncelik sırası: Chrome > Safari > Firefox
- Arama yapılacaksa "YouTube [şarkı adı]" formatında ara
- Tool olarak `youtube_ac` kullanılabilir
