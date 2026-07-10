// TEK BEYIN (v5.47): Terminal (chat/repl) ile mesajlasma kanallari (Telegram/WhatsApp/
// Signal/IRC/Mattermost/iMessage/SMS) AYNI ajani calistirir.
//
// Onceki durum (split-brain): her kanal kendi sabit "You are a helpful X assistant"
// prompt'u + legacy 'universal-provider.json' hafizasi + duz sendMessage passthrough'u
// kullaniyordu. Terminaldeki bot ise workflow orchestrator uzerinden gercek personayi
// (config.botName + memory botName), kullanici hafizasini (<userName>.json + legacy
// default.json) ve agac-hafiza digest'ini aliyordu. Sonuc: ayni bot terminalde "Hinata"
// olarak her seyi hatirlarken Telegram'da kisiliksiz ve hafizasiz davraniyordu.
//
// Artik: allow-list'teki (guvenilir) gonderen = CLI sahibi kabul edilir ve mesaji
// workflow.execute'a gider — terminalle AYNI sistem mesaji, AYNI kalici hafiza
// (flat + tree), AYNI araclar, AYNI memory_write/memory_tree kayit yollari. Kanal
// yalnizca bir tasima katmanidir; kisilik ve hafiza kanaldan bagimsizdir.
//
// GUVENLIK: Bu modul YALNIZCA guvenilir (channelGate.trusted) gonderen icin
// cagirilmalidir — workflow yolu arac calistirabilir (dosya, bash...). Guvenilmeyen
// gonderen eski hafizasiz passthrough yolunda kalir (v5.43 kurali: anonim kanala
// kisisel hafiza sizmaz, arac erisimi verilmez).
const fs = require('fs');
const path = require('path');
const os = require('os');

// Kanal-bazli kisa-sure konusma gecmisi (terminal REPL'in oturum gecmisinin muadili).
// Kalici bilgi burada YASAMAZ (o memory_write/memory_tree'de) — bu sadece "az once ne
// konustuk" baglami. Kanal basina ayri dosya: Telegram sohbeti ile SMS sohbeti ayri
// akislardir; ortak olan kisilik + kalici hafizadir.
const HISTORY_DIR = path.join(os.homedir(), '.natureco', 'channel-history');
const MAX_HISTORY = 40;   // diskte saklanan mesaj sayisi (user+assistant toplam)
const SEND_HISTORY = 12;  // modele gonderilen son mesaj sayisi

function historyFile(channel, chatKey) {
  const safe = String(chatKey).replace(/[^a-zA-Z0-9_+.-]/g, '_');
  return path.join(HISTORY_DIR, `${channel}_${safe}.json`);
}

function loadHistory(channel, chatKey) {
  try {
    const arr = JSON.parse(fs.readFileSync(historyFile(channel, chatKey), 'utf8'));
    return Array.isArray(arr) ? arr.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(channel, chatKey, history) {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(historyFile(channel, chatKey), JSON.stringify(history.slice(-MAX_HISTORY), null, 2), 'utf8');
  } catch { /* gecmis kritik degil — kaydedilemezse sohbet yine calisir */ }
}

// repl.js'teki model-adi temizligiyle ayni desenler: model kendini "MiniMax/Claude/GPT"
// olarak tanitirsa kullanicinin verdigi bot adina cevrilir (kisilik tutarliligi).
function sanitizeReply(text, botName) {
  let out = String(text == null ? '' : text);
  // ONCE model-adi token'lari (repl.js ile ayni sira) — "Ben ..." kaliplarindan once
  // kosmali, yoksa "Ben MiniMax M2.5" gibi ifadelerde ".5" artigi kalir.
  out = out.replace(/\bMiniMax[-\s\w.\d]*/gi, botName);
  out = out.replace(/\bM2\.5[-\s\w.\d]*/gi, botName);
  out = out.replace(/\bM2[\s\-.\w\d]*/gi, botName);
  out = out.replace(/\bClaude[-\s\w.\d]*/gi, botName);
  out = out.replace(/Ben\s+GPT[^.!?,;:\n]*/gi, 'Ben ' + botName);
  out = out.replace(/Ben\s+Asistan[\s\w.]*/gi, 'Ben ' + botName);
  out = out.replace(/\*\*(?:GPT)[^*]*\*\*/gi, '**' + botName + '**');
  return out;
}

// Uzun yaniti tasima katmaninin limitine bol (orn. Telegram 4096). Satir sinirinda
// bolmeye calisir; tek satir bile limiti asarsa sert keser.
function chunkText(text, maxLen) {
  const chunks = [];
  let rest = String(text == null ? '' : text);
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Guvenilir kanal mesajini terminaldekiyle AYNI ajana calistirir.
 * @param {object} p
 * @param {string} p.channel  'telegram' | 'whatsapp' | 'signal' | ...
 * @param {string} p.chatKey  kanal icindeki sohbet kimligi (chatId, numara, nick)
 * @param {string} p.text     kullanici mesaji
 * @param {object} [deps]     test icin enjekte edilebilir bagimliliklar
 * @returns {Promise<string>} bot yaniti ('' donerse gonderilecek bir sey yok)
 */
async function runBrain({ channel, chatKey, text }, deps = {}) {
  // GÜVENLİK (v5.51.1): bu süreçteki araç çağrılarının KANAL kaynaklı olduğunu
  // işaretle — self-edit-guard bunu görünce paket kaynak koduna yazmayı, allow
  // bayrağı açık olsa bile KOŞULSUZ reddeder (kanalda interaktif onay yok).
  // Bilerek geri alınmaz: gateway sürecindeki her çalıştırma kanal kaynaklıdır.
  process.env.NATURECO_CHANNEL_ORIGIN = '1';

  const workflow = deps.workflow || require('../tools/workflow');
  const getConfig = deps.getConfig || require('./config').getConfig;
  const cfg = getConfig();
  const botName = cfg.botName || 'Asistan';

  const history = loadHistory(channel, chatKey);
  const wf = await workflow.execute({
    action: 'run',
    task: text,
    conversationHistory: history.slice(-SEND_HISTORY),
    stream: false, // kanallar TTY degil — canli akis yok, tam yanit doner
  });

  let reply = '';
  if (wf && wf.reply != null && String(wf.reply).trim()) {
    reply = String(wf.reply);
  } else if (wf && wf.status === 'completed' && Array.isArray(wf.results) && wf.results.length > 0) {
    // Tool-calls yolu (OpenAI/Anthropic) plan+adim sonucu dondurebilir; kisa ozet uret
    const lines = wf.results.map(r => {
      const t = r.tool || r.name || '?';
      const s = r.status === 'done' ? '✓' : '✗';
      return `${s} ${t}`;
    });
    reply = 'Görev tamamlandı:\n' + lines.join('\n');
  } else if (wf && wf.success === false) {
    reply = 'Bir sorun oluştu: ' + (wf.error || 'yanıt alınamadı');
  }

  reply = sanitizeReply(reply, botName).trim();

  if (reply) {
    history.push({ role: 'user', content: text });
    history.push({ role: 'assistant', content: reply });
    saveHistory(channel, chatKey, history);
  }
  return reply;
}

module.exports = {
  runBrain,
  sanitizeReply,
  chunkText,
  _internal: { loadHistory, saveHistory, historyFile, HISTORY_DIR, MAX_HISTORY, SEND_HISTORY },
};
