/**
 * skills_list — Discover available skills (progressive disclosure tier 1)
 */

const { skillsList } = require('../utils/skill-index');

const name = 'skills_list';
const description = 'List available skills with name and description. Use skill_view(name) to load full content.';
const parameters = {
  type: 'object',
  properties: {
    category: { type: 'string', description: 'Optional category filter' },
  },
  required: [],
};

async function execute(args) {
  return skillsList(args.category || null);
}

module.exports = { name, description, parameters, execute };
