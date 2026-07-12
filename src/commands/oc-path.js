const chalk = require('chalk');
const path = require('path');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const os = require('os');

function normalizeNcPath(uri) {
  if (!uri) return null;

  const str = uri.trim();

  if (str.startsWith('nc://')) return str.slice(5);
  if (str.startsWith('natureco://')) return str.slice(10);

  return str;
}

function resolveNcPath(ncPath) {
  if (!ncPath) return null;

  const parts = ncPath.split('/').filter(Boolean);
  const scope = parts[0];
  const rest = parts.slice(1);

  if (scope === 'workspace' || scope === 'w') {
    return { type: 'workspace', path: rest.join('/') || '.', description: 'Workspace path' };
  }

  if (scope === 'home' || scope === 'h') {
    return { type: 'home', path: path.join(os.homedir(), ...rest), description: 'Home directory' };
  }

  if (scope === 'config' || scope === 'c') {
    const configDir = path.join(os.homedir(), '.natureco');
    return { type: 'config', path: rest.length ? path.join(configDir, ...rest) : configDir, description: 'Config directory' };
  }

  if (scope === 'tmp' || scope === 't') {
    return { type: 'tmp', path: path.join(os.tmpdir(), ...rest), description: 'Temp directory' };
  }

  if (scope === 'tools' || scope === 'tool') {
    const toolsDir = path.join(__dirname, '..', 'tools');
    return { type: 'tools', path: path.join(toolsDir, ...rest), description: 'Tools directory' };
  }

  if (scope === 'commands' || scope === 'cmd') {
    const cmdsDir = path.join(__dirname, '..', 'commands');
    return { type: 'commands', path: path.join(cmdsDir, ...rest), description: 'Commands directory' };
  }

  if (scope === 'project' || scope === 'p') {
    return { type: 'project', path: rest.join('/') || '.', description: 'Project path (CWD)' };
  }

  if (scope === 'skills' || scope === 's') {
    const skillsDir = path.join(__dirname, '..', '..', 'skills');
    return { type: 'skills', path: path.join(skillsDir, ...rest), description: 'Skills directory' };
  }

  if (scope === 'data' || scope === 'd') {
    const dataDir = path.join(os.homedir(), '.natureco', 'data');
    return { type: 'data', path: rest.length ? path.join(dataDir, ...rest) : dataDir, description: 'Data directory' };
  }

  return { type: 'unknown', path: ncPath, description: 'Unresolved path' };
}

function ocPath(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'resolve') return resolvePath(params.join('/'));
  if (action === 'list') return listScopes();
  if (action === 'cat') return catFile(params.join('/'));
  if (action === 'ls') return lsPath(params.join('/'));

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco oc-path [resolve|list|cat|ls] <path>\n', '  Usage: natureco oc-path [resolve|list|cat|ls] <path>\n')));
  process.exit(1);
}

function resolvePath(uri) {
  const ncPath = normalizeNcPath(uri);
  if (!ncPath) {
    console.log(chalk.red(L('\n  ❌ Path gerekli\n', '\n  ❌ Path required\n')));
    console.log(chalk.cyan('    natureco oc-path resolve nc://config\n'));
    process.exit(1);
  }

  const resolved = resolveNcPath(ncPath);
  if (!resolved) {
    console.log(chalk.red(`\n  ❌ ${L('Çözümlenemedi', 'Could not resolve')}: ${ncPath}\n`));
    process.exit(1);
  }

  const exists = fs.existsSync(resolved.path);

  console.log(chalk.cyan('\n  📍 nc:// Path Resolution\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Scope:')}       ${chalk.cyan(resolved.type)}`);
  console.log(`  ${chalk.white('Path:')}        ${chalk.white(resolved.path)}`);
  console.log(`  ${chalk.white('Description:')} ${chalk.gray(resolved.description)}`);
  console.log(`  ${chalk.white('Exists:')}      ${exists ? chalk.green('Yes') : chalk.red('No')}`);
  console.log();
}

function listScopes() {
  console.log(chalk.cyan('\n  📍 nc:// Path Scopes\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  const scopes = [
    { alias: 'w', scope: 'workspace', desc: 'CWD altındaki dosyalar' },
    { alias: 'p', scope: 'project', desc: 'Proje kökü (CWD)' },
    { alias: 'h', scope: 'home', desc: 'Kullanıcı ana dizini (~)' },
    { alias: 'c', scope: 'config', desc: '~/.natureco yapılandırma' },
    { alias: 'd', scope: 'data', desc: '~/.natureco/data veri dizini' },
    { alias: 't', scope: 'tmp', desc: 'Geçici dizin' },
    { alias: 's', scope: 'skills', desc: 'Skill dizini' },
    { alias: 'tool', scope: 'tools', desc: 'Araçlar dizini' },
    { alias: 'cmd', scope: 'commands', desc: 'Komutlar dizini' }
  ];

  for (const s of scopes) {
    console.log(`  ${chalk.cyan(`nc://${s.scope}`)} ${chalk.gray(`(${s.alias})`)} ${chalk.white('-')} ${chalk.gray(s.desc)}`);
  }

  console.log(chalk.gray('\n  Examples:'));
  console.log(chalk.cyan('    natureco oc-path resolve nc://config'));
  console.log(chalk.cyan('    natureco oc-path ls nc://tools'));
  console.log(chalk.cyan('    natureco oc-path cat nc://c/settings.json'));
  console.log();
}

function catFile(uri) {
  const ncPath = normalizeNcPath(uri);
  if (!ncPath) {
    console.log(chalk.red(L('\n  ❌ Path gerekli\n', '\n  ❌ Path required\n')));
    process.exit(1);
  }

  const resolved = resolveNcPath(ncPath);
  if (!resolved) {
    console.log(chalk.red(`\n  ❌ ${L('Çözümlenemedi', 'Could not resolve')}: ${ncPath}\n`));
    process.exit(1);
  }

  if (!fs.existsSync(resolved.path)) {
    console.log(chalk.red(`\n  ❌ ${L('Dosya bulunamadı', 'File not found')}: ${resolved.path}\n`));
    process.exit(1);
  }

  const stat = fs.statSync(resolved.path);
  if (stat.isDirectory()) {
    console.log(chalk.yellow(`\n  ⚠️  ${L('Bu bir dizin, dosya değil', 'This is a directory, not a file')}: ${resolved.path}\n`));
    process.exit(1);
  }

  const content = fs.readFileSync(resolved.path, 'utf8');
  console.log(chalk.gray(`\n  📄 ${resolved.path}\n`));
  console.log(content);
  if (!content.endsWith('\n')) console.log();
}

function lsPath(uri) {
  const ncPath = normalizeNcPath(uri || 'nc://w');
  if (!ncPath) {
    console.log(chalk.red(L('\n  ❌ Path gerekli\n', '\n  ❌ Path required\n')));
    process.exit(1);
  }

  const resolved = resolveNcPath(ncPath);
  if (!resolved) {
    console.log(chalk.red(`\n  ❌ ${L('Çözümlenemedi', 'Could not resolve')}: ${ncPath}\n`));
    process.exit(1);
  }

  if (!fs.existsSync(resolved.path)) {
    console.log(chalk.red(`\n  ❌ ${L('Dizin bulunamadı', 'Directory not found')}: ${resolved.path}\n`));
    process.exit(1);
  }

  const stat = fs.statSync(resolved.path);
  if (!stat.isDirectory()) {
    console.log(chalk.yellow(`\n  ⚠️  ${L('Bu bir dosya', 'This is a file')}: ${resolved.path}\n`));
    process.exit(1);
  }

  const items = fs.readdirSync(resolved.path);
  console.log(chalk.cyan(`\n  📂 ${resolved.path}\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  for (const item of items) {
    const fullPath = path.join(resolved.path, item);
    const isDir = fs.statSync(fullPath).isDirectory();
    console.log(`  ${isDir ? chalk.blue('📁') : chalk.gray('📄')} ${isDir ? chalk.cyan(item + '/') : chalk.white(item)}`);
  }

  console.log();
}

module.exports = ocPath;
