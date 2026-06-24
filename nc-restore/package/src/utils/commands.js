const fs = require('fs');
const path = require('path');
const os = require('os');

const USER_COMMANDS_DIR = path.join(os.homedir(), '.natureco', 'commands');

function getProjectCommandsDir() {
  return path.join(process.cwd(), '.natureco', 'commands');
}

function ensureCommandsDirs() {
  if (!fs.existsSync(USER_COMMANDS_DIR)) {
    fs.mkdirSync(USER_COMMANDS_DIR, { recursive: true });
  }
  const projectCommandsDir = getProjectCommandsDir();
  if (!fs.existsSync(projectCommandsDir)) {
    fs.mkdirSync(projectCommandsDir, { recursive: true });
  }
}

function getCommands() {
  ensureCommandsDirs();
  
  const commands = [];
  
  // User commands
  if (fs.existsSync(USER_COMMANDS_DIR)) {
    const userFiles = fs.readdirSync(USER_COMMANDS_DIR).filter(f => f.endsWith('.md'));
    userFiles.forEach(file => {
      const name = path.basename(file, '.md');
      const content = fs.readFileSync(path.join(USER_COMMANDS_DIR, file), 'utf-8');
      commands.push({ name, content, source: 'user' });
    });
  }
  
  // Project commands
  const projectCommandsDir = getProjectCommandsDir();
  if (fs.existsSync(projectCommandsDir)) {
    const projectFiles = fs.readdirSync(projectCommandsDir).filter(f => f.endsWith('.md'));
    projectFiles.forEach(file => {
      const name = path.basename(file, '.md');
      const content = fs.readFileSync(path.join(projectCommandsDir, file), 'utf-8');
      commands.push({ name, content, source: 'project' });
    });
  }
  
  return commands;
}

function getCommandContent(commandName) {
  const commands = getCommands();
  const command = commands.find(c => c.name === commandName);
  return command ? command.content : null;
}

function createCommand(name, scope = 'project') {
  ensureCommandsDirs();
  
  const dir = scope === 'user' ? USER_COMMANDS_DIR : getProjectCommandsDir();
  const filePath = path.join(dir, `${name}.md`);
  
  if (fs.existsSync(filePath)) {
    throw new Error(`Command "${name}" already exists`);
  }
  
  const template = `# ${name} Command

Write your custom instruction here. This will be added to the system prompt when you use /${name} in chat.

Example:
Review this code for security vulnerabilities, performance issues, and suggest improvements.
`;
  
  fs.writeFileSync(filePath, template, 'utf-8');
  return filePath;
}

module.exports = {
  getCommands,
  getCommandContent,
  createCommand,
};
