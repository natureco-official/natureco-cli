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

async function createCron({ name, schedule, command, description = "", allowSystemCrontab = false, agentId = "default" }) {
  if (!name) return { success: false, error: "name gerekli" };
  if (!schedule) return { success: false, error: "schedule gerekli (cron expression veya preset)" };
  if (!command) return { success: false, error: "command gerekli (calistirilacak komut)" };

  // Preset kontrolu
  const resolvedSchedule = SCHEDULE_PRESETS[schedule.toLowerCase()] || schedule;

  // Cron expression dogrulama (basit)
  if (!/^[\d*/\s,-]+$/.test(resolvedSchedule)) {
    return { success: false, error: `Gecersiz cron expression: ${resolvedSchedule}` };
  }

  // v5.43 GÜVENLİK: command hiç kontrol edilmeden GERÇEK sistem crontab'ina yaziliyordu
  // (persistence — oturum kapansa bile suresiz calisir). Artik: (1) tehlikeli komut hic
  // kaydedilmez; (2) sistem crontab'ina yazma VARSAYILAN OLARAK KAPALI (schema'da param
  // yok → ajan tetikleyemez) ve ancak checkCommand onayindan gecerse yapilir; ajanin
  // olusturdugu cron sadece uygulama-ici crons.json'a yazilir (natureco daemon calistirir).
  const { isDangerousCommand, checkCommand } = require("../utils/approvals");
  if (isDangerousCommand(command)) {
    return { success: false, error: "Tehlikeli komut cron olarak eklenemez (guvenlik). Komutu gozden gecirin." };
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
  saveCrons(crons); // uygulama-ici kayit (guvenli, daemon kontrollu calistirir)

  // Sistem crontab'ina yazma: SADECE acik izin (allowSystemCrontab) + guvenlik onayi ile.
  const marker = `# natureco:${name}`;
  let crontabUpdated = false;
  let crontabError = null;

  if (allowSystemCrontab) {
    const approval = await checkCommand(command, { agentId });
    if (!approval.allowed) {
      crontabError = `sistem crontab'a yazma reddedildi (${approval.reason})`;
    } else {
      try {
        let existing = "";
        try { existing = execSync("crontab -l 2>/dev/null", { encoding: "utf8" }); }
        catch { existing = ""; }
        if (existing.includes(marker)) {
          crontabUpdated = false;
        } else {
          const safeCmd = approval.editedCommand || command;
          const newLine = `${resolvedSchedule} ${safeCmd} ${marker}`;
          const updated = existing + (existing.endsWith("\n") || existing === "" ? "" : "\n") + newLine + "\n";
          execSync("crontab -", { input: updated, encoding: "utf8" });
          crontabUpdated = true;
        }
      } catch (e) {
        crontabError = e.message;
      }
    }
  }

  return {
    success: true,
    cron: newCron,
    message: crontabUpdated
      ? `Cron olusturuldu VE sistem crontab'a eklendi: ${name} (${resolvedSchedule})`
      : `Cron olusturuldu (uygulama-ici): ${name} (${resolvedSchedule}). Calismasi icin: natureco daemon start.${crontabError ? ` [sistem crontab: ${crontabError}]` : ""}`,
    crontabUpdated,
    crontabError,
    systemCrontab: allowSystemCrontab,
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