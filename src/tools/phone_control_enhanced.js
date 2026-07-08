const { getConfig, saveConfig } = require('../utils/config');
const { execFileSync } = require('child_process');

function checkAdb() {
  try {
    execFileSync('adb', ['version'], { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

// v5.43 GÜVENLİK: `execSync('adb '+args)` shell enjeksiyonuna açıktı. execFileSync +
// tırnak-farkındalıklı tokenize → shell yok, metakarakter işlem görmez.
function _tok(s) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(s || ''))) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function adbCommand(args) {
  return execFileSync('adb', _tok(args), { stdio: 'pipe', encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim();
}

module.exports = {
  name: 'phone_control_enhanced',
  description: 'Full mobile device control — notifications, ADB commands, camera, screen recording, SMS, contacts. Supports Pushover, ntfy, and ADB.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Action',
        enum: ['notify', 'arm', 'disarm', 'status', 'devices', 'camera.snap', 'camera.clip', 'screen.record', 'sms.send', 'sms.list', 'contacts.list', 'adb']
      },
      title: { type: 'string', description: 'Notification title' },
      message: { type: 'string', description: 'Notification message or SMS text' },
      service: { type: 'string', description: 'Push service: pushover, ntfy (default: pushover)', enum: ['pushover', 'ntfy'] },
      priority: { type: 'number', description: 'Priority: -2 to 2' },
      phoneNumber: { type: 'string', description: 'Phone number for SMS' },
      duration: { type: 'number', description: 'Duration in seconds for recording' },
      adbCommand: { type: 'string', description: 'Raw ADB command (for adb action)' },
      group: { type: 'string', description: 'Group to arm: camera, screen, writes, all' }
    },
    required: ['action']
  },

  async execute(params) {
    try {
      const config = getConfig();

      if (params.action === 'notify') {
        const service = params.service || 'pushover';
        if (service === 'pushover') {
          const token = config.pushoverToken || process.env.PUSHOVER_TOKEN;
          const user = config.pushoverUser || process.env.PUSHOVER_USER;
          if (!token || !user) return { success: false, error: 'Pushover token/user gerekli' };
          const r = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, user, title: params.title || 'NatureCo', message: params.message, priority: params.priority || 0 })
          });
          return { success: r.ok, service: 'pushover' };
        }
        if (service === 'ntfy') {
          const topic = config.ntfyTopic || process.env.NTFY_TOPIC;
          if (!topic) return { success: false, error: 'ntfy topic gerekli' };
          const server = config.ntfyServer || process.env.NTFY_SERVER || 'https://ntfy.sh';
          const r = await fetch(`${server}/${topic}`, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: `[${params.title || 'NatureCo'}] ${params.message}`
          });
          return { success: r.ok, service: 'ntfy' };
        }
        return { success: false, error: `Unknown service: ${service}` };
      }

      if (params.action === 'arm') {
        const group = params.group || 'all';
        if (!config.phoneControl) config.phoneControl = {};
        if (!config.phoneControl.armed) config.phoneControl.armed = {};
        config.phoneControl.armed[group] = { armed: true, at: new Date().toISOString() };
        saveConfig(config);
        return { success: true, action: 'arm', group, status: 'armed' };
      }

      if (params.action === 'disarm') {
        const group = params.group || 'all';
        if (!config.phoneControl) config.phoneControl = {};
        if (!config.phoneControl.armed) config.phoneControl.armed = {};
        if (group === 'all') config.phoneControl.armed = {};
        else delete config.phoneControl.armed[group];
        saveConfig(config);
        return { success: true, action: 'disarm', group, status: 'disarmed' };
      }

      if (params.action === 'status') {
        const pc = config.phoneControl || {};
        const armed = pc.armed || {};
        const hasAdb = checkAdb();
        return {
          success: true,
          action: 'status',
          adbAvailable: hasAdb,
          armed: Object.keys(armed).length > 0 ? armed : false,
          pushoverConfigured: !!(config.pushoverToken || process.env.PUSHOVER_TOKEN),
          ntfyConfigured: !!(config.ntfyTopic || process.env.NTFY_TOPIC)
        };
      }

      if (params.action === 'devices') {
        if (!checkAdb()) return { success: false, error: 'ADB bulunamadı. Android SDK kurulumu gerekli.' };
        const output = adbCommand('devices -l');
        const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('List'));
        const devices = lines.map(l => {
          const parts = l.trim().split(/\s+/);
          return { id: parts[0], state: parts[1], info: parts.slice(2).join(' ') };
        });
        return { success: true, action: 'devices', devices, count: devices.length };
      }

      if (params.action.startsWith('camera.')) {
        if (!checkAdb()) return { success: false, error: 'ADB gerekli' };
        if (params.action === 'camera.snap') {
          const output = adbCommand('shell am start -a android.media.action.IMAGE_CAPTURE');
          adbCommand('shell sleep 2');
          adbCommand('shell input keyevent 27');
          return { success: true, action: 'camera.snap', message: 'Camera capture triggered' };
        }
        if (params.action === 'camera.clip') {
          const dur = params.duration || 10;
          adbCommand(`shell am start -a android.media.action.VIDEO_CAPTURE --ei android.intent.extra.durationLimit ${dur}`);
          adbCommand(`shell sleep ${dur + 2}`);
          return { success: true, action: 'camera.clip', duration: dur };
        }
      }

      if (params.action === 'screen.record') {
        if (!checkAdb()) return { success: false, error: 'ADB gerekli' };
        const dur = params.duration || 30;
        const outputFile = `/sdcard/screen_${Date.now()}.mp4`;
        adbCommand(`shell screenrecord --time-limit ${dur} ${outputFile}`);
        return { success: true, action: 'screen.record', outputFile, duration: dur };
      }

      if (params.action === 'sms.send') {
        if (!checkAdb()) {
          if (!config.twilioSid) return { success: false, error: 'SMS için ADB veya Twilio gerekli' };
          const sid = config.twilioSid || process.env.TWILIO_SID;
          const token = config.twilioToken || process.env.TWILIO_TOKEN;
          const from = config.twilioFrom || process.env.TWILIO_FROM;
          if (!params.phoneNumber || !params.message) return { success: false, error: 'phoneNumber ve message gerekli' };
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: params.phoneNumber, From: from, Body: params.message })
          });
          return { success: r.ok, action: 'sms.send', service: 'twilio' };
        }
        const output = adbCommand(`shell service call isms 7 i32 0 s16 "com.android.mms" s16 "${params.phoneNumber}" s16 "null" s16 "${params.message}" s16 "null" s16 "null"`);
        return { success: true, action: 'sms.send', output: output.substring(0, 500) };
      }

      if (params.action === 'sms.list') {
        if (!checkAdb()) return { success: false, error: 'ADB gerekli' };
        const output = adbCommand('shell content query --uri content://sms/inbox --projection address,body,date --limit 20');
        return { success: true, action: 'sms.list', messages: output.split('\n').filter(Boolean).map(l => l.trim()) };
      }

      if (params.action === 'contacts.list') {
        if (!checkAdb()) return { success: false, error: 'ADB gerekli' };
        const output = adbCommand('shell content query --uri content://contacts/phones --projection display_name,number --limit 50');
        const contacts = output.split('\n').filter(Boolean).map(l => {
          const m = l.match(/display_name=(.+?),.*?number=(.+?)(?:,|$)/);
          return m ? { name: m[1], number: m[2] } : { raw: l.trim() };
        });
        return { success: true, action: 'contacts.list', contacts, count: contacts.length };
      }

      if (params.action === 'adb') {
        if (!checkAdb()) return { success: false, error: 'ADB gerekli' };
        if (!params.adbCommand) return { success: false, error: 'adbCommand gerekli' };
        const output = adbCommand(params.adbCommand);
        return { success: true, action: 'adb', command: params.adbCommand, output: output.substring(0, 10000) };
      }

      return { success: false, error: `Unknown action: ${params.action}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
