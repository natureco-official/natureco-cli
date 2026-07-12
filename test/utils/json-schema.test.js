const { validateJsonSchema } = require('../../src/utils/json-schema');

describe('JSON Schema validation', () => {
  const schema = {
    type: 'object', required: ['path'], additionalProperties: false,
    properties: { path: { type: 'string' }, count: { type: 'integer' }, mode: { enum: ['safe', 'full'] } },
  };

  test('accepts a valid payload', () => expect(validateJsonSchema(schema, { path: 'a', count: 2, mode: 'safe' }).valid).toBe(true));
  test('reports required, type, enum and extra-property errors', () => {
    const result = validateJsonSchema(schema, { count: '2', mode: 'bad', extra: true });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/required/);
    expect(result.errors.join(' ')).toMatch(/expected integer/);
    expect(result.errors.join(' ')).toMatch(/enum/);
    expect(result.errors.join(' ')).toMatch(/additional property/);
  });
});
