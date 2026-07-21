const chalk = require('chalk');
const { foldTr } = require('../utils/tr-text');

const DOC_SOURCES = [
  { name: 'NatureCo API', url: 'https://api.natureco.me/api/v1/docs/search?q=' },
  { name: 'NatureCo CLI', url: 'https://natureco.me/cli/' },
  { name: 'NatureCo Developers', url: 'https://developers.natureco.me/' },
  { name: 'OpenClaw Docs', url: 'https://docs.openclaw.ai/' },
];

async function docs(args) {
  args = args || [];
  const query = args.join(' ').trim();

  if (!query) {
    showHelp();
    return;
  }

  console.log(chalk.cyan(`\n  Searching docs for: "${query}"\n`));

  let found = false;

  for (const source of DOC_SOURCES) {
    try {
      const url = source.url.includes('/docs/search')
        ? source.url + encodeURIComponent(query)
        : source.url;
      const response = await fetch(url + (source.url.includes('/docs/search') ? '' : '?format=json'), {
        headers: { 'User-Agent': 'NatureCo-CLI/2.0' },
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = null; }

        if (data && data.results && data.results.length > 0) {
          found = true;
          console.log(chalk.cyan(`  ${source.name}\n`));
          console.log(chalk.gray('  ' + '─'.repeat(48)));
          for (const r of data.results.slice(0, 5)) {
            console.log(`  ${chalk.white(r.title || r.name || 'Result')}`);
            if (r.description) console.log(`  ${chalk.gray(r.description)}`);
            if (r.url) console.log(`  ${chalk.cyan(r.url)}`);
            console.log();
          }
        } else if (data && data.AbstractText) {
          found = true;
          console.log(chalk.cyan(`  ${source.name}\n`));
          console.log(chalk.gray('  ' + '─'.repeat(48)));
          console.log(`  ${chalk.white(data.AbstractText)}`);
          if (data.AbstractURL) console.log(`\n  ${chalk.cyan(data.AbstractURL)}`);
          console.log();
        }
      }
    } catch {}
  }

  if (!found) {
    try {
      const webRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent('site:natureco.me ' + query)}&format=json&no_html=1&skip_disambig=1`, {
        headers: { 'User-Agent': 'NatureCo-CLI/2.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (webRes.ok) {
        const webData = await webRes.json();
        if (webData.AbstractText || webData.RelatedTopics?.length > 0) {
          found = true;
          console.log(chalk.cyan('  NatureCo (via DuckDuckGo)\n'));
          console.log(chalk.gray('  ' + '─'.repeat(48)));
          if (webData.AbstractText) {
            console.log(`  ${chalk.white(webData.AbstractText)}`);
            if (webData.AbstractURL) console.log(`\n  ${chalk.cyan(webData.AbstractURL)}`);
          } else {
            for (const topic of webData.RelatedTopics.slice(0, 5)) {
              if (topic.Text) {
                console.log(`  ${chalk.white(topic.Text)}`);
                if (topic.FirstURL) console.log(`  ${chalk.cyan(topic.FirstURL)}`);
                console.log();
              }
            }
          }
          console.log();
        }
      }
    } catch {}
  }

  if (!found) {
    try {
      const htmlRes = await fetch('https://natureco.me/cli/', {
        headers: { 'User-Agent': 'NatureCo-CLI/2.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const lines = html.split('\n').filter(l => foldTr(l).includes(foldTr(query)));
        if (lines.length > 0) {
          found = true;
          console.log(chalk.cyan('  NatureCo CLI Docs Page\n'));
          console.log(chalk.gray('  ' + '─'.repeat(48)));
          for (const line of lines.slice(0, 5)) {
            const clean = line.replace(/<[^>]*>/g, '').trim();
            if (clean) console.log(`  ${chalk.white(clean.substring(0, 120))}`);
          }
          console.log(`\n  ${chalk.cyan('https://natureco.me/cli/')}`);
          console.log();
        }
      }
    } catch {}
  }

  if (!found) {
    console.log(chalk.gray('  No documentation found for this query.'));
    console.log(chalk.gray('\n  Try browsing:'));
    console.log(chalk.cyan('    https://natureco.me/cli/'));
    console.log(chalk.cyan('    https://developers.natureco.me/'));
    console.log();
  }
}

function showHelp() {
  console.log(chalk.cyan('\n  NatureCo Docs Search\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(chalk.gray('  Search NatureCo documentation from multiple sources.\n'));
  console.log(chalk.gray('  Usage:'));
  console.log(chalk.cyan('    natureco docs <search query>'));
  console.log(chalk.gray('\n  Examples:'));
  console.log(chalk.gray('    natureco docs gateway setup'));
  console.log(chalk.gray('    natureco docs telegram channel'));
  console.log(chalk.gray('    natureco docs api reference'));
  console.log();
}

module.exports = docs;
