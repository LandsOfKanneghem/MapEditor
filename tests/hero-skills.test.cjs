const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../heroSkills.js');
const P = require('../heroProgression.js');
const M = require('../mapData.js');

test('skill choices start at three and increase once per level through level thirty', () => {
  for (let level = 1; level <= 30; level++) assert.equal(S.capacity(level), level + 2);
  for (const level of [0, -1, 31, 1.5, '4', NaN]) assert.throws(() => S.capacity(level));
  let selected = [];
  for (const id of ['fire-magic-1', 'water-magic-1', 'earth-magic-1']) selected = S.toggle(selected, id, 1);
  assert.equal(selected.length, 3);
  assert(S.reason('air-magic-1', selected, 1).includes('Нет свободных'));
  assert.deepEqual(S.toggle(selected, 'air-magic-1', 1), selected);
  const removed = S.toggle(selected, 'fire-magic-1', 1);
  assert.equal(removed.length, 2);
  assert.equal(S.toggle(removed, 'air-magic-1', 1).length, 3);
  assert.equal(selected.length, 3, 'editing returns a new array');
});

test('all ranked branches require their left neighbour and levels 1, 4, 8, 15', () => {
  for (const branch of S.GROUPS.slice(0, -1).flatMap(group => group.branches)) {
    assert.deepEqual(branch.skills.map(skill => skill.minLevel), [1, 4, 8, 15]);
    const selected = [];
    for (const [index, skill] of branch.skills.entries()) {
      assert.equal(skill.prerequisite, index ? branch.skills[index - 1].id : null);
      if (index) {
        assert.deepEqual(S.toggle([], skill.id, 30), [], 'a high level does not bypass prerequisites');
        assert.throws(() => S.normalize([...selected, skill.id], skill.minLevel - 1));
        assert(S.reason(skill.id, selected, skill.minLevel - 1).includes('Требуется уровень'));
      }
      selected.push(skill.id);
      assert.deepEqual(S.normalize(selected, skill.minLevel), selected);
    }
  }
});

test('special skill requirements match the source and Veteran requires Battle Hardened', () => {
  assert.equal(S.BY_ID['quick-hands'].minLevel, 4);
  assert.equal(S.BY_ID['battle-hardened'].minLevel, 8);
  assert.equal(S.BY_ID.veteran.minLevel, 16);
  assert.equal(S.BY_ID.veteran.prerequisite, 'battle-hardened');
  assert.throws(() => S.normalize(['quick-hands'], 3));
  assert.throws(() => S.normalize(['battle-hardened'], 7));
  assert.throws(() => S.normalize(['veteran'], 16));
  assert.throws(() => S.normalize(['battle-hardened', 'veteran'], 15));
  assert.deepEqual(S.normalize(['quick-hands', 'battle-hardened', 'veteran'], 16), ['quick-hands', 'battle-hardened', 'veteran']);
});

test('unselecting a prerequisite removes descendants and refunds their choices without touching other branches', () => {
  const selected = ['water-magic-1', 'water-magic-2', 'water-magic-3', 'water-magic-4', 'fire-magic-1', 'battle-hardened', 'veteran'];
  assert.deepEqual(S.toggle(selected, 'water-magic-2', 16), ['water-magic-1', 'fire-magic-1', 'battle-hardened', 'veteran']);
  assert.deepEqual(S.toggle(selected, 'battle-hardened', 16), selected.slice(0, 5));
  assert.equal(selected.length, 7);
});

test('Battle display omits every selected ancestor but stores the complete selection', () => {
  const selected = ['water-magic-3', 'water-magic-1', 'fire-magic-1', 'water-magic-2', 'battle-hardened', 'veteran'];
  assert.deepEqual(S.normalize(selected, 16), selected, 'file order is not required to be topological');
  assert.deepEqual(S.highest(selected).map(skill => skill.name), ['Магия воды [Мастер]', 'Магия огня [Ученик]', 'Ветеран']);
  assert.equal(selected.length, 6);
});

test('lowering level removes inaccessible ranks and trims the newest choices to the new budget', () => {
  const selected = ['water-magic-1', 'water-magic-2', 'water-magic-3', 'fire-magic-1', 'earth-magic-1', 'air-magic-1', 'battle-hardened', 'veteran'];
  assert.deepEqual(S.reconcile(selected, 1), ['water-magic-1', 'fire-magic-1', 'earth-magic-1']);
  assert.deepEqual(S.reconcile(selected, 4), ['water-magic-1', 'water-magic-2', 'fire-magic-1', 'earth-magic-1', 'air-magic-1']);
  assert.deepEqual(S.reconcile(selected, 30), selected);
  assert.deepEqual(S.normalize(S.reconcile(selected, 1), 1), S.reconcile(selected, 1));
});

test('all heroes round-trip full skill chains alongside progression in surface and underground maps', () => {
  const types = Object.fromEntries(['wizard', 'monk', 'warrior', 'archer', 'halfling', 'druid'].map(type => [type, { team: 'ally' }]));
  for (const mapType of ['surface', 'underground']) {
    const map = M.createMap(mapType);
    Object.keys(types).forEach((type, x) => {
      map.tiles[3][x] = M.TERRAIN.grass;
      map.mobs.push({ type, team: 'ally', x, y: 3, progression: P.create(8), skills: ['water-magic-1', 'water-magic-2', 'water-magic-3'] });
    });
    const saved = JSON.parse(JSON.stringify(M.serialize(map)));
    assert.equal(saved.version, 11);
    const loaded = M.readDocument(saved, types);
    assert.deepEqual(M.serialize(loaded), saved);
    loaded.mobs[0].skills.pop();
    assert.equal(saved.mobs[0].skills.length, 3);
    assert.equal(loaded.mobs[1].skills.length, 3);
  }
});

test('old maps have no skills; unknown, duplicate, over-budget or inaccessible skills are rejected', () => {
  assert.deepEqual(S.read({ type: 'wizard', team: 'ally' }), {});
  const base = { type: 'wizard', team: 'ally', x: 1, y: 1, skills: ['water-magic-1'] };
  assert.deepEqual(S.read(base), { skills: ['water-magic-1'] });
  for (const patch of [
    { skills: null }, { skills: 'water-magic-1' }, { skills: ['gnome-magic'] },
    { skills: ['water-magic-1', 'water-magic-1'] }, { skills: ['water-magic-2'] },
    { skills: ['water-magic-1', 'water-magic-2'] },
    { skills: ['water-magic-1', 'fire-magic-1', 'earth-magic-1', 'air-magic-1'] },
    { type: 'wolf' }, { team: 'enemy' }
  ]) {
    const mob = { ...base, ...patch };
    assert.throws(() => S.read(mob));
    const map = M.createMap(); map.mobs.push(mob);
    assert.throws(() => M.serialize(map));
    const data = { ...M.serialize(M.createMap()), mobs: [mob] };
    assert.throws(() => M.readDocument(data, { wizard: { team: 'ally' }, wolf: { team: 'enemy' } }));
  }
});
