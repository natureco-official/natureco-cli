---
name: code-refactoring
description: Clean code, SOLID prensipleri ve modern mühendislik pratikleri. Karmaşık kodu basitleştirmek, code smell'leri gidermek, testability artırmak istediğinde bu skill'i yükle.
metadata: {"natureco": {"requires": {"bins": []}, "os": ["darwin","linux","win32"]}}
---

# Code Refactoring Skill

Clean code, SOLID design patterns ve modern yazılım mühendisliği ile kod kalitesini artır.

## Ne Zaman Kullan

- Karmaşık, bakımı zor kodu refactor etmek
- Duplikasyon, karmaşıklık, code smell azaltmak
- Testability ve tasarım tutarlılığı artırmak
- Modülleri yeni feature'ler için güvenle hazırlamak

**Kullanma:** tek satırlık fix, change freeze, sadece dokümantasyon isteği varsa.

## Talimatlar

1. **Code smell'leri değerlendir:** duplikasyon, uzun fonksiyon, yüksek coupling
2. **Refactor planı oluştur:** incremental adımlarla
3. **Küçük dilimler halinde uygula** — davranış sabit kalmalı
4. **Testleri güncelle** ve regression olmadığını doğrula

## Extract Method (Pattern)

```typescript
// ÖNCE
function processOrder(order: Order) {
  // validate
  if (!order.items.length) throw new Error('empty');
  // compute total
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  // save
  db.save({ orderId: order.id, total });
}

// SONRA
function processOrder(order: Order) {
  validateOrder(order);
  const total = computeTotal(order);
  saveOrder(order, total);
}
```

## SOLID Prensipleri

- **S**ingle Responsibility — bir sınıf/fonksiyon tek bir değişim nedeni olmalı
- **O**pen/Closed — extension için açık, modification için kapalı
- **L**iskov Substitution — alt sınıflar üst sınıfların yerine geçebilmeli
- **I**nterface Segregation — interface'ler küçük ve öz olmalı
- **D**ependency Inversion — abstraction'lara bağımlı, concrete'lere değil

## Code Smell Kategorileri

| Smell | Tedavi |
|-------|--------|
| Long Method (>30 satır) | Extract Method |
| Long Class | Extract Class |
| Duplicate Code | Extract Method → call from both |
| Long Parameter List (>4) | Parameter Object |
| Divergent Change | Extract Class (her değişim için bir sınıf) |
| Shotgun Surgery | Move Method, Move Field |
| Feature Envy | Move Method (kendi verisini kullanan sınıfa) |
| Data Clumps | Extract Class |
| Primitive Obsession | Replace Type Code with Class |
| Switch Statements | Replace Conditional with Polymorphism |
| Parallel Inheritance | Move Method/Field |
| Lazy Class | Inline Class |
| Speculative Generality | Collapse Hierarchy |
| Temporary Field | Extract Class |
| Message Chains | Hide Delegate |
| Middle Man | Remove Middle Man |
| Inappropriate Intimacy | Move Method, Extract Class |
| Alternative Classes with Different Interfaces | Rename Method, Move Method |
| Refused Bequest | Replace Inheritance with Delegation |
| Comments | Rename Method (kendi kendini açıklayan) |
| Duplicated Code | Extract Method |

## Output Format

```
## Issues
- <code smell 1>: <path:line>
- <code smell 2>: <path:line>

## Plan
1. <step 1: Extract Method from X to Y>
2. <step 2: Rename Z to W>
...

## Changes
- <path:line-range> — <change>

## Tests
- <verification step>
```

## Güvenlik

- External davranışı explicit onay olmadan değiştirme
- Diff'leri reviewable tut (küçük, atomic)
- Test'ler her zaman geçmeli
