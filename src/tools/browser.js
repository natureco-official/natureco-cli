const fs = require('fs');
const os = require('os');
const path = require('path');

let contextPromise = null;
let activePage = null;

function chromeCandidates(platform = process.platform) {
  if (platform === 'darwin') return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];
  if (platform === 'win32') return [
    path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe'),
  ];
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
}

function findChrome(platform = process.platform, exists = fs.existsSync) {
  return chromeCandidates(platform).find(candidate => candidate && exists(candidate)) || null;
}

function safeUrl(value) {
  const parsed = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are allowed');
  return parsed.href;
}

async function getContext({ visible = true } = {}) {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const { chromium } = require('playwright-core');
    const executablePath = findChrome();
    if (!executablePath) throw new Error('Google Chrome, Chromium, or Microsoft Edge was not found');
    const userDataDir = path.join(os.homedir(), '.natureco', 'browser-profile');
    fs.mkdirSync(userDataDir, { recursive: true });
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: !visible,
      viewport: null,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
    context.on('close', () => { contextPromise = null; activePage = null; });
    const pages = context.pages();
    activePage = pages[0] || await context.newPage();
    return context;
  })().catch(error => { contextPromise = null; throw error; });
  return contextPromise;
}

async function pageFor(params = {}) {
  const context = await getContext({ visible: params.visible !== false });
  if (!activePage || activePage.isClosed()) activePage = context.pages().find(page => !page.isClosed()) || await context.newPage();
  return activePage;
}

async function snapshot(page) {
  const result = await page.evaluate(() => {
    document.querySelectorAll('[data-natureco-ref]').forEach(el => el.removeAttribute('data-natureco-ref'));
    const selector = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';
    const elements = Array.from(document.querySelectorAll(selector)).filter(el => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    }).slice(0, 250);
    const items = elements.map((el, index) => {
      const ref = `e${index + 1}`;
      el.setAttribute('data-natureco-ref', ref);
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.getAttribute('value') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 160);
      const type = el.getAttribute('type') || '';
      return { ref: `@${ref}`, role, name, type, disabled: Boolean(el.disabled) };
    });
    return { title: document.title, url: location.href, items, text: (document.body?.innerText || '').trim().slice(0, 6000) };
  });
  return result;
}

function refSelector(ref) {
  if (!/^@e\d+$/.test(String(ref || ''))) throw new Error('Use a fresh @e reference from browser snapshot');
  return `[data-natureco-ref="${String(ref).slice(1)}"]`;
}

async function execute(params) {
  const action = params.action === 'navigate' ? 'open' : params.action;
  if (action === 'close') {
    const context = contextPromise ? await contextPromise : null;
    if (context) await context.close();
    return { success: true, action: 'close' };
  }

  try {
    const page = await pageFor(params);
    if (action === 'open') {
      const url = safeUrl(params.url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.bringToFront();
      return { success: true, action: 'open', url: page.url(), title: await page.title(), mode: params.visible === false ? 'headless-persistent' : 'headed-persistent' };
    }
    if (action === 'snapshot') return { success: true, action, ...(await snapshot(page)) };
    if (action === 'click') {
      await page.locator(refSelector(params.ref)).click({ timeout: 15000 });
      await page.waitForTimeout(300);
      return { success: true, action, ref: params.ref, url: page.url() };
    }
    if (action === 'fill') {
      if (typeof params.text !== 'string') throw new Error('fill requires text');
      await page.locator(refSelector(params.ref)).fill(params.text, { timeout: 15000 });
      return { success: true, action, ref: params.ref };
    }
    if (action === 'type') {
      if (typeof params.text !== 'string') throw new Error('type requires text');
      await page.keyboard.type(params.text);
      return { success: true, action };
    }
    if (action === 'press') {
      if (!params.key) throw new Error('press requires key');
      await page.keyboard.press(params.key);
      await page.waitForTimeout(300);
      return { success: true, action, key: params.key, url: page.url() };
    }
    if (action === 'text') return { success: true, action, url: page.url(), content: (await page.locator('body').innerText()).slice(0, 10000) };
    if (action === 'current_url') return { success: true, action, url: page.url(), title: await page.title() };
    if (action === 'screenshot') {
      const buffer = await page.screenshot({ type: 'png', fullPage: params.fullPage !== false });
      return { success: true, action, url: page.url(), screenshot: buffer.toString('base64'), format: 'png' };
    }
    if (action === 'html') return { success: true, action, url: page.url(), html: (await page.content()).slice(0, 50000) };
    if (action === 'evaluate') {
      if (!params.script) throw new Error('evaluate requires script');
      const result = await page.evaluate(params.script);
      return { success: true, action, url: page.url(), result };
    }
    return { success: false, error: `Unknown browser action: ${params.action}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  name: 'browser',
  description: 'Persistent Chrome/Chromium agent. Use open → snapshot → @ref click/fill → snapshot. Visible by default; preserves login and storage in the NatureCo browser profile.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['open', 'navigate', 'snapshot', 'click', 'fill', 'type', 'press', 'text', 'current_url', 'screenshot', 'html', 'evaluate', 'close'] },
      url: { type: 'string' }, ref: { type: 'string', description: '@e reference from the latest snapshot' },
      text: { type: 'string' }, key: { type: 'string' }, script: { type: 'string' },
      visible: { type: 'boolean', description: 'Show browser window (default true)' }, fullPage: { type: 'boolean' },
    },
    required: ['action'],
  },
  execute,
  _test: { chromeCandidates, findChrome, safeUrl, refSelector },
};
