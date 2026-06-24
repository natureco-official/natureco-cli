const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { getCommands, createCommand } = require('../utils/commands');

async function commands(action, ...args) {
  if (!action || action === 'list') {
    return listCommands();
  }
  
  if (action === 'create') {
    const name = args[0];
    if (!name) {
      console.log(chalk.red('\n❌ Command name required\n'));
      console.log(chalk.gray('Usage: natureco commands create <name>\n'));
      process.exit(1);
    }
    return createCommandInteractive(name);
  }
  
  console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
  console.log(chalk.gray('Available actions: list, create\n'));
  process.exit(1);
}

function listCommands() {
  const commands = getCommands();
  
  if (commands.length === 0) {
    console.log(chalk.gray('\nNo custom commands found.\n'));
    console.log(chalk.gray('Create one with: natureco commands create <name>\n'));
    return;
  }
  
  console.log(chalk.yellow('\nCustom Commands:\n'));
  
  commands.forEach(cmd => {
    const sourceLabel = cmd.source === 'user' ? chalk.blue('[global]') : chalk.green('[project]');
    console.log(`  ${sourceLabel} ${chalk.cyan('/' + cmd.name)}`);
    const preview = cmd.content.split('\n').find(line => line.trim() && !line.startsWith('#'));
    if (preview) {
      console.log(chalk.gray(`    ${preview.trim().slice(0, 60)}...`));
    }
  });
  
  console.log('');
}

async function createCommandInteractive(name) {
  process.stdin.resume();
  
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'scope',
      message: 'Command scope:',
      choices: [
        { name: 'Project (only this project)', value: 'project' },
        { name: 'Global (all projects)', value: 'user' },
      ],
      default: 'project',
    },
  ]);
  
  try {
    const filePath = createCommand(name, answers.scope);
    console.log(chalk.green(`\n✅ Command created: ${filePath}\n`));
    console.log(chalk.gray(`Edit the file and use it in chat with: /${name}\n`));
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = commands;
