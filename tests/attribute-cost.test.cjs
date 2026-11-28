const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../heroProgression.js');
const M=require('../mapData.js');
const E=require('../equipmentModel.js');
function invested(points) {
  const p=P.create(30);
  p.allocations.int={two:Math.floor(points/2),one:points%2};
  return P.normalize(p);
}
test('the first sixteen invested points are 1:1, further pairs add one integer attribute point',()=>{
  for(const [spent,value,pending,nextCost] of [[0,0,0,1],[15,15,0,1],[16,16,0,2],[17,16,1,1],
    [18,17,0,2],[19,17,1,1],[20,18,0,2],[32,24,0,2],[60,38,0,2]]) {
    const p=invested(spent),result=P.investment(p,'int');
    assert.equal(result.spent,spent);assert.equal(result.value,value);assert.equal(result.pending,pending);assert.equal(result.nextCost,nextCost);
    assert.equal(P.attributes(p).int,value);
  }
});
test('crossing sixteen with a two-point choice preserves its unused point; undo refunds the actual choices',()=>{
  const p=invested(15),budget=P.remaining(p);
  assert(P.allocate(p,'int',2,1));
  assert.equal(P.attributes(p).int,16);assert.equal(P.investment(p,'int').spent,17);assert.equal(P.investment(p,'int').pending,1);
  assert(P.allocate(p,'int',1,1));assert.equal(P.attributes(p).int,17);assert.equal(P.investment(p,'int').pending,0);
  assert(P.allocate(p,'int',1,-1));assert.equal(P.attributes(p).int,16);assert.equal(P.investment(p,'int').pending,1);
  assert(P.allocate(p,'int',2,-1));assert.equal(P.attributes(p).int,15);assert.equal(P.investment(p,'int').pending,0);
  assert.deepEqual(P.remaining(p),budget);
});
test('normal and training allocations share the threshold and retain separate refund ledgers',()=>{
  const p=P.create(16),skills=['battle-hardened','veteran'];
  p.allocations.int.two=7;
  p.bonuses={};
  for(const id of skills)p.bonuses[id]=P.create().allocations;
  p.bonuses['battle-hardened'].int.two=1;p.bonuses.veteran.int.one=1;
  const normalized=P.normalize(p,skills);
  assert.equal(P.investment(normalized,'int').spent,17);assert.equal(P.attributes(normalized).int,16);assert.equal(P.investment(normalized,'int').pending,1);
  const removed=P.reconcileBonuses(normalized,['battle-hardened']);
  assert.equal(P.attributes(removed).int,16);assert.equal(P.investment(removed,'int').pending,0);
  assert.equal(removed.allocations.int.two,7);
});
test('partial progress survives map saving, loading and gear changes without consuming it twice',()=>{
  const p=invested(17),map=M.createMap();
  const hero={type:'wizard',team:'ally',x:1,y:1,progression:p};
  E.equip(hero,'star-robe');map.mobs.push(hero);
  const encoded=JSON.parse(JSON.stringify(M.serialize(map)));
  const loaded=M.readDocument(encoded,{wizard:{team:'ally'}});
  const saved=loaded.mobs[0].progression;
  assert.deepEqual(saved,p);assert.equal(P.investment(saved,'int').pending,1);assert.equal(P.attributes(saved).int,16);
  E.remove(loaded.mobs[0],'chest');assert.deepEqual(saved,p);
  P.allocate(saved,'int',1,1);assert.equal(P.attributes(saved).int,17);assert.equal(P.investment(saved,'int').pending,0);
  assert.equal(P.investment(p,'int').pending,1);
});
