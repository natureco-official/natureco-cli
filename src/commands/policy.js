const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig, saveConfig } = require('../utils/config');

function policy(args) {
  const [action, ...params] = (args || []);

  if (!action || action === 'check') return checkPolicy();
  if (action === 'set') return setPolicy(params[0], params.slice(1).join(' '));
  if (action === 'list') return listPolicies();
  if (action === 'remove') return removePolicy(params[0]);

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco policy [check|set|list|remove]\n', '  Usage: natureco policy [check|set|list|remove]\n')));
  process.exit(1);
}

const POLICY_CHECKS = [
  {
    id: 'node-version',
    name: L('Node.js Versiyonu', 'Node.js Version'),
    check: () => {
      const v = process.version.slice(1).split('.')[0];
      return parseInt(v) >= 18
        ? { status: 'pass', message: `Node.js ${process.version}` }
        : { status: 'fail', message: `Node.js ${process.version} (18+ ${L('gerekli', 'required')})`, fix: L('Node.js güncelleyin', 'Update Node.js') };
    }
  },
  {
    id: 'config-exists',
    name: L('Config Dosyası', 'Config File'),
    check: () => {
      const configFile = path.join(os.homedir(), '.natureco', 'config.json');
      if (!fs.existsSync(configFile)) {
        return { status: 'fail', message: L('config.json bulunamadı', 'config.json not found'), fix: L('natureco setup çalıştırın', 'run natureco setup') };
      }
      try {
        JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        return { status: 'pass', message: L('Config geçerli JSON', 'Config valid JSON') };
      } catch {
        return { status: 'fail', message: L('Config bozuk JSON', 'Config broken JSON'), fix: L('~/.natureco/config.json düzeltin', 'fix ~/.natureco/config.json') };
      }
    }
  },
  {
    id: 'api-key',
    name: 'API Key',
    check: () => {
      const config = getConfig();
      if (config.providerApiKey || config.apiKey || process.env.GROQ_API_KEY) {
        return { status: 'pass', message: L('API key mevcut', 'API key present') };
      }
      return { status: 'warn', message: L('API key eksik', 'API key missing'), fix: L('natureco login veya GROQ_API_KEY env', 'natureco login or GROQ_API_KEY env') };
    }
  },
  {
    id: 'provider-url',
    name: 'Provider URL',
    check: () => {
      const config = getConfig();
      if (config.providerUrl) {
        return { status: 'pass', message: config.providerUrl };
      }
      return { status: 'warn', message: L('Provider ayarlanmamış', 'Provider not set'), fix: 'natureco setup' };
    }
  },
  {
    id: 'git-config',
    name: L('Git Yapılandırması', 'Git Configuration'),
    check: () => {
      try {
        const { execSync } = require('child_process');
        const name = execSync('git config user.name', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        const email = execSync('git config user.email', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        if (name && email) return { status: 'pass', message: `${name} <${email}>` };
        return { status: 'warn', message: L('Git user.name/email eksik', 'Git user.name/email missing'), fix: L('git config --global user.name "Adınız"', 'git config --global user.name "Your Name"') };
      } catch {
        return { status: 'warn', message: L('Git repo değil', 'Not a git repo'), fix: 'git init' };
      }
    }
  },
  {
    id: 'disk-space',
    name: L('Disk Alanı', 'Disk Space'),
    check: () => {
      try {
        const drive = path.parse(os.homedir()).root.replace(':', '');
        const { execSync } = require('child_process');
        const output = execSync(`powershell -Command "Get-PSDrive -Name ${drive} | Select-Object -ExpandProperty Free"`, { encoding: 'utf-8' }).trim();
        const free = parseInt(output);
        if (isNaN(free)) return { status: 'pass', message: L('Kontrol edilemedi', 'Could not check') };
        const freeGB = free / 1e9;
        if (freeGB < 0.5) return { status: 'fail', message: `${L('Sadece', 'Only')} ${freeGB.toFixed(1)}GB ${L('boş', 'free')}`, fix: L('Disk temizliği yapın', 'Free up disk space') };
        return { status: 'pass', message: `${freeGB.toFixed(1)}GB ${L('boş alan', 'free')}` };
      } catch {
        return { status: 'pass', message: L('Kontrol edilemedi', 'Could not check') };
      }
    }
  }
];

function checkPolicy() {
  console.log(chalk.cyan.bold(L('\n  Workspace Uyumluluk Politikası\n', '\n  Workspace Compliance Policy\n')));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const check of POLICY_CHECKS) {
    const result = check.check();
    if (result.status === 'pass') {
      console.log(`  ${chalk.green('✓')} ${check.name}: ${chalk.white(result.message)}`);
      passed++;
    } else if (result.status === 'fail') {
      console.log(`  ${chalk.red('✗')} ${check.name}: ${chalk.white(result.message)}`);
      console.log(chalk.gray(`    ${L('Düzeltme', 'Fix')}: ${result.fix}`));
      failed++;
    } else {
      console.log(`  ${chalk.yellow('⚠')} ${check.name}: ${chalk.white(result.message)}`);
      if (result.fix) console.log(chalk.gray(`    ${L('Öneri', 'Tip')}: ${result.fix}`));
      warnings++;
    }
  }

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  ${L('Geçti', 'Passed')}: ${passed} | ${L('Uyarı', 'Warnings')}: ${warnings} | ${L('Hata', 'Errors')}: ${failed}\n`));
}

function setPolicy(key, value) {
  if (!key) {
    console.log(chalk.red(L('\n  ❌ Politika adı gerekli\n', '\n  ❌ Policy name required\n')));
    return;
  }
  const config = getConfig();
  if (!config.policies) config.policies = {};
  config.policies[key] = value;
  saveConfig(config);
  console.log(chalk.green(`\n  ✓ ${L('Politika ayarlandı', 'Policy set')}: ${key} = ${value}\n`));
}

function listPolicies() {
  const config = getConfig();
  const policies = config.policies || {};

  if (Object.keys(policies).length === 0) {
    console.log(chalk.gray(L('\n  Tanımlı politika yok.\n', '\n  No policies defined.\n')));
    return;
  }

  console.log(chalk.cyan.bold(L('\n  Tanımlı Politikalar\n', '\n  Defined Policies\n')));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  for (const [key, value] of Object.entries(policies)) {
    console.log(`  ${chalk.white(key)}: ${chalk.cyan(value)}`);
  }
  console.log('');
}

function removePolicy(key) {
  if (!key) {
    console.log(chalk.red(L('\n  ❌ Politika adı gerekli\n', '\n  ❌ Policy name required\n')));
    return;
  }
  const config = getConfig();
  if (config.policies?.[key]) {
    delete config.policies[key];
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ ${L('Politika silindi', 'Policy deleted')}: ${key}\n`));
  } else {
    console.log(chalk.yellow(`\n  ⚠ ${L('Politika bulunamadı', 'Policy not found')}: ${key}\n`));
  }
}

module.exports = policy;
