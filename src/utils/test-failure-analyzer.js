'use strict';

const crypto = require('crypto');

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '').replace(/\d+ms|\d+\.\d+s|\d+/g, '#')).digest('hex').slice(0, 16);
}

function analyzeTestFailure(output, exitCode = 1) {
  const text = String(output || '');
  const findings = [];
  const patterns = [
    { type: 'assertion', re: /(?:AssertionError|expected .* (?:to|but)|FAIL\s+)([^\n]*)/gi },
    { type: 'syntax', re: /(?:SyntaxError|ParseError)[:\s]+([^\n]*)/gi },
    { type: 'type', re: /(?:TypeError|TS\d{4}:)[:\s]*([^\n]*)/gi },
    { type: 'module', re: /(?:Cannot find module|ModuleNotFoundError)[:\s]*([^\n]*)/gi },
    { type: 'timeout', re: /(?:timed out|timeout of \d+ms exceeded|Test timeout)/gi },
  ];
  for (const pattern of patterns) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(text)) && findings.length < 50) {
      findings.push({ type: pattern.type, message: (match[1] || match[0]).trim().slice(0, 500) });
    }
  }
  const locations = [...text.matchAll(/(?:\(|\s)([^\s():]+\.(?:js|ts|tsx|jsx|py|go|rs|java)):(\d+)(?::(\d+))?/g)]
    .slice(0, 50).map(match => ({ file: match[1], line: Number(match[2]), column: match[3] ? Number(match[3]) : null }));
  const summaryMatch = text.match(/(\d+)\s+(?:failed|failing|failures?)/i);
  return {
    ok: exitCode === 0,
    exitCode,
    framework: /vitest/i.test(text) ? 'vitest' : /jest/i.test(text) ? 'jest' : /pytest|FAILED .*\.py/i.test(text) ? 'pytest' : /TS\d{4}/.test(text) ? 'typescript' : 'unknown',
    failedCount: summaryMatch ? Number(summaryMatch[1]) : (exitCode === 0 ? 0 : Math.max(1, findings.length)),
    findings, locations, fingerprint: fingerprint(text), rawTail: text.slice(-6000),
  };
}

class AutoFixLoop {
  constructor(options = {}) { this.maxAttempts = options.maxAttempts || 3; }

  async run({ runTests, proposeFix, onAttempt }) {
    const attempts = [];
    let previousFingerprint = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const startedAt = Date.now();
      const testResult = await runTests({ attempt });
      const analysis = analyzeTestFailure(testResult.output, testResult.exitCode);
      const record = { attempt, analysis, durationMs: Date.now() - startedAt };
      attempts.push(record);
      if (onAttempt) await onAttempt(record);
      if (analysis.ok) return { ok: true, attempts };
      if (analysis.fingerprint === previousFingerprint) {
        return { ok: false, stopped: 'no-progress', attempts, analysis };
      }
      previousFingerprint = analysis.fingerprint;
      const fix = await proposeFix({ attempt, analysis, attempts });
      record.fix = fix || null;
      if (!fix || fix.applied === false) return { ok: false, stopped: 'no-fix', attempts, analysis };
    }
    return { ok: false, stopped: 'max-attempts', attempts, analysis: attempts.at(-1)?.analysis };
  }
}

module.exports = { analyzeTestFailure, AutoFixLoop, fingerprint };
