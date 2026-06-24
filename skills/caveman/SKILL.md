---
name: cavecrew
description: Token tasarrufu için subagent delegasyon karar rehberi. Ana thread cavecrew subagent'larına (investigator/builder/reviewer) ne zaman delege edeceğini bilir. Subagent çıktıları caveman-compressed formatta döner → %60 daha küçük context.
metadata: {"natureco": {"requires": {"bins": []}, "os": ["darwin","linux","win32"]}}
---

# Cavecrew Skill (Token Tasarrufu Subagent Pattern)

Subagent çıktıları main context'e aynen inject edilir. Vanilla Explore 2k token prose dönerse → 2k token harcarsın. Cavecrew ~700 token döner. 20 delegasyon = context bitme vs işi bitirme farkı.

## Hangi Subagent Ne Zaman

| İş | Kullan |
|-----|-------|
| "X nerede tanımlı / Y'yi kim çağırıyor / Z'nin kullanımları" | `cavecrew-investigator` |
| Aynısı + mimari yorum | vanilla `Explore` |
| Cerrahi edit, ≤2 dosya | `cavecrew-builder` |
| Yeni feature / 3+ dosya / cross-cutting | Ana thread veya `feature-dev:code-architect` |
| Diff/branch/file review (bug) | `cavecrew-reviewer` |
| Derin code review (gerekçe + alternatifler) | vanilla `Code Reviewer` |
| 1 satır cevap, zaten biliyorsun | Ana thread, subagent yok |

**Kural:** 1/3 token istiyorsan → cavecrew. Prose istiyorsan → vanilla.

## Output Formatları (Subagent sözleşmeleri)

**`cavecrew-investigator`:**
```
<Header>:
- path:line — `symbol` — kısa not
totals: <sayım>.
```
veya `No match.`

**`cavecrew-builder`:**
```
<path:line-range> — <change ≤10 kelime>.
verified: <re-read OK | mismatch @ path:line>.
```
veya `too-big.` / `needs-confirm.` / `ambiguous.` / `regressed.`

**`cavecrew-reviewer`:**
```
path:line: <emoji> <severity>: <problem>. <fix>.
totals: N🔴 N🟡 N🔵 N❓
```
veya `No issues.`

## Chaining (Sıralı Çağrı)

**Locate → fix → verify** (en yaygın):
1. `cavecrew-investigator` site listesi döner
2. Ana thread 1-2 site seçer, `cavecrew-builder`'a path verir
3. `cavecrew-reviewer` diff'i inceler

**Parallel scout** (geniş investigation):
Bir mesajda 2-3 `cavecrew-investigator` çağır (farklı açılar: defs/callers/tests). Ana thread'de topla.

**Single-shot edit** (site zaten biliniyor):
Investigator atla, direkt `cavecrew-builder`'a path:line ver.

## YAPMA

- `cavecrew-builder` → dosya bilinmiyorsa YAPMA. Önce investigator.
- 5-dosya refactor'da `investigator → builder` chain YAPMA. Builder `too-big.` döner.
- `cavecrew-reviewer`'dan "genel feedback" isteme YAPMA. Sadece findings.
- Prose bekleme YAPMA. Cavecrew output yapısal, kuru. İnsan okuyacaksa paraphrase et.

## Auto-clarity

Security uyarıları, irreversible-action onayları — subagent'lar caveman'dan normal İngilizce'ye geçer. Sonra devam.
