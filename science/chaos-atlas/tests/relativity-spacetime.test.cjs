'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),Space=require('../relativity-ray-space.js'),T=require('../relativity-spacetime.js'),V=require('../relativity-observables.js');
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const state={environment:'station',scenario:'flyby',shape:'artifact',beta:.6,motionAngle:0,time:0,yaw:0,pitch:-.025,fov:58,view:'photo',split:.5};
const event={camera:[0,1.65,0],center:[4.23,1.18,7.5],velocity:[.6,0,0],observerVelocity:[0,0,0]},rest=M.clockAnchor('station','artifact').point,marker=V.evaluate(state,event,rest,1200,750);
function ray(point,body=false,photo=true){const diff=M.sub(point,event.camera),distance=M.length(diff);return {camera:event.camera,center:event.center,photo,labDirection:M.scale(diff,1/distance),hit:{body,kind:body?'cube':'floor',point,distance,restPoint:body?rest:null,centerAtEmission:body?M.sub(event.center,M.scale(event.velocity,distance)):null}};}

test('spacetime projection uses actual A/B and material events, not fabricated time samples',()=>{
  const a=ray([1.1,2.1,6.3],true),b=ray([-2,0,10]),space=Space.build(state,b,a,marker),diagram=T.build(space,'x');
  assert.deepEqual(diagram.observation,{point:event.camera,time:0});assert.deepEqual(diagram.unit,[1,0,0]);
  assert.deepEqual(diagram.events.find(e=>e.id==='A').point,a.hit.point);near(diagram.events.find(e=>e.id==='A').time,-a.hit.distance);
  assert.deepEqual(diagram.events.find(e=>e.id==='B').point,b.hit.point);near(diagram.events.find(e=>e.id==='B').time,-b.hit.distance);
  near(diagram.events.find(e=>e.id==='M').time,marker.emission.time);assert.deepEqual(diagram.events.find(e=>e.id==='M同时').point,marker.simultaneous.point);
  assert.deepEqual(diagram.lines.find(l=>l.id==='A').velocity,event.velocity);assert.deepEqual(diagram.lines.find(l=>l.id==='B').velocity,[0,0,0]);assert.equal(diagram.photons.length,3);
  for(const ph of diagram.photons){const spatial=Math.abs(diagram.coordinate(ph.start.point)-diagram.coordinate(ph.end.point)),temporal=ph.end.time-ph.start.time;assert.ok(spatial<=temporal+1e-9);}
  assert.deepEqual(diagram.timeline.map(e=>e.time),diagram.timeline.map(e=>e.time).slice().sort((a,b)=>a-b));
});
test('line-of-sight projection preserves 45 degrees for that exact photon, but not necessarily another',()=>{
  const a=ray([1.1,2.1,6.3],true),b=ray([-2,0,10]),diagram=T.build(Space.build(state,b,a,marker),'sight'),ph=diagram.photons.find(p=>p.id==='B');
  near(Math.abs(diagram.coordinate(ph.start.point)-diagram.coordinate(ph.end.point)),ph.end.time-ph.start.time);
  const aPh=diagram.photons.find(p=>p.id==='A');assert.ok(Math.abs(diagram.coordinate(aPh.start.point)-diagram.coordinate(aPh.end.point))<aPh.end.time-aPh.start.time-.01);
});
test('blocked material candidate is not depicted as a photon that arrived',()=>{
  const back=[0,0,M.objectHalf('station','artifact')[2]],s={...state,beta:0},e={...event,center:[0,1.18,7.5],velocity:[0,0,0]},blocked=V.evaluate(s,e,back,1200,750);
  assert.equal(blocked.emission.visibility.status,'self');const d=T.build(Space.build(s,null,null,blocked),'z');
  assert.equal(d.events.find(x=>x.id==='M').kind,'blocked');assert.equal(d.photons.length,0);assert.ok(d.lines.some(x=>x.id==='M'));
});
test('sky and simultaneous slices do not become photon emission events',()=>{
  const slice=ray([0,1,7],true,false),sky={...slice,hit:null},space=Space.build(state,sky,slice),d=T.build(space,'y');
  assert.equal(d.photons.length,0);assert.equal(d.events.find(e=>e.id==='A').kind,'slice');assert.deepEqual(d.lines.find(l=>l.id==='A').velocity,event.velocity);assert.deepEqual(d.unit,[0,1,0]);assert.equal(d.timeline.length,1);
});
test('moving observer has its own worldline and event-time data updates with observation',()=>{
  const make=t=>{const s={...state,scenario:'observer',beta:.6,motionAngle:45,time:t},v=M.motionVelocity('observer',s.beta,s.motionAngle),e={camera:M.add([0,1.65,0],M.scale(v,t)),center:[2.35,1.66,8.8],velocity:[0,0,0],observerVelocity:v},m=V.evaluate(s,e,rest,1200,750);return T.build(Space.build(s,null,null,m),'z');};
  const first=make(0),next=make(1);assert.notDeepEqual(first.observation.point,next.observation.point);assert.notEqual(first.events.find(e=>e.id==='M').time,next.events.find(e=>e.id==='M').time);assert.deepEqual(next.lines.find(l=>l.id==='observer').velocity,M.motionVelocity('observer',.6,45));
});
