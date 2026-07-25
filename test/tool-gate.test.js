import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const requireCjs = createRequire(import.meta.url);
const { createToolGate, assessRisk } = requireCjs('../src/utils/tool-gate.js');
const { getPlanMode } = requireCjs('../src/utils/plan-mode.js');

afterEach(() => {
  const pm = getPlanMode();
  if (pm.isActive?.()) pm.exit('cleanup');
  vi.restoreAllMocks();
});

/**
 * The headless agent (WhatsApp `!code`, gateway, `natureco code -p`) has no
 * human to answer an approval prompt. It must refuse rather than either
 * hanging on a prompt nobody sees or — as it did before — executing ungated.
 */
describe('createToolGate — unattended surfaces', () => {
  it('refuses a risky command instead of prompting when no confirm is supplied', async () => {
    const screen = createToolGate({});
    const refusal = await screen('bash', { command: 'rm -rf /tmp/build' });
    expect(refusal).toBeTruthy();
    expect(refusal).toMatch(/unattended|otomatik modda/i);
  });

  it('still allows ordinary work unattended', async () => {
    const screen = createToolGate({});
    expect(await screen('read_file', { filePath: 'package.json' })).toBeNull();
    expect(await screen('bash', { command: 'npm test' })).toBeNull();
  });

  it('reports the refusal through the log hook so the caller can surface it', async () => {
    const log = vi.fn();
    const screen = createToolGate({ log });
    await screen('bash', { command: 'sudo rm -rf /' });
    expect(log).toHaveBeenCalled();
  });
});

describe('createToolGate — interactive surfaces', () => {
  it('runs the call when the user approves', async () => {
    const confirm = vi.fn(async () => true);
    const screen = createToolGate({ confirm, askPermission: async () => 'once' });
    expect(await screen('bash', { command: 'rm -rf build' })).toBeNull();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('refuses with a reportable reason when the user declines', async () => {
    const screen = createToolGate({ confirm: async () => false, askPermission: async () => 'no' });
    const refusal = await screen('bash', { command: 'rm -rf build' });
    expect(refusal).toMatch(/declined|onaylamadı/i);
  });
});

describe('createToolGate — dry run', () => {
  it('refuses mutating tools and lets read-only tools through', async () => {
    const screen = createToolGate({ dryRun: true, confirm: async () => true, askPermission: async () => 'once' });
    expect(await screen('write_file', { filePath: 'a.txt', content: 'x' })).toMatch(/DRY RUN/);
    expect(await screen('bash', { command: 'npm run build' })).toMatch(/DRY RUN/);
    expect(await screen('read_file', { filePath: 'a.txt' })).toBeNull();
  });
});

describe('createToolGate — plan mode', () => {
  it('blocks writes while a plan is being drafted', async () => {
    getPlanMode().enter();
    const screen = createToolGate({ confirm: async () => true, askPermission: async () => 'once' });
    const refusal = await screen('write_file', { filePath: 'a.txt', content: 'x' });
    expect(refusal).toMatch(/plan/i);
  });
});

describe('assessRisk is shared by every surface', () => {
  it('returns the same verdict regardless of caller', () => {
    expect(assessRisk('bash', { command: 'git push --force origin main' }).requiresApproval).toBe(true);
    expect(assessRisk('bash', { command: 'git status' }).requiresApproval).toBe(false);
  });
});

/**
 * Live regression: asked to create a file under --dry-run, the model routed
 * around the refused write_file by running a Python snippet through
 * code_execution, and the file was really created.
 */
describe('code_execution is gated like the interpreter it is', () => {
  it('is refused under dry-run', async () => {
    const screen = createToolGate({ dryRun: true, confirm: async () => true, askPermission: async () => 'once' });
    const refusal = await screen('code_execution', { code: 'open("x.txt","w").write("hi")', language: 'python' });
    expect(refusal).toMatch(/DRY RUN/);
  });

  it('requires approval for deletion written in Python or Node', async () => {
    expect(assessRisk('code_execution', { code: 'import shutil; shutil.rmtree("/data")' }).requiresApproval).toBe(true);
    expect(assessRisk('code_execution', { code: 'fs.rmSync("build", {recursive:true})' }).requiresApproval).toBe(true);
  });

  it('requires approval for shelling out from inside code', async () => {
    expect(assessRisk('code_execution', { code: 'import subprocess; subprocess.run(["ls"])' }).requiresApproval).toBe(true);
    expect(assessRisk('code_execution', { code: 'const { execSync } = require("child_process")' }).requiresApproval).toBe(true);
  });

  it('catches a shell command smuggled in as language:bash', async () => {
    expect(assessRisk('code_execution', { code: 'Remove-Item -Recurse -Force build', language: 'bash' }).requiresApproval).toBe(true);
    expect(assessRisk('code_execution', { code: 'rm -rf build', language: 'bash' }).requiresApproval).toBe(true);
  });

  it('leaves harmless computation alone', async () => {
    expect(assessRisk('code_execution', { code: 'print(sum(range(10)))' }).requiresApproval).toBe(false);
  });
});
