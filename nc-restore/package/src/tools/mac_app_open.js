/**
 * mac_app_open - macOS uygulamasi ac (v4.9.1)
 */

const { spawn } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

async function macAppOpen(params) {
  if (!IS_MAC) return { success: false, error: "macOS'a ozgu" };
  const { appName } = params;
  if (!appName) return { success: false, error: "appName gerekli" };

  return new Promise((resolve) => {
    const proc = spawn("open", ["-a", appName]);
    proc.on("close", code => {
      if (code === 0) resolve({ success: true, message: `"${appName}" acildi` });
      else resolve({ success: false, error: `Uygulama acilamadi: ${appName}` });
    });
    proc.on("error", e => resolve({ success: false, error: e.message }));
  });
}

module.exports = {
  name: "mac_app_open",
  description: "macOS uygulamasi ac (Finder, Safari, Slack, vs.).",
  inputSchema: {
    type: "object",
    properties: {
      appName: { type: "string", description: 'Uygulama adi (Finder, Safari, Slack, Spotify...)' },
    },
    required: ["appName"],
  },
  async execute(params) {
    return await macAppOpen(params);
  },
};