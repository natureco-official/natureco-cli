/**
 * skill_manage — Create, patch, or delete skills (Hermes-style)
 *
 * Model can create new skills, patch existing ones, or delete them.
 * Skills are SKILL.md files in ~/.natureco/skills/<name>/SKILL.md
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const USER_SKILLS_DIR = path.join(os.homedir(), '.natureco', 'skills');

const name = 'skill_manage';
const description = 'Create, update (patch), or delete skills. Use skill_view(name) to read skill content first, then skill_manage to create/patch it. Skills contain reusable workflows, instructions, and conventions.';
const parameters = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['create', 'patch', 'delete'],
      description: 'create: make a new skill. patch: update an existing one. delete: remove a skill.',
    },
    name: {
      type: 'string',
      description: 'Skill name (lowercase, hyphen-separated, e.g. "my-workflow"). For patch/delete, must match an existing skill.',
    },
    description: {
      type: 'string',
      description: 'Short one-line description shown in the skills index.',
    },
    content: {
      type: 'string',
      description: 'Full SKILL.md body (including YAML frontmatter). For patch: the new content to write. For create: must include --- frontmatter with name + description.',
    },
  },
  required: ['action', 'name'],
};

function _ensureUserSkillsDir() {
  if (!fs.existsSync(USER_SKILLS_DIR)) {
    fs.mkdirSync(USER_SKILLS_DIR, { recursive: true });
  }
}

function _skillPath(name) {
  return path.join(USER_SKILLS_DIR, name, 'SKILL.md');
}

async function execute(args) {
  const { action, name: skillName, description, content } = args;

  switch (action) {
    case 'create': {
      if (!content) {
        return JSON.stringify({ success: false, error: 'content (full SKILL.md with frontmatter) required for create' });
      }
      if (!content.startsWith('---')) {
        return JSON.stringify({ success: false, error: 'content must start with YAML frontmatter (---)' });
      }
      _ensureUserSkillsDir();
      const skillDir = path.join(USER_SKILLS_DIR, skillName);
      if (fs.existsSync(skillDir)) {
        return JSON.stringify({ success: false, error: `Skill "${skillName}" already exists. Use action=patch to update.` });
      }
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(_skillPath(skillName), content, 'utf8');
      return JSON.stringify({ success: true, message: `Skill "${skillName}" created.`, path: _skillPath(skillName) });
    }
    case 'patch': {
      const sp = _skillPath(skillName);
      if (!fs.existsSync(sp)) {
        return JSON.stringify({ success: false, error: `Skill "${skillName}" not found. Use action=create first.` });
      }
      let newContent = content;
      if (!newContent) {
        return JSON.stringify({ success: false, error: 'content required for patch' });
      }
      if (!newContent.startsWith('---') && description) {
        const existing = fs.readFileSync(sp, 'utf8');
        const frontmatterEnd = existing.indexOf('\n---', 3);
        if (frontmatterEnd !== -1) {
          const fm = existing.slice(0, frontmatterEnd + 4);
          const body = existing.slice(frontmatterEnd + 4);
          newContent = fm + '\n\n' + content + body;
        }
      }
      fs.writeFileSync(sp, newContent, 'utf8');
      return JSON.stringify({ success: true, message: `Skill "${skillName}" updated.` });
    }
    case 'delete': {
      const sp = _skillPath(skillName);
      if (!fs.existsSync(sp)) {
        return JSON.stringify({ success: false, error: `Skill "${skillName}" not found.` });
      }
      fs.rmSync(path.dirname(sp), { recursive: true, force: true });
      return JSON.stringify({ success: true, message: `Skill "${skillName}" deleted.` });
    }
    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
  }
}

module.exports = { name, description, parameters, execute };
