const { getConfig } = require('../utils/config');

const PROVIDERS = {
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

module.exports = {
  name: 'video_generation',
  description: 'Generate videos using AI. Supports RunwayML provider.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text description of the video to generate' },
      provider: { type: 'string', description: 'Video provider: runway (default: runway)', enum: ['runway'] },
      model: { type: 'string', description: 'Model override (default: gen3a_turbo)' }
    },
    required: ['prompt']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const provider = params.provider || 'runway';

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return { success: false, error: `Desteklenmeyen provider: ${provider}` };
      }

      const apiKey = params.apiKey || config.runwayApiKey || process.env.RUNWAY_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error: `${providerConfig.name} API key gerekli.\nKur: natureco config set runwayApiKey <key>`
        };
      }

      const videos = await providerConfig.generate({
        prompt: params.prompt,
        apiKey,
        model: params.model
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
