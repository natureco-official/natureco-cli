const https = require('https');
const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

/**
 * Each entry: { owner, repo, skills: [{ name, subpath }] }
 * subpath is the relative path under the repo's root where SKILL.md lives.
 * For flat: subpath = `skills/${name}`
 * For nested (mattpocock): subpath = `skills/category/${name}`
 */
const ENTRIES = [
  // --- anthropics/skills (flat) ---
  { owner: 'anthropics', repo: 'skills', skills: [
    'algorithmic-art', 'brand-guidelines', 'canvas-design', 'claude-api',
    'doc-coauthoring', 'docx', 'frontend-design', 'internal-comms',
    'mcp-builder', 'pdf', 'pptx', 'skill-creator', 'slack-gif-creator',
    'theme-factory', 'web-artifacts-builder', 'webapp-testing', 'xlsx',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- mattpocock/skills (nested under categories) ---
  { owner: 'mattpocock', repo: 'skills', skills: [
    // deprecated
    'design-an-interface', 'qa', 'request-refactor-plan', 'ubiquitous-language',
    // productivity
    'grill-me', 'grilling', 'handoff', 'teach', 'writing-great-skills',
    // engineering
    'implement', 'resolving-merge-conflicts', 'tdd', 'to-prd',
    // in-progress
    'decision-mapping', 'loop-me', 'writing-beats', 'writing-fragments', 'writing-shape',
    // misc
    'git-guardrails-claude-code', 'migrate-to-shoehorn', 'scaffold-exercises', 'setup-pre-commit',
    // personal
    'edit-article', 'obsidian-vault',
  ].map(n => ({ name: n, subpath: `skills/${getCategory(n)}/${n}` })) },

  // --- xixu-me/skills (flat) ---
  { owner: 'xixu-me', repo: 'skills', skills: [
    'github-actions-docs', 'use-my-browser', 'readme-i18n',
    'secure-linux-web-hosting', 'develop-userscripts',
    'openclaw-secure-linux-cloud', 'opensource-guide-coach',
    'running-claude-code-via-litellm-copilot', 'skills-cli', 'tzst', 'xdrop', 'xget',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- vercel-labs/agent-skills (flat) ---
  { owner: 'vercel-labs', repo: 'agent-skills', skills: [
    'composition-patterns', 'deploy-to-vercel', 'react-best-practices',
    'react-native-skills', 'react-view-transitions', 'vercel-cli-with-tokens',
    'vercel-optimize', 'web-design-guidelines', 'writing-guidelines',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- supabase/agent-skills (flat) ---
  { owner: 'supabase', repo: 'agent-skills', skills: [
    'supabase-postgres-best-practices', 'supabase',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- obra/superpowers (flat) ---
  { owner: 'obra', repo: 'superpowers', skills: [
    'brainstorming', 'systematic-debugging', 'writing-plans',
    'using-superpowers', 'test-driven-development',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- juliusbrussee/caveman (flat) ---
  { owner: 'juliusbrussee', repo: 'caveman', skills: [
    'caveman', 'caveman-review', 'caveman-commit', 'caveman-compress',
    'cavecrew', 'caveman-stats', 'caveman-help',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- microsoft/azure-skills (flat) ---
  { owner: 'microsoft', repo: 'azure-skills', skills: [
    'microsoft-foundry', 'azure-ai', 'airunway-aks-setup',
    'appinsights-instrumentation', 'azure-aigateway', 'azure-cloud-migrate',
    'azure-compliance', 'azure-compute', 'azure-cost', 'azure-deploy',
    'azure-diagnostics', 'azure-enterprise-infra-planner',
    'azure-hosted-copilot-sdk', 'azure-kubernetes', 'azure-kusto',
    'azure-messaging', 'azure-prepare', 'azure-quotas', 'azure-rbac',
    'azure-reliability', 'azure-resource-lookup', 'azure-resource-visualizer',
    'azure-storage', 'azure-upgrade', 'azure-validate', 'entra-agent-id',
    'entra-app-registration', 'python-appservice-deploy',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- leonxlnx/taste-skill (flat) ---
  { owner: 'leonxlnx', repo: 'taste-skill', skills: [
    'brandkit', 'brutalist-skill', 'gpt-tasteskill', 'image-to-code-skill',
    'imagegen-frontend-mobile', 'imagegen-frontend-web', 'minimalist-skill',
    'output-skill', 'redesign-skill', 'soft-skill', 'stitch-skill',
    'taste-skill-v1', 'taste-skill',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- remotion-dev/skills (flat) ---
  { owner: 'remotion-dev', repo: 'skills', skills: [
    'remotion',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- mcollina/skills (flat) ---
  { owner: 'mcollina', repo: 'skills', skills: [
    'fastify', 'documentation', 'init', 'linting-neostandard-eslint9',
    'node', 'nodejs-core', 'oauth', 'octocat', 'skill-optimizer',
    'snipgrapher', 'typescript-magician',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- spillwavesolutions/design-doc-mermaid (flat) ---
  { owner: 'spillwavesolutions', repo: 'design-doc-mermaid', skills: [
    'design-doc-mermaid',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- vyralcontent/content-skills (flat) ---
  { owner: 'vyralcontent', repo: 'content-skills', skills: [
    'viral-short-form-ideas', 'viral-short-form', 'viral-instagram-reels',
    'viral-tiktok-content',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- heygen-com/hyperframes (flat) ---
  { owner: 'heygen-com', repo: 'hyperframes', skills: [
    'hyperframes', 'hyperframes-animation', 'hyperframes-core',
    'hyperframes-media', 'hyperframes-cli', 'hyperframes-creative',
    'motion-graphics', 'general-video', 'website-to-video',
    'product-launch-video', 'faceless-explainer', 'music-to-video',
    'pr-to-video', 'talking-head-recut',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- roin-orca/skills ---
  { owner: 'roin-orca', repo: 'skills', skills: [
    'simple',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- larksuite/cli ---
  { owner: 'larksuite', repo: 'cli', skills: [
    'lark-doc', 'lark-base', 'lark-shared', 'lark-approval',
    'lark-workflow-meeting-summary', 'lark-workflow-project-summary',
    'lark-workflow-chat-summary',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },

  // --- halt-catch-fire/skills ---
  { owner: 'halt-catch-fire', repo: 'skills', skills: [
    'remotion-render', 'landing-page-design',
  ].map(n => ({ name: n, subpath: `skills/${n}` })) },
];

function getCategory(skillName) {
  const cats = {
    'design-an-interface': 'deprecated', 'qa': 'deprecated',
    'request-refactor-plan': 'deprecated', 'ubiquitous-language': 'deprecated',
    'grill-me': 'productivity', 'grilling': 'productivity',
    'handoff': 'productivity', 'teach': 'productivity',
    'writing-great-skills': 'productivity',
    'implement': 'engineering', 'resolving-merge-conflicts': 'engineering',
    'tdd': 'engineering', 'to-prd': 'engineering',
    'decision-mapping': 'in-progress', 'loop-me': 'in-progress',
    'writing-beats': 'in-progress', 'writing-fragments': 'in-progress',
    'writing-shape': 'in-progress',
    'git-guardrails-claude-code': 'misc', 'migrate-to-shoehorn': 'misc',
    'scaffold-exercises': 'misc', 'setup-pre-commit': 'misc',
    'edit-article': 'personal', 'obsidian-vault': 'personal',
  };
  return cats[skillName] || 'misc';
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'User-Agent': 'natureco-skill-importer/1.0' },
      timeout: 15000,
    };
    https.get(url, opts, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { attrs: frontmatter, body: match[2] };
}

async function main() {
  console.log('=== Natureco CLI — Skill Importer ===\n');
  console.log(`Target: ${SKILLS_DIR}\n`);

  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });

  const results = { success: [], skipped: [], failed: [], totalAttempted: 0 };
  const seen = new Set();

  for (const entry of ENTRIES) {
    console.log(`\n--- ${entry.owner}/${entry.repo} ---`);
    for (const skill of entry.skills) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      results.totalAttempted++;

      const skillDir = path.join(SKILLS_DIR, skill.name);
      const skillFile = path.join(skillDir, 'SKILL.md');

      if (fs.existsSync(skillFile)) {
        results.skipped.push(skill.name);
        console.log(`  \u23ED  ${skill.name} (already exists)`);
        continue;
      }

      const url = `https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/main/${skill.subpath}/SKILL.md`;

      try {
        const content = await fetchUrl(url);
        fs.mkdirSync(skillDir, { recursive: true });

        let finalContent = content;
        const parsed = parseFrontmatter(content);
        if (!parsed) {
          finalContent = `---\nname: ${skill.name}\ndescription: ${skill.name} skill from ${entry.owner}/${entry.repo}\n---\n\n${content}`;
        }

        fs.writeFileSync(skillFile, finalContent);
        results.success.push(skill.name);
        console.log(`  \u2705 ${skill.name}`);
      } catch (err) {
        results.failed.push(skill.name);
        console.log(`  \u274C ${skill.name}: ${err.message}`);
      }
    }
  }

  console.log('\n\n=== Summary ===');
  console.log(`Total skills attempted:  ${results.totalAttempted}`);
  console.log(`Successfully downloaded: ${results.success.length}`);
  console.log(`Already existed/skipped: ${results.skipped.length}`);
  console.log(`Failed:                 ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed skills:');
    for (const f of results.failed) {
      console.log(`  - ${f}`);
    }
  }

  const skillDirs = fs.readdirSync(SKILLS_DIR).filter(f => fs.statSync(path.join(SKILLS_DIR, f)).isDirectory());
  console.log(`\nSkills directory now has ${skillDirs.length} skill directories.`);

  const logPath = path.resolve(__dirname, 'import-skills-log.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\nLog: ${logPath}`);
}

main().catch(console.error);
