/**
 * todo_write — Task / todo manager.
 *
 * Upgrade (v5.7.1) modeled after Claude Code's TaskCreate/TaskUpdate/
 * TaskList semantics so the agent can track multi-step work like
 * `pending → in_progress → completed`, name an `activeForm` for the
 * spinner, and express dependencies via `blockedBy` / `blocks`.
 *
 * Backwards compatibility: every old action (list/add/done/remove/
 * clear) and the old `{content, priority, status: 'done'}` shape keeps
 * working byte-for-byte — see the test file for the locked-in shape.
 * The on-disk JSON gains new fields but old `{id, content, status,
 * priority, createdAt, completedAt}` entries are still read correctly.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeJsonAtomicSync, readJsonSafeSync } = require('../utils/atomic-file');

const TODO_FILE = path.join(os.homedir(), '.natureco', 'todos.json');

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'deleted']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

function _loadTodos() {
  const data = readJsonSafeSync(TODO_FILE, []);
  return Array.isArray(data) ? data : [];
}

function _saveTodos(todos) {
  fs.mkdirSync(path.dirname(TODO_FILE), { recursive: true });
  writeJsonAtomicSync(TODO_FILE, todos);
}

function _genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _normalizeStatus(s) {
  if (!s) return null;
  // accept legacy 'done' as alias for 'completed'
  if (s === 'done') return 'completed';
  return VALID_STATUSES.has(s) ? s : null;
}

function _normalizeTodo(t) {
  // Migrate old shape on the fly so listing always returns a uniform
  // structure even for entries written by v5.6 and earlier.
  return {
    id: t.id,
    subject: t.subject || t.content || '(no subject)',
    description: t.description || '',
    activeForm: t.activeForm || t.subject || t.content || '',
    status: _normalizeStatus(t.status) || 'pending',
    priority: VALID_PRIORITIES.has(t.priority) ? t.priority : 'medium',
    owner: t.owner || null,
    blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy : [],
    blocks: Array.isArray(t.blocks) ? t.blocks : [],
    metadata: (t.metadata && typeof t.metadata === 'object') ? t.metadata : {},
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
    completedAt: t.completedAt || null,
  };
}

function _isBlocked(todo, allTodos) {
  if (!todo.blockedBy || todo.blockedBy.length === 0) return false;
  const openIds = new Set(
    allTodos.filter(t => t.status !== 'completed' && t.status !== 'deleted').map(t => t.id),
  );
  return todo.blockedBy.some(id => openIds.has(id));
}

async function todoAction(params) {
  const action = params.action || 'list';
  let todos = _loadTodos().map(_normalizeTodo);

  // ─────────────────── LIST / GET ───────────────────
  if (action === 'list' || action === 'get') {
    if (action === 'get') {
      if (!params.id) return { success: false, error: 'id gerekli' };
      const t = todos.find(x => x.id === params.id);
      if (!t) return { success: false, error: `Todo bulunamadı: ${params.id}` };
      return { success: true, todo: t };
    }
    // Filter by status if specified
    const filtered = params.status
      ? todos.filter(t => t.status === _normalizeStatus(params.status))
      : todos.filter(t => t.status !== 'deleted');
    // Annotate with blockedBy state
    const annotated = filtered.map(t => ({
      ...t,
      currently_blocked: _isBlocked(t, todos),
    }));
    return {
      success: true,
      total: todos.filter(t => t.status !== 'deleted').length,
      pending: todos.filter(t => t.status === 'pending').length,
      in_progress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      todos: annotated,
    };
  }

  // ─────────────────── ADD / CREATE ───────────────────
  if (action === 'add' || action === 'create') {
    const subject = params.subject || params.content;
    if (!subject) return { success: false, error: 'subject (veya content) gerekli' };
    const todo = _normalizeTodo({
      id: _genId(),
      subject,
      description: params.description || '',
      activeForm: params.activeForm || subject,
      status: 'pending',
      priority: params.priority || 'medium',
      owner: params.owner || null,
      blockedBy: Array.isArray(params.blockedBy) ? params.blockedBy : [],
      blocks: Array.isArray(params.blocks) ? params.blocks : [],
      metadata: params.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    todos.push(todo);
    // Bidirectional link: if A blocks B, B is blockedBy A.
    for (const blockedId of todo.blocks) {
      const other = todos.find(t => t.id === blockedId);
      if (other && !other.blockedBy.includes(todo.id)) {
        other.blockedBy.push(todo.id);
        other.updatedAt = new Date().toISOString();
      }
    }
    _saveTodos(todos);
    return { success: true, todo, message: `Görev eklendi: ${subject}` };
  }

  // ─────────────────── UPDATE / START / DONE / REOPEN ───────────────────
  if (action === 'update' || action === 'start' || action === 'done' || action === 'completed' || action === 'reopen') {
    if (!params.id) return { success: false, error: 'id gerekli' };
    const idx = todos.findIndex(t => t.id === params.id);
    if (idx < 0) return { success: false, error: `Todo bulunamadı: ${params.id}` };

    const todo = todos[idx];

    if (action === 'start') {
      // Refuse to start if blocked
      if (_isBlocked(todo, todos)) {
        return {
          success: false,
          error: `Görev bloklu — şu açık görevler bitmeden başlayamaz: ${todo.blockedBy.join(', ')}`,
          blockedBy: todo.blockedBy,
        };
      }
      todo.status = 'in_progress';
    } else if (action === 'done' || action === 'completed') {
      todo.status = 'completed';
      todo.completedAt = new Date().toISOString();
    } else if (action === 'reopen') {
      todo.status = 'pending';
      todo.completedAt = null;
    } else if (action === 'update') {
      if (params.subject !== undefined) todo.subject = params.subject;
      if (params.description !== undefined) todo.description = params.description;
      if (params.activeForm !== undefined) todo.activeForm = params.activeForm;
      if (params.priority !== undefined && VALID_PRIORITIES.has(params.priority)) {
        todo.priority = params.priority;
      }
      if (params.status !== undefined) {
        const ns = _normalizeStatus(params.status);
        if (ns) todo.status = ns;
        if (ns === 'completed') todo.completedAt = new Date().toISOString();
      }
      if (params.owner !== undefined) todo.owner = params.owner;
      if (Array.isArray(params.addBlockedBy)) {
        for (const blockId of params.addBlockedBy) {
          if (!todo.blockedBy.includes(blockId)) todo.blockedBy.push(blockId);
        }
      }
      if (Array.isArray(params.addBlocks)) {
        for (const blockedId of params.addBlocks) {
          if (!todo.blocks.includes(blockedId)) todo.blocks.push(blockedId);
          const other = todos.find(t => t.id === blockedId);
          if (other && !other.blockedBy.includes(todo.id)) other.blockedBy.push(todo.id);
        }
      }
      if (params.metadata && typeof params.metadata === 'object') {
        for (const [k, v] of Object.entries(params.metadata)) {
          if (v === null) delete todo.metadata[k];
          else todo.metadata[k] = v;
        }
      }
    }
    todo.updatedAt = new Date().toISOString();
    _saveTodos(todos);
    return { success: true, todo, message: `Güncellendi: ${todo.subject}` };
  }

  // ─────────────────── REMOVE / CLEAR ───────────────────
  if (action === 'remove' || action === 'delete') {
    if (!params.id) return { success: false, error: 'id gerekli' };
    const before = todos.length;
    todos = todos.filter(t => t.id !== params.id);
    // Also clean up any blockedBy references that now point at nothing
    for (const t of todos) {
      t.blockedBy = t.blockedBy.filter(bid => todos.some(x => x.id === bid));
      t.blocks = t.blocks.filter(bid => todos.some(x => x.id === bid));
    }
    _saveTodos(todos);
    return { success: true, removed: before - todos.length };
  }

  if (action === 'clear') {
    const n = todos.length;
    _saveTodos([]);
    return { success: true, cleared: n, message: 'Tüm görevler temizlendi' };
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: 'todo_write',
  description:
    'Görev / todo yöneticisi. action: list, get, add (alias: create), ' +
    'update, start (pending→in_progress, blokluysa reddeder), ' +
    'done (alias: completed), reopen, remove (alias: delete), clear. ' +
    'Yeni alanlar: subject, description, activeForm (spinner için), ' +
    'priority, owner, blockedBy, blocks, metadata. Legacy {content, ' +
    'status: "done"} çağrıları hala geçerli.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'list / get / add / create / update / start / done / completed / reopen / remove / delete / clear',
        enum: ['list', 'get', 'add', 'create', 'update', 'start', 'done', 'completed', 'reopen', 'remove', 'delete', 'clear'],
      },
      id: { type: 'string', description: 'Görev ID (get/update/start/done/reopen/remove için)' },
      content: { type: 'string', description: 'LEGACY: subject ile aynı, geriye uyumluluk için tutuluyor' },
      subject: { type: 'string', description: 'Kısa başlık (zorunlu, add için)' },
      description: { type: 'string', description: 'Uzun açıklama (opsiyonel)' },
      activeForm: { type: 'string', description: 'Devam ederken gösterilen form (örn: "Testleri çalıştırıyor")' },
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'done', 'deleted'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      owner: { type: 'string', description: 'Atanan agent/kullanıcı adı' },
      blockedBy: { type: 'array', items: { type: 'string' }, description: 'Bu göreve önce tamamlanması gerekenler' },
      blocks: { type: 'array', items: { type: 'string' }, description: 'Bu görev tamamlanmadan başlayamayacaklar (ters yönlü blockedBy)' },
      addBlockedBy: { type: 'array', items: { type: 'string' }, description: 'update için: mevcut blockedBy listesine ekle' },
      addBlocks: { type: 'array', items: { type: 'string' }, description: 'update için: mevcut blocks listesine ekle' },
      metadata: { type: 'object', description: 'Arbitrary key/value notlar (update için: null ile sil)' },
    },
  },
  async execute(params) { return todoAction(params); },
  _internals: { todoAction, _normalizeTodo, _isBlocked, _genId, TODO_FILE },
};
