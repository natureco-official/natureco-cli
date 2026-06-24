const fs = require('fs');
const path = require('path');
const os = require('os');
const cron = require('node-cron');

const CRON_FILE = path.join(os.homedir(), '.natureco', 'cron.json');
const CRON_LOGS_DIR = path.join(os.homedir(), '.natureco', 'cron-logs');

function ensureCronDirs() {
  const dir = path.dirname(CRON_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(CRON_LOGS_DIR)) {
    fs.mkdirSync(CRON_LOGS_DIR, { recursive: true });
  }
}

function loadCronJobs() {
  ensureCronDirs();
  if (!fs.existsSync(CRON_FILE)) {
    return [];
  }
  try {
    const data = fs.readFileSync(CRON_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveCronJobs(jobs) {
  ensureCronDirs();
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

function addCronJob(job) {
  const jobs = loadCronJobs();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const newJob = {
    id,
    ...job,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  jobs.push(newJob);
  saveCronJobs(jobs);
  return newJob;
}

function removeCronJob(id) {
  const jobs = loadCronJobs();
  const filtered = jobs.filter(j => j.id !== id);
  saveCronJobs(filtered);
  return filtered.length < jobs.length;
}

function updateCronJob(id, updates) {
  const jobs = loadCronJobs();
  const index = jobs.findIndex(j => j.id === id);
  if (index === -1) return false;
  jobs[index] = { ...jobs[index], ...updates };
  saveCronJobs(jobs);
  return true;
}

function getCronJob(id) {
  const jobs = loadCronJobs();
  return jobs.find(j => j.id === id);
}

function parseCronSchedule(schedule) {
  // Basit zamanlama formatlarını cron expression'a çevir
  if (schedule.startsWith('every ')) {
    const parts = schedule.split(' ');
    if (parts[2] === 'hours') {
      const hours = parseInt(parts[1]);
      return `0 */${hours} * * *`;
    }
    if (parts[2] === 'minutes') {
      const minutes = parseInt(parts[1]);
      return `*/${minutes} * * * *`;
    }
  }
  
  if (schedule.startsWith('daily at ')) {
    const time = schedule.replace('daily at ', '');
    const [hour, minute = '0'] = time.split(':');
    return `${minute} ${hour} * * *`;
  }
  
  // Zaten cron expression ise olduğu gibi döndür
  return schedule;
}

function validateCronExpression(expression) {
  return cron.validate(expression);
}

function logCronOutput(jobId, output) {
  const logFile = path.join(CRON_LOGS_DIR, `${jobId}.log`);
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}]\n${output}\n\n`;
  fs.appendFileSync(logFile, logEntry, 'utf-8');
}

function getCronLog(jobId) {
  const logFile = path.join(CRON_LOGS_DIR, `${jobId}.log`);
  if (!fs.existsSync(logFile)) {
    return null;
  }
  return fs.readFileSync(logFile, 'utf-8');
}

module.exports = {
  loadCronJobs,
  saveCronJobs,
  addCronJob,
  removeCronJob,
  updateCronJob,
  getCronJob,
  parseCronSchedule,
  validateCronExpression,
  logCronOutput,
  getCronLog,
};
