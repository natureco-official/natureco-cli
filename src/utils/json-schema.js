'use strict';

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function validateJsonSchema(schema, value, at = '$') {
  const errors = [];
  if (!schema || typeof schema !== 'object') return { valid: true, errors };
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const actual = valueType(value);
  if (allowedTypes.length && !allowedTypes.includes(actual) && !(actual === 'integer' && allowedTypes.includes('number'))) {
    return { valid: false, errors: [`${at}: expected ${allowedTypes.join('|')}, got ${actual}`] };
  }
  if (schema.enum && !schema.enum.some(item => Object.is(item, value))) {
    errors.push(`${at}: value is not in enum`);
  }
  if (actual === 'object' && value !== null) {
    for (const key of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${at}.${key}: required`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(...validateJsonSchema(child, value[key], `${at}.${key}`).errors);
      }
    }
    if (schema.additionalProperties === false) {
      const known = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) if (!known.has(key)) errors.push(`${at}.${key}: additional property`);
    }
  }
  if (actual === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${at}: minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${at}: maxItems ${schema.maxItems}`);
    if (schema.items) value.forEach((item, index) => errors.push(...validateJsonSchema(schema.items, item, `${at}[${index}]`).errors));
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { validateJsonSchema };
