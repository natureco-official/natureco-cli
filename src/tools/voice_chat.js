/**
 * voice_chat - Sesli asistan (v5.3.0)
 *
 * Voice chat — sesli iletisim
 *
 * Mikrofon → Whisper STT → REPL'e metin olarak gönder
 * Bot cevabı → TTS ile sesli oku
 *
 * macOS icin: afplay + sox/rec + Whisper
 * Cross-platform: openai-whisper API veya local whisper.cpp
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const https = require("https");

const IS_MAC = os.platform() === "darwin";

/**
 * Whisper API ile sesi metne cevir
 */
function whisperTranscribe(audioBuffer, provider = "openai") {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY || process.env.WHISPER_API_KEY;
    if (!apiKey) {
      reject(new Error("OPENAI_API_KEY gerekli (Whisper API icin)"));
      return;
    }

    // multipart/form-data olustur
    const boundary = "----formdata-" + Date.now();
    const filename = "/tmp/audio-" + Date.now() + ".wav";

    // Basit multipart builder
    let body = Buffer.alloc(0);
    body = Buffer.concat([body, Buffer.from(`--${boundary}\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`Content-Type: audio/wav\r\n\r\n`)]);
    body = Buffer.concat([body, audioBuffer]);
    body = Buffer.concat([body, Buffer.from(`\r\n--${boundary}\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`Content-Disposition: form-data; name="model"\r\n\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`whisper-1`)]);
    body = Buffer.concat([body, Buffer.from(`\r\n--${boundary}\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`Content-Disposition: form-data; name="language"\r\n\r\n`)]);
    body = Buffer.concat([body, Buffer.from(`tr`)]);
    body = Buffer.concat([body, Buffer.from(`\r\n--${boundary}--\r\n`)]);

    const req = https.request({
      hostname: "api.openai.com",
      port: 443,
      path: "/v1/audio/transcriptions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
      timeout: 30000,
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.text || "");
        } catch (e) {
          reject(new Error("Whisper API yanit parse hatasi: " + data.slice(0, 200)));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy() && reject(new Error("Whisper timeout")));
    req.write(body);
    req.end();
  });
}

/**
 * macOS'ta mikrofondan ses kaydet
 * "sox" veya "rec" komutunu kullanir
 */
function recordMac(durationSec = 5) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(os.tmpdir(), `voice-${Date.now()}.wav`);

    // sox varsa onu kullan, yoksa built-in "rec" (sox)
    const proc = spawn("rec", [
      "-r", "16000",           // 16kHz (Whisper icin ideal)
      "-c", "1",               // mono
      "-b", "16",              // 16-bit
      outFile,
      "trim", "0", String(durationSec),  // sure
    ], { timeout: durationSec * 1000 + 5000 });

    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outFile)) {
        resolve(outFile);
      } else {
        reject(new Error("Ses kaydi basarisiz. Kur: brew install sox"));
      }
    });
    proc.on("error", (e) => reject(new Error("'rec' komutu bulunamadi. brew install sox ile kur")));
  });
}

/**
 * macOS'ta text-to-speech (say)
 */
function macSay(text) {
  return new Promise((resolve) => {
    if (!text) return resolve({ success: false, error: "text bos" });
    const proc = spawn("say", ["-v", "Yelda", text]);
    proc.on("close", (code) => {
      if (code === 0) resolve({ success: true, provider: "mac-say" });
      else resolve({ success: false, error: `say exit ${code}` });
    });
    proc.on("error", (e) => resolve({ success: false, error: e.message }));
  });
}

/**
 * Voice chat — record → transcribe → reply → speak
 */
async function voiceChat({ action = "speak", text, durationSec = 5 } = {}) {
  if (!IS_MAC) return { success: false, error: "Voice chat sadece macOS'ta" };

  if (action === "record") {
    try {
      const audioFile = await recordMac(durationSec);
      const buffer = fs.readFileSync(audioFile);
      const text = await whisperTranscribe(buffer);
      fs.unlinkSync(audioFile);
      return { success: true, action: "record", text, message: `Algilanan: "${text}"` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  if (action === "speak" || !action) {
    if (!text) return { success: false, error: "text gerekli (speak icin)" };
    return await macSay(text);
  }

  if (action === "test") {
    // Setup check
    try {
      const outFile = path.join(os.tmpdir(), "voice-test.wav");
      const proc = spawn("which", ["rec"]);
      proc.on("close", (code) => {
        if (code === 0) return { success: true, message: "Voice chat hazir" };
      });
      return { success: false, error: "'rec' komutu yok. brew install sox" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return { success: false, error: `Bilinmeyen action: ${action}` };
}

module.exports = {
  name: "voice_chat",
  description: "Sesli asistan: mikrofonla konus, Whisper ile metne cevir, yaniti sesli oku. macOS + sox gerekli.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "record (konusarak yaz), speak (yaziyi sesli oku), test (hazir mi?)", enum: ["record", "speak", "test"] },
      text: { type: "string", description: "Sesli okunacak metin (speak icin)" },
      durationSec: { type: "number", description: "Kayit suresi (default 5)" },
    },
    required: [],
  },
  async execute(params) {
    return await voiceChat(params);
  },
};