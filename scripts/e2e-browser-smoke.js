'use strict';

const browser = require('../src/tools/browser');

async function main() {
  const opened = await browser.execute({ action: 'open', url: 'https://example.com', visible: false });
  if (!opened.success) throw new Error('Open failed: ' + opened.error);
  const snapshot = await browser.execute({ action: 'snapshot', visible: false });
  if (!snapshot.success || snapshot.title !== 'Example Domain' || !snapshot.items.some(item => item.ref === '@e1')) {
    throw new Error('Snapshot did not expose the expected page and element ref');
  }
  const closed = await browser.execute({ action: 'close' });
  if (!closed.success) throw new Error('Close failed');
  console.log(JSON.stringify({ ok: true, mode: opened.mode, title: snapshot.title, firstRef: snapshot.items[0] }));
}

main().catch(async error => {
  try { await browser.execute({ action: 'close' }); } catch {}
  console.error(error.message);
  process.exitCode = 1;
});
