const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PATHS_FILE = path.join(os.homedir(), '.natureco', 'paths.json');

function loadPaths() {
  try {
    if (fs.existsSync(PATHS_FILE)) return JSON.parse(fs.readFileSync(PATHS_FILE, 'utf8'));
  } catch {}
  return {};
}

function savePaths(data) {
  const dir = path.dirname(PATHS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PATHS_FILE, JSON.stringify(data, null, 2));
}

function pathCmd(args) {
  const [action, ...params] = args || [];

  if (!action) return listPaths();
  if (action === 'resolve') return resolvePath(params.join('/'));
  if (action === 'find') return findPath(params[0]);
  if (action === 'set') return setPath(params[0], params.slice(1).join(' '));
  if (action === 'validate') return validatePath(params[0]);
  if (action === 'emit') return emitPath(params[0]);

  console.log(chalk.red(`\n  ❌ Unknown path action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco path <resolve|find|set|validate|emit> [args]\n'));
  process.exit(1);
}

function listPaths() {
  const paths = loadPaths();
  const entries = Object.entries(paths);

  console.log(chalk.cyan('\n  📍 Registered Paths\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (entries.length === 0) {
    console.log(chalk.gray('  No paths registered.\n'));
    console.log(chalk.gray('  Register a path:'));
    console.log(chalk.cyan('    natureco path set <name> <path>\n'));
    return;
  }

  for (const [name, p] of entries) {
    const exists = fs.existsSync(p);
    const icon = exists ? chalk.green('●') : chalk.red('○');
    console.log(`  ${icon} ${chalk.white(name)}`);
    console.log(`    ${chalk.gray('Path:')} ${chalk.cyan(p)}`);
    console.log(`    ${chalk.gray('Exists:')} ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  }
  console.log();
}

function resolvePath(uri) {
  if (!uri) {
    console.log(chalk.red('\n  ❌ URI gerekli\n'));
    console.log(chalk.gray('  Usage: natureco path resolve nc://path\n'));
    process.exit(1);
  }

  const fullUri = uri.startsWith('nc://') ? uri : `nc://${uri}`;
  const parts = fullUri.replace('nc://', '').split('/').filter(Boolean);
  const name = parts[0];
  const sub = parts.slice(1).join('/');

  const registry = loadPaths();
  const registered = registry[name];

  if (registered) {
    const resolved = sub ? path.join(registered, sub) : registered;
    const exists = fs.existsSync(resolved);

    console.log(chalk.cyan('\n  📍 Path Resolution\n'));
    console.log(chalk.gray('  ' + '─'.repeat(48)));
    console.log(`  ${chalk.white('URI:')}  ${chalk.cyan(fullUri)}`);
    console.log(`  ${chalk.white('Name:')} ${chalk.white(name)}`);
    console.log(`  ${chalk.white('Path:')} ${chalk.white(resolved)}`);
    console.log(`  ${chalk.white('From registry:')} ${chalk.gray(registered)}`);
    console.log(`  ${chalk.white('Exists:')} ${exists ? chalk.green('Yes') : chalk.red('No')}`);
    console.log();
    return;
  }

  const resolved = path.resolve(uri);
  const exists = fs.existsSync(resolved);

  console.log(chalk.cyan('\n  📍 Path Resolution\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('URI:')}  ${chalk.cyan(fullUri)}`);
  console.log(`  ${chalk.white('Path:')} ${chalk.white(resolved)}`);
  console.log(`  ${chalk.white('From registry:')} ${chalk.gray('No')}`);
  console.log(`  ${chalk.white('Exists:')} ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  console.log();
}

function findPath(name) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Name gerekli\n'));
    process.exit(1);
  }

  const paths = loadPaths();
  const entry = paths[name];

  if (!entry) {
    console.log(chalk.yellow(`\n  🔍 Path not found: ${name}\n`));
    console.log(chalk.gray('  Register it:'));
    console.log(chalk.cyan(`    natureco path set ${name} <path>\n`));
    return;
  }

  const exists = fs.existsSync(entry);

  console.log(chalk.cyan('\n  🔍 Path Lookup\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Name:')}   ${chalk.cyan(name)}`);
  console.log(`  ${chalk.white('Path:')}   ${chalk.white(entry)}`);
  console.log(`  ${chalk.white('Exists:')} ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  console.log();
}

function setPath(name, targetPath) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Name gerekli\n'));
    process.exit(1);
  }
  if (!targetPath) {
    console.log(chalk.red('\n  ❌ Path gerekli\n'));
    process.exit(1);
  }

  const resolved = path.resolve(targetPath);
  const paths = loadPaths();
  paths[name] = resolved;
  savePaths(paths);

  console.log(chalk.green(`\n  ✅ Path registered: ${name}\n`));
  console.log(chalk.gray(`  Name: ${chalk.white(name)}`));
  console.log(chalk.gray(`  Path: ${chalk.cyan(resolved)}\n`));
}

function validatePath(name) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Name gerekli\n'));
    process.exit(1);
  }

  const paths = loadPaths();
  const entry = paths[name];

  if (!entry) {
    console.log(chalk.yellow(`\n  ⚠️  Not registered: ${name}\n`));
    process.exit(1);
  }

  const exists = fs.existsSync(entry);

  console.log(chalk.cyan('\n  ✅ Path Validation\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Name:')}   ${chalk.cyan(name)}`);
  console.log(`  ${chalk.white('Path:')}   ${chalk.white(entry)}`);
  console.log(`  ${chalk.white('Exists:')} ${exists ? chalk.green('Yes') : chalk.red('No')}`);

  if (exists) {
    try {
      const stat = fs.statSync(entry);
      console.log(`  ${chalk.white('Type:')}   ${stat.isDirectory() ? chalk.blue('Directory') : chalk.gray('File')}`);
      console.log(`  ${chalk.white('Size:')}   ${chalk.gray(stat.isDirectory() ? '-' : `${(stat.size / 1024).toFixed(1)} KB`)}`);
    } catch {}
  }

  console.log();
}

function emitPath(name) {
  if (!name) {
    console.log(chalk.red('\n  ❌ Name gerekli\n'));
    process.exit(1);
  }

  const paths = loadPaths();
  const entry = paths[name];

  if (!entry) {
    console.log(chalk.yellow(`\n  ⚠️  Not registered: ${name}\n`));
    process.exit(1);
  }

  const uri = `nc://${name}`;

  console.log(chalk.cyan('\n  🔗 Clickable URI\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Name:')}  ${chalk.cyan(name)}`);
  console.log(`  ${chalk.white('URI:')}   ${chalk.bold.green(uri)}`);
  console.log(`  ${chalk.white('Path:')}  ${chalk.gray(entry)}`);
  console.log();
  console.log(chalk.gray('  Copy the URI above to use in nc://-aware tools.\n'));
}

module.exports = pathCmd;
