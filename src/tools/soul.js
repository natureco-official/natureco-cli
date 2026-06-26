/**
 * soul - SOUL.md, IDENTITY.md, AGENTS.md okuyucu (v5.4.12)
 *
 * Soul dosyasi — kimlik, kisisellik ve calisma tarzini tanimlar
 *
 * 3 dosya sirayla okunur, ozetlenir ve system prompt'a enjekte edilir:
 *   1. SOUL.md     - KISILIK (nasil hissederim, kirmizi cizgiler, degerler)
 *   2. IDENTITY.md - KIMLIK (kim oldugu, baglam, calisma tarzi)
 *   3. AGENTS.md  - CALISMA ORTAMI (kurallar, tools, heartbeats)
 *
 * 3 seviyede arar:
 *   1. ~/.natureco/soul/{SOUL,IDENTITY,AGENTS}.md (kullanici kendi)
 *   2. <cwd>/{SOUL,IDENTITY,AGENTS}.md (proje seviyesi)
 *   3. <install>/soul/{SOUL,IDENTITY,AGENTS}.md (default)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SOUL_FILES = ["SOUL.md", "IDENTITY.md", "AGENTS.md"];

const SOUL_PATHS = [];
for (const file of SOUL_FILES) {
  SOUL_PATHS.push(path.join(os.homedir(), ".natureco", "soul", file));
}
for (const file of SOUL_FILES) {
  SOUL_PATHS.push(path.join(process.cwd(), file));
}
for (const file of SOUL_FILES) {
  SOUL_PATHS.push(path.resolve(__dirname, "..", "..", "soul", file));
}

const FILE_DESCRIPTIONS = {
  "SOUL.md": "KISILIK DOSYASI",
  "IDENTITY.md": "KIMLIK DOSYASI",
  "AGENTS.md": "CALISMA ORTAMI",
};

function findFile(fileName) {
  for (const dir of [
    path.join(os.homedir(), ".natureco", "soul"),
    process.cwd(),
    path.resolve(__dirname, "..", "..", "soul"),
  ]) {
    const p = path.join(dir, fileName);
    if (fs.existsSync(p)) {
      return { path: p, content: fs.readFileSync(p, "utf8") };
    }
  }
  return null;
}

function findAll() {
  const results = {};
  for (const file of SOUL_FILES) {
    const r = findFile(file);
    if (r) {
      results[file] = r;
    }
  }
  return results;
}

function loadSoul() {
  const all = findAll();
  // SOUL.md varsa onu "soul content" olarak dondur
  return all["SOUL.md"] ? all["SOUL.md"].content : null;
}

function loadIdentity() {
  const all = findAll();
  return all["IDENTITY.md"] ? all["IDENTITY.md"].content : null;
}

function loadAgents() {
  const all = findAll();
  return all["AGENTS.md"] ? all["AGENTS.md"].content : null;
}

/**
 * v5.4.14: Daha akilli ozetleme - basliklar, listeler, kalin yazilar, onemli paragraflar
 * ~1500 karakter ideal, modelin fine-tune'una sigmayan kisim
 */
function summarizeSoul(content, maxLen = 1500) {
  if (!content || content.length <= maxLen) return content;
  const lines = content.split("\n");
  const important = [];
  let charCount = 0;
  for (const line of lines) {
    // Oncelikli: basliklar, listeler, bold metin
    if (line.startsWith("# ") || line.startsWith("## ") ||
        line.startsWith("### ") || line.startsWith("- ") ||
        line.startsWith("**") || /^\d+\./.test(line)) {
      if (charCount + line.length > maxLen) break;
      important.push(line);
      charCount += line.length + 1;
    } else if (line.length > 0 && line.length < 200 && !line.startsWith("|") && charCount < maxLen * 0.8) {
      // Kisa paragraflari da al (ilk 1500 icin)
      if (charCount + line.length > maxLen) break;
      important.push(line);
      charCount += line.length + 1;
    }
  }
  return important.join("\n");
}

/**
 * v5.4.12: 3 dosyayi birlestirip system prompt'a enjekte edilecek format
 */
function buildSoulContext() {
  const all = findAll();
  const parts = [];
  // Her dosyadan onemli kisimlari - toplam 4500 char'i gecmesin (model fine-tune sinir)
  for (const file of SOUL_FILES) {
    if (all[file]) {
      const summary = summarizeSoul(all[file].content, 1500);
      parts.push("=== " + (FILE_DESCRIPTIONS[file] || file) + " (" + file + ") ===\n" + summary);
    }
  }
  return parts.join("\n\n");
}

function soulAction(params) {
  const action = params.action || "show";
  const all = findAll();
  const loaded = Object.keys(all).length;
  // v5.6.13: Dosya yollarini kisalt (home ile baslat)
  const shortenPath = (p) => {
    if (!p) return '';
    const home = require('os').homedir();
    if (p.startsWith(home)) return '~' + p.slice(home.length);
    return p;
  };

  if (action === "show") {
    if (loaded === 0) {
      return {
        success: false,
        error: "Hicbir SOUL dosyasi bulunamadi. Aranacak yerler:\n" + SOUL_PATHS.map(shortenPath).join("\n"),
      };
    }
    return {
      success: true,
      loaded: loaded,
      files: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, {
        path: shortenPath(v.path),
        content: v.content ? v.content.slice(0, 500) + (v.content.length > 500 ? '... [truncated]' : '') : ''
      }])),
      summary: summarizeSoul(buildSoulContext(), 2000),
      message: loaded + " SOUL dosyasi yuklendi: " + Object.keys(all).join(", "),
    };
  }

  if (action === "info") {
    return {
      success: true,
      loaded: loaded,
      total: SOUL_FILES.length,
      files: Object.fromEntries(Object.entries(all).map(([k, v]) => ({
        path: shortenPath(v.path),
        size: fs.statSync(v.path).size,
        modifiedAt: fs.statSync(v.path).mtime.toISOString(),
        lineCount: v.content.split("\n").length,
      }))),
      searched: SOUL_PATHS.map(shortenPath),
    };
  }

  if (action === "path") {
    return { success: true, paths: SOUL_PATHS };
  }

  return { success: false, error: "Bilinmeyen action: " + action };
}

module.exports = {
  name: "soul",
  description: "SOUL.md, IDENTITY.md, AGENTS.md dosyalarini oku. Uc dosya birlestir, REPL acilisinda kimligini ve kisiselik dosyalarini yansit.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "show / info / path", enum: ["show", "info", "path"] },
    },
    required: ["action"],
  },
  async execute(params) {
    return soulAction(params);
  },
};

module.exports.loadSoul = loadSoul;
module.exports.loadIdentity = loadIdentity;
module.exports.loadAgents = loadAgents;
module.exports.summarizeSoul = summarizeSoul;
module.exports.buildSoulContext = buildSoulContext;
module.exports.findFile = findFile;
module.exports.findAll = findAll;