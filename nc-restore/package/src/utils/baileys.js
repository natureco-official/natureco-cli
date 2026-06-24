let _makeWASocket, _useMultiFileAuthState, _DisconnectReason, _fetchLatestBaileysVersion, _Browsers;

function loadBaileys() {
  if (!_makeWASocket) {
    const baileys = require('@whiskeysockets/baileys');
    _makeWASocket = baileys.default;
    _useMultiFileAuthState = baileys.useMultiFileAuthState;
    _DisconnectReason = baileys.DisconnectReason;
    _fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    _Browsers = baileys.Browsers;
  }
  return {
    makeWASocket: _makeWASocket,
    useMultiFileAuthState: _useMultiFileAuthState,
    DisconnectReason: _DisconnectReason,
    fetchLatestBaileysVersion: _fetchLatestBaileysVersion,
    Browsers: _Browsers,
  };
}

module.exports = { loadBaileys };
