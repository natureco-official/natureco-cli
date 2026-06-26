const https = require('https');

async function microsoftGraph(params) {
  const { action, endpoint, method, body, userId, messageId, eventId, fileId, query } = params;

  const accessToken = process.env.MS_GRAPH_TOKEN || process.env.MICROSOFT_GRAPH_TOKEN;

  if (!accessToken) {
    return { success: false, error: 'MS_GRAPH_TOKEN ortam degiskeni gerekli. (az login + erisim tokeni alinmalidir)' };
  }

  function graphApi(method, path, body) {
    return new Promise((resolve) => {
      const url = 'https://graph.microsoft.com/v1.0' + path;
      const opts = { method, headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, timeout: 15000 };
      const req = https.request(url, opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', (e) => resolve({ status: 0, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'Timeout' }); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  if (action === 'send_email') {
    if (!params.to || !params.subject || !params.body) {
      return { success: false, error: 'to, subject, body gerekli' };
    }
    const emailBody = {
      message: {
        subject: params.subject,
        body: { contentType: 'Text', content: params.body },
        toRecipients: [{ emailAddress: { address: params.to } }],
      },
    };
    if (params.cc) emailBody.message.ccRecipients = [{ emailAddress: { address: params.cc } }];
    const res = await graphApi('POST', '/me/sendMail', emailBody);
    return { success: res.status === 202, message: 'Email gonderildi: ' + params.to, status: res.status, error: res.data?.error?.message };
  }

  if (action === 'list_emails') {
    const top = params.top || 10;
    const res = await graphApi('GET', `/me/messages?$top=${top}&$select=subject,from,receivedDateTime,isRead`);
    if (res.status !== 200) return { success: false, error: 'Graph API: ' + (res.data?.error?.message || res.status) };
    const emails = (res.data.value || []).map(m => ({
      id: m.id, subject: m.subject, from: m.from?.emailAddress?.address, receivedAt: m.receivedDateTime, isRead: m.isRead,
    }));
    return { success: true, count: emails.length, emails };
  }

  if (action === 'list_calendar_events') {
    const top = params.top || 10;
    const res = await graphApi('GET', `/me/events?$top=${top}&$select=subject,start,end,location`);
    if (res.status !== 200) return { success: false, error: 'Graph API: ' + (res.data?.error?.message || res.status) };
    const events = (res.data.value || []).map(e => ({
      id: e.id, subject: e.subject, start: e.start?.dateTime, end: e.end?.dateTime, location: e.location?.displayName,
    }));
    return { success: true, count: events.length, events };
  }

  if (action === 'list_files') {
    const res = await graphApi('GET', '/me/drive/root/children?$select=name,size,lastModifiedDateTime,folder');
    if (res.status !== 200) return { success: false, error: 'Graph API: ' + (res.data?.error?.message || res.status) };
    const files = (res.data.value || []).map(f => ({
      id: f.id, name: f.name, size: f.size, lastModified: f.lastModifiedDateTime, isFolder: !!f.folder,
    }));
    return { success: true, count: files.length, files };
  }

  if (action === 'custom') {
    if (!endpoint) return { success: false, error: 'endpoint gerekli (orn: /me/contacts)' };
    const res = await graphApi(method || 'GET', endpoint, body);
    return { success: res.status < 400, status: res.status, data: res.data, error: res.data?.error?.message };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (send_email, list_emails, list_calendar_events, list_files, custom)' };
}

module.exports = {
  name: 'microsoft_graph',
  description: 'Microsoft Graph API (Office 365): email gonder/Liste, takvim, dosyalar. MS_GRAPH_TOKEN ortam degiskeni gerekli.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'send_email, list_emails, list_calendar_events, list_files, custom', enum: ['send_email', 'list_emails', 'list_calendar_events', 'list_files', 'custom'] },
      to: { type: 'string', description: '(send_email) Alici email' },
      subject: { type: 'string', description: '(send_email) Konu' },
      body: { type: 'string', description: '(send_email) Icerik' },
      cc: { type: 'string', description: '(send_email) CC' },
      top: { type: 'number', description: 'Maksimum sonuc sayisi' },
      endpoint: { type: 'string', description: '(custom) Ozel Graph API endpoint (orn: /me/contacts)' },
      method: { type: 'string', description: '(custom) HTTP method (default: GET)' },
      query: { type: 'string', description: 'Arama sorgusu' },
    },
    required: ['action'],
  },
  async execute(params) { return await microsoftGraph(params); },
};
