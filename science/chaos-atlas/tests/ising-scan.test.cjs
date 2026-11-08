'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Ising3D,WINDOW}=require('../ising-model.js'),{Scan}=require('../ising-scan-core.js');
const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function run(options){const scan=new Scan(options),points=[];while(!scan.done){const r=scan.step();if(r.point)points.push(r.point);}return{scan,points};}

test('heating and cooling scan points equal independently advanced seeded Ising states',()=>{
  for(const direction of ['heat','cool']){
    const options={size:4,field:.3,seed:409,direction,warm:7,samples:23,points:5,min:2,max:6},actual=run(options);
    const temps=Array.from({length:5},(_,i)=>2+i);if(direction==='cool')temps.reverse();
    const reference=new Ising3D({size:4,field:.3,seed:409,temperature:temps[0],initial:direction==='heat'?'up':'random'});
    for(let i=0;i<temps.length;i++){
      reference.configure({temperature:temps[i]});reference.clearSamples();for(let j=0;j<7;j++)reference.sweep(1,false);for(let j=0;j<23;j++)reference.sweep(1,true);
      const s=reference.stats(),p=actual.points[i];assert.equal(p.temperature,temps[i]);assert.equal(p.samples,23);assert.equal(p.sweeps,(i+1)*30);
      for(const k of ['meanMagnetization','meanAbsMagnetization','meanEnergyPerSpin','susceptibility','heatCapacity'])near(p[k],s[k],1e-10);
      near(p.lastMagnetization,s.magnetization);near(p.lastEnergyPerSpin,s.energyPerSpin);
    }
    assert.equal(actual.scan.completed,150);assert.equal(actual.scan.total,150);assert.throws(()=>actual.scan.step());
  }
});

test('scans reproduce exactly for the same seed and reveal ordered-to-disordered trends without claiming equilibrium',()=>{
  const options={size:8,field:0,seed:77,direction:'heat',warm:64,samples:128,points:15,min:1,max:8};
  const a=run(options).points,b=run(options).points;assert.deepEqual(a,b);assert.ok(a[0].meanAbsMagnetization>.9);assert.ok(a.at(-1).meanAbsMagnetization<.2);
  assert.ok(a.every(p=>Number.isFinite(p.susceptibility)&&p.susceptibility>=0&&Number.isFinite(p.heatCapacity)&&p.samples===128));
});

test('scan validates all budgets and thermodynamic inputs before starting',()=>{
  for(const options of [{size:1},{size:33},{field:6},{seed:-1},{direction:'x'},{warm:-1},{warm:1001},{samples:15},{samples:WINDOW+1},{points:1},{points:42},{min:8,max:2},{min:0},{max:21}])assert.throws(()=>new Scan(options));
});

test('crystal temperature scan samples the selected graph and matches an independent graph model',()=>{
  const C=require('../crystal-model.js'),G=require('../ising-crystal-model.js');
  const o={structure:C.preset('hcp'),size:3,cutoff:1.08,jSame:.7,jDifferent:1,activeSpecies:['Mg'],field:.2,seed:19,direction:'heat',warm:3,samples:16,points:3,min:2,max:8};
  const scan=new Scan(o),manual=new G.IsingCrystal({...o,temperature:2,initial:'up'}),points=[];
  while(!scan.done){const r=scan.step();if(r.point)points.push(r.point);}
  for(let i=0;i<3;i++){
    if(i){manual.configure({temperature:2+i*3});manual.clearSamples();}manual.sweep(3,false);manual.sweep(16,true);const s=manual.stats(),p=points[i];
    assert.equal(p.samples,16);for(const key of ['meanMagnetization','meanAbsMagnetization','meanEnergyPerSpin','susceptibility','heatCapacity'])assert.ok(Math.abs(p[key]-s[key])<1e-10,key);
  }
  assert.equal(scan.model.topology.meanDegree,12);assert.equal(scan.options.structure.id,'hcp');
});
