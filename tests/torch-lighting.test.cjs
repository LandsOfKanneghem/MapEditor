const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../mapData.js');
const O = require('../mapObjects.js');
const objects = O.TYPES;
const mobs = { wolf: { team: 'enemy' } };
const read = data => M.readDocument(data, mobs, objects);

test('a ground torch lights exactly a D5 diamond and creatures cast no shadows', () => {
  const map = M.createMap();
  map.lighting.ambient = 60;
  map.objects.push({ type: 'torch', x: 5, y: 5 });
  map.mobs.push({ type: 'wolf', team: 'enemy', x: 6, y: 5 });
  const lit = O.illuminated(map);
  assert.equal(lit.size, 13);
  assert(lit.has('7,5'));
  assert(!lit.has('8,5'));
  map.lighting.cells[5][5] = 120;
  assert.equal(M.lightAt(map, 5, 5), 1, '100% is an absolute override');
  map.objects = [];
  assert.equal(M.lightAt(map, 5, 5), 1.2, 'underlying brush value is restored');
  assert.equal(M.lightAt(map, 6, 5), 0.6);
});
test('massive objects and walls cast shadows with the Battle LOS diagonal rule', () => {
  const map = M.createMap('underground');
  map.tiles = Array.from({ length: 12 }, () => Array(12).fill(M.TERRAIN['cave-earth']));
  map.objects = [{ type: 'torch', x: 5, y: 5 }, { type: 'crate', x: 6, y: 5 }];
  let lit = O.illuminated(map);
  assert.equal(lit.size, 11);
  assert(!lit.has('6,5') && !lit.has('7,5'));
  assert(lit.has('6,6'), 'exact diagonal corner contact does not block light');
  map.objects.pop(); map.tiles[5][6] = M.TERRAIN.void;
  lit = O.illuminated(map);
  assert(!lit.has('7,5'));
  assert(lit.has('6,6'));
});
test('wall torch is anchored to a valid wall face and its light starts on the adjoining floor', () => {
  const map = M.createMap('underground');
  for (let y = 5; y <= 7; y++) for (let x = 3; x <= 7; x++) map.tiles[y][x] = M.TERRAIN['cave-earth'];
  map.objects.push({ type: 'wall-torch', x: 5, y: 4, facing: 'south' });
  const loaded = read(M.serialize(map, objects));
  assert.deepEqual(loaded.objects, map.objects);
  const lit = O.illuminated(loaded);
  assert(lit.has('5,5'));
  assert(lit.has('5,7'));
  assert(!lit.has('5,4'));
  for (const facing of ['north', 'invalid']) {
    const saved = M.serialize(map, objects); saved.objects[0].facing = facing;
    assert.throws(() => read(saved));
  }
  const saved = M.serialize(map, objects); saved.objects[0].y = 5;
  assert.throws(() => read(saved), 'wall torches cannot float on a floor');
});
test('small objects coexist with creatures and round-trip, but massive objects cannot', () => {
  const map = M.createMap();
  map.mobs = [{ type: 'wolf', team: 'enemy', x: 5, y: 5 }];
  map.objects = [{ type: 'torch', x: 5, y: 5 }];
  const encoded = M.serialize(map, objects);
  assert.equal(encoded.version, 7);
  assert.equal(encoded.objects[0].blocking, false);
  assert.deepEqual(read(encoded).objects, map.objects);
  encoded.objects[0] = { type: 'crate', x: 5, y: 5, blocking: true, interactive: false };
  assert.throws(() => read(encoded));
  encoded.objects[0] = { type: 'torch', x: 5, y: 5, blocking: true, interactive: false };
  assert.throws(() => read(encoded), 'object collision flags cannot be forged');
});
test('overlapping lights do not stack and old maps still load without torches', () => {
  const map = M.createMap(); map.objects = [{ type: 'torch', x: 5, y: 5 }, { type: 'torch', x: 6, y: 5 }];
  map.lighting.ambient = 120;
  assert.equal(M.lightAt(map, 5, 5), 1);
  map.objects = [];
  const old = M.serialize(map, objects); old.version = 6;
  assert.equal(read(old).objects.length, 0);
});

test('straight, convex and concave mounts follow geometry in all four rotations', () => {
  const rotate = ([x, y], n) => { for (let i = 0; i < n; i++) [x, y] = [-y, x]; return [x || 0, y || 0]; };
  for (let rotation = 0; rotation < 4; rotation++) {
    for (const kind of ['straight', 'convex', 'concave']) {
      const map = M.createMap('underground');
      const floors = kind === 'straight' ? [[0, -1]] : kind === 'convex' ? [[0, -1], [-1, 0], [-1, -1]] : [[-1, -1]];
      for (const floor of floors) { const [x, y] = rotate(floor, rotation); map.tiles[5 + y][5 + x] = M.TERRAIN['cave-earth']; }
      const [dx, dy] = rotate(kind === 'straight' ? [0, -1] : [-1, -1], rotation);
      const facing = Object.keys(O.FACES).find(face => O.FACES[face][0] === dx && O.FACES[face][1] === dy);
      const torch = { type: 'wall-torch', x: 5, y: 5, facing };
      const mount = O.wallMount(map, torch);
      assert.equal(mount.kind, kind);
      assert.deepEqual(mount.source, { x: 5 + dx, y: 5 + dy });
      assert.equal(mount.offsetX, dx * (kind === 'concave' ? 24 : 27));
      assert.equal(mount.offsetY, dy * (kind === 'concave' ? 24 : 27));
      assert(O.canPlace(map, torch));
      map.objects = [torch];
      assert.deepEqual(read(M.serialize(map, objects)).objects, map.objects);
    }
  }
});
test('legacy face placement snaps to a convex corner and lights from the diagonal floor', () => {
  const map = M.createMap('underground');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (x < 5 || y < 5) map.tiles[y][x] = M.TERRAIN['cave-earth'];
  map.objects = [{ type: 'wall-torch', x: 5, y: 5, facing: 'west' }];
  const mount = O.wallMount(map, map.objects[0]);
  assert.equal(mount.kind, 'convex');
  assert.equal(mount.facing, 'north-west');
  assert.deepEqual(mount.source, { x: 4, y: 4 });
  assert(O.illuminated(map).has('2,4'), 'D5 is centered on the diagonal cell');
  const loaded = read(M.serialize(map, objects));
  assert.equal(loaded.objects[0].facing, 'north-west');
});
