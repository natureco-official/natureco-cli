/**
 * Tool Adapter - Normalize different provider formats
 */

/**
 * Extract tool calls from API response
 * Supports: Anthropic, OpenAI, Groq, Gemini
 */
function extractToolCalls(response, provider) {
  if (!response) return [];
  
  // Anthropic format
  if (response.content && Array.isArray(response.content)) {
    return response.content
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input
      }));
  }
  
  // OpenAI/Groq format
  if (response.tool_calls && Array.isArray(response.tool_calls)) {
    return response.tool_calls.map(call => ({
      id: call.id,
      name: call.function.name,
      input: JSON.parse(call.function.arguments)
    }));
  }
  
  // Gemini format
  if (response.functionCall) {
    return [{
      id: 'gemini_' + Date.now(),
      name: response.functionCall.name,
      input: response.functionCall.args
    }];
  }
  
  return [];
}

/**
 * Format tool result for API request
 */
function formatToolResult(toolCallId, toolName, result, provider) {
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  
  // Anthropic format
  if (provider === 'anthropic') {
    return {
      type: 'tool_result',
      tool_use_id: toolCallId,
      content: resultStr
    };
  }
  
  // OpenAI/Groq format
  if (provider === 'openai' || provider === 'groq') {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: resultStr
    };
  }
  
  // Gemini format
  if (provider === 'gemini') {
    return {
      functionResponse: {
        name: toolName,
        response: result
      }
    };
  }
  
  // Default format
  return {
    tool_call_id: toolCallId,
    name: toolName,
    result: resultStr
  };
}

/**
 * Convert tool definitions to provider format
 */
function formatToolDefinitions(tools, provider) {
  // Anthropic format
  if (provider === 'anthropic') {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
  }
  
  // OpenAI/Groq format
  if (provider === 'openai' || provider === 'groq') {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }
  
  // Gemini format
  if (provider === 'gemini') {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }));
  }
  
  // Default format (Anthropic-like)
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

module.exports = {
  extractToolCalls,
  formatToolResult,
  formatToolDefinitions
};
