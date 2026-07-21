/**
 * skills_marketplace - Skill marketplace (v5.0.0)
 *
 * Skills marketplace — skill paylasimi ve otomatik yukleme
 *
 * Format: ~/.natureco/marketplace/<skill_name>.json
 * Source: NatureCo GitHub repo (community-contributed) veya local
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const { foldTr } = require("../utils/tr-text");

const MARKETPLACE_DIR = path.join(os.homedir(), ".natureco", "marketplace");
const SKILLS_DIR = path.join(os.homedir(), ".natureco", "skills");

/**
 * Marketplace URL'leri — kullanici GitHub repo'su
 */
const MARKETPLACE_SOURCES = [
  {
    name: "NatureCo Official",
    url: "https://raw.githubusercontent.com/naturecoofficial/natureco-skills/main/index.json",
    enabled: true,
  },
  {
    name: "Community",
    url: "https://raw.githubusercontent.com/natureco-community/skills/main/index.json",
    enabled: true,
  },
];

/**
 * Built-in skill paketleri
 */
const BUILTIN_SKILLS = {
  "seo-audit": {
    name: "SEO Audit",
    description: "Web sitesi SEO denetimi - meta tags, headings, schema.org, performance",
    author: "NatureCo Team",
    version: "1.0.0",
    tags: ["seo", "web", "audit"],
    instructions: "Kullanici bir URL isteyince, bu skill devreye girer. http_request ile sayfayi cek, og:title, og:description, og:image, h1/h2 sayisi, schema.org/l* varligi, robots.txt, sitemap.xml kontrol et. Skor 0-100 dondur.",
  },
  "code-review": {
    name: "Code Review",
    description: "Kod inceleme - style, best practices, security, performance",
    author: "NatureCo Team",
    version: "1.0.0",
    tags: ["code", "review", "security"],
    instructions: "Kullanici kod gonderdiginde, grep_search ile TODO/FIXME/security issue bul, linting kontrolu yap, ozellikle XSS, SQL injection, hardcoded secret'lere bak. Olumlu/olumsuz yonleri listele.",
  },
  "git-commit": {
    name: "Smart Git Commit",
    description: "AI ile conventional commit mesaji uret",
    author: "NatureCo Team",
    version: "1.0.0",
    tags: ["git", "workflow"],
    instructions: "git diff ciktisini oku, degisiklik tipine gore (feat/fix/docs/style/refactor/test/chore) conventional commit formatinda mesaj uret. Turkce veya Ingilizce gore dili ayarla.",
  },
  "telegram-bot": {
    name: "Telegram Bot Setup",
    description: "Telegram bot kurulum wizard - BotFather adim adim",
    author: "NatureCo Team",
    version: "1.0.0",
    tags: ["telegram", "integration", "tutorial"],
    instructions: "Kullanici 'Telegram bot kur' dediginde, sirasiyla: 1) @BotFather'a git, 2) /newbot, 3) isim ve username, 4) token al, 5) natureco telegram connect ile gir, 6) @userinfobot'tan user ID al, 7) natureco gateway start. Adim adim Turkce yonlendir.",
  },
  "morning-briefing": {
    name: "Morning Briefing",
    description: "Her sabah 9'da ozet: hava, takvim, todo'lar, RSS",
    author: "NatureCo Team",
    version: "1.0.0",
    tags: ["productivity", "cron", "daily"],
    instructions: "cron_create ile her sabah 9'da calisan bir setup kur. natureco weather, natureco calendar today, natureco todo_write list, natureco memory_search - tum bunlari ozetleyen bir gunluk briefing ver.",
  },
};

/**
 * Local skill yukle (skill dosyasi -> ~/.natureco/skills/<name>/)
 */
function installLocal(skillData) {
  if (!skillData.name) return { success: false, error: "Skill name gerekli" };
  const skillDir = path.join(SKILLS_DIR, skillData.name);
  fs.mkdirSync(skillDir, { recursive: true });

  const skillFile = path.join(skillDir, "SKILL.md");
  const content = skillData.instructions || skillData.content || `# ${skillData.name}\n\n${skillData.description || ""}`;
  fs.writeFileSync(skillFile, content, "utf8");

  // Metadata
  const meta = {
    name: skillData.name,
    description: skillData.description,
    author: skillData.author || "Unknown",
    version: skillData.version || "1.0.0",
    tags: skillData.tags || [],
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(skillDir, "metadata.json"), JSON.stringify(meta, null, 2), "utf8");

  return { success: true, path: skillDir, skill: meta };
}

/**
 * URL'den skill yukle (GitHub raw content)
 */
function installFromUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        try {
          const skill = JSON.parse(data);
          resolve(installLocal(skill));
        } catch (e) {
          resolve({ success: false, error: "Skill JSON parse hatasi: " + e.message });
        }
      });
    }).on("error", e => resolve({ success: false, error: e.message }));
  });
}

/**
 * Marketplace listele
 */
async function listMarketplace() {
  const skills = { ...BUILTIN_SKILLS };

  // Remote sources'dan da cekmeyi dene
  for (const source of MARKETPLACE_SOURCES.filter(s => s.enabled)) {
    try {
      const remote = await new Promise((resolve) => {
        const req = https.get(source.url, { timeout: 5000 }, (res) => {
          let data = "";
          res.on("data", d => data += d);
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch { resolve({}); }
          });
        });
        req.on("error", () => resolve({}));
        req.on("timeout", () => { req.destroy(); resolve({}); });
      });
      Object.assign(skills, remote);
    } catch {}
  }

  return skills;
}

/**
 * Tool definitions
 */
module.exports = {
  name: "skills_marketplace",
  description: "Skill marketplace - topluluk tarafindan paylasilan NatureCo CLI skill'leri. action: list, install, uninstall, search.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "list/install/uninstall/search", enum: ["list", "install", "uninstall", "search"] },
      skillName: { type: "string", description: "Skill adi (install/uninstall icin)" },
      query: { type: "string", description: "Arama sorgusu (search icin)" },
      source: { type: "string", description: "Marketplace URL (custom source icin)" },
    },
    required: ["action"],
  },
  async execute(params) {
    const { action, skillName, query, source } = params;

    if (action === "list") {
      const all = await listMarketplace();
      return {
        success: true,
        count: Object.keys(all).length,
        skills: Object.entries(all).map(([name, s]) => ({
          name,
          description: s.description,
          author: s.author,
          version: s.version,
          tags: s.tags,
        })),
      };
    }

    if (action === "search") {
      if (!query) return { success: false, error: "query gerekli" };
      const all = await listMarketplace();
      const q = foldTr(query);
      const matches = Object.entries(all).filter(([_, s]) =>
        foldTr(s.description).includes(q) ||
        s.tags?.some(t => foldTr(t).includes(q)) ||
        foldTr(s.name).includes(q)
      );
      return { success: true, query, count: matches.length, results: matches.map(([n, s]) => ({ name: n, ...s })) };
    }

    if (action === "install") {
      if (!skillName) return { success: false, error: "skillName gerekli" };

      // Once local BUILTIN'den dene
      if (BUILTIN_SKILLS[skillName]) {
        return installLocal(BUILTIN_SKILLS[skillName]);
      }

      // Sonra URL'den dene
      if (source) {
        return await installFromUrl(source);
      }

      // Marketplace'ten dene
      const all = await listMarketplace();
      if (all[skillName]) {
        return installLocal(all[skillName]);
      }

      return { success: false, error: `Skill bulunamadi: ${skillName}. Once 'list' calistirin.` };
    }

    if (action === "uninstall") {
      if (!skillName) return { success: false, error: "skillName gerekli" };
      const skillDir = path.join(SKILLS_DIR, skillName);
      if (!fs.existsSync(skillDir)) {
        return { success: false, error: `Skill yuklu degil: ${skillName}` };
      }
      fs.rmSync(skillDir, { recursive: true });
      return { success: true, message: `Skill kaldirildi: ${skillName}` };
    }

    return { success: false, error: `Bilinmeyen action: ${action}` };
  },
};
