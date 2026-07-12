const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { PluginError, handleError } = require('../utils/errors');
const { loadRegistry, saveRegistry, scanInstalled, getPlugin, installPlugin, uninstallPlugin, updatePlugin, searchRegistry, validateManifest, PLUGINS_DIR } = require('../utils/plugin-registry');

async function plugins(args) {
  const [action, ...params] = (args || []);
  const opts = parseFlags(params);

  try {
    if (!action || action === 'list') return listPlugins(opts);
    if (action === 'install') return installHandler(params[0], opts);
    if (action === 'uninstall' || action === 'remove') return uninstallHandler(params[0], opts);
    if (action === 'enable') return toggleHandler(params[0], true);
    if (action === 'disable') return toggleHandler(params[0], false);
    if (action === 'info' || action === 'inspect') return infoHandler(params[0], opts);
    if (action === 'update') return updateHandler(params[0], opts);
    if (action === 'search') return searchHandler(params.join(' '), opts);
    if (action === 'doctor') return doctorHandler();
    if (action === 'registry') return registryHandler(opts);
    if (action === 'marketplace') return marketplaceHandler(opts);

    console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
    console.log(chalk.gray(L('  Kullanım: natureco plugins [list|install|uninstall|enable|disable|info|update|search|doctor|registry|marketplace]\n', '  Usage: natureco plugins [list|install|uninstall|enable|disable|info|update|search|doctor|registry|marketplace]\n')));
    process.exit(1);
  } catch (err) {
    handleError(err);
  }
}

function parseFlags(params) {
  return {
    json: params.includes('--json') || params.includes('-j'),
    verbose: params.includes('--verbose') || params.includes('-v'),
    all: params.includes('--all') || params.includes('-a'),
    enabled: params.includes('--enabled'),
    force: params.includes('--force') || params.includes('-f'),
    keepFiles: params.includes('--keep-files'),
    dryRun: params.includes('--dry-run'),
    limit: extractInt(params, '--limit', 20),
    directory: extractFlag(params, '--directory'),
  };
}

function extractFlag(params, name) {
  const idx = params.indexOf(name);
  return idx >= 0 && idx + 1 < params.length ? params[idx + 1] : null;
}

function extractInt(params, name, def) {
  const v = extractFlag(params, name);
  return v ? parseInt(v, 10) || def : def;
}

function listPlugins(opts) {
  const allPlugins = scanInstalled();
  const registry = loadRegistry();
  const filtered = opts.enabled ? allPlugins.filter(p => p.enabled) : allPlugins;

  if (opts.json) {
    console.log(JSON.stringify({
      plugins: filtered.map(p => ({
        slug: p.slug, name: p.name, version: p.version, enabled: p.enabled,
        source: registry.plugins.find(r => r.id === p.slug)?.source || 'unknown',
        description: p.description, author: p.author, license: p.license,
        installPath: p.installPath,
      })),
      total: filtered.length,
      registry: { total: registry.plugins.length, updatedAt: registry.updatedAt },
    }, null, 2));
    return;
  }

  console.log('');
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold('\n  Plugins\n'));

  if (filtered.length === 0) {
    console.log(chalk.gray(L('  Yüklü plugin yok.\n', '  No plugins installed.\n')));
    console.log(chalk.gray(L('  Yüklemek için: ', '  To install: ')) + chalk.cyan('natureco plugins install <paket-adı|./path|git:url>'));
    console.log(chalk.gray(L('  Aramak için: ', '  To search: ')) + chalk.cyan('natureco plugins search <query>\n'));
    return;
  }

  filtered.forEach(p => {
    const status = p.enabled ? chalk.green(L('✓ aktif', '✓ active')) : chalk.gray(L('○ pasif', '○ inactive'));
    const source = registry.plugins.find(r => r.id === p.slug)?.source || 'local';
    const sourceIcon = source === 'npm' ? '📦' : source === 'git' ? '🌐' : source === 'local' ? '📁' : '❓';
    console.log(`  ${sourceIcon} ${chalk.white(p.name)} ${chalk.gray(`v${p.version}`)}  ${status}`);
    if (p.description) console.log(chalk.gray(`    ${p.description}`));
    if (opts.verbose) {
      console.log(chalk.gray(`    ${L('Kaynak', 'Source')}: ${source} | ${L('Yol', 'Path')}: ${p.installPath}`));
      if (p.author) console.log(chalk.gray(`    ${L('Yazar', 'Author')}: ${p.author}`));
    }
    console.log('');
  });

  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray(`  ${L('Toplam', 'Total')}: ${filtered.length} plugin (${allPlugins.length - filtered.length} ${L('pasif', 'inactive')})`));
  console.log(chalk.gray(L('  Detay: ', '  Details: ')) + chalk.cyan('natureco plugins list --verbose'));
  console.log(chalk.gray('  JSON:  ') + chalk.cyan('natureco plugins list --json\n'));
}

async function installHandler(spec, opts) {
  if (!spec) {
    console.log(chalk.red(L('\n  ❌ Paket adı gerekli\n', '\n  ❌ Package name required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco plugins install <paket-adı|./path|git:url|clawhub:<id>>\n', '  Usage: natureco plugins install <package-name|./path|git:url|clawhub:<id>>\n')));
    console.log(chalk.gray(L('  Örnekler:', '  Examples:')));
    console.log(chalk.gray('    natureco plugins install my-plugin'));
    console.log(chalk.gray('    natureco plugins install npm:my-plugin'));
    console.log(chalk.gray(L('    natureco plugins install ./yerel-klasor', '    natureco plugins install ./local-folder')));
    console.log(chalk.gray('    natureco plugins install git:github.com/user/repo'));
    console.log(chalk.gray('    natureco plugins install clawhub:plugin-id\n'));
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(chalk.gray(`\n  📋 ${L('Kuru çalışma', 'Dry run')}: "${spec}" ${L('yüklenecek', 'will be installed')}\n`));
    return;
  }

  console.log(chalk.gray(`\n  "${spec}" ${L('yükleniyor...', 'installing...')}\n`));

  try {
    const result = await installPlugin(spec);
    console.log(chalk.green(`  ✓ ${L('Plugin yüklendi', 'Plugin installed')}: ${result.name} v${result.version}\n`));
    console.log(chalk.gray(`  ${L('Kaynak', 'Source')}: ${result.source}`));
    console.log(chalk.gray(`  Slug: ${result.slug}\n`));
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L('Yükleme başarısız', 'Installation failed')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function uninstallHandler(slug, opts) {
  if (!slug) {
    console.log(chalk.red(L('\n  ❌ Plugin adı gerekli\n', '\n  ❌ Plugin name required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco plugins uninstall <slug>\n', '  Usage: natureco plugins uninstall <slug>\n')));
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(chalk.gray(`\n  📋 ${L('Kuru çalışma', 'Dry run')}: "${slug}" ${L('kaldırılacak', 'will be removed')}\n`));
    return;
  }

  try {
    const result = await uninstallPlugin(slug, { keepFiles: opts.keepFiles });
    console.log(chalk.green(`\n  ✓ ${L('Plugin kaldırıldı', 'Plugin removed')}: ${result.name}\n`));
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L('Kaldırma başarısız', 'Removal failed')}: ${err.message}\n`));
    process.exit(1);
  }
}

function toggleHandler(slug, enable) {
  if (!slug) {
    console.log(chalk.red(L('\n  ❌ Plugin adı gerekli\n', '\n  ❌ Plugin name required\n')));
    process.exit(1);
  }
  const pluginDir = path.join(PLUGINS_DIR, slug);
  if (!fs.existsSync(pluginDir)) {
    console.log(chalk.red(`\n  ❌ ${L('Plugin bulunamadı', 'Plugin not found')}: ${slug}\n`));
    process.exit(1);
  }
  const disabledFile = path.join(pluginDir, '.disabled');
  if (enable) {
    if (fs.existsSync(disabledFile)) fs.unlinkSync(disabledFile);
    console.log(chalk.green(`\n  ✓ ${L('Plugin aktif', 'Plugin enabled')}: ${slug}\n`));
  } else {
    fs.writeFileSync(disabledFile, '');
    console.log(chalk.gray(`\n  ○ ${L('Plugin pasif', 'Plugin disabled')}: ${slug}\n`));
  }
}

function infoHandler(slug, opts) {
  if (!slug && !opts.all) {
    console.log(chalk.red(L('\n  ❌ Plugin adı gerekli\n', '\n  ❌ Plugin name required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco plugins info <slug>\n', '  Usage: natureco plugins info <slug>\n')));
    process.exit(1);
  }

  if (opts.all) {
    const all = scanInstalled();
    console.log(chalk.cyan.bold(L('\n  Plugin Detayları\n', '\n  Plugin Details\n')));
    all.forEach(p => {
      showPluginDetail(p);
    });
    return;
  }

  const p = getPlugin(slug);
  if (!p) {
    console.log(chalk.red(`\n  ❌ ${L('Plugin bulunamadı', 'Plugin not found')}: ${slug}\n`));
    process.exit(1);
  }

  if (opts.json) {
    console.log(JSON.stringify({
      slug: p.slug, name: p.name, version: p.version, enabled: p.enabled,
      description: p.description, author: p.author, license: p.license,
      keywords: p.keywords || [], installPath: p.installPath,
      entry: p.entry, dependencies: p.dependencies || {},
      openclaw: p.openclaw || {},
    }, null, 2));
    return;
  }

  showPluginDetail(p);
}

function showPluginDetail(p) {
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.cyan.bold(`\n  ${p.name}\n`));
  console.log(chalk.gray('  Slug      : ') + chalk.white(p.slug));
  console.log(chalk.gray(L('  Versiyon  : ', '  Version   : ')) + chalk.white(p.version));
  console.log(chalk.gray(L('  Durum     : ', '  Status    : ')) + (p.enabled ? chalk.green(L('aktif', 'active')) : chalk.gray(L('pasif', 'inactive'))));
  if (p.description) console.log(chalk.gray(L('  Açıklama  : ', '  Description: ')) + chalk.white(p.description));
  if (p.author) console.log(chalk.gray(L('  Yazar     : ', '  Author    : ')) + chalk.white(p.author));
  if (p.license) console.log(chalk.gray(L('  Lisans    : ', '  License   : ')) + chalk.white(p.license));
  if (p.keywords?.length) console.log(chalk.gray(L('  Etiketler : ', '  Tags      : ')) + chalk.white(p.keywords.join(', ')));
  console.log(chalk.gray(L('  Yol       : ', '  Path      : ')) + chalk.gray(p.installPath));
  if (p.entry) console.log(chalk.gray(L('  Giriş     : ', '  Entry     : ')) + chalk.white(p.entry));
  if (p.dependencies && Object.keys(p.dependencies).length > 0) {
    console.log(chalk.gray(L('  Bağımlılıklar:', '  Dependencies:')));
    Object.entries(p.dependencies).forEach(([k, v]) => {
      const depPath = path.join(p.installPath, 'node_modules', k);
      const installed = fs.existsSync(depPath) ? chalk.green('✓') : chalk.yellow('✗');
      console.log(chalk.gray(`    ${installed} ${k}: ${v}`));
    });
  }
  if (p.openclaw?.tool) {
    console.log(chalk.gray('  OpenClaw Tool Plugin: ') + chalk.white(p.openclaw.tool));
  }
  console.log('');
}

async function updateHandler(slug, opts) {
  if (!slug && !opts.all) {
    console.log(chalk.red(L('\n  ❌ Plugin adı gerekli\n', '\n  ❌ Plugin name required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco plugins update <slug>', '  Usage: natureco plugins update <slug>')));
    console.log(chalk.gray(L('  Tümü: natureco plugins update --all\n', '  All: natureco plugins update --all\n')));
    process.exit(1);
  }

  if (opts.all) {
    const all = scanInstalled();
    console.log(chalk.cyan(L('\n  Tüm pluginler güncelleniyor...\n', '\n  Updating all plugins...\n')));
    for (const p of all) {
      try {
        const result = await updatePlugin(p.slug);
        console.log(chalk.green(`  ✓ ${p.name}: ${p.version} → ${result.version}\n`));
      } catch (err) {
        console.log(chalk.yellow(`  ⚠ ${p.name}: ${err.message}\n`));
      }
    }
    return;
  }

  if (opts.dryRun) {
    console.log(chalk.gray(`\n  📋 ${L('Kuru çalışma', 'Dry run')}: "${slug}" ${L('güncellenecek', 'will be updated')}\n`));
    return;
  }

  try {
    const result = await updatePlugin(slug);
    console.log(chalk.green(`\n  ✓ ${L('Plugin güncellendi', 'Plugin updated')}: ${result.name} → v${result.version}\n`));
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L('Güncelleme başarısız', 'Update failed')}: ${err.message}\n`));
    process.exit(1);
  }
}

async function searchHandler(query, opts) {
  if (!query) {
    console.log(chalk.red(L('\n  ❌ Arama sorgusu gerekli\n', '\n  ❌ Search query required\n')));
    console.log(chalk.gray(L('  Kullanım: natureco plugins search <query>\n', '  Usage: natureco plugins search <query>\n')));
    process.exit(1);
  }

  console.log(chalk.gray(`\n  "${query}" ${L('aranıyor...', 'searching...')}\n`));

  const results = [];

  // Yerel kayıt defterinde ara
  const local = searchRegistry(query);
  local.forEach(p => results.push({ ...p, source: 'registry' }));

  // NatureHub'da ara
  try {
    const res = await fetch(`https://natureco.me/api/plugins/search?q=${encodeURIComponent(query)}&limit=${opts.limit}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      (data.plugins || data.results || []).forEach(p => {
        if (!results.some(r => r.id === p.id || r.id === p.name)) {
          results.push({ id: p.id || p.name, name: p.name || p.id, version: p.version || 'latest', description: p.description || '', source: 'naturehub' });
        }
      });
    }
  } catch {}

  // ClawHub'da ara
  try {
    const res = await fetch(`https://clawhub.ai/api/plugins?q=${encodeURIComponent(query)}&limit=${opts.limit}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      (data.plugins || data.results || []).forEach(p => {
        if (!results.some(r => r.id === p.id || r.id === p.name)) {
          results.push({ id: p.id || p.name, name: p.name || p.id, version: p.version || 'latest', description: p.description || '', source: 'clawhub' });
        }
      });
    }
  } catch {}

  if (opts.json) {
    console.log(JSON.stringify({ query, results, total: results.length }, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(chalk.yellow(`  "${query}" ${L('için sonuç bulunamadı.', '— no results found.')}\n`));
    return;
  }

  console.log(chalk.cyan(`  ${results.length} ${L('sonuç', 'results')}\n`));
  results.slice(0, opts.limit).forEach(p => {
    const sourceIcon = p.source === 'clawhub' ? '🦞' : p.source === 'naturehub' ? '🌿' : '📋';
    console.log(`  ${sourceIcon} ${chalk.white(p.name)} ${chalk.gray(`v${p.version}`)}`);
    if (p.description) console.log(chalk.gray(`    ${p.description.slice(0, 80)}`));
    const installHint = p.source === 'clawhub' ? `clawhub:${p.id}` : p.source === 'naturehub' ? p.id : p.id;
    console.log(chalk.gray(`    ${L('Yüklemek', 'Install')}: natureco plugins install ${installHint}\n`));
  });
}

function doctorHandler() {
  const list = scanInstalled();
  const registry = loadRegistry();

  console.log(chalk.cyan.bold(L('\n  Plugin Tanılama\n', '\n  Plugin Diagnostics\n')));

  if (list.length === 0 && registry.plugins.length === 0) {
    console.log(chalk.gray(L('  Yüklü plugin yok.\n', '  No plugins installed.\n')));
    return;
  }

  let issues = 0;

  list.forEach(p => {
    const hasEntry = fs.existsSync(path.join(p.installPath, p.entry || 'index.js'));
    const hasPackage = fs.existsSync(path.join(p.installPath, 'package.json'));
    const manifestErrors = validateManifest(p);

    if (!hasPackage) {
      console.log(chalk.yellow(`  ⚠ ${p.name}: package.json ${L('eksik', 'missing')}`));
      issues++;
    }
    if (!hasEntry) {
      console.log(chalk.yellow(`  ⚠ ${p.name}: ${p.entry || 'index.js'} ${L('bulunamadı', 'not found')}`));
      issues++;
    }
    if (manifestErrors.length > 0) {
      console.log(chalk.yellow(`  ⚠ ${p.name}: ${manifestErrors.join(', ')}`));
      issues++;
    }

    if (hasPackage && hasEntry && manifestErrors.length === 0) {
      console.log(`  ${chalk.green('✓')} ${p.name} v${p.version} — ${L('sağlıklı', 'healthy')}`);
    }
  });

  registry.plugins.forEach(r => {
    if (!list.some(p => p.slug === r.id)) {
      console.log(chalk.yellow(`  ⚠ ${L('Kayıtlı ama diskte yok', 'Registered but not on disk')}: ${r.id} (${L('kayıttan temizlenecek', 'will be pruned from registry')})`));
      issues++;
    }
  });

  if (issues === 0 && list.length > 0) {
    console.log(chalk.green(L('  ✓ Tüm pluginler sağlıklı.\n', '  ✓ All plugins healthy.\n')));
  } else if (issues > 0) {
    console.log(chalk.yellow(`\n  ⚠ ${issues} ${L('sorun bulundu.', 'issue(s) found.')}\n`));
  }
  console.log('');
}

function registryHandler(opts) {
  const registry = loadRegistry();

  if (opts.json) {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log(chalk.cyan.bold(L('\n  Plugin Kayıt Defteri\n', '\n  Plugin Registry\n')));
  console.log(chalk.gray(L('  Versiyon : ', '  Version  : ')) + chalk.white(`v${registry.version}`));
  console.log(chalk.gray(L('  Güncelleme: ', '  Updated   : ')) + chalk.white(registry.updatedAt || L('hiç', 'never')));
  console.log(chalk.gray(L('  Kayıtlı  : ', '  Registered: ')) + chalk.white(`${registry.plugins.length} plugin`));

  if (registry.plugins.length > 0) {
    console.log(chalk.cyan(L('\n  Kayıtlı Pluginler\n', '\n  Registered Plugins\n')));
    registry.plugins.forEach(p => {
      const installed = scanInstalled().some(s => s.slug === p.id) ? chalk.green('✓') : chalk.yellow('✗');
      console.log(`  ${installed} ${chalk.white(p.name || p.id)} ${chalk.gray(`v${p.version} [${p.source}]`)}`);
    });
  }
  console.log('');
}

async function marketplaceHandler(opts) {
  console.log(chalk.cyan.bold('\n  Plugin Marketplace\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('\n  Fetching available plugins...\n'));
  
  try {
    const res = await fetch('https://natureco.me/api/plugins?limit=' + (opts.limit || 20), {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const plugins = data.plugins || data.results || [];
      if (plugins.length === 0) {
        console.log(chalk.yellow('  No plugins available in marketplace.\n'));
        return;
      }
      console.log(chalk.white('  Available Plugins (' + plugins.length + ')\n'));
      for (const p of plugins.slice(0, opts.limit || 20)) {
        console.log(chalk.cyan('  ' + (p.name || p.id)));
        if (p.description) console.log(chalk.gray('    ' + p.description.slice(0, 80)));
        console.log(chalk.gray('    Install: natureco plugins install ' + (p.id || p.name)));
        console.log('');
      }
    } else {
      console.log(chalk.yellow('  Marketplace unavailable (HTTP ' + res.status + ')\n'));
      console.log(chalk.gray('  Try: natureco plugins search <query>\n'));
    }
  } catch (err) {
    console.log(chalk.yellow('  Marketplace unavailable: ' + err.message + '\n'));
    console.log(chalk.gray('  Try: natureco plugins search <query>\n'));
  }
}

module.exports = plugins;
