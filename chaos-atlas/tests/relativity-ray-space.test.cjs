'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../relativity-ray-space.js');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function ray(point,body=false,photo=true){
  const camera=[0,1.65,0],center=[4.23,1.22,7.5],d=point.map((v,i)=>v-camera[i]),distance=Math.hypot(...d);
  return {camera,center,photo,labDirection:d.map(v=>v/distance),hit:{kind:body?'cube':'floor',body,point,normal:[0,1,0],distance,centerAtEmission:body?[center[0]-.6*distance,center[1],center[2]]:undefined}};
}
test('A and B use exact hit positions and end at the same observation event',()=>{
  const state={scenario:'flyby',shape:'cube',beta:.6,time:2},a=ray([.4,2.1,6.3],true),b=ray([-2,0,10]);
  const m=V.build(state,b,a);assert.equal(m.rays.length,2);assert.equal(m.rays[0].id,'A');assert.equal(m.rays[1].id,'B');
  assert.deepEqual(m.observation,{point:a.camera,time:2});assert.deepEqual(m.rays[0].point,a.hit.point);assert.deepEqual(m.rays[1].point,b.hit.point);
  close(m.rays[0].emittedAt,2-a.hit.distance);close(m.rays[1].emittedAt,2-b.hit.distance);close(m.delta,a.hit.distance-b.hit.distance);
  assert.deepEqual(m.rays[0].centerAtEmission,a.hit.centerAtEmission);assert.equal(m.rays[1].centerAtEmission,null);
  assert.deepEqual(m.rays.map(r=>r.mode),['photon','photon']);
  m.rays[0].point[0]=99;assert.notEqual(a.hit.point[0],99,'projection data must not mutate the probe');
});
test('sky and flyby simultaneous slices do not acquire fabricated emission times',()=>{
  const state={scenario:'flyby',shape:'sphere',beta:.6,time:0},a=ray([.1,2,6],true),slice=ray([1,1,7],true,false),sky={...slice,hit:null};
  const q=V.build(state,slice,a);assert.equal(q.rays[1].mode,'slice');assert.equal(q.rays[1].emittedAt,null);assert.equal(q.rays[1].centerAtEmission,null);assert.equal(q.delta,null);
  const s=V.build(state,sky,a);assert.equal(s.rays[1].mode,'sky');assert.equal(s.rays[1].point,null);assert.equal(s.delta,null);
  const observer=V.build({...state,scenario:'observer'},slice,null);assert.equal(observer.rays[0].mode,'photon','the observer comparison still depicts a real stationary-observer photon');
  assert.equal(V.build(state,null,null).rays.length,0);
});
test('simultaneous wireframes contract along the actual oblique velocity, not the x axis',()=>{
  const v=[.36,0,.48],g=1.25,unit=[.6,0,.8],perpendicular=[-.8,0,.6];
  const along=V.contracted(unit,v),across=V.contracted(perpendicular,v);
  unit.forEach((x,i)=>close(along[i],x/g));perpendicular.forEach((x,i)=>close(across[i],x));
  assert.deepEqual(V.contracted([1,2,3],[0,0,0]),[1,2,3]);
  const m=V.build({scenario:'flyby',shape:'artifact',environment:'station',beta:.6,motionAngle:90,time:0},ray([.4,2.1,6.3],true),null);
  assert.ok(Math.abs(m.object.velocity[2]-.6)<1e-12);assert.deepEqual(m.object.half,[.88,1,.42]);
});

test('third-person camera projects all three dimensions and rotates independently of the sampled physics',()=>{
  const pts=[[0,0,0],[2,1,7],[-2,2,9]],first=V.projector(pts,900,500,{yaw:-.7,pitch:.55,zoom:1}),next=V.projector(pts,900,500,{yaw:.5,pitch:.8,zoom:1});
  const a=first.project(pts[0]),b=first.project(pts[1]),c=first.project(pts[2]);
  for(const p of [a,b,c,next.project(pts[0])])assert.ok(p&&p.every(Number.isFinite));
  assert.notDeepEqual(a.slice(0,2),b.slice(0,2));assert.notDeepEqual(a.slice(0,2),next.project(pts[0]).slice(0,2));
  const u=first.project([0,1,0]),v=first.project([0,0,1]);assert.notDeepEqual(u.slice(0,2),v.slice(0,2));
});
