/**
 * memory_write - Memory'ye fact/kayit yaz (v5.1.1)
 *
 * REPL'in extractMemoryFromMessage ozelligini tool olarak expose eder.
 * Kalici hafiza — faktlari kaydeder, puanlar, eskiyenleri temizler
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { writeJsonAtomicSync, readJsonSafeSync } = require("../utils/atomic-file");
const { createMemoryRecord, resolveConflict, factKey } = require("../utils/memory-record");

const MEMORY_DIR = path.join(os.homedir(), ".natureco", "memory");

// Soft cap on per-user fact count. Decay already prunes old/low-importance
// facts; this just bounds the worst-case file size and prompt-injection
// surface. Configurable via NATURECO_MAX_FACTS (default 50, was a hard 15
// that was silently truncating new writes when full).
const MAX_FACTS_PER_USER = (() => {
  const raw = parseInt(process.env.NATURECO_MAX_FACTS || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
})();

function getMemoryFile(username) {
  const name = (username || "default").toLowerCase();
  return path.join(MEMORY_DIR, `${name}.json`);
}

function _emptyMemory(username) {
  return { name: username || "User", nickname: null, botName: null, facts: [], preferences: [] };
}

function loadMemory(username) {
  return readJsonSafeSync(getMemoryFile(username), _emptyMemory(username));
}

function saveMemory(username, memory) {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  memory.lastUpdated = new Date().toISOString();
  writeJsonAtomicSync(getMemoryFile(username), memory);
  return memory;
}

/**
 * Score azalt (eski fact'ler zamanla unutulur).
 * Sıralama veya soft-cap UYGULAMAZ — onu enforceFactLimit yapar
 * (push'tan sonra çağrılır, böylece yeni fact silinmez).
 */
function decayFacts(memory) {
  if (!memory.facts) return memory;
  const now = Date.now();
  memory.facts = memory.facts.map(f => {
    if (!f.score) f.score = 5;
    const ageMs = now - new Date(f.updatedAt || f.createdAt || now).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 30) f.score = Math.max(0, f.score - 3);
    else if (ageDays > 7) f.score = Math.max(0, f.score - 1);
    return f;
  });
  memory.facts = memory.facts.filter(f => (f.score || 0) > 0);
  return memory;
}

/**
 * Soft cap: yeni fact eklenmesinden SONRA uygulanır, böylece az önce
 * yazılan fact eviction kurbanı olmaz. En düşük score + en eski updatedAt
 * önce gider. Cap aşılırsa stderr'e tek satır warn yazar (eski "silent
 * truncate to 15" davranışını gözlemlenebilir hale getirir).
 *
 * @param {{facts: Array<object>}} memory
 * @param {{recentValue?: string}} [opts]  Korunması zorunlu fact (yeni eklenen)
 * @returns the same memory
 */
function enforceFactLimit(memory, opts = {}) {
  if (!memory.facts || memory.facts.length <= MAX_FACTS_PER_USER) return memory;
  const before = memory.facts.length;
  const recent = opts.recentValue ? opts.recentValue.toLowerCase() : null;
  // Sort by score desc, then updatedAt desc (newest+highest first).
  // The just-pushed fact is pinned at the top regardless of its score.
  memory.facts.sort((a, b) => {
    if (recent) {
      if ((a.value || "").toLowerCase() === recent) return -1;
      if ((b.value || "").toLowerCase() === recent) return 1;
    }
    const sa = a.score || 0, sb = b.score || 0;
    if (sa !== sb) return sb - sa;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  memory.facts = memory.facts.slice(0, MAX_FACTS_PER_USER);
  const dropped = before - memory.facts.length;
  if (dropped > 0 && !process.env.NATURECO_QUIET_MEMORY) {
    // eslint-disable-next-line no-console
    console.warn(
      `[memory] cap ${MAX_FACTS_PER_USER} aşıldı, en düşük skorlu ${dropped} fact düşürüldü ` +
      `(NATURECO_MAX_FACTS ile değiştir, NATURECO_QUIET_MEMORY=1 ile sustur)`
    );
  }
  return memory;
}


/**
 * v5.4.9: Memory yazma sonrasi verification — geri oku ve gercekten yazildigini dogrula
 * Self-validation mekanizmasi: tool cagirip "success" demesine ragmen dosya bos olabilir
 */
function verifyMemoryWrite(username, expectedFact, expectedBotName) {
  try {
    const memFile = getMemoryFile(username);
    if (!fs.existsSync(memFile)) {
      return { success: false, error: "Memory dosyasi olusturulamadi: " + memFile };
    }
    const mem = JSON.parse(fs.readFileSync(memFile, "utf8"));

    // Fact verification
    if (expectedFact) {
      const found = (mem.facts || []).some(f => f.value === expectedFact);
      if (!found) {
        return { success: false, error: "Fact memory'de bulunamadi: " + expectedFact };
      }
    }

    // BotName verification
    if (expectedBotName && mem.botName !== expectedBotName) {
      return { success: false, error: "BotName guncellenmedi: " + mem.botName };
    }

    return { success: true, message: "Memory dogrulandi" };
  } catch (e) {
    return { success: false, error: e.message };
  }
}


function addMemory({ username, fact, score = 5, category = "general", botName, nickname, name, source = "tool", confidence = 0.5, ttlMs, userConfirmed = false }) {
  // Username yoksa ve 'name' parametresi varsa, onu username olarak kullan
  // (hitap bicimi icin)
  const effectiveUsername = username || (name && name.toLowerCase()) || 'default';
  if (!effectiveUsername || effectiveUsername === 'default') {
    // Hicbir username yok, default.json'a yaz
  }

  let memory = loadMemory(effectiveUsername);
  memory = decayFacts(memory);

  // identity updates (botName, nickname, name) — name sadece memory.name, username degil
  if (botName) memory.botName = botName;
  if (nickname !== undefined) memory.nickname = nickname;
  if (name) memory.name = name; // Bu memory.name (kullanici gercek adi), username degil

  if (fact) {
    // duplicate kontrol
    const incoming = createMemoryRecord({ value: fact, score, category, source, confidence, ttlMs, userConfirmed, verified: true });
    const key = factKey(fact, category);
    const existing = memory.facts.find(f => factKey(f.value || f, f.category || category) === key);
    if (existing) {
      const sameValue = String(existing.value || existing).toLowerCase() === fact.toLowerCase();
      const previousScore = existing.score || 5;
      const resolved = resolveConflict(existing, incoming);
      Object.assign(existing, resolved.winner);
      if (sameValue) existing.score = Math.min(10, previousScore + 2);
    } else {
      memory.facts.push(incoming);
    }
    // Limit'i ZIM push'tan sonra uygula → yeni eklenen fact düşürülmez.
    memory = enforceFactLimit(memory, { recentValue: fact });
  }

  if (!memory.preferences) memory.preferences = [];
  memory = saveMemory(effectiveUsername, memory);

  // v5.4.9: Verification - geri oku ve dogrula
  const verifyResult = verifyMemoryWrite(effectiveUsername, fact, botName);
  if (!verifyResult.success) {
    return {
      success: false,
      error: "Memory yazildi ama dogrulanamadi: " + verifyResult.error,
      username: effectiveUsername,
    };
  }

  return {
    success: true,
    message: "Memory guncellendi ve dogrulandi",
    username: effectiveUsername,
    verified: true,
    totalFacts: memory.facts.length,
    facts: memory.facts.map(f => ({ value: f.value, score: f.score, category: f.category })),
    botName: memory.botName,
    nickname: memory.nickname,
    name: memory.name,
  };
}

function clearMemory({ username }) {
  if (!username) return { success: false, error: "username gerekli" };
  const file = getMemoryFile(username);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { success: true, message: `Memory temizlendi: ${username}` };
}

function showMemory({ username }) {
  if (!username) return { success: false, error: "username gerekli" };
  const memory = loadMemory(username);
  return {
    success: true,
    username,
    name: memory.name,
    nickname: memory.nickname,
    botName: memory.botName,
    totalFacts: (memory.facts || []).length,
    facts: memory.facts || [],
    preferences: memory.preferences || [],
  };
}

module.exports = {
  // Exposed for tests / advanced consumers — not part of the tool schema.
  _internals: {
    MAX_FACTS_PER_USER,
    enforceFactLimit,
    decayFacts,
    loadMemory,
    saveMemory,
    addMemory,
    clearMemory,
    showMemory,
    getMemoryFile,
  },
  name: "memory_write",
  description: "Memory'ye yeni fact/bilgi kaydet veya bot ismini/nickname'i degistir. Kalici, REPL'in extractMemoryFromMessage ozelligi.",
  inputSchema: {
    type: "object",
    properties: {
      username: { type: "string", description: "Kullanici adi (ornek: 'ahmet' veya 'default')" },
      fact: { type: "string", description: 'Yeni fact (ornek: "Kullanici kahve seviyor", "Istanbul\'da yasiyor")' },
      score: { type: "number", description: "Onem derecesi 1-10 (default 5)" },
      category: { type: "string", description: "Kategori: personal, preference, work, hobby, fact (default general)" },
      source: { type: "string", description: "Bilginin kaynağı (user, tool, import, inference)" },
      confidence: { type: "number", description: "Güven puanı 0-1" },
      ttlMs: { type: "number", description: "İsteğe bağlı yaşam süresi (milisaniye)" },
      userConfirmed: { type: "boolean", description: "Kullanıcı tarafından açıkça doğrulandı mı" },
      botName: { type: "string", description: "Bot adini degistir (memory.botName)" },
      nickname: { type: "string", description: "Kullanici nickname'i" },
      name: { type: "string", description: "Kullanici gercek adi" },
      action: { type: "string", description: "add/clear/show (default: add)", enum: ["add", "clear", "show"] },
    },
    required: ["username"],
  },
  async execute(params) {
    const action = params.action || "add";
    if (action === "clear") return clearMemory(params);
    if (action === "show") return showMemory(params);
    return addMemory(params);
  },
};
