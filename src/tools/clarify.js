async function clarify(params) {
  const { question, type, options, context } = params;
  if (!question) return { success: false, error: 'question gerekli' };

  const result = {
    clarification: true,
    question,
    type: type || 'text',
    context: context || undefined,
    options: Array.isArray(options) && options.length > 0 ? options : undefined,
    instruction: 'Lutfen bu soruyu yanitlayin. Cevabiniz sonraki islemlerde kullanilacak.',
  };

  return { success: true, ...result };
}

module.exports = {
  name: 'clarify',
  description: 'Kullanicidan netlestirme sorusu sorar: eksik bilgi, secim, onay veya aciklama istemek icin.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'Kullaniciya sorulacak soru' },
      type: { type: 'string', description: 'Cevap tipi: text, choice, confirm, explanation', enum: ['text', 'choice', 'confirm', 'explanation'] },
      options: { type: 'array', description: '(type=choice icin) Secenekler', items: { type: 'string' } },
      context: { type: 'string', description: 'Sorunun baglam aciklamasi' },
    },
    required: ['question'],
  },
  async execute(params) { return await clarify(params); },
};
