module.exports = {
  name: 'phone_control',
  description: 'Send notifications and control mobile devices via push services (Pushover, ntfy)',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: notify (send push notification)', enum: ['notify'] },
      title: { type: 'string', description: 'Notification title' },
      message: { type: 'string', description: 'Notification message body' },
      priority: { type: 'number', description: 'Priority: -2 (lowest) to 2 (emergency)', default: 0 },
      url: { type: 'string', description: 'Optional URL to open on click' },
      service: { type: 'string', description: 'Push service: pushover, ntfy (default: pushover)', enum: ['pushover', 'ntfy'] }
    },
    required: ['action', 'message']
  },

  async execute(params) {
    try {
      const { getConfig } = require('../utils/config');
      const config = getConfig();

      if (params.action === 'notify') {
        const service = params.service || 'pushover';

        if (service === 'pushover') {
          const token = params.token || config.pushoverToken || process.env.PUSHOVER_TOKEN;
          const user = params.user || config.pushoverUser || process.env.PUSHOVER_USER;

          if (!token || !user) {
            return {
              success: false,
              error: 'Pushover token ve user gerekli.\nKur: natureco config set pushoverToken <token>\nnatureco config set pushoverUser <user>'
            };
          }

          const response = await fetch('https://api.pushover.net/1/messages.json', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              user,
              title: params.title || 'NatureCo',
              message: params.message,
              priority: params.priority || 0,
              url: params.url
            })
          });

          if (!response.ok) throw new Error(`Pushover error ${response.status}`);
          return { success: true, service: 'pushover', status: 'notification sent' };
        }

        if (service === 'ntfy') {
          const server = params.server || config.ntfyServer || process.env.NTFY_SERVER || 'https://ntfy.sh';
          const topic = params.topic || config.ntfyTopic || process.env.NTFY_TOPIC;

          if (!topic) {
            return {
              success: false,
              error: 'ntfy topic gerekli.\nKur: natureco config set ntfyTopic <topic>'
            };
          }

          const response = await fetch(`${server}/${topic}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: `[${params.title || 'NatureCo'}] ${params.message}`
          });

          if (!response.ok) throw new Error(`ntfy error ${response.status}`);
          return { success: true, service: 'ntfy', status: 'notification sent' };
        }
      }

      return { success: false, error: `Unknown action: ${params.action}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
