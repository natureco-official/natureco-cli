'use strict';

const workflow = require('../src/tools/workflow');

async function main() {
  const marker = `natureco-context-${Date.now()}.html`;
  const firstTask = `Bu test oturumundaki dosya adi ${marker}. Arac calistirma; sadece dosya adini iceren kisa bir onay ver.`;
  const first = await workflow.execute({ action: 'run', task: firstTask });
  if (!first || first.success === false || !first.reply) {
    throw new Error(`First turn failed: ${first?.error || 'empty reply'}`);
  }

  const history = [
    { role: 'user', content: firstTask },
    { role: 'assistant', content: String(first.reply) },
  ];
  const second = await workflow.execute({
    action: 'run',
    task: 'Az once konustugumuz dosyanin tam adi neydi? Yalnizca dosya adini soyle.',
    conversationHistory: history,
  });
  const reply = String(second?.reply || '');
  if (!second || second.success === false || !reply.includes(marker)) {
    throw new Error(`Context recall failed. Expected ${marker}; received: ${reply.slice(0, 240)}`);
  }

  console.log(JSON.stringify({ ok: true, marker, reply: reply.trim() }));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
