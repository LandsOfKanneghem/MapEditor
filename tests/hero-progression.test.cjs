const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../heroProgression.js');
const M = require('../mapData.js');
const Equipment = require('../equipmentModel.js');

test('level one starts at zero with three +2 and two +1 allocations on different attributes', () => {
  const draft = P.create();
  assert.deepEqual(P.attributes(draft), { vit: 0, str: 0, att: 0, int: 0, wis: 0, cha: 0, luc: 0 });
  assert.deepEqual(P.remaining(draft), { two: 3, one: 2 });
  for (const stat of ['vit', 'int', 'wis']) assert(P.allocate(draft, stat, 2, 1));
  assert(!P.allocate(draft, 'int', 2, 1));
  assert(!P.allocate(draft, 'int', 1, 1));
  assert(!P.allocate(draft, 'str', 2, 1));
  for (const stat of ['str', 'att']) assert(P.allocate(draft, stat, 1, 1));
  assert.deepEqual(P.remaining(draft), { two: 0, one: 0 });
  for (const stat of P.ATTRIBUTES) assert.deepEqual(P.remaining(draft, stat), { two: 0, one: 0 });
  assert(!P.allocate(draft, 'luc', 1, 1));
  assert.equal(P.attributes(draft).int, 2);
});

test('level two example shares attribute capacity across +2 and +1, and undo restores the correct pool', () => {
  const draft = P.create(2);
  assert.deepEqual(P.remaining(draft), { two: 6, one: 4 });
  P.allocate(draft, 'int', 2, 1);
  assert.deepEqual(P.remaining(draft), { two: 5, one: 4 });
  assert.deepEqual(P.remaining(draft, 'int'), { two: 1, one: 1 });
  assert.deepEqual(P.remaining(draft, 'str'), { two: 2, one: 2 });
  P.allocate(draft, 'int', 1, 1);
  assert.equal(P.attributes(draft).int, 3);
  assert.deepEqual(P.remaining(draft, 'int'), { two: 0, one: 0 });
  assert(P.allocate(draft, 'int', 2, -1));
  assert.equal(P.attributes(draft).int, 1);
  assert.deepEqual(P.remaining(draft), { two: 6, one: 3 });
  assert(!P.allocate(draft, 'int', 2, -1));
});

test('level increase preserves allocations, every decrease resets them, bounds are inclusive 1–30', () => {
  const draft = P.create();
  assert(!P.changeLevel(draft, -1));
  P.allocate(draft, 'vit', 2, 1);
  assert(P.changeLevel(draft, 1));
  assert.equal(P.attributes(draft).vit, 2);
  assert.deepEqual(P.remaining(draft), { two: 5, one: 4 });
  assert(P.changeLevel(draft, 28));
  assert.equal(draft.level, 30);
  assert(!P.changeLevel(draft, 1));
  assert.equal(P.attributes(draft).vit, 2);
  assert(P.changeLevel(draft, -1));
  assert.equal(draft.level, 29);
  assert(Object.values(P.attributes(draft)).every(value => value === 0));
  assert.deepEqual(P.remaining(draft), { two: 87, one: 58 });
});

test('all levels can spend their full budgets and normalized drafts do not share mutable allocations', () => {
  for (let level = 1; level <= 30; level++) {
    const draft = P.create(level);
    for (let i = 0; i < level; i++) {
      for (const stat of ['vit', 'str', 'int']) assert(P.allocate(draft, stat, 2, 1));
      for (const stat of ['wis', 'cha']) assert(P.allocate(draft, stat, 1, 1));
    }
    assert.deepEqual(P.remaining(draft), { two: 0, one: 0 });
    const copy = P.normalize(draft);
    P.allocate(copy, 'str', 2, -1);
    assert.equal(P.attributes(draft).str, level * 2);
    assert.equal(P.attributes(copy).str, (level - 1) * 2);
  }
});

test('progression and equipment round-trip together on each hero and each map environment', () => {
  const types = Object.fromEntries(['wizard', 'monk', 'warrior', 'archer', 'halfling', 'druid'].map(type => [type, { team: 'ally' }]));
  for (const mapType of ['surface', 'underground']) {
    const map = M.createMap(mapType);
    Object.keys(types).forEach((type, x) => {
      const mob = { type, team: 'ally', x, y: 4, skills: ['sword-1'], progression: P.create(30) };
      P.allocate(mob.progression, 'int', 2, 1);
      Equipment.equip(mob, 'noon-blade');
      Equipment.equip(mob, 'healing-potion');
      map.tiles[4][x] = M.TERRAIN.grass;
      map.mobs.push(mob);
    });
    const saved = JSON.parse(JSON.stringify(M.serialize(map)));
    assert.equal(saved.version, 12);
    const loaded = M.readDocument(saved, types);
    assert.deepEqual(M.serialize(loaded), saved);
    loaded.mobs[0].progression.allocations.int.two = 5;
    assert.equal(saved.mobs[0].progression.allocations.int.two, 1);
    assert.equal(loaded.mobs[1].progression.allocations.int.two, 1);
    assert.equal(loaded.mobs[0].equipment.rightHand, 'noon-blade');
  }
});

test('old heroes retain unspecified progression; invalid progression is rejected on import and export', () => {
  assert.deepEqual(P.read({ type: 'wizard', team: 'ally' }), {});
  for (const mutate of [
    m => { m.progression = null; },
    m => { m.progression.level = 0; },
    m => { m.progression.level = 31; },
    m => { m.progression.level = 1.5; },
    m => { m.progression.allocations.int.two = -1; },
    m => { m.progression.allocations.int.two = 0.5; },
    m => { m.progression.allocations.int = { one: 1, two: 1 }; },
    m => { for (const stat of ['vit', 'str', 'att', 'int']) m.progression.allocations[stat].two = 1; },
    m => { for (const stat of ['vit', 'str', 'att']) m.progression.allocations[stat].one = 1; },
    m => { delete m.progression.allocations.luc; },
    m => { m.progression.allocations.ac = { two: 1, one: 0 }; },
    m => { m.type = 'wolf'; },
    m => { m.team = 'enemy'; }
  ]) {
    const map = M.createMap();
    const mob = { type: 'wizard', team: 'ally', x: 1, y: 1, progression: P.create() };
    mutate(mob);
    map.mobs.push(mob);
    assert.throws(() => M.serialize(map));
    const data = { ...M.serialize(M.createMap()), mobs: [mob] };
    assert.throws(() => M.readDocument(data, { wizard: { team: 'ally' }, wolf: { team: 'enemy' } }));
  }
});
