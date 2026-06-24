const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const { execSync } = require('child_process');
const { getConfig, setConfigValue } = require('../utils/config');
const { normalizeWindowsPaths } = require('../utils/path-utils');

/**
 * Normalize WhatsApp number from JID format to clean phone number
 * "905422842631:49@s.whatsapp.net" → "+905422842631"
 */
function normalizeWhatsAppNumber(target) {
  if (!target) return target;
  // Extract digits from JID format
  const match = target.match(/^(\d+)/);
  return match ? '+' + match[1] : target;
}

/**
 * Add unique fact to facts array (prevent duplicates)
 */
function addUniqueFact(facts, newFact) {
  const exists = facts.some(f => {
    const existingVal = typeof f === 'string' ? f : f.value;
    const newVal = typeof newFact === 'string' ? newFact : newFact.value;
    return existingVal === newVal;
  });
  
  if (!exists) {
    facts.push(newFact);
  }
}

async function migrate(options) {
  const from = options.from || 'openclaw';
  
  if (from === 'claude-code' || from === 'claude') {
    return migrateClaudeCode();
  }
  if (from === 'hermes') {
    return migrateHermes();
  }
  if (from !== 'openclaw') {
    console.log(chalk.red('\n❌ Desteklenen kaynaklar: openclaw, claude-code, hermes\n'));
    console.log(chalk.gray('Kullanım: natureco migrate --from openclaw'));
    console.log(chalk.gray('         natureco migrate --from claude-code'));
    console.log(chalk.gray('         natureco migrate --from hermes\n'));
    return;
  }
  
  console.log(chalk.yellow('\n⏳ OpenClaw → NatureCo migration başlıyor...\n'));
  
  // OpenClaw directory
  const openclawDir = options.openclawDir || path.join(os.homedir(), '.openclaw');
  
  if (!fs.existsSync(openclawDir)) {
    console.log(chalk.red(`❌ OpenClaw dizini bulunamadı: ${openclawDir}\n`));
    console.log(chalk.gray('--openclaw-dir ile farklı bir dizin belirtin.\n'));
    return;
  }
  
  console.log(chalk.cyan('OpenClaw dizini:'), chalk.white(openclawDir));
  console.log('');
  
  const report = {
    memory: null,
    crons: { total: 0, active: 0, inactive: 0 },
    telegram: null,
    whatsapp: false,
    scripts: 0,
    skills: 0,
  };
  
  // 1. Memory migration
  try {
    const userMdPath = path.join(openclawDir, 'workspace', 'USER.md');
    
    if (fs.existsSync(userMdPath)) {
      const userMd = fs.readFileSync(userMdPath, 'utf8');
      
      // Parse USER.md
      const nameMatch = userMd.match(/Name:\s*(.+)/i);
      const timezoneMatch = userMd.match(/Timezone:\s*(.+)/i);
      const notesMatch = userMd.match(/Notes:\s*(.+)/i);
      const nicknameMatch = userMd.match(/What to call them:\s*\*\*(.+?)\*\*/i);
      
      const memory = {
        name: nameMatch ? nameMatch[1].trim() : null,
        nickname: nicknameMatch ? nicknameMatch[1].trim() : null,
        botName: null, // Will be extracted from agents directory or MEMORY.md
        facts: []
      };
      
      // Clean markdown bold syntax (** Gencay → Gencay)
      if (memory.name) {
        memory.name = memory.name.replace(/\*\*/g, '').trim();
      }
      
      if (memory.nickname) {
        memory.nickname = memory.nickname.replace(/\*\*/g, '').trim();
      }
      
      // Extract botName from agents directory (primary method)
      // ~/.openclaw/agents/ichigo/ → botName = "İchigo"
      const agentsDir = path.join(openclawDir, 'agents');
      if (fs.existsSync(agentsDir)) {
        try {
          const agents = fs.readdirSync(agentsDir).filter(a => {
            const agentPath = path.join(agentsDir, a);
            return a !== 'main' && !a.startsWith('.') && fs.statSync(agentPath).isDirectory();
          });
          
          if (agents.length > 0) {
            // Capitalize first letter: ichigo → İchigo
            const agentName = agents[0];
            memory.botName = agentName.charAt(0).toUpperCase() + agentName.slice(1);
          }
        } catch (err) {
          // Silently fail if agents directory can't be read
        }
      }
      
      if (timezoneMatch) {
        let timezone = timezoneMatch[1].trim().replace(/\*\*/g, '').trim();
        addUniqueFact(memory.facts, {
          value: `Timezone: ${timezone}`,
          score: 6,
          updatedAt: new Date().toISOString().split('T')[0]
        });
      }
      
      if (notesMatch) {
        let notes = notesMatch[1].trim().replace(/\*\*/g, '').trim();
        addUniqueFact(memory.facts, {
          value: notes,
          score: 6,
          updatedAt: new Date().toISOString().split('T')[0]
        });
      }
      
      // Skip patterns for useless lines
      const skipPatterns = [
        /^\|/,                              // tablo satırları
        /^✅|^❌|^⚠️/,                       // emoji başlangıçlı
        /^npm |^npx |^firebase |^node /,   // komutlar
        /^Status:/,                         // status satırları
        /^#/                                // başlıklar
      ];
      
      const isUseful = (line) => !skipPatterns.some(p => p.test(line.trim()));
      
      // Migrate workspace/MEMORY.md and workspace/memory/*.md files
      const memoryMdFiles = [];
      
      // Add MEMORY.md if exists
      const mainMemoryPath = path.join(openclawDir, 'workspace', 'MEMORY.md');
      if (fs.existsSync(mainMemoryPath)) {
        memoryMdFiles.push(mainMemoryPath);
      }
      
      // Add memory/*.md files if directory exists (skip macOS metadata files)
      const memoryDirPath = path.join(openclawDir, 'workspace', 'memory');
      if (fs.existsSync(memoryDirPath)) {
        const memoryFiles = fs.readdirSync(memoryDirPath)
          .filter(f => f.endsWith('.md') && !f.startsWith('._'))  // skip ._MEMORY.md
          .map(f => path.join(memoryDirPath, f));
        memoryMdFiles.push(...memoryFiles);
      }
      
      // Process each memory file
      for (const file of memoryMdFiles) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          
          // Extract bot name from MEMORY.md (first file only)
          if (!memory.botName && file === mainMemoryPath) {
            // Try multiple patterns for bot name (avoid "İsim:" which is user's name)
            const botNamePatterns = [
              /(?:bot|asistan|assistant)\s*(?:adı|name|ismi)[\s:]+\*?\*?([A-ZÇĞİÖŞÜa-zçğıöşü]+)\*?\*?/i,  // Bot adı: İchigo
              /Ben[,\s]+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)[,\s]/,           // Ben, İchigo
              /Adım[,\s]+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/,              // Adım İchigo
              /Ben\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)['']?[ıi]m/        // Ben İchigo'yum
            ];
            
            for (const pattern of botNamePatterns) {
              const match = content.match(pattern);
              if (match) {
                memory.botName = match[1].trim().replace(/\*\*/g, '').trim();
                break;
              }
            }
          }
          
          // Extract meaningful lines (skip headers, empty lines, useless patterns)
          const lines = content.split('\n')
            .filter(l => l.trim() && !l.startsWith('#'))
            .map(l => l.replace(/^[-*•]\s*/, '').trim())
            .filter(l => l.length > 10)
            .filter(isUseful);
          
          // Add first 30 lines as facts (max 200 chars each)
          for (const line of lines.slice(0, 30)) {
            addUniqueFact(memory.facts, {
              value: line.slice(0, 200),
              score: 6,
              updatedAt: new Date().toISOString().split('T')[0]
            });
          }
        } catch (err) {
          // Skip file if error
          console.log(chalk.gray(`⚠️  ${path.basename(file)} okunamadı`));
        }
      }
      
      // Fallback: Extract botName from cron job names if still not found
      // "Ichigo Brain — 3 Saatlik Döngü" → "Ichigo"
      // "İchigo Briefing" → "İchigo"
      if (!memory.botName) {
        try {
          const cronJobsPath = path.join(openclawDir, 'cron', 'jobs.json');
          
          if (fs.existsSync(cronJobsPath)) {
            const cronData = JSON.parse(fs.readFileSync(cronJobsPath, 'utf8'));
            const jobs = cronData.jobs || cronData || [];
            
            // Skip words: generic names that are not bot names
            const skipWords = [
              'natureco', 'gmail', 'product', 'reddit', 'forum', 'main', 
              'twitter', 'weekly', 'daily', 'morning', 'natureco-', 'nco'
            ];
            
            for (const job of jobs) {
              if (!job.name) continue;
              
              // Extract first word (split by space, dash, or em-dash)
              const firstWord = job.name.split(/[\s\-—]/)[0];
              const firstWordLower = firstWord?.toLowerCase();
              
              // Check if valid: length > 3 and not in skip list
              if (firstWordLower && 
                  firstWordLower.length > 3 && 
                  !skipWords.some(s => firstWordLower.includes(s))) {
                // Keep original case (Ichigo or İchigo)
                memory.botName = firstWord;
                break;
              }
            }
          }
        } catch (err) {
          // Silently fail
        }
      }
      
      // Save to NatureCo memory
      const memoryDir = path.join(os.homedir(), '.natureco', 'memory');
      fs.mkdirSync(memoryDir, { recursive: true });
      
      // Save to universal-provider.json (primary)
      const memoryFile = path.join(memoryDir, 'universal-provider.json');
      fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
      
      // Also update universal-provider.json if it already exists (merge with existing data)
      try {
        const universalFile = path.join(memoryDir, 'universal-provider.json');
        if (fs.existsSync(universalFile)) {
          const universal = JSON.parse(fs.readFileSync(universalFile, 'utf8'));
          
          // Update name, botName, nickname if they exist in migration
          if (memory.name) universal.name = memory.name;
          if (memory.botName) universal.botName = memory.botName;
          if (memory.nickname) universal.nickname = memory.nickname;
          
          // Merge facts
          if (!universal.facts) universal.facts = [];
          for (const fact of (memory.facts || [])) {
            addUniqueFact(universal.facts, fact);
          }
          
          fs.writeFileSync(universalFile, JSON.stringify(universal, null, 2));
        }
      } catch (err) {
        // Silently fail if can't update universal-provider.json
      }
      
      // Also copy to all existing bot memory files
      try {
        const memoryFiles = fs.readdirSync(memoryDir)
          .filter(f => f.endsWith('.json') && f !== 'universal-provider.json');
        
        for (const file of memoryFiles) {
          const filePath = path.join(memoryDir, file);
          
          try {
            const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            // Add botName and nickname (don't overwrite if already exists)
            if (memory.botName && !existing.botName) {
              existing.botName = memory.botName;
            }
            if (memory.nickname && !existing.nickname) {
              existing.nickname = memory.nickname;
            }
            
            // Merge facts (avoid duplicates)
            if (!existing.facts) {
              existing.facts = [];
            }
            for (const fact of (memory.facts || [])) {
              addUniqueFact(existing.facts, fact);
            }
            
            // Save updated memory
            fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
          } catch (err) {
            // Skip file if error
            console.log(chalk.gray(`⚠️  ${file} güncellenemedi`));
          }
        }
        
        if (memoryFiles.length > 0) {
          console.log(chalk.green(`✅ Memory ${memoryFiles.length} bot dosyasına da kopyalandı`));
        }
      } catch (err) {
        // Silently fail if can't read memory directory
      }
      
      report.memory = memory;
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  Memory migration atlandı:', err.message));
  }
  
  // 1.5. Workspace scripts migration
  try {
    const scriptsSourceDir = path.join(openclawDir, 'workspace', 'scripts');
    
    if (fs.existsSync(scriptsSourceDir)) {
      const scriptsDestDir = path.join(os.homedir(), '.natureco', 'workspace', 'scripts');
      fs.mkdirSync(scriptsDestDir, { recursive: true });
      
      // Copy all files and fix paths
      const files = fs.readdirSync(scriptsSourceDir);
      
      for (const file of files) {
        const sourcePath = path.join(scriptsSourceDir, file);
        const destPath = path.join(scriptsDestDir, file);
        
        // Skip directories
        if (fs.statSync(sourcePath).isDirectory()) continue;
        
        // Read file content
        let content = fs.readFileSync(sourcePath, 'utf8');
        
        // Fix Windows paths in .js files
        if (file.endsWith('.js')) {
          content = normalizeWindowsPaths(content);
        }
        
        // Write fixed content
        fs.writeFileSync(destPath, content);
        report.scripts++;
      }
      
      // Create package.json for workspace scripts
      const workspaceDir = path.join(os.homedir(), '.natureco', 'workspace', 'scripts');
      const workspacePackageJson = {
        name: "natureco-workspace",
        version: "1.0.0",
        description: "NatureCo workspace scripts",
        dependencies: {
          "dotenv": "^16.0.0",
          "axios": "^1.0.0",
          "node-fetch": "^2.6.0",
          "googleapis": "^118.0.0",
          "playwright": "^1.40.0",
          "twitter-api-v2": "^1.15.0",
          "openai": "^4.0.0"
        }
      };
      
      fs.writeFileSync(
        path.join(workspaceDir, 'package.json'),
        JSON.stringify(workspacePackageJson, null, 2)
      );
      
      // Copy .env file (check multiple locations)
      const envSources = [
        path.join(openclawDir, 'workspace', 'scripts', '.env'),  // önce buraya bak
        path.join(openclawDir, '.env')                           // sonra buna
      ];
      const envDest = path.join(workspaceDir, '.env');
      
      for (const envSource of envSources) {
        if (fs.existsSync(envSource)) {
          fs.copyFileSync(envSource, envDest);
          console.log(chalk.green('✅ .env dosyası kopyalandı'));
          break;
        }
      }
      
      // Install npm packages
      console.log(chalk.yellow('\n📦 Workspace npm paketleri kuruluyor...\n'));
      try {
        execSync('npm install', { cwd: workspaceDir, stdio: 'inherit' });
        console.log(chalk.green('\n✅ npm paketleri kuruldu\n'));
      } catch (err) {
        console.log(chalk.yellow('\n⚠️  npm install başarısız, manuel olarak çalıştırın:\n'));
        console.log(chalk.cyan(`  cd ${workspaceDir} && npm install\n`));
      }
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  Workspace scripts migration atlandı:', err.message));
  }
  
  // 2. Cron jobs migration
  try {
    const cronJobsPath = path.join(openclawDir, 'cron', 'jobs.json');
    
    if (fs.existsSync(cronJobsPath)) {
      // OpenClaw cron format: { version: 1, jobs: [...] }
      const cronData = JSON.parse(fs.readFileSync(cronJobsPath, 'utf8'));
      const jobs = cronData.jobs || cronData || []; // jobs property or direct array
      
      // Get WhatsApp target from config
      const config = getConfig();
      const whatsappTarget = normalizeWhatsAppNumber(config.whatsappPhone) || '+905422842631'; // fallback
      
      const naturecoCrons = [];
      
      for (const job of jobs) {
        report.crons.total++;
        
        // Only migrate cron schedule (not "at" schedule)
        if (job.schedule?.kind !== 'cron') {
          continue;
        }
        
        if (!job.enabled) {
          report.crons.inactive++;
          continue;
        }
        
        report.crons.active++;
        
        // Determine action based on delivery channel
        let action = 'whatsapp'; // default
        let target = whatsappTarget;
        
        if (job.delivery?.channel === 'telegram') {
          action = 'telegram';
          // Get telegram target from config if available
          const telegramChats = config.telegramAllowedChats || [];
          target = telegramChats[0] || ''; // Use first allowed chat
        }
        
        // Get prompt (max 300 chars)
        let prompt = job.payload?.message || '';
        
        // Fix Windows paths in prompts (comprehensive)
        prompt = normalizeWindowsPaths(prompt);
        
        if (prompt.length > 300) {
          prompt = prompt.slice(0, 300);
        }
        
        naturecoCrons.push({
          name: job.name || 'Unnamed Job',
          schedule: job.schedule.expr,
          action: action,
          target: target, // Already normalized for WhatsApp
          prompt: prompt,
          enabled: true, // Enable migrated crons
        });
      }
      
      // Save to NatureCo crons
      const cronsFile = path.join(os.homedir(), '.natureco', 'crons.json');
      
      // Load existing crons and check for duplicates by name
      let existingCrons = [];
      if (fs.existsSync(cronsFile)) {
        existingCrons = JSON.parse(fs.readFileSync(cronsFile, 'utf8'));
      }
      
      // Filter out duplicates (check by name)
      const existingNames = existingCrons.map(c => c.name);
      const toAdd = naturecoCrons.filter(c => !existingNames.includes(c.name));
      
      // Merge without duplicates
      const mergedCrons = [...existingCrons, ...toAdd];
      fs.writeFileSync(cronsFile, JSON.stringify(mergedCrons, null, 2));
      
      // Update report with actual added count
      if (toAdd.length < naturecoCrons.length) {
        console.log(chalk.yellow(`⚠️  ${naturecoCrons.length - toAdd.length} cron zaten mevcut, atlandı`));
      }
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  Cron migration atlandı:', err.message));
  }
  
  // 3. Telegram allowFrom migration
  try {
    const telegramAllowPath = path.join(openclawDir, 'credentials', 'telegram-default-allowFrom.json');
    
    if (fs.existsSync(telegramAllowPath)) {
      const allowFrom = JSON.parse(fs.readFileSync(telegramAllowPath, 'utf8'));
      
      if (Array.isArray(allowFrom) && allowFrom.length > 0) {
        // Save to NatureCo config
        setConfigValue('telegramAllowedChats', allowFrom);
        report.telegram = allowFrom;
      }
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  Telegram allowFrom migration atlandı:', err.message));
  }
  
  // 4. WhatsApp session migration
  try {
    const whatsappSessionPath = path.join(openclawDir, 'credentials', 'whatsapp', 'default');
    
    if (fs.existsSync(whatsappSessionPath)) {
      const config = getConfig();
      const botId = config.defaultBotId || 'whatsapp_default';
      
      const naturecoSessionPath = path.join(os.homedir(), '.natureco', 'whatsapp-sessions', `whatsapp_${botId}`);
      
      // Copy directory recursively
      fs.mkdirSync(naturecoSessionPath, { recursive: true });
      copyDirRecursive(whatsappSessionPath, naturecoSessionPath);
      
      report.whatsapp = true;
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  WhatsApp session migration atlandı:', err.message));
  }
  
  // 5. Skills migration
  try {
    const openclawSkillsDir = path.join(openclawDir, 'workspace', 'skills');
    const naturecSkillsDir = path.join(os.homedir(), '.natureco', 'skills');
    
    if (fs.existsSync(openclawSkillsDir)) {
      fs.mkdirSync(naturecSkillsDir, { recursive: true });
      
      const skills = fs.readdirSync(openclawSkillsDir);
      
      for (const skill of skills) {
        const src = path.join(openclawSkillsDir, skill);
        const dst = path.join(naturecSkillsDir, skill);
        
        // Skip if not a directory
        if (!fs.statSync(src).isDirectory()) continue;
        
        // Copy directory recursively
        fs.cpSync(src, dst, { recursive: true });
        report.skills++;
      }
      
      if (report.skills > 0) {
        console.log(chalk.green(`✅ Skills: ${report.skills} skill migrate edildi`));
        console.log(chalk.gray(`   Konum: ~/.natureco/skills/`));
      }
    }
  } catch (err) {
    console.log(chalk.gray('⚠️  Skills migration atlandı:', err.message));
  }
  
  // Print migration report
  console.log(chalk.green('\n✅ Migration tamamlandı!\n'));
  
  if (report.memory) {
    // Extract string facts for display (handle both string and object formats)
    const factStrings = report.memory.facts
      .map(f => typeof f === 'string' ? f : f.value)
      .filter(f => f && f.length > 0)
      .slice(0, 3);  // Show first 3 facts
    
    const factsDisplay = factStrings.length > 0 ? `, ${factStrings.join(', ')}` : '';
    console.log(chalk.green('✅ Memory:'), chalk.white(`${report.memory.name || 'N/A'}${factsDisplay}`));
  }
  
  if (report.scripts > 0) {
    console.log(chalk.green('✅ Scripts:'), chalk.white(`${report.scripts} script kopyalandı ve path'ler güncellendi`));
  }
  
  if (report.crons.total > 0) {
    console.log(chalk.green('✅ Cron jobs:'), chalk.white(`${report.crons.total} job bulundu (${report.crons.active} aktif migrate edildi, ${report.crons.inactive} pasif atlandı)`));
  }
  
  if (report.telegram && report.telegram.length > 0) {
    console.log(chalk.green('✅ Telegram allowFrom:'), chalk.white(report.telegram.join(', ')));
  } else if (report.telegram !== null) {
    console.log(chalk.gray('⚠️  Telegram allowFrom: Bulunamadı'));
  }
  
  if (report.whatsapp) {
    console.log(chalk.green('✅ WhatsApp session kopyalandı'));
  }
  
  console.log('');
  console.log(chalk.yellow('⚠️  Manuel kurulum gerekli:'));
  console.log(chalk.gray('  - Provider URL ve API key ayarlayın:'));
  console.log(chalk.cyan('    natureco config set providerUrl https://api.groq.com/openai/v1'));
  console.log(chalk.cyan('    natureco config set providerApiKey gsk_xxx'));
  console.log(chalk.cyan('    natureco config set providerModel llama-3.3-70b-versatile'));
  console.log('');
}

/**
 * Copy directory recursively
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Claude Code Migration ──────────────────────────────────────────────────────
async function migrateClaudeCode() {
  console.log(chalk.yellow('\n⏳ Claude Code → NatureCo migration başlıyor...\n'));

  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeSettings = path.join(claudeDir, 'settings.json');
  const claudeProjects = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(claudeSettings)) {
    console.log(chalk.yellow('⚠ Claude Code settings bulunamadı: ~/.claude/settings.json\n'));
  } else {
    try {
      const settings = JSON.parse(fs.readFileSync(claudeSettings, 'utf-8'));
      console.log(chalk.gray('  Claude Code ayarları bulundu.\n'));

      // Migrate allowed tools
      if (settings.allowList?.length > 0) {
        const config = getConfig();
        if (!config.policies) config.policies = {};
        config.policies.claudeAllowedTools = settings.allowList;
        setConfigValue('policies', config.policies);
        console.log(chalk.green(`  ✅ ${settings.allowList.length} izinli araç migrate edildi`));
      }

      // Migrate permissions
      if (settings.permissions) {
        const config = getConfig();
        config.claudePermissions = settings.permissions;
        setConfigValue('claudePermissions', settings.permissions);
        console.log(chalk.green('  ✅ Claude izinleri migrate edildi'));
      }
    } catch (err) {
      console.log(chalk.red(`  ❌ Claude settings okuma hatası: ${err.message}`));
    }
  }

  // Migrate Claude projects
  if (fs.existsSync(claudeProjects)) {
    try {
      const projects = fs.readdirSync(claudeProjects).filter(f => {
        const p = path.join(claudeProjects, f);
        return fs.statSync(p).isDirectory() && !f.startsWith('.');
      });

      if (projects.length > 0) {
        console.log(chalk.gray(`\n  Claude projeleri bulundu: ${projects.length}\n`));
        const projectsDir = path.join(os.homedir(), '.natureco', 'claude-projects');
        fs.mkdirSync(projectsDir, { recursive: true });

        for (const project of projects) {
          const src = path.join(claudeProjects, project);
          const dst = path.join(projectsDir, project);
          if (!fs.existsSync(dst)) {
            fs.cpSync(src, dst, { recursive: true });
            console.log(chalk.green(`  ✅ Proje kopyalandı: ${project}`));
          } else {
            console.log(chalk.yellow(`  ⚠ Proje zaten var, atlandı: ${project}`));
          }
        }
      }
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Proje migrasyonu atlandı: ${err.message}`));
    }
  }

  // Migrate MEMORY.md if exists
  const memoryFile = path.join(claudeDir, '..', 'workspace', 'MEMORY.md');
  if (fs.existsSync(memoryFile)) {
    try {
      const content = fs.readFileSync(memoryFile, 'utf-8');
      const memory = {
        name: '',
        nickname: '',
        botName: '',
        facts: [{ value: 'Migrated from Claude Code', score: 5, updatedAt: new Date().toISOString() }],
        preferences: []
      };

      const lines = content.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes('name:')) {
          memory.name = line.split(':')[1]?.trim() || '';
        }
        if (line.toLowerCase().includes('preference:') || line.toLowerCase().includes('favorite:')) {
          memory.preferences.push({ value: line.split(':')[1]?.trim() || '', score: 5, updatedAt: new Date().toISOString() });
        }
      }

      const memoryDir = path.join(os.homedir(), '.natureco', 'memory');
      fs.mkdirSync(memoryDir, { recursive: true });
      fs.writeFileSync(path.join(memoryDir, 'universal-provider.json'), JSON.stringify(memory, null, 2));
      console.log(chalk.green('  ✅ Claude MEMORY.md migrate edildi'));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Memory migrasyonu atlandı: ${err.message}`));
    }
  }

  console.log(chalk.green('\n✅ Claude Code migration tamamlandı!\n'));
}

// ── Hermes Migration ──────────────────────────────────────────────────────────
async function migrateHermes() {
  console.log(chalk.yellow('\n⏳ Hermes → NatureCo migration başlıyor...\n'));

  const hermesDir = path.join(os.homedir(), '.hermes');
  const hermesConfig = path.join(hermesDir, 'config.json');
  const hermesSessions = path.join(hermesDir, 'sessions');

  if (!fs.existsSync(hermesDir)) {
    console.log(chalk.yellow('⚠ Hermes dizini bulunamadı: ~/.hermes\n'));
    return;
  }

  let migrated = { config: false, sessions: 0, memory: false };

  // Migrate config
  if (fs.existsSync(hermesConfig)) {
    try {
      const config = JSON.parse(fs.readFileSync(hermesConfig, 'utf-8'));

      const ncConfig = getConfig();
      if (config.provider) ncConfig.providerUrl = config.provider;
      if (config.model) ncConfig.providerModel = config.model;
      if (config.apiKey) ncConfig.providerApiKey = config.apiKey;
      if (config.systemPrompt) ncConfig.systemPrompt = config.systemPrompt;
      if (config.temperature !== undefined) ncConfig.temperature = config.temperature;

      setConfigValue('providerUrl', ncConfig.providerUrl);
      setConfigValue('providerModel', ncConfig.providerModel);
      if (config.apiKey) setConfigValue('providerApiKey', ncConfig.providerApiKey);
      if (config.systemPrompt) setConfigValue('systemPrompt', ncConfig.systemPrompt);
      if (config.temperature !== undefined) setConfigValue('temperature', ncConfig.temperature);

      migrated.config = true;
      console.log(chalk.green('  ✅ Hermes config migrate edildi'));
    } catch (err) {
      console.log(chalk.red(`  ❌ Config okuma hatası: ${err.message}`));
    }
  }

  // Migrate sessions
  if (fs.existsSync(hermesSessions)) {
    try {
      const sessions = fs.readdirSync(hermesSessions).filter(f => f.endsWith('.json'));
      const ncSessionsDir = path.join(os.homedir(), '.natureco', 'sessions');
      fs.mkdirSync(ncSessionsDir, { recursive: true });

      for (const session of sessions) {
        const src = path.join(hermesSessions, session);
        const dst = path.join(ncSessionsDir, `hermes-${session}`);
        if (!fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
          migrated.sessions++;
        }
      }

      if (migrated.sessions > 0) {
        console.log(chalk.green(`  ✅ ${migrated.sessions} Hermes oturumu migrate edildi`));
      }
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Session migrasyonu atlandı: ${err.message}`));
    }
  }

  // Migrate memory
  const hermesMemory = path.join(hermesDir, 'memory.json');
  if (fs.existsSync(hermesMemory)) {
    try {
      const memData = JSON.parse(fs.readFileSync(hermesMemory, 'utf-8'));
      const ncMemoryDir = path.join(os.homedir(), '.natureco', 'memory');
      fs.mkdirSync(ncMemoryDir, { recursive: true });

      const ncMem = {
        name: memData.userName || '',
        nickname: '',
        botName: 'Hermes',
        facts: [],
        preferences: []
      };

      if (memData.userInfo) {
        ncMem.facts.push({ value: memData.userInfo, score: 6, updatedAt: new Date().toISOString() });
      }
      if (memData.context) {
        ncMem.facts.push({ value: memData.context, score: 5, updatedAt: new Date().toISOString() });
      }

      fs.writeFileSync(path.join(ncMemoryDir, 'hermes-migrated.json'), JSON.stringify(ncMem, null, 2));
      migrated.memory = true;
      console.log(chalk.green('  ✅ Hermes hafızası migrate edildi'));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Memory migrasyonu atlandı: ${err.message}`));
    }
  }

  if (!migrated.config && migrated.sessions === 0 && !migrated.memory) {
    console.log(chalk.yellow('  ⚠ Hiçbir veri migrate edilemedi.\n'));
    return;
  }

  console.log(chalk.green('\n✅ Hermes migration tamamlandı!\n'));
}

module.exports = migrate;
