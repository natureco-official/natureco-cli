/**
 * Streaming tool-call delta accumulator.
 *
 * OpenAI-compatible providers stream tool calls as a sequence of partial
 * `delta.tool_calls` chunks. Each chunk carries an `index`, optionally an
 * `id`, and pieces of `function.name` / `function.arguments` that must be
 * concatenated per index before the JSON arguments can be parsed.
 *
 * Broken (do-not-do) pattern, which crashes on multi-chunk arguments:
 *
 *   const tc = delta.tool_calls[0];
 *   JSON.parse(tc.function.arguments); // SyntaxError on incomplete JSON
 *
 * Correct pattern (this module): keep a per-index buffer keyed on `index`,
 * concat `name` and `arguments` as strings, JSON-parse only after `[DONE]`.
 *
 * See `~/.hermes/skills/llm-provider-integration/references/
 * minimax-401-tool-calling-lessons.md` Lesson 2 for the failure-mode that
 * motivated this. Both `src/utils/api.js` (non-REPL stream path) and
 * `src/commands/repl.js` (REPL stream path) use this helper so the two
 * implementations cannot drift.
 */

/**
 * Apply one streaming delta chunk to the per-index buffer.
 * Mutates `buffer` in place and returns it for chaining.
 *
 * @param {Array<object>} buffer  per-index accumulator (created externally,
 *                                index = position; sparse entries fine)
 * @param {Array<object>} deltas  `parsed.choices[0].delta.tool_calls`
 * @returns {Array<object>} the same buffer
 */
function accumulateToolCallDeltas(buffer, deltas) {
  if (!Array.isArray(deltas)) return buffer;
  for (const tcDelta of deltas) {
    if (!tcDelta || typeof tcDelta.index !== 'number') continue;
    const idx = tcDelta.index;
    if (!buffer[idx]) {
      buffer[idx] = {
        index: idx,
        id: '',
        type: 'function',
        function: { name: '', arguments: '' },
      };
    }
    const slot = buffer[idx];
    if (tcDelta.id) slot.id = tcDelta.id;
    if (tcDelta.type) slot.type = tcDelta.type;
    if (tcDelta.function?.name) slot.function.name += tcDelta.function.name;
    if (tcDelta.function?.arguments) slot.function.arguments += tcDelta.function.arguments;
  }
  return buffer;
}

/**
 * Finalize accumulated buffer into the shape an OpenAI-compatible
 * `assistant.tool_calls` array expects. Filters incomplete entries
 * (missing name or id) and synthesizes ids when absent.
 *
 * @param {Array<object>} buffer  from accumulateToolCallDeltas
 * @returns {Array<{id:string,type:string,function:{name:string,arguments:string}}>}
 */
function finalizeToolCalls(buffer) {
  const out = [];
  for (let i = 0; i < buffer.length; i++) {
    const slot = buffer[i];
    if (!slot || !slot.function.name) continue;
    out.push({
      id: slot.id || `call_${Date.now()}_${i}`,
      type: slot.type || 'function',
      function: { name: slot.function.name, arguments: slot.function.arguments || '' },
    });
  }
  return out;
}

/**
 * Parse the JSON arguments of a finalized tool call, returning {} on
 * failure so callers don't have to repeat the try/catch.
 *
 * @param {string} argsJson
 * @returns {object}
 */
function parseToolArgs(argsJson) {
  if (!argsJson || typeof argsJson !== 'string') return {};
  try {
    return JSON.parse(argsJson);
  } catch {
    return {};
  }
}

module.exports = {
  accumulateToolCallDeltas,
  finalizeToolCalls,
  parseToolArgs,
};
