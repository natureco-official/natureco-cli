import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const {
  NatureCoError,
  ConfigError,
  ConfigParseError,
  ConfigMutationConflictError,
  ConfigValidationError,
  ApiError,
  ProviderError,
  AuthenticationError,
  ToolError,
  ToolInputError,
  ToolExecutionError,
  ChannelError,
  GatewayError,
  PluginError,
  SkillError,
  MigrationError,
  handleError,
} = require('../../src/utils/errors');

describe('NatureCoError', () => {
  it('should create an error with default values', () => {
    const err = new NatureCoError('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NatureCoError');
    expect(err.message).toBe('test error');
    expect(err.exitCode).toBe(1);
    expect(err.cause).toBeNull();
  });

  it('should accept custom options', () => {
    const cause = new Error('underlying');
    const err = new NatureCoError('test', { cause, exitCode: 5 });
    expect(err.cause).toBe(cause);
    expect(err.exitCode).toBe(5);
  });
});

describe('ConfigError', () => {
  it('should include configPath', () => {
    const err = new ConfigError('config fail', { configPath: '/path/to/config.json' });
    expect(err).toBeInstanceOf(NatureCoError);
    expect(err.configPath).toBe('/path/to/config.json');
  });
});

describe('ConfigParseError', () => {
  it('should prefix message', () => {
    const err = new ConfigParseError('invalid json');
    expect(err.message).toMatch(/^Config parse error:/);
    expect(err).toBeInstanceOf(ConfigError);
  });
});

describe('ConfigMutationConflictError', () => {
  it('should prefix message and include hash', () => {
    const err = new ConfigMutationConflictError('version mismatch', { currentHash: 'abc123' });
    expect(err.message).toMatch(/^Config conflict:/);
    expect(err.currentHash).toBe('abc123');
  });
});

describe('ConfigValidationError', () => {
  it('should prefix message and include field', () => {
    const err = new ConfigValidationError('bad value', { field: 'apiKey' });
    expect(err.message).toMatch(/^Config validation error:/);
    expect(err.field).toBe('apiKey');
  });
});

describe('ApiError', () => {
  it('should include statusCode and provider', () => {
    const err = new ApiError('API failed', { statusCode: 403, provider: 'openai' });
    expect(err).toBeInstanceOf(NatureCoError);
    expect(err.statusCode).toBe(403);
    expect(err.provider).toBe('openai');
  });
});

describe('ProviderError', () => {
  it('should prefix with provider name', () => {
    const err = new ProviderError('rate limited', { provider: 'anthropic' });
    expect(err.message).toMatch(/^Provider error \(anthropic\):/);
  });
});

describe('AuthenticationError', () => {
  it('should prefix message', () => {
    const err = new AuthenticationError('invalid key');
    expect(err.message).toMatch(/^Authentication error:/);
    expect(err).toBeInstanceOf(ApiError);
  });
});

describe('ToolError', () => {
  it('should include toolName', () => {
    const err = new ToolError('tool broke', { toolName: 'bash' });
    expect(err.toolName).toBe('bash');
  });
});

describe('ToolInputError', () => {
  it('should prefix with tool input', () => {
    const err = new ToolInputError('missing param', { toolName: 'read' });
    expect(err.message).toMatch(/^Invalid tool input:/);
    expect(err).toBeInstanceOf(ToolError);
  });
});

describe('ToolExecutionError', () => {
  it('should prefix with execution failed', () => {
    const err = new ToolExecutionError('exit code 1', { toolName: 'bash' });
    expect(err.message).toMatch(/^Tool execution failed:/);
    expect(err).toBeInstanceOf(ToolError);
  });
});

describe('ChannelError', () => {
  it('should include channel name', () => {
    const err = new ChannelError('not connected', { channel: 'whatsapp' });
    expect(err.channel).toBe('whatsapp');
    expect(err).toBeInstanceOf(NatureCoError);
  });
});

describe('GatewayError', () => {
  it('should be a NatureCoError', () => {
    const err = new GatewayError('gateway down');
    expect(err).toBeInstanceOf(NatureCoError);
  });
});

describe('PluginError', () => {
  it('should include plugin name', () => {
    const err = new PluginError('plugin failed', { plugin: 'my-plugin' });
    expect(err.plugin).toBe('my-plugin');
    expect(err).toBeInstanceOf(NatureCoError);
  });
});

describe('SkillError', () => {
  it('should include skill name', () => {
    const err = new SkillError('skill error', { skill: 'my-skill' });
    expect(err.skill).toBe('my-skill');
    expect(err).toBeInstanceOf(NatureCoError);
  });
});

describe('MigrationError', () => {
  it('should include step', () => {
    const err = new MigrationError('migration failed', { step: 'v2-to-v3' });
    expect(err.step).toBe('v2-to-v3');
    expect(err).toBeInstanceOf(NatureCoError);
  });
});

describe('handleError', () => {
  let originalExit;

  beforeEach(() => {
    originalExit = process.exit;
    process.exit = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it('should log NatureCoError message and exit with its exitCode', () => {
    const err = new NatureCoError('something went wrong', { exitCode: 2 });
    handleError(err);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('something went wrong'));
    expect(process.exit).toHaveBeenCalledWith(2);
  });

  it('should log regular Error and exit with code 1', () => {
    const err = new Error('regular error');
    handleError(err);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('regular error'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should use prefix', () => {
    const err = new NatureCoError('fail');
    handleError(err, { prefix: '[BOT] ' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[BOT] fail'));
  });

  it('should not exit when exit=false', () => {
    handleError(new NatureCoError('no exit'), { exit: false });
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should not log when log=false', () => {
    handleError(new NatureCoError('no log'), { log: false });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('should handle non-Error objects', () => {
    handleError({ message: 'object error' }, { exit: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('object error'));
  });
});
