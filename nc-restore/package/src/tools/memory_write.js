/**
 * memory_write - Memory'ye fact/kayit yaz (v5.1.1)
 *
 * REPL'in extractMemoryFromMessage ozelligini tool olarak expose eder.
 * Parton'un vizyonu: "Benim asistanim, her seyimi hatirlayacak"
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const MEMORY_DIR = path.join(os.homedir(), ".natureco", "memory");

function getMemoryFile(username) {
  const name = (username || "default").toLowerCase();
  return path.join(MEMORY_DIR, `${name}.json`);
}

function loadMemory(username) {
  const file = getMemoryFile(username);
  try {
    if (!fs.existsSync(file)) {
      return { name: username || "User", nickname: null, botName: null, facts: [], preferences: [] };
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { name: username || "User", nickname: null, botName: null, facts: [], preferences: [] };
  }
}

function saveMemory(username, memory) {
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  memory.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getMemoryFile(username), JSON.stringify(memory, null, 2), "utf8");
  return memory;
}

/**
 * Score azalt (eski fact'ler zamanla unutuluyor)
 */
function decayFacts(memory) {
  if (!memory.facts) return memory;
  const now = Date.now();
  memory.facts = memory.facts.map(f => {
    if (!f.score) f.score = 5;
    // 1 haftadan eski -1, 1 aydan eski -3
    const ageMs = now - new Date(f.updatedAt || f.createdAt || now).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > 30) f.score = Math.max(0, f.score - 3);
    else if (ageDays > 7) f.score = Math.max(0, f.score - 1);
    return f;
  });
  // score 0 olanlari sil
  memory.facts = memory.facts.filter(f => (f.score || 0) > 0);
  // max 15 fact tut
  memory.facts.sort((a, b) => (b.score || 0) - (a.score || 0));
  memory.facts = memory.facts.slice(0, 15);
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


function addMemory({ username, fact, score = 5, category = "general", botName, nickname, name }) {
  // Username yoksa ve 'name' parametresi varsa, onu username olarak kullan
  // (Parton'un "patron" diye hitap etmesi durumu icin)
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
    const existing = memory.facts.find(f => (f.value || f).toLowerCase() === fact.toLowerCase());
    if (existing) {
      existing.score = Math.min(10, (existing.score || 5) + 2);
      existing.updatedAt = new Date().toISOString();
    } else {
      memory.facts.push({
        value: fact,
        score,
        category,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
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
  name: "memory_write",
  description: "Memory'ye yeni fact/bilgi kaydet veya bot ismini/nickname'i degistir. Kalici, REPL'in extractMemoryFromMessage ozelligi.",
  inputSchema: {
    type: "object",
    properties: {
      username: { type: "string", description: "Kullanici adi (ornek: 'gencay' veya 'parton')" },
      fact: { type: "string", description: 'Yeni fact (ornek: "Kullanici Naruto karakterini seviyor", "Istanbul\'da yasiyor")' },
      score: { type: "number", description: "Onem derecesi 1-10 (default 5)" },
      category: { type: "string", description: "Kategori: personal, preference, work, hobby, fact (default general)" },
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