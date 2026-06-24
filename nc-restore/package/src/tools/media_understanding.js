const { getConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'media_understanding',
  description: 'Analyze images and media using AI vision models (OpenAI, Anthropic, Gemini, Groq)',
  inputSchema: {
    type: 'object',
    properties: {
      imagePath: { type: 'string', description: 'Local image file path' },
      imageUrl: { type: 'string', description: 'Remote image URL (if no local file)' },
      prompt: { type: 'string', description: 'Analysis prompt (default: "Describe this image in detail")' },
      provider: { type: 'string', description: 'Vision provider: openai, anthropic, groq (default: openai)', enum: ['openai', 'anthropic', 'groq'] },
      model: { type: 'string', description: 'Model override' }
    }
  },

  async execute(params) {
    try {
      const config = getConfig();
      const prompt = params.prompt || 'Describe this image in detail';
      const provider = params.provider || config.visionProvider || 'openai';

      if (!params.imagePath && !params.imageUrl) {
        return { success: false, error: 'imagePath veya imageUrl gerekli' };
      }

      let imageBase64 = '';
      let mediaType = 'image/jpeg';

      if (params.imagePath) {
        const resolvedPath = path.resolve(params.imagePath.replace(/^~/, require('os').homedir()));
        if (!fs.existsSync(resolvedPath)) {
          return { success: false, error: `Dosya bulunamadı: ${resolvedPath}` };
        }
        const ext = path.extname(resolvedPath).toLowerCase();
        const mediaMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
        mediaType = mediaMap[ext] || 'image/jpeg';
        imageBase64 = fs.readFileSync(resolvedPath).toString('base64');

        // Check file size
        const stats = fs.statSync(resolvedPath);
        if (stats.size > 20 * 1024 * 1024) {
          return { success: false, error: 'Dosya çok büyük (max 20MB)' };
        }
      }

      const dataUrl = params.imageUrl || `data:${mediaType};base64,${imageBase64}`;

      if (provider === 'openai') {
        const apiKey = params.apiKey || config.openaiApiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) return { success: false, error: 'OpenAI API key gerekli' };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: params.model || 'gpt-4o',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
              ]
            }],
            max_tokens: 1000
          })
        });

        if (!response.ok) throw new Error(`OpenAI error ${response.status}`);
        const data = await response.json();
        return { success: true, provider: 'openai', analysis: data.choices?.[0]?.message?.content || '' };
      }

      if (provider === 'anthropic') {
        const apiKey = params.apiKey || config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return { success: false, error: 'Anthropic API key gerekli' };

        const content = [{ type: 'text', text: prompt }];
        if (params.imagePath) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } });
        } else {
          content.push({ type: 'image', source: { type: 'url', url: params.imageUrl } });
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: params.model || 'claude-3-5-sonnet-20241022', max_tokens: 1000, messages: [{ role: 'user', content }] })
        });

        if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
        const data = await response.json();
        return { success: true, provider: 'anthropic', analysis: data.content?.[0]?.text || '' };
      }

      if (provider === 'groq') {
        const apiKey = params.apiKey || config.providerApiKey || process.env.GROQ_API_KEY;
        if (!apiKey) return { success: false, error: 'Groq API key gerekli' };

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: params.model || 'llama-3.2-90b-vision-preview',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: params.imagePath ? `data:${mediaType};base64,${imageBase64}` : params.imageUrl } }
              ]
            }],
            max_tokens: 1000
          })
        });

        if (!response.ok) throw new Error(`Groq error ${response.status}`);
        const data = await response.json();
        return { success: true, provider: 'groq', analysis: data.choices?.[0]?.message?.content || '' };
      }

      return { success: false, error: `Bilinmeyen provider: ${provider}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
