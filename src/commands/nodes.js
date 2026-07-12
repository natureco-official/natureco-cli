const chalk = require('chalk');
const tui = require('../utils/tui');
const { getLang: _gl } = require('../utils/i18n');
const L = (tr, en) => (_gl() === 'en' ? en : tr);
const F = require('../utils/format');
const fs = require('fs');
const path = require('path');
const os = require('os');
// getConfig + saveConfig referenced 8× below — missing require relied on
// side-effect global from another module's load order.
const { getConfig, saveConfig } = require('../utils/config');

function nodes(args) {
  const [action, ...params] = args || [];

  if (!action || action === 'list') return listNodes();
  if (action === 'pair') return pairNode(params[0]);
  if (action === 'approve') return approveNode(params[0]);
  if (action === 'reject') return rejectNode(params[0]);
  if (action === 'remove') return removeNode(params[0]);
  if (action === 'rename') return renameNode(params[0], params.slice(1).join(' '));
  if (action === 'invoke') return invokeNode(params[0], params[1], params.slice(2));
  if (action === 'notify') return notifyNode(params[0], params.slice(1).join(' '));
  if (action === 'push') return pushNode(params[0]);
  if (action === 'canvas') {
    const sub = params[0];
    if (sub === 'a2ui') {
      if (params[1] === 'push') {
        const nodeId = params[2];
        const url = params[3];
        if (!nodeId || !url) {
          F.error('Node ID and URL required');
          F.info('Usage: natureco nodes canvas a2ui push <nodeId> <url>');
          process.exit(1);
        }
        F.info(`Would push A2UI from ${url} to node ${nodeId}`);
        return;
      }
      if (params[1] === 'reset') {
        const id = params[2] || 'default';
        F.info(`Would reset A2UI for node ${id}`);
        return;
      }
      F.error(`Unknown canvas a2ui command: ${params[1]}`);
      F.info('Usage: natureco nodes canvas a2ui [push|reset]');
      process.exit(1);
    }
    if (sub === 'snapshot') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes canvas snapshot <nodeId>');
        process.exit(1);
      }
      F.info(`Would snapshot canvas on node ${nodeId}`);
      return;
    }
    if (sub === 'present') {
      const nodeId = params[1];
      const url = params[2];
      if (!nodeId || !url) {
        F.error('Node ID and URL required');
        F.info('Usage: natureco nodes canvas present <nodeId> <url>');
        process.exit(1);
      }
      F.info(`Would present ${url} on node ${nodeId}`);
      return;
    }
    if (sub === 'hide') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes canvas hide <nodeId>');
        process.exit(1);
      }
      F.info(`Would hide canvas on node ${nodeId}`);
      return;
    }
    if (sub === 'navigate') {
      const nodeId = params[1];
      const url = params[2];
      if (!nodeId || !url) {
        F.error('Node ID and URL required');
        F.info('Usage: natureco nodes canvas navigate <nodeId> <url>');
        process.exit(1);
      }
      F.info(`Would navigate node ${nodeId} to ${url}`);
      return;
    }
    if (sub === 'eval') {
      const nodeId = params[1];
      const code = params.slice(2).join(' ');
      if (!nodeId || !code) {
        F.error('Node ID and code required');
        F.info('Usage: natureco nodes canvas eval <nodeId> <code>');
        process.exit(1);
      }
      F.info(`Would eval on node ${nodeId}: ${code}`);
      return;
    }
    return canvasNode(sub, params[1]);
  }
  if (action === 'camera') {
    const sub = params[0];
    if (sub === 'list') {
      const nodeId = params[1];
      F.info(`Would list cameras${nodeId ? ' on node ' + nodeId : ''}`);
      return;
    }
    if (sub === 'snap') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes camera snap <nodeId>');
        process.exit(1);
      }
      F.info(`Would take snapshot on node ${nodeId}`);
      return;
    }
    if (sub === 'clip') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes camera clip <nodeId>');
        process.exit(1);
      }
      F.info(`Would record clip on node ${nodeId}`);
      return;
    }
    return cameraNode(sub, params[1]);
  }
  if (action === 'screen') {
    const sub = params[0];
    if (sub === 'record') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes screen record <nodeId>');
        process.exit(1);
      }
      F.info(`Would start screen recording on node ${nodeId}`);
      return;
    }
    return screenNode(sub, params[1]);
  }
  if (action === 'location') {
    const sub = params[0];
    if (sub === 'get') {
      const nodeId = params[1];
      if (!nodeId) {
        F.error('Node ID required');
        F.info('Usage: natureco nodes location get <nodeId>');
        process.exit(1);
      }
      F.kv('Node', nodeId);
      F.kv('Latitude', '41.0082 (mock)');
      F.kv('Longitude', '28.9784 (mock)');
      return;
    }
    return locationNode(sub);
  }
  if (action === 'status') return nodeStatus(params[0]);
  if (action === 'describe') return nodeDescribe(params[0]);

  F.error(`Unknown command: ${action}`);
  F.info('Usage: natureco nodes [list|pair|approve|reject|remove|rename|invoke|notify|push|canvas|camera|screen|location|status|describe]');
  process.exit(1);
}

function listNodes() {
  const config = getConfig();
  const nodes = config.pairedNodes || [];

  console.log('\n' + tui.styled('  🌐 Nodes', { color: tui.PALETTE.primary, bold: true }));
  console.log(tui.styled('  ' + '─'.repeat(56), { color: tui.PALETTE.border }));

  if (nodes.length === 0) {
    console.log('\n  ' + tui.C.muted('No paired nodes.'));
    console.log('');
    return;
  }

  const rows = nodes.map(n => ({
    id: n.id, name: n.name || n.id, status: 'online (mock)', lastSeen: n.pairedAt || '-',
  }));
  console.log('\n' + tui.table(rows, [
    { key: 'id', label: 'ID', minWidth: 14, render: r => tui.C.muted(r.id) },
    { key: 'name', label: L('İsim', 'Name'), minWidth: 14, render: r => tui.styled(r.name, { color: tui.PALETTE.primary, bold: true }) },
    {
      key: 'status', label: 'Durum', minWidth: 12,
      render: r => tui.styled('  ✓ Online ', { bg: tui.PALETTE.success, color: '#000', bold: true })
    },
    { key: 'lastSeen', label: L('Son Görülme', 'Last Seen'), minWidth: 18, render: r => tui.C.muted(r.lastSeen) },
  ], { borderStyle: 'round', zebra: true }));
  console.log('');
}

function pairNode(url) {
  if (!url) {
    F.error('Node URL required');
    process.exit(1);
  }

  const config = getConfig();
  if (!config.pairedNodes) config.pairedNodes = [];

  const id = `node_${crypto.randomBytes(8).toString('hex')}`;
  const key = crypto.randomBytes(16).toString('hex');

  config.pairedNodes.push({ id, url, key, name: url, pairedAt: new Date().toISOString() });
  saveConfig(config);

  F.success(`Node paired: ${url}`);
  F.info('Use the following link or scan the QR code in the NatureCo mobile app to link this device.');
  F.kv('Pair Code', key);
}

function approveNode(id) {
  F.success(`Node approved: ${id}`);
}

function rejectNode(id) {
  F.error(`Node rejected: ${id}`);
}

function removeNode(id) {
  if (!id) {
    F.error('Node ID required');
    process.exit(1);
  }

  const config = getConfig();
  const nodes = config.pairedNodes || [];
  const idx = nodes.findIndex(n => n.id === id);

  if (idx === -1) {
    F.error(`Node not found: ${id}`);
    process.exit(1);
  }

  nodes.splice(idx, 1);
  config.pairedNodes = nodes;
  saveConfig(config);
  F.success(`Node removed: ${id}`);
}

function renameNode(id, name) {
  if (!id || !name) {
    F.error('Node ID and name required');
    process.exit(1);
  }

  const config = getConfig();
  const node = (config.pairedNodes || []).find(n => n.id === id);
  if (!node) {
    F.error(`Node not found: ${id}`);
    process.exit(1);
  }

  node.name = name;
  saveConfig(config);
  F.success(`Node renamed: ${name}`);
}

function invokeNode(nodeId, method, params) {
  if (!nodeId || !method) {
    F.error('Node ID and method required');
    process.exit(1);
  }
  F.kv('Node', nodeId);
  F.kv('Method', method);
  F.kv('Params', (params || []).join(', '));
  F.kv('Result', '[mock] invocation sent');
}

function notifyNode(nodeId, message) {
  if (!nodeId || !message) {
    F.error('Node ID and message required');
    process.exit(1);
  }
  F.info(`Notify: ${nodeId} → "${message}"`);
}

function pushNode(nodeId) {
  if (!nodeId) {
    F.error('Node ID required');
    process.exit(1);
  }
  F.info(`Push config to: ${nodeId}`);
}

function canvasNode(nodeId, sessionId) {
  if (!nodeId) {
    F.error('Node ID required');
    process.exit(1);
  }
  F.info(`Canvas share: ${nodeId}${sessionId ? ' session: ' + sessionId : ''}`);
}

function cameraNode(nodeId, action) {
  if (!nodeId) {
    F.error('Node ID required');
    process.exit(1);
  }
  const act = action || 'open';
  F.info(`Camera ${act}: ${nodeId}`);
}

function screenNode(nodeId, action) {
  if (!nodeId) {
    F.error('Node ID required');
    process.exit(1);
  }
  const act = action || 'view';
  F.info(`Screen ${act}: ${nodeId}`);
}

function locationNode(nodeId) {
  if (!nodeId) {
    F.error('Node ID required');
    process.exit(1);
  }
  F.kv('Node', nodeId);
  F.kv('Latitude', '41.0082 (mock)');
  F.kv('Longitude', '28.9784 (mock)');
}

function nodeStatus(nodeId) {
  if (!nodeId) {
    F.error('Node ID required');
    F.info('Usage: natureco nodes status <nodeId>');
    process.exit(1);
  }
  const config = getConfig();
  const node = (config.pairedNodes || []).find(n => n.id === nodeId || n.name === nodeId);
  if (!node) {
    F.warning(`Node not found: ${nodeId}`);
    process.exit(1);
  }
  F.header(`Node Status: ${node.name || node.id}`);
  F.kv('ID', node.id);
  F.kv('Name', node.name);
  F.kv('URL', node.url || 'local');
  F.kv('Status', 'connected (mock)');
  F.kv('Latency', '~12ms (mock)');
  F.kv('Uptime', '~3h (mock)');
}

function nodeDescribe(nodeId) {
  if (!nodeId) {
    F.error('Node ID required');
    F.info('Usage: natureco nodes describe <nodeId>');
    process.exit(1);
  }
  const config = getConfig();
  const node = (config.pairedNodes || []).find(n => n.id === nodeId || n.name === nodeId);
  if (!node) {
    F.warning(`Node not found: ${nodeId}`);
    process.exit(1);
  }
  F.header(`Node Details: ${node.name || node.id}`);
  F.table(['Property', 'Value'], [
    ['ID', node.id],
    ['Name', node.name],
    ['URL', node.url || 'local'],
    ['Key', node.key ? node.key.substring(0, 8) + '...' : 'none'],
    ['Paired At', node.pairedAt ? new Date(node.pairedAt).toLocaleString() : 'unknown'],
    ['OS', 'linux (mock)'],
    ['Version', '2.23.32 (mock)'],
    ['CPU', '4 vCPU (mock)'],
    ['Memory', '8 GB (mock)'],
    ['Services', 'gateway, mcp, file-sync (mock)'],
  ]);
}

module.exports = nodes;
