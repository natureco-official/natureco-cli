const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const MEMORY_DIR = path.join(CONFIG_DIR, 'memory');

// Ensure memory directory exists
function ensureMemoryDir() {
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

// Get memory file path for a bot
function getMemoryFilePath(botId) {
  ensureMemoryDir();
  return path.join(MEMORY_DIR, `${botId}.json`);
}

// Load memory for a bot
function loadMemory(botId) {
  const filePath = getMemoryFilePath(botId);
  
  if (!fs.existsSync(filePath)) {
    return {
      name: '',
      nickname: '',
      botName: '',
      preferences: [],
      facts: [],
      lastSeen: null,
    };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Return with safe defaults for all fields
    const memory = {
      name: data.name || '',
      nickname: data.nickname || '',
      botName: data.botName || '',
      preferences: data.preferences || [],
      facts: data.facts || [],
      lastSeen: data.lastSeen || null,
    };
    
    // Migrate old format to new format - check each item individually
    if (Array.isArray(memory.preferences)) {
      memory.preferences = memory.preferences.map(p => {
        if (typeof p === 'string') return { value: p, score: 5, updatedAt: new Date().toISOString() };
        return p; // already correct format
      });
    }
    
    if (Array.isArray(memory.facts)) {
      memory.facts = memory.facts.map(f => {
        if (typeof f === 'string') {
          return { value: f, score: 5, updatedAt: new Date().toISOString() };
        }
        if (f && typeof f === 'object' && typeof f.value === 'object') {
          // Nested object: {value: {value: "...", score: 6}} → flatten
          return {
            value: f.value.value || '',
            score: f.value.score || 5,
            updatedAt: f.value.updatedAt || new Date().toISOString()
          };
        }
        return f; // already correct format
      }).filter(f => f && f.value && typeof f.value === 'string' && f.value.length > 0);
    }
    
    return memory;
  } catch {
    return {
      name: '',
      nickname: '',
      botName: '',
      preferences: [],
      facts: [],
      lastSeen: null,
    };
  }
}

// Save memory for a bot
function saveMemory(botId, memory) {
  const filePath = getMemoryFilePath(botId);
  
  try {
    memory.lastSeen = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(memory, null, 2), 'utf8');
  } catch (err) {
    // Silently fail - memory is not critical
  }
}

// Add memory entry with scoring
function addMemoryEntry(botId, key, value) {
  const memory = loadMemory(botId);
  const now = new Date().toISOString();
  
  if (key === 'name') {
    memory.name = value;
  } else if (key === 'nickname') {
    memory.nickname = value;
  } else if (key === 'botName') {
    memory.botName = value;
  } else if (key === 'preference') {
    // Check for duplicate
    const existing = memory.preferences.find(p => p.value.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.score = Math.min(existing.score + 1, 10);
      existing.updatedAt = now;
    } else {
      memory.preferences.push({ value, score: 5, updatedAt: now });
    }
  } else if (key === 'fact') {
    // Check for duplicate
    const existing = memory.facts.find(f => f.value.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.score = Math.min(existing.score + 1, 10);
      existing.updatedAt = now;
    } else {
      memory.facts.push({ value, score: 5, updatedAt: now });
    }
  }
  
  // Decay old entries
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  memory.preferences = memory.preferences.map(p => {
    const age = new Date(p.updatedAt);
    if (age < sixMonthsAgo) {
      p.score = Math.max(p.score - 1, 1);
    }
    return p;
  }).filter(p => p.score > 0);
  
  memory.facts = memory.facts.map(f => {
    const age = new Date(f.updatedAt);
    if (age < sixMonthsAgo) {
      f.score = Math.max(f.score - 1, 1);
    }
    return f;
  }).filter(f => f.score > 0);
  
  saveMemory(botId, memory);
}

// Extract memory from message (simple keyword extraction)
function extractMemoryFromMessage(message) {
  const extracted = [];
  
  // Question words that should NOT trigger name extraction
  const questionWords = ['ne', 'kim', 'nasıl', 'neden', 'niçin', 'nerede', 'nereye', 'nereden', 'hangi', 'kaç', 'ne zaman'];
  
  // Check if message is a question
  const isQuestion = questionWords.some(q => message.toLowerCase().includes(q)) || message.includes('?');
  
  // Bot name patterns: "senin adın X", "sana X diyeceğim", "adın X olsun"
  const botNamePatterns = [
    /senin\s+ad[ıi]n\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/i,
    /sana\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s+diyece[ğg]im/i,
    /ad[ıi]n\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s+olsun/i,
    /seni\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s+olarak\s+çağ[ıi]raca[ğg][ıi]m/i,
  ];
  
  for (const pattern of botNamePatterns) {
    const match = message.match(pattern);
    if (match) {
      extracted.push({ key: 'botName', value: match[1] });
      break;
    }
  }
  
  // Name patterns: "adım X", "ben X'im", "ismim X", "benim adım X"
  // Only extract if NOT a question
  if (!isQuestion) {
    const namePatterns = [
      /benim\s+ad[ıi]m\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/i,
      /ad[ıi]m\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/i,
      /ben\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)['']?[ıi]?m/i,
      /[iı]smim\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match) {
        extracted.push({ key: 'name', value: match[1] });
        break;
      }
    }
  }
  
  // Location patterns: "X'te yaşıyorum", "X'de yaşıyorum"
  const locationPatterns = [
    /([A-ZÇĞİÖŞÜ][a-zçğıöşü]+)['']?[td]e\s+ya[şs][ıi]yorum/i,
  ];
  
  for (const pattern of locationPatterns) {
    const match = message.match(pattern);
    if (match) {
      extracted.push({ key: 'fact', value: `${match[1]}'de yaşıyor` });
    }
  }
  
  // Profession patterns: "ben X'im", "X olarak çalışıyorum"
  const professionKeywords = ['yazılımcı', 'developer', 'öğrenci', 'öğretmen', 'mühendis', 'doktor'];
  for (const keyword of professionKeywords) {
    if (message.toLowerCase().includes(keyword)) {
      extracted.push({ key: 'fact', value: keyword.charAt(0).toUpperCase() + keyword.slice(1) });
    }
  }
  
  return extracted;
}

// Get memory as system prompt (sorted by score)
function getMemoryPrompt(botId) {
  const memory = loadMemory(botId);
  
  // Safe defaults for all fields
  const name = memory.name || '';
  const nickname = memory.nickname || '';
  const botName = memory.botName || '';
  const preferences = memory.preferences || [];
  const facts = memory.facts || [];
  
  const parts = [];
  
  // Check if there's any content to add
  if (!name && !nickname && !botName && preferences.length === 0 && facts.length === 0) {
    return '';
  }
  
  // Add user memory section — compact single line format
  if (name || nickname || preferences.length > 0 || facts.length > 0) {
    const memParts = [];
    if (name) memParts.push(`user:${name}`);
    if (nickname) memParts.push(`nick:${nickname}`);
    
    if (preferences.length > 0) {
      const sorted = preferences.sort((a, b) => b.score - a.score);
      memParts.push(`prefs:${sorted.map(p => p.value).join('|')}`);
    }
    
    if (facts.length > 0) {
      // Normalize all facts to objects with score, then sort and limit to 8
      const topFacts = facts
        .map(f => {
          if (typeof f === 'string') return { value: f, score: 5 };
          if (f && typeof f === 'object') return { value: f.value || '', score: f.score || 5 };
          return null;
        })
        .filter(f => f && f.value && f.value.length > 0)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 8)
        .map(f => f.value);
      
      if (topFacts.length > 0) {
        memParts.push(`facts:${topFacts.join('|')}`);
      }
    }

    if (memParts.length > 0) {
      parts.push(`[mem] ${memParts.join(' ')}`);
    }
  }
  
  return parts.join('\n');
}

// Clear memory for a bot
function clearMemory(botId) {
  const filePath = getMemoryFilePath(botId);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// ── Memory Wiki (structured pages) ──────────────────────────────────────────────

const MEMORY_WIKI_DIR = path.join(CONFIG_DIR, 'memory-wiki');

function ensureWikiDir() {
  if (!fs.existsSync(MEMORY_WIKI_DIR)) {
    fs.mkdirSync(MEMORY_WIKI_DIR, { recursive: true });
  }
}

function getWikiPage(slug) {
  ensureWikiDir();
  const file = path.join(MEMORY_WIKI_DIR, `${slug.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function saveWikiPage(slug, content) {
  ensureWikiDir();
  const file = path.join(MEMORY_WIKI_DIR, `${slug.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify({ slug, content, updatedAt: new Date().toISOString() }, null, 2));
}

function listWikiPages() {
  ensureWikiDir();
  return fs.readdirSync(MEMORY_WIKI_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(MEMORY_WIKI_DIR, f), 'utf-8'));
        return { slug: data.slug || f.replace('.json', ''), content: data.content || '', updatedAt: data.updatedAt };
      } catch { return null; }
    })
    .filter(Boolean);
}

function searchWikiPages(query) {
  const pages = listWikiPages();
  const q = query.toLowerCase();
  return pages.filter(p =>
    p.slug.toLowerCase().includes(q) ||
    p.content.toLowerCase().includes(q)
  );
}

// ── Semantic Memory Search ─────────────────────────────────────────────────────

function semanticSearchMemory(query, limit = 5) {
  const results = [];
  const q = query.toLowerCase();

  if (!fs.existsSync(MEMORY_DIR)) return results;

  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const botId = file.replace('.json', '');
    const mem = loadMemory(botId);

    // Score each fact by relevance
    const scored = (mem.facts || [])
      .map(f => {
        const val = typeof f === 'string' ? f : f.value || '';
        const words = q.split(/\s+/).filter(Boolean);
        const matches = words.filter(w => val.toLowerCase().includes(w)).length;
        const score = words.length > 0 ? matches / words.length : 0;
        const boost = typeof f === 'object' ? (f.score || 5) / 10 : 0.5;
        return { bot: mem.botName || botId, value: val, score: score * 0.7 + boost * 0.3 };
      })
      .filter(f => f.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    results.push(...scored);
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Memory Categories ──────────────────────────────────────────────────────────

const MEMORY_CATEGORIES = {
  personal: { label: 'Kişisel Bilgiler', icon: '👤' },
  work: { label: 'İş/Okul', icon: '💼' },
  preferences: { label: 'Tercihler', icon: '⭐' },
  health: { label: 'Sağlık', icon: '❤️' },
  social: { label: 'Sosyal', icon: '👥' },
  goals: { label: 'Hedefler', icon: '🎯' },
  projects: { label: 'Projeler', icon: '📁' },
  general: { label: 'Genel', icon: '📝' }
};

function addMemoryEntryWithCategory(botId, key, value, category = 'general') {
  const memory = loadMemory(botId);
  const now = new Date().toISOString();
  const validCategory = MEMORY_CATEGORIES[category] ? category : 'general';

  if (key === 'name') { memory.name = value; }
  else if (key === 'nickname') { memory.nickname = value; }
  else if (key === 'botName') { memory.botName = value; }
  else if (key === 'preference') {
    const existing = memory.preferences.find(p => p.value.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.score = Math.min(existing.score + 1, 10);
      existing.updatedAt = now;
    } else {
      memory.preferences.push({ value, score: 5, updatedAt: now, category: validCategory });
    }
  } else {
    const existing = memory.facts.find(f => f.value.toLowerCase() === value.toLowerCase());
    if (existing) {
      existing.score = Math.min(existing.score + 1, 10);
      existing.updatedAt = now;
      if (!existing.category) existing.category = validCategory;
    } else {
      memory.facts.push({ value, score: 5, updatedAt: now, category: validCategory });
    }
  }

  // Decay old entries
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  memory.preferences = memory.preferences.map(p => {
    const age = new Date(p.updatedAt);
    if (age < sixMonthsAgo) p.score = Math.max(p.score - 1, 1);
    return p;
  }).filter(p => p.score > 0);

  memory.facts = memory.facts.map(f => {
    const age = new Date(f.updatedAt);
    if (age < sixMonthsAgo) f.score = Math.max(f.score - 1, 1);
    return f;
  }).filter(f => f.score > 0);

  saveMemory(botId, memory);
}

// ── Memory Import/Export ───────────────────────────────────────────────────────

function exportMemory(botId) {
  return loadMemory(botId);
}

function importMemory(botId, data) {
  const current = loadMemory(botId);
  const merged = {
    name: data.name || current.name,
    nickname: data.nickname || current.nickname,
    botName: data.botName || current.botName,
    preferences: [...(current.preferences || []), ...(data.preferences || [])],
    facts: [...(current.facts || []), ...(data.facts || [])],
    lastSeen: current.lastSeen
  };
  saveMemory(botId, merged);
}

// ── Active Memory (pre-prompt injection) ──────────────────────────────────────

function getActiveMemoryPrompt(botId, messageContext = '') {
  const memory = loadMemory(botId);
  const facts = memory.facts || [];
  const prefs = memory.preferences || [];

  if (facts.length === 0 && prefs.length === 0 && !memory.name) return '';

  // Score facts by relevance to current context
  const contextWords = messageContext.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const scored = facts
    .map(f => {
      let relevance = 0;
      if (contextWords.length > 0) {
        const val = (f.value || '').toLowerCase();
        relevance = contextWords.filter(w => val.includes(w)).length / contextWords.length;
      }
      return { ...f, relevance };
    })
    .sort((a, b) => (b.score || 0) + b.relevance - (a.score || 0) - a.relevance)
    .slice(0, 5);

  const parts = [];
  if (memory.name) parts.push(`👤 ${memory.name}`);
  if (memory.nickname) parts.push(`🏷 ${memory.nickname}`);
  if (scored.length > 0) {
    parts.push('📌 ' + scored.map(f => f.value).join(' | '));
  }

  return parts.length > 0 ? `<active_memory>\n${parts.join('\n')}\n</active_memory>` : '';
}

module.exports = {
  loadMemory,
  saveMemory,
  addMemoryEntry,
  addMemoryEntryWithCategory,
  extractMemoryFromMessage,
  getMemoryPrompt,
  getActiveMemoryPrompt,
  clearMemory,
  semanticSearchMemory,
  exportMemory,
  importMemory,
  // Wiki
  getWikiPage,
  saveWikiPage,
  listWikiPages,
  searchWikiPages,
  MEMORY_CATEGORIES,
};
