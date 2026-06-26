/**
 * cross_session_memory - Oturumlar arasi hafiza (v5.3.1)
 *
 * Cross-session hafiza — oturumlar arasi baglam korur
 *
 * Ozellikler:
 *   - Tum session'lari tarihsel sirayla yukler
 *   - Memory fact'lerini otomatik ekler system prompt'a
 *   - /resume komutu onceki session'in context'ini getirir
 *   - Yeni session'da eski bilgilerden haberi olur
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const SESSION_DIR = path.join(os.homedir(), ".natureco", "sessions");
const MEMORY_DIR = path.join(os.homedir(), ".natureco", "memory");

function loadSession(id) {
  try {
    const file = path.join(SESSION_DIR, id.endsWith(".json") ? id : id + ".json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listSessions(limit = 20) {
  try {
    if (!fs.existsSync(SESSION_DIR)) return [];
    return fs.readdirSync(SESSION_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const stat = fs.statSync(path.join(SESSION_DIR, f));
          const data = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf8"));
          return {
            id: f.replace(".json", ""),
            startedAt: data.startedAt || stat.birthtime.toISOString(),
            messageCount: (data.messages || []).length,
            preview: (data.messages || [])
              .filter(m => m.role === "user")
              .slice(0, 2)
              .map(m => typeof m.content === "string" ? m.content.slice(0, 80) : "")
              .join(" | "),
          };
        } catch {
          return { id: f, error: "parse hatasi" };
        }
      })
      .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function getCrossSessionContext({ username = null, limit = 5, maxTokens = 800 } = {}) {
  const sessions = listSessions(limit);
  const contextParts = [];

  // Memory'den de ekle
  if (username) {
    const memFile = path.join(MEMORY_DIR, `${username.toLowerCase()}.json`);
    try {
      if (fs.existsSync(memFile)) {
        const mem = JSON.parse(fs.readFileSync(memFile, "utf8"));
        if (mem.facts && mem.facts.length > 0) {
          contextParts.push("KULLANICI HAFIZASI:\n" + mem.facts
            .slice(0, 10)
            .map(f => `- ${f.value || f}`)
            .join("\n"));
        }
        if (mem.botName) {
          contextParts.push(`Bot adin: ${mem.botName}`);
        }
      }
    } catch {}
  }

  // Son N session'dan user message'lari
  if (sessions.length > 0) {
    const recentTopics = sessions
      .map(s => s.preview)
      .filter(Boolean)
      .join("\n- ");
    if (recentTopics) {
      contextParts.push(`SON KONUŞMALAR:\n- ${recentTopics}`);
    }
  }

  const full = contextParts.join("\n\n");
  // Truncate
  if (full.length > maxTokens * 4) {
    return full.slice(0, maxTokens * 4) + "...";
  }
  return full;
}

async function crossSessionMemory({ action = "list", sessionId = null, username = null, contextFor = "system" } = {}) {
  if (action === "list") {
    const sessions = listSessions(20);
    return { success: true, count: sessions.length, sessions };
  }

  if (action === "load" && sessionId) {
    const sess = loadSession(sessionId);
    if (!sess) return { success: false, error: `Session bulunamadi: ${sessionId}` };
    return { success: true, session: sess };
  }

  if (action === "context") {
    // sessionId verilmediyse son oturumu kullan
    let resolvedSessionId = sessionId;
    if (!resolvedSessionId) {
      const sessions = listSessions(1);
      resolvedSessionId = sessions[0]?.id || null;
    }
    let sessionData = null;
    if (resolvedSessionId) {
      sessionData = loadSession(resolvedSessionId);
    }
    const context = getCrossSessionContext({ username });
    return {
      success: true,
      context,
      sessionId: resolvedSessionId,
      sessionMessageCount: sessionData ? (sessionData.messages || []).length : 0,
      sources: username ? ["memory", "sessions"] : ["sessions"],
      message: resolvedSessionId
        ? `Cross-session context yuklendi (${resolvedSessionId})`
        : "Cross-session context yuklendi",
    };
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: "cross_session_memory",
  description: "Oturumlar arasi hafiza: /resume, listele, memory'den context yukle. Kullanici hafta sonra gelince bile hatirlar.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "list/load/context", enum: ["list", "load", "context"] },
      sessionId: { type: "string", description: "Session ID (load icin)" },
      username: { type: "string", description: "Kullanici adi (memory filtreleme icin)" },
    },
    required: ["action"],
  },
  async execute(params) {
    return await crossSessionMemory(params);
  },
};