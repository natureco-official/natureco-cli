const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { PluginError, handleError } = require('./errors');

const PLUGINS_DIR = path.join(os.homedir(), '.natureco', 'plugins');
const REGISTRY_FILE = path.join(os.homedir(), '.natureco', 'plugin-registry.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_FILE)) return { version: 1, plugins: [], updatedAt: null };
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return { version: 1, plugins: [], updatedAt: null };
  }
}

function saveRegistry(registry) {
  ensureDir(path.dirname(REGISTRY_FILE));
  registry.updatedAt = new Date().toISOString();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

function scanInstalled() {
  ensureDir(PLUGINS_DIR);
  return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const manifestFile = path.join(PLUGINS_DIR, d.name, 'plugin.json');
      const pkgFile = path.join(PLUGINS_DIR, d.name, 'package.json');
      const manifest = readManifest(manifestFile, pkgFile, d.name);
      const disabledFile = path.join(PLUGINS_DIR, d.name, '.disabled');
      return { ...manifest, slug: d.name, enabled: !fs.existsSync(disabledFile), installPath: path.join(PLUGINS_DIR, d.name) };
    });
}

function readManifest(manifestFile, pkgFile, fallbackName) {
  let meta = { name: fallbackName, description: '', version: '1.0.0', author: '', license: 'MIT', keywords: [], entry: 'index.js' };
  if (fs.existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf-8'));
      meta = { ...meta, name: pkg.name || meta.name, description: pkg.description || meta.description, version: pkg.version || meta.version, author: pkg.author || meta.author, license: pkg.license || meta.license, keywords: pkg.keywords || meta.keywords, entry: pkg.main || meta.entry, dependencies: pkg.dependencies, openclaw: pkg.openclaw };
    } catch {}
  }
  if (fs.existsSync(manifestFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
      meta = { ...meta, ...m };
    } catch {}
  }
  return meta;
}

function validateManifest(manifest) {
  const errors = [];
  if (!manifest.name) errors.push('Plugin adı (name) gerekli');
  if (!manifest.entry && !manifest.openclaw?.tool) errors.push('Entry noktası (entry/index.js) gerekli');
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) errors.push('Version semver formatında olmalı (x.y.z)');
  return errors;
}

function getInstalledIds() {
  const registry = loadRegistry();
  const installed = new Set(registry.plugins.map(p => p.id));
  scanInstalled().forEach(p => installed.add(p.slug));
  return [...installed];
}

function getPlugin(slug) {
  return scanInstalled().find(p => p.slug === slug) || null;
}

async function installPlugin(spec) {
  ensureDir(PLUGINS_DIR);

  if (spec.startsWith('./') || spec.startsWith('/') || spec.startsWith('.\\') || spec.includes(':\\') || spec.startsWith('\\\\')) {
    return installLocal(spec);
  }
  if (spec.startsWith('clawhub:') || spec.startsWith('naturehub:')) {
    return installFromHub(spec);
  }
  if (spec.startsWith('npm:')) {
    return installFromNpm(spec.slice(4));
  }
  if (spec.startsWith('git:')) {
    return installFromGit(spec.slice(4));
  }
  if (spec.includes('/') && !spec.startsWith('@')) {
    return installFromNpm(spec);
  }
  return installFromNpm(spec);
}

function installLocal(spec) {
  const src = path.resolve(spec);
  if (!fs.existsSync(src)) throw new PluginError(`Yol bulunamadı: ${src}`, 'install', spec);
  const slug = path.basename(src);
  const dest = path.join(PLUGINS_DIR, slug);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(src, dest, { recursive: true });
  const manifest = readManifest(path.join(dest, 'plugin.json'), path.join(dest, 'package.json'), slug);
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new PluginError(`Geçersiz manifest: ${errors.join(', ')}`, 'install', spec);
  }
  const registry = loadRegistry();
  registry.plugins = registry.plugins.filter(p => p.id !== slug);
  registry.plugins.push({ id: slug, name: manifest.name, version: manifest.version, source: 'local', spec, installedAt: new Date().toISOString() });
  saveRegistry(registry);
  return { slug, name: manifest.name, version: manifest.version, source: 'local' };
}

function installFromNpm(pkg) {
  const tmpDir = path.join(os.tmpdir(), `nc-plugin-${Date.now()}`);
  ensureDir(tmpDir);
  try {
    execSync(`npm install ${pkg} --prefix "${tmpDir}" --no-save --ignore-scripts --no-audit --no-fund`, { stdio: 'pipe', timeout: 120000 });
    const pkgDir = path.join(tmpDir, 'node_modules', pkg.split('/').pop());
    const scopedPkgDir = pkg.startsWith('@') ? path.join(tmpDir, 'node_modules', pkg) : null;
    const srcDir = scopedPkgDir && fs.existsSync(scopedPkgDir) ? scopedPkgDir : (fs.existsSync(pkgDir) ? pkgDir : null);
    if (!srcDir) throw new PluginError(`Paket bulunamadı: ${pkg}`, 'install', pkg);
    const pkgJson = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf-8'));
    const slug = pkgJson.name?.replace(/@/g, '').replace(/\//g, '-') || pkg.replace(/[@\/]/g, '-').replace(/^-/, '');
    const dest = path.join(PLUGINS_DIR, slug);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(srcDir, dest, { recursive: true });
    const manifest = readManifest(path.join(dest, 'plugin.json'), path.join(dest, 'package.json'), slug);
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw new PluginError(`Geçersiz manifest: ${errors.join(', ')}`, 'install', pkg);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const registry = loadRegistry();
    registry.plugins = registry.plugins.filter(p => p.id !== slug);
    registry.plugins.push({ id: slug, name: manifest.name, version: manifest.version, source: 'npm', spec: pkg, installedAt: new Date().toISOString() });
    saveRegistry(registry);
    return { slug, name: manifest.name, version: manifest.version, source: 'npm' };
  } catch (err) {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function installFromGit(spec) {
  const repoUrl = spec.startsWith('github.com/') ? `https://${spec}` : spec.startsWith('http') ? spec : spec.includes('/') ? `https://github.com/${spec}` : spec;
  const tmpDir = path.join(os.tmpdir(), `nc-plugin-git-${Date.now()}`);
  ensureDir(tmpDir);
  try {
    execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}"`, { stdio: 'pipe', timeout: 60000 });
    const slug = spec.split('/').pop().replace(/\.git$/, '');
    const dest = path.join(PLUGINS_DIR, slug);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    const items = fs.readdirSync(tmpDir);
    const subDir = items.length === 1 && fs.statSync(path.join(tmpDir, items[0])).isDirectory() ? path.join(tmpDir, items[0]) : tmpDir;
    fs.cpSync(subDir, dest, { recursive: true });
    const manifest = readManifest(path.join(dest, 'plugin.json'), path.join(dest, 'package.json'), slug);
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      fs.rmSync(dest, { recursive: true, force: true });
      throw new PluginError(`Geçersiz manifest: ${errors.join(', ')}`, 'install', spec);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const registry = loadRegistry();
    registry.plugins = registry.plugins.filter(p => p.id !== slug);
    registry.plugins.push({ id: slug, name: manifest.name, version: manifest.version, source: 'git', spec: repoUrl, installedAt: new Date().toISOString() });
    saveRegistry(registry);
    return { slug, name: manifest.name, version: manifest.version, source: 'git' };
  } catch (err) {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function installFromHub(spec) {
  const pkg = spec.replace(/^(clawhub|naturehub):\/?/, '');
  return installFromNpm(pkg);
}

async function uninstallPlugin(slug, options = {}) {
  const plugin = getPlugin(slug);
  if (!plugin) throw new PluginError(`Plugin bulunamadı: ${slug}`, 'uninstall', slug);
  if (!options.keepFiles) {
    fs.rmSync(plugin.installPath, { recursive: true, force: true });
  }
  const registry = loadRegistry();
  registry.plugins = registry.plugins.filter(p => p.id !== slug);
  saveRegistry(registry);
  return { slug, name: plugin.name };
}

async function updatePlugin(slug) {
  const plugin = getPlugin(slug);
  if (!plugin) throw new PluginError(`Plugin bulunamadı: ${slug}`, 'update', slug);
  const registry = loadRegistry();
  const record = registry.plugins.find(p => p.id === slug);
  if (!record || !record.spec) throw new PluginError(`Plugin kaydı bulunamadı veya spec eksik: ${slug}`, 'update', slug);
  if (record.source === 'npm') {
    fs.rmSync(plugin.installPath, { recursive: true, force: true });
    return installFromNpm(record.spec);
  }
  if (record.source === 'git' && record.spec) {
    fs.rmSync(plugin.installPath, { recursive: true, force: true });
    return installFromGit(record.spec);
  }
  throw new PluginError(`${record.source} kaynağından güncelleme desteklenmiyor`, 'update', slug);
}

function searchRegistry(query) {
  const registry = loadRegistry();
  const q = query.toLowerCase();
  return registry.plugins.filter(p =>
    p.id.toLowerCase().includes(q) ||
    (p.name || '').toLowerCase().includes(q)
  );
}

module.exports = {
  PLUGINS_DIR,
  loadRegistry,
  saveRegistry,
  scanInstalled,
  getPlugin,
  getInstalledIds,
  installPlugin,
  uninstallPlugin,
  updatePlugin,
  searchRegistry,
  validateManifest,
};
