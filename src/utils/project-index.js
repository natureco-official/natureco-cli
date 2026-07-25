/**
 * Project indexing and per-project memory.
 *
 * Extracted from the legacy `code` agent so both coding front-ends share one
 * implementation. The v5 agent previously had only a one-level `readdir` for
 * project context — no project type, no entry points, no npm scripts, no git
 * state — which is the context that makes "run the tests" or "what does this
 * project do" answerable without a round of exploratory tool calls.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getLang } = require('./i18n');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', 'target', '.wrangler', 'coverage', '.turbo', 'vendor',
]);

function scanDir(dir, maxDepth, depth = 0) {
  const results = [];
  if (depth > maxDepth) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && depth > 0) continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) {
      const sub = scanDir(path.join(dir, entry.name), maxDepth, depth + 1);
      results.push(...sub.map(f => entry.name + '/' + f));
    } else {
      results.push(entry.name);
    }
  }
  return results;
}

function gitInfo(projectDir) {
  const run = args => execFileSync('git', args, { cwd: projectDir, stdio: 'pipe' }).toString().trim();
  try {
    const branch = run(['branch', '--show-current']);
    const statusRaw = run(['status', '--short']);
    return { gitBranch: branch, gitStatus: statusRaw ? statusRaw.split('\n') : [] };
  } catch {
    return { gitBranch: null, gitStatus: null };
  }
}

function detectType(projectDir, files) {
  const fileSet = new Set(files);
  if (fileSet.has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const packageJson = {
        name: pkg.name || path.basename(projectDir),
        version: pkg.version || '0.0.0',
        scripts: pkg.scripts || {},
        dependencies: Object.keys(pkg.dependencies || {}).slice(0, 15),
      };
      let type = 'node';
      if (deps.react || deps['react-dom']) type = 'react';
      else if (deps.next) type = 'nextjs';
      else if (deps.vue) type = 'vue';
      else if (deps.svelte) type = 'svelte';
      else if (deps.express || deps.fastify || deps.koa) type = 'node-server';
      return { type, packageJson };
    } catch { /* malformed package.json — fall through to heuristics */ }
  }
  if (fileSet.has('requirements.txt') || fileSet.has('pyproject.toml') || files.some(f => f.endsWith('.py'))) return { type: 'python', packageJson: null };
  if (fileSet.has('Cargo.toml')) return { type: 'rust', packageJson: null };
  if (fileSet.has('go.mod')) return { type: 'go', packageJson: null };
  if (fileSet.has('pom.xml') || fileSet.has('build.gradle')) return { type: 'java', packageJson: null };
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) return { type: 'typescript', packageJson: null };
  return { type: 'unknown', packageJson: null };
}

const MAIN_CANDIDATES = [
  'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
  'server.js', 'server.ts', 'src/index.js', 'src/index.ts',
  'src/main.ts', 'src/main.py', 'src/App.tsx', 'src/app.tsx',
  'main.py', 'src/main.rs', 'main.go',
];

function indexProject(projectDir) {
  const files = scanDir(projectDir, 2);
  const { type, packageJson } = detectType(projectDir, files);
  const fileSet = new Set(files);
  return {
    dir: projectDir,
    files,
    type,
    packageJson,
    mainFiles: MAIN_CANDIDATES.filter(f => fileSet.has(f)),
    ...gitInfo(projectDir),
  };
}

function buildIndexPrompt(index) {
  const lines = [
    'Project information:',
    `- Type: ${index.type.toUpperCase()}`,
    `- Directory: ${index.dir}`,
    `- Files (${index.files.length} total): ${index.files.slice(0, 40).join(', ')}`,
    `- Entry points: ${index.mainFiles.join(', ') || 'not found'}`,
  ];
  if (index.packageJson) {
    lines.push(`- Package: ${index.packageJson.name} v${index.packageJson.version}`);
    const scripts = Object.keys(index.packageJson.scripts);
    if (scripts.length) lines.push(`- Scripts: ${scripts.join(', ')}`);
    if (index.packageJson.dependencies.length) lines.push(`- Dependencies: ${index.packageJson.dependencies.join(', ')}`);
  }
  if (index.gitBranch) {
    lines.push(`- Git branch: ${index.gitBranch}`);
    lines.push(`- Changes: ${index.gitStatus?.length ? index.gitStatus.slice(0, 5).join(', ') : 'clean'}`);
  }
  return lines.join('\n');
}

/**
 * The command that runs this project's tests, or null when we cannot tell.
 * Used by `/test` so the agent does not have to guess.
 */
function detectTestCommand(index) {
  if (index.packageJson?.scripts?.test) return 'npm test';
  switch (index.type) {
    case 'python': return 'python -m pytest';
    case 'rust': return 'cargo test';
    case 'go': return 'go test ./...';
    case 'java': return index.files.includes('pom.xml') ? 'mvn test' : 'gradle test';
    default: return null;
  }
}

// ── Per-project memory ──────────────────────────────────────────────────────

function getProjectMemoryPath(workDir) {
  return path.join(workDir, '.natureco', 'project.md');
}

function loadProjectMemory(workDir) {
  try {
    const file = getProjectMemoryPath(workDir);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  } catch { /* unreadable memory is the same as none */ }
  return null;
}

function appendProjectMemory(workDir, entryBody) {
  const file = getProjectMemoryPath(workDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = L('# Proje Hafızası\n', '# Project Memory\n');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : header;
  const now = new Date();
  const stamp = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  fs.writeFileSync(file, `${existing}\n## ${stamp}\n${entryBody}\n`);
  return file;
}

module.exports = {
  IGNORE_DIRS,
  scanDir,
  indexProject,
  buildIndexPrompt,
  detectType,
  detectTestCommand,
  getProjectMemoryPath,
  loadProjectMemory,
  appendProjectMemory,
};
