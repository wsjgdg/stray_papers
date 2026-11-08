'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../fluid-analysis.js'),F=require('../fluid-model.js');
const stats=(time,gap,speed,div=.01)=>({time,dyeCenterA:-gap/2,dyeCenterB:gap/2,maxSpeed:speed,divergenceRms:div});
const near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
test('comparison records actual telemetry and interpolates only within recorded time',()=>{
  const p=[];A.append(p,stats(0,.8,2));A.append(p,stats(.04,.6,2.2));A.append(p,stats(.08,.3,2.1));
  assert.deepEqual(A.at(p,-.1),null);assert.deepEqual(A.at(p,.1),null);
  const mid=A.at(p,.02);near(mid.gap,.7);near(mid.maxSpeed,2.1);near(A.at(p,.08).gap,.3);
  A.append(p,stats(.08,.2,3));assert.equal(p.length,3);near(A.at(p,.08).gap,.2);
  assert.throws(()=>A.append(p,stats(0,1,1)),/backward/);
});
test('comparison history stays bounded while preserving its first and last samples',()=>{
  const p=[];for(let i=0;i<4000;i++)A.append(p,stats(i*.04,i,2));
  assert.ok(p.length<=A.MAX_POINTS);near(p[0].time,0);near(p.at(-1).time,3999*.04);
  for(let i=1;i<p.length;i++)assert.ok(p[i].time>p[i-1].time);
});
test('comparison labels distinguish physical, numerical, and externally forced experiments',()=>{
  const p={initial:{...F.PRESETS.chase},viscosity:.006,diffusivity:.0005,grid:'standard',dt:.04,iterations:32,forced:false};
  assert.match(A.context(p,{...p,grid:'high'}),/数值设置不同/);
  assert.match(A.context(p,{...p,dt:.02}),/数值设置不同/);
  assert.match(A.context(p,{...p,viscosity:.03}),/物理参数/);
  assert.match(A.context(p,{...p,forced:true}),/交互外力/);
  assert.match(A.context(p,{...p}),/重复运行/);
});
