const chalk = require('chalk');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getConfig, saveConfig } = require('../utils/config');

const BOARD_FILE = path.join(os.homedir(), '.natureco', 'data', 'workboard.json');

function loadBoard() {
  try {
    if (fs.existsSync(BOARD_FILE)) {
      return JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
    }
  } catch {}
  return { columns: ['todo', 'in-progress', 'done'], items: [] };
}

function saveBoard(board) {
  const dir = path.dirname(BOARD_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
}

function workboard(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'show') return showBoard();
  if (action === 'add') return addItem(params.join(' '));
  if (action === 'move') return moveItem(params[0], params[1]);
  if (action === 'remove') return removeItem(params[0]);
  if (action === 'clear') return clearBoard();
  if (action === 'columns') return manageColumns(params);
  if (action === 'export') return exportBoard();
  if (action === 'import') return importBoard(params[0]);

  console.log(chalk.red(`\n  ❌ ${L('Bilinmeyen komut', 'Unknown command')}: ${action}\n`));
  console.log(chalk.gray(L('  Kullanım: natureco workboard [show|add|move|remove|clear|columns|export|import]\n', '  Usage: natureco workboard [show|add|move|remove|clear|columns|export|import]\n')));
  process.exit(1);
}

function showBoard() {
  const board = loadBoard();
  const config = getConfig();
  const wbConfig = config.workboard || {};
  const columns = wbConfig.columns || board.columns;

  console.log(chalk.cyan('\n  📋 Work Board\n'));
  console.log(chalk.gray('  ' + '─'.repeat(64)));

  for (const col of columns) {
    const items = board.items.filter(i => i.column === col || (!i.column && col === columns[0]));
    const colLabel = col === 'todo' ? '📋 To Do' : col === 'in-progress' ? '🔄 In Progress' : col === 'done' ? '✅ Done' : col;
    console.log(chalk.white(`\n  ${colLabel} (${items.length})`));

    if (items.length === 0) {
      console.log(chalk.gray('    (empty)'));
    } else {
      for (const item of items) {
        const id = item.id || '';
        const text = item.text || '';
        const priority = item.priority || '';
        const prioTag = priority === 'high' ? chalk.red('‼️') : priority === 'medium' ? chalk.yellow('❗') : priority === 'low' ? chalk.gray('📌') : '';
        console.log(`  ${chalk.gray(`[${id}]`)} ${prioTag} ${chalk.white(text.substring(0, 60))}${text.length > 60 ? '…' : ''}`);
      }
    }
  }

  console.log(chalk.gray('\n  ' + '─'.repeat(64)));
  console.log(chalk.gray(`  ${board.items.length} total items across ${columns.length} columns`));
  console.log(chalk.gray('\n  Commands:'));
  console.log(chalk.cyan('    add <text>') + chalk.gray('          Add item to To Do'));
  console.log(chalk.cyan('    move <id> <column>') + chalk.gray('   Move item to column'));
  console.log(chalk.cyan('    remove <id>') + chalk.gray('         Remove item'));
  console.log(chalk.cyan('    columns list/set') + chalk.gray('    Manage columns'));
  console.log(chalk.cyan('    export') + chalk.gray('              Export board as JSON'));
  console.log(chalk.cyan('    import <file>') + chalk.gray('      Import board from JSON'));
  console.log(chalk.cyan('    clear') + chalk.gray('               Clear all items'));
  console.log();
}

function addItem(text) {
  if (!text) {
    console.log(chalk.red(L('\n  ❌ Text gerekli\n', '\n  ❌ Text required\n')));
    console.log(chalk.cyan('    natureco workboard add "Task description"\n'));
    process.exit(1);
  }

  const board = loadBoard();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  board.items.push({
    id,
    text,
    column: board.columns[0] || 'todo',
    priority: 'medium',
    created: new Date().toISOString()
  });
  saveBoard(board);
  console.log(chalk.green(`\n  ✅ Added: ${chalk.white(text)} ${chalk.gray(`[${id}]`)}\n`));
}

function moveItem(id, column) {
  if (!id || !column) {
    console.log(chalk.red(L('\n  ❌ id ve column gerekli\n', '\n  ❌ id and column required\n')));
    console.log(chalk.cyan('    natureco workboard move <id> done\n'));
    process.exit(1);
  }

  const board = loadBoard();
  const item = board.items.find(i => i.id === id);
  if (!item) {
    console.log(chalk.red(`\n  ❌ ${L('Item bulunamadı', 'Item not found')}: ${id}\n`));
    process.exit(1);
  }

  item.column = column;
  item.updated = new Date().toISOString();
  saveBoard(board);
  console.log(chalk.green(`\n  ✅ Moved "${item.text.substring(0, 40)}" → ${column}\n`));
}

function removeItem(id) {
  if (!id) {
    console.log(chalk.red(L('\n  ❌ id gerekli\n', '\n  ❌ id required\n')));
    process.exit(1);
  }

  const board = loadBoard();
  const idx = board.items.findIndex(i => i.id === id);
  if (idx === -1) {
    console.log(chalk.red(`\n  ❌ ${L('Item bulunamadı', 'Item not found')}: ${id}\n`));
    process.exit(1);
  }

  const removed = board.items.splice(idx, 1)[0];
  saveBoard(board);
  console.log(chalk.green(`\n  ✅ Removed: ${removed.text.substring(0, 40)}\n`));
}

function clearBoard() {
  const board = loadBoard();
  board.items = [];
  saveBoard(board);
  console.log(chalk.gray(L('\n  🗑️  Board temizlendi\n', '\n  🗑️  Board cleared\n')));
}

function manageColumns(params) {
  const config = getConfig();
  if (!config.workboard) config.workboard = {};

  if (params[0] === 'set') {
    const cols = params.slice(1);
    if (cols.length === 0) {
      console.log(chalk.red(L('\n  ❌ En az bir kolon gerekli\n', '\n  ❌ At least one column required\n')));
      process.exit(1);
    }
    config.workboard.columns = cols;
    saveConfig(config);
    console.log(chalk.green(`\n  ✅ Columns set: ${cols.join(', ')}\n`));
    return;
  }

  const board = loadBoard();
  const columns = config.workboard.columns || board.columns;
  console.log(chalk.cyan('\n  📋 Columns\n'));
  for (const col of columns) {
    const count = board.items.filter(i => i.column === col).length;
    console.log(`  ${chalk.white(col)} ${chalk.gray(`(${count} items)`)}`);
  }
  console.log(chalk.gray('\n  Set columns:'));
  console.log(chalk.cyan('    natureco workboard columns set todo in-progress review done'));
  console.log();
}

function exportBoard() {
  const board = loadBoard();
  console.log(chalk.cyan('\n  📋 Board Export\n'));
  console.log(JSON.stringify(board, null, 2));
  console.log();
}

function importBoard(filePath) {
  if (!filePath) {
    console.log(chalk.red(L('\n  ❌ Dosya gerekli\n', '\n  ❌ File required\n')));
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.log(chalk.red(`\n  ❌ ${L('Dosya bulunamadı', 'File not found')}: ${filePath}\n`));
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items || !Array.isArray(data.items)) {
      console.log(chalk.red(L('\n  ❌ Geçersiz board JSON (items array gerekli)\n', '\n  ❌ Invalid board JSON (items array required)\n')));
      process.exit(1);
    }

    saveBoard(data);
    console.log(chalk.green(`\n  ✅ Board imported: ${data.items.length} items\n`));
  } catch (err) {
    console.log(chalk.red(`\n  ❌ ${L('Import hatası', 'Import error')}: ${err.message}\n`));
    process.exit(1);
  }
}

module.exports = workboard;
