const { execSync } = require('child_process');
const os = require('os');
const chalk = require('chalk');
const { isDangerousCommand, checkCommand, isSafeCommand } = require('../utils/approvals');

module.exports = {
  name: 'bash',
  description: 'Execute bash commands in the terminal',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute'
      }
    },
    required: ['command']
  },
  
  async execute(params) {
    try {
      if (!params.command || !params.command.trim()) {
        return { success: false, error: 'No command provided' };
      }

      const command = params.command;

      // Skip approval checks for safe commands
      if (isSafeCommand(command)) {
        return runCommand(command);
      }

      // Check command against approvals policy
      const approval = await checkCommand(command, { agentId: 'default' });

      if (!approval.allowed) {
        if (approval.reason === 'denied-by-policy') {
          return {
            success: false,
            error: 'Command execution is denied by security policy. Use "natureco security allowlist add" to allow specific commands.',
          };
        }
        if (approval.reason === 'not-in-allowlist') {
          return {
            success: false,
            error: 'Command is not in the allowlist. Use "natureco security allowlist add" to add it, or set a less restrictive policy.',
          };
        }
        return { success: false, error: `Command rejected: ${approval.reason}` };
      }

      // Check for dangerous commands that weren't already user-approved
      if (isDangerousCommand(command)) {
        console.log(chalk.yellow('\n  ⚠️  Potentially dangerous command'));
        console.log(chalk.gray('  ') + command);
        console.log('');
        return {
          success: false,
          error: 'Dangerous command blocked. Run manually after review.',
        };
      }

      return runCommand(approval.editedCommand || command);
    } catch (error) {
      return {
        success: false,
        error: error?.message ?? 'Unknown error',
        stderr: error?.stderr?.toString() ?? '',
      };
    }
  }
};

function runCommand(command) {
  let cmd = command;
  if (process.platform !== 'win32') {
    cmd = cmd.replace(/\/home(\/[^\s]*)?/g, (match, subpath) => {
      return os.homedir() + (subpath || '');
    });
  }

  const output = execSync(cmd, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
    shell: true,
  });

  return {
    success: true,
    output: output.trim(),
  };
}
