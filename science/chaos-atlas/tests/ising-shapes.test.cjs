'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../crystal-model.js'),G=require('../ising-crystal-model.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
test('open cubic boundaries remove real bonds and have the analytically expected energy and surface',()=>{
  const opts={structure:C.preset('cP'),size:4,initial:'up',shape:'box'},m=new G.IsingCrystal(opts),t=m.topology;
  assert.equal(t.presentCount,64);assert.equal(t.activeIndices.length,64);assert.equal(t.bondCount,3*3*4*4);assert.equal(t.surfaceCount,56);assert.equal(t.offsets[1]-t.offsets[0],3);near(m.energy,-144);assert.ok(t.wrapped.every(x=>x===0));
  const p=new G.IsingCrystal({...opts,shape:'periodic'});assert.equal(p.topology.bondCount,192);assert.equal(p.topology.surfaceCount,0);near(p.energy,-192);assert.equal(p.local(0).degree,6);
});
test('sphere, cylinder and hexagonal prism mask actual sites and interactions, not only rendering',()=>{
  for(const id of ['cP','hcp','nacl','spinel','albite'])for(const shape of ['sphere','cylinder','hex']){
    const m=new G.IsingCrystal({structure:C.preset(id),size:4,shape,seed:12,initial:'random'}),t=m.topology;
    assert.ok(t.presentCount>0&&t.presentCount<t.count,`${id}/${shape}`);assert.ok(t.surfaceCount>0);assert.ok(t.wrapped.every(x=>x===0));
    for(const i of t.activeIndices){assert.equal(t.present[i],1);for(let k=t.offsets[i];k<t.offsets[i+1];k++)assert.equal(t.spinActive[t.targets[k]],1);}
    assert.ok(m.spins.every((s,i)=>t.spinActive[i]?Math.abs(s)===1:s===0));near(m.energy,m.recomputeEnergy(),1e-8);
    for(let k=0;k<Math.min(10,m.spinCount);k++){const i=t.activeIndices[k],old=m.recomputeEnergy(),delta=m.local(i).deltaEnergy;m.flip(i);near(m.recomputeEnergy()-old,delta,1e-8);near(m.energy,m.recomputeEnergy(),1e-8);}
    m.sweep(4);near(m.energy,m.recomputeEnergy(),1e-8);
  }
});
test('shape masks use Cartesian distances and inactive species remain visible only inside the sample',()=>{
  const m=new G.IsingCrystal({structure:C.preset('nacl'),size:6,shape:'sphere',activeSpecies:['Na']}),t=m.topology;
  assert.equal(t.activeSpecies.join(','),'Na');assert.ok(t.presentCount>m.spinCount);assert.ok(t.count>t.presentCount);
  for(let i=0;i<t.count;i++){
    const site=i%t.siteCount,cell=Math.floor(i/t.siteCount),n=t.size,f=t.crystal.sites[site].fraction,p=C.point(t.crystal.vectors,[cell%n+f[0],Math.floor(cell/n)%n+f[1],Math.floor(cell/(n*n))+f[2]]),r=Math.hypot(...p.map((v,k)=>v-t.shapeData.center[k]));
    assert.equal(!!t.present[i],r<=t.shapeData.radius+1e-9);assert.equal(!!t.spinActive[i],!!t.present[i]&&t.siteActive[site]);
  }
  const excluded=t.present.findIndex(v=>!v);assert.equal(m.local(excluded).present,false);assert.throws(()=>m.flip(excluded));assert.throws(()=>new G.IsingCrystal({structure:C.preset('cP'),shape:'banana'}),/未知边界/);
});
