'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Ising3D,WINDOW,CRITICAL_T}=require('../ising-model.js');
function near(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} ± ${tol}`);}
function exactL2(T,h){
  const n=2,N=8,states=[];
  let Z=0,M=0,A=0,E=0;
  for(let bits=0;bits<256;bits++){
    const spin=i=>(bits>>i)&1?1:-1,idx=(x,y,z)=>x+n*y+n*n*z;
    let bonds=0,mag=0;
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const s=spin(idx(x,y,z));mag+=s;
      bonds+=s*(spin(idx((x+1)%n,y,z))+spin(idx(x,(y+1)%n,z))+spin(idx(x,y,(z+1)%n)));
    }
    const energy=-bonds-h*mag,weight=Math.exp(-energy/T);Z+=weight;M+=weight*mag/N;A+=weight*Math.abs(mag/N);E+=weight*energy/N;states.push({energy,mag,weight});
  }
  return {m:M/Z,abs:A/Z,e:E/Z,states};
}

test('periodic neighbours and the all-aligned ground-state energy are exact',()=>{
  for(const L of [2,3,8,20])for(const h of [-.7,0,.8]){
    const m=new Ising3D({size:L,temperature:3,field:h,initial:'up'}),N=L**3,s=m.stats();
    assert.equal(s.magnetization,1);near(s.energyPerSpin,-3-h);near(s.neighborCorrelation,1);assert.equal(m.neighborSum(0),6);assert.equal(m.neighborSum(N-1),6);
    assert.equal(m.neighbors[1],L-1);assert.equal(m.neighbors[3],L*(L-1));assert.equal(m.neighbors[5],L*L*(L-1));
    near(m.recomputeEnergy(),m.energy);assert.equal(s.sampleCount,0);assert.equal(s.susceptibility,null);assert.equal(s.heatCapacity,null);
  }
});

test('single-site energy changes and Metropolis acceptance use all six periodic bonds',()=>{
  const spins=Int8Array.from({length:64},(_,i)=>i%3?1:-1),m=new Ising3D({size:4,temperature:3.3,field:.37,seed:53,spins});
  for(let i=0;i<m.count;i++){
    const before=m.recomputeEnergy(),local=m.local(i),sum=m.spinSum,s=m.spins[i];
    near(local.deltaEnergy,2*s*(local.neighborSum+.37));near(local.probability,Math.min(1,Math.exp(-local.deltaEnergy/3.3)),1e-15);
    m.flip(i);near(m.energy-before,local.deltaEnergy,1e-10);near(m.energy,m.recomputeEnergy(),1e-9);assert.equal(m.spinSum,sum-2*s);m.flip(i);near(m.energy,before,1e-9);
  }
  assert.equal(m.sweeps,0);assert.equal(m.manualFlips,128);assert.equal(m.sampleCount,0);
});

test('the exact 2×2×2 partition function agrees with independent long-run Metropolis samples',()=>{
  const T=5.2,h=.34,expected=exactL2(T,h),m=new Ising3D({size:2,temperature:T,field:h,seed:4912,initial:'random'});
  m.sweep(1000,false);let a=0,b=0,c=0;const samples=50000;
  for(let i=0;i<samples;i++){m.sweep(4,false);const s=m.stats();a+=s.magnetization;b+=Math.abs(s.magnetization);c+=s.energyPerSpin;}
  near(a/samples,expected.m,.035);near(b/samples,expected.abs,.015);near(c/samples,expected.e,.05);
  near(m.energy,m.recomputeEnergy(),1e-7);
});

test('seeded random-site sweeps are reproducible and the incremental energy stays correct',()=>{
  for(const initial of ['random','up','down','domains']){
    const options={size:8,temperature:4.51,field:.31,seed:0,initial},a=new Ising3D(options),b=new Ising3D(options);
    for(let i=0;i<40;i++){
      a.sweep(3);b.sweep(3);assert.deepEqual(a.spins,b.spins);near(a.energy,b.energy);near(a.energy,a.recomputeEnergy(),2e-9);
      assert.equal(a.sweeps,(i+1)*3);assert.equal(a.stats().attempts,3*a.count);assert.ok(a.stats().acceptance>=0&&a.stats().acceptance<=1);
    }
  }
});

test('parameter changes preserve spins, clock and RNG, update field energy and invalidate only the sample window',()=>{
  const m=new Ising3D({size:8,temperature:2.8,seed:19});m.sweep(24);const before=m.spins.slice(),time=m.sweeps,rng=m.rngState,energy=m.energy,sum=m.spinSum;
  assert.equal(m.configure({temperature:6.1,field:-.7}),true);assert.deepEqual(m.spins,before);assert.equal(m.sweeps,time);assert.equal(m.rngState,rng);
  near(m.energy,energy+.7*sum);near(m.energy,m.recomputeEnergy(),1e-8);assert.equal(m.sampleCount,0);assert.equal(m.stats().acceptance,null);
  m.sweep(16);assert.equal(m.sampleCount,16);assert.equal(m.configure({temperature:6.1,field:-.7}),false);assert.equal(m.sampleCount,16);
  const snapshot={spins:m.spins.slice(),T:m.temperature,h:m.field,E:m.energy,rng:m.rngState,count:m.sampleCount};
  assert.throws(()=>m.configure({temperature:4,field:6}));assert.throws(()=>m.configure({temperature:NaN,field:0}));
  assert.deepEqual(m.spins,snapshot.spins);assert.equal(m.temperature,snapshot.T);assert.equal(m.field,snapshot.h);assert.equal(m.energy,snapshot.E);assert.equal(m.rngState,snapshot.rng);assert.equal(m.sampleCount,snapshot.count);
});

test('rolling observables use real sweeps and the documented finite-window formulas',()=>{
  const m=new Ising3D({size:8,temperature:4.5115,field:0,seed:1234});m.sweep(400);
  assert.equal(m.sampleCount,WINDOW);const values=[...m.sampleM],energies=[...m.sampleE],mean=a=>a.reduce((x,y)=>x+y,0)/a.length,mu=mean(values),e=mean(energies);
  const variance=a=>mean(a.map(x=>(x-mean(a))**2)),stats=m.stats();
  near(stats.meanMagnetization,mu);near(stats.meanAbsMagnetization,mean(values.map(Math.abs)));near(stats.meanEnergyPerSpin,e);
  near(stats.susceptibility,m.count*variance(values)/m.temperature);near(stats.heatCapacity,m.count*variance(energies)/(m.temperature*m.temperature));
  const before=m.sweeps,rng=m.rngState;m.flip(3);assert.equal(m.sweeps,before);assert.equal(m.rngState,rng);assert.equal(m.sampleCount,0);assert.equal(m.stats().susceptibility,null);
});

test('the same model exhibits low-temperature order, high-temperature disorder and field bias',()=>{
  function run(T,h,init,seed){const m=new Ising3D({size:12,temperature:T,field:h,initial:init,seed});m.sweep(600,false);m.sweep(200);return m.stats();}
  const cold=run(2.5,0,'up',82),hot=run(8,0,'random',82),plus=run(7,1,'random',82),minus=run(7,-1,'random',82);
  assert.ok(cold.meanAbsMagnetization>.85);assert.ok(hot.meanAbsMagnetization<.15);assert.ok(cold.neighborCorrelation>hot.neighborCorrelation+.5);
  assert.ok(plus.meanMagnetization>.2);assert.ok(minus.meanMagnetization<-.2);assert.ok(hot.meanAbsMagnetization<plus.meanMagnetization);
});

test('validation rejects invalid inputs and never corrupts the previous state',()=>{
  for(const opts of [{size:1},{size:33},{size:3.5},{temperature:0},{temperature:Infinity},{field:NaN},{field:6},{seed:-1},{seed:2**32},{initial:'oops'},{size:2,spins:[1,2]}])assert.throws(()=>new Ising3D(opts));
  const m=new Ising3D({size:4});const before=m.spins.slice();for(const i of [-1,64,2.5,NaN]){assert.throws(()=>m.local(i));assert.throws(()=>m.flip(i));}for(const n of [0,-1,1.5,2001,NaN])assert.throws(()=>m.sweep(n));
  assert.deepEqual(m.spins,before);assert.equal(m.sweeps,0);assert.equal(CRITICAL_T,4.5115);
});

test('Metropolis transition probabilities satisfy detailed balance for every 2³ microstate and single-spin transition',()=>{
  const size=2,T=3.75,h=.28,N=8;
  for(let bits=0;bits<256;bits++){
    const spins=Int8Array.from({length:N},(_,i)=>(bits>>i)&1?1:-1),model=new Ising3D({size,temperature:T,field:h,spins});
    for(let i=0;i<N;i++){
      const before=model.local(i),energy=model.energy;model.flip(i);const after=model.local(i);
      near(before.deltaEnergy,-after.deltaEnergy,1e-12);
      const forward=Math.exp(-energy/T)*before.probability,reverse=Math.exp(-model.energy/T)*after.probability;
      near(forward,reverse,Math.max(1,forward,reverse)*2e-14);model.flip(i);
    }
  }
});

test('all user-facing temperature, field and lattice extremes remain finite and match recomputed energy',()=>{
  for(const size of [12,24])for(const temperature of [1,8])for(const field of [-1.5,0,1.5])for(const initial of ['up','random']){
    const m=new Ising3D({size,temperature,field,initial,seed:43});m.sweep(35);const s=m.stats();
    near(s.energy,m.recomputeEnergy(),1e-7);assert.ok(Number.isFinite(s.magnetization)&&Number.isFinite(s.energyPerSpin));
    assert.ok(s.neighborCorrelation>=-1-1e-12&&s.neighborCorrelation<=1+1e-12);assert.ok(s.acceptance>=0&&s.acceptance<=1);
    assert.ok(Number.isFinite(s.susceptibility)&&Number.isFinite(s.heatCapacity));for(const spin of m.spins)assert.ok(spin===1||spin===-1);
  }
});

test('half-domain initial state has two real periodic walls and the expected energy',()=>{
  for(const size of [2,4,12,20,24])for(const field of [-1,0,.7]){
    const m=new Ising3D({size,temperature:3,field,seed:37,initial:'domains'}),s=m.stats();
    assert.equal(s.magnetization,0);near(s.energyPerSpin,-3+4/size,1e-12);assert.equal(m.rngState,37);
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)assert.equal(m.spins[x+size*y+size*size*z],x<size/2?1:-1);
    const walls=[0,size/2-1,size/2,size-1];for(const x of walls)assert.equal(m.neighborSum(x),m.spins[x]*(size===2?2:4));
    if(size>4)assert.equal(m.neighborSum(2),6);m.sweep(20);near(m.energy,m.recomputeEnergy(),1e-7);
  }
});
