const fs = require('fs');
const path = require('path');
const os = require('os');

const USER_HOOKS_DIR = path.join(os.homedir(), '.natureco', 'hooks');

function getProjectHooksDir() {
  return path.join(process.cwd(), '.natureco', 'hooks');
}

function ensureHooksDirs() {
  if (!fs.existsSync(USER_HOOKS_DIR)) {
    fs.mkdirSync(USER_HOOKS_DIR, { recursive: true });
  }
  const projectHooksDir = getProjectHooksDir();
  if (!fs.existsSync(projectHooksDir)) {
    fs.mkdirSync(projectHooksDir, { recursive: true });
  }
}

function getHooks(type) {
  ensureHooksDirs();
  
  const hooks = [];
  
  // User hooks
  if (fs.existsSync(USER_HOOKS_DIR)) {
    const userFiles = fs.readdirSync(USER_HOOKS_DIR).filter(f => f.endsWith('.js') && f.startsWith(type + '-'));
    userFiles.forEach(file => {
      const hookPath = path.join(USER_HOOKS_DIR, file);
      hooks.push({ path: hookPath, source: 'user', name: file });
    });
  }
  
  // Project hooks
  const projectHooksDir = getProjectHooksDir();
  if (fs.existsSync(projectHooksDir)) {
    const projectFiles = fs.readdirSync(projectHooksDir).filter(f => f.endsWith('.js') && f.startsWith(type + '-'));
    projectFiles.forEach(file => {
      const hookPath = path.join(projectHooksDir, file);
      hooks.push({ path: hookPath, source: 'project', name: file });
    });
  }
  
  return hooks;
}

function getAllHooks() {
  ensureHooksDirs();
  
  const hooks = [];
  
  // User hooks
  if (fs.existsSync(USER_HOOKS_DIR)) {
    const userFiles = fs.readdirSync(USER_HOOKS_DIR).filter(f => f.endsWith('.js'));
    userFiles.forEach(file => {
      const hookPath = path.join(USER_HOOKS_DIR, file);
      const type = file.split('-')[0];
      hooks.push({ path: hookPath, source: 'user', name: file, type });
    });
  }
  
  // Project hooks
  const projectHooksDir = getProjectHooksDir();
  if (fs.existsSync(projectHooksDir)) {
    const projectFiles = fs.readdirSync(projectHooksDir).filter(f => f.endsWith('.js'));
    projectFiles.forEach(file => {
      const hookPath = path.join(projectHooksDir, file);
      const type = file.split('-')[0];
      hooks.push({ path: hookPath, source: 'project', name: file, type });
    });
  }
  
  return hooks;
}

async function runHooks(type, data, context = {}) {
  const hooks = getHooks(type);
  let result = data;
  
  for (const hook of hooks) {
    try {
      delete require.cache[require.resolve(hook.path)];
      const hookFn = require(hook.path);
      
      if (typeof hookFn === 'function') {
        result = await hookFn(result, context);
      }
    } catch (err) {
      console.error(`Hook error (${hook.name}):`, err.message);
    }
  }
  
  return result;
}

function createHook(type, scope = 'project') {
  ensureHooksDirs();
  
  const dir = scope === 'user' ? USER_HOOKS_DIR : getProjectHooksDir();
  const timestamp = Date.now().toString(36);
  const fileName = `${type}-${timestamp}.js`;
  const filePath = path.join(dir, fileName);
  
  const templates = {
    'pre-message': `module.exports = async function(message, context) {
  // This hook runs before sending a message to the bot
  // You can modify the message or log it
  
  // Uncomment to log messages:
  // console.log('[Hook] Sending message:', message);
  
  // Return the (possibly modified) message
  return message;
};
`,
    'post-message': `module.exports = async function(reply, context) {
  // This hook runs after receiving a reply from the bot
  // You can modify the reply or log it
  
  console.log('[Hook] Received reply:', reply);
  
  // Return the (possibly modified) reply
  return reply;
};
`,
    'on-start': `module.exports = async function(data, context) {
  // This hook runs when chat starts
  
  console.log('[Hook] Chat started with bot:', context.botName);
  
  return data;
};
`,
    'on-exit': `module.exports = async function(data, context) {
  // This hook runs when chat exits
  
  console.log('[Hook] Chat ended');
  
  return data;
};
`,
  };
  
  const template = templates[type] || `module.exports = async function(data, context) {
  // Custom hook
  return data;
};
`;
  
  fs.writeFileSync(filePath, template, 'utf-8');
  return filePath;
}

module.exports = {
  getHooks,
  getAllHooks,
  runHooks,
  createHook,
};
