/**
 * plugin.js — Plugin sistemi (v5.4.0)
 *
 * Plugin sistemi — topluluk plugin uretimi ve yuklemesi
 *
 * Mimari:
 *   ~/.natureco/plugins/
 *     ├── my-plugin/
 *     │   ├── plugin.json      (metadata)
 *     │   ├── index.js         (ana giris, tools export eder)
 *     │   └── README.md        (doküman)
 *
 * Plugin format:
 *   module.exports = {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     description: "Ne yapar",
 *     tools: [{ name, description, inputSchema, execute }, ...],
 *     init: function(ctx) { ... },
 *   };
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

const PLUGIN_DIR = path.join(os.homedir(), ".natureco", "plugins");
const ENABLED_FILE = path.join(os.homedir(), ".natureco", "enabled-plugins.json");

/**
 * Plugin metadata yukle
 */
function loadPluginMeta(pluginPath) {
  try {
    const metaFile = path.join(pluginPath, "plugin.json");
    if (!fs.existsSync(metaFile)) return null;
    return JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Plugin'in tool'larini yukle (index.js'den)
 */
function loadPluginTools(pluginPath) {
  try {
    const indexFile = path.join(pluginPath, "index.js");
    if (!fs.existsSync(indexFile)) return [];
    // Sandbox icin plugin path'i require'a ekle
    delete require.cache[require.resolve(indexFile)];
    const plugin = require(indexFile);
    return plugin.tools || [];
  } catch (e) {
    return [];
  }
}

/**
 * Local plugin'i kur
 */
function installLocalPlugin(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    return { success: false, error: `Kaynak bulunamadi: ${sourcePath}` };
  }

  const meta = loadPluginMeta(sourcePath);
  if (!meta) {
    return { success: false, error: "plugin.json bulunamadi" };
  }

  const targetDir = path.join(PLUGIN_DIR, meta.name);
  if (fs.existsSync(targetDir)) {
    return { success: false, error: `Plugin zaten kurulu: ${meta.name}` };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  // Tum dosyalari kopyala
  const files = fs.readdirSync(sourcePath);
  for (const f of files) {
    fs.copyFileSync(path.join(sourcePath, f), path.join(targetDir, f));
  }

  return { success: true, name: meta.name, path: targetDir, meta };
}

/**
 * GitHub'dan plugin indir
 */
function installFromGitHub(repoUrl) {
  // GitHub URL format: https://github.com/user/plugin-name
  // Raw content URL: https://raw.githubusercontent.com/user/plugin-name/main/plugin.json
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return { success: false, error: "Gecersiz GitHub URL" };

  const [, user, repo] = match;
  const rawBase = `https://raw.githubusercontent.com/${user}/${repo}/main`;

  return new Promise((resolve) => {
    https.get(`${rawBase}/plugin.json`, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const meta = JSON.parse(data);
          const targetDir = path.join(PLUGIN_DIR, meta.name);
          if (fs.existsSync(targetDir)) {
            return resolve({ success: false, error: `Plugin zaten kurulu: ${meta.name}` });
          }
          fs.mkdirSync(targetDir, { recursive: true });

          // Tum dosyalari indir
          const files = ["plugin.json", "index.js", "README.md"];
          let downloaded = 0;
          for (const f of files) {
            const url = `${rawBase}/${f}`;
            https.get(url, { timeout: 10000 }, (fileRes) => {
              let fd = "";
              fileRes.on("data", c => fd += c);
              fileRes.on("end", () => {
                if (fileRes.statusCode === 200) {
                  fs.writeFileSync(path.join(targetDir, f), fd, "utf8");
                }
                downloaded++;
                if (downloaded === files.length) {
                  resolve({ success: true, name: meta.name, path: targetDir, meta });
                }
              });
            }).on("error", () => {
              downloaded++;
              if (downloaded === files.length) {
                resolve({ success: true, name: meta.name, path: targetDir, meta, note: "Bazi dosyalar indirilemedi" });
              }
            });
          }
        } catch (e) {
          resolve({ success: false, error: "plugin.json parse hatasi: " + e.message });
        }
      });
    }).on("error", e => resolve({ success: false, error: e.message }));
  });
}

/**
 * Tum kurulu plugin'leri listele
 */
function listInstalled() {
  try {
    if (!fs.existsSync(PLUGIN_DIR)) return [];
    return fs.readdirSync(PLUGIN_DIR)
      .filter(name => {
        const p = path.join(PLUGIN_DIR, name);
        return fs.statSync(p).isDirectory() && loadPluginMeta(p);
      })
      .map(name => {
        const meta = loadPluginMeta(path.join(PLUGIN_DIR, name));
        return { name, ...meta };
      });
  } catch {
    return [];
  }
}

/**
 * Tum plugin'lerin tool'larini yukle (sistem tool'larina eklenir)
 */
function loadAllPluginTools() {
  const installed = listInstalled();
  const enabled = loadEnabledPlugins();
  const tools = [];

  for (const p of installed) {
    if (!enabled.includes(p.name)) continue;
    const pluginTools = loadPluginTools(path.join(PLUGIN_DIR, p.name));
    for (const t of pluginTools) {
      tools.push({
        ...t,
        _plugin: p.name,
      });
    }
  }
  return tools;
}

function loadEnabledPlugins() {
  try {
    if (!fs.existsSync(ENABLED_FILE)) return [];
    return JSON.parse(fs.readFileSync(ENABLED_FILE, "utf8"));
  } catch {
    return [];
  }
}

function setPluginEnabled(name, enabled) {
  let current = loadEnabledPlugins();
  if (enabled && !current.includes(name)) {
    current.push(name);
  } else if (!enabled) {
    current = current.filter(n => n !== name);
  }
  fs.mkdirSync(path.dirname(ENABLED_FILE), { recursive: true });
  fs.writeFileSync(ENABLED_FILE, JSON.stringify(current, null, 2), "utf8");
  return { success: true, enabled: current };
}

/**
 * Built-in plugin ornekleri
 */
const BUILTIN_PLUGINS = [
  {
    name: "github",
    description: "GitHub API entegrasyonu: PR, issue, workflow, release",
    author: "NatureCo Team",
    version: "1.0.0",
    url: "https://github.com/natureco-plugins/github",
  },
  {
    name: "twitter",
    description: "Twitter/X API: tweet gonder, timeline oku",
    author: "NatureCo Team",
    version: "1.0.0",
    url: "https://github.com/natureco-plugins/twitter",
  },
  {
    name: "spotify",
    description: "Spotify kontrol: cal, duraklat, playlist yonet",
    author: "NatureCo Team",
    version: "1.0.0",
    url: "https://github.com/natureco-plugins/spotify",
  },
  {
    name: "notion",
    description: "Notion API: sayfa olustur, veritabani guncelle",
    author: "NatureCo Team",
    version: "1.0.0",
    url: "https://github.com/natureco-plugins/notion",
  },
];

async function pluginOp({ action = "list", name, source, url }) {
  if (action === "list") {
    const installed = listInstalled();
    const available = BUILTIN_PLUGINS.filter(bp => !installed.find(i => i.name === bp.name));
    return {
      success: true,
      installed: installed,        // GERCEK kurulu olanlar (0 olabilir)
      available: available,        // KurulMAYAN builtin (bunlar kurulabilir)
      installedCount: installed.length,
      availableCount: available.length,
      message: installed.length === 0
        ? "Henuz plugin kurulu degil. Kurmak icin 'plugin install <name>' kullanin."
        : `${installed.length} kurulu, ${available.length} builtin daha mevcut`,
    };
  }

  if (action === "install") {
    if (source && fs.existsSync(source)) {
      return installLocalPlugin(source);
    }
    if (url) {
      return await installFromGitHub(url);
    }
    if (name) {
      // Builtin plugin
      const builtin = BUILTIN_PLUGINS.find(p => p.name === name);
      if (!builtin) {
        return { success: false, error: `Builtin plugin bulunamadi: ${name}. List icin 'list' kullanin.` };
      }
      return await installFromGitHub(builtin.url);
    }
    return { success: false, error: "name/source/url gerekli" };
  }

  if (action === "uninstall" && name) {
    const targetDir = path.join(PLUGIN_DIR, name);
    if (!fs.existsSync(targetDir)) {
      return { success: false, error: `Plugin kurulu degil: ${name}` };
    }
    fs.rmSync(targetDir, { recursive: true });
    setPluginEnabled(name, false);
    return { success: true, message: `Plugin kaldirildi: ${name}` };
  }

  if (action === "enable" && name) {
    return setPluginEnabled(name, true);
  }

  if (action === "disable" && name) {
    return setPluginEnabled(name, false);
  }

  if (action === "tools") {
    const tools = loadAllPluginTools();
    return { success: true, count: tools.length, tools };
  }

  if (action === "info" && name) {
    const targetDir = path.join(PLUGIN_DIR, name);
    const meta = loadPluginMeta(targetDir);
    if (!meta) return { success: false, error: `Plugin bulunamadi: ${name}` };
    const tools = loadPluginTools(targetDir);
    return { success: true, ...meta, toolCount: tools.length, tools: tools.map(t => t.name) };
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: "plugin",
  description: "Plugin sistemi: GitHub repo URL'sinden veya lokal klasorden plugin yukle. KURULAN plugin yoksa 'Kurulu plugin yok' de, uydurma plugin ismi yazma. GERCEK liste install edilen + builtin listedir.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "list/install/uninstall/enable/disable/tools/info", enum: ["list", "install", "uninstall", "enable", "disable", "tools", "info"] },
      name: { type: "string", description: "Plugin adi" },
      source: { type: "string", description: "Lokal plugin klasor yolu" },
      url: { type: "string", description: "GitHub repo URL" },
    },
    required: ["action"],
  },
  async execute(params) {
    return await pluginOp(params);
  },
};

// Diger tool'lardan cagirilabilir
module.exports.loadAllPluginTools = loadAllPluginTools;