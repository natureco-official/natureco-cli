/**
 * text_to_speech - TTS (v4.9.0)
 *
 * Hermes TTS'ine benzer. Edge TTS veya OpenAI TTS.
 * macOS'ta 'say' komutu fallback.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { _getInterpreterCandidates: getInterpreterCandidates } = require("./code_execution");

const EDGE_TTS_SCRIPT = `
import asyncio, sys
try:
    import edge_tts
except ImportError:
    print("ERROR: pip install edge-tts", file=sys.stderr)
    sys.exit(1)
async def main():
    text, voice, output_path = sys.argv[1:4]
    tts = edge_tts.Communicate(text, voice)
    await tts.save(output_path)
asyncio.run(main())
`;

async function speak({ text, provider = "auto", voice = "tr-TR", savePath = null }) {
  if (!text) return { success: false, error: "text gerekli" };

  // Once dosyaya kaydet, sonra caldir
  if (provider === "auto" || provider === "edge") {
    return await edgeTTS(text, voice, savePath);
  }
  if (provider === "say") {
    return await macSay(text);
  }
  if (provider === "save") {
    return await saveToFile(text, savePath);
  }
  return { success: false, error: `Desteklenmeyen provider: ${provider}` };
}

async function edgeTTS(text, voice, savePath) {
  const out = savePath || path.join(os.tmpdir(), `tts-${Date.now()}.mp3`);
  const candidates = getInterpreterCandidates("python", EDGE_TTS_SCRIPT)
    .map(candidate => ({ ...candidate, args: [...candidate.args, text, voice, out] }));

  for (const candidate of candidates) {
    const result = await new Promise((resolve) => {
      const proc = spawn(candidate.bin, candidate.args, { timeout: 30000 });
      let stderr = "";
      proc.stderr.on("data", d => stderr += d);
      proc.on("close", code => resolve({ code, stderr }));
      proc.on("error", error => resolve({ error }));
    });
    if (result.error) {
      if (result.error.code === "ENOENT") continue;
      return { success: false, error: result.error.message + " (pip install edge-tts)" };
    }
    const unavailable = result.code === 9009 || result.code === 127 || /not found|not recognized|install from the Microsoft Store/i.test(result.stderr);
    if (unavailable) continue;
    if (result.code === 0) return { success: true, provider: "edge", interpreter: candidate.bin, path: out, message: `Ses kaydedildi: ${out}` };
    return { success: false, interpreter: candidate.bin, error: result.stderr || `edge-tts hata ${result.code}. Kur: pip install edge-tts` };
  }
  return { success: false, error: `Python bu sistemde kurulu degil. (denenen: ${candidates.map(candidate => candidate.bin).join(", ")})` };
}

async function macSay(text) {
  return new Promise((resolve) => {
    const proc = spawn("say", ["-v", "Yelda", text]);
    proc.on("close", code => {
      if (code === 0) resolve({ success: true, provider: "mac-say", message: "Seslendirildi" });
      else resolve({ success: false, error: `say hata ${code}` });
    });
    proc.on("error", e => resolve({ success: false, error: e.message }));
  });
}

async function saveToFile(text, savePath) {
  if (!savePath) return { success: false, error: "savePath gerekli" };
  try {
    fs.writeFileSync(savePath, text, "utf8");
    return { success: true, provider: "save", path: savePath, message: `Metin kaydedildi: ${savePath}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "text_to_speech",
  description: "Metin seslendir. macOS say, edge-tts (pip install edge-tts), veya dosyaya kaydet.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Seslendirilecek metin" },
      provider: { type: "string", description: "edge, say, save (default: auto)", enum: ["auto", "edge", "say", "save"] },
      voice: { type: "string", description: "Ses (ornek: tr-TR-EmelNeural, en-US-AriaNeural)" },
      savePath: { type: "string", description: "Kayıt yolu (edge/save provider için)" },
    },
    required: ["text"],
  },
  async execute(params) {
    return await speak(params);
  },
  _edgeTTS: edgeTTS,
};
