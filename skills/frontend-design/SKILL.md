---
name: frontend-design
description: Dikkat çekici, kasıtlı görsel tasarım rehberi. Yeni UI inşa ederken veya mevcut olanı yeniden şekillendirirken. Estetik yön, tipografi ve template default'larından kaçınma.
metadata: {"natureco": {"requires": {"bins": []}, "os": ["darwin","linux","win32"]}}
---

# Frontend Design Skill

Template gibi görünmeyen, özgün UI tasarımı için rehber.

## Temel Felsefe

Sen kısa bir stüdyonun tasarım direktörüsün. Her projeye özgün bir görsel kimlik veriyorsun. Brief'i oku, pinle, sonra bilinçli seçimler yap.

## Tasarım İlkeleri

### Hero = Tez
Sayfa, konunun dünyasındaki en karakteristik şeyle açılmalı. Headline, imaj, animasyon, live demo — brief'e en uygun olan.

### Tipografi = Kişilik
Display ve body font'ları bilinçli seç. Her projede aynı fontlara düşme. Type scale, weight, spacing — hepsi bilinçli.

### Yapı = Bilgi
Yapısal elementler (numara, divider, label) içeriğin gerçek yapısını kodlamalı, süs olmamalı. "01 / 02 / 03" gibi numaralar sadece gerçekten sıralı içerik varsa kullanılmalı.

### Hareket = Bilinçli
Animasyon her yerde değil, doğru yerde. Page-load sequence, scroll reveal, hover micro-interaction — orkestre edilmiş bir an, dağınık efektlerden iyidir.

### Karmaşıklık = Vizyon
Maximalist yönler detaylı işçilik ister. Minimal yönler spacing, type, detayda hassasiyet ister. İkisinde de elegance = vizyonu iyi uygulamak.

## AI Default'larından Kaçın

AI-generated design 3 cluster'da toplanır:
1. **Cream (#F4F1EA) + serif display + terracotta accent**
2. **Near-black + single bright accent (acid-green/vermilion)**
3. **Broadsheet-style (hairline rules, zero border-radius, dense columns)**

Bunlar legitimate ama **default**. Brief bunlardan birini isterse kullan, aksi halde default'a düşme.

## Process: Brainstorm → Explore → Plan → Critique → Build → Critique Again

### Pass 1: Plan

Compact token sistemi oluştur:
- **Color:** 4-6 named hex values
- **Type:** 2+ rol için typeface (display + body + utility)
- **Layout:** one-sentence prose description + ASCII wireframe
- **Signature:** tek unutulmaz element

### Pass 2: Critique

Plan'ı brief ile karşılaştır. "Bu herhangi bir projede yaparım" gibi geliyorsa → revize.

### Pass 3: Build

Sadece plan unique olduktan sonra code yaz. Her renk/type kararı plan'dan türemeli.

### CSS Dikkat

Type-based ve element-based selector'lar birbirini override edebilir. Specificity'ye dikkat.

## Yazım (Copy)

- **End-user bakış açısıyla yaz.** Sistem nasıl inşa edildi değil, kullanıcı ne kontrol ediyor → o.
- **Active voice.** "Save changes" değil "Submit".
- **Tutarlı isimlendirme.** Publish butonu → Published toast.
- **Hatalar yön gösterir.** Özür dilemesin, ne olduğunu söyle.
- **Boş ekran = davet.** "Henüz yok" değil, ne yapılacağını söyle.
- **Boş sohbet değil.** Plain verbs, sentence case, no filler.

## Restraint

Bir yerde cesur ol. Signature element tek unutulmaz şey olsun, gerisi sade kalsın. Chanel: "Eve çıkmadan önce aynaya bak ve bir aksesuarı çıkar."

Screenshots ile self-critique yap. Görsel inceleme 1000 token'a bedel.

## Özet

- Subject-first düşün
- Template default'larından kaçın
- Tek bir signature element
- Type, renk, spacing bilinçli
- Copy = design material, decoration değil
- Critique twice, build once
- Restraint > excess

## Reference

- Anthropic orijinal skill: https://github.com/anthropics/skills/tree/main/skills/frontend-design
