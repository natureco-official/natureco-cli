const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const inquirer = require('../utils/inquirer-wrapper');
const brand = require('../utils/branding');
const { COLORS, FULL_LOGO } = brand;

const BASE_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const DIRS = ['sources', 'concepts', 'cache', 'skills', 'memory', 'sessions', 'backups'];

// v5.6.4: TAM MODEL KATALOGU - 12 provider, 200+ model
// Her provider: { name, url, models: [...], default }
// models: [ { id, label, tier, desc, cost } ] - tier ile gorsel siralama
const PROVIDER_PRESETS = {
  openai: {
    name: 'OpenAI (GPT)',
    url: 'https://api.openai.com/v1',
    models: [
      // Reasoning (Yeni nesil)
      { id: 'o3', label: 'o3', tier: 'reasoning', desc: 'En güçlü reasoning', cost: '$15/$60 per 1M' },
      { id: 'o3-mini', label: 'o3-mini', tier: 'reasoning', desc: 'Reasoning ucuz', cost: '$1.10/$4.40 per 1M' },
      { id: 'o1-pro', label: 'o1-pro', tier: 'reasoning', desc: 'Pro reasoning', cost: '$150/$600 per 1M' },
      { id: 'o1', label: 'o1', tier: 'reasoning', desc: 'Reasoning', cost: '$15/$60 per 1M' },
      { id: 'o1-mini', label: 'o1-mini', tier: 'reasoning', desc: 'Reasoning ucuz', cost: '$3/$12 per 1M' },
      // GPT-5 (Yeni)
      { id: 'gpt-5', label: 'GPT-5', tier: 'flagship', desc: 'En yeni flagship', cost: '$5/$15 per 1M (est)' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', tier: 'flagship', desc: 'GPT-5 ucuz', cost: '$0.50/$1.50 per 1M (est)' },
      { id: 'gpt-5-nano', label: 'GPT-5 nano', tier: 'flagship', desc: 'GPT-5 en ucuz', cost: '$0.10/$0.30 per 1M (est)' },
      // GPT-4.1 (Yeni)
      { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'flagship', desc: 'GPT-4.1 gelişmiş', cost: '$5/$15 per 1M' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', tier: 'flagship', desc: 'GPT-4.1 ucuz', cost: '$0.80/$3.20 per 1M' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', tier: 'flagship', desc: 'GPT-4.1 en ucuz', cost: '$0.20/$0.80 per 1M' },
      // GPT-4o
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'flagship', desc: 'GPT-4o multimodal', cost: '$5/$15 per 1M' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'balanced', desc: 'GPT-4o ucuz', cost: '$0.15/$0.60 per 1M' },
      { id: 'gpt-4o-2024-08-06', label: 'GPT-4o (Aug 2024)', tier: 'flagship', desc: 'Sabit tarihli', cost: '$5/$15 per 1M' },
      // GPT-4 Turbo
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'flagship', desc: 'GPT-4 Turbo', cost: '$10/$30 per 1M' },
      { id: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview', tier: 'flagship', desc: 'Preview', cost: '$10/$30 per 1M' },
      // GPT-4 klasik
      { id: 'gpt-4', label: 'GPT-4', tier: 'classic', desc: 'Klasik GPT-4', cost: '$30/$60 per 1M' },
      { id: 'gpt-4-32k', label: 'GPT-4 32K', tier: 'classic', desc: 'GPT-4 uzun context', cost: '$60/$120 per 1M' },
      // GPT-3.5
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', tier: 'fast', desc: 'Çok ucuz', cost: '$0.50/$1.50 per 1M' },
      { id: 'gpt-3.5-turbo-16k', label: 'GPT-3.5 Turbo 16K', tier: 'fast', desc: 'Uzun context ucuz', cost: '$3/$4 per 1M' },
      { id: 'gpt-3.5-turbo-instruct', label: 'GPT-3.5 Instruct', tier: 'fast', desc: 'Instruction tuned', cost: '$1.50/$2 per 1M' },
    ],
    default: 'gpt-4o-mini',
  },
  anthropic: {
    name: 'Anthropic (Claude)',
    url: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', tier: 'flagship', desc: 'En güçlü', cost: '$15/$75 per 1M' },
      { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', tier: 'flagship', desc: 'En yeni Opus', cost: '$15/$75 per 1M' },
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', tier: 'flagship', desc: 'Dengeli güçlü', cost: '$3/$15 per 1M' },
      { id: 'claude-sonnet-4-1-20250805', label: 'Claude Sonnet 4.1', tier: 'flagship', desc: 'Sonnet 4.1', cost: '$3/$15 per 1M' },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', tier: 'flagship', desc: '3.7 Sonnet', cost: '$3/$15 per 1M' },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (New)', tier: 'balanced', desc: 'Yeni Sonnet', cost: '$3/$15 per 1M' },
      { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (Old)', tier: 'balanced', desc: 'Eski Sonnet', cost: '$3/$15 per 1M' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', tier: 'fast', desc: 'Hızlı', cost: '$0.80/$4 per 1M' },
      { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', tier: 'fast', desc: 'Çok hızlı', cost: '$0.25/$1.25 per 1M' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus (legacy)', tier: 'classic', desc: 'Eski Opus', cost: '$15/$75 per 1M' },
      { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (legacy)', tier: 'classic', desc: 'Eski Sonnet', cost: '$3/$15 per 1M' },
      { id: 'claude-2-1', label: 'Claude 2.1 (legacy)', tier: 'classic', desc: 'Çok eski', cost: '$8/$24 per 1M' },
    ],
    default: 'claude-3-5-haiku-20241022',
  },
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta',
    models: [
      // Gemini 2.5
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'flagship', desc: 'En güçlü reasoning', cost: '$1.25-$2.50/$10-$15 per 1M' },
      { id: 'gemini-2.5-pro-exp-03-25', label: 'Gemini 2.5 Pro (Exp)', tier: 'flagship', desc: 'Experimental Pro', cost: 'Free during preview' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'balanced', desc: 'Adaptive thinking', cost: '$0.15/$0.60 per 1M' },
      { id: 'gemini-2.5-flash-thinking', label: 'Gemini 2.5 Flash Thinking', tier: 'balanced', desc: 'Reasoning + hız', cost: '$0.15/$0.60 per 1M' },
      // Gemini 2.0
      { id: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro', tier: 'flagship', desc: 'Güçlü multimodal', cost: '$1.25/$5 per 1M' },
      { id: 'gemini-2.0-pro-exp', label: 'Gemini 2.0 Pro Exp', tier: 'flagship', desc: 'Experimental Pro', cost: 'Free during preview' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'balanced', desc: 'Hızlı multimodal', cost: '$0.075/$0.30 per 1M' },
      { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash Exp', tier: 'balanced', desc: 'Experimental Flash', cost: 'Free during preview' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite', tier: 'fast', desc: 'Çok ucuz', cost: '$0.018/$0.072 per 1M' },
      { id: 'gemini-2.0-flash-thinking-exp-1219', label: 'Gemini 2.0 Flash Thinking Exp', tier: 'fast', desc: 'Thinking experimental', cost: 'Free during preview' },
      // Gemini 1.5
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'flagship', desc: 'Stabil güçlü', cost: '$1.25/$5 per 1M' },
      { id: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro Latest', tier: 'flagship', desc: 'En son 1.5 Pro', cost: '$1.25/$5 per 1M' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', tier: 'balanced', desc: 'Hızlı', cost: '$0.075/$0.30 per 1M' },
      { id: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash Latest', tier: 'balanced', desc: 'En son Flash', cost: '$0.075/$0.30 per 1M' },
      { id: 'gemini-1.5-flash-8b', label: 'Gemini 1.5 Flash 8B', tier: 'fast', desc: 'Çok hızlı', cost: '$0.0375/$0.15 per 1M' },
      { id: 'gemini-1.5-flash-8b-latest', label: 'Gemini 1.5 Flash 8B Latest', tier: 'fast', desc: 'En son 8B', cost: '$0.0375/$0.15 per 1M' },
      { id: 'gemini-1.5-pro-002', label: 'Gemini 1.5 Pro 002', tier: 'flagship', desc: 'Spesifik versiyon', cost: '$1.25/$5 per 1M' },
      { id: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash 002', tier: 'balanced', desc: 'Spesifik versiyon', cost: '$0.075/$0.30 per 1M' },
      // Gemma (Açık kaynak Gemini)
      { id: 'gemma-2-27b-it', label: 'Gemma 2 27B IT', tier: 'flagship', desc: 'Google açık kaynak', cost: 'Free (rate limit)' },
      { id: 'gemma-2-9b-it', label: 'Gemma 2 9B IT', tier: 'balanced', desc: 'Açık kaynak küçük', cost: 'Free (rate limit)' },
      { id: 'gemma-2-2b-it', label: 'Gemma 2 2B IT', tier: 'fast', desc: 'Çok hafif', cost: 'Free (rate limit)' },
      // Özel
      { id: 'gemini-nano', label: 'Gemini Nano (preview)', tier: 'fast', desc: 'Çok hafif', cost: 'Ücretsiz (rate limit)' },
      { id: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro (legacy)', tier: 'classic', desc: 'Eski', cost: '$0.50/$1.50 per 1M' },
      { id: 'gemini-1.0-pro-vision', label: 'Gemini 1.0 Pro Vision (legacy)', tier: 'classic', desc: 'Eski vision', cost: '$0.50/$1.50 per 1M' },
      // Embedding
      { id: 'text-embedding-004', label: 'Text Embedding 004', tier: 'embedding', desc: 'Embedding', cost: '$0.025 per 1M' },
    ],
    default: 'gemini-2.0-flash',
  },
  groq: {
    name: 'Groq (hızlı + ücretsiz)',
    url: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tier: 'flagship', desc: 'En güçlü açık', cost: 'FREE' },
      { id: 'llama-3.3-70b-specdec', label: 'Llama 3.3 70B SpecDec', tier: 'flagship', desc: 'Speculative decoding', cost: 'FREE' },
      { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile', tier: 'flagship', desc: 'Alternatif güçlü', cost: 'FREE' },
      { id: 'qwen-2.5-72b', label: 'Qwen 2.5 72B', tier: 'flagship', desc: 'Çince + İngilizce', cost: 'FREE' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B (reasoning)', tier: 'flagship', desc: 'Reasoning', cost: 'FREE' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tier: 'fast', desc: 'Çok hızlı', cost: 'FREE' },
      { id: 'llama-3-8b-8192', label: 'Llama 3 8B', tier: 'fast', desc: 'Standart 8K context', cost: 'FREE' },
      { id: 'gemma-2-9b-it', label: 'Gemma 2 9B IT', tier: 'balanced', desc: 'Google açık kaynak', cost: 'FREE' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B 32K', tier: 'fast', desc: 'Hızlı inference', cost: 'FREE' },
      { id: 'whisper-large-v3', label: 'Whisper Large v3', tier: 'audio', desc: 'Ses transkripsiyon', cost: 'FREE' },
      { id: 'whisper-large-v3-turbo', label: 'Whisper Large v3 Turbo', tier: 'audio', desc: 'Hızlı ses', cost: 'FREE' },
    ],
    default: 'llama-3.3-70b-versatile',
  },
  deepseek: {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', tier: 'flagship', desc: 'Reasoning odaklı', cost: '~$0.55/$2.19 per 1M' },
      { id: 'deepseek-coder', label: 'DeepSeek Coder V2', tier: 'flagship', desc: 'Kod için optimize', cost: '~$0.14/$0.28 per 1M' },
      { id: 'deepseek-chat', label: 'DeepSeek Chat V3', tier: 'balanced', desc: 'Genel amaçlı', cost: '~$0.14/$0.28 per 1M' },
      { id: 'deepseek-coder-instruct', label: 'DeepSeek Coder Instruct', tier: 'balanced', desc: 'Instruction tuned', cost: '~$0.14/$0.28 per 1M' },
    ],
    default: 'deepseek-chat',
  },
  ollama: {
    name: 'Ollama (local)',
    url: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.3', label: 'Llama 3.3 (70B)', tier: 'flagship', desc: 'En güçlü local', cost: 'FREE (local)' },
      { id: 'llama3.2', label: 'Llama 3.2 (3B)', tier: 'balanced', desc: 'Dengeli', cost: 'FREE (local)' },
      { id: 'llama3.1', label: 'Llama 3.1 (8B)', tier: 'flagship', desc: 'Güçlü', cost: 'FREE (local)' },
      { id: 'llama3.2:1b', label: 'Llama 3.2 1B', tier: 'fast', desc: 'Çok hafif', cost: 'FREE (local)' },
      { id: 'llama2', label: 'Llama 2 (7B)', tier: 'classic', desc: 'Eski', cost: 'FREE (local)' },
      { id: 'qwen2.5', label: 'Qwen 2.5 (7B)', tier: 'balanced', desc: 'Çince + İngilizce', cost: 'FREE (local)' },
      { id: 'qwen2.5-coder', label: 'Qwen 2.5 Coder (7B)', tier: 'balanced', desc: 'Kod için', cost: 'FREE (local)' },
      { id: 'gemma2', label: 'Gemma 2 (2B)', tier: 'fast', desc: 'Google açık kaynak', cost: 'FREE (local)' },
      { id: 'gemma2:27b', label: 'Gemma 2 (27B)', tier: 'flagship', desc: 'Büyük Gemma', cost: 'FREE (local)' },
      { id: 'mistral', label: 'Mistral (7B)', tier: 'balanced', desc: 'Hızlı', cost: 'FREE (local)' },
      { id: 'mixtral', label: 'Mixtral (8x7B)', tier: 'flagship', desc: 'MoE mimari', cost: 'FREE (local)' },
      { id: 'phi3', label: 'Phi-3 Mini', tier: 'fast', desc: 'Microsoft küçük', cost: 'FREE (local)' },
      { id: 'codellama', label: 'Code Llama (7B)', tier: 'balanced', desc: 'Kod için', cost: 'FREE (local)' },
    ],
    default: 'llama3.2',
  },
  minimax: {
    name: 'Minimax (M2.5)',
    url: 'https://api.minimax.io',
    models: [
      { id: 'MiniMax-M2.5', label: 'M2.5', tier: 'flagship', desc: 'En güçlü', cost: 'API key' },
      { id: 'MiniMax-M2.5-highspeed', label: 'M2.5 HighSpeed', tier: 'flagship', desc: 'Hızlı M2.5', cost: 'API key' },
      { id: 'MiniMax-M2-7k', label: 'M2 (7K context)', tier: 'balanced', desc: 'Önceki', cost: 'API key' },
      { id: 'MiniMax-M2-32k', label: 'M2 (32K context)', tier: 'balanced', desc: 'Uzun context', cost: 'API key' },
      { id: 'MiniMax-M2-128k', label: 'M2 (128K context)', tier: 'flagship', desc: 'Çok uzun context', cost: 'API key' },
      { id: 'MiniMax-realtime', label: 'M2 Realtime', tier: 'fast', desc: 'Hızlı', cost: 'API key' },
    ],
    default: 'MiniMax-M2.5',
  },
  openrouter: {
    name: 'OpenRouter (100+ model)',
    url: 'https://openrouter.ai/api/v1',
    models: [
      // Premium
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'flagship', cost: '~$3/$15 per 1M' },
      { id: 'anthropic/claude-3-opus', label: 'Claude 3 Opus', tier: 'flagship', cost: '~$15/$75 per 1M' },
      { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'flagship', cost: '~$5/$15 per 1M' },
      { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'flagship', cost: '~$10/$30 per 1M' },
      { id: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5', tier: 'flagship', cost: '~$1.25/$5 per 1M' },
      { id: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B', tier: 'flagship', desc: 'En büyük açık model', cost: '~$2.70/$2.70 per 1M' },
      // Mid-tier
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', tier: 'balanced', cost: '~$0.15/$0.60 per 1M' },
      { id: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku', tier: 'fast', cost: '~$0.25/$1.25 per 1M' },
      { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', tier: 'fast', cost: '~$0.075/$0.30 per 1M' },
      { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', tier: 'balanced', cost: '~$0.88/$0.88 per 1M' },
      { id: 'mistralai/mistral-large', label: 'Mistral Large', tier: 'flagship', cost: '~$2/$6 per 1M' },
      // Ücretsiz
      { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (FREE)', tier: 'fast', desc: 'Tamamen ücretsiz', cost: 'FREE' },
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (FREE)', tier: 'fast', desc: 'Ücretsiz', cost: 'FREE' },
      { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (FREE)', tier: 'balanced', desc: 'Ücretsiz', cost: 'FREE' },
      { id: 'meta-llama/llama-3.2-3b-instruct:free', label: 'Llama 3.2 3B (FREE)', tier: 'fast', desc: 'Ücretsiz', cost: 'FREE' },
    ],
    default: 'openai/gpt-4o-mini',
  },
  mistral: {
    name: 'Mistral AI',
    url: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large 2', tier: 'flagship', cost: '~$2/$6 per 1M' },
      { id: 'mistral-medium-latest', label: 'Mistral Medium', tier: 'balanced', cost: '~$0.7/$2.1 per 1M' },
      { id: 'mistral-small-latest', label: 'Mistral Small', tier: 'fast', cost: '~$0.2/$0.6 per 1M' },
      { id: 'codestral-latest', label: 'Codestral', tier: 'balanced', desc: 'Kod için optimize', cost: '~$0.2/$0.6 per 1M' },
      { id: 'open-mistral-7b', label: 'Open Mistral 7B', tier: 'fast', cost: '~$0.25/$0.25 per 1M' },
      { id: 'open-mixtral-8x7b', label: 'Open Mixtral 8x7B', tier: 'balanced', cost: '~$0.7/$0.7 per 1M' },
      { id: 'mistral-tiny', label: 'Mistral Tiny', tier: 'fast', desc: 'En küçük', cost: '~$0.15/$0.15 per 1M' },
    ],
    default: 'mistral-small-latest',
  },
  cohere: {
    name: 'Cohere',
    url: 'https://api.cohere.ai/v1',
    models: [
      { id: 'command-r-plus', label: 'Command R+', tier: 'flagship', cost: '~$2.50/$10 per 1M' },
      { id: 'command-r', label: 'Command R', tier: 'balanced', cost: '~$0.15/$0.60 per 1M' },
      { id: 'command-light', label: 'Command Light', tier: 'fast', cost: '~$0.30/$0.60 per 1M' },
      { id: 'c4ai-aya-23', label: 'C4AI Aya 23', tier: 'flagship', desc: 'Çok dilli', cost: '~$1/$1 per 1M' },
      { id: 'c4ai-aya-23-8b', label: 'C4AI Aya 23 8B', tier: 'balanced', desc: 'Çok dilli küçük', cost: '~$0.50/$0.50 per 1M' },
      { id: 'embed-english-v3.0', label: 'Embed English v3.0', tier: 'embedding', cost: '~$0.10 per 1M' },
      { id: 'embed-multilingual-v3.0', label: 'Embed Multilingual v3.0', tier: 'embedding', cost: '~$0.10 per 1M' },
    ],
    default: 'command-r',
  },
  xai: {
    name: 'xAI (Grok)',
    url: 'https://api.x.ai/v1',
    models: [
      { id: 'grok-2-1212', label: 'Grok 2', tier: 'flagship', cost: '~$2/$10 per 1M' },
      { id: 'grok-2-vision-1212', label: 'Grok 2 Vision', tier: 'flagship', desc: 'Multimodal', cost: '~$2/$10 per 1M' },
      { id: 'grok-beta', label: 'Grok Beta', tier: 'balanced', cost: '~$5/$15 per 1M' },
      { id: 'grok-vision-beta', label: 'Grok Vision Beta', tier: 'balanced', desc: 'Görsel', cost: '~$5/$15 per 1M' },
      { id: 'grok-1.5', label: 'Grok 1.5', tier: 'fast', cost: '~$0.50/$1.50 per 1M' },
    ],
    default: 'grok-2-1212',
  },
  together: {
    name: 'Together AI',
    url: 'https://api.together.xyz/v1',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', tier: 'flagship', cost: '~$0.88/$0.88 per 1M' },
      { id: 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo', label: 'Llama 3.2 90B Vision', tier: 'flagship', desc: 'Multimodal', cost: '~$1.20/$1.20 per 1M' },
      { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo', label: 'Llama 3.2 11B Vision', tier: 'balanced', desc: 'Vision ucuz', cost: '~$0.18/$0.18 per 1M' },
      { id: 'meta-llama/Llama-3.2-3B-Instruct-Turbo', label: 'Llama 3.2 3B', tier: 'fast', cost: '~$0.06/$0.06 per 1M' },
      { id: 'meta-llama/Llama-3.2-1B-Instruct-Turbo', label: 'Llama 3.2 1B', tier: 'fast', desc: 'Çok küçük', cost: '~$0.03/$0.03 per 1M' },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B', tier: 'flagship', cost: '~$1.20/$1.20 per 1M' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B', tier: 'balanced', cost: '~$0.60/$0.60 per 1M' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo', tier: 'flagship', cost: '~$1.20/$1.20 per 1M' },
    ],
    default: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  custom: {
    name: 'Custom URL',
    url: '',
    models: [
      { id: 'custom', label: 'Custom', tier: 'custom', desc: 'Manuel model adı', cost: '?' },
    ],
    default: 'custom',
  },
};


function rlQuestion(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function saveConfig(data) {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function setup(params) {
  try {
    const [action] = params || [];

    if (!action || action === 'wizard') return await cmdWizard();
    if (action === 'status') return cmdStatus();
    if (action === 'config') return cmdConfig();
    if (action === 'workspace') return cmdWorkspace();
    if (action === 'dirs') return cmdDirs();

    console.log(chalk.yellow('\n  Usage:'));
    console.log(chalk.gray('    natureco setup               Interactive setup wizard'));
    console.log(chalk.gray('    natureco setup config         Create default config'));
    console.log(chalk.gray('    natureco setup workspace      Create workspace directories'));
    console.log(chalk.gray('    natureco setup dirs           Create data directories'));
    console.log(chalk.gray('    natureco setup status         Show setup status\n'));
  } catch (err) {
    console.log(chalk.red(`\n  Setup error: ${err.message}\n`));
  }
}

async function cmdWizard() {
  console.clear();
  // Tam NatureCo logosu — brand kimliği
  for (const line of FULL_LOGO) console.log(COLORS.primary(line));
  console.log('');
  console.log(COLORS.secondary.bold('  ⚡ Setup Wizard — 60 saniyede hazır'));
  console.log(COLORS.muted('  Provider seç, API key gir, hemen başla.\n'));

  // Ensure directories
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  for (const dir of DIRS) {
    const p = path.join(BASE_DIR, dir);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }

  const cfg = getConfig();

  // v5.6.4: Step 1 - Provider + direkt model wizard (tier yok)
  console.log(chalk.white('  Step 1: Provider & Model'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));

  const providerKeys = Object.keys(PROVIDER_PRESETS).filter(k => k !== 'custom');
  const { provider } = await inquirer.prompt([{
    type: 'list',
    name: 'provider',
    message: '  AI Provider:',
    choices: [
      ...providerKeys.map(k => ({
        name: `${PROVIDER_PRESETS[k].name} (${PROVIDER_PRESETS[k].models.length} model)`,
        value: k,
      })),
      { name: 'Custom URL', value: 'custom' },
    ],
    pageSize: 14,
  }]);

  let providerUrl, providerModel;
  if (provider === 'custom') {
    providerUrl = await rlQuestion(`  Provider URL (${cfg.providerUrl || 'https://api.openai.com/v1'}): `);
    providerModel = await rlQuestion(`  Model (${cfg.providerModel || 'gpt-4o'}): `);
    providerUrl = providerUrl || cfg.providerUrl || 'https://api.openai.com/v1';
    providerModel = providerModel || cfg.providerModel || 'gpt-4o';
  } else {
    const preset = PROVIDER_PRESETS[provider];
    providerUrl = preset.url;

    // Direkt model listesi - tier gruplari ile
    const { modelId } = await inquirer.prompt([{
      type: 'list',
      name: 'modelId',
      message: `  Model sec (${preset.models.length} secenek):`,
      choices: [
        { name: '─────────────────────', disabled: true },
        { name: '🟢 GÜÇLÜ / REASONING (en iyi)', disabled: true },
        ...preset.models.filter(m => m.tier === 'flagship' || m.tier === 'reasoning').map(m => ({
          name: `  ${m.label} (${m.cost})`,
          value: m.id,
        })),
        { name: '─────────────────────', disabled: true },
        { name: '🟡 ORTA (dengeli)', disabled: true },
        ...preset.models.filter(m => m.tier === 'balanced').map(m => ({
          name: `  ${m.label} (${m.cost})`,
          value: m.id,
        })),
        { name: '─────────────────────', disabled: true },
        { name: '🔵 HIZLI / UCUZ', disabled: true },
        ...preset.models.filter(m => m.tier === 'fast').map(m => ({
          name: `  ${m.label} (${m.cost})`,
          value: m.id,
        })),
        { name: '─────────────────────', disabled: true },
        { name: '⚪ KLASİK (legacy)', disabled: true },
        ...preset.models.filter(m => m.tier === 'classic').map(m => ({
          name: `  ${m.label} (${m.cost})`,
          value: m.id,
        })),
        { name: '─────────────────────', disabled: true },
        { name: '🔊 ÖZEL (audio/vision/embedding)', disabled: true },
        ...preset.models.filter(m => ['audio', 'vision', 'embedding', 'custom'].includes(m.tier)).map(m => ({
          name: `  ${m.label} (${m.cost})`,
          value: m.id,
        })),
        { name: '─────────────────────', disabled: true },
        { name: '✏️  Custom model adı (ileri düzey)', value: '__custom__' },
      ],
      pageSize: 20,
    }]);

    if (modelId === '__custom__') {
      providerModel = await rlQuestion(`  Model adı: `) || preset.default;
    } else {
      providerModel = modelId;
    }
    console.log(chalk.gray(`  URL:   ${providerUrl}`));
    console.log(chalk.gray(`  Model: ${providerModel}`));
  }

  // Step 2: API Key
  console.log('');
  console.log(chalk.white('  Step 2: API Key'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  console.log(chalk.gray('  Get a key from: ') + chalk.cyan('developers.natureco.me'));
  console.log(chalk.gray('  Or use your own provider API key.\n'));

  const currentKey = cfg.providerApiKey || '';
  if (currentKey) {
    console.log('');
    console.log(chalk.yellow('  ⚠️  Mevcut API key tespit edildi (son 4 karakter: ' + currentKey.slice(-4) + ')'));
    const reset = await inquirer.prompt([{
      type: 'confirm',
      name: 'fresh',
      message: 'Sıfırdan yeni kurulum mu yapacaksın? (N = mevcut korunur)',
      default: false,
    }]);
    if (reset.fresh) {
      // Sifirla - tum eski kanallari temizle
      delete cfg.telegramToken;
      delete cfg.whatsappPhone;
      delete cfg.discordToken;
      delete cfg.slackToken;
      delete cfg.signalBot;
      delete cfg.mattermostBot;
      delete cfg.smsTwilioSid;
      delete cfg.webhooks;
      console.log(chalk.green('  ✓ Eski ayarlar temizlendi'));
    }
  }
  const apiKey = await rlQuestion(`  API Key ${currentKey ? '(leave blank to keep current)' : ''}: `);
  if (apiKey) {
    cfg.providerApiKey = apiKey;
    // v5.6.0: API key dogrula
    console.log('\n  Doğrulanıyor...');
    const isValid = await validateApiKey(cfg.providerUrl, apiKey);
    if (!isValid) {
      console.log('  ❌ API key gecersiz! Lutfen kontrol edin.');
      const retry = await inquirer.prompt([{
        type: 'confirm',
        name: 'continue',
        message: 'Yine de devam etmek istiyor musunuz? (key sonra duzeltilebilir)',
        default: false,
      }]);
      if (!retry.continue) {
        console.log('  Setup iptal edildi. Tekrar deneyin: natureco setup');
        process.exit(1);
      }
    } else {
      console.log('  ✓ API key gecerli!');
    }
  }

  // Step 3: Bot & User identity
  console.log('');
  console.log(chalk.white('  Step 3: Bot & Kullanıcı'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  const userName = await rlQuestion(`  Sizin adınız: `);
  if (userName) cfg.userName = userName;
  const botName = await rlQuestion(`  Bot adı: `);
  if (botName) cfg.botName = botName;

  // v5.6.7: Memory dosyasi yoksa olustur, varsa guncelle
  try {
    const memFile = path.join(BASE_DIR, (userName || cfg.userName || 'default').toLowerCase() + '.json');
    let mem = {};
    let memExists = fs.existsSync(memFile);
    if (memExists) {
      try { mem = JSON.parse(fs.readFileSync(memFile, 'utf8')); } catch (e) {}
    }
    let memChanged = false;
    if (botName && mem.botName !== botName) { mem.botName = botName; memChanged = true; }
    if (userName && mem.name !== userName) { mem.name = userName; memChanged = true; }
    // v5.6.7: Memory yoksa veya guncellenmesi gerekiyorsa yaz
    if (!memExists || memChanged) {
      if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
      if (!fs.existsSync(path.dirname(memFile))) fs.mkdirSync(path.dirname(memFile), { recursive: true });
      fs.writeFileSync(memFile, JSON.stringify(mem, null, 2), 'utf8');
      console.log(chalk.gray('  ✓ Memory ' + (memExists ? 'guncellendi' : 'olusturuldu') + ': ' + memFile));
    }
  } catch (e) {
    console.log(chalk.gray('  ! Memory yazilamadi: ' + e.message));
  }

  // Step 4: Kanal Entegrasyonları (isteğe bağlı, isteyen atlayabilir)
  console.log('');
  console.log(chalk.white('  Step 4: Kanal Entegrasyonları (opsiyonel)'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  console.log(chalk.gray('  Telegram, WhatsApp, Discord, Slack bağlamak ister misiniz?'));
  console.log(chalk.gray('  Atlamak için hepsini boş bırakın, sonra: natureco <kanal> connect\n'));

  const integrations = [
    { key: 'telegramToken',   name: 'Telegram',   hint: 'BotFather\'dan al (@BotFather → /newbot → token)' },
    { key: 'whatsappPhone',   name: 'WhatsApp',   hint: 'Telefon numaranızı girin (örn: +905422842631)' },
    { key: 'discordToken',    name: 'Discord',    hint: 'Discord bot token (Discord Developer Portal)' },
    { key: 'slackToken',      name: 'Slack',      hint: 'Slack bot token (api.slack.com/apps)' },
    { key: 'signalBotId',     name: 'Signal',     hint: 'Signal bot numarası veya ID' },
    { key: 'ircBotId',        name: 'IRC',        hint: 'IRC bot kullanıcı adı (örn: NatureCoBot)' },
    { key: 'mattermostBotId', name: 'Mattermost', hint: 'Mattermost bot kullanıcı adı' },
    { key: 'imessageBotId',   name: 'iMessage',   hint: 'iMessage bridge endpoint veya ad' },
    { key: 'smsBotId',        name: 'SMS (Twilio)', hint: 'Twilio hesap SID veya bot ID' },
    { key: 'webhooks',        name: 'Webhooks',   hint: 'Webhook URL (veya boş bırakın, sonra: natureco webhooks add)' },
  ];

  for (const integ of integrations) {
    const current = cfg[integ.key] || '';
    if (current) {
      console.log(chalk.gray(`  ${integ.name}: zaten ayarlı, boş bırakırsanız korunur`));
    } else {
      console.log(chalk.gray(`  ${integ.hint}`));
    }
    const val = await rlQuestion(`  ${integ.name} ${current ? '(mevcut - boş bırakın)' : '(boş = atla)'}: `);
    if (val) {
      cfg[integ.key] = val;
      console.log(chalk.green(`    ✓ ${integ.name} ayarlandı`));
    }
  }

  // Save
  cfg.providerUrl = providerUrl;
  cfg.providerModel = providerModel;
  cfg.setupCompleted = true;
  cfg.updated = new Date().toISOString();
  if (!cfg.created) cfg.created = new Date().toISOString();
  if (!cfg.version) cfg.version = 1;
  if (cfg.skills === undefined) cfg.skills = { enabled: true, list: [] };
  if (cfg.mcpServers === undefined) cfg.mcpServers = {};

  saveConfig(cfg);

  console.log('');
  console.log(chalk.green('  ✓ Setup complete!\n'));
  console.log(chalk.white('  Config saved to: ') + chalk.gray(CONFIG_FILE));
  console.log('');
  console.log(chalk.white('  Next steps:'));
  console.log(chalk.cyan('    natureco chat              Start chatting'));
  console.log(chalk.cyan('    natureco repl              İnteraktif REPL (persistent memory)'));
  console.log(chalk.cyan('    natureco telegram connect  Telegram bot bağla (henüz yapılmadıysa)'));
  console.log(chalk.cyan('    natureco help              View all commands'));
  console.log('');
}

function cmdStatus() {
  console.log(chalk.cyan('\n  Setup Status\n'));

  const configExists = fs.existsSync(CONFIG_FILE);
  const dirExists = fs.existsSync(BASE_DIR);

  console.log(chalk.white('  Config:     ') + (configExists ? chalk.green('exists') : chalk.yellow('missing')));
  console.log(chalk.white('  Directory:  ') + (dirExists ? chalk.green('exists') : chalk.yellow('missing')));

  if (configExists) {
    const cfg = getConfig();
    console.log(chalk.white('  Provider:   ') + chalk.gray(cfg.providerUrl || 'not set'));
    console.log(chalk.white('  Model:      ') + chalk.gray(cfg.providerModel || 'not set'));
    console.log(chalk.white('  API Key:    ') + (cfg.providerApiKey ? chalk.green('set') : chalk.yellow('not set')));
    console.log(chalk.white('  Setup:      ') + (cfg.setupCompleted ? chalk.green('completed') : chalk.yellow('incomplete')));
  }

  if (dirExists) {
    const existing = fs.readdirSync(BASE_DIR).filter(f => fs.statSync(path.join(BASE_DIR, f)).isDirectory());
    const present = DIRS.filter(d => existing.includes(d));
    const absent = DIRS.filter(d => !existing.includes(d));
    if (present.length) console.log(chalk.white('  Dirs:       ') + chalk.green(present.join(', ')));
    if (absent.length) console.log(chalk.white('  Missing:    ') + chalk.yellow(absent.join(', ')));
  }

  console.log('');
}

function cmdConfig() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  const defaults = {
    version: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    setupCompleted: false,
    skills: { enabled: true, list: [] },
    mcpServers: {},
  };

  if (fs.existsSync(CONFIG_FILE)) {
    console.log(chalk.yellow('\n  Config already exists at: ' + CONFIG_FILE + '\n'));
    return;
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2), 'utf8');
  console.log(chalk.green('\n  Config created at: ' + CONFIG_FILE + '\n'));
}

function cmdWorkspace() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  const workspaceDir = path.join(BASE_DIR, 'workspace');
  const logsDir = path.join(BASE_DIR, 'logs');

  if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  console.log(chalk.green('\n  Workspace directories created:\n'));
  console.log(chalk.gray('    ' + workspaceDir));
  console.log(chalk.gray('    ' + logsDir));
  console.log('');
}

function cmdDirs() {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

  let created = 0;
  for (const dir of DIRS) {
    const p = path.join(BASE_DIR, dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created++;
    }
  }

  console.log(chalk.green(`\n  Created ${created} data director${created === 1 ? 'y' : 'ies'}`));
  if (created > 0) {
    console.log(chalk.gray('  Location: ' + BASE_DIR));
  }
  console.log('');
}

module.exports = setup;

/**
 * v5.6.0: API key dogrulama — test istegi gonder
 * Boylece kullanici yanlis key ile devam etmez
 */
async function validateApiKey(providerUrl, apiKey) {
  return new Promise((resolve) => {
    const https = require('https');
    const url = new URL(providerUrl);
    const isMM = url.hostname.includes('minimax') || url.hostname.includes('minimaxi');
    const endpoint = isMM 
      ? providerUrl.replace(/\/+$/, '') + '/v1/text/chatcompletion_v2'
      : providerUrl.replace(/\/+$/, '') + '/chat/completions';

    // Her provider icin test modeli
    let testModel = 'gpt-3.5-turbo';
    if (providerUrl.includes('groq.com')) testModel = 'llama-3.1-8b-instant';
    else if (providerUrl.includes('anthropic.com')) testModel = 'claude-3-haiku-20240307';
    else if (isMM) testModel = 'MiniMax-M2.5';
    else if (providerUrl.includes('gemini')) testModel = 'gemini-1.5-flash';
    else if (providerUrl.includes('mistral.ai')) testModel = 'mistral-tiny';
    else if (providerUrl.includes('openrouter.ai')) testModel = 'meta-llama/llama-3.1-8b-instruct:free';
    else if (providerUrl.includes('deepseek.com')) testModel = 'deepseek-chat';
    
    const data = JSON.stringify({
      model: testModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1  // Minimum token — sadece auth kontrolu
    });
    
    const u = new URL(endpoint);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 8000
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        // Status 200-299 ve body'de 'error' yoksa gecerli
        const statusOk = res.statusCode >= 200 && res.statusCode < 300;
        const bodyOk = !body.includes('"error"') && !body.includes('"invalid_api_key"') && !body.includes('"Unauthorized"');
        resolve(statusOk && bodyOk);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(data);
    req.end();
  });
}
