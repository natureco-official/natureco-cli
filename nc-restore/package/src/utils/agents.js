const fs = require('fs');
const path = require('path');

function getAgentsFilePath() {
  return path.join(process.cwd(), '.natureco', 'AGENTS.md');
}

// Read AGENTS.md content
function getAgentsPrompt() {
  const agentsFile = getAgentsFilePath();
  if (!fs.existsSync(agentsFile)) {
    return '';
  }

  try {
    const content = fs.readFileSync(agentsFile, 'utf8');
    return content.trim();
  } catch {
    return '';
  }
}

// Check if AGENTS.md exists
function hasAgentsFile() {
  return fs.existsSync(getAgentsFilePath());
}

module.exports = {
  getAgentsPrompt,
  hasAgentsFile,
};
