'use strict';
// These tests validate the implemented teaching model, not real-air physics.
const test=require('node:test'),assert=require('node:assert/strict');
const {Streamer,GRIDS,EMPTY,CATHODE,ANODE}=require('../streamer-model.js');
const approx=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}, tolerance ${tol}`);
function initialized(options={}){const s=new Streamer({quality:'quick',...options});const r=s.solve();assert.equal(r.converged,true,JSON.stringify(r));return s;}
function runTo(m,t){while(m.time<t-1e-10){const r=m.step(Math.min(m.maxStep,t-m.time));assert.equal(r.ok,true,JSON.stringify(r));}return m;}
function total(m,arr){return arr.reduce((a,b)=>a+b,0)*m.h**3;}
function centroidY(m,a){let w=0,y=0;for(let q=0;q<m.count;q++){w+=a[q];y+=a[q]*m.coords(q).y*m.h;}return y/w;}
function maxDiff(a,b){let max=0;for(let q=0;q<a.length;q++)max=Math.max(max,Math.abs(a[q]-b[q]));return max;}
function finitePositive(m){for(let q=0;q<m.count;q++)assert.ok(Number.isFinite(m.electrons[q])&&m.electrons[q]>=0&&Number.isFinite(m.ions[q])&&m.ions[q]>=0,`index ${q}`);}

test('grids, neutral initial seed, electrodes, units and independent snapshots',()=>{
  for(const [quality,g] of Object.entries(GRIDS)){
    const m=new Streamer({quality});assert.deepEqual([m.nx,m.ny,m.nz],[g.nx,g.ny,g.nz]);approx(m.width,24);approx(m.height,36);approx(m.totalCharge(),0);
    let positive=0;for(let q=0;q<m.count;q++){if(m.mask[q]===EMPTY){if(m.electrons[q]>0)positive++;assert.equal(m.ions[q],m.electrons[q]);}
      else {assert.equal(m.electrons[q],0);assert.equal(m.ions[q],0);assert.equal(m.potential[q],m.mask[q]===CATHODE?0:m.voltage);}}
    assert.ok(positive>0);const snap=m.snapshot();snap.electrons.fill(0);assert.ok(m.stats().electrons>0);
  }
});

test('Poisson solver matches a manufactured constant-charge solution with insulating sidewalls',()=>{
  const m=new Streamer({quality:'quick',field:.5,tolerance:1e-7}),rho=.02,L=m.height;
  for(let z=0;z<m.nz;z++)for(let y=0;y<m.ny;y++)for(let x=0;x<m.nx;x++){
    const q=m.index(x,y,z);m.mask[q]=y===0?CATHODE:y===m.ny-1?ANODE:EMPTY;
    m.electrons[q]=0;m.ions[q]=m.mask[q]===EMPTY?rho:0;m.potential[q]=m.voltage*y/(m.ny-1);
  }
  assert.ok(m.solve().converged);assert.ok(m.residual()<=1e-7);
  let max=0;for(let z=0;z<m.nz;z++)for(let y=1;y<m.ny-1;y++)for(let x=0;x<m.nx;x++){
    const Y=y*m.h,exact=m.voltage*Y/L+rho*Y*(L-Y)/2;max=Math.max(max,Math.abs(m.potential[m.index(x,y,z)]-exact));
  }
  assert.ok(max<1e-5,`max error ${max}`);
});

test('space charge changes the solution; switching feedback off holds the applied field',()=>{
  const on=initialized({field:.5}),off=initialized({field:.5,feedback:false});
  const q=on.index(8,12,8);on.ions[q]+=.5;off.ions[q]+=.5;
  assert.ok(on.solve().converged);assert.ok(off.solve().converged);assert.ok(on.potential[q]-off.potential[q]>.1);
  assert.ok(on.residual()<=on.tolerance&&off.residual()<=off.tolerance);
});

test('zero field: pure diffusion spreads electrons, without pair creation',()=>{
  const m=initialized({field:0,feedback:false}),max=m.stats().maxElectron,e0=total(m,m.electrons),i0=total(m,m.ions);
  runTo(m,6);finitePositive(m);assert.equal(m.stats().maxField,0);assert.equal(m.produced,0);assert.ok(m.stats().maxElectron<max);
  approx(total(m,m.electrons)+m.absorbedE,e0,1e-10);approx(total(m,m.ions)+m.absorbedI,i0,1e-10);
  assert.ok(m.absorbedE>0);approx(m.stats().chargeBudget,0,1e-10);
});

test('a neutral zero-seed state remains exactly empty',()=>{
  const m=initialized({amplitude:0});runTo(m,2);assert.equal(total(m,m.electrons),0);assert.equal(total(m,m.ions),0);assert.equal(m.produced,0);finitePositive(m);
});

test('electrons and positive ions drift in opposite directions in a fixed applied field',()=>{
  const m=initialized({feedback:false,ionMobility:.12,diffusion:0});
  for(let q=0;q<m.count;q++)if(!m.mask[q]){const {x,y,z}=m.coords(q);const r=(x-8)**2+(y-12)**2+(z-8)**2;m.electrons[q]=m.ions[q]=.01*Math.exp(-r/5);}
  const before=centroidY(m,m.electrons);
  // Remove the local Townsend reaction just for this transport unit test;
  // the face field, and hence drift velocities, still come from potential.
  while(m.time<2){m.ex.fill(0);m.ey.fill(0);m.ez.fill(0);assert.ok(m.step().ok);}
  assert.ok(centroidY(m,m.electrons)>before+.5);assert.ok(centroidY(m,m.ions)<before-.05);finitePositive(m);
});

test('conservative transport, equal ionization pairs and electrode absorption balance each species',()=>{
  const m=initialized(),e0=total(m,m.electrons),i0=total(m,m.ions);runTo(m,20);finitePositive(m);const s=m.stats();
  assert.ok(s.produced>e0);assert.ok(s.absorbedElectrons>0&&s.absorbedIons>0);
  approx(s.electrons+s.absorbedElectrons-e0-s.produced,0,1e-8);
  approx(s.ions+s.absorbedIons-i0-s.produced,0,1e-8);approx(s.chargeBudget,0,1e-8);
  assert.ok(s.lastStep>0&&s.residual<=m.tolerance);
});

test('self-consistent and frozen-field runs diverge from the same neutral initial seed',()=>{
  const a=initialized({field:.8,amplitude:.1}),b=initialized({field:.8,amplitude:.1,feedback:false}),initial=b.potential.slice();
  runTo(a,6);runTo(b,6);assert.ok(maxDiff(b.potential,initial)<.001);assert.ok(maxDiff(a.potential,b.potential)>.1);
  assert.ok(Math.abs(a.stats().electrons-b.stats().electrons)>1);assert.ok(a.stats().residual<=a.tolerance);
});

test('adaptive timestep respects transport, reaction and dielectric relaxation constraints',()=>{
  const m=initialized({field:.8});const initial=m.stableStep();assert.ok(initial>0&&initial<=m.maxStep);
  m.maxConductivity=100;assert.ok(m.stableStep()<=.0035+1e-12);
  m.maxConductivity=0;m.maxIonizationRate=20;assert.ok(m.stableStep()<=.011+1e-12);
  m.maxIonizationRate=0;m.maxFace=[100,100,100];assert.ok(m.stableStep()<=.42/(300/m.h+6*m.diffusion/m.h**2)+1e-12);
});

test('a failed Poisson iteration rolls back density, field, time and the last valid residual',()=>{
  const m=initialized({tolerance:1e-7});const e=m.electrons.slice(),i=m.ions.slice(),phi=m.potential.slice(),stats=m.stats();
  m.maxSweeps=1;const r=m.step();assert.equal(r.ok,false);assert.equal(r.reason,'unconverged');
  assert.deepEqual(m.electrons,e);assert.deepEqual(m.ions,i);assert.deepEqual(m.potential,phi);assert.deepEqual(m.stats(),stats);
});

test('smaller time steps approach one another on a fixed grid and geometry',()=>{
  const values=[];for(const maxStep of [.08,.04,.02]){const m=initialized({maxStep});runTo(m,6);values.push(m.stats().electrons);}
  const [a,b,c]=values;assert.ok(Math.abs(b-c)<Math.abs(a-b));assert.ok(Math.abs(b-c)/c<.003);
});

test('moving either electrode changes the solved boundary and the neutral seed follows the cathode',()=>{
  const a=initialized(),b=initialized({sourceX:4,sourceZ:6,targetX:12,targetZ:10});
  assert.ok(maxDiff(a.potential,b.potential)>1);assert.notEqual(a.stats().peakIndex,b.stats().peakIndex);
  for(const m of [a,b])for(let q=0;q<m.count;q++)if(m.mask[q])assert.equal(m.potential[q],m.mask[q]===CATHODE?0:m.voltage);
  assert.ok(b.solveInfo.residual<=b.tolerance);
});

test('all three resolutions advance with finite densities and a moving ionization front',()=>{
  for(const quality of Object.keys(GRIDS)){
    const m=initialized({quality}),start=m.stats();runTo(m,3);const end=m.stats();finitePositive(m);
    assert.ok(end.tipY>start.tipY,quality);assert.ok(end.electrons>start.electrons,quality);
    assert.ok(end.residual<=m.tolerance,quality);approx(end.chargeBudget,0,1e-8);
  }
});
