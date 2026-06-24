import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('parallel-tools', () => {
  let mod;

  beforeEach(() => {
    vi.resetModules();
    mod = require('../../src/utils/parallel-tools');
  });

  describe('runParallel', () => {
    it('should return results array with same length as input', async () => {
      const tools = [
        { name: 'tool1', type: 'function', params: { x: 1 } },
        { name: 'tool2', type: 'function', params: { y: 2 } },
      ];
      const executeTool = vi.fn().mockResolvedValue({ success: true, output: 'ok' });
      const results = await mod.runParallel(tools, { executeTool });
      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
    });

    it('should handle empty tools array', async () => {
      const results = await mod.runParallel([]);
      expect(results).toEqual([]);
    });

    it('should mark failed tools as error', async () => {
      const tools = [
        { name: 'good', type: 'function', params: {} },
        { name: 'bad', type: 'function', params: {} },
      ];
      const executeTool = vi.fn()
        .mockResolvedValueOnce({ success: true, output: 'ok' })
        .mockRejectedValueOnce(new Error('boom'));
      const results = await mod.runParallel(tools, { executeTool });
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('error');
      expect(results[1].result).toBe('boom');
    });

    it('should run tools in parallel', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const executeTool = vi.fn().mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 10));
        concurrent--;
        return { success: true, output: 'ok' };
      });
      const tools = Array.from({ length: 5 }, (_, i) => ({
        name: `tool${i}`,
        type: 'function',
        params: {},
      }));
      await mod.runParallel(tools, { executeTool });
      expect(maxConcurrent).toBeGreaterThan(1);
    });
  });

  describe('groupIndependent', () => {
    it('should return one group when no dependencies', () => {
      const tools = [
        { name: 'a', params: { x: 1 } },
        { name: 'b', params: { y: 2 } },
      ];
      const groups = mod.groupIndependent(tools);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(2);
    });

    it('should separate tools that share output keys', () => {
      const tools = [
        { name: 'a', params: { x: 1 } },
        { name: 'b', params: { y: 2 } },
      ];
      const depMap = {
        a: { outputKeys: ['key1'] },
        b: { inputKeys: ['key1'] },
      };
      const groups = mod.groupIndependent(tools, depMap);
      expect(groups).toHaveLength(2);
    });

    it('should put independent tools in same parallel group', () => {
      const tools = [
        { name: 'a', params: { x: 1 } },
        { name: 'b', params: { y: 2 } },
        { name: 'c', params: { z: 3 } },
      ];
      const groups = mod.groupIndependent(tools);
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);
    });
  });

  describe('executeSingle', () => {
    it('should call getMcpClient for MCP type tools', async () => {
      const getMcpClient = vi.fn().mockReturnValue({
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'mcp result' }],
        }),
      });
      const tool = { name: 'mcp-tool', type: 'mcp', params: { arg: 1 } };
      const result = await mod.executeSingle(tool, { getMcpClient });
      expect(result.success).toBe(true);
      expect(result.output).toBe('mcp result');
      expect(getMcpClient).toHaveBeenCalledWith('mcp-tool');
    });

    it('should call executeTool for function type tools', async () => {
      const executeTool = vi.fn().mockResolvedValue({ success: true, output: 'fn result' });
      const tool = { name: 'fn-tool', type: 'function', params: { arg: 1 } };
      const result = await mod.executeSingle(tool, { executeTool });
      expect(result.success).toBe(true);
      expect(result.output).toBe('fn result');
      expect(executeTool).toHaveBeenCalledWith('fn-tool', { arg: 1 });
    });

    it('should throw for unknown tool type', async () => {
      const tool = { name: 'unknown', type: 'unknown', params: {} };
      await expect(mod.executeSingle(tool)).rejects.toThrow('Unknown tool type');
    });
  });
});
