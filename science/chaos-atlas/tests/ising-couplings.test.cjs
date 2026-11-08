'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),{Scan}=require('../ising-scan-core.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('shell-specific symmetric coupling rules change actual fields and energy',()=>{
  const rules=[{a:'X1',b:'X1',shell:1,j:-1},{a:'X1',b:'X1',shell:2,j:.5},{a:'X1',b:'X1',shell:3,j:0}],m=new G.IsingCrystal({structure:C.preset('cP'),size:4,cutoff:1.8,pairRules:rules,initial:'up'}),t=m.topology;
  assert.equal(t.shellDistances.length,3);near(t.shellDistances[1]/t.crystal.nearest,Math.SQRT2);assert.equal(t.bondCount,(6+12)*64/2);near(m.energy,0);near(m.local(0).deltaEnergy,0);
  for(let i=0;i<m.count;i++){const x=i%4,y=Math.floor(i/4)%4,z=Math.floor(i/16);if((x+y+z)%2)m.flip(i);}near(m.energy,-6*64);near(m.recomputeEnergy(),m.energy);m.sweep(5);near(m.recomputeEnergy(),m.energy);
  assert.deepEqual(t.pairRules,rules);assert.ok(t.interactionTypes.find(a=>a.shell===3).directed===0);
});
test('multicomponent pair rules override defaults symmetrically, persist beyond cutoff and validate',()=>{
  const opts={structure:C.preset('nacl'),size:4,shape:'box',cutoff:1.5,initial:'up',jSame:1,jDifferent:1,pairRules:[{a:'Na',b:'Cl',shell:1,j:-1},{a:'Na',b:'Na',shell:2,j:.25}]},m=new G.IsingCrystal(opts),t=m.topology;
  assert.deepEqual(t.pairRules[0],{a:'Cl',b:'Na',shell:1,j:-1});assert.ok(t.interactionTypes.some(v=>v.a==='Cl'&&v.b==='Na'&&v.j===-1&&v.directed));assert.ok(t.interactionTypes.some(v=>v.a==='Na'&&v.b==='Na'&&v.j===.25&&v.directed));
  for(const i of t.activeIndices)for(let k=t.offsets[i];k<t.offsets[i+1];k++){const j=t.targets[k],type=t.interactionTypes[t.edgeTypes[k]];near(t.couplings[k],type.j);assert.ok(Array.from(t.targets.slice(t.offsets[j],t.offsets[j+1])).includes(i));}
  const narrow=new G.IsingCrystal({...opts,cutoff:1.08});assert.equal(narrow.topology.pairRules.length,2);assert.equal(narrow.topology.shellDistances.length,1);assert.ok(narrow.topology.couplings.every(j=>j===-1));
  assert.throws(()=>new G.IsingCrystal({...opts,pairRules:[opts.pairRules[0],{a:'Cl',b:'Na',shell:1,j:1}]}),/重复/);assert.throws(()=>new G.IsingCrystal({...opts,pairRules:[{a:'O',b:'Na',shell:1,j:1}]}),/无效/);
});
test('independent temperature scan retains the finite boundary and pair rules',()=>{
  const options={structure:C.preset('cP'),size:4,shape:'sphere',pairRules:[{a:'X1',b:'X1',shell:1,j:-1}],seed:17,warm:1,samples:16,points:2,min:1,max:2};const scan=new Scan(options);
  assert.equal(scan.options.shape,'sphere');assert.deepEqual(scan.options.pairRules,options.pairRules);assert.equal(scan.model.topology.bondCount,54);assert.ok(scan.model.topology.couplings.every(j=>j===-1));while(!scan.done)scan.step();assert.equal(scan.model.sweeps,34);
});
