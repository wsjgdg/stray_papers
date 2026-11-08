'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),O=require('../relativity-optics.js');
const E=require('../relativity-experiments.js'),G=require('../relativity-geometry-pack.js');
const root={RelativityModel:M,RelativityWorlds:W,RelativityOptics:O,RelativitySpectrum:require('../relativity-spectrum.js'),RelativityMaterialSpectrum:require('../relativity-material-spectrum.js'),RelativitySurface:require('../relativity-surface.js')};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../relativity-renderer.js'),'utf8'),{window:root,console});const R=root.RelativityRenderer;
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);

function floorRay(point,center,velocity=[0,0,0]){
  return {photo:true,center,velocity,hit:{kind:'floor',point,normal:[0,1,0],distance:1.65}};
}
function coverage(info){return info.weightedDirect>0?1-info.weightedVisible/info.weightedDirect:0;}

test('nearby station carriages have finite roof, doors, trim and individual opaque windows',()=>{
  const objects=W.get('station').flatMap(g=>g.boxes);
  for(const [kind,n] of [['train-roof',24],['train-door',4],['train-trim',12],['train-window',12]])
    assert.equal(objects.filter(p=>p.kind===kind).length,n,kind);
  assert.ok(objects.filter(p=>p.kind==='train-roof').every(p=>p.primitive==='triangle'));
  const examples=[
    {origin:[-6,1.5,3.6],direction:[-1,0,0],kind:'train-door',distance:.17},
    {origin:[-6,1.88,3.18],direction:[-1,0,0],kind:'train-trim',distance:.115},
    {origin:[-6,2.13,4.77],direction:[-1,0,0],kind:'train-window',distance:.21},
    {origin:[-7,4.5,6],direction:[0,-1,0],kind:'train-roof',distance:1.1072}
  ];
  for(const x of examples){const hit=W.trace(x.origin,x.direction,'station');assert.equal(hit.kind,x.kind);close(hit.distance,x.distance,1e-9);
    assert.equal(W.occluded(x.origin,x.direction,'station',false,{},x.distance+.005),true);
    assert.equal(W.occluded(x.origin,x.direction,'station',false,{},x.distance-.005),false);
  }
  // The raised window intercepts a ray before it would reach the old shell.
  assert.equal(W.occluded([-6,2.13,4.77],[-1,0,0],'station',false,{},.23),true);
  const hit=W.trace([-6,2.13,4.77],[-1,0,0],'station'),state={...E.BASE,beta:0,time:2};
  const info=O.illumination(state,{photo:true,center:[100,100,100],velocity:[0,0,0],hit});
  close(info.surfaceTime,2-hit.distance);assert.equal(hit.kind,'train-window');
  const layout=G.pack().layout.station;assert.equal(layout.primitiveCount,164);assert.ok(layout.nodeCount<=128);
  let triples=0;function visit(node){if(node.boxes){assert.ok(node.boxes.length<=3);if(node.boxes.length===3)triples++;}else{visit(node.left);visit(node.right);}}
  visit(W.tree('station'));assert.ok(triples>0,'packed WebGL traversal must exercise three-primitive leaves');
});

test('rectangular samples follow the actual scaled fixture and finite light distance',()=>{
  for(const environment of ['station','corridor','harbor'])for(const shadowSamples of O.SHADOW_SAMPLES)
    for(const [lightWidthScale,lightDepthScale] of [[.25,2.5],[1,1],[2.5,.25]]){
      const state={...E.BASE,environment,shadowSamples,lightWidthScale,lightDepthScale,lightX:1.1,lightZ:-.8},point=[0,0,2];
      const fixture=W.lightFixture(environment,state),samples=O.areaLights(environment,point,state),base=O.keyLight(environment,point,state);
      assert.equal(samples.length,shadowSamples);assert.deepEqual([fixture.half[0],fixture.half[2]],W.lightHalf(environment,state));
      assert.equal(new Set(samples.map(s=>s.position.join(','))).size,shadowSamples);
      for(const sample of samples){
        assert.ok(Math.abs(sample.position[0]-fixture.center[0])<fixture.half[0]);
        assert.ok(Math.abs(sample.position[2]-fixture.center[2])<fixture.half[2]);
        close(sample.position[1],base.position[1]);assert.ok(sample.position[1]<fixture.center[1]-fixture.half[1]);
        close(M.length(sample.direction),1,1e-12);close(M.length(M.sub(sample.position,point)),sample.distance,1e-12);
        M.add(point,M.scale(sample.direction,sample.distance)).forEach((v,i)=>close(v,sample.position[i],1e-12));
      }
      for(let k=0;k<3;k++)close(samples.reduce((sum,s)=>sum+s.position[k],0)/samples.length,base.position[k],1e-12);
    }
  // A body beyond the emitting plane cannot be counted as a finite-light blocker.
  for(const shadowSamples of O.SHADOW_SAMPLES){
    const state={...E.BASE,shape:'sphere',beta:0,shadowSamples,lightWidthScale:2.5,lightDepthScale:2.5};
    const info=O.softIllumination(state,floorRay([0,0,5.4],[0,7.5,5.4]));
    assert.equal(info.blocked,0);assert.ok(info.samples.every(s=>s.status==='lit'));
  }
  const a=W.lightFixture('station',{lightWidthScale:1,lightDepthScale:1}),b=W.lightFixture('station',{lightWidthScale:2,lightDepthScale:1});
  assert.notEqual(a,b);close(b.half[0],2*a.half[0]);close(b.half[2],a.half[2]);
});

test('outdoor samples are symmetric, unit directions inside a uniform solid-angle disk',()=>{
  for(const environment of ['street','mountain'])for(const shadowSamples of O.SHADOW_SAMPLES)for(const sunAngularRadius of [.27,4.58,8]){
    const state={...E.BASE,environment,shadowSamples,sunAngularRadius,lightYaw:25,lightElevation:-10},axis=O.lightDirection(state),samples=O.areaLights(environment,[0,0,0],state);
    assert.equal(samples.length,shadowSamples);let projected=0;const average=[0,0,0];
    for(const sample of samples){
      close(M.length(sample.direction),1,1e-12);assert.equal(sample.distance,1e20);assert.equal(sample.kind,'extended-directional');
      const cos=M.dot(axis,sample.direction);assert.ok(cos>=Math.cos(sunAngularRadius*Math.PI/180)-1e-12);projected+=cos;
      sample.direction.forEach((v,k)=>average[k]+=v/samples.length);
    }
    // Equal-solid-angle radial strata integrate cos(theta) exactly.
    close(projected/samples.length,(1+Math.cos(sunAngularRadius*Math.PI/180))/2,1e-12);
    const parallel=M.scale(axis,M.dot(average,axis));assert.ok(M.length(M.sub(average,parallel))<1e-12);
  }
  // The default widened 4-ray pattern remains very close to the older demo.
  const axis=O.sun,a=M.normalize(M.cross([0,1,0],axis)),b=M.normalize(M.cross(axis,a)),actual=O.areaLights('street',[0,0,0]);
  for(let i=0;i<4;i++){
    const x=i===0||i===2?-1:1,y=i<2?-1:1,old=M.normalize(M.add(axis,M.add(M.scale(a,x*.04),M.scale(b,y*.04))));
    assert.ok(M.length(M.sub(actual[i].direction,old))<1e-5);
  }
});

test('each sampled moving blocker has its own retarded event, or the explicit frozen reference',()=>{
  for(const shadowSamples of O.SHADOW_SAMPLES){
    const state={...E.BASE,shape:'sphere',beta:.25,time:0,shadowSamples,lightWidthScale:2.5,lightDepthScale:2.5};
    const ray=floorRay([.8,0,5.4],[0,2.2,5.4],[.25,0,0]),retarded=O.softIllumination(state,ray),frozen=O.softIllumination({...state,shadowTiming:'instant'},ray);
    const blocked=retarded.samples.filter(s=>s.shadowed);assert.ok(blocked.length>0);
    for(const s of blocked){assert.equal(s.blocker,'sphere');assert.ok(s.blockingDistance<s.light.distance);close(s.blockingTime,s.surfaceTime-s.blockingDistance,1e-10);}
    for(const s of frozen.samples.filter(s=>s.shadowed))close(s.blockingTime,s.surfaceTime);
    assert.equal(retarded.sampleCount,shadowSamples);
  }
});

// Independent dense quadrature for a static sphere and a uniformly emitting
// rectangle. It uses a direct analytic sphere test rather than the scene BVH.
function rectangularReference(x,grid=192){
  let direct=0,blocked=0;
  for(let i=0;i<grid;i++)for(let j=0;j<grid;j++){
    const sx=(2*(i+.5)/grid-1)*.78*2.5,sz=(2*(j+.5)/grid-1)*.25*2.5;
    let dx=sx-x,dy=5.17,dz=sz;const distance=Math.hypot(dx,dy,dz);dx/=distance;dy/=distance;dz/=distance;
    const projection=-x*dx+2.2*dy,disc=projection*projection-(x*x+2.2**2-1.22**2),t=projection-Math.sqrt(Math.max(0,disc));
    const weight=dy*Math.min(2,26/(distance*distance+1));direct+=weight;if(disc>=0&&t>0&&t<distance)blocked+=weight;
  }
  return blocked/direct;
}

test('larger rectangular source widens the penumbra; additional samples approach a dense reference on average',()=>{
  const point=x=>floorRay([x,0,5.4],[0,2.2,5.4]),base={...E.BASE,shape:'sphere',beta:0,time:0};
  const spans=[];
  for(const scale of [.25,2.5]){
    const partial=[];for(let i=0;i<=110;i++){const x=1+i*.025,info=O.softIllumination({...base,lightWidthScale:scale,lightDepthScale:scale,shadowSamples:16},point(x));if(info.blocked>0&&info.blocked<16)partial.push(x);}
    assert.ok(partial.length);spans.push(partial[partial.length-1]-partial[0]);
  }
  assert.ok(spans[1]>spans[0]*3,JSON.stringify(spans));
  const errors=[0,0,0],counts=[4,8,16],n=47;
  for(let i=0;i<n;i++){
    const x=1+i*.05,reference=rectangularReference(x);
    counts.forEach((shadowSamples,k)=>{const info=O.softIllumination({...base,lightWidthScale:2.5,lightDepthScale:2.5,shadowSamples},point(x));errors[k]+=Math.abs(coverage(info)-reference)/n;});
  }
  assert.ok(errors[1]<errors[0]&&errors[2]<errors[1],JSON.stringify(errors));assert.ok(errors[2]<.08,JSON.stringify(errors));
});

function angularReference(x,z,gridR=64,gridPhi=128){
  const axis=O.sun,a=M.normalize(M.cross([0,1,0],axis)),b=M.normalize(M.cross(axis,a));let direct=0,blocked=0;
  for(let j=0;j<gridR;j++)for(let i=0;i<gridPhi;i++){
    const sh=Math.sin(4.58*Math.PI/360)*Math.sqrt((j+.5)/gridR),co=1-2*sh*sh,si=2*sh*Math.sqrt(1-sh*sh),phi=2*Math.PI*(i+.5)/gridPhi;
    const d=axis.map((v,k)=>co*v+si*(Math.cos(phi)*a[k]+Math.sin(phi)*b[k]));
    const delta=[-x,1.22,8-z],projection=M.dot(delta,d),disc=projection*projection-(M.dot(delta,delta)-1.22**2),t=projection-Math.sqrt(Math.max(0,disc)),weight=Math.max(0,d[1]);
    direct+=weight;if(disc>=0&&t>0)blocked+=weight;
  }
  return blocked/direct;
}

test('the real solar radius gives a much narrower penumbra than the labeled demonstration disk',()=>{
  const center=[0,1.22,8],z=center[2]-O.sun[2]*center[1]/O.sun[1],base={...E.BASE,environment:'street',shape:'sphere',beta:0,time:0};
  const point=x=>floorRay([x,0,z],center),spans=[];
  for(const sunAngularRadius of [.27,4.58]){
    const partial=[];for(let i=0;i<=200;i++){const x=1.8+i*.002,info=O.softIllumination({...base,sunAngularRadius,shadowSamples:16},point(x));if(info.blocked>0&&info.blocked<16)partial.push(x);}
    assert.ok(partial.length);spans.push(partial[partial.length-1]-partial[0]);
  }
  assert.ok(spans[1]>spans[0]*8,JSON.stringify(spans));
  const errors=[0,0,0],counts=[4,8,16],n=73;
  for(let i=0;i<n;i++){
    const x=1.82+i*.005,reference=angularReference(x,z);
    counts.forEach((shadowSamples,k)=>{const info=O.softIllumination({...base,sunAngularRadius:4.58,shadowSamples},point(x));errors[k]+=Math.abs(coverage(info)-reference)/n;});
  }
  assert.ok(errors[1]<errors[0]&&errors[2]<errors[1],JSON.stringify(errors));assert.ok(errors[2]<.04,JSON.stringify(errors));
});

test('size, sample count and sun radius invalidate static shadow caches and survive old/new snapshots',()=>{
  for(const environment of W.IDs){
    const cache=R.createStaticRayCache(),base={...E.BASE,environment,playing:true,shape:'sphere',beta:.62,softShadows:true};
    for(const patch of [{},{lightWidthScale:2},{lightWidthScale:2,lightDepthScale:.5},{sunAngularRadius:.27},{shadowSamples:8},{shadowSamples:16}]){
      const state={...base,...patch},cached=R.prepareTrace(state,30,20,cache),fresh=R.prepareTrace(state,30,20);
      for(let y=1;y<20;y+=3)for(let x=1;x<30;x+=3)assert.deepEqual(O.softIllumination(state,cached(x+.5,y+.5)),O.softIllumination(state,fresh(x+.5,y+.5)));
      assert.equal(cache.stats().misses,70,'each changed sample configuration invalidates the static cache');
    }
  }
  const parameters={...E.BASE,softShadows:true,shadowSamples:16,lightWidthScale:2.2,lightDepthScale:.35,sunAngularRadius:.27};
  const parse=p=>E.parse(JSON.stringify({format:'relativity-observation',schema:1,parameters:p,measurements:{}})).parameters;
  for(const key of ['shadowSamples','lightWidthScale','lightDepthScale','sunAngularRadius'])assert.equal(parse(parameters)[key],parameters[key]);
  const old={...E.BASE};for(const key of ['shadowSamples','lightWidthScale','lightDepthScale','sunAngularRadius'])delete old[key];
  const restored=parse(old);for(const key of ['shadowSamples','lightWidthScale','lightDepthScale','sunAngularRadius'])assert.equal(restored[key],E.BASE[key]);
  for(const patch of [{shadowSamples:12},{shadowSamples:'16'},{lightWidthScale:0},{lightDepthScale:3},{sunAngularRadius:0},{sunAngularRadius:NaN}])assert.throws(()=>E.parameters({...parameters,...patch}));
});
