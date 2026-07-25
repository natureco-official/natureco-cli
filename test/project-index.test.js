import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requireCjs = createRequire(import.meta.url);
const {
  indexProject,
  buildIndexPrompt,
  detectTestCommand,
  loadProjectMemory,
  appendProjectMemory,
} = requireCjs('../src/utils/project-index.js');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-index-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel, content) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

describe('indexProject', () => {
  it('detects a node project with its scripts, deps and entry point', () => {
    write('package.json', JSON.stringify({
      name: 'demo', version: '1.2.3',
      scripts: { test: 'vitest run', build: 'tsc' },
      dependencies: { express: '^4' },
    }));
    write('src/index.js', 'console.log(1)');

    const index = indexProject(dir);
    expect(index.type).toBe('node-server');
    expect(index.packageJson.name).toBe('demo');
    expect(Object.keys(index.packageJson.scripts)).toContain('build');
    expect(index.mainFiles).toContain('src/index.js');
  });

  it('recognizes non-node ecosystems', () => {
    write('Cargo.toml', '[package]\nname="x"');
    expect(indexProject(dir).type).toBe('rust');
  });

  it('skips heavy directories so indexing stays cheap', () => {
    write('node_modules/left-pad/index.js', 'x');
    write('dist/bundle.js', 'x');
    write('app.js', 'x');
    const files = indexProject(dir).files;
    expect(files).toContain('app.js');
    expect(files.some(f => f.startsWith('node_modules/'))).toBe(false);
    expect(files.some(f => f.startsWith('dist/'))).toBe(false);
  });

  it('survives a malformed package.json instead of throwing', () => {
    write('package.json', '{ this is not json');
    write('main.py', 'print(1)');
    expect(indexProject(dir).type).toBe('python');
  });
});

describe('detectTestCommand', () => {
  it('prefers an explicit npm test script', () => {
    expect(detectTestCommand({ type: 'node', packageJson: { scripts: { test: 'vitest' } }, files: [] })).toBe('npm test');
  });

  it('falls back to the ecosystem default', () => {
    expect(detectTestCommand({ type: 'rust', files: [] })).toBe('cargo test');
    expect(detectTestCommand({ type: 'go', files: [] })).toBe('go test ./...');
  });

  it('returns null rather than guessing when the project type is unknown', () => {
    expect(detectTestCommand({ type: 'unknown', files: [] })).toBeNull();
  });
});

describe('buildIndexPrompt', () => {
  it('includes the facts an agent would otherwise spend tool calls discovering', () => {
    write('package.json', JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'vitest' } }));
    write('index.js', '');
    const prompt = buildIndexPrompt(indexProject(dir));
    expect(prompt).toContain('Type: NODE');
    expect(prompt).toContain('Scripts: test');
    expect(prompt).toContain('index.js');
  });
});

describe('project memory', () => {
  it('returns null before anything is written, then round-trips appended entries', () => {
    expect(loadProjectMemory(dir)).toBeNull();
    appendProjectMemory(dir, '- did a thing');
    appendProjectMemory(dir, '- did another thing');
    const memory = loadProjectMemory(dir);
    expect(memory).toContain('- did a thing');
    expect(memory).toContain('- did another thing');
  });
});
