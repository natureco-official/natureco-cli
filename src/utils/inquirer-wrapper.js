const { select, input, password, confirm, checkbox } = require('@inquirer/prompts');

module.exports = {
  async prompt(questions) {
    // Non-TTY (pipe/script/CI): interaktif soru SORULAMAZ.
    // "readline was closed" çökmesi yerine güvenli varsayılanlarla dön:
    // confirm → default ?? false (onay istenmişse reddet), diğerleri → default ?? ''.
    if (!process.stdin.isTTY) {
      const results = {};
      for (const q of questions) {
        if (q.type === 'confirm') results[q.name] = q.default ?? false;
        else if (q.type === 'checkbox') results[q.name] = q.default ?? [];
        else results[q.name] = q.default ?? '';
      }
      return results;
    }
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
