/**
 * mac_app_quit - macOS uygulamasi kapat (v4.9.1)
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

async function macAppQuit(params) {
  if (!IS_MAC) return { success: false, error: "macOS'a ozgu" };
  const { appName } = params;
  if (!appName) return { success: false, error: "appName gerekli" };

  try {
    await runAppleScript(`tell application "${appName}" to quit`);
    return { success: true, message: `"${appName}" kapatildi` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "mac_app_quit",
  description: "macOS uygulamasi kapat.",
  inputSchema: {
    type: "object",
    properties: {
      appName: { type: "string", description: "Uygulama adi" },
    },
    required: ["appName"],
  },
  async execute(params) {
    return await macAppQuit(params);
  },
};