(() => {
  'use strict';

  const COLUMNS = 12;
  const ROWS = 12;
  const TILE_SIZE = 48;
  const { TERRAIN } = window.MapData;
  const MOB_TYPES = Object.freeze({
    wolf: { name: 'Волк', team: 'enemy', src: 'assets/mobs/wolf.png', displaySize: { width: 90, height: 108 }, padding: { top: 43, right: 3.6, bottom: 4.777778, left: 3.6 } },
    'black-wolf': { name: 'Чёрный волк', team: 'enemy', src: 'assets/mobs/black-wolf.png', displaySize: { width: 90, height: 108 }, padding: { top: 43, right: 3.6, bottom: 4.777778, left: 3.6 } },
    werewolf: { name: 'Оборотень', team: 'enemy', src: 'assets/mobs/werewolf.png', displaySize: { width: 90, height: 108 }, padding: { top: 4.777778, right: 9.6, bottom: 4.777778, left: 8.4 } },
    hound: { name: 'Гончая', team: 'enemy', src: 'assets/mobs/hound.png', displaySize: { width: 72, height: 86 }, padding: { top: 22.694444, right: 7.2, bottom: 4.777778, left: 6 } },
    'dragon-turtle': { name: 'Драконовая черепаха', team: 'enemy', src: 'assets/mobs/dragon-turtle.png', displaySize: { width: 90, height: 108 }, padding: { top: 44, right: 2, bottom: 5, left: 2 } },
    'hill-giant': { name: 'Холмовой великан', team: 'enemy', src: 'assets/mobs/hill-giant.png', displaySize: { width: 90, height: 108 }, padding: { top: 4.777778, right: 10.8, bottom: 4.777778, left: 9.6 } },
    'giant-toad': { name: 'Гигантская жаба', team: 'enemy', src: 'assets/mobs/giant-toad.png', displaySize: { width: 90, height: 108 }, padding: { top: 44.194444, right: 2.4, bottom: 4.777778, left: 2.4 } },
    specter: { name: 'Спектр', team: 'enemy', src: 'assets/mobs/specter.png', displaySize: { width: 72, height: 86 }, padding: { top: 0, right: 8, bottom: 3, left: 7 } },
    shadow: { name: 'Тень', team: 'enemy', src: 'assets/mobs/shadow.png', displaySize: { width: 72, height: 86 }, padding: { top: 5, right: 13, bottom: 9, left: 11 } },
    'lake-spirit': { name: 'Дух озера', team: 'enemy', src: 'assets/mobs/lake-spirit.png', displaySize: { width: 60, height: 72 }, padding: { top: 4, right: 3, bottom: 4, left: 2 } },
    nymph: { name: 'Нимфа', team: 'enemy', src: 'assets/mobs/nymph.png', displaySize: { width: 72, height: 86 }, padding: { top: 4.777778, right: 3.6, bottom: 4.777778, left: 2.4 } },
    wizard: { name: 'Маг', team: 'ally', src: 'assets/mobs/wizard.png', displaySize: { width: 72, height: 86 }, padding: { top: 4.777778, right: 8.4, bottom: 4.777778, left: 8.4 } },
    monk: { name: 'Монах', team: 'ally', src: 'assets/mobs/monk.png', displaySize: { width: 72, height: 86 }, padding: { top: 7.166667, right: 10.8, bottom: 4.777778, left: 10.8 } },
    warrior: { name: 'Воин', team: 'ally', src: 'assets/mobs/warrior.png', displaySize: { width: 72, height: 86 }, padding: { top: 4, right: 13, bottom: 4, left: 12 } },
    archer: { name: 'Лучник', team: 'ally', src: 'assets/mobs/archer.png', displaySize: { width: 72, height: 86 }, padding: { top: 4, right: 4, bottom: 4, left: 4 } }
  });
  const OBJECT_TYPES = Object.freeze(Object.fromEntries(Object.entries(window.MapObjects.TYPES)
    .map(([type, definition]) => [type, { ...definition, src: `assets/objects/${type}.png` }])));
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
  let mapDocument = window.MapData.createMap();
  let map = mapDocument.tiles;
  let mobs = mapDocument.mobs;
  let objects = mapDocument.objects;
  const canvas = document.getElementById('map');
  // Keep original terrain pixels offscreen, so lighting never compounds on repaint.
  const unlitCanvas = document.createElement('canvas');
  unlitCanvas.width = canvas.width;
  unlitCanvas.height = canvas.height;
  const context = unlitCanvas.getContext('2d');
  const displayContext = canvas.getContext('2d');
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
  const smallObjectPalette = document.getElementById('small-object-palette');
  const objectMode = () => editorMode === 'objects' || editorMode === 'small-objects';
  let lastPointerPoint = null;
  const wallPalette = document.getElementById('wall-palette');
  const lightingPalette = document.getElementById('lighting-palette');
  const ambientInput = document.getElementById('ambient-brightness');
  const brushInput = document.getElementById('cell-brightness');
  const ambientValue = document.getElementById('ambient-value');
  const brushValue = document.getElementById('cell-value');
  const lightingPresets = [...document.querySelectorAll('[data-ambient]')];
  const brushPresets = [...document.querySelectorAll('[data-brush-light]')];
  const resetLightingButton = document.getElementById('reset-lighting');
  const wallButtons = [...document.querySelectorAll('[data-wall]')];
  const levelButton = document.getElementById('toggle-level');
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
  let selectedWall = 'monastery';
  let terrainBrush = 'floor';
  let lightingBrush = 100;
  let selectedMob = 'wolf';
  let selectedAlly = 'wizard';
  let selectedObject = 'crate';
  let editorMode = 'terrain';
  let entityDrag = null;
  let selectedEntity = null;
  let ready = false;
  let currentFileHandle = null;
  let currentFileName = `map-${COLUMNS}x${ROWS}.json`;
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
      let terrain = map[Math.max(0, Math.min(ROWS - 1, y + dy))][Math.max(0, Math.min(COLUMNS - 1, x + dx))];
      // Void and stone floors must not introduce a grass underlay at the edge.
      if (mapDocument.mapType === 'underground' &&
          (terrain === TERRAIN.void || terrainLevels[terrain] === undefined)) terrain = map[y][x];
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

  function drawUnlitCell(x, y) {
    const terrain = map[y][x];
    const variant = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 3;
    if (terrain === TERRAIN.void) {
      context.fillStyle = '#000';
      context.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      const wall = window.MapData.wallInfo(mapDocument, x, y);
      if (wall) context.drawImage(window.UndergroundRenderer.wallTile(wall.style, wall.mask, images[`wall-${wall.style}`]),
        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      return;
    }
    if (terrain === TERRAIN['monastery-floor'] || terrain === TERRAIN['cave-earth']) {
      drawFloor(x, y, terrain, variant);
      return;
    }
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

  function drawFloor(x, y, terrain, variant) {
    const name = terrain === TERRAIN['monastery-floor'] ? 'monastery-floor' : 'cave-earth';
    const underground = mapDocument.mapType === 'underground';
    // Underground floor cells stay completely filled, including at the void boundary.
    let mask = 0;
    for (const [dx, dy, bit] of neighbors) {
      const t = map[Math.max(0, Math.min(ROWS - 1, y + dy))][Math.max(0, Math.min(COLUMNS - 1, x + dx))];
      if (underground ? t !== TERRAIN['cave-earth'] : t === terrain) mask |= bit;
    }
    mask = normalizeMask(mask);
    if (underground && terrain === TERRAIN['cave-earth']) mask = 255;
    if (mask === 255) {
      context.drawImage(images[name], variant * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    } else {
      if (underground) context.drawImage(images['cave-earth'], variant * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE,
        x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      else drawBase(TERRAIN.grass, variant, x, y);
      drawOverlay(`${name}-edges`, mask, x, y);
    }
  }

  function drawLitCell(x, y) {
    const left = x * TILE_SIZE, top = y * TILE_SIZE;
    displayContext.save();
    displayContext.filter = `brightness(${window.MapData.lightAt(mapDocument, x, y)})`;
    displayContext.clearRect(left, top, TILE_SIZE, TILE_SIZE);
    displayContext.drawImage(unlitCanvas, left, top, TILE_SIZE, TILE_SIZE, left, top, TILE_SIZE, TILE_SIZE);
    displayContext.restore();
  }

  function drawCell(x, y) {
    drawUnlitCell(x, y);
    drawLitCell(x, y);
  }

  function lightEntity(entity, cell = entity) {
    if (!entity.element) return;
    entity.element.style.setProperty('--entity-lighting', window.MapObjects.isLit(entity) ? 1 : window.MapData.lightAt(mapDocument, cell.x, cell.y));
  }

  function cacheTorchLight() {
    Object.defineProperty(mapDocument, '_torchCells', { value: window.MapObjects.illuminated(mapDocument), writable: true, configurable: true });
  }

  function renderLighting() {
    cacheTorchLight();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLUMNS; x++) drawLitCell(x, y);
    for (const entity of [...mobs, ...objects]) lightEntity(entity);
  }

  function refreshLightingControls() {
    ambientInput.value = mapDocument.lighting.ambient;
    ambientValue.value = `${mapDocument.lighting.ambient}%`;
    brushInput.value = lightingBrush;
    brushValue.value = `${lightingBrush}%`;
  }

  function setAmbient(value) {
    if (!ready || loadButton.disabled) return;
    endStroke();
    mapDocument.lighting.ambient = value;
    refreshLightingControls();
    renderLighting();
  }

  ambientInput.addEventListener('input', () => setAmbient(Number(ambientInput.value)));
  function setLightingBrush(value) {
    if (!ready || loadButton.disabled) return;
    endStroke();
    lightingBrush = value;
    refreshLightingControls();
  }
  brushInput.addEventListener('input', () => setLightingBrush(Number(brushInput.value)));
  for (const button of brushPresets) button.addEventListener('click', () => setLightingBrush(Number(button.dataset.brushLight)));
  for (const button of lightingPresets) button.addEventListener('click', () => setAmbient(Number(button.dataset.ambient)));
  resetLightingButton.addEventListener('click', () => {
    if (!ready || loadButton.disabled) return;
    endStroke();
    mapDocument.lighting = window.MapData.createLighting();
    lightingBrush = 100;
    refreshLightingControls();
    renderLighting();
  });

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

  function objectDraft(cell, type, except = null) {
    const draft = { type, x: cell.x, y: cell.y };
    if (window.MapObjects.isWallTorch(draft)) {
      const mounts = window.MapObjects.floorMounts(mapDocument, cell.x, cell.y);
      const point = lastPointerPoint ?? { x: (cell.x + .5) * TILE_SIZE, y: (cell.y + .5) * TILE_SIZE };
      const distance = mount => Math.hypot((mount.wallX + .5) * TILE_SIZE + mount.offsetX - point.x,
        (mount.wallY + .5) * TILE_SIZE + mount.offsetY - point.y);
      mounts.sort((a, b) => distance(a) - distance(b));
      const mount = (except && mounts.find(item => item.facing === except.facing)) || mounts[0];
      if (mount) Object.assign(draft, { wallX: mount.wallX, wallY: mount.wallY, facing: mount.facing });
    }
    return draft;
  }

  function canPlace(cell, except = null) {
    const type = except ? (objects.includes(except) ? except.type : null) : (objectMode() ? selectedObject : null);
    if (type) return window.MapObjects.canPlace(mapDocument, objectDraft(cell, type, except), mobs, except);
    return map[cell.y][cell.x] !== TERRAIN.void && !mobAt(cell, except)
      && !objects.some(object => object !== except && OBJECT_TYPES[object.type].blocking && object.x === cell.x && object.y === cell.y);
  }

  function renderObjects() {
    const elements = objects.map(object => {
      if (!object.element) {
        const image = document.createElement('img');
        image.className = 'map-object';
        image.src = `assets/objects/${window.MapObjects.spriteName(object)}.png`;
        image.alt = OBJECT_TYPES[object.type].name;
        image.draggable = false;
        object.element = image;
      }
      const mount = window.MapObjects.isWallTorch(object) ? window.MapObjects.wallMount(mapDocument, object) : null;
      object.element.style.left = `${(mount ? object.wallX : object.x) * TILE_SIZE + (mount?.offsetX ?? 0)}px`;
      object.element.style.top = `${(mount ? object.wallY : object.y) * TILE_SIZE + (mount?.offsetY ?? 0)}px`;
      object.element.dataset.mountKind = mount?.kind ?? '';
      object.element.dataset.mountFacing = mount?.facing ?? '';
      object.element.dataset.type = object.type;
      object.element.dataset.facing = object.facing ?? '';
      setEntitySelected(object, object === selectedEntity);
      object.element.classList.toggle('small-object', OBJECT_TYPES[object.type].category === 'small');
      object.element.dataset.x = object.x;
      object.element.dataset.y = object.y;
      lightEntity(object);
      return object.element;
    });
    objectLayer.replaceChildren(...elements);
    renderLighting();
  }

  function placeObject(cell) {
    if (!canPlace(cell)) return null;
    const object = objectDraft(cell, selectedObject);
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
      lightEntity(mob);
      return mob.element;
    });
    mobLayer.replaceChildren(...elements);
  }

  function placeMob(cell) {
    if (!canPlace(cell)) return null;
    const type = editorMode === 'allies' ? selectedAlly : selectedMob;
    const mob = { type, team: MOB_TYPES[type].team, x: cell.x, y: cell.y };
    mobs.push(mob);
    renderMobs();
    return mob;
  }

  function setEntitySelected(entity, selected) {
    entity.element.classList.toggle('selected', selected);
    if (window.MapObjects.isWallTorch(entity)) entity.element.style.clipPath = `inset(${selected ? 14 : 15}px)`;
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
    closeMobMenu();
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
    lastPointerPoint = pointFromPointer(event);
    return cellFromPoint(lastPointerPoint);
  }

  function showPlacementTarget(cell, except = null) {
    dropTarget.hidden = !cell;
    if (!cell) return;
    dropTarget.style.left = `${cell.x * TILE_SIZE}px`;
    dropTarget.style.top = `${cell.y * TILE_SIZE}px`;
    dropTarget.dataset.valid = String(canPlace(cell, except));
  }

  function updatePlacementHover(event) {
    if (!ready || editorMode === 'terrain' || editorMode === 'lighting' || !event.isPrimary || event.pointerType === 'touch') return;
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
    if (inside) lightEntity(entityDrag.entity, target);
    showPlacementTarget(inside ? target : null, entityDrag.entity);
    return inside ? target : null;
  }

  function setTerrain(x, y, terrain, dirty) {
    if (map[y][x] === terrain) return;
    if (terrain === TERRAIN.void && isOccupied({ x, y })) {
      status.textContent = 'Сначала уберите существо или объект с этой клетки.';
      return;
    }
    const previous = map[y][x];
    map[y][x] = terrain;
    const invalidObject = objects.some(object => !window.MapObjects.canPlace(mapDocument, object, mobs, object));
    map[y][x] = previous;
    if (invalidObject) { status.textContent = 'Сначала перенесите объект, которому мешает изменение поверхности.'; return; }
    const level = mapDocument;
    if (level.wallStyles && terrain !== TERRAIN.void) {
      level.wallStyles[y][x] = selectedWall;
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < COLUMNS && ny >= 0 && ny < ROWS &&
            map[ny][nx] === TERRAIN.void && !window.MapData.wallInfo(level, nx, ny)) level.wallStyles[ny][nx] = selectedWall;
      }
    }
    map[y][x] = terrain;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(ROWS - 1, y + 1); yy++) {
      for (let xx = Math.max(0, x - 1); xx <= Math.min(COLUMNS - 1, x + 1); xx++) dirty.add(yy * COLUMNS + xx);
    }
  }

  function paintCell(x, y, dirty) {
    if (editorMode === 'lighting') {
      if (mapDocument._torchCells?.has(`${x},${y}`)) return;
      if (mapDocument.lighting.cells[y][x] !== lightingBrush) {
        mapDocument.lighting.cells[y][x] = lightingBrush;
        dirty.add(y * COLUMNS + x);
      }
      return;
    }
    if (terrainBrush === 'wall' && mapDocument.mapType === 'underground') {
      const level = mapDocument;
      if (window.MapData.wallInfo(level, x, y)) {
        level.wallStyles[y][x] = selectedWall;
        dirty.add(y * COLUMNS + x);
      }
      return;
    }
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
    for (const index of dirty) {
      const x = index % COLUMNS, y = Math.floor(index / COLUMNS);
      if (editorMode === 'lighting') drawLitCell(x, y);
      else drawCell(x, y);
    }
    if (editorMode !== 'lighting' && dirty.size) renderObjects();
    if (editorMode === 'lighting') for (const entity of [...mobs, ...objects]) {
      if (dirty.has(entity.y * COLUMNS + entity.x)) lightEntity(entity);
    }
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

  function refreshPalette() {
    const underground = mapDocument.mapType === 'underground';
    surface.dataset.mode = editorMode;
    surface.dataset.level = mapDocument.mapType;
    terrainPalette.hidden = editorMode !== 'terrain';
    wallPalette.hidden = !underground || editorMode !== 'terrain';
    mobPalette.hidden = editorMode !== 'mobs';
    allyPalette.hidden = editorMode !== 'allies';
    objectPalette.hidden = editorMode !== 'objects';
    smallObjectPalette.hidden = editorMode !== 'small-objects';
    lightingPalette.hidden = editorMode !== 'lighting';
    for (const button of buttons) {
      button.hidden = button.dataset.terrain === 'void' && !underground;
      button.setAttribute('aria-pressed', String(terrainBrush === 'floor' && TERRAIN[button.dataset.terrain] === selectedTerrain));
    }
    for (const button of objectButtons) button.setAttribute('aria-pressed', String(button.dataset.object === selectedObject));
    for (const button of wallButtons) button.setAttribute('aria-pressed', String(button.dataset.wall === selectedWall));
    const title = { terrain: 'Террейн', mobs: 'Враги', allies: 'Союзники', objects: 'Массивные объекты', 'small-objects': 'Небольшие объекты', lighting: 'Освещение' }[editorMode];
    paletteTitle.textContent = underground ? `${title} — под землёй` : title;
    levelButton.setAttribute('aria-pressed', String(underground));
    levelButton.setAttribute('aria-label', underground ? 'Под землёй' : 'На земле');
    levelButton.title = underground ? 'Создать карту на земле — очистить текущую' : 'Создать карту под землёй — очистить текущую';
    canvas.setAttribute('aria-label', `Карта 12 на 12 клеток — ${underground ? 'под землёй' : 'на земле'}`);
  }

  function activateMap(nextMap) {
    endStroke();
    selectEntity(null);
    currentFileHandle = null;
    currentFileName = `map-${COLUMNS}x${ROWS}.json`;
    mapDocument = nextMap;
    map = nextMap.tiles;
    mobs = nextMap.mobs;
    objects = nextMap.objects;
    cacheTorchLight();
    selectedTerrain = nextMap.mapType === 'underground' ? TERRAIN['monastery-floor'] : TERRAIN.grass;
    terrainBrush = 'floor';
    lightingBrush = 100;
    refreshLightingControls();
    refreshPalette();
    renderMap();
    renderObjects();
    renderMobs();
  }

  levelButton.addEventListener('click', () => {
    if (!ready || loadButton.disabled) return;
    activateMap(window.MapData.createMap(mapDocument.mapType === 'surface' ? 'underground' : 'surface'));
    status.textContent = '';
  });

  const jsonFileTypes = [{ description: 'Карта JSON', accept: { 'application/json': ['.json'] } }];
  function downloadMap(text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = currentFileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    status.textContent = 'Карта сохранена скачиванием.';
  }

  saveButton.addEventListener('click', async () => {
    if (!ready || saveButton.disabled || loadButton.disabled) return;
    endStroke();
    saveButton.disabled = loadButton.disabled = true;
    let stream;
    try {
      const text = JSON.stringify(window.MapData.serialize(mapDocument, OBJECT_TYPES), null, 2) + '\n';
      let handle = currentFileHandle;
      if (handle) {
        if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
          status.textContent = 'Не удалось сохранить карту: доступ на запись не разрешён.';
          return;
        }
      } else if (typeof window.showSaveFilePicker === 'function') {
        try {
          handle = await window.showSaveFilePicker({ suggestedName: currentFileName, types: jsonFileTypes });
        } catch (error) {
          if (!['SecurityError', 'NotSupportedError'].includes(error.name)) throw error;
        }
      }
      if (!handle) { downloadMap(text); return; }
      stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
      stream = null;
      currentFileHandle = handle;
      currentFileName = handle.name;
      status.textContent = `Карта сохранена: ${currentFileName}.`;
    } catch (error) {
      if (stream) { try { await stream.abort(); } catch {} }
      if (error.name !== 'AbortError') status.textContent = `Не удалось сохранить карту: ${error.message}`;
    } finally {
      saveButton.disabled = loadButton.disabled = false;
    }
  });

  loadButton.addEventListener('click', async () => {
    if (!ready || loadButton.disabled) return;
    endStroke();
    if (typeof window.showOpenFilePicker !== 'function') { fileInput.click(); return; }
    saveButton.disabled = loadButton.disabled = true;
    try {
      const [handle] = await window.showOpenFilePicker({ multiple: false, types: jsonFileTypes });
      const file = await handle.getFile();
      saveButton.disabled = loadButton.disabled = false;
      await loadMapFile(file, handle);
    } catch (error) {
      if (['SecurityError', 'NotSupportedError'].includes(error.name)) fileInput.click();
      else if (error.name !== 'AbortError') status.textContent = `Не удалось открыть карту: ${error.message}`;
    } finally {
      saveButton.disabled = loadButton.disabled = false;
    }
  });

  async function loadMapFile(file, handle = null) {
    if (!ready || !file || loadButton.disabled) return;
    endStroke();
    loadButton.disabled = true;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    for (const control of [ambientInput, brushInput, resetLightingButton, ...lightingPresets, ...brushPresets]) control.disabled = true;
    try {
      const data = JSON.parse(await file.text());
      const loaded = window.MapData.readDocument(data, MOB_TYPES, OBJECT_TYPES);
      // Validate the entire file before replacing the current map.
      endStroke();
      selectEntity(null);
      activateMap(loaded);
      currentFileHandle = handle;
      currentFileName = file.name;
      status.textContent = data.version === 5 ? 'Загружен выбранный уровень карты старого формата.' : 'Карта загружена.';
    } catch (error) {
      status.textContent = error instanceof SyntaxError
        ? 'Не удалось загрузить карту: файл не содержит корректный JSON.'
        : `Не удалось загрузить карту: ${error.message}`;
    } finally {
      fileInput.value = '';
      loadButton.disabled = false;
      saveButton.disabled = false;
      deleteButton.disabled = !selectedEntity;
      for (const control of [ambientInput, brushInput, resetLightingButton, ...lightingPresets, ...brushPresets]) control.disabled = false;
    }
  }
  fileInput.addEventListener('change', () => loadMapFile(fileInput.files[0]));

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
      if (editorMode === 'objects') selectedObject = 'crate';
      if (editorMode === 'small-objects' && OBJECT_TYPES[selectedObject].category !== 'small') selectedObject = 'torch';
      if (editorMode === 'terrain' || editorMode === 'lighting') selectEntity(null);
      refreshPalette();
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
      terrainBrush = 'floor';
      refreshPalette();
    });
  }

  for (const button of wallButtons) {
    button.addEventListener('click', () => {
      endStroke();
      selectedWall = button.dataset.wall;
      terrainBrush = 'wall';
      refreshPalette();
    });
  }

  surface.addEventListener('pointerdown', event => {
    if (!ready || loadButton.disabled || !event.isPrimary || event.button !== 0 || activePointer !== null) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    activePointer = event.pointerId;
    lastCell = null;
    surface.setPointerCapture(event.pointerId);
    const placingTorchOnMob = editorMode === 'small-objects' && window.MapObjects.isTorch({ type: selectedObject }) && !objectAt(cell)
      && !objects.some(item => item.element === event.target);
    const placingMobOnTorch = (editorMode === 'mobs' || editorMode === 'allies') && !mobAt(cell)
      && objectAt(cell) && !OBJECT_TYPES[objectAt(cell).type].blocking;
    const clicked = placingTorchOnMob || placingMobOnTorch ? null
      : mobs.find(item => item.element === event.target) ?? objects.find(item => item.element === event.target) ?? mobAt(cell) ?? objectAt(cell);
    if ((editorMode === 'terrain' || editorMode === 'lighting') && !clicked) {
      paintPointer(event);
    } else {
      const entity = clicked ?? (objectMode() ? placeObject(cell) : placeMob(cell));
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
    if (editorMode !== 'terrain' && editorMode !== 'lighting') { updatePlacementHover(event); return; }
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
      if (target && canPlace(target, entityDrag.entity)) {
        if (objects.includes(entityDrag.entity)) Object.assign(entityDrag.entity, objectDraft(target, entityDrag.entity.type, entityDrag.entity));
        else { entityDrag.entity.x = target.x; entityDrag.entity.y = target.y; }
      }
    }
    endStroke();
    updatePlacementHover(event);
  });
  window.addEventListener('blur', endStroke);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endStroke(); });
  const mobMenu = document.createElement('div');
  mobMenu.className = 'mob-context-menu';
  mobMenu.hidden = true;
  mobMenu.setAttribute('role', 'menu');
  const teamOption = document.createElement('button');
  teamOption.type = 'button';
  teamOption.setAttribute('role', 'menuitem');
  mobMenu.appendChild(teamOption);
  document.body.appendChild(mobMenu);
  let contextMob = null;
  function closeMobMenu() { mobMenu.hidden = true; contextMob = null; }
  teamOption.addEventListener('click', () => {
    if (contextMob && mobs.includes(contextMob) && !['wizard', 'monk', 'warrior', 'archer'].includes(contextMob.type)) {
      contextMob.team = contextMob.team === 'ally' ? 'enemy' : 'ally';
      renderMobs();
    }
    closeMobMenu();
  });
  surface.addEventListener('contextmenu', event => {
    event.preventDefault();
    closeMobMenu();
    if (!ready || loadButton.disabled) return;
    const cell = cellFromPointer(event);
    const mob = mobs.find(item => item.element === event.target) ?? (cell && mobAt(cell));
    if (!mob || ['wizard', 'monk', 'warrior', 'archer'].includes(mob.type)) return;
    endStroke();
    selectEntity(mob);
    contextMob = mob;
    teamOption.textContent = `Поменять сторону: ${mob.team === 'ally' ? 'враги' : 'союзники'}`;
    mobMenu.hidden = false;
    mobMenu.style.left = `${Math.max(0, Math.min(event.clientX, innerWidth - mobMenu.offsetWidth))}px`;
    mobMenu.style.top = `${Math.max(0, Math.min(event.clientY, innerHeight - mobMenu.offsetHeight))}px`;
    teamOption.focus();
  });
  document.addEventListener('pointerdown', event => { if (!mobMenu.contains(event.target)) closeMobMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMobMenu(); });
  window.addEventListener('blur', closeMobMenu);
  window.addEventListener('resize', closeMobMenu);
  window.addEventListener('scroll', closeMobMenu, true);
  deleteButton.addEventListener('click', deleteSelection);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Delete') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (deleteSelection()) event.preventDefault();
  });
  canvas.addEventListener('keydown', event => {
    if (!ready || loadButton.disabled) return;
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (movement) {
      keyboardCell.x = Math.max(0, Math.min(COLUMNS - 1, keyboardCell.x + movement[0]));
      keyboardCell.y = Math.max(0, Math.min(ROWS - 1, keyboardCell.y + movement[1]));
      updateKeyboardCursor();
    } else if (event.key === ' ' || event.key === 'Enter') {
      if (editorMode === 'terrain' || editorMode === 'lighting') paintLine(keyboardCell, keyboardCell);
      else if (editorMode === 'mobs' || editorMode === 'allies') placeMob(keyboardCell);
      else placeObject(keyboardCell);
    }
    else return;
    event.preventDefault();
  });

  async function loadTiles() {
    const assets = [
      ...['base', 'sand', 'water', 'dirt', 'swamp', 'shallow-water'].map(name => [name, `assets/terrain/${name}.png`]),
      ...['monastery-floor', 'cave-earth', 'monastery-floor-edges', 'cave-earth-edges', 'wall-monastery', 'wall-dungeon']
        .map(name => [name, `assets/terrain/${name}.png`]),
      ...Object.entries(MOB_TYPES).map(([name, template]) => [name, template.src]),
      ...Object.entries(OBJECT_TYPES).map(([name, template]) => [name, template.src]),
      ['wall-torch-top', 'assets/objects/wall-torch-top.png'],
      ['unlit-wall-torch-top', 'assets/objects/unlit-wall-torch-top.png']
    ];
    await Promise.all(assets.map(([name, src]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { images[name] = image; resolve(); };
      image.onerror = () => reject(new Error(`Cannot load ${name} tiles`));
      image.src = src;
    })));
    context.imageSmoothingEnabled = false;
    displayContext.imageSmoothingEnabled = false;
    activateMap(mapDocument);
    ready = true;
    surface.setAttribute('aria-busy', 'false');
    for (const button of buttons) button.disabled = false;
    for (const button of [...modeButtons, ...mobButtons, ...allyButtons, ...objectButtons]) button.disabled = false;
    for (const button of wallButtons) button.disabled = false;
    levelButton.disabled = false;
    for (const control of [ambientInput, brushInput, resetLightingButton, ...lightingPresets, ...brushPresets]) control.disabled = false;
    saveButton.disabled = false;
    loadButton.disabled = false;
    status.textContent = '';
    window.MapLibrary.mount({
      host: document.querySelector('.editor-toolbar'), storageKey: 'editor',
      isBusy: () => !ready || loadButton.disabled, onLoad: loadMapFile
    });
  }

  loadTiles().catch(error => {
    console.error(error);
    status.textContent = 'Не удалось загрузить ресурсы карты. Обновите страницу.';
  });
})();
