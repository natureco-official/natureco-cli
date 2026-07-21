/**
 * mac_app_quit - macOS uygulamasi kapat (v4.9.1)
 */

const { execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

const QUIT_APPLICATION_SCRIPT = `
on run argv
  set appName to item 1 of argv
  using terms from application "Finder"
    tell application appName to quit
  end using terms from
end run
`;

function runAppleScript(script, args = []) {
  return execFileSync("osascript", ["-", ...args], { input: script, timeout: 10000 }).toString().trim();
}

async function macAppQuit(params) {
  if (!IS_MAC) return { success: false, error: "macOS'a ozgu" };
  const { appName } = params;
  if (!appName) return { success: false, error: "appName gerekli" };

  try {
    await runAppleScript(QUIT_APPLICATION_SCRIPT, [appName]);
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
