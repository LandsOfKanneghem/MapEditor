const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../data/heroSkillRules.js');
const P = require('../heroProgression.js');
const S = require('../heroSkills.js');
const E = require('../equipmentModel.js');
const C = require('../equipmentCatalog.js');
const M = require('../mapData.js');

test('spell school ranks gate only levelled hero actions; higher ranks cover lower spell levels', () => {
  for (const [school, branch] of Object.entries({ fire:'fire-magic', water:'water-magic', earth:'earth-magic', air:'air-magic',
    light:'light-magic', dark:'dark-magic', order:'order-magic', chaos:'chaos-magic', nature:'nature-magic', body:'body-magic', war:'warfare' })) {
    const hero = { type:'wizard', skills:[] }, spell = { name:'Тест', abilityType:'spell', magicSchool:school, level:1 };
    assert(!R.canUseSpell(hero,spell));
    for (let rank=1;rank<=4;rank++) {
      hero.skills=[`${branch}-${rank}`];
      for(let level=1;level<=4;level++) assert.equal(R.canUseSpell(hero,{...spell,level}),rank>=level);
    }
    assert(R.canUseSpell({type:'specter',skills:[]},spell));
    assert(R.canUseSpell({type:'warrior',skills:[]},{...spell,level:undefined,abilityType:'weapon-strike'}));
  }
  assert.equal(R.spellName({name:'Огненный выстрел',level:1}),'Огненный выстрел [I ур.]');
  assert.equal(R.spellName({name:'Тест',level:4}),'Тест [IV ур.]');
  assert.equal(R.spellName({name:'Укус'}),'Укус');
  assert(S.BY_ID['body-magic-4']);
});

test('only requested equipment categories require novice skills; two-handed swords need Sword alone', () => {
  const cases = [['sword','sword'],['axe','axe'],['bow','shooting'],['crossbow','shooting'],['sling','throwing'],
    ['staff','magic-items'],['wand','magic-items'],['orb','magic-items']];
  for(const [weaponType,branch] of cases) for(const hands of [1,2]) {
    const item={weaponType,hands};
    assert(!R.canEquip({type:'warrior',skills:[]},item));
    assert(R.canEquip({type:'warrior',skills:[`${branch}-1`]},item));
  }
  for(const id of ['body-armor','short-chainmail','shield','wood-buckler']) assert(!R.canEquip({type:'wizard',skills:[]},C.items[id]));
  for(const id of ['leather-vest','apprentice-robe','iron-dagger','patched-cap','dragon-scale-armor']) assert(R.canEquip({type:'wizard',skills:[]},C.items[id]));
  const hero={type:'warrior',team:'ally',skills:[]};
  E.initialize(hero);
  assert.equal(hero.equipment.rightHand,null);assert.equal(hero.equipment.chest,null);assert.equal(hero.equipment.leftHand,null);
  assert(!E.equip(hero,'noon-blade'));assert(E.equip(hero,'iron-dagger'));
  hero.skills=['sword-1','shield-1','medium-armor-1'];
  assert(E.equip(hero,'noon-blade'));assert(E.equip(hero,'body-armor'));assert(E.equip(hero,'shield'));
  hero.skills=[];E.reconcileSkills(hero);
  assert.equal(hero.equipment.rightHand,null);assert.equal(hero.equipment.chest,null);assert.equal(hero.equipment.leftHand,null);
});

test('Quick Hands reduces consumable costs by one without going below zero', () => {
  const hero={type:'wizard',skills:['quick-hands']};
  for(const [id,cost] of [['healing-potion',1],['antidote',1],['bandages',0],['volatile-mixture',1]]) assert.equal(R.consumableCost(hero,C.items[id]),cost);
  assert.equal(R.consumableCost(hero,{consumable:{apCost:0}}),0);
  assert.equal(R.consumableCost({...hero,skills:[]},C.items.bandages),1);
});

function spentLevels() {
  const progression=P.create(16);
  for(let n=0;n<16;n++) {
    for(const stat of ['int','vit','str']) P.allocate(progression,stat,2,1);
    for(const stat of ['wis','cha']) P.allocate(progression,stat,1,1);
  }
  return progression;
}

test('training bonuses stack but each skill increases any attribute at most once, beyond the normal cap', () => {
  const progression=spentLevels(),skills=['battle-hardened','veteran'];
  assert.deepEqual(P.remaining(progression,undefined,skills),{two:3,one:5});
  assert.deepEqual(P.remaining(progression,'int',skills),{two:2,one:2});
  assert(P.allocate(progression,'int',2,1,skills));
  assert(P.allocate(progression,'int',2,1,skills));
  assert(!P.allocate(progression,'int',2,1,skills));
  assert(!P.allocate(progression,'int',1,1,skills));
  assert.equal(progression.bonuses['battle-hardened'].int.two,1);
  assert.equal(progression.bonuses.veteran.int.two,1);
  assert.equal(P.attributes(progression).int,36);
  assert(P.allocate(progression,'vit',2,1,skills));
  for(const stat of ['vit','str','wis','cha','att']) assert(P.allocate(progression,stat,1,1,skills));
  assert.deepEqual(P.remaining(progression,undefined,skills),{two:0,one:0});
  assert.deepEqual(P.normalize(progression,skills),progression);
  assert(P.allocate(progression,'int',2,-1,skills));
  assert.equal(P.attributes(progression).int,34);
  assert.equal(progression.allocations.int.two,16,'undo restores a bonus before normal levels');
});

test('removing a training skill removes only its allocated bonuses; lowering level resets every allocation', () => {
  const progression=spentLevels(),skills=['battle-hardened','veteran'];
  P.allocate(progression,'int',2,1,skills);P.allocate(progression,'int',2,1,skills);
  const hardened=P.reconcileBonuses(progression,['battle-hardened']);
  assert.equal(P.attributes(hardened).int,34);
  assert.equal(hardened.bonuses.veteran,undefined);
  assert.equal(P.attributes(P.reconcileBonuses(progression,[])).int,32);
  assert.throws(()=>P.normalize(progression,[]));
  const invalid=JSON.parse(JSON.stringify(progression));invalid.bonuses.veteran.int.one=1;
  assert.throws(()=>P.normalize(invalid,skills));
  P.changeLevel(progression,-1);
  assert.equal(progression.bonuses,undefined);
  assert(Object.values(P.attributes(progression)).every(value=>value===0));
});

test('bonus allocations and skills round-trip, and gear without its prerequisite is removed on map import', () => {
  const map=M.createMap(),progression=spentLevels(),skills=['battle-hardened','veteran','sword-1'];
  P.allocate(progression,'int',2,1,skills);P.allocate(progression,'int',2,1,skills);
  const hero={type:'wizard',team:'ally',x:2,y:2,progression,skills};
  E.equip(hero,'noon-blade');map.mobs.push(hero);
  const saved=M.serialize(map),types={wizard:{team:'ally'}};
  assert.equal(saved.version,12);
  assert.deepEqual(M.serialize(M.readDocument(saved,types)),saved);
  const imported=JSON.parse(JSON.stringify(saved));imported.mobs[0].skills.pop();
  assert.equal(M.readDocument(imported,types).mobs[0].equipment.rightHand,null);
  imported.mobs[0].skills=[];
  assert.throws(()=>M.readDocument(imported,types),'bonus allocations need their owning skills');
});
