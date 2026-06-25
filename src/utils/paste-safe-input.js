/**
 * paste-safe-input — Terminal'e uzun/çok satırlı metin yapıştırılınca
 * her satırın ayrı bir "Enter" gibi gönderilip anında submit edilmesini önler.
 *
 * Sorun: Node'un düz `readline` arayüzü, terminalden gelen her "\n" karakterini
 * bir 'line' event'i olarak görür. Terminal "bracketed paste mode" açık değilse
 * (veya açık olsa da bu karakterler ayıklanmazsa), kullanıcı 10 satırlık bir metni
 * yapıştırdığında readline bunu 10 ayrı mesaj gibi okur ve her birini hemen
 * gönderir — kullanıcı paste'i bitirmeden cevaplar gelmeye başlar.
 *
 * Çözüm: İki katmanlı bir yaklaşım:
 *
 * 1. INPUT KATMANI (createPasteSafeInput):
 *    Terminalin "bracketed paste" (ESC[200~ ... ESC[201~) işaretleyicilerini
 *    dinleyip, bu işaretler arasındaki tüm veriyi tek parça olarak topluyoruz.
 *    Ayrıca terminal-agnostik bir heuristik: çok satırlı büyük chunk'ları da
 *    paste olarak algılar. İçindeki gerçek satır sonlarını geçici bir
 *    placeholder (NEWLINE_PLACEHOLDER) ile değiştirip readline'a TEK satır gibi
 *    besliyoruz. Kullanıcı gerçekten Enter'a basana kadar hiçbir 'line' event'i
 *    tetiklenmez.
 *
 * 2. OUTPUT KATMANI (createOutputFilter):
 *    Readline'ın echo mekanizması placeholder karakterlerini terminale
 *    yazarken araya girer. Bir state machine ile karakterleri placeholder
 *    dizisiyle eşleştirir, tam eşleşme olursa terminale \n (yeni satır)
 *    yazar. Böylece kullanıcı "␤␤LINEBREAK␤␤" gibi literal placeholder
 *    yazıları görmez, satır sonlarını doğal yeni satırlar olarak deneyimler.
 *
 *    Enter'a basıldığında, readline'dan gelen placeholder'lı satır,
 *    restoreNewlines() ile gerçek \n karakterlerine dönüştürülüp mesaj
 *    olarak işlenir.
 */

'use strict';

const { PassThrough } = require('stream');

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

// Yapıştırılan içindeki satır sonlarını gizlemek için kullanılan placeholder.
// Gerçek kullanıcı girdisinde pratikte hiç geçmeyecek bir dizi.
const NEWLINE_PLACEHOLDER = '\u2424\u2424LINEBREAK\u2424\u2424';

/**
 * Bracketed paste'i destekleyen bir PassThrough stream döner.
 * `source` (genellikle process.stdin) üzerinden gelen veriyi işler.
 *
 * readline.createInterface({ input: createPasteSafeInput(process.stdin), ... })
 * şeklinde process.stdin yerine kullanılmalı.
 */
// str'nin sonunda PASTE_START veya PASTE_END marker'ının bir ön-eki (prefix)
// olarak duran kısmın uzunluğunu döner (0 = eşleşme yok). Sadece gerçekten
// marker olabilecek bir kuyruk varsa bekletiyoruz; aksi halde tek tuş
// yazımında karakterler bir sonraki tuşa kadar ekranda gecikir.
function trailingMarkerPrefixLen(str, marker) {
  const maxLen = Math.min(str.length, marker.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (str.slice(str.length - len) === marker.slice(0, len)) return len;
  }
  return 0;
}

// TERMINAL-AGNOSTIK PASTE TESPİTİ
// ---------------------------------
// Birçok terminal (örn. macOS'un yerleşik Terminal.app'i) bracketed-paste
// (ESC[200~/[201~) modunu desteklemez/etkinleştirmez. Bu yüzden bracket
// marker'larına güvenmek yetersiz kalıyor. Daha güvenilir, terminalden
// bağımsız bir sinyal var: bir gerçek Enter tuşuna basış, işletim sisteminden
// tek başına ve tek bir karakter ('\r' veya '\n') olarak gelir — başka hiçbir
// karakterle birlikte değil. Ama bir yapıştırma (paste), terminal emülatörü
// tarafından TEK SEFERDE (çok karakterli, içinde satır sonları barındıran bir
// "data" event'i olarak) pty'ye yazılır. Yani: içinde satır sonu BARINDIRAN
// ama SADECE tek bir satır sonu karakterinden İBARET OLMAYAN bir chunk,
// hemen hemen kesin olarak bir paste'tir — bracket marker olsun olmasın.
function isLoneEnterKeystroke(str) {
  return str === '\r' || str === '\n' || str === '\r\n';
}

function escapeEmbeddedNewlines(str) {
  if (!str || isLoneEnterKeystroke(str)) return str;
  const newlineCount = (str.match(/\r\n|\r|\n/g) || []).length;
  // Terminal-agnostik paste tespiti:
  // Gerçek terminalde tuş vuruşları tek tek karakter olarak gelir.
  // İçinde satır sonu BARINDIRAN ve sadece bir satır sonundan İBARET
  // OLMAYAN her chunk paste'tir — kaç satır olduğu fark etmez.
  // (Tek istisna: test ortamında PassThrough kullanılır, orada da
  //  testler karakter-karakter yazacak şekilde güncellenmiştir.)
  if (newlineCount === 0) return str;
  return str.replace(/\r\n|\r|\n/g, NEWLINE_PLACEHOLDER);
}

function createPasteSafeInput(source = process.stdin) {
  const proxy = new PassThrough();

  let inPaste = false;
  let carry = ''; // marker'ın chunk sınırında bölünmesine karşı tampon

  const onData = (chunk) => {
    let str = carry + chunk.toString('utf8');
    carry = '';
    let out = '';

    while (str.length) {
      if (inPaste) {
        const endIdx = str.indexOf(PASTE_END);
        if (endIdx === -1) {
          const keepLen = trailingMarkerPrefixLen(str, PASTE_END);
          const flushLen = str.length - keepLen;
          out += str.slice(0, flushLen).replace(/\r\n|\r|\n/g, NEWLINE_PLACEHOLDER);
          carry = str.slice(flushLen);
          str = '';
          break;
        }
        const pasted = str.slice(0, endIdx);
        out += pasted.replace(/\r\n|\r|\n/g, NEWLINE_PLACEHOLDER);
        inPaste = false;
        str = str.slice(endIdx + PASTE_END.length);
        continue;
      }

      const startIdx = str.indexOf(PASTE_START);
      if (startIdx === -1) {
        const keepLen = trailingMarkerPrefixLen(str, PASTE_START);
        const flushLen = str.length - keepLen;
        // Bracket marker'ı olmayan terminallerde de paste'i yakala: bu segment
        // tek başına bir Enter tuşu değilse ve içinde satır sonu varsa, o
        // satır sonlarını gizle (terminal-agnostik heuristik).
        out += escapeEmbeddedNewlines(str.slice(0, flushLen));
        carry = str.slice(flushLen);
        str = '';
        break;
      }
      out += escapeEmbeddedNewlines(str.slice(0, startIdx));
      str = str.slice(startIdx + PASTE_START.length);
      inPaste = true;
    }

    if (out) proxy.write(out);
  };

  source.on('data', onData);
  source.on('end', () => {
    if (carry) {
      proxy.write(inPaste ? carry.replace(/\r\n|\r|\n/g, NEWLINE_PLACEHOLDER) : carry);
      carry = '';
    }
    proxy.end();
  });
  source.on('error', (e) => proxy.emit('error', e));

  // process.stdin'in raw-mode/pause-resume API'lerini proxy üzerinden de eriştir,
  // readline bunları çağırabiliyor.
  proxy.isTTY = source.isTTY;
  proxy.setRawMode = source.setRawMode ? source.setRawMode.bind(source) : undefined;
  proxy.ref = source.ref ? source.ref.bind(source) : undefined;
  proxy.unref = source.unref ? source.unref.bind(source) : undefined;

  return proxy;
}

/**
 * Terminalde bracketed paste mode'u açar. Çoğu modern terminal (iTerm2, Terminal.app,
 * Windows Terminal, VS Code, gnome-terminal vb.) bunu destekler. Desteklemeyen
 * terminallerde bu escape kodu sessizce yok sayılır, davranış eskisi gibi kalır.
 */
function enableBracketedPaste(out = process.stdout) {
  if (out.isTTY) out.write('\x1b[?2004h');
}

function disableBracketedPaste(out = process.stdout) {
  if (out.isTTY) out.write('\x1b[?2004l');
}

/**
 * readline'dan gelen satırı, paste placeholder'larını gerçek "\n" karakterine
 * geri çevirerek normalize eder. Gönderilecek mesaj olarak bunu kullan.
 */
function restoreNewlines(line) {
  return line.split(NEWLINE_PLACEHOLDER).join('\n');
}

/**
 * createOutputFilter — Readline'ın output'unda dolaşan placeholder
 * karakterlerini (NEWLINE_PLACEHOLDER) gerçek satır sonlarına (\n)
 * dönüştüren bir wrapper. Kullanıcı terminalde "␤␤LINEBREAK␤␤" gibi
 * literal placeholder yazıları GÖRMEZ.
 *
 * Kullanım:
 *   const outFilter = createOutputFilter(process.stdout);
 *   const rl = readline.createInterface({ input, output: outFilter, ... });
 *
 * Çalışma prensibi:
 *   Readline, echo mekanizmasıyla her karakteri output.write() ile
 *   terminale yazar. Placeholder karakterleri de tek tek yazılır.
 *   Bu fonksiyon bir state machine tutar: karakterleri placeholder
 *   ile eşleştirir, tam eşleşme olursa \n yazar, olmazsa karakteri
 *   olduğu gibi geçirir. Kısmi eşleşmeler (chunk sınırında bölünmüş
 *   placeholder) sonraki write()'da tamamlanmak üzere partial
 *   buffer'da bekletilir.
 */
function createOutputFilter(output = process.stdout) {
  let partial = '';

  const filter = {
    write(data) {
      const str = data.toString('utf8');
      let result = '';
      let i = 0;

      while (i < str.length) {
        if (partial.length > 0) {
          // Kısmi eşleşme var — devamını bekle
          const expected = NEWLINE_PLACEHOLDER[partial.length];
          const ch = str[i];
          if (ch === expected) {
            partial += ch;
            i++;
            if (partial === NEWLINE_PLACEHOLDER) {
              result += '\n';
              partial = '';
            }
          } else {
            // Eşleşme bozuldu — partial buffer'ı boşalt
            result += partial;
            partial = '';
            // ch'i tekrar dene (yeni placeholder başlangıcı olabilir)
            // continue ile aynı i değerinde else-if'e düş
          }
        } else {
          const ch = str[i];
          if (ch === NEWLINE_PLACEHOLDER[0]) {
            partial = ch;
            i++;
            // Tek karakterlik placeholder değil, bekle
          } else {
            result += ch;
            i++;
          }
        }
      }

      if (result) return output.write(result);
      return true;
    },

    end(...args) {
      if (partial) {
        output.write(partial);
        partial = '';
      }
      return output.end(...args);
    },

    get columns() { return output.columns; },
    get rows() { return output.rows; },
    get isTTY() { return output.isTTY; },

    on(...args) { return output.on(...args); },
    off(...args) { return output.off ? output.off(...args) : undefined; },
    addListener(...args) { return output.addListener(...args); },
    removeListener(...args) { return output.removeListener(...args); },
    emit(...args) { return output.emit(...args); },
    getColorDepth(...args) {
      return typeof output.getColorDepth === 'function'
        ? output.getColorDepth(...args)
        : undefined;
    },
  };

  return filter;
}

module.exports = {
  createPasteSafeInput,
  createOutputFilter,
  enableBracketedPaste,
  disableBracketedPaste,
  restoreNewlines,
  NEWLINE_PLACEHOLDER,
};
