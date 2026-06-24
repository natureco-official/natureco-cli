/**
 * headless.js — Code agent'ı terminal olmadan çalıştır
 * WhatsApp, API ve diğer entegrasyonlardan çağrılabilir
 */

const fs = require('fs');
const path = require('path');
const { getProviderConfig } = require('./config');
const TB = require('./token-budget');
const { getToolDefinitions, executeTool } = require('./tool-runner');

// ── Proje indexing (code.js'den paylaşılan) ───────────────────────────────────
const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.venv', 'venv', 'target', '.wrangler',
]);

function scanDir(dir, maxDepth, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth > 0) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      const sub = scanDir(path.join(dir, entry.name), maxDepth, depth + 1);
      results.push(...sub.map(f => entry.name + '/' + f));
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

async function indexProject(projectDir) {
  const files = scanDir(projectDir, 2);
  const fileSet = new Set(files);
  let type = 'unknown';
  let packageInfo = null;

  if (fileSet.has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      packageInfo = { name: pkg.name, version: pkg.version, scripts: pkg.scripts || {} };
      if (deps.react) type = 'react';
      else if (deps.next) type = 'nextjs';
      else if (deps.express || deps.fastify) type = 'node-server';
      else type = 'node';
    } catch {}
  } else if (files.some(f => f.endsWith('.py'))) {
    type = 'python';
  } else if (fileSet.has('Cargo.toml')) {
    type = 'rust';
  }

  return { dir: projectDir, files, type, packageInfo };
}

// ── Provider API çağrısı (non-streaming) ─────────────────────────────────────
async function callProvider(providerConfig, messages, tools = []) {
  const body = {
    model: providerConfig.model,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch(`${providerConfig.url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Provider error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content || '',
    tool_calls: (msg?.tool_calls || []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
    })),
  };
}

// ── Headless code agent ───────────────────────────────────────────────────────
async function runCodeAgent(task, projectDir = process.cwd(), onProgress = null) {
  const providerConfig = getProviderConfig();
  if (!providerConfig) throw new Error('Provider yapılandırılmamış.');

  const projectIndex = await indexProject(projectDir);

  const systemPrompt = `Sen bir code agent'sın. Görevi sessizce tamamla ve kısa özet ver.
Proje tipi: ${projectIndex.type}
Proje dizini: ${projectDir}
Dosyalar: ${projectIndex.files.slice(0, 25).join(', ')}`;

  const localTools = getToolDefinitions();
  const tools = localTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ];

  const filesChanged = [];
  let iteration = 0;

  while (iteration < 10) {
    iteration++;

    const response = await callProvider(providerConfig, messages, tools);

    const assistantMsg = { role: 'assistant', content: response.content };
    if (response.tool_calls?.length) {
      assistantMsg.tool_calls = response.tool_calls.map(tc => ({
        id: tc.id || `call_${Date.now()}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      }));
    }
    messages.push(assistantMsg);

    if (!response.tool_calls?.length) {
      // Final cevap
      return {
        reply: response.content || 'Görev tamamlandı.',
        filesChanged,
        iterations: iteration,
      };
    }

    // Tool'ları çalıştır
    for (const toolCall of response.tool_calls) {
      if (onProgress) onProgress(`🔧 ${toolCall.name}`);

      const result = await executeTool(toolCall.name, toolCall.input);

      if (toolCall.name === 'write_file' && result.success !== false) {
        filesChanged.push(toolCall.input.path || '?');
      }

      const resultStr = result.success !== false
        ? (result.output || JSON.stringify(result))
        : `Hata: ${result.error}`;

      messages.push({
        role: 'tool',
        tool_call_id: assistantMsg.tool_calls?.find(tc => tc.function.name === toolCall.name)?.id || toolCall.id,
        name: toolCall.name,
        content: resultStr.slice(0, TB.load().toolMaxChars),
      });
    }
  }

  return { reply: 'Görev tamamlandı (max iterasyon).', filesChanged, iterations: iteration };
}

module.exports = { runCodeAgent, indexProject };
