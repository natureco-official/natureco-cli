const chalk = require('chalk');
const { loadPairings, savePairings, genCode } = require('../utils/pairing-store');

function pairing(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return cmdList();
  if (action === 'approve') return cmdApprove(params[0]);
  if (action === 'reject') return cmdReject(params[0]);
  if (action === 'generate') return cmdGenerate();

  console.log(chalk.red(`\n  Unknown pairing action: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco pairing <action> [params]'));
  console.log(chalk.gray('  Actions: list, approve <id>, reject <id>, generate\n'));
  process.exit(1);
}

function cmdList() {
  const pairings = loadPairings();
  const pending = pairings.filter(p => p.status === 'pending');

  console.log(chalk.cyan(`\n  Pending Pairings (${pending.length})\n`));
  console.log(chalk.gray('  ' + '─'.repeat(48)));

  if (pending.length === 0) {
    console.log(chalk.gray('  No pending pairings.\n'));
    return;
  }

  for (const p of pending) {
    console.log(`  ${chalk.white(p.id)}`);
    console.log(chalk.gray(`    Code:   ${p.code}`));
    console.log(chalk.gray(`    Node:   ${p.nodeName || '—'}`));
    console.log(chalk.gray(`    Since:  ${p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}`));
  }
  console.log('');
}

function cmdApprove(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco pairing approve <id>\n')); process.exit(1); }

  const pairings = loadPairings();
  const p = pairings.find(x => x.id === id && x.status === 'pending');

  if (!p) { console.log(chalk.yellow(`\n  No pending pairing with id "${id}".\n`)); return; }

  p.status = 'approved';
  p.approvedAt = new Date().toISOString();
  savePairings(pairings);
  console.log(chalk.green(`\n  Pairing "${id}" approved.\n`));
}

function cmdReject(id) {
  if (!id) { console.log(chalk.red('\n  Usage: natureco pairing reject <id>\n')); process.exit(1); }

  const pairings = loadPairings();
  const idx = pairings.findIndex(x => x.id === id && x.status === 'pending');

  if (idx === -1) { console.log(chalk.yellow(`\n  No pending pairing with id "${id}".\n`)); return; }

  pairings.splice(idx, 1);
  savePairings(pairings);
  console.log(chalk.gray(`\n  Pairing "${id}" rejected.\n`));
}

function cmdGenerate() {
  const code = genCode();
  const pairings = loadPairings();

  const entry = {
    id: `pair_${Date.now().toString(36)}`,
    code,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  pairings.push(entry);
  savePairings(pairings);

  console.log(chalk.cyan('\n  Pairing Code Generated\n'));
  console.log(chalk.gray('  ' + '─'.repeat(48)));
  console.log(`  ${chalk.white('Code:')} ${chalk.green(code)}`);
  console.log(`  ${chalk.white('ID:')}   ${chalk.gray(entry.id)}`);
  console.log('');
  console.log(chalk.gray('  Share this code with the node to pair.\n'));
}

module.exports = pairing;
