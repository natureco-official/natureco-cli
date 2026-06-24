/**
 * calendar_add - macOS Calendar'a etkinlik ekle (v4.9.1)
 *
 * Parton'un OS-level kontrol vizyonu için.
 * "Yarin saat 14:00 toplantim var" -> Takvime ekler.
 */

const { spawn } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", ["-e", script]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", d => stdout += d);
    proc.stderr.on("data", d => stderr += d);
    proc.on("close", code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `osascript exit ${code}`));
    });
  });
}

async function calendarAdd(params) {
  if (!IS_MAC) return { success: false, error: "Calendar sadece macOS'ta desteklenir" };
  const { title, startDate = "now", duration = 60, calendar = null, notes = "", location = "" } = params;
  if (!title) return { success: false, error: "title gerekli" };

  let startScript;
  if (startDate === "now") startScript = "current date";
  else if (typeof startDate === "string" && startDate.startsWith("+")) {
    const m = startDate.match(/\+(\d+)\s*(hour|day|minute)/i);
    if (m) startScript = `(current date) + ${m[1]} * ${m[2].toLowerCase()}s`;
    else startScript = "current date";
  } else {
    startScript = `date "${startDate}"`;
  }

  const calScript = calendar ? `calendar "${calendar}"` : `first calendar whose writable is true`;

  const script = `
    tell application "Calendar"
      set targetCal to ${calScript}
      set startDate to ${startScript}
      set endDate to startDate + (${duration} * minutes)
      set newEvent to make new event at end of events of targetCal with properties {summary:"${title.replace(/"/g, "'")}", start date:startDate, end date:endDate${location ? `, location:"${location.replace(/"/g, "'")}"` : ""}${notes ? `, description:"${notes.replace(/"/g, "'")}"` : ""}}
      save
      return id of newEvent
    end tell
  `;

  try {
    const eventId = await runAppleScript(script);
    return {
      success: true,
      eventId,
      title,
      startDate,
      duration,
      message: `Takvime eklendi: "${title}" (${startDate} + ${duration}dk)`,
    };
  } catch (e) {
    if (e.message.includes("-1728") || e.message.includes("not authorized")) {
      return {
        success: false,
        error: "Calendar erisim izni yok.\n\nIzin vermek icin:\n1. System Preferences -> Security & Privacy -> Privacy -> Automation\n2. natureco (veya Terminal) -> Calendar -> ON\n3. Tekrar dene",
      };
    }
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "calendar_add",
  description: "macOS Calendar'a etkinlik ekle. 'Yarin 14:00 toplanti' gibi.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Etkinlik basligi" },
      startDate: { type: "string", description: 'Baslangic: "now", "+1 hour", "+2 days", veya ISO "2026-06-23 14:00"' },
      duration: { type: "number", description: "Dakika (default 60)" },
      calendar: { type: "string", description: "Takvim adi (default: ilk yazilabilir)" },
      notes: { type: "string", description: "Notlar" },
      location: { type: "string", description: "Konum" },
    },
    required: ["title"],
  },
  async execute(params) {
    return await calendarAdd(params);
  },
};