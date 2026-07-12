'use strict';

const { assessToolPath } = require('./tool-path-policy');
const { validateJsonSchema } = require('./json-schema');
const { standardToolResult } = require('./tool-result');

// Transport-agnostic pipeline: resolve -> availability -> policy -> execute -> post-process.
async function executeThroughGateway(options) {
  const {
    toolName, args = {}, resolveTool, checkAvailability, policyChecks = [],
    execute, postProcess, allowSensitivePaths = false, standardResult = false,
    normalizeSuccess = result => ({ result }),
    normalizeError = error => ({ error }),
  } = options || {};

  if (!toolName || typeof resolveTool !== 'function') {
    return normalizeError('Geçersiz araç çalıştırma isteği');
  }

  let tool;
  try { tool = await resolveTool(toolName); }
  catch (error) { return normalizeError(error?.message || String(error)); }

  if (!tool) return normalizeError(`Tool bulunamadı: ${toolName}`);
  const executor = execute || tool.execute;
  if (typeof executor !== 'function') return normalizeError(`Tool execute fonksiyonu yok: ${toolName}`);

  try {
    const schema = tool.inputSchema || tool.parameters || tool.schema?.parameters;
    const validation = validateJsonSchema(schema, args);
    if (!validation.valid) return normalizeError(`Geçersiz araç argümanları: ${validation.errors.join('; ')}`);
    if (!allowSensitivePaths) {
      const pathDecision = assessToolPath(toolName, args);
      if (!pathDecision.allowed) return normalizeError(pathDecision.reason);
    }
    if (checkAvailability) {
      const decision = await checkAvailability({ toolName, args, tool });
      if (decision === false) return normalizeError(`${toolName} şu anda kullanılamıyor`);
      if (decision?.allowed === false) return normalizeError(decision.reason || `${toolName} şu anda kullanılamıyor`);
    }
    for (const check of policyChecks) {
      if (typeof check !== 'function') continue;
      const decision = await check({ toolName, args, tool });
      if (decision === false) return normalizeError('Araç çalıştırma politikası engelledi');
      if (decision?.allowed === false) return normalizeError(decision.reason || 'Araç çalıştırma politikası engelledi');
    }
    let result = await executor.call(tool, args);
    if (postProcess) result = await postProcess({ toolName, args, tool, result });
    if (standardResult) return standardToolResult(result, { tool: toolName });
    return normalizeSuccess(result);
  } catch (error) {
    return normalizeError(error?.message || String(error));
  }
}

module.exports = { executeThroughGateway };
