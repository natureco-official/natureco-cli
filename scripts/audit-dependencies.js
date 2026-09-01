'use strict';

const { spawnSync } = require('child_process');

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm run audit:deps');

// npm 11 forwards the user-level allow-scripts option to nested npm processes as
// a project-scoped CLI option, which npm itself rejects. It is irrelevant to audit.
const env = { ...process.env };
delete env.npm_config_allow_scripts;
delete env.NPM_CONFIG_ALLOW_SCRIPTS;

const result = spawnSync(process.execPath, [npmCli, 'audit', '--audit-level=moderate'], {
  stdio: 'inherit',
  env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
