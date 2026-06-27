const { ModelProvider, registerProvider } = require('../../utils/model-provider');

class OllamaProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'ollama';
  }

  getEndpoint() {
    const base = (this.config.providerUrl || '').replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  buildRequest(messages, options = {}) {
    return {
      model: this.config.providerModel || 'llama3.2',
      messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: options.stream || false,
      ...(options.tools?.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {}),
    };
  }

  parseResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) return { role: 'assistant', content: data.response || '' };
    return {
      role: 'assistant',
      content: choice.message?.content || choice.text || data.response || '',
      tool_calls: choice.message?.tool_calls || undefined,
      usage: data.usage || undefined,
    };
  }

  normalizeTools(tools) {
    return [];
  }
}

registerProvider('ollama', OllamaProvider);
module.exports = OllamaProvider;
