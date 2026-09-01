/**
 * Akış okuyucusu `reasoning_content` delta'larını gerçekten topluyor mu.
 *
 * Modül seviyesi testler (reasoning-models.test.js) yalnızca yardımcıların
 * doğru karar verdiğini gösterir. Bu dosya asıl soruyu ölçer: MiniMax /
 * DeepSeek / Kimi biçiminde bir SSE akışı geldiğinde okuyucu düşünme metnini
 * yakalıyor mu, olay olarak yayıyor mu, ve onu görünür cevaba KARIŞTIRMIYOR mu.
 *
 * Eskiden okuyucu yalnızca `delta.content` okuyordu; bu modellerde ekranda
 * hiçbir şey akmıyor, kullanıcı donmuş sanıyor ve tokenlar faturalanıyordu.
 */
const { extractReasoningDelta } = require('../../src/utils/reasoning-models');

/** Gerçek sağlayıcı akışının işlendiği döngünün birebir aynısı. */
function akisiIsle(parcalar) {
  let content = '';
  let reasoning = '';
  const olaylar = [];

  for (const parsed of parcalar) {
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) continue;
    const reasoningDelta = extractReasoningDelta(delta);
    if (reasoningDelta) {
      reasoning += reasoningDelta;
      olaylar.push({ type: 'reasoning_delta', text: reasoningDelta });
    }
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      olaylar.push({ type: 'text_delta', text: delta.content });
    }
  }
  return { content, reasoning, olaylar };
}

const d = (delta) => ({ choices: [{ delta }] });

describe('reasoning akışı', () => {
  test('düşünme metni toplanır ve cevaba karışmaz', () => {
    const r = akisiIsle([
      d({ reasoning_content: 'Önce ' }),
      d({ reasoning_content: 'düşüneyim.' }),
      d({ content: 'Cevap: ' }),
      d({ content: '42' }),
    ]);
    expect(r.reasoning).toBe('Önce düşüneyim.');
    expect(r.content).toBe('Cevap: 42');
  });

  test('düşünme ve içerik ayrı olay türleri üretir', () => {
    const r = akisiIsle([d({ reasoning_content: 'hmm' }), d({ content: 'evet' })]);
    expect(r.olaylar.map(o => o.type)).toEqual(['reasoning_delta', 'text_delta']);
  });

  test('yalnızca düşünme gelirse cevap boş kalır ama düşünme görünür', () => {
    // Bu, bütçe tamamen akıl yürütmeye gittiğinde oluşan durum. Eskiden
    // kullanıcı sebepsiz boş cevap görüyordu; artık ne olduğu ayırt edilebilir.
    const r = akisiIsle([d({ reasoning_content: 'uzun uzun düşünme' })]);
    expect(r.content).toBe('');
    expect(r.reasoning).toBe('uzun uzun düşünme');
  });

  test('düşünme akıtmayan model etkilenmez', () => {
    const r = akisiIsle([d({ content: 'merhaba' }), d({ content: ' dünya' })]);
    expect(r.content).toBe('merhaba dünya');
    expect(r.reasoning).toBe('');
    expect(r.olaylar.every(o => o.type === 'text_delta')).toBe(true);
  });

  test('araya giren boş delta akışı bozmaz', () => {
    const r = akisiIsle([
      d({ reasoning_content: 'a' }), { choices: [{}] }, d({}), d({ content: 'b' }),
    ]);
    expect(r.reasoning).toBe('a');
    expect(r.content).toBe('b');
  });

  test('sağlayıcıların üç alan adı da aynı akışta karşılanır', () => {
    const r = akisiIsle([
      d({ reasoning_content: '1' }), d({ reasoning: '2' }), d({ thinking: '3' }),
    ]);
    expect(r.reasoning).toBe('123');
  });
});
