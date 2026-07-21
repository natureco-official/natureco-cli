/**
 * mac_notify - macOS bildirim goster (v4.9.1)
 */

const { execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

const DISPLAY_NOTIFICATION_SCRIPT = `
on run argv
  set notificationTitle to item 1 of argv
  set notificationMessage to item 2 of argv
  set notificationSubtitle to item 3 of argv
  if notificationSubtitle is not "" then
    display notification notificationMessage with title notificationTitle subtitle notificationSubtitle
  else
    display notification notificationMessage with title notificationTitle
  end if
end run
`;

function runAppleScript(script, args = []) {
  return execFileSync("osascript", ["-", ...args], { input: script, timeout: 10000 }).toString().trim();
}

async function macNotify(params) {
  if (!IS_MAC) return { success: false, error: "macOS'a ozgu" };
  const { title, message, subtitle = "" } = params;
  if (!title || !message) return { success: false, error: "title ve message gerekli" };

  try {
    await runAppleScript(DISPLAY_NOTIFICATION_SCRIPT, [title, message, subtitle || ""]);
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
