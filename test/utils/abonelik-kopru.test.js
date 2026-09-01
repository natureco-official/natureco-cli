/**
 * Abonelik köprüsü — aboneliği OpenAI-uyumlu yerel uç olarak sunar.
 *
 * Sahte istemci, GERÇEK `codex app-server` ile ölçülmüş olay dizisini taklit
 * eder: turn/started → item/started → item/agentMessage/delta* → item/completed
 * → thread/tokenUsage/updated → turn/completed. Alan adları
 * `codex app-server generate-json-schema` çıktısından alındı.
 *
 * BURADAKİ TESTLERİN ÇOĞU ÖLÇÜLMÜŞ HATALARDAN DOĞDU:
 *  - kapat() akış sürerken sonsuza kadar asılıyordu (server.close açık SSE
 *    bağlantısını bekler); 180 sn'de dönmedi.
 *  - Abonelikte olmayan model adı HATA VERMİYOR, sessizce boş yanıt dönüyordu.
 *  - Token sayımı `tokenUsage.last` altında; `total` kullanmak çok turlu
 *    sohbette tüketimi katlanarak şişirirdi.
 */
const { AbonelikKoprusu, parmakIzi, konusmayiDuzlestir, metneCevir } =
  require('../../src/utils/abonelik-kopru');

/** Ölçülen olay dizisini üreten sahte app-server istemcisi. */
function sahteIstemci({ cevap = 'merhaba', modeller = ['gpt-5.6-sol'], kullanim = true } = {}) {
  const c = {
    bildirimDinleyici: () => {},
    acilanKonusmalar: [],
    turlar: [],
    kapatildi: false,
    baslat: async () => {},
    kapat() { this.kapatildi = true; },
    modeller: async () => ({ models: modeller.map(id => ({ id })) }),
    hesap: async () => ({ account: { planType: 'plus' } }),
    async konusmaBaslat(p) {
      this.acilanKonusmalar.push(p);
      const id = `t${this.acilanKonusmalar.length}`;
      return { thread: { id } };
    },
    async turBaslat(p) {
      this.turlar.push(p);
      const threadId = p.threadId;
      setImmediate(() => {
        const b = this.bildirimDinleyici;
        b('turn/started', { threadId });
        b('item/started', { threadId, item: { type: 'agentMessage', text: '' } });
        for (const par of String(cevap).match(/.{1,3}/g) || []) {
          b('item/agentMessage/delta', { threadId, delta: par });
        }
        b('item/completed', { threadId, item: { type: 'agentMessage', text: cevap } });
        if (kullanim) {
          b('thread/tokenUsage/updated', {
            threadId,
            tokenUsage: {
              last: { inputTokens: 100, outputTokens: 7, totalTokens: 107, cachedInputTokens: 20, reasoningOutputTokens: 3 },
              total: { inputTokens: 9999, outputTokens: 888, totalTokens: 10887, cachedInputTokens: 0, reasoningOutputTokens: 0 },
            },
          });
        }
        b('turn/completed', { threadId });
      });
      return { turn: { id: 'x' } };
    },
  };
  return c;
}

async function koprutKur(opts) {
  const istemci = sahteIstemci(opts);
  const k = new AbonelikKoprusu({ istemci, surum: 'test' });
  const { url, anahtar } = await k.baslat();
  return { k, istemci, url, anahtar };
}

const gonder = (url, anahtar, govde, ekBaslik = {}) =>
  fetch(url + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anahtar}`, ...ekBaslik },
    body: JSON.stringify(govde),
  });

const kullanici = (icerik) => ({ messages: [{ role: 'user', content: icerik }] });

describe('köprü güvenliği', () => {
  test('anahtarsız istek reddedilir — abonelik bedava kotaya dönüşmez', async () => {
    const { k, url } = await koprutKur();
    const r = await fetch(url + '/chat/completions', { method: 'POST', body: '{}' });
    expect(r.status).toBe(401);
    await k.kapat();
  });

  test('yanlış anahtar reddedilir', async () => {
    const { k, url } = await koprutKur();
    const r = await gonder(url, 'yanlis-anahtar-0000000000000000', kullanici('selam'));
    expect(r.status).toBe(401);
    await k.kapat();
  });

  test('tarayıcıdan gelen istek (Origin başlıklı) reddedilir', async () => {
    const { k, url, anahtar } = await koprutKur();
    const r = await gonder(url, anahtar, kullanici('selam'), { Origin: 'https://kotu.site' });
    expect(r.status).toBe(403);
    await k.kapat();
  });

  test('yalnızca 127.0.0.1 dinlenir — ağa açılmaz', async () => {
    const { k } = await koprutKur();
    expect(k.sunucu.address().address).toBe('127.0.0.1');
    await k.kapat();
  });

  test('her açılışta farklı anahtar üretilir', async () => {
    const a = await koprutKur(); const b = await koprutKur();
    expect(a.anahtar).not.toBe(b.anahtar);
    expect(a.anahtar.length).toBeGreaterThanOrEqual(32);
    await a.k.kapat(); await b.k.kapat();
  });
});

describe('OpenAI uyumu', () => {
  test('akışsız yanıt OpenAI biçiminde döner', async () => {
    const { k, url, anahtar } = await koprutKur({ cevap: '4' });
    const j = await (await gonder(url, anahtar, { model: 'gpt-5.6-sol', ...kullanici('2+2?') })).json();
    expect(j.object).toBe('chat.completion');
    expect(j.choices[0].message).toEqual({ role: 'assistant', content: '4' });
    expect(j.choices[0].finish_reason).toBe('stop');
    await k.kapat();
  });

  test('akışta SSE parçaları ve [DONE] gelir', async () => {
    const { k, url, anahtar } = await koprutKur({ cevap: 'merhaba dünya' });
    const r = await gonder(url, anahtar, { stream: true, ...kullanici('selam') });
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const govde = await r.text();
    expect(govde).toContain('[DONE]');
    const metin = govde.split('\n\n')
      .filter(x => x.startsWith('data: ') && !x.includes('[DONE]'))
      .map(x => { try { return JSON.parse(x.slice(6)).choices[0].delta.content || ''; } catch { return ''; } })
      .join('');
    expect(metin).toBe('merhaba dünya');
    await k.kapat();
  });

  test('gerçek token sayımı `last`ten alınır — `total` kullanılmaz', async () => {
    // total (9999) kümülatif; istek başına usage olarak verilirse tüketim şişer.
    const { k, url, anahtar } = await koprutKur();
    const j = await (await gonder(url, anahtar, kullanici('selam'))).json();
    expect(j.usage.prompt_tokens).toBe(100);
    expect(j.usage.completion_tokens).toBe(7);
    expect(j.usage.prompt_tokens_details.cached_tokens).toBe(20);
    expect(j.usage.completion_tokens_details.reasoning_tokens).toBe(3);
    await k.kapat();
  });

  test('kullanım bildirimi hiç gelmezse yanıt yine de döner', async () => {
    const { k, url, anahtar } = await koprutKur({ kullanim: false, cevap: 'tamam' });
    const j = await (await gonder(url, anahtar, kullanici('selam'))).json();
    expect(j.choices[0].message.content).toBe('tamam');
    expect(j.usage).toBeUndefined();
    await k.kapat();
  });

  test('/models abonelikteki modelleri listeler', async () => {
    const { k, url, anahtar } = await koprutKur({ modeller: ['a', 'b'] });
    const j = await (await fetch(url + '/models', { headers: { Authorization: `Bearer ${anahtar}` } })).json();
    expect(j.data.map(m => m.id)).toEqual(['a', 'b']);
    await k.kapat();
  });

  test('boş messages 400 verir', async () => {
    const { k, url, anahtar } = await koprutKur();
    expect((await gonder(url, anahtar, { messages: [] })).status).toBe(400);
    await k.kapat();
  });

  test('bilinmeyen uç 404 verir', async () => {
    const { k, url, anahtar } = await koprutKur();
    const r = await fetch(url + '/embeddings', { method: 'POST', headers: { Authorization: `Bearer ${anahtar}` }, body: '{}' });
    expect(r.status).toBe(404);
    await k.kapat();
  });
});

describe('model doğrulaması', () => {
  test('abonelikte olmayan model SESSİZ boş yanıt değil, açık hata verir', async () => {
    // Ölçüldü: geçersiz model adıyla tur normal tamamlanıyor ve metin boş
    // dönüyordu; kullanıcı sebebini göremiyordu.
    const { k, url, anahtar } = await koprutKur({ modeller: ['gpt-5.6-sol'] });
    const r = await gonder(url, anahtar, { model: 'gpt-4o', ...kullanici('selam') });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error.message).toMatch(/gpt-4o/);
    expect(j.error.message).toMatch(/gpt-5\.6-sol/); // ne kullanabileceğini söyler
    await k.kapat();
  });

  test('model listesi alınamazsa istek engellenmez', async () => {
    const istemci = sahteIstemci({ cevap: 'olur' });
    istemci.modeller = async () => { throw new Error('ağ yok'); };
    const k = new AbonelikKoprusu({ istemci });
    const { url, anahtar } = await k.baslat();
    const r = await gonder(url, anahtar, { model: 'her-neyse', ...kullanici('selam') });
    expect(r.status).toBe(200);
    await k.kapat();
  });
});

describe('konuşma sürekliliği', () => {
  test('devam eden konuşmada geçmiş yeniden gönderilmez', async () => {
    const { k, istemci, url, anahtar } = await koprutKur({ cevap: 'ilk' });
    const m1 = [{ role: 'user', content: 'birinci' }];
    const j1 = await (await gonder(url, anahtar, { messages: m1 })).json();

    const m2 = [...m1, { role: 'assistant', content: j1.choices[0].message.content }, { role: 'user', content: 'ikinci' }];
    await (await gonder(url, anahtar, { messages: m2 })).json();

    expect(istemci.acilanKonusmalar).toHaveLength(1); // aynı konuşma sürdürüldü
    expect(istemci.turlar[1].input[0].text).toBe('ikinci'); // yalnız yeni mesaj
    await k.kapat();
  });

  test('ilgisiz konuşma yeni konuşma açar ve geçmişi taşır', async () => {
    const { k, istemci, url, anahtar } = await koprutKur();
    await (await gonder(url, anahtar, kullanici('bir'))).json();
    await (await gonder(url, anahtar, {
      messages: [{ role: 'user', content: 'alakasiz' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'devam' }],
    })).json();
    expect(istemci.acilanKonusmalar).toHaveLength(2);
    expect(istemci.turlar[1].input[0].text).toContain('alakasiz');
    await k.kapat();
  });

  test('sistem mesajı developerInstructions olarak geçer, girdiye karışmaz', async () => {
    const { k, istemci, url, anahtar } = await koprutKur();
    await (await gonder(url, anahtar, {
      messages: [{ role: 'system', content: 'KURAL: kısa yaz' }, { role: 'user', content: 'selam' }],
    })).json();
    expect(istemci.acilanKonusmalar[0].developerInstructions).toBe('KURAL: kısa yaz');
    expect(istemci.turlar[0].input[0].text).toBe('selam');
    await k.kapat();
  });

  test('köprü konuşmaları SALT OKUNUR açılır — arkada özerk ajan çalışmaz', async () => {
    // Ölçüldü: bu alan konmadığında ve süreç izinliyken, köprüden istenen
    // "dosya oluştur" GERÇEKTEN dosya yazdı; alan konduğunda aynı süreç
    // ayarıyla yazma engellendi. Dosya/kabuk eylemleri natureco'nun kendi
    // araçlarından ve onaylarından geçmeli.
    const { k, istemci, url, anahtar } = await koprutKur();
    await (await gonder(url, anahtar, kullanici('selam'))).json();
    expect(istemci.acilanKonusmalar[0].sandbox).toBe('read-only');
    await k.kapat();
  });

  test('köprü konuşmaları ephemeral ve onaysızdır', async () => {
    // ephemeral: kullanıcının kendi codex geçmişi kirlenmemeli.
    // approvalPolicy never: onay isteği köprüde karşılıksız kalır, turu asardı.
    const { k, istemci, url, anahtar } = await koprutKur();
    await (await gonder(url, anahtar, kullanici('selam'))).json();
    expect(istemci.acilanKonusmalar[0].ephemeral).toBe(true);
    expect(istemci.acilanKonusmalar[0].approvalPolicy).toBe('never');
    await k.kapat();
  });
});

describe('kapatma', () => {
  test('akış sürerken kapatma ASILMAZ', async () => {
    // Ölçülen hata: server.close() açık SSE bağlantısını beklediği için
    // kapat() 180 sn'de dönmedi.
    const istemci = sahteIstemci();
    istemci.turBaslat = async () => ({ turn: { id: 'x' } }); // hiç bitmeyen tur
    const k = new AbonelikKoprusu({ istemci });
    const { url, anahtar } = await k.baslat();
    gonder(url, anahtar, { stream: true, ...kullanici('selam') }).catch(() => {});
    await new Promise(r => setTimeout(r, 120));
    const t = Date.now();
    await k.kapat();
    expect(Date.now() - t).toBeLessThan(3000);
  }, 15000);

  test('iki kez kapatmak hata vermez', async () => {
    const { k } = await koprutKur();
    await k.kapat();
    await expect(k.kapat()).resolves.toBeUndefined();
  });

  test('kapatma alt süreci de kapatır — sızıntı bırakmaz', async () => {
    const { k, istemci } = await koprutKur();
    await k.kapat();
    expect(istemci.kapatildi).toBe(true);
  });
});

describe('eşzamanlılık ve hata dayanıklılığı', () => {
  test('paralel istekler birbirinin turunu ÇALMAZ', async () => {
    // Ölçülen hata: köprü tek bir dinleyici tutuyordu; ikinci istek başlayınca
    // birincininki siliniyor ve birinci istek zaman aşımına kadar asılıyordu.
    const { k, url, anahtar } = await koprutKur({ cevap: 'yanit' });
    const istekler = ['bir', 'iki', 'uc', 'dort'].map(s => gonder(url, anahtar, kullanici(s)).then(r => r.json()));
    const sonuclar = await Promise.all(istekler);
    for (const s of sonuclar) expect(s.choices[0].message.content).toBe('yanit');
    await k.kapat();
  }, 15000);

  test('akış BAŞLADIKTAN sonra oluşan hata süreci çökertmez', async () => {
    // Ölçülen hata: başlıklar gitmişken _hata() writeHead çağırıyor,
    // ERR_HTTP_HEADERS_SENT yakalanmadan fırlıyor ve süreç ölüyordu.
    const istemci = sahteIstemci();
    istemci.turBaslat = async function (p) {
      setImmediate(() => {
        this.bildirimDinleyici('item/agentMessage/delta', { threadId: p.threadId, delta: 'ba' });
        this.bildirimDinleyici('turn/failed', { threadId: p.threadId, error: { message: 'model düştü' } });
      });
      return { turn: { id: 'x' } };
    };
    const k = new AbonelikKoprusu({ istemci });
    const { url, anahtar } = await k.baslat();
    const r = await gonder(url, anahtar, { stream: true, ...kullanici('selam') });
    const govde = await r.text();
    expect(govde).toContain('model düştü');
    expect(govde).toContain('[DONE]');
    await k.kapat();
  });

  test('kapatma uçuştaki isteği bekletmez, hatayla sonlandırır', async () => {
    const istemci = sahteIstemci();
    istemci.turBaslat = async () => ({ turn: { id: 'x' } }); // hiç bitmeyen tur
    const k = new AbonelikKoprusu({ istemci });
    const { url, anahtar } = await k.baslat();
    const p = gonder(url, anahtar, kullanici('selam')).then(r => r.json()).catch(e => ({ koptu: e.message }));
    await new Promise(r => setTimeout(r, 100));
    await k.kapat();
    const sonuc = await Promise.race([p, new Promise(r => setTimeout(() => r({ asili: true }), 3000))]);
    expect(sonuc.asili).toBeUndefined();
  }, 15000);
});

describe('yardımcılar', () => {
  test('metneCevir dizi içerikleri düzleştirir', () => {
    expect(metneCevir([{ text: 'a' }, { text: 'b' }])).toBe('a\nb');
    expect(metneCevir('düz')).toBe('düz');
    expect(metneCevir(null)).toBe('');
  });

  test('konusmayiDuzlestir rolleri ayırt edilebilir bırakır', () => {
    const s = konusmayiDuzlestir([
      { role: 'user', content: 'soru' },
      { role: 'assistant', content: 'cevap' },
      { role: 'tool', content: 'sonuç' },
    ]);
    expect(s).toContain('soru');
    expect(s).toContain('[asistan]');
    expect(s).toContain('[araç sonucu]');
  });

  test('parmakIzi içerikten türer, sırayı dikkate alır', () => {
    const a = [{ role: 'user', content: 'x' }, { role: 'user', content: 'y' }];
    const b = [{ role: 'user', content: 'y' }, { role: 'user', content: 'x' }];
    expect(parmakIzi(a)).toBe(parmakIzi([...a]));
    expect(parmakIzi(a)).not.toBe(parmakIzi(b));
  });
});
