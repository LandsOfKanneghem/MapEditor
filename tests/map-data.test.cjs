const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../mapData.js');
const mobTypes = { wolf: { team: 'enemy' }, wizard: { team: 'ally' } };
const objectTypes = { crate: { blocking: true, interactive: false } };
const save = (levels, activeLevel = 'surface') => M.serialize(levels, activeLevel, objectTypes);
const read = data => M.readDocument(data, mobTypes, objectTypes);

test('levels start independently: grass above, void below; both new floors cost 1', () => {
  const levels = M.createLevels();
  assert(levels.surface.tiles.flat().every(t => t === M.TERRAIN.grass));
  assert(levels.underground.tiles.flat().every(t => t === M.TERRAIN.void));
  levels.surface.tiles[0][0] = M.TERRAIN.sand;
  assert.equal(levels.surface.tiles[1][0], M.TERRAIN.grass);
  assert.equal(levels.underground.tiles[0][0], M.TERRAIN.void);
  assert.equal(M.COSTS['monastery-floor'], 1);
  assert.equal(M.COSTS['cave-earth'], 1);
  assert.equal(M.COSTS.void, null);
});

test('isolated floor creates exactly eight neighboring wall masks, with correct directions', () => {
  const level = M.createLevel('underground');
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
  const level = M.createLevel('underground');
  level.tiles[4][3] = level.tiles[4][5] = M.TERRAIN['cave-earth'];
  assert.equal(M.wallInfo(level, 4, 4).mask, 4 | 64);
  level.tiles[4][4] = M.TERRAIN['cave-earth'];
  assert.equal(M.wallInfo(level, 4, 4), null);
  level.tiles[4][3] = level.tiles[4][4] = level.tiles[4][5] = M.TERRAIN.void;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) assert.equal(M.wallInfo(level, x, y), null);
});

test('map borders and internal holes use only actual in-bounds neighbors', () => {
  const level = M.createLevel('underground');
  level.tiles[0][0] = M.TERRAIN['monastery-floor'];
  assert.equal(M.wallInfo(level, 1, 0).mask, 64);
  assert.equal(M.wallInfo(level, 0, 1).mask, 1);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) level.tiles[y][x] = M.TERRAIN['cave-earth'];
  level.tiles[4][4] = M.TERRAIN.void;
  assert.equal(M.wallInfo(level, 4, 4).mask, 255);
});

test('round-trip both levels, independent occupancy and mixed wall styles; strip DOM properties', () => {
  const levels = M.createLevels();
  levels.surface.mobs.push({ type: 'wolf', team: 'enemy', x: 4, y: 4, element: { ignored: true } });
  levels.underground.tiles[4][4] = M.TERRAIN['monastery-floor'];
  levels.underground.tiles[4][5] = M.TERRAIN['cave-earth'];
  levels.underground.wallStyles[3][4] = 'monastery';
  levels.underground.wallStyles[3][5] = 'dungeon';
  levels.underground.mobs.push({ type: 'wizard', team: 'ally', x: 4, y: 4 });
  levels.underground.objects.push({ type: 'crate', x: 5, y: 4 });
  const encoded = save(levels, 'underground');
  const loaded = read(JSON.parse(JSON.stringify(encoded)));
  assert.equal(loaded.activeLevel, 'underground');
  assert.deepEqual(save(loaded.levels, loaded.activeLevel), encoded);
  assert.equal(encoded.levels.surface.mobs[0].element, undefined);
  assert.equal(loaded.levels.underground.wallStyles[3][5], 'dungeon');
});

for (const version of [1, 2, 3, 4]) {
  test(`legacy version ${version} loads above ground with a fresh empty underground`, () => {
    const data = { format: 'kanneghem-map', version, width: 12, height: 12, ...save(M.createLevels()).levels.surface };
    data.mobs = version > 1 ? [{ type: 'wolf', x: 1, y: 1, ...(version === 4 ? { team: 'enemy' } : {}) }] : undefined;
    data.objects = version > 2 ? [{ type: 'crate', x: 2, y: 2, blocking: true, interactive: false }] : undefined;
    const loaded = read(data);
    assert.equal(loaded.activeLevel, 'surface');
    assert.equal(loaded.levels.surface.mobs.length, version > 1 ? 1 : 0);
    assert.equal(loaded.levels.surface.objects.length, version > 2 ? 1 : 0);
    assert(loaded.levels.underground.tiles.flat().every(t => t === M.TERRAIN.void));
  });
}

const invalidCases = {
  'missing second level': d => { delete d.levels.underground; },
  'unknown active level': d => { d.activeLevel = 'basement'; },
  'unknown terrain': d => { d.levels.surface.tiles[0][0] = 'lava'; },
  'void above ground': d => { d.levels.surface.tiles[0][0] = 'void'; },
  'short tile row': d => { d.levels.underground.tiles[0].pop(); },
  'unknown wall style': d => { d.levels.underground.wallStyles[0][0] = 'marble'; },
  'missing wall styles': d => { delete d.levels.underground.wallStyles; },
  'mob inside void': d => { d.levels.underground.mobs.push({ type: 'wolf', team: 'enemy', x: 3, y: 3 }); },
  'unknown mob': d => { d.levels.surface.mobs.push({ type: 'gnome', team: 'enemy', x: 3, y: 3 }); },
  'incorrect team': d => { d.levels.surface.mobs.push({ type: 'wolf', team: 'ally', x: 3, y: 3 }); },
  'occupied cell': d => { d.levels.surface.mobs.push({ type: 'wolf', team: 'enemy', x: 3, y: 3 }); d.levels.surface.objects.push({ type: 'crate', x: 3, y: 3, blocking: true, interactive: false }); },
  'mixed water component': d => { d.levels.surface.tiles[0][0] = 'deep-water'; d.levels.surface.tiles[0][1] = 'shallow-water'; }
};
for (const [name, mutate] of Object.entries(invalidCases)) {
  test(`reject invalid document: ${name}`, () => {
    const data = save(M.createLevels());
    mutate(data);
    assert.throws(() => read(data));
  });
}
