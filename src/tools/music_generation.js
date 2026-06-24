const { getConfig } = require('../utils/config');

const PROVIDERS = {
  suno: {
    name: 'Suno AI (via API)',
    async generate({ prompt, apiKey, model, duration, style }) {
      const response = await fetch('https://api.sunoa.ai/v1/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          prompt,
          model: model || 'chirp-v3',
          duration: duration || 30,
          style: style || '',
          make_instrumental: false
        })
      });
      if (!response.ok) throw new Error(`Suno error ${response.status}: ${await response.text()}`);
      return (await response.json()).data?.clips || [];
    }
  },
  udio: {
    name: 'Udio AI (via API)',
    async generate({ prompt, apiKey, model, duration }) {
      const response = await fetch('https://api.udio.ai/v1/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          prompt,
          model: model || 'udio-v1',
          duration: duration || 30
        })
      });
      if (!response.ok) throw new Error(`Udio error ${response.status}: ${await response.text()}`);
      const data = await response.json();
      return data.results || data.songs || [];
    }
  },
  elevenlabs: {
    name: 'ElevenLabs Sound Effects',
    async generate({ prompt, apiKey, duration }) {
      const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: duration || 10
        })
      });
      if (!response.ok) throw new Error(`ElevenLabs error ${response.status}: ${await response.text()}`);
      const buffer = await response.arrayBuffer();
      return [{ url: URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' })), provider: 'elevenlabs' }];
    }
  }
};

module.exports = {
  name: 'music_generation',
  description: 'Generate music, songs, and sound effects using AI. Supports Suno, Udio, and ElevenLabs.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Description of the music/song to generate' },
      provider: { type: 'string', description: 'Music provider: suno, udio, elevenlabs (default: suno)', enum: ['suno', 'udio', 'elevenlabs'] },
      model: { type: 'string', description: 'Model override' },
      duration: { type: 'number', description: 'Duration in seconds (default: 30)' },
      style: { type: 'string', description: 'Style/genre hint (e.g. "pop", "jazz", "electronic")' }
    },
    required: ['prompt']
  },

  async execute(params) {
    try {
      const config = getConfig();
      const provider = params.provider || config.musicProvider || 'suno';

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return { success: false, error: `Unsupported provider: ${provider}. Available: ${Object.keys(PROVIDERS).join(', ')}` };
      }

      let apiKey;
      if (provider === 'suno') apiKey = params.apiKey || config.sunoApiKey || process.env.SUNO_API_KEY;
      else if (provider === 'udio') apiKey = params.apiKey || config.udioApiKey || process.env.UDIO_API_KEY;
      else if (provider === 'elevenlabs') apiKey = params.apiKey || config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;

      if (!apiKey) {
        return {
          success: false,
          error: `${providerConfig.name} API key required.\nSet: natureco config set ${provider}ApiKey <key>`
        };
      }

      const music = await providerConfig.generate({
        prompt: params.prompt,
        apiKey,
        model: params.model,
        duration: params.duration,
        style: params.style
      });

      return {
        success: true,
        prompt: params.prompt,
        provider,
        music: Array.isArray(music) ? music : [music],
        count: Array.isArray(music) ? music.length : 1
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
