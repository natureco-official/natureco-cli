const { getConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  minimax: {
    name: 'MiniMax image-01',
    async generate({ prompt, n, apiKey, model, aspectRatio, baseUrl }) {
      const response = await fetch(baseUrl + '/v1/image_generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'image-01', prompt, n: n || 1, response_format: 'base64', ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}) }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) throw new Error(`MiniMax image error ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const data = await response.json();
      if (data.base_resp?.status_code) throw new Error(data.base_resp.status_msg || `MiniMax image API error ${data.base_resp.status_code}`);
      const images = data.data?.image_base64 || [];
      if (!images.length) throw new Error('MiniMax image generation returned no images');
      const outDir = path.join(process.cwd(), 'minimax-output');
      fs.mkdirSync(outDir, { recursive: true });
      return images.map((base64, index) => {
        const file = path.join(outDir, `image-${Date.now()}-${index + 1}.png`);
        fs.writeFileSync(file, Buffer.from(base64, 'base64'));
        return { file, mime: 'image/png' };
      });
    }
  },
  // v4.8.4: Pollinations.ai — TAMAMEN ÜCRETSİZ, API key gerektirmez
  // Default provider olarak ayarlandı (herkes kullanabilsin)
  pollinations: {
    name: 'Pollinations.ai (Ücretsiz, key gerekmez)',
    async generate({ prompt, width, height, seed, model }) {
      const w = width || 1024;
      const h = height || 1024;
      const m = model || 'flux'; // flux, turbo, sd, etc.
      const s = seed || Date.now() % 1000000;
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${s}&model=${m}&nologo=true`;
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) throw new Error(`Pollinations error ${response.status}: ${await response.text()}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return [{ url, buffer, mime: 'image/jpeg' }];
    }
  },
  openai: {
    name: 'OpenAI DALL-E',
    async generate({ prompt, size, n, apiKey }) {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ prompt, n: n || 1, size: size || '1024x1024' })
      });
      if (!response.ok) throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
      return (await response.json()).data;
    }
  },
  fal: {
    name: 'FAL.ai',
    async generate({ prompt, apiKey, model }) {
      const response = await fetch(`https://fal.run/fal-ai/${model || 'fast-sdxl'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${apiKey}` },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) throw new Error(`FAL error ${response.status}: ${await response.text()}`);
      return [{ url: (await response.json()).images?.[0]?.url || (await response.json()).image?.url }];
    }
  },
  together: {
    name: 'Together AI',
    async generate({ prompt, apiKey, model }) {
      const response = await fetch('https://api.together.xyz/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'black-forest-labs/FLUX.1-schnell', prompt, steps: 4, n: 1 })
      });
      if (!response.ok) throw new Error(`Together error ${response.status}: ${await response.text()}`);
      const data = await response.json();
      return data.data?.map(d => ({ url: d.url })) || [{ url: data.output?.[0] }];
    }
  }
};

function selectImageProvider(config, params = {}) {
  if (params.provider || config.imageProvider) return params.provider || config.imageProvider;
  return /minimax\.io|minimaxi\.com|minimax\.cn/i.test(config.providerUrl || '') ? 'minimax' : undefined;
}

module.exports = {
  name: 'image_generation',
  description: 'Generate images using AI. Supports OpenAI DALL-E, FAL.ai, and Together AI providers.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text description of the image to generate' },
      provider: { type: 'string', description: 'Image provider: minimax, openai, fal, together, pollinations (auto-detected)', enum: ['minimax', 'openai', 'fal', 'together', 'pollinations'] },
      aspectRatio: { type: 'string', description: 'Aspect ratio such as 1:1, 16:9 or 9:16' },
      model: { type: 'string', description: 'Model override (e.g. fast-sdxl for FAL, FLUX.1-schnell for Together)' },
      size: { type: 'string', description: 'Image size for DALL-E: 1024x1024, 1792x1024, 1024x1792 (default: 1024x1024)' },
      n: { type: 'number', description: 'Number of images to generate (default: 1, max: 4)' }
    },
    required: ['prompt']
  },

  async execute(params) {
    try {
      const config = getConfig();

      // v4.8.4: Önce key varsa openai/together/fal dene, yoksa Pollinations (ücretsiz)
      const openaiKey = params.apiKey || config.openaiApiKey || process.env.OPENAI_API_KEY;
      const falKey = params.apiKey || config.falApiKey || process.env.FAL_KEY;
      const togetherKey = params.apiKey || config.togetherApiKey || process.env.TOGETHER_API_KEY;
      const minimaxKey = params.apiKey || config.providerApiKey || process.env.MINIMAX_API_KEY;
      const isMiniMax = /minimax\.io|minimaxi\.com|minimax\.cn/i.test(config.providerUrl || '');

      // Explicit provider tercih edilmişse onu kullan
      let provider = selectImageProvider(config, params) || (isMiniMax && minimaxKey ? 'minimax' : undefined);
      let apiKey;

      if (provider) {
        // Explicit provider
        if (provider === 'minimax') apiKey = minimaxKey;
        else if (provider === 'openai') apiKey = openaiKey;
        else if (provider === 'fal') apiKey = falKey;
        else if (provider === 'together') apiKey = togetherKey;
        else if (provider === 'pollinations') apiKey = 'free'; // key gereksiz
      } else {
        // Auto-fallback: key varsa onu kullan, yoksa Pollinations
        if (openaiKey) { provider = 'openai'; apiKey = openaiKey; }
        else if (togetherKey) { provider = 'together'; apiKey = togetherKey; }
        else if (falKey) { provider = 'fal'; apiKey = falKey; }
        else { provider = 'pollinations'; apiKey = 'free'; }
      }

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return { success: false, error: `Desteklenmeyen provider: ${provider}. Kullanılabilir: ${Object.keys(PROVIDERS).join(', ')}` };
      }

      // Pollinations hariç — key yoksa hata
      if (provider !== 'pollinations' && !apiKey) {
        return { success: false, error: `${providerConfig.name} API key gerekli.` };
      }

      const images = await providerConfig.generate({
        prompt: params.prompt,
        apiKey,
        model: params.model,
        aspectRatio: params.aspectRatio,
        baseUrl: (config.providerUrl || 'https://api.minimax.io').replace(/\/+$/, '').replace(/\/v1$/, ''),
        size: params.size,
        n: params.n
      });

      return {
        success: true,
        prompt: params.prompt,
        provider: provider,
        images: images.filter(i => i.url || i.file).map(i => ({ url: i.url, file: i.file, revisedPrompt: i.revised_prompt })),
        count: images.filter(i => i.url || i.file).length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

module.exports._providers = PROVIDERS;
module.exports.selectImageProvider = selectImageProvider;
