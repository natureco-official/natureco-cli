/**
 * skills_autoload - Otomatik skill yukleme (v5.0.0)
 *
 * Skills otomatik yukleme — ihtiyaca gore skill'leri algilayip yukler
 *
 * Mantik:
 * 1. Kullanici bir istek yapar
 * 2. REPL anahtar kelimeleri tarar (seo, telegram, git commit, vb.)
 * 3. Ilgili skill varsa otomatik yuklenir
 * 4. System prompt'a eklenir
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SKILLS_DIR = path.join(os.homedir(), ".natureco", "skills");

/**
 * Anahtar kelime -> skill mapping
 */
const KEYWORD_MAP = {
  // SEO
  "seo": ["seo", "audit", "site", "website", "ranking", "meta", "search engine", "url"],
  "telegram": ["telegram", "bot", "botfather", "t.me"],
  "git-commit": ["commit", "git commit", "conventional commit", "kaydet", "gönder"],
  "code-review": ["review", "incele", "kod incele", "bug", "security check"],
  "morning-briefing": ["briefing", "morning", "sabah brifingi", "günlük özet"],
};

function loadAllSkills() {
  const loaded = [];
  try {
    if (!fs.existsSync(SKILLS_DIR)) return loaded;
    const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const skillFile = path.join(SKILLS_DIR, dir.name, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        loaded.push({ name: dir.name, content: fs.readFileSync(skillFile, "utf8") });
      }
    }
  } catch {}
  return loaded;
}

/**
 * Mesaj icindeki anahtar kelimeleri tara, ilgili skill'leri bul
 */
function detectRelevantSkills(message, availableSkills) {
  const lower = message.toLowerCase();
  const detected = new Set();

  for (const [skill, keywords] of Object.entries(KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        detected.add(skill);
        break;
      }
    }
  }

  // Yuklu skill'lerle kesistir
  return availableSkills.filter(s => detected.has(s.name));
}

function autoLoad(message) {
  const available = loadAllSkills();
  const relevant = detectRelevantSkills(message, available);
  if (relevant.length === 0) return [];

  return relevant.map(s => ({
    name: s.name,
    summary: s.content.slice(0, 500).split("\n").slice(0, 3).join("\n"),
  }));
}

module.exports = {
  name: "skills_autoload",
  description: "Kullanici istegine gore otomatik skill yukle. Mesaj analiz edilir, ilgili skill sistem prompt'a eklenir.",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string", description: "Kullanici mesaji / istegi" },
    },
    required: ["message"],
  },
  async execute(params) {
    // v5.43 GÜVENLİK: eskiden tespit edilen skill'lerin HAM içeriği doğrulama olmadan
    // system prompt'a enjekte ediliyordu (skillContext) → prompt injection yüzeyi.
    // Artık sadece İSİMLERİ tespit edip döndürür; ajan gerçekten gerekiyorsa
    // skill_view(name) ile KONTROLLÜ yükler (skill-index/skill_view zaten var).
    const loaded = autoLoad(params.message);
    return {
      success: true,
      message: params.message,
      detectedSkills: loaded.map(s => s.name),
      hint: loaded.length
        ? `İlgili olabilecek skill(ler): ${loaded.map(s => s.name).join(', ')}. Gerekliyse skill_view(name) ile yükle.`
        : 'İlgili skill bulunamadı.',
    };
  },
};