import { connectToPeer, sendGameMessage, closeConnection } from './peer.js';
import { TILEMAP_CONFIG } from './scene.js';

// Constants
const PLAYER_TIMEOUT = 15000; // 15 seconds timeout
const FPS_UPDATE_INTERVAL = 500; // Update every 500ms
const FRAME_TIME = 1000 / 60; // Target 60 FPS
const MOVEMENT_INTERVAL = 50; // Send position updates every 50ms
const CHAT_MAX_MESSAGES = 50; // Maximum chat messages
const MESSAGE_DURATION = 3000; // 3 seconds per message
const MAX_STACKED_MESSAGES = 3; // Maximum stacked messages
const CACHE_SIZE = 100;
const PLAYER_SPEED = 2; // Player movement speed in pixels per frame
const MOVEMENT_FRAME_TIME = 1000 / 60; // Consistent 60fps for movement
const RENDER_SCALE = window.devicePixelRatio || 1;

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

let wasConnected = false;
let sceneCanvas = null;
let sceneContext = null;
let chatBox = null;
let gameCtx = null;

// Performance Tracking
let fpsValues = [];
let lastFpsUpdate = 0;
let lastRenderTime = 0;
let lastMovementSent = 0;

export let gameState = {
  players: [], //{id, x, y, avatar}
  messages: [],
  localPlayer: null,
  currentScene: null
};

// Element pooling
const playerElements = new Map();
const elementPool = {
  div: Array(CACHE_SIZE).fill(null).map(() => document.createElement('div')),
  img: Array(CACHE_SIZE).fill(null).map(() => document.createElement('img'))
};

const chatElementPool = {
  messages: Array(CHAT_MAX_MESSAGES).fill(null).map(() => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    return div;
  }),
  spans: Array(CHAT_MAX_MESSAGES).fill(null).map(() => {
    const span = document.createElement('span');
    span.className = 'chat-name';
    return span;
  })
};

// DOM References
const gameArea = document.getElementById("game-area");


let lastKnownPositions = new Map(); // Store positions for interpolation

// Update game state
export const updateGameState = (data) => {
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

// Render game
function renderGame(timestamp) {
  if (timestamp - lastRenderTime < FRAME_TIME) {
    requestAnimationFrame(renderGame);
    return;
  }

  if (!gameArea) return;

  // Create or get game container
  let gameContainer = document.getElementById('game-container');
  if (!gameContainer) {
    gameContainer = document.createElement('div');
    gameContainer.id = 'game-container';
    gameContainer.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      // background-color: black;
      transform: translateZ(0);
      backface-visibility: hidden;
      z-index: 1;
    `;
    gameArea.appendChild(gameContainer);
  }

  if (!chatBox && gameState.localPlayer) {
    chatBox = new ChatBox();
    gameContainer.appendChild(chatBox.element);
  }

  // Initialize scene canvas and context
  if (!gameCtx && gameState.currentScene?.isLoaded) {
    const canvas = document.createElement('canvas');
    canvas.width = gameArea.clientWidth;
    canvas.height = gameArea.clientHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    gameCtx = canvas.getContext('2d');
    gameCtx.imageSmoothingEnabled = false;
    gameArea.appendChild(canvas);
  }

  // Render scene
  if (gameCtx && gameState.currentScene?.isLoaded) {
    gameState.currentScene.render(gameCtx);
    
    // Update and render players
    if (gameState.players?.length > 0) {
      const viewportX = gameState.currentScene?.viewport?.x || 0;
      const viewportY = gameState.currentScene?.viewport?.y || 0;
  
      gameState.players.forEach(player => {
        let playerElement = playerElements.get(player.id);
        if (!playerElement) {
          playerElement = createPlayerElement(player);
          playerElements.set(player.id, playerElement);
          gameContainer.appendChild(playerElement);
        }
  
        // Update player position
        playerElement.style.transform = 
          `translate3d(${player.x - viewportX}px, ${player.y - viewportY}px, 0)`;
      });
    }
  }

  // Update and render players
  if (gameState.players?.length > 0) {
    const viewportX = gameState.currentScene?.viewport?.x || 0;
    const viewportY = gameState.currentScene?.viewport?.y || 0;

    gameState.players.forEach(player => {
      let playerElement = playerElements.get(player.id);
      if (!playerElement) {
        playerElement = createPlayerElement(player);
        playerElements.set(player.id, playerElement);
        gameContainer.appendChild(playerElement);
      }

      // Update player position
      playerElement.style.transform = 
        `translate3d(${player.x - viewportX}px, ${player.y - viewportY}px, 0)`;
      
      // Update player messages
      updatePlayerMessages(player, playerElement);
    });
  }

  // Create or update chat box
  if (!chatBox) {
    chatBox = new ChatBox();
    gameContainer.appendChild(chatBox.element);
  }

  const now = performance.now();
  lastRenderTime = now;
  requestAnimationFrame(renderGame);
}
requestAnimationFrame(renderGame);

function createPlayerElement(player) {
  const element = document.createElement('div');
  element.className = 'player';
  
  // Add player name tag
  const nameTag = document.createElement('div');
  nameTag.className = 'player-name';
  nameTag.textContent = player.displayName || 'Anonymous';
  element.appendChild(nameTag);

  // Add avatar
  if (player.avatar) {
    const avatar = document.createElement('img');
    avatar.src = player.avatar;
    avatar.style.width = '100%';
    avatar.style.height = '100%';
    element.appendChild(avatar);
  }

  return element;
}

function updatePlayerMessages(player, element) {
  if (!player.messageQueue?.length) return;
  
  let msgContainer = element.querySelector('.message-container');
  if (!msgContainer) {
    msgContainer = elementPool.div.pop() || document.createElement('div');
    msgContainer.className = 'message-container';
    msgContainer.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      width: max-content;
      min-width: 100px;
    `;
    element.appendChild(msgContainer);
  }

  // Update messages
  while (msgContainer.children.length > player.messageQueue.length) {
    elementPool.div.push(msgContainer.lastChild);
    msgContainer.lastChild.remove();
  }

  player.messageQueue.forEach((msg, i) => {
    let msgElement = msgContainer.children[i];
    if (!msgElement) {
      msgElement = elementPool.div.pop() || document.createElement('div');
      msgElement.className = 'player-message';
      msgElement.style.cssText = `
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        text-align: center;
        margin-bottom: 5px;
        opacity: ${1 - (i * 0.2)};
        word-wrap: break-word;
        max-width: 200px;
        min-width: 50px;
      `;
      msgContainer.appendChild(msgElement);
    }

    // Handle emojis in messages
    msgElement.innerHTML = '';
    const parts = msg.text.split(/(:[\w-]+:)/g);
    parts.forEach(part => {
      if (EMOJIS[part]) {
        const emoji = elementPool.img.pop() || document.createElement('img');
        emoji.src = EMOJIS[part];
        emoji.style.cssText = 'width:24px;height:24px;vertical-align:middle;display:inline-block;margin:0 2px;';
        msgElement.appendChild(emoji);
      } else if (part.trim()) {
        msgElement.appendChild(document.createTextNode(part));
      }
    });
  });
}

// Add chat message to chat box
const addChatMessage = (playerId, text) => {
  const chatMessages = document.querySelector('.chat-messages');
  if (!chatMessages) {
    console.warn('Chat messages container not found');
    return;
  }

  // Get or create message elements from pool
  const messageDiv = chatElementPool.messages.pop() || document.createElement('div');
  messageDiv.className = 'chat-message';
  
  const nameSpan = chatElementPool.spans.pop() || document.createElement('span');
  nameSpan.className = 'chat-name';
  
  // Set player name and color
  const player = gameState.players.find(p => p.id === playerId);
  nameSpan.textContent = player?.displayName || 'Anonymous';
  nameSpan.style.color = player?.chatColor || '#88ff88';
  
  messageDiv.appendChild(nameSpan);
  messageDiv.appendChild(document.createTextNode(': '));

  // Handle emojis with optimized parsing
  const parts = text.split(/(:[\w-]+:)/g);
  parts.forEach(part => {
    if (EMOJIS[part]) {
      const emoji = elementPool.img.pop() || document.createElement('img');
      emoji.src = EMOJIS[part];
      emoji.style.cssText = 'width:24px;height:24px;vertical-align:middle;display:inline-block;margin:0 2px;';
      messageDiv.appendChild(emoji);
    } else if (part.trim()) {
      messageDiv.appendChild(document.createTextNode(part));
    }
  });

  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Limit number of messages and recycle elements
  while (chatMessages.children.length > CHAT_MAX_MESSAGES) {
    const oldMsg = chatMessages.firstChild;
    // Recycle elements back to pools
    const nameSpan = oldMsg.querySelector('.chat-name');
    if (nameSpan) chatElementPool.spans.push(nameSpan);
    const emojis = oldMsg.querySelectorAll('img');
    emojis.forEach(emoji => elementPool.img.push(emoji));
    chatElementPool.messages.push(oldMsg);
    oldMsg.remove();
  }
};

class ChatBox {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'chat-box';
    this.element.innerHTML = `
      <div class="chat-messages"></div>
      <div class="chat-input-container">
        <div class="chat-input-group">
          <input type="text" id="global-chat-input" placeholder="Press Enter to chat..." maxlength="200">
          <button class="emoji-toggle" type="button">😊</button>
          <div class="emoji-picker"></div>
        </div>
      </div>
    `;
    
    this.initializeEmojiPicker();
    this.setupEventListeners();
  }

  initializeEmojiPicker() {
    const emojiPicker = this.element.querySelector('.emoji-picker');
    const emojiToggle = this.element.querySelector('.emoji-toggle');
    const chatInput = this.element.querySelector('#global-chat-input');

    if (!emojiPicker || !emojiToggle || this.initialized) return;

    // Create emoji grid container
    const gridContainer = document.createElement('div');
    gridContainer.className = 'emoji-grid-container';

    // Create category tabs
    const tabContainer = document.createElement('div');
    tabContainer.className = 'emoji-tabs';

    Object.entries(EMOJI_CATEGORIES).forEach(([category, codes], index) => {
      // Create tab
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
        const button = elementPool.div.pop() || document.createElement('button');
        button.className = 'emoji-button';
        button.onclick = () => {
          const pos = chatInput.selectionStart;
          chatInput.value = chatInput.value.slice(0, pos) + code + chatInput.value.slice(pos);
          chatInput.focus();
          chatInput.setSelectionRange(pos + code.length, pos + code.length);
          emojiPicker.classList.remove('show');
        };
        
        const img = elementPool.img.pop() || document.createElement('img');
        img.src = EMOJIS[code];
        img.alt = code;
        button.appendChild(img);
        grid.appendChild(button);
      });
      
      gridContainer.appendChild(grid);
    });

    emojiPicker.appendChild(tabContainer);
    emojiPicker.appendChild(gridContainer);
    this.initialized = true;

    // Event listeners
    emojiToggle.onclick = () => emojiPicker.classList.toggle('show');
    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && !emojiToggle.contains(e.target)) {
        emojiPicker.classList.remove('show');
      }
    });
  }

  setupEventListeners() {
    const chatInput = this.element.querySelector('#global-chat-input');
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && gameState.localPlayer) {
        const text = chatInput.value.trim().substring(0, 200);
        if (text) {
          updatePlayerMessage(gameState.localPlayer.id, text);
          addChatMessage(gameState.localPlayer.id, text);
          sendGameMessage({
            type: 'chat',
            playerId: gameState.localPlayer.id,
            text
          });
          chatInput.value = '';
        }
      }
    });
  }
}

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
// const createChatMessage = (messages) => {
//   if (!Array.isArray(messages)) {
//     messages = [{ text: messages }];
//   }

//   const container = document.createElement('div');
//   container.style.cssText = `
//     position: absolute;
//     bottom: 100%;
//     left: 50%;
//     transform: translateX(-50%);
//     display: flex;
//     flex-direction: column;
//     align-items: center;
//   `;

//   messages.forEach((msg, index) => {
//     const messageElement = document.createElement('div');
//     messageElement.style.cssText = `
//       background: rgba(0,0,0,0.7);
//       color: white;
//       padding: 4px 8px;
//       border-radius: 12px;
//       max-width: 200px;
//       min-width: 50px;
//       word-wrap: break-word;
//       text-align: center;
//       margin-bottom: 5px;
//       opacity: ${1 - (index * 0.2)};
//     `;

//     // Handle emojis in message
//     const parts = msg.text.split(/(:[\w-]+:)/g);
//     parts.forEach(part => {
//       if (EMOJIS[part]) {
//         const emoji = document.createElement('img');
//         emoji.src = EMOJIS[part];
//         emoji.style.cssText = `
//           width: 24px;
//           height: 24px;
//           vertical-align: middle;
//           display: inline-block;
//           margin: 0 2px;
//         `;
//         messageElement.appendChild(emoji);
//       } else if (part.trim()) {
//         messageElement.appendChild(document.createTextNode(part));
//       }
//     });

//     container.appendChild(messageElement);
//   });

//   return container;
// };

let emojiPickerInitialized = false;
// const initializeEmojiPicker = (chatBox) => {
//   if (emojiPickerInitialized) return; // Skip if already initialized
  
//   const emojiToggle = chatBox.querySelector('.emoji-toggle');
//   const emojiPicker = chatBox.querySelector('.emoji-picker');
//   const chatInput = chatBox.querySelector('#global-chat-input');

//   if (emojiToggle && emojiPicker) {
//     // Clear any existing content
//     emojiPicker.innerHTML = '';
    
//     // Remove once:true to keep the listener active
//     emojiToggle.addEventListener('click', (e) => {
//       e.stopPropagation();
//       emojiPicker.classList.toggle('show');
//     });

//     // Use a persistent document click handler
//     document.addEventListener('click', (e) => {
//       // Only close if clicking outside picker and toggle
//       if (!emojiPicker.contains(e.target) && !emojiToggle.contains(e.target)) {
//         emojiPicker.classList.remove('show');
//       }
//     });

//     // Create emoji categories
//     const tabContainer = document.createElement('div');
//     tabContainer.className = 'emoji-tabs';
    
//     const gridContainer = document.createElement('div');
//     gridContainer.className = 'emoji-grid';
    
//     Object.entries(EMOJI_CATEGORIES).forEach(([category, codes], index) => {
//       // Create category tab
//       const tab = document.createElement('button');
//       tab.className = `emoji-tab ${index === 0 ? 'active' : ''}`;
//       tab.textContent = category.charAt(0).toUpperCase() + category.slice(1);
//       tab.onclick = (e) => {
//         e.stopPropagation();
//         document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
//         tab.classList.add('active');
//         showEmojiCategory(category);
//       };
//       tabContainer.appendChild(tab);
      
//       // Create emoji grid
//       const grid = document.createElement('div');
//       grid.className = `emoji-category ${index === 0 ? 'active' : ''}`;
//       grid.id = `emoji-${category}`;
      
//       codes.forEach(code => {
//         const emojiButton = document.createElement('button');
//         emojiButton.className = 'emoji-button';
        
//         const emojiImg = document.createElement('img');
//         emojiImg.src = EMOJIS[code];
//         emojiImg.title = code;
//         emojiImg.alt = code;
        
//         emojiButton.appendChild(emojiImg);
//         emojiButton.onclick = () => {
//           const cursorPos = chatInput.selectionStart;
//           const textBefore = chatInput.value.substring(0, cursorPos);
//           const textAfter = chatInput.value.substring(cursorPos);
          
//           chatInput.value = textBefore + code + textAfter;
//           chatInput.focus();
//           chatInput.setSelectionRange(cursorPos + code.length, cursorPos + code.length);
//           emojiPicker.classList.remove('show');
//         };
        
//         grid.appendChild(emojiButton);
//       });
      
//       gridContainer.appendChild(grid);
//     });
    
//     emojiPicker.appendChild(tabContainer);
//     emojiPicker.appendChild(gridContainer);
    
//     emojiPickerInitialized = true; // Mark as initialized
//   }
// };

// const loadGameScene = async (sceneId) => {
//   try {
//     console.log('Loading scene:', sceneId);
    
//     // Clear existing scene canvas
//     if (sceneCanvas) {
//       sceneCanvas.remove();
//       sceneCanvas = null;
//       sceneContext = null;
//     }

//     const scene = await sceneManager.createScene(sceneId, 64, 128);
    
//     // Load tilemap first and wait for it
//     console.log('Loading tilemap...');
//     await scene.loadTilemap(TILEMAP_CONFIG.TILE_MAP_PATH);
//     console.log('Tilemap loaded');
    
//     // Load scene data and wait for it
//     console.log('Loading scene data...');
//     await scene.loadFromFile(`assets/scenes/${sceneId}.json`);
//     console.log('Scene data loaded');

//     // Only update game state once everything is loaded
//     if (scene.isLoaded) {
//       updateGameState({
//         currentScene: scene
//       });
//       console.log('Scene loaded successfully');
//     } else {
//       throw new Error('Scene failed to load completely');
//     }

//   } catch (err) {
//     console.error('Error loading scene:', err);
//     throw err;
//   }
// };

// Keyboard movement controls
document.addEventListener('keydown', (e) => {
  if (!gameState.localPlayer || !gameState.currentScene) return;
  
  const now = Date.now();
  let newX = gameState.localPlayer.x;
  let newY = gameState.localPlayer.y;
  
  switch (e.key) {
    case 'ArrowLeft': newX -= PLAYER_SPEED; break;
    case 'ArrowRight': newX += PLAYER_SPEED; break;
    case 'ArrowUp': newY -= PLAYER_SPEED; break;
    case 'ArrowDown': newY += PLAYER_SPEED; break;
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
      players: [localPlayer],
      localPlayer: localPlayer,
      currentScene: gameState.currentScene
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
let lastFrameTime = 0;

function movePlayerFrame(timestamp) {
  if (!isMouseDown) return;
  
  const deltaTime = timestamp - lastFrameTime;
  if (deltaTime >= MOVEMENT_FRAME_TIME) {
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
  const viewportX = gameState.currentScene.viewport?.x || 0;
  const viewportY = gameState.currentScene.viewport?.y || 0;
  
  mousePosition = {
    x: e.clientX - gameArea.getBoundingClientRect().left + viewportX,
    y: e.clientY - gameArea.getBoundingClientRect().top + viewportY
  };
  
  // Start movement immediately
  movePlayerTowardsMouse();
  // Use requestAnimationFrame instead of setInterval
  movementInterval = requestAnimationFrame(movePlayerFrame);
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
    cancelAnimationFrame(movementInterval);
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
  const playerSize = 64;

  // Early exit if already at destination
  if (Math.abs(dirX) <= 1 && Math.abs(dirY) <= 1) return;

  // Calculate scene bounds
  const sceneWidth = gameState.currentScene.width * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
  const sceneHeight = gameState.currentScene.height * TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;

  // Use pre-calculated values
  const length = Math.hypot(dirX, dirY);
  const normalizedDirX = dirX / length;
  const normalizedDirY = dirY / length;

  let boundedX = Math.max(0, Math.min(playerX + (normalizedDirX * PLAYER_SPEED), sceneWidth - playerSize));
  let boundedY = Math.max(0, Math.min(playerY + (normalizedDirY * PLAYER_SPEED), sceneHeight - playerSize));

  // Check collision at new position
  if (!checkCollision(boundedX, boundedY)) {
    // Update local state if no collision
    const updatedPlayers = gameState.players.map(player => 
      player.id === gameState.localPlayer.id 
        ? { ...player, x: boundedX, y: boundedY }
        : player
    );

    updateGameState({
      players: updatedPlayers,
      localPlayer: { ...gameState.localPlayer, x: boundedX, y: boundedY }
    });

    // Throttle network updates independently of movement
    if (now - lastMovementSent >= MOVEMENT_INTERVAL) {
      sendGameMessage({
        type: 'movement',
        playerId: gameState.localPlayer.id,
        x: boundedX,
        y: boundedY,
        timestamp: now
      });
      lastMovementSent = now;
    }
  }
}

// const handleChatMessage = (message) => {
//   const player = gameState.players.find(p => p.id === message.playerId);
//   if (player) {
//     player.message = message.text;
//     // Clear message after 3 seconds
//     setTimeout(() => {
//       const updatedPlayers = gameState.players.map(p => 
//         p.id === message.playerId ? {...p, message: null} : p
//       );
//       updateGameState({ players: updatedPlayers });
//     }, 3000);
//     renderGame();
//   }
// };

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

export const handleGameMessage = (data) => {
  switch (data.type) {
    case 'player_joined':
      // Add new player if they don't exist
      if (!gameState.players.find(p => p.id === data.id)) {
        gameState.players.push(data.player);
        updateGameState({ players: gameState.players });
      }
      break;

    case 'request_players':
      // Send current players list to new player
      sendGameMessage({
        type: 'player_list',
        players: gameState.players
      });
      break;

    case 'player_list':
      // Update our players list with existing players
      updateGameState({ 
        players: [...new Set([...gameState.players, ...data.players])]
      });
      break;

    case 'player_sync':
      // Update player's state
      const syncIndex = gameState.players.findIndex(p => p.id === data.player.id);
      if (syncIndex !== -1) {
        gameState.players[syncIndex] = {
          ...gameState.players[syncIndex],
          ...data.player,
          lastSeen: Date.now()
        };
        updateGameState({ players: gameState.players });
      }
      break;

    case 'movement':
      // Handle player movement with interpolation
      handlePlayerMovement(data);
      break;

    case 'chat':
      // Handle chat messages
      const chatPlayer = gameState.players.find(p => p.id === data.playerId);
      if (chatPlayer) {
        updatePlayerMessage(data.playerId, data.text);
        addChatMessage(data.playerId, data.text);
      }
      break;

    case 'avatar_update':
      // Update player's avatar
      const avatarIndex = gameState.players.findIndex(p => p.id === data.playerId);
      if (avatarIndex !== -1) {
        gameState.players[avatarIndex] = {
          ...gameState.players[avatarIndex],
          avatar: data.avatar
        };
        updateGameState({ players: gameState.players });
      }
      break;

    case 'player_left':
      // Remove disconnected player
      const remainingPlayers = gameState.players.filter(p => p.id !== data.playerId);
      updateGameState({ players: remainingPlayers });
      break;

    default:
      console.warn('Unknown message type:', data.type);
  }
};