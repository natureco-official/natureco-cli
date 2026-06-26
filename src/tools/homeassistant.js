const https = require('https');

async function homeassistant(params) {
  const { action, entityId, domain, service, data, state, attributes } = params;

  const baseUrl = process.env.HASS_URL || process.env.HOME_ASSISTANT_URL;
  const token = process.env.HASS_TOKEN || process.env.HOME_ASSISTANT_TOKEN;

  if (!baseUrl || !token) {
    return { success: false, error: 'HASS_URL ve HASS_TOKEN ortam degiskenleri gerekli (orn: http://homeassistant.local:8123)' };
  }

  const apiUrl = baseUrl.replace(/\/+$/, '') + '/api';

  function hassApi(method, path, body) {
    return new Promise((resolve) => {
      const url = apiUrl + path;
      const opts = { method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, timeout: 10000 };
      const req = https.request(url, opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', (e) => resolve({ status: 0, error: e.message }));
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  if (action === 'get_states') {
    const res = await hassApi('GET', '/states');
    if (res.status !== 200) return { success: false, error: 'Home Assistant API: ' + (res.data?.message || res.status) };
    const entities = (Array.isArray(res.data) ? res.data : []).map(e => ({
      entityId: e.entity_id, state: e.state,
      friendlyName: e.attributes?.friendly_name,
      lastChanged: e.last_changed,
    }));
    return { success: true, count: entities.length, entities };
  }

  if (action === 'get_state') {
    if (!entityId) return { success: false, error: 'entityId gerekli' };
    const res = await hassApi('GET', '/states/' + entityId);
    if (res.status !== 200) return { success: false, error: 'Entity bulunamadi: ' + entityId };
    return { success: true, entityId, state: res.data.state, attributes: res.data.attributes, lastChanged: res.data.last_changed };
  }

  if (action === 'call_service') {
    if (!domain || !service) return { success: false, error: 'domain ve service gerekli' };
    const res = await hassApi('POST', '/services/' + domain + '/' + service, data || {});
    return { success: res.status === 200, domain, service, status: res.status, result: res.data, entityId };
  }

  if (action === 'set_state') {
    if (!entityId) return { success: false, error: 'entityId gerekli' };
    const body = { state: state || 'on' };
    if (attributes) body.attributes = attributes;
    const res = await hassApi('POST', '/states/' + entityId, body);
    return { success: res.status === 200, entityId, state: res.data?.state, attributes: res.data?.attributes };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (get_states, get_state, call_service, set_state)' };
}

module.exports = {
  name: 'homeassistant',
  description: 'Home Assistant akilli ev kontrolu: get_states/get_state/call_service/set_state. HASS_URL ve HASS_TOKEN ortam degiskenleri gerekli.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'get_states, get_state, call_service, set_state', enum: ['get_states', 'get_state', 'call_service', 'set_state'] },
      entityId: { type: 'string', description: 'Entity ID (orn: light.living_room)' },
      domain: { type: 'string', description: '(call_service) Domain (orn: light, switch, climate)' },
      service: { type: 'string', description: '(call_service) Service (orn: turn_on, turn_off)' },
      data: { type: 'object', description: '(call_service) Servis verisi' },
      state: { type: 'string', description: '(set_state) Yeni state' },
      attributes: { type: 'object', description: '(set_state) Opsiyonel attribute' },
    },
    required: ['action'],
  },
  async execute(params) { return await homeassistant(params); },
};
