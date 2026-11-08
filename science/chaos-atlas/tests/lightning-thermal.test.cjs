'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Electrothermal}=require('../lightning-thermal.js'),{Discharge}=require('../lightning-model.js');
function sample(){const mask=new Uint8Array(27);mask[13]=2;return {nx:3,ny:3,nz:3,mask,segments:Int32Array.from([0,1,1,2,1,4,4,13]),stats:{complete:true}};}
function close(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}
test('post-contact tree has one conductive path; dangling branches carry no steady current',()=>{
  const m=new Electrothermal(sample(),{voltage:2,ballast:.5,cooling:.5});assert.deepEqual([...m.onPath],[1,0,1,1]);
  close(m.current,2/(.5+m.resistanceTotal));close(m.currents[1],0);close(m.power[1],0);close(m.nodeVoltage[2],m.nodeVoltage[1]);close(m.nodeVoltage[13],0);
  close(m.sourcePower,m.channelPower+m.ballastPower);for(let i=0;i<40;i++)assert.ok(m.step(.04).ok);
  assert.equal(m.temperature[1],1);assert.ok(m.temperature[0]>1);assert.ok(Math.abs(m.stats().budget)<1e-12);
});
test('voltage and cooling change actual current and temperature while preserving the energy budget',()=>{
  const a=new Electrothermal(sample(),{voltage:1,cooling:0}),b=new Electrothermal(sample(),{voltage:2,cooling:1});
  for(let i=0;i<100;i++){assert.ok(a.step(.02).ok);assert.ok(b.step(.02).ok);}
  assert.ok(b.maxTemperature>a.maxTemperature);assert.ok(b.current>a.current);assert.ok(b.lost>0);assert.ok(Math.abs(b.stats().budget)<1e-11);
  b.setParameters({voltage:0,cooling:1});const before=b.maxTemperature;for(let i=0;i<40;i++)assert.ok(b.step(.04).ok);assert.ok(b.maxTemperature<before);assert.equal(b.current,0);assert.ok(Math.abs(b.stats().budget)<1e-11);
});
test('invalid, incomplete or disconnected topologies cannot be mislabeled as conductive',()=>{
  assert.throws(()=>new Electrothermal({...sample(),stats:{complete:false}}),/已接触/);
  assert.throws(()=>new Electrothermal({...sample(),segments:Int32Array.from([0,1,5,13])}),/连接无效/);
  const bad=sample();bad.mask[13]=0;assert.throws(()=>new Electrothermal(bad),/目标/);
});
test('a real DBM contact feeds the separate circuit without modifying the computed tree',()=>{
  const m=new Discharge({quality:'quick',eta:4.6,seed:27});assert.ok(m.solve().converged);for(let i=0;i<200&&!m.complete;i++)assert.ok(m.step().ok);assert.ok(m.complete);
  const d=m.snapshot(),old=Array.from(d.segments),t=new Electrothermal(d);for(let i=0;i<20;i++)assert.ok(t.step().ok);
  assert.deepEqual(Array.from(d.segments),old);assert.ok(t.onPath.some(Boolean));assert.ok(t.current>0);assert.ok(Math.abs(t.stats().budget)<1e-10);
});
test('electrode scaffold is equipotential and excluded from channel heating',()=>{
  const m=new Discharge({quality:'quick',electrodeShape:'blunt',electrodeRadius:.08,electrodeLength:.16,eta:6,seed:3});assert.ok(m.solve().converged);
  for(let i=0;i<300&&!m.complete;i++)assert.ok(m.step().ok);assert.ok(m.complete);
  const t=new Electrothermal(m.snapshot());for(let i=0;i<30;i++)assert.ok(t.step().ok);
  for(let e=0;e<t.seedSegmentCount;e++){assert.equal(t.resistance(e),0);assert.equal(t.currents[e],0);assert.equal(t.power[e],0);assert.equal(t.temperature[e],1);}
  assert.ok(t.current>0);assert.ok(Math.abs(t.stats().budget)<1e-10);
});
test('electrothermal safety stop preserves the last valid state and is not a physical breakdown threshold',()=>{
  const t=new Electrothermal(sample(),{voltage:5,cooling:0,ballast:.1});let r={ok:true},count=0;
  while(r.ok&&count++<10000){const before=Array.from(t.temperature),time=t.time;r=t.step(.04);if(!r.ok){assert.deepEqual(Array.from(t.temperature),before);assert.equal(t.time,time);}}
  assert.equal(r.ok,false);assert.match(r.reason,/不是物理击穿判据/);assert.ok(Math.abs(t.stats().budget)<1e-9);
});
