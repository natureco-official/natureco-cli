/**
 * Düşünen (reasoning) modellerde ekrana bir şey çizilmesi.
 *
 * ÖLÇÜLEN HATA: bazı sağlayıcılar cevabı `delta.content`, düşünme metnini ise
 * `delta.reasoning` / `delta.reasoning_content` alanında akıtır. Çıkarma yapılıp
 * `reasoning_delta` olayı yayılıyordu ama olayı TÜKETEN KİMSE YOKTU
 * (`src/utils/api.js` içindeki tek `emitStreamEvent` çağrısı dışında hiçbir
 * yerde geçmiyordu). Sonuç: model düşündüğü sürece ekran bomboş kalıyor,
 * kullanıcıya araç donmuş gibi görünüyordu.
 *
 * Gerçek bir sağlayıcıda ölçüldü: 41 SSE parçasının TAMAMI `reasoning`
 * alanındaydı ve `content` hiç gelmedi — yani ekranda hiçbir şey görünmedi.
 */
const { createStreamWriter } = require('../../src/utils/stream-render');

function alici() {
  return { isTTY: false, value: '', write(c) { this.value += String(c); } };
}
const sadeMetin = (v) => v.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');

describe('düşünme metni çizimi', () => {
  test('reasoning_delta EKRANA ÇİZİLİR', () => {
    const output = alici();
    const w = createStreamWriter({ output });
    w.event({ type: 'reasoning_delta', text: 'Soruyu değerlendiriyorum' });
    w.end();
    expect(sadeMetin(output.value)).toContain('Soruyu değerlendiriyorum');
  });

  test('düşünme metni KAYDEDİLEN CEVABA karışmaz', () => {
    // Cevabın parçası değil; oraya girseydi markdown çizimini ve kaydedilen
    // yanıtı kirletirdi.
    const output = alici();
    const w = createStreamWriter({ output });
    w.event({ type: 'reasoning_delta', text: 'düşünüyorum...' });
    w.event({ type: 'text_delta', text: 'Selam!' });
    w.end();
    expect(w.getRaw()).toBe('Selam!');
    expect(w.getRaw()).not.toContain('düşünüyorum');
  });

  test('cevap, düşünme metninden ayrı bir satırda başlar', () => {
    const output = alici();
    const w = createStreamWriter({ output });
    w.event({ type: 'reasoning_delta', text: 'düşünüyorum' });
    w.event({ type: 'text_delta', text: 'Selam!' });
    w.end();
    const g = sadeMetin(output.value);
    expect(g).toMatch(/düşünüyorum[\s\S]*\n[\s\S]*Selam!/);
  });

  test('cevap başladıktan sonra gelen düşünme metni yazılmaz', () => {
    const output = alici();
    const w = createStreamWriter({ output });
    w.event({ type: 'text_delta', text: 'Cevap' });
    w.event({ type: 'reasoning_delta', text: 'GEC_KALAN_DUSUNME' });
    w.end();
    expect(sadeMetin(output.value)).not.toContain('GEC_KALAN_DUSUNME');
  });

  test('yalnızca düşünme gelirse bile ekran BOŞ KALMAZ', () => {
    // Ölçülen gerçek durum: 41 parçanın tamamı reasoning, content hiç yok.
    const output = alici();
    const w = createStreamWriter({ output });
    for (let i = 0; i < 41; i++) w.event({ type: 'reasoning_delta', text: `parca${i} ` });
    w.end();
    const g = sadeMetin(output.value);
    expect(g).toContain('parca0');
    expect(g).toContain('parca40');
    expect(g.trim().length).toBeGreaterThan(0);
  });

  test('düşünme hiç yoksa davranış eskisiyle aynı', () => {
    const output = alici();
    const w = createStreamWriter({ output });
    w.event({ type: 'text_delta', text: 'Merhaba' });
    w.end();
    expect(w.getRaw()).toBe('Merhaba');
    expect(sadeMetin(output.value)).toContain('Merhaba');
  });

  test('boş reasoning metni çökertmez', () => {
    const output = alici();
    const w = createStreamWriter({ output });
    expect(() => {
      w.event({ type: 'reasoning_delta', text: '' });
      w.event({ type: 'reasoning_delta' });
      w.end();
    }).not.toThrow();
  });
});
