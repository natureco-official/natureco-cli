const { StructuralPatchEngine } = require('../utils/structural-patch');
const engine = new StructuralPatchEngine();

module.exports = {
  name: 'structural_patch',
  description: 'Apply conflict-safe anchored text patches with preview and rollback support.',
  inputSchema: {
    type: 'object', required: ['action'],
    properties: {
      action: { type: 'string', enum: ['preview', 'apply', 'rollback'] },
      path: { type: 'string' }, expectedHash: { type: 'string' }, patchId: { type: 'string' }, dryRun: { type: 'boolean' },
      operations: { type: 'array', items: { type: 'object', required: ['search'], properties: {
        search: { type: 'string' }, replace: { type: 'string' }, replaceAll: { type: 'boolean' },
      } } },
    },
  },
  async execute(params) {
    if (params.action === 'rollback') return engine.rollback(params.patchId);
    if (!params.path) return { success: false, error: 'path is required' };
    const result = params.action === 'preview'
      ? engine.preview(params.path, params.operations, { expectedHash: params.expectedHash, dryRun: true })
      : engine.apply(params.path, params.operations, { expectedHash: params.expectedHash, dryRun: params.dryRun });
    return result.ok ? { success: true, ...result } : { success: false, ...result };
  },
};
