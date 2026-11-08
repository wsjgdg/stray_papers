'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),O=require('../relativity-optics.js'),G=require('../relativity-geometry-pack.js');
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('harbor contains finite intersectable containers, forklift, gantry and a separately movable light',()=>{
  const origin=[0,1.65,0];
  for(const [target,kind] of [[[-6.5,1.31,8],'cargo-container'],[[4.35,.66,6.2],'forklift'],[[0,8.5,18],'gantry']]){
    const direction=M.normalize(M.sub(target,origin)),hit=W.trace(origin,direction,'harbor');
    assert.equal(hit?.kind,kind);assert.ok(hit.distance>0&&Number.isFinite(hit.distance));
  }
  const initial=O.keyLight('harbor',origin),shifted=O.keyLight('harbor',origin,{lightX:2,lightZ:-1});
  assert.equal(initial.kind,'point');assert.deepEqual(initial.position,[0,7.38,10.8]);assert.deepEqual(shifted.position,[2,7.38,9.8]);
  for(const [state,source] of [[{},initial],[{lightX:2,lightZ:-1},shifted]]){
    const fixture=W.lightFixture('harbor',state),aim=M.normalize(M.sub(fixture.center,origin));
    const hit=W.traceWithFixture(origin,aim,'harbor',false,state);
    assert.equal(hit?.kind,'key-light');assert.equal(hit.movableFixture,true);
    assert.equal(fixture.center[0],source.position[0]);assert.equal(fixture.center[2],source.position[2]);
  }
  const packed=G.pack().layout.harbor;assert.ok(packed.nodeCount<=128);assert.ok(packed.primitiveCount>75);assert.ok(packed.artifactCount<=12);
});

test('moving cargo rails have their own Lorentz-transformed intersections and spectral factors',()=>{
  const half=M.objectHalf('harbor','artifact'),details=M.objectParts('harbor','artifact');
  assert.ok(details.filter(d=>d.kind==='cargo-moving-rail').length>=4);
  assert.notEqual(W.material['cargo-moving-rail'],W.material['cargo-rail'],'static rails must not inherit moving-body shifts');
  for(const beta of [0,.6]){
    const hit=M.movingObjectHit({origin:[-.96*Math.sqrt(1-beta*beta),0,-2],direction:[0,0,1],center:[0,0,0],beta:[beta,0,0],shape:'cube',halfSize:half,bevel:M.objectBevel('harbor','artifact'),details,lightCone:false,time:0});
    assert.equal(hit?.part,'cargo-moving-rail');close(hit.restPoint[0],-.96);close(hit.distance,1.19);
  }
  const state={environment:'harbor',scenario:'flyby',shape:'artifact',beta:.6,surfaceMode:'reflection'};
  const ray={photo:true,labDirection:M.normalize([.5,0,1]),velocity:[.6,0,0],hit:{body:true,kind:'cargo-moving-rail',point:[0,1,6]}};
  const factors=O.frequencyFactors(state,ray);assert.equal(factors.reflected,true);close(factors.total,factors.incident*factors.outgoing);assert.notEqual(factors.total,1);
  const staticFactors=O.frequencyFactors(state,{...ray,hit:{...ray.hit,body:false,kind:'cargo-rail'}});
  assert.equal(staticFactors.reflected,false);close(staticFactors.total,1);
});

test('actual containers and forklift cast finite-source shadows that change when the light moves',()=>{
  const state={environment:'harbor',shape:'artifact',scenario:'flyby',beta:0,time:0};
  function floor(point){return {hit:{kind:'floor',point,normal:[0,1,0],distance:Math.hypot(point[0],point[1]-1.65,point[2])},photo:true,velocity:[0,0,0],center:[100,1.22,7.5],labDirection:[0,0,1]};}
  for(const [point,kind,offset] of [[[-12,0,1],'cargo-container',{lightX:3,lightZ:-4}],[[3.75,0,4.75],'forklift',{lightX:-3,lightZ:4}]]){
    const ray=floor(point),shadow=O.illumination(state,ray),moved=O.illumination({...state,...offset},ray);
    assert.equal(shadow.status,'shadow');assert.equal(shadow.blocker,kind);assert.equal(shadow.light.kind,'point');
    assert.ok(shadow.blockingDistance<shadow.light.distance);assert.ok(shadow.blockingTime<shadow.surfaceTime);assert.equal(moved.status,'lit');
  }
});

test('soft-light probes report a movable lamp as emissive, not unlit',()=>{
  const state={environment:'harbor',scenario:'flyby',shape:'artifact',beta:0,time:0},fixture=W.lightFixture('harbor');
  const ray={hit:{...fixture,point:fixture.center},photo:true,velocity:[0,0,0],center:[0,1,8],labDirection:[0,0,1]};
  assert.equal(O.illumination(state,ray).status,'emissive');assert.equal(O.softIllumination(state,ray).status,'emissive');
});
