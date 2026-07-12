/**
 * Top-level process error handlers.
 *
 * Node's default behavior for unhandled rejections is to print a deprecated
 * warning and (since Node 15) exit with code 1. The default for uncaught
 * exceptions is to print the stack and exit 1. Both bypass natureco's audit
 * trail and dump raw Node output that's useless to a CLI user.
 *
 * `install({ audit, exit, stderr })` registers handlers that:
 *   1. Append a structured entry to the audit log (synchronous — the
 *      process is about to die, async fire-and-forget would race),
 *   2. Print a single friendly Turkish line + log path to stderr,
 *   3. Exit with code 1 (configurable via `exit` for tests).
 *
 * Idempotent: a second call replaces the previous handlers (so the test
 * suite can re-install with fresh spies).
 */
const path = require('path');
const os = require('os');

const ERROR_LOG_PATH = path.join(os.homedir(), '.natureco', 'logs', 'crash.log');

let _installed = false;
let _registered = { rejection: null, exception: null, streamError: null };

function _removeRegisteredHandlers() {
  if (_registered.rejection) process.off('unhandledRejection', _registered.rejection);
  if (_registered.exception) process.off('uncaughtException', _registered.exception);
  if (_registered.streamError) {
    process.stdout.off('error', _registered.streamError);
    process.stderr.off('error', _registered.streamError);
  }
  _registered = { rejection: null, exception: null, streamError: null };
}

function _defaultAudit() {
  try {
    return require('./audit');
  } catch {
    return null;
  }
}

function _serializeError(err) {
  if (!err) return { type: 'unknown', message: 'null' };
  if (err instanceof Error) {
    return {
      type: err.constructor.name,
      message: err.message,
      stack: err.stack ? err.stack.split('\n').slice(0, 20).join('\n') : null,
      code: err.code,
    };
  }
  if (typeof err === 'object') {
    try { return { type: 'object', message: JSON.stringify(err).slice(0, 1000) }; }
    catch { return { type: 'object', message: String(err) }; }
  }
  return { type: typeof err, message: String(err) };
}

/**
 * Install global handlers. Returns an `uninstall()` function.
 *
 * @param {{
 *   audit?: { logSync: Function, ACTIONS?: Record<string,string> } | null,
 *   exit?: (code: number) => void,
 *   stderr?: (msg: string) => void,
 * }} [opts]
 */
function install(opts = {}) {
  const audit = opts.audit === undefined ? _defaultAudit() : opts.audit;
  const exit = opts.exit || ((code) => process.exit(code));
  const stderr = opts.stderr || ((msg) => process.stderr.write(msg));

  // Replace any previous handlers (idempotency for tests).
  _removeRegisteredHandlers();

  const onRejection = (reason) => {
    const payload = { kind: 'unhandledRejection', error: _serializeError(reason) };
    try { audit?.logSync('error', payload); } catch { /* ignore */ }
    if (process.env.NATURECO_DEBUG) {
      stderr(`\n[DEBUG] stack:\n${payload.error.stack || '(stack yok)'}\n`);
    }
    stderr(
      `\n  ✗ Beklenmedik bir hata oluştu (unhandled promise rejection).\n` +
      `    Detay: ${payload.error.message}\n` +
      `    Log: ${ERROR_LOG_PATH}\n` +
      `    Hata raporu için: github.com/natureco-official/natureco-cli/issues\n\n`,
    );
    exit(1);
  };

  const onException = (err) => {
    // EPIPE: çıktı bir boruya aktarılırken okuyucu kapandı (ör. `natureco help | head`).
    // Hata değil, normal akış — sessizce başarıyla çık.
    if (err && err.code === 'EPIPE') { exit(0); return; }
    const payload = { kind: 'uncaughtException', error: _serializeError(err) };
    try { audit?.logSync('error', payload); } catch { /* ignore */ }
    stderr(
      `\n  ✗ Beklenmedik bir hata oluştu (uncaught exception).\n` +
      `    Detay: ${payload.error.message}\n` +
      `    Log: ${ERROR_LOG_PATH}\n` +
      `    Hata raporu için: github.com/natureco-official/natureco-cli/issues\n\n`,
    );
    exit(1);
  };

  // Akış seviyesinde EPIPE — stdout/stderr 'error' olayı uncaughtException'a
  // dönüşmeden önce yakala (Node bazı platformlarda stream error olarak verir)
  const onStreamError = (err) => {
    if (err && err.code === 'EPIPE') exit(0);
  };
  process.stdout.on('error', onStreamError);
  process.stderr.on('error', onStreamError);

  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  _registered = { rejection: onRejection, exception: onException, streamError: onStreamError };
  _installed = true;

  return function uninstall() {
    _removeRegisteredHandlers();
    _installed = false;
  };
}

function isInstalled() {
  return _installed;
}

module.exports = {
  install,
  isInstalled,
  ERROR_LOG_PATH,
  _internals: { _serializeError },
};
