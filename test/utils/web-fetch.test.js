import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'https';
import http from 'http';
import { EventEmitter } from 'events';

function mockResponse(statusCode, body, headers = {}) {
  const res = Object.assign(new EventEmitter(), {
    statusCode,
    headers,
  });
  return res;
}

describe('fetchAsMarkdown', () => {
  let mod;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(https, 'get').mockImplementation((url, opts, cb) => {
      const res = mockResponse(200, '', {});
      cb(res);
      setTimeout(() => {
        res.emit('data', Buffer.from('<html><head><title>Test</title></head><body>Hello</body></html>'));
        res.emit('end');
      }, 10);
      return { on: vi.fn().mockReturnThis() };
    });
    vi.spyOn(http, 'get').mockImplementation(() => ({ on: vi.fn().mockReturnThis() }));
    mod = require('../../src/utils/web-fetch');
  });

  it('should return object with title, content, url, fetchedAt fields', async () => {
    const result = await mod.fetchAsMarkdown('https://example.com');
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('url', 'https://example.com');
    expect(result).toHaveProperty('fetchedAt');
    expect(typeof result.fetchedAt).toBe('string');
  });

  it('should handle invalid URLs gracefully', async () => {
    const result = await mod.fetchAsMarkdown('not-a-valid-url');
    expect(result.content).toBe('Invalid URL');
  });

  it('should follow redirects', async () => {
    let callCount = 0;
    https.get.mockImplementation((url, opts, cb) => {
      callCount++;
      const isRedirect = callCount === 1;
      const res = mockResponse(isRedirect ? 302 : 200, '', isRedirect ? { location: 'https://example.com/final' } : {});
      cb(res);
      setTimeout(() => {
        if (!isRedirect) {
          res.emit('data', Buffer.from('<html><title>Final</title><body>Done</body></html>'));
        }
        res.emit('end');
      }, 10);
      return { on: vi.fn().mockReturnThis() };
    });

    const result = await mod.fetchAsMarkdown('https://example.com/redirect');
    expect(result.content).toContain('Done');
    expect(callCount).toBe(2);
  });

  it('should strip script and style tags from HTML', async () => {
    https.get.mockImplementation((url, opts, cb) => {
      const res = mockResponse(200, '');
      cb(res);
      setTimeout(() => {
        res.emit('data', Buffer.from('<html><head><script>alert("xss")</script><style>body{color:red}</style></head><body>Hello</body></html>'));
        res.emit('end');
      }, 10);
      return { on: vi.fn().mockReturnThis() };
    });

    const result = await mod.fetchAsMarkdown('https://example.com');
    expect(result.content).not.toContain('alert');
    expect(result.content).not.toContain('color:red');
  });

  it('should extract article content when available', async () => {
    https.get.mockImplementation((url, opts, cb) => {
      const res = mockResponse(200, '');
      cb(res);
      setTimeout(() => {
        res.emit('data', Buffer.from('<html><body><article><h1>Article Title</h1><p>Article body text here.</p></article></body></html>'));
        res.emit('end');
      }, 10);
      return { on: vi.fn().mockReturnThis() };
    });

    const result = await mod.fetchAsMarkdown('https://example.com');
    expect(result.content).toContain('Article Title');
    expect(result.content).toContain('Article body text here');
  });

  it('should cap content at 10000 chars', async () => {
    const longText = 'A'.repeat(15000);
    https.get.mockImplementation((url, opts, cb) => {
      const res = mockResponse(200, '');
      cb(res);
      setTimeout(() => {
        res.emit('data', Buffer.from(`<html><title>Long</title><body>${longText}</body></html>`));
        res.emit('end');
      }, 10);
      return { on: vi.fn().mockReturnThis() };
    });

    const result = await mod.fetchAsMarkdown('https://example.com');
    expect(result.content.length).toBeLessThanOrEqual(10000);
  });
});
