const fs = require('fs');
const crypto = require('crypto');

const FILE_STATES = new Map();

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return null; }
}

async function fileState(params) {
  const { action, file, path: filePath } = params;
  const targetFile = file || filePath;
  if (!targetFile) return { success: false, error: 'file gerekli' };

  if (action === 'track') {
    if (!fs.existsSync(targetFile)) return { success: false, error: 'Dosya bulunamadi: ' + targetFile };
    const hash = hashFile(targetFile);
    FILE_STATES.set(targetFile, { hash, mtime: fs.statSync(targetFile).mtimeMs, trackedAt: Date.now() });
    return { success: true, file: targetFile, hash, status: 'tracking' };
  }

  if (action === 'check') {
    if (!FILE_STATES.has(targetFile)) return { success: false, error: 'Dosya takip edilmiyor. Once track kullanin.' };
    const prev = FILE_STATES.get(targetFile);
    if (!fs.existsSync(targetFile)) return { success: true, file: targetFile, status: 'deleted', previous: prev };
    const current = { hash: hashFile(targetFile), mtime: fs.statSync(targetFile).mtimeMs };
    const changed = current.hash !== prev.hash;
    FILE_STATES.set(targetFile, { ...current, trackedAt: prev.trackedAt });
    return { success: true, file: targetFile, changed, status: changed ? 'modified' : 'unchanged', previous: prev.hash, current: current.hash };
  }

  if (action === 'list') {
    const entries = [];
    for (const [f, state] of FILE_STATES) {
      const exists = fs.existsSync(f);
      entries.push({ file: f, trackedAt: new Date(state.trackedAt).toISOString(), exists, hash: exists ? hashFile(f) : null });
    }
    return { success: true, tracked: entries };
  }

  if (action === 'untrack') {
    FILE_STATES.delete(targetFile);
    return { success: true, message: targetFile + ' takipten cikarildi' };
  }

  if (action === 'diff') {
    if (!FILE_STATES.has(targetFile)) return { success: false, error: 'Dosya takip edilmiyor' };
    if (!fs.existsSync(targetFile)) return { success: false, error: 'Dosya bulunamadi' };
    const prev = FILE_STATES.get(targetFile);
    const current = hashFile(targetFile);
    return { success: true, file: targetFile, changed: current !== prev.hash, oldHash: prev.hash, newHash: current };
  }

  return { success: false, error: 'Gecersiz action: ' + action };
}

module.exports = {
  name: 'file_state',
  description: 'Dosya degisiklik takibi: track/check/list/untrack/diff. Hash bazli degisim tespiti.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'track, check, list, untrack, diff', enum: ['track', 'check', 'list', 'untrack', 'diff'] },
      file: { type: 'string', description: 'Dosya yolu' },
      path: { type: 'string', description: 'Alternatif dosya yolu (file ile ayni)' },
    },
    required: ['action'],
  },
  async execute(params) { return await fileState(params); },
};
