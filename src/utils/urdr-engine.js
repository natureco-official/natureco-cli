const NODE_MAJOR = Number.parseInt(process.versions.node.split('.')[0], 10);

let importProbe;
let searchProbe;
let reconcileProbe;

function loadUrdr() {
  if (!importProbe) {
    // Only memoize a SUCCESSFUL import. A transient failure (e.g. disk/AV contention on a slow
    // CI runner, or a cold-start hiccup in a real long-running process) must not permanently
    // poison the engine for the rest of the process's lifetime — retry on the next call instead.
    importProbe = import('urdr-mcp-server/scripts/append.mjs')
      .then((mod) => {
        if (typeof mod.appendLeaf !== 'function') throw new Error('appendLeaf export is missing');
        return { mod, error: null };
      })
      .catch((error) => {
        importProbe = null;
        return { mod: null, error };
      });
  }
  return importProbe;
}

function loadReconcile() {
  if (!reconcileProbe) {
    reconcileProbe = import('urdr-mcp-server/scripts/lib/transaction.mjs')
      .then((mod) => {
        if (typeof mod.reconcileMarkdown !== 'function') throw new Error('reconcileMarkdown export is missing');
        return mod.reconcileMarkdown;
      })
      .catch((error) => {
        reconcileProbe = null;
        throw error;
      });
  }
  return reconcileProbe;
}

function loadUrdrSearch() {
  if (!searchProbe) {
    searchProbe = import('urdr-mcp-server/scripts/search.mjs')
      .then((mod) => {
        if (typeof mod.searchMemory !== 'function') throw new Error('searchMemory export is missing');
        return { mod, error: null };
      })
      .catch((error) => {
        searchProbe = null;
        return { mod: null, error };
      });
  }
  return searchProbe;
}

function mode() {
  const value = String(process.env.NATURECO_MEMORY_ENGINE || '').toLowerCase();
  return value === 'urdr' || value === 'legacy' ? value : 'auto';
}

async function resolveEngine() {
  const selected = mode();
  if (selected === 'legacy') {
    return { mod: null, reason: 'forced by NATURECO_MEMORY_ENGINE=legacy' };
  }
  if (selected === 'auto' && NODE_MAJOR < 22) {
    return { mod: null, reason: 'Node.js 22+ required for automatic Urdr activation' };
  }

  const loaded = await loadUrdr();
  if (loaded.mod) return { mod: loaded.mod, reason: selected === 'urdr' ? 'forced and available' : 'available' };

  const detail = loaded.error?.message || 'dynamic import failed';
  if (selected === 'urdr') {
    throw new Error(`Urdr memory engine was forced but is unavailable: ${detail}`, { cause: loaded.error });
  }
  return { mod: null, reason: `Urdr import unavailable: ${detail}` };
}

async function urdrAppendLeaf(memoryDir, rootFile, branch, leafText) {
  const resolved = await resolveEngine();
  if (!resolved.mod) return null;
  try {
    return resolved.mod.appendLeaf(memoryDir, rootFile, branch, leafText);
  } catch (error) {
    if (error?.code !== 'URDR_DIRTY_VIEW') throw error;
    const reconcileMarkdown = await loadReconcile();
    const reconciliation = reconcileMarkdown(memoryDir);
    if (reconciliation.status === 'conflict') {
      throw new Error(`Urdr reconciliation conflict: ${reconciliation.conflicts.length} conflict(s)`, { cause: error });
    }
    return resolved.mod.appendLeaf(memoryDir, rootFile, branch, leafText);
  }
}

async function urdrSearch(memoryDir, query, opts = {}) {
  const resolved = await resolveEngine();
  if (!resolved.mod) return null;

  const loaded = await loadUrdrSearch();
  if (loaded.mod) return loaded.mod.searchMemory(memoryDir, query, opts);

  const detail = loaded.error?.message || 'dynamic import failed';
  if (mode() === 'urdr') {
    throw new Error(`Urdr search engine was forced but is unavailable: ${detail}`, { cause: loaded.error });
  }
  return null;
}

async function describeEngine() {
  try {
    const resolved = await resolveEngine();
    return {
      engine: resolved.mod ? 'urdr' : 'legacy',
      reason: resolved.reason,
      nodeVersion: process.version,
    };
  } catch (error) {
    return { engine: 'legacy', reason: error.message, nodeVersion: process.version };
  }
}

module.exports = { urdrAppendLeaf, urdrSearch, describeEngine };
