const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const IS_MAC = os.platform() === 'darwin';

async function googleMeet(params) {
  const { action, meetingUrl, title, durationMinutes, email } = params;

  if (action === 'create') {
    if (!IS_MAC) return { success: false, error: 'Google Meet olusturma su an sadece macOS\'ta destekleniyor (Calendar entegrasyonu ile)' };
    try {
      const script = `
        tell application "Calendar"
          set newEvent to make new event at end of calendar 1 with properties {summary:"${(title || 'NatureCo Meet').replace(/"/g, '\\"')}", start date:(current date), end date:((current date) + ${(durationMinutes || 30) * 60})}
          set URL of newEvent to "https://meet.google.com/new"
          return "https://meet.google.com/new"
        end tell
      `;
      const result = execSync('osascript -e \'' + script.replace(/'/g, "'\\''") + '\'', { timeout: 10000 }).toString().trim();
      return { success: true, meetingUrl: result, title: title || 'NatureCo Meet', message: 'Toplanti olusturuldu. URL: ' + result };
    } catch (e) {
      return { success: false, error: 'Calendar ile meet olusturulamadi: ' + e.message };
    }
  }

  if (action === 'open') {
    if (!meetingUrl) return { success: false, error: 'meetingUrl gerekli' };
    try {
      if (IS_MAC) {
        execSync('open "' + meetingUrl + '"', { timeout: 5000 });
      } else if (os.platform() === 'win32') {
        execSync('start "" "' + meetingUrl + '"', { timeout: 5000 });
      } else {
        execSync('xdg-open "' + meetingUrl + '"', { timeout: 5000 });
      }
      return { success: true, meetingUrl, message: 'Meet acildi: ' + meetingUrl };
    } catch (e) {
      return { success: false, error: 'Meet acilamadi: ' + e.message };
    }
  }

  if (action === 'info') {
    return {
      success: true,
      note: 'Google Meet bot ozelligi icin Chrome Extension veya Puppeteer/Playwright ile otomasyon gerekli. Su an: create (Calendar) ve open (browser) destekleniyor.',
      supportedActions: ['create', 'open'],
      requirements: 'create: macOS + Calendar izni. open: her platform.',
    };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (create, open, info)' };
}

module.exports = {
  name: 'google_meet',
  description: 'Google Meet toplantisi: create (Calendar ile), open (browser ile), info.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'create, open, info', enum: ['create', 'open', 'info'] },
      meetingUrl: { type: 'string', description: '(open) Meet URL' },
      title: { type: 'string', description: '(create) Toplanti basligi' },
      durationMinutes: { type: 'number', description: '(create) Sure (dakika, default: 30)' },
      email: { type: 'string', description: 'Davet edilecek email' },
    },
    required: ['action'],
  },
  async execute(params) { return await googleMeet(params); },
};
