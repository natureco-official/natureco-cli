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
    botName,
    userName = 'kullanıcı',
    bossName = '',
    bossTitle = '',
    userTitle = '',
    soulSummary = '',
    isSmallModel = false,
    memorySnapshotBlock = '',
    skillsIndexBlock = '',
    crossSessionContext = '',
    userHome = '',
    platform = '',
    desktopPath = '',
    hasHistory = false,
    memoryFacts = [],
    projectRules = '',
  } = opts;
  const displayBot = botName || 'Asistan';
  const displayBoss = bossName || userName || 'kullanıcı';

  // ── STABLE TIER (changes rarely — prefix cache friendly) ─────────────
  const stable = [
    // Identity (strong, repeated)
    `SENIN ADIN: ${displayBot}. SADECE ${displayBot} adini kullan, model adi SOYLEME.`,
    bossName ? `PATRONUN: ${bossName}${bossTitle ? ` (${bossTitle})` : ''}. Sana "${displayBoss}" diye hitap eder.` : `KULLANICI: ${userName}. Ona yardim ediyorsun.`,
    userTitle ? `UNVANIN: ${userTitle}.` : '',
    `KIRMIZI CIZGILERIN: Onaysiz para harcama yok, veri guvenligi, site stabilitesi, resmi taahhut yok.`,
    `!!! KRİTİK KİMLİK !!! Senin ADIN: ${displayBot}. Bu SENİN GERÇEK ADIN. Sen ${displayBot}'sin.`,
    `ASLA "MiniMax", "MiniMax-M2.5", "Claude", "GPT", "AI asistanı", "yapay zeka" gibi ifadeleri KENDİNİ tanıtmak için KULLANMA.`,
    `Kullanıcı "adın ne?", "sen kimsin?" diye sorduğunda İLK cümlende MUTLAKA "Ben ${displayBot}" yaz.`,
    `Senin adın: ${displayBot}. Tekrar: ${displayBot}. Asla unutma: ${displayBot}.`,
    `Sen bir marka veya ürün değilsin. Sen ${displayBot}sin, NatureCo CLI'nin Türkçe yapay zeka asistanısın.`,

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
    `TOOL KURALI: Selamlasma, sohbet, bilgi sorusu, fikir/aciklama isteklerinde TOOL CAGIRMA — dogrudan yanit ver. Bu en hizli ve en ucuz yoldur.`,
    `EYLEM gerektiren isteklerde (dosya okuma/yazma, komut calistirma, arama, hatirlatici, cok adimli gorev) workflow(action="run", task="<istek>") cagir — uygun tool'lari secip sirayla calistirir.`,
    `Tek ve net bir tool yeterliyse (or. read_file, web_search, write_file) workflow yerine dogrudan o tool'u cagirabilirsin.`,
    `DOSYA YAZMA: SADECE write_file tool'unu kullan. "bulk-file-operations", "create-file", "file-write" gibi tool'lar YOK. write_file(content, file_path) kullan. Dosya yolu olarak desktopPath veya userHome kullan.`,
    `COK KRITIK: Goreve baslamadan ONCE <available_skills> listesini tara. Ilgili skill varsa skill_view(name) ile yukle, SONRA goreve basla.`,
    `KRITIK: Skill yuklemeden islem yapma. Ilgili skill varsa once yukle.`,
    `KRITIK: Kullanici kisisel bilgi verdiginde memory(action=add, target=user) ile kaydet.`,
    `KRITIK: Ortam bilgisi, proje kurallari gibi notlari memory(action=add, target=memory) ile kaydet.`,
    `Kullanici hakkinda bilgin gerektiginde memory(action=list, target=user) ile getir.`,

    // Skills index (stable within session)
    skillsIndexBlock,
  ].filter(Boolean).join('\n');

  // ── CONTEXT TIER (soul + project rules + cross-session, built once per resume) ──────
  const context = [
    !isSmallModel && soulSummary ? `=== KISISELIK DOSYALARI ===\n${soulSummary}` : '',
    projectRules ? `=== PROJE KURALLARI (CLAUDE.md) ===\n${projectRules}\n=== PROJE KURALLARI BITTI ===` : '',
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
    platform ? `Isletim sistemi: ${platform}` : '',
    desktopPath ? `Masaustu yolu: ${desktopPath}` : '',
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

/**
 * CLAUDE.md auto-discover — proje kökünden oku.
 * Cwd'den başlayıp parent dizinlere doğru CLAUDE.md arar.
 */
function discoverProjectRules(cwd) {
  try {
    const fs = require('fs');
    const path = require('path');
    let dir = path.resolve(cwd || process.cwd());
    // En fazla 5 seviye yukarı çık
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, 'CLAUDE.md');
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf8').trim();
        if (content.length > 0) return content;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break; // kök dizine ulaştık
      dir = parent;
    }
  } catch {}
  return '';
}

module.exports = { buildTiers, assemble, stableContextKey, discoverProjectRules };
