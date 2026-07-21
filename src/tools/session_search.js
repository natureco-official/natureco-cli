const fs = require('fs');
const path = require('path');
const { foldTr } = require('../utils/tr-text');

const SESSIONS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || __dirname, '.natureco', 'sessions');

function getAllMessages() {
  const messages = [];
  if (!fs.existsSync(SESSIONS_DIR)) return messages;
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
      const sessionName = file.replace('.json', '');
      if (Array.isArray(data.messages)) {
        for (const msg of data.messages) {
          messages.push({ session: sessionName, role: msg.role, content: msg.content, timestamp: msg.timestamp || data.savedAt });
        }
      } else if (Array.isArray(data)) {
        for (const msg of data) {
          messages.push({ session: sessionName, role: msg.role, content: msg.content, timestamp: msg.timestamp });
        }
      }
    } catch {}
  }
  return messages;
}

async function sessionSearch(params) {
  const { query, session, limit = 10 } = params;
  if (!query) return { success: false, error: 'query gerekli' };

  const allMessages = getAllMessages();
  const filtered = session ? allMessages.filter(m => m.session === session) : allMessages;
  const q = foldTr(query);

  const results = filtered
    .filter(m => m.content && foldTr(m.content).includes(q))
    .slice(0, limit)
    .map(m => ({
      session: m.session,
      role: m.role,
      snippet: m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content,
      timestamp: m.timestamp,
    }));

  return { success: true, query, totalMatches: results.length, results, searchedSessions: session ? [session] : undefined };
}

module.exports = {
  name: 'session_search',
  description: 'Gecmis oturumlarda metin aramasi: tum oturumlar veya belirli bir oturum icinde ara.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Aranacak metin' },
      session: { type: 'string', description: 'Opsiyonel: belirli bir oturum (dosya adi)' },
      limit: { type: 'number', description: 'Maksimum sonuc sayisi (default: 10)' },
    },
    required: ['query'],
  },
  async execute(params) { return await sessionSearch(params); },
};
