const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { CONFIG_DIR } = require('./config');

const BUILTIN_SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const USER_SKILLS_DIR = path.join(CONFIG_DIR, 'skills');

function getProjectSkillsDir() {
  return path.join(process.cwd(), '.natureco', 'skills');
}

// Scan built-in skill slugs at module load time
let BUILTIN_SKILL_SLUGS = [];
try {
  if (fs.existsSync(BUILTIN_SKILLS_DIR)) {
    BUILTIN_SKILL_SLUGS = fs.readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }
} catch {}

// Skill metadata parser
function parseSkillMetadata(content) {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const metadata = {};

  // name
  const nameMatch = frontmatter.match(/name:\s*(.+)/);
  if (nameMatch) metadata.name = nameMatch[1].trim();

  // description
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  if (descMatch) metadata.description = descMatch[1].trim();

  // metadata JSON
  const metaMatch = frontmatter.match(/metadata:\s*(\{[\s\S]*?\})/);
  if (metaMatch) {
    try {
      metadata.metadata = JSON.parse(metaMatch[1]);
    } catch {
      metadata.metadata = {};
    }
  }

  return metadata;
}

// Skill gating - requirements check
function checkSkillRequirements(metadata) {
  const errors = [];

  if (metadata?.metadata?.natureco?.requires?.bins) {
    const bins = metadata.metadata.natureco.requires.bins;
    for (const bin of bins) {
      try {
        execSync(`${bin} --version`, { stdio: 'ignore' });
      } catch {
        errors.push(`Binary gerekli: ${bin}`);
      }
    }
  }

  if (metadata?.metadata?.natureco?.requires?.env) {
    const envVars = metadata.metadata.natureco.requires.env;
    for (const envVar of envVars) {
      if (!process.env[envVar]) {
        errors.push(`Environment variable gerekli: ${envVar}`);
      }
    }
  }

  if (metadata?.metadata?.natureco?.os) {
    const supportedOS = metadata.metadata.natureco.os;
    if (!supportedOS.includes(os.platform())) {
      errors.push(`Platform desteklenmiyor. Desteklenen: ${supportedOS.join(', ')}`);
    }
  }

  return errors;
}

// Get all skills from all sources
function getSkills() {
  const skills = [];

  // Builtin skills
  if (fs.existsSync(BUILTIN_SKILLS_DIR)) {
    const builtinDirs = fs.readdirSync(BUILTIN_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    for (const dir of builtinDirs) {
      const skillFile = path.join(BUILTIN_SKILLS_DIR, dir.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const metadata = parseSkillMetadata(content);
        if (metadata) {
          skills.push({
            ...metadata,
            slug: dir.name,
            source: 'builtin',
            path: path.join(BUILTIN_SKILLS_DIR, dir.name),
          });
        }
      }
    }
  }

  // User skills
  if (fs.existsSync(USER_SKILLS_DIR)) {
    const userDirs = fs.readdirSync(USER_SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    for (const dir of userDirs) {
      const skillFile = path.join(USER_SKILLS_DIR, dir.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const metadata = parseSkillMetadata(content);
        if (metadata) {
          skills.push({
            ...metadata,
            slug: dir.name,
            source: 'user',
            path: path.join(USER_SKILLS_DIR, dir.name),
          });
        }
      }
    }
  }

  // Project skills
  const projectSkillsDir = getProjectSkillsDir();
  if (fs.existsSync(projectSkillsDir)) {
    const projectDirs = fs.readdirSync(projectSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    
    for (const dir of projectDirs) {
      const skillFile = path.join(projectSkillsDir, dir.name, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = fs.readFileSync(skillFile, 'utf8');
        const metadata = parseSkillMetadata(content);
        if (metadata) {
          skills.push({
            ...metadata,
            slug: dir.name,
            source: 'project',
            path: path.join(projectSkillsDir, dir.name),
          });
        }
      }
    }
  }

  return skills;
}

// Install skill from NatureHub or ClawHub
async function installSkill(slug) {
  let url;
  let actualSlug = slug;

  // ClawHub format: clawhub:github
  if (slug.startsWith('clawhub:')) {
    actualSlug = slug.replace('clawhub:', '');
    url = `https://clawhub.ai/api/v1/skills/${actualSlug}/file?path=SKILL.md`;
  }
  // Direct URL
  else if (slug.startsWith('http://') || slug.startsWith('https://')) {
    url = slug;
    // Extract slug from URL
    const urlParts = slug.split('/');
    actualSlug = urlParts[urlParts.length - 2] || 'custom-skill';
  }
  // NatureHub (default)
  else {
    url = `https://natureco.me/hub/skills/${slug}/SKILL.md`;
  }
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Skill bulunamadı: ${actualSlug}`);
    }

    const content = await response.text();
    const metadata = parseSkillMetadata(content);
    
    if (!metadata) {
      throw new Error('Geçersiz skill formatı');
    }

    // Check requirements
    const errors = checkSkillRequirements(metadata);
    if (errors.length > 0) {
      throw new Error(`Gereksinimler karşılanmadı:\n${errors.join('\n')}`);
    }

    // Save to user skills
    if (!fs.existsSync(USER_SKILLS_DIR)) {
      fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
    }

    const skillDir = path.join(USER_SKILLS_DIR, actualSlug);
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8');
  } catch (err) {
    throw new Error(`Skill yüklenemedi: ${err.message}`);
  }
}

// Remove skill (from user or project — built-in skills cannot be removed)
function removeSkill(slug) {
  if (BUILTIN_SKILL_SLUGS.includes(slug)) {
    throw new Error(`Built-in skill "${slug}" silinemez`);
  }

  const candidates = [
    { path: path.join(USER_SKILLS_DIR, slug), label: 'user' },
    { path: path.join(getProjectSkillsDir(), slug), label: 'project' },
  ];

  for (const { path: skillPath, label } of candidates) {
    if (fs.existsSync(skillPath)) {
      fs.rmSync(skillPath, { recursive: true, force: true });
      return;
    }
  }

  throw new Error(`Skill bulunamadı: ${slug}`);
}

// Update all skills
async function updateAllSkills() {
  const skills = getSkills().filter(s => s.source === 'user');
  const updated = [];

  for (const skill of skills) {
    try {
      await installSkill(skill.slug);
      updated.push(skill.slug);
    } catch {
      // Skip failed updates
    }
  }

  return updated;
}

// Create skill template
function createSkillTemplate(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const skillDir = path.join(USER_SKILLS_DIR, slug);

  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill zaten mevcut: ${slug}`);
  }

  if (!fs.existsSync(USER_SKILLS_DIR)) {
    fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  }

  fs.mkdirSync(skillDir, { recursive: true });

  const template = `---
name: ${name}
description: ${name} skill açıklaması
metadata: {"natureco": {"requires": {"bins": [], "env": []}, "os": ["win32","darwin","linux"]}}
---

# ${name} Skill

Bu skill ${name} işlemlerini yapar.

## Kullanım

[Kullanım talimatları]

## Örnekler

\`\`\`
[Örnek komutlar]
\`\`\`

## Notlar

[Ek notlar]
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), template, 'utf8');

  return path.join(skillDir, 'SKILL.md');
}

// Get popular skills from ClawHub API (no fallback — transparent error)
async function getPopularSkills() {
  const response = await fetch('https://clawhub.ai/api/skills?q=&limit=20');
  if (!response.ok) {
    throw new Error(`ClawHub API returned HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data.skills || data.skills.length === 0) {
    throw new Error('ClawHub API returned empty skill list');
  }
  return data.skills.map(s => ({ ...s, source: 'clawhub' }));
}

// Get skill prompt injection content (full SKILL.md content)
function getSkillPrompts() {
  const skills = getSkills();
  
  if (skills.length === 0) {
    return '';
  }
  
  const prompts = [];

  for (const skill of skills) {
    try {
      const content = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
      prompts.push(`===== ${skill.name} Skill =====\n${content}`);
    } catch {
      const desc = skill.description ? skill.description.slice(0, 100) : '';
      prompts.push(`- ${skill.name}: ${desc}`);
    }
  }

  // Limit to first 10 skills
  const skillsList = prompts.slice(0, 10).join('\n\n');
  const moreCount = skills.length > 10 ? ` (${skills.length - 10} more)` : '';
  
  return `\n\nInstalled skills (${skills.length})${moreCount}:\n\n${skillsList}\n`;
}

module.exports = {
  getSkills,
  installSkill,
  removeSkill,
  updateAllSkills,
  createSkillTemplate,
  getSkillPrompts,
  checkSkillRequirements,
  getPopularSkills,
};
