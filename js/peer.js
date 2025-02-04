import { CONFIG } from './config.js';
import { handleGameMessage, gameState } from './main.js';

const PEER_CONFIG = CONFIG.iceServers;

// Connection state
let peerConnection = null;
let dataChannel = null;
let heartbeatInterval = null;
let isConnected = false;
let messageQueue = [];

// Initialize PeerJS
const peer = new Peer(generateRandomId(), {
  config: PEER_CONFIG
});

// Set up peer event handlers
peer.on('open', (id) => {
  console.log('Connected to PeerJS server with ID:', id);
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = 'Ready to connect';
  }
});

peer.on('error', (error) => {
  console.error('PeerJS error:', error);
  const statusEl = document.getElementById('connection-status');
  if (statusEl) {
    statusEl.textContent = 'Connection error';
  }
});

// Handle incoming connections
peer.on('connection', (conn) => {
  console.log('Incoming connection from:', conn.peer);
  setupDataChannel(conn);
});

// Validate room ID
const isValidRoomId = (id) => {
  return typeof id === 'string' && id.length === 9;
};

// Connect to another peer
const connectToPeer = async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (roomId) {
      if (!isValidRoomId(roomId)) {
        throw new Error('Invalid room ID format');
      }

      console.log('Attempting to connect to room:', roomId);
      
      return new Promise((resolve, reject) => {
        const conn = peer.connect(roomId, {
          reliable: true,
          serialization: 'json',
          metadata: { timestamp: Date.now() },
          config: PEER_CONFIG // Pass ICE server config
        });

        const maxAttempts = 5; // Increased attempts
        const timeout = 12000; // Increased timeout for TURN fallback
        let attempts = 0;

        const attemptConnection = () => {
          const timeoutId = setTimeout(() => {
            if (attempts < maxAttempts - 1) {
              attempts++;
              console.log(`Retrying connection ${attempts + 1}/${maxAttempts}`);
              attemptConnection();
            } else {
              reject(new Error('Unable to connect. Please check if the room is still active.'));
            }
          }, timeout);

          conn.on('open', () => {
            clearTimeout(timeoutId);
            console.log('Connection established to room:', roomId);
            setupDataChannel(conn);
            isConnected = true;
            resolve(roomId);
          });

          conn.on('error', (err) => {
            clearTimeout(timeoutId);
            console.error('Connection error:', err);
            if (attempts < maxAttempts - 1) {
              attempts++;
              console.log(`Connection failed, trying again (${attempts}/${maxAttempts})`);
              attemptConnection();
            } else {
              reject(new Error('Connection failed after multiple attempts. Please try again.'));
            }
          });
        };

        attemptConnection();
      });
    }
    
    // Creating new room...
    const newRoomId = peer.id;
    window.history.replaceState({}, '', `?room=${newRoomId}`);
    isConnected = true;
    
    // Create data channel for host...
    return newRoomId;

  } catch (err) {
    console.error('Connection failed:', err);
    throw err;
  }
};

// Set up data channel handlers
const setupDataChannel = (channel) => {
  if (!channel) return;

  // Clean up existing connection
  if (dataChannel && typeof dataChannel.close === 'function') {
    dataChannel.close();
  }

  dataChannel = channel;

  // If we're creating a room (host)
  if (typeof channel === 'object' && !channel.on) {
    isConnected = true;
    return;
  }

  // For joining peers, set up event handlers
  channel.on('open', () => {
    console.log('Data channel opened');
    isConnected = true;
    processQueuedMessages();
    startHeartbeat();
  });

  channel.on('close', () => {
    console.log('Data channel closed');
    isConnected = false;
    stopHeartbeat();
  });

  channel.on('error', (error) => {
    console.error('Data channel error:', error);
    isConnected = false;
  });

  channel.on('data', (data) => {
    handleGameMessage(data);
  });
};

// Send game messages through data channel
const sendGameMessage = (message) => {
  if (!dataChannel || !dataChannel.open) {
    messageQueue.push(message);
    return;
  }

  try {
    dataChannel.send(message);
  } catch (err) {
    console.error('Error sending message:', err);
    messageQueue.push(message);
  }
};

// Process queued messages
const processQueuedMessages = () => {
  while (messageQueue.length > 0 && dataChannel?.open) {
    const message = messageQueue.shift();
    try {
      dataChannel.send(message);
    } catch (err) {
      console.error('Error sending queued message:', err);
      messageQueue.unshift(message);
      break;
    }
  }
};

// Heartbeat to maintain connection
const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (isConnected && gameState.localPlayer) {
      sendGameMessage({
        type: 'player_sync',
        player: {
          ...gameState.localPlayer,
          lastSeen: Date.now()
        }
      });
    }
  }, 5000);
};

const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
};

// Clean up connections
const closeConnection = () => {
  stopHeartbeat();
  
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  isConnected = false;
  messageQueue = [];
};

// Generate random ID for peer
function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

// Export needed functions
export {
  connectToPeer,
  sendGameMessage,
  closeConnection,
  isConnected
};