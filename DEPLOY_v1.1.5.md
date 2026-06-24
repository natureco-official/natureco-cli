# NatureCo CLI v1.1.5 - Backend Endpoint Fix

## 🎯 Yapılan Değişiklikler

### Sorun
- CLI `/api/agent/chat` endpoint'ine istek atıyordu ❌
- Backend `/api/agent/message` endpoint'i kullanıyor ✅
- Request body formatı uyumsuzdu

### Çözüm
**natureco-cli/src/utils/api.js** dosyasında:

1. **Endpoint değiştirildi:**
   ```javascript
   // Önceki: '/api/agent/chat'
   // Yeni: '/api/agent/message'
   ```

2. **Request body düzeltildi:**
   ```javascript
   // Önceki:
   {
     agent_id: agentId,
     message,
     conversation_id: conversationId,
     platform: 'cli',
     user_id: 'cli-user',
     system_prompt: systemPrompt
   }
   
   // Yeni:
   {
     message,
     user_id: 'cli-user',
     bot_id: finalBotId  // agent_id yerine bot_id
   }
   ```

3. **Response format adapter eklendi:**
   ```javascript
   // Backend: { response: "...", message_id: "..." }
   // CLI: { reply: "...", conversation_id: "..." }
   
   if (data.response && !data.reply) {
     data.reply = data.response;
   }
   if (data.message_id && !data.conversation_id) {
     data.conversation_id = data.message_id;
   }
   ```

4. **Kaldırılan alanlar:**
   - ❌ `system_prompt` - Backend bot'un kendi system_prompt'unu kullanıyor
   - ❌ `platform` - Backend desteklemiyor
   - ❌ `conversation_id` - Backend message_id döndürüyor

### Version Updates
- `package.json` → 1.1.5
- `dashboard.js` → v1.1.5 (2 yerde)

## 📦 Deploy Komutları

```bash
cd natureco-cli
npm publish
npm install -g natureco-cli@1.1.5
natureco --version
```

## 🧪 Test

```bash
# Chat başlat
natureco chat

# Mesaj gönder
> merhaba

# Beklenen debug çıktısı:
[DEBUG] API Request Body: {
  "message": "merhaba",
  "user_id": "cli-user",
  "bot_id": "your-bot-id"
}

[DEBUG] API Response: {
  "success": true,
  "message_id": "msg_1234567890_abc123",
  "response": "Merhaba! Size nasıl yardımcı olabilirim?",
  "bot_id": "your-bot-id",
  "bot_name": "Nature Bot V3",
  "timestamp": "2026-05-11T12:00:00.000Z",
  "reply": "Merhaba! Size nasıl yardımcı olabilirim?",
  "conversation_id": "msg_1234567890_abc123"
}

bot › Merhaba! Size nasıl yardımcı olabilirim?
```

## ✅ Beklenen Sonuç

- ✅ "Şu an yanıt veremiyorum" hatası gitmeli
- ✅ Bot normal yanıt vermeli
- ✅ Backend `/api/agent/message` endpoint'i çalışmalı
- ✅ Debug logları request/response göstermeli

## 🔍 Backend Endpoint Detayları

**Endpoint:** `POST /api/agent/message`

**Request:**
```json
{
  "message": "hello",
  "user_id": "cli-user",
  "bot_id": "optional"
}
```

**Response:**
```json
{
  "success": true,
  "message_id": "msg_xxx",
  "response": "Hello! How can I help?",
  "bot_id": "bot-uuid",
  "bot_name": "Bot Name",
  "timestamp": "2026-05-11T12:00:00.000Z"
}
```

**Backend Özellikleri:**
- OpenAI GPT-4o-mini kullanıyor
- Bot'un kendi system_prompt'unu kullanıyor
- API key SHA-256 hash ile doğrulanıyor
- Tüm mesajlar `agent_message_logs` tablosuna kaydediliyor
- Bot ownership kontrolü yapılıyor

## 📝 Notlar

- Custom AI provider desteği hala var (body'de `custom_provider`, `custom_api_key`, `model`)
- Debug logları aktif (production'da kaldırılabilir)
- conversation_id artık message_id olarak dönüyor
- Backend'de conversation history yok (her mesaj bağımsız)

## 🚀 Sonraki Adımlar (Opsiyonel)

1. Backend'e conversation history ekle
2. Backend'e tool calling desteği ekle
3. Debug loglarını production'da kapat
4. Rate limiting ekle
5. Streaming response desteği ekle
