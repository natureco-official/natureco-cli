'use strict';

const fs = require('fs');
const path = require('path');

const CODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']);
const DEFINITION_PATTERNS = [
  /\b(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  /^\s*def\s+([A-Za-z_]\w*)/gm,
  /^\s*(?:func|type)\s+([A-Za-z_]\w*)/gm,
];

function walkCodeFiles(root, limit = 5000) {
  const files = [];
  const ignored = new Set(['node_modules', '.git', '.natureco', 'dist', 'build', 'coverage']);
  function walk(dir) {
    if (files.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
    }
  }
  walk(path.resolve(root));
  return files;
}

class CodeIntelligence {
  constructor(root = process.cwd()) { this.root = path.resolve(root); this.files = []; this.definitions = new Map(); }

  index() {
    this.files = walkCodeFiles(this.root);
    this.definitions.clear();
    for (const file of this.files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const pattern of DEFINITION_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text))) {
          const line = text.slice(0, match.index).split('\n').length;
          const item = { symbol: match[1], file, line };
          if (!this.definitions.has(match[1])) this.definitions.set(match[1], []);
          this.definitions.get(match[1]).push(item);
        }
      }
    }
    return { files: this.files.length, symbols: this.definitions.size };
  }

  findDefinitions(symbol) { return this.definitions.get(symbol) || []; }

  findReferences(symbol, limit = 200) {
    if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) return [];
    const regex = new RegExp(`\\b${symbol.replace(/[$]/g, '\\$&')}\\b`, 'g');
    const results = [];
    for (const file of this.files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, index) => {
        regex.lastIndex = 0;
        if (regex.test(text)) results.push({ symbol, file, line: index + 1, text: text.trim().slice(0, 240) });
      });
      if (results.length >= limit) break;
    }
    return results.slice(0, limit);
  }
}

module.exports = { CodeIntelligence, walkCodeFiles };
