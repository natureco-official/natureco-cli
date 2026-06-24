const { getConfig } = require('../utils/config');
const fs = require('fs');
const path = require('path');

async function transcribeWithWhisper(audioPath, apiKey) {
  const formData = new FormData();
  const file = await fs.promises.readFile(audioPath);
  const blob = new Blob([file]);
  formData.append('file', blob, path.basename(audioPath));
  formData.append('model', 'whisper-1');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  if (!response.ok) throw new Error(`Whisper error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.text;
}

async function transcribeWithDeepgram(audioPath, apiKey) {
  const file = await fs.promises.readFile(audioPath);
  const response = await fetch('https://api.deepgram.com/v1/listen', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'audio/wav'
    },
    body: file
  });

  if (!response.ok) throw new Error(`Deepgram error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
}

async function analyzeAudio(text, provider, apiKey, analysisPrompt) {
  const baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : `https://api.${provider}.com/v1`;

  const prompt = analysisPrompt || 'Analyze this audio transcript. Identify speakers, extract key points, detect sentiment, and summarize.';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: provider === 'openai' ? 'gpt-4o' : 'claude-3-haiku-20240307',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Transcript:\n\n${text}` }
      ],
      max_tokens: 4096
    })
  });

  if (!response.ok) throw new Error(`Analysis error ${response.status}: ${await response.text()}`);
  return (await response.json()).choices?.[0]?.message?.content || '';
}

module.exports = {
  name: 'audio_understanding',
  description: 'Analyze audio files — transcribe speech and extract insights using AI (OpenAI Whisper + LLM, Deepgram)',
  inputSchema: {
    type: 'object',
    properties: {
      audioPath: { type: 'string', description: 'Path to audio file (mp3, wav, m4a, ogg)' },
      audioUrl: { type: 'string', description: 'URL to audio file (alternative to audioPath)' },
      action: { type: 'string', description: 'Action: transcribe, analyze, full', enum: ['transcribe', 'analyze', 'full'], default: 'full' },
      transcriptionProvider: { type: 'string', description: 'Transcription provider: openai, deepgram (default: openai)', enum: ['openai', 'deepgram'] },
      analysisProvider: { type: 'string', description: 'Analysis provider: openai, anthropic (default: openai)', enum: ['openai', 'anthropic'] },
      analysisPrompt: { type: 'string', description: 'Custom analysis prompt' },
      language: { type: 'string', description: 'Language code (e.g. tr, en, de)' }
    },
    required: ['action']
  },

  async execute(params) {
    try {
      const config = getConfig();
      let audioPath = params.audioPath;

      if (params.audioUrl && !audioPath) {
        const tmpDir = require('os').tmpdir();
        const tmpFile = path.join(tmpDir, `audio_${Date.now()}.tmp`);
        const response = await fetch(params.audioUrl);
        if (!response.ok) throw new Error(`Failed to download audio: ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.promises.writeFile(tmpFile, buffer);
        audioPath = tmpFile;
      }

      if (!audioPath) {
        return { success: false, error: 'audioPath veya audioUrl gerekli' };
      }

      if (!fs.existsSync(audioPath)) {
        return { success: false, error: `Dosya bulunamadı: ${audioPath}` };
      }

      const transcribeProv = params.transcriptionProvider || 'openai';
      let transcribeKey;

      if (transcribeProv === 'openai') {
        transcribeKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      } else if (transcribeProv === 'deepgram') {
        transcribeKey = config.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
      }

      if (!transcribeKey) {
        return { success: false, error: `${transcribeProv} API key gerekli` };
      }

      const result = { success: true, action: params.action || 'full' };

      if (params.action === 'transcribe' || params.action === 'full' || !params.action) {
        const transcript = transcribeProv === 'deepgram'
          ? await transcribeWithDeepgram(audioPath, transcribeKey)
          : await transcribeWithWhisper(audioPath, transcribeKey);

        result.transcript = transcript;
        result.transcriptionProvider = transcribeProv;
      }

      if (params.action === 'analyze' || params.action === 'full') {
        const transcriptForAnalysis = result.transcript || (transcribeProv === 'deepgram'
          ? await transcribeWithDeepgram(audioPath, transcribeKey)
          : await transcribeWithWhisper(audioPath, transcribeKey));

        const analysisProv = params.analysisProvider || 'openai';
        const analysisApiKey = analysisProv === 'openai'
          ? (config.openaiApiKey || process.env.OPENAI_API_KEY)
          : (config.anthropicApiKey || process.env.ANTHROPIC_API_KEY);

        if (!analysisApiKey) {
          return { success: false, error: `${analysisProv} API key gerekli` };
        }

        const analysis = await analyzeAudio(transcriptForAnalysis, analysisProv, analysisApiKey, params.analysisPrompt);
        result.analysis = analysis;
        result.analysisProvider = analysisProv;
        result.transcript = transcriptForAnalysis;
      }

      if (audioPath !== params.audioPath && audioPath) {
        await fs.promises.unlink(audioPath).catch(() => {});
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
