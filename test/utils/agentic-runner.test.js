/**
 * agentic-runner — MiniMax M2.x gibi "agentic-text" modellerin native tool-call
 * formatini (<minimax:tool_call> / <invoke> / <parameter>) ve skill yuklemeyi
 * (<skill>ad</skill>) parse edip gercek araclari calistiran bounded dongu.
 *
 * Regresyon kilidi: eski passthrough bu formatlari HIC islemiyordu (JSON.parse
 * patliyor, bos catch yutuyordu) — bu yuzden "masaustunde yaris oyunu yap"
 * gibi istekler dosya YAZMADAN sessizce basarisiz oluyordu. Bu testler o
 * davranisin geri gelmemesini garanti eder.
 */
import { describe, it, expect } from 'vitest';
import mod from '../../src/tools/agentic-runner.js';

const { parseAgenticCalls, stripProtocolTokens, executeCall, runAgentic, makeStreamFilter, makeSanitizeStream } = mod;

describe('parseAgenticCalls', () => {
  it('<minimax:tool_call> icindeki write_file (path+content) cagirisini cozer', () => {
    const content = `Hemen yaziyorum.
<minimax:tool_call>
<invoke name="write_file">
<parameter name="path">C:\\Users\\x\\Desktop\\game.html</parameter>
<parameter name="content"><!DOCTYPE html><html></html></parameter>
</invoke>
</minimax:tool_call>`;
    const calls = parseAgenticCalls(content, []);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('write_file');
    expect(calls[0].args.path).toContain('game.html');
    expect(calls[0].args.content).toContain('<!DOCTYPE html>');
  });

  it('minimax sarmalayicisi olmadan yalin <invoke> cozer', () => {
    const calls = parseAgenticCalls('<invoke name="read_file"><parameter name="path">/tmp/a.txt</parameter></invoke>', []);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('read_file');
    expect(calls[0].args.path).toBe('/tmp/a.txt');
  });

  it('"files" JSON dizisi parametresini (bulk) korur', () => {
    const files = JSON.stringify([{ path: '/a.txt', content: 'A' }, { path: '/b.txt', content: 'B' }]);
    const content = `<invoke name="bulk-file-operations"><parameter name="operation">create</parameter><parameter name="files">${files}</parameter></invoke>`;
    const calls = parseAgenticCalls(content, []);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('bulk-file-operations');
    expect(JSON.parse(calls[0].args.files)).toHaveLength(2);
  });

  it('<skill>ad</skill> kisayolunu skill_view\'e esler', () => {
    const calls = parseAgenticCalls('\n<skill>design-taste-frontend</skill>\n', []);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('skill_view');
    expect(calls[0].args.name).toBe('design-taste-frontend');
  });

  it('native OpenAI tool_calls\'i da dikkate alir', () => {
    const calls = parseAgenticCalls('', [{ function: { name: 'write_file', arguments: '{"path":"/x","content":"y"}' } }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].tool).toBe('write_file');
    expect(calls[0].args.path).toBe('/x');
  });

  it('duz sohbet yanitinda arac cagirisi bulmaz', () => {
    expect(parseAgenticCalls('Merhaba, nasil yardimci olabilirim?', [])).toHaveLength(0);
  });
});

describe('stripProtocolTokens', () => {
  it('invoke/skill/minimax bloklarini temizler', () => {
    const s = 'Ozet metni.<minimax:tool_call><invoke name="x"></invoke></minimax:tool_call><skill>y</skill>';
    expect(stripProtocolTokens(s)).toBe('Ozet metni.');
  });
});

describe('makeStreamFilter (canli akis)', () => {
  const collect = (chunks) => {
    let out = ''; let tools = 0;
    const f = makeStreamFilter(t => { out += t; }, () => { tools++; });
    for (const c of chunks) f.push(c);
    f.end();
    return { out, tools };
  };

  it('duz metni oldugu gibi gecirir', () => {
    expect(collect(['Merhaba ', 'dunya']).out).toBe('Merhaba dunya');
  });

  it('protokol blogunu gizler, oncesindeki prozu gosterir, onTool tetikler', () => {
    const { out, tools } = collect(['Hemen yaziyorum. <minimax:tool_call><invoke name="write_file"><parameter name="path">/x</parameter></invoke></minimax:tool_call>']);
    expect(out).toBe('Hemen yaziyorum. ');
    expect(tools).toBe(1);
  });

  it('chunk sinirinda bolunen tag\'i dogru isler', () => {
    // "<inv" bir chunk'ta, "oke ...>" sonraki chunk'ta gelir — ham gosterilmemeli
    const { out, tools } = collect(['Yapiyorum <inv', 'oke name="write_file"><parameter name="path">/x</parameter></invoke>']);
    expect(out).toBe('Yapiyorum ');
    expect(tools).toBe(1);
  });

  it('literal <div> gibi marker olmayan etiketi gecirir', () => {
    expect(collect(['Kod: <div>selam</div> bitti']).out).toBe('Kod: <div>selam</div> bitti');
  });
});

describe('makeSanitizeStream (model adi temizleme)', () => {
  const collect = (chunks, bot = 'Hinata') => {
    let out = '';
    const s = makeSanitizeStream(bot, t => { out += t; });
    for (const c of chunks) s.push(c);
    s.end();
    return out;
  };
  it('model adini persona ile degistirir', () => {
    expect(collect(['Ben MiniMax, ', 'sana yardim ederim.'])).toBe('Ben Hinata, sana yardim ederim.');
  });
  it('kelime chunk sinirinda bolunse bile ham model adini sizdirmaz', () => {
    expect(collect(['Ben Mini', 'Max burada.'])).toBe('Ben Hinata burada.');
  });
  it('Claude/GPT gibi diger model adlarini da degistirir', () => {
    expect(collect(['Ben Claude ', 've GPT-4 degilim.'])).toBe('Ben Hinata ve Hinata degilim.');
  });
  it('normal metni bozmaz', () => {
    expect(collect(['Merhaba dunya, ', 'nasilsin?'])).toBe('Merhaba dunya, nasilsin?');
  });
});

describe('executeCall', () => {
  it('bulk "files" dizisini her dosya icin write_file\'a yonlendirir', async () => {
    const written = [];
    const loadTool = (n) => {
      if (n === 'write_file') return { execute: async (a) => { written.push(a); return { success: true, path: a.path, size: (a.content || '').length }; } };
      throw new Error('beklenmeyen arac ' + n);
    };
    const call = { tool: 'bulk-file-operations', args: { files: [{ path: '/a', content: 'AA' }, { path: '/b', content: 'BBB' }] } };
    const { records } = await executeCall(call, { loadTool });
    expect(written).toHaveLength(2);
    expect(records.every(r => r.tool === 'write_file' && r.status === 'done')).toBe(true);
  });

  it('allowlist disi araclari (orn. discord) engeller — model keyfi arac cagiramaz', async () => {
    let loaded = false;
    const loadTool = () => { loaded = true; return { execute: async () => ({ success: true }) }; };
    const { records, feedback } = await executeCall({ tool: 'discord', args: { message: 'spam' } }, { loadTool });
    expect(loaded).toBe(false);
    expect(records[0].status).toBe('error');
    expect(feedback).toMatch(/kullanilamaz/i);
  });

  it('bash allowlist icinde — komut icin bash.js\'e yonlendirir (guvenligi bash.js uygular)', async () => {
    let ranCommand = null;
    const loadTool = (n) => {
      if (n === 'bash') return { execute: async (a) => { ranCommand = a.command; return { success: true, output: 'v20' }; } };
      throw new Error('beklenmeyen arac ' + n);
    };
    const { records } = await executeCall({ tool: 'run_command', args: { command: 'node -v' } }, { loadTool, isDangerous: () => false });
    expect(ranCommand).toBe('node -v');
    expect(records[0].status).toBe('done');
  });

  it('yikici komutu (rm -rf) ajan modunda calistirmadan engeller', async () => {
    let reached = false;
    const loadTool = () => ({ execute: async () => { reached = true; return { success: true }; } });
    const { records, feedback } = await executeCall(
      { tool: 'bash', args: { command: 'rm -rf /' } },
      { loadTool, isDangerous: () => true }
    );
    expect(reached).toBe(false); // bash.js'e hic ulasmamali
    expect(records[0].status).toBe('error');
    expect(feedback).toMatch(/CALISTIRILMADI|tehlikeli/i);
  });

  it('read_file icerigini feedback\'e koyar (model gormeli, yoksa "okudum ama bos" takilir)', async () => {
    const loadTool = () => ({ execute: async () => ({ success: true, path: '/x.js', content: 'const answer = 42;' }) });
    const { records, feedback } = await executeCall({ tool: 'read_file', args: { path: '/x.js' } }, { loadTool });
    expect(records[0].status).toBe('done');
    expect(feedback).toContain('const answer = 42;');
  });

  it('bash ciktisini feedback\'e koyar', async () => {
    const loadTool = () => ({ execute: async () => ({ success: true, output: 'merhaba dunya' }) });
    const { feedback } = await executeCall({ tool: 'bash', args: { command: 'node app.js' } }, { loadTool, isDangerous: () => false });
    expect(feedback).toContain('merhaba dunya');
  });

  it('allowlist icindeki write_file\'i calistirir ve ~ genisletir', async () => {
    const loadTool = () => ({ execute: async (a) => ({ success: true, path: a.path, size: 3 }) });
    const { records } = await executeCall({ tool: 'write_file', args: { path: '~/t.txt', content: 'abc' } }, { loadTool });
    expect(records[0].status).toBe('done');
    expect(records[0].args.path).not.toContain('~');
  });
});

describe('runAgentic dongusu', () => {
  it('arac cagirir, sonra duz final yanitta durur', async () => {
    const turns = [
      '<minimax:tool_call><invoke name="write_file"><parameter name="path">/tmp/x.txt</parameter><parameter name="content">hi</parameter></invoke></minimax:tool_call>',
      'Dosya olusturuldu.',
    ];
    let i = 0;
    const written = [];
    const callModel = async () => ({ content: turns[i++], toolCalls: [] });
    const loadTool = () => ({ execute: async (a) => { written.push(a); return { success: true, path: a.path, size: 2 }; } });
    const { records, reply, iterations } = await runAgentic({ callModel, systemPrompt: 's', task: 't', loadTool, maxIterations: 5 });
    expect(written).toHaveLength(1);
    expect(records.filter(r => r.status === 'done')).toHaveLength(1);
    expect(reply).toBe('Dosya olusturuldu.');
    expect(iterations).toBe(2);
  });
});
