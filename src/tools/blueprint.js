const path = require('path');
const fs = require('fs');

const BLUEPRINTS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || __dirname, '.natureco', 'blueprints');

function ensureDir(dir) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }

async function blueprint(params) {
  const { action, name, description, steps, variables, data } = params;
  ensureDir(BLUEPRINTS_DIR);

  if (action === 'create') {
    if (!name || !steps) return { success: false, error: 'name ve steps gerekli' };
    const bp = {
      name, description: description || '',
      variables: variables || [],
      steps: Array.isArray(steps) ? steps : [steps],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const filePath = path.join(BLUEPRINTS_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    fs.writeFileSync(filePath, JSON.stringify(bp, null, 2));
    return { success: true, name, stepCount: bp.steps.length, file: filePath, message: 'Blueprint olusturuldu: ' + name };
  }

  if (action === 'load') {
    if (!name) return { success: false, error: 'name gerekli' };
    const filePath = path.join(BLUEPRINTS_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'Blueprint bulunamadi: ' + name };
    const bp = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { success: true, ...bp };
  }

  if (action === 'list') {
    const files = fs.readdirSync(BLUEPRINTS_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(f => {
      try {
        const bp = JSON.parse(fs.readFileSync(path.join(BLUEPRINTS_DIR, f), 'utf8'));
        return { name: bp.name, description: bp.description, stepCount: bp.steps?.length || 0, createdAt: bp.createdAt };
      } catch { return null; }
    }).filter(Boolean);
    return { success: true, blueprints: list };
  }

  if (action === 'execute') {
    if (!name) return { success: false, error: 'name gerekli' };
    const filePath = path.join(BLUEPRINTS_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'Blueprint bulunamadi: ' + name };
    const bp = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const variables = data || {};
    const renderedSteps = bp.steps.map(step => {
      let content = typeof step === 'string' ? step : (step.content || step.prompt || '');
      for (const [k, v] of Object.entries(variables)) {
        content = content.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g'), v);
      }
      return content;
    });
    return { success: true, name, executed: true, steps: renderedSteps, stepCount: renderedSteps.length };
  }

  if (action === 'delete') {
    if (!name) return { success: false, error: 'name gerekli' };
    const filePath = path.join(BLUEPRINTS_DIR, name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
    if (!fs.existsSync(filePath)) return { success: false, error: 'Blueprint bulunamadi' };
    fs.unlinkSync(filePath);
    return { success: true, message: name + ' silindi' };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (create, load, list, execute, delete)' };
}

module.exports = {
  name: 'blueprint',
  description: 'Tekrar kullanilabilir workflow blueprint: create/load/list/execute/delete. Adimli is akisi ve degisken ikamesi.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'create, load, list, execute, delete', enum: ['create', 'load', 'list', 'execute', 'delete'] },
      name: { type: 'string', description: 'Blueprint adi' },
      description: { type: 'string', description: '(create) Aciklama' },
      steps: { type: 'array', description: '(create) Adimlar (string veya obje dizisi)', items: { type: 'string' } },
      variables: { type: 'array', description: '(create) Degisken tanimlari', items: { type: 'string' } },
      data: { type: 'object', description: '(execute) Degisken degerleri' },
    },
    required: ['action'],
  },
  async execute(params) { return await blueprint(params); },
};
