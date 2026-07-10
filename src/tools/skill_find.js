/**
 * skill_find — istek üzerine skill keşfi (v5.51 token optimizasyonu).
 *
 * Eskiden 319 skill'in İSİM LİSTESİ her istekte sysMsg'e gömülüyordu (~1.450 token).
 * Artık sysMsg'de tek satırlık ipucu var; ajan görev bir uzmanlık istediğinde bu
 * araçla arar (isim+açıklama üzerinde anahtar-kelime skorlaması, foldTr ile
 * Türkçe-güvenli), sonra skill_view(name) ile yükler. Progressive disclosure 2. seviye.
 */

const { _discoverSkills, _shorten } = require('../utils/skill-index');
const { foldTr } = require('../utils/tr-text');

module.exports = {
  name: 'skill_find',
  description: 'Görevle ilgili skill ara (isim + açıklama üzerinde anahtar kelime eşleşmesi). Bulduğun skill\'i skill_view(name) ile yükle.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Aranacak konu/anahtar kelimeler (ör. "seo audit", "video üretimi", "api tasarımı")' },
      maxResults: { type: 'number', description: 'En fazla sonuç (varsayılan 8)' },
    },
    required: ['query'],
  },
  async execute({ query, maxResults = 8 }) {
    if (!query || !String(query).trim()) {
      return { success: false, error: 'query gerekli' };
    }
    const words = foldTr(String(query)).split(/\s+/).filter(w => w.length > 1);
    const skills = _discoverSkills();

    const scored = skills.map(s => {
      const name = foldTr(s.name || '');
      const desc = foldTr(s.description || '');
      let score = 0;
      for (const w of words) {
        if (name.includes(w)) score += 3;        // isimde geçmesi en güçlü sinyal
        else if (desc.includes(w)) score += 1;
      }
      return { s, score };
    }).filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, maxResults)));

    if (scored.length === 0) {
      return { success: true, results: [], note: 'Eşleşen skill yok — farklı anahtar kelimelerle dene ya da skill olmadan araçlarla ilerle.' };
    }
    return {
      success: true,
      results: scored.map(r => ({ name: r.s.name, description: _shorten(r.s.description, 100), category: r.s.category })),
      note: 'Kullanmak için: skill_view(name)',
    };
  },
};
