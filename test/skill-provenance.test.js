import { describe, expect, it } from 'vitest';
import provenance from '../scripts/generate-skill-provenance.js';

const { sha256 } = provenance;

describe('skill provenance', () => {
  it('produces the same digest for LF and CRLF checkouts', () => {
    expect(sha256(Buffer.from('title\nbody\n')))
      .toBe(sha256(Buffer.from('title\r\nbody\r\n')));
  });
});
