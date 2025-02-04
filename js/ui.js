import { updateGameState } from './main.js';
import { loadGameScene } from './scene.js';
import { connectToPeer, sendGameMessage, closeConnection, isConnected } from './peer.js';
import { loadCharacterPreset, renderCharacterPreview, saveCharacterPreset, updatePlayerAvatar } from './character.js';

document.addEventListener("DOMContentLoaded", async () => {
  const gameArea = document.getElementById("game-area");
  let statusEl = document.getElementById("connection-status");
  let roomCodeDisplay = document.createElement('div');

  // Set initial black background
  gameArea.style.backgroundColor = '#000';

  // Create and style status element
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'connection-status';
    statusEl.className = 'text-light';
  }
  
  // Style status element
  statusEl.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
  `;
  
  // Add status to game area immediately
  gameArea.appendChild(statusEl);

  // Check for room ID in URL before creating any buttons
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');

  if (roomId) {
    try {
      statusEl.textContent = 'Joining room...';
      const joinedRoomId = await connectToPeer();

      // Rest of your successful join logic...
      const playerId = Math.random().toString(36).substr(2, 9);
      const canvas = document.getElementById('character-preview');
      loadCharacterPreset();
      renderCharacterPreview();
      const avatarData = canvas.toDataURL();
      
      const localPlayer = {
        id: playerId,
        x: 50,
        y: 350,
        avatar: avatarData,
        displayName: document.getElementById('display-name-input')?.value || 'Anonymous',
        chatColor: document.getElementById('chat-color-input')?.value || '#88ff88',
        lastSeen: Date.now()
      };

      // Initialize game state
      await loadGameScene('main');
      updateGameState({
        players: [localPlayer],
        localPlayer: localPlayer
      });

      // Show room code
      roomCodeDisplay.textContent = `Room Code: ${joinedRoomId}`;
      roomCodeDisplay.style.display = 'block';
      gameArea.appendChild(roomCodeDisplay);

      // Announce presence
      sendGameMessage({
        type: 'player_joined',
        id: playerId,
        player: localPlayer
      });

      sendGameMessage({
        type: 'request_players',
        id: playerId
      });

      statusEl.textContent = 'Connected!';
      return;
    } catch (err) {
      console.error("Failed to join room:", err);
      statusEl.textContent = err.message;
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // Only create and show buttons if auto-join failed or no room ID
  let connectBtn = document.createElement('button');
  let joinBtn = document.createElement('button');
  
  connectBtn.textContent = 'Create Room';
  connectBtn.className = 'btn btn-primary me-2';

  joinBtn.textContent = 'Join Room';
  joinBtn.className = 'btn btn-secondary';
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    display: flex;
    gap: 10px;
  `;
  buttonContainer.appendChild(connectBtn);
  buttonContainer.appendChild(joinBtn);

  // Position status element
  statusEl.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
  `;

  // Clear game area and add elements
  gameArea.style.position = 'relative';
  gameArea.innerHTML = '';
  gameArea.appendChild(buttonContainer);
  gameArea.appendChild(statusEl);

  // Handle Create Room button
  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      joinBtn.disabled = true;
      statusEl.textContent = 'Creating room...';
  
      const actualRoomId = await connectToPeer();
      
      // Display room code immediately using the actual room ID
      roomCodeDisplay.textContent = `Room Code: ${actualRoomId}`;
      roomCodeDisplay.style.display = 'block';
      gameArea.appendChild(roomCodeDisplay);

      // After successful connection
      gameArea.style.backgroundColor = 'transparent';
      buttonContainer.style.display = 'none';

      // Create local player
      const playerId = Math.random().toString(36).substr(2, 9);
      const canvas = document.getElementById('character-preview');
      loadCharacterPreset();
      renderCharacterPreview();
      const avatarData = canvas.toDataURL();
      
      const localPlayer = {
        id: playerId,
        x: 50,
        y: 350,
        avatar: avatarData,
        displayName: document.getElementById('display-name-input')?.value || 'Anonymous',
        chatColor: document.getElementById('chat-color-input')?.value || '#88ff88',
        lastSeen: Date.now()
      };

      // Load scene
      statusEl.textContent = 'Loading game scene...';
      await loadGameScene('main');

      // Initialize game state
      updateGameState({
        players: [localPlayer],
        localPlayer: localPlayer
      });

      // Display room code
      roomCodeDisplay.textContent = `Room Code: ${actualRoomId}`;
      roomCodeDisplay.style.display = 'block';

      // After successful connection
      gameArea.style.backgroundColor = 'transparent';
      
      buttonContainer.style.display = 'none';
      statusEl.textContent = 'Room created! Share the code to play with others.';

    } catch (err) {
      console.error("Failed to create room:", err);
      statusEl.textContent = err.message;
      connectBtn.disabled = false;
      joinBtn.disabled = false;
    }
  });

  // Handle Join Room button
  joinBtn.addEventListener("click", () => {
    // Create room code input
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      text-align: center;
    `;

    const roomInput = document.createElement('input');
    roomInput.type = 'text';
    roomInput.placeholder = 'Enter Room Code';
    roomInput.className = 'form-control mb-2';
    roomInput.maxLength = 9;

    const joinButton = document.createElement('button');
    joinButton.textContent = 'Join';
    joinButton.className = 'btn btn-primary';

    inputContainer.appendChild(roomInput);
    inputContainer.appendChild(joinButton);

    // Replace buttons with input
    buttonContainer.style.display = 'none';
    gameArea.appendChild(inputContainer);

    joinButton.addEventListener("click", async () => {
      const roomId = roomInput.value.trim();
      if (!roomId) {
        statusEl.textContent = 'Please enter a room code';
        return;
      }
    
      try {
        joinButton.disabled = true;
        statusEl.textContent = 'Joining room...';
    
        // Update URL with room ID
        window.history.replaceState({}, '', `?room=${roomId}`);
        
        // Connect to peer
        await connectToPeer();
    
        // Update room code display
        roomCodeDisplay.textContent = `Room Code: ${roomId}`;
        roomCodeDisplay.style.display = 'block';
        gameArea.appendChild(roomCodeDisplay);
        
        // Create local player
        const playerId = Math.random().toString(36).substr(2, 9);
        const canvas = document.getElementById('character-preview');
        loadCharacterPreset();
        renderCharacterPreview();
        const avatarData = canvas.toDataURL();
        
        const localPlayer = {
          id: playerId,
          x: 50,
          y: 350,
          avatar: avatarData,
          displayName: document.getElementById('display-name-input')?.value || 'Anonymous',
          chatColor: document.getElementById('chat-color-input')?.value || '#88ff88',
          lastSeen: Date.now()
        };
    
        // Load scene
        statusEl.textContent = 'Loading game scene...';
        await loadGameScene('main');
    
        // Initialize game state with just the local player
        updateGameState({
          players: [localPlayer],
          localPlayer: localPlayer
        });
    
        // Announce ourselves to the host
        sendGameMessage({
          type: 'player_joined',
          id: playerId,
          player: localPlayer
        });
    
        // Request current players list from host
        sendGameMessage({
          type: 'request_players',
          id: playerId
        });
    
        // Remove input container
        inputContainer.remove();
        statusEl.textContent = 'Connected!';
    
      } catch (err) {
        console.error("Failed to join room:", err);
        statusEl.textContent = err.message;
        joinButton.disabled = false;
      }
    });
  });

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    closeConnection();
  });
});