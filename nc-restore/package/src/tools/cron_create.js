/**
 * cron_create - Zamanlanmis gorev (v4.9.0)
 *
 * Hermes cronjob'una benzer. "Her gun 09:00'da calistir" gibi.
 * NatureCo CLI mevcut cron sistemine yazar (cron.js zaten var).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const CRON_FILE = path.join(os.homedir(), ".natureco", "crons.json");

function loadCrons() {
  try {
    if (!fs.existsSync(CRON_FILE)) return [];
    return JSON.parse(fs.readFileSync(CRON_FILE, "utf8"));
  } catch { return []; }
}

function saveCrons(crons) {
  fs.mkdirSync(path.dirname(CRON_FILE), { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(crons, null, 2), "utf8");
}

function genId() {
  return "cron-" + Date.now().toString(36);
}

// Yaygin zamanlama ifadeleri
const SCHEDULE_PRESETS = {
  "every minute": "* * * * *",
  "every 5 minutes": "*/5 * * * *",
  "every 15 minutes": "*/15 * * * *",
  "every hour": "0 * * * *",
  "every day 9am": "0 9 * * *",
  "every day midnight": "0 0 * * *",
  "every monday 9am": "0 9 * * 1",
  "every sunday": "0 9 * * 0",
};

async function createCron({ name, schedule, command, description = "" }) {
  if (!name) return { success: false, error: "name gerekli" };
  if (!schedule) return { success: false, error: "schedule gerekli (cron expression veya preset)" };
  if (!command) return { success: false, error: "command gerekli (calistirilacak komut)" };

  // Preset kontrolu
  const resolvedSchedule = SCHEDULE_PRESETS[schedule.toLowerCase()] || schedule;

  // Cron expression dogrulama (basit)
  if (!/^[\d*/\s,-]+$/.test(resolvedSchedule)) {
    return { success: false, error: `Gecersiz cron expression: ${resolvedSchedule}` };
  }

  const crons = loadCrons();
  const newCron = {
    id: genId(),
    name,
    schedule: resolvedSchedule,
    command,
    description,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  crons.push(newCron);
  saveCrons(crons);

  // İstege bagli: gercek crontab'a da ekle (sistem cron)
  // Bu tehlikeli olabilir, sadece bilgi veriyoruz
  let systemCrontabInstalled = false;
  try {
    const crontabLine = `${resolvedSchedule} ${command} # natureco:${name}`;
    const current = execSync("crontab -l 2>/dev/null || echo ''", { encoding: "utf8" });
    if (!current.includes(`# natureco:${name}`)) {
      // Kullaniciya soru sormadan eklemiyoruz - sadece komutu gosteriyoruz
      systemCrontabInstalled = false;
    }
  } catch {}

  // v5.2.0: Gercek macOS crontab'a ekle (kullanici crontab, sudo gerekmez)
  const marker = `# natureco:${name}`;
  let crontabUpdated = false;
  let crontabError = null;

  try {
    const { execSync } = require("child_process");
    // Mevcut crontab'i oku
    let existing = "";
    try { existing = execSync("crontab -l 2>/dev/null", { encoding: "utf8" }); }
    catch { existing = ""; }

    // Ayni isimde var mi kontrol
    if (existing.includes(marker)) {
      crontabUpdated = false;
    } else {
      const newLine = `${resolvedSchedule} ${command} ${marker}`;
      const updated = existing + (existing.endsWith("\n") || existing === "" ? "" : "\n") + newLine + "\n";
      // Yeni crontab yukle (heredoc yerine - ile stdin)
      execSync("crontab -", { input: updated, encoding: "utf8" });
      crontabUpdated = true;
    }
  } catch (e) {
    crontabError = e.message;
  }

  return {
    success: true,
    cron: newCron,
    message: crontabUpdated
      ? `Cron olusturuldu VE macOS crontab'a eklendi: ${name} (${resolvedSchedule})`
      : `Cron olusturuldu: ${name} (${resolvedSchedule})${crontabError ? ` - crontab eklenemedi: ${crontabError}` : ""}`,
    crontabUpdated,
    crontabError,
    schedule: resolvedSchedule,
  };
}

module.exports = {
  name: "cron_create",
  description: "Zamanlanmis gorev olustur. Schedule: cron expression veya preset ('every day 9am', 'every hour').",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Gorev adi" },
      schedule: { type: "string", description: "Cron expression (ornek: '0 9 * * *') veya preset" },
      command: { type: "string", description: "Calistirilacak komut" },
      description: { type: "string", description: "Aciklama" },
    },
    required: ["name", "schedule", "command"],
  },
  async execute(params) {
    return await createCron(params);
  },
};