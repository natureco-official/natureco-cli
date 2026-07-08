/**
 * skill-index — Hermes-style skill index builder (progressive disclosure)
 *
 * Scans skills/ and ~/.natureco/skills/ for SKILL.md files with YAML frontmatter.
 * Builds a compact index for system prompt injection.
 * Skills are loaded on-demand via skill_view(name) tool.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BUILTIN_SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const USER_SKILLS_DIR = path.join(os.homedir(), '.natureco', 'skills');
const PROJECT_SKILLS_DIR = path.join(process.cwd(), '.natureco', 'skills');

function _parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { frontmatter: {}, body: content };
  const raw = match[1];
  const body = content.slice(match[0].length).trim();
  const fm = {};
  for (const line of raw.split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim();
    fm[key] = val;
  }
  return { frontmatter: fm, body };
}

function _getSkillDirs() {
  const dirs = [];
  for (const d of [BUILTIN_SKILLS_DIR, USER_SKILLS_DIR, PROJECT_SKILLS_DIR]) {
    if (fs.existsSync(d)) dirs.push(d);
  }
  return dirs;
}

function _discoverSkills() {
  const skills = [];
  for (const skillsDir of _getSkillDirs()) {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const raw = fs.readFileSync(skillPath, 'utf8');
      const { frontmatter, body } = _parseFrontmatter(raw);
      const name = frontmatter.name || entry.name;
      const description = frontmatter.description || '';
      const category = path.basename(skillsDir) === 'skills' ? 'general' : path.basename(skillsDir);
      const tags = frontmatter.metadata ? (() => { try { const m = JSON.parse(frontmatter.metadata); return m.natureco?.tags || m.hermes?.tags || []; } catch { return []; } })() : [];
      skills.push({ name, description, fullName: entry.name, path: skillPath, category, tags, raw, body, frontmatter });
    }
  }
  return skills;
}

/**
 * v5.42 TOKEN OPTIMIZASYONU: eskiden her skill'in TAM `description`'i (frontmatter,
 * ~200-500 char) sysMsg'e gomuluyordu → yuzlerce skill'de ~18K token HER istekte
 * (basit "merhaba" bile). Progressive-disclosure'a da aykiri: skill_view zaten tam
 * aciklama+icerik veriyor. Artik index'te KISA aciklama (cok skill varsa daha da kisa);
 * ajan ismi+ozeti gorur, ilgiliyse skill_view(name) ile tam detayi ceker.
 * NATURECO_SKILL_INDEX=names → sadece isimler (en dusuk token); =off → index yok.
 */
function _shorten(d, max) {
  if (!d) return '';
  const clean = d.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function buildSkillIndex() {
  const mode = String(process.env.NATURECO_SKILL_INDEX || '').toLowerCase();
  if (mode === 'off') return '';
  const skills = _discoverSkills();
  if (skills.length === 0) return '';
  // Cok skill (>60) → KOMPAKT isim-listesi (kategorili, virgullu): en dusuk token.
  // Az skill → isim + kisa aciklama. Kullanici 'full'/'names' ile ezebilir.
  const many = skills.length > 60;
  const compact = mode === 'names' || (many && mode !== 'full');
  const byCategory = {};
  for (const s of skills) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  }
  const lines = ['## Skills (görevinle ilgiliyse skill_view(name) ile yükle — tam açıklama/içerik oradadır)'];
  lines.push('<available_skills>');
  for (const [cat, catSkills] of Object.entries(byCategory)) {
    if (compact) {
      lines.push(`  ${cat}: ${catSkills.map(s => s.name).join(', ')}`);
    } else {
      lines.push(`  ${cat}:`);
      for (const s of catSkills) lines.push(`    - ${s.name}: ${_shorten(s.description, 88)}`);
    }
  }
  lines.push('</available_skills>');
  return lines.join('\n');
}

function skillLookup(name) {
  const skills = _discoverSkills();
  const exact = skills.find(s => s.name === name || s.fullName === name);
  if (exact) return exact;
  return skills.find(s => s.name.toLowerCase() === name.toLowerCase() || s.fullName.toLowerCase() === name.toLowerCase()) || null;
}

function skillView(name) {
  const skill = skillLookup(name);
  if (!skill) {
    return JSON.stringify({ success: false, error: `Skill not found: ${name}` });
  }
  const linkedFiles = [];
  const skillDir = path.dirname(skill.path);
  if (fs.existsSync(skillDir)) {
    for (const sub of ['references', 'templates', 'scripts', 'assets']) {
      const subDir = path.join(skillDir, sub);
      if (fs.existsSync(subDir)) {
        for (const f of fs.readdirSync(subDir)) {
          linkedFiles.push(`${sub}/${f}`);
        }
      }
    }
  }
  return JSON.stringify({
    success: true,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    tags: skill.tags,
    content: skill.body,
    linkedFiles: linkedFiles.length > 0 ? linkedFiles : undefined,
  });
}

function skillsList(category) {
  const skills = _discoverSkills();
  const filtered = category ? skills.filter(s => s.category === category) : skills;
  return JSON.stringify({
    success: true,
    skills: filtered.map(s => ({ name: s.name, description: s.description, category: s.category, tags: s.tags })),
  });
}

module.exports = { buildSkillIndex, skillLookup, skillView, skillsList, _shorten, _discoverSkills };
