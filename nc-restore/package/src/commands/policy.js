const chalk = require('chalk');
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

  console.log(chalk.red(`\n  ❌ Bilinmeyen komut: ${action}\n`));
  console.log(chalk.gray('  Kullanım: natureco policy [check|set|list|remove]\n'));
  process.exit(1);
}

const POLICY_CHECKS = [
  {
    id: 'node-version',
    name: 'Node.js Versiyonu',
    check: () => {
      const v = process.version.slice(1).split('.')[0];
      return parseInt(v) >= 18
        ? { status: 'pass', message: `Node.js ${process.version}` }
        : { status: 'fail', message: `Node.js ${process.version} (18+ gerekli)`, fix: 'Node.js güncelleyin' };
    }
  },
  {
    id: 'config-exists',
    name: 'Config Dosyası',
    check: () => {
      const configFile = path.join(os.homedir(), '.natureco', 'config.json');
      if (!fs.existsSync(configFile)) {
        return { status: 'fail', message: 'config.json bulunamadı', fix: 'natureco setup çalıştırın' };
      }
      try {
        JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        return { status: 'pass', message: 'Config geçerli JSON' };
      } catch {
        return { status: 'fail', message: 'Config bozuk JSON', fix: '~/.natureco/config.json düzeltin' };
      }
    }
  },
  {
    id: 'api-key',
    name: 'API Key',
    check: () => {
      const config = getConfig();
      if (config.providerApiKey || config.apiKey || process.env.GROQ_API_KEY) {
        return { status: 'pass', message: 'API key mevcut' };
      }
      return { status: 'warn', message: 'API key eksik', fix: 'natureco login veya GROQ_API_KEY env' };
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
      return { status: 'warn', message: 'Provider ayarlanmamış', fix: 'natureco setup' };
    }
  },
  {
    id: 'git-config',
    name: 'Git Yapılandırması',
    check: () => {
      try {
        const { execSync } = require('child_process');
        const name = execSync('git config user.name', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        const email = execSync('git config user.email', { encoding: 'utf-8', stdio: 'pipe' }).trim();
        if (name && email) return { status: 'pass', message: `${name} <${email}>` };
        return { status: 'warn', message: 'Git user.name/email eksik', fix: 'git config --global user.name "Adınız"' };
      } catch {
        return { status: 'warn', message: 'Git repo değil', fix: 'git init' };
      }
    }
  },
  {
    id: 'disk-space',
    name: 'Disk Alanı',
    check: () => {
      try {
        const drive = path.parse(os.homedir()).root.replace(':', '');
        const { execSync } = require('child_process');
        const output = execSync(`powershell -Command "Get-PSDrive -Name ${drive} | Select-Object -ExpandProperty Free"`, { encoding: 'utf-8' }).trim();
        const free = parseInt(output);
        if (isNaN(free)) return { status: 'pass', message: 'Kontrol edilemedi' };
        const freeGB = free / 1e9;
        if (freeGB < 0.5) return { status: 'fail', message: `Sadece ${freeGB.toFixed(1)}GB boş`, fix: 'Disk temizliği yapın' };
        return { status: 'pass', message: `${freeGB.toFixed(1)}GB boş alan` };
      } catch {
        return { status: 'pass', message: 'Kontrol edilemedi' };
      }
    }
  }
];

function checkPolicy() {
  console.log(chalk.cyan.bold('\n  Workspace Uyumluluk Politikası\n'));
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
      console.log(chalk.gray(`    Düzeltme: ${result.fix}`));
      failed++;
    } else {
      console.log(`  ${chalk.yellow('⚠')} ${check.name}: ${chalk.white(result.message)}`);
      if (result.fix) console.log(chalk.gray(`    Öneri: ${result.fix}`));
      warnings++;
    }
  }

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  Geçti: ${passed} | Uyarı: ${warnings} | Hata: ${failed}\n`));
}

function setPolicy(key, value) {
  if (!key) {
    console.log(chalk.red('\n  ❌ Politika adı gerekli\n'));
    return;
  }
  const config = getConfig();
  if (!config.policies) config.policies = {};
  config.policies[key] = value;
  saveConfig(config);
  console.log(chalk.green(`\n  ✓ Politika ayarlandı: ${key} = ${value}\n`));
}

function listPolicies() {
  const config = getConfig();
  const policies = config.policies || {};

  if (Object.keys(policies).length === 0) {
    console.log(chalk.gray('\n  Tanımlı politika yok.\n'));
    return;
  }

  console.log(chalk.cyan.bold('\n  Tanımlı Politikalar\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  for (const [key, value] of Object.entries(policies)) {
    console.log(`  ${chalk.white(key)}: ${chalk.cyan(value)}`);
  }
  console.log('');
}

function removePolicy(key) {
  if (!key) {
    console.log(chalk.red('\n  ❌ Politika adı gerekli\n'));
    return;
  }
  const config = getConfig();
  if (config.policies?.[key]) {
    delete config.policies[key];
    saveConfig(config);
    console.log(chalk.green(`\n  ✓ Politika silindi: ${key}\n`));
  } else {
    console.log(chalk.yellow(`\n  ⚠ Politika bulunamadı: ${key}\n`));
  }
}

module.exports = policy;
