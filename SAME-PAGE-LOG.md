# Same-Page Log — `natureco code` visual layer (A+B+C)

Core Focus: Make `natureco code`'s terminal presentation cleaner, richer, and more correct than
Codex / Claude Code, degrading gracefully on 256-color / no-color terminals. Presentation only.

Integrator: Codex (gpt-5.6-sol), thread `019f94fb-c082-7b01-ade1-17e66bace300`.

## Round 1
### Integrator findings (Codex, verbatim)
- [FIX] Rock A is never connected to the three live assistant-output paths, which still write raw model text -> Render every displayed reply while preserving the original unrendered text in conversation history.
- [FIX] The proof commands test isolated helpers but never prove `natureco code` uses them -> Add an integration test capturing `code_v5` output for markdown, code fences, diffs, tool cards, and plain no-color output.
- [FIX] A hand-rolled regex markdown parser will break variable-length fences, tildes, nested formatting, escaped delimiters, and multiline constructs -> Use a small established parser or explicitly implement and test those CommonMark edge cases.
- [FIX] Model, code, diff, and tool text may contain ANSI or terminal-control sequences that corrupt styling or inject terminal commands -> Sanitize untrusted control sequences before rendering while preserving allowed newlines and tabs.
- [FIX] Regex syntax highlighting will commonly recolor tokens inside strings/comments and produce mismatched reset sequences -> Use a token-aware implementation or a proven lightweight highlighter with fixtures for escapes, templates, multiline strings, and pre-existing ANSI.
- [FIX] A hand-rolled line diff risks shifted-line noise and quadratic time or memory on large files -> Add the small established `diff` dependency and enforce input and rendered-output caps.
- [FIX] `detectCapabilities()` currently treats `TERM=*-256color` as truecolor, so forced `CAPS` tests pass while real 256-color terminals never exercise the fallback -> Detect truecolor only from valid 24-bit signals and test capability detection in isolated child processes.
- [FIX] `box` and `table` gate border colors directly on `CAPS.trueColor`, so changing `fg()` alone still leaves major UI elements colorless in 256-color mode -> Call capability-aware `fg()`/`bg()` unconditionally and suppress unconditional reset escapes when color is disabled.
- [FIX] Rock B's truecolor assertion is too weak to prove the existing path is unchanged -> Preserve exact truecolor escape snapshots and add invalid-color, no-color, 256-color, and repeated capability-detection regression tests.
- [FIX] Replacing width measurements without replacing `padEnd`, code-unit slicing, and length-based wrapping still misaligns CJK, emoji, combining marks, and ANSI text -> Use a declared direct dependency on `string-width` plus width-aware padding, wrapping, and ANSI-safe truncation helpers.
- [FIX] Line-count truncation does not bound a single extremely long line and cards have no terminal-width contract -> Cap bytes and display columns, wrap or truncate long lines safely, and test narrow terminals and megabyte-scale output.
- [FIX] Real `edit_file` and `write_file` results do not contain old and new contents, so fabricated tool-card tests can show diffs that production cannot produce -> Capture presentation-only before/after snapshots around execution or define an explicit display-diff payload without changing tool semantics.
- [CLARIFY] A "single card" cannot simultaneously show running and final status in the current append-only parallel output without either printing twice or cursor-updating race-prone regions -> Specify whether cards are append-only final cards or safely updated in place under parallel completion.
- [FIX] `renderToolCall` has no normalized contract for string, direct-object, `{result}`, `{error}`, and `success:false` result shapes -> Add one normalization layer and test it with fixtures from actual `executeTool` responses.
- [FIX] Existing path redaction is partial and argument summaries can expose file contents, secrets, Windows paths, or ANSI payloads -> Apply recursive field-aware redaction and control sanitization before summarizing arguments, results, and diff headers.
- [FIX] Checking only for a colored `+` or `-` can pass with reversed colors, malformed resets, or meaningless fabricated text -> Assert stripped unified-diff semantics, exact color roles at each capability level, balanced resets, and real edit/write integration.
- [FIX] `rg "function printToolCallSafe"` proves only that one function spelling disappeared, not that duplicate rendering or legacy call sites are gone -> Test that all tool-call paths import the single renderer and emit exactly one intended card per lifecycle policy.
- [FIX] Turkish/English parity is frozen but no renderer or tool-card proof covers localized labels and truncation footers -> Inject localized labels through `L` or options and add snapshot tests for both languages.
- [FIX] The plan says every rock extends `scripts/render-demo.js`, but that file does not exist -> Make creation of the demo script explicit and run it in a smoke test across truecolor, 256-color, and no-color modes.

### Visionary response (Fable)
All 19 findings ACCEPTED and folded into PLAN.md rev 2. Nothing rejected, nothing deferred. Key
plan changes:
- ACCEPTED (wiring): Rock C now explicitly wires `renderMarkdown` into the 3 live output paths, raw
  text preserved in `messages`/history. Integration test added (finding 2, proof g).
- ACCEPTED (deps): approved `marked` (tokenizer), `diff`, `string-width`; highlighter is Integrator's
  choice (light dep or tested tokenizer) with mandatory fixtures (findings 3, 5, 6, 10).
- ACCEPTED (sanitation): cross-cutting control-sequence stripping before styling (finding 4, 15).
- ACCEPTED (caps): byte + column caps, width-aware wrap/truncate, MB-input tests (findings 11, proof e).
- ACCEPTED (detection bug): truecolor only from `COLORTERM` 24-bit; child-process detection tests
  (finding 7, proof f).
- ACCEPTED (route color): box/table/welcomeCard/prettyError call fg/bg unconditionally (finding 8).
- ACCEPTED (snapshots): exact truecolor escape snapshot to prove path unchanged (finding 9, proof b).
- ACCEPTED (width helpers): `padTo`/`wrapAnsi`/`truncateAnsi` replace padEnd/slice (finding 10).
- ACCEPTED (before/after): presentation-only pre/post snapshot around edit/write for real diffs,
  fallback to summary if unavailable (finding 12, 16, proof c).
- RESOLVED (CLARIFY 13): append-only final cards, no in-place cursor updates.
- ACCEPTED (normalization): result-shape normalization layer + fixtures (finding 14, proof b).
- ACCEPTED (proofs): stripped unified-diff semantics, exact color roles, balanced resets,
  single-renderer import check, TR/EN snapshots, demo smoke (findings 16, 17, 18, 19).

## Round 2
### Integrator findings (Codex, verbatim)
- [FIX] Approved dependency versions are unspecified even though this Node 18 CommonJS codebase cannot synchronously `require()` current ESM-only majors of packages such as `string-width`, `marked`, or some highlighters -> Pin Node-18/CommonJS-compatible versions or define compatible loading adapters and add a Node 18 smoke test.
- [FIX] The `code_v5` integration proof can exercise only one reply branch while the three raw-output paths are behaviorally distinct -> Add fixtures covering workflow passthrough, workflow-summary reply, and normal agent reply, asserting rendered display and byte-identical raw history for each.
- [FIX] Mocked tool results do not prove that before/after snapshots are captured at the correct points around real execution -> Run real `edit_file` and overwrite-style `write_file` operations against temporary files and assert their final cards contain the actual diffs.
- [FIX] Presentation snapshots can synchronously read arbitrarily large files before renderer caps apply -> Stat and size-cap snapshot reads, then use the required summary fallback when a file exceeds the snapshot budget.
- [FIX] Recursive token redaction does not cover secrets embedded in edit/write diff bodies or arbitrary `content`, `old_string`, and `new_string` fields -> Suppress diffs for sensitive paths, mask recognized secret material in diff bodies, and use per-tool argument allowlists rather than generic serialization.
- [FIX] `marked` emits token types beyond the listed renderer cases, so HTML, tables, task lists, indented code, malformed constructs, or future tokens could silently disappear -> Require every unhandled token to degrade to sanitized plain text and add preservation fixtures.
- [FIX] The optional transient running line reintroduces cursor-clearing races when parallel tools complete and print final cards -> Omit transient lines for parallel batches or serialize all terminal mutations through one presentation writer.
- [FIX] Width proofs do not exercise `wrapAnsi`, combining sequences, ZWJ emoji, or style preservation across truncation boundaries -> Add exact-column and balanced-style fixtures for all three width helpers with those cases.
- [FIX] Counting lines beginning with `+` or `-` in a unified patch also counts `+++` and `---` headers, allowing the semantic diff proof to pass incorrectly -> Parse or explicitly exclude file headers and assert the changed content lines and hunk structure separately.
### Visionary response (Fable)
All 9 ACCEPTED, folded into PLAN.md: pinned CJS-compatible dep versions (string-width@4, marked@4, diff@5) + require() smoke test; unhandled marked tokens degrade to sanitized plain text; pure append-only cards (no transient line) through one presentation writer; stat-gated size-capped before/after snapshots with summary fallback; redaction extended to diff bodies + content/old_string/new_string with per-tool allowlists and sensitive-path diff suppression; proofs now cover all 3 reply branches with byte-identical raw-history assertions, REAL edit/write temp-file diffs, wrapAnsi/ZWJ/combining/balanced-style width fixtures, and diff-header exclusion (+++/--- not counted as content).

### Round 3
VERDICT: SAME PAGE — all round-2 findings addressed, no new presentation-only blockers. Meeting closed after 3 rounds.
