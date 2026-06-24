/**
 * reminder_add - macOS Reminders'a hatirlatici ekle (v4.9.1)
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

async function reminderAdd(params) {
  if (!IS_MAC) return { success: false, error: "Reminders sadece macOS'ta" };
  const { title, dueDate = null, list = null, notes = "" } = params;
  if (!title) return { success: false, error: "title gerekli" };

  const listScript = list ? `list "${list}"` : `default list`;
  const dueScript = dueDate === "today" ? "current date" : (dueDate ? `date "${dueDate}"` : "missing value");

  const script = `
    tell application "Reminders"
      set targetList to ${listScript}
      set newReminder to make new reminder at end of targetList with properties {name:"${title.replace(/"/g, "'")}"${notes ? `, body:"${notes.replace(/"/g, "'")}"` : ""}}
      ${dueDate ? `set due date of newReminder to ${dueScript}` : ""}
      save
      return id of newReminder
    end tell
  `;

  try {
    const id = await runAppleScript(script);
    return { success: true, reminderId: id, title, dueDate, message: `Hatirlatici eklendi: "${title}"` };
  } catch (e) {
    if (e.message.includes("-1743") || e.message.includes("not authorized")) {
      return { success: false, error: "Reminders erisim izni yok. System Preferences -> Security -> Automation -> Reminders -> ON" };
    }
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "reminder_add",
  description: "macOS Reminders'a hatirlatici ekle.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Hatirlatici basligi" },
      dueDate: { type: "string", description: 'Son tarih: "today", "+1 day", ISO "2026-06-23 14:00"' },
      list: { type: "string", description: "Liste adi (default: default list)" },
      notes: { type: "string", description: "Not" },
    },
    required: ["title"],
  },
  async execute(params) {
    return await reminderAdd(params);
  },
};