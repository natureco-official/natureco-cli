// NatureCo CLI v2.10.1 - Universal LLM Provider Support + MCP Integration
// Supports: OpenAI, Groq, Together, Fireworks, Perplexity, Mistral, DeepSeek, OpenRouter, Ollama, LM Studio, Anthropic

const fs = require('fs');
const os = require('os');
const path = require('path');
const chalk = require('chalk');
const { getConfig } = require('./config');
const { getToolDefinitions, executeToolCalls } = require('./tool-runner');
const { MCPClient } = require('./mcp-client');
const TB = require('./token-budget');
const { accumulateToolCallDeltas, finalizeToolCalls } = require('./streaming-tools');
const { AgentCore } = require('./agent-core');
const { selectTools, buildCatalog, buildCatalogNames, createEnableToolsTool } = require('./tool-profile');

/**
 * v5.5.0: Provider-specific format detection
 * Groq, OpenAI, Anthropic, Mistral, DeepSeek, OpenRouter, Ollama, MiniMax
 *
 * Canonical implementation lives in src/utils/provider-detect.js;
 * re-exported here so the historical `detectProvider` reference inside
 * api.js continues to work without touching every call site.
 */
const { detectProvider, isMiniMax, isGemini, buildChatEndpoint } = require('./provider-detect');

/**
 * v5.5.0: Tool definitions'ı provider'a göre normalize et
 * - OpenAI/Groq/Mistral/DeepSeek/OpenRouter: tool_choice, function calling OK
 * - Anthropic: tools, system ayrı, content array
 * - Ollama: tool support sınırlı, genelde yok
 * - Perplexity: tool support yok
 */
function normalizeToolsForProvider(tools, provider) {
  if (!tools || tools.length === 0) return tools;
  if (provider === 'ollama' || provider === 'perplexity') {
    // Bu providerlar tool support etmiyor - bos dondur
    return [];
  }
  if (provider === 'anthropic') {
    // Anthropic tools format: { name, description, input_schema }
    return tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters || { type: 'object', properties: {} }
    }));
  }
  // OpenAI-compatible (Groq, Mistral, DeepSeek, OpenRouter, MiniMax, Together, Fireworks)
  return tools;
}

/**
 * v5.5.0: Tool call'ları provider'a göre parse et
 * OpenAI: tool_calls[].function.arguments (string)
 * Anthropic: content[].type=tool_use, input (object)
 * Ollama: genelde yok
 */
function parseToolCallsFromResponse(message, provider) {
  if (provider === 'anthropic') {
    // Anthropic: content array içinde tool_use blokları var
    if (Array.isArray(message.content)) {
      const toolUses = message.content.filter(c => c.type === 'tool_use');
      return toolUses.map(tu => ({
        id: tu.id,
        type: 'function',
        function: {
          name: tu.name,
          arguments: JSON.stringify(tu.input || {})
        }
      }));
    }
    return [];
  }
  // OpenAI-compatible
  return message.tool_calls || [];
}

/**
 * Anthropic Messages API requires `system` to be either a non-empty string
 * or omitted entirely. Sending `undefined` (which JSON.stringify drops to
 * silent absence) leaves the model unanchored; sending `''` returns 400
 * "system: cannot be empty" on recent API revisions. Always pass a
 * meaningful default when no system message is present.
 */
const DEFAULT_ANTHROPIC_SYSTEM =
  'You are a helpful AI assistant running inside the natureco CLI.';

function extractSystemForAnthropic(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  if (!systemMsg) return DEFAULT_ANTHROPIC_SYSTEM;
  // content may be a string or an array of content blocks; both round-trip.
  if (typeof systemMsg.content === 'string') {
    return systemMsg.content.trim() || DEFAULT_ANTHROPIC_SYSTEM;
  }
  if (Array.isArray(systemMsg.content) && systemMsg.content.length > 0) {
    return systemMsg.content;
  }
  return DEFAULT_ANTHROPIC_SYSTEM;
}

/**
 * v5.5.0: System mesajı provider'a göre ayarla
 * - OpenAI: messages[].role=system
 * - Anthropic: ayrı 'system' field
 */
function toAnthropicMessages(messages) {
  const converted = [];
  for (const message of messages.filter(item => item.role !== 'system')) {
    if (message.role === 'assistant') {
      const content = [];
      if (typeof message.content === 'string' && message.content.length > 0) {
        content.push({ type: 'text', text: message.content });
      } else if (Array.isArray(message.content)) {
        content.push(...message.content);
      }
      for (const call of message.tool_calls || []) {
        let input = {};
        try { input = JSON.parse(call.function?.arguments || '{}'); } catch {}
        content.push({
          type: 'tool_use',
          id: call.id,
          name: call.function?.name,
          input,
        });
      }
      converted.push({ role: 'assistant', content: content.length > 0 ? content : '' });
      continue;
    }
    if (message.role === 'tool') {
      converted.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content ?? ''),
        }],
      });
      continue;
    }
    converted.push({ role: message.role, content: message.content });
  }
  const merged = [];
  const blocks = content => Array.isArray(content)
    ? content
    : [{ type: 'text', text: String(content ?? '') }];
  for (const message of converted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === message.role) {
      previous.content = [...blocks(previous.content), ...blocks(message.content)];
    } else {
      merged.push(message);
    }
  }
  return merged;
}

function buildRequestBody(messages, model, options = {}, provider) {
  const maxTokens = options.max_tokens ?? options.maxTokens ??
    (provider === 'anthropic' ? 2000 : 2048);
  const temperature = options.temperature ?? 0.7;
  if (provider === 'anthropic') {
    return {
      model,
      messages: toAnthropicMessages(messages),
      system: extractSystemForAnthropic(messages),
      max_tokens: maxTokens,
      temperature,
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {})
    };
  }
  // OpenAI-compatible
  return {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {})
  };
}

function buildProviderRequest(providerConfig, messages, tools, options = {}) {
  const anthropic = providerConfig.isAnthropic ||
    detectProvider(providerConfig.url, providerConfig.model) === 'anthropic';
  const provider = anthropic ? 'anthropic' : 'openai';
  let usableTools = !anthropic && providerConfig.url.includes('api.natureco.me')
    ? []
    : (tools || []);
  if (anthropic) {
    usableTools = usableTools.map(tool => tool.function ? {
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters || { type: 'object', properties: {} },
    } : tool);
  }
  const body = buildRequestBody(messages, options.model || providerConfig.model, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    tools: usableTools,
  }, provider);
  if (anthropic && options.temperature === undefined) delete body.temperature;
  if (options.responseFormat && !anthropic) body.response_format = options.responseFormat;
  if (options.stream !== undefined) body.stream = Boolean(options.stream);

  return {
    provider,
    endpoint: anthropic
      ? `${providerConfig.url.replace(/\/+$/, '')}/v1/messages`
      : buildChatEndpoint(providerConfig.url),
    headers: anthropic
      ? {
          'x-api-key': providerConfig.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        }
      : {
          'Authorization': `Bearer ${providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
    body,
  };
}


// Persistent conversation directory
const CONV_DIR = path.join(os.homedir(), '.natureco', 'conversations');

// Conversation history for multi-turn chat (deprecated - now using disk storage)
const conversationHistory = new Map();

// MCP clients (server name -> { client, tools })
const mcpClients = {};

/**
 * Generate default conversation ID based on provider config
 */
function generateDefaultConvId() {
  const config = getConfig();
  
  // Use provider URL + model as base for consistent ID
  const providerUrl = config.providerUrl || 'default';
  const model = config.providerModel || 'default';
  
  // Create simple hash-like ID from provider + model
  const base = `${providerUrl}_${model}`.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  // Return consistent ID (e.g., "groq_llama_3_1_8b_instant")
  return base.slice(0, 50); // Limit length
}

/**
 * Load conversation from disk
 */
function loadConversation(convId) {
  const file = path.join(CONV_DIR, `${convId.replace(/[^a-z0-9]/gi, '_')}.json`);
  try {
    fs.mkdirSync(CONV_DIR, { recursive: true });
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    // Silently fail
  }
  return [];
}

/**
 * Save conversation to disk
 */
function saveConversation(convId, messages) {
  const file = path.join(CONV_DIR, `${convId.replace(/[^a-z0-9]/gi, '_')}.json`);
  try {
    fs.mkdirSync(CONV_DIR, { recursive: true });
    // Keep only last 10 messages
    fs.writeFileSync(file, JSON.stringify(messages.slice(-(TB.load().conversationOnDisk)), null, 2));
  } catch (e) {
    // Silently fail
  }
}

/**
 * Start MCP servers from config
 */
async function startMcpServers() {
  const config = getConfig();
  
  // Skip if MCP is disabled
  if (config.mcpEnabled === false) {
    debugLog('[MCP] MCP is disabled in config, skipping server startup');
    return;
  }
  
  const servers = config.mcpServers || {};
  
  for (const [name, server] of Object.entries(servers)) {
    // Skip disabled servers
    if (server.disabled) {
      debugLog(`[MCP] Skipping disabled server: ${name}`);
      continue;
    }
    
    // Skip if already started
    if (mcpClients[name]) {
      debugLog(`[MCP] Server already running: ${name}`);
      continue;
    }
    
    try {
      debugLog(`[MCP] Starting server: ${name}`);
      
      const client = new MCPClient(server.command, server.args, server.env || {});
      await client.start();
      
      const tools = await client.listTools();
      debugLog(`[MCP] Server ${name} loaded ${tools.length} tools`);
      
      mcpClients[name] = { client, tools };
      
    } catch (err) {
      debugLog(`[MCP] Failed to start server ${name}: ${err.message}`);
    }
  }
}

/**
 * Stop all MCP servers
 */
function stopMcpServers() {
  for (const [name, { client }] of Object.entries(mcpClients)) {
    try {
      debugLog(`[MCP] Stopping server: ${name}`);
      client.stop();
    } catch (err) {
      debugLog(`[MCP] Failed to stop server ${name}: ${err.message}`);
    }
  }
  
  // Clear clients
  Object.keys(mcpClients).forEach(key => delete mcpClients[key]);
}

/**
 * Get all MCP tools (combined from all servers)
 */
function getMcpTools() {
  const allTools = [];
  
  for (const [serverName, { tools }] of Object.entries(mcpClients)) {
    for (const tool of tools) {
      allTools.push({
        ...tool,
        _mcpServer: serverName, // Track which server this tool belongs to
      });
    }
  }
  
  return allTools;
}

// Groq-incompatible MCP tools (strict validation issues)
const BLOCKED_MCP_TOOLS = ['search_issues', 'search_repositories'];

/**
 * Get MCP tools filtered for AI consumption
 * Removes tools that are incompatible with Groq's strict validation
 */
function getMcpToolsForAI() {
  const tools = getMcpTools();
  return tools.filter(t => !BLOCKED_MCP_TOOLS.includes(t.name));
}

/**
 * Normalize MCP tool schema for AI consumption
 * Adds hints to number/integer parameters to prevent string conversion
 */
function normalizeMcpToolSchema(tool) {
  const schema = tool.inputSchema || tool.input_schema || {};
  
  // Ensure properties exist
  if (!schema.properties) return tool;
  
  // Clone schema to avoid mutating original
  const normalizedSchema = JSON.parse(JSON.stringify(schema));
  
  // Groq sometimes sends strings for number params
  // Add coercion hint to description
  for (const [key, prop] of Object.entries(normalizedSchema.properties)) {
    if (prop.type === 'number' || prop.type === 'integer') {
      prop.description = (prop.description || '') + ' (must be a number, not a string)';
    }
  }
  
  return { ...tool, inputSchema: normalizedSchema };
}

/**
 * Minimize MCP tool schema to reduce token usage
 * Truncates descriptions and removes unnecessary fields
 */
function minimizeMcpTool(tool) {
  return {
    name: tool.name,
    description: TB.capMcpDesc(tool.description),
    inputSchema: {
      type: tool.inputSchema?.type || 'object',
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema?.properties || {}).map(([k, v]) => [
          k,
          { 
            type: v.type,
            ...(v.enum ? { enum: v.enum } : {})  // Include enum only if exists
          }
        ])
      ),
      required: tool.inputSchema?.required || []
    }
  };
}

/**
 * Coerce MCP tool parameters to match schema types
 */
function coerceMcpParams(tool, params) {
  // GitHub MCP uses inputSchema, others may use input_schema
  // Try all possible schema locations
  const schema = tool.inputSchema?.properties || 
                 tool.input_schema?.properties || 
                 tool.parameters?.properties ||  // fallback
                 {};
  
  const coerced = { ...params };
  
  for (const [key, def] of Object.entries(schema)) {
    if (coerced[key] === undefined || coerced[key] === null) continue;
    
    // Coerce number or integer
    if ((def.type === 'number' || def.type === 'integer') && typeof coerced[key] === 'string') {
      const num = Number(coerced[key]);
      if (!isNaN(num)) {
        coerced[key] = num;
      }
    }
    
    // Coerce boolean
    if (def.type === 'boolean' && typeof coerced[key] === 'string') {
      coerced[key] = coerced[key] === 'true' || coerced[key] === '1';
    }
  }
  
  return coerced;
}

/**
 * Execute MCP tool call
 */
async function executeMcpTool(toolName, toolArgs) {
  // Find which server has this tool
  for (const [serverName, { client, tools }] of Object.entries(mcpClients)) {
    const tool = tools.find(t => t.name === toolName);
    
    if (tool) {
      debugLog(`[MCP] Calling tool ${toolName} on server ${serverName}`);
      
      try {
        // Coerce parameters to match schema types
        const coercedArgs = coerceMcpParams(tool, toolArgs);
        
        const result = await client.callTool(toolName, coercedArgs);
        
        // MCP returns { content: [{ type: 'text', text: '...' }] }
        if (result.content && result.content.length > 0) {
          // Extract all text content and join with newlines
          const textContents = result.content
            .filter(c => c.type === 'text')
            .map(c => c.text);
          
          if (textContents.length > 0) {
            let output = textContents.join('\n');
            
            // Truncate MCP result
            const maxChars = TB.load().toolMaxChars;
            if (output.length > maxChars) {
              output = output.slice(0, maxChars) + '... (truncated)';
            }
            
            return {
              success: true,
              output: output
            };
          }
        }
        
        // Fallback: return entire result as JSON
        let fallbackOutput = JSON.stringify(result, null, 2);
        
        // Truncate fallback output too
        const maxChars = TB.load().toolMaxChars;
        if (fallbackOutput.length > maxChars) {
          fallbackOutput = fallbackOutput.slice(0, maxChars) + '... (truncated)';
        }
        
        return {
          success: true,
          output: fallbackOutput
        };
        
      } catch (err) {
        return {
          success: false,
          error: `MCP tool error: ${err.message}`
        };
      }
    }
  }
  
  return {
    success: false,
    error: `MCP tool not found: ${toolName}`
  };
}

/**
 * Encode tool result for safe transmission
 * Works for both MCP and local tools
 */
function encodeToolResult(toolResult) {
  let content;
  
  // Handle different result formats
  if (typeof toolResult === 'string') {
    content = toolResult;
  } else if (toolResult.output) {
    content = toolResult.output;
  } else if (toolResult.success !== undefined) {
    // Handle { success: true/false, output/error: ... } format
    content = toolResult.success ? (toolResult.output || JSON.stringify(toolResult)) : (toolResult.error || 'Unknown error');
  } else {
    content = JSON.stringify(toolResult);
  }
  
  // Base64 encode
  const encoded = Buffer.from(content).toString('base64');
  return `[BASE64_ENCODED_RESULT]: ${encoded}`;
}

/**
 * Check if debug mode is enabled
 */
function isDebugEnabled() {
  const config = getConfig();
  return config.debug === true || config.debug === 'true';
}

/**
 * Debug log (only if debug mode enabled)
 */
function debugLog(...args) {
  if (isDebugEnabled()) {
    console.log(...args);
  }
}

/**
 * Get provider configuration from config
 */
function getProviderConfig() {
  const config = getConfig();
  
  // Universal provider config (v2.1.0+)
  if (config.providerUrl && config.providerApiKey) {
    return {
      url: config.providerUrl,
      apiKey: config.providerApiKey,
      model: config.providerModel || 'llama-3.3-70b-versatile',
      isAnthropic: config.providerUrl.includes('anthropic.com')
    };
  }
  
  // Legacy Groq config (v2.0.x)
  if (config.groqApiKey) {
    return {
      url: 'https://api.groq.com/openai/v1',
      apiKey: config.groqApiKey,
      model: config.groqModel || 'llama-3.3-70b-versatile',
      isAnthropic: false
    };
  }
  
  return null;
}

/**
 * Every tool the chat agent knows about — local plus MCP.
 * Execution resolves against this full set; only the advertised subset is
 * serialized into a request (see advertisedTools).
 */
function allKnownTools() {
  const config = getConfig();
  const allTools = [...getToolDefinitions()];
  if (config.mcpEnabled !== false) {
    const mcpTools = getMcpToolsForAI().map(minimizeMcpTool);
    allTools.push(...mcpTools.map(tool => normalizeMcpToolSchema(tool)));
  }
  // `enable_tools` is a session-scoped meta-tool handled inside this loop, not
  // a manifest entry. Tools here are described with `inputSchema`.
  const enableTool = createEnableToolsTool(
    chatEnabledTools,
    () => allTools.map(t => t.name),
    () => buildCatalogNames(selectTools(allTools, { profile: config.toolProfile === 'all' ? 'all' : 'core', enabled: chatEnabledTools }).hidden),
  );
  allTools.push({ ...enableTool, inputSchema: enableTool.parameters });
  return allTools;
}

/**
 * Trim the advertised set the same way the coding agent does.
 *
 * `natureco chat` was serializing all 90 tool schemas — ~14.7k tokens — into
 * every single request, on a default 16k context budget. The user pays for that
 * on every message whether the turn touches a tool or not.
 */
function advertisedTools(allTools) {
  const config = getConfig();
  const profile = config.toolProfile === 'all' ? 'all' : 'core';
  const { exposed, hidden } = selectTools(allTools, { profile, enabled: chatEnabledTools });
  return { exposed, hidden, catalog: buildCatalog(hidden) };
}

/**
 * Names the chat agent has pulled in via `enable_tools` this process.
 */
const chatEnabledTools = new Set();

/**
 * Format tool definitions for OpenAI-compatible APIs
 */
function formatToolsForOpenAI(toolList) {
  const allTools = toolList || allKnownTools();
  return allTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
    }
  }));
}

/**
 * Format tool definitions for Anthropic API
 */
function formatToolsForAnthropic(toolList) {
  const allTools = toolList || allKnownTools();
  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {} }
  }));
}

/**
 * Send message to OpenAI-compatible provider (Groq, OpenAI, Together, etc.)
 */
async function sendMessageOpenAICompatible(providerConfig, messages, tools) {
  const request = buildProviderRequest(providerConfig, messages, tools, {
    stream: false,
    maxTokens: 2048,
  });
  // Tek doğruluk kaynağı: provider-detect.buildChatEndpoint (MiniMax /v1 toleransı dahil)
  const endpoint = request.endpoint;
  const requestBody = request.body;

  // NatureCo için tool calling desteklenmiyor
  if (!providerConfig.url.includes('api.natureco.me')) {
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.text
    || data.response
    || data.content
    || '';
  // Maliyet takibi — usage döndüren her çağrı kaydedilir (natureco cost)
  recordUsageSafe(providerConfig, data.usage);
  return {
    role: 'assistant',
    content,
    tool_calls: data.choices?.[0]?.message?.tool_calls || undefined,
    usage: data.usage || undefined,
  };
}

/**
 * Kullanımı cost-tracker'a kaydet; takip hatası asıl akışı asla bozmasın.
 */
function recordUsageSafe(providerConfig, usage) {
  if (!usage) return;
  try {
    const { recordUsage } = require('./cost-tracker');
    recordUsage({
      provider: detectProvider(providerConfig.url, providerConfig.model),
      model: providerConfig.model,
      input: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      output: usage.completion_tokens ?? usage.output_tokens ?? 0,
      command: process.argv.slice(2).find(a => !a.startsWith('-')) || null,
    });
  } catch { /* takip hatası sessiz geçilir */ }
}

/**
 * Send message to Anthropic API
 */
async function sendMessageAnthropic(providerConfig, messages, tools) {
  const request = buildProviderRequest(providerConfig, messages, tools, {
    stream: false,
    maxTokens: 2000,
  });
  const endpoint = request.endpoint;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Convert Anthropic response to OpenAI format
  const content = data.content.find(c => c.type === 'text')?.text || '';
  const toolCalls = data.content
    .filter(c => c.type === 'tool_use')
    .map(c => ({
      id: c.id,
      type: 'function',
      function: {
        name: c.name,
        arguments: JSON.stringify(c.input)
      }
    }));

  // Maliyet takibi (Anthropic: input_tokens/output_tokens)
  recordUsageSafe(providerConfig, data.usage);

  return {
    role: 'assistant',
    content: content,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: data.usage || undefined,
  };
}

/**
 * Send message with tool support (universal)
 */
async function sendMessageToProvider(apiKey, message, conversationId = null, systemPrompt = null, options = {}) {
  // Per-request state prevents concurrent conversations from contaminating one
  // another while preserving failure/no-progress counters across tool rounds.
  const agentCore = new AgentCore({ maxIterations: 10 });
  agentCore.startRequest();
  const guardrails = agentCore.guardrails;
  const providerConfig = getProviderConfig();
  
  if (!providerConfig) {
    throw new Error(
      'Provider not configured. Set with:\n' +
      '  natureco config set providerUrl https://api.groq.com/openai/v1\n' +
      '  natureco config set providerApiKey gsk_xxx\n' +
      '  natureco config set providerModel llama-3.3-70b-versatile'
    );
  }

  // Start MCP servers if not already started
  if (Object.keys(mcpClients).length === 0) {
    await startMcpServers();
  }

  // Get or create conversation history (load from disk)
  // Use consistent ID based on provider config instead of timestamp
  const convId = conversationId || generateDefaultConvId();
  const history = loadConversation(convId);

  // Augment system prompt with project AGENTS.md instructions
  const agentsMd = require('./agents-md');
  const augmentedPrompt = agentsMd.injectIntoPrompt(systemPrompt || '', options?.cwd || process.cwd());

  // Build messages
  let messages = [];
  if (augmentedPrompt) {
    messages.push({ role: 'system', content: augmentedPrompt });
  }
  messages.push(...history);
  messages.push({ role: 'user', content: message });

  // Get tool definitions (local + MCP) — skip if noTools flag set (chat mode).
  // Only the advertised subset is serialized; `enable_tools` pulls in the rest
  // on demand and the catalogue tells the model what exists.
  const knownTools = options.noTools ? [] : allKnownTools();

  // Recomputed per iteration: `enable_tools` widens the advertised set mid-turn,
  // and the model must see the new schemas on its very next step.
  function currentTools() {
    if (options.noTools) return { tools: [], catalog: '' };
    const advertised = advertisedTools(knownTools);
    return {
      tools: providerConfig.isAnthropic
        ? formatToolsForAnthropic(advertised.exposed)
        : formatToolsForOpenAI(advertised.exposed),
      catalog: advertised.catalog,
    };
  }

  function applyCatalog(catalog) {
    if (!catalog) return;
    const marker = '\n\n' + catalog;
    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex < 0) {
      messages.unshift({ role: 'system', content: catalog });
      return;
    }
    const previous = messages[systemIndex].content || '';
    // Replace any earlier catalogue rather than stacking one per iteration.
    const stripped = previous.split(/\n\nAdditional tools \(|\n\nEk araçlar \(/)[0];
    messages[systemIndex] = { ...messages[systemIndex], content: stripped + marker };
  }

  debugLog('\n[Provider] Sending request...');
  debugLog('[Provider] URL:', providerConfig.url);
  debugLog('[Provider] Model:', providerConfig.model);
  debugLog('[Provider] Type:', providerConfig.isAnthropic ? 'Anthropic' : 'OpenAI-compatible');
  debugLog('[Provider] Messages:', messages.length);
  debugLog('[Provider] Known tools:', knownTools.length, `(${Object.keys(mcpClients).length} MCP servers)`);

  // Tool execution loop (max 10 iterations)
  let iteration = 0;
  const maxIterations = 10;
  let finalResponse = null;
  const stream = (options.stream ?? options.noStream === undefined) !== false && 
    !providerConfig.url.includes('api.natureco.me');

  while (iteration < maxIterations) {
    iteration++;
    debugLog(`\n[Provider] Iteration ${iteration}/${maxIterations}`);

    let assistantMessage;

    // Keep the transcript under the context ceiling BEFORE the request. This
    // used to run once after the loop and its return value was discarded
    // (`TB.trimMessages(messages)` as a bare statement), so the chat agent had
    // no working context trimming at all and long conversations eventually
    // failed with a provider context-length error.
    if (TB.needsCompaction(messages)) {
      const trimmed = TB.trimMessages(messages);
      messages.splice(0, messages.length, ...trimmed);
      debugLog(`[Context] Compacted transcript to ${messages.length} messages`);
    }

    const advertised = currentTools();
    const tools = advertised.tools;
    applyCatalog(advertised.catalog);
    debugLog('[Provider] Advertised tools:', tools.length);

    if (stream) {
      assistantMessage = await streamProviderCompletion(providerConfig, messages, tools);
    } else {
      assistantMessage = providerConfig.isAnthropic
        ? await sendMessageAnthropic(providerConfig, messages, tools)
        : await sendMessageOpenAICompatible(providerConfig, messages, tools);
    }

    if (!assistantMessage) {
      return {
        reply: 'No response from provider',
        conversation_id: convId,
        message_id: `msg_${Date.now()}`,
        success: false
      };
    }

    // Track token usage if available
    if (assistantMessage.usage) {
      TB.trackUsage(convId, {
        input: assistantMessage.usage.prompt_tokens || assistantMessage.usage.input_tokens || 0,
        output: assistantMessage.usage.completion_tokens || assistantMessage.usage.output_tokens || 0
      });
    }

    debugLog('[Provider] Response type:', assistantMessage?.tool_calls ? 'tool_calls' : 'text');

    // Add assistant message to history
    messages.push(assistantMessage);

    // Check for tool calls
    const hasToolCalls = assistantMessage?.tool_calls?.length > 0;
    if (hasToolCalls) {
      debugLog(`[Provider] Tool calls: ${assistantMessage.tool_calls.length}`);

      // Separate local and MCP tool calls.
      // A model that emits truncated or malformed arguments used to throw here
      // and take the whole turn down with an unhandled SyntaxError; report the
      // bad call back to the model instead so it can correct itself.
      const malformedCalls = [];
      const toolCalls = [];
      for (const tc of assistantMessage.tool_calls) {
        try {
          toolCalls.push({ id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || '{}') });
        } catch (parseError) {
          malformedCalls.push({
            id: tc.id,
            name: tc.function.name,
            result: { error: `Tool arguments were not valid JSON: ${parseError.message}` },
          });
        }
      }

      // `enable_tools` is served here rather than from the manifest: it only
      // mutates what this loop advertises on the next iteration.
      const enableResults = [];
      const enableCalls = toolCalls.filter(tc => tc.name === 'enable_tools');
      for (const tc of enableCalls) {
        const enableTool = createEnableToolsTool(chatEnabledTools, () => knownTools.map(t => t.name));
        const outcome = await enableTool.execute(tc.input);
        enableResults.push({ id: tc.id, name: tc.name, result: { success: true, output: JSON.stringify(outcome) } });
      }

      // Group MCP and local tools
      const mcpTools = getMcpTools();
      const dispatchable = toolCalls.filter(tc => tc.name !== 'enable_tools');
      const mcpCalls = dispatchable.filter(tc => mcpTools.find(t => t.name === tc.name));
      const localCalls = dispatchable.filter(tc => !mcpTools.find(t => t.name === tc.name));

      // Guardrails: filter blocked tools
      agentCore.startIteration();
      const blockedMcp = mcpCalls.filter(tc => {
        const check = guardrails.check(tc.name, tc.input);
        return check.blocked;
      });
      const blockedLocal = localCalls.filter(tc => {
        const check = guardrails.check(tc.name, tc.input);
        return check.blocked;
      });

      // Execute local tools in parallel (tool-runner already parallelizes safe tools)
      let localResults = [];
      if (localCalls.filter(tc => !blockedLocal.includes(tc)).length > 0) {
        debugLog(`[Local] Executing ${localCalls.length} tool(s) concurrently`);
        localResults = await executeToolCalls(
          localCalls.filter(tc => !blockedLocal.includes(tc)),
          { toolDefinitions: getToolDefinitions() }
        );
        for (const r of localResults) {
          const original = localCalls.find(tc => tc.id === r.id);
          guardrails.record(r.name, original?.input || {}, r.result?.success !== false && !r.result?.error);
        }
      }

      // Execute MCP tools in parallel (they're independent by nature)
      let mcpResults = [];
      if (mcpCalls.filter(tc => !blockedMcp.includes(tc)).length > 0) {
        debugLog(`[MCP] Executing ${mcpCalls.length} tool(s) concurrently`);
        mcpResults = await Promise.all(
          mcpCalls.filter(tc => !blockedMcp.includes(tc)).map(async (tc) => {
            const result = await executeMcpTool(tc.name, tc.input);
            guardrails.record(tc.name, tc.input, result?.success !== false);
            return { id: tc.id, name: tc.name, result };
          })
        );
      }

      // Add blocked tool results as errors
      const allResults = [
        ...enableResults,
        ...malformedCalls,
        ...blockedMcp.map(tc => ({ id: tc.id, name: tc.name, result: { error: `blocked_by_guardrails: ${tc.name}` } })),
        ...blockedLocal.map(tc => ({ id: tc.id, name: tc.name, result: { error: `blocked_by_guardrails: ${tc.name}` } })),
        ...localResults,
        ...mcpResults,
      ];

      for (const result of allResults) {
        const encodedContent = encodeToolResult(result.result);
        messages.push({
          role: 'tool',
          tool_call_id: result.id,
          name: result.name,
          content: encodedContent
        });
      }

      // Continue loop to get final response
      continue;
    }

    // No tool calls, we have final response
    finalResponse = assistantMessage?.content;
    break;
  }

  if (iteration >= maxIterations) {
    debugLog('\n[Provider] Max iterations reached');
    finalResponse = finalResponse || 'Max tool execution iterations reached.';
  }

  // Save to conversation history (only user and final assistant message)
  history.push({ role: 'user', content: message });
  history.push({ role: 'assistant', content: finalResponse });

  // Save to disk (automatically keeps last 20 messages)
  saveConversation(convId, history);

  return {
    reply: finalResponse,
    conversation_id: convId,
    message_id: `msg_${Date.now()}`,
    success: true
  };
}

/**
 * Clear conversation history
 */
function clearConversation(conversationId) {
  if (conversationId) {
    // Delete from disk
    const file = path.join(CONV_DIR, `${conversationId.replace(/[^a-z0-9]/gi, '_')}.json`);
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (e) {
      // Silently fail
    }
    // Also clear from memory (legacy)
    conversationHistory.delete(conversationId);
  } else {
    // Clear all conversations from disk
    try {
      if (fs.existsSync(CONV_DIR)) {
        const files = fs.readdirSync(CONV_DIR);
        files.forEach(file => {
          fs.unlinkSync(path.join(CONV_DIR, file));
        });
      }
    } catch (e) {
      // Silently fail
    }
    // Also clear from memory (legacy)
    conversationHistory.clear();
  }
}

/**
 * Legacy function for compatibility
 * Now supports custom system prompts for different platforms (terminal, WhatsApp, etc.)
 * @param {string} chatSystemPrompt - System prompt from chat.js (skills + memory + agents)
 */
async function sendMessage(apiKey, botId, message, conversationId = null, chatSystemPrompt = '', options = {}) {
  // Handle legacy 6th param (toolDefinitions array was passed)
  if (Array.isArray(options)) options = {};
  const providerConfig = getProviderConfig();

  // Get user's home directory
  const homeDir = os.homedir();
  
  // Load memory to get botName
  const { loadMemory } = require('./memory');
  const mem = loadMemory(botId);
  
  // Get config to check MCP status
  const config = getConfig();

  // NatureCo — minimal system prompt, skip tool descriptions/MCP
  if (providerConfig && providerConfig.url.includes('api.natureco.me')) {
    const prompt = chatSystemPrompt || 'Sen yardımcı bir AI asistansın.';
    return sendMessageToProvider(apiKey, message, conversationId, prompt, options);
  }

  // Minimal base prompt (~200 token)
  const toolDefs = getToolDefinitions();
  const toolsDesc = toolDefs.map(t => t.name).join(', ');
  let systemPrompt = `Assistant. Tools: ${toolsDesc}. Home: ${homeDir}.`;

  // Skill prompts only, max 500 chars
  if (chatSystemPrompt) {
    systemPrompt += '\n' + chatSystemPrompt.slice(0, TB.load().systemPromptMaxChars);
  }
  
  return sendMessageToProvider(apiKey, message, conversationId, systemPrompt, options);
}

/**
 * Validate API key against NatureCo backend
 * Returns { valid, error, user }
 */
async function validateApiKey(apiKey) {
  const result = { valid: false, error: null, user: null };
  if (!apiKey) {
    result.error = 'API key boş olamaz';
    return result;
  }
  try {
    const res = await fetch('https://api.natureco.me/api/v1/user/me', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const body = await res.json();
      result.valid = true;
      result.user = body.user || body.data || body;
      return result;
    }
    let errorBody = '';
    try { errorBody = await res.text(); } catch {}
    result.error = `API doğrulama hatası (${res.status}): ${errorBody || 'Geçersiz API key'}`;
    return result;
  } catch (e) {
    result.error = `Bağlantı hatası: ${e.message}`;
    return result;
  }
}

/**
 * Get bots (not used in v2.x, kept for compatibility)
 */
async function getBots(apiKey) {
  const config = getConfig();
  const providerConfig = getProviderConfig();

  // NatureCo provider — gerçek bot listesini API'den çek
  if (config.providerUrl && config.providerUrl.includes('natureco.me')) {
    try {
      const res = await fetch('https://api.natureco.me/api/v1/bots', {
        headers: {
          'Authorization': `Bearer ${config.providerApiKey || apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const bots = Array.isArray(data) ? data : (data.bots || data.data || []);
        if (bots.length > 0) {
          return {
            bots: bots.map(b => ({
              id: b.id,
              name: b.name,
              ai_provider: b.ai_provider || 'natureco',
              model: b.model || 'natureco-default',
              system_prompt: b.system_prompt || '',
            }))
          };
        }
      }
    } catch (e) {
      debugLog('[getBots] NatureCo API error:', e.message);
      return { bots: [], error: e.message };
    }
  }

  // Diğer provider'lar — universal provider döndür
  const providerName = providerConfig?.isAnthropic ? 'Anthropic' : 'OpenAI-compatible';
  const botName = config.botName || `Universal Provider (${providerName})`;
  return {
    bots: [
      {
        id: 'universal-provider',
        name: botName,
        ai_provider: providerName,
        model: providerConfig?.model || 'unknown'
      }
    ]
  };
}

// ── Streaming Support ────────────────────────────────────────────────────────────

async function legacyStreamProviderCompletion(providerConfig, messages, tools) {
  if (providerConfig.isAnthropic) {
    return streamAnthropicCompletion(providerConfig, messages);
  }
  return streamOpenAICompletion(providerConfig, messages, tools);
}

async function legacyStreamOpenAICompletion(providerConfig, messages, tools) {
  const baseUrl = providerConfig.url.replace(/\/+$/, '');
  // Tek doğruluk kaynağı: provider-detect.buildChatEndpoint (MiniMax /v1 toleransı dahil)
  const endpoint = buildChatEndpoint(baseUrl);

  const requestBody = {
    model: providerConfig.model,
    messages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  };
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${providerConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`Provider API error: ${response.status} - ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  const toolCalls = [];
  let hasToolCalls = false;
  let streamUsage = null;
  // SSE satırları TCP chunk sınırında bölünebilir — kuyruk buffer'da taşınmalı,
  // yoksa bölünen JSON parse edilemez ve token sessizce kaybolur
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const parts = sseBuffer.split('\n');
    sseBuffer = parts.pop() || ''; // son (muhtemelen yarım) satırı sakla
    const lines = parts.filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.usage) streamUsage = parsed.usage; // son chunk'ta gelir
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls) {
          hasToolCalls = true;
          accumulateToolCallDeltas(toolCalls, delta.tool_calls);
        }

        const token = delta.content || '';
        if (token) {
          // Legacy implementation retained only for compatibility reference.
          fullText += token;
        }
      } catch {}
    }
  }
  // Maliyet takibi — sağlayıcı stream sonunda usage gönderdiyse kaydet
  recordUsageSafe(providerConfig, streamUsage);

      if (hasToolCalls) {
    return {
      type: 'tool_calls',
      message: {
        role: 'assistant',
        content: fullText || null,
        tool_calls: toolCalls
          .filter(tc => tc && tc.function && tc.function.name)
          .map(tc => ({
            id: tc.id || `call_${Date.now()}_${tc.index}`,
            type: tc.type || 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments || '' }
          }))
      }
    };
  }

  return { type: 'text', content: fullText };
}

async function legacyStreamAnthropicCompletion(providerConfig, messages) {
  const endpoint = `${providerConfig.url}/v1/messages`;

  const userMessages = messages.filter(m => m.role !== 'system');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': providerConfig.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: providerConfig.model,
      max_tokens: 2000,
      system: extractSystemForAnthropic(messages),
      messages: userMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} - ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const token = parsed.delta?.text || '';
        if (token) {
          fullText += token;
        }
      } catch {}
    }
  }

  return { type: 'text', content: fullText };
}

function emitStreamEvent(onEvent, event) {
  if (typeof onEvent === 'function') onEvent(event);
}

const DEFAULT_PROVIDER_CONNECT_TIMEOUT_MS = 60000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120000;

function streamTimeoutError(kind, timeoutMs) {
  const error = new Error(`Provider ${kind} timed out after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  error.code = kind === 'connection' ? 'PROVIDER_CONNECT_TIMEOUT' : 'PROVIDER_STREAM_IDLE_TIMEOUT';
  return error;
}

async function fetchProviderStream(endpoint, init, options = {}) {
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_PROVIDER_CONNECT_TIMEOUT_MS;
  const parentSignal = options.signal;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort(streamTimeoutError('connection', timeoutMs));
  }, timeoutMs) : null;

  try {
    return await fetch(endpoint, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw streamTimeoutError('connection', timeoutMs);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function readSseChunk(reader, idleTimeoutMs) {
  if (!(idleTimeoutMs > 0)) return reader.read();
  let timer;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => {
      const error = streamTimeoutError('stream idle', idleTimeoutMs);
      try {
        const cancelled = reader.cancel(error);
        if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(() => {});
      } catch {}
      finish(reject, error);
    }, idleTimeoutMs);
    reader.read().then(value => finish(resolve, value), error => finish(reject, error));
  });
}

async function consumeSse(response, onData, signal, options = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  let terminalEventSeen = false;
  const cancelReader = () => {
    try {
      const cancelled = reader.cancel(signal?.reason);
      if (cancelled && typeof cancelled.catch === 'function') cancelled.catch(() => {});
    } catch {}
  };
  if (signal) signal.addEventListener('abort', cancelReader, { once: true });

  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await readSseChunk(reader, idleTimeoutMs);
      signal?.throwIfAborted();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() || '');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === '[DONE]') {
          terminalEventSeen = true;
          break;
        }
        try {
          if (onData(JSON.parse(data)) === false) {
            terminalEventSeen = true;
            break;
          }
        } catch {}
      }
      if (terminalEventSeen || done) break;
    }

    if (!terminalEventSeen && buffer.startsWith('data:')) {
      const data = buffer.slice(5).trim();
      if (data === '[DONE]') terminalEventSeen = true;
      else if (data) {
        try { terminalEventSeen = onData(JSON.parse(data)) === false; } catch {}
      }
    }
    if (terminalEventSeen) cancelReader();
  } finally {
    if (signal) signal.removeEventListener('abort', cancelReader);
  }
}

async function streamProviderCompletion(providerConfig, messages, tools, options = {}) {
  if (providerConfig.isAnthropic ||
      detectProvider(providerConfig.url, providerConfig.model) === 'anthropic') {
    return streamAnthropicCompletion(providerConfig, messages, tools, options);
  }
  return streamOpenAICompletion(providerConfig, messages, tools, options);
}

async function streamOpenAICompletion(providerConfig, messages, tools, options = {}) {
  const request = buildProviderRequest(providerConfig, messages, tools, {
    stream: true,
    temperature: options.temperature,
    maxTokens: options.maxTokens ?? 2048,
    responseFormat: options.responseFormat,
    model: options.model,
  });
  const response = await fetchProviderStream(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  }, options);
  if (!response.ok) {
    throw new Error(`Provider API error: ${response.status} - ${await response.text()}`);
  }

  let content = '';
  let usage;
  // Carried so callers can see truncation. `length` means the model hit the
  // output ceiling: a tool call's arguments may be half a JSON document, and
  // writing that into the history breaks the conversation permanently (see
  // processToolCalls in code_v5).
  let finishReason = null;
  const toolCallBuffer = [];
  await consumeSse(response, parsed => {
    if (parsed.usage) {
      usage = parsed.usage;
      emitStreamEvent(options.onEvent, { type: 'usage', usage, ...usage });
    }
    if (parsed.choices?.[0]?.finish_reason) finishReason = parsed.choices[0].finish_reason;
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) return;
    if (Array.isArray(delta.tool_calls)) {
      accumulateToolCallDeltas(toolCallBuffer, delta.tool_calls);
      for (const item of delta.tool_calls) {
        emitStreamEvent(options.onEvent, { ...item, type: 'tool_call_delta' });
      }
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      emitStreamEvent(options.onEvent, { type: 'text_delta', text: delta.content });
    }
  }, options.signal, { idleTimeoutMs: options.streamIdleTimeoutMs });

  recordUsageSafe(providerConfig, usage);
  emitStreamEvent(options.onEvent, { type: 'done' });
  const toolCalls = finalizeToolCalls(toolCallBuffer);
  return {
    role: 'assistant',
    content: content || (toolCalls.length > 0 ? null : ''),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(usage ? { usage } : {}),
    ...(finishReason ? { finish_reason: finishReason } : {}),
  };
}

async function streamAnthropicCompletion(providerConfig, messages, tools, options = {}) {
  const request = buildProviderRequest(providerConfig, messages, tools, {
    stream: true,
    temperature: options.temperature,
    maxTokens: options.maxTokens ?? 2000,
    model: options.model,
  });
  const response = await fetchProviderStream(request.endpoint, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  }, options);
  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} - ${await response.text()}`);
  }

  let content = '';
  let usage;
  const toolBlocks = new Map();
  await consumeSse(response, parsed => {
    if (parsed.type === 'message_start' && parsed.message?.usage) {
      usage = { ...(usage || {}), ...parsed.message.usage };
      emitStreamEvent(options.onEvent, { type: 'usage', usage, ...usage });
    }
    if (parsed.type === 'message_delta' && parsed.usage) {
      usage = { ...(usage || {}), ...parsed.usage };
      emitStreamEvent(options.onEvent, { type: 'usage', usage, ...usage });
    }
    if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
      const initialInput = parsed.content_block.input;
      toolBlocks.set(parsed.index, {
        id: parsed.content_block.id,
        type: 'function',
        function: {
          name: parsed.content_block.name,
          arguments: initialInput && Object.keys(initialInput).length > 0
            ? JSON.stringify(initialInput)
            : '',
        },
      });
      emitStreamEvent(options.onEvent, {
        type: 'tool_call_delta',
        index: parsed.index,
        id: parsed.content_block.id,
        function: { name: parsed.content_block.name, arguments: '' },
      });
    }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
      const partial = parsed.delta.partial_json || '';
      const block = toolBlocks.get(parsed.index);
      if (block) block.function.arguments += partial;
      emitStreamEvent(options.onEvent, {
        type: 'tool_call_delta',
        index: parsed.index,
        function: { arguments: partial },
      });
    }
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      const text = parsed.delta.text || '';
      if (text) {
        content += text;
        emitStreamEvent(options.onEvent, { type: 'text_delta', text });
      }
    }
    if (parsed.type === 'message_stop') return false;
  }, options.signal, { idleTimeoutMs: options.streamIdleTimeoutMs });

  recordUsageSafe(providerConfig, usage);
  emitStreamEvent(options.onEvent, { type: 'done' });
  const toolCalls = Array.from(toolBlocks.values());
  return {
    role: 'assistant',
    content: content || (toolCalls.length > 0 ? null : ''),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(usage ? { usage } : {}),
  };
}

module.exports = {
  sendMessage,
  sendMessageToProvider,
  validateApiKey,
  getBots,
  clearConversation,
  getProviderConfig,
  startMcpServers,
  stopMcpServers,
  getMcpTools,
  // Needed by src/utils/mcp-tools.js so the coding agent can expose MCP
  // servers as ordinary tools instead of re-implementing the transport.
  getMcpToolsForAI,
  executeMcpTool,
  sendMessageOpenAICompatible,
  streamProviderCompletion,
  streamOpenAICompletion,
  streamAnthropicCompletion,
  // Exposed for tests + advanced consumers (does not appear in the
  // public API surface of natureco's user-facing docs).
  _internals: {
    extractSystemForAnthropic,
    DEFAULT_ANTHROPIC_SYSTEM,
    buildRequestBody,
    buildProviderRequest,
    toAnthropicMessages,
  },
  _sendMessage: sendMessage,
};
