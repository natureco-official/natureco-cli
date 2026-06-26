const APPROVAL_QUEUE = [];
const PENDING_APPROVALS = new Map();

async function approval(params) {
  const { action, operationId, response } = params;

  if (action === 'request') {
    const { operation, description, details } = params;
    if (!operation || !description) return { success: false, error: 'operation ve description gerekli' };
    const id = operationId || `approval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = { id, operation, description, details, status: 'pending', createdAt: new Date().toISOString() };
    PENDING_APPROVALS.set(id, entry);
    APPROVAL_QUEUE.push(entry);
    return { success: true, approvalId: id, message: 'Onay bekliyor: ' + description, status: 'pending' };
  }

  if (action === 'respond') {
    if (!operationId) return { success: false, error: 'operationId gerekli' };
    const entry = PENDING_APPROVALS.get(operationId);
    if (!entry) return { success: false, error: 'Onay bulunamadi: ' + operationId };
    entry.status = response === 'approve' ? 'approved' : 'rejected';
    entry.respondedAt = new Date().toISOString();
    return { success: true, approvalId: operationId, status: entry.status, message: 'Islem ' + entry.status };
  }

  if (action === 'list') {
    return { success: true, queue: APPROVAL_QUEUE.filter(e => e.status === 'pending') };
  }

  if (action === 'status') {
    if (!operationId) return { success: false, error: 'operationId gerekli' };
    const entry = PENDING_APPROVALS.get(operationId);
    return { success: true, entry: entry || null };
  }

  return { success: false, error: 'Gecersiz action: ' + action };
}

module.exports = {
  name: 'approval',
  description: 'Guvenlik onay kuyrugu: tehlikeli islemler icin onay iste/yanitla/listele.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'request, respond, list, status', enum: ['request', 'respond', 'list', 'status'] },
      operation: { type: 'string', description: '(action=request) Islem adi' },
      description: { type: 'string', description: '(action=request) Aciklama' },
      details: { type: 'string', description: '(action=request) Detayli aciklama' },
      operationId: { type: 'string', description: '(action=respond/status) Onay ID' },
      response: { type: 'string', description: '(action=respond) approve veya reject', enum: ['approve', 'reject'] },
    },
    required: ['action'],
  },
  async execute(params) { return await approval(params); },
};
