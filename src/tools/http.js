module.exports = {
  name: 'http_request',
  description: 'Make HTTP requests to any URL (GET, POST, PUT, DELETE, PATCH)',
  inputSchema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        description: 'HTTP method: GET, POST, PUT, DELETE, PATCH',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        default: 'GET'
      },
      url: {
        type: 'string',
        description: 'Full URL to request'
      },
      headers: {
        type: 'object',
        description: 'Optional headers (key-value pairs)'
      },
      body: {
        type: 'object',
        description: 'Optional request body (for POST/PUT/PATCH)'
      }
    },
    required: ['url']
  },
  
  async execute(params) {
    try {
      const method = (params.method || 'GET').toUpperCase();
      
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'NatureCo-CLI/2.7.0',
          ...(params.headers || {})
        }
      };
      
      // Add body for POST/PUT/PATCH
      if (params.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
        options.body = JSON.stringify(params.body);
      }
      
      const response = await fetch(params.url, options);
      const text = await response.text();
      
      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      
      // Truncate large responses
      if (typeof data === 'string' && data.length > 2000) {
        data = data.slice(0, 2000) + '... (truncated)';
      }
      
      return {
        success: true,
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
