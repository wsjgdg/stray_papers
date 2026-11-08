'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),Old=require('../ising-model.js'),I=require('../ising-analysis.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} ± ${t}`);
const graph=(id,size=4,extra={})=>G.createTopology({structure:C.preset(id),size,...extra});

test('periodic crystal graphs change actual site positions, coordination and connectivity',()=>{
  for(const [id,sites,degree] of [['cP',1,6],['cI',2,8],['cF',4,12],['hcp',2,12],['diamond',8,4],['cscl',2,8]]){
    const t=graph(id);assert.equal(t.siteCount,sites,id);assert.equal(t.count,sites*64,id);near(t.meanDegree,degree);assert.equal(t.components,1);
    assert.ok(t.activeIndices.every(i=>t.offsets[i+1]-t.offsets[i]===degree));
  }
  assert.notDeepEqual(graph('cP').crystal.vectors.B,graph('hcp').crystal.vectors.B);
  const albite=graph('albite',4);assert.equal(albite.species.length,4);assert.ok(albite.components>1);assert.ok(albite.meanDegree<4);
});

test('every preset gives paired periodic interactions and consistent multielement local fields',()=>{
  for(const p of [...C.BRAVAIS,...C.PROTOTYPES]){
    const top=graph(p.id,3),n=top.count;
    assert.ok(n>0&&top.activeIndices.length===n,p.id);
    for(let i=0;i<n;i++)for(let k=top.offsets[i];k<top.offsets[i+1];k++){
      const j=top.targets[k],a=[];for(let q=top.offsets[j];q<top.offsets[j+1];q++)if(top.targets[q]===i&&top.couplings[q]===top.couplings[k])a.push(q);
      assert.ok(a.length>0,`${p.id}: ${i}->${j}`);
    }
    const m=new G.IsingCrystal({structure:C.preset(p.id),size:3,initial:'up'});near(m.energy,m.recomputeEnergy(),1e-8);near(m.stats().neighborCorrelation,1);
  }
});

test('the generic simple cubic graph exactly reproduces the original Ising energy and seeded sweeps',()=>{
  for(const L of [2,3,4])for(let mask=0;mask<(L===2?256:1);mask++){
    const n=L**3,spins=Int8Array.from({length:n},(_,i)=>mask&(1<<i)?1:-1),opts={size:L,spins,field:.37,temperature:3.7,seed:21};
    const a=new Old.Ising3D(opts),b=new G.IsingCrystal({...opts,structure:C.preset('cP')});near(a.energy,b.energy,1e-10);
    for(let i=0;i<n;i++){near(a.local(i).deltaEnergy,b.local(i).deltaEnergy,1e-10);near(a.local(i).probability,b.local(i).probability,1e-12);}
  }
  const opts={size:6,field:.2,temperature:4.3,seed:87,initial:'random'},a=new Old.Ising3D(opts),b=new G.IsingCrystal({...opts,structure:C.preset('cP')});
  for(let k=0;k<40;k++){a.sweep(1);b.sweep(1);assert.deepEqual([...a.spins],[...b.spins]);near(a.energy,b.energy,1e-9);near(a.stats().neighborCorrelation,b.stats().neighborCorrelation,1e-12);}
  const ia=I.interfaces(6,a.spins),ib=G.interfaces(b.topology,b.spins);assert.equal(ia.sites,ib.sites);assert.equal(ia.bonds,ib.bonds);assert.deepEqual([...ia.mask],[...ib.mask]);
});

test('same- and different-species interactions genuinely enter energy and flip probabilities',()=>{
  const opts={structure:C.preset('cscl'),size:3,temperature:2,field:.25,jSame:0,jDifferent:-1,initial:'up'},ferro=new G.IsingCrystal(opts);
  near(ferro.stats().energyPerSpin,4-.25);near(ferro.local(0).weightedSum,-8);near(ferro.local(0).deltaEnergy,2*(-8+.25));
  const alternating=Int8Array.from(ferro.spins,(_,i)=>i%2? -1:1),anti=new G.IsingCrystal({...opts,spins:alternating});near(anti.stats().energyPerSpin,-4);near(anti.stats().neighborCorrelation,-1);
  for(let i=0;i<anti.count;i++){const before=anti.recomputeEnergy(),delta=anti.local(i).deltaEnergy;anti.flip(i);near(anti.recomputeEnergy()-before,delta,1e-9);near(anti.energy,anti.recomputeEnergy(),1e-9);anti.flip(i);}
  const iface=G.interfaces(anti.topology,anti.spins);assert.equal(iface.siteFraction,1);assert.equal(iface.bondFraction,1);
});

test('user-disabled species are inactive rather than artificial spins, and disconnected models are reported',()=>{
  const opts={structure:C.preset('nacl'),size:4,cutoff:1.08,activeSpecies:['Na'],initial:'up',field:.2},m=new G.IsingCrystal(opts),t=m.topology;
  assert.equal(m.count,512);assert.equal(m.spinCount,256);assert.equal(t.components,256);assert.equal(t.bondCount,0);assert.equal(m.stats().neighborCorrelation,null);near(m.energy,-.2*256);assert.equal(G.interfaces(t,m.spins).bondFraction,null);
  const inactive=m.spins.findIndex(s=>s===0);assert.equal(m.local(inactive).probability,null);assert.throws(()=>m.flip(inactive),/未启用自旋/);
  const before=m.sweeps;m.sweep(1);assert.equal(m.sweeps,before+1);assert.equal(m.lastAttempts,256);assert.ok(m.spins.filter(s=>s===0).length===256);
  const expanded=graph('nacl',4,{cutoff:1.42,activeSpecies:['Na']});near(expanded.meanDegree,12);assert.equal(expanded.components,1);
});

test('incremental energies, sample windows, temperature and field updates remain consistent with the graph Hamiltonian',()=>{
  const m=new G.IsingCrystal({structure:C.preset('spinel'),size:3,seed:99,temperature:6,field:.4,jSame:.6,jDifferent:-.7});
  for(let i=0;i<80;i++){m.sweep(1);near(m.energy,m.recomputeEnergy(),1e-7);}assert.equal(m.stats().sampleCount,80);assert.ok(Number.isFinite(m.stats().susceptibility));
  const spins=[...m.spins],oldSweeps=m.sweeps;m.configure({temperature:2,field:-.3});near(m.energy,m.recomputeEnergy(),1e-7);assert.equal(m.sampleCount,0);assert.equal(m.sweeps,oldSweeps);assert.deepEqual([...m.spins],spins);
  for(let i=0;i<20;i++){const k=m.topology.activeIndices[(i*41)%m.spinCount],before=m.recomputeEnergy(),d=m.local(k).deltaEnergy;m.flip(k);near(m.recomputeEnergy()-before,d,1e-8);}
  near(m.energy,m.recomputeEnergy(),1e-7);
});

test('validation and resource budgets reject invalid spin structures without mutating inputs',()=>{
  const p=C.preset('cP'),before=JSON.stringify(p);for(const opts of [{size:1},{size:32},{activeSpecies:[]},{activeSpecies:['O']},{jSame:3},{jDifferent:NaN},{cutoff:1.9}])assert.throws(()=>graph('cP',4,opts));
  assert.equal(JSON.stringify(p),before);assert.throws(()=>new G.IsingCrystal({structure:p,size:3,temperature:0}));
  assert.throws(()=>new G.IsingCrystal({structure:p,size:3,spins:new Int8Array(27)}));
});
