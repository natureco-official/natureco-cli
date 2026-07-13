const { getConfig } = require('../utils/config');

const PROVIDERS = {
  minimax: {
    name: 'MiniMax Hailuo',
    async generate({ prompt, apiKey, model, baseUrl }) {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
      const submittedResponse = await fetch(baseUrl + '/v1/video_generation', {
        method: 'POST', headers,
        body: JSON.stringify({ model: model || 'MiniMax-Hailuo-2.3', prompt }),
        signal: AbortSignal.timeout(120000),
      });
      if (!submittedResponse.ok) throw new Error(`MiniMax video error ${submittedResponse.status}: ${(await submittedResponse.text()).slice(0, 300)}`);
      const submitted = await submittedResponse.json();
      if (submitted.base_resp?.status_code) throw new Error(submitted.base_resp.status_msg || 'MiniMax video submission failed');
      if (!submitted.task_id) throw new Error('MiniMax video response missing task_id');
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const statusResponse = await fetch(baseUrl + '/v1/query/video_generation?task_id=' + encodeURIComponent(submitted.task_id), { headers, signal: AbortSignal.timeout(30000) });
        if (!statusResponse.ok) throw new Error(`MiniMax video status error ${statusResponse.status}`);
        const status = await statusResponse.json();
        if (status.base_resp?.status_code) throw new Error(status.base_resp.status_msg || 'MiniMax video generation failed');
        if (status.status === 'Fail') throw new Error(status.base_resp?.status_msg || 'MiniMax video generation failed');
        if (status.status === 'Success') return [{ url: status.video_url || null, fileId: status.file_id || null, taskId: submitted.task_id }];
      }
      throw new Error(`MiniMax video task ${submitted.task_id} timed out`);
    }
  },
  runway: {
    name: 'RunwayML',
    async generate({ prompt, apiKey, model }) {
      const response = await fetch('https://api.runwayml.com/v1/text_to_video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || 'gen3a_turbo',
          prompt_text: prompt,
          prompt_image: null,
          duration: 5
        })
      });
      if (!response.ok) throw new Error(`Runway error ${response.status}: ${await response.text()}`);
      const data = await response.json();
      return [{ url: data.video?.url || data.url, id: data.id }];
    }
  }
};

function selectVideoProvider(config, params = {}) {
  if (params.provider) return params.provider;
  return /minimax\.io|minimaxi\.com|minimax\.cn/i.test(config.providerUrl || '') ? 'minimax' : 'runway';
}

module.exports = {
  name: 'video_generation',
  description: 'Generate videos using AI. Supports RunwayML provider.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text description of the video to generate' },
      provider: { type: 'string', description: 'Video provider: minimax or runway (auto-detected)', enum: ['minimax', 'runway'] },
      model: { type: 'string', description: 'Model override (default: gen3a_turbo)' }
    },
    required: ['prompt']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const provider = selectVideoProvider(config, params);

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return { success: false, error: `Desteklenmeyen provider: ${provider}` };
      }

      const apiKey = provider === 'minimax'
        ? (params.apiKey || config.providerApiKey || process.env.MINIMAX_API_KEY)
        : (params.apiKey || config.runwayApiKey || process.env.RUNWAY_API_KEY);
      if (!apiKey) {
        return {
          success: false,
          error: `${providerConfig.name} API key gerekli.\nKur: natureco config set runwayApiKey <key>`
        };
      }

      const videos = await providerConfig.generate({
        prompt: params.prompt,
        apiKey,
        model: params.model,
        baseUrl: (config.providerUrl || 'https://api.minimax.io').replace(/\/+$/, '').replace(/\/v1$/, '')
      });

      return {
        success: true,
        prompt: params.prompt,
        provider,
        videos,
        count: videos.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

module.exports._providers = PROVIDERS;
module.exports.selectVideoProvider = selectVideoProvider;
