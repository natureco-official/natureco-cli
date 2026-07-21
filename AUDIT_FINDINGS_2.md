# NatureCo CLI Real-Execution Audit — Pass 2

Audit target: commit `6693a9a` (`v5.67.5`)  
Audit date: 2026-07-21  
Scope: `src/tools/*.js`; 92 files, of which `agentic-runner.js` is an internal helper and 91 export `execute()`.

The required preflight `git status --short` produced no output. The worktree was clean before any audit harness or report file was created.

## 1. Environment notes

- Platform: Windows (`win32`), PowerShell 5.1, Node `v24.15.0`.
- Current commit was independently confirmed as `6693a9a`.
- Real `~/.natureco/config.json` was read only to determine capabilities. It contains configured primary/provider credentials, provider host `api.abliteration.ai`, model `abliterated-model`, a configured Telegram token/chat, and enabled skills. No search provider, memory provider, Browser Use key, or specialist provider key was configured. Secret values were never copied into the harness or report.
- The process environment contained `ANTHROPIC_API_KEY`. It was deliberately removed from every isolated execution process to prevent accidental paid calls.
- Available executables included Node, npm, Git, Git Bash, Windows PowerShell, Python 3.12, FFmpeg, ripgrep, and `pdftotext`. Chrome and Edge were installed. `browser-use`, ADB, Docker, SoX/`rec`, `edge-tts`, `say`, `osascript`, and `screencapture` were absent.
- Persistent tool calls ran with both `HOME` and `USERPROFILE` redirected to a unique temporary home containing an empty `.natureco/config.json`; working files were under a unique temporary directory. Temporary state was removed after each sweep. The real `~/.natureco` was not passed to tool execution.
- A loopback HTTP server was used for `http_request`, `searxng`, `url_safety`, and `web_readability`. DuckDuckGo-backed tools made three real, free, read-only searches. No paid API round-trip was completed.
- Paid/provider-backed tools were given realistic inputs but stopped at an isolated missing-credential/configuration guard. `image_generation` was instead run with an intercepted `fetch` to inspect the exact request without network or cost; that interception exposed finding M2.
- Coverage: every one of the 91 executable modules had `execute()` invoked. There were 147 invocations in total. Three initial harness mistakes (`discord` action `format`, `pii_redact.preserveTypes=true`, and `text_to_speech.provider=file`) were excluded from evidence and rerun with their schema-valid values (`format_message`, `['ip']`, and `save`). No tool was claimed as fully end-to-end tested merely because its platform or credential guard ran.

## 2. Per-tool execution log

`$TMP` below means the isolated audit working directory; `$AUDIT_HOME` means its isolated home.

| Tool file | Realistic call(s) and observed behavior |
|---|---|
| `approval.js` | Called `request` for deletion of a temporary fixture, then `status`, `respond:approve`, and `list`. The same in-memory entry was observed through the lifecycle and left no pending item. |
| `async_delegation.js` | Called `start` with prompt `Return the word AUDIT`, `toolset:none`, and `model:audit-model`; an actual benign Node child was spawned. `status` later reported `completed`, exit 0, and the child output. |
| `audio_understanding.js` | Called `transcribe` on a real minimal `$TMP/sample.wav` with OpenAI and language `en`. It returned `success:false, openai API key gerekli` before network; no cost. |
| `bash.js` | Ran `printf "audit-bash-ok"` through the real Git Bash executable and returned the expected text with success. |
| `blueprint.js` | Created `audit-blueprint` with two `{{file}}` steps, executed with `file=sample.txt`, loaded it, and deleted it. Substitution and disk persistence were verified. |
| `browser.js` | Called `close`; it returned success without opening a browser. A full visible-browser session was deliberately not started (section 3). |
| `browser_use.js` | Called `doctor`. It actually probed the local CLI and returned `browser-use CLI bulunamadi`; no cloud request was attempted. |
| `calendar_add.js` | Called with a real title, timestamp, 15-minute duration, and notes. The Windows guard returned `Calendar sadece macOS'ta desteklenir`; no calendar mutation occurred. |
| `canvas.js` | Rendered a realistic two-column table. The returned formatted output contained the title, headers, and row, with `rendered:true`. |
| `checkpoint.js` | Saved structured checkpoint data, loaded it, listed it, and deleted it under `$AUDIT_HOME`. Readback matched the write. |
| `clarify.js` | Called with a choice question, two options, and context. It returned the advertised structured clarification object. |
| `code_execution.js` | Executed real Node code printing `{audit:true,sum:5}` in `$TMP`. It selected the installed Node interpreter and returned exit 0 and correct stdout. |
| `computer_use.js` | `info` correctly reported `win32`. A real read-only `mouse_position` call failed because PowerShell could not resolve `[System.Windows.Forms.Cursor]`; finding M1. |
| `computer_use_loop.js` | Called with valid goal `Observe whether Notepad is open without changing anything` and `maxSteps:1`. The isolated provider guard returned `Provider not configured` before screenshot, GUI action, or API call; no cost. |
| `cron_create.js` | Created `audit-hourly` from preset `every hour` and command `node audit-task.js`. `$AUDIT_HOME/.natureco/crons.json` existed and contained normalized schedule `0 * * * *`; response transparently said application-internal only and `systemCrontab:false`. |
| `cross_session_memory.js` | Listed sessions for `audit-user` in isolated state and correctly returned an empty successful result. |
| `dashboard.js` | In a short-lived child, `start` on port 17421 returned success and `/api/stats` answered HTTP 200. A schema-valid `stop` call was then rejected as unsupported; finding M4. |
| `delegate_task.js` | Spawned the real CLI with task `Return exactly AUDIT`, agent `general`, and a 3-second bound. The isolated child exited 1 with the clean message that login was required; no provider call or spend occurred. |
| `discord.js` | Called schema-valid `format_message` with channel `audit` and a realistic message. It returned `**#audit**\nNatureCo execution sample`; no webhook was contacted. |
| `document_extract.js` | Extracted an actual TXT fixture. It reported `.txt`, 6 words, 42 characters, `truncated:false`, and exact content. |
| `duckduckgo.js` | Made a real free search for `NatureCo CLI GitHub` and returned three relevant results. Returned URLs were protocol-relative DuckDuckGo redirect strings and text retained HTML entities; finding M5. |
| `edit_file.js` | Replaced unique `beta` with `BETA` in `$TMP/edit.txt`. Disk readback was exactly `alpha BETA gamma`. |
| `exa_search.js` | Called with query, max 2, and type `auto`. It returned a clear missing-Exa-key error before network; no cost. |
| `file_search.js` | Searched `$TMP` for `*.txt`, max 20. It found the three expected fixtures with correct names, relative paths, types, and sizes. |
| `file_state.js` | Tracked a real file, changed it, checked it, diffed it, then untracked it. `check` detected modification; `diff` then correctly compared against the updated baseline; cleanup succeeded. |
| `filesystem.js` | Listed `$TMP` and returned all six fixture files with types and byte sizes. |
| `firecrawl.js` | Called scrape mode on `https://example.com/` with markdown format. It stopped at the missing-key guard before network; no cost. |
| `git.js` | Called `status --short` from the isolated cwd. The tool located the project repository and returned the then-untracked audit harness, proving the real Git process path worked. No mutation operation was used. |
| `google_meet.js` | Called `info` for a valid `https://meet.google.com/abc-defg-hij` URL. It returned valid meeting metadata without opening a browser or creating an event. |
| `grep_search.js` | Searched actual TXT fixtures for `Istanbul`, case-insensitive, `*.txt`, max 10. It used ripgrep and returned the correct file, line 2, and text. |
| `homeassistant.js` | Called `get_state` for `light.audit_lamp`. It returned the explicit missing `HASS_URL`/`HASS_TOKEN` error before network or physical-state access. |
| `http_request.js` | POSTed `{value:42}` with a custom header to the loopback fixture. It returned HTTP 200, response headers, and the server-confirmed method/path/body. |
| `image_generation.js` | Called with prompt `A single blue circle on white`, explicit `provider:openai`, size 1024², and `n:1`, with `fetch` intercepted. It claimed `provider:pollinations`, but the captured request was `POST https://api.openai.com/v1/images/generations` with the correct prompt body; finding M2. No packet left the machine and no credit was spent. |
| `kanban.js` | Added a real temporary card, moved it from `todo` to `done`, verified it in `view`, then cleared the board. All isolated persistence transitions matched the responses. |
| `list_dir.js` | Listed `$TMP`; returned the same six files and byte sizes as present on disk. |
| `llm_task.js` | Called with a real prompt, JSON input, required JSON schema, OpenAI provider, and `maxTokens:8`. It returned the missing-key error before request construction/network; no cost. |
| `mac_alarm.js` | Called `list` with a realistic time/label. It cleanly returned `Sadece macOS`; the underlying alarm path was not exercisable. |
| `mac_app_open.js` | Called for `TextEdit`; returned `macOS'a ozgu` before spawning anything. |
| `mac_app_quit.js` | Called for `TextEdit`; returned `macOS'a ozgu` before spawning anything. |
| `mac_notify.js` | Called with title, message, and subtitle; returned `macOS'a ozgu` before spawning anything. |
| `macos_screenshot.js` | Called with `$TMP/screen.png`; returned `Sadece macOS` and created no screenshot. |
| `media_understanding.js` | Called on a real one-pixel PNG with an analysis prompt and explicit OpenAI provider. It returned `OpenAI API key gerekli` before network; no media left the machine and no cost was incurred. |
| `memory.js` | Added a user fact, searched for `deterministic`, and removed it. Both the store and JSON bridge reported success in the isolated home, search found the exact fact, and removal returned the removed content. |
| `memory_provider.js` | With explicit `provider:file`, added, searched, listed, removed, and cleared `audit-user` memory, then queried status. The formerly broken constructor path now worked; registry listed nine providers and the isolated record was removed. |
| `memory_search.js` | Searched isolated memory/session state for `deterministic`, scope `all`, max 5. It correctly returned no results after prior cleanup. |
| `memory_tree.js` | Built the index, appended `Prefers deterministic audits`, found it by search, and removed it. Disk-backed isolated lifecycle succeeded and reported `removed:1`. |
| `memory_write.js` | Added a confirmed scored preference for `audit-user`, read it back with `show`, and cleared it. Verification and cleanup succeeded. |
| `microsoft_graph.js` | Called `list_emails`, top 3. It returned the explicit missing Graph token error before network or mailbox access. |
| `model_provider.js` | Called `status` and `list`. It loaded and instantiated all five registered model providers without network; the prior provider-constructor failure did not recur. |
| `music_generation.js` | Called Suno with a realistic two-second ambient prompt. It returned the missing-key error before network/generation; no cost. |
| `notebook_edit.js` | Read cell 0 from a real notebook, added a code cell, updated it, and deleted it. JSON disk contents remained valid and the added cell was cleaned up. |
| `notes_add.js` | Called with realistic title, body, and folder. The Windows guard returned `Notes sadece macOS'ta`; no note was created. |
| `parallel_search.js` | Made a real free search with providers `['duckduckgo']`, max 2. It returned two relevant results tagged `_provider:duckduckgo`; it also propagated the malformed URL/entity issue in M5. |
| `phone_control.js` | Called a realistic Pushover notification. It returned the missing token/user error before network or external delivery. |
| `phone_control_enhanced.js` | Called `status` for group `audit`. It actually probed capabilities and returned `adbAvailable:false`, no armed state, and no push configuration; no device mutation. |
| `pii_redact.js` | Called with realistic email, phone, and IP; mode `mask`; `preserveTypes:['ip']`. It masked email/phone, preserved the IP, and reported two findings with correct types. |
| `plan.js` | Called `list` in isolated state and returned zero plans without LLM/network work. `create` was not sent to the configured real provider. |
| `plugin.js` | Called `list` in isolated state. It returned zero installed plugins and the four built-in marketplace entries; no install/download occurred. |
| `read_file.js` | Read lines 2–3 from a real file with numbering. It returned exactly the requested lines and correct pagination metadata. |
| `reminder_add.js` | Called with title, due date, list, and notes. The Windows guard returned `Reminders sadece macOS'ta`; no reminder was created. |
| `search_provider.js` | Called `status` and `list`. Registry contained DuckDuckGo, Exa, SearXNG, and Tavily; availability accurately showed no Exa/Tavily key and no network occurred. |
| `searxng.js` | Queried a loopback endpoint with query, categories, and max 2. The request completed and the tool safely interpreted the non-SearX fixture as an empty result set. |
| `send_message.js` | Sent a realistic message to platform `terminal`; it returned success locally. Email/webhook/external delivery was deliberately not performed. |
| `session_search.js` | Searched isolated session history for `NatureCo`, session `all`, limit 5. It correctly returned no matches and identified the searched scope. |
| `shell_command.js` | Ran `echo audit-shell-ok` through the actual Windows shell in `$TMP`; exit 0 and stdout were correct. |
| `skill_find.js` | Searched for `deterministic evidence`, max 5. It executed normally and returned scored installed-skill matches; no mutation/network. |
| `skill_generate.js` | Called with a realistic checksum-workflow description and explicit skill name. It returned `Provider ayarli degil` under isolation before LLM/network/write; no cost. |
| `skill_manage.js` | Created a valid frontmatter-backed `audit-skill`, used it in read/discovery calls, then deleted it. All writes stayed under `$AUDIT_HOME`. |
| `skill_view.js` | Loaded the created `audit-skill` and returned its name, description, category, and exact body. |
| `skills_autoload.js` | Called with a realistic request for deterministic audit evidence. It executed successfully and honestly reported no detected skill for that message. |
| `skills_download.js` | Called `list_sources`; returned the allowlisted source catalog. No repository content was downloaded or installed. |
| `skills_list.js` | Called with category `audit`; returned an empty successful list (the temporary skill's normalized category was `general`). |
| `skills_marketplace.js` | Searched for `SEO` and returned the built-in SEO Audit entry with metadata and instructions. No install/uninstall occurred. |
| `social_open.js` | Called with `platform:github`, `username:natureco-official`. To avoid changing the user's visible browser, process creation was intercepted: it constructed `cmd /c start "" https://github.com/natureco-official` and would report the correct URL. No browser was actually opened. |
| `soul.js` | Called `show` under the isolated home/cwd. It returned a clear not-found result and enumerated every searched location rather than fabricating identity content. |
| `speech_to_text.js` | Called Whisper on a real local WAV with language `en`. It returned the missing-key error before upload/network; no media left the machine and no cost. |
| `spotify.js` | Called `search` for `Nature sounds` with no client credentials. It returned the explicit client-ID/secret error before network. |
| `structural_patch.js` | Previewed and applied an anchored replacement with the exact pre-hash, verified changed disk text, then rolled back by returned patch ID and verified the original bytes. Rollback succeeded but omitted the tool-level `success` field; finding L1. |
| `sub_agent.js` | Called with task, context, and `maxTokens:8`. It returned `Provider not configured` before HTTPS; no model call or cost. |
| `text_to_speech.js` | Called schema-valid `provider:save` with realistic text and `$TMP/speech.txt`. It returned success and disk readback exactly matched the input text. No speech provider was contacted. |
| `thread_ownership.js` | Assigned `audit-thread-1` to `audit-agent`, queried status, and released it. Isolated config readback matched each transition. |
| `todo_write.js` | Added a realistic high-priority owned task, started it, completed it, and removed it. IDs and lifecycle states were consistent and isolated state was cleaned. |
| `url_safety.js` | Called `full` on a loopback HTTP URL. It made the real status request and returned `safe:true`, correct domain/protocol, and normalized URL. |
| `video_generation.js` | Called Runway with a realistic one-second animation prompt/model. It returned the missing-key error before network or generation; no cost. |
| `voice_chat.js` | Called `test`; Windows guard returned `Voice chat sadece macOS'ta` before recording, playback, or API use. |
| `web_readability.js` | Fetched real loopback HTML and returned title `Audit Page`, description `Local fixture`, and readable body text within the requested 500-character cap. |
| `web_search.js` | Made a real free search with explicit `provider:duckduckgo`, max 3. Dispatch worked and results were relevant, but it propagated M5's malformed redirect URLs/entities. |
| `workflow.js` | A schema-valid local `save` under empty config failed solely because no LLM provider was configured. After installing only a dummy unreachable provider config, `save`, `list`, `load`, and `delete` all succeeded without network; finding M3. |
| `write_file.js` | Created `$TMP/written/audit.txt`, including its parent directory. Response size was 29 bytes and disk readback matched exactly. |
| `x_search.js` | Called with query `NatureCo CLI`, max 10. It returned the explicit missing X key error before network; no cost. |
| `youtube_ac.js` | Called with realistic query `NatureCo CLI demo` on Windows. It returned `macOS'e özgü` before URL/process construction despite a platform-neutral description; finding M6. |

## 3. Tools deliberately not exercised end-to-end

Every executable module was reached; none was simply “not reached.” The following underlying operations were deliberately stopped short:

- `audio_understanding.js` — valid local audio reached the missing-key guard; completing transcription would upload media and incur provider cost.
- `browser.js` — only lifecycle `close` was called; opening its visible persistent profile would disturb GUI/user browser state.
- `browser_use.js` — `doctor` was run; neither the missing CLI nor a Browser Use cloud key was available.
- `calendar_add.js` — only the Windows platform guard was exercisable; AppleScript Calendar is unavailable.
- `computer_use_loop.js` — valid goal reached the isolated provider guard; no screenshot/GUI mutation or paid vision call was permitted.
- `discord.js` — local formatter was exercised; no audit message was sent to a real webhook/recipient.
- `exa_search.js` — valid query reached the missing-key guard; no Exa API call.
- `firecrawl.js` — valid URL reached the missing-key guard; no scrape/crawl API call.
- `google_meet.js` — `info` was exercised; no calendar event or real browser tab was created.
- `homeassistant.js` — valid entity query reached the missing-service guard; no Home Assistant instance was configured.
- `image_generation.js` — request construction was intercepted because all generation providers can transmit prompts and some incur cost; no image API call completed.
- `llm_task.js` — valid schema-constrained task reached the missing-key guard; no paid LLM call.
- `mac_alarm.js` — only the Windows guard was exercisable; macOS Clock/Calendar is unavailable.
- `mac_app_open.js` — only the Windows guard was exercisable; macOS `open` is unavailable.
- `mac_app_quit.js` — only the Windows guard was exercisable; AppleScript is unavailable.
- `mac_notify.js` — only the Windows guard was exercisable; AppleScript notifications are unavailable.
- `macos_screenshot.js` — only the Windows guard was exercisable; `screencapture` is unavailable.
- `media_understanding.js` — a real PNG reached the missing-key guard; no private image upload or paid vision call.
- `microsoft_graph.js` — valid mail-list action reached the missing-token guard; no tenant was configured.
- `music_generation.js` — valid short prompt reached the missing-key guard; no paid generation.
- `notes_add.js` — only the Windows guard was exercisable; Apple Notes/AppleScript is unavailable.
- `phone_control.js` — valid push reached the missing-credential guard; no real notification was sent.
- `phone_control_enhanced.js` — capability/status was exercised; ADB was absent and camera/SMS/device mutation was not attempted.
- `plan.js` — local list was exercised; create would call the real configured LLM, so it was not completed.
- `plugin.js` — list was exercised; no untrusted download/install/uninstall was needed for behavior verification.
- `reminder_add.js` — only the Windows guard was exercisable; Apple Reminders/AppleScript is unavailable.
- `send_message.js` — terminal delivery was exercised; email/webhook delivery lacked a safe audit recipient and would create external side effects.
- `skill_generate.js` — valid generation reached the isolated provider guard; no paid LLM call or generated instruction installation.
- `skills_download.js` — source discovery was exercised; network download/install was unnecessary and would mutate installed skills.
- `social_open.js` — exact Windows process construction was intercepted; launching it would alter the user's visible browser state.
- `speech_to_text.js` — real audio reached the missing-key guard; no upload or paid transcription.
- `spotify.js` — valid search reached the missing-client-credential guard; no Spotify token/API call.
- `sub_agent.js` — valid task reached the isolated provider guard; no paid model call.
- `video_generation.js` — valid prompt reached the missing-key guard; no paid generation/polling.
- `voice_chat.js` — only the Windows guard was exercisable; macOS plus SoX are required and no microphone capture was attempted.
- `x_search.js` — valid query reached the missing-key guard; no X API call.
- `youtube_ac.js` — its own Windows guard prevented the advertised browser action; opening a real tab was also intentionally avoided.

For these non-completed paths, focused source review found no new unsafe shell interpolation, Turkish-text normalization, or false-success issue beyond pass 1, except the separately reported description/platform mismatch M6 and request-routing defect M2.

## 4. Prioritized new findings

These findings are new relative to `AUDIT_FINDINGS_1.md`. Pass-1 issues that were rechecked successfully (notably `memory_provider` construction and missing-goal validation in `computer_use_loop`) are not repeated.

### High

No new High-severity defect was found.

### Medium

#### M1. `src/tools/computer_use.js:287-300` — advertised Windows `mouse_position` action is broken

- **Problem:** The Windows PowerShell expression references `[System.Windows.Forms.Cursor]` without loading the `System.Windows.Forms` assembly.
- **Reproduction/evidence:** `execute({action:'mouse_position'})` on this Windows machine returned `success:false` with `Unable to find type [System.Windows.Forms.Cursor]`. Running the same expression after `Add-Type -AssemblyName System.Windows.Forms` returned the real coordinates `0, 514`.
- **Impact:** A documented read-only GUI primitive fails on a supported platform, weakening any agent flow that needs current cursor coordinates.
- **Fix direction:** Prepend `Add-Type -AssemblyName System.Windows.Forms` in the same PowerShell invocation (and do the same for other Windows cursor branches if they rely on implicit assembly loading); add a Windows integration test.

#### M2. `src/tools/image_generation.js:135-147` — fallback changes the provider label/key but keeps the old provider implementation

- **Problem:** `providerConfig` is captured before the missing-key fallback rewrites `provider` to `pollinations`. The call then uses the old provider implementation with `apiKey='free'`, while the response labels the result as Pollinations.
- **Reproduction/evidence:** With empty isolated config, `execute({prompt:'A single blue circle on white',provider:'openai',size:'1024x1024',n:1})` was run with `fetch` intercepted. The returned result claimed `success:true, provider:'pollinations'`, but the captured request was `POST https://api.openai.com/v1/images/generations` with the prompt body. No network/cost was incurred in the audit.
- **Impact:** Provider reporting and actual data destination disagree; without interception, the prompt is sent to a provider with a bogus bearer key and ordinarily fails instead of using the claimed fallback. This is a provider-boundary trust failure.
- **Fix direction:** Resolve `providerConfig` only after final provider/key selection, or return a missing-key error for an explicitly selected provider. Test every explicit provider with and without credentials and assert both destination and response label.

#### M3. `src/tools/workflow.js:178-189,610-657` — local save/load/list/delete require unrelated LLM configuration

- **Problem:** The function rejects all actions up front when `providerUrl` or `providerApiKey` is absent, even though `save`, `load`, `list`, and `delete` are local filesystem operations placed much later in the function.
- **Reproduction/evidence:** Under empty isolated config, a valid `save` with name and one step returned `Provider ayarli degil`. Writing only a dummy unreachable provider URL/key caused `save`, `list`, `load`, and `delete` to succeed; no network was made by those actions.
- **Impact:** Users cannot manage already-saved local workflows while logged out, offline, or before provider setup, contrary to the advertised action model.
- **Fix direction:** Move the provider requirement into only `run`, `plan`, and any retry branch that genuinely invokes the model. Add no-provider lifecycle tests for all local actions.

#### M4. `src/tools/dashboard.js:336-345` — schema advertises `stop`, but execution rejects it

- **Problem:** `inputSchema.action` enumerates `start` and `stop`, while `execute` implements only `start` and returns `Dashboard sadece start komutunu destekler` for everything else. The server handle is not retained for later closure.
- **Reproduction/evidence:** `start` on 17421 returned success and `/api/stats` answered 200 in a short-lived child. `execute({action:'stop',port:17421})` returned `success:false` with the unsupported message.
- **Impact:** An agent can start a listener it cannot stop through the advertised tool, potentially leaving the port occupied for the REPL lifetime.
- **Fix direction:** Retain server instances keyed by port and implement idempotent `stop`, or remove `stop` from schema/description if lifecycle ownership is intentionally external. Test start→probe→stop→connection-refused.

#### M5. `src/tools/duckduckgo.js:33-40` and `src/providers/search/duckduckgo.js:24-31` — real searches return malformed/encoded result data

- **Problem:** Regex extraction returns DuckDuckGo's raw protocol-relative redirect (`//duckduckgo.com/l/?uddg=...&amp;rut=...`) and strips tags without decoding HTML entities. The unified and parallel search tools propagate this output.
- **Reproduction/evidence:** Three real free searches (`duckduckgo`, `web_search` with explicit DuckDuckGo, and `parallel_search`) returned relevant results, but URLs began `//duckduckgo.com/...` and contained literal `&amp;`; snippets included `&amp;amp;`/`&#x27;`.
- **Impact:** Result URLs are not self-contained absolute URLs and can fail in URL consumers; titles/snippets shown to users are visibly corrupted.
- **Fix direction:** Decode HTML entities, resolve protocol-relative URLs, and preferably extract/decode the `uddg` target URL. Share one parser between both implementations and test against a stored real HTML fixture.

#### M6. `src/tools/youtube_ac.js:39,90-98` — advertised browser-opening tool is entirely disabled on Windows

- **Problem:** The description/input schema present a general “open YouTube in the current browser” tool and do not state macOS-only support, but the first runtime branch rejects every non-macOS call. This is inconsistent with `social_open.js`, which already implements Windows URL opening.
- **Reproduction/evidence:** On this Windows machine, `execute({query:'NatureCo CLI demo'})` immediately returned `success:false, error:"macOS'e özgü"`; no URL was constructed.
- **Impact:** The entire primary use case is unavailable on a common platform despite platform-neutral advertising, leading agents to select a tool that can never succeed.
- **Fix direction:** Reuse the cross-platform `openUrlProc` behavior from `social_open.js` (`cmd /c start` on Windows, `xdg-open` on Linux), or explicitly scope the description/schema and registration to macOS.

### Low

#### L1. `src/tools/structural_patch.js:18` — successful rollback has a different success envelope from preview/apply

- **Problem:** `preview` and `apply` translate engine results into `{success:true,...}`, but `rollback` returns the engine result directly as `{ok:true,...}` with no `success` field.
- **Reproduction/evidence:** A real apply returned `{success:true,ok:true,id:...}` and changed `one anchor two` to `one ANCHOR two`. `execute({action:'rollback',patchId:id})` restored the exact original bytes but returned only `{ok:true,id,path,hash}`.
- **Impact:** Agents/callers that consistently key on tool-level `success` can treat a completed rollback as ambiguous or failed.
- **Fix direction:** Normalize rollback through the same envelope: `result.ok ? {success:true,...result} : {success:false,...result}`; add an execute-level lifecycle test, not only an engine test.

**New finding count: 7 total — 0 High, 6 Medium, 1 Low.**

## 5. What was not completed and why

- No executable tool file was unreached: all 91 had `execute()` invoked. The internal `agentic-runner.js` was correctly excluded as a non-tool.
- Branch coverage was not exhaustive. This pass prioritized realistic primary paths, all mutation/process/network surfaces, and the 54 zero-test-signal tools identified in pass 1. Secondary actions such as every Git operation, every notebook error branch, every provider variant, and every GUI gesture were not exhaustively sampled.
- Paid API success responses were not tested because doing so would transmit audit fixtures and spend real credit. Valid-shaped missing-credential execution or intercepted construction was used and explicitly identified above.
- macOS AppleScript behavior could not be tested on Windows. Only the actual platform guards plus focused source review were covered.
- Browser-visible and real external communication/device actions were not completed because they would alter user or third-party state. Their guards, local modes, status paths, or exact process construction were sampled instead.
- The primary configured provider and Telegram credential were intentionally not exercised. They were relevant only to environment capability assessment and were never copied into isolated tool processes.

All temporary audit homes, work files, local servers, and child processes were removed or terminated. The only intended remaining untracked file is this report.
