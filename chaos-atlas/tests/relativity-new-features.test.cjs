'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),O=require('../relativity-optics.js'),S=require('../relativity-spectrum.js'),T=require('../relativity-material-spectrum.js'),Surface=require('../relativity-surface.js'),E=require('../relativity-experiments.js'),P=require('../relativity-probe-spectrum.js'),L=require('../relativity-light-path.js'),C=require('../relativity-camera.js');
const root={RelativityModel:M,RelativityWorlds:W,RelativityOptics:O,RelativitySpectrum:S,RelativityMaterialSpectrum:T,RelativitySurface:Surface};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../relativity-renderer.js'),'utf8'),{window:root,console});
const R=root.RelativityRenderer;
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('static primary-ray cache is exact across time but invalidates for camera, light fixture and resolution',()=>{
  const cache=R.createStaticRayCache(),s={...E.BASE,playing:true,shadows:true},width=64,height=40;
  for(const time of [0,.15,1.4]){
    const state={...s,time},cached=R.prepareTrace(state,width,height,cache),fresh=R.prepareTrace(state,width,height);
    for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){
      const a=cached(x+.5,y+.5),b=fresh(x+.5,y+.5);assert.equal(a.hit?.kind,b.hit?.kind);close(a.hit?.distance||0,b.hit?.distance||0,1e-10);
      if(a.hit)assert.deepEqual(O.illumination(state,a),O.illumination(state,b));
    }
  }
  assert.ok(cache.stats().hits>100);assert.ok(cache.stats().misses>100);assert.ok(cache.stats().shadowHits>0);assert.ok(cache.stats().shadowMisses>0);
  for(const time of [.2,1.5]){
    const state={...s,time,softShadows:true,secondEnabled:true},cached=R.prepareTrace(state,width,height,cache),fresh=R.prepareTrace(state,width,height);
    for(let y=5;y<height;y+=5)for(let x=5;x<width;x+=5)assert.deepEqual(O.softIllumination(state,cached(x+.5,y+.5)),O.softIllumination(state,fresh(x+.5,y+.5)));
  }
  const old=cache.stats();R.prepareTrace({...s,yaw:.1},width,height,cache)(.5,.5);assert.equal(cache.stats().hits,0);assert.equal(cache.stats().misses,1);
  R.prepareTrace({...s,yaw:.1,lightX:2},width,height,cache)(.5,.5);assert.equal(cache.stats().misses,1);
  R.prepareTrace({...s,yaw:.1,lightX:2,lightYaw:35},width,height,cache)(.5,.5);assert.equal(cache.stats().misses,1,'changing sun direction invalidates static shadows');
  R.prepareTrace({...s,scenario:'observer'},width,height,cache)(.5,.5);assert.equal(cache.stats().misses,1,'moving observer bypasses cache');
  R.prepareTrace({...s,interacting:true},width,height,cache)(.5,.5);assert.equal(cache.stats().misses,1,'drag bypasses cache');
  assert.ok(old.entries<=180000);assert.equal(R.motionFloor({dynamicQuality:'responsive'}),10000);assert.equal(R.motionFloor({dynamicQuality:'balanced'}),16000);assert.equal(R.motionFloor({dynamicQuality:'sharp'}),32000);
});

test('prepared public rays retain the individual probe result with or without the internal cache',()=>{
  for(const environment of W.IDs){
    const state={...E.BASE,environment,playing:true,secondEnabled:true,beta:.72,secondBeta:-.43},cache=R.createStaticRayCache();
    const prepared=R.prepareTrace(state,64,40),cached=R.prepareTrace(state,64,40,cache);
    let stationary=0;
    for(const [x,y] of [[.5,.5],[10.5,30.5],[32.5,20.5],[48.5,34.5]]){
      const one=R.trace(state,x,y,64,40),a=prepared(x,y),b=cached(x,y);
      assert.equal(JSON.stringify(a),JSON.stringify(one));assert.equal(JSON.stringify(b),JSON.stringify(one));
      assert.ok(!Object.keys(a).includes('kernels'));assert.ok(!Object.keys(b).includes('staticEntry'));
      if(b.hit&&!b.hit.body){stationary++;assert.ok(b.staticEntry,'private shadow cache remains available to the renderer');}
    }
    assert.ok(stationary>0,environment+' includes a cached static hit');
  }
});

test('spectrum split keeps the same geometric rays, with opposite optical sides and full-side reprojection caches',()=>{
  for(const scenario of ['flyby','observer']){
    const s={...E.BASE,scenario,spectrumSplit:true,view:'photo',doppler:false,split:.5};
    for(const x of [20,80]){const a=R.trace(s,x,50,100,100),b=R.trace({...s,spectrumSplit:false},x,50,100,100);assert.deepEqual(a.labDirection,b.labDirection);assert.equal(a.hit?.kind,b.hit?.kind);assert.equal(a.spectral,x>=50);assert.equal(a.photo,true);}
    assert.equal(C.sideState(s,0).doppler,false);assert.equal(C.sideState(s,1).doppler,true);assert.equal(C.sideState(s,1).spectrumSplit,false);
  }
});

test('sampled spectral curves use the actual branch, double Doppler factors and assumed material response',()=>{
  const s={...E.BASE,spectrumModel:'blackbody',temperature:5400,materialSpectrum:'wood',surfaceMode:'reflection'};
  const ray={hit:{body:true}},factors={total:1.4,outgoing:.8};const q=P.build(s,{ray,factors,rgb:[.4,.5,.2]});
  assert.equal(q.material,'wood');assert.equal(q.model,'blackbody');const pixel=q.samples.find(v=>v.wavelength===600),source=S.source('blackbody',5400,s.lineWavelength);
  close(pixel.emitted,source.at(600));close(pixel.response,T.reflectance('wood',.8*600));close(pixel.observed,1.4**5*source.at(1.4*600)*T.reflectance('wood',.8*600));
  const off=P.build(s,{ray,factors,rgb:[.4,.5,.2],active:false});assert.equal(off.D,1);assert.equal(off.outgoing,1);
  const world=P.build(s,{ray:{hit:{body:false}},factors,rgb:[.4,.5,.2]});assert.equal(world.model,'rgb');assert.equal(world.material,null);
  const line=P.build({...s,spectrumModel:'line'},{ray,factors,rgb:[.4,.5,.2]});const at=line.samples.find(v=>v.wavelength===470);close(at.observed,1.4**5*S.source('line',5400,s.lineWavelength).at(1.4*470)*T.reflectance('wood',s.lineWavelength*.8/1.4));
});

test('two bodies keep independent velocities, causal hits and per-body frequency factors',()=>{
  const s={...E.BASE,secondEnabled:true,secondBeta:-.43,secondAngle:25,beta:.72,shape:'sphere',time:.3};
  const e=R.eventState(s),f=R.eventState({...s,time:1.3});assert.ok(e.second);for(let i=0;i<3;i++)close(f.second.center[i]-e.second.center[i],e.second.velocity[i]);
  let a=null,b=null;
  for(let y=10;y<85;y+=2)for(let x=0;x<120;x+=2){const ray=R.trace(s,x+.5,y+.5,120,90);if(ray.hit?.bodyId==='A')a=ray;if(ray.hit?.bodyId==='B')b=ray;}
  assert.ok(a&&b,'both worldlines must produce independently visible hits');
  for(const ray of [a,b]){
    const velocity=ray.hit.bodyId==='A'?e.velocity:e.second.velocity,expected=M.dopplerFactor(ray.labDirection,velocity,[0,0,0]);
    const factors=O.frequencyFactors({...s,surfaceMode:'emission'},ray);close(factors.outgoing,expected,1e-9);close(ray.hit.emittedAt,s.time-ray.hit.distance);
  }
  assert.notDeepEqual(a.hit.velocity,b.hit.velocity);assert.equal(R.eventState({...s,scenario:'observer'}).second,null);
});

test('light-path diagnostics are retarded and do not fabricate a source time for infinity or a slice',()=>{
  const s={...E.BASE,doppler:false},ray=R.trace(s,60,70,120,90),p=L.build(s,ray);
  assert.ok(['lit','blocked','unlit','emissive','sky'].includes(p.status));
  if(p.surface){close(p.surfaceTime,s.time-ray.hit.distance);close(p.observationTime,s.time);if(p.status==='lit'&&p.lightKind==='point')close(p.sourceTime,p.surfaceTime-p.incomingDistance);if(p.status==='blocked')close(p.blockerTime,p.surfaceTime-p.blockingDistance,1e-8);}
  const slice=L.build({...s,view:'geometry'},R.trace({...s,view:'geometry'},60,70,120,90));assert.equal(slice.status,'slice');
  const sky=L.build(s,{hit:null});assert.equal(sky.status,'sky');
});

test('opposing moving worldlines can shadow one another at independently retarded events',()=>{
  // B behind A, then the identities and velocities are exchanged. These are
  // actual visible sphere hits, not a synthetic point labelled as a surface.
  for(const {center,secondCenter,x,y,target,blocker} of [
    {center:[-2.1,1.8,6.2],secondCenter:[2.7,1.22,8],x:58,y:42,target:'B',blocker:'A'},
    {center:[-1.5,1.22,8],secondCenter:[3.5,1.8,6.2],x:50,y:42,target:'A',blocker:'B'}
  ]){
    const state={...E.BASE,shape:'sphere',beta:-.3,secondEnabled:true,secondBeta:.3,time:0,
      lockedEvent:{camera:[0,1.65,0],center,secondCenter,time:0}};
    const ray=R.trace(state,x+.5,y+.5,100,75),info=O.illumination(state,ray),path=L.build(state,ray);
    assert.equal(ray.hit.bodyId,target);assert.equal(info.blockerBody,blocker);assert.equal(info.status,'shadow');
    assert.equal(path.status,'blocked');assert.equal(path.blockerBody,blocker);assert.equal(path.sourceTime,undefined);
    close(path.blockerTime,path.surfaceTime-path.blockingDistance,1e-8);
    close(M.length(M.sub(path.blockerPoint,path.surface)),path.blockingDistance,1e-8);
    const without=O.illumination({...state,secondEnabled:false},{...ray,second:null});
    if(blocker==='B')assert.notEqual(without.blockerBody,'B');
  }
});

test('microfacet parameters, softened point-light falloff and sky reflection are bounded approximations',()=>{
  close(Surface.attenuation({kind:'point',distance:5}),1);
  close(Surface.attenuation({kind:'point',distance:10}),26/101);
  assert.equal(Surface.attenuation({kind:'point',distance:0}),2);
  assert.equal(Surface.attenuation({kind:'directional',distance:1e20}),1);
  assert.ok(Surface.attenuation({kind:'point',distance:15})<Surface.attenuation({kind:'point',distance:10}));
  const n=[0,1,0],light={kind:'point',distance:5,direction:n},view=n,rgb=[.55,.48,.32];
  const smooth=Surface.highlight(rgb,n,light,view,2,'station',.5,1),rough=Surface.highlight(rgb,n,light,view,2,'station',1.5,1);
  assert.ok(smooth.reduce((a,b)=>a+b,0)>rough.reduce((a,b)=>a+b,0));
  assert.deepEqual(Surface.highlight(rgb,n,light,view,2,'station',1,0),[0,0,0]);
  assert.ok(Surface.environment(rgb,[.5,.6,.7],2,'station',.5).some(v=>v>0));
  assert.deepEqual(Surface.environment(rgb,[.5,.6,.7],1,'station',1),[0,0,0]);
  for(const values of [smooth,rough,...[.08,.5,1,1.5].map(r=>Surface.highlight(rgb,n,light,view,18,'station',r,1))])assert.ok(values.every(v=>Number.isFinite(v)&&v>=0));
});

test('soft shadows use distance-weighted direct illumination without changing their cosine API',()=>{
  const state={...E.BASE,environment:'station',shape:'sphere',beta:0,time:0},point=[0,0,0],ray={photo:true,center:[0,2.585,2.7],velocity:[0,0,0],hit:{kind:'floor',point,normal:[0,1,0],distance:1.65}};
  const info=O.softIllumination(state,ray),weighted=info.samples.reduce((a,s)=>a+Math.max(0,s.cosine||0)*Surface.attenuation(s.light),0)/4;
  close(info.weightedDirect,weighted);close(info.direct,info.samples.reduce((a,s)=>a+Math.max(0,s.cosine||0),0)/4);
  assert.ok(info.weightedVisible<=info.weightedDirect);assert.ok(O.shadowFactor(info,'station')>0&&O.shadowFactor(info,'station')<=1);
});

test('detail additions remain within WebGL BVH capacity and parameters survive snapshots',()=>{
  const G=require('../relativity-geometry-pack.js'),layout=G.pack().layout;
  for(const id of W.IDs)assert.ok(layout[id].nodeCount<=128,`${id} exceeds shader node limit`);
  assert.ok(layout.corridor.primitiveCount>=93);assert.ok(layout.harbor.primitiveCount>=90);
  const parameters={...E.BASE,secondEnabled:true,secondBeta:.37,secondAngle:45,secondElevation:-20,roughnessScale:1.4,dynamicQuality:'sharp',spectrumSplit:true};
  const restored=E.parse(JSON.stringify({format:'relativity-observation',schema:1,parameters,measurements:{}})).parameters;
  for(const key of ['secondEnabled','secondBeta','secondAngle','secondElevation','roughnessScale','dynamicQuality','spectrumSplit'])assert.equal(restored[key],parameters[key],key);
});

test('prepared moving-object kernels exactly preserve the validated light-cone intersections',()=>{
  let seed=123456789;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(const environment of W.IDs)for(const shape of ['artifact','cube','sphere'])for(const beta of [[0,0,0],[.6,0,0],[.2,.4,-.3],[-.9,0,.1]]){
    const common={beta,shape:shape==='sphere'?'sphere':'cube',halfSize:M.objectHalf(environment,shape),radius:1.22,bevel:M.objectBevel(environment,shape),details:M.objectParts(environment,shape)},kernel=M.prepareMovingObject(common);
    for(let i=0;i<150;i++){
      const origin=[(random()-.5)*8,(random()-.5)*4,(random()-.5)*8],direction=[random()-.5,random()-.5,random()-.5],center=[(random()-.5)*4,(random()-.5)*2,(random()-.5)*4],lightCone=random()>.5,time=random()*4-2;
      assert.deepEqual(kernel.hit(origin,direction,center,lightCone,time),M.movingObjectHit({...common,origin,direction,center,lightCone,time}));
    }
  }
});

test('early visibility and cached static blockers match full nearest-blocker shading for all worlds',()=>{
  let seed=98765;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(const environment of W.IDs){
    for(let i=0;i<2500;i++){
      const origin=[random()*20-10,random()*8,random()*55-4],raw=[random()*2-1,random()*2-1,random()*2-1],direction=M.normalize(raw),limit=random()*40,observer=random()>.5,state={lightX:random()*6-3,lightZ:random()*6-3};
      const hit=W.traceWithFixture(origin,direction,environment,observer,state);
      assert.equal(W.occluded(origin,direction,environment,observer,state,limit),!!hit&&hit.distance<limit);
    }
    for(const softShadows of [false,true])for(const timing of ['retarded','instant']){
      const cache=R.createStaticRayCache(),s={...E.BASE,environment,shape:'artifact',playing:true,secondEnabled:true,beta:.72,secondBeta:-.43,secondAngle:25,softShadows,shadowTiming:timing};
      for(const time of [0,.8]){
        const state={...s,time},trace=R.prepareTrace(state,64,40,cache);
        for(let y=0;y<40;y+=2)for(let x=0;x<64;x+=2){
          const ray=trace(x+.5,y+.5),fast=O.shadingIllumination(state,ray),full=softShadows?O.softIllumination(state,ray):O.illumination(state,ray);
          assert.equal(fast.shadowed,full.shadowed);assert.equal(fast.status,full.status);
          if(full.shadowed)close(O.shadowFactor(fast,environment),O.shadowFactor(full,environment),1e-12);
        }
      }
    }
  }
});

test('hemisphere fill and indoor distance cue are bounded, directional display approximations',()=>{
  for(const world of W.IDs){
    const up=Surface.ambient([0,1,0],world),side=Surface.ambient([1,0,0],world),down=Surface.ambient([0,-1,0],world);
    assert.ok(up>side&&side>down);assert.ok(down>0&&up<1);
    assert.equal(Surface.fog(0,world),0);assert.ok(Surface.fog(10,world)<Surface.fog(30,world));
  }
  assert.ok(Surface.fog(30,'station')<Surface.fog(30,'street')*.3);
  assert.ok(Surface.fog(30,'corridor')<Surface.fog(30,'station'));
  close(Surface.fog(10,'street'),1-Math.exp(-.12));
});
