/**
 * reminder_add - macOS Reminders'a hatirlatici ekle (v4.9.1)
 */

const { execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

const CREATE_REMINDER_SCRIPT = `
on run argv
  set reminderTitle to item 1 of argv
  set reminderNotes to item 2 of argv
  set listName to item 3 of argv
  set dueDateMode to item 4 of argv
  set dueDateValue to item 5 of argv
  tell application "Reminders"
    if listName is not "" then
      set targetList to list listName
    else
      set targetList to default list
    end if
    set newReminder to make new reminder at end of targetList with properties {name:reminderTitle}
    if reminderNotes is not "" then set body of newReminder to reminderNotes
    if dueDateMode is "today" then
      set due date of newReminder to current date
    else if dueDateMode is "date" then
      set reminderDueDate to current date
      set year of reminderDueDate to (item 6 of argv) as integer
      set month of reminderDueDate to (item 7 of argv) as integer
      set day of reminderDueDate to (item 8 of argv) as integer
      set hours of reminderDueDate to (item 9 of argv) as integer
      set minutes of reminderDueDate to (item 10 of argv) as integer
      set seconds of reminderDueDate to 0
      set due date of newReminder to reminderDueDate
    end if
    save
    return id of newReminder
  end tell
end run
`;

function runAppleScript(script, args = []) {
  return execFileSync("osascript", ["-", ...args], { input: script, timeout: 10000 }).toString().trim();
}

async function reminderAdd(params) {
  if (!IS_MAC) return { success: false, error: "Reminders sadece macOS'ta" };
  const { title, dueDate = null, list = null, notes = "" } = params;
  if (!title) return { success: false, error: "title gerekli" };

  const dueDateMode = dueDate === "today" ? "today" : (dueDate ? "date" : "none");
  let absoluteDateComponents = [];
  if (dueDateMode === "date") {
    const parsedDueDate = new Date(dueDate);
    if (Number.isNaN(parsedDueDate.getTime())) {
      return { success: false, error: `Gecersiz dueDate: "${dueDate}"` };
    }
    absoluteDateComponents = [
      parsedDueDate.getFullYear(), parsedDueDate.getMonth() + 1, parsedDueDate.getDate(),
      parsedDueDate.getHours(), parsedDueDate.getMinutes(),
    ].map(String);
  }

  try {
    const id = await runAppleScript(CREATE_REMINDER_SCRIPT, [
      title, notes || "", list || "", dueDateMode, dueDateMode === "date" ? "" : (dueDate || ""),
      ...absoluteDateComponents,
    ]);
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
