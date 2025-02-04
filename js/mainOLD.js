const PLAYER_TIMEOUT = 15000; // 15 seconds timeout

let fpsValues = [];
let lastFpsUpdate = 0;
const FPS_UPDATE_INTERVAL = 500; // Update every 500ms

const MOVEMENT_INTERVAL = 50; // Send position updates every 50ms
let lastMovementSent = 0;
let lastKnownPositions = new Map(); // Store positions for interpolation

let gameState = {
  players: [], //{id, x, y, avatar}
  messages: [],
  localPlayer: null,
  currentScene: null
};

const playerElements = new Map();
const gameArea = document.getElementById("game-area");

// setInterval(() => {
//   if (!gameState.players.length) return;
  
//   const now = Date.now();
//   const activePlayers = gameState.players.filter(player => {
//     // Don't timeout local player
//     if (player.id === gameState.localPlayer?.id) return true;
    
//     // Keep players with recent activity
//     const isActive = player.lastSeen && (now - player.lastSeen < PLAYER_TIMEOUT);
    
//     // Log timeout for debugging
//     if (!isActive) {
//       console.log(`Player ${player.displayName} timed out:`, {
//         now,
//         lastSeen: player.lastSeen,
//         timeSinceLastSeen: now - (player.lastSeen || 0)
//       });
//     }
    
//     return isActive;
//   });
  
//   if (activePlayers.length !== gameState.players.length) {
//     // console.log('Removing disconnected players');
//     updateGameState({
//       players: activePlayers
//     });
//   }
// }, 5000);
  
// Update game state
const updateGameState = (data) => {
  gameState = {
    ...gameState,
    ...data,
    players: data.players || gameState.players,
    localPlayer: data.localPlayer || gameState.localPlayer,
    currentScene: data.currentScene || gameState.currentScene
  };

  // Update viewport to follow local player if we have one
  if (gameState.localPlayer && gameState.currentScene) {
    const screenWidth = gameArea.clientWidth;
    const screenHeight = gameArea.clientHeight;
    
    // Center viewport on player
    const viewportX = Math.max(0, gameState.localPlayer.x - screenWidth / 2);
    const viewportY = Math.max(0, gameState.localPlayer.y - screenHeight / 2);
    
    // Limit viewport to scene bounds
    const maxX = (gameState.currentScene.width * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE) - screenWidth;
    const maxY = (gameState.currentScene.height * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE) - screenHeight;
    
    gameState.currentScene.setViewport(
      Math.min(viewportX, maxX),
      Math.min(viewportY, maxY),
      screenWidth,
      screenHeight
    );
  }

  renderGame();
};

// Render game area
let chatBox = null;
const renderGame = () => {
  if (!gameArea) return;
  
  // Save connection elements before clearing
  const existingStatus = document.getElementById('connection-status');
  const existingConnectBtn = document.getElementById('connect-btn');
  const wasConnected = existingConnectBtn?.style.display === 'none';

  const now = performance.now();
  const fps = 1000 / (now - lastFpsUpdate);
  fpsValues.push(fps);

  if (fpsValues.length > 30) fpsValues.shift();

  if (now - lastFpsUpdate >= FPS_UPDATE_INTERVAL) {
    const avgFps = Math.round(fpsValues.reduce((a,b) => a + b) / fpsValues.length);
    document.getElementById('fps-counter').textContent = `${avgFps} FPS`;
    fpsValues = [];
    lastFpsUpdate = now;
  }
  
  // Save chat state if connected
  let chatState = null;
  let newChatInput = null; // Declare at top of function
  
  if (wasConnected) {
    const chatInput = document.getElementById('global-chat-input');
    chatState = {
      wasFocused: document.activeElement === chatInput,
      value: chatInput?.value || '',
      selectionStart: chatInput?.selectionStart,
      selectionEnd: chatInput?.selectionEnd
    };
  }
  
  // Clear game area
  gameArea.innerHTML = '';

  // Create game container
  const gameContainer = document.createElement('div');
  gameContainer.style.cssText = `
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  `;
  gameArea.appendChild(gameContainer);

  if (wasConnected) {
    // Create or restore chat box
    if (!chatBox) {
      chatBox = document.createElement('div');
      chatBox.className = 'chat-box';
      chatBox.innerHTML = `
        <div class="chat-messages"></div>
        <div class="chat-input-container">
          <div class="chat-input-group">
            <input type="text" id="global-chat-input" placeholder="Press Enter to chat..." maxlength="200">
            <button class="emoji-toggle" type="button">😊</button>
            <div class="emoji-picker"></div>
          </div>
        </div>
      `;
      
      initializeEmojiPicker(chatBox);
    }
    
    // Add chat box to container
    gameContainer.appendChild(chatBox);

    // Get fresh reference to chat input after adding to DOM
    newChatInput = document.getElementById('global-chat-input');

    // Restore chat input state if we had any
    if (chatState && newChatInput) {
      newChatInput.value = chatState.value;
      if (chatState.wasFocused) {
        newChatInput.setSelectionRange(chatState.selectionStart, chatState.selectionEnd);
        requestAnimationFrame(() => {
          newChatInput.focus();
        });
      }
    }
  }

  // Restore connection elements if they existed
  if (existingConnectBtn) {
    existingConnectBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      display: ${wasConnected ? 'none' : 'block !important'};
    `;
    gameArea.appendChild(existingConnectBtn);
  }

  // Render scene first if we have one
  if (gameState.currentScene) {
    const sceneWidth = gameState.currentScene.width * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
    const sceneHeight = gameState.currentScene.height * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
    const viewportX = gameState.currentScene.viewport?.x || 0;
    const viewportY = gameState.currentScene.viewport?.y || 0;

    const sceneCanvas = document.createElement('canvas');
    sceneCanvas.width = sceneWidth;
    sceneCanvas.height = sceneHeight;
    sceneCanvas.style.cssText = `
      position: absolute;
      left: ${-viewportX}px;
      top: ${-viewportY}px;
    `;
    
    const ctx = sceneCanvas.getContext('2d');
    gameState.currentScene.render(ctx);
    gameContainer.appendChild(sceneCanvas);

    // Important: Render ALL players
    if (gameState.players?.length > 0) {
      // console.log('Rendering players:', gameState.players);
      gameState.players.forEach(player => {
        if (!player || !player.x || !player.y) return;
        
        const playerElement = document.createElement('div');
        playerElement.style.cssText = `
          position: absolute;
          left: ${player.x - viewportX}px;
          top: ${player.y - viewportY}px;
          width: 64px;
          height: 64px;
          z-index: 2;
          transform: translate(-50%, -50%);
        `;

        if (player.avatar) {
          const avatarImg = document.createElement('img');
          avatarImg.src = player.avatar;
          avatarImg.style.cssText = 'width: 100%; height: 100%;';
          playerElement.appendChild(avatarImg);
        }

        gameContainer.appendChild(playerElement);
      });
    }
  }

  // Then render all players
  if (gameState.players?.length > 0) {
    const viewportX = gameState.currentScene?.viewport?.x || 0;
    const viewportY = gameState.currentScene?.viewport?.y || 0;

    gameState.players.forEach(player => {
      // console.log('Rendering player:', player);
      const playerElement = document.createElement('div');
      playerElement.style.cssText = `
        position: absolute;
        left: ${player.x - viewportX}px;
        top: ${player.y - viewportY}px;
        width: 64px;
        height: 64px;
        z-index: 2;
        transform: translate(-50%, -50%);
      `;
    
      // Add player name
      if (player.displayName) {
        const nameTag = document.createElement('div');
        nameTag.textContent = player.displayName;
        nameTag.style.cssText = `
          position: absolute;
          width: 100%;
          text-align: center;
          top: -25px;
          color: white;
          text-shadow: 1px 1px 2px black;
          font-weight: bold;
        `;
        playerElement.appendChild(nameTag);
      }

      if (player.avatar) {
        const avatarImg = document.createElement('img');
        avatarImg.src = player.avatar;
        avatarImg.style.cssText = 'width: 100%; height: 100%;';
        playerElement.appendChild(avatarImg);
      }

      // if (player.message) {
      //   const messageElement = createChatMessage(player.message);
      //   playerElement.appendChild(messageElement);
      // }

      if (player.messageQueue && player.messageQueue.length > 0) {
        const messageContainer = document.createElement('div');
        messageContainer.style.cssText = `
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
        `;
      
        player.messageQueue.forEach((msg, index) => {
          const messageElement = document.createElement('div');
          messageElement.style.cssText = `
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            max-width: 200px;
            min-width: 50px;
            word-wrap: break-word;
            text-align: center;
            margin-bottom: 5px;
            opacity: ${1 - (index * 0.2)};
          `;
      
          // Handle emojis in message
          const parts = msg.text.split(/(:[\w-]+:)/g);
          parts.forEach(part => {
            if (EMOJIS[part]) {
              const emoji = document.createElement('img');
              emoji.src = EMOJIS[part];
              emoji.style.cssText = `
                width: 24px;
                height: 24px;
                vertical-align: middle;
                display: inline-block;
                margin: 0 2px;
              `;
              messageElement.appendChild(emoji);
            } else if (part.trim()) {
              messageElement.appendChild(document.createTextNode(part));
            }
          });
      
          messageContainer.appendChild(messageElement);
        });
      
        playerElement.appendChild(messageContainer);
      }

      gameContainer.appendChild(playerElement);
    });
  }

  // Restore connection UI elements
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    gameContainer.appendChild(connectBtn);
  }
};

// Message Queue Handling
const MESSAGE_DURATION = 3000; // 3 seconds per message
const MAX_STACKED_MESSAGES = 3;

// Add chat message to chat box
const addChatMessage = (playerId, text) => {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) {
    console.warn('Chat messages container not found');
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-name';
  const player = gameState.players.find(p => p.id === playerId);
  nameSpan.textContent = player?.displayName || 'Anonymous';
  // Ensure chat color is applied
  nameSpan.style.color = player?.chatColor || '#88ff88';
  
  messageDiv.appendChild(nameSpan);
  messageDiv.appendChild(document.createTextNode(': '));

  // Handle emojis
  const parts = text.split(/(:[\w-]+:)/g);
  parts.forEach(part => {
    if (EMOJIS[part]) {
      const emoji = document.createElement('img');
      emoji.src = EMOJIS[part];
      emoji.style.cssText = `
        width: 24px;
        height: 24px;
        vertical-align: middle;
        display: inline-block;
        margin: 0 2px;
      `;
      messageDiv.appendChild(emoji);
    } else if (part.trim()) {
      messageDiv.appendChild(document.createTextNode(part));
    }
  });

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Limit number of messages
  while (chatMessages.children.length > 50) {
    chatMessages.removeChild(chatMessages.firstChild);
  }
};

// Update player message handling
const updatePlayerMessage = (playerId, text) => {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return;

  // Initialize message queue if it doesn't exist
  if (!player.messageQueue) {
    player.messageQueue = [];
  }

  // Add new message to queue
  player.messageQueue.unshift({
    text,
    timestamp: Date.now()
  });

  // Limit queue size
  if (player.messageQueue.length > MAX_STACKED_MESSAGES) {
    player.messageQueue.length = MAX_STACKED_MESSAGES;
  }

  // Clear existing timeout
  if (player.messageTimeout) {
    clearTimeout(player.messageTimeout);
  }

  // Create recursive function to remove messages
  const removeMessage = () => {
    if (player.messageQueue && player.messageQueue.length > 0) {
      // Remove oldest message (last in array)
      player.messageQueue.pop();
      
      // Update game state
      const updatedPlayers = gameState.players.map(p => 
        p.id === playerId 
          ? { ...p, messageQueue: [...player.messageQueue] }
          : p
      );
      updateGameState({ players: updatedPlayers });

      // Set timeout for next message if any remain
      if (player.messageQueue.length > 0) {
        player.messageTimeout = setTimeout(removeMessage, MESSAGE_DURATION);
      } else {
        player.messageTimeout = null;
      }
    }
  };

  // Start removal timer
  player.messageTimeout = setTimeout(removeMessage, MESSAGE_DURATION);

  // Update game state with new message
  const updatedPlayers = gameState.players.map(p => 
    p.id === playerId 
      ? { ...p, messageQueue: [...player.messageQueue] }
      : p
  );
  updateGameState({ players: updatedPlayers });
};

// Handle chat messages
const createChatMessage = (messages) => {
  if (!Array.isArray(messages)) {
    messages = [{ text: messages }];
  }

  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  `;

  messages.forEach((msg, index) => {
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      max-width: 200px;
      min-width: 50px;
      word-wrap: break-word;
      text-align: center;
      margin-bottom: 5px;
      opacity: ${1 - (index * 0.2)};
    `;

    // Handle emojis in message
    const parts = msg.text.split(/(:[\w-]+:)/g);
    parts.forEach(part => {
      if (EMOJIS[part]) {
        const emoji = document.createElement('img');
        emoji.src = EMOJIS[part];
        emoji.style.cssText = `
          width: 24px;
          height: 24px;
          vertical-align: middle;
          display: inline-block;
          margin: 0 2px;
        `;
        messageElement.appendChild(emoji);
      } else if (part.trim()) {
        messageElement.appendChild(document.createTextNode(part));
      }
    });

    container.appendChild(messageElement);
  });

  return container;
};

let emojiPickerInitialized = false;
const initializeEmojiPicker = (chatBox) => {
  if (emojiPickerInitialized) return; // Skip if already initialized
  
  const emojiToggle = chatBox.querySelector('.emoji-toggle');
  const emojiPicker = chatBox.querySelector('.emoji-picker');
  const chatInput = chatBox.querySelector('#global-chat-input');

  if (emojiToggle && emojiPicker) {
    // Clear any existing content
    emojiPicker.innerHTML = '';
    
    // Remove once:true to keep the listener active
    emojiToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('show');
    });

    // Use a persistent document click handler
    document.addEventListener('click', (e) => {
      // Only close if clicking outside picker and toggle
      if (!emojiPicker.contains(e.target) && !emojiToggle.contains(e.target)) {
        emojiPicker.classList.remove('show');
      }
    });

    // Create emoji categories
    const tabContainer = document.createElement('div');
    tabContainer.className = 'emoji-tabs';
    
    const gridContainer = document.createElement('div');
    gridContainer.className = 'emoji-grid';
    
    Object.entries(EMOJI_CATEGORIES).forEach(([category, codes], index) => {
      // Create category tab
      const tab = document.createElement('button');
      tab.className = `emoji-tab ${index === 0 ? 'active' : ''}`;
      tab.textContent = category.charAt(0).toUpperCase() + category.slice(1);
      tab.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        showEmojiCategory(category);
      };
      tabContainer.appendChild(tab);
      
      // Create emoji grid
      const grid = document.createElement('div');
      grid.className = `emoji-category ${index === 0 ? 'active' : ''}`;
      grid.id = `emoji-${category}`;
      
      codes.forEach(code => {
        const emojiButton = document.createElement('button');
        emojiButton.className = 'emoji-button';
        
        const emojiImg = document.createElement('img');
        emojiImg.src = EMOJIS[code];
        emojiImg.title = code;
        emojiImg.alt = code;
        
        emojiButton.appendChild(emojiImg);
        emojiButton.onclick = () => {
          const cursorPos = chatInput.selectionStart;
          const textBefore = chatInput.value.substring(0, cursorPos);
          const textAfter = chatInput.value.substring(cursorPos);
          
          chatInput.value = textBefore + code + textAfter;
          chatInput.focus();
          chatInput.setSelectionRange(cursorPos + code.length, cursorPos + code.length);
          emojiPicker.classList.remove('show');
        };
        
        grid.appendChild(emojiButton);
      });
      
      gridContainer.appendChild(grid);
    });
    
    emojiPicker.appendChild(tabContainer);
    emojiPicker.appendChild(gridContainer);
    
    emojiPickerInitialized = true; // Mark as initialized
  }
};

const loadGameScene = async (sceneId) => {
  // Clean up old scene event listeners
  if (gameState.currentScene) {
    document.removeEventListener('keydown', handleKeydown);
    gameArea.removeEventListener('mousedown', handleMouseDown);
    gameArea.removeEventListener('mousemove', handleMouseMove);
    gameArea.removeEventListener('mouseup', handleMouseUp);
  }

  try {
    const scene = await sceneManager.createScene(sceneId, 20, 15);
    
    // Load tilemap first
    await scene.loadTilemap(TILEMAP_CONFIG.TILE_MAP_PATH);
    
    // Load scene data from JSON file
    await scene.loadFromFile(`assets/scenes/${sceneId}.json`);
    
    // Update game state with scene
    updateGameState({
      currentScene: scene
    });

    console.log('Scene loaded successfully');
  } catch (err) {
    console.error('Error loading scene:', err);
  }
};

// Keyboard movement controls
document.addEventListener('keydown', (e) => {
  if (!gameState.localPlayer || !gameState.currentScene) return;
  
  const now = Date.now();
  const speed = 5;
  let newX = gameState.localPlayer.x;
  let newY = gameState.localPlayer.y;
  
  switch (e.key) {
    case 'ArrowLeft': newX -= speed; break;
    case 'ArrowRight': newX += speed; break;
    case 'ArrowUp': newY -= speed; break;
    case 'ArrowDown': newY += speed; break;
    default: return;
  }

  // Calculate scene bounds
  const sceneWidth = gameState.currentScene.width * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
  const sceneHeight = gameState.currentScene.height * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
  const playerSize = 64;

  // Keep player within scene bounds
  newX = Math.max(playerSize/2, Math.min(newX, sceneWidth - playerSize/2));
  newY = Math.max(playerSize/2, Math.min(newY, sceneHeight - playerSize/2));

  // Check collision at new position
  if (!checkCollision(newX, newY)) {
    const updatedPlayers = gameState.players.map(player => 
      player.id === gameState.localPlayer.id 
        ? { ...player, x: newX, y: newY }
        : player
    );

    updateGameState({
      players: updatedPlayers,
      localPlayer: { ...gameState.localPlayer, x: newX, y: newY }
    });
    
    // Send movement update
    if (now - lastMovementSent >= MOVEMENT_INTERVAL) {
      sendGameMessage({
        type: 'movement',
        playerId: gameState.localPlayer.id,
        x: newX,
        y: newY,
        timestamp: now
      });
      lastMovementSent = now;
    }
  }
});

// Mouse click movement controls
let isMouseDown = false;
let mousePosition = { x: 0, y: 0 };
let movementInterval = null;
const MOVEMENT_FRAME_RATE = 60; // 60fps target
let lastFrameTime = 0;

function movePlayerFrame(timestamp) {
  if (!isMouseDown) return;
  
  // Throttle to target frame rate
  if (timestamp - lastFrameTime >= 1000/MOVEMENT_FRAME_RATE) {
    movePlayerTowardsMouse();
    lastFrameTime = timestamp;
  }
  
  movementInterval = requestAnimationFrame(movePlayerFrame);
}

const batchedUpdates = new Set();
const BATCH_INTERVAL = 100; // Process batches every 100ms

function processPlayerUpdates() {
  if (batchedUpdates.size > 0) {
    const updatedPlayers = gameState.players.map(player => {
      const update = batchedUpdates.get(player.id);
      return update ? {...player, ...update} : player;
    });
    
    updateGameState({players: updatedPlayers});
    batchedUpdates.clear();
  }
}

setInterval(processPlayerUpdates, BATCH_INTERVAL);

gameArea.addEventListener('mousedown', (e) => {
  if (e.target.closest('.chat-box')) return;
  if (!gameState.localPlayer || !gameState.currentScene) return;
  
  isMouseDown = true;
  lastFrameTime = performance.now();
  movementInterval = requestAnimationFrame(movePlayerFrame);
  
  // Store initial mouse position
  const viewportX = gameState.currentScene.viewport.x || 0;
  const viewportY = gameState.currentScene.viewport.y || 0;
  mousePosition = {
    x: e.clientX - gameArea.getBoundingClientRect().left + viewportX,
    y: e.clientY - gameArea.getBoundingClientRect().top + viewportY
  };

  // Start continuous movement
  movementInterval = setInterval(() => {
    movePlayerTowardsMouse();
  }, 16);
});

gameArea.addEventListener('mousemove', (e) => {
  // Ignore mouse movement over chat box
  if (e.target.closest('.chat-box')) return;
  
  if (!isMouseDown || !gameState.currentScene) return;
  
  const viewportX = gameState.currentScene.viewport.x || 0;
  const viewportY = gameState.currentScene.viewport.y || 0;
  mousePosition = {
    x: e.clientX - gameArea.getBoundingClientRect().left + viewportX,
    y: e.clientY - gameArea.getBoundingClientRect().top + viewportY
  };
});

gameArea.addEventListener('mouseup', () => {
  isMouseDown = false;
  if (movementInterval) {
    cancelAnimationFrame(movementInterval);
    movementInterval = null;
  }
});

gameArea.addEventListener('mouseleave', () => {
  isMouseDown = false;
  if (movementInterval) {
    clearInterval(movementInterval);
    movementInterval = null;
  }
});

function movePlayerTowardsMouse() {
  if (!gameState.localPlayer || !gameState.currentScene || !isMouseDown) return;

  const now = performance.now(); 

  // Cache commonly used values
  const {x: playerX, y: playerY} = gameState.localPlayer;
  const dirX = mousePosition.x - playerX;
  const dirY = mousePosition.y - playerY;

  // Early exit if already at destination (within 1 pixel)
  if (Math.abs(dirX) <= 1 && Math.abs(dirY) <= 1) return;

  const length = Math.sqrt(dirX * dirX + dirY * dirY);
  const normalizedDirX = dirX / length;
  const normalizedDirY = dirY / length;

  const speed = 5;
  let newX = playerX + (normalizedDirX * speed);
  let newY = playerY + (normalizedDirY * speed);

  // Calculate scene bounds
  const sceneWidth = gameState.currentScene.width * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
  const sceneHeight = gameState.currentScene.height * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
  
  const playerSize = 64;

  // Keep player within scene bounds
  newX = Math.max(0, Math.min(newX, sceneWidth - playerSize));
  newY = Math.max(0, Math.min(newY, sceneHeight - playerSize));

  // Check collision at new position
  if (!checkCollision(newX, newY)) {
    // Update local state if no collision
    const updatedPlayers = gameState.players.map(player => 
      player.id === gameState.localPlayer.id 
        ? { ...player, x: newX, y: newY }
        : player
    );

    updateGameState({
      players: updatedPlayers,
      localPlayer: { ...gameState.localPlayer, x: newX, y: newY }
    });

    // Throttle network updates
    if (now - lastMovementSent >= MOVEMENT_INTERVAL) {
      sendGameMessage({
        type: 'movement',
        playerId: gameState.localPlayer.id,
        x: newX,
        y: newY,
        timestamp: now
      });
      lastMovementSent = now;
    }
  }
}

const handleChatMessage = (message) => {
  const player = gameState.players.find(p => p.id === message.playerId);
  if (player) {
    player.message = message.text;
    // Clear message after 3 seconds
    setTimeout(() => {
      const updatedPlayers = gameState.players.map(p => 
        p.id === message.playerId ? {...p, message: null} : p
      );
      updateGameState({ players: updatedPlayers });
    }, 3000);
    renderGame();
  }
};

const EMOJIS = {
  ':alert:': 'assets/images/ui/emotes/emote_alert.png',
  ':anger:': 'assets/images/ui/emotes/emote_anger.png',
  ':bars:': 'assets/images/ui/emotes/emote_bars.png',
  ':cash:': 'assets/images/ui/emotes/emote_cash.png',
  ':circle:': 'assets/images/ui/emotes/emote_circle.png',
  ':cloud:': 'assets/images/ui/emotes/emote_cloud.png',
  ':cross:': 'assets/images/ui/emotes/emote_cross.png',
  ':dots1:': 'assets/images/ui/emotes/emote_dots1.png',
  ':dots2:': 'assets/images/ui/emotes/emote_dots2.png',
  ':dots3:': 'assets/images/ui/emotes/emote_dots3.png',
  ':drop:': 'assets/images/ui/emotes/emote_drop.png',
  ':drops:': 'assets/images/ui/emotes/emote_drops.png',
  ':exclamation:': 'assets/images/ui/emotes/emote_exclamation.png',
  ':exclamations:': 'assets/images/ui/emotes/emote_exclamations.png',
  ':angry:': 'assets/images/ui/emotes/emote_faceAngry.png',
  ':happy:': 'assets/images/ui/emotes/emote_faceHappy.png',
  ':sad:': 'assets/images/ui/emotes/emote_faceSad.png',
  ':heart:': 'assets/images/ui/emotes/emote_heart.png',
  ':heartbroken:': 'assets/images/ui/emotes/emote_heartBroken.png',
  ':hearts:': 'assets/images/ui/emotes/emote_hearts.png',
  ':idea:': 'assets/images/ui/emotes/emote_idea.png',
  ':laugh:': 'assets/images/ui/emotes/emote_laugh.png',
  ':music:': 'assets/images/ui/emotes/emote_music.png',
  ':question:': 'assets/images/ui/emotes/emote_question.png',
  ':sleep:': 'assets/images/ui/emotes/emote_sleep.png',
  ':sleeps:': 'assets/images/ui/emotes/emote_sleeps.png',
  ':star:': 'assets/images/ui/emotes/emote_star.png',
  ':stars:': 'assets/images/ui/emotes/emote_stars.png',
  ':swirl:': 'assets/images/ui/emotes/emote_swirl.png',
  // Add more emoji mappings here
};

const EMOJI_CATEGORIES = {
  faces: [':angry:', ':happy:', ':sad:'],
  symbols: [':heart:', ':hearts:', ':heartbroken:', ':laugh:', ':sleep:', ':sleeps:', ':star:', ':stars:', ':question:', ':exclamation:', ':exclamations:', ':idea:'],
  misc: [':cloud:', ':drop:', ':drops:', ':swirl:', ':music:', ':bars:', ':cash:', ':circle:', ':cross:', ':dots1:', ':dots2:', ':dots3:']
};

function showEmojiCategory(category) {
  document.querySelectorAll('.emoji-category').forEach(grid => {
    grid.classList.remove('active');
  });
  document.getElementById(`emoji-${category}`).classList.add('active');
}

const handlePlayerMovement = (message) => {
  const playerIndex = gameState.players.findIndex(p => p.id === message.playerId);
  if (playerIndex === -1) return;

  const player = gameState.players[playerIndex];
  const lastPos = lastKnownPositions.get(message.playerId) || player;
  lastKnownPositions.set(message.playerId, {
    x: message.x,
    y: message.y,
    timestamp: message.timestamp
  });

  // Interpolate movement
  const interpolate = () => {
    const now = Date.now();
    const timeDiff = now - lastPos.timestamp;
    const duration = MOVEMENT_INTERVAL;
    const progress = Math.min(timeDiff / duration, 1);

    const x = lastPos.x + (message.x - lastPos.x) * progress;
    const y = lastPos.y + (message.y - lastPos.y) * progress;

    const updatedPlayers = [...gameState.players];
    updatedPlayers[playerIndex] = {
      ...updatedPlayers[playerIndex],
      x, y
    };

    updateGameState({
      players: updatedPlayers
    });

    if (progress < 1) {
      requestAnimationFrame(interpolate);
    }
  };

  interpolate();
};

// Chat input handler
document.addEventListener('keypress', (e) => {
  if (e.target.id === 'global-chat-input' && e.key === 'Enter' && gameState.localPlayer) {
    const chatInput = e.target;
    const text = chatInput.value.trim().substring(0, 200);
    
    if (text) {
      // Add to local player's message queue FIRST before sending
      updatePlayerMessage(gameState.localPlayer.id, text);
      
      // Add message to chat box
      addChatMessage(gameState.localPlayer.id, text);

      // Broadcast to other players
      sendGameMessage({
        type: 'chat',
        playerId: gameState.localPlayer.id,
        text
      });

      // Clear input
      chatInput.value = '';
    }
  }
});


function checkCollision(x, y) {
  if (!gameState.currentScene) return false;

  // Add collision points around player sprite
  const playerSize = 32; // Half of the 64px player size
  const points = [
    { x: x - playerSize/2, y: y - playerSize/2 }, // Top left
    { x: x + playerSize/2, y: y - playerSize/2 }, // Top right
    { x: x - playerSize/2, y: y + playerSize/2 }, // Bottom left
    { x: x + playerSize/2, y: y + playerSize/2 }  // Bottom right
  ];

  // Check collision for each point
  return points.some(point => {
    const tileX = Math.floor(point.x / (TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE));
    const tileY = Math.floor(point.y / (TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE));

    // Check each layer for collisions
    return gameState.currentScene.layers.some(layer => {
      if (layer.collision && layer.tiles[tileY]?.[tileX] !== TILEMAP_CONFIG.DEFAULT_TILE) {
        console.log('Collision detected at:', tileX, tileY);
        return true; // Collision found
      }
      return false;
    });
  });
}