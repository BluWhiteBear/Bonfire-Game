class LevelEditor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.tileSize = TILEMAP_CONFIG.TILE_SIZE * TILEMAP_CONFIG.SCALE;
    
    // Increase map size to 128x128 (4x larger)
    this.mapWidth = 64;
    this.mapHeight = 128;
    
    // Add camera/viewport controls
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
      minZoom: 0.1, // Show more of the map
      maxZoom: 3     // Allow closer zoom
    };
    
    this.layers = [{
      name: 'Layer 1',
      tiles: this.createEmptyTileArray(),
      visible: true
    }];

    this.currentLayer = 0;
    this.selectedTile = null;
    this.currentTool = 'draw';
    this.isPanning = false;
    this.lastMousePos = { x: 0, y: 0 };
    
    this.initializeCanvas();
    this.loadTilemap();
    this.setupEventListeners();
  }

  createEmptyTileArray() {
    return new Array(this.mapHeight).fill(null)
      .map(() => new Array(this.mapWidth).fill(TILEMAP_CONFIG.DEFAULT_TILE));
  }

  initializeCanvas() {
    // Keep canvas size the same for display
    this.canvas.width = 32 * this.tileSize;
    this.canvas.height = 32 * this.tileSize;
    
    // Initialize larger layers
    this.layers.forEach(layer => {
      layer.tiles = new Array(this.mapHeight).fill(null)
        .map(() => new Array(this.mapWidth).fill(TILEMAP_CONFIG.DEFAULT_TILE));
    });
  }
  
    /* Something is wrong here */

    async loadTilemap() {
      const scene = new Scene(1, 1);
      await scene.loadTilemap(TILEMAP_CONFIG.TILE_MAP_PATH);
      this.tilemapSprites = scene.tilemapSprites;
      this.createTilePalette();
    }
  
    createTilePalette() {
      const palette = document.getElementById('tile-palette');
      this.tilemapSprites.forEach((sprite, index) => {
        const tile = document.createElement('canvas');
        tile.width = this.tileSize;
        tile.height = this.tileSize;
        tile.className = 'tile-option';
        
        const ctx = tile.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, 0, 0, this.tileSize, this.tileSize);
        
        tile.dataset.tileIndex = index;
        tile.onclick = () => this.selectTile(index);
        
        palette.appendChild(tile);
      });
    }
  
    selectTile(index) {
      this.selectedTile = index;
      document.querySelectorAll('.tile-option').forEach(tile => {
        tile.classList.toggle('selected', tile.dataset.tileIndex == index);
      });
    }

    /* */
  
    setupEventListeners() {
      this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
      this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
      this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
      
      document.getElementById('draw-tool').onclick = () => this.currentTool = 'draw';
      document.getElementById('erase-tool').onclick = () => this.currentTool = 'erase';
      document.getElementById('fill-tool').onclick = () => this.currentTool = 'fill';
      
      document.getElementById('add-layer').onclick = this.addLayer.bind(this);
      document.getElementById('export-map').onclick = this.exportMap.bind(this);
      document.getElementById('import-map').onclick = this.importMap.bind(this);

      // Zoom controls
      this.canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const deltaY = e.deltaY;
        const mouseX = e.offsetX;
        const mouseY = e.offsetY;
        
        // Calculate zoom
        const oldZoom = this.camera.zoom;
        this.camera.zoom *= deltaY > 0 ? 0.9 : 1.1;
        this.camera.zoom = Math.max(this.camera.minZoom, 
                                  Math.min(this.camera.maxZoom, this.camera.zoom));
        
        // Zoom toward mouse position
        if (this.camera.zoom !== oldZoom) {
          const zoomFactor = this.camera.zoom / oldZoom;
          this.camera.x = mouseX - (mouseX - this.camera.x) * zoomFactor;
          this.camera.y = mouseY - (mouseY - this.camera.y) * zoomFactor;
          this.render();
        }
      });

      // Pan controls
      this.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && e.getModifierState("Space"))) {
          e.preventDefault();
          this.isPanning = true;
          this.lastMousePos = { x: e.clientX, y: e.clientY };
        }
      });

      this.canvas.addEventListener('mousemove', (e) => {
        if (this.isPanning) {
          const deltaX = e.clientX - this.lastMousePos.x;
          const deltaY = e.clientY - this.lastMousePos.y;
          this.camera.x += deltaX;
          this.camera.y += deltaY;
          this.lastMousePos = { x: e.clientX, y: e.clientY };
          this.render();
        }
      });

      this.canvas.addEventListener('mouseup', () => {
        this.isPanning = false;
      });
    }
  
    handleMouseDown(e) {
      if (e.button === 1 || (e.button === 0 && e.getModifierState("Space"))) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (this.currentTool === 'fill') {
        this.fillArea(x, y);
      } else {
        this.isDrawing = true;
        this.placeTile(x, y);
      }
    }
  
    handleMouseMove(e) {
      if (!this.isDrawing) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      this.placeTile(x, y);
    }
  
    handleMouseUp() {
      this.isDrawing = false;
    }
  
    placeTile(x, y) {
      // Convert screen coordinates to world coordinates
      const worldX = Math.floor((x - this.camera.x) / (this.tileSize * this.camera.zoom));
      const worldY = Math.floor((y - this.camera.y) / (this.tileSize * this.camera.zoom));
      
      // Use mapWidth/mapHeight instead of hardcoded 32
      if (worldX < 0 || worldX >= this.mapWidth || worldY < 0 || worldY >= this.mapHeight) return;
      
      const value = this.currentTool === 'erase' ? TILEMAP_CONFIG.DEFAULT_TILE : this.selectedTile;
      this.layers[this.currentLayer].tiles[worldY][worldX] = value;
      this.render();
    }
  
    fillArea(startX, startY) {
      // Convert screen coordinates to world coordinates
      const worldX = Math.floor((startX - this.camera.x) / (this.tileSize * this.camera.zoom));
      const worldY = Math.floor((startY - this.camera.y) / (this.tileSize * this.camera.zoom));
      
      const targetValue = this.layers[this.currentLayer].tiles[worldY][worldX];
      const newValue = this.currentTool === 'erase' ? TILEMAP_CONFIG.DEFAULT_TILE : this.selectedTile;
      
      const fill = (x, y) => {
        // Use mapWidth/mapHeight instead of hardcoded 32
        if (x < 0 || x >= this.mapWidth || y < 0 || y >= this.mapHeight) return;
        if (this.layers[this.currentLayer].tiles[y][x] !== targetValue) return;
        
        this.layers[this.currentLayer].tiles[y][x] = newValue;
        fill(x + 1, y);
        fill(x - 1, y);
        fill(x, y + 1);
        fill(x, y - 1);
      };
      
      fill(worldX, worldY);
      this.render();
    }
  
    addLayer() {
      const name = `Layer ${this.layers.length + 1}`;
      const newLayer = {
        name,
        tiles: this.createEmptyTileArray(),
        visible: true,
        collision: false
      };
      this.layers.push(newLayer);
      this.updateLayerList();
    }
  
    updateLayerList() {
      const list = document.getElementById('layer-list');
      list.innerHTML = '';
      
      this.layers.forEach((layer, index) => {
        const item = document.createElement('div');
        item.className = `layer-item ${index === this.currentLayer ? 'active' : ''}`;
        item.style.cursor = 'pointer';

        // Switch to selected layer when clicking
        item.addEventListener('click', (e) => {
          if (e.target === nameInput || 
              e.target === visibility || 
              e.target === collisionToggle || 
              e.target === deleteBtn) {
            return;
          }
          this.currentLayer = index;
          this.updateLayerList();
        });
        
        // Create container for controls
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.alignItems = 'center';
        controls.style.gap = '8px';
    
        // Create visibility toggle and icon
        const visibilityIcon = document.createElement('span');
        visibilityIcon.innerHTML = '👁️';
        visibilityIcon.style.fontSize = '14px';
        visibilityIcon.style.opacity = '0.7';
        
        const visibility = document.createElement('input');
        visibility.type = 'checkbox';
        visibility.checked = layer.visible !== false;
        visibility.onchange = () => {
          layer.visible = visibility.checked;
          this.render();
        };
        
        // Create collision toggle and icon
        const collisionToggle = document.createElement('input');
        collisionToggle.type = 'checkbox';
        collisionToggle.checked = layer.collision === true;
        collisionToggle.title = 'Collision Layer';
        collisionToggle.style.accentColor = '#ff4444';
        collisionToggle.onchange = () => {
          layer.collision = collisionToggle.checked;
        };
        
        const collisionIcon = document.createElement('span');
        collisionIcon.innerHTML = '🛡️';
        collisionIcon.title = 'Collision Layer';
        collisionIcon.style.fontSize = '14px';
        collisionIcon.style.opacity = '0.7';
        
        // Create layer name input
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = layer.name || `Layer ${index + 1}`; // Preserve existing name
        nameInput.className = 'form-control form-control-sm bg-dark text-light';
        nameInput.style.cssText = `
          flex: 1;
          min-width: 0;
        `;
        
        // Update layer name when input changes
        nameInput.addEventListener('change', () => {
          const newName = nameInput.value.trim();
          if (newName) {
            layer.name = newName; // Update the layer object directly
          } else {
            nameInput.value = layer.name; // Revert to existing name if empty
          }
        });
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-outline-danger btn-sm';
        deleteBtn.innerHTML = '×';
        deleteBtn.style.padding = '0 6px';
        deleteBtn.title = 'Delete Layer';
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          if (this.layers.length > 1) {
            this.deleteLayer(index);
          }
        };
        deleteBtn.disabled = this.layers.length <= 1;
        
        // Assemble controls
        controls.appendChild(visibilityIcon);
        controls.appendChild(visibility);
        controls.appendChild(collisionIcon);
        controls.appendChild(collisionToggle);
        controls.appendChild(nameInput);
        controls.appendChild(deleteBtn);
        item.appendChild(controls);
        list.appendChild(item);
      });
    }

    deleteLayer(index) {
      // Remove the layer
      this.layers.splice(index, 1);
      
      // Adjust current layer if needed
      if (this.currentLayer >= this.layers.length) {
        this.currentLayer = this.layers.length - 1;
      }
      
      // Update UI
      this.updateLayerList();
      this.render();
    }
  
    render() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      // Save context state
      this.ctx.save();
      
      // Apply camera transform
      this.ctx.translate(this.camera.x, this.camera.y);
      this.ctx.scale(this.camera.zoom, this.camera.zoom);
      
      // Draw grid
      const effectiveTileSize = this.tileSize * this.camera.zoom;
      this.ctx.strokeStyle = '#666';
      this.ctx.beginPath();
      for (let x = 0; x <= this.mapWidth * this.tileSize; x += this.tileSize) {
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.mapHeight * this.tileSize);
      }
      for (let y = 0; y <= this.mapHeight * this.tileSize; y += this.tileSize) {
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.mapWidth * this.tileSize, y);
      }
      this.ctx.stroke();
      
      // Draw layers
      this.layers.forEach(layer => {
        if (layer.visible === false) return;
        
        // Only draw visible tiles
        const startX = Math.max(0, Math.floor(-this.camera.x / (this.tileSize * this.camera.zoom)));
        const startY = Math.max(0, Math.floor(-this.camera.y / (this.tileSize * this.camera.zoom)));
        const endX = Math.min(this.mapWidth, startX + Math.ceil(this.canvas.width / (this.tileSize * this.camera.zoom)) + 1);
        const endY = Math.min(this.mapHeight, startY + Math.ceil(this.canvas.height / (this.tileSize * this.camera.zoom)) + 1);
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const tileIndex = layer.tiles[y][x];
            if (tileIndex === TILEMAP_CONFIG.DEFAULT_TILE) continue;
            
            const sprite = this.tilemapSprites.get(tileIndex);
            if (sprite) {
              this.ctx.drawImage(sprite, 
                x * this.tileSize, y * this.tileSize,
                this.tileSize, this.tileSize
              );
            }
          }
        }
      });
      
      // Restore context state
      this.ctx.restore();
    }
  
    exportMap() {
      const mapData = {
        width: this.mapWidth,
        height: this.mapHeight,
        layers: this.layers.map(layer => ({
          name: layer.name,
          tiles: layer.tiles,
          visible: layer.visible,
          collision: layer.collision // Export collision property
        }))
      };
      
      const blob = new Blob([JSON.stringify(mapData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'map.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  
    importMap() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          const text = await file.text();
          const mapData = JSON.parse(text);
          
          // Ensure each layer has properly initialized tile array
          this.layers = mapData.layers.map(layer => ({
            name: layer.name,
            tiles: Array.isArray(layer.tiles[0]) ? layer.tiles : this.createEmptyTileArray(),
            visible: layer.visible !== false,
            collision: layer.collision || false // Import collision property
          }));
          
          this.currentLayer = 0;
          this.updateLayerList();
          this.render();
        } catch (err) {
          console.error('Error importing map:', err);
        }
      };
      input.click();
    }
  }
  
  // Initialize editor when page loads
  document.addEventListener('DOMContentLoaded', () => {
    const editor = new LevelEditor('editor-canvas');
  });