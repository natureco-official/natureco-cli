const https = require('https');

async function spotify(params) {
  const { action, query, trackId, deviceId, volumePercent, clientId, clientSecret } = params;

  const cid = clientId || process.env.SPOTIFY_CLIENT_ID;
  const csecret = clientSecret || process.env.SPOTIFY_CLIENT_SECRET;

  if (!cid || !csecret) {
    return { success: false, error: 'SPOTIFY_CLIENT_ID ve SPOTIFY_CLIENT_SECRET ortam degiskenleri gerekli' };
  }

  async function getToken() {
    const auth = Buffer.from(cid + ':' + csecret).toString('base64');
    return new Promise((resolve) => {
      const data = 'grant_type=client_credentials';
      const req = https.request('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
        timeout: 10000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body).access_token); } catch { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.write(data);
      req.end();
    });
  }

  function spotifyApi(method, path, token, body) {
    return new Promise((resolve) => {
      const opts = { hostname: 'api.spotify.com', path, method, headers: { 'Authorization': 'Bearer ' + token }, timeout: 10000 };
      const req = https.request(opts, (res) => {
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

  const token = await getToken();
  if (!token) return { success: false, error: 'Spotify token alinamadi' };

  if (action === 'search') {
    if (!query) return { success: false, error: 'query gerekli' };
    const res = await spotifyApi('GET', '/v1/search?q=' + encodeURIComponent(query) + '&type=track,album,artist&limit=10', token);
    if (res.status !== 200) return { success: false, error: 'Spotify API: ' + (res.data?.error?.message || res.status) };
    return { success: true, query, tracks: res.data.tracks?.items?.map(t => ({ id: t.id, name: t.name, artist: t.artists?.map(a => a.name).join(', '), album: t.album?.name, url: t.external_urls?.spotify })) || [],
      albums: res.data.albums?.items?.map(a => ({ id: a.id, name: a.name, artist: a.artists?.map(a => a.name).join(', ') })) || [] };
  }

  if (action === 'get_track') {
    if (!trackId) return { success: false, error: 'trackId gerekli' };
    const res = await spotifyApi('GET', '/v1/tracks/' + trackId, token);
    if (res.status !== 200) return { success: false, error: 'Spotify API: ' + (res.data?.error?.message || res.status) };
    const t = res.data;
    return { success: true, track: { id: t.id, name: t.name, artist: t.artists?.map(a => a.name).join(', '), album: t.album?.name, duration: t.duration_ms, url: t.external_urls?.spotify, preview: t.preview_url } };
  }

  if (action === 'play' || action === 'pause' || action === 'next' || action === 'previous') {
    return { success: true, action, note: 'Playback kontrolu Spotify Premium + cihaz auth gerektirir. Token tipi "client_credentials" yetmez. "authorization_code" flow gerekli.' };
  }

  return { success: false, error: 'Gecersiz action: ' + action + ' (search, get_track, play, pause, next, previous)' };
}

module.exports = {
  name: 'spotify',
  description: 'Spotify arama ve bilgi alma. SPOTIFY_CLIENT_ID ve SPOTIFY_CLIENT_SECRET ortam degiskenleri gerekli.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'search, get_track, play, pause, next, previous', enum: ['search', 'get_track', 'play', 'pause', 'next', 'previous'] },
      query: { type: 'string', description: '(search) Arama sorgusu' },
      trackId: { type: 'string', description: '(get_track) Spotify track ID' },
      deviceId: { type: 'string', description: '(play/pause) Cihaz ID' },
      volumePercent: { type: 'number', description: 'Ses seviyesi (0-100)' },
      clientId: { type: 'string', description: 'Spotify Client ID (default: SPOTIFY_CLIENT_ID env)' },
      clientSecret: { type: 'string', description: 'Spotify Client Secret (default: SPOTIFY_CLIENT_SECRET env)' },
    },
    required: ['action'],
  },
  async execute(params) { return await spotify(params); },
};
