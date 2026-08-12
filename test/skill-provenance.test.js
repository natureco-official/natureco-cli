import { describe, expect, it } from 'vitest';
import provenance from '../scripts/generate-skill-provenance.js';

const { canonicalText, sha256 } = provenance;

describe('skill provenance', () => {
  it('produces the same digest for LF and CRLF checkouts', () => {
    expect(sha256(Buffer.from('title\nbody\n')))
      .toBe(sha256(Buffer.from('title\r\nbody\r\n')));
  });

  it('compares generated manifests independently of checkout line endings', () => {
    expect(canonicalText('{\r\n  "schemaVersion": 1\r\n}\r\n'))
      .toBe('{\n  "schemaVersion": 1\n}\n');
  });
});
