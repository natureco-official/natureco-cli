/**
 * mac_notify - macOS bildirim goster (v4.9.1)
 */

const { spawn } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", ["-e", script]);
    let out = ""; let err = "";
    proc.stdout.on("data", d => out += d);
    proc.stderr.on("data", d => err += d);
    proc.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim())));
  });
}

async function macNotify(params) {
  if (!IS_MAC) return { success: false, error: "macOS'a ozgu" };
  const { title, message, subtitle = "" } = params;
  if (!title || !message) return { success: false, error: "title ve message gerekli" };

  const script = `display notification "${message.replace(/"/g, "'")}" with title "${title.replace(/"/g, "'")}"${subtitle ? ` subtitle "${subtitle.replace(/"/g, "'")}"` : ""}`;

  try {
    await runAppleScript(script);
    return { success: true, message: `Bildirim gonderildi: ${title}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "mac_notify",
  description: "macOS Notification Center'da bildirim goster.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Bildirim basligi" },
      message: { type: "string", description: "Bildirim mesaji" },
      subtitle: { type: "string", description: "Alt baslik (opsiyonel)" },
    },
    required: ["title", "message"],
  },
  async execute(params) {
    return await macNotify(params);
  },
};