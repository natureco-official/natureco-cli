/**
 * cron — Scheduled task monitoring (cron-like expressions)
 *
 * Format (standard cron): min hour dom mon dow
 *   e.g., "every 5 min" -> minute field = "star/5"
 * Checks if a task should run based on its schedule.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const CRON_FILE = path.join(os.homedir(), '.natureco', 'cron-jobs.json');

function parseCron(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  return { min, hour, dom, mon, dow };
}

function matchesField(value, pattern) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2), 10);
    return value % step === 0;
  }
  if (pattern.includes(',')) return pattern.split(',').some(p => matchesField(value, p));
  if (pattern.includes('-')) {
    const [lo, hi] = pattern.split('-').map(Number);
    return value >= lo && value <= hi;
  }
  return parseInt(pattern, 10) === value;
}

function shouldRun(expr) {
  const parsed = parseCron(expr);
  if (!parsed) return false;
  const now = new Date();
  return (
    matchesField(now.getMinutes(), parsed.min) &&
    matchesField(now.getHours(), parsed.hour) &&
    matchesField(now.getDate(), parsed.dom) &&
    matchesField(now.getMonth() + 1, parsed.mon) &&
    matchesField(now.getDay(), parsed.dow)
  );
}

function loadJobs() {
  try {
    if (fs.existsSync(CRON_FILE)) return JSON.parse(fs.readFileSync(CRON_FILE, 'utf8'));
  } catch {}
  return [];
}

function addJob(job) {
  const jobs = loadJobs();
  const entry = {
    id: `cron_${Date.now()}`,
    schedule: job.schedule,
    command: job.command,
    description: job.description || '',
    createdAt: Date.now(),
    lastRun: null,
    enabled: true,
  };
  jobs.push(entry);
  const dir = path.dirname(CRON_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
  return entry;
}

function removeJob(id) {
  const jobs = loadJobs().filter(j => j.id !== id);
  const dir = path.dirname(CRON_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CRON_FILE, JSON.stringify(jobs, null, 2));
  return true;
}

module.exports = { parseCron, shouldRun, loadJobs, addJob, removeJob };
