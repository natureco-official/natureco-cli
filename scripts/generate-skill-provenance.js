'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ENTRIES } = require('./import-skills');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const OUTPUT = path.join(ROOT, 'SKILL_PROVENANCE.json');

const LICENSES = {
  'anthropics/skills': 'SEE-UPSTREAM',
  'mattpocock/skills': 'MIT',
  'xixu-me/skills': 'MIT',
  'vercel-labs/agent-skills': 'SEE-UPSTREAM',
  'supabase/agent-skills': 'MIT',
  'obra/superpowers': 'MIT',
  'juliusbrussee/caveman': 'LicenseRef-Upstream',
  'microsoft/azure-skills': 'MIT',
  'leonxlnx/taste-skill': 'MIT',
  'remotion-dev/skills': 'SEE-UPSTREAM',
  'mcollina/skills': 'MIT',
  'spillwavesolutions/design-doc-mermaid': 'SEE-UPSTREAM',
  'vyralcontent/content-skills': 'MIT',
  'heygen-com/hyperframes': 'Apache-2.0',
  'roin-orca/skills': 'SEE-UPSTREAM',
  'larksuite/cli': 'MIT',
  'halt-catch-fire/skills': 'SEE-UPSTREAM',
};

function canonicalText(content) {
  return content.toString('utf8').replace(/\r\n/g, '\n');
}

function sha256(content) {
  // Git may materialize text files with CRLF on Windows. Provenance must
  // describe the logical source content, not the checkout platform.
  const canonicalContent = canonicalText(content);
  return crypto.createHash('sha256').update(canonicalContent, 'utf8').digest('hex');
}

function importedSkills() {
  const result = new Map();
  for (const entry of ENTRIES) {
    const repository = `${entry.owner}/${entry.repo}`;
    for (const skill of entry.skills) {
      result.set(skill.name, {
        kind: 'third-party',
        repository: `https://github.com/${repository}`,
        revision: entry.ref,
        source: `https://raw.githubusercontent.com/${repository}/${entry.ref}/${skill.subpath}/SKILL.md`,
        license: LICENSES[repository] || 'NOASSERTION',
      });
    }
  }
  return result;
}

function buildManifest() {
  const imported = importedSkills();
  const names = fs.readdirSync(SKILLS_DIR)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')))
    .sort();

  return {
    schemaVersion: 1,
    generatedBy: 'scripts/generate-skill-provenance.js',
    skills: names.map((name) => {
      const file = path.join(SKILLS_DIR, name, 'SKILL.md');
      const content = fs.readFileSync(file);
      return {
        name,
        path: `skills/${name}/SKILL.md`,
        sha256: sha256(content),
        ...(imported.get(name) || {
          kind: 'natureco',
          repository: 'https://github.com/natureco-official/natureco-cli',
          license: 'SEE-PACKAGE-LICENSE',
        }),
      };
    }),
  };
}

function stable(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function main() {
  const manifest = buildManifest();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (canonicalText(current) !== stable(manifest)) {
      console.error('SKILL_PROVENANCE.json is missing or stale. Run npm run provenance:generate.');
      process.exitCode = 1;
      return;
    }
    console.log(`Skill provenance verified (${manifest.skills.length} skills).`);
    return;
  }
  fs.writeFileSync(OUTPUT, stable(manifest), 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} (${manifest.skills.length} skills).`);
}

if (require.main === module) main();

module.exports = { buildManifest, canonicalText, sha256 };
