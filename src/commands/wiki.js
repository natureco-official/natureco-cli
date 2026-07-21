const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { foldTr } = require('../utils/tr-text');

const WIKI_DIR = path.join(os.homedir(), '.natureco', 'wiki');
const VAULT_FILE = path.join(WIKI_DIR, 'vault.json');
const DIRS = {
  sources: path.join(WIKI_DIR, 'sources'),
  concepts: path.join(WIKI_DIR, 'concepts'),
  cache: path.join(WIKI_DIR, 'cache'),
};

function vaultExists() {
  return fs.existsSync(WIKI_DIR) && fs.existsSync(VAULT_FILE);
}

function loadVault() {
  if (!fs.existsSync(VAULT_FILE)) {
    return { initialized: false, created: null, updated: null, pages: 0, version: 1 };
  }
  try {
    return JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
  } catch {
    return { initialized: false, created: null, updated: null, pages: 0, version: 1 };
  }
}

function saveVault(data) {
  const dir = path.dirname(VAULT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VAULT_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function countFiles(dir, ext) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => !ext || f.endsWith(ext)).length;
}

function countAll(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) total++;
      else if (entry.isDirectory()) total += countAll(path.join(dir, entry.name));
    }
  } catch {}
  return total;
}

function wiki(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return cmdStatus();
  if (action === 'doctor') return cmdDoctor();
  if (action === 'init') return cmdInit();
  if (action === 'ingest') return cmdIngest(params.join(' '));
  if (action === 'compile') return cmdCompile();
  if (action === 'lint') return cmdLint();
  if (action === 'search') return cmdSearch(params.join(' '));
  if (action === 'get') return cmdGet(params.join(' '));
  if (action === 'apply') return cmdApply(params[0], params.slice(1));
  if (action === 'bridge' && params[0] === 'import') return cmdBridgeImport(params.slice(1).join(' '));
  if (action === 'unsafe-local' && params[0] === 'import') return cmdUnsafeLocalImport(params.slice(1).join(' '));
  if (action === 'obsidian') return cmdObsidian(params);

  console.log(chalk.red(`\n  Unknown wiki action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco wiki <action> [params]'));
  console.log(chalk.gray('  Actions: status, doctor, init, ingest, compile, lint, search, get, apply\n'));
  process.exit(1);
}

// ── status ──────────────────────────────────────────────────────────────────
function cmdStatus() {
  const exists = vaultExists();
  const vault = loadVault();

  console.log(chalk.cyan('\n  Wiki Vault Status\n'));

  if (!exists) {
    console.log(chalk.yellow('  Not initialized. Run') + chalk.cyan(' natureco wiki init') + chalk.yellow(' to create.\n'));
    return;
  }

  const w = process.stdout.columns || 120;
  console.log(chalk.gray('  ' + '─'.repeat(Math.min(48, w - 4))));

  const srcCount = countFiles(DIRS.sources, '.md');
  const conCount = countFiles(DIRS.concepts, '.md');
  const cacheCount = countAll(DIRS.cache);

  console.log('');
  console.log(chalk.white('  Sources:  ') + chalk.cyan(`${srcCount}`));
  console.log(chalk.white('  Concepts: ') + chalk.cyan(`${conCount}`));
  console.log(chalk.white('  Cached:   ') + chalk.cyan(`${cacheCount} files`));
  console.log(chalk.white('  Pages:    ') + chalk.cyan(`${vault.pages || 0}`));
  console.log('');
  console.log(chalk.gray('  Created:  ') + chalk.white(vault.created ? new Date(vault.created).toLocaleString() : '—'));
  console.log(chalk.gray('  Updated:  ') + chalk.white(vault.updated ? new Date(vault.updated).toLocaleString() : '—'));
  console.log(chalk.gray('  Version:  ') + chalk.white(`v${vault.version || 1}`));
  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(Math.min(48, w - 4))));
  console.log('');
}

// ── doctor ──────────────────────────────────────────────────────────────────
function cmdDoctor() {
  console.log(chalk.cyan('\n  Wiki Vault Health Check\n'));

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  function check(label, condition, severity) {
    if (condition) {
      passed++;
      console.log(chalk.green(`  [PASS] ${label}`));
    } else if (severity === 'warn') {
      warnings++;
      console.log(chalk.yellow(`  [WARN] ${label}`));
    } else {
      failed++;
      console.log(chalk.red(`  [FAIL] ${label}`));
    }
  }

  check('Vault directory exists', fs.existsSync(WIKI_DIR), 'fail');
  check('sources/ directory exists', fs.existsSync(DIRS.sources), 'fail');
  check('concepts/ directory exists', fs.existsSync(DIRS.concepts), 'fail');
  check('cache/ directory exists', fs.existsSync(DIRS.cache), 'fail');
  check('vault.json exists', fs.existsSync(VAULT_FILE), 'fail');

  if (fs.existsSync(VAULT_FILE)) {
    try {
      const vault = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
      check('vault.json is valid JSON', !!vault, 'fail');
      check('vault.json has version field', typeof vault.version === 'number', 'warn');
    } catch {
      check('vault.json is valid JSON', false, 'fail');
    }
  }

  if (fs.existsSync(DIRS.sources)) {
    const mdFiles = fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'));
    check('Source files exist', mdFiles.length > 0, 'warn');
    for (const file of mdFiles.slice(0, 5)) {
      const content = fs.readFileSync(path.join(DIRS.sources, file), 'utf8');
      check(`File "${file}" is non-empty`, content.trim().length > 0, 'warn');
    }
  }

  const total = passed + failed + warnings;
  console.log('');
  console.log(chalk.gray(`  ${passed} passed, ${warnings} warnings, ${failed} failed out of ${total} checks`));

  if (failed > 0) {
    console.log(chalk.red(`\n  Some checks failed. Run ${chalk.cyan('natureco wiki init')} to fix.\n`));
  } else {
    console.log(chalk.green('\n  Vault is healthy.\n'));
  }
}

// ── init ────────────────────────────────────────────────────────────────────
function cmdInit() {
  if (vaultExists()) {
    console.log(chalk.yellow('\n  Wiki vault already exists.\n'));
    return;
  }

  for (const key of Object.keys(DIRS)) {
    const dir = DIRS[key];
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const vault = {
    initialized: true,
    version: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    pages: 0,
  };
  saveVault(vault);

  console.log(chalk.green('\n  Wiki vault initialized at') + chalk.white(` ${WIKI_DIR}\n`));
  console.log(chalk.gray('  Created:'));
  console.log(chalk.gray('    sources/   — ingested markdown pages'));
  console.log(chalk.gray('    concepts/  — compiled concept pages'));
  console.log(chalk.gray('    cache/     — compiled digests'));
  console.log(chalk.gray('    vault.json — vault metadata'));
  console.log('');
  console.log(chalk.cyan('  Run') + chalk.white(' natureco wiki ingest <path>') + chalk.cyan(' to add content.\n'));
}

// ── ingest ──────────────────────────────────────────────────────────────────
function cmdIngest(srcPath) {
  if (!srcPath) {
    console.log(chalk.red('\n  Usage: natureco wiki ingest <path>\n'));
    process.exit(1);
  }

  if (!fs.existsSync(srcPath)) {
    console.log(chalk.red(`\n  Path not found: ${srcPath}\n`));
    process.exit(1);
  }

  if (!vaultExists()) {
    console.log(chalk.yellow('\n  Wiki vault not initialized. Run') + chalk.cyan(' natureco wiki init') + chalk.yellow(' first.\n'));
    process.exit(1);
  }

  if (!fs.existsSync(DIRS.sources)) {
    fs.mkdirSync(DIRS.sources, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    const files = fs.readdirSync(srcPath);
    for (const file of files) {
      if (!file.endsWith('.md')) {
        skipped++;
        continue;
      }
      const srcFile = path.join(srcPath, file);
      if (fs.statSync(srcFile).isFile()) {
        const dest = path.join(DIRS.sources, file);
        if (fs.existsSync(dest)) {
          let base = path.basename(file, '.md');
          let idx = 1;
          while (fs.existsSync(path.join(DIRS.sources, `${base}_${idx}.md`))) idx++;
          fs.copyFileSync(srcFile, path.join(DIRS.sources, `${base}_${idx}.md`));
        } else {
          fs.copyFileSync(srcFile, dest);
        }
        copied++;
      }
    }
  } else if (stat.isFile() && srcPath.endsWith('.md')) {
    const dest = path.join(DIRS.sources, path.basename(srcPath));
    if (fs.existsSync(dest)) {
      const base = path.basename(srcPath, '.md');
      let idx = 1;
      while (fs.existsSync(path.join(DIRS.sources, `${base}_${idx}.md`))) idx++;
      fs.copyFileSync(srcPath, path.join(DIRS.sources, `${base}_${idx}.md`));
    } else {
      fs.copyFileSync(srcPath, dest);
    }
    copied++;
  } else {
    console.log(chalk.yellow('\n  No markdown files found at the given path.\n'));
    return;
  }

  const vault = loadVault();
  vault.pages = (vault.pages || 0) + copied;
  vault.updated = new Date().toISOString();
  saveVault(vault);

  console.log(chalk.green(`\n  Ingested ${copied} file(s)`));
  if (skipped > 0) console.log(chalk.gray(`  Skipped ${skipped} non-markdown file(s)`));
  console.log('');
}

// ── compile ─────────────────────────────────────────────────────────────────
function cmdCompile() {
  if (!vaultExists()) {
    console.log(chalk.yellow('\n  Wiki vault not initialized.\n'));
    return;
  }

  const srcFiles = fs.existsSync(DIRS.sources)
    ? fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'))
    : [];

  if (srcFiles.length === 0) {
    console.log(chalk.yellow('\n  No source files to compile. Ingest some first.\n'));
    return;
  }

  if (!fs.existsSync(DIRS.concepts)) fs.mkdirSync(DIRS.concepts, { recursive: true });
  if (!fs.existsSync(DIRS.cache)) fs.mkdirSync(DIRS.cache, { recursive: true });

  const index = [];
  const cacheEntries = [];

  for (const file of srcFiles) {
    const srcPath = path.join(DIRS.sources, file);
    const content = fs.readFileSync(srcPath, 'utf8');

    const title = extractTitle(content) || path.basename(file, '.md');
    const firstLine = content.split('\n').find(l => l.trim()) || '';
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const concept = {
      id: path.basename(file, '.md'),
      title,
      source: file,
      wordCount,
      imported: new Date().toISOString(),
    };

    const conceptFile = path.join(DIRS.concepts, `${concept.id}.json`);
    fs.writeFileSync(conceptFile, JSON.stringify(concept, null, 2), 'utf8');

    index.push(concept);

    const digest = {
      title,
      source: file,
      snippet: firstLine.slice(0, 200),
      wordCount,
      path: srcPath,
    };
    cacheEntries.push(digest);
  }

  const cacheFile = path.join(DIRS.cache, 'index.json');
  fs.writeFileSync(cacheFile, JSON.stringify({ entries: cacheEntries, compiled: new Date().toISOString() }, null, 2), 'utf8');

  const vault = loadVault();
  vault.pages = srcFiles.length;
  vault.updated = new Date().toISOString();
  saveVault(vault);

  console.log(chalk.green(`\n  Compiled ${srcFiles.length} source files into concepts/ and cache/\n`));
}

// ── lint ────────────────────────────────────────────────────────────────────
function cmdLint() {
  if (!vaultExists()) {
    console.log(chalk.yellow('\n  Wiki vault not initialized.\n'));
    return;
  }

  console.log(chalk.cyan('\n  Linting Wiki Vault\n'));

  let issues = 0;
  let filesChecked = 0;

  function issue(type, msg) {
    issues++;
    const tag = type === 'error' ? chalk.red('[ERROR]') : type === 'warn' ? chalk.yellow('[WARN]') : chalk.gray('[INFO]');
    console.log(`  ${tag} ${msg}`);
  }

  if (!fs.existsSync(DIRS.sources)) {
    issue('error', 'sources/ directory missing');
  } else {
    const files = fs.readdirSync(DIRS.sources);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      filesChecked++;
      const filePath = path.join(DIRS.sources, file);
      const content = fs.readFileSync(filePath, 'utf8');

      if (content.trim().length === 0) {
        issue('warn', `"${file}" is empty`);
        continue;
      }

      const lines = content.split('\n');

      const hasFrontMatter = lines[0] && lines[0].trim() === '---';
      if (hasFrontMatter) {
        const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
        if (endIdx === -1) {
          issue('warn', `"${file}" has unclosed front matter`);
        }
      }

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 2000) {
          issue('info', `"${file}" has a very long line (${lines[i].length} chars) at line ${i + 1}`);
        }
      }

      const linkRefs = content.match(/\[\[([^\]]+)\]\]/g);
      if (linkRefs) {
        for (const ref of linkRefs) {
          const target = ref.slice(2, -2);
          const targetPath = path.join(DIRS.sources, `${target}.md`);
          if (!fs.existsSync(targetPath)) {
            const conceptFile = path.join(DIRS.concepts, `${target}.json`);
            if (!fs.existsSync(conceptFile)) {
              issue('warn', `"${file}" has broken link to "${target}"`);
            }
          }
        }
      }
    }
  }

  const conceptsExist = fs.existsSync(DIRS.concepts) && fs.readdirSync(DIRS.concepts).length > 0;
  const cacheExists = fs.existsSync(DIRS.cache) && fs.readdirSync(DIRS.cache).length > 0;

  if (!conceptsExist) issue('info', 'No compiled concepts — run compile');
  if (!cacheExists) issue('info', 'No cache entries — run compile');

  const summary = `${filesChecked} files checked, ${issues} issue(s) found`;
  if (issues === 0) {
    console.log(chalk.green(`\n  ${summary}\n`));
  } else {
    console.log(chalk.yellow(`\n  ${summary}\n`));
  }
}

// ── search ──────────────────────────────────────────────────────────────────
function cmdSearch(query) {
  if (!query) {
    console.log(chalk.red('\n  Usage: natureco wiki search <query>\n'));
    process.exit(1);
  }

  if (!fs.existsSync(DIRS.sources)) {
    console.log(chalk.yellow('\n  No sources directory found.\n'));
    return;
  }

  const files = fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log(chalk.yellow('\n  No source files to search.\n'));
    return;
  }

  const lowerQuery = foldTr(query);
  let results = [];

  for (const file of files) {
    const filePath = path.join(DIRS.sources, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const idx = foldTr(lines[i]).indexOf(lowerQuery);
      if (idx !== -1) {
        const before = lines[i].slice(Math.max(0, idx - 40), idx);
        const match = lines[i].slice(idx, idx + query.length);
        const after = lines[i].slice(idx + query.length, idx + query.length + 40);
        results.push({
          file,
          line: i + 1,
          before,
          match,
          after,
        });
      }
    }
  }

  if (results.length === 0) {
    console.log(chalk.yellow(`\n  No results for "${query}"\n`));
    return;
  }

  console.log(chalk.cyan(`\n  Found ${results.length} match(es) for "${query}"\n`));
  console.log(chalk.gray('  ' + '─'.repeat(Math.min(64, (process.stdout.columns || 120) - 4))));

  let lastFile = '';
  for (const r of results) {
    if (r.file !== lastFile) {
      lastFile = r.file;
      console.log(`\n  ${chalk.white(r.file)}`);
    }
    const snippet = chalk.gray(r.before) + chalk.yellow(r.match) + chalk.gray(r.after);
    console.log(chalk.gray(`    ${r.line}:`) + ` ${snippet}`);
  }
  console.log('');
}

// ── get ─────────────────────────────────────────────────────────────────────
function cmdGet(identifier) {
  if (!identifier) {
    console.log(chalk.red('\n  Usage: natureco wiki get <path-or-id>\n'));
    process.exit(1);
  }

  const candidates = [];

  if (fs.existsSync(DIRS.sources)) {
    const exactPath = path.join(DIRS.sources, identifier);
    if (fs.existsSync(exactPath)) {
      candidates.push(exactPath);
    }

    const withMd = path.join(DIRS.sources, `${identifier}.md`);
    if (fs.existsSync(withMd)) {
      candidates.push(withMd);
    }

    const files = fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const base = path.basename(file, '.md');
      if (base === identifier || base.includes(identifier)) {
        const fp = path.join(DIRS.sources, file);
        if (!candidates.includes(fp)) candidates.push(fp);
      }
    }
  }

  if (candidates.length === 0) {
    console.log(chalk.yellow(`\n  No page found for "${identifier}"\n`));
    return;
  }

  for (const filePath of candidates) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const w = process.stdout.columns || 120;

    console.log(chalk.cyan(`\n  ${fileName}\n`));
    console.log(chalk.gray('  ' + '─'.repeat(Math.min(48, w - 4))));
    console.log('');
    console.log(content.trim());
    console.log('');
  }
}

// ── apply ──────────────────────────────────────────────────────────────────
function cmdApply(subcommand, params) {
  if (!subcommand || (subcommand !== 'synthesis' && subcommand !== 'metadata')) {
    console.log(chalk.red('\n  Usage: natureco wiki apply synthesis|metadata [args]\n'));
    process.exit(1);
  }

  if (subcommand === 'synthesis') {
    applySynthesis(params);
  } else if (subcommand === 'metadata') {
    applyMetadata(params);
  }
}

function applySynthesis(params) {
  const vault = loadVault();
  if (!vault.initialized) {
    console.log(chalk.yellow('\n  Wiki vault not initialized.\n'));
    return;
  }

  const sourceFiles = fs.existsSync(DIRS.sources)
    ? fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'))
    : [];

  if (sourceFiles.length === 0) {
    console.log(chalk.yellow('\n  No source files to synthesize.\n'));
    return;
  }

  if (!fs.existsSync(DIRS.cache)) fs.mkdirSync(DIRS.cache, { recursive: true });

  const digestFile = path.join(DIRS.cache, 'synthesis.json');
  const synthesis = {
    synthesized: new Date().toISOString(),
    totalSources: sourceFiles.length,
    sources: [],
  };

  for (const file of sourceFiles) {
    const filePath = path.join(DIRS.sources, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());

    synthesis.sources.push({
      file,
      title: extractTitle(content) || path.basename(file, '.md'),
      lineCount: lines.length,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      headingCount: (content.match(/^#{1,6}\s+/gm) || []).length,
    });
  }

  fs.writeFileSync(digestFile, JSON.stringify(synthesis, null, 2), 'utf8');

  console.log(chalk.green(`\n  Applied synthesis: ${sourceFiles.length} sources catalogued\n`));
  console.log(chalk.gray(`  Written to: ${digestFile}\n`));
}

function applyMetadata(params) {
  if (params.length < 2) {
    console.log(chalk.red('\n  Usage: natureco wiki apply metadata <file|id> <key=value> [key=value...]\n'));
    process.exit(1);
  }

  const identifier = params[0];
  const kvPairs = params.slice(1);

  if (!fs.existsSync(DIRS.sources)) {
    console.log(chalk.yellow('\n  No sources directory.\n'));
    return;
  }

  const files = fs.readdirSync(DIRS.sources).filter(f => f.endsWith('.md'));
  let targetFile = null;

  for (const file of files) {
    const base = path.basename(file, '.md');
    if (file === identifier || file === `${identifier}.md` || base === identifier) {
      targetFile = file;
      break;
    }
  }

  if (!targetFile) {
    console.log(chalk.red(`\n  No source file found for: ${identifier}\n`));
    process.exit(1);
  }

  const filePath = path.join(DIRS.sources, targetFile);
  let content = fs.readFileSync(filePath, 'utf8');

  const lines = content.split('\n');
  let hasFrontMatter = lines[0] && lines[0].trim() === '---';

  if (!hasFrontMatter) {
    const meta = ['---'];
    for (const kv of kvPairs) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx === -1) continue;
      const key = kv.slice(0, eqIdx).trim();
      const val = kv.slice(eqIdx + 1).trim();
      meta.push(`${key}: ${val}`);
    }
    meta.push('---');
    meta.push('');
    content = meta.join('\n') + content;
  } else {
    const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
    if (endIdx === -1) {
      console.log(chalk.red(`\n  Unclosed front matter in "${targetFile}"\n`));
      process.exit(1);
    }
    const bodyStart = endIdx + 2;
    const frontMatterLines = lines.slice(1, endIdx + 1);
    const body = lines.slice(bodyStart).join('\n');

    const existingMeta = {};
    const updated = [];
    for (const line of frontMatterLines) {
      if (line.trim() === '---') continue;
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        updated.push(line);
        continue;
      }
      const key = line.slice(0, colonIdx).trim();
      existingMeta[key] = line.slice(colonIdx + 1).trim();
    }

    for (const kv of kvPairs) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx === -1) continue;
      const key = kv.slice(0, eqIdx).trim();
      const val = kv.slice(eqIdx + 1).trim();
      existingMeta[key] = val;
    }

    const newFront = ['---'];
    for (const [key, val] of Object.entries(existingMeta)) {
      newFront.push(`${key}: ${val}`);
    }
    newFront.push('---');
    content = newFront.join('\n') + '\n' + body;
  }

  fs.writeFileSync(filePath, content, 'utf8');

  console.log(chalk.green(`\n  Applied metadata to "${targetFile}"\n`));
  for (const kv of kvPairs) {
    console.log(chalk.gray(`    ${kv}`));
  }
  console.log('');
}

// ── helpers ─────────────────────────────────────────────────────────────────
function extractTitle(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ') || trimmed.startsWith('#\t')) {
      return trimmed.replace(/^#\s+/, '');
    }
  }
  const firstLine = lines.find(l => l.trim());
  if (firstLine) {
    const trimmed = firstLine.trim();
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/, '');
    }
  }
  return null;
}

// ── bridge import ──────────────────────────────────────────────────────
function cmdBridgeImport(url) {
  if (!url) {
    console.log(chalk.red('\n  Usage: natureco wiki bridge import <url>\n'));
    process.exit(1);
  }
  console.log(chalk.yellow(`\n  Bridge import from ${url} not yet implemented\n`));
}

// ── unsafe-local import ──────────────────────────────────────────────
function cmdUnsafeLocalImport(filePath) {
  if (!filePath) {
    console.log(chalk.red('\n  Usage: natureco wiki unsafe-local import <path>\n'));
    process.exit(1);
  }
  console.log(chalk.yellow(`\n  Unsafe local import from ${filePath} not yet implemented\n`));
}

// ── obsidian ─────────────────────────────────────────────────────────
function cmdObsidian(params) {
  const sub = params[0];
  const rest = params.slice(1).join(' ');
  if (sub === 'status') return cmdObsidianStatus();
  if (sub === 'search') return cmdObsidianSearch(rest);
  if (sub === 'open') return cmdObsidianOpen(rest);
  if (sub === 'command') return cmdObsidianCommand(rest);
  if (sub === 'daily') return cmdObsidianDaily();
  console.log(chalk.red(`\n  Unknown obsidian action: ${sub || ''}\n`));
  console.log(chalk.gray('  Usage: natureco wiki obsidian status|search|open|command|daily\n'));
  process.exit(1);
}

function cmdObsidianStatus() {
  const obsidianFile = path.join(WIKI_DIR, 'obsidian.json');
  if (!fs.existsSync(obsidianFile)) {
    console.log(chalk.gray('\n  No Obsidian vault configured.\n'));
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(obsidianFile, 'utf8'));
    console.log(chalk.cyan('\n  Obsidian Vault Status\n'));
    console.log(chalk.white('  Vault:  ') + chalk.cyan(data.vault || '—'));
    console.log(chalk.white('  Path:   ') + chalk.gray(data.path || '—'));
    console.log(chalk.white('  Notes:  ') + chalk.cyan(data.noteCount || 0));
    console.log(chalk.white('  Synced: ') + chalk.gray(data.lastSync ? new Date(data.lastSync).toLocaleString() : 'Never'));
    console.log('');
  } catch (err) {
    console.log(chalk.red('\n  Error reading Obsidian config: ' + err.message + '\n'));
  }
}

function cmdObsidianSearch(query) {
  if (!query) {
    console.log(chalk.red('\n  Usage: natureco wiki obsidian search <query>\n'));
    process.exit(1);
  }
  const obsidianFile = path.join(WIKI_DIR, 'obsidian.json');
  if (!fs.existsSync(obsidianFile)) {
    console.log(chalk.gray('\n  No Obsidian vault configured.\n'));
    return;
  }
  console.log(chalk.yellow(`\n  Searching Obsidian vault for "${query}"...\n`));
  console.log(chalk.gray('  (Obsidian search not yet fully implemented)\n'));
}

function cmdObsidianOpen(note) {
  if (!note) {
    console.log(chalk.red('\n  Usage: natureco wiki obsidian open <note>\n'));
    process.exit(1);
  }
  console.log(chalk.yellow(`\n  Would open ${note} in Obsidian\n`));
}

function cmdObsidianCommand(cmd) {
  if (!cmd) {
    console.log(chalk.red('\n  Usage: natureco wiki obsidian command <cmd>\n'));
    process.exit(1);
  }
  console.log(chalk.yellow(`\n  Would run Obsidian command: ${cmd}\n`));
}

function cmdObsidianDaily() {
  console.log(chalk.yellow('\n  Would open Obsidian daily note\n'));
}

module.exports = wiki;
