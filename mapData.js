/* A document contains one map, with a surface or underground environment. */
((root) => {
  'use strict';
  const WIDTH = 12, HEIGHT = 12;
  const TERRAIN = Object.freeze({ grass: 0, sand: 1, 'deep-water': 2, dirt: 3,
    swamp: 4, 'shallow-water': 5, 'monastery-floor': 6, 'cave-earth': 7, void: 8 });
  const NAMES = Object.fromEntries(Object.entries(TERRAIN).map(([name, id]) => [id, name]));
  const COSTS = Object.freeze({ grass: 1, sand: 2, 'deep-water': null, dirt: 1,
    swamp: 2, 'shallow-water': null, 'monastery-floor': 1, 'cave-earth': 1, void: null });
  const WALL_TYPES = Object.freeze(['monastery', 'dungeon']);
  const MAP_TYPES = Object.freeze(['surface', 'underground']);
  // Cardinals first provide a stable style choice when two rooms meet diagonally.
  const NEIGHBORS = [[0, -1, 1], [1, 0, 4], [0, 1, 16], [-1, 0, 64],
    [1, -1, 2], [1, 1, 8], [-1, 1, 32], [-1, -1, 128]];
  const matrix = (value) => Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(value));
  const createLighting = () => ({ mode: 'absolute', ambient: 100, cells: matrix(null) });
  const validBrightness = value => Number.isFinite(value) && value >= 0 && value <= 200;
  const inside = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
  const isWater = (terrain) => terrain === TERRAIN['deep-water'] || terrain === TERRAIN['shallow-water'];

  function createMap(mapType = 'surface') {
    if (!MAP_TYPES.includes(mapType)) throw new Error('Неизвестный тип карты.');
    return { mapType, tiles: matrix(mapType === 'underground' ? TERRAIN.void : TERRAIN.grass),
      mobs: [], objects: [], wallStyles: mapType === 'underground' ? matrix(null) : null,
      lighting: createLighting() };
  }

  function readLighting(value) {
    if (value === undefined) return createLighting();
    const absolute = value?.mode === 'absolute';
    const validCell = v => absolute ? v === null || (Number.isFinite(v) && v >= 0 && v <= 400) : validBrightness(v);
    if (!value || !validBrightness(value.ambient) || !Array.isArray(value.cells) || value.cells.length !== HEIGHT ||
        (value.mode !== undefined && !absolute) ||
        value.cells.some(row => !Array.isArray(row) || row.length !== WIDTH || row.some(v => !validCell(v)))) {
      throw new Error('Неверные настройки освещения карты.');
    }
    return { mode: 'absolute', ambient: value.ambient, cells: value.cells.map(row => row.map(v =>
      absolute ? v : v === 100 ? null : value.ambient * v / 100)) };
  }

  function lightAt(map, x, y) {
    return (map.lighting?.cells[y]?.[x] ?? map.lighting?.ambient ?? 100) / 100;
  }

  function wallInfo(level, x, y) {
    if (level.mapType !== 'underground' || !level.wallStyles || !inside(x, y) || level.tiles[y][x] !== TERRAIN.void) return null;
    let mask = 0, inherited = null;
    for (const [dx, dy, bit] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || level.tiles[ny][nx] === TERRAIN.void) continue;
      mask |= bit;
      inherited ??= level.wallStyles[ny][nx];
    }
    return mask ? { mask, style: level.wallStyles[y][x] ?? inherited ?? 'monastery' } : null;
  }

  function readMap(data, version, mapType, mobTypes, objectTypes) {
    if (!data || !Array.isArray(data.tiles) || data.tiles.length !== HEIGHT ||
        data.tiles.some(row => !Array.isArray(row) || row.length !== WIDTH)) {
      throw new Error('Неверное количество строк или клеток карты.');
    }
    const tiles = data.tiles.map(row => row.map(name => {
      if (typeof name !== 'string' || !Object.hasOwn(TERRAIN, name) || (mapType === 'surface' && name === 'void')) {
        throw new Error('В карте указан неизвестный или недопустимый тип поверхности.');
      }
      return TERRAIN[name];
    }));
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const t = tiles[y][x];
      if (isWater(t) && [[x + 1, y], [x, y + 1]].some(([nx, ny]) =>
        inside(nx, ny) && isWater(tiles[ny][nx]) && tiles[ny][nx] !== t)) {
        throw new Error('В одном водоёме не могут смешиваться мелководье и глубоководье.');
      }
    }
    const occupied = new Set();
    function claim(entity) {
      if (!Number.isInteger(entity.x) || !Number.isInteger(entity.y) || !inside(entity.x, entity.y)) {
        throw new Error('Неверная клетка существа или объекта.');
      }
      const position = entity.y * WIDTH + entity.x;
      if (occupied.has(position)) throw new Error('На одной клетке не может быть несколько существ или объектов.');
      if (tiles[entity.y][entity.x] === TERRAIN.void) throw new Error('Нельзя размещать существ и объекты в пустоте или стене.');
      occupied.add(position);
    }
    const savedMobs = version === 1 ? [] : data.mobs;
    if (!Array.isArray(savedMobs) || savedMobs.length > WIDTH * HEIGHT) throw new Error('Неверный список мобов карты.');
    const mobs = savedMobs.map(mob => {
      if (!mob || typeof mob.type !== 'string' || !Object.hasOwn(mobTypes, mob.type)) throw new Error('В карте указан неизвестный моб.');
      claim(mob);
      const team = version < 4 ? mobTypes[mob.type].team : mob.team;
      if (team !== mobTypes[mob.type].team) throw new Error('Неверная сторона существа: ally или enemy.');
      return { type: mob.type, team, x: mob.x, y: mob.y };
    });
    const savedObjects = version < 3 ? [] : data.objects;
    if (!Array.isArray(savedObjects) || savedObjects.length > WIDTH * HEIGHT) throw new Error('Неверный список объектов карты.');
    const objects = savedObjects.map(object => {
      if (!object || typeof object.type !== 'string' || !Object.hasOwn(objectTypes, object.type) ||
          object.blocking !== true || object.interactive !== false) throw new Error('Неверный тип или параметры препятствия.');
      claim(object);
      return { type: object.type, x: object.x, y: object.y };
    });
    let wallStyles = null;
    if (mapType === 'underground') {
      if (!Array.isArray(data.wallStyles) || data.wallStyles.length !== HEIGHT ||
          data.wallStyles.some(row => !Array.isArray(row) || row.length !== WIDTH ||
            row.some(style => style !== null && !WALL_TYPES.includes(style)))) {
        throw new Error('Неверные стили стен подземелья.');
      }
      wallStyles = data.wallStyles.map(row => [...row]);
    }
    return { mapType, tiles, mobs, objects, wallStyles, lighting: readLighting(data.lighting) };
  }

  function readDocument(data, mobTypes, objectTypes) {
    if (data?.format !== 'kanneghem-map' || ![1, 2, 3, 4, 5, 6].includes(data.version)) {
      throw new Error('Неподдерживаемый формат или версия карты.');
    }
    if (data.width !== WIDTH || data.height !== HEIGHT) throw new Error(`Размер карты должен быть ${WIDTH}×${HEIGHT}.`);
    if (data.version < 5) {
      return readMap(data, data.version, 'surface', mobTypes, objectTypes);
    }
    if (data.version === 5) {
      // The former two-level format imports only the level selected when saved.
      if (!MAP_TYPES.includes(data.activeLevel)) throw new Error('Неизвестный уровень карты.');
      return readMap(data.levels?.[data.activeLevel], 5, data.activeLevel, mobTypes, objectTypes);
    }
    if (!MAP_TYPES.includes(data.mapType)) throw new Error('Неизвестный тип карты.');
    return readMap(data, data.version, data.mapType, mobTypes, objectTypes);
  }

  function serialize(map, objectTypes) {
    const saved = { format: 'kanneghem-map', version: 6, width: WIDTH, height: HEIGHT, mapType: map.mapType,
      tiles: map.tiles.map(row => row.map(t => NAMES[t])),
      mobs: map.mobs.map(({ type, team, x, y }) => ({ type, team, x, y })),
      objects: map.objects.map(({ type, x, y }) => ({ type, x, y,
        blocking: objectTypes[type].blocking, interactive: objectTypes[type].interactive })) };
    if (map.wallStyles) saved.wallStyles = map.wallStyles.map(row => [...row]);
    saved.lighting = { mode: 'absolute', ambient: map.lighting.ambient, cells: map.lighting.cells.map(row => [...row]) };
    return saved;
  }

  const api = Object.freeze({ WIDTH, HEIGHT, TERRAIN, COSTS, WALL_TYPES, MAP_TYPES, NEIGHBORS,
    createMap, createLighting, lightAt, wallInfo, readDocument, serialize });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapData = api;
})(typeof window === 'undefined' ? globalThis : window);
