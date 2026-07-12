'use strict';

function standardToolResult(value, metrics = {}) {
  if (value && typeof value === 'object' && typeof value.ok === 'boolean' && 'data' in value) return value;
  const failed = value && typeof value === 'object' && (value.success === false || value.error);
  const error = failed ? String(value.error || 'Tool execution failed') : null;
  return {
    ok: !failed,
    data: failed ? null : value,
    error,
    warnings: Array.isArray(value?.warnings) ? value.warnings : [],
    artifacts: Array.isArray(value?.artifacts) ? value.artifacts : [],
    metrics: { ...metrics, ...(value?.metrics || {}) },
  };
}

module.exports = { standardToolResult };
