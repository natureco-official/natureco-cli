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
  return new Promise((resolve) => {
    const out = savePath || path.join(os.tmpdir(), `tts-${Date.now()}.mp3`);
    const proc = spawn("python3", ["-c", `
import asyncio, sys
try:
    import edge_tts
except ImportError:
    print("ERROR: pip install edge-tts", file=sys.stderr)
    sys.exit(1)
async def main():
    tts = edge_tts.Communicate("""${text.replace(/"/g, "'")}""", "${voice}")
    await tts.save("${out}")
asyncio.run(main())
`], { timeout: 30000 });
    let stderr = "";
    proc.stderr.on("data", d => stderr += d);
    proc.on("close", code => {
      if (code === 0) resolve({ success: true, provider: "edge", path: out, message: `Ses kaydedildi: ${out}` });
      else resolve({ success: false, error: stderr || `edge-tts hata ${code}. Kur: pip install edge-tts` });
    });
    proc.on("error", e => resolve({ success: false, error: e.message + " (pip install edge-tts)" }));
  });
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
};