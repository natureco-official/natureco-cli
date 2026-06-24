/**
 * kanban - Kanban board, gorev yonetimi (v4.9.0)
 *
 * Hermes kanban'ina benzer. Durum bazli: todo, in_progress, done.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const KANBAN_FILE = path.join(os.homedir(), ".natureco", "kanban.json");

function loadBoard() {
  try {
    if (!fs.existsSync(KANBAN_FILE)) return { columns: { todo: [], in_progress: [], done: [] } };
    return JSON.parse(fs.readFileSync(KANBAN_FILE, "utf8"));
  } catch { return { columns: { todo: [], in_progress: [], done: [] } }; }
}

function saveBoard(board) {
  fs.mkdirSync(path.dirname(KANBAN_FILE), { recursive: true });
  fs.writeFileSync(KANBAN_FILE, JSON.stringify(board, null, 2), "utf8");
}

function genId() {
  return "k-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

async function kanbanOp({ action = "view", title, description = "", column = "todo", id, priority = "medium" }) {
  let board = loadBoard();

  if (action === "view" || action === "list") {
    const summary = Object.entries(board.columns).map(([col, items]) => ({
      column: col,
      count: items.length,
      items,
    }));
    return { success: true, summary };
  }

  if (action === "add") {
    if (!title) return { success: false, error: "title gerekli" };
    const card = { id: genId(), title, description, priority, createdAt: new Date().toISOString() };
    if (!board.columns[column]) board.columns[column] = [];
    board.columns[column].push(card);
    saveBoard(board);
    return { success: true, card, message: `"${title}" ${column} kolonuna eklendi` };
  }

  if (action === "move") {
    if (!id) return { success: false, error: "id gerekli" };
    let card;
    let fromCol;
    for (const [col, items] of Object.entries(board.columns)) {
      const idx = items.findIndex(c => c.id === id);
      if (idx >= 0) {
        card = items[idx];
        fromCol = col;
        items.splice(idx, 1);
        break;
      }
    }
    if (!card) return { success: false, error: `Kart bulunamadi: ${id}` };
    if (!board.columns[column]) board.columns[column] = [];
    board.columns[column].push(card);
    saveBoard(board);
    return { success: true, card, from: fromCol, to: column, message: `Tasindi: ${fromCol} -> ${column}` };
  }

  if (action === "remove") {
    if (!id) return { success: false, error: "id gerekli" };
    let removed = false;
    for (const items of Object.values(board.columns)) {
      const idx = items.findIndex(c => c.id === id);
      if (idx >= 0) { items.splice(idx, 1); removed = true; break; }
    }
    if (!removed) return { success: false, error: `Kart bulunamadi: ${id}` };
    saveBoard(board);
    return { success: true, message: "Kart silindi" };
  }

  if (action === "clear") {
    const cleared = Object.values(board.columns).reduce((s, c) => s + c.length, 0);
    saveBoard({ columns: { todo: [], in_progress: [], done: [] } });
    return { success: true, cleared, message: "Tum kartlar temizlendi" };
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: "kanban",
  description: "Kanban board: todo/in_progress/done kolonlarina kart ekle, tasi, sil. action: view/add/move/remove/clear.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "view/add/move/remove/clear (default: view)", enum: ["view", "add", "move", "remove", "clear"] },
      title: { type: "string", description: "Kart basligi (add icin)" },
      description: { type: "string", description: "Kart aciklamasi (add icin)" },
      column: { type: "string", description: "Kolon: todo/in_progress/done (default: todo)", enum: ["todo", "in_progress", "done"] },
      id: { type: "string", description: "Kart ID (move/remove icin)" },
      priority: { type: "string", description: "low/medium/high (add icin)", enum: ["low", "medium", "high"] },
    },
  },
  async execute(params) {
    return await kanbanOp(params);
  },
};