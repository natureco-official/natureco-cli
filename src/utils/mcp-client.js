const { spawn } = require('child_process');
const { EventEmitter } = require('events');

/**
 * MCP Client - JSON-RPC over stdio
 * Manages communication with MCP servers via stdin/stdout
 */
class MCPClient extends EventEmitter {
  constructor(command, args = [], env = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = { ...process.env, ...env };
    this.process = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.isInitialized = false;
  }

  /**
   * Start MCP server process
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.command, this.args, {
          env: this.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Handle stdout (JSON-RPC responses)
        this.process.stdout.on('data', (data) => {
          this.handleData(data);
        });

        // Handle stderr (logs)
        this.process.stderr.on('data', (data) => {
          const message = data.toString().trim();
          if (message) {
            this.emit('log', message);
          }
        });

        // Handle process exit
        this.process.on('exit', (code) => {
          this.emit('exit', code);
          this.cleanup();
        });

        // Handle process error
        this.process.on('error', (err) => {
          reject(err);
        });

        // Initialize connection
        this.initialize()
          .then(() => {
            this.isInitialized = true;
            resolve();
          })
          .catch(reject);

      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Handle incoming data from stdout
   */
  handleData(data) {
    this.buffer += data.toString();

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        this.emit('error', new Error(`Failed to parse JSON-RPC message: ${err.message}`));
      }
    }
  }

  /**
   * Handle parsed JSON-RPC message
   */
  handleMessage(message) {
    // Response to our request
    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'MCP request failed'));
      } else {
        resolve(message.result);
      }
    }
    // Notification from server
    else if (message.method) {
      this.emit('notification', message);
    }
  }

  /**
   * Send JSON-RPC request
   */
  async sendRequest(method, params = {}) {
    if (!this.process || this.process.killed) {
      throw new Error('MCP server not running');
    }

    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);

      // Clear timeout on response
      const originalResolve = resolve;
      const originalReject = reject;
      
      this.pendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          originalResolve(result);
        },
        reject: (err) => {
          clearTimeout(timeout);
          originalReject(err);
        },
      });

      // Send request
      const message = JSON.stringify(request) + '\n';
      this.process.stdin.write(message);
    });
  }

  /**
   * Initialize MCP connection
   */
  async initialize() {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: {
          listChanged: false
        }
      },
      clientInfo: {
        name: 'natureco-cli',
        version: '2.10.0',
      },
    });

    // Send initialized notification
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    };
    this.process.stdin.write(JSON.stringify(notification) + '\n');

    return result;
  }

  /**
   * List available tools
   */
  async listTools() {
    if (!this.isInitialized) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.sendRequest('tools/list', {});
    return result.tools || [];
  }

  /**
   * Call a tool
   */
  async callTool(toolName, args = {}) {
    if (!this.isInitialized) {
      throw new Error('MCP client not initialized');
    }

    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  /**
   * Stop MCP server
   */
  stop() {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.cleanup();
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.pendingRequests.clear();
    this.buffer = '';
    this.isInitialized = false;
    this.process = null;
  }
}

/**
 * Create and start MCP client
 */
async function createMCPClient(command, args = [], env = {}) {
  const client = new MCPClient(command, args, env);
  await client.start();
  return client;
}

/**
 * Test function - Start filesystem MCP server and list tools
 */
async function test() {
  console.log('🧪 Testing MCP Client...\n');

  try {
    // Start filesystem MCP server
    console.log('Starting filesystem MCP server...');
    const client = await createMCPClient('npx', [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      process.cwd(),
    ]);

    console.log('✅ MCP server started\n');

    // Listen to logs
    client.on('log', (message) => {
      console.log('[MCP Log]', message);
    });

    // List tools
    console.log('Listing tools...');
    const tools = await client.listTools();
    console.log(`✅ Found ${tools.length} tools:\n`);

    tools.forEach((tool) => {
      console.log(`  - ${tool.name}`);
      console.log(`    ${tool.description}`);
      console.log('');
    });

    // Test tool call - read directory
    if (tools.find(t => t.name === 'read_file')) {
      console.log('Testing read_file tool...');
      try {
        const result = await client.callTool('read_file', {
          path: 'package.json',
        });
        console.log('✅ Tool call successful');
        console.log('Result:', JSON.stringify(result, null, 2).substring(0, 200) + '...\n');
      } catch (err) {
        console.log('❌ Tool call failed:', err.message, '\n');
      }
    }

    // Stop server
    console.log('Stopping MCP server...');
    client.stop();
    console.log('✅ Test completed\n');

    process.exit(0);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = {
  MCPClient,
  createMCPClient,
  test,
};
