const { getConfig, saveConfig } = require('../utils/config');

module.exports = {
  name: 'thread_ownership',
  description: 'Manage message thread ownership — assign threads to specific agents/bots',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'Action: assign, release, status, list', enum: ['assign', 'release', 'status', 'list'] },
      threadId: { type: 'string', description: 'Thread/channel/conversation ID' },
      agentName: { type: 'string', description: 'Agent name to assign (for assign action)' },
      channel: { type: 'string', description: 'Channel type: telegram, whatsapp, signal, irc, mattermost, discord, slack' }
    },
    required: ['action']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const ownership = config.threadOwnership || {};

      if (params.action === 'list') {
        const entries = Object.entries(ownership);
        if (entries.length === 0) {
          return { success: true, action: 'list', message: 'Atanmış thread yok.', threads: [] };
        }
        return {
          success: true,
          action: 'list',
          threads: entries.map(([id, agent]) => ({
            threadId: id,
            assignedAgent: agent
          })),
          count: entries.length
        };
      }

      if (params.action === 'status') {
        if (!params.threadId) {
          return { success: false, error: 'threadId gerekli' };
        }
        const assigned = ownership[params.threadId];
        return {
          success: true,
          action: 'status',
          threadId: params.threadId,
          assignedAgent: assigned || null,
          isAssigned: !!assigned
        };
      }

      if (params.action === 'assign') {
        if (!params.threadId || !params.agentName) {
          return { success: false, error: 'threadId ve agentName gerekli' };
        }
        ownership[params.threadId] = params.agentName;
        config.threadOwnership = ownership;
        saveConfig(config);
        return {
          success: true,
          action: 'assign',
          threadId: params.threadId,
          agentName: params.agentName,
          message: `Thread ${params.threadId} → ${params.agentName}`
        };
      }

      if (params.action === 'release') {
        if (!params.threadId) {
          return { success: false, error: 'threadId gerekli' };
        }
        delete ownership[params.threadId];
        config.threadOwnership = ownership;
        saveConfig(config);
        return {
          success: true,
          action: 'release',
          threadId: params.threadId,
          message: `Thread ${params.threadId} serbest bırakıldı`
        };
      }

      return { success: false, error: `Bilinmeyen aksiyon: ${params.action}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
