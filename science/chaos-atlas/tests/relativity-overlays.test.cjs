'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),V=require('../relativity-overlays.js');
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>p[1])!==(poly[j][1]>p[1])&&p[0]<(poly[j][0]-poly[i][0])*(p[1]-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;}
function state(shape='cube'){return {scenario:'flyby',environment:'station',shape,beta:.6,motionAngle:0,yaw:0,pitch:0};}
test('simultaneous projected box silhouette agrees with independent analytic ray intersections',()=>{
  const s=state(),event={camera:[0,1,0],center:[0,1,7.5],velocity:[.6,0,0]},w=400,h=250,fov=58;
  const polys=V.project(s,event,w,h,fov);assert.equal(polys.length,4);let mismatch=0,total=0;
  for(let y=30;y<h-30;y+=3)for(let x=30;x<w-30;x+=3){
    const direction=M.cameraRay(x+.5,y+.5,w,h,0,0,fov),hit=M.movingObjectHit({origin:event.camera,direction,center:event.center,beta:event.velocity,shape:'cube',halfSize:M.objectHalf('station','cube'),lightCone:false});
    if(inside([x+.5,y+.5],polys[0])!==!!hit)mismatch++;total++;
  }
  assert.equal(mismatch,0,`${mismatch}/${total} silhouette rays`);
});
test('projection uses actual scene components, velocity vector and near clipping',()=>{
  const s={...state('artifact'),motionAngle:90},event={camera:[0,1.65,0],center:[0,1.18,7.5],velocity:[0,0,.6]};
  const polys=V.project(s,event,800,500,58);assert.equal(polys.length,1+M.objectParts('station','artifact').length);assert.notDeepEqual(polys,V.project(s,{...event,velocity:[.6,0,0]},800,500,58));
  assert.deepEqual(V.project({...s,scenario:'observer'},event,800,500,58),[]);
  const clipped=V.project({...s,shape:'cube'},{...event,center:[0,1,.5]},800,500,58);assert.ok(clipped.length>0);assert.ok(clipped.flat(2).every(Number.isFinite));
});
test('emission-time key is fixed, monotonic between control points and rejects infinite sky',()=>{
  assert.deepEqual(M.emissionColor(0),[1,.34,.12]);assert.deepEqual(M.emissionColor(10),[1,.82,.35]);assert.deepEqual(M.emissionColor(20),[.05,.44,.85]);assert.deepEqual(M.emissionColor(99),M.emissionColor(20));
  assert.throws(()=>M.emissionColor(Infinity),RangeError);assert.throws(()=>M.emissionColor(-1),RangeError);
});
