const { ModelProvider, registerProvider, DEFAULT_ANTHROPIC_SYSTEM } = require('../../utils/model-provider');

class OpenAIProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'openai';
  }

  getEndpoint() {
    const base = (this.config.providerUrl || '').replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  buildRequest(messages, options = {}) {
    return {
      model: this.config.providerModel || 'gpt-5.6-sol',
      messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: options.stream || false,
      ...(options.tools?.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {}),
    };
  }

  parseResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) return { role: 'assistant', content: data.response || data.content || '' };
    return {
      role: 'assistant',
      content: choice.message?.content || choice.text || '',
      tool_calls: choice.message?.tool_calls || undefined,
      usage: data.usage || undefined,
    };
  }

  normalizeTools(tools) {
    return (tools || []).map(t => ({
      type: 'function',
      function: {
        name: t.name || t.function?.name,
        description: t.description || t.function?.description || '',
        parameters: t.inputSchema || t.input_schema || t.function?.parameters || { type: 'object', properties: {} },
      },
    }));
  }
}

registerProvider('openai', OpenAIProvider);
module.exports = OpenAIProvider;
