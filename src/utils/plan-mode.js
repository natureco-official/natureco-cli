/**
 * plan-mode — Plan Mode (Claude Code EnterPlanMode/ExitPlanMode)
 *
 * Plan mode lets the model research, explore, and create a plan
 * without making any changes. All write/destructive operations are blocked.
 *
 * Tools:
 *   EnterPlanMode — switch to plan-only mode
 *   ExitPlanMode — exit plan mode, present plan to user
 *
 * State transitions:
 *   NORMAL → (EnterPlanMode) → PLANNING → (ExitPlanMode) → REVIEW → (approve) → NORMAL
 *                                                                     → (reject) → PLANNING
 */

const STATE = {
  NORMAL: 'normal',
  PLANNING: 'planning',
  REVIEW: 'review',
};

class PlanMode {
  constructor() {
    this.state = STATE.NORMAL;
    this.plan = null;
    this.steps = [];
    this.filesRead = [];
    this.commandsRun = [];
    this.planHistory = [];
  }

  enter() {
    if (this.state !== STATE.NORMAL) return false;
    this.state = STATE.PLANNING;
    this.plan = null;
    this.steps = [];
    this.filesRead = [];
    this.commandsRun = [];
    return true;
  }

  exit(planContent) {
    if (this.state !== STATE.PLANNING) return false;
    this.plan = planContent;
    this.state = STATE.REVIEW;
    this.planHistory.push({
      plan: planContent,
      steps: [...this.steps],
      at: Date.now(),
    });
    return true;
  }

  approve() {
    if (this.state !== STATE.REVIEW) return false;
    this.state = STATE.NORMAL;
    return true;
  }

  reject() {
    if (this.state !== STATE.REVIEW) return false;
    this.state = STATE.PLANNING;
    return true;
  }

  isPlanning() {
    return this.state === STATE.PLANNING;
  }

  inReview() {
    return this.state === STATE.REVIEW;
  }

  isNormal() {
    return this.state === STATE.NORMAL;
  }

  getSystemPrompt() {
    if (this.state === STATE.PLANNING) {
      return [
        'You are in PLAN MODE. You MUST NOT make any changes to files or execute destructive commands.',
        'You can: read files, search code, browse the web, explore the codebase.',
        'You MUST NOT: write/edit files, run git commands that change history, install packages, or execute destructive bash commands.',
        'Create a detailed step-by-step plan. When ready, use ExitPlanMode to present your plan.',
        '',
        'Plan format (markdown):',
        '## Plan: <title>',
        '### Step 1: <action>',
        '  - Files: <paths>',
        '  - Changes: <description>',
        '### Step 2: ...',
      ].join('\n');
    }
    return '';
  }

  /**
   * Check if a tool is allowed in current mode.
   * Returns { allowed, reason }
   */
  checkTool(toolName, args) {
    if (this.state !== STATE.PLANNING) return { allowed: true };

    const writeTools = new Set([
      'write_file', 'edit_file', 'edit', 'write',
      'file_write', 'file_edit', 'rename_file', 'delete_file',
      'move_file', 'copy_file', 'create_file',
    ]);
    const destructiveBash = [
      'rm', 'mv', 'cp', 'dd', 'mkfs', 'format', '>', '>>', '|',
      'chmod', 'chown', 'ln', 'git push', 'git commit', 'git merge',
      'git rebase', 'git reset', 'npm publish', 'npm install',
      'pip install', 'brew install', 'apt', 'yum', 'dnf',
    ];

    if (writeTools.has(toolName)) {
      return { allowed: false, reason: 'Plan modunda dosya değişikliği yasaktır. Önce ExitPlanMode ile çıkıp onay alın.' };
    }

    if (toolName === 'bash' || toolName === 'execute_command') {
      const cmd = (args.command || args.cmd || '').trim();
      for (const pattern of destructiveBash) {
        if (cmd.includes(pattern)) {
          return { allowed: false, reason: `Plan modunda yasaklı komut: ${pattern}` };
        }
      }
    }

    if (toolName === 'browser') {
      return { allowed: false, reason: 'Plan modunda browser yasaktır.' };
    }

    return { allowed: true };
  }

  /**
   * Record a read/search tool call for the plan summary.
   */
  recordTool(toolName, args) {
    if (this.state === STATE.PLANNING) {
      if (toolName === 'read_file' || toolName === 'file_search' || toolName === 'grep_search') {
        const target = args.filePath || args.pattern || args.path || '';
        if (target && !this.filesRead.includes(target)) {
          this.filesRead.push(target);
        }
      }
      if (toolName === 'bash' || toolName === 'execute_command') {
        const cmd = (args.command || args.cmd || '').trim();
        if (cmd && !this.commandsRun.includes(cmd)) {
          this.commandsRun.push(cmd);
        }
      }
    }
  }
}

// Singleton
let _instance = null;
function getPlanMode() {
  if (!_instance) _instance = new PlanMode();
  return _instance;
}

module.exports = { PlanMode, getPlanMode, STATE };
