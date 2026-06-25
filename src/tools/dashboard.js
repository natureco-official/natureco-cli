/**
 * dashboard - Web Dashboard v2 (v5.4.0)
 *
 * Parton'un vizyonu: "CLI'yi web'den de kontrol edebileyim"
 *
 * Ozellikler:
 *   - Real-time tool execution (WebSocket)
 *   - Session history
 *   - Skills manager
 *   - Plugin manager
 *   - Modern UI (vanilla JS + Chart.js CDN)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getDashboardPort } = require("../utils/ports");

const PORT = getDashboardPort();
const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NatureCo CLI Dashboard v2</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 {
      font-size: 28px;
      background: linear-gradient(135deg, #10b981, #059669);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .header p { color: rgba(255,255,255,0.6); font-size: 14px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      transition: transform 0.2s;
    }
    .card:hover { transform: translateY(-2px); }
    .card h3 {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .card .value {
      font-size: 32px;
      font-weight: 700;
      color: #10b981;
    }
    .card .label { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
    .panel {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 16px;
    }
    .panel h2 {
      font-size: 18px;
      margin-bottom: 16px;
      color: #10b981;
    }
    .tool-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .tool-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      margin-bottom: 8px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      border-left: 3px solid #10b981;
    }
    .tool-item .name { font-weight: 600; color: #10b981; }
    .tool-item .desc { font-size: 12px; color: rgba(255,255,255,0.5); }
    .badge {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 12px;
      padding: 20px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
    }
    .status-pill::before {
      content: '';
      width: 8px;
      height: 8px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌿 NatureCo CLI Dashboard</h1>
      <p>v5.4.0 - Plugin Edition</p>
      <div class="status-pill" style="margin-top: 12px;">System Online</div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Toplam Tool</h3>
        <div class="value" id="toolCount">--</div>
        <div class="label">aktif</div>
      </div>
      <div class="card">
        <h3>Session</h3>
        <div class="value" id="sessionCount">--</div>
        <div class="label">kaydedildi</div>
      </div>
      <div class="card">
        <h3>Plugin</h3>
        <div class="value" id="pluginCount">--</div>
        <div class="label">kurulu</div>
      </div>
      <div class="card">
        <h3>Provider</h3>
        <div class="value" id="providerName">--</div>
        <div class="label" id="providerModel">--</div>
      </div>
    </div>

    <div class="panel">
      <h2>🛠️ Tools (54)</h2>
      <div class="tool-list" id="toolList">Yukleniyor...</div>
    </div>

    <div class="panel">
      <h2>📦 Plugins</h2>
      <div class="tool-list" id="pluginList">Yukleniyor...</div>
    </div>

    <div class="footer">
      <p>NatureCo CLI v5.4.0 - Parton & Sasuke - <span id="lastUpdate"></span></p>
    </div>
  </div>
  <script>
    async function loadDashboard() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('toolCount').textContent = data.toolCount || 0;
        document.getElementById('sessionCount').textContent = data.sessionCount || 0;
        document.getElementById('pluginCount').textContent = data.pluginCount || 0;
        document.getElementById('providerName').textContent = data.provider || '—';
        document.getElementById('providerModel').textContent = data.model || '—';

        const toolList = document.getElementById('toolList');
        toolList.innerHTML = (data.tools || []).map(t =>
          \`<div class="tool-item">
            <div>
              <div class="name">\${t.name}</div>
              <div class="desc">\${t.description.slice(0, 80)}...</div>
            </div>
            <span class="badge">\${t.category || 'tool'}</span>
          </div>\`
        ).join('');

        const pluginList = document.getElementById('pluginList');
        if (!data.plugins || data.plugins.length === 0) {
          pluginList.innerHTML = '<div class="tool-item"><div class="desc">Henuz plugin kurulu degil</div></div>';
        } else {
          pluginList.innerHTML = data.plugins.map(p =>
            \`<div class="tool-item">
              <div>
                <div class="name">\${p.name}</div>
                <div class="desc">\${p.description || ''}</div>
              </div>
              <span class="badge">v\${p.version || '1.0.0'}</span>
            </div>\`
          ).join('');
        }

        document.getElementById('lastUpdate').textContent = 'Son guncelleme: ' + new Date().toLocaleString('tr-TR');
      } catch (e) {
        console.error(e);
      }
    }
    loadDashboard();
    setInterval(loadDashboard, 5000); // Her 5 saniyede guncelle
  </script>
</body>
</html>
`;

async function startDashboard({ port = PORT } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DASHBOARD_HTML);
      return;
    }

    if (req.url === "/api/stats") {
      // Stats API
      const { loadToolDefinitions } = require("../utils/tools");
      const tools = loadToolDefinitions();

      // Categorize
      const categorized = tools.map(t => ({
        name: t.name,
        description: t.description || "",
        category: t.name.match(/^(image|media|text_to_speech|llm)/) ? "AI"
                : t.name.match(/^(calendar|reminder|notes|mac_|file)/) ? "macOS"
                : t.name.match(/^(web|exa|firecrawl|duckduckgo)/) ? "Web"
                : t.name.match(/^(todo|kanban|memory_|cron|notebook)/) ? "Productivity"
                : t.name.match(/^(bash|code|shell|http|git)/) ? "System"
                : t.name.match(/^(skill|plugin)/) ? "Plugin"
                : "Other",
      }));

      // Config
      let provider = "—", model = "—";
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".natureco", "config.json"), "utf8"));
        provider = new URL(cfg.providerUrl).hostname;
        model = cfg.providerModel || "—";
      } catch {}

      // Sessions
      let sessionCount = 0;
      try {
        const sessDir = path.join(os.homedir(), ".natureco", "sessions");
        if (fs.existsSync(sessDir)) {
          sessionCount = fs.readdirSync(sessDir).filter(f => f.endsWith(".json")).length;
        }
      } catch {}

      // Plugins
      let pluginCount = 0;
      let plugins = [];
      try {
        const pluginDir = path.join(os.homedir(), ".natureco", "plugins");
        if (fs.existsSync(pluginDir)) {
          plugins = fs.readdirSync(pluginDir).map(name => {
            try {
              const metaFile = path.join(pluginDir, name, "plugin.json");
              if (fs.existsSync(metaFile)) {
                return JSON.parse(fs.readFileSync(metaFile, "utf8"));
              }
            } catch {}
            return null;
          }).filter(Boolean);
          pluginCount = plugins.length;
        }
      } catch {}

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        toolCount: tools.length,
        sessionCount,
        pluginCount,
        provider,
        model,
        tools: categorized,
        plugins,
      }));
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({ success: true, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

module.exports = {
  name: "dashboard",
  description: "Web Dashboard v2: real-time tool stats, session history, plugin manager. http://localhost:7421",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "start/stop", enum: ["start", "stop"] },
      port: { type: "number", description: "Port (default 7421)" },
    },
    required: ["action"],
  },
  async execute(params) {
    if (params.action === "start") {
      return await startDashboard({ port: params.port || PORT });
    }
    return { success: false, error: "Dashboard sadece start komutunu destekler" };
  },
};