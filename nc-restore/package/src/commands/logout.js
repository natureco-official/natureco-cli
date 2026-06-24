const chalk = require('chalk');
const { deleteConfig, CONFIG_FILE } = require('../utils/config');

function logout() {
  console.log(chalk.yellow('\n⏳ Logging out...'));
  
  deleteConfig();
  
  console.log(chalk.green('✅ Logged out successfully.\n'));
  console.log(chalk.gray(`Removed: ${CONFIG_FILE}\n`));
}

module.exports = logout;
