/**
 * NatureCo CLI — Local Dashboard Server (Phase 5)
 *
 * `natureco dashboard` → http://localhost:7421
 * Tüm NatureCo verilerini tek sayfada gösterir:
 *   - Sessions (chat geçmişi)
 *   - Costs (bugün/hafta/ay)
 *   - Skills (yüklü + self-evolving proposals)
 *   - Crons (zamanlanmış görevler)
 *   - Audit (son 24 saat istatistik)
 *   - Patterns (en çok kullanılan tool pattern'leri)
 *
 * Vanilla JS + HTML, framework yok. Node'un built-in http modülü.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = 7421;
const HOST = '127.0.0.1';

const NATURECO_DIR = path.join(os.homedir(), '.natureco');

function safeReadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) { return { error: e.message }; }
  return null;
}

function getDashboardData() {
  return {
    timestamp: new Date().toISOString(),
    config: safeReadJSON(path.join(NATURECO_DIR, 'config.json')) || {},
    skills: safeReadJSON(path.join(NATURECO_DIR, 'skills', '_index.json')) || { skills: [] },
    proposals: safeReadJSON(path.join(NATURECO_DIR, 'skill-proposals.json')) || [],
    crons: safeReadJSON(path.join(NATURECO_DIR, 'crons.json')) || [],
    costs: safeReadJSON(path.join(NATURECO_DIR, 'cost-tracking.json')) || { entries: [] },
    patterns: safeReadJSON(path.join(NATURECO_DIR, 'patterns.json')) || { sequences: [] },
    audit: getAuditSummary(),
  };
}

function getAuditSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const auditDir = path.join(NATURECO_DIR, 'audit');
  if (!fs.existsSync(auditDir)) return { today: 0, byAction: {} };
  const file = path.join(auditDir, `audit-${today}.jsonl`);
  if (!fs.existsSync(file)) return { today: 0, byAction: {} };
  const content = fs.readFileSync(file, 'utf8');
  const entries = content.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  const byAction = {};
  for (const e of entries) byAction[e.action] = (byAction[e.action] || 0) + 1;
  return { today: entries.length, byAction };
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>NatureCo Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         background: #0f172a; color: #e2e8f0; margin: 0; padding: 0; }
  header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
           padding: 24px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  header h1 { margin: 0; font-size: 28px; color: white; }
  header .subtitle { color: rgba(255,255,255,0.85); margin-top: 4px; font-size: 14px; }
  main { max-width: 1200px; margin: 0 auto; padding: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  .card { background: #1e293b; border-radius: 8px; padding: 20px; border: 1px solid #334155; }
  .card h2 { margin: 0 0 16px; font-size: 16px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric { font-size: 32px; font-weight: 700; color: #f1f5f9; margin: 4px 0; }
  .metric-label { font-size: 12px; color: #64748b; }
  .bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin: 4px 0; }
  .bar-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #16a34a); }
  .bar-fill.warn { background: linear-gradient(90deg, #f59e0b, #d97706); }
  .bar-fill.danger { background: linear-gradient(90deg, #ef4444, #dc2626); }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #334155; font-size: 13px; }
  th { color: #94a3b8; font-weight: 600; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .pill-green { background: #064e3b; color: #6ee7b7; }
  .pill-red { background: #7f1d1d; color: #fca5a5; }
  .pill-yellow { background: #78350f; color: #fcd34d; }
  .pill-blue { background: #1e3a8a; color: #93c5fd; }
  .footer { text-align: center; color: #64748b; padding: 32px; font-size: 12px; }
  pre { background: #0f172a; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
  code { color: #6ee7b7; }
  .empty { color: #64748b; font-style: italic; }
</style>
</head>
<body>
<header>
  <h1>🌿 NatureCo Dashboard</h1>
  <div class="subtitle">Local · <span id="ts">--</span> · <a href="/api" style="color:white">JSON API</a></div>
</header>
<main>
  <div class="grid">
    <div class="card">
      <h2>💰 Bugünkü Maliyet</h2>
      <div class="metric" id="cost-today">$0.00</div>
      <div class="metric-label">Günlük limit: <span id="cost-limit">$5.00</span></div>
      <div class="bar"><div class="bar-fill" id="cost-bar" style="width:0%"></div></div>
    </div>
    <div class="card">
      <h2>📦 Yüklü Skill</h2>
      <div class="metric" id="skill-count">0</div>
      <div class="metric-label">Bekleyen proposal: <span id="proposal-count">0</span></div>
    </div>
    <div class="card">
      <h2>⏰ Aktif Cron</h2>
      <div class="metric" id="cron-count">0</div>
      <div class="metric-label">Zamanlanmış görev</div>
    </div>
    <div class="card">
      <h2>📋 Bugünkü Audit</h2>
      <div class="metric" id="audit-count">0</div>
      <div class="metric-label">Toplam kayıt</div>
    </div>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>💵 Provider Bazlı Maliyet (Bugün)</h2>
    <table id="cost-table">
      <thead><tr><th>Provider</th><th>Maliyet</th><th>Toplam Token</th><th>Çağrı</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>🧠 Self-Evolving Skill Proposals</h2>
    <table id="proposals-table">
      <thead><tr><th>Öneri</th><th>Tekrar</th><th>Pattern</th><th>İlk Tespit</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>📊 Audit İstatistik (Bugün)</h2>
    <table id="audit-table">
      <thead><tr><th>Action</th><th>Sayı</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>📜 Son Tool Çağrıları</h2>
    <table id="patterns-table">
      <thead><tr><th>Zaman</th><th>Tool</th><th>Args</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</main>
<div class="footer">
  NatureCo CLI Dashboard · port ${PORT} · <a href="/api" style="color:#22c55e">/api</a> tam JSON için
</div>
<script>
async function load() {
  try {
    const res = await fetch('/api');
    const data = await res.json();
    document.getElementById('ts').textContent = new Date(data.timestamp).toLocaleString();

    // Costs
    const todayEntries = (data.costs.entries || []).filter(e => {
      const d = new Date(e.ts);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    const todayCost = todayEntries.reduce((s, e) => s + (e.cost || 0), 0);
    document.getElementById('cost-today').textContent = '$' + todayCost.toFixed(4);
    const dailyLimit = 5.00;
    const pct = Math.min(100, (todayCost / dailyLimit) * 100);
    const bar = document.getElementById('cost-bar');
    bar.style.width = pct + '%';
    bar.className = 'bar-fill' + (pct > 90 ? ' danger' : pct > 75 ? ' warn' : '');

    // Provider breakdown
    const byProvider = {};
    for (const e of todayEntries) {
      if (!byProvider[e.provider]) byProvider[e.provider] = { cost:0, tokens:0, count:0 };
      byProvider[e.provider].cost += e.cost;
      byProvider[e.provider].tokens += (e.input || 0) + (e.output || 0);
      byProvider[e.provider].count++;
    }
    const tbody = document.querySelector('#cost-table tbody');
    tbody.innerHTML = '';
    const sorted = Object.entries(byProvider).sort((a,b) => b[1].cost - a[1].cost);
    if (sorted.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Henüz maliyet kaydı yok.</td></tr>';
    }
    for (const [prov, info] of sorted) {
      tbody.innerHTML += '<tr><td>' + prov + '</td><td>$' + info.cost.toFixed(4) + '</td><td>' + info.tokens.toLocaleString() + '</td><td>' + info.count + '</td></tr>';
    }

    // Skills & proposals
    const skills = (data.skills.skills || []);
    document.getElementById('skill-count').textContent = skills.length;
    const pendingProposals = (data.proposals || []).filter(p => p.status === 'pending');
    document.getElementById('proposal-count').textContent = pendingProposals.length;
    const ptbody = document.querySelector('#proposals-table tbody');
    ptbody.innerHTML = '';
    if (pendingProposals.length === 0) {
      ptbody.innerHTML = '<tr><td colspan="4" class="empty">Bekleyen proposal yok.</td></tr>';
    }
    for (const p of pendingProposals) {
      ptbody.innerHTML += '<tr><td><span class="pill pill-blue">' + (p.suggestedName || '?') + '</span></td><td>' + p.count + 'x</td><td><code>' + (p.pattern || '').slice(0, 60) + '</code></td><td>' + new Date(p.firstSeen).toLocaleString() + '</td></tr>';
    }

    // Crons
    const crons = Array.isArray(data.crons) ? data.crons : (data.crons.jobs || []);
    document.getElementById('cron-count').textContent = crons.length;

    // Audit
    document.getElementById('audit-count').textContent = data.audit.today;
    const atbody = document.querySelector('#audit-table tbody');
    atbody.innerHTML = '';
    const sortedAudit = Object.entries(data.audit.byAction).sort((a,b) => b[1] - a[1]);
    if (sortedAudit.length === 0) {
      atbody.innerHTML = '<tr><td colspan="2" class="empty">Bugün audit kaydı yok.</td></tr>';
    }
    for (const [act, count] of sortedAudit) {
      atbody.innerHTML += '<tr><td><code>' + act + '</code></td><td>' + count + '</td></tr>';
    }

    // Recent patterns
    const recent = (data.patterns.sequences || []).slice(-10).reverse();
    const patBody = document.querySelector('#patterns-table tbody');
    patBody.innerHTML = '';
    if (recent.length === 0) {
      patBody.innerHTML = '<tr><td colspan="3" class="empty">Henüz tool çağrısı kaydedilmemiş.</td></tr>';
    }
    for (const r of recent) {
      const args = JSON.stringify(r.call.args || {}).slice(0, 80);
      patBody.innerHTML += '<tr><td>' + new Date(r.ts).toLocaleTimeString() + '</td><td><code>' + (r.call.tool || '?') + '</code></td><td><code>' + args + '</code></td></tr>';
    }
  } catch (e) {
    document.getElementById('ts').textContent = 'Error: ' + e.message;
  }
}
load();
setInterval(load, 5000);
</script>
</body>
</html>`;

function startServer(port = PORT) {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname === '/api' || parsed.pathname === '/api/') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(getDashboardData(), null, 2));
      return;
    }
    if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_PAGE);
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, HOST, () => {
    console.log(`\n  🌿 NatureCo Dashboard başladı!`);
    console.log(`  📊 http://${HOST}:${port}`);
    console.log(`  🔌 API:  http://${HOST}:${port}/api`);
    console.log(`  ⏹  Durdurmak için Ctrl+C\n`);
  });

  return server;
}

module.exports = { startServer, getDashboardData, PORT, HOST };
