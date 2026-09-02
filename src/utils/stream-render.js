'use strict';

const { renderMarkdown } = require('./render');
const tui = require('./tui');

const ERASE_LINE = '\r\x1b[2K';
const CURSOR_UP = '\x1b[1A';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function outputSupportsRepaint(output, options) {
  const isTTY = options.isTTY ?? output.isTTY;
  return Boolean(isTTY) &&
    options.color !== false &&
    process.env.NO_COLOR === undefined &&
    process.env.FORCE_COLOR !== '0';
}

function tokenValue(usage, names, fallback = 0) {
  for (const name of names) {
    if (usage?.[name] !== undefined) return Math.max(0, Math.round(Number(usage[name]) || 0));
  }
  return Math.max(0, Math.round(Number(fallback) || 0));
}

function formatStatusLine(status = {}, options = {}) {
  const usage = status.usage || status;
  const input = tokenValue(usage, ['prompt_tokens', 'input_tokens', 'input'], status.inputTokens);
  const output = tokenValue(usage, ['completion_tokens', 'output_tokens', 'output'], status.outputTokens);
  const elapsed = Math.max(0, Math.floor(Number(
    status.elapsedSeconds ?? status.elapsed ?? 0
  ) || 0));
  const model = String(status.model || '');
  const plain = `${model} · ${input}↑/${output}↓ · ${elapsed}s`;
  const styled = typeof options.style === 'function' ? options.style(plain) : plain;
  const width = options.width ?? process.stdout.columns ?? 80;
  return tui.truncateAnsi(styled, width);
}

/**
 * Turn-scoped terminal effects. All transient output and committed cards/text
 * pass through this object, so a spinner tick cannot bisect another write.
 */
function createPresentationWriter(options = {}) {
  const output = options.output || process.stdout;
  const enabled = outputSupportsRepaint(output, options);
  const scheduler = options.scheduler || {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: timer => clearInterval(timer),
  };
  const writeOutput = options.write || (value => output.write(value));
  const now = options.now || Date.now;
  const interval = options.interval ?? 80;
  const frames = options.frames || SPINNER_FRAMES;
  const startedAt = options.startedAt ?? now();
  const status = {
    model: options.model || '',
    inputTokens: options.inputTokens || 0,
    outputTokens: options.outputTokens || 0,
    elapsedSeconds: 0,
  };
  const spinners = new Map();
  let nextSpinnerId = 0;
  let frame = 0;
  let timer = null;
  let transientVisible = false;
  let cursorHidden = false;
  let disposed = false;

  function emit(value) {
    if (value) writeOutput(String(value));
  }

  function clearTransient() {
    if (!enabled || !transientVisible) return;
    emit(ERASE_LINE);
    transientVisible = false;
  }

  function currentSpinner() {
    const values = Array.from(spinners.values());
    return values.length ? values[values.length - 1] : null;
  }

  function renderTransient() {
    if (!enabled || disposed) return;
    status.elapsedSeconds = Math.max(0, Math.floor((now() - startedAt) / 1000));
    const estimate = typeof options.getEstimate === 'function' ? options.getEstimate() : null;
    if (estimate) {
      if (status.usage === undefined && estimate.inputTokens !== undefined) {
        status.inputTokens = estimate.inputTokens;
      }
      if (status.usage === undefined && estimate.outputTokens !== undefined) {
        status.outputTokens = estimate.outputTokens;
      }
    }
    const spinner = currentSpinner();
    const statusText = formatStatusLine(status, {
      width: Math.max(1, (options.width ?? output.columns ?? 80) - (spinner ? 4 : 0)),
      style: options.statusStyle || (text => tui.C.muted(text)),
    });
    const spinnerText = spinner ? `${frames[frame % frames.length]} ${spinner} · ` : '';
    const line = tui.truncateAnsi(
      (spinner ? (options.spinnerStyle || (text => tui.C.sky(text)))(spinnerText) : '') + statusText,
      options.width ?? output.columns ?? 80,
    );
    emit(ERASE_LINE + line);
    transientVisible = true;
    frame++;
  }

  function ensureTimer() {
    if (!enabled || disposed || timer) return;
    timer = scheduler.setInterval(renderTransient, interval);
  }

  function updateStatus(update = {}) {
    if (!enabled || disposed) return;
    if (update.usage === null) delete status.usage;
    else if (update.usage) status.usage = { ...(status.usage || {}), ...update.usage };
    if (update.model !== undefined) status.model = update.model;
    if (update.inputTokens !== undefined) status.inputTokens = update.inputTokens;
    if (update.outputTokens !== undefined) status.outputTokens = update.outputTokens;
    if (update.elapsedSeconds !== undefined) status.elapsedSeconds = update.elapsedSeconds;
    ensureTimer();
    renderTransient();
  }

  function startSpinner(label) {
    if (!enabled || disposed) return { stop() {} };
    const id = ++nextSpinnerId;
    spinners.set(id, String(label || ''));
    if (!cursorHidden) {
      emit(CURSOR_HIDE);
      cursorHidden = true;
    }
    ensureTimer();
    renderTransient();
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        spinners.delete(id);
        if (spinners.size === 0 && cursorHidden) {
          emit(CURSOR_SHOW);
          cursorHidden = false;
        }
        renderTransient();
      },
    };
  }

  function writeCommitted(value) {
    if (disposed) {
      if (value) emit(value);
      return;
    }
    clearTransient();
    emit(value);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) {
      scheduler.clearInterval(timer);
      timer = null;
    }
    spinners.clear();
    clearTransient();
    // Always restore the cursor on a capable terminal, even if a caller failed
    // between hiding it and recording spinner state.
    if (enabled) emit(CURSOR_SHOW);
    cursorHidden = false;
  }

  if (options.status !== false && enabled) {
    ensureTimer();
    renderTransient();
  }

  return {
    startSpinner,
    stopSpinner(handle) { handle?.stop?.(); },
    updateStatus,
    writeCommitted,
    clearTransient,
    dispose,
    get isEnabled() { return enabled; },
    get isDisposed() { return disposed; },
    get hasTimer() { return timer !== null; },
  };
}

function stableMarkdownBoundary(source) {
  let inFence = false;
  let fenceChar = '';
  let fenceSize = 0;
  let lastStable = 0;
  let offset = 0;

  for (const lineWithEnd of source.match(/[^\n]*(?:\n|$)/g) || []) {
    if (!lineWithEnd) continue;
    const line = lineWithEnd.endsWith('\n') ? lineWithEnd.slice(0, -1) : lineWithEnd;
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
        fenceSize = fence[1].length;
      } else if (fence[1][0] === fenceChar && fence[1].length >= fenceSize &&
                 line.slice(fence[0].length).trim() === '') {
        inFence = false;
        lastStable = offset + lineWithEnd.length;
      }
    } else if (!inFence && line.trim() === '' && lineWithEnd.endsWith('\n')) {
      lastStable = offset + lineWithEnd.length;
    }
    offset += lineWithEnd.length;
  }
  return lastStable;
}

function createStreamWriter(options = {}) {
  const output = options.output || process.stdout;
  const presentation = options.presentation;
  const render = options.render || renderMarkdown;
  const repaint = outputSupportsRepaint(output, options);
  const renderOptions = options.renderOptions || {};
  let raw = '';
  let committedBoundary = 0;
  let committedRendered = '';
  let activeRendered = '';
  let ended = false;
  /** Düşünme metni yazıldı mı — cevap başlarken ayırıcı koymak için. */
  let reasoningWritten = false;
  let commitCount = 0;

  function write(value) {
    if (!value) return;
    if (presentation) presentation.writeCommitted(value);
    else output.write(value);
  }

  function clearActive() {
    if (!activeRendered) return;
    const plain = activeRendered.replace(/\x1b\[[0-9;]*m/g, '');
    const newlines = (plain.match(/\n/g) || []).length;
    const beginsBelowCommitted = plain.startsWith('\n');
    const upwardClears = Math.max(0, newlines - (beginsBelowCommitted ? 1 : 0));
    write(ERASE_LINE);
    for (let index = 0; index < upwardClears; index++) write(CURSOR_UP + ERASE_LINE);
    if (beginsBelowCommitted) write(CURSOR_UP + '\r');
    activeRendered = '';
  }

  function renderedSuffix(full, prefix) {
    return full.startsWith(prefix) ? full.slice(prefix.length) : null;
  }

  function repaintFrom(boundary, allowCommit) {
    const fullRendered = render(raw, renderOptions);
    const stableRaw = raw.slice(0, boundary);
    const stableRendered = render(stableRaw, renderOptions);
    const stableAppend = renderedSuffix(stableRendered, committedRendered);
    const active = renderedSuffix(fullRendered, stableRendered);

    if (stableAppend === null || active === null) {
      clearActive();
      activeRendered = renderedSuffix(fullRendered, committedRendered) ?? fullRendered;
      write(activeRendered);
      return;
    }

    clearActive();
    if (allowCommit && boundary > committedBoundary) {
      write(stableAppend);
      if (typeof options.onCommit === 'function') options.onCommit(stableAppend);
      committedBoundary = boundary;
      committedRendered = stableRendered;
      commitCount++;
    }
    activeRendered = active;
    write(activeRendered);
  }

  function push(text) {
    if (ended) throw new Error('Cannot write after stream end');
    const delta = String(text ?? '');
    raw += delta;
    if (!repaint) {
      write(delta);
      return;
    }
    const boundary = stableMarkdownBoundary(raw);
    repaintFrom(boundary, true);
  }

  /**
   * Düşünme (reasoning) metnini soluk renkte akıtır.
   *
   * NEDEN AYRI: düşünen modeller cevabı `delta.content`, düşünme metnini ise
   * `delta.reasoning` / `reasoning_content` alanında yollar. Bu alan uzun süre
   * hiç ÇİZİLMİYORDU: çıkarma yapılıp `reasoning_delta` olayı yayılıyor ama
   * tüketen kimse olmadığı için model düşündüğü sürece ekran BOŞ kalıyordu —
   * kullanıcıya araç donmuş gibi görünüyor. Ölçüldü: bir sağlayıcıda 41
   * parçanın tamamı `reasoning` alanındaydı, `content` hiç gelmedi.
   *
   * `raw`'a YAZILMAZ: düşünme metni cevabın parçası değil; oraya karışsaydı
   * markdown çizimini ve kaydedilen yanıtı kirletirdi.
   */
  function reasoning(text) {
    if (ended) return;
    const delta = String(text ?? '');
    if (!delta || raw.length > 0) return; // cevap başladıysa artık düşünme yazma
    reasoningWritten = true;
    write(tui.C.muted(delta));
  }

  function event(item) {
    if (item?.type === 'reasoning_delta') reasoning(item.text);
    if (item?.type === 'text_delta') {
      // Düşünme yazıldıysa cevabı temiz bir satırdan başlat.
      if (reasoningWritten && raw.length === 0) { write('\n\n'); reasoningWritten = false; }
      push(item.text);
    }
    if (item?.type === 'done') end();
  }

  function end() {
    if (ended) return raw;
    ended = true;
    if (repaint) {
      const finalRendered = render(raw, renderOptions);
      clearActive();
      const suffix = renderedSuffix(finalRendered, committedRendered);
      const finalAppend = suffix === null ? finalRendered : suffix;
      write(finalAppend);
      if (typeof options.onCommit === 'function') options.onCommit(finalAppend);
      committedRendered = finalRendered;
      committedBoundary = raw.length;
    }
    return raw;
  }

  return {
    push,
    event,
    end,
    getRaw: () => raw,
    getCommittedRendered: () => committedRendered,
    get commitCount() { return commitCount; },
    get isRepainting() { return repaint; },
  };
}

module.exports = {
  createPresentationWriter,
  createStreamWriter,
  formatStatusLine,
  stableMarkdownBoundary,
  _sequences: {
    ERASE_LINE,
    CURSOR_HIDE,
    CURSOR_SHOW,
  },
};
