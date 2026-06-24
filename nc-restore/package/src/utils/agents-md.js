const fs = require('fs');
const path = require('path');

const cache = new Map();

const AGENTS_MD_FILENAMES = [
  'AGENTS.md',
  '.natureco/AGENTS.md',
  '.natureco/INSTRUCTIONS.md',
];

function isRoot(dir) {
  const parsed = path.parse(dir);
  return parsed.root === dir;
}

function hasGit(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function findAgentsMd(cwd) {
  let current = path.resolve(cwd || process.cwd());

  while (true) {
    for (const relPath of AGENTS_MD_FILENAMES) {
      const candidate = path.join(current, relPath);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    if (isRoot(current) || hasGit(current)) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function loadInstructions(cwd) {
  const resolvedCwd = path.resolve(cwd || process.cwd());

  if (cache.has(resolvedCwd)) {
    return cache.get(resolvedCwd);
  }

  const filePath = findAgentsMd(resolvedCwd);
  if (!filePath) {
    cache.set(resolvedCwd, null);
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    cache.set(resolvedCwd, content);
    return content;
  } catch {
    cache.set(resolvedCwd, null);
    return null;
  }
}

function injectIntoPrompt(systemPrompt, cwd) {
  const instructions = loadInstructions(cwd);
  if (!instructions) {
    return systemPrompt;
  }

  const header = '\n\n## Project Instructions (from AGENTS.md)\n\n';
  return systemPrompt + header + instructions.trim();
}

function clearCache() {
  cache.clear();
}

module.exports = {
  loadInstructions,
  injectIntoPrompt,
  clearCache,
};
