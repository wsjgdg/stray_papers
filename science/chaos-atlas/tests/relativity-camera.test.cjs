'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Camera=require('../relativity-camera.js'),M=require('../relativity-model.js');
const close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const fov=(c,w,h)=>2*Math.atan(Math.tan(c.fov*Math.PI/360)*Math.max(1,.95*h/w))*180/Math.PI;

test('a camera at the same observation point has an identity reprojection',()=>{
  for(const [w,h] of [[1200,750],[390,844],[1440,900]])for(const c of [{yaw:0,pitch:0,fov:58},{yaw:1.2,pitch:-.8,fov:85}]){
    const m=Camera.matrix(c,c,w,h);for(const [x,y] of [[0,0],[w,h],[w/2,h/2],[w*.35,h*.63]]){const p=Camera.map(m,x,y);close(p.x,x,1e-9);close(p.y,y,1e-9);close(p.w,1,1e-12);}
  }
});
test('rotations and zoom map onto the same physical ray, including relativistic aberration',()=>{
  let seed=0x12345678;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);let checked=0,behind=0;
  for(let i=0;i<4000;i++){
    const w=i%2?390:1200,h=i%2?844:750,sourceFov=35+65*random();
    const a={yaw:3*(random()-.5),pitch:1.8*(random()-.5),fov:i%3===0?Camera.overscan(sourceFov):sourceFov},b={yaw:3*(random()-.5),pitch:1.8*(random()-.5),fov:35+65*random()};
    const x=random()*w,y=random()*h,p=Camera.map(Camera.matrix(a,b,w,h),x,y);if(p.w<=0){behind++;continue;}
    const source=M.cameraRay(x,y,w,h,a.yaw,a.pitch,fov(a,w,h)),target=M.cameraRay(p.x,p.y,w,h,b.yaw,b.pitch,fov(b,w,h));source.forEach((v,j)=>close(v,target[j],3e-12));
    const velocity=M.motionVelocity('observer',i%2?.86:-.93,37),sourceLab=M.observerToLab(source,velocity),targetLab=M.observerToLab(target,velocity);sourceLab.forEach((v,j)=>close(v,targetLab[j],1e-11));checked++;
  }
  assert.ok(checked>2000);assert.ok(behind>0);
});
test('rounded ray-buffer aspect is respected when stretched to the viewport',()=>{
  for(const [w,h,pw,ph] of [[600,375,179,112],[390,844,96,207],[1200,750,127,79]]){
    const source={yaw:.2,pitch:-.3,fov:Camera.overscan(58),pixelWidth:pw,pixelHeight:ph},target={yaw:-.25,pitch:.15,fov:58},mat=Camera.matrix(source,target,w,h);
    for(const [x,y] of [[w*.2,h*.3],[w*.5,h*.5],[w*.8,h*.7]]){const p=Camera.map(mat,x,y);assert.ok(p.w>0);const original=M.cameraRay(x*pw/w,y*ph/h,pw,ph,source.yaw,source.pitch,fov(source,pw,ph)),projected=M.cameraRay(p.x,p.y,w,h,target.yaw,target.pitch,fov(target,w,h));original.forEach((v,i)=>close(v,projected[i],1e-11));}
  }
});
test('invalid viewports or camera values are rejected',()=>{const a={yaw:0,pitch:0,fov:58};assert.throws(()=>Camera.matrix(a,a,0,750));assert.throws(()=>Camera.matrix(a,{...a,fov:180},1200,750));assert.throws(()=>Camera.matrix(a,{...a,yaw:NaN},1200,750));});
test('comparison sides preserve photo/geometry and retarded/frozen boundaries',()=>{
  for(const scenario of ['flyby','observer'])for(const view of ['photo','geometry','split'])for(const shadowTiming of ['retarded','instant','split']){
    const original={scenario,view,shadowTiming,split:.37};for(const side of [0,1]){const x=side===0?.2:.8,s=Camera.sideState(original,side),photo=view==='photo'||view==='split'&&(scenario==='flyby'?x<original.split:x>=original.split),instant=shadowTiming==='instant'||shadowTiming==='split'&&x>=original.split;assert.equal(s.view==='photo',photo);assert.equal(s.shadowTiming==='instant',instant);assert.deepEqual(original,{scenario,view,shadowTiming,split:.37});}
  }
});
test('wide ray caches are bounded and honor expensive sampling modes',()=>{
  for(const f of [35,58,100])assert.ok(Camera.overscan(f)>f&&Camera.overscan(f)<=150);
  const s={shadows:true,softShadows:false,shutter:0},single=Camera.cacheBudget(s,false),side=Camera.cacheBudget(s,true);assert.ok(single>0&&side>0&&2*side<=single*1.2);assert.ok(Camera.cacheBudget({...s,softShadows:true},false)<single);assert.ok(Camera.cacheBudget({...s,shutter:1},true)<side);
});
