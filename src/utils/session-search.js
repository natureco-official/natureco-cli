/**
 * session-search — Full-text search across past sessions
 *
 * Sessions are stored in .natureco/sessions/ as JSON files.
 * This utility indexes and searches them by keyword.
 */

const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(process.cwd(), '.natureco', 'sessions');

function getSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const p = path.join(SESSIONS_DIR, f);
      try {
        return { id: f.replace('.json', ''), mtime: fs.statSync(p).mtimeMs, path: p };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

function search(query, maxResults = 10) {
  const q = query.toLowerCase();
  const results = [];
  const sessions = getSessions();

  for (const session of sessions) {
    try {
      const data = JSON.parse(fs.readFileSync(session.path, 'utf8'));
      const messages = data.messages || [];
      let score = 0;
      const matches = [];

      for (const msg of messages) {
        const content = (msg.content || '').toLowerCase();
        if (content.includes(q)) {
          score++;
          const snippet = content.slice(
            Math.max(0, content.indexOf(q) - 40),
            content.indexOf(q) + q.length + 40
          );
          matches.push({ role: msg.role, snippet });
        }
      }

      if (score > 0) {
        results.push({
          id: session.id,
          date: new Date(session.mtime).toISOString(),
          score,
          matches: matches.slice(0, 5),
          firstMessage: data.messages?.[1]?.content?.slice(0, 80) || '',
        });
      }
    } catch {}
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

module.exports = { search, getSessions };
