'use strict';const test=require('node:test'),assert=require('node:assert/strict'),M=require('../relativity-model.js'),V=require('../relativity-observables.js'),R=require('../relativity-ray-space.js'),S=require('../relativity-spacetime-slice.js');
const state={environment:'station',scenario:'flyby',shape:'artifact',beta:.6,motionAngle:0,motionElevation:0,time:0,yaw:0,pitch:0,fov:58,view:'photo',split:.5};
const event={camera:[0,1.65,0],center:[4.23,1.18,7.5],velocity:[.6,0,0],observerVelocity:[0,0,0]},rest=M.clockAnchor('station','artifact').point,marker=V.evaluate(state,event,rest,900,560),space=R.build(state,null,null,marker);
test('2+1 basis is orthonormal and targeted M event lies in its plane',()=>{
  for(const mode of ['xy','xz','yz','M']){const b=S.basis(space,mode);assert.ok(Math.abs(M.dot(b.u,b.v))<1e-12);assert.ok(Math.abs(M.dot(b.u,b.normal))<1e-12);assert.ok(Math.abs(M.length(b.normal)-1)<1e-12);}
  const b=S.basis(space,'M');assert.ok(Math.abs(M.dot(M.sub(marker.emission.point,event.camera),b.normal))<1e-10);
});
test('cone/body intersections are null events on the actual primary worldtube',()=>{
  const model=S.build(space,state,'M',{angularSamples:720,layers:8,grid:40}),roots=[...model.near,...model.far].filter(Boolean);assert.ok(roots.length>5);assert.ok(model.sections.length>0);
  for(const p of roots){const world=model.toWorld(p.u,p.v),t=state.time-p.age;assert.ok(Math.abs(M.length(M.sub(world,event.camera))-p.age)<1e-7);assert.ok(Math.abs(S.signed(world,model.object,t,state.time))<2e-5);assert.ok(Math.abs(M.dot(M.sub(world,event.camera),model.basis.normal))<1e-8);}
  const m=model.events.find(e=>e.id==='M');assert.equal(m.inSlice,true);assert.equal(m.kind,marker.emission.visibility.status==='visible'?'emission':'blocked');
});
test('out-of-slice events are reported, not silently projected as slice intersections',()=>{
  const model=S.build(space,state,'xy',{angularSamples:180,layers:3,grid:24}),m=model.events.find(e=>e.id==='M');assert.ok(Math.abs(m.offset)>1);assert.equal(m.inSlice,false);assert.ok(model.observation);
});
test('same-event stationary sphere yields front and far cone intersections',()=>{
  const s={...state,shape:'sphere',beta:0},e={camera:[0,1.65,0],center:[0,1.65,6],velocity:[0,0,0],observerVelocity:[0,0,0]},m=V.evaluate(s,e,M.materialAnchor('station','sphere'),900,560),model=S.build(R.build(s,null,null,m),s,'xz',{angularSamples:360,layers:6,grid:32});
  const i=90;assert.ok(model.near[i]&&model.far[i]);assert.ok(Math.abs(model.near[i].age-(6-1.22))<1e-8);assert.ok(Math.abs(model.far[i].age-(6+1.22))<1e-5);
});
