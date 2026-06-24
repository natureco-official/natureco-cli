const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { CONFIG_DIR, loadConfig, saveConfig } = require('./config');

// MCP templates
const MCP_TEMPLATES = {
  filesystem: {
    name: 'filesystem',
    description: 'File system operations (read, write, list files)',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '<CWD>'],
    env: {},
  },
  github: {
    name: 'github',
    description: 'GitHub repository operations (issues, PRs, commits)',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_TOKEN: '<your-github-token>',
    },
  },
  postgres: {
    name: 'postgres',
    description: 'PostgreSQL database operations',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: {
      POSTGRES_CONNECTION_STRING: 'postgresql://user:password@localhost:5432/dbname',
    },
  },
  sqlite: {
    name: 'sqlite',
    description: 'SQLite database operations',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './database.db'],
    env: {},
  },
  'brave-search': {
    name: 'brave-search',
    description: 'Web search using Brave Search API',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: {
      BRAVE_API_KEY: '<your-brave-api-key>',
    },
  },
};

// Get MCP servers from config
function getMcpServers() {
  const config = loadConfig();
  return config?.mcpServers || {};
}

// Save MCP servers to config
function saveMcpServers(servers) {
  const config = loadConfig() || {};
  config.mcpServers = servers;
  saveConfig(config);
}

// Add MCP server
function addMcpServer(name, template = null, customConfig = null) {
  const servers = getMcpServers();

  if (servers[name]) {
    throw new Error(`MCP sunucu zaten mevcut: ${name}`);
  }

  let serverConfig;

  if (template && MCP_TEMPLATES[template]) {
    serverConfig = JSON.parse(JSON.stringify(MCP_TEMPLATES[template]));
    delete serverConfig.name;
    // Resolve <CWD> placeholder with current working directory
    if (serverConfig.args) {
      serverConfig.args = serverConfig.args.map(a => a === '<CWD>' ? process.cwd() : a);
    }
  } else if (customConfig) {
    serverConfig = customConfig;
  } else {
    throw new Error('Template veya custom config gerekli');
  }

  servers[name] = {
    ...serverConfig,
    disabled: false,
    autoApprove: [],
  };

  saveMcpServers(servers);
}

// Remove MCP server
function removeMcpServer(name) {
  const servers = getMcpServers();

  if (!servers[name]) {
    throw new Error(`MCP sunucu bulunamadı: ${name}`);
  }

  delete servers[name];
  saveMcpServers(servers);
}

// Test MCP server connection
function testMcpServer(name) {
  const servers = getMcpServers();

  if (!servers[name]) {
    throw new Error(`MCP sunucu bulunamadı: ${name}`);
  }

  const server = servers[name];

  // Check if command exists
  try {
    if (server.command === 'npx') {
      // Check if npx is available
      execSync('npx --version', { stdio: 'ignore' });
    } else {
      // Check if custom command exists
      execSync(`${server.command} --version`, { stdio: 'ignore' });
    }
  } catch {
    throw new Error(`Komut bulunamadı: ${server.command}`);
  }

  // Check environment variables
  if (server.env) {
    const missingEnvVars = [];
    for (const [key, value] of Object.entries(server.env)) {
      if (value.startsWith('<') && value.endsWith('>')) {
        missingEnvVars.push(key);
      } else if (!process.env[key] && value) {
        missingEnvVars.push(key);
      }
    }

    if (missingEnvVars.length > 0) {
      throw new Error(`Eksik environment variable'lar: ${missingEnvVars.join(', ')}`);
    }
  }

  return true;
}

// Enable/disable MCP server
function toggleMcpServer(name, enabled) {
  const servers = getMcpServers();

  if (!servers[name]) {
    throw new Error(`MCP sunucu bulunamadı: ${name}`);
  }

  servers[name].disabled = !enabled;
  saveMcpServers(servers);
}

// Get MCP templates
function getMcpTemplates() {
  return MCP_TEMPLATES;
}

// Update MCP server config
function updateMcpServer(name, updates) {
  const servers = getMcpServers();

  if (!servers[name]) {
    throw new Error(`MCP sunucu bulunamadı: ${name}`);
  }

  servers[name] = {
    ...servers[name],
    ...updates,
  };

  saveMcpServers(servers);
}

module.exports = {
  getMcpServers,
  saveMcpServers,
  addMcpServer,
  removeMcpServer,
  testMcpServer,
  toggleMcpServer,
  getMcpTemplates,
  updateMcpServer,
};
