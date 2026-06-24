# NatureCo CLI v2.0.0 - Direct Groq Integration

## 🎯 Major Changes

### Breaking Changes
- ❌ **NatureCo backend bypass edildi** - Artık backend'e istek atılmıyor
- ✅ **Direkt Groq API entegrasyonu** - CLI direkt Groq'a bağlanıyor
- ✅ **Local tool execution** - Bash, file operations lokal çalışıyor
- ✅ **Multi-turn conversation** - Conversation history memory'de tutuluyor
- ✅ **Tool execution loop** - Max 10 iterasyon, otomatik tool çalıştırma

### New Architecture

```
┌─────────────┐
│  User Input │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  NatureCo CLI   │
│   (v2.0.0)      │
└──────┬──────────┘
       │
       ├─────────────────────┐
       │                     │
       ▼                     ▼
┌──────────────┐    ┌────────────────┐
│  Groq API    │    │  Local Tools   │
│  (Direct)    │◄───┤  - bash        │
│              │    │  - read_file   │
│              │    │  - write_file  │
│              │    │  - list_dir    │
└──────────────┘    └────────────────┘
```

## 📦 Yeni Dosyalar

1. **natureco-cli/src/utils/api.js** - Tamamen yeniden yazıldı
2. **natureco-cli/src/tools/list_dir.js** - Yeni tool eklendi

## 🔧 Yeni Özellikler

### 1. Direct Groq Integration
```javascript
// Config'den Groq API key oku
const groqApiKey = getGroqApiKey();

// Groq'a direkt istek at
const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${groqApiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: messages,
    tools: tools,
    tool_choice: 'auto',
  }),
});
```

### 2. Tool Definitions
```javascript
// 4 tool Groq'a gönderiliyor:
- bash: Execute shell commands
- read_file: Read file contents
- write_file: Write to files
- list_dir: List directory contents (YENİ)
```

### 3. Tool Execution Loop
```javascript
// Max 10 iterasyon
while (iteration < maxIterations) {
  // 1. Groq'a istek at
  const response = await groqAPI(messages, tools);
  
  // 2. Tool call var mı?
  if (response.tool_calls) {
    // 3. Tool'ları lokal çalıştır
    const results = await executeToolCalls(toolCalls);
    
    // 4. Sonuçları Groq'a geri gönder
    messages.push(toolResults);
    
    // 5. Tekrar cevap bekle
    continue;
  }
  
  // 6. Final response
  break;
}
```

### 4. Conversation History
```javascript
// Memory'de tutuluyor
const conversationHistory = new Map();

// Her conversation için history
conversationHistory.set(convId, [
  { role: 'user', content: 'merhaba' },
  { role: 'assistant', content: 'Merhaba!' },
  { role: 'user', content: 'dosyaları listele' },
  { role: 'assistant', content: '...' }
]);

// Son 20 mesaj tutuluyor
if (history.length > 20) {
  history = history.slice(-20);
}
```

## 📋 Setup Guide

### 1. Groq API Key Al
```bash
# Groq Console'a git
https://console.groq.com/keys

# API Key oluştur
# Copy: gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. CLI'yi Güncelle
```bash
cd natureco-cli
npm publish
npm install -g natureco-cli@2.0.0
natureco --version
# Output: 2.0.0
```

### 3. Groq API Key Set Et
```bash
# Config'e Groq API key ekle
natureco config set groqApiKey gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Kontrol et
natureco config get groqApiKey
# Output: gsk_xxx...
```

### 4. Test Et
```bash
natureco chat

> merhaba

# Beklenen çıktı:
[Groq] Sending request...
[Groq] Messages: 2
[Groq] Tools: 4

[Groq] Iteration 1/10
[Groq] Response type: text

bot › Merhaba! Size nasıl yardımcı olabilirim?
```

## 🧪 Test Senaryoları

### Test 1: Basit Sohbet
```bash
natureco chat

> merhaba
bot › Merhaba! Size nasıl yardımcı olabilirim?

> nasılsın
bot › İyiyim, teşekkür ederim! Size nasıl yardımcı olabilirim?
```

### Test 2: Tool Execution (list_dir)
```bash
natureco chat

> mevcut klasördeki dosyaları listele

# Beklenen:
[Groq] Iteration 1/10
[Groq] Response type: tool_calls
[Groq] Tool calls: 1
🔧 Executing tool: list_dir
   Params: {"path":"."}
   ✓ Success

[Groq] Iteration 2/10
[Groq] Response type: text

bot › İşte mevcut klasördeki dosyalar:
📁 node_modules
📁 src
📄 package.json (1.2 KB)
📄 README.md (3.4 KB)
...
```

### Test 3: Tool Execution (bash)
```bash
natureco chat

> git status komutunu çalıştır

# Beklenen:
[Groq] Tool calls: 1
🔧 Executing tool: bash
   Params: {"command":"git status"}
   ✓ Success

bot › Git durumu:
On branch main
Your branch is up to date with 'origin/main'.
...
```

### Test 4: Multi-turn Conversation
```bash
natureco chat

> README.md dosyasını oku
bot › [dosya içeriği]

> bu dosyada kaç satır var?
bot › README.md dosyasında 45 satır var.
# ↑ Conversation history sayesinde context'i biliyor
```

### Test 5: Tool Chain
```bash
natureco chat

> package.json dosyasını oku, version'u bul ve ekrana yazdır

# Beklenen:
[Groq] Tool calls: 1 (read_file)
[Groq] Tool calls: 0 (text response)

bot › package.json dosyasını okudum. Version: 2.0.0
```

## 🔍 Debug Logs

### Normal Response
```
[Groq] Sending request...
[Groq] Messages: 2
[Groq] Tools: 4

[Groq] Iteration 1/10
[Groq] Response type: text

bot › Merhaba!
```

### Tool Execution
```
[Groq] Sending request...
[Groq] Messages: 2
[Groq] Tools: 4

[Groq] Iteration 1/10
[Groq] Response type: tool_calls
[Groq] Tool calls: 1

🔧 Executing tool: list_dir
   Params: {"path":"."}
   ✓ Success

[Groq] Iteration 2/10
[Groq] Response type: text

bot › İşte dosyalar: ...
```

### Max Iterations
```
[Groq] Iteration 10/10
[Groq] Max iterations reached

bot › Max tool execution iterations reached.
```

## ⚙️ Configuration

### Config Dosyası
```json
{
  "groqApiKey": "gsk_xxx...",
  "apiKey": "nc_xxx...",  // Artık kullanılmıyor
  "defaultBot": "...",     // Artık kullanılmıyor
  "defaultBotId": "..."    // Artık kullanılmıyor
}
```

### Config Komutları
```bash
# Set
natureco config set groqApiKey gsk_xxx

# Get
natureco config get groqApiKey

# List all
natureco config list
```

## 🚨 Breaking Changes

### v1.x → v2.0.0

**Kaldırılan:**
- ❌ NatureCo backend dependency
- ❌ `apiKey` (NatureCo API key) artık kullanılmıyor
- ❌ `defaultBot` / `defaultBotId` artık kullanılmıyor
- ❌ Backend'e istek atma

**Eklenen:**
- ✅ `groqApiKey` config key
- ✅ Direct Groq API integration
- ✅ Local tool execution
- ✅ Conversation history
- ✅ `list_dir` tool

**Değişmeyen:**
- ✅ `natureco chat` komutu
- ✅ Tool definitions (bash, read_file, write_file)
- ✅ Config sistemi

## 📊 Comparison

| Feature | v1.x | v2.0.0 |
|---------|------|--------|
| Backend | NatureCo API | Groq Direct |
| API Key | nc_xxx | gsk_xxx |
| Tools | Backend'de | Lokal |
| Conversation | Backend'de | Memory'de |
| Tool Loop | Backend'de | CLI'de |
| Max Iterations | 5 | 10 |
| list_dir tool | ❌ | ✅ |

## 🔗 Migration Guide

### v1.x Kullanıcıları İçin

```bash
# 1. Groq API key al
https://console.groq.com/keys

# 2. CLI'yi güncelle
npm install -g natureco-cli@2.0.0

# 3. Groq API key set et
natureco config set groqApiKey gsk_xxx

# 4. Test et
natureco chat
> test
```

**Not:** Eski `apiKey` (NatureCo backend) artık kullanılmıyor ama config'de kalabilir.

## ✅ Checklist

- [x] api.js tamamen yeniden yazıldı
- [x] Direct Groq integration
- [x] Tool execution loop (max 10)
- [x] Conversation history (memory)
- [x] list_dir tool eklendi
- [x] Version 2.0.0
- [x] Dashboard version badge güncellendi
- [ ] npm publish
- [ ] Test: basit sohbet
- [ ] Test: tool execution
- [ ] Test: multi-turn conversation
- [ ] Test: tool chain

## 🚀 Deploy Komutları

```bash
cd natureco-cli
npm publish
npm install -g natureco-cli@2.0.0
natureco --version
natureco config set groqApiKey gsk_xxx
natureco chat
```

## 📝 Notlar

- Groq API free tier: 30 requests/minute
- Model: llama-3.3-70b-versatile
- Max tokens: 2000
- Temperature: 0.7
- Tool execution tamamen lokal
- Conversation history process memory'de (restart'ta silinir)
- Backend artık kullanılmıyor (bağımsız CLI)
