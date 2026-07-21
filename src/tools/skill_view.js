/**
 * skill_view — Load full skill content (progressive disclosure tier 2-3)
 */

const fs = require('fs');
const path = require('path');
const { skillView, skillLookup } = require('../utils/skill-index');

const name = 'skill_view';
const description = 'Load full skill content by name. Use skills_list to discover available skills. First call returns SKILL.md body plus linked_files. Call again with filePath to access references/templates/scripts.';
const inputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The skill name (use skills_list to see available skills)' },
    filePath: { type: 'string', description: 'Optional: path to a linked file within the skill (e.g. references/api.md)' },
  },
  required: ['name'],
};

async function execute(args) {
  if (typeof args?.name !== 'string' || !args.name.trim()) {
    return JSON.stringify({ success: false, error: 'name required' });
  }
  const skill = skillLookup(args.name);
  if (!skill) {
    return JSON.stringify({ success: false, error: `Skill not found: ${args.name}` });
  }
  if (args.filePath) {
    const skillDir = path.dirname(skill.path);
    const filePath = path.join(skillDir, args.filePath);
    if (!fs.existsSync(filePath)) {
      return JSON.stringify({ success: false, error: `File not found: ${args.filePath}` });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.stringify({ success: true, name: skill.name, filePath: args.filePath, content });
  }
  return skillView(args.name);
}

module.exports = { name, description, inputSchema, execute };
