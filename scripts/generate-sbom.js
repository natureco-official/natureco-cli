'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'SBOM.cdx.json');

function validate(sbom) {
  const pkg = require('../package.json');
  if (sbom.bomFormat !== 'CycloneDX') throw new Error('Expected a CycloneDX SBOM');
  if (sbom.metadata?.component?.name !== pkg.name) throw new Error('SBOM package name is stale');
  if (sbom.metadata?.component?.version !== pkg.version) throw new Error('SBOM package version is stale');
  if (!Array.isArray(sbom.components) || sbom.components.length === 0) throw new Error('SBOM has no components');
}

function main() {
  if (process.argv.includes('--check')) {
    validate(JSON.parse(fs.readFileSync(output, 'utf8')));
    console.log('SBOM verified.');
    return;
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this generator through npm run sbom:generate');
  const json = execFileSync(process.execPath, [npmCli, 'sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const sbom = JSON.parse(json);
  validate(sbom);
  fs.writeFileSync(output, JSON.stringify(sbom, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${path.basename(output)} (${sbom.components.length} components).`);
}

main();
