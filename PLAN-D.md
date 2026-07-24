# PLAN-D — `natureco code` experience layer (D1+D2+D3) — rev 2 (post Same-Page round 1)

**Core Focus:** Make `natureco code` FEEL superior to Codex / Claude Code — live streaming that
still renders markdown, Esc-interrupt of an in-flight turn/tool without corrupting the session, and
a live status line + spinners — DISPLAY-ONLY (raw text in `messages`/history byte-identical; tool
execution semantics unchanged), degrading correctly on non-TTY / NO_COLOR. Builds on the shipped
visual layer on branch feat/code-visual-layer.

**Method:** Codex = Integrator; Fable = Visionary (plan + Level-10, runs every proof).

**Design decisions (Visionary calls, settling round-1 findings):**
- **Transport/presentation split:** the provider streaming functions become TRANSPORT-ONLY — they
  write NOTHING to stdout; they emit normalized events (`text_delta`, `tool_call_delta`, `usage`,
  `done`) and accept an `AbortSignal`. All visible bytes go through ONE presentation writer.
- **One request builder:** buffered and streaming transports share a single request-construction
  path (temperature, max tokens, response format, fallback chain, MiniMax/provider routing, tool
  formatting) so switching to streaming changes ONLY delivery, nothing else.
- **Incremental markdown = repaintable active block (TTY) / raw (non-TTY):** committed (stable)
  blocks are appended once; the single in-progress block lives in a repaintable region and is
  committed only when the lexer confirms it is stable, and finalized at stream end. On non-TTY,
  stream raw text and render nothing in place. An unterminated code fence: on TTY, held in the
  active region and repainted/finalized at stream end (or interruption); on non-TTY, streamed raw.
- **Interrupt = transactional, never detach:** the AbortSignal aborts the fetch/stream and is passed
  to tools that support cooperative cancel; a non-cancellable in-flight tool is AWAITED to settle
  (never detached — its side effects must not outlive the turn). On Esc, the ENTIRE in-flight
  provider round (assistant tool-call message + all its tool results, partial or complete) is rolled
  back atomically via a per-round message-boundary snapshot, leaving `messages` at the last clean
  boundary (the prior user turn), provider-valid for the next request. Ctrl+C still exits.
- **Separate TTY gates:** input capability (Esc) keys off `process.stdin.isTTY`; output capability
  (streaming repaint, spinner, status) keys off `process.stdout.isTTY` + NO_COLOR. Piped
  stdin/stdout combinations degrade independently.
- **Abort is terminal control flow:** an Esc-triggered `AbortError` must be distinguished from a
  provider failure — it BYPASSES the provider fallback/retry chain (no second provider request is
  started) and propagates directly to the D2 rollback. The fallback `catch` must re-throw / skip on
  an abort signal rather than retry.
- **Status source:** show provider `usage` tokens when the stream exposes them; otherwise the
  existing estimate. Fed from normalized `usage` events; stored messages unchanged.
- **Only the two PROVIDER-CALL paths stream** (~lines 549, 574). The workflow-passthrough path
  (~line 512) is already a finished reply → it goes through the writer as one finalized block.

**Cross-cutting invariants:** display-only; one serialized writer (fixes parallel-tool card races);
graceful non-TTY/NO_COLOR degradation; no tool-contract changes; no heavy deps; full suite green
(`npx vitest run`, baseline 958); every rock ships unit AND integration tests.

---

## Rock D1 — Streaming transport refactor + live rendered display

**Do:**
1. **API transport refactor (`src/utils/api.js`):** make `streamProviderCompletion` /
   `streamOpenAICompletion` / `streamAnthropicCompletion` transport-only: remove all stdout writes;
   accept `{ signal, onEvent }`; emit normalized `text_delta` / `tool_call_delta` / `usage` / `done`
   events AND return one canonical completed assistant message (content + accumulated tool_calls).
   Fix Anthropic: buffer SSE across TCP chunks, accumulate `content_block_*` tool-use, convert
   OpenAI-shaped history to Anthropic request shape, normalized final output. Extract ONE shared
   request builder used by the buffered `sendMessageWithTools`/`sendMessageOpenAICompatible` path and
   the streaming path (identical params/routing/tool-format; only delivery differs).
2. **Presentation writer (`src/utils/stream-render.js`):** owns terminal output. On TTY: append
   committed markdown blocks (rendered via render.js) and keep the active block in a repaintable
   region committed only on lexer-stable boundaries / stream end. On non-TTY or NO_COLOR: stream raw
   text, no repaint. Accumulate the full raw content for history (byte-identical to concatenated
   deltas).
3. **Wire into `code_v5.js`:** the two provider-call paths consume the event stream through the
   writer; passthrough path sends its finished reply through the writer as one block. History still
   receives the raw accumulated text. **A reply carrying BOTH `content` and `tool_calls` streams its
   text for display but is committed to `messages` exactly ONCE as a single canonical assistant
   message (content + tool_calls) via the tool-call path — never pushed twice (no separate
   content-only push followed by the tool-call push).**

**Done looks like:** answers appear progressively with fences highlighted; the transcript equals
`renderMarkdown` of the full answer; history holds raw text byte-identical; nothing regresses on a
piped run.

**Proof:** `npx vitest run test/stream-render.test.js test/api-stream.test.js test/code-v5-stream.integration.test.js`:
(a) writer flushes INCREMENTALLY (≥2 commits before stream end for multi-block input); (b) a ```js
fence split across deltas commits highlighted only after close; (c) ANSI-stripped committed output
== ANSI-stripped `renderMarkdown(full)` across ADVERSARIAL chunk boundaries (unclosed fence, setext
heading, list, table, blockquote, inline delimiters, one-byte deltas); (d) raw accumulated text is
byte-identical to concatenated deltas; (e) `NO_COLOR=1` and non-TTY → zero `\x1b[`, no repaint
sequences; (f) api transport emits normalized text_delta + tool_call_delta for BOTH OpenAI and
Anthropic fixtures and writes nothing to stdout; (g) **integration:** delayed provider deltas fed
through each real provider-call branch cause stdout to change BEFORE the turn's completion promise
resolves. Full suite green.

## Rock D2 — Transactional Esc-interrupt of an in-flight turn or tool

**Do:** Thread an `AbortController` per provider round; its signal aborts the stream (D1) and is
passed to cooperative-cancel tools. Snapshot the `messages` boundary at the start of each round.
While a turn runs, pause readline, save prior raw state, install exactly ONE keypress owner for Esc
(Ctrl+C still exits), and restore listeners + raw state in an UNCONDITIONAL `finally`. On Esc: abort;
stop consuming the stream; for tools — cooperatively cancel where supported, else AWAIT the in-flight
tool to settle (never detach); then roll back the entire round to the snapshot (remove the partial
assistant tool-call message and every partial/complete tool result as a unit, incl. a parallel
batch), print a localized "⏹ interrupted", and return to a fresh `You` prompt with `messages`
provider-valid. Esc gated on `stdin.isTTY`.

**Done looks like:** Esc during a long stream, or a cooperative/network-cancellable tool, stops it
promptly, prints "interrupted", and drops to the prompt with the session intact and immediately
usable. For a NON-cancellable in-flight tool, Esc shows a "⏳ cancelling — waiting for <tool>…" state
and control returns as soon as that tool settles (its side effects never outlive the turn); we do not
falsely claim an instant stop. The terminal is never left in raw mode; Ctrl+C still exits.

**Proof:** `npx vitest run test/interrupt.test.js test/interrupt-pty.integration.test.js`: (a)
aborting mid-stream stops token consumption and runs stream cleanup; (b) after interrupt `messages`
is provider-valid — no assistant tool-call without a result, no result without its call, no partial
assistant text; (c) a non-cancellable tool is awaited (its recorded effect is settled, not a fake
success or a late card); (d) a parallel batch interrupt leaves either all-committed or all-rolled-
back, never orphaned; (e) the turn promise resolves (no hang/unhandled rejection); (f) **pty
integration:** Esc during a mocked network stream AND during a tool restores raw state even if the
body throws, leaves the terminal cooked, and the next `You` prompt accepts input; Ctrl+C exits. Full
suite green.

## Rock D3 — Live status line + spinner (serialized through the writer)

**Do:** Extend the D1 writer with a single-line spinner while awaiting the first token and while a
tool runs (append-only-safe: the spinner line is cleared before any committed text/card; serialized
so parallel tools never corrupt it), and a persistent status line: model · tokens (provider `usage`
or estimate) · elapsed. Give the animation an injected writer/scheduler (do NOT reuse the raw
`Spinner` that writes stdout directly); gate on `stdout.isTTY && !NO_COLOR`. Guarantee cursor
restoration + timer disposal + line cleanup on EVERY exit path (normal, provider error, tool error,
Esc, SIGINT).

**Done looks like:** a tasteful spinner while thinking / running tools, a status line (model ·
tokens · elapsed); none of it on piped output; the cursor is never left hidden and no timer leaks.

**Proof:** `npx vitest run test/status-line.test.js test/spinner-lifecycle.test.js`: (a) status
formatter renders `model · N↑/M↓ · Xs` truncated to width with balanced styles; (b) spinner/status
emit NOTHING when `stdout.isTTY` is false or `NO_COLOR` set; (c) writer serializes concurrent
spinner + card writes (final buffer shows the spinner line fully cleared before the card); (d)
lifecycle: across normal end, thrown provider error, thrown tool error, and Esc, the timer is
disposed and the cursor-show sequence is emitted (no hidden cursor, no live timer). Full suite green.

---

## Build order & risk
D1 → D2 → D3 (D2 hangs off D1's abortable stream loop + message snapshots; D3 off D1's writer).
D1's API transport refactor is the largest, correctness-critical piece; treat it as the gate for the
cycle. Highest residual risks (Same-Page to keep watching): incremental-markdown stability boundaries;
raw-mode restore-on-throw; transactional rollback across parallel tool batches; OpenAI vs Anthropic
delta/tool shapes.

## Same-Page gate
Codex reviews read-only until `VERDICT: SAME PAGE` (logged in `SAME-PAGE-LOG-D.md`).
