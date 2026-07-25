/**
 * Tool gating — one policy for every agent surface.
 *
 * The risk table and the screening sequence used to live inside the
 * interactive agent (src/commands/code_v5.js). The headless agent
 * (src/utils/headless.js, reachable from the WhatsApp `!code` command and the
 * gateway) called executeTool directly, so it ran with no risk assessment, no
 * plan mode, no permission rules and no hooks — the same model, the same
 * tools, none of the brakes.
 *
 * Screening now lives here and both surfaces use it. They differ only in how
 * an approval question is answered: interactively a human is asked; headless
 * there is nobody to ask, so anything that would have prompted is refused and
 * the refusal is reported back to the model as a tool result.
 */

const { getLang } = require('./i18n');
const { getPlanMode } = require('./plan-mode');
const { checkPermission, isApproved, markApproved, formatPermissionPrompt } = require('./permissions');
const { checkPreHooks, permissionSummary } = require('./tool-hooks');

const L = (tr, en) => (getLang() === 'en' ? en : tr);

/**
 * Tools with effects outside the conversation — refused under dry-run.
 *
 * `code_execution` belongs here and was the hole that made --dry-run a lie:
 * asked to create a file with write_file refused, the model simply ran a
 * three-line Python snippet through it and the file appeared anyway. It is an
 * arbitrary interpreter, so it is strictly more capable than bash, not less.
 */
const MUTATING_TOOLS = new Set([
  'write_file', 'edit_file', 'structural_patch', 'notebook_edit',
  'bash', 'shell_command', 'code_execution', 'git', 'plugin', 'skill_manage',
  'cron_create', 'delegate_task', 'canvas', 'checkpoint',
  'computer_use', 'computer_use_loop', 'phone_control', 'phone_control_enhanced',
  'browser_use', 'send_message', 'discord',
  'image_generation', 'video_generation', 'music_generation', 'text_to_speech',
  'memory_write', 'calendar_add', 'reminder_add', 'notes_add', 'mac_alarm',
]);

/**
 * Destructive operations expressed in an interpreted language rather than a
 * shell. `code_execution` runs Python/Node, where a delete looks like
 * `shutil.rmtree(...)`, not `rm -rf`.
 */
const CODE_RISK_RULES = [
  { re: /\b(shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir|pathlib\.Path\([^)]*\)\.unlink)\b/, level: 'high', tr: 'Dosya/klasör silme (Python)', en: 'File or directory deletion (Python)' },
  { re: /\bfs\.(rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync)\b/, level: 'high', tr: 'Dosya/klasör silme (Node)', en: 'File or directory deletion (Node)' },
  { re: /\b(subprocess|os\.system|os\.popen|child_process|execSync|spawnSync)\b/, level: 'high', tr: 'Kod içinden kabuk komutu', en: 'Shell command from inside code' },
  { re: /\b(socket|requests\.post|urllib\.request|fetch\()/, level: 'medium', tr: 'Kod içinden ağ erişimi', en: 'Network access from inside code' },
];

/**
 * Windows/PowerShell counterparts of the POSIX risk rules.
 * Matched against the lower-cased command string.
 */
const WINDOWS_RISK_RULES = [
  // Recursive / forced deletion
  { re: /\bremove-item\b[^|;]*\s-(recurse|force)\b/, level: 'high', tr: 'Özyinelemeli silme', en: 'Recursive delete' },
  { re: /\b(ri|rd|rmdir)\b\s+(\/s|\/q|-recurse)/, level: 'high', tr: 'Klasör silme', en: 'Directory delete' },
  { re: /\bdel\b\s+.*(\/s|\/q|\/f)/, level: 'high', tr: 'Zorla dosya silme', en: 'Forced file delete' },
  { re: /\bclear-content\b/, level: 'medium', tr: 'Dosya içeriğini boşaltma', en: 'File truncation' },
  // Disk / volume
  { re: /\b(format|diskpart|clear-disk|initialize-disk|set-partition)\b/, level: 'high', tr: 'Disk işlemi', en: 'Disk operation' },
  { re: /\bvssadmin\b.*\bdelete\b/, level: 'high', tr: 'Gölge kopya silme', en: 'Shadow copy deletion' },
  { re: /\bcipher\b\s+\/w/, level: 'high', tr: 'Güvenli silme', en: 'Secure wipe' },
  { re: /\bbcdedit\b/, level: 'high', tr: 'Önyükleme yapılandırması', en: 'Boot configuration' },
  // Privilege / policy
  { re: /-verb\s+runas\b/, level: 'high', tr: 'Yetki yükseltme', en: 'Privilege escalation' },
  { re: /\bset-executionpolicy\b/, level: 'high', tr: 'Çalıştırma politikası değişikliği', en: 'Execution policy change' },
  { re: /\b(takeown|icacls)\b/, level: 'medium', tr: 'Sahiplik/izin değişikliği', en: 'Ownership or permission change' },
  { re: /\bnet\s+(user|localgroup)\b.*\/add/, level: 'high', tr: 'Kullanıcı hesabı ekleme', en: 'User account creation' },
  { re: /\breg\b\s+delete\b|\bremove-itemproperty\b/, level: 'high', tr: 'Kayıt defteri silme', en: 'Registry deletion' },
  // Process / power
  { re: /\btaskkill\b.*\/f|\bstop-process\b.*-force\b/, level: 'high', tr: 'Süreç sonlandırma', en: 'Process termination' },
  { re: /\b(stop-computer|restart-computer|shutdown)\b/, level: 'high', tr: 'Sistemi kapatma/yeniden başlatma', en: 'Shutdown or restart' },
  // Remote code execution
  { re: /\b(iwr|irm|invoke-webrequest|invoke-restmethod|curl|wget)\b[^|]*\|\s*(iex|invoke-expression)/, level: 'high', tr: 'İnternet üzerinden script çalıştırma', en: 'Running a script from the internet' },
  { re: /\b(iex|invoke-expression)\b/, level: 'medium', tr: 'Dinamik kod çalıştırma', en: 'Dynamic code execution' },
];

const WINDOWS_SYSTEM_PATHS = [
  'c:\\windows', 'c:/windows', '%systemroot%', '%windir%',
  'c:\\program files', 'c:/program files', 'hklm:', 'hkey_local_machine',
];

function matchWindowsRisk(cmd) {
  for (const rule of WINDOWS_RISK_RULES) {
    if (rule.re.test(cmd)) return { level: rule.level, reason: L(rule.tr, rule.en) };
  }
  if (WINDOWS_SYSTEM_PATHS.some(p => cmd.includes(p))) {
    return { level: 'high', reason: L('Sistem dizinine erişim', 'System directory access') };
  }
  return null;
}

/**
 * Risk level of a single tool call — only risky operations need approval.
 * @returns {{requiresApproval: boolean, reason: string, level: string}}
 */
function assessRisk(tool, args = {}) {
  if (tool === 'code_execution') {
    const code = String(args.code || args.script || '');
    const lower = code.toLowerCase();
    for (const rule of CODE_RISK_RULES) {
      if (rule.re.test(code)) {
        return { requiresApproval: true, level: rule.level, reason: `${L(rule.tr, rule.en)}: code_execution` };
      }
    }
    // A `language: "bash"` snippet is just a shell command in disguise.
    const shellRisk = matchWindowsRisk(lower);
    if (shellRisk) {
      return { requiresApproval: true, level: shellRisk.level, reason: `${shellRisk.reason}: code_execution` };
    }
    if (/\brm\s+-[rf]/.test(lower) || lower.includes('sudo ')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Yıkıcı kabuk komutu', 'Destructive shell command')}: code_execution` };
    }
  }

  if (tool === 'bash' || tool === 'shell_command') {
    const cmd = (args.command || args.cmd || '').toLowerCase();

    if (/\brm\s+(-[rf]+\s+)*/.test(cmd) || /rmdir/.test(cmd)) {
      return { requiresApproval: true, level: 'high', reason: `${L('Dosya silme komutu', 'File deletion command')}: ${args.command}` };
    }
    if (cmd.includes('sudo ') || cmd.includes('doas ')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Yetki yükseltme', 'Privilege escalation')}: ${args.command}` };
    }
    if (cmd.includes('dd if=') || cmd.includes('mkfs') || cmd.includes('fdisk')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Disk işlemi', 'Disk operation')}: ${args.command}` };
    }
    if (cmd.match(/^\s*mv\s+.*\/(?:\.|\.\.)/)) {
      return { requiresApproval: true, level: 'medium', reason: `${L('Üzerine yazma riski', 'Overwrite risk')}: ${args.command}` };
    }
    if (/chmod\s+(-[rR]+\s+)*777/.test(cmd) || /chown\s+-R/.test(cmd)) {
      return { requiresApproval: true, level: 'medium', reason: `${L('İzin değişikliği', 'Permission change')}: ${args.command}` };
    }
    if (/git\s+push.*--force/.test(cmd) || /git\s+push.*-f\s/.test(cmd)) {
      return { requiresApproval: true, level: 'high', reason: `${L('Zorla push', 'Force push')}: ${args.command}` };
    }
    if (/git\s+reset\s+--hard/.test(cmd)) {
      return { requiresApproval: true, level: 'high', reason: `Hard reset: ${args.command}` };
    }
    if (cmd.includes('/etc/') || cmd.includes('/usr/') || cmd.includes('/var/') || cmd.includes('/system/')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Sistem dizinine erişim', 'System directory access')}: ${args.command}` };
    }
    if (/curl.*\|\s*(bash|sh)/.test(cmd) || /wget.*\|\s*(bash|sh)/.test(cmd)) {
      return { requiresApproval: true, level: 'high', reason: `${L('İnternet üzerinden script çalıştırma', 'Running a script from the internet')}: ${args.command}` };
    }
    if (cmd.includes('killall') || cmd.includes('pkill') || cmd.includes('kill -9')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Süreç sonlandırma', 'Process termination')}: ${args.command}` };
    }
    if (cmd.includes('.natureco') && (cmd.includes('rm') || cmd.includes('mv'))) {
      return { requiresApproval: true, level: 'high', reason: `${L('NatureCo dizininde tehlikeli işlem', 'Dangerous operation in the NatureCo directory')}: ${args.command}` };
    }

    // Every rule above matches POSIX syntax only. On Windows the shell is cmd
    // or PowerShell, where a recursive delete, an elevation or a disk wipe
    // otherwise sails through with no prompt.
    const winRule = matchWindowsRisk(cmd);
    if (winRule) {
      return { requiresApproval: true, level: winRule.level, reason: `${winRule.reason}: ${args.command}` };
    }
  }

  if (tool === 'mac_app_quit') {
    return { requiresApproval: true, level: 'medium', reason: `${L('Uygulama kapatma', 'App quit')}: ${args.app || args.name || '?'}` };
  }

  if (tool === 'write_file' || tool === 'edit_file') {
    const target = (args.path || args.filePath || args.file || '').toLowerCase();
    if (target.includes('.env') || target.includes('credentials') || target.includes('secret')) {
      return { requiresApproval: true, level: 'high', reason: `${L('Hassas dosya', 'Sensitive file')}: ${args.path || args.filePath}` };
    }
    // Compare on a separator-normalized path: on Windows the raw value uses
    // backslashes, so the POSIX-shaped needles never matched and writes into
    // .ssh or the Windows directory went through unprompted.
    const normalized = target.replace(/\\/g, '/');
    const systemNeedles = ['/etc/', '/usr/', '/.ssh/', 'c:/windows', 'c:/program files', '/system32/'];
    if (systemNeedles.some(needle => normalized.includes(needle))) {
      return { requiresApproval: true, level: 'high', reason: `${L('Sistem dosyası', 'System file')}: ${args.path || args.filePath}` };
    }
    if (normalized.includes('.natureco/config.json') || normalized.includes('.natureco/soul/')) {
      return { requiresApproval: true, level: 'medium', reason: `${L('NatureCo config dosyası', 'NatureCo config file')}: ${args.path || args.filePath}` };
    }
  }

  return { requiresApproval: false, level: 'low', reason: '' };
}

/**
 * Build the screening function for one agent surface.
 *
 * @param {object} deps
 * @param {object} deps.agentCore            loop-guardrail controller
 * @param {boolean} [deps.dryRun]            refuse mutating tools
 * @param {(prompt: string) => Promise<boolean>} [deps.confirm]
 *        Ask a yes/no question. Omit for non-interactive surfaces, where every
 *        approval-requiring call is refused instead.
 * @param {(prompt: string) => Promise<'once'|'session'|'persistent'|'no'>} [deps.askPermission]
 * @param {(message: string) => void} [deps.log]
 * @returns {(name: string, args: object) => Promise<string|null>}
 *          A refusal string, or null when the call may execute.
 */
function createToolGate(deps = {}) {
  const { agentCore, dryRun = false } = deps;
  const log = deps.log || (() => {});
  const interactive = typeof deps.confirm === 'function';

  const refuseUnattended = what => L(
    `Onay gerektiren işlem otomatik modda reddedildi (${what}). Bu adımı etkileşimli \`natureco code\` oturumunda çalıştırın.`,
    `An operation requiring approval was refused in unattended mode (${what}). Run this step in an interactive \`natureco code\` session.`,
  );

  return async function screenToolCall(name, args = {}) {
    if (agentCore) {
      const guard = agentCore.assess({ name, input: args });
      if (guard.blocked) return guard.reason || 'blocked_by_guardrails';
    }

    if (dryRun && MUTATING_TOOLS.has(name)) {
      return L(
        `DRY RUN: ${name} çalıştırılmadı (--dry-run etkin, hiçbir değişiklik yapılmıyor).`,
        `DRY RUN: ${name} was not executed (--dry-run is active, no changes are made).`,
      );
    }

    const risk = assessRisk(name, args);
    if (risk.requiresApproval) {
      if (!interactive) {
        log(`⛔ ${risk.reason}`);
        return refuseUnattended(risk.reason);
      }
      const approved = await deps.confirm(`⚠ ${name}: ${risk.reason}\n  ${L('Devam edilsin mi', 'Continue')}? (y/N) `);
      if (!approved) {
        log(L('⚠ Kullanıcı onayı iptal etti, tool çalıştırılmadı.', '⚠ User declined approval, tool not run.'));
        return L('Kullanıcı bu aracı onaylamadı.', 'The user declined to approve this tool call.');
      }
    }

    const planMode = getPlanMode();
    const planCheck = planMode.checkTool(name, args);
    if (!planCheck.allowed) {
      log(L('⛔ Plan modunda engellendi: ', '⛔ Blocked in plan mode: ') + planCheck.reason);
      return `${L('Plan modunda engellendi', 'Blocked in plan mode')}: ${planCheck.reason}`;
    }
    planMode.recordTool(name, args);

    const perm = checkPermission(name, args);
    if (perm.action === 'deny') {
      log(L('⛔ İzin engelledi: ', '⛔ Permission denied: ') + perm.reason);
      return `${L('İzin engelledi', 'Permission denied')}: ${perm.reason}`;
    }
    if (perm.action === 'ask') {
      const permKey = `${perm.rule.raw}:${JSON.stringify(args)}`;
      if (!isApproved(permKey)) {
        if (!interactive) {
          log(`⛔ ${perm.reason}`);
          return refuseUnattended(perm.reason);
        }
        const grant = await deps.askPermission(
          `${L('İzin gerekli', 'Permission required')}: ${formatPermissionPrompt(name, args, perm.reason)}\n  ` +
          `${L('İzin ver', 'Grant')}? [y=${L('bir kez', 'once')}, s=${L('oturum', 'session')}, p=${L('kalıcı', 'persistent')}, n=${L('hayır', 'no')}] `,
        );
        if (grant === 'persistent') markApproved(permKey, true);
        else if (grant === 'session' || grant === 'once') markApproved(permKey, false);
        else {
          log(L('⛔ İzin reddedildi', '⛔ Permission rejected'));
          return L('Kullanıcı izin vermedi.', 'The user did not grant permission.');
        }
      }
    }

    const hook = checkPreHooks(name, args);
    if (hook.action === 'deny') {
      log(L('⛔ Hook engelledi: ', '⛔ Hook blocked: ') + hook.rule.raw);
      return `${L('Hook engelledi', 'Hook blocked')}: ${hook.rule.raw}`;
    }
    if (hook.action === 'ask') {
      if (!interactive) {
        log(`⛔ hook: ${hook.rule.raw}`);
        return refuseUnattended(`hook ${hook.rule.raw}`);
      }
      const ok = await deps.confirm(`${L('Hook onayı', 'Hook approval')}: ${permissionSummary(hook.rule, name, args)}\n  ${L('İzin verilsin mi', 'Grant permission')}? (y/N) `);
      if (!ok) {
        log(L('⛔ Hook reddetti: ', '⛔ Hook rejected: ') + hook.rule.raw);
        return `${L('Hook reddetti', 'Hook rejected')}: ${hook.rule.raw}`;
      }
    }

    return null;
  };
}

module.exports = {
  assessRisk,
  matchWindowsRisk,
  createToolGate,
  MUTATING_TOOLS,
  WINDOWS_RISK_RULES,
};
