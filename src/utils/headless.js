/**
 * headless.js — run the code agent without a terminal.
 * Called from the gateway (WhatsApp `!code`), the API and other integrations.
 *
 * SECURITY: this path used to call executeTool directly, so it ran the same
 * model with the same tools but none of the brakes the interactive agent
 * applies — no risk assessment, no plan mode, no permission rules, no hooks.
 * It now screens every call through the shared gate (src/utils/tool-gate.js).
 * There is nobody to answer a prompt here, so anything that would have asked
 * is refused and the refusal is handed back to the model as a tool result.
 */

const { getProviderConfig } = require('./config');
const TB = require('./token-budget');
const { getToolDefinitions, executeTool } = require('./tool-runner');
const { indexProject, buildIndexPrompt } = require('./project-index');
const { createToolGate } = require('./tool-gate');
const { AgentCore } = require('./agent-core');
const { getLang } = require('./i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

const MAX_ITERATIONS = 12;

// ── Provider call (non-streaming) ───────────────────────────────────────────
async function callProvider(providerConfig, messages, tools = [], signal) {
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
    signal,
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

// ── Headless code agent ─────────────────────────────────────────────────────
/**
 * @param {string} task            what to do
 * @param {string} [projectDir]    working directory
 * @param {function} [onProgress]  progress callback (tool names, refusals)
 * @param {object}  [options]
 * @param {boolean} [options.dryRun]  refuse mutating tools outright
 */
async function runCodeAgent(task, projectDir = process.cwd(), onProgress = null, options = {}) {
  const providerConfig = getProviderConfig();
  if (!providerConfig) throw new Error(L('Provider yapılandırılmamış.', 'Provider is not configured.'));

  const projectIndex = indexProject(projectDir);
  const report = message => { if (onProgress) onProgress(message); };

  const systemPrompt = [
    L(
      'Sen bir code agent\'sın. Görevi sessizce tamamla ve kısa bir özet ver.',
      'You are a code agent. Complete the task quietly and give a short summary.',
    ),
    '',
    buildIndexPrompt(projectIndex),
    '',
    L(
      'NOT: Bu oturum gözetimsiz çalışıyor. Onay gerektiren işlemler (silme, yetki yükseltme, sistem dosyaları, hassas dosyalar) otomatik olarak reddedilir — reddedilirse alternatif bir yol dene ya da neden yapılamadığını açıkla.',
      'NOTE: This session is unattended. Operations that need approval (deletion, privilege escalation, system files, sensitive files) are refused automatically — if refused, try another route or explain why it cannot be done.',
    ),
  ].join('\n');

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

  const agentCore = new AgentCore({ maxIterations: MAX_ITERATIONS });
  agentCore.startRequest();
  // No `confirm` / `askPermission`: the gate refuses instead of prompting.
  const screenToolCall = createToolGate({
    agentCore,
    dryRun: Boolean(options.dryRun),
    log: message => report(String(message)),
  });

  const filesChanged = [];
  const refusals = [];
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    agentCore.startIteration();

    if (TB.needsCompaction(messages)) {
      const trimmed = TB.smartTrim(messages);
      messages.splice(0, messages.length, ...trimmed);
    }

    const response = await callProvider(providerConfig, messages, tools, options.signal);

    const assistantMsg = { role: 'assistant', content: response.content || null };
    if (response.tool_calls?.length) {
      assistantMsg.tool_calls = response.tool_calls.map((tc, index) => ({
        id: tc.id || `call_${iteration}_${index}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      }));
    }
    messages.push(assistantMsg);

    if (!response.tool_calls?.length) {
      return {
        reply: response.content || L('Görev tamamlandı.', 'Task completed.'),
        filesChanged,
        refusals,
        iterations: iteration,
      };
    }

    for (let index = 0; index < response.tool_calls.length; index++) {
      const toolCall = response.tool_calls[index];
      const callId = assistantMsg.tool_calls[index].id;

      const refusal = await screenToolCall(toolCall.name, toolCall.input);
      if (refusal) {
        refusals.push({ tool: toolCall.name, reason: refusal });
        report(`⛔ ${toolCall.name}`);
        messages.push({ role: 'tool', tool_call_id: callId, name: toolCall.name, content: `ERROR: ${refusal}` });
        continue;
      }

      report(`🔧 ${toolCall.name}`);

      let result;
      try {
        result = await executeTool(toolCall.name, toolCall.input);
      } catch (error) {
        result = { success: false, error: error.message };
      }
      agentCore.record({ name: toolCall.name, input: toolCall.input }, result);

      if ((toolCall.name === 'write_file' || toolCall.name === 'edit_file') && result.success !== false) {
        filesChanged.push(toolCall.input.path || toolCall.input.filePath || '?');
      }

      const resultStr = result.success !== false
        ? (result.output || JSON.stringify(result))
        : `${L('Hata', 'Error')}: ${result.error}`;

      messages.push({
        role: 'tool',
        tool_call_id: callId,
        name: toolCall.name,
        content: String(resultStr).slice(0, TB.load().toolMaxChars),
      });
    }
  }

  return {
    reply: L(
      `Görev ${MAX_ITERATIONS} turda tamamlanamadı.`,
      `The task did not finish within ${MAX_ITERATIONS} rounds.`,
    ),
    filesChanged,
    refusals,
    iterations: iteration,
  };
}

module.exports = { runCodeAgent, indexProject, MAX_ITERATIONS };
