const { getConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  deepgram: {
    name: 'Deepgram',
    async transcribe({ audioPath, audioUrl, apiKey, language, model }) {
      const url = audioPath
        ? 'https://api.deepgram.com/v1/listen'
        : `https://api.deepgram.com/v1/listen?url=${encodeURIComponent(audioUrl)}`;

      const options = {
        method: 'POST',
        headers: { 'Authorization': `Token ${apiKey}` },
        params: { model: model || 'nova-2', language: language || 'en', smart_format: 'true' }
      };

      if (audioPath) {
        const audioFile = fs.readFileSync(audioPath);
        options.body = audioFile;
        options.headers['Content-Type'] = 'audio/wav';
      }

      const queryString = Object.entries(options.params).map(([k, v]) => `${k}=${v}`).join('&');
      const response = await fetch(`${url}${audioPath ? '' : '&'}${queryString}`, {
        method: 'POST',
        headers: options.headers,
        body: options.body
      });

      if (!response.ok) throw new Error(`Deepgram error ${response.status}`);
      const data = await response.json();
      return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    }
  },
  azure: {
    name: 'Azure Speech',
    async transcribe({ audioPath, apiKey, region, language }) {
      const response = await fetch(
        `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${language || 'en-US'}`,
        {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'
          },
          body: fs.readFileSync(audioPath)
        }
      );
      if (!response.ok) throw new Error(`Azure error ${response.status}`);
      const data = await response.json();
      return data.DisplayText || '';
    }
  },
  whisper: {
    name: 'OpenAI Whisper',
    async transcribe({ audioPath, apiKey, language }) {
      const formData = new (require('form-data'))();
      formData.append('file', fs.createReadStream(audioPath));
      formData.append('model', 'whisper-1');
      if (language) formData.append('language', language);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      });

      if (!response.ok) throw new Error(`Whisper error ${response.status}`);
      const data = await response.json();
      return data.text || '';
    }
  }
};

module.exports = {
  name: 'speech_to_text',
  description: 'Transcribe audio to text using Deepgram, Azure Speech, or OpenAI Whisper',
  inputSchema: {
    type: 'object',
    properties: {
      audioPath: { type: 'string', description: 'Local audio file path' },
      audioUrl: { type: 'string', description: 'Remote audio URL (if no local file)' },
      provider: { type: 'string', description: 'STT provider: deepgram, azure, whisper (default: whisper)', enum: ['deepgram', 'azure', 'whisper'] },
      language: { type: 'string', description: 'Language code (e.g. en, tr, fr)' }
    }
  },

  async execute(params) {
    try {
      const config = getConfig();
      const provider = params.provider || config.sttProvider || 'whisper';

      const providerConfig = PROVIDERS[provider];
      if (!providerConfig) {
        return { success: false, error: `Desteklenmeyen provider: ${provider}` };
      }

      if (!params.audioPath && !params.audioUrl) {
        return { success: false, error: 'audioPath veya audioUrl gerekli' };
      }

      if (params.audioPath && !fs.existsSync(path.resolve(params.audioPath))) {
        return { success: false, error: `Dosya bulunamadı: ${params.audioPath}` };
      }

      let apiKey;
      if (provider === 'deepgram') apiKey = params.apiKey || config.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
      else if (provider === 'azure') apiKey = params.apiKey || config.azureSpeechKey || process.env.AZURE_SPEECH_KEY;
      else apiKey = params.apiKey || config.openaiApiKey || process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return { success: false, error: `${providerConfig.name} API key gerekli.` };
      }

      const transcript = await providerConfig.transcribe({
        audioPath: params.audioPath,
        audioUrl: params.audioUrl,
        apiKey,
        region: config.azureRegion || process.env.AZURE_REGION || 'eastus',
        language: params.language
      });

      return {
        success: true,
        provider,
        transcript: transcript || '(boş)',
        wordCount: transcript ? transcript.split(/\s+/).length : 0
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
