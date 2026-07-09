/**
 * tr-text — Turkish-aware text folding for case-insensitive, robust substring matching.
 *
 * WHY THIS EXISTS (real bug, verified):
 *   JavaScript's String.prototype.toLowerCase() is locale-INSENSITIVE. On the dotted
 *   capital "İ" (U+0130) it produces "i̇" (ASCII i + COMBINING DOT ABOVE U+0307), which
 *   does NOT equal a plain "i". So the naive `text.toLowerCase().includes(query)` used by
 *   memory recall silently MISSES every capitalized Turkish word:
 *     "İstanbul".toLowerCase() -> "i̇stanbul"  (query "istanbul" → NO MATCH)
 *     "ISPARTA".toLowerCase()  -> "isparta"    (Turkish query "ısparta" → NO MATCH)
 *   For a Turkish-first product this breaks recall for İstanbul, İzmir, İş, İletişim, …
 *   on every conversation — invisible data loss for millions of users.
 *
 * THE FIX:
 *   Fold all four Turkish "i" letters — İ (dotted upper), I (dotless upper), ı (dotless
 *   lower), i (dotted lower) — to a single canonical 'i' BEFORE lowercasing. This makes
 *   {İstanbul, istanbul, ISTANBUL, ıstanbul} all match query "istanbul", while English
 *   stays intact ("FILE" -> "file", not the Turkish "fıle").
 *
 *   We deliberately do NOT fold ş/ç/ğ/ö/ü — those carry meaning ("şık" elegant ≠ "sık"
 *   frequent), and collapsing them would create wrong matches. Only the notorious
 *   i-dot case-folding trap is normalized.
 *
 * BİLİNÇLİ TAVİZ — ı/i ÇAKIŞMASI:
 *   İ/i ve I/ı, Türkçe'de birbirinin büyük/küçük hali DEĞİL — iki ayrı harf çiftidir
 *   (İ↔i noktalı, I↔ı noktasız). foldTr bu dördünü tek forma indirdiği için, yalnızca
 *   casing'i değil, ı/i ayrımını da kaldırıyor. Sonuç: "kıl" (hair) ve "kil" (clay)
 *   gibi anlamca farklı kelimeler foldTr sonrası aynı olur ("kil"). Bu bilinçli bir
 *   tercih: bir arama/hafıza safety-net'i için "yanlış pozitif" (fazladan eşleşme),
 *   "yanlış negatif"ten (İstanbul'u hiç bulamamak gibi) daha az zararlı kabul edildi.
 *   Bu foldTr'yi tam bir yazım denetleyicisi değil, "bulunabilirlik öncelikli" bir
 *   normalize fonksiyonu yapıyor — birebir imla eşleştirmesi gereken bir yerde
 *   (örn. kullanıcıya gösterilecek metin, otomatik düzeltme) KULLANILMAMALI.
 *
 * Used by both the agent's live recall (memory_tree search/remove) and the human CLI
 * search (memory-lint searchTree) so matching behaves identically everywhere.
 */

/**
 * Fold text for case-insensitive Turkish-safe comparison. Never throws.
 * @param {*} s
 * @returns {string}
 */
function foldTr(s) {
  return String(s == null ? '' : s)
    .replace(/İ/g, 'i') // U+0130 dotted capital  → i  (avoids the U+0307 combining-dot trap)
    .replace(/I/g, 'i') // U+0049 dotless capital → i
    .replace(/ı/g, 'i') // U+0131 dotless lower   → i
    .toLowerCase();
}

/**
 * Turkish-aware, case-insensitive "does haystack contain needle?". Substring — no regex,
 * so query text with (), [], *, ? etc. is matched literally (never interpreted).
 * @returns {boolean}
 */
function foldIncludes(haystack, needle) {
  return foldTr(haystack).includes(foldTr(needle));
}

module.exports = { foldTr, foldIncludes };
