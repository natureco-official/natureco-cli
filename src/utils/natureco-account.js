/**
 * NatureCo Hesabı (SSO) — tek NatureCo hesabı, ekosistem geneli.
 * natureco.me Supabase Auth üstünde, bağımlılıksız (Supabase REST + global fetch).
 * Bu, developers.natureco.me API-KEY girişinden (config.json) AYRIDIR:
 *   - API key  → bot/otomasyon API'si (config.json)
 *   - Hesap    → kişi kimliği / SSO (auth.json)  ← bu dosya
 * natureco-sdk'daki NatureCoAuth ile aynı protokol (paylaşılan auth.json).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// natureco.me kimlik projesi — anon key PUBLIC (client'lara gömülür, gizli değil)
const SUPABASE_URL = process.env.NATURECO_SUPABASE_URL || 'https://mxnlehflfkesasclcldy.supabase.co';
const SUPABASE_ANON = process.env.NATURECO_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14bmxlaGZsZmtlc2FzY2xjbGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDA5MzEsImV4cCI6MjA5MjIxNjkzMX0.93aPOg6bVmgFaJvsM5jVZwiX2TTuFIyAzhP6BlhBkGU';
const AUTH_BASE = `${SUPABASE_URL}/auth/v1`;

function authFile() {
  return path.join(os.homedir(), '.natureco', 'auth.json');
}

function loadSession() {
  try { return JSON.parse(fs.readFileSync(authFile(), 'utf8')); } catch (_) { return null; }
}

function saveSession(session) {
  const file = authFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(session, null, 2));
  try { fs.chmodSync(file, 0o600); } catch (_) {}
  return session;
}

function clearSession() {
  try { fs.unlinkSync(authFile()); } catch (_) {}
}

async function _post(pathname, body, accessToken) {
  const headers = { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${AUTH_BASE}${pathname}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.error || `Auth hatası (${res.status})`;
    const err = new Error(msg); err.statusCode = res.status; throw err;
  }
  return data;
}

function _shape(s) {
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    token_type: s.token_type || 'bearer',
    expires_at: s.expires_at || (s.expires_in ? Math.floor(Date.now() / 1000) + s.expires_in : null),
    user: s.user ? { id: s.user.id, email: s.user.email } : null,
  };
}

/** E-posta + şifre ile giriş */
async function loginWithPassword(email, password) {
  return saveSession(_shape(await _post('/token?grant_type=password', { email, password })));
}

/** Şifresiz: e-postaya OTP kodu gönder (mevcut hesap; kayıt açmaz) */
async function sendOtp(email) {
  await _post('/otp', { email, create_user: false });
  return { sent: true, email };
}

/**
 * OTP kodunu doğrula → oturum. Supabase'de e-postayla gelen kodun doğrulama tipi
 * şablona göre 'email' ya da 'magiclink' olabilir → ikisini de dener.
 */
async function verifyOtp(email, token) {
  const code = String(token).replace(/\s+/g, '');
  try {
    return saveSession(_shape(await _post('/verify', { type: 'email', email, token: code })));
  } catch (e1) {
    try {
      return saveSession(_shape(await _post('/verify', { type: 'magiclink', email, token: code })));
    } catch (_) {
      throw e1;
    }
  }
}

// JWT access_token içinden kullanıcıyı çöz (imza doğrulaması yok — sadece görüntüleme)
function _userFromJwt(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    return { id: p.sub, email: p.email };
  } catch (_) { return null; }
}

/**
 * E-postadan gelen GİRİŞ LİNKİ'ni işle (şablon 6 haneli kod yerine magic link
 * gönderdiğinde). İki biçim:
 *   1) Implicit: link fragment'inde ZATEN access_token+refresh_token var → doğrudan oturum.
 *   2) token_hash: /verify ile doğrula.
 */
async function verifyLink(link) {
  let u;
  try { u = new URL(link.trim()); }
  catch (e) { throw new Error('Geçersiz link', { cause: e }); }
  const q = u.searchParams;
  const frag = new URLSearchParams((u.hash || '').replace(/^#/, ''));
  const pick = (k) => frag.get(k) || q.get(k);

  const access_token = pick('access_token');
  if (access_token) {
    return saveSession(_shape({
      access_token,
      refresh_token: pick('refresh_token'),
      token_type: pick('token_type') || 'bearer',
      expires_at: parseInt(pick('expires_at') || '0', 10) || null,
      expires_in: parseInt(pick('expires_in') || '0', 10) || null,
      user: _userFromJwt(access_token),
    }));
  }
  const token_hash = pick('token_hash') || pick('token');
  const type = pick('type') || 'magiclink';
  if (!token_hash) throw new Error("Linkte doğrulama token'ı bulunamadı");
  return saveSession(_shape(await _post('/verify', { type, token_hash })));
}

/** Access token yenile */
async function refresh() {
  const s = loadSession();
  if (!s || !s.refresh_token) { const e = new Error('Oturum yok'); e.statusCode = 401; throw e; }
  return saveSession(_shape(await _post('/token?grant_type=refresh_token', { refresh_token: s.refresh_token })));
}

/** Geçerli (gerekirse yenilenmiş) access token, yoksa null */
async function getAccessToken() {
  let s = loadSession();
  if (!s) return null;
  if (s.expires_at && Date.now() / 1000 > s.expires_at - 60) {
    try { s = await refresh(); } catch (_) { return null; }
  }
  return s ? s.access_token : null;
}

/** Giriş yapan kullanıcı ({ id, email, ... }) veya null */
async function whoami() {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${AUTH_BASE}/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

function isLoggedIn() {
  const s = loadSession();
  return !!(s && s.access_token);
}

function currentEmail() {
  const s = loadSession();
  return s && s.user ? s.user.email : null;
}

function logout() { clearSession(); }

module.exports = {
  loginWithPassword, sendOtp, verifyOtp, verifyLink, refresh,
  getAccessToken, whoami, isLoggedIn, currentEmail, logout,
  SUPABASE_URL,
};
