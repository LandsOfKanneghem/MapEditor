(() => {
  'use strict';

  const COLUMNS = 12;
  const ROWS = 12;
  const TILE_SIZE = 48;
  const TERRAIN = Object.freeze({ grass: 0, sand: 1, 'deep-water': 2, dirt: 3, swamp: 4, 'shallow-water': 5 });
  const terrainNames = Object.fromEntries(Object.entries(TERRAIN).map(([name, id]) => [id, name]));
  const MOB_TYPES = Object.freeze({
    wolf: { name: 'Волк', team: 'enemy', src: 'assets/mobs/wolf.png', displaySize: { width: 90, height: 108 }, padding: { top: 36, right: 3, bottom: 4, left: 3 } },
    'hill-giant': { name: 'Холмовой великан', team: 'enemy', src: 'assets/mobs/hill-giant.png', displaySize: { width: 90, height: 108 }, padding: { top: 4, right: 2, bottom: 4, left: 2 } },
    'lake-spirit': { name: 'Дух озера', team: 'enemy', src: 'assets/mobs/lake-spirit.png', displaySize: { width: 60, height: 72 }, padding: { top: 4, right: 3, bottom: 4, left: 2 } },
    nymph: { name: 'Нимфа', team: 'enemy', src: 'assets/mobs/nymph.png', displaySize: { width: 72, height: 86 }, padding: { top: 4, right: 3, bottom: 4, left: 2 } },
    wizard: { name: 'Маг', team: 'ally', src: 'assets/mobs/wizard.png', displaySize: { width: 72, height: 86 }, padding: { top: 4, right: 7, bottom: 4, left: 7 } },
    monk: { name: 'Монах', team: 'ally', src: 'assets/mobs/monk.png', displaySize: { width: 72, height: 86 }, padding: { top: 6, right: 9, bottom: 4, left: 9 } }
  });
  const OBJECT_TYPES = Object.freeze({
    crate: { name: 'Ящик', src: 'assets/objects/crate.png', blocking: true, interactive: false }
  });
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
  const mobs = [];
  const objects = [];
  const canvas = document.getElementById('map');
  const context = canvas.getContext('2d');
  const surface = document.querySelector('.map-surface');
  const buttons = [...document.querySelectorAll('[data-terrain]')];
  const mobButtons = [...document.querySelectorAll('[data-mob]')];
  const allyButtons = [...document.querySelectorAll('[data-ally]')];
  const objectButtons = [...document.querySelectorAll('[data-object]')];
  const modeButtons = [...document.querySelectorAll('[data-mode].toolbar-button')];
  const terrainPalette = document.getElementById('terrain-palette');
  const mobPalette = document.getElementById('mob-palette');
  const allyPalette = document.getElementById('ally-palette');
  const objectPalette = document.getElementById('object-palette');
  const paletteTitle = document.getElementById('terrain-title');
  const mobLayer = document.getElementById('mob-layer');
  const objectLayer = document.getElementById('object-layer');
  const dropTarget = document.getElementById('mob-drop-target');
  const status = document.getElementById('status');
  const cursor = document.getElementById('keyboard-cursor');
  const saveButton = document.getElementById('save-map');
  const loadButton = document.getElementById('load-map');
  const fileInput = document.getElementById('map-file');
  const deleteButton = document.getElementById('delete-selection');
  const images = {};
  let selectedTerrain = TERRAIN.grass;
  let selectedMob = 'wolf';
  let selectedAlly = 'wizard';
  let selectedObject = 'crate';
  let editorMode = 'terrain';
  let entityDrag = null;
  let selectedEntity = null;
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

  function renderMap() {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) drawCell(x, y);
  }

  function mobAt(cell, except = null) {
    return mobs.find(mob => mob !== except && mob.x === cell.x && mob.y === cell.y);
  }

  function objectAt(cell, except = null) {
    return objects.find(object => object !== except && object.x === cell.x && object.y === cell.y);
  }

  function isOccupied(cell, except = null) {
    return Boolean(mobAt(cell, except) || objectAt(cell, except));
  }

  function renderObjects() {
    const elements = objects.map(object => {
      if (!object.element) {
        const image = document.createElement('img');
        image.className = 'map-object';
        image.src = OBJECT_TYPES[object.type].src;
        image.alt = OBJECT_TYPES[object.type].name;
        image.draggable = false;
        object.element = image;
      }
      object.element.style.left = `${object.x * TILE_SIZE}px`;
      object.element.style.top = `${object.y * TILE_SIZE}px`;
      object.element.dataset.x = object.x;
      object.element.dataset.y = object.y;
      return object.element;
    });
    objectLayer.replaceChildren(...elements);
  }

  function placeObject(cell) {
    if (isOccupied(cell)) return null;
    const object = { type: selectedObject, x: cell.x, y: cell.y };
    objects.push(object);
    renderObjects();
    return object;
  }

  function renderMobs() {
    const elements = [...mobs].sort((a, b) => a.y - b.y || a.x - b.x).map(mob => {
      const template = MOB_TYPES[mob.type];
      const { width, height } = template.displaySize;
      if (!mob.element) {
        const image = document.createElement('img');
        image.className = 'map-mob';
        image.src = template.src;
        image.alt = template.name;
        image.title = template.name;
        image.draggable = false;
        mob.element = image;
      }
      mob.element.style.width = `${width}px`;
      mob.element.style.height = `${height}px`;
      setEntitySelected(mob, mob === selectedEntity);
      // Use the same anchor in every cell; the mob layer clips the map edges.
      mob.element.style.left = `${(mob.x + .5) * TILE_SIZE - width / 2}px`;
      mob.element.style.top = `${(mob.y + 1) * TILE_SIZE - height}px`;
      mob.element.style.zIndex = mob.y + 1;
      mob.element.dataset.x = mob.x;
      mob.element.dataset.y = mob.y;
      mob.element.dataset.team = mob.team;
      return mob.element;
    });
    mobLayer.replaceChildren(...elements);
  }

  function placeMob(cell) {
    if (isOccupied(cell)) return null;
    const type = editorMode === 'allies' ? selectedAlly : selectedMob;
    const mob = { type, team: MOB_TYPES[type].team, x: cell.x, y: cell.y };
    mobs.push(mob);
    renderMobs();
    return mob;
  }

  function setEntitySelected(entity, selected) {
    entity.element.classList.toggle('selected', selected);
    const template = MOB_TYPES[entity.type];
    if (template) {
      const { padding, displaySize } = template;
      const scaleX = displaySize.width / images[entity.type].naturalWidth;
      const scaleY = displaySize.height / images[entity.type].naturalHeight;
      const inset = selected ? 2 : 0;
      // Leave room for the contour without making transparent margins clickable.
      entity.element.style.clipPath = `inset(${padding.top * scaleY - inset}px ${padding.right * scaleX - inset}px ${padding.bottom * scaleY - inset}px ${padding.left * scaleX - inset}px)`;
    }
  }

  function selectEntity(entity) {
    if (selectedEntity) setEntitySelected(selectedEntity, false);
    selectedEntity = entity;
    if (selectedEntity) setEntitySelected(selectedEntity, true);
    deleteButton.disabled = !selectedEntity || !ready || loadButton.disabled;
  }

  function deleteSelection() {
    if (deleteButton.disabled || !selectedEntity) return false;
    endStroke();
    const entries = mobs.includes(selectedEntity) ? mobs : objects;
    const index = entries.indexOf(selectedEntity);
    selectEntity(null);
    if (index < 0) return false;
    entries.splice(index, 1);
    if (entries === mobs) renderMobs();
    else renderObjects();
    return true;
  }

  function endStroke() {
    const pointer = activePointer;
    activePointer = null;
    lastCell = null;
    if (entityDrag) {
      const { entity, render } = entityDrag;
      entity.element.classList.remove('dragging');
      entity.element.style.transform = '';
      entity.element.style.zIndex = '';
      entityDrag = null;
      render();
    }
    dropTarget.hidden = true;
    surface.classList.remove('dragging');
    objectLayer.classList.remove('dragging');
    if (pointer !== null && surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
  }

  function pointFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * COLUMNS * TILE_SIZE / rect.width,
      y: (event.clientY - rect.top) * ROWS * TILE_SIZE / rect.height
    };
  }

  function cellFromPoint(point) {
    const x = Math.floor(point.x / TILE_SIZE), y = Math.floor(point.y / TILE_SIZE);
    return x >= 0 && x < COLUMNS && y >= 0 && y < ROWS ? { x, y } : null;
  }

  function cellFromPointer(event) {
    return cellFromPoint(pointFromPointer(event));
  }

  function showPlacementTarget(cell, except = null) {
    dropTarget.hidden = !cell;
    if (!cell) return;
    dropTarget.style.left = `${cell.x * TILE_SIZE}px`;
    dropTarget.style.top = `${cell.y * TILE_SIZE}px`;
    dropTarget.dataset.valid = String(!isOccupied(cell, except));
  }

  function updatePlacementHover(event) {
    if (!ready || editorMode === 'terrain' || !event.isPrimary || event.pointerType === 'touch') return;
    const cell = cellFromPointer(event);
    const hovered = mobs.find(mob => mob.element === event.target) ?? objects.find(object => object.element === event.target) ??
      (cell ? mobAt(cell) ?? objectAt(cell) : null);
    showPlacementTarget(hovered && hovered === selectedEntity ? null : hovered ? { x: hovered.x, y: hovered.y } : cell);
  }

  function updateEntityDrag(event) {
    const point = pointFromPointer(event);
    const dx = point.x - entityDrag.start.x, dy = point.y - entityDrag.start.y;
    entityDrag.entity.element.style.transform = `translate(${dx}px, ${dy}px)`;
    const target = cellFromPoint({
      x: (entityDrag.entity.x + .5) * TILE_SIZE + dx,
      y: (entityDrag.entity.y + .5) * TILE_SIZE + dy
    });
    const inside = cellFromPoint(point) !== null && target !== null;
    showPlacementTarget(inside ? target : null, entityDrag.entity);
    return inside ? target : null;
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

  function readMapData(data) {
    if (data?.format !== 'kanneghem-map' || ![1, 2, 3, 4].includes(data.version)) {
      throw new Error('Неподдерживаемый формат или версия карты.');
    }
    if (data.width !== COLUMNS || data.height !== ROWS) {
      throw new Error(`Размер карты должен быть ${COLUMNS}×${ROWS}.`);
    }
    if (!Array.isArray(data.tiles) || data.tiles.length !== ROWS ||
        data.tiles.some(row => !Array.isArray(row) || row.length !== COLUMNS)) {
      throw new Error('Неверное количество строк или клеток карты.');
    }
    const tiles = data.tiles.map(row => row.map(name => {
      if (typeof name !== 'string' || !Object.hasOwn(TERRAIN, name)) {
        throw new Error('В карте указан неизвестный тип поверхности.');
      }
      return TERRAIN[name];
    }));
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        const terrain = tiles[y][x];
        const right = tiles[y][x + 1], below = tiles[y + 1]?.[x];
        if (isWater(terrain) && ((isWater(right) && right !== terrain) || (isWater(below) && below !== terrain))) {
          throw new Error('В одном водоёме не могут смешиваться мелководье и глубоководье.');
        }
      }
    }
    const savedMobs = data.version === 1 ? [] : data.mobs;
    if (!Array.isArray(savedMobs) || savedMobs.length > COLUMNS * ROWS) {
      throw new Error('Неверный список мобов карты.');
    }
    const occupied = new Set();
    const loadedMobs = savedMobs.map(mob => {
      if (!mob || typeof mob.type !== 'string' || !Object.hasOwn(MOB_TYPES, mob.type) ||
          !Number.isInteger(mob.x) || !Number.isInteger(mob.y) ||
          mob.x < 0 || mob.x >= COLUMNS || mob.y < 0 || mob.y >= ROWS) {
        throw new Error('В карте указан неизвестный моб или неверная клетка.');
      }
      const position = mob.y * COLUMNS + mob.x;
      if (occupied.has(position)) throw new Error('На одной клетке не может быть несколько мобов.');
      occupied.add(position);
      const team = data.version < 4 ? MOB_TYPES[mob.type].team : mob.team;
      if (team !== MOB_TYPES[mob.type].team) throw new Error('Неверная сторона существа: ally или enemy.');
      return { type: mob.type, team, x: mob.x, y: mob.y };
    });
    const savedObjects = data.version < 3 ? [] : data.objects;
    if (!Array.isArray(savedObjects) || savedObjects.length > COLUMNS * ROWS) {
      throw new Error('Неверный список объектов карты.');
    }
    const loadedObjects = savedObjects.map(object => {
      if (!object || typeof object.type !== 'string' || !Object.hasOwn(OBJECT_TYPES, object.type) ||
          !Number.isInteger(object.x) || !Number.isInteger(object.y) ||
          object.x < 0 || object.x >= COLUMNS || object.y < 0 || object.y >= ROWS ||
          object.blocking !== true || object.interactive !== false) {
        throw new Error('В карте указан неизвестный объект или неверные параметры препятствия.');
      }
      const position = object.y * COLUMNS + object.x;
      if (occupied.has(position)) throw new Error('Клетка объекта уже занята мобом или другим объектом.');
      occupied.add(position);
      return { type: object.type, x: object.x, y: object.y };
    });
    return { tiles, mobs: loadedMobs, objects: loadedObjects };
  }

  saveButton.addEventListener('click', () => {
    if (!ready) return;
    endStroke();
    const data = {
      format: 'kanneghem-map',
      version: 4,
      width: COLUMNS,
      height: ROWS,
      tiles: map.map(row => row.map(terrain => terrainNames[terrain])),
      mobs: mobs.map(({ type, team, x, y }) => ({ type, team, x, y })),
      objects: objects.map(({ type, x, y }) => ({
        type, x, y, blocking: OBJECT_TYPES[type].blocking, interactive: OBJECT_TYPES[type].interactive
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `map-${COLUMNS}x${ROWS}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = 'Карта сохранена.';
  });

  loadButton.addEventListener('click', () => {
    endStroke();
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!ready || !file || loadButton.disabled) return;
    endStroke();
    loadButton.disabled = true;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    try {
      const loaded = readMapData(JSON.parse(await file.text()));
      // Validate the entire file before replacing the current map.
      endStroke();
      selectEntity(null);
      map.splice(0, ROWS, ...loaded.tiles);
      mobs.splice(0, mobs.length, ...loaded.mobs);
      objects.splice(0, objects.length, ...loaded.objects);
      renderMap();
      renderObjects();
      renderMobs();
      status.textContent = 'Карта загружена.';
    } catch (error) {
      status.textContent = error instanceof SyntaxError
        ? 'Не удалось загрузить карту: файл не содержит корректный JSON.'
        : `Не удалось загрузить карту: ${error.message}`;
    } finally {
      fileInput.value = '';
      loadButton.disabled = false;
      saveButton.disabled = false;
      deleteButton.disabled = !selectedEntity;
    }
  });

  const grid = document.getElementById('map-grid');
  const gridButton = document.getElementById('toggle-grid');
  gridButton.addEventListener('click', () => {
    grid.hidden = !grid.hidden;
    gridButton.setAttribute('aria-pressed', String(!grid.hidden));
  });

  for (const button of modeButtons) {
    button.addEventListener('click', () => {
      endStroke();
      editorMode = button.dataset.mode;
      if (editorMode === 'terrain') selectEntity(null);
      surface.dataset.mode = editorMode;
      terrainPalette.hidden = editorMode !== 'terrain';
      mobPalette.hidden = editorMode !== 'mobs';
      allyPalette.hidden = editorMode !== 'allies';
      objectPalette.hidden = editorMode !== 'objects';
      paletteTitle.textContent = { terrain: 'Террейн', mobs: 'Враги', allies: 'Союзники', objects: 'Объекты' }[editorMode];
      for (const item of modeButtons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  for (const button of mobButtons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedMob = button.dataset.mob;
      for (const item of mobButtons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  for (const button of allyButtons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedAlly = button.dataset.ally;
      for (const item of allyButtons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  for (const button of objectButtons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedObject = button.dataset.object;
      for (const item of objectButtons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedTerrain = TERRAIN[button.dataset.terrain];
      for (const item of buttons) item.setAttribute('aria-pressed', String(item === button));
    });
  }

  surface.addEventListener('pointerdown', event => {
    if (!ready || !event.isPrimary || event.button !== 0 || activePointer !== null) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    activePointer = event.pointerId;
    lastCell = null;
    surface.setPointerCapture(event.pointerId);
    const clicked = mobs.find(item => item.element === event.target) ?? objects.find(item => item.element === event.target) ??
      mobAt(cell) ?? objectAt(cell);
    if (editorMode === 'terrain' && !clicked) {
      paintPointer(event);
    } else {
      const entity = clicked ?? (editorMode === 'objects' ? placeObject(cell) : placeMob(cell));
      selectEntity(entity);
      if (!entity) {
        endStroke();
        showPlacementTarget(entity ? null : cell);
        event.preventDefault();
        return;
      }
      const editingObjects = objects.includes(entity);
      entityDrag = { entity, start: pointFromPointer(event), render: editingObjects ? renderObjects : renderMobs };
      entity.element.classList.add('dragging');
      entity.element.style.zIndex = ROWS + 1;
      objectLayer.classList.toggle('dragging', editingObjects);
      surface.classList.add('dragging');
      keyboardCell = { x: entity.x, y: entity.y };
      updateKeyboardCursor();
      updateEntityDrag(event);
    }
    event.preventDefault();
  });
  surface.addEventListener('pointermove', event => {
    if (activePointer === null) { updatePlacementHover(event); return; }
    if (event.pointerId !== activePointer) return;
    if (!(event.buttons & 1)) { endStroke(); return; }
    if (entityDrag) { updateEntityDrag(event); return; }
    if (editorMode !== 'terrain') { updatePlacementHover(event); return; }
    const samples = event.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [event]) paintPointer(sample);
  });
  surface.addEventListener('pointerenter', event => {
    if (activePointer === null) updatePlacementHover(event);
  });
  surface.addEventListener('pointerleave', () => {
    if (!entityDrag) dropTarget.hidden = true;
  });
  surface.addEventListener('lostpointercapture', event => {
    if (event.pointerId === activePointer) endStroke();
  });
  surface.addEventListener('pointercancel', endStroke);
  window.addEventListener('pointerup', event => {
    if (event.pointerId !== activePointer) return;
    if (entityDrag) {
      const target = updateEntityDrag(event);
      if (target && !isOccupied(target, entityDrag.entity)) {
        entityDrag.entity.x = target.x;
        entityDrag.entity.y = target.y;
      }
    }
    endStroke();
    updatePlacementHover(event);
  });
  window.addEventListener('blur', endStroke);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endStroke(); });
  surface.addEventListener('contextmenu', event => event.preventDefault());
  deleteButton.addEventListener('click', deleteSelection);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Delete') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (deleteSelection()) event.preventDefault();
  });
  canvas.addEventListener('keydown', event => {
    if (!ready) return;
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (movement) {
      keyboardCell.x = Math.max(0, Math.min(COLUMNS - 1, keyboardCell.x + movement[0]));
      keyboardCell.y = Math.max(0, Math.min(ROWS - 1, keyboardCell.y + movement[1]));
      updateKeyboardCursor();
    } else if (event.key === ' ' || event.key === 'Enter') {
      if (editorMode === 'terrain') paintLine(keyboardCell, keyboardCell);
      else if (editorMode === 'mobs' || editorMode === 'allies') placeMob(keyboardCell);
      else placeObject(keyboardCell);
    }
    else return;
    event.preventDefault();
  });

  async function loadTiles() {
    const assets = [
      ...['base', 'sand', 'water', 'dirt', 'swamp', 'shallow-water'].map(name => [name, `assets/terrain/${name}.png`]),
      ...Object.entries(MOB_TYPES).map(([name, template]) => [name, template.src]),
      ...Object.entries(OBJECT_TYPES).map(([name, template]) => [name, template.src])
    ];
    await Promise.all(assets.map(([name, src]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { images[name] = image; resolve(); };
      image.onerror = () => reject(new Error(`Cannot load ${name} tiles`));
      image.src = src;
    })));
    context.imageSmoothingEnabled = false;
    renderMap();
    ready = true;
    surface.setAttribute('aria-busy', 'false');
    for (const button of buttons) button.disabled = false;
    for (const button of [...modeButtons, ...mobButtons, ...allyButtons, ...objectButtons]) button.disabled = false;
    saveButton.disabled = false;
    loadButton.disabled = false;
    status.textContent = '';
  }

  loadTiles().catch(error => {
    console.error(error);
    status.textContent = 'Не удалось загрузить ресурсы карты. Обновите страницу.';
  });
})();
