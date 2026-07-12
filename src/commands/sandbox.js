const chalk = require('chalk');
const { execSync, spawn } = require('child_process');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');

const SANDBOX_DIR = path.join(os.tmpdir(), 'natureco-sandboxes');

function sandbox(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listSandboxes();
  if (action === 'create') return createSandbox(params[0]);
  if (action === 'destroy') return destroySandbox(params[0]);
  if (action === 'exec') return execSandbox(params[0], params.slice(1).join(' '));

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco sandbox [list|create|destroy|exec]\n', '  Usage: natureco sandbox [list|create|destroy|exec]\n')));
  process.exit(1);
}

function getDirSandboxes() {
  if (!fs.existsSync(SANDBOX_DIR)) return [];
  return fs.readdirSync(SANDBOX_DIR).filter(name => {
    const stat = fs.statSync(path.join(SANDBOX_DIR, name));
    return stat.isDirectory();
  });
}

function listSandboxes() {
  console.log(chalk.cyan('\n  📦 Sandbox Containers\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  // Dir-based sandboxes
  const dirSandboxes = getDirSandboxes();
  if (dirSandboxes.length > 0) {
    for (const name of dirSandboxes) {
      const dir = path.join(SANDBOX_DIR, name);
      const files = fs.readdirSync(dir).length;
      const created = fs.statSync(dir).birthtime;
      console.log(`  ${chalk.green('●')} ${chalk.white(name)}  ${chalk.gray(`(${files} file(s), ${created.toISOString().slice(0, 10)})`)}`);
    }
  }

  // Docker sandboxes
  try {
    const dockerOut = execSync('docker ps --filter "name=natureco-sandbox" --format "{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}" 2>nul', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
    if (dockerOut) {
      for (const line of dockerOut.split('\n')) {
        const [id, image, status, name] = line.split('\t');
        console.log(`  ${chalk.blue('●')} ${chalk.white(name || id)}  ${chalk.gray(`${image} — ${status}`)}`);
      }
    }
  } catch {}

  if (dirSandboxes.length === 0) {
    console.log(chalk.gray('  No sandboxes found.\n'));
    console.log(chalk.gray('  Create one:') + chalk.cyan(' natureco sandbox create [name]\n'));
    return;
  }
  console.log();
}

function createSandbox(name) {
  const sandboxName = name || `sandbox-${Date.now()}`;
  const dir = path.join(SANDBOX_DIR, sandboxName);

  if (fs.existsSync(dir)) {
    console.log(chalk.red(`\n  ❌ Sandbox '${sandboxName}' already exists\n`));
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.natureco-sandbox'), JSON.stringify({ created: new Date().toISOString(), name: sandboxName }));

  console.log(chalk.green(`\n  ✅ Sandbox created: ${sandboxName}\n`));
  console.log(chalk.gray(`  Directory: ${dir}\n`));
  console.log(chalk.gray('  Usage:') + chalk.cyan(` natureco sandbox exec ${sandboxName} "node -e 'console.log(\\"hello\\")'"`) + '\n');
}

function destroySandbox(name) {
  if (!name) {
    console.log(chalk.red(L('\n  ❌ Sandbox name gerekli\n', '\n  ❌ Sandbox name required\n')));
    process.exit(1);
  }

  const dir = path.join(SANDBOX_DIR, name);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(chalk.gray(`  🗑️  Dir sandbox destroyed: ${name}\n`));
  }

  try {
    execSync(`docker rm -f ${name} 2>nul`, { stdio: 'pipe', timeout: 10000 });
    console.log(chalk.gray(`  🗑️  Docker sandbox destroyed: ${name}\n`));
  } catch {}
}

function execSandbox(name, command) {
  if (!name || !command) {
    console.log(chalk.red(L('\n  ❌ Sandbox name ve command gerekli\n', '\n  ❌ Sandbox name and command required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco sandbox exec <name> <command>\n', '  Usage: natureco sandbox exec <name> <command>\n')));
    process.exit(1);
  }

  const dir = path.join(SANDBOX_DIR, name);
  if (!fs.existsSync(dir)) {
    console.log(chalk.red(`\n  ❌ Sandbox '${name}' not found\n`));
    console.log(chalk.gray('  Create one:') + chalk.cyan(` natureco sandbox create ${name}`) + '\n');
    process.exit(1);
  }

  console.log(chalk.cyan(`\n  🏃 Executing in sandbox '${name}': ${command}\n`));

  try {
    const result = execSync(command, { cwd: dir, encoding: 'utf8', timeout: 30000, stdio: 'inherit' });
    return result;
  } catch (err) {
    if (err.status !== undefined) process.exit(err.status);
    console.log(chalk.red(`  ❌ ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = sandbox;
