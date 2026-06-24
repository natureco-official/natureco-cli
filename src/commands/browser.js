const path = require('path');
const fs = require('fs');
const os = require('os');
const chalk = require('chalk');
const { getConfig, saveConfig } = require('../utils/config');

const BROWSER_STATE_FILE = path.join(os.homedir(), '.natureco', 'browser-state.json');

function getState() {
  if (!fs.existsSync(BROWSER_STATE_FILE)) {
    return { running: false, currentUrl: null, tabs: [], focusedTabId: null };
  }
  try {
    return JSON.parse(fs.readFileSync(BROWSER_STATE_FILE, 'utf8'));
  } catch {
    return { running: false, currentUrl: null, tabs: [], focusedTabId: null };
  }
}

function saveState(state) {
  const dir = path.dirname(BROWSER_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(BROWSER_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function browser(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'status') return cmdStatus();
  if (action === 'doctor') return cmdDoctor();
  if (action === 'start') return cmdStart();
  if (action === 'stop') return cmdStop();
  if (action === 'profiles') return cmdProfiles();
  if (action === 'tabs') return cmdTabs();
  if (action === 'open') return cmdOpen(params);
  if (action === 'close') return cmdClose(params[0]);
  if (action === 'focus') return cmdFocus(params[0]);
  if (action === 'navigate') return cmdNavigate(params[0]);
  if (action === 'screenshot') return cmdScreenshot(params);
  if (action === 'snapshot') return cmdSnapshot();
  if (action === 'click') return cmdClick(params[0]);
  if (action === 'type') return cmdType(params[0], params.slice(1).join(' '));
  if (action === 'press') return cmdPress(params[0]);
  if (action === 'resize') return cmdResize(params[0], params[1]);
  if (action === 'hover') return cmdHover(params[0]);
  if (action === 'drag') return cmdDrag(params[0], params[1], params[2]);
  if (action === 'select') return cmdSelect(params[0], params[1]);
  if (action === 'upload') return cmdUpload(params[0], params[1]);
  if (action === 'fill') return cmdFill(params[0], params.slice(1).join(' '));
  if (action === 'dialog') return cmdDialog(params[0]);
  if (action === 'wait') return cmdWait(params[0]);
  if (action === 'evaluate') return cmdEvaluate(params.join(' '));
  if (action === 'console') return cmdConsole();
  if (action === 'pdf') return cmdPdf(params[0]);
  if (action === 'reset-profile') return cmdResetProfile(params[0]);
  if (action === 'create-profile') return cmdCreateProfile(params[0]);
  if (action === 'delete-profile') return cmdDeleteProfile(params[0]);

  console.log(chalk.red(`\n  Unknown browser command: ${action}\n`));
  console.log(chalk.gray('  Usage: natureco browser <command> [options]\n'));
  console.log(chalk.gray('  Commands:'));
  console.log(chalk.gray('    status                          Show browser status'));
  console.log(chalk.gray('    doctor                          Check browser readiness'));
  console.log(chalk.gray('    start                           Start browser session'));
  console.log(chalk.gray('    stop                            Stop browser session'));
  console.log(chalk.gray('    profiles                        List browser profiles'));
  console.log(chalk.gray('    tabs                            List open tabs'));
  console.log(chalk.gray('    open <url> [--label <name>]     Open URL in new tab'));
  console.log(chalk.gray('    close <target>                  Close tab by id or label'));
  console.log(chalk.gray('    focus <target>                  Focus tab by id or label'));
  console.log(chalk.gray('    navigate <url>                  Navigate current tab'));
  console.log(chalk.gray('    screenshot [--full-page]        Take screenshot'));
  console.log(chalk.gray('    snapshot                        Get page snapshot'));
  console.log(chalk.gray('    click <ref>                     Click element by ref'));
  console.log(chalk.gray('    type <ref> <text>               Type text into element'));
  console.log(chalk.gray('    press <key>                     Press keyboard key'));
  console.log(chalk.gray('    resize <width> <height>         Resize browser window'));
  console.log(chalk.gray('    hover <selector>                Hover over element'));
  console.log(chalk.gray('    drag <selector> <x> <y>         Drag element by offset'));
  console.log(chalk.gray('    select <selector> <value>       Select dropdown option'));
  console.log(chalk.gray('    upload <selector> <path>        Upload file'));
  console.log(chalk.gray('    fill <selector> <text>          Fill form field'));
  console.log(chalk.gray('    dialog <action>                 Handle dialog (accept/dismiss)'));
  console.log(chalk.gray('    wait <ms>                       Wait for milliseconds'));
  console.log(chalk.gray('    evaluate <code>                 Evaluate JS in page'));
  console.log(chalk.gray('    console                         Get console logs'));
  console.log(chalk.gray('    pdf <path>                      Save page as PDF'));
  console.log(chalk.gray('    reset-profile [name]            Reset browser profile'));
  console.log(chalk.gray('    create-profile <name>           Create new profile'));
  console.log(chalk.gray('    delete-profile <name>           Delete profile\n'));
  process.exit(1);
}

function cmdStatus() {
  const state = getState();

  console.log(chalk.cyan('\n  Browser Status\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));

  if (state.running) {
    console.log(chalk.green('  Status: Running'));
  } else {
    console.log(chalk.gray('  Status: Stopped'));
  }

  const tabCount = state.tabs ? state.tabs.length : 0;
  console.log(chalk.white(`  Tabs: ${tabCount}`));

  if (state.currentUrl) {
    console.log(chalk.white('  Current URL:'), chalk.gray(state.currentUrl));
  }

  if (state.focusedTabId) {
    const focused = (state.tabs || []).find(t => t.id === state.focusedTabId);
    if (focused) {
      console.log(chalk.white('  Focused tab:'), chalk.gray(`${focused.label || focused.id} (${focused.url})`));
    }
  }

  console.log(chalk.gray('  State file:'), chalk.gray(BROWSER_STATE_FILE));
  console.log();
}

function cmdDoctor() {
  const config = getConfig();
  const profiles = config.browser && config.browser.profiles ? config.browser.profiles : {};

  console.log(chalk.cyan('\n  Browser Doctor\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));

  let allGood = true;

  const profileCount = Object.keys(profiles).length;
  if (profileCount > 0) {
    console.log(chalk.green('  Profiles:'), chalk.white(`${profileCount} configured`));
  } else {
    console.log(chalk.yellow('  Profiles: None configured'));
    console.log(chalk.gray('    Run `browser start` to create a default profile'));
    allGood = false;
  }

  const stateDir = path.dirname(BROWSER_STATE_FILE);
  if (fs.existsSync(stateDir)) {
    console.log(chalk.green('  State directory:'), chalk.white(stateDir));
  } else {
    console.log(chalk.yellow('  State directory: Not created yet'));
  }

  const chromiumPaths = getChromiumPaths();
  let foundBrowser = false;
  for (const cp of chromiumPaths) {
    if (fs.existsSync(cp)) {
      console.log(chalk.green('  Browser binary:'), chalk.white(cp));
      foundBrowser = true;
      break;
    }
  }
  if (!foundBrowser) {
    console.log(chalk.yellow('  Browser binary: Not detected'));
    console.log(chalk.gray('    Install Chrome/Chromium/Brave for automation support'));
  }

  if (allGood) {
    console.log(chalk.green('\n  All checks passed.\n'));
  } else {
    console.log(chalk.yellow('\n  Some items need attention.\n'));
  }
}

function cmdStart() {
  const state = getState();
  if (state.running) {
    console.log(chalk.yellow('\n  Browser session is already running.\n'));
    return;
  }

  const config = getConfig();
  if (!config.browser) config.browser = {};
  if (!config.browser.profiles) config.browser.profiles = {};

  const profiles = config.browser.profiles;
  if (Object.keys(profiles).length === 0) {
    const defaultProfile = {
      name: 'default',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      created: new Date().toISOString()
    };
    config.browser.profiles.default = defaultProfile;
    saveConfig(config);
    console.log(chalk.green('  Created default browser profile.\n'));
  }

  state.running = true;
  state.currentUrl = null;
  state.tabs = [];
  state.focusedTabId = null;
  saveState(state);

  console.log(chalk.green('\n  Browser session started.\n'));
  console.log(chalk.gray('  Browser automation is ready. Use CDP-compatible browser to connect.\n'));
}

function cmdStop() {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  No browser session is running.\n'));
    return;
  }

  state.running = false;
  state.currentUrl = null;
  state.tabs = [];
  state.focusedTabId = null;
  saveState(state);

  console.log(chalk.gray('\n  Browser session stopped.\n'));
}

function cmdProfiles() {
  const config = getConfig();
  const profiles = config.browser && config.browser.profiles ? config.browser.profiles : {};

  console.log(chalk.cyan('\n  Browser Profiles\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));

  const keys = Object.keys(profiles);
  if (keys.length === 0) {
    console.log(chalk.gray('  No profiles configured.\n'));
    return;
  }

  for (const key of keys) {
    const p = profiles[key];
    console.log(chalk.white(`  ${key}`));
    console.log(chalk.gray(`    User Agent: ${p.userAgent || 'default'}`));
    if (p.viewport) {
      console.log(chalk.gray(`    Viewport: ${p.viewport.width}x${p.viewport.height}`));
    }
    if (p.created) {
      console.log(chalk.gray(`    Created: ${p.created}`));
    }
    console.log();
  }
}

function cmdTabs() {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running. Start it with `browser start`.\n'));
    return;
  }

  const tabs = state.tabs || [];

  console.log(chalk.cyan('\n  Open Tabs\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));

  if (tabs.length === 0) {
    console.log(chalk.gray('  No open tabs.\n'));
    return;
  }

  for (const tab of tabs) {
    const focusMark = tab.id === state.focusedTabId ? chalk.green(' <-- focused') : '';
    console.log(chalk.white(`  [${tab.id}]`), chalk.gray(tab.label || 'untitled'), chalk.gray('-'), chalk.white(tab.url) + focusMark);
  }
  console.log();
}

function cmdOpen(params) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running. Start it with `browser start`.\n'));
    return;
  }

  const url = params[0];
  if (!url) {
    console.log(chalk.red('\n  URL is required.\n'));
    console.log(chalk.gray('  Usage: browser open <url> [--label <name>]\n'));
    process.exit(1);
  }

  let label = null;
  const labelIdx = params.indexOf('--label');
  if (labelIdx !== -1 && params[labelIdx + 1]) {
    label = params[labelIdx + 1];
  }

  const tabId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const tab = { id: tabId, label: label || url, url };
  state.tabs = state.tabs || [];
  state.tabs.push(tab);
  state.focusedTabId = tabId;
  state.currentUrl = url;
  saveState(state);

  console.log(chalk.green(`\n  Opening: ${url}\n`));
  console.log(chalk.gray(`  Tab ID: ${tabId}`));
  if (label) {
    console.log(chalk.gray(`  Label: ${label}`));
  }
  console.log(chalk.gray('  (CDP: Chrome DevTools Protocol would launch a new tab here)\n'));
}

function cmdClose(target) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!target) {
    console.log(chalk.red('\n  Target tab id or label is required.\n'));
    process.exit(1);
  }

  const idx = (state.tabs || []).findIndex(t => t.id === target || t.label === target);
  if (idx === -1) {
    console.log(chalk.yellow(`\n  Tab not found: ${target}\n`));
    return;
  }

  const removed = state.tabs.splice(idx, 1)[0];
  if (state.focusedTabId === removed.id) {
    state.focusedTabId = state.tabs.length > 0 ? state.tabs[state.tabs.length - 1].id : null;
  }
  state.currentUrl = state.focusedTabId
    ? (state.tabs.find(t => t.id === state.focusedTabId) || {}).url || null
    : null;
  saveState(state);

  console.log(chalk.gray(`\n  Closed tab: ${removed.label || removed.id}\n`));
}

function cmdFocus(target) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!target) {
    console.log(chalk.red('\n  Target tab id or label is required.\n'));
    process.exit(1);
  }

  const tab = (state.tabs || []).find(t => t.id === target || t.label === target);
  if (!tab) {
    console.log(chalk.yellow(`\n  Tab not found: ${target}\n`));
    return;
  }

  state.focusedTabId = tab.id;
  state.currentUrl = tab.url;
  saveState(state);

  console.log(chalk.green(`\n  Focused tab: ${tab.label || tab.id} (${tab.url})\n`));
}

function cmdNavigate(url) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!url) {
    console.log(chalk.red('\n  URL is required.\n'));
    process.exit(1);
  }

  if (state.focusedTabId) {
    const tab = (state.tabs || []).find(t => t.id === state.focusedTabId);
    if (tab) {
      tab.url = url;
    }
  }
  state.currentUrl = url;
  saveState(state);

  console.log(chalk.green(`\n  Navigating to: ${url}\n`));
  console.log(chalk.gray('  (CDP: Page.navigate would be called)\n'));
}

function cmdScreenshot(params) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  const fullPage = params.includes('--full-page');

  const filename = `screenshot-${Date.now()}.png`;
  const dir = path.join(os.homedir(), '.natureco', 'screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filepath = path.join(dir, filename);

  console.log(chalk.cyan('\n  Screenshot\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));
  console.log(chalk.white(`  File: ${filepath}`));
  console.log(chalk.white(`  Full page: ${fullPage ? 'Yes' : 'No'}`));
  console.log(chalk.gray('  (CDP: Page.captureScreenshot would be called)'));
  console.log(chalk.gray('  (Screenshot metadata logged — actual capture requires CDP)\n'));
}

function cmdSnapshot() {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  const filename = `snapshot-${Date.now()}.html`;
  const dir = path.join(os.homedir(), '.natureco', 'snapshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filepath = path.join(dir, filename);

  let html = '<html><body><p>Snapshot mock — actual content requires CDP.</p></body></html>';
  if (state.currentUrl) {
    html = `<!DOCTYPE html><html><head><title>Snapshot of ${state.currentUrl}</title></head><body><p>Snapshot captured at ${new Date().toISOString()}</p><p>URL: ${state.currentUrl}</p></body></html>`;
  }
  fs.writeFileSync(filepath, html, 'utf8');

  console.log(chalk.cyan('\n  Page Snapshot\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));
  console.log(chalk.white(`  Saved to: ${filepath}`));
  console.log(chalk.gray('  (CDP: Page.captureSnapshot would be called)\n'));
}

function cmdClick(ref) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!ref) {
    console.log(chalk.red('\n  Element reference is required.\n'));
    console.log(chalk.gray('  Usage: browser click <ref>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Clicking element: ${ref}\n`));
  console.log(chalk.gray('  (CDP: Input.dispatchMouseEvent would be called)\n'));
}

function cmdType(ref, text) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!ref || !text) {
    console.log(chalk.red('\n  Element reference and text are required.\n'));
    console.log(chalk.gray('  Usage: browser type <ref> <text>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Typing into element: ${ref}\n`));
  console.log(chalk.white(`  Text: ${text}`));
  console.log(chalk.gray('  (CDP: Input.dispatchKeyEvent would be called)\n'));
}

function cmdPress(key) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!key) {
    console.log(chalk.red('\n  Key is required.\n'));
    console.log(chalk.gray('  Usage: browser press <key>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Pressing key: ${key}\n`));
  console.log(chalk.gray('  (CDP: Input.dispatchKeyEvent would be called)\n'));
}

function cmdResize(width, height) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!width || !height) {
    console.log(chalk.red('\n  Width and height are required.\n'));
    console.log(chalk.gray('  Usage: browser resize <width> <height>\n'));
    process.exit(1);
  }

  const w = parseInt(width, 10);
  const h = parseInt(height, 10);

  state.viewport = { width: w, height: h };
  saveState(state);

  console.log(chalk.green(`\n  Resized browser to ${w}x${h}\n`));
  console.log(chalk.gray('  (CDP: Browser.setWindowBounds would be called)\n'));
}

function cmdHover(selector) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!selector) {
    console.log(chalk.red('\n  Selector is required.\n'));
    console.log(chalk.gray('  Usage: browser hover <selector>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Hovering over: ${selector}\n`));
  console.log(chalk.gray('  (CDP: Runtime.evaluate + Input.dispatchMouseEvent would be called)\n'));
}

function cmdDrag(selector, x, y) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!selector || x === undefined || y === undefined) {
    console.log(chalk.red('\n  Selector, x, and y are required.\n'));
    console.log(chalk.gray('  Usage: browser drag <selector> <x> <y>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Dragging element: ${selector}\n`));
  console.log(chalk.white(`  Offset: (${x}, ${y})`));
  console.log(chalk.gray('  (CDP: Input.dispatchMouseEvent mousedown + mousemove + mouseup would be called)\n'));
}

function cmdSelect(selector, value) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!selector || value === undefined) {
    console.log(chalk.red('\n  Selector and value are required.\n'));
    console.log(chalk.gray('  Usage: browser select <selector> <value>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Selecting option in: ${selector}\n`));
  console.log(chalk.white(`  Value: ${value}`));
  console.log(chalk.gray('  (CDP: Runtime.evaluate to set selectedIndex would be called)\n'));
}

function cmdUpload(selector, filepath) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!selector || !filepath) {
    console.log(chalk.red('\n  Selector and file path are required.\n'));
    console.log(chalk.gray('  Usage: browser upload <selector> <path>\n'));
    process.exit(1);
  }

  if (!fs.existsSync(filepath)) {
    console.log(chalk.red(`\n  File not found: ${filepath}\n`));
    return;
  }

  console.log(chalk.green(`\n  Uploading file to: ${selector}\n`));
  console.log(chalk.white(`  File: ${filepath}`));
  console.log(chalk.gray('  (CDP: DOM.setFileInputFiles would be called)\n'));
}

function cmdFill(selector, text) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!selector || text === undefined || text === '') {
    console.log(chalk.red('\n  Selector and text are required.\n'));
    console.log(chalk.gray('  Usage: browser fill <selector> <text>\n'));
    process.exit(1);
  }

  console.log(chalk.green(`\n  Filling form field: ${selector}\n`));
  console.log(chalk.white(`  Text: ${text}`));
  console.log(chalk.gray('  (CDP: Runtime.evaluate to set value + dispatch input event would be called)\n'));
}

function cmdDialog(action) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!action || (action !== 'accept' && action !== 'dismiss')) {
    console.log(chalk.red('\n  Action must be "accept" or "dismiss".\n'));
    console.log(chalk.gray('  Usage: browser dialog <accept|dismiss>\n'));
    process.exit(1);
  }

  state.lastDialogAction = action;
  saveState(state);

  console.log(chalk.green(`\n  Dialog action: ${action}\n`));
  console.log(chalk.gray('  (CDP: Page.handleJavaScriptDialog would be called)\n'));
}

function cmdWait(ms) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!ms || isNaN(parseInt(ms, 10)) || parseInt(ms, 10) < 0) {
    console.log(chalk.red('\n  Valid milliseconds value is required.\n'));
    console.log(chalk.gray('  Usage: browser wait <ms>\n'));
    process.exit(1);
  }

  console.log(chalk.gray(`\n  Waiting ${ms}ms... (stub — would wait asynchronously)\n`));
}

function cmdEvaluate(code) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!code) {
    console.log(chalk.red('\n  JavaScript code is required.\n'));
    console.log(chalk.gray('  Usage: browser evaluate <code>\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n  Evaluating JavaScript\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));
  console.log(chalk.white('  Code:'));
  console.log(chalk.gray(`  ${code}`));
  console.log(chalk.gray('  (CDP: Runtime.evaluate would be called and result returned)\n'));
}

function cmdConsole() {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  const logs = state.consoleLogs || [];

  console.log(chalk.cyan('\n  Console Logs\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));

  if (logs.length === 0) {
    console.log(chalk.gray('  No console logs captured yet.\n'));
    return;
  }

  for (const log of logs) {
    const level = log.level || 'log';
    const color = level === 'error' ? chalk.red : level === 'warn' ? chalk.yellow : chalk.white;
    console.log(`  ${chalk.gray(`[${log.timestamp || ''}]`)} ${color(`[${level}]`)} ${log.text}`);
  }
  console.log();
}

function cmdPdf(filepath) {
  const state = getState();
  if (!state.running) {
    console.log(chalk.yellow('\n  Browser is not running.\n'));
    return;
  }

  if (!filepath) {
    console.log(chalk.red('\n  File path is required.\n'));
    console.log(chalk.gray('  Usage: browser pdf <path>\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n  Saving PDF\n'));
  console.log(chalk.gray('  ' + '-'.repeat(48)));
  console.log(chalk.white(`  File: ${filepath}`));
  console.log(chalk.gray('  (CDP: Page.printToPDF would be called)\n'));
}

function cmdResetProfile(name) {
  const config = getConfig();
  if (!config.browser) config.browser = {};
  if (!config.browser.profiles) config.browser.profiles = {};

  const profileName = name || 'default';

  if (!config.browser.profiles[profileName]) {
    console.log(chalk.yellow(`\n  Profile not found: ${profileName}\n`));
    return;
  }

  config.browser.profiles[profileName] = {
    name: profileName,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    created: new Date().toISOString()
  };
  saveConfig(config);

  console.log(chalk.green(`\n  Profile reset: ${profileName}\n`));
}

function cmdCreateProfile(name) {
  if (!name) {
    console.log(chalk.red('\n  Profile name is required.\n'));
    console.log(chalk.gray('  Usage: browser create-profile <name>\n'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.browser) config.browser = {};
  if (!config.browser.profiles) config.browser.profiles = {};

  if (config.browser.profiles[name]) {
    console.log(chalk.yellow(`\n  Profile already exists: ${name}\n`));
    return;
  }

  config.browser.profiles[name] = {
    name,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
    created: new Date().toISOString()
  };
  saveConfig(config);

  console.log(chalk.green(`\n  Profile created: ${name}\n`));
}

function cmdDeleteProfile(name) {
  if (!name) {
    console.log(chalk.red('\n  Profile name is required.\n'));
    console.log(chalk.gray('  Usage: browser delete-profile <name>\n'));
    process.exit(1);
  }

  const config = getConfig();
  if (!config.browser) config.browser = {};
  if (!config.browser.profiles) config.browser.profiles = {};

  if (!config.browser.profiles[name]) {
    console.log(chalk.yellow(`\n  Profile not found: ${name}\n`));
    return;
  }

  delete config.browser.profiles[name];
  saveConfig(config);

  console.log(chalk.green(`\n  Profile deleted: ${name}\n`));
}

function getChromiumPaths() {
  const candidates = [];
  const home = os.homedir();

  const winPaths = [
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local'), 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Chromium', 'Application', 'chrome.exe'),
    path.join(process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local'), 'Chromium', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local'), 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local'), 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];

  const unixPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ];

  if (process.platform === 'win32') {
    candidates.push(...winPaths);
  } else {
    candidates.push(...unixPaths);
  }

  return candidates;
}

module.exports = browser;
