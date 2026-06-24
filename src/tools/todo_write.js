/**
 * todo_write - Yapilacaklar listesi (v4.9.0)
 *
 * Hermes todo_write'una benzer.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const TODO_FILE = path.join(os.homedir(), ".natureco", "todos.json");

function loadTodos() {
  try {
    if (!fs.existsSync(TODO_FILE)) return [];
    return JSON.parse(fs.readFileSync(TODO_FILE, "utf8"));
  } catch { return []; }
}

function saveTodos(todos) {
  fs.mkdirSync(path.dirname(TODO_FILE), { recursive: true });
  fs.writeFileSync(TODO_FILE, JSON.stringify(todos, null, 2), "utf8");
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function todoAction({ action = "list", content, id, priority = "medium", status }) {
  let todos = loadTodos();

  if (action === "list") {
    const pending = todos.filter(t => t.status === "pending");
    const done = todos.filter(t => t.status === "done");
    return { success: true, total: todos.length, pending: pending.length, done: done.length, todos: pending };
  }

  if (action === "add") {
    if (!content) return { success: false, error: "content gerekli" };
    const todo = { id: genId(), content, priority, status: "pending", createdAt: new Date().toISOString() };
    todos.push(todo);
    saveTodos(todos);
    return { success: true, todo, message: `Todo eklendi: ${content}` };
  }

  if (action === "done") {
    if (!id) return { success: false, error: "id gerekli" };
    const todo = todos.find(t => t.id === id);
    if (!todo) return { success: false, error: `Todo bulunamadi: ${id}` };
    todo.status = "done";
    todo.completedAt = new Date().toISOString();
    saveTodos(todos);
    return { success: true, todo, message: `Tamamlandi: ${todo.content}` };
  }

  if (action === "remove") {
    if (!id) return { success: false, error: "id gerekli" };
    const before = todos.length;
    todos = todos.filter(t => t.id !== id);
    saveTodos(todos);
    return { success: true, removed: before - todos.length };
  }

  if (action === "clear") {
    saveTodos([]);
    return { success: true, cleared: todos.length, message: "Tum todolar temizlendi" };
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: "todo_write",
  description: "Yapilacaklar listesi. action: list, add, done, remove, clear.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "list/add/done/remove/clear (default: list)", enum: ["list", "add", "done", "remove", "clear"] },
      content: { type: "string", description: "Todo icerigi (add icin)" },
      id: { type: "string", description: "Todo ID (done/remove icin)" },
      priority: { type: "string", description: "Oncelik: low/medium/high (add icin)", enum: ["low", "medium", "high"] },
      status: { type: "string", description: "Durum filtresi: pending/done" },
    },
  },
  async execute(params) {
    return await todoAction(params);
  },
};