const { ModelProvider, registerProvider, DEFAULT_ANTHROPIC_SYSTEM } = require('../../utils/model-provider');

class AnthropicProvider extends ModelProvider {
  constructor(config = {}) {
    super(config);
    this.name = 'anthropic';
  }

  getEndpoint() {
    const base = (this.config.providerUrl || '').replace(/\/+$/, '');
    return `${base.replace(/\/v1$/, '')}/v1/messages`;
  }

  extractSystem(messages) {
    const systemMsg = messages.find(m => m.role === 'system');
    if (!systemMsg) return DEFAULT_ANTHROPIC_SYSTEM;
    const content = systemMsg.content;
    if (typeof content === 'string' && content.trim()) return content;
    if (Array.isArray(content) && content.length > 0) return content;
    return DEFAULT_ANTHROPIC_SYSTEM;
  }

  buildRequest(messages, options = {}) {
    const userMsgs = messages.filter(m => m.role !== 'system');
    return {
      model: this.config.providerModel || 'claude-fable-5',
      messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
      system: this.extractSystem(messages),
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature ?? 0.7,
      stream: options.stream || false,
      ...(options.tools?.length > 0 ? { tools: options.tools } : {}),
    };
  }

  parseResponse(data) {
    const textContent = data.content?.find(c => c.type === 'text')?.text || '';
    const toolCalls = data.content
      ?.filter(c => c.type === 'tool_use')
      ?.map(c => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
      })) || [];
    return {
      role: 'assistant',
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage || undefined,
    };
  }

  normalizeTools(tools) {
    return (tools || []).map(t => ({
      name: t.name || t.function?.name,
      description: t.description || t.function?.description || '',
      input_schema: t.inputSchema || t.input_schema || t.function?.parameters || { type: 'object', properties: {} },
    }));
  }

  parseToolCalls(message) {
    if (Array.isArray(message.content)) {
      return message.content
        .filter(c => c.type === 'tool_use')
        .map(c => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.input || {}) },
        }));
    }
    return [];
  }

  getAuthHeaders() {
    return {
      'x-api-key': this.config.providerApiKey || '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }
}

registerProvider('anthropic', AnthropicProvider);
module.exports = AnthropicProvider;
