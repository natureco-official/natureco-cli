const chalk = require('chalk');

function getCommands() {
  return [
    'agent', 'agents', 'approvals', 'ask', 'backup', 'bonjour', 'bots',
    'capability', 'channels', 'chat', 'clickclack', 'code', 'commands',
    'commitments', 'completion', 'config', 'configure', 'crestodian', 'cron',
    'daemon', 'dashboard', 'device-pair', 'devices', 'directory', 'discord',
    'dns', 'doctor', 'docs', 'exec-policy', 'gateway', 'git', 'health', 'help',
    'hooks', 'imessage', 'infer', 'init', 'irc', 'login', 'logs', 'logout',
    'mattermost', 'mcp', 'memory', 'message', 'migrate', 'models', 'node',
    'nodes', 'oc-path', 'onboard', 'open-prose', 'pairing', 'plugins', 'policy',
    'proxy', 'qr', 'reset', 'run', 'sandbox', 'secrets', 'security', 'sessions',
    'setup', 'signal', 'skills', 'slack', 'sms', 'status', 'system', 'tasks',
    'telegram', 'terminal', 'thread-ownership', 'transcripts', 'ultrareview',
    'uninstall', 'update', 'voice', 'vydra', 'webhooks', 'whatsapp', 'workboard',
  ];
}

function completion(params) {
  try {
    const [shell] = params || [];

    if (!shell || shell === 'bash') return printBash();
    if (shell === 'zsh') return printZsh();
    if (shell === 'fish') return printFish();
    if (shell === 'install') return printInstall();

    console.log(chalk.red(`\n  Unknown shell: ${shell}\n`));
    console.log(chalk.gray('  Usage: natureco completion [bash|zsh|fish|install]\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Completion error: ${err.message}\n`));
  }
}

function printBash() {
  const cmds = getCommands().join(' ');
  console.log(`# natureco bash completion
_natureco() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  opts="${cmds}"
  COMPREPLY=( $(compgen -W "\${opts}" -- \${cur}) )
  return 0
}
complete -F _natureco natureco`);
}

function printZsh() {
  console.log(`#compdef natureco
_natureco() {
  local -a commands
  commands=(
    ${getCommands().map(c => `"${c}:${c}"`).join(' ')}
  )
  _describe 'command' commands
}
_natureco "$@"`);
}

function printFish() {
  const cmds = getCommands().join(' ');
  console.log(`complete -c natureco -f -a "${cmds}"`);
}

function printInstall() {
  console.log(chalk.cyan('\n  Shell Completion Installation\n'));
  console.log(chalk.white('  Bash:'));
  console.log(chalk.gray('    natureco completion bash >> ~/.bashrc'));
  console.log(chalk.gray('    source ~/.bashrc'));
  console.log('');
  console.log(chalk.white('  Zsh:'));
  console.log(chalk.gray('    mkdir -p ~/.zsh/completion'));
  console.log(chalk.gray('    natureco completion zsh > ~/.zsh/completion/_natureco'));
  console.log(chalk.gray('    echo "fpath=(~/.zsh/completion \$fpath)" >> ~/.zshrc'));
  console.log(chalk.gray('    echo "autoload -Uz compinit && compinit" >> ~/.zshrc'));
  console.log('');
  console.log(chalk.white('  Fish:'));
  console.log(chalk.gray('    natureco completion fish > ~/.config/fish/completions/natureco.fish'));
  console.log('');
}

module.exports = completion;
