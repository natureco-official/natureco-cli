const { execSync, execFileSync } = require('child_process');
const inquirer = require('../utils/inquirer-wrapper');
const chalk = require('chalk');
const { getApiKey } = require('../utils/config');
const { getBots, sendMessage } = require('../utils/api');

async function git(action, ...args) {
  if (!action) {
    console.log(chalk.red('\n❌ Action required\n'));
    console.log(chalk.gray('Available actions: review, commit, pr, explain\n'));
    process.exit(1);
  }
  
  if (action === 'review') {
    return gitReview();
  }
  
  if (action === 'commit') {
    return gitCommit();
  }
  
  if (action === 'pr') {
    return gitPR();
  }
  
  if (action === 'explain') {
    return gitExplain();
  }
  
  console.log(chalk.red(`\n❌ Unknown action: ${action}\n`));
  console.log(chalk.gray('Available actions: review, commit, pr, explain\n'));
  process.exit(1);
}

async function gitReview() {
  let diff;
  try {
    diff = execSync('git diff --staged', { encoding: 'utf-8' });
  } catch (err) {
    console.log(chalk.red('\n❌ Git error. Make sure you are in a git repository.\n'));
    process.exit(1);
  }
  
  if (!diff || diff.trim() === '') {
    console.log(chalk.gray('\nNo staged changes to review.\n'));
    console.log(chalk.gray('Stage changes with: git add <files>\n'));
    return;
  }
  
  const { apiKey, bot } = await getDefaultBot();
  
  const prompt = `Bu değişiklikleri incele, sorunları ve iyileştirme önerilerini listele:\n\n${diff}`;
  
  console.log(chalk.yellow('\n⏳ Reviewing changes...\n'));
  
  try {
    const response = await sendMessage(apiKey, bot.id, prompt, null, '');
    const reply = response.reply || response.message || 'No response';
    
    console.log(chalk.green('Code Review:\n'));
    console.log(chalk.white(reply));
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

async function gitCommit() {
  let diff;
  try {
    diff = execSync('git diff --staged', { encoding: 'utf-8' });
  } catch (err) {
    console.log(chalk.red('\n❌ Git error. Make sure you are in a git repository.\n'));
    process.exit(1);
  }
  
  if (!diff || diff.trim() === '') {
    console.log(chalk.gray('\nNo staged changes to commit.\n'));
    console.log(chalk.gray('Stage changes with: git add <files>\n'));
    return;
  }
  
  const { apiKey, bot } = await getDefaultBot();
  
  const prompt = `Bu değişiklikler için conventional commit formatında kısa ve açıklayıcı bir commit mesajı yaz (sadece mesajı yaz, açıklama yapma):\n\n${diff}`;
  
  console.log(chalk.yellow('\n⏳ Generating commit message...\n'));
  
  try {
    const response = await sendMessage(apiKey, bot.id, prompt, null, '');
    let commitMessage = response.reply || response.message || 'Update';
    
    // Clean up the message
    commitMessage = commitMessage.trim().replace(/^["']|["']$/g, '');
    
    console.log(chalk.green('Suggested commit message:\n'));
    console.log(chalk.white(commitMessage));
    console.log('');
    
    process.stdin.resume();
    
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Use this commit message?',
        default: true,
      },
    ]);
    
    if (answer.confirm) {
      try {
        execFileSync('git', ['commit', '-m', commitMessage], { stdio: 'inherit' });
        console.log(chalk.green('\n✅ Committed successfully\n'));
      } catch (err) {
        console.log(chalk.red('\n❌ Commit failed\n'));
        process.exit(1);
      }
    } else {
      console.log(chalk.gray('\nCommit cancelled\n'));
    }
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

async function gitPR() {
  let diff;
  try {
    diff = execSync('git diff main...HEAD', { encoding: 'utf-8' });
  } catch (err) {
    try {
      diff = execSync('git diff master...HEAD', { encoding: 'utf-8' });
    } catch {
      console.log(chalk.red('\n❌ Git error. Make sure you are in a git repository with a main/master branch.\n'));
      process.exit(1);
    }
  }
  
  if (!diff || diff.trim() === '') {
    console.log(chalk.gray('\nNo changes to create PR description for.\n'));
    return;
  }
  
  const { apiKey, bot } = await getDefaultBot();
  
  const prompt = `Bu değişiklikler için bir Pull Request açıklaması yaz. Başlık ve detaylı açıklama içersin:\n\n${diff}`;
  
  console.log(chalk.yellow('\n⏳ Generating PR description...\n'));
  
  try {
    const response = await sendMessage(apiKey, bot.id, prompt, null, '');
    const prDescription = response.reply || response.message || 'No description';
    
    console.log(chalk.green('PR Description:\n'));
    console.log(chalk.white(prDescription));
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

async function gitExplain() {
  let log;
  try {
    log = execSync('git log -1 --pretty=format:"%H%n%an%n%ad%n%s%n%b" HEAD', { encoding: 'utf-8' });
  } catch (err) {
    console.log(chalk.red('\n❌ Git error. Make sure you are in a git repository.\n'));
    process.exit(1);
  }
  
  let diff;
  try {
    diff = execSync('git show HEAD', { encoding: 'utf-8' });
  } catch (err) {
    console.log(chalk.red('\n❌ Could not get commit diff\n'));
    process.exit(1);
  }
  
  const { apiKey, bot } = await getDefaultBot();
  
  const prompt = `Bu commit'i açıkla:\n\nCommit Info:\n${log}\n\nChanges:\n${diff}`;
  
  console.log(chalk.yellow('\n⏳ Explaining commit...\n'));
  
  try {
    const response = await sendMessage(apiKey, bot.id, prompt, null, '');
    const explanation = response.reply || response.message || 'No explanation';
    
    console.log(chalk.green('Commit Explanation:\n'));
    console.log(chalk.white(explanation));
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

async function getDefaultBot() {
  const { getConfig } = require('../utils/config');
  const config = getConfig();
  const apiKey = getApiKey() || config.providerApiKey || '';

  let botList;
  try {
    botList = await getBots(apiKey);
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }

  if (!botList || !botList.bots || botList.bots.length === 0) {
    console.log(chalk.gray('No bots found. Create one at https://developers.natureco.me\n'));
    process.exit(1);
  }

  // Config'deki botName ile eşleştir, yoksa ilk botu kullan
  const bot = botList.bots.find(b => b.name === config.botName) || botList.bots[0];

  return { apiKey, bot };
}

module.exports = git;
