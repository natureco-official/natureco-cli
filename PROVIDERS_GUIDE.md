# NatureCo CLI v2.1.0 - Universal Provider Guide

## 🌐 Supported Providers

NatureCo CLI artık **tüm OpenAI-compatible ve Anthropic** provider'ları destekliyor!

### OpenAI-Compatible Providers
- ✅ **Groq** - Ultra-fast inference
- ✅ **OpenAI** - GPT-4, GPT-3.5
- ✅ **Together AI** - Open source models
- ✅ **Fireworks AI** - Fast inference
- ✅ **Perplexity** - Search-augmented
- ✅ **Mistral AI** - European AI
- ✅ **DeepSeek** - Chinese AI
- ✅ **OpenRouter** - Multi-provider gateway
- ✅ **Ollama** - Local models
- ✅ **LM Studio** - Local models
- ✅ **Any OpenAI-compatible API**

### Anthropic
- ✅ **Claude** - Anthropic's models (special handling)

## 🔧 Setup

### Universal Config (v2.1.0+)
```bash
# 3 config key ile herhangi bir provider
natureco config set providerUrl <API_URL>
natureco config set providerApiKey <API_KEY>
natureco config set providerModel <MODEL_NAME>
```

### Legacy Config (v2.0.x)
```bash
# Sadece Groq için (hala çalışır)
natureco config set groqApiKey gsk_xxx
natureco config set groqModel llama-3.1-8b-instant
```

## 📋 Provider Setup Examples

### Groq (Recommended - Fast & Free)
```bash
# 1. API key al: https://console.groq.com/keys
# 2. Config set et
natureco config set providerUrl https://api.groq.com/openai/v1
natureco config set providerApiKey gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel llama-3.1-8b-instant

# Test
natureco chat
> test
```

**Groq Models:**
- `llama-3.1-8b-instant` - En hızlı (default)
- `llama-3.3-70b-versatile` - En güçlü
- `mixtral-8x7b-32768` - Çok dilli
- `gemma2-9b-it` - Google Gemma

### OpenAI
```bash
# 1. API key al: https://platform.openai.com/api-keys
# 2. Config set et
natureco config set providerUrl https://api.openai.com/v1
natureco config set providerApiKey sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel gpt-4o-mini

# Test
natureco chat
> test
```

**OpenAI Models:**
- `gpt-4o` - En güçlü
- `gpt-4o-mini` - Hızlı ve ucuz
- `gpt-4-turbo` - Eski güçlü model
- `gpt-3.5-turbo` - En ucuz

### Anthropic Claude
```bash
# 1. API key al: https://console.anthropic.com/
# 2. Config set et
natureco config set providerUrl https://api.anthropic.com
natureco config set providerApiKey sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel claude-3-5-sonnet-20241022

# Test
natureco chat
> test
```

**Anthropic Models:**
- `claude-3-5-sonnet-20241022` - En güçlü
- `claude-3-5-haiku-20241022` - Hızlı
- `claude-3-opus-20240229` - Eski güçlü

**Not:** Anthropic API formatı farklı, otomatik detect edilir.

### Together AI
```bash
# 1. API key al: https://api.together.xyz/settings/api-keys
# 2. Config set et
natureco config set providerUrl https://api.together.xyz/v1
natureco config set providerApiKey xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo

# Test
natureco chat
> test
```

**Together Models:**
- `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`
- `mistralai/Mixtral-8x7B-Instruct-v0.1`
- `Qwen/Qwen2.5-72B-Instruct-Turbo`

### Fireworks AI
```bash
# 1. API key al: https://fireworks.ai/api-keys
# 2. Config set et
natureco config set providerUrl https://api.fireworks.ai/inference/v1
natureco config set providerApiKey fw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel accounts/fireworks/models/llama-v3p1-70b-instruct

# Test
natureco chat
> test
```

### OpenRouter (Multi-Provider Gateway)
```bash
# 1. API key al: https://openrouter.ai/keys
# 2. Config set et
natureco config set providerUrl https://openrouter.ai/api/v1
natureco config set providerApiKey sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel meta-llama/llama-3.1-70b-instruct

# Test
natureco chat
> test
```

**OpenRouter Avantajı:** Tek API key ile 100+ model erişimi

### Ollama (Local)
```bash
# 1. Ollama kur: https://ollama.ai/
# 2. Model indir: ollama pull llama3.1
# 3. Config set et
natureco config set providerUrl http://localhost:11434/v1
natureco config set providerApiKey ollama
natureco config set providerModel llama3.1

# Test
natureco chat
> test
```

**Ollama Avantajı:** Tamamen lokal, internet gerekmez, ücretsiz

### LM Studio (Local)
```bash
# 1. LM Studio kur: https://lmstudio.ai/
# 2. Model indir ve server başlat
# 3. Config set et
natureco config set providerUrl http://localhost:1234/v1
natureco config set providerApiKey lm-studio
natureco config set providerModel local-model

# Test
natureco chat
> test
```

### Perplexity
```bash
# 1. API key al: https://www.perplexity.ai/settings/api
# 2. Config set et
natureco config set providerUrl https://api.perplexity.ai
natureco config set providerApiKey pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel llama-3.1-sonar-large-128k-online

# Test
natureco chat
> test
```

**Perplexity Avantajı:** Search-augmented, güncel bilgi

### Mistral AI
```bash
# 1. API key al: https://console.mistral.ai/api-keys/
# 2. Config set et
natureco config set providerUrl https://api.mistral.ai/v1
natureco config set providerApiKey xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel mistral-large-latest

# Test
natureco chat
> test
```

### DeepSeek
```bash
# 1. API key al: https://platform.deepseek.com/api_keys
# 2. Config set et
natureco config set providerUrl https://api.deepseek.com/v1
natureco config set providerApiKey sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
natureco config set providerModel deepseek-chat

# Test
natureco chat
> test
```

## 🔄 Provider Değiştirme

```bash
# Groq'tan OpenAI'ye geçiş
natureco config set providerUrl https://api.openai.com/v1
natureco config set providerApiKey sk-xxx
natureco config set providerModel gpt-4o-mini

# OpenAI'den Anthropic'e geçiş
natureco config set providerUrl https://api.anthropic.com
natureco config set providerApiKey sk-ant-xxx
natureco config set providerModel claude-3-5-sonnet-20241022

# Anthropic'ten Ollama'ya (local) geçiş
natureco config set providerUrl http://localhost:11434/v1
natureco config set providerApiKey ollama
natureco config set providerModel llama3.1
```

## 🧪 Test

```bash
# Config kontrol
natureco config list

# Chat test
natureco chat
> merhaba

# Debug çıktısı:
[Provider] Sending request...
[Provider] URL: https://api.groq.com/openai/v1
[Provider] Model: llama-3.1-8b-instant
[Provider] Type: OpenAI-compatible
[Provider] Messages: 2
[Provider] Tools: 4
```

## 📊 Provider Karşılaştırması

| Provider | Speed | Cost | Quality | Local | Special |
|----------|-------|------|---------|-------|---------|
| Groq | ⚡⚡⚡ | Free | ⭐⭐⭐ | ❌ | Ultra-fast |
| OpenAI | ⚡⚡ | $$$ | ⭐⭐⭐⭐ | ❌ | Best quality |
| Anthropic | ⚡⚡ | $$$ | ⭐⭐⭐⭐ | ❌ | Long context |
| Together | ⚡⚡ | $$ | ⭐⭐⭐ | ❌ | Open source |
| Ollama | ⚡ | Free | ⭐⭐ | ✅ | Privacy |
| OpenRouter | ⚡⚡ | $ | ⭐⭐⭐ | ❌ | 100+ models |
| Perplexity | ⚡⚡ | $$ | ⭐⭐⭐ | ❌ | Search |

## 🔍 Debug

### Provider Config Kontrol
```bash
natureco config get providerUrl
natureco config get providerApiKey
natureco config get providerModel
```

### Provider Test
```bash
natureco chat
> test

# Çıktıda göreceksin:
[Provider] URL: ...
[Provider] Model: ...
[Provider] Type: OpenAI-compatible / Anthropic
```

## 🚨 Troubleshooting

### Error: Provider not configured
```bash
# Çözüm: 3 config key set et
natureco config set providerUrl https://api.groq.com/openai/v1
natureco config set providerApiKey gsk_xxx
natureco config set providerModel llama-3.1-8b-instant
```

### Error: Provider API error: 401
```bash
# Çözüm: API key yanlış, kontrol et
natureco config get providerApiKey
```

### Error: Provider API error: 404
```bash
# Çözüm: URL veya model yanlış
natureco config get providerUrl
natureco config get providerModel
```

### Anthropic Not Working
```bash
# Anthropic URL'i kontrol et - otomatik detect edilir
natureco config get providerUrl
# Output: https://api.anthropic.com

# Model kontrol et
natureco config get providerModel
# Output: claude-3-5-sonnet-20241022
```

## 📝 Config Örneği

```json
{
  "providerUrl": "https://api.groq.com/openai/v1",
  "providerApiKey": "gsk_xxx...",
  "providerModel": "llama-3.1-8b-instant"
}
```

## 🎯 Öneriler

**Hız için:** Groq (llama-3.1-8b-instant)
**Kalite için:** OpenAI (gpt-4o) veya Anthropic (claude-3-5-sonnet)
**Maliyet için:** Groq (free) veya Ollama (local)
**Privacy için:** Ollama veya LM Studio (local)
**Çok dilli için:** Groq (mixtral-8x7b)
**Search için:** Perplexity (sonar models)

## 🔗 Faydalı Linkler

- Groq: https://console.groq.com/
- OpenAI: https://platform.openai.com/
- Anthropic: https://console.anthropic.com/
- Together: https://api.together.xyz/
- Fireworks: https://fireworks.ai/
- OpenRouter: https://openrouter.ai/
- Ollama: https://ollama.ai/
- LM Studio: https://lmstudio.ai/
- Perplexity: https://www.perplexity.ai/
- Mistral: https://console.mistral.ai/
- DeepSeek: https://platform.deepseek.com/
