import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';

const spawnMock = vi.fn();
const requireCjs = createRequire(import.meta.url);

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
  vi.resetModules();
});

describe('youtube_ac cross-platform URL opening', () => {
  it('uses cmd /c start with an argv-safe YouTube URL on Windows', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    spawnMock.mockImplementation(() => {
      const proc = new EventEmitter();
      queueMicrotask(() => proc.emit('close', 0));
      return proc;
    });
    vi.spyOn(requireCjs('child_process'), 'spawn').mockImplementation(spawnMock);
    const youtube = requireCjs('../../src/tools/youtube_ac');

    const result = await youtube.execute({ query: 'audit proof' });

    expect(result).toMatchObject({
      success: true,
      url: 'https://www.youtube.com/results?search_query=audit%20proof',
      browser: 'new',
    });
    expect(spawnMock).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', '', 'https://www.youtube.com/results?search_query=audit%20proof'],
      { windowsHide: true },
    );
  });
});
