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
const { accumulateToolCallDeltas } = require('./streaming-tools');

/**
 * v5.5.0: Provider-specific format detection
 * Groq, OpenAI, Anthropic, Mistral, DeepSeek, OpenRouter, Ollama, MiniMax
 */
function detectProvider(providerUrl, model) {
  const url = (providerUrl || '').toLowerCase();
  const m = (model || '').toLowerCase();
  if (url.includes('anthropic.com') || m.includes('claude')) return 'anthropic';
  if (url.includes('groq.com') || m.includes('groq') || m.includes('llama-3') || m.includes('mixtral')) return 'groq';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.deepseek.com') || m.includes('deepseek')) return 'deepseek';
  if (url.includes('mistral.ai') || m.includes('mistral') || m.includes('codestral')) return 'mistral';
  if (url.includes('together.xyz') || m.includes('together')) return 'together';
  if (url.includes('fireworks.ai') || m.includes('fireworks')) return 'fireworks';
  if (url.includes('perplexity.ai') || m.includes('pplx') || m.includes('sonar')) return 'perplexity';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('ollama')) return 'ollama';
  if (url.includes('minimax.io') || url.includes('minimax')) return 'minimax';
  return 'openai'; // default
}

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
function buildRequestBody(messages, model, options, provider) {
  if (provider === 'anthropic') {
    const userMsgs = messages.filter(m => m.role !== 'system');
    return {
      model,
      messages: userMsgs.map(m => ({
        role: m.role,
        content: m.content
      })),
      system: extractSystemForAnthropic(messages),
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.7,
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {})
    };
  }
  // OpenAI-compatible
  return {
    model,
    messages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature || 0.7,
    ...(options.tools && options.tools.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {})
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
 * Format tool definitions for OpenAI-compatible APIs
 */
function formatToolsForOpenAI() {
  const config = getConfig();
  const localTools = getToolDefinitions();
  
  // Only add MCP tools if enabled
  let allTools = [...localTools];
  if (config.mcpEnabled !== false) {
    const mcpTools = getMcpToolsForAI().map(minimizeMcpTool);
    const normalizedMcpTools = mcpTools.map(tool => normalizeMcpToolSchema(tool));
    allTools = [...allTools, ...normalizedMcpTools];
  }
  
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
function formatToolsForAnthropic() {
  const config = getConfig();
  const localTools = getToolDefinitions();
  
  // Only add MCP tools if enabled
  let allTools = [...localTools];
  if (config.mcpEnabled !== false) {
    const mcpTools = getMcpToolsForAI().map(minimizeMcpTool);
    const normalizedMcpTools = mcpTools.map(tool => normalizeMcpToolSchema(tool));
    allTools = [...allTools, ...normalizedMcpTools];
  }
  
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
  const baseUrl = providerConfig.url.replace(/\/+$/, '');
  // MiniMax özel endpoint tespiti
  const isMiniMax = baseUrl.includes('minimax.io') || baseUrl.includes('minimaxi.com') || baseUrl.includes('minimax.cn');
  const endpoint = isMiniMax
    ? `${baseUrl}/v1/text/chatcompletion_v2`
    : `${baseUrl}/chat/completions`;
  const requestBody = {
    model: providerConfig.model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 2048,
  };

  // NatureCo için tool calling desteklenmiyor
  if (!providerConfig.url.includes('api.natureco.me')) {
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
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
    const errorText = await response.text();
    throw new Error(`Provider API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.text
    || data.response
    || data.content
    || '';
  return {
    role: 'assistant',
    content,
    tool_calls: data.choices?.[0]?.message?.tool_calls || undefined,
    usage: data.usage || undefined,
  };
}

/**
 * Send message to Anthropic API
 */
async function sendMessageAnthropic(providerConfig, messages, tools) {
  const endpoint = `${providerConfig.url}/v1/messages`;

  // Anthropic requires system message separate; never send empty string.
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
      tools: tools,
    }),
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

  // Get tool definitions (local + MCP) — skip if noTools flag set (chat mode)
  const tools = options.noTools 
    ? [] 
    : (providerConfig.isAnthropic ? formatToolsForAnthropic() : formatToolsForOpenAI());

  debugLog('\n[Provider] Sending request...');
  debugLog('[Provider] URL:', providerConfig.url);
  debugLog('[Provider] Model:', providerConfig.model);
  debugLog('[Provider] Type:', providerConfig.isAnthropic ? 'Anthropic' : 'OpenAI-compatible');
  debugLog('[Provider] Messages:', messages.length);
  debugLog('[Provider] Tools:', tools.length, `(${Object.keys(mcpClients).length} MCP servers)`);

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

    if (stream) {
      const result = await streamProviderCompletion(providerConfig, messages, tools);
      if (result.type === 'text') {
        messages.push({ role: 'assistant', content: result.content });
        finalResponse = result.content;
        break;
      }
      assistantMessage = result.message;
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

      // Separate local and MCP tool calls
      const toolCalls = assistantMessage.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments)
      }));

      const toolResults = [];
      const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

      for (const toolCall of toolCalls) {
        // Spinner başlat
        let frameIdx = 0;
        const inputPreview = JSON.stringify(toolCall.input).slice(0, 50);
        const spinner = setInterval(() => {
          process.stdout.write(`\r  ${chalk.cyan(SPINNER_FRAMES[frameIdx++ % SPINNER_FRAMES.length])} ${chalk.gray(toolCall.name + ' — ' + inputPreview)}`);
        }, 80);

        // Check if this is an MCP tool
        const mcpTools = getMcpTools();
        const isMcpTool = mcpTools.find(t => t.name === toolCall.name);
        let result;

        if (isMcpTool) {
          debugLog(`[MCP] Executing tool: ${toolCall.name}`);
          result = await executeMcpTool(toolCall.name, toolCall.input);
          toolResults.push({ id: toolCall.id, name: toolCall.name, result });
        } else {
          debugLog(`[Local] Executing tool: ${toolCall.name}`);
          const localResults = await executeToolCalls([toolCall]);
          toolResults.push(...localResults);
          result = localResults[0]?.result;
        }

        // Spinner durdur, sonucu göster
        clearInterval(spinner);
        const success = result?.success !== false;
        process.stdout.write(`\r  ${success ? chalk.green('✓') : chalk.red('✗')} ${chalk.cyan(toolCall.name)} ${chalk.gray('— ' + inputPreview)}\n`);
      }

      // Add tool results to messages (base64 encoded for safety)
      for (const result of toolResults) {
        // Encode tool result (works for both MCP and local tools)
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

  // Apply token budget trimming
  messages = TB.trimMessages(messages);

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

async function streamProviderCompletion(providerConfig, messages, tools) {
  if (providerConfig.isAnthropic) {
    return streamAnthropicCompletion(providerConfig, messages);
  }
  return streamOpenAICompletion(providerConfig, messages, tools);
}

async function streamOpenAICompletion(providerConfig, messages, tools) {
  const baseUrl = providerConfig.url.replace(/\/+$/, '');
  // MiniMax özel endpoint tespiti (streaming için de aynı)
  const isMiniMax = baseUrl.includes('minimax.io') || baseUrl.includes('minimaxi.com') || baseUrl.includes('minimax.cn');
  const endpoint = isMiniMax
    ? `${baseUrl}/v1/text/chatcompletion_v2`
    : `${baseUrl}/chat/completions`;

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
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.tool_calls) {
          hasToolCalls = true;
          accumulateToolCallDeltas(toolCalls, delta.tool_calls);
        }

        const token = delta.content || '';
        if (token) {
          if (!hasToolCalls) process.stdout.write(token);
          fullText += token;
        }
      } catch {}
    }
  }

  if (hasToolCalls) {
    process.stdout.write('\n');
    return {
      type: 'tool_calls',
      message: {
        role: 'assistant',
        content: fullText || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }))
      }
    };
  }

  process.stdout.write('\n');
  return { type: 'text', content: fullText };
}

async function streamAnthropicCompletion(providerConfig, messages) {
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
          process.stdout.write(token);
          fullText += token;
        }
      } catch {}
    }
  }

  process.stdout.write('\n');
  return { type: 'text', content: fullText };
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
  streamProviderCompletion,
  streamOpenAICompletion,
  streamAnthropicCompletion,
  // Exposed for tests + advanced consumers (does not appear in the
  // public API surface of natureco's user-facing docs).
  _internals: {
    extractSystemForAnthropic,
    DEFAULT_ANTHROPIC_SYSTEM,
    buildRequestBody,
  },
  _sendMessage: sendMessage,
};
