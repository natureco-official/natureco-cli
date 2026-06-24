const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3847;
const LOG_FILE = path.join(os.homedir(), '.natureco', 'gateway.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage, 'utf-8');
  console.log(logMessage.trim());
}

let wss = null;

function startGatewayServer() {
  wss = new WebSocket.Server({ port: PORT });

  let connectedClients = 0;

  wss.on('connection', (ws) => {
    connectedClients++;
    log(`Client connected. Total clients: ${connectedClients}`);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const { botId, message: userMessage, apiKey } = message;
        
        if (!botId || !userMessage || !apiKey) {
          ws.send(JSON.stringify({ error: 'Missing required fields: botId, message, apiKey' }));
          return;
        }
        
        log(`Message received for bot ${botId}: ${userMessage.slice(0, 50)}...`);
        
        // Send to NatureCo API
        const response = await fetch('https://api.natureco.me/api/agent/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            agent_id: botId,
            message: userMessage,
            platform: 'gateway',
          }),
        });
        
        if (!response.ok) {
          const error = await response.text();
          ws.send(JSON.stringify({ error: `API error: ${error}` }));
          return;
        }
        
        const data = await response.json();
        const reply = data.reply || data.message || 'No response';
        
        log(`Reply sent: ${reply.slice(0, 50)}...`);
        
        ws.send(JSON.stringify({
          reply,
          sessionId: data.conversation_id || null,
        }));
      } catch (err) {
        log(`Error: ${err.message}`);
        ws.send(JSON.stringify({ error: err.message }));
      }
    });
    
    ws.on('close', () => {
      connectedClients--;
      log(`Client disconnected. Total clients: ${connectedClients}`);
    });
    
    ws.on('error', (err) => {
      log(`WebSocket error: ${err.message}`);
    });
  });

  log(`WebSocket Gateway started on port ${PORT}`);
}

function stopGatewayServer() {
  if (!wss) return;
  log('Gateway shutting down...');
  wss.close(() => {
    log('Gateway stopped');
    process.exit(0);
  });
}

process.on('SIGINT', stopGatewayServer);
process.on('SIGTERM', stopGatewayServer);

module.exports = { startGatewayServer, stopGatewayServer };
