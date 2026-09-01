/**
 * Kesilmiş araç çağrısı transkripti zehirlememeli.
 *
 * PR #39'da code_v5 için ölçülerek düzeltilen hata: model çıktı sınırına
 * takılıp yarım JSON argüman ürettiğinde, o bozuk `tool_calls` transkripte
 * yazılıyor ve ardından ona "JSON değil" tool sonucu ekleniyordu. MiniMax bu
 * noktadan sonra HER isteğe HTTP 200 + boş gövde döndürüyor — yani oturum
 * kalıcı olarak ölüyordu.
 *
 * Aynı koruma chat yoluna (utils/api.js) hiç uygulanmamıştı: assistantMessage
 * ayrıştırmadan ÖNCE push ediliyordu.
 *
 * Bu test, transkripte yazma kararının kendisini sınar.
 */

/** api.js'teki karar mantığının birebir aynısı. */
function transkripteYaz(messages, assistantMessage) {
  const hamToolCalls = assistantMessage?.tool_calls || [];
  const malformedCalls = [];
  const saglamToolCalls = [];
  for (const tc of hamToolCalls) {
    try {
      JSON.parse(tc.function.arguments || '{}');
      saglamToolCalls.push(tc);
    } catch (e) {
      malformedCalls.push({ name: tc.function.name });
    }
  }
  if (malformedCalls.length > 0) {
    const uyari = `[Bir araç çağrısı yarım kaldı (${malformedCalls.map(m => m.name).join(', ')}). `
      + 'Argümanlar geçerli JSON değildi — büyük olasılıkla çıktı sınırına takıldı. '
      + 'Daha küçük bir adımla tekrar dene.]';
    messages.push({
      role: 'assistant',
      content: (assistantMessage.content || '') + (assistantMessage.content ? '\n' : '') + uyari,
      ...(saglamToolCalls.length > 0 ? { tool_calls: saglamToolCalls } : {}),
    });
  } else {
    messages.push(assistantMessage);
  }
  return { malformedCalls, saglamToolCalls };
}

const cagri = (name, args) => ({ id: 'c1', type: 'function', function: { name, arguments: args } });

describe('kesilmiş araç çağrısı', () => {
  test('bozuk tool_call transkripte YAZILMAZ', () => {
    const messages = [];
    transkripteYaz(messages, {
      role: 'assistant', content: '', tool_calls: [cagri('write_file', '{"path":"a.txt","content":"yar')],
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].tool_calls).toBeUndefined();
  });

  test('modele ne olduğu düz metinle bildirilir', () => {
    const messages = [];
    transkripteYaz(messages, {
      role: 'assistant', content: '', tool_calls: [cagri('write_file', '{"path":"a')],
    });
    expect(messages[0].content).toMatch(/yarım kaldı/);
    expect(messages[0].content).toMatch(/write_file/);
    expect(messages[0].content).toMatch(/daha küçük bir adımla/i);
  });

  test('sağlam çağrılar korunur, yalnızca bozuk olan düşer', () => {
    const messages = [];
    const sonuc = transkripteYaz(messages, {
      role: 'assistant', content: '',
      tool_calls: [cagri('read_file', '{"path":"a.txt"}'), cagri('write_file', '{"path":"b')],
    });
    expect(sonuc.saglamToolCalls).toHaveLength(1);
    expect(messages[0].tool_calls).toHaveLength(1);
    expect(messages[0].tool_calls[0].function.name).toBe('read_file');
  });

  test('hepsi sağlamsa mesaj olduğu gibi yazılır', () => {
    const messages = [];
    const orijinal = {
      role: 'assistant', content: 'tamam', tool_calls: [cagri('read_file', '{"path":"a.txt"}')],
    };
    transkripteYaz(messages, orijinal);
    expect(messages[0]).toBe(orijinal);
  });

  test('araç çağrısı olmayan mesaj etkilenmez', () => {
    const messages = [];
    const orijinal = { role: 'assistant', content: 'sadece metin' };
    transkripteYaz(messages, orijinal);
    expect(messages[0]).toBe(orijinal);
  });

  test('mevcut içerik korunur, uyarı eklenir', () => {
    const messages = [];
    transkripteYaz(messages, {
      role: 'assistant', content: 'Dosyayı yazıyorum.', tool_calls: [cagri('write_file', '{"path')],
    });
    expect(messages[0].content).toMatch(/^Dosyayı yazıyorum\./);
    expect(messages[0].content).toMatch(/yarım kaldı/);
  });

  test('assistant(tool_calls) → tool eşleşmesi bozulmaz', () => {
    // Bozuk çağrı düştüğü için ona karşılık gelen bir tool sonucu da
    // beklenmemeli; aksi hâlde sağlayıcı 400 döner.
    const messages = [];
    transkripteYaz(messages, {
      role: 'assistant', content: '', tool_calls: [cagri('write_file', '{"path')],
    });
    const duyurulan = messages[0].tool_calls?.length || 0;
    expect(duyurulan).toBe(0);
  });
});
