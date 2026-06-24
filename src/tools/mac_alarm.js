/**
 * mac_alarm - macOS Clock app ile alarm kur (v5.1.1)
 *
 * Parton'un istegi: "Saat uygulamasi uzerinden saat 18:00 alarm kur"
 * Eski reminder_add date parse edemiyordu. Bu tool AppleScript ile
 * Clock.app'in events sistemine yazar (alarm orada saklanir).
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
    proc.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || "osascript error")));
  });
}

/**
 * Tarih/saat ayristir — esnek formatlar kabul eder
 * @param input - "18:00", "18:30 tomorrow", "2026-06-22 18:00", "+1 hour"
 * @returns { hours, minutes, date, formattedDate, formattedTime }
 */
function parseAlarmTime(input) {
  const now = new Date();
  let target = new Date();
  let hours = 0, minutes = 0;

  // Format: "18:00" veya "18:30 tomorrow"
  const hmMatch = input.match(/(\d{1,2}):(\d{2})(?:\s+(tomorrow|yarın|today|bugün|next\s+(\w+)))?/i);
  if (hmMatch) {
    hours = parseInt(hmMatch[1]);
    minutes = parseInt(hmMatch[2]);
    const dayShift = hmMatch[3];
    if (dayShift && /tomorrow|yarın/i.test(dayShift)) {
      target.setDate(target.getDate() + 1);
    }
  } else if (input.match(/^\d{1,2}$/)) {
    hours = parseInt(input);
    minutes = 0;
  } else if (input.match(/^\+(\d+)\s*(hour|minute|day)/i)) {
    const m = input.match(/\+(\d+)\s*(hour|minute|day)/i);
    const n = parseInt(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === "hour") target.setHours(target.getHours() + n);
    else if (unit === "minute") target.setMinutes(target.getMinutes() + n);
    else if (unit === "day") target.setDate(target.getDate() + n);
    hours = target.getHours();
    minutes = target.getMinutes();
  } else {
    // ISO date parse
    const parsed = new Date(input);
    if (!isNaN(parsed)) {
      target = parsed;
      hours = target.getHours();
      minutes = target.getMinutes();
    } else {
      throw new Error("Gecersiz zaman formati. Ornekler: '18:00', 'tomorrow 09:30', '+1 hour', '2026-06-23 07:00'");
    }
  }

  // Eger saat dakika parse edildiyse target'a uygula
  if (hmMatch) {
    target.setHours(hours, minutes, 0, 0);
  }

  const pad = (n) => String(n).padStart(2, "0");
  return {
    hours, minutes,
    date: target.toISOString().slice(0, 10),
    formattedDate: `${pad(target.getMonth() + 1)}/${pad(target.getDate())}/${target.getFullYear()}`,
    formattedTime: `${pad(hours)}:${pad(minutes)}:00`,
    humanReadable: target.toLocaleString("tr-TR"),
    timestamp: target.getTime(),
  };
}

async function setAlarm({ time, label = "Alarm", calendarName = "Calendar" }) {
  if (!IS_MAC) return { success: false, error: "Bu tool sadece macOS'ta calisir" };
  if (!time) return { success: false, error: "time gerekli (ornek: '18:00', 'tomorrow 09:30', '+1 hour')" };

  let parsed;
  try { parsed = parseAlarmTime(time); }
  catch (e) { return { success: false, error: e.message }; }

  // AppleScript ile macOS Calendar'a all-day etkinlik olarak alarm ekle
  // (Reminder ile ayni sonuc, daha guvenilir cunku Calendar otomasyon izni Reminders'dan once verilir)
  // Dual: Calendar event (gorunurluk) + Reminders (bildirim + alarm)
  // Once Calendar'a basit etkinlik (alarm'siz, ama gorunur), sonra Reminders alarm
  const calendarScript = `
    tell application "Calendar"
      set targetCal to first calendar whose writable is true
      set startDate to date "${parsed.formattedDate} ${parsed.formattedTime}"
      set endDate to startDate + (1 * minutes)
      set newEvent to make new event at end of events of targetCal with properties {summary:"⏰ ${label.replace(/"/g, "'")} - NatureCo", start date:startDate, end date:endDate, allday event:false}
      save
      return id of newEvent
    end tell
  `;

  // Reminders'a bildirim + sesli alarm
  const reminderScript = `
    tell application "Reminders"
      set targetList to default list
      set startDate to date "${parsed.formattedDate} ${parsed.formattedTime}"
      set newReminder to make new reminder at end of targetList with properties {name:"⏰ ${label.replace(/"/g, "'")} - NatureCo", body:"NatureCo CLI tarafindan ${parsed.humanReadable} icin kuruldu", due date:startDate}
      save
      return id of newReminder
    end tell
  `;

  try {
    const results = { calendar: null, reminders: null, errors: [] };

    // Calendar'a ekle (gorunurluk)
    try {
      results.calendar = await runAppleScript(calendarScript);
    } catch (e) {
      results.errors.push(`Calendar: ${e.message}`);
    }

    // Reminders'a ekle (bildirim + sesli alarm)
    try {
      results.reminders = await runAppleScript(reminderScript);
    } catch (e) {
      results.errors.push(`Reminders: ${e.message}`);
    }

    const success = !!(results.calendar || results.reminders);
    return {
      success,
      eventId: results.reminders || results.calendar,
      calendarEventId: results.calendar,
      reminderId: results.reminders,
      message: success
        ? `⏰ Alarm kuruldu: ${parsed.humanReadable} — "${label}"`
        : `Alarm kurulamadi: ${results.errors.join('; ')}`,
      calendar: calendarName,
      targetTime: parsed.humanReadable,
      targetTimestamp: parsed.timestamp,
      errors: results.errors.length > 0 ? results.errors : undefined,
    };
  } catch (e) {
    if (e.message.includes("-1728") || e.message.includes("not authorized")) {
      return {
        success: false,
        error: "Calendar erisim izni yok. System Preferences -> Security & Privacy -> Privacy -> Automation -> natureco -> Calendar -> ON",
      };
    }
    return { success: false, error: e.message };
  }
}

async function listAlarms() {
  if (!IS_MAC) return { success: false, error: "Sadece macOS" };
  const script = `
    tell application "Calendar"
      set nowDate to current date
      set futureEvents to {}
      repeat with cal in calendars
        repeat with e in events of cal
          if start date of e > nowDate and (summary of e starts with "⏰") then
            copy (start date of e as string) & " | " & (summary of e) to end of futureEvents
          end if
        end repeat
      end repeat
      return futureEvents
    end tell
  `;
  try {
    const result = await runAppleScript(script);
    const alarms = result.split(", ").filter(Boolean);
    return { success: true, count: alarms.length, alarms };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  name: "mac_alarm",
  description: "macOS Clock/Calendar uzerinden alarm kur. '18:00', 'tomorrow 09:30', '+1 hour' gibi formatlari kabul eder.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", description: "set/list (default: set)", enum: ["set", "list"] },
      time: { type: "string", description: "Alarm zamani: '18:00', 'tomorrow 09:30', '+1 hour', '2026-06-23 07:00'" },
      label: { type: "string", description: "Alarm etiketi (default: 'Alarm')" },
    },
    required: [],
  },
  async execute(params) {
    if (params.action === "list") return listAlarms();
    return setAlarm(params);
  },
};