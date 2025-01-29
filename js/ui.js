document.addEventListener("DOMContentLoaded", () => {
  const gameArea = document.getElementById("game-area");
  const statusEl = document.createElement('div');
  statusEl.id = 'connection-status';
  let connectBtn = document.getElementById("connect-btn");

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      // Load current character settings
      loadCharacterPreset();
      
      // Show the modal using Bootstrap's modal API
      $('#character-creator-modal').modal('show');
    });
  }

  const confirmBtn = document.getElementById('confirm-character');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      // Save character settings
      saveCharacterPreset();
      
      // Update player avatar
      updatePlayerAvatar();
      
      // Hide the modal
      $('#character-creator-modal').modal('hide');
    });
  }

  // Create button if it doesn't exist
  if (!connectBtn) {
    connectBtn = document.createElement('button');
    connectBtn.id = 'connect-btn';
    connectBtn.className = 'btn btn-primary';
    connectBtn.textContent = 'Connect';
  }

  // Position the connect button and status
  connectBtn.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    display: block !important;
  `;

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
  gameArea.appendChild(connectBtn);
  gameArea.appendChild(statusEl);

  // Clear game state
  updateGameState({
    players: [],
    messages: [],
    localPlayer: null,
    currentScene: null
  });

  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      statusEl.textContent = 'Initializing connection...';
  
      // First establish connection
      statusEl.textContent = 'Connecting to peer network...';
      await connectToPeer();
  
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
        displayName: document.getElementById('display-name-input').value || 'Anonymous',
        chatColor: document.getElementById('chat-color-input').value || '#88ff88', // Add chat color
        lastSeen: Date.now()
      };
  
      // Load scene
      statusEl.textContent = 'Loading game scene...';
      await loadGameScene('main');
  
      // Initialize game state with local player
      updateGameState({
        players: [localPlayer],
        localPlayer: localPlayer
      });
  
      // Announce ourselves
      sendGameMessage({
        type: 'player_joined',
        id: playerId,
        player: localPlayer // This will include the chat color
      });
  
      // Also send initial sync
      sendGameMessage({
        type: 'player_sync',
        player: localPlayer // This will include the chat color
      });
  
      statusEl.textContent = 'Connected!';
      connectBtn.style.display = 'none';
  
    } catch (err) {
      console.error("Connection failed:", err);
      statusEl.textContent = 'Connection failed - Retry in a few seconds';
      connectBtn.disabled = false;
      connectBtn.style.cssText = 'display: block !important;';
    }
  });
});