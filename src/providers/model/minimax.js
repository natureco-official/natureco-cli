const { ModelProvider, registerProvider } = require('../../utils/model-provider');

class MiniMaxProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'minimax';
  }

  getEndpoint() {
    const base = (this.config.providerUrl || '').replace(/\/+$/, '');
    return `${base.replace(/\/v1$/, '')}/v1/text/chatcompletion_v2`;
  }

  buildRequest(messages, options = {}) {
    return {
      model: this.config.providerModel || 'MiniMax-M2.7',
      messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: options.stream || false,
      ...(options.tools?.length > 0 ? { tools: options.tools, tool_choice: 'auto' } : {}),
    };
  }

  parseResponse(data) {
    const choice = data.choices?.[0] || data.base_resp || {};
    return {
      role: 'assistant',
      content: choice.message?.content || choice.text || data.reply || '',
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

registerProvider('minimax', MiniMaxProvider);
module.exports = MiniMaxProvider;
