const chalk = require('chalk');

class NatureCoError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.cause = options.cause || null;
    this.exitCode = options.exitCode || 1;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class ConfigError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.configPath = options.configPath || null;
  }
}

class ConfigParseError extends ConfigError {
  constructor(message, options = {}) {
    super(`Config parse error: ${message}`, options);
  }
}

class ConfigMutationConflictError extends ConfigError {
  constructor(message, options = {}) {
    super(`Config conflict: ${message}`, options);
    this.currentHash = options.currentHash || null;
  }
}

class ConfigValidationError extends ConfigError {
  constructor(message, options = {}) {
    super(`Config validation error: ${message}`, options);
    this.field = options.field || null;
  }
}

class ApiError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.statusCode = options.statusCode || null;
    this.provider = options.provider || null;
  }
}

class ProviderError extends ApiError {
  constructor(message, options = {}) {
    super(`Provider error (${options.provider || 'unknown'}): ${message}`, options);
  }
}

class AuthenticationError extends ApiError {
  constructor(message, options = {}) {
    super(`Authentication error: ${message}`, options);
  }
}

class ToolError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.toolName = options.toolName || null;
  }
}

class ToolInputError extends ToolError {
  constructor(message, options = {}) {
    super(`Invalid tool input: ${message}`, options);
  }
}

class ToolExecutionError extends ToolError {
  constructor(message, options = {}) {
    super(`Tool execution failed: ${message}`, options);
  }
}

class ChannelError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.channel = options.channel || null;
  }
}

class GatewayError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
  }
}

class PluginError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.plugin = options.plugin || null;
  }
}

class SkillError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.skill = options.skill || null;
  }
}

class MigrationError extends NatureCoError {
  constructor(message, options = {}) {
    super(message, options);
    this.step = options.step || null;
  }
}

function handleError(err, options = {}) {
  const { prefix = '', exit = true, log = true } = options;
  
  if (log) {
    const message = err instanceof NatureCoError
      ? `${prefix}${err.message}`
      : `${prefix}${err.message || 'An unknown error occurred'}`;
    console.log(chalk.red(`\n${message}\n`));
  }
  
  if (exit) {
    process.exit(err instanceof NatureCoError ? err.exitCode : 1);
  }
}

module.exports = {
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
};
