/**
 * ultra-review — Multi-agent code review
 *
 * Spawns parallel review agents focused on different aspects:
 *   - Security: secret scanning, injection risks
 *   - Style: code conventions, formatting
 *   - Logic: correctness, edge cases
 *   - Performance: optimization opportunities
 *
 * Uses natureco's existing agent system for reviews.
 */

const path = require('path');

const REVIEW_FOCUS = {
  security: {
    name: 'Security Review',
    prompt: 'Review the following code for security issues: secret exposure, injection vulnerabilities, unsafe deserialization, path traversal, command injection. Return issues with severity (high/medium/low) and line references.',
  },
  style: {
    name: 'Style Review',
    prompt: 'Review the following code for style issues: naming conventions, formatting consistency, code organization, documentation quality, adherence to project conventions.',
  },
  logic: {
    name: 'Logic Review',
    prompt: 'Review the following code for logic issues: correctness, edge cases, error handling, race conditions, type safety, off-by-one errors, boundary conditions.',
  },
  performance: {
    name: 'Performance Review',
    prompt: 'Review the following code for performance issues: unnecessary allocations, O(n²) algorithms, memory leaks, blocking operations, caching opportunities, bundle size impact.',
  },
};

function reviewFile(filePath, content) {
  const issues = [];
  for (const [focus, info] of Object.entries(REVIEW_FOCUS)) {
    issues.push({
      focus,
      title: info.name,
      prompt: info.prompt,
      file: filePath,
    });
  }
  return { file: filePath, size: content.length, reviews: issues };
}

function reviewDiff(diffContent) {
  const issues = [];
  for (const [focus, info] of Object.entries(REVIEW_FOCUS)) {
    issues.push({
      focus,
      title: info.name,
      prompt: info.prompt + `\n\nDiff:\n${diffContent.slice(0, 8000)}`,
    });
  }
  return { reviews: issues };
}

module.exports = { reviewFile, reviewDiff, REVIEW_FOCUS };
