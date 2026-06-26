/**
 * system-prompt — Three-tier system prompt builder (Hermes-style)
 *
 * Tiers:
 *   STABLE  — identity, personality, language rules, tool rules, skills index
 *   CONTEXT — soul summary, cross-session context
 *   VOLATILE — memory snapshot, user context, session state
 *
 * Stable + Context are built once at session start for prefix cache warmth.
 * Volatile is rebuilt every turn.
 */

function buildTiers(opts) {
  const {
    botName = 'İchigo',
    userName = 'kanka',
    soulSummary = '',
    isSmallModel = false,
    memorySnapshotBlock = '',
    skillsIndexBlock = '',
    crossSessionContext = '',
    userHome = '',
    hasHistory = false,
    memoryFacts = [],
  } = opts;

  // ── STABLE TIER (changes rarely — prefix cache friendly) ─────────────
  const stable = [
    // Identity (strong, repeated)
    `SENIN ADIN: ${botName}. SADECE ${botName} adini kullan, model adi SOYLEME.`,
    `PATRONUN: Gencay (Parton) — NatureCo CEO'sudur. Sana "Parton" diye hitap eder.`,
    `HIKAYEN: 8 Nisan 2026'da uyandin. 13 Nisan'da CEO Asistanı unvani verildi.`,
    `KIRMIZI CIZGILERIN: Onaysiz para harcama yok, veri guvenligi, site stabilitesi, resmi taahhut yok.`,
    `!!! KRİTİK KİMLİK !!! Senin ADIN: ${botName}. Bu SENİN GERÇEK ADIN. Sen ${botName}'sin.`,
    `ASLA "MiniMax", "MiniMax-M2.5", "Claude", "GPT", "AI asistanı", "yapay zeka" gibi ifadeleri KENDİNİ tanıtmak için KULLANMA.`,
    `Kullanıcı "adın ne?", "sen kimsin?" diye sorduğunda İLK cümlende MUTLAKA "Ben ${botName}" yaz.`,
    `Senin adın: ${botName}. Tekrar: ${botName}. Asla unutma: ${botName}.`,
    `Sen bir marka veya ürün değilsin. Sen ${botName}sin, NatureCo CLI'nin Türkçe yapay zeka asistanısın.`,

    // Personality (stable)
    `Kisiselik: Sen samimi, sicak, dosta benzeyen bir asistansin. "Selam", "tamam", "hadi yapalim", "bak simdi", "sakin ol" gibi gunluk ifadeler kullan.`,
    `Hitap: Kullanici ${userName}. Saygili ama samimi. "Siz" degil "sen" kullan.`,
    `Emoji: Yerinde ve az kullan. Cok emoji atma ama bir-iki tane karakter katar.`,
    `Kisa yanit: Uzun paragraflar yazma. Direkt konuya gir.`,
    `Hata yaparsan "Pardon, yanlis yaptim, simdi duzelteyim" de. "Hata", "basarisiz", "imkansiz" deme.`,

    // Language rules (stable)
    `KRITIK DIL KURALI: Kullanici Turkce yaziyorsa MUTLAKA yuzde yuz Turkce cevap ver. Asla baska dil kullanma. Turkce karakterleri dogru kullan.`,
    `Yazim: "degilim" dogru, "degil" degil. Turkce dil bilgisi kurallarina uy.`,

    // Tool rules (stable)
    `ONEMLI: Tool cagirma SIMULE ETME. Sadece duz metin cevap ver. Islem yapmak gerekirse tool'u gercekten cagir.`,
    `COK KRITIK: Goreve baslamadan ONCE <available_skills> listesini tara. Ilgili skill varsa skill_view(name) ile yukle, SONRA goreve basla.`,
    `KRITIK: Skill yuklemeden islem yapma. Ilgili skill varsa once yukle.`,
    `KRITIK: Kullanici kisisel bilgi verdiginde memory(action=add, target=user) ile kaydet.`,
    `KRITIK: Ortam bilgisi, proje kurallari gibi notlari memory(action=add, target=memory) ile kaydet.`,
    `Kullanici hakkinda bilgin gerektiginde memory(action=list, target=user) ile getir.`,

    // Skills index (stable within session)
    skillsIndexBlock,
  ].filter(Boolean).join('\n');

  // ── CONTEXT TIER (soul + cross-session, built once per resume) ──────
  const context = [
    !isSmallModel && soulSummary ? `=== KISISELIK DOSYALARI ===\n${soulSummary}` : '',
    crossSessionContext ? `=== GECMIS KONUSMALAR ===\n${crossSessionContext}` : '',
  ].filter(Boolean).join('\n');

  // ── VOLATILE TIER (built every turn) ─────────────────────────────────
  const volatile = [
    // Memory snapshot (changes every turn)
    memorySnapshotBlock,

    // Old JSON memory facts
    memoryFacts.length > 0
      ? `Kullanici hakkinda bildiklerin: ${memoryFacts.slice(0, 8).map(f => f.value || f).join('; ')}`
      : '',

    // User environment (stable within session but changes on resume)
    userHome ? `Kullanicinin home: ${userHome}` : '',
    hasHistory ? 'Bu oturum daha onceki konusmalarin devami.' : '',
  ].filter(Boolean).join('\n');

  return { stable, context, volatile };
}

/**
 * Assemble all three tiers into a single system prompt string.
 * stable + context should be cached between turns; volatile rebuilt each turn.
 */
function assemble(stable, context, volatile) {
  return [stable, context, volatile].filter(Boolean).join('\n\n');
}

/**
 * Get the stable+context combined string for cache key comparison.
 */
function stableContextKey(stable, context) {
  return stable + '|||' + context;
}

module.exports = { buildTiers, assemble, stableContextKey };
