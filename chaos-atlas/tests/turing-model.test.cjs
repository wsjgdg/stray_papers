'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const T=require('../turing-model.js');
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (tol ${tol})`);

test('icosphere is closed, has unit vertices and conservative symmetric surface diffusion',()=>{
  for(const level of [2,3,4]) {
    const mesh=T.makeSphere(level),f=new T.ReactionSphere(mesh),n=mesh.count;
    assert.equal(n,10*4**level+2);assert.equal(mesh.triangles.length/3,20*4**level);
    for(let i=0;i<n;i++)near(Math.hypot(...mesh.positions.slice(3*i,3*i+3)),1,1e-12);
    const edges=new Map();
    for(let i=0;i<mesh.triangles.length;i+=3) {
      const [a,b,c]=mesh.triangles.slice(i,i+3);
      for(const [x,y] of [[a,b],[b,c],[c,a]]){const key=[Math.min(x,y),Math.max(x,y)].join(':');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok([...edges.values()].every(x=>x===2),'every mesh edge belongs to two faces');
    const field=Float64Array.from({length:n},(_,i)=>Math.sin(i*.23)+.2*Math.cos(i*.11)),lap=f.laplacian(field);
    let integral=0;for(let i=0;i<n;i++)integral+=mesh.area[i]*lap[i];near(integral,0,1e-10);
    assert.ok(f.laplacian(new Float64Array(n).fill(1)).every(x=>Math.abs(x)<1e-10));
    for(let i=0;i<n;i++)for(let q=mesh.offsets[i];q<mesh.offsets[i+1];q++) {
      const j=mesh.neighbors[q];let reverse=-1;for(let p=mesh.offsets[j];p<mesh.offsets[j+1];p++)if(mesh.neighbors[p]===i)reverse=p;
      assert.ok(reverse>=0);near(mesh.weights[q],mesh.weights[reverse]);assert.ok(mesh.weights[q]>0);
    }
  }
});

test('sphere geometry and low-degree Laplace–Beltrami eigenmode converge under refinement',()=>{
  const errors=[];
  for(const level of [2,3,4]){
    const mesh=T.makeSphere(level),f=new T.ReactionSphere(mesh),z=Float64Array.from({length:mesh.count},(_,i)=>mesh.positions[3*i+2]),lap=f.laplacian(z);
    let e=0,d=0;for(let i=0;i<mesh.count;i++){e+=mesh.area[i]*(lap[i]+2*z[i])**2;d+=mesh.area[i]*(2*z[i])**2;}
    errors.push(Math.sqrt(e/d));assert.ok(Math.abs(mesh.totalArea-4*Math.PI)<.25);
  }
  assert.ok(errors[2]<errors[1]&&errors[1]<errors[0],String(errors));assert.ok(errors[2]<.01);
});

test('homogeneous Brusselator equilibrium stays fixed on the numerical mesh',()=>{
  const f=new T.ReactionSphere(T.makeSphere(3),{amplitude:0,b:1.8,ratio:20});
  for(let i=0;i<100;i++)f.advance(.2);
  const s=f.statistics();near(s.meanU,1,2e-12);near(s.meanV,1.8,2e-12);assert.ok(s.stdU<1e-12);
});

test('linear stability predicts diffusion-driven positive spherical modes, not local instability',()=>{
  const stable=T.prediction(1.8,1),unstable=T.prediction(1.8,20);
  assert.ok(stable.localGrowth<0);assert.ok(stable.rates.every(v=>v<0));
  assert.ok(unstable.localGrowth<0);assert.equal(unstable.fastest,10);assert.equal(unstable.first,6);assert.equal(unstable.last,17);
  assert.ok(unstable.maxGrowth>.26);near(unstable.criticalRatio,8.56762746,2e-6);
  assert.ok(T.prediction(1.8,8).rates.every(v=>v<0));assert.ok(T.prediction(1.8,9).maxGrowth>0);
});

test('the actual surface field projects to its seeded spherical mode and initially grows at the predicted rate',()=>{
  const f=new T.ReactionSphere(T.makeSphere(4),{ratio:20,kind:'mode',degree:10,amplitude:.0001});
  const first=f.spectrum(18);assert.equal(first.dominant,10);
  for(let i=0;i<10;i++)f.advance(.2);const at2=f.spectrum(18).power[10];
  for(let i=0;i<20;i++)f.advance(.2);const at6=f.spectrum(18).power[10];
  const measured=Math.log(at6/at2)/4,predicted=T.growthRate(1.8,20,10);
  assert.ok(at6>at2);near(measured,predicted,.01);
  // Finite mesh and nonlinear saturation are deliberately not called exact continuum theory.
});

test('same-seed experiments share time steps while equal diffusion damps and the unstable field grows',()=>{
  const mesh=T.makeSphere(4),stable=new T.ReactionSphere(mesh,{ratio:1}),unstable=new T.ReactionSphere(mesh,{ratio:20});
  assert.deepEqual(stable.u,unstable.u);assert.deepEqual(stable.v,unstable.v);const initial=stable.statistics().stdU;
  for(let i=0;i<100;i++)T.advanceTogether([stable,unstable],.2);
  const a=stable.statistics(),b=unstable.statistics();near(a.time,20,1e-10);near(b.time,a.time);assert.equal(a.substeps,b.substeps);
  assert.ok(a.stdU<initial*.1,JSON.stringify(a));assert.ok(b.stdU>initial*30,JSON.stringify(b));
  assert.ok(b.maxU>4&&b.minU<.8);assert.ok(unstable.spectrum(18).power.some(v=>v>.01));
});

test('adaptive reaction and diffusion integration stays positive at strong patterns and matched perturbations',()=>{
  const mesh=T.makeSphere(3),a=new T.ReactionSphere(mesh,{ratio:40,b:1.95,amplitude:.08}),b=new T.ReactionSphere(mesh,{ratio:1,b:1.95,amplitude:.08});
  a.poke([1,0,0],.15,.3);b.poke([1,0,0],.15,.3);assert.deepEqual(a.u,b.u);assert.deepEqual(a.v,b.v);
  for(let i=0;i<300;i++)T.advanceTogether([a,b],.2);
  for(const f of [a,b]){assert.ok(f.u.every(x=>Number.isFinite(x)&&x>=0));assert.ok(f.v.every(x=>Number.isFinite(x)&&x>=0));near(f.time,60,1e-9);}
  assert.ok(a.statistics().stdU>.1);assert.equal(a.substeps,b.substeps);
  assert.throws(()=>a.poke([0,0,0],.1,.3),/Invalid/);assert.throws(()=>a.configure({ratio:41}),/Invalid/);
});

test('Heun time-step refinement converges for the same finite-time field',()=>{
  function run(count){const f=new T.ReactionSphere(T.makeSphere(3),{ratio:20});for(let i=0;i<20;i++)f.advance(.1,count);return f;}
  const a=run(4),b=run(8),c=run(16);
  const error=(x,y)=>Math.sqrt(x.u.reduce((s,v,i)=>s+(v-y.u[i])**2,0)/x.u.length);
  assert.ok(error(b,c)<error(a,b)*.4,`${error(a,b)} -> ${error(b,c)}`);
});

test('serialized worker evolves actual matched fields, transfers mesh and ignores stale messages',()=>{
  const sent=[],self={postMessage:(m,transfer)=>sent.push({m,transfer})};
  vm.runInNewContext(T.workerSource(),{self,console,Math,Number,Float32Array,Float64Array,Uint32Array,Map,Array,Error,Infinity});
  const send=data=>self.onmessage({data});
  send({type:'reset',generation:4,level:3,options:{b:1.8,ratio:20,seed:123,kind:'noise',degree:10,amplitude:.03},compare:true,warm:0});
  const ready=sent.at(-1).m;assert.equal(ready.kind,'ready');assert.equal(ready.mesh.vertices,642);assert.equal(ready.primary.stats.ratio,20);assert.equal(ready.reference.stats.ratio,1);
  assert.deepEqual(Array.from(new Float32Array(ready.primary.u)),Array.from(new Float32Array(ready.reference.u)));
  const before=sent.length;send({type:'advance',generation:3,duration:.2});assert.equal(sent.length,before);
  send({type:'advance',generation:4,duration:.2,spectrum:true});const frame=sent.at(-1).m;assert.equal(frame.kind,'frame');near(frame.primary.stats.time,.2);near(frame.reference.stats.time,.2);assert.equal(frame.primary.stats.substeps,frame.reference.stats.substeps);
  send({type:'poke',generation:4,point:[0,0,1],strength:.06,radius:.2});const poke=sent.at(-1).m;assert.equal(poke.primary.stats.pokes,1);assert.equal(poke.reference.stats.pokes,1);
  send({type:'configure',generation:4,b:1.7,ratio:12});const configured=sent.at(-1).m;assert.equal(configured.primary.stats.ratio,12);assert.equal(configured.reference.stats.ratio,1);assert.equal(configured.reference.stats.b,1.7);
  assert.ok(sent.every(x=>!x.transfer||x.transfer.every(b=>b.byteLength>0)));
});

test('surface probe reads the actual local reaction, cotangent diffusion and tangent flux without perturbing the field',()=>{
  const mesh=T.makeSphere(4),f=new T.ReactionSphere(mesh,{b:1.8,ratio:20,amplitude:0});
  // x on a sphere has analytical tangential gradient e_x - x n.
  for(let i=0;i<mesh.count;i++){f.u[i]=1+.2*mesh.positions[3*i];f.v[i]=1.8+.1*mesh.positions[3*i+1];}
  const index=T.nearestVertex(mesh,[1,1,1]),beforeU=f.u.slice(),beforeV=f.v.slice(),p=f.probe(index),n=p.point;
  const lu=f.laplacian(f.u),lv=f.laplacian(f.v);
  near(p.u,f.u[index]);near(p.v,f.v[index]);near(p.reactionU,1-2.8*p.u+p.u*p.u*p.v);
  near(p.reactionV,1.8*p.u-p.u*p.u*p.v);near(p.diffusionU,T.DU*lu[index]);near(p.diffusionV,T.DU*20*lv[index]);
  near(p.totalU,p.reactionU+p.diffusionU);near(p.totalV,p.reactionV+p.diffusionV);
  near(p.fluxU.reduce((s,x,i)=>s+x*n[i],0),0,1e-12);near(p.fluxV.reduce((s,x,i)=>s+x*n[i],0),0,1e-12);
  for(let i=0;i<3;i++)near(p.fluxU[i],-T.DU*.2*((i===0?1:0)-n[0]*n[i]),.000005);
  assert.deepEqual(f.u,beforeU);assert.deepEqual(f.v,beforeV);assert.equal(f.time,0);assert.equal(f.pokes,0);
  assert.throws(()=>f.probe(-1),/Invalid/);assert.throws(()=>T.nearestVertex(mesh,[0,0,0]),/Invalid/);
});

test('worker probing is synchronized, non-invasive and mirrored to both independently evolved spheres',()=>{
  const sent=[],self={postMessage:m=>sent.push(m)};
  vm.runInNewContext(T.workerSource(),{self,console,Math,Number,Float32Array,Float64Array,Uint32Array,Map,Array,Error,Infinity});
  const send=data=>self.onmessage({data});
  send({type:'reset',generation:7,level:3,options:{ratio:20},compare:true,warm:0});
  const ready=sent.at(-1),before=Array.from(new Float32Array(ready.primary.u));
  send({type:'probe',generation:7,point:[0,0,1]});const probed=sent.at(-1);
  assert.equal(probed.kind,'probed');assert.equal(probed.primary.probe.index,probed.reference.probe.index);
  assert.deepEqual(Array.from(new Float32Array(probed.primary.u)),before);assert.equal(probed.primary.stats.pokes,0);assert.equal(probed.primary.stats.time,0);
  send({type:'advance',generation:7,duration:.2});const frame=sent.at(-1);near(frame.primary.probe.time,.2);near(frame.reference.probe.time,.2);
  send({type:'probe',generation:7,point:null});assert.equal(sent.at(-1).primary.probe,null);
});

test('fixed radius rescales the actual surface Laplacian, probe flux, area, CFL and continuum spectrum',()=>{
  const mesh=T.makeSphere(4),a=new T.ReactionSphere(mesh,{radius:1}),b=new T.ReactionSphere(mesh,{radius:.6}),c=new T.ReactionSphere(mesh,{radius:1.35});
  assert.deepEqual(a.u,b.u);assert.deepEqual(a.u,c.u);
  const la=a.laplacian(a.u),lb=b.laplacian(b.u),lc=c.laplacian(c.u);
  for(let i=0;i<mesh.count;i+=37){near(lb[i],la[i]/.6**2,1e-11);near(lc[i],la[i]/1.35**2,1e-11);}
  const index=T.nearestVertex(mesh,[1,1,1]),pa=a.probe(index),pb=b.probe(index);
  near(pb.diffusionU,pa.diffusionU/.6**2);for(let i=0;i<3;i++)near(pb.fluxU[i],pa.fluxU[i]/.6,1e-12);
  near(b.statistics().area,a.statistics().area*.6**2);assert.ok(b.maxStep()<a.maxStep());
  assert.equal(T.prediction(1.8,20,24,.6).fastest,6);assert.equal(T.prediction(1.8,20,24,1).fastest,10);assert.equal(T.prediction(1.8,20,24,1.35).fastest,14);
  assert.throws(()=>new T.ReactionSphere(mesh,{radius:.59}),/Invalid/);assert.throws(()=>T.growthRate(1.8,20,10,2),/Invalid/);
});

test('same angular initial field evolves into different measured modes at different fixed radii',()=>{
  const mesh=T.makeSphere(4),a=new T.ReactionSphere(mesh,{radius:.6}),b=new T.ReactionSphere(mesh,{radius:1.35});
  for(let i=0;i<100;i++)T.advanceTogether([a,b],.2);
  near(a.time,b.time);assert.equal(a.substeps,b.substeps);assert.equal(a.spectrum().dominant,6);assert.equal(b.spectrum().dominant,11);
  assert.ok(a.u.some((u,i)=>Math.abs(u-b.u[i])>.1));assert.ok(a.statistics().regionsU>0);assert.ok(b.statistics().regionsU>0);
  const field=new Float64Array(mesh.count);field[T.nearestVertex(mesh,[0,0,1])]=2;field[T.nearestVertex(mesh,[0,0,-1])]=2;
  assert.equal(a.countRegions(field,1.25),2);field.fill(2);assert.equal(a.countRegions(field,1.25),1);field.fill(1);assert.equal(a.countRegions(field,1.25),0);
});

test('worker radius comparison retains matching diffusion, initial values, steps and configured reaction',()=>{
  const sent=[],self={postMessage:m=>sent.push(m)};vm.runInNewContext(T.workerSource(),{self,console,Math,Number,Float32Array,Float64Array,Uint32Array,Map,Array,Error,Infinity});
  const send=data=>self.onmessage({data});
  send({type:'reset',generation:9,level:3,options:{radius:1.35,b:1.8,ratio:20},compare:true,comparisonMode:'radius'});
  const ready=sent.at(-1);assert.equal(ready.primary.stats.radius,1.35);assert.equal(ready.reference.stats.radius,1);
  assert.equal(ready.primary.stats.ratio,20);assert.equal(ready.reference.stats.ratio,20);assert.deepEqual(Array.from(new Float32Array(ready.primary.u)),Array.from(new Float32Array(ready.reference.u)));
  send({type:'advance',generation:9,duration:.2,spectrum:true});assert.equal(sent.at(-1).primary.stats.substeps,sent.at(-1).reference.stats.substeps);
  send({type:'configure',generation:9,b:1.7,ratio:12});assert.equal(sent.at(-1).reference.stats.ratio,12);assert.equal(sent.at(-1).reference.stats.b,1.7);
});

test('spherical phase boundary is the minimum true discrete-mode zero and classifies all selectable parameters',()=>{
  const known=T.phaseBoundary(1.8,1);assert.equal(known.degree,13);near(known.criticalRatio,8.5946163928,1e-8);near(known.continuous,8.5676274578,1e-8);
  for(const R of [.6,1,1.35])for(const B of [1.4,1.55,1.8,1.95]) {
    const boundary=T.phaseBoundary(B,R);assert.ok(boundary.criticalRatio>=boundary.continuous-1e-12);
    near(T.growthRate(B,boundary.criticalRatio,boundary.degree,R),0,1e-12);
    for(const ratio of [1,5,9,15,25,40]) {
      const prediction=T.prediction(B,ratio,60,R),unstable=prediction.rates.slice(1).some(x=>x>0);
      assert.equal(unstable,ratio>boundary.criticalRatio,`R ${R} B ${B} r ${ratio}`);
    }
  }
});

test('signed real spherical-harmonic reconstruction uses the actual field and matches measured modal power',()=>{
  const mesh=T.makeSphere(4),f=new T.ReactionSphere(mesh,{kind:'mode',degree:10,amplitude:.03}),original=f.u.slice();
  const projected=f.projectMode(10),other=f.projectMode(4),spectrum=f.spectrum();near(projected.power,spectrum.power[10],1e-13);
  assert.equal(projected.coefficients.length,21);assert.ok(Math.min(...projected.values)<0);assert.ok(Math.max(...projected.values)>0);
  let error=0,norm=0;for(let i=0;i<mesh.count;i++){error+=mesh.area[i]*(projected.values[i]-(f.u[i]-1))**2;norm+=mesh.area[i]*(f.u[i]-1)**2;}
  assert.ok(Math.sqrt(error/norm)<.01);assert.ok(other.power<projected.power*.01);assert.deepEqual(f.u,original);
  assert.throws(()=>f.projectMode(0),/Invalid/);assert.throws(()=>f.projectMode(19),/Invalid/);
});

test('serialized worker delivers actual selected projection and real prewarm samples, not invented history',()=>{
  const sent=[],self={postMessage:m=>sent.push(m)};vm.runInNewContext(T.workerSource(),{self,console,Math,Number,Float32Array,Float64Array,Uint32Array,Map,Array,Error,Infinity});
  const send=data=>self.onmessage({data});send({type:'reset',generation:11,level:3,options:{ratio:20},compare:false,warm:2,modeDegree:10,showMode:true});
  const ready=sent.at(-1);assert.deepEqual(Array.from(ready.warmHistory,x=>x.time),[0,1,2]);assert.equal(ready.primary.mode.degree,10);
  const f=new T.ReactionSphere(T.makeSphere(3),{ratio:20});for(let i=0;i<4;i++)f.advance(.5);
  const expected=f.projectMode(10),values=new Float32Array(ready.primary.mode.values);assert.equal(values.length,642);near(ready.primary.mode.power,expected.power,1e-12);
  for(let i=0;i<values.length;i++)near(values[i],expected.values[i],1e-7);
  send({type:'mode',generation:11,degree:6,show:true});assert.equal(sent.at(-1).primary.mode.degree,6);
  send({type:'mode',generation:11,degree:6,show:false});assert.equal(sent.at(-1).primary.mode,null);
});

test('Gray–Scott solves its own reaction equations and its (1,0) baseline is linearly stable',()=>{
  const mesh=T.makeSphere(3),f=new T.ReactionSphere(mesh,{model:'gray-scott',ratio:.5,feed:.05,kill:.065,kind:'rest'});
  for(let i=0;i<100;i++)f.advance(1);assert.ok(f.u.every(x=>Math.abs(x-1)<1e-12));assert.ok(f.v.every(x=>Math.abs(x)<1e-12));
  for(const R of [.6,1,1.35])for(const ratio of [.1,.5,1,1.5])assert.ok(T.grayPrediction(.05,.065,ratio,24,R).rates.every(x=>x<0));
  f.poke([0,0,1],.5,.25);const index=T.nearestVertex(mesh,[0,0,1]),p=f.probe(index),lu=f.laplacian(f.u),lv=f.laplacian(f.v);
  near(p.reactionU,-p.u*p.v*p.v+.05*(1-p.u));near(p.reactionV,p.u*p.v*p.v-(.05+.065)*p.v);
  near(p.diffusionU,T.GRAY_DU*lu[index]);near(p.diffusionV,T.GRAY_DU*.5*lv[index]);
  assert.throws(()=>f.configure({feed:.1}),/Invalid/);
});

test('Gray–Scott finite patches evolve into a real nonuniform field while the exact rest state stays uniform',()=>{
  const mesh=T.makeSphere(4),options={model:'gray-scott',feed:.05,kill:.065,ratio:.5},patch=new T.ReactionSphere(mesh,{...options,kind:'patch'}),rest=new T.ReactionSphere(mesh,{...options,kind:'rest'});
  for(let i=0;i<100;i++)T.advanceTogether([patch,rest],2);
  const a=patch.statistics(),b=rest.statistics();assert.equal(a.time,200);assert.equal(b.time,200);assert.equal(a.substeps,b.substeps);
  assert.ok(a.stdU>.15,JSON.stringify(a));assert.ok(a.maxV>.3);assert.ok(a.regions>1);assert.equal(a.regionField,'v');assert.equal(a.regionThreshold,.18);
  assert.ok(b.stdU<1e-12);assert.ok(b.maxV<1e-12);assert.ok(patch.u.every(x=>x>=0&&Number.isFinite(x)));assert.ok(patch.v.every(x=>x>=0&&Number.isFinite(x)));
});

test('different models share integration time without claiming the same initial state or mirrored excitation',()=>{
  const sent=[],self={postMessage:m=>sent.push(m)};vm.runInNewContext(T.workerSource(),{self,console,Math,Number,Float32Array,Float64Array,Uint32Array,Map,Array,Error,Infinity});
  const send=data=>self.onmessage({data});send({type:'reset',generation:12,level:3,options:{model:'gray-scott',ratio:.5,kind:'patch'},referenceOptions:{model:'brusselator',ratio:20},compare:true,comparisonMode:'model'});
  const ready=sent.at(-1);assert.equal(ready.primary.stats.model,'gray-scott');assert.equal(ready.reference.stats.model,'brusselator');
  assert.notDeepEqual(Array.from(new Float32Array(ready.primary.v)),Array.from(new Float32Array(ready.reference.v)));
  send({type:'advance',generation:12,duration:1});const frame=sent.at(-1);assert.equal(frame.primary.stats.time,frame.reference.stats.time);assert.equal(frame.primary.stats.substeps,frame.reference.stats.substeps);
  send({type:'poke',generation:12,point:[0,0,1],strength:.5,radius:.25});assert.equal(sent.at(-1).primary.stats.pokes,1);assert.equal(sent.at(-1).reference.stats.pokes,0);
});

test('Gray–Scott Heun substeps converge and remain nonnegative at parameter extremes',()=>{
  const mesh=T.makeSphere(3);function run(count){const f=new T.ReactionSphere(mesh,{model:'gray-scott'});for(let i=0;i<50;i++)f.advance(.4,count);return f;}
  const a=run(4),b=run(8),c=run(16);
  const error=(x,y)=>Math.sqrt(x.u.reduce((sum,v,i)=>sum+(v-y.u[i])**2+(x.v[i]-y.v[i])**2,0)/x.u.length);
  assert.ok(error(b,c)<.4*error(a,b));
  for(const feed of [.015,.08])for(const kill of [.045,.075])for(const radius of [.6,1.35])for(const ratio of [.1,1.5]) {
    const f=new T.ReactionSphere(mesh,{model:'gray-scott',feed,kill,radius,ratio,kind:'patch',amplitude:.6});
    for(let i=0;i<100;i++)f.advance(2);
    assert.ok(f.u.every(x=>Number.isFinite(x)&&x>=0));assert.ok(f.v.every(x=>Number.isFinite(x)&&x>=0));
  }
});
