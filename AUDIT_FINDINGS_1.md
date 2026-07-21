# NatureCo CLI Structural / Static Quality Audit — Pass 1

Audit date: 2026-07-21
Audited version: `natureco-cli@5.67.0`
Scope: read/investigate-only static and structural pass. No source file was changed. Live functional sampling is intentionally left to the companion pass.

## 1. Quality-gate baseline results

| Gate | Result | Exact counts / output |
|---|---:|---|
| `npm test` | PASS | 82/82 test files passed; 776 tests passed, 3 skipped (779 total); duration 68.57 s |
| `npm run lint` | PASS WITH WARNINGS | Exit 0; 346 warnings, 0 errors; 1 warning potentially fixable with `--fix` |
| `npm audit` | PASS | Exit 0; `found 0 vulnerabilities` |
| `node --check` over every `.js` under `src/`, `bin/`, and `scripts/` | PASS | 320/320 passed, 0 failed |

The test runner emitted no failing-test error output. The lint warning set is large (346); representative tool warnings include unused imports/arguments, `no-inner-declarations` in `src/tools/workflow.js:323,343,445`, and `no-control-regex` in `src/tools/document_extract.js:65`. The full lint command completed successfully, so these are not gate failures.

## 2. Structural check results

### Method

One automated Node harness enumerated all 92 `src/tools/*.js` files. Each file was loaded in its own child process. The harness checked non-empty `name` and `description`, object-valued `inputSchema`, and callable `execute`; it then awaited `execute({})` with a 2.5-second per-call timeout. Child isolation prevented retained handles from hanging the audit.

Exact totals:

- Require/load: **92/92 passed**.
- Requested export shape: **80/92 passed**.
- `execute({})` settled with a normal return: **88/92** (three uncaught throws and one file with no callable `execute`).
- Fully passed all checks: **79/92**.
- Failed at least one requested check: **13/92**.

### Failure table

| File | Load | Shape | Empty/minimal execution | Exact evidence |
|---|---:|---:|---:|---|
| `src/tools/agentic-runner.js` | PASS | FAIL | Not callable | Missing `name`, `description`, `inputSchema`, and `execute`; exports internal runner helpers only. |
| `src/tools/browser_use.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Bilinmeyen action: undefined`. |
| `src/tools/computer_use_loop.js` | PASS | FAIL | Returned error, but performed work | Missing `inputSchema` (exports `parameters`). Despite schema requiring `goal`, `{}` entered the screenshot/vision loop and made a provider request; the captured result contained HTTP 402 `credit_balance_too_low`, `totalSteps: 2`. See `src/tools/computer_use_loop.js:274-275`. |
| `src/tools/memory.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Unknown action: undefined`. |
| `src/tools/memory_provider.js` | PASS | FAIL | **Uncaught throw** | Missing `inputSchema`; `TypeError: Provider is not a constructor` at `src/tools/memory_provider.js:53:20`. Reproduced separately with the valid call `{action:'status'}`. |
| `src/tools/model_provider.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Unknown action: undefined`. |
| `src/tools/search_provider.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Unknown action: undefined`. |
| `src/tools/skill_manage.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Unknown action: undefined`. |
| `src/tools/skill_view.js` | PASS | FAIL | **Uncaught throw** | Missing `inputSchema`; `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` through `src/utils/skill-index.js:115`, called by `src/tools/skill_view.js:21`. |
| `src/tools/skills_autoload.js` | PASS | PASS | **Uncaught throw** | `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` at `src/tools/skills_autoload.js:51:25`, called from lines 69 and 93. |
| `src/tools/skills_download.js` | PASS | FAIL | Returned informative error | Missing `inputSchema` (exports `parameters`); returned `Unknown action. Use: list_sources, list_skills, download, download_all`. |
| `src/tools/skills_list.js` | PASS | FAIL | Returned normally | Missing `inputSchema` (exports `parameters`); returned the available skill list. |
| `src/tools/sub_agent.js` | PASS | FAIL | Returned error, but made provider request | Missing `inputSchema` (exports `parameters`). Despite schema requiring `task`, `{}` made a provider request and returned an HTTP 402 billing error; no runtime task check exists at `src/tools/sub_agent.js:63-88`. |

`src/utils/tool-manifest.js:17-24` deliberately accepts `parameters` as a fallback, so the eleven executable files using that older key can still be loaded by the normal manifest. They nevertheless fail the explicit, published audit contract and create two schema dialects. `agentic-runner.js` is an internal helper placed in the tool directory, not an actual tool.

## 3. Test-coverage gaps

### Method and limits

For every tool, tests were searched for both its filename stem and its registered `name` string across every JavaScript file under `test/`. This is a conservative textual signal: a hit can be incidental and therefore may overstate coverage, but a zero means no test even names the tool by either identifier. There are **54 zero-signal tools** and **38 with at least one signal**.

| Tool | What it does | Risk note |
|---|---|---|
| `async_delegation.js` | Starts/statuses/cancels background delegated CLI tasks | **High:** spawns processes; model/user task text |
| `audio_understanding.js` | Downloads/transcribes/analyzes audio | **High:** temporary writes, remote APIs, credentials, user media |
| `blueprint.js` | Creates/loads/runs/deletes reusable workflows | **High:** persistent file writes/deletes; user steps/text |
| `browser_use.js` | Cloud/CLI browser automation | **High:** browser state, processes, credentials, user tasks |
| `calendar_add.js` | Creates macOS Calendar events | **High:** mutates calendar; spawns AppleScript with user text |
| `canvas.js` | Renders structured rich content | Low: primarily formatting/display of user data |
| `checkpoint.js` | Saves/loads/lists/deletes checkpoints | **High:** persistent writes/deletes |
| `clarify.js` | Returns a clarification request | Low: text-only |
| `code_execution.js` | Executes Python, Node, or shell code | **High:** arbitrary process execution and user/model code |
| `cross_session_memory.js` | Loads context across sessions | Medium: reads personal/user text and memory |
| `delegate_task.js` | Spawns a CLI sub-agent | **High:** process spawn and model/user prompt |
| `exa_search.js` | Exa web search/content extraction | Medium: external API, credential, user query |
| `file_search.js` | Searches filesystem paths by glob | Medium: filesystem disclosure from user pattern/path |
| `file_state.js` | Tracks/untracks/checks file hashes | Medium: mutates in-memory tracking state; user paths |
| `firecrawl.js` | Scrapes/crawls URLs | Medium: external API, credential, user URL |
| `google_meet.js` | Creates/opens Meet meetings | **High:** Calendar/browser mutation and shell construction |
| `homeassistant.js` | Reads/changes Home Assistant entities | **High:** changes physical/home state; bearer credential |
| `kanban.js` | Adds/moves/removes/clears persistent cards | **High:** persistent state mutation |
| `llm_task.js` | Runs schema-constrained LLM jobs | Medium: remote API/credential and user text |
| `mac_alarm.js` | Creates a macOS alarm/calendar item | **High:** user-state mutation and AppleScript process |
| `mac_app_open.js` | Opens a macOS application | Medium: spawns process from user app name |
| `mac_app_quit.js` | Quits a macOS application | **High:** terminates application/process |
| `mac_notify.js` | Sends macOS notification | Medium: process plus user text |
| `macos_screenshot.js` | Captures the screen | **High:** privacy-sensitive file/process operation |
| `media_understanding.js` | Sends media to vision providers | **High:** user media and credentials leave machine |
| `memory_provider.js` | Pluggable persistent-memory backend | **High:** persistent personal data mutation/deletion |
| `memory_search.js` | Searches memory/session history | Medium: sensitive user text, read-only |
| `microsoft_graph.js` | Mail/calendar/file operations through Graph | **High:** credentials and external state mutation |
| `model_provider.js` | Lists/switches model providers | Medium: configuration mutation and provider metadata |
| `music_generation.js` | Generates music through providers | Medium: credentials, user prompts, potentially paid API |
| `notebook_edit.js` | Updates/adds/deletes notebook cells | **High:** direct file mutation |
| `notes_add.js` | Adds an Apple Note | **High:** external user-state mutation via process |
| `parallel_search.js` | Searches multiple providers | Medium: external calls and user query |
| `pii_redact.js` | Redacts PII/secrets from text | **High:** security-sensitive handling of secrets/user text |
| `reminder_add.js` | Adds a macOS reminder | **High:** external user-state mutation |
| `search_provider.js` | Searches/switches search providers | Medium: credentials, user query, configuration selection |
| `searxng.js` | Searches a SearXNG endpoint | Medium: external request and user query |
| `send_message.js` | Sends terminal/email/webhook messages | **High:** external communication with user-provided recipient/text |
| `session_search.js` | Searches past session content | Medium: sensitive user text, read-only |
| `skill_generate.js` | Generates and installs a skill | **High:** paid/model call plus persistent executable-instruction files |
| `skill_manage.js` | Creates/patches/deletes skills | **High:** persistent file mutation/deletion |
| `skills_list.js` | Lists skills | Low: read-only discovery |
| `skills_marketplace.js` | Lists/installs/uninstalls skills | **High:** downloads and persistent file mutation |
| `soul.js` | Reads SOUL/IDENTITY/AGENTS instructions | Medium: reads user-provided instruction text |
| `speech_to_text.js` | Sends audio for transcription | **High:** credentials and privacy-sensitive audio |
| `spotify.js` | Searches Spotify metadata | Medium: client credentials and user query; nominally read-only |
| `structural_patch.js` | Applies anchored patches with rollback | **High:** source/file mutation |
| `text_to_speech.js` | Runs TTS or saves text | **High:** process execution, file writes, user text |
| `thread_ownership.js` | Assigns message threads to agents | Medium: mutates routing state from user input |
| `url_safety.js` | Checks URL/domain safety and HTTP status | Medium: user URL and outbound request/SSRF considerations |
| `voice_chat.js` | Records, transcribes, and speaks | **High:** microphone/files/processes/API credentials |
| `web_readability.js` | Extracts readable webpage content | Medium: user URL and external/process work |
| `web_search.js` | Searches configured web provider | Medium: external calls, credentials, user query |
| `x_search.js` | Searches X/Twitter | Medium: API credential and user query |

The lack of even a naming signal is especially serious for mutation/process/credential tools. It also explains why the valid-action `memory_provider` failure and the empty-input paid-call behavior were not caught by the 776 passing tests.

## 4. Reliability-pattern findings

### 4.1 Unix-only external commands / plain-Windows reliability

Real matches:

- `src/tools/browser_use.js:68-70` unconditionally runs `spawnSync('which', ['browser-use'])`. On plain Windows, `which` is absent, so an installed `browser-use` executable is reported unavailable. Use the existing `where`/direct-probe pattern.
- `src/tools/shell_command.js:16` always spawns `bash -c`. The tool is registered cross-platform, but plain Windows has no Bash by default; every otherwise valid command fails with ENOENT.
- `src/tools/code_execution.js:38-39` offers only `bash` for `language=bash` on Windows. It does return an informative "interpreter not found" error rather than silently succeeding, but the advertised Bash capability requires Git Bash/WSL and has no PowerShell/cmd fallback.
- `src/tools/text_to_speech.js:32` unconditionally spawns `python3` for the default/edge provider. Windows installations commonly expose `py` or `python`; the robust candidate logic already used by `code_execution.js` is absent.
- `src/commands/admin-rpc.js:174` implements `logs.tail` by calling external `tail`; on Windows this falls into the catch and falsely presents an existing log as "not found." A pure-Node tail is appropriate.

Platform-scoped occurrences that are not plain-Windows defects were checked and excluded: `voice_chat.js:150` (`which`) returns "macOS only" before reaching it; iMessage `which` probes are for a macOS-only subsystem; `computer_use.js` and `platform-gui.js` choose `where` on Windows. `grep_search.js:40-74` has the intended pure-Node fallback and direct executable probe. No remaining spawned `grep`, `sed`, `awk`, or `cat` fallback was found in tools.

### 4.2 Shell command strings containing external/model-provided input

Confirmed unsafe or unreliable construction:

- `src/tools/google_meet.js:21` builds an `osascript` shell string containing user `title`; `src/tools/google_meet.js:32,34,36` concatenates user `meetingUrl` into `open`/`start`/`xdg-open` commands. Quote replacement is not safe argument separation. Use `execFileSync('osascript', ['-e', script])` and platform launchers with argument arrays; validate allowed URL schemes.
- `src/commands/imessage.js:102-103` concatenates configured executable path, user recipient, and message into one command. A message containing shell metacharacters can escape the quoting. The same file already demonstrates the correct `execFileSync` pattern elsewhere.
- `src/commands/clickclack.js:13-18` interpolates webhook/CLI notification text into `say` or PowerShell command strings. Replacing only `"` does not neutralize shell/PowerShell substitutions.
- `src/utils/skills.js:54-61` interpolates a downloaded skill's `requires.bins[]` metadata into `${bin} --version`; installing/checking a malicious skill can execute arbitrary shell syntax.
- `src/utils/mcp.js:117-125` interpolates configured `server.command` into `${server.command} --version`.
- `src/commands/signal.js:440` interpolates configured `signalCliPath`; lines `454-463` interpolate configured `signalHttpUrl` into PowerShell source.
- `src/utils/worktree.js:61-62,100,176-177` interpolates model-provided worktree `id`/`branch`-derived values into Git command strings. The worktree virtual tool passes model arguments directly at `src/commands/repl.js:404` and `src/commands/code_v5.js:365`.
- `src/commands/admin-rpc.js:174` interpolates authenticated RPC `params.lines` into `tail -${lines}` without integer validation.
- `src/commands/sandbox.js:96` interpolates user `name` into `docker rm -f ${name}`.

Intentional arbitrary-command surfaces also match the string-shell shape: `src/tools/bash.js:82`, `src/tools/shell_command.js:16`, `src/commands/code.js:481-486` (`/run`), `src/commands/terminal.js:48`, and `src/commands/sandbox.js:118`. Their purpose is command execution, so replacing them wholesale with a single binary/argv call changes semantics; nevertheless, `bash`/`shell_command` are model-facing and depend on policy parsing to contain shell metacharacters. They should be treated as explicit privileged surfaces, not safe tokenized execution.

Adjacent high-risk recurrence: `src/tools/text_to_speech.js:32-43` avoids a shell but interpolates user text, voice, and output path into Python source passed to `python3 -c`. `"""` or crafted path content can break out into arbitrary Python. Pass data through stdin/environment or call the module without generating source.

### 4.3 Plain `.toLowerCase()` on Turkish user text

The tree still contains broad recurrences. `src/utils/tr-text.js` and the fixed `memory_tree` legacy search were inspected; the following paths do not use `foldTr`:

- Core memory/search: `src/tools/memory.js:59,64,69,89,109,125,133,136`; `src/tools/memory_search.js:26,32,36,52`; `src/tools/memory_write.js:26,78,83-84,138,157`; `src/tools/memory_tree.js:31,37-38`; `src/tools/cross_session_memory.js:66`; `src/tools/session_search.js:34,37`; `src/tools/workflow.js:29,43,62,77`.
- Skill/social search: `src/tools/skills_autoload.js:51`; `src/tools/skills_marketplace.js:190,192-194`; `src/tools/social_open.js:80` (for example capital Turkish `İnstagram` will not contain ASCII `instagram` after default lowercasing).
- CLI search/comparison: `src/commands/account.js:15`; `src/commands/audit.js:170,179-180`; `src/commands/chat.js:126,139,271`; `src/commands/channels.js:423`; `src/commands/code.js:349,771`; `src/commands/directory.js:100,102-104`; `src/commands/docs.js:98`; `src/commands/gateway-server.js:1205`; `src/commands/logs.js:80-81,90`; `src/commands/message.js:350,354-355`; `src/commands/memory.js:79,86,103,116`; `src/commands/memory-cmd.js:131,133,136,141,393,400,408,413`; `src/commands/wiki.js:431,440`.
- REPL/setup identity and fact matching: `src/commands/setup.js:466`; `src/commands/repl.js:177,191,197,200,211,273,277,291,1072,1184,1290,1303,1320,1329,1336-1337,1342,1422-1423,1554`.

These are real misses, not stylistic differences. For example, default lowercasing transforms `İstanbul` to `i` plus combining dot, so a query for `istanbul` does not match. Uppercase Turkish commands such as `GİRİŞ`/`ÇIKIŞ`, bot/user names, memory facts, log/wiki text, marketplace descriptions, and session content are affected. ASCII-only protocol identifiers (provider names, file extensions, environment flags, URL hostnames) were excluded.

### 4.4 Tool registration / prompt wiring

Cross-check results:

- 92 `.js` files exist in `src/tools`; the auto-manifest exposes 91 executable modules. The only omitted file is `agentic-runner.js`, which has no tool exports.
- The two intentional filename/registered-name differences are `duckduckgo.js -> duckduckgo_search` and `searxng.js -> searxng_search`.
- Every `DEFAULT_ALLOWED` name has a corresponding loadable filename (with the existing DuckDuckGo alias path). No allowed-list entry references a missing/renamed file.
- Native tool-calling paths use `loadToolManifest()` and therefore receive all 91 executable modules. The non-native agentic path exposes the safe `DEFAULT_ALLOWED` set; full mode dynamically introduces every filename and bypasses the safe allow check by design.

One genuine mismatch remains: `src/tools/workflow.js:19-23,182,246,265` builds its count and full-mode advertised list directly from every `.js` filename. It therefore counts and advertises `agentic-runner` as a callable tool, although the manifest excludes it and `executeCall` will return `execute yok`. The reported "tool count" is 92 while actual tool-shaped modules are 91. Filter through the manifest or move the helper outside `src/tools`.

No "referenced but file missing/renamed" mismatch was found. There are many tools intentionally unavailable in default safe agentic mode, but they are exposed through native tool-calling and introduced dynamically in full mode; those are policy choices rather than unwired files.

### 4.5 Filesystem mutations that can report success after no change

Real matches:

- `src/tools/memory_write.js:195-199`: `clear` returns `success: true` even when the target file does not exist.
- `src/tools/workflow.js:652-656`: `delete` returns `success: true` even when no workflow file exists.
- `src/tools/file_state.js:44-46`: ignores the boolean result from `Map.delete()` and always says the file was untracked.
- `src/tools/memory_tree.js:137-155`: `remove` returns `success: true` when `removed === 0`. It does expose the zero count, but callers keying on `success` receive a false-positive deletion.
- `src/tools/plugin.js:114-132`: GitHub installation increments `downloaded` for non-200 responses and resolves `success: true` after all three responses even if required `index.js`/`plugin.json`/README files were never written. Network errors also resolve success with only a note.
- `src/tools/skills_download.js:176-185`: every additional-file failure (including a skipped traversal path) is swallowed, after which line 188 reports complete success without a partial-failure list.
- `src/tools/memory.js:131-142`: the JSON fact bridge catches and discards directory/write errors; `execute(add,target=user)` then returns the separate store's result at lines 151-154, so the cross-session JSON copy can silently fail while the caller sees success.

Synchronous writes/deletes that throw on failure and are caught by their caller were not labeled false positives merely because they do not read the bytes back. The findings above have a concrete no-op/partial-failure path that still reports success.

## 5. Prioritized genuine issues

### High

1. **`src/tools/memory_provider.js:42-53` — advertised provider tool is unusable.** Evidence: valid `{action:'status'}` reproducibly throws `TypeError: Provider is not a constructor`; provider registration modules are never required by this tool. Direction: load/register built-ins before lookup, verify a class was returned, and catch initialization errors.
2. **`src/tools/computer_use_loop.js:274-275` — missing required goal can spend API credit and enter GUI observation/action logic.** Evidence: `execute({})` made a real configured vision-provider request and reached two steps before HTTP 402. Direction: runtime-validate `goal` before configuration, screenshot, API, or GUI work.
3. **`src/tools/google_meet.js:21,32,34,36` — user title/URL enters shell command strings.** Evidence: direct concatenation into `execSync`; quoting is incomplete. Direction: `execFileSync` argument arrays, safe AppleScript data passing, and URL-scheme validation.
4. **`src/tools/text_to_speech.js:32-43` — user text/path is executable Python source.** Evidence: direct interpolation into a `python3 -c` program. Direction: pass values as data, never source.
5. **`src/commands/imessage.js:102-103` — message and recipient shell injection.** Evidence: configured path, recipient, and text are concatenated into one `execSync` string. Direction: reuse the file's `execFileSync(imsgPath, args)` implementation.
6. **`src/utils/skills.js:54-61` — downloaded skill metadata can execute shell syntax.** Evidence: untrusted `requires.bins[]` becomes `${bin} --version`. Direction: validate a single executable token and probe with `execFileSync`.
7. **`src/utils/mcp.js:117-125` — configured MCP command is interpolated into a shell.** Direction: store command and args separately and use `execFileSync`.
8. **`src/utils/worktree.js:61-62,100,176-177` — model-provided worktree identifiers/branches reach Git shell strings.** Evidence: virtual tools pass arguments at `repl.js:404` and `code_v5.js:365`. Direction: strict identifier validation plus Git argument arrays.
9. **Turkish-unsafe matching remains in core memory/session paths** (files/lines in §4.3). Evidence: `İstanbul`.toLowerCase() does not equal `istanbul`; affected code includes memory search and dedup. Direction: centralize all natural-language normalization through `foldTr` and add capital-İ/dotless-I regression tests.

### Medium

10. **`src/tools/sub_agent.js:63-88` — missing required task still makes a provider call.** Evidence: `{}` reached the configured provider and returned HTTP 402. Direction: validate before network work.
11. **`src/commands/clickclack.js:13-18` — notification text enters shell/PowerShell source.** Direction: argument arrays or platform APIs.
12. **`src/commands/signal.js:440,454-463` — configured path/URL enters shell strings.** Direction: argument arrays and native HTTP probing.
13. **`src/commands/admin-rpc.js:174` — authenticated `lines` parameter is both shell-interpolated and Unix-only.** Direction: clamp an integer and tail the file in Node.
14. **`src/commands/sandbox.js:96` — sandbox name enters a Docker shell command.** Direction: validate identifier and use `execFileSync('docker', ['rm','-f',name])`.
15. **`src/tools/plugin.js:114-132` — incomplete GitHub plugin download reports success.** Evidence: non-200/error responses still advance the completion counter. Direction: require and validate all mandatory files, clean partial directory, return failure details.
16. **Silent no-op deletion/untrack responses** in `memory_write.js:195-199`, `workflow.js:652-656`, `file_state.js:44-46`, and `memory_tree.js:137-155`. Direction: use existence/delete counts and return `success:false` or explicit `changed:false` when nothing changed.
17. **`src/tools/memory.js:131-142` — JSON memory bridge discards write failures.** Direction: propagate the bridge failure or return an explicit partial-failure result.
18. **`src/tools/skills_download.js:176-188` — missing additional files are silently accepted.** Direction: collect per-file outcomes and distinguish complete from partial installation.
19. **Plain-Windows portability failures** in `shell_command.js:16`, `browser_use.js:68-70`, `code_execution.js:38-39`, and `text_to_speech.js:32`. Direction: platform-aware executable selection or pure-Node implementations.
20. **Eleven executable tools use `parameters` instead of required `inputSchema`** (§2). Direction: standardize exports and retain fallback only for third-party compatibility.
21. **`skill_view.js:21` and `skills_autoload.js:51,69,93` throw on missing required text.** Direction: validate and return structured errors before `.toLowerCase()`/lookup.
22. **54/92 tool files have zero filename/name signal in tests** (§3), including high-blast-radius process, communication, credential, and mutation tools. Direction: prioritize valid/invalid-action tests with mocked FS/process/network layers.

### Low

23. **`src/tools/workflow.js:19-23,182,246,265` advertises internal `agentic-runner` as a tool and overcounts by one.** Direction: derive the list/count from the executable manifest.
24. **`npm run lint` carries 346 warnings.** This does not fail the gate, but the noise reduces the signal of new warnings. Direction: ratchet warning count down or make selected reliability rules errors.
25. **Explicit arbitrary-command features retain string-shell execution** (`bash.js:82`, `shell_command.js:16`, `code.js:481-486`, `terminal.js:48`, `sandbox.js:118`). These are intentional capabilities, but policy parsing is their only boundary. Direction: document them as privileged, minimize model exposure, and tokenize commands whenever shell grammar is not required.

**Finding count: 25 total — 9 High, 13 Medium, 3 Low.** Coverage gaps are counted as one aggregate quality issue in this total, not 54 separate defects.

## 6. What was not covered

- No source was modified and no fix was attempted.
- No destructive valid-action mutation was live-tested. The requested empty/minimal structural calls were executed; two malformed calls unexpectedly reached the configured provider, which is itself reported above.
- No live browser, messaging, calendar, Home Assistant, Microsoft Graph, media-provider, or filesystem mutation sampling was performed; that belongs to the companion execution pass.
- "Coverage found" is based on the required broad filename/name search, not statement/branch instrumentation for each tool. Because textual hits can be incidental, this audit makes no claim that the other 38 tools have adequate behavioral coverage.
- All 92 tool files were covered by the load/shape/empty-execute harness; all 92 were included in the coverage mapping; the full `src`, `bin`, and `scripts` trees were searched for the five known reliability patterns. Mutating matches were manually reviewed for concrete no-op/partial-success paths.
