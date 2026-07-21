import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import mod from '../../src/tools/memory_tree.js';
import engine from '../../src/utils/urdr-engine.js';

const { ensureTree, append, remove, readRoot, search, buildIndex, buildDigest, treeDir } = mod._internal;
const memoryTreeModule = path.resolve('src/tools/memory_tree.js');
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalEngine = process.env.NATURECO_MEMORY_ENGINE;
let tempHome;

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function runChild(script, args = [], timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome, NATURECO_MEMORY_ENGINE: 'urdr' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`child did not exit within ${timeoutMs}ms; stdout=${stdout}; stderr=${stderr}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`child exited ${code}: ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

const appendScript = `
const mod = require(${JSON.stringify(memoryTreeModule)});
mod._internal.append(process.argv[1], '2-teknik', 'Projeler', process.argv[2])
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => { console.error(error); process.exitCode = 1; });
`;

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-urdr-test-'));
  process.env.HOME = tempHome;
  process.env.USERPROFILE = tempHome;
  delete process.env.NATURECO_MEMORY_ENGINE;
});

afterEach(() => {
  restoreEnv('HOME', originalHome);
  restoreEnv('USERPROFILE', originalUserProfile);
  restoreEnv('NATURECO_MEMORY_ENGINE', originalEngine);
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe('memory_tree Urðr engine integration', () => {
  it('auto-detects the real Urðr engine on Node 22+', async () => {
    const status = await engine.describeEngine();
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22);
    expect(status).toMatchObject({ engine: 'urdr', nodeVersion: process.version });
    expect(status.reason).toMatch(/available/i);
  });

  it('NATURECO_MEMORY_ENGINE=legacy forces the real fallback path', async () => {
    process.env.NATURECO_MEMORY_ENGINE = 'legacy';
    const result = await append('forced-legacy', '1-kisisel', 'Kimlik', 'legacy engine leaf');
    expect(result.engine).toBe('legacy');
    expect(readRoot('forced-legacy', '1-kisisel')).toContain('- legacy engine leaf');
    expect(fs.existsSync(path.join(treeDir('forced-legacy'), '.urdr'))).toBe(false);
  });

  it('writes a predefined branch through Urðr and existing readers ignore ID comments', async () => {
    const user = 'reader-proof';
    ensureTree(user);
    const result = await append(user, '1-kisisel', 'Tercihler', 'prefers concise ocean reports');
    const content = readRoot(user, '1-kisisel');
    const outputs = [search(user, 'ocean reports'), buildIndex(user), buildDigest(user)];

    expect(result.engine).toBe('urdr');
    expect(content).toMatch(/<!-- urdr:id:[^>]+-->\r?\n- prefers concise ocean reports/);
    expect(outputs[0]).toEqual(['1-kisisel/Tercihler: - prefers concise ocean reports']);
    expect(outputs.join('\n')).not.toContain('<!--');
    expect(outputs.join('\n')).toContain('prefers concise ocean reports');
  });

  it('uses legacy append for a brand-new arbitrary branch and creates the section', async () => {
    process.env.NATURECO_MEMORY_ENGINE = 'urdr';
    const user = 'new-branch';
    const result = await append(user, '3-kararlar', 'Never Seen Branch', 'brand new branch leaf');
    const content = readRoot(user, '3-kararlar');

    expect(result.engine).toBe('legacy');
    expect(content).toContain('## Never Seen Branch\n- brand new branch leaf');
    expect(fs.existsSync(path.join(treeDir(user), '.urdr'))).toBe(false);
  });

  it('falls back without losing the write when an available Urðr engine rejects the tree', async () => {
    const user = 'urdr-write-error';
    ensureTree(user);
    const file = path.join(treeDir(user), '2-teknik.md');
    fs.writeFileSync(file, '# Teknik\n\n## Projeler\n<!-- urdr:id:duplicate -->\n- first\n<!-- urdr:id:duplicate -->\n- second\n', 'utf8');

    const result = await append(user, '2-teknik', 'Projeler', 'fallback still saves this leaf');
    expect(result.engine).toBe('legacy');
    expect(result._urdrFallbackReason).toMatch(/duplicate Urðr leaf id/i);
    expect(fs.readFileSync(file, 'utf8')).toContain('- fallback still saves this leaf');
  });

  it('preserves both leaves from concurrent writer processes', async () => {
    const user = 'concurrent-writers';
    ensureTree(user);
    const [first, second] = await Promise.all([
      runChild(appendScript, [user, 'concurrent leaf alpha']),
      runChild(appendScript, [user, 'concurrent leaf beta']),
    ]);
    const content = readRoot(user, '2-teknik');

    expect(JSON.parse(first.stdout).engine).toBe('urdr');
    expect(JSON.parse(second.stdout).engine).toBe('urdr');
    expect(content).toContain('- concurrent leaf alpha');
    expect(content).toContain('- concurrent leaf beta');
    console.log(`CONCURRENCY_PROOF\n${content}`);
  }, 70000);

  it('adopts a pre-existing plain-Markdown tree without loss or duplication', async () => {
    const user = 'legacy-adoption';
    process.env.NATURECO_MEMORY_ENGINE = 'legacy';
    await append(user, '2-teknik', 'Projeler', 'pre-existing legacy alpha');
    await append(user, '2-teknik', 'Projeler', 'pre-existing legacy beta');
    process.env.NATURECO_MEMORY_ENGINE = 'urdr';

    const result = await append(user, '2-teknik', 'Projeler', 'first Urdr leaf');
    const content = readRoot(user, '2-teknik');
    expect(result.engine).toBe('urdr');
    expect((content.match(/pre-existing legacy alpha/g) || [])).toHaveLength(1);
    expect((content.match(/pre-existing legacy beta/g) || [])).toHaveLength(1);
    expect((content.match(/first Urdr leaf/g) || [])).toHaveLength(1);
  });

  it('remove strips the paired ID comment and a later Urðr append reconciles cleanly', async () => {
    const user = 'remove-reconcile';
    process.env.NATURECO_MEMORY_ENGINE = 'urdr';
    await append(user, '3-kararlar', 'Kararlar', 'remove this Urdr leaf');
    const before = readRoot(user, '3-kararlar');
    const idLine = before.match(/<!-- urdr:id:[^>]+-->/)?.[0];
    expect(idLine).toBeTruthy();

    expect(remove(user, '3-kararlar', 'remove this Urdr leaf').removed).toBe(1);
    const removed = readRoot(user, '3-kararlar');
    expect(removed).not.toContain('remove this Urdr leaf');
    expect(removed).not.toContain(idLine);

    const result = await append(user, '3-kararlar', 'Kararlar', 'replacement Urdr leaf');
    const finalContent = readRoot(user, '3-kararlar');
    expect(result.engine).toBe('urdr');
    expect(finalContent).toContain('replacement Urdr leaf');
    expect(finalContent).not.toContain('remove this Urdr leaf');
  });

  it('an Urðr append child exits promptly without orphaned handles', async () => {
    const user = 'clean-exit';
    ensureTree(user);
    const started = Date.now();
    const child = await runChild(appendScript, [user, 'clean exit leaf'], 15000);
    const elapsed = Date.now() - started;

    expect(JSON.parse(child.stdout).engine).toBe('urdr');
    expect(elapsed).toBeLessThan(15000);
    console.log(`HANDLE_EXIT_PROOF elapsedMs=${elapsed}`);
  }, 20000);
});
