import { connectToPeer, sendGameMessage, closeConnection } from './peer.js';

const PRESET_KEY = 'character_preset';

// Character asset configuration
const characterAssets = {
    /*6*/ skin: ['char_skin_1.png', 'char_skin_2.png', 'char_skin_3.png', 'char_skin_4.png', 'char_skin_5.png', 'char_skin_6.png'],
    /*8*/ eyes: ['char_eyes_1.png', 'char_eyes_2.png', 'char_eyes_3.png', 'char_eyes_4.png', 'char_eyes_5.png', 'char_eyes_6.png', 'char_eyes_7.png', 'char_eyes_8.png'],
    /*18*/ hair: ['char_hair_1.png', 'char_hair_2.png', 'char_hair_3.png', 'char_hair_4.png', 'char_hair_5.png', 'char_hair_6.png', 'char_hair_7.png', 'char_hair_8.png', 'char_hair_9.png', 'char_hair_10.png', 'char_hair_11.png', 'char_hair_12.png', 'char_hair_13.png', 'char_hair_14.png', 'char_hair_15.png', 'char_hair_16.png', 'char_hair_17.png', 'char_hair_18.png'],
    /*10*/ top: ['char_top_1.png', 'char_top_2.png', 'char_top_3.png', 'char_top_4.png', 'char_top_5.png', 'char_top_6.png', 'char_top_7.png', 'char_top_8.png', 'char_top_9.png', 'char_top_10.png'],
    /*9*/ bottoms: ['char_bottom_1.png', 'char_bottom_2.png', 'char_bottom_3.png', 'char_bottom_4.png', 'char_bottom_5.png', 'char_bottom_6.png', 'char_bottom_7.png', 'char_bottom_8.png', 'char_bottom_9.png'],
    /*11*/ shoes: ['char_shoes_1.png', 'char_shoes_2.png', 'char_shoes_3.png', 'char_shoes_4.png', 'char_shoes_5.png', 'char_shoes_6.png', 'char_shoes_7.png', 'char_shoes_8.png', 'char_shoes_9.png', 'char_shoes_10.png', 'char_shoes_11.png']
  };
  
  let currentSelection = {
    skin: 0,
    eyes: 0,
    hair: 0,
    top: 0,
    bottoms: 0,
    shoes: 0
  };
  
  // Load all images and cache them
  const loadedAssets = {};
  Object.entries(characterAssets).forEach(([category, assets]) => {
    assets.forEach(asset => {
      const img = new Image();
      img.src = `assets/images/character/${category}/${asset}`;
      loadedAssets[`${category}/${asset}`] = img;
    });
  });

  function initializeCharacterPreview() {
    // Wait for all images to load
    const promises = Object.values(loadedAssets).map(img => {
      return new Promise((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = () => resolve();
        }
      });
    });
  
    Promise.all(promises).then(() => {
      renderCharacterPreview();
    });
  }
  
  // Function to cycle through assets
  function cycleAsset(category, direction) {
    const assets = characterAssets[category];
    currentSelection[category] = (currentSelection[category] + direction + assets.length) % assets.length;
    updateSelectionIndexes();
    renderCharacterPreview();
    updatePlayerAvatar();
  }
  
  // Render character preview
  function renderCharacterPreview() {
    const canvas = document.getElementById('character-preview');
    const ctx = canvas.getContext('2d');

    // Disables image processing
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    // Draw character layers in order
    ['skin', 'eyes', 'hair', 'top', 'bottoms', 'shoes'].forEach(category => {
        const assetName = characterAssets[category][currentSelection[category]];
        const img = loadedAssets[`${category}/${assetName}`];
        if (img.complete) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
    });
  }

  function saveCharacterPreset() {
    const chatColor = document.getElementById('chat-color-input').value;
    const preset = {
      skin: currentSelection.skin,
      eyes: currentSelection.eyes,
      hair: currentSelection.hair,
      top: currentSelection.top,
      bottoms: currentSelection.bottoms,
      shoes: currentSelection.shoes,
      displayName: document.getElementById('display-name-input').value,
      chatColor: chatColor
    };
    localStorage.setItem(PRESET_KEY, JSON.stringify(preset));
  
    // Update local player with new settings
    if (gameState.localPlayer) {
      const updatedPlayers = gameState.players.map(p => 
        p.id === gameState.localPlayer.id 
          ? { ...p, chatColor: chatColor }
          : p
      );
      
      // Update game state
      updateGameState({
        players: updatedPlayers,
        localPlayer: { ...gameState.localPlayer, chatColor: chatColor }
      });
  
      // Broadcast the update to other players
      sendGameMessage({
        type: 'player_sync',
        player: {
          ...gameState.localPlayer,
          chatColor: chatColor,
          lastSeen: Date.now()
        }
      });
    }
  }


  function loadCharacterPreset() {
    const savedPreset = localStorage.getItem(PRESET_KEY);
    if (savedPreset) {
      const preset = JSON.parse(savedPreset);
      currentSelection = { ...preset };
      document.getElementById('display-name-input').value = preset.displayName || '';
      document.getElementById('chat-color-input').value = preset.chatColor || '#88ff88';
      updateSelectionIndexes();
      renderCharacterPreview();
    }
  }
  
  // Update player avatar with current character
  function updatePlayerAvatar() {
    const canvas = document.getElementById('character-preview');
    const avatarData = canvas.toDataURL();
    
    if (gameState.localPlayer) {
      const updatedPlayers = gameState.players.map(p => 
        p.id === gameState.localPlayer.id 
          ? { ...p, avatar: avatarData }
          : p
      );
      
      updateGameState({
        players: updatedPlayers,
        localPlayer: { ...gameState.localPlayer, avatar: avatarData }
      });
      
      sendGameMessage({
        type: 'avatar_update',
        playerId: gameState.localPlayer.id,
        avatar: avatarData
      });
    }
  }

  function updateSelectionIndexes() {
    Object.entries(characterAssets).forEach(([category, assets]) => {
      const indexSpan = document.getElementById(`${category}-index`);
      if (indexSpan) {
        indexSpan.textContent = `${currentSelection[category] + 1}/${assets.length}`;
      }
    });
  }

  export {
    loadCharacterPreset,
    renderCharacterPreview,
    saveCharacterPreset,
    updatePlayerAvatar,
    cycleAsset // If you need this elsewhere
  };