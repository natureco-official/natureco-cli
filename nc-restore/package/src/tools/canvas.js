module.exports = {
  name: 'canvas',
  description: 'Create and display rich content: tables, charts, formatted text, and structured data',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'Canvas type: table, markdown, code, data, separator, heading', enum: ['table', 'markdown', 'code', 'data', 'separator', 'heading'] },
      title: { type: 'string', description: 'Section title' },
      content: { type: 'string', description: 'Text content for markdown/code types' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Column headers (for table type)' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table rows (for table type)' },
      data: { type: 'object', description: 'Structured data to display (for data type)' },
      language: { type: 'string', description: 'Code language (for code type)' }
    },
    required: ['type']
  },

  async execute(params) {
    try {
      const chalk = require('chalk');
      const w = process.stdout.columns || 80;
      const line = chalk.gray('─'.repeat(w));
      const thin = chalk.gray('─'.repeat(40));

      let output = ['', line];

      if (params.title) {
        output.push(chalk.bold.cyan(`  ${params.title}`));
        output.push(thin);
      }

      if (params.type === 'heading') {
        output = ['', '', chalk.bold.green(`  ${'█'.repeat(4)} ${params.content}`), ''];
        output.push(line);
      }

      if (params.type === 'separator') {
        output = ['', line, ''];
      }

      if (params.type === 'markdown') {
        const lines = (params.content || '').split('\n');
        for (const lineText of lines) {
          output.push(lineText.startsWith('#')
            ? chalk.bold.cyan(`  ${lineText}`)
            : lineText.startsWith('-') || lineText.startsWith('*')
            ? chalk.white(`  ${lineText}`)
            : lineText.startsWith('>')
            ? chalk.gray(`  ${lineText}`)
            : chalk.white(`  ${lineText}`));
        }
      }

      if (params.type === 'code') {
        const lang = params.language || 'text';
        output.push(chalk.gray(`  ── ${lang} ──`));
        const codeLines = (params.content || '').split('\n');
        for (const lineText of codeLines) {
          output.push(chalk.yellow(`  │ ${lineText}`));
        }
        output.push(chalk.gray('  ' + '─'.repeat(40)));
      }

      if (params.type === 'table') {
        const headers = params.headers || [];
        const rows = params.rows || [];

        if (headers.length > 0) {
          const headerLine = headers.map(h => chalk.bold.cyan(h.padEnd(20))).join(' │ ');
          output.push(`  ${headerLine}`);
          output.push(chalk.gray(`  ${'─'.repeat(Math.max(40, headers.length * 22))}`));
        }

        for (const row of rows) {
          const rowLine = row.map((cell, i) => {
            const width = headers[i] ? headers[i].length : 20;
            return (cell || '').padEnd(Math.max(width, 20));
          }).join(' │ ');
          output.push(`  ${rowLine}`);
        }
      }

      if (params.type === 'data') {
        const d = params.data || {};
        for (const [key, value] of Object.entries(d)) {
          const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
          output.push(chalk.white(`  ${key}`) + chalk.gray(': ') + chalk.cyan(val.length > 60 ? val.slice(0, 60) + '...' : val));
        }
      }

      output.push(line);
      output.push('');

      return {
        success: true,
        type: params.type,
        output: output.join('\n'),
        rendered: true
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
