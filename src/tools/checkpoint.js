const fs = require('fs');
const path = require('path');

const CHECKPOINT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || __dirname, '.natureco', 'checkpoints');

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }

async function checkpoint(params) {
  const { action, name, data } = params;
  ensureDir(CHECKPOINT_DIR);

  if (action === 'save') {
    if (!name) return { success: false, error: 'checkpoint name gerekli' };
    const filePath = path.join(CHECKPOINT_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    const entry = {
      name, savedAt: new Date().toISOString(),
      data: data || {},
    };
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
    return { success: true, name, file: filePath, savedAt: entry.savedAt };
  }

  if (action === 'load') {
    if (!name) return { success: false, error: 'checkpoint name gerekli' };
    const filePath = path.join(CHECKPOINT_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'Checkpoint bulunamadi: ' + name };
    const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { success: true, name: entry.name, savedAt: entry.savedAt, data: entry.data };
  }

  if (action === 'list') {
    const files = fs.readdirSync(CHECKPOINT_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, f), 'utf8'));
        return { name: entry.name, savedAt: entry.savedAt, size: Object.keys(entry.data || {}).length };
      } catch { return null; }
    }).filter(Boolean);
    return { success: true, checkpoints: list };
  }

  if (action === 'delete') {
    if (!name) return { success: false, error: 'checkpoint name gerekli' };
    const filePath = path.join(CHECKPOINT_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'Checkpoint bulunamadi' };
    fs.unlinkSync(filePath);
    return { success: true, message: name + ' silindi' };
  }

  return { success: false, error: 'Gecersiz action: ' + action };
}

module.exports = {
  name: 'checkpoint',
  description: 'Oturum/fikir checkpoinit: save/load/list/delete. Islem durumunu kaydet ve geri yukle.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'save, load, list, delete', enum: ['save', 'load', 'list', 'delete'] },
      name: { type: 'string', description: 'Checkpoint adi' },
      data: { type: 'object', description: '(save) Kaydedilecek veri' },
    },
    required: ['action'],
  },
  async execute(params) { return await checkpoint(params); },
};
