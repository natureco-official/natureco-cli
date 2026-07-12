import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { CodeIntelligence } from '../../src/utils/code-intelligence.js';

const dirs = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

describe('code intelligence fallback index', () => {
  test('finds symbol definitions and references across files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'natureco-index-'));
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'a.js'), 'function greet(name) { return name; }\nmodule.exports = greet;\n');
    fs.writeFileSync(path.join(root, 'b.js'), 'const greet = require("./a");\ngreet("NatureCo");\n');
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'node_modules', 'ignored.js'), 'function greet() {}');
    const intelligence = new CodeIntelligence(root);
    expect(intelligence.index()).toMatchObject({ files: 2 });
    expect(intelligence.findDefinitions('greet').length).toBeGreaterThanOrEqual(2);
    expect(intelligence.findReferences('greet')).toHaveLength(4);
  });
});
