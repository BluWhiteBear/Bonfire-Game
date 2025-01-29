let localConnection = null;
let dataChannel = null;
let remoteConnection = null;
let heartbeatInterval = null;

let isConnected = false;
let connectionReady = false;
let messageQueue = [];
let pendingCandidates = [];

const signalingServerUrl = CONFIG.signalingServer; // From config.js
const signalingSocket = new WebSocket(signalingServerUrl);


signalingSocket.onopen = () => {
  // console.log('Connected to signaling server');
};

signalingSocket.onerror = (error) => {
  console.error('WebSocket error:', error);
};

signalingSocket.onclose = () => {
  console.error('WebSocket connection closed');
  isConnected = false;
  connectionReady = false;
};

// Listen for messages from the signaling server
signalingSocket.onmessage = async (event) => {
  let data = event.data;
  
  if (data instanceof Blob) {
    data = await new Response(data).text();
  }

  const message = JSON.parse(data);
  // console.log('Received signaling message:', message.type);

  try {
    switch(message.type) {
      case 'offer':
        // console.log('Handling offer');
        try {
          // Close any existing connection properly first
          await closeConnection();
      
          // Create new connection
          localConnection = new RTCPeerConnection(configuration);
          // console.log('Created new RTCPeerConnection for offer');
          
          // Set up ICE candidate handling first
          localConnection.onicecandidate = (event) => {
            if (event.candidate) {
              // console.log('Sending ICE candidate');
              sendMessage({
                type: 'candidate',
                candidate: event.candidate
              });
            }
          };
          
          setupConnectionHandlers(localConnection);
          
          // Set up data channel handler before setting remote description
          localConnection.ondatachannel = (event) => {
            // console.log('Received data channel');
            if (dataChannel) {
              dataChannel.onopen = null;
              dataChannel.onclose = null;
              dataChannel.onerror = null;
              dataChannel.onmessage = null;
              dataChannel.close();
            }
            dataChannel = event.channel;
            setupDataChannel(dataChannel);
          };
      
          // Set remote description and create answer
          // console.log('Setting remote description');
          await localConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
          // console.log('Creating answer');
          const answer = await localConnection.createAnswer();
          // console.log('Setting local description');
          await localConnection.setLocalDescription(answer);
          // console.log('Sending answer');
          sendMessage({ type: 'answer', answer });
        } catch (err) {
          console.error('Error handling offer:', err);
          await closeConnection();
          throw err;
        }
        break;

      case 'answer':
        if (localConnection) {
          await localConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
        break;

      case 'candidate':
        if (localConnection) {
          try {
            await localConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
          } catch (err) {
            console.error('Error adding received ice candidate:', err);
          }
        }
        break;
    }
  } catch (err) {
    console.error('Error handling signaling message:', err);
  }
};

// Send messages to the signaling server
const sendMessage = (message) => {
  signalingSocket.send(JSON.stringify(message));
};

// Create and send an offer
const createOffer = async () => {
  // console.log('Creating offer...');
  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };
  
  localConnection = new RTCPeerConnection(configuration);
  dataChannel = localConnection.createDataChannel('game-channel');
  
  // Log state changes
  localConnection.onconnectionstatechange = () => {
    // console.log('Connection state:', localConnection.connectionState);
  };
  
  localConnection.oniceconnectionstatechange = () => {
    // console.log('ICE connection state:', localConnection.iceConnectionState);
  };
  
  setupDataChannel(dataChannel);
  // console.log('Created data channel');

  const offer = await localConnection.createOffer();
  await localConnection.setLocalDescription(offer);
  // console.log('Created and set local offer');

  sendMessage({ type: 'offer', offer });
};

// Handle an incoming offer and send an answer
const handleOffer = async (offer) => {
  try {
    // Close existing connection if any
    if (localConnection) {
      localConnection.close();
      localConnection = null;
    }

    localConnection = new RTCPeerConnection(configuration);
    setupConnectionHandlers(localConnection);

    // Handle data channel
    localConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel(dataChannel);
    };

    // Set remote description first
    await localConnection.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Then create and set local answer
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);
    
    // Send answer
    sendMessage({ type: 'answer', answer });

  } catch (err) {
    console.error('Error handling offer:', err);
    throw err;
  }
};

// Set up ICE candidate exchange
const setupConnectionHandlers = (connection) => {
  connection.onconnectionstatechange = () => {
    // console.log("Connection state:", connection.connectionState);
    switch (connection.connectionState) {
      case 'connected':
        isConnected = true;
        connectionReady = true;
        break;
      case 'disconnected':
      case 'failed':
        isConnected = false;
        connectionReady = false;
        clearInterval(heartbeatInterval);
        // Attempt reconnection after delay
        setTimeout(async () => {
          if (!isConnected) {
            try {
              // console.log('Attempting to reconnect...');
              await connectToPeer();
            } catch (err) {
              console.error('Reconnection failed:', err);
            }
          }
        }, 5000);
        break;
    }
  };

  // Handle ICE connection state changes
  connection.oniceconnectionstatechange = () => {
    // console.log('ICE connection state:', connection.iceConnectionState);
    if (connection.iceConnectionState === 'failed') {
      connection.restartIce();
      // Gather new ICE candidates
      connection.createOffer({iceRestart: true})
        .then(offer => connection.setLocalDescription(offer))
        .catch(err => console.error('Ice restart failed:', err));
    }
  };
};

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all'
};

const processQueuedMessages = () => {
  // console.log('Processing queued messages...');
  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    try {
      dataChannel.send(JSON.stringify(message));
    } catch (err) {
      console.error('Error sending queued message:', err);
      messageQueue.unshift(message); // Put message back at front of queue
      break;
    }
  }
};

const setupDataChannel = (channel) => {
  if (!channel) return;

  // Clear any existing heartbeat interval
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  channel.onopen = () => {
    isConnected = true;
    connectionReady = true;
    
    // Process any queued messages
    if (messageQueue.length > 0) {
      setTimeout(processQueuedMessages, 100);
    }
    
    // Start heartbeat with less frequent updates
    if (!heartbeatInterval) {
      heartbeatInterval = setInterval(() => {
        if (gameState.localPlayer && isConnected && channel.readyState === 'open') {
          try {
            // Only send sync if needed
            const now = Date.now();
            sendGameMessage({
              type: 'player_sync',
              player: {
                id: gameState.localPlayer.id,
                x: gameState.localPlayer.x,
                y: gameState.localPlayer.y,
                avatar: gameState.localPlayer.avatar,
                displayName: gameState.localPlayer.displayName,
                chatColor: gameState.localPlayer.chatColor,
                lastSeen: Date.now()
              }
            });
          } catch (err) {
            console.warn('Player sync failed:', err);
          }
        }
      }, 5000); // Reduce to every 5 seconds
    }
  };

  channel.onclose = () => {
    console.log('Data channel closed');
    isConnected = false;
    connectionReady = false;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  channel.onerror = (error) => {
    console.error('Data channel error:', error);
    // Don't immediately disconnect on error
    isConnected = false;
    connectionReady = false;
  };

  channel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleGameMessage(message);
    } catch (err) {
      console.error('Error handling message:', err);
    }
  };
};

const connectToPeer = async () => {
  try {
    // Check WebSocket connection first
    if (signalingSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Signaling server not connected');
    }

    // Make sure any existing connection is properly closed first
    await closeConnection();

    // Create new peer connection
    localConnection = new RTCPeerConnection(configuration);
    // console.log('Created RTCPeerConnection');
    
    setupConnectionHandlers(localConnection);

    // Create data channel with specific options
    dataChannel = localConnection.createDataChannel('game-channel', {
      ordered: true,
      maxRetransmits: 3
    });
    // console.log('Created data channel');
    
    setupDataChannel(dataChannel);

    // Create and send offer
    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);
    // console.log('Created and sending offer');
    sendMessage({ type: 'offer', offer });

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!isConnected) {
          closeConnection();
          reject(new Error('Connection timeout'));
        }
      }, 20000);

      const checkConnection = setInterval(() => {
        if (dataChannel?.readyState === 'open') {
          clearInterval(checkConnection);
          clearTimeout(timeout);
          resolve({ localConnection, dataChannel });
        }
      }, 1000);
    });

  } catch (err) {
    await closeConnection();
    console.error('Connection setup failed:', err);
    throw err;
  }
};

const closeConnection = async () => {
  try {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    if (dataChannel) {
      // Remove all event listeners first
      dataChannel.onopen = null;
      dataChannel.onclose = null;
      dataChannel.onerror = null;
      dataChannel.onmessage = null;
      
      if (dataChannel.readyState === 'open') {
        dataChannel.close();
      }
      dataChannel = null;
    }

    if (localConnection) {
      // Remove all event listeners first
      localConnection.onicecandidate = null;
      localConnection.onconnectionstatechange = null;
      localConnection.oniceconnectionstatechange = null;
      localConnection.ondatachannel = null;
      
      // Close and clean up
      localConnection.close();
      localConnection = null;
    }

    // Reset all state
    isConnected = false;
    connectionReady = false;
    messageQueue = [];
    pendingCandidates = [];

    // Give time for cleanup
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    console.warn('Error during connection cleanup:', err);
  }
};


const sendGameMessage = (message) => {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    // console.log('Data channel not ready, queuing message:', message);
    messageQueue.push(message);
    
    // Attempt to process queue when channel opens
    if (dataChannel) {
      dataChannel.onopen = () => {
        // console.log('Processing queued messages...');
        while (messageQueue.length > 0) {
          const queuedMessage = messageQueue.shift();
          try {
            dataChannel.send(JSON.stringify(queuedMessage));
          } catch (err) {
            console.error('Error sending queued message:', err);
            messageQueue.unshift(queuedMessage); // Put message back at front of queue
            break;
          }
        }
      };
    }
    return;
  }
  
  try {
    dataChannel.send(JSON.stringify(message));
  } catch (err) {
    console.error('Error sending message:', err);
    messageQueue.push(message);
  }
};

const handleGameMessage = (message) => {
  // console.log('Handling game message:', message);

  switch (message.type) {
    case 'player_joined':
      // Don't add if it's our own player
      if (message.id === gameState.localPlayer?.id) return;
      
      if (!gameState.players.some(p => p.id === message.id)) {
        const newPlayer = message.player || { 
          id: message.id, 
          x: 50, 
          y: 350,
          chatColor: message.player?.chatColor || '#88ff88', // Handle chat color
          lastSeen: Date.now()
        };
        
        updateGameState({
          players: [...(gameState.players || []), newPlayer]
        });
        
        // Always send back our player info
        if (gameState.localPlayer) {
          sendGameMessage({
            type: 'player_sync',
            player: {
              ...gameState.localPlayer,
              lastSeen: Date.now()
            }
          });
        }
      }
      break;

    case 'player_sync':
      if (!message.player) return;
      // Don't sync our own player
      if (message.player.id === gameState.localPlayer?.id) return;
      
      const existingPlayerIndex = gameState.players.findIndex(p => p.id === message.player.id);
      if (existingPlayerIndex === -1) {
        // console.log('Adding new player from sync:', message.player);
        updateGameState({
          players: [...(gameState.players || []), {...message.player, lastSeen: Date.now()}]
        });
      } else {
        const updatedPlayers = gameState.players.map(p => 
          p.id === message.player.id 
            ? {
                ...p,
                ...message.player,
                chatColor: message.player.chatColor || '#88ff88', // Ensure chat color is preserved
                lastSeen: Date.now()
              }
            : p
        );
        updateGameState({players: updatedPlayers});
      }
      break;
  
    case 'movement':
      handlePlayerMovement(message);
      // Update lastSeen timestamp for the player
      const updatedPlayers = gameState.players.map(p => 
        p.id === message.playerId 
          ? { ...p, lastSeen: Date.now() }
          : p
      );
      updateGameState({ players: updatedPlayers });
      break;
  
    case 'chat':
      const playerIndex = gameState.players.findIndex(p => p.id === message.playerId);
      if (playerIndex !== -1) {
        // Add message to chat box
        addChatMessage(message.playerId, message.text);
        
        // Update speech bubbles with stacking
        updatePlayerMessage(message.playerId, message.text);
      }
      break;
  }
};