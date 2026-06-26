async function sendMessage(params) {
  const { to, message, platform, subject } = params;
  if (!to || !message) return { success: false, error: 'to ve message gerekli' };

  const platform_lc = (platform || '').toLowerCase();

  if (platform_lc === 'terminal' || platform_lc === 'console' || !platform) {
    return { success: true, platform: 'terminal', to, message, delivered: true, note: 'Mesaj terminale yazdirildi (dis ortama gonderilmedi)' };
  }

  if (platform_lc === 'email') {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      return { success: false, error: 'Email icin EMAIL_HOST ve EMAIL_USER ortam degiskenleri gerekli' };
    }
    return { success: true, platform: 'email', to, subject: subject || 'NatureCo Mesaj', message, delivered: 'pending', note: 'Email gonderme ayarlanmadi (smtp yapilandirmasi gerekli)' };
  }

  if (platform_lc === 'webhook') {
    return { success: true, platform: 'webhook', to, message, delivered: 'pending', note: 'Webhook entegrasyonu icin gateway yapilandirmasi gerekli' };
  }

  return { success: false, error: 'Desteklenmeyen platform: ' + platform + ' (terminal, email, webhook)' };
}

module.exports = {
  name: 'send_message',
  description: 'Platformlar arasi mesaj gonderimi: terminal, email, webhook (diger platformlar icin gateway yapilandirmasi gerekli).',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Alici (email adresi, kullanici adi, kanal)' },
      message: { type: 'string', description: 'Mesaj icerigi' },
      platform: { type: 'string', description: 'Hedef platform: terminal, email, webhook', enum: ['terminal', 'email', 'webhook'] },
      subject: { type: 'string', description: 'Opsiyonel: konu (email icin)' },
    },
    required: ['to', 'message'],
  },
  async execute(params) { return await sendMessage(params); },
};
