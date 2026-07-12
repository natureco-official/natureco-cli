'use strict';

const { ToolGuardrails } = require('./tool-guardrails');
const { standardToolResult } = require('./tool-result');

class AgentCore {
  constructor(options = {}) {
    this.guardrails = options.guardrails || new ToolGuardrails({ hardStopEnabled: true });
    this.maxIterations = options.maxIterations || 10;
    this.iteration = 0;
  }

  startRequest() {
    this.iteration = 0;
    this.guardrails.reset();
  }

  startIteration() {
    this.iteration++;
    this.guardrails.startIteration();
    return { iteration: this.iteration, maxIterations: this.maxIterations, allowed: this.iteration <= this.maxIterations };
  }

  parseToolCalls(toolCalls = []) {
    return toolCalls.map((call, index) => {
      const name = call.function?.name || call.name;
      const raw = call.function?.arguments ?? call.input ?? call.args ?? {};
      let input = raw;
      let parseError = null;
      if (typeof raw === 'string') {
        try { input = JSON.parse(raw || '{}'); }
        catch (error) { input = {}; parseError = error.message; }
      }
      return { id: call.id || `call_${this.iteration}_${index}`, name, input, parseError, original: call };
    });
  }

  assess(call) {
    if (!call?.name) return { blocked: true, reason: 'Araç adı eksik' };
    if (call.parseError) return { blocked: true, reason: `Araç argümanları JSON değil: ${call.parseError}` };
    return this.guardrails.check(call.name, call.input || {});
  }

  record(call, result) {
    const standard = standardToolResult(result, { tool: call.name, iteration: this.iteration });
    this.guardrails.record(call.name, call.input || {}, standard.ok);
    return standard;
  }
}

module.exports = { AgentCore };
