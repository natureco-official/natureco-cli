const { select, input, password, confirm, checkbox } = require('@inquirer/prompts');

module.exports = {
  async prompt(questions) {
    const results = {};
    for (const q of questions) {
      if (q.type === 'list') {
        results[q.name] = await select({
          message: q.message,
          choices: q.choices.map(c =>
            typeof c === 'string' ? { value: c, name: c } : c
          )
        });
      } else if (q.type === 'password') {
        results[q.name] = await password({ message: q.message, mask: q.mask });
      } else if (q.type === 'checkbox') {
        results[q.name] = await checkbox({
          message: q.message,
          choices: q.choices.map(c =>
            typeof c === 'string' ? { value: c, name: c } : c
          )
        });
      } else if (q.type === 'confirm') {
        results[q.name] = await confirm({ message: q.message, default: q.default });
      } else {
        results[q.name] = await input({ message: q.message, default: q.default });
      }
    }
    return results;
  }
};
