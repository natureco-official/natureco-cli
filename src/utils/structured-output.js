/**
 * structured-output — JSON Schema-based structured output support
 *
 * Adds response_format to API calls when schema is provided.
 * Config: { "response_format": { "type": "json_object", "schema": {...} } }
 * Tool:  SetOutputSchema — defines JSON schema for subsequent responses
 */

function hasStructuredOutput(cfg) {
  return !!(cfg.response_format || cfg.jsonSchema || cfg.structuredOutput);
}

function getResponseFormat(cfg) {
  if (cfg.response_format) return cfg.response_format;
  if (cfg.jsonSchema) return { type: 'json_object', schema: cfg.jsonSchema };
  if (cfg.structuredOutput) return { type: 'json_object', schema: cfg.structuredOutput };
  return null;
}

module.exports = { hasStructuredOutput, getResponseFormat };
