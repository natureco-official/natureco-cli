/**
 * skills_download — Download skills from skills.sh ecosystem or GitHub repos
 *
 * Bulk-imports Agent Skills from the open ecosystem into natureco's skill system.
 * Skills are SKILL.md files following the Agent Skills standard (agentskills.io).
 *
 * Sources:
 *   - GitHub repos (anthropics/skills, vercel-labs/agent-skills, etc.)
 *   - skills.sh registry
 *   - Direct SKILL.md URLs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BUILTIN_SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const USER_SKILLS_DIR = path.join(os.homedir(), '.natureco', 'skills');

// Known skill repos with high-quality skills
const KNOWN_REPOS = [
  { owner: 'anthropics', repo: 'skills', topic: 'general' },
  { owner: 'mattpocock', repo: 'skills', topic: 'typescript' },
  { owner: 'vercel-labs', repo: 'agent-skills', topic: 'vercel' },
  { owner: 'supabase', repo: 'agent-skills', topic: 'database' },
  { owner: 'xixu-me', repo: 'skills', topic: 'devops' },
  { owner: 'microsoft', repo: 'azure-skills', topic: 'cloud' },
  { owner: 'shadcn', repo: 'ui', topic: 'design' },
  { owner: 'nrwl', repo: 'nx-ai-agents-config', topic: 'nx' },
  { owner: 'remotion-dev', repo: 'skills', topic: 'video' },
  { owner: 'mcollina', repo: 'skills', topic: 'nodejs' },
  { owner: 'spillwavesolutions', repo: 'design-doc-mermaid', topic: 'design' },
  { owner: 'nextlevelbuilder', repo: 'ui-ux-pro-max-skill', topic: 'design' },
  { owner: 'browser-act', repo: 'skills', topic: 'browser' },
  { owner: 'obra', repo: 'superpowers', topic: 'workflow' },
];

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('Timeout')); });
  });
}

function getGithubContentsUrl(owner, repo, path) {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

async function listRepos() {
  return KNOWN_REPOS.map(r => ({
    id: `${r.owner}/${r.repo}`,
    owner: r.owner,
    repo: r.repo,
    topic: r.topic,
  }));
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { metadata: {}, body: content };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { metadata: fm, body: (m[2] || '').trim() };
}

async function fetchGithubRepo(owner, repo) {
  // Use GitHub API to list contents of /skills directory
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const data = await httpsGet(url, { headers: { 'User-Agent': 'natureco-cli', 'Accept': 'application/vnd.github.v3+json' } });
  const tree = JSON.parse(data).tree || [];

  // Find all SKILL.md files
  const skillFiles = tree.filter(f => f.path.endsWith('SKILL.md'));
  const skills = [];

  for (const file of skillFiles) {
    const skillDir = path.dirname(file.path);
    const skillName = path.basename(skillDir);

    // Fetch SKILL.md content
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}`;
    let content;
    try {
      content = await httpsGet(rawUrl);
    } catch { continue; }

    const { metadata, body } = parseFrontmatter(content);
    const name = metadata.name || skillName;
    const description = metadata.description || '';

    // Find additional files in the skill directory
    const additionalFiles = tree
      .filter(f => f.path.startsWith(skillDir + '/') && f.path !== file.path)
      .map(f => ({ path: f.path.replace(skillDir + '/', ''), url: `https://raw.githubusercontent.com/${owner}/${repo}/main/${f.path}` }));

    skills.push({
      name,
      description: description.length > 200 ? description.slice(0, 200) + '...' : description,
      fullDescription: description,
      content: body,
      source: `${owner}/${repo}/${skillDir}`,
      metadata,
      additionalFiles,
    });
  }

  return skills;
}

async function downloadSkill(skill, targetDir) {
  const skillDir = path.join(targetDir, skill.name);
  if (fs.existsSync(skillDir)) {
    return { success: false, error: 'Already exists', path: skillDir };
  }

  fs.mkdirSync(skillDir, { recursive: true });

  // Write SKILL.md
  const frontmatter = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    skill.metadata.license ? `license: ${skill.metadata.license}` : null,
    skill.source ? `metadata:\n  source: ${skill.source}` : null,
    '---',
    '',
    skill.content,
  ].filter(Boolean).join('\n');

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf8');

  // Download additional files
  for (const af of (skill.additionalFiles || [])) {
    try {
      const data = await httpsGet(af.url);
      const afDir = path.dirname(path.join(skillDir, af.path));
      fs.mkdirSync(afDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, af.path), data, 'utf8');
    } catch {}
  }

  return { success: true, path: skillDir, name: skill.name };
}

async function execute(params) {
  const { action, source, name, target } = params;
  const targetDir = target === 'user' ? USER_SKILLS_DIR : BUILTIN_SKILLS_DIR;

  if (action === 'list_sources') {
    const repos = await listRepos();
    return JSON.stringify({ success: true, sources: repos });
  }

  if (action === 'list_skills') {
    const [owner, repo] = (source || '').split('/');
    if (!owner || !repo) return JSON.stringify({ success: false, error: 'source must be owner/repo (e.g. anthropics/skills)' });
    const skills = await fetchGithubRepo(owner, repo);
    return JSON.stringify({ success: true, source, count: skills.length, skills: skills.map(s => ({ name: s.name, description: s.description })) });
  }

  if (action === 'download') {
    const [owner, repo] = (source || '').split('/');
    if (!owner || !repo) return JSON.stringify({ success: false, error: 'source must be owner/repo' });
    const skills = await fetchGithubRepo(owner, repo);
    const targetSkill = name ? skills.find(s => s.name === name) : null;
    const toDownload = targetSkill ? [targetSkill] : skills;
    const results = [];
    for (const skill of toDownload) {
      const result = await downloadSkill(skill, targetDir);
      results.push({ name: skill.name, ...result });
    }
    const succeeded = results.filter(r => r.success).length;
    return JSON.stringify({ success: true, source, total: results.length, succeeded, failed: results.length - succeeded, results });
  }

  if (action === 'download_all') {
    const repos = await listRepos();
    const allResults = [];
    for (const repo of repos) {
      try {
        const skills = await fetchGithubRepo(repo.owner, repo.repo);
        for (const skill of skills) {
          const result = await downloadSkill(skill, targetDir);
          allResults.push({ repo: repo.id, name: skill.name, ...result });
        }
      } catch (e) {
        allResults.push({ repo: repo.id, error: e.message });
      }
    }
    const succeeded = allResults.filter(r => r.success).length;
    return JSON.stringify({ success: true, total: allResults.length, succeeded, failed: allResults.length - succeeded, results: allResults });
  }

  return JSON.stringify({ success: false, error: 'Unknown action. Use: list_sources, list_skills, download, download_all' });
}

const name = 'skills_download';
const description = 'Download skills from skills.sh ecosystem or GitHub repos. Bulk-import Agent Skills from anthropics/skills, vercel-labs/agent-skills, supabase/agent-skills and more. Actions: list_sources, list_skills, download, download_all.';
const parameters = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['list_sources', 'list_skills', 'download', 'download_all'] },
    source: { type: 'string', description: 'Source repo in owner/repo format (e.g. anthropics/skills)' },
    name: { type: 'string', description: 'Specific skill name to download (optional, downloads all if not set)' },
    target: { type: 'string', enum: ['builtin', 'user'], description: 'Target directory: builtin (project) or user (~/.natureco)' },
  },
  required: ['action'],
};

module.exports = { name, description, parameters, execute };
