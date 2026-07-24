# PLAN — `natureco code` visual layer (A+B+C) — rev 2 (post Same-Page round 1)

**Core Focus:** Make `natureco code`'s terminal presentation cleaner, richer, and more correct than
Codex / Claude Code — rendered markdown, syntax-highlighted code, colored diffs, aligned tool
cards — while degrading gracefully on 256-color and no-color terminals. Presentation only: the
agent loop, tool execution semantics, and message history sent to the model must not change.

**Method:** Codex = Integrator (builds each rock); Fable = Visionary (plan + Level-10 review, runs
every proof itself). Scope = A+B+C. Rock D (streaming/interrupt) deferred.

**Approved dependencies — MUST be `require()`-able from this CommonJS codebase (no ESM-only
majors; pin CJS-compatible versions and add a `node -e "require('…')"` smoke test):**
- `diff` (`^5`, CJS) — line/word diffing (avoids quadratic/shifted-line hand-rolls).
- `string-width` (`^4`, CJS — v5+ is ESM-only, do NOT use) — East-Asian-Wide/emoji/combining width.
- `marked` (`^4`, CJS `require` supported — v5+/v12 ESM-only, do NOT use) — tokenizer only; we own
  the ANSI renderer (no `marked-terminal`).
- Syntax highlighting: Integrator's choice between (a) ONE light CJS highlighter dep (e.g.
  `cli-highlight`, which is CJS) or (b) a hand-written token-aware highlighter for {js/ts, json,
  bash/sh, python, generic}. Either way the fixture tests in Rock A's proof are mandatory, and the
  dep must `require()` cleanly. No heavy TUI framework.
- Proof floor for deps: a smoke test `node -e "require('diff');require('string-width');require('marked')"`
  (plus the highlighter, if any) exits 0 on the project's Node version.

**Cross-cutting requirements (apply to every rock):**
- **Control-sequence sanitation:** all untrusted text (model output, code, file contents, tool
  args/results, diff headers) is stripped of C0/C1 control + escape sequences (keep `\n`, `\t`)
  BEFORE any styling is applied — no terminal-command injection, no stray resets.
- **Color-disabled path:** with `NO_COLOR`, non-TTY, or `FORCE_COLOR=0`, output contains zero
  `\x1b[` sequences (plain text).
- **Output caps:** every renderer caps both bytes and display columns; a single very long line is
  wrapped or safely truncated (width-aware, ANSI-safe); large inputs (MB-scale) never hang.
- **i18n:** all labels/footers go through `L(tr,en)` or an injected label map; both languages tested.

---

## Rock A — Render engine (`src/utils/render.js`) + demo

**Do:** A self-contained module, using `tui.js` color helpers (inherits Rock B correctness):
1. `renderMarkdown(text, opts)` → ANSI. Tokenize with `marked`; our renderer handles headings,
   bold/italic, inline code, bullet + ordered lists (nested), block quotes, hr, links, and fenced
   code (any fence length, ``` or ~~~) delegated to `highlightCode`. Sanitize first. Non-markdown
   passes through. Never throws.
2. `highlightCode(code, lang)` → token-aware highlighting for {js/ts, json, bash/sh, python,
   generic}; correct string/comment/template state (no recoloring inside strings/comments),
   balanced resets, pre-existing ANSI stripped first. Unknown lang → dim passthrough.
   Every `marked` token type NOT explicitly handled (html, table, task-list, indented code,
   malformed/future tokens) degrades to sanitized plain text — nothing is silently dropped.
3. `renderDiff(oldStr, newStr, {path})` → unified `+/-` diff via the `diff` dep: green additions,
   red deletions, dim context, a header with the path; input + rendered-output capped.
4. Create `scripts/render-demo.js` printing representative markdown, a highlighted fence, a diff,
   and (Rock C) a tool card — runnable under truecolor / 256-color / no-color via env.

**Done looks like:** `renderMarkdown` of a doc with a ```js fence returns ANSI heading/bold + a
highlighted block; `renderDiff('a\nb','a\nc')` shows ` a`, red `-b`, green `+c`.

**Proof:** `npx vitest run test/render.test.js` asserts: (a) heading+bold+inline-code emit ANSI;
(b) a fenced block contains highlight codes AND string/comment tokens are not mis-recolored;
(c) diff output, when ANSI-stripped, is a valid unified diff — the assertion EXCLUDES the `+++`/`---`
file headers and checks the changed CONTENT lines (exactly one `-` and one `+`) plus hunk (`@@`)
structure, and the `+`/`-` carry the correct color role with balanced resets; (d) `NO_COLOR=1` →
zero `\x1b[`; (e) a fence containing raw `\x1b[31m` and a 2MB input are handled without corruption
or hang; (f) a markdown doc with an HTML block, a table, and a task list renders each as sanitized
plain text (nothing dropped, no throw).

## Rock B — Color + width correctness (`src/utils/tui.js`)

**Do:**
1. **Truecolor detection bug:** `detectCapabilities()` currently sets `trueColor` when `TERM`
   contains `256color` — wrong. Set `trueColor` ONLY from a real 24-bit signal
   (`COLORTERM=truecolor|24bit`); `*-256color` means `color=true, trueColor=false`.
2. **256 fallback:** add `hexTo256(hex)` (nearest xterm-256). `fg(hex)`/`bg(hex)` emit `38;2`/`48;2`
   under truecolor (byte-identical to today), `38;5;N`/`48;5;N` when color-but-not-truecolor, and
   `''` when color is disabled.
3. **Route all color through fg/bg:** `box`, `table`, `welcomeCard`, `prettyError` currently gate
   borders on `CAPS.trueColor ? fg(..) : ''`; call `fg()`/`bg()` unconditionally so 256-color mode
   is colored, and suppress reset escapes when color is disabled.
4. **Display width:** add `stringWidth(str)` (via `string-width`, ANSI-stripped) plus width-aware
   `padTo(str,n)`, `wrapAnsi(str,n)`, `truncateAnsi(str,n)` helpers. Replace `stripAnsi(..).length`
   / `padEnd` / code-unit slicing in `box`, `table`, `welcomeCard`, `prettyError` with them.

**Done looks like:** on a 256-color terminal the whole brand palette + boxes are colored; a `🌿`
header and a CJK/emoji table cell stay aligned.

**Proof:** `npx vitest run test/tui-color-width.test.js` asserts: (a) caps `{color:true,
trueColor:false}` → `fg('#22c55e')` contains `38;5;`; (b) caps truecolor → `fg('#22c55e')` equals
the exact pre-existing `38;2;34;197;94m` snapshot (path unchanged); (c) color-disabled → `fg()===''`;
(d) `stringWidth('🌿')===2`, `stringWidth('中')===2`, `stringWidth('ab')===2`,
`stringWidth(styled('x',{color:'#fff'}))===1`; (e) `padTo`, `wrapAnsi`, and `truncateAnsi` each keep
a line mixing `🌿`, a ZWJ emoji (👨‍👩‍👧), a combining mark, and CJK at the EXACT target column, with
styles balanced (no dangling open codes) across the truncation/wrap boundary; (f) capability
detection is exercised in isolated child processes for truecolor / 256-color / no-color / invalid
`COLORTERM`. Full suite `npx vitest run` stays green (baseline 936 passing).

## Rock C — Unified tool cards + wired-in rendering (`src/commands/code_v5.js`, `src/utils/tool-card.js`)

**Do:**
1. **One renderer.** Collapse `printToolCall` + `printToolCallSafe` into a single
   `renderToolCall(name, args, result, opts)` in `src/utils/tool-card.js`. **Pure append-only final
   cards** — NO transient/cursor-cleared "running" line (it reintroduces races when parallel tools
   finish); each completed tool emits exactly one final card, and all terminal writes for cards go
   through one presentation writer. All call sites import the one renderer; no second implementation
   remains.
2. **Result normalization.** A normalization layer maps every real `executeTool` result shape
   (string, direct object, `{result}`, `{error}`, `{success:false}`) to one internal card model;
   tested with fixtures taken from actual tool responses.
3. **Redaction + sanitation.** Field-aware redaction using per-tool argument allowlists (not
   generic serialization): home/Windows paths → `~`, recognized secret/token material masked,
   `size`/`path` noise dropped — applied to args, results, AND diff bodies (`content`, `old_string`,
   `new_string` and the rendered diff lines), plus control-sequence sanitation. Diffs for
   sensitive paths (dotfiles like `.env`, key/credential files) are suppressed to a summary line.
4. **Edit diffs (presentation-only before/after, size-capped).** For `write_file`/`edit_file`,
   capture the file's content just BEFORE execution and just AFTER (a presentation-only snapshot in
   the tracking layer — tool semantics unchanged). Snapshot reads are `stat`-gated and size-capped;
   a file over the snapshot budget falls back to a summary line (never a full read, never a
   fabricated diff). Render the change via `renderDiff`.
5. **Wire rendering into the live output paths.** The three assistant-output paths in `code_v5.js`
   that currently `process.stdout.write(raw)` now render through `renderMarkdown` for DISPLAY, while
   the unmodified raw text is what stays in `messages`/session history sent to the model.
6. **Width/i18n.** Cards honor terminal width (wrap/truncate long args/results with a `… (+N lines)`
   footer) and localize labels/footer via `L`.

**Done looks like:** one consistent card per tool; an `edit_file` shows a real `+/-` diff of the
actual change; long output truncates with a `+N lines` footer; assistant markdown renders in the
transcript; only one card renderer exists; model history still receives raw text.

**Proof:** `npx vitest run test/tool-card.test.js test/code-v5-render.integration.test.js` asserts:
(a) `renderToolCall('read_file',{path},result)` contains the name + a ✓ glyph; (b) each normalized
result shape renders without throwing; (c) an `edit_file` display routes through `renderDiff`
(ANSI-stripped output is a valid unified diff of the before/after, correct color roles, balanced
resets); (d) output over the cap ends with a `+N` footer and never exceeds terminal width;
(e) redaction removes a planted home path + token from an arg summary AND from a diff body, and a
`.env` edit renders a suppressed summary (no diff body); (f) TR and EN snapshots of a card differ
only in labels; (g) **integration:** a scripted `code_v5` render pass (mocked provider reply +
mocked tool results, no network) covers ALL THREE reply branches — workflow passthrough,
workflow-summary reply, and normal agent reply — asserting for each that the DISPLAY is rendered
markdown but the text kept in `messages`/history is byte-identical to the raw model text; under
`NO_COLOR=1` the display has zero `\x1b[`; (h) **real I/O:** an actual `edit_file` and an overwrite
`write_file` against temp files produce cards whose ANSI-stripped diffs equal the real before/after
change; (i) `rg "printToolCallSafe|process\.stdout\.write\(reply"` shows the duplicate renderer and
raw reply-writes are gone. Full suite `npx vitest run` green.

---

## Same Page gate
Codex reviews this plan read-only until `VERDICT: SAME PAGE` (logged in `SAME-PAGE-LOG.md`). No
DEFER/KILL items outstanding from round 1 (all findings folded in). Build starts only on SAME PAGE.
