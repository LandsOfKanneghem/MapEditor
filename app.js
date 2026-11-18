(() => {
  'use strict';

  const COLUMNS = 12;
  const ROWS = 12;
  const TILE_SIZE = 48;
  const TERRAIN = Object.freeze({ grass: 0, sand: 1, 'deep-water': 2, dirt: 3, swamp: 4, 'shallow-water': 5 });
  const landLayers = [
    { terrain: TERRAIN.dirt, image: 'dirt', level: 1 },
    { terrain: TERRAIN.swamp, image: 'swamp', level: 2 },
    { terrain: TERRAIN.sand, image: 'sand', level: 3 }
  ];
  const terrainLevels = [0, 3, 4, 1, 2, 4];
  const waterNeighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const isWater = terrain => terrain === TERRAIN['deep-water'] || terrain === TERRAIN['shallow-water'];
  const MASKS = [0, 1, 4, 5, 7, 16, 17, 20, 21, 23, 28, 29, 31, 64, 65, 68, 69, 71, 80, 81, 84, 85, 87, 92, 93, 95, 112, 113, 116, 117, 119, 124, 125, 127, 193, 197, 199, 209, 213, 215, 221, 223, 241, 245, 247, 253, 255];
  const maskIndex = new Map(MASKS.map((mask, index) => [mask, index]));
  const neighbors = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
  const map = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(TERRAIN.grass));
  const canvas = document.getElementById('map');
  const context = canvas.getContext('2d');
  const surface = document.querySelector('.map-surface');
  const buttons = [...document.querySelectorAll('[data-terrain]')];
  const status = document.getElementById('status');
  const cursor = document.getElementById('keyboard-cursor');
  const images = {};
  let selectedTerrain = TERRAIN.grass;
  let ready = false;
  let activePointer = null;
  let lastCell = null;
  let keyboardCell = { x: 0, y: 0 };

  function normalizeMask(mask) {
    for (const [diagonal, a, b] of [[2, 1, 4], [8, 4, 16], [32, 16, 64], [128, 64, 1]]) {
      if (!(mask & a && mask & b)) mask &= ~diagonal;
    }
    return mask;
  }

  function terrainMask(x, y, level) {
    let mask = 0;
    for (const [dx, dy, bit] of neighbors) {
      // Continue the edge terrain visually; no cells exist outside the map.
      const terrain = map[Math.max(0, Math.min(ROWS - 1, y + dy))][Math.max(0, Math.min(COLUMNS - 1, x + dx))];
      if (terrainLevels[terrain] >= level) mask |= bit;
    }
    return normalizeMask(mask);
  }

  function drawBase(material, variant, x, y) {
    context.drawImage(images.base, variant * TILE_SIZE, material * TILE_SIZE, TILE_SIZE, TILE_SIZE,
      x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  function drawOverlay(layer, mask, x, y) {
    const index = maskIndex.get(mask);
    context.drawImage(images[layer], (index % 8) * TILE_SIZE, Math.floor(index / 8) * TILE_SIZE, TILE_SIZE, TILE_SIZE,
      x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }

  function drawCell(x, y) {
    const terrain = map[y][x];
    const variant = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 3;
    drawBase(TERRAIN.grass, variant, x, y);
    // Matching land masks let each upper layer cover the lower ones cleanly.
    // Sand remains the last land layer, preserving the beach around all water.
    for (const layer of landLayers) {
      if (terrainLevels[terrain] < layer.level) continue;
      const mask = terrainMask(x, y, layer.level);
      if (mask === 255) drawBase(layer.terrain, variant, x, y);
      else drawOverlay(layer.image, mask, x, y);
    }
    if (isWater(terrain)) {
      const mask = terrainMask(x, y, 4);
      if (mask === 255) drawBase(terrain, variant, x, y);
      else drawOverlay(terrain === TERRAIN['deep-water'] ? 'water' : 'shallow-water', mask, x, y);
    }
  }

  function endStroke() {
    const pointer = activePointer;
    activePointer = null;
    lastCell = null;
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  }

  function cellFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * COLUMNS / rect.width);
    const y = Math.floor((event.clientY - rect.top) * ROWS / rect.height);
    return x >= 0 && x < COLUMNS && y >= 0 && y < ROWS ? { x, y } : null;
  }

  function setTerrain(x, y, terrain, dirty) {
    if (map[y][x] === terrain) return;
    map[y][x] = terrain;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(ROWS - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(COLUMNS - 1, x + 1); xx++) dirty.add(yy * COLUMNS + xx);
    }
  }

  function paintCell(x, y, dirty) {
    if (map[y][x] === selectedTerrain) return;
    if (!isWater(selectedTerrain)) {
      setTerrain(x, y, selectedTerrain, dirty);
      return;
    }
    // Convert the whole water component, including any bodies joined by this cell.
    // Only shared sides connect water; touching corners do not.
    const queue = [[x, y]];
    const visited = new Set([y * COLUMNS + x]);
    for (let i = 0; i < queue.length; i++) {
      const [xx, yy] = queue[i];
      setTerrain(xx, yy, selectedTerrain, dirty);
      for (const [dx, dy] of waterNeighbors) {
        const nx = xx + dx, ny = yy + dy;
        if (nx < 0 || nx >= COLUMNS || ny < 0 || ny >= ROWS || !isWater(map[ny][nx])) continue;
        const index = ny * COLUMNS + nx;
        if (visited.has(index)) continue;
        visited.add(index);
        queue.push([nx, ny]);
      }
    }
  }

  function paintLine(from, to) {
    const dirty = new Set();
    let x = from.x, y = from.y;
    const dx = Math.abs(to.x - x), dy = -Math.abs(to.y - y);
    const sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
    let error = dx + dy;
    // Connect pointer samples so fast strokes cannot leave unpainted gaps.
    while (true) {
      paintCell(x, y, dirty);
      if (x === to.x && y === to.y) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
    for (const index of dirty) drawCell(index % COLUMNS, Math.floor(index / COLUMNS));
  }

  function paintPointer(event) {
    const cell = cellFromPointer(event);
    if (!cell) { lastCell = null; return; }
    paintLine(lastCell ?? cell, cell);
    lastCell = cell;
    keyboardCell = cell;
    updateKeyboardCursor();
  }

  function updateKeyboardCursor() {
    cursor.style.setProperty('--cursor-x', keyboardCell.x);
    cursor.style.setProperty('--cursor-y', keyboardCell.y);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedTerrain = TERRAIN[button.dataset.terrain];
      for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  canvas.addEventListener('pointerdown', event => {
    if (!ready || !event.isPrimary || event.button !== 0 || activePointer !== null) return;
    activePointer = event.pointerId;
    lastCell = null;
    canvas.setPointerCapture(event.pointerId);
    paintPointer(event);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    if (!(event.buttons & 1)) { endStroke(); return; }
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event]) paintPointer(sample);
  });
  canvas.addEventListener('lostpointercapture', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  window.addEventListener('pointerup', event => { if (event.pointerId === activePointer) endStroke(); });
  window.addEventListener('blur', endStroke);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endStroke(); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('keydown', event => {
    if (!ready) return;
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (movement) {
      keyboardCell.x = Math.max(0, Math.min(COLUMNS - 1, keyboardCell.x + movement[0]));
      keyboardCell.y = Math.max(0, Math.min(ROWS - 1, keyboardCell.y + movement[1]));
      updateKeyboardCursor();
    } else if (event.key === ' ' || event.key === 'Enter') paintLine(keyboardCell, keyboardCell);
    else return;
    event.preventDefault();
  });

  async function loadTiles() {
    await Promise.all(['base', 'sand', 'water', 'dirt', 'swamp', 'shallow-water'].map(name => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { images[name] = image; resolve(); };
      image.onerror = () => reject(new Error(`Cannot load ${name} tiles`));
      image.src = `assets/terrain/${name}.png`;
    })));
    context.imageSmoothingEnabled = false;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) drawCell(x, y);
    ready = true;
    surface.setAttribute('aria-busy', 'false');
    for (const button of buttons) button.disabled = false;
    status.textContent = '';
  }

  loadTiles().catch(error => {
    console.error(error);
    status.textContent = 'Не удалось загрузить тайлы. Обновите страницу.';
  });
})();
