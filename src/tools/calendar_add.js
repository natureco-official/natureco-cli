/**
 * calendar_add - macOS Calendar'a etkinlik ekle (v4.9.1)
 *
 * OS-level calendar kontrolü
 * "Yarin saat 14:00 toplantim var" -> Takvime ekler.
 */

const { execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

const CREATE_EVENT_SCRIPT = `
on run argv
  set eventTitle to item 1 of argv
  set startDateValue to item 2 of argv
  set durationMinutes to (item 3 of argv) as real
  set calendarName to item 4 of argv
  set eventNotes to item 5 of argv
  set eventLocation to item 6 of argv
  set startDateMode to item 7 of argv
  set relativeAmount to (item 8 of argv) as integer
  set relativeUnit to item 9 of argv
  tell application "Calendar"
    if calendarName is not "" then
      set targetCal to calendar calendarName
    else
      set targetCal to first calendar whose writable is true
    end if
    if startDateMode is "now" then
      set eventStartDate to current date
    else if startDateMode is "relative" then
      if relativeUnit is "hour" then
        set eventStartDate to (current date) + relativeAmount * hours
      else if relativeUnit is "day" then
        set eventStartDate to (current date) + relativeAmount * days
      else
        set eventStartDate to (current date) + relativeAmount * minutes
      end if
    else
      set eventStartDate to current date
      set year of eventStartDate to (item 10 of argv) as integer
      set month of eventStartDate to (item 11 of argv) as integer
      set day of eventStartDate to (item 12 of argv) as integer
      set hours of eventStartDate to (item 13 of argv) as integer
      set minutes of eventStartDate to (item 14 of argv) as integer
      set seconds of eventStartDate to 0
    end if
    set eventEndDate to eventStartDate + (durationMinutes * minutes)
    set newEvent to make new event at end of events of targetCal with properties {summary:eventTitle, start date:eventStartDate, end date:eventEndDate}
    if eventLocation is not "" then set location of newEvent to eventLocation
    if eventNotes is not "" then set description of newEvent to eventNotes
    save
    return id of newEvent
  end tell
end run
`;

function runAppleScript(script, args = []) {
  return execFileSync("osascript", ["-", ...args], { input: script, timeout: 10000 }).toString().trim();
}

async function calendarAdd(params) {
  if (!IS_MAC) return { success: false, error: "Calendar sadece macOS'ta desteklenir" };
  const { title, startDate = "now", duration = 60, calendar = null, notes = "", location = "" } = params;
  if (!title) return { success: false, error: "title gerekli" };

  let startDateMode = "absolute";
  let relativeAmount = "0";
  let relativeUnit = "minute";
  let absoluteDateComponents = [];
  if (startDate === "now") startDateMode = "now";
  else if (typeof startDate === "string" && startDate.startsWith("+")) {
    const m = startDate.match(/\+(\d+)\s*(hour|day|minute)/i);
    if (m) {
      startDateMode = "relative";
      relativeAmount = m[1];
      relativeUnit = m[2].toLowerCase();
    } else startDateMode = "now";
  }

  if (startDateMode === "absolute") {
    const parsedStartDate = new Date(startDate);
    if (Number.isNaN(parsedStartDate.getTime())) {
      return { success: false, error: `Gecersiz startDate: "${startDate}"` };
    }
    absoluteDateComponents = [
      parsedStartDate.getFullYear(), parsedStartDate.getMonth() + 1, parsedStartDate.getDate(),
      parsedStartDate.getHours(), parsedStartDate.getMinutes(),
    ].map(String);
  }

  try {
    const eventId = await runAppleScript(CREATE_EVENT_SCRIPT, [
      title, startDateMode === "absolute" ? "" : String(startDate), String(duration), calendar || "", notes || "", location || "",
      startDateMode, relativeAmount, relativeUnit,
      ...absoluteDateComponents,
    ]);
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
