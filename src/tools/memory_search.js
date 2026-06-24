/**
 * memory_search - Kalici hafiza arama (v4.9.0)
 *
 * Hermes memory tool'una benzer ama search odakli.
 * Kullanicinin gecmis konusmalarindan fact ve bilgi arar.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const MEMORY_DIR = path.join(os.homedir(), ".natureco", "memory");
const SESSION_DIR = path.join(os.homedir(), ".natureco", "sessions");

function listFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  } catch { return []; }
}

function searchInObject(obj, query, path = "") {
  const results = [];
  if (!obj || typeof obj !== "object") return results;

  if (typeof obj === "string" && obj.toLowerCase().includes(query)) {
    return [{ path, content: obj.slice(0, 200) }];
  }

  for (const [key, val] of Object.entries(obj)) {
    const newPath = path ? path + "." + key : key;
    if (typeof val === "string" && val.toLowerCase().includes(query)) {
      results.push({ path: newPath, content: val.slice(0, 200) });
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === "string" && item.toLowerCase().includes(query)) {
          results.push({ path: newPath + "[" + i + "]", content: item.slice(0, 200) });
        } else if (typeof item === "object") {
          results.push(...searchInObject(item, query, newPath + "[" + i + "]"));
        }
      });
    } else if (typeof val === "object" && val !== null) {
      results.push(...searchInObject(val, query, newPath));
    }
  }
  return results;
}

async function searchMemory({ query, scope = "all", username = null, maxResults = 20 }) {
  if (!query) return { success: false, error: "query gerekli" };

  const q = query.toLowerCase();
  const results = [];
  const sources = [];

  // Memory dosyalarini tara
  if (scope === "all" || scope === "memory") {
    // v5.6.22: Username yoksa TÜM memory dosyalarini tara
    const memoryDir = MEMORY_DIR;
    if (fs.existsSync(memoryDir)) {
      const memoryFiles = username
        ? [(username || "default") + ".json"]
        : listFiles(memoryDir);
      for (const fname of memoryFiles) {
        const memoryFile = path.join(memoryDir, fname);
        if (!fs.existsSync(memoryFile)) continue;
        try {
          const mem = JSON.parse(fs.readFileSync(memoryFile, "utf8"));
          const matches = searchInObject(mem, q, "memory");
          matches.forEach(m => {
            results.push({ source: "memory:" + fname, ...m });
            sources.push("memory");
          });
        } catch {}
      }
    }
  }

  // Session dosyalarini tara
  if (scope === "all" || scope === "sessions") {
    const files = listFiles(SESSION_DIR).slice(0, 10); // Son 10 session
    for (const file of files) {
      try {
        const sess = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, file), "utf8"));
        const matches = searchInObject(sess, q, "session");
        matches.slice(0, 3).forEach(m => {
          results.push({ source: "session:" + file.slice(0, 12), ...m });
          sources.push("session");
        });
        if (results.length >= maxResults) break;
      } catch {}
    }
  }

  return {
    success: true,
    query,
    found: results.length,
    results: results.slice(0, maxResults),
    sources: [...new Set(sources)],
  };
}

module.exports = {
  name: "memory_search",
  description: "Kalici hafizada ve session gecmisinde arama yap. Kullici hakkinda ogrendiklerini bul.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Aranacak metin" },
      scope: { type: "string", description: "all/memory/sessions (default: all)", enum: ["all", "memory", "sessions"] },
      username: { type: "string", description: "Kullanici adi (memory dosyasi icin)" },
      maxResults: { type: "number", description: "Max sonuc (default 20)" },
    },
    required: ["query"],
  },
  async execute(params) {
    return await searchMemory(params);
  },
};