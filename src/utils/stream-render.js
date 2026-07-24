'use strict';

const { renderMarkdown } = require('./render');

const ERASE_LINE = '\r\x1b[2K';
const CURSOR_UP = '\x1b[1A';

function outputSupportsRepaint(output, options) {
  const isTTY = options.isTTY ?? output.isTTY;
  return Boolean(isTTY) &&
    options.color !== false &&
    process.env.NO_COLOR === undefined &&
    process.env.FORCE_COLOR !== '0';
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
  const render = options.render || renderMarkdown;
  const repaint = outputSupportsRepaint(output, options);
  const renderOptions = options.renderOptions || {};
  let raw = '';
  let committedBoundary = 0;
  let committedRendered = '';
  let activeRendered = '';
  let ended = false;
  let commitCount = 0;

  function write(value) {
    if (value) output.write(value);
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

  function event(item) {
    if (item?.type === 'text_delta') push(item.text);
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
  createStreamWriter,
  stableMarkdownBoundary,
};
