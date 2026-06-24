const { getConfig } = require('../utils/config');

function stripCodeFences(s) {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) return (m[1] || '').trim();
  return s.trim();
}

function validateAgainstSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return { ok: true };
  if (schema.type === 'object' && schema.properties) {
    if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: [{ text: 'expected object' }] };
    const errors = [];
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (prop.type && value[key] !== undefined) {
        const actual = typeof value[key];
        if (actual !== prop.type && !(prop.type === 'number' && actual === 'integer')) {
          errors.push({ text: `${key}: expected ${prop.type}, got ${actual}` });
        }
      }
      if (prop.required && value[key] === undefined) {
        errors.push({ text: `${key}: required but missing` });
      }
    }
    return errors.length ? { ok: false, errors } : { ok: true };
  }
  return { ok: true };
}

module.exports = {
  name: 'llm_task',
  description: 'Run a generic JSON-only LLM task and return schema-validated JSON. No tool calls, no commentary.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Task instruction for the LLM' },
      input: { type: 'object', description: 'Optional input payload for the task' },
      schema: { type: 'object', description: 'Optional JSON Schema to validate the returned JSON' },
      provider: { type: 'string', description: 'Provider override (e.g. openai, anthropic)' },
      model: { type: 'string', description: 'Model override' },
      // LLM'ler JSON'da sayıları string olarak dönebiliyor — esnek schema
      temperature: { type: ['number', 'string'], description: 'Temperature override' },
      maxTokens: { type: ['number', 'string'], description: 'Max tokens override' }
    },
    required: ['prompt']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const provider = params.provider || config.provider || 'openai';
      const model = params.model || config.model || 'gpt-4o';

      // LLM'ler sayıları string olarak dönebiliyor — cast et
      const temperature = typeof params.temperature === 'string' ? parseFloat(params.temperature) : (params.temperature ?? 0.1);
      const maxTokens = typeof params.maxTokens === 'string' ? parseInt(params.maxTokens, 10) : (params.maxTokens ?? 4096);

      let apiKey;
      if (provider === 'openai') apiKey = params.apiKey || config.openaiApiKey || process.env.OPENAI_API_KEY;
      else if (provider === 'anthropic') apiKey = params.apiKey || config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      else if (provider === 'groq') apiKey = params.apiKey || config.groqApiKey || process.env.GROQ_API_KEY;
      else if (provider === 'groq' || provider === 'together' || provider === 'openrouter') {
        // Yeni provider presetler için ana providerApiKey'i kullan
        apiKey = config.providerApiKey;
      }

      if (!apiKey) {
        return { success: false, error: `API key required for ${provider}. Set: natureco config set ${provider}ApiKey <key> veya providerApiKey` };
      }

      const systemPrompt = [
        'You are a JSON-only function.',
        'Return ONLY a valid JSON value.',
        'Do not wrap in markdown fences.',
        'Do not include commentary.',
        'Do not call tools.'
      ].join(' ');

      const inputJson = JSON.stringify(params.input ?? null, null, 2);
      const fullPrompt = `${systemPrompt}\n\nTASK:\n${params.prompt}\n\nINPUT:\n${inputJson}\n`;

      // Provider URL'ini config'ten al (Groq, MiniMax, OpenRouter için)
      let baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : `https://api.${provider}.com/v1`;
      if (provider === 'groq') baseUrl = config.providerUrl || 'https://api.groq.com/openai/v1';
      if (provider === 'openrouter') baseUrl = 'https://openrouter.ai/api/v1';
      // MiniMax özel endpoint: /v1/text/chatcompletion_v2 (OpenAI uyumlu DEĞİL)
      if (provider === 'minimax') {
        baseUrl = config.providerUrl || 'https://api.minimax.io';
      }

      // MiniMax özel mi, OpenAI uyumlu mu?
      const isMiniMax = provider === 'minimax' || baseUrl.includes('minimax.io') || baseUrl.includes('minimaxi.com');
      const endpoint = isMiniMax
        ? `${baseUrl}/v1/text/chatcompletion_v2`
        : `${baseUrl}/chat/completions`;

      // MiniMax özel request format
      const requestBody = isMiniMax
        ? {
            model,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature,
            max_tokens: maxTokens,
          }
        : {
            model,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature,
            max_tokens: maxTokens
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        return { success: false, error: `${provider} error ${response.status}: ${await response.text()}` };
      }

      const data = await response.json();
      // MiniMax response format: choices[0].message.content (OpenAI ile aynı)
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) return { success: false, error: 'LLM returned empty output' };

      const raw = stripCodeFences(text);
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch { return { success: false, error: 'LLM returned invalid JSON', raw: text }; }

      const schema = params.schema;
      if (schema && typeof schema === 'object') {
        const validation = validateAgainstSchema(parsed, schema);
        if (!validation.ok) {
          return {
            success: false,
            error: `JSON did not match schema: ${validation.errors.map(e => e.text).join('; ')}`,
            raw: text,
            parsed
          };
        }
      }

      return { success: true, data: parsed, provider, model };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
