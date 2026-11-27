const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../mapData.js');
const mobTypes = { wolf: { team: 'enemy' }, wizard: { team: 'ally' } };
const objectTypes = { crate: { blocking: true, interactive: false } };
const save = map => M.serialize(map, objectTypes);
const read = data => M.readDocument(data, mobTypes, objectTypes);

test('one map starts with grass or void and shares the same terrain definitions', () => {
  const surface = M.createMap();
  const underground = M.createMap('underground');
  assert.equal(surface.mapType, 'surface');
  assert.equal(underground.mapType, 'underground');
  assert(surface.tiles.flat().every(t => t === M.TERRAIN.grass));
  assert(underground.tiles.flat().every(t => t === M.TERRAIN.void));
  assert.equal(M.COSTS['monastery-floor'], 1);
  assert.equal(M.COSTS['cave-earth'], 1);
  assert.equal(M.COSTS.dirt, 1);
  assert.equal(M.COSTS.void, null);
  for (const map of [surface, underground]) {
    map.tiles[0] = Object.values(M.TERRAIN).filter(t => t !== M.TERRAIN.void).concat(Array(4).fill(M.TERRAIN.grass));
    assert.deepEqual(read(save(map)), map);
  }
  assert.throws(() => M.createMap('unknown'));
});

test('isolated floor creates exactly eight neighboring wall masks, with correct directions', () => {
  const level = M.createMap('underground');
  level.tiles[5][5] = M.TERRAIN['monastery-floor'];
  level.wallStyles[5][5] = 'dungeon';
  let count = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (M.wallInfo(level, x, y)) count++;
  assert.equal(count, 8);
  for (const [dx, dy, bit] of M.NEIGHBORS) {
    assert.deepEqual(M.wallInfo(level, 5 - dx, 5 - dy), { mask: bit, style: 'dungeon' });
  }
  assert.equal(M.wallInfo(level, 5, 5), null);
  assert.equal(M.wallInfo(level, -1, 0), null);
});

test('expanding, joining and erasing floors rebuilds walls without modifying any floor', () => {
  const level = M.createMap('underground');
  level.tiles[4][3] = level.tiles[4][5] = M.TERRAIN['cave-earth'];
  assert.equal(M.wallInfo(level, 4, 4).mask, 4 | 64);
  level.tiles[4][4] = M.TERRAIN['cave-earth'];
  assert.equal(M.wallInfo(level, 4, 4), null);
  level.tiles[4][3] = level.tiles[4][4] = level.tiles[4][5] = M.TERRAIN.void;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) assert.equal(M.wallInfo(level, x, y), null);
});

test('map borders and internal holes use only actual in-bounds neighbors', () => {
  const level = M.createMap('underground');
  level.tiles[0][0] = M.TERRAIN['monastery-floor'];
  assert.equal(M.wallInfo(level, 1, 0).mask, 64);
  assert.equal(M.wallInfo(level, 0, 1).mask, 1);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) level.tiles[y][x] = M.TERRAIN['cave-earth'];
  level.tiles[4][4] = M.TERRAIN.void;
  assert.equal(M.wallInfo(level, 4, 4).mask, 255);
});

for (const mapType of ['surface', 'underground']) {
  test(`round-trip one ${mapType} map without any hidden level or DOM properties`, () => {
    const map = M.createMap(mapType);
    map.tiles[4][4] = M.TERRAIN['monastery-floor'];
    map.tiles[4][5] = M.TERRAIN['cave-earth'];
    if (map.wallStyles) {
      map.wallStyles[3][4] = 'monastery';
      map.wallStyles[3][5] = 'dungeon';
    }
    map.mobs.push({ type: 'wolf', team: 'enemy', x: 4, y: 4, element: { ignored: true } });
    map.objects.push({ type: 'crate', x: 5, y: 4 });
    const encoded = save(map);
    assert.equal(encoded.version, 8);
    assert.equal(encoded.mapType, mapType);
    assert.equal(encoded.levels, undefined);
    assert.equal(encoded.activeLevel, undefined);
    assert.equal(encoded.mobs[0].element, undefined);
    assert.deepEqual(save(read(JSON.parse(JSON.stringify(encoded)))), encoded);
  });
}

for (const version of [1, 2, 3, 4]) {
  test(`legacy version ${version} loads as one surface map`, () => {
    const data = { ...save(M.createMap()), version };
    delete data.mapType;
    data.mobs = version > 1 ? [{ type: 'wolf', x: 1, y: 1, ...(version === 4 ? { team: 'enemy' } : {}) }] : undefined;
    data.objects = version > 2 ? [{ type: 'crate', x: 2, y: 2, blocking: true, interactive: false }] : undefined;
    const loaded = read(data);
    assert.equal(loaded.mapType, 'surface');
    assert.equal(loaded.mobs.length, version > 1 ? 1 : 0);
    assert.equal(loaded.objects.length, version > 2 ? 1 : 0);
    assert.equal(loaded.levels, undefined);
  });
}

for (const activeLevel of ['surface', 'underground']) {
  test(`former version 5 imports only its selected ${activeLevel} map`, () => {
    const surface = save(M.createMap());
    const underground = save(M.createMap('underground'));
    surface.mobs.push({ type: 'wolf', team: 'enemy', x: 3, y: 3 });
    underground.tiles[4][4] = 'monastery-floor';
    underground.mobs.push({ type: 'wizard', team: 'ally', x: 4, y: 4 });
    const old = { format: 'kanneghem-map', version: 5, width: 12, height: 12, activeLevel,
      levels: { surface, underground } };
    const loaded = read(old);
    assert.equal(loaded.mapType, activeLevel);
    assert.equal(loaded.mobs.length, 1);
    assert.equal(loaded.mobs[0].type, activeLevel === 'surface' ? 'wolf' : 'wizard');
    assert.deepEqual(save(loaded), { ...(activeLevel === 'surface' ? surface : underground), version: 8 });
    assert.equal(save(loaded).levels, undefined);
  });
}

const invalidCases = {
  'unknown map type': d => { d.mapType = 'basement'; },
  'unknown terrain': d => { d.tiles[0][0] = 'lava'; },
  'void above ground': d => { d.mapType = 'surface'; },
  'short tile row': d => { d.tiles[0].pop(); },
  'unknown wall style': d => { d.wallStyles[0][0] = 'marble'; },
  'missing wall styles': d => { delete d.wallStyles; },
  'mob inside void': d => { d.mobs.push({ type: 'wolf', team: 'enemy', x: 3, y: 3 }); },
  'unknown mob': d => { d.mobs.push({ type: 'gnome', team: 'enemy', x: 3, y: 3 }); },
  'incorrect team': d => { d.tiles[3][3] = 'grass'; d.mobs.push({ type: 'wolf', team: 'unknown', x: 3, y: 3 }); },
  'occupied cell': d => { d.tiles[3][3] = 'grass'; d.mobs.push({ type: 'wolf', team: 'enemy', x: 3, y: 3 }); d.objects.push({ type: 'crate', x: 3, y: 3, blocking: true, interactive: false }); },
  'mixed water component': d => { d.tiles[0][0] = 'deep-water'; d.tiles[0][1] = 'shallow-water'; }
};
for (const [name, mutate] of Object.entries(invalidCases)) {
  test(`reject invalid document: ${name}`, () => {
    const data = save(M.createMap('underground'));
    mutate(data);
    assert.throws(() => read(data));
  });
}

test('maps without lighting data open at neutral brightness, including legacy files', () => {
  for (const version of [1, 2, 3, 4, 6]) {
    const data = save(M.createMap());
    data.version = version;
    delete data.lighting;
    const map = read(data);
    assert.equal(map.lighting.ambient, 100);
    assert(map.lighting.cells.flat().every(value => value === null));
  }
});

test('brush brightness overrides ambient and remains absolute when ambient changes', () => {
  const map = M.createMap();
  map.lighting.ambient = 60;
  map.lighting.cells[2][3] = 100;
  assert.equal(M.lightAt(map, 3, 2), 1);
  assert.equal(M.lightAt(map, 0, 0), .6);
  map.lighting.ambient = 30;
  assert.equal(M.lightAt(map, 3, 2), 1);
  assert.equal(M.lightAt(map, 0, 0), .6);
  map.lighting.cells[2][3] = 0;
  assert.equal(M.lightAt(map, 3, 2), .6);
  map.lighting.cells[2][3] = 200;
  assert.equal(M.lightAt(map, 3, 2), 1.2);
});

test('old relative lighting migrates into the available brightness range', () => {
  const data = save(M.createMap());
  data.lighting = { ambient: 60, cells: Array.from({length:12},()=>Array(12).fill(100)) };
  data.lighting.cells[0][0] = 150;
  const map = read(data);
  assert.equal(map.lighting.cells[0][0], 90);
  assert.equal(map.lighting.cells[0][1], null);
  assert.equal(M.lightAt(map, 0, 0), .9);
  assert.equal(M.lightAt(map, 1, 0), .6);
  assert.equal(read(save(map)).lighting.mode, 'absolute');
  data.lighting.ambient = 200;
  data.lighting.cells[0][0] = 200;
  assert.equal(M.lightAt(read(save(read(data))), 0, 0), 1.2);
});

test('lighting round-trips on both map types and copies are independent', () => {
  for (const type of ['surface', 'underground']) {
    const map = M.createMap(type);
    map.lighting.ambient = 80;
    map.lighting.cells[3][4] = 115;
    const encoded = save(map);
    const loaded = read(encoded);
    assert.deepEqual(loaded.lighting, map.lighting);
    assert.deepEqual(save(loaded), encoded);
    encoded.lighting.cells[3][4] = 0;
    assert.equal(map.lighting.cells[3][4], 115);
    assert.equal(loaded.lighting.cells[3][4], 115);
    loaded.lighting.cells[0][0] = 50;
    assert.equal(loaded.lighting.cells[1][0], null);
    assert.equal(M.createMap(type).lighting.cells[0][0], null);
  }
});

const invalidLighting = {
  'null settings': d => { d.lighting = null; },
  'negative ambient': d => { d.lighting.ambient = -1; },
  'excess ambient': d => { d.lighting.ambient = 201; },
  'string ambient': d => { d.lighting.ambient = '60'; },
  'missing ambient': d => { delete d.lighting.ambient; },
  'missing cells': d => { delete d.lighting.cells; },
  'short row': d => { d.lighting.cells[0].pop(); },
  'negative cell': d => { d.lighting.cells[0][0] = -1; },
  'excess cell': d => { d.lighting.cells[0][0] = 401; },
  'nonfinite cell': d => { d.lighting.cells[0][0] = Infinity; }
};
for (const [name, mutate] of Object.entries(invalidLighting)) {
  test(`reject invalid lighting: ${name}`, () => {
    const data = save(M.createMap());
    mutate(data);
    assert.throws(() => read(data), /освещения/);
  });
}

test('old absolute light is clamped on import and on export', () => {
  const data = save(M.createMap());
  data.lighting.ambient = 20;
  data.lighting.cells[0][0] = 180;
  data.lighting.cells[0][1] = 0;
  const loaded = read(data);
  assert.equal(loaded.lighting.ambient, 60);
  assert.deepEqual(loaded.lighting.cells[0].slice(0, 3), [120, 60, null]);
  loaded.lighting.ambient = 200;
  loaded.lighting.cells[0][0] = 0;
  const exported = save(loaded);
  assert.equal(exported.lighting.ambient, 120);
  assert.equal(exported.lighting.cells[0][0], 60);
});

test('old turtle maps load and save under the new dragon-turtle id', () => {
  const data = save(M.createMap());
  data.mobs.push({ type: 'alligator-snapping-turtle', team: 'enemy', x: 3, y: 3 });
  const loaded = M.readDocument(data, { ...mobTypes, 'dragon-turtle': { team: 'enemy' } }, objectTypes);
  assert.equal(loaded.mobs[0].type, 'dragon-turtle');
  assert.equal(save(loaded).mobs[0].type, 'dragon-turtle');
  assert.equal(data.mobs[0].type, 'alligator-snapping-turtle');
});

test('creatures can change side while hero sides remain locked', () => {
  const data = save(M.createMap());
  data.mobs = [{ type: 'wolf', team: 'ally', x: 3, y: 3 }];
  assert.equal(save(read(data)).mobs[0].team, 'ally');
  data.mobs[0].team = 'enemy';
  assert.equal(read(data).mobs[0].team, 'enemy');
  data.mobs[0] = { type: 'wizard', team: 'enemy', x: 3, y: 3 };
  assert.throws(() => read(data));
});


test('archer maps round-trip as allies and cannot assign the new hero to enemies', () => {
  const types = { ...mobTypes, archer: { team: 'ally' } };
  const map = M.createMap();
  map.mobs.push({ type: 'archer', team: 'ally', x: 2, y: 3 });
  const document = save(map);
  assert.deepEqual(M.readDocument(document, types, objectTypes).mobs, map.mobs);
  document.mobs[0].team = 'enemy';
  assert.throws(() => M.readDocument(document, types, objectTypes));
});
