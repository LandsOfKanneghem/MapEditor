const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Model = require('../equipmentModel.js');
const Catalog = require('../equipmentCatalog.js');
const Rules = require('../mapEquipment.js');
const Maps = require('../mapData.js');
const hero = (type = 'warrior') => ({ type, team: 'ally', x: 2, y: 3, progression: require('../heroProgression.js').create(4), skills: ['sword-1', 'shield-1', 'medium-armor-1', 'shooting-1', 'throwing-1'] });

test('catalog has one definition per ID with existing transparent item and outline images', () => {
  const ids = Object.keys(Catalog.items);
  assert(ids.length > 0);
  for (const id of ids) {
    const item = Catalog.items[id];
    assert.equal(id, item.id);
    assert(fs.existsSync(path.join(__dirname, '..', item.iconPath)));
  }
});

test('infinite catalog outfits multiple heroes independently and removal does not consume items', () => {
  const before = JSON.stringify(Catalog);
  const a = hero(), b = hero();
  Model.initialize(a); Model.initialize(b);
  assert.equal(a.equipment.chest, 'body-armor');
  assert.equal(a.equipment.leftHand, 'shield');
  assert.notEqual(a.equipment, b.equipment);
  for (const mob of [a, b]) {
    assert(Model.equip(mob, 'noon-blade'));
    assert(Model.equip(mob, 'copper-ring'));
    assert(Model.equip(mob, 'copper-ring'));
    assert.equal(mob.equipment.other1, 'copper-ring');
    assert.equal(mob.equipment.other2, 'copper-ring');
    assert(Model.equip(mob, 'healing-potion'));
    assert(Model.equip(mob, 'healing-potion'));
  }
  Model.remove(a, 'rightHand'); Model.remove(a, 0);
  assert.equal(b.equipment.rightHand, 'noon-blade');
  assert.equal(b.consumables[0], 'healing-potion');
  assert.equal(JSON.stringify(Catalog), before);
});

test('two-handed weapons occupy both hands, shields replace them, belts determine consumable capacity', () => {
  const mob = Model.initialize(hero());
  assert(Model.equip(mob, 'shortbow'));
  assert.equal(mob.equipment.leftHand, null);
  Model.remove(mob, 'leftHand');
  assert.equal(mob.equipment.rightHand, null);
  Model.equip(mob, 'shortbow'); Model.equip(mob, 'shield');
  assert.equal(mob.equipment.rightHand, null);
  Model.equip(mob, 'hunter-belt'); Model.equip(mob, 'potion-holder');
  assert.equal(Model.capacity(mob), 6);
  for (let i = 0; i < 6; i++) assert(Model.equip(mob, 'healing-potion'));
  Model.equip(mob, 'worn-belt');
  assert.equal(Model.capacity(mob), 2);
  assert.deepEqual(mob.consumables, ['healing-potion', 'healing-potion', null, null, null, null]);
  Model.remove(mob, 'other1'); Model.remove(mob, 'belt');
  assert(mob.consumables.every(id => id === null));
  assert(!Model.equip(mob, 'healing-potion'));
  assert(!Model.equip(mob, 'shortbow', 'head'));
});

test('gear, empty slots and duplicate consumables round-trip on surface and underground maps', () => {
  const types = Object.fromEntries(Rules.HEROES.map(type => [type, { team: 'ally' }]));
  for (const mapType of ['surface', 'underground']) {
    const map = Maps.createMap(mapType);
    for (let i = 0; i < Rules.HEROES.length; i++) {
      const mob = Model.initialize({ ...hero(Rules.HEROES[i]), x: i });
      map.tiles[mob.y][mob.x] = Maps.TERRAIN.grass;
      Model.equip(mob, 'noon-blade'); Model.equip(mob, 'healing-potion');
      Model.remove(mob, 'chest');
      map.mobs.push({ ...mob, element: { ignored: true } });
    }
    const saved = JSON.parse(JSON.stringify(Maps.serialize(map)));
    const loaded = Maps.readDocument(saved, types);
    assert.deepEqual(Maps.serialize(loaded), saved);
    assert.equal(loaded.mobs[0].equipment.chest, null);
    loaded.mobs[0].equipment.rightHand = null;
    loaded.mobs[0].consumables[0] = null;
    assert.equal(saved.mobs[0].equipment.rightHand, 'noon-blade');
    assert.equal(loaded.mobs[1].consumables[0], 'healing-potion');
  }
});

test('legacy maps leave hero loadouts unspecified; explicit empty gear stays empty', () => {
  assert.deepEqual(Rules.read(hero(), Catalog.items), {});
  const mob = { ...hero(), equipment: {} };
  const loaded = Rules.read(mob, Catalog.items);
  assert(Object.values(loaded.equipment).every(id => id === null));
  Model.initialize(Object.assign(mob, loaded));
  assert.equal(mob.equipment.chest, null);
  assert.equal(Model.capacity(mob), 0);
});

test('reject unknown items, invalid slots, non-hero loadouts and conflicting or locked slots', () => {
  for (const change of [
    m => { m.equipment.head = 'unknown-item'; },
    m => { m.equipment.head = 'warrior-weapon'; },
    m => { m.equipment.rightHand = 'healing-potion'; },
    m => { m.equipment.unknown = null; },
    m => { m.type = 'wolf'; },
    m => { m.team = 'enemy'; },
    m => { m.equipment.rightHand = 'shortbow'; },
    m => { m.consumables[5] = 'healing-potion'; },
    m => { m.consumables[0] = 'warrior-weapon'; },
    m => { m.consumables = []; }
  ]) {
    const mob = Model.initialize(hero());
    change(mob);
    assert.throws(() => Rules.read(mob, Catalog.items));
  }
});
