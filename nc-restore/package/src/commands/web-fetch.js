const { fetchAsMarkdown } = require('../utils/web-fetch');
const chalk = require('chalk');

async function webFetch(url) {
  if (!url) {
    console.log(chalk.yellow('\n  Usage: natureco web-fetch <url>\n'));
    console.log(chalk.gray('  Fetches a URL and converts it to clean markdown.\n'));
    return;
  }

  console.log(chalk.gray(`  Fetching: ${url}\n`));

  const result = await fetchAsMarkdown(url);

  if (result.error) {
    console.log(chalk.red(`  ❌ ${result.error}\n`));
    return;
  }

  if (result.title) {
    console.log(chalk.white('  Title: ') + chalk.cyan(result.title));
  }
  console.log(chalk.gray(`  Source: ${result.url}`));
  console.log(chalk.gray(`  Fetched: ${result.fetchedAt}`));
  console.log('');

  if (result.content) {
    console.log(result.content);
  } else {
    console.log(chalk.yellow('  No content extracted.\n'));
  }
}

module.exports = webFetch;
