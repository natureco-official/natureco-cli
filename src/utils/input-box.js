'use strict';

const readline = require('readline');
const tui = require('./tui');

const ESC = '\x1b';
const CSI = `${ESC}[`;
const MIN_BOX_COLUMNS = 20;
const MAX_BOX_WIDTH = 100;
const transports = new WeakMap();

function canUseInputBox({ stdin = process.stdin, stdout = process.stdout, env = process.env } = {}) {
  const columns = Number(stdout?.columns);
  return Boolean(
    stdin?.isTTY
    && stdout?.isTTY
    && Number.isFinite(columns)
    && columns >= MIN_BOX_COLUMNS
    && env?.NATURECO_PLAIN_INPUT !== '1'
  );
}

function segmentGraphemes(value) {
  const text = String(value ?? '');
  if (typeof Intl?.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), part => part.segment);
  }
  return Array.from(text);
}

function graphemeWidth(value) {
  return tui.stringWidth(String(value));
}

function createTextModel(initialValue = '') {
  const graphemes = segmentGraphemes(initialValue);
  return {
    graphemes,
    cursor: graphemes.length,
  };
}

function modelValue(model) {
  return model.graphemes.join('');
}

function replaceModel(model, value) {
  model.graphemes = segmentGraphemes(value);
  model.cursor = model.graphemes.length;
  return model;
}

function insertIntoModel(model, value) {
  const inserted = segmentGraphemes(value);
  if (inserted.length === 0) return model;
  model.graphemes.splice(model.cursor, 0, ...inserted);
  model.cursor += inserted.length;
  return model;
}

function wrapGraphemes(graphemes, cursor, width) {
  const safeWidth = Math.max(1, Math.floor(width));
  const rows = [[]];
  const rowWidths = [0];
  const positions = new Array(graphemes.length + 1);

  for (let index = 0; index < graphemes.length; index++) {
    const token = graphemes[index];
    const tokenWidth = Math.max(0, graphemeWidth(token));
    let row = rows.length - 1;
    if (rowWidths[row] > 0 && rowWidths[row] + tokenWidth > safeWidth) {
      rows.push([]);
      rowWidths.push(0);
      row++;
    }
    positions[index] = { row, col: rowWidths[row] };
    rows[row].push(token);
    rowWidths[row] += tokenWidth;
  }

  const lastRow = rows.length - 1;
  positions[graphemes.length] = { row: lastRow, col: rowWidths[lastRow] };
  return {
    rows: rows.map(row => row.join('')),
    widths: rowWidths,
    cursor: positions[Math.max(0, Math.min(cursor, graphemes.length))],
  };
}

function viewportAroundCursor(graphemes, cursor, width) {
  const capacity = Math.max(0, Math.floor(width));
  let start = Math.max(0, Math.min(cursor, graphemes.length));
  let used = 0;

  while (start > 0) {
    const widthBefore = graphemeWidth(graphemes[start - 1]);
    if (used + widthBefore > capacity) break;
    start--;
    used += widthBefore;
  }

  let end = Math.max(start, cursor);
  while (end < graphemes.length) {
    const nextWidth = graphemeWidth(graphemes[end]);
    if (used + nextWidth > capacity) break;
    used += nextWidth;
    end++;
  }

  const beforeCursor = graphemes.slice(start, cursor).join('');
  return {
    text: graphemes.slice(start, end).join(''),
    cursorCol: graphemeWidth(beforeCursor),
    start,
    end,
  };
}

function ansiStyle(text, color, { bold = false, dim = false, enabled = true } = {}) {
  if (!enabled) return text;
  const [r, g, b] = tui.hexToRgb(color);
  const modes = [`38;2;${r};${g};${b}`];
  if (bold) modes.push('1');
  if (dim) modes.push('2');
  return `${CSI}${modes.join(';')}m${text}${CSI}0m`;
}

function renderFrame({
  model,
  columns,
  placeholder = '',
  color = true,
} = {}) {
  const measuredColumns = Number(columns);
  if (!Number.isFinite(measuredColumns) || measuredColumns < 4) {
    return {
      mode: 'suspended',
      lines: [],
      text: '',
      renderedRows: 0,
      cursorRow: 0,
      cursorCol: 0,
    };
  }

  if (measuredColumns < MIN_BOX_COLUMNS) {
    const viewWidth = Math.max(0, Math.floor(measuredColumns) - 3);
    const view = viewportAroundCursor(model.graphemes, model.cursor, viewWidth);
    const prompt = ansiStyle('› ', tui.PALETTE.primary, { bold: true, enabled: color });
    return {
      mode: 'narrow',
      lines: [`${prompt}${view.text}`],
      text: `${prompt}${view.text}`,
      renderedRows: 1,
      cursorRow: 0,
      cursorCol: 2 + view.cursorCol,
      width: Math.min(measuredColumns - 1, 2 + graphemeWidth(view.text)),
    };
  }

  const width = Math.min(Math.floor(measuredColumns) - 1, MAX_BOX_WIDTH);
  const contentWidth = Math.max(1, width - 6);
  const wrapped = wrapGraphemes(model.graphemes, model.cursor, contentWidth);
  const border = value => ansiStyle(value, tui.PALETTE.border, { enabled: color });
  const prompt = ansiStyle('› ', tui.PALETTE.primary, { bold: true, enabled: color });
  const empty = model.graphemes.length === 0;
  const rows = empty ? [''] : wrapped.rows;
  const rowWidths = empty ? [0] : wrapped.widths;
  const placeholderView = viewportAroundCursor(segmentGraphemes(placeholder), 0, contentWidth);
  const lines = [border(`╭${'─'.repeat(width - 2)}╮`)];

  for (let row = 0; row < rows.length; row++) {
    let visible = rows[row];
    if (empty && row === 0 && placeholder) {
      visible = ansiStyle(placeholderView.text, tui.PALETTE.muted, {
        dim: true,
        enabled: color,
      });
    }
    const rawWidth = empty ? graphemeWidth(placeholderView.text) : rowWidths[row];
    const rowPrompt = row === 0 ? prompt : '  ';
    lines.push(
      `${border('│')} ${rowPrompt}${visible}${' '.repeat(Math.max(0, contentWidth - rawWidth))} ${border('│')}`
    );
  }
  lines.push(border(`╰${'─'.repeat(width - 2)}╯`));

  return {
    mode: 'box',
    lines,
    text: lines.join('\r\n'),
    renderedRows: lines.length,
    cursorRow: 1 + (empty ? 0 : wrapped.cursor.row),
    cursorCol: 4 + (empty ? 0 : wrapped.cursor.col),
    width,
    contentWidth,
  };
}

function bootstrapKeypressTransport(input = process.stdin) {
  let state = transports.get(input);
  if (state) return state.api;

  readline.emitKeypressEvents(input);
  // Warm Node's decoder/data plumbing before any prompt snapshot is taken.
  // Node intentionally keeps this listener until a later data event observes
  // that there are no keypress listeners; the idle transport keeps stdin
  // paused, so this is the stable post-bootstrap baseline.
  const warmup = () => {};
  input.on('keypress', warmup);
  input.removeListener('keypress', warmup);
  input.pause?.();
  state = {
    active: null,
    priorListeners: [],
    disposed: false,
    api: null,
  };

  const api = {
    acquire(handler) {
      if (state.active) throw new Error('keypress transport already has an owner');
      state.disposed = false;
      state.priorListeners = input.listeners('keypress');
      for (const listener of state.priorListeners) input.removeListener('keypress', listener);
      state.active = handler;
      input.on('keypress', handler);
      input.resume?.();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (state.active === handler) {
          input.removeListener('keypress', handler);
          state.active = null;
          for (const listener of state.priorListeners) {
            if (!input.listeners('keypress').includes(listener)) input.on('keypress', listener);
          }
          state.priorListeners = [];
          input.pause?.();
        }
      };
    },
    dispose() {
      if (state.active) {
        input.removeListener('keypress', state.active);
        state.active = null;
      }
      for (const listener of state.priorListeners) {
        if (!input.listeners('keypress').includes(listener)) input.on('keypress', listener);
      }
      state.priorListeners = [];
      state.disposed = true;
      input.pause?.();
    },
    get active() {
      return state.active;
    },
  };
  state.api = api;
  transports.set(input, state);
  return api;
}

function getKeypressTransport(input = process.stdin) {
  return bootstrapKeypressTransport(input);
}

function eraseRendered(output, rendered) {
  if (!rendered || rendered.renderedRows < 1) {
    output.write('\r');
    return;
  }
  const down = rendered.renderedRows - 1 - rendered.cursorRow;
  if (down > 0) output.write(`${CSI}${down}B`);
  output.write('\r');
  for (let row = rendered.renderedRows - 1; row >= 0; row--) {
    output.write(`${CSI}2K`);
    if (row > 0) output.write(`${CSI}1A`);
  }
  output.write('\r');
}

function drawRendered(output, frame) {
  if (frame.renderedRows < 1) {
    output.write('\r');
    return;
  }
  output.write(frame.text);
  output.write('\r');
  const up = frame.renderedRows - 1 - frame.cursorRow;
  if (up > 0) output.write(`${CSI}${up}A`);
  if (frame.cursorCol > 0) output.write(`${CSI}${frame.cursorCol}C`);
}

function isEnterKey(key, sequence) {
  return key?.name === 'return'
    || key?.name === 'enter'
    || sequence === '\r'
    || sequence === '\n';
}

function isPrintableSequence(sequence) {
  return Boolean(sequence) && !/[\x00-\x1f\x7f]/.test(sequence);
}

function promptInput({
  stdin = process.stdin,
  stdout = process.stdout,
  env = process.env,
  history = [],
  placeholder = '',
  color = env?.NO_COLOR === undefined,
  getTranscript,
} = {}) {
  const transport = bootstrapKeypressTransport(stdin);
  const model = createTextModel();
  const compactHistory = history.filter((entry, index, entries) => (
    typeof entry === 'string' && entries.lastIndexOf(entry) === index
  ));
  history.splice(0, history.length, ...compactHistory);

  let rendered = null;
  let releaseOwner;
  let settled = false;
  let pasteMode = false;
  let historyIndex = history.length;
  let draft = '';
  let transcriptOpen = false;
  let transcriptExpanded = false;
  let transcriptOffset = Infinity;
  const priorRaw = Boolean(stdin.isRaw);

  return new Promise((resolve, reject) => {
    const redraw = () => {
      if (transcriptOpen) {
        renderTranscript();
        return;
      }
      const next = renderFrame({ model, columns: stdout.columns, placeholder, color });
      stdout.write(`${CSI}?25l`);
      eraseRendered(stdout, rendered);
      drawRendered(stdout, next);
      stdout.write(`${CSI}?25h`);
      rendered = next;
    };

    const transcriptLines = () => {
      const value = typeof getTranscript === 'function'
        ? getTranscript({ expanded: transcriptExpanded })
        : '';
      return String(value || 'No tool transcript yet.').split('\n');
    };

    const renderTranscript = () => {
      const rows = Math.max(6, Number(stdout.rows) || 24);
      const height = rows - 2;
      const lines = transcriptLines();
      const maximum = Math.max(0, lines.length - height);
      if (!Number.isFinite(transcriptOffset)) transcriptOffset = maximum;
      transcriptOffset = Math.max(0, Math.min(maximum, transcriptOffset));
      const page = lines.slice(transcriptOffset, transcriptOffset + height).join('\n');
      const mode = transcriptExpanded ? 'expanded' : 'compact';
      stdout.write(`${CSI}H${CSI}2J${page}`);
      stdout.write(`${CSI}${rows};1H${CSI}2K` +
        `Transcript (${mode}) · click a card: expand/collapse · ↑/↓/PgUp/PgDn · Ctrl+O/Esc: close`);
    };

    const openTranscript = () => {
      if (typeof getTranscript !== 'function') return;
      transcriptOpen = true;
      transcriptExpanded = false;
      transcriptOffset = Infinity;
      stdout.write(`${CSI}?1049h${CSI}?1000h${CSI}?1006h${CSI}?25l`);
      renderTranscript();
    };

    const closeTranscript = () => {
      if (!transcriptOpen) return;
      transcriptOpen = false;
      stdout.write(`${CSI}?1006l${CSI}?1000l${CSI}?1049l${CSI}?25h`);
    };

    const handleTranscriptMouse = sequence => {
      const mouse = String(sequence).match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
      if (!transcriptOpen || !mouse) return false;
      const button = Number(mouse[1]);
      if (button === 0 && mouse[4] === 'M') {
        const clickedLine = transcriptOffset + Math.max(0, Number(mouse[3]) - 1);
        getTranscript?.({ expanded: transcriptExpanded, toggleLine: clickedLine });
        renderTranscript();
      } else if (button === 64) {
        transcriptOffset -= 3;
        renderTranscript();
      } else if (button === 65) {
        transcriptOffset += 3;
        renderTranscript();
      }
      return true;
    };

    // readline's keypress decoder intentionally ignores terminal mouse packets
    // in several Node/terminal combinations. Observe only SGR mouse data here;
    // normal text remains exclusively owned by the keypress transport.
    const onRawMouse = chunk => {
      handleTranscriptMouse(Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
    };

    const cleanup = () => {
      let cleanupError;
      try {
        closeTranscript();
        stdout.write(`${CSI}?25l`);
        eraseRendered(stdout, rendered);
      } catch (error) {
        cleanupError = error;
      }
      try { stdout.removeListener?.('resize', onResize); } catch (error) { cleanupError ||= error; }
      try { stdin.removeListener?.('data', onRawMouse); } catch (error) { cleanupError ||= error; }
      try { releaseOwner?.(); } catch (error) { cleanupError ||= error; }
      try {
        if (typeof stdin.setRawMode === 'function') stdin.setRawMode(priorRaw);
      } catch (error) {
        cleanupError ||= error;
      }
      try { stdout.write(`${CSI}?2004l${CSI}?25h`); } catch (error) { cleanupError ||= error; }
      return cleanupError;
    };

    const settle = (error, value) => {
      if (settled) return;
      settled = true;
      const cleanupError = cleanup();
      if (error || cleanupError) reject(error || cleanupError);
      else resolve(value);
    };

    const failSafe = fn => (...args) => {
      if (settled) return;
      try {
        fn(...args);
      } catch (error) {
        settle(error);
      }
    };

    const changeHistory = direction => {
      if (history.length === 0) return;
      if (direction < 0) {
        if (historyIndex === history.length) draft = modelValue(model);
        if (historyIndex > 0) historyIndex--;
      } else {
        if (historyIndex >= history.length) return;
        historyIndex++;
      }
      replaceModel(model, historyIndex === history.length ? draft : history[historyIndex]);
      redraw();
    };

    const insertSequence = sequence => {
      let remaining = sequence;
      const explicitChunk = segmentGraphemes(
        remaining.replaceAll(`${ESC}[200~`, '').replaceAll(`${ESC}[201~`, '')
      ).length > 1;

      while (remaining.length > 0) {
        const start = remaining.indexOf(`${ESC}[200~`);
        const end = remaining.indexOf(`${ESC}[201~`);
        const markerIndex = [start, end].filter(index => index >= 0).sort((a, b) => a - b)[0];
        const part = markerIndex === undefined ? remaining : remaining.slice(0, markerIndex);
        if (part) {
          const normalized = pasteMode || explicitChunk ? part.replace(/[\r\n]+/g, ' ') : part;
          if (isPrintableSequence(normalized)) insertIntoModel(model, normalized);
        }
        if (markerIndex === undefined) break;
        const marker = remaining.slice(markerIndex, markerIndex + 6);
        pasteMode = marker === `${ESC}[200~`;
        remaining = remaining.slice(markerIndex + 6);
      }
      redraw();
    };

    const onKeypress = failSafe((text, key = {}) => {
      const sequence = String(key.sequence ?? text ?? '');
      const togglesTranscript = (key.ctrl && key.name === 'o') || sequence === '\x0f';
      if (transcriptOpen) {
        if (togglesTranscript || key.name === 'escape' || sequence === 'q') {
          closeTranscript();
          return;
        }
        // Mouse packets are handled from raw data below. Some Node versions
        // also emit a keypress for them; consume it here to avoid toggling twice.
        if (/^\x1b\[<\d+;\d+;\d+[Mm]$/.test(sequence)) return;
        const pageSize = Math.max(1, (Number(stdout.rows) || 24) - 4);
        if (key.name === 'up') transcriptOffset -= 1;
        else if (key.name === 'down') transcriptOffset += 1;
        else if (key.name === 'pageup') transcriptOffset -= pageSize;
        else if (key.name === 'pagedown') transcriptOffset += pageSize;
        else if (key.name === 'home') transcriptOffset = 0;
        else if (key.name === 'end') transcriptOffset = Infinity;
        else return;
        renderTranscript();
        return;
      }
      if (togglesTranscript) {
        openTranscript();
        return;
      }
      if (key.ctrl && key.name === 'c') {
        const error = new Error('SIGINT');
        error.code = 'SIGINT';
        settle(error);
        return;
      }
      if (sequence.includes(`${ESC}[200~`) || sequence.includes(`${ESC}[201~`)) {
        insertSequence(sequence);
        return;
      }
      if (pasteMode) {
        insertSequence(sequence);
        return;
      }
      if (isEnterKey(key, sequence)) {
        const value = modelValue(model);
        if (value) {
          for (let index = history.length - 1; index >= 0; index--) {
            if (history[index] === value) history.splice(index, 1);
          }
          history.push(value);
        }
        settle(null, value);
        return;
      }

      switch (key.name) {
        case 'left':
          model.cursor = Math.max(0, model.cursor - 1);
          redraw();
          return;
        case 'right':
          model.cursor = Math.min(model.graphemes.length, model.cursor + 1);
          redraw();
          return;
        case 'home':
          model.cursor = 0;
          redraw();
          return;
        case 'end':
          model.cursor = model.graphemes.length;
          redraw();
          return;
        case 'backspace':
          if (model.cursor > 0) {
            model.graphemes.splice(model.cursor - 1, 1);
            model.cursor--;
            redraw();
          }
          return;
        case 'delete':
          if (model.cursor < model.graphemes.length) {
            model.graphemes.splice(model.cursor, 1);
            redraw();
          }
          return;
        case 'up':
          changeHistory(-1);
          return;
        case 'down':
          changeHistory(1);
          return;
        case 'escape':
        case 'tab':
          return;
        default:
          break;
      }

      if (
        isPrintableSequence(sequence)
        || (sequence && segmentGraphemes(sequence).length > 1)
      ) {
        insertSequence(sequence);
      }
    });

    const onResize = failSafe(() => redraw());

    try {
      if (typeof stdin.setRawMode === 'function') stdin.setRawMode(true);
      stdout.write(`${CSI}?2004h`);
      stdout.on?.('resize', onResize);
      stdin.on?.('data', onRawMouse);
      releaseOwner = transport.acquire(onKeypress);
      redraw();
    } catch (error) {
      settle(error);
    }
  });
}

module.exports = {
  MIN_BOX_COLUMNS,
  MAX_BOX_WIDTH,
  canUseInputBox,
  segmentGraphemes,
  createTextModel,
  modelValue,
  replaceModel,
  insertIntoModel,
  wrapGraphemes,
  viewportAroundCursor,
  renderFrame,
  eraseRendered,
  drawRendered,
  bootstrapKeypressTransport,
  getKeypressTransport,
  promptInput,
};
