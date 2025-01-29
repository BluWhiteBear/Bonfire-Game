const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ 
  port: PORT,
  perMessageDeflate: false
});

// Increase max listeners limit
wss.setMaxListeners(20);

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected:', clients.size + 1);
  clients.add(ws);

  // Handle messages at the connection level, not server level
  ws.on('message', async (message) => {
    try {
      const data = message.toString();
      const parsedMessage = JSON.parse(data);
      console.log('Received message:', parsedMessage.type);
      
      // Broadcast to all other clients
      clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('error', (error) => {
    console.error('Client connection error:', error);
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  // Send initial connection acknowledgment
  ws.send(JSON.stringify({
    type: 'connect_ack',
    clients: clients.size
  }));
});

console.log(`WebSocket server running on port ${PORT}`);