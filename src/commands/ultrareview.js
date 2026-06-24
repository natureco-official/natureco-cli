const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getApiKey, getConfig } = require('../utils/config');
const { getBots, sendMessage } = require('../utils/api');

const REVIEWS_DIR = path.join(os.homedir(), '.natureco', 'reviews');

async function ultrareview(filePath) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.log(chalk.red('\n❌ Not logged in. Run "natureco login" first.\n'));
    process.exit(1);
  }
  
  const config = getConfig();
  const defaultBotId = config.defaultBotId || config.botName || 'universal-provider';
  
  let botId = defaultBotId;
  try {
    const botList = await getBots(apiKey || config.providerApiKey);
    if (botList?.bots?.length > 0) {
      const matched = botList.bots.find(b => b.name === config.botName) || botList.bots[0];
      botId = matched.id;
    }
  } catch { /* fallback to defaultBotId */ }
  
  let code;
  let filename;
  
  // Read from file or stdin
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      console.log(chalk.red(`\n❌ File not found: ${filePath}\n`));
      process.exit(1);
    }
    code = fs.readFileSync(filePath, 'utf-8');
    filename = path.basename(filePath);
  } else {
    // Read from stdin
    console.log(chalk.yellow('Reading from stdin... (Ctrl+D to finish)\n'));
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    code = Buffer.concat(chunks).toString('utf-8');
    filename = 'stdin';
  }
  
  if (!code || code.trim().length === 0) {
    console.log(chalk.red('\n❌ No code provided\n'));
    process.exit(1);
  }
  
  console.log(chalk.yellow('\n⏳ Analyzing code...\n'));
  
  const prompt = `Aşağıdaki kodu çok detaylı incele ve şu kategorilerde analiz et:

1. **Güvenlik Açıkları** (1-10 puan)
   - SQL injection, XSS, CSRF, auth bypass
   - Input validation eksiklikleri
   - Sensitive data exposure

2. **Performans Sorunları** (1-10 puan)
   - N+1 query problemi
   - Memory leak riski
   - Blocking operations
   - Gereksiz hesaplamalar

3. **Kod Kalitesi** (1-10 puan)
   - SOLID prensipleri
   - DRY (Don't Repeat Yourself)
   - Complexity (cyclomatic)
   - Okunabilirlik

4. **Hata Yönetimi** (1-10 puan)
   - Unhandled exceptions
   - Missing validation
   - Error handling best practices

5. **Best Practices** (1-10 puan)
   - Naming conventions
   - Comments ve documentation
   - Test coverage potansiyeli
   - Code organization

6. **Potansiyel Bug'lar**
   - Edge case'ler
   - Race conditions
   - Null/undefined handling

Her kategori için:
- Puan ver (1-10)
- Sorunları listele
- Çözüm önerileri sun

Sonunda özet tablo göster.

\`\`\`
${code}
\`\`\``;
  
  try {
    const response = await sendMessage(apiKey || config.providerApiKey, botId, prompt, null, '');
    const review = response.reply || response.message || 'No response';
    
    console.log(chalk.green('\n📊 Ultra Review:\n'));
    console.log(chalk.white(review));
    console.log('');
    
    // Save to file
    if (!fs.existsSync(REVIEWS_DIR)) {
      fs.mkdirSync(REVIEWS_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reviewFilename = `${timestamp}-${filename}.md`;
    const reviewPath = path.join(REVIEWS_DIR, reviewFilename);
    
    const reviewContent = `# Ultra Review: ${filename}

**Date:** ${new Date().toLocaleString()}
**File:** ${filePath || 'stdin'}

---

${review}

---

## Original Code

\`\`\`
${code}
\`\`\`
`;
    
    fs.writeFileSync(reviewPath, reviewContent, 'utf-8');
    
    console.log(chalk.cyan('💾 Review saved:'), chalk.white(reviewPath));
    console.log('');
  } catch (err) {
    console.log(chalk.red(`\n❌ Error: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = ultrareview;
