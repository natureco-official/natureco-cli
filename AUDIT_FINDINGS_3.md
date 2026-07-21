# NatureCo CLI Command-Surface Quality Audit — Pass 3

Audit target: commit `b1002cd` (`v5.68.3`), `src/commands/*.js` (107 files). This was a read/investigate-only pass. No source file, package version, or prior audit was changed.

Precondition: `git rev-parse --short HEAD` returned `b1002cd`; `git status --porcelain=v1 --untracked-files=all` returned no entries before the audit.

## 1. Quality-gate baseline results

| Gate | Exact result | Status |
|---|---:|---|
| `npm test` | 95/95 test files passed; 880 passed, 3 skipped, 883 total; duration 44.58 s | Pass |
| `npm run lint` | 354 warnings, 0 errors across configured `src/`, `bin/`, and `test/`; exit 0 | Pass with warnings |
| Command-only ESLint count (`npx eslint src/commands -f json`) | 107 files; 53 files with findings; 180 warnings, 0 errors; exit 0 | Pass with warnings |
| `npm audit` | 0 info, 0 low, 0 moderate, 0 high, 0 critical; 0 total vulnerabilities; 490 dependencies (313 prod, 148 dev, 59 optional, 26 peer) | Pass |
| `node --check` over every command file | 107 passed, 0 failed | Pass |

The tests emitted one Git line-ending warning for `README.md`; the file was not modified and the worktree remained clean.

## 2. Structural check results

### Method

One inline Node harness enumerated all 107 files and ran each file in its own child process. Load checks used a normal `require()`. Minimal-call checks used a second isolated process with a 4-second parent timeout, a nonexistent isolated `HOME`/`USERPROFILE`/`XDG_CONFIG_HOME`, and interception of child-process launches and outbound network APIs. It invoked a function export directly, or the first conventional callable object export (`run`, `execute`, `main`, `handler`, `command`). This avoided creating a harness file in the repository.

### Totals

- Loadability: **107/107 passed**, 0 throws, 0 hangs.
- Export shape: 105 direct callable entry points; 2 helper/object exports (`channel-helper.js`, `reset.js`).
- Minimal invocation: **92/105 callable exports failed safely or returned normally** (73 returned, 19 emitted a controlled exit); **13/105 failed the structural safety criterion** (11 raw exceptions, 2 immediate blocked side effects).
- The two object exports were not counted as callable passes or failures. `reset.js` exports `{ reset }`; `channel-helper.js` exports `{ checkExistingToken }`.

### Failure table

| File | Result | Evidence |
|---|---|---|
| `src/commands/agent.js:13` | Raw `TypeError` | Reads `args.length` when `args` is undefined. |
| `src/commands/code.js:361` | Raw `TypeError` | Reaches `bot.id` with no selected bot. The registered `acp` alias reproduces this through the real CLI (finding M-07). |
| `src/commands/config.js:15` | Raw `TypeError` | Destructures undefined `args`. |
| `src/commands/crestodian.js:5` | Raw `TypeError` | Calls `args.includes(...)` on undefined. |
| `src/commands/docs.js:12` | Raw `TypeError` | Calls `args.join(...)` on undefined. |
| `src/commands/message.js:30` | Raw `TypeError` | `parseFlags` reads `args.length` on undefined. |
| `src/commands/migrate.js:38` | Raw `TypeError` | Reads `options.from` on undefined. |
| `src/commands/repl.js:1068` | Raw `TypeError` | Reads `args.length` on undefined. |
| `src/commands/security.js:130` | Raw `TypeError` | Default audit path calls `args.includes(...)` on undefined. |
| `src/commands/skills.js:15` | Raw `TypeError` | Destructures undefined `args`. |
| `src/commands/tools.js:19` | Raw `TypeError` | Reads `args[0]` on undefined. |
| `src/commands/dna.js:21` | Immediate side effect | No-argument call tries `spawnSync('codedna', ...)`; the harness blocked it. |
| `src/commands/gateway-server.js:202` | Immediate side effect | No-argument call defaults to starting a detached gateway process; the harness blocked `spawn`. |

Most raw exceptions are hidden by Commander adapters that supply arrays or required operands, so they are ranked together as Low rather than as 11 separate user-facing CLI failures. The `acp` route is an exception and is ranked separately because the real CLI reaches the crash.

## 3. Reliability-pattern findings

### 3.1 Unix-only external commands on plain Windows

**No real plain-Windows occurrence found.** The two literal `which imsg` calls are macOS-only in reachable control flow: `imessage.js:223-226,263` rejects non-macOS probe calls, and `gateway-server.js:300-307,1609` starts its iMessage provider only on Darwin. `signal.js:481` explicitly chooses `where signal-cli` on Windows. No spawned `grep`, `sed`, `awk`, or `cat` occurrence runs on plain Windows.

One reverse portability defect was found: `src/commands/daemon.js:69-75` always invokes Windows `taskkill`, with no platform branch, so `natureco daemon stop` cannot stop the daemon on Linux/macOS (M-06).

### 3.2 Shell command strings containing external, user, or configured input

Real matches:

| File | Input source and evidence | Why it matters |
|---|---|---|
| `src/commands/imessage.js:249` | Configured `imessageCliPath` is interpolated into `execSync(\`"${imsgPath}" --help 2>&1\`)`. | A path containing shell metacharacters executes in a shell. A capture harness used an existing fake path under a directory containing literal `$(AUDIT_MARKER)` and observed that exact substitution in the command string. Use `execFileSync(imsgPath, ['--help'], ...)`. Ranked H-03. |
| `src/commands/doctor.js:201` | `BASE_DIR`, derived from externally controlled home-directory state, is embedded in `df -k ${JSON.stringify(BASE_DIR)} \| tail -1`. | JSON double quotes do not suppress `$()` expansion in POSIX shells. The capture harness observed `$(AUDIT_MARKER)` intact inside the command. Use `execFileSync('df', ['-k', BASE_DIR])` and parse its output in JS. Ranked M-01. |
| `src/commands/code.js:482-498` | `/run <text>` and a project `package.json` test script reach `execSync(cmd)`. | This is intentionally a command runner, but the boundary is a shell string. It is not independently ranked because the human explicitly requests `/run` and package scripts are shell commands by design; keep it approval-gated and do not feed model/config text into it implicitly. |
| `src/commands/sandbox.js:110-127` | User command text reaches `execSync(command)`. | Explicit shell-execution feature, currently unreachable with operands through its registration bug. If made reachable, parse executable/arguments or clearly preserve it as an approval-gated shell boundary. |
| `src/commands/terminal.js:39-48` | User command text reaches `execSync(cmd)`. | Explicit terminal feature. It is a deliberate shell boundary, not an accidental interpolation, but should remain approval-gated and never accept untrusted indirect input. |

Excluded after review: `dashboard.js:84-86` uses a constant loopback URL; `gateway-server.js:2287,2311` and `signal.js:339,360` interpolate PIDs parsed as integers; `policy.js:93` uses a drive derived from the filesystem root.

### 3.3 Plain `.toLowerCase()` on Turkish user-facing matching/search

**None found.** There are 45 textual occurrences, but the reviewed uses are ASCII command names, provider/model IDs, filenames, confirmation keys, sensitive-key names, or an intentional one-time legacy filename lookup (`repl.js:187`). Turkish-facing memory identity/search paths use `foldTr`, including `repl.js:178,207,213` and `docs.js:2`. No genuine Turkish user-text comparison remained that should be changed to `foldTr`.

### 3.4 Mutations or external actions reported without a real success result

Real matches:

- `src/commands/message.js:168-177,225-255,306-334,376-470` writes only local history when the gateway call fails, says the operation was “logged for later dispatch,” and exits 0. There is no queue consumer. Live execution with a fake Telegram token and unreachable loopback gateway printed that message and exited 0. The same pattern covers send, poll, react, edit, delete, pin, unpin, thread reply, sticker, role, and moderation (H-04).
- `src/commands/message.js:600-710` records event creation, timeout, kick, and ban only in local JSONL files but reports the external channel action as completed. No channel API result is checked (H-04).
- `src/commands/nodes.js:218-223,265-325` reports approval/rejection and mock invocation/location results without changing pending-node state or contacting a node (M-04).
- `src/commands/cron.js:382-417` reports “Cron triggered (mock)” and persists a run with `status: 'success'` even though nothing was dispatched (M-06).
- `src/commands/browser.js:285-705` mutates local state or writes placeholder output while operations such as open, navigate, click, type, screenshot, snapshot, and PDF are explicitly unimplemented CDP calls (M-03).
- `src/commands/gateway.js:25-42,120-128,131-208,291-294` returns a mock successful RPC response and simulates discovery/service installation/removal/run rather than checking a gateway or service manager (M-05).

### 3.5 Credential/secret/token output and non-restrictive files

Real matches:

- **Full or substantial credential output:** `config.js:99` echoes the complete value after `config set`, including sensitive keys; `admin-rpc.js:197` echoes arbitrary `config.set` values and `admin-rpc.js:359-362` prints the complete admin bearer token; `secrets.js:80` prints a requested secret in full; `devices.js:80,110,120`, `device-pair.js:144`, and `nodes.js:215` print pairing credentials. The live CLI printed the entire fake provider key for both `config set providerApiKey ...` and `secrets get providerApiKey`.
- **Unsolicited token prefixes/suffixes:** `channel-helper.js:28`, `discord.js:60,109`, `slack.js:65,114`, `telegram.js:50,119,174`, and `mattermost.js:58,92` expose up to 20 leading token characters. Live status calls printed `xoxb-FAKE-SLACK-TOKE...` and `123456789:FAKE_TELEG...`. `infer.js:1406,1408`, `setup.js:413`, and `gateway.js:54` expose smaller fragments. `secrets.js:40-49` intentionally shows six leading and four trailing characters.
- **Files containing secrets without restrictive creation modes:** `setup.js:280-282,531` writes `providerApiKey` and channel tokens to `~/.natureco/config.json` with no `mode` or `chmod`; `configure.js:17-19,73-82` does the same for provider keys; `backup.js:43-48` writes the complete config fallback into `~/.natureco-backups/*.json` without a restrictive directory or file mode. `onboard.js:17-20` also bypasses the hardened config writer and never repairs permissions. On POSIX with the common `022` umask these new files/directories default to `0644`/`0755`. In contrast, `src/utils/config.js:37-44,96-104` correctly enforces `0700`/`0600`, and `admin-rpc.js:71` creates its token file with `0600`.

The explicit `secrets get` and initial pairing-token displays are intentional retrieval/handoff operations, but they still reach stdout and therefore redirected logs. They should require an explicit reveal flag and preferably a TTY. The unsolicited channel prefixes and `config set` echo are defects (H-02); insecure secret-bearing files are H-01.

## 4. Command-registration cross-check results

### Reachability and missing implementations

An automated literal-require graph started at `bin/natureco.js` and followed command-to-command `require('./...')` edges.

- 103 files are directly loaded or lazy-loaded by `bin/natureco.js`.
- `channel-helper.js` is transitively reachable from channel implementations.
- **104/107 files are reachable.**
- **Dead files:** `src/commands/acp.js`, `src/commands/memory.js`, and `src/commands/tui.js`.
- **Missing/misnamed registered implementations:** none. Every literal command-module require from `bin/natureco.js` resolves to an existing file.
- `acp` is registered as an alias to `code.js`, not to the dead `acp.js`; `memory` intentionally points to `memory-cmd.js`, leaving `memory.js` dead.

### Registration defects and description drift

1. `bin/natureco.js:784-788` registers `backup <action>` and forwards only `[action]`. `backup.js:16-17` needs a filename for `restore`/`verify`. Actual `natureco backup restore missing.tar.gz` dropped the filename and exited 1 with “Backup file gerekli.”
2. `bin/natureco.js:929-933` registers `sandbox <action>` and forwards only `[action]`. `sandbox.js:20-22` needs names/command operands. Actual `natureco sandbox create auditbox` ignored `auditbox` and created `sandbox-<timestamp>`; the exact marker-backed audit directory was then removed. Destroy and exec cannot receive their required operands through the CLI. These are grouped as M-02.
3. `bin/natureco.js:998-1003` advertises `acp` as a code alias but calls legacy `code.js`. In a clean isolated profile, actual `natureco acp` exited 1 through the global unhandled-rejection handler: `Cannot read properties of undefined (reading 'id')` (M-08).
4. The registered `browser` description at `bin/natureco.js:973-976` promises browser automation, but most named operations are local-state stubs (`browser.js:285-705`) (M-03).
5. The `node`/`nodes` descriptions at `bin/natureco.js:890-902` imply host/network management, but run/install and most network actions are stub/mock; `nodes pending` is advertised but has no action branch, while implemented `pair`/`rename` are omitted from the description (M-04/L-03).
6. The gateway description at `bin/natureco.js:385-394` promises `call`, `discover`, `install`, `uninstall`, and `run`; those paths are explicitly mock/manual/no-op in `gateway.js` (M-05).
7. Other help drift (L-03): `security` advertises only `audit` although `security.js:14-20` implements `allowlist`, `policy`, and `secrets`; `directory` advertises `query|search` while `directory.js` accepts `self|peers|search|register|remove|groups` and rejects `query`; `sandbox` omits its source-level `exec`; `webhooks` says `gmail` but the actual actions are `gmail setup` and `gmail run`; `code` claims 47 tools at `bin/natureco.js:261`, while the live v5 banner loaded 106.

## 5. Targeted live-execution log

The main sampling profile was `C:\Users\info\AppData\Local\Temp\natureco-audit3-oa5tFb`, with a fake provider key, fake Slack/Telegram tokens, and `ws://127.0.0.1:9`. Child-process launches and non-loopback fetches were blocked. The profile was validated under the audit temp prefix and deleted after the run. No API credit was used and no external request was allowed.

| # | File / realistic invocation | What happened |
|---:|---|---|
| 1 | `admin-rpc.js` → `['status']` | Returned stopped status and 13 methods; no server started. |
| 2 | `gateway-server.js` → `'status'` | Returned “Gateway not running”; no process spawned. |
| 3 | `gateway.js` → `'status'` | Returned local provider/model/skills status. |
| 4 | `signal.js` → `'status'` | Returned “Signal not connected”; no process/network call. |
| 5 | `imessage.js` → `'status'` | Returned “iMessage not connected”; correctly avoided macOS tooling. |
| 6 | `sandbox.js` → `['list']` | Returned no sandboxes; blocked Docker probe was caught. |
| 7 | `setup.js` → `['status']` | Read isolated config, reported setup complete and missing data directories. |
| 8 | `account.js` → `'whoami'` | Returned not logged in; fake provider key was not treated as NatureCo login. |
| 9 | `secrets.js` → `['list']` | Listed four fake secrets with six-leading/four-trailing masks. |
| 10 | `devices.js` → `['list']` | Returned no paired devices. |
| 11 | `dashboard.js` → `['status']` | Loopback port check returned dashboard stopped; no server opened. |
| 12 | `proxy.js` → `['status']` | Returned stopped and disclosed that `run` is a stub. |
| 13 | `backup.js` → `['list']` | Returned no backups; no archive command. |
| 14 | `browser.js` → `['status']` | Returned stopped, zero tabs, and isolated state path. |
| 15 | `terminal.js` → `['list']` | Returned no sessions; no shell command. |
| 16 | `repl.js` → `[]` | Raw `TypeError` (`args.length`), confirming structural failure. |
| 17 | `code_v5.js` → undefined target | Scanned the repository read-only, loaded 106 tools, printed the interactive banner, then returned on closed stdin; no model call. |
| 18 | `message.js` → fake Telegram send to unreachable loopback | Printed “message logged for later dispatch” and emitted exit 0 despite no dispatch, proving H-04. |
| 19 | `update.js` → `['status']` | Version check process was blocked; handled it as “Could not check latest version.” |
| 20 | `uninstall.js` → `['dry-run']` | Printed intended removals; deleted nothing. |
| 21 | `slack.js` → `'status'` | Printed `xoxb-FAKE-SLACK-TOKE...`, confirming a 20-character token-prefix leak. |
| 22 | `telegram.js` → `'status'` | Printed `123456789:FAKE_TELEG...` and fake allowlist, confirming token-prefix leak. |

Additional actual-entrypoint probes (each under a fresh disposable profile):

- `natureco sandbox create auditbox` ignored `auditbox`, created an auto-named temp sandbox, and exited 0. The directory was identified by its `.natureco-sandbox` marker, validated under the exact temp base, removed, and confirmed absent.
- `natureco backup restore missing.tar.gz` lost the filename and exited 1.
- `natureco acp` exited 1 with an unhandled `bot.id` failure.
- `natureco config set providerApiKey AUDIT_FAKE_SECRET_123456789` echoed the full fake key; `natureco secrets get providerApiKey` printed it again.
- Parameter-bearing controls (`node status node1`, `nodes status node1`, `devices pair phone mobile`, `proxy query needle`, `qr verify payload`, and `transcripts show abc`) showed that Commander itself permits the extra operands; the backup/sandbox failures are specifically their adapters dropping parameters. The fake device created by `devices pair` existed only in its deleted disposable profile.
- A no-execution interception harness for `imessage probe` and `doctor check diskSpace` captured command strings containing literal `$(AUDIT_MARKER)` from configured path/home input. No captured string was executed.

## 6. Prioritized findings

### High (4)

**H-01 — Secret-bearing config and backup files can be created world-readable on POSIX.**  
Files: `src/commands/setup.js:280-282,531`; `src/commands/configure.js:17-19,73-82`; `src/commands/backup.js:25-27,43-48`; supporting bypass at `src/commands/onboard.js:17-20`.  
Evidence: direct `writeFileSync(..., 'utf8')` and default-mode directory creation bypass the hardened `src/utils/config.js:37-44,96-104`. Setup/configure persist provider/channel credentials; fallback backup serializes the whole config.  
Fix direction: use the shared hardened config writer; create all secret directories `0700`, files `0600`, and chmod existing paths; make backup archives/fallbacks `0600`.

**H-02 — Commands expose full credentials or long reusable token prefixes on stdout.**  
Files: `config.js:99`; `admin-rpc.js:197,359-362`; `channel-helper.js:28`; `discord.js:60,109`; `slack.js:65,114`; `telegram.js:50,119,174`; `mattermost.js:58,92`; `secrets.js:80`; related pairing/token outputs at `devices.js:80,110,120`, `device-pair.js:144`, `nodes.js:215`.  
Evidence: live fake-key tests reproduced full `config set`/`secrets get` output and 20-character Slack/Telegram prefixes. Redirected command output, CI logs, terminal scrollback, and screen sharing retain them.  
Fix direction: never echo a value from `config set`; default all status/get paths to a constant “configured” marker or last four characters; require explicit `--reveal`, an interactive TTY, and a warning for intentional retrieval/handoff.

**H-03 — Configured iMessage binary path is shell-injectable.**  
File: `src/commands/imessage.js:249`.  
Evidence: a no-execution harness captured `"...natureco-audit3-$(AUDIT_MARKER)-...\\imsg" --help 2>&1`. POSIX shells perform command substitution inside double quotes. Existence checking the path does not neutralize metacharacters.  
Fix direction: `execFileSync(imsgPath, ['--help'], { encoding, timeout })`, capture stderr without `2>&1`, and validate executable type/ownership where appropriate.

**H-04 — Messaging/moderation commands return success without dispatching or queueing the operation.**  
File: `src/commands/message.js:168-177,225-255,306-334,376-470,600-710`.  
Evidence: live fake Telegram send to an unreachable loopback gateway printed “logged for later dispatch” and exited 0. Code only appends history; no retry consumer exists. Event/timeout/kick/ban paths similarly write local JSONL and describe the external mutation as completed.  
Fix direction: return nonzero on dispatch failure unless a durable queue accepted the job; implement queue IDs/retry state; label local-only simulation explicitly; require and verify provider acknowledgements before success output.

### Medium (8)

**M-01 — Doctor disk-space check interpolates home-path input into a POSIX shell pipeline.**  
File: `src/commands/doctor.js:194-207`.  
Evidence: capture harness retained literal `$(AUDIT_MARKER)` inside the double-quoted path. The failure path also reports “Unable to determine disk space” as a passing check at `doctor.js:209-210`.  
Fix direction: invoke `df` with an argument array, parse in JS, and return warning/failure when measurement is unavailable.

**M-02 — Backup and sandbox registration adapters discard required operands.**  
Files: `bin/natureco.js:784-788,929-933`; `src/commands/backup.js:11-17`; `src/commands/sandbox.js:16-22`.  
Evidence: real CLI probes dropped backup filenames and sandbox names; sandbox created the wrong auto-name. Restore/verify/destroy/exec are consequently unusable or incorrect.  
Fix direction: register `[params...]`/specific operands and forward `[action, ...params]`; add CLI integration tests asserting exact arguments.

**M-03 — Registered browser automation is mostly stateful simulation.**  
Files: `bin/natureco.js:973-976`; `src/commands/browser.js:285-705`.  
Evidence: open/navigate/click/type/press/resize/etc. only update local state or print “CDP ... would be called”; screenshot writes no image, snapshot writes mock HTML, PDF writes no PDF.  
Fix direction: wire a real CDP client and verify protocol results/files, or narrow help and exit nonzero for unsupported actions.

**M-04 — Node management reports mock/no-op operations as if actionable.**  
Files: `src/commands/node.js:36-42,66-68`; `src/commands/nodes.js:218-223,265-325`; registration at `bin/natureco.js:890-902`.  
Evidence: approval/rejection do not modify state; invoke returns `[mock] invocation sent`; camera/screen/location data are simulated; node run/install are explicit stubs.  
Fix direction: connect to the node transport/state store and verify acknowledgements; until then, remove/mark commands experimental and return nonzero.

**M-05 — Gateway help exposes mock RPC/discovery/service lifecycle commands.**  
Files: `src/commands/gateway.js:25-42,120-208,291-294`; `bin/natureco.js:385-394`.  
Evidence: `call` prints a fabricated `{ ok: true }`; discovery returns fixed mock hosts; install/uninstall print manual commands; run does not start a process.  
Fix direction: route RPC to the real gateway client and implement platform service adapters, or remove these actions from normal help and never fabricate success.

**M-06 — Cron run persists a successful run record without executing the cron.**  
File: `src/commands/cron.js:382-417`.  
Evidence: it prints “triggered (mock)” then writes `status: 'success'` and `Mock run ...`. This corrupts operational history and monitoring.  
Fix direction: dispatch through the real scheduler/channel, persist pending/running/success/failure transitions, and only mark success after acknowledgement.

**M-07 — Daemon stop is Windows-only despite a platform-neutral command.**  
File: `src/commands/daemon.js:69-75`; registration `bin/natureco.js:828-832`.  
Evidence: unconditional `taskkill` has no Linux/macOS branch; start uses a cross-platform detached Node child.  
Fix direction: persist a PID, validate process identity, use `process.kill`/signals on POSIX and `execFile('taskkill', args)` on Windows.

**M-08 — Registered `acp` alias crashes in a clean profile.**  
Files: `bin/natureco.js:998-1003`; `src/commands/code.js:352-361`; dead alternative `src/commands/acp.js`.  
Evidence: actual `natureco acp` exited 1 via the global unhandled-rejection handler with `Cannot read properties of undefined (reading 'id')`.  
Fix direction: point the alias at the same guarded v5 code entry as `code`, or register the ACP implementation intentionally; handle empty bot lists before `bot.id`.

### Low (4)

**L-01 — Eleven callable exports throw raw TypeErrors on minimal invocation.**  
Files/lines: `agent.js:13`, `code.js:361`, `config.js:15`, `crestodian.js:5`, `docs.js:12`, `message.js:30`, `migrate.js:38`, `repl.js:1068`, `security.js:130`, `skills.js:15`, `tools.js:19`.  
Fix direction: normalize entry arguments (`args = []`, `options = {}`), then emit usage or a typed/handled error. (`code.js` is separately user-facing through H/M findings.)

**L-02 — Three command files are dead.**  
Files: `src/commands/acp.js`, `src/commands/memory.js`, `src/commands/tui.js`.  
Evidence: absent from the 104-file registration/import reachability closure.  
Fix direction: remove obsolete files or explicitly register the intended implementation; add a reachability test over `src/commands`.

**L-03 — Several registered descriptions have drifted from implementation.**  
Files: `bin/natureco.js:261,723-729,843-848,898-902,929-933,973-976`; `security.js:14-20`; `directory.js:26-41`; `nodes.js:13-166`; `sandbox.js:16-25`; `webhooks.js:20-29`.  
Evidence: code claims 47 tools while live v5 loaded 106; security omits three action families; directory advertises rejected `query`; nodes advertises nonexistent `pending`; sandbox omits `exec`; Gmail requires an undocumented second-level action.  
Fix direction: derive help/action lists from a single command schema and test every advertised action against dispatcher branches.

**L-04 — Sandbox creation lacks the traversal validation used by destruction.**  
File: `src/commands/sandbox.js:71-81` versus validation at `sandbox.js:88-100`.  
Evidence: `createSandbox(name)` joins an unchecked name to the temp root; `../...` can escape it when called directly or after M-02 is fixed. Destroy correctly uses `SAFE_SANDBOX_NAME_RE`.  
Fix direction: apply the same name validator before `path.join`, resolve the final path, and enforce containment under `SANDBOX_DIR`.

**Finding count: 16 total — 4 High, 8 Medium, 4 Low.** No genuine Turkish-folding defect or Unix-command-on-Windows defect was found; no registered implementation was missing/misnamed.

## 7. What was not completed

Nothing required was omitted. All 107 files received syntax, loadability, registration-reachability, and static reliability scans; all 105 callable exports received the automated minimal-call test. Live execution covered 22 high-risk command files plus focused actual-entrypoint and interception probes.

Limits: destructive branches (real uninstall/reset/delete), real daemon/server startup, external channel delivery, Docker operations, package installation/update, and paid provider calls were deliberately not executed. Their code paths were reviewed statically or exercised with blocked process/network calls, fake credentials, loopback endpoints, and disposable profiles. This was not a full behavioral test of every subcommand in all 107 files; it was full static/structural coverage plus risk-prioritized live sampling as requested.
