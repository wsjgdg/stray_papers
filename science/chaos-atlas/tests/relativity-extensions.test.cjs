'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),O=require('../relativity-optics.js'),W=require('../relativity-worlds.js'),S=require('../relativity-spectrum.js'),E=require('../relativity-experiments.js'),V=require('../relativity-observables.js'),C=require('../relativity-comparison.js');
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('inclination is a signed 3D inertial velocity for both scenarios',()=>{
  for(const scenario of ['flyby','observer'])for(const heading of [-180,-90,0,35,90,180])for(const elevation of [-90,-50,0,40,90])for(const beta of [-.9,0,.6]){
    const v=M.motionVelocity(scenario,beta,heading,elevation);near(M.length(v),Math.abs(beta));near(v[1],beta*Math.sin(elevation*Math.PI/180));
    if(elevation===0)assert.deepEqual(v,M.motionVelocity(scenario,beta,heading));
    if(beta!==0){const n=M.normalize([.4,.2,.8]),rest=M.observerToLab(n,v),back=M.labToObserver(rest,v);for(let i=0;i<3;i++)near(n[i],back[i]);}
  }
  const old={format:'relativity-observation',schema:1,parameters:{...E.BASE},measurements:{}};delete old.parameters.motionElevation;delete old.parameters.velocityArrow;delete old.parameters.surfaceMode;
  const restored=E.parse(JSON.stringify(old)).parameters;assert.equal(restored.motionElevation,0);assert.equal(restored.velocityArrow,true);assert.equal(restored.surfaceMode,'emission');
});

test('movable indoor emitter is a real box colocated with the selected source',()=>{
  for(const id of ['station','corridor'])for(const state of [{lightX:0,lightZ:0},{lightX:2,lightZ:-1}]){
    const panel=W.lightFixture(id,state),source=O.lightPosition(id,state);assert.equal(W.lightFixture(id,{...state}),panel,'unchanged fixture is reused across rays');near(panel.center[0],source[0]);near(panel.center[2],source[2]);assert.ok(panel.center[1]-panel.half[1]>source[1]);
    const origin=[source[0],source[1]-.1,source[2]],hit=W.traceWithFixture(origin,[0,1,0],id,false,state);
    assert.equal(hit.kind,'key-light');assert.equal(hit.movableFixture,true);near(hit.point[0],source[0]);near(hit.point[2],source[2]);
    const lights=O.areaLights(id,[0,1,0],state),average=lights.reduce((a,l)=>M.add(a,l.position),[0,0,0]).map(x=>x/4);average.forEach((x,i)=>near(x,source[i]));
  }
  for(const id of ['station','corridor']){
    const source=O.lightPosition(id,{lightX:0,lightZ:0}),origin=[source[0],source[1]-.1,source[2]];
    assert.equal(W.traceWithFixture(origin,[0,1,0],id,false,{lightX:0,lightZ:0}).kind,'key-light');
    const afterMove=W.traceWithFixture(origin,[0,1,0],id,false,{lightX:2,lightZ:-1});
    assert.notEqual(afterMove?.kind,'key-light');assert.notEqual(afterMove?.kind,'light','moving the key panel must not leave a stationary duplicate');
  }
  assert.equal(W.lightFixture('mountain'),null);
});

test('elastic grey reflection composes incoming and outgoing Doppler factors',()=>{
  const velocity=M.motionVelocity('flyby',.7,30,35),point=[.2,1.2,7.5],ray={photo:true,velocity,labDirection:M.normalize([.2,.05,1]),hit:{body:true,point}};
  const state={scenario:'flyby',environment:'mountain',surfaceMode:'reflection',lightYaw:20,lightElevation:-10};
  const f=O.frequencyFactors(state,ray),incoming=M.dopplerFactor(O.keyLight('mountain',point,state).direction,[0,0,0],velocity),outgoing=M.dopplerFactor(ray.labDirection,velocity,[0,0,0]);
  near(f.incident,incoming);near(f.outgoing,outgoing);near(f.total,incoming*outgoing);near(O.frequencyRatio(state,ray),f.total);assert.notEqual(f.incident,1);
  const emission=O.frequencyFactors({...state,surfaceMode:'emission'},ray);near(emission.incident,1);near(emission.total,outgoing);
  near(O.frequencyFactors({...state}, {...ray,velocity:[0,0,0]}).total,1);
  assert.equal(O.frequencyFactors(state,{...ray,photo:false}),null);
});

test('reconstructed linear-light average precedes the output tone and differs from RGB averaging',()=>{
  const samples=[[.15,.25,.35],[.7,.6,.5],[.4,.3,.2],[.05,.1,.2]],linear=samples.map(S.displayToRadiance),mean=[0,1,2].map(i=>linear.reduce((a,v)=>a+v[i]/linear.length,0)),out=S.radianceToDisplay(mean),naive=[0,1,2].map(i=>samples.reduce((a,v)=>a+v[i]/samples.length,0));
  assert.ok(out.some((v,i)=>Math.abs(v-naive[i])>.05));
  for(const sample of samples){const restored=S.radianceToDisplay(S.displayToRadiance(sample));for(let i=0;i<3;i++)near(restored[i],sample[i]);}
});

test('two groups hold one observation event, calculate light-cone candidates and round-trip reproducibly',()=>{
  const base={...E.BASE,shape:'cube',motionElevation:20},lock={time:base.time,camera:[0,1.65,0],center:[2,1.22,7.5]},groups=[{beta:.2,motionAngle:0,motionElevation:20},{beta:.85,motionAngle:40,motionElevation:-15}],result=C.build(base,groups,lock);
  assert.equal(result.curves[0].length,81);assert.notEqual(result.measurements[0].delta,result.measurements[1].delta);
  for(let i=0;i<2;i++){
    const m=result.measurements[i],scenario=C.scenario(base,groups[i],lock);assert.deepEqual(scenario.event.camera,lock.camera);assert.deepEqual(scenario.event.center,lock.center);
    for(const point of [m.left,m.right]){near(M.length(M.sub(point.emissionPoint,lock.camera)),base.time-point.emissionTime);assert.ok(V.onSurface(base.environment,base.shape,point.rest));}
    near(m.delta,m.right.emissionTime-m.left.emissionTime);
  }
  const exported=C.serialize(result),imported=C.parse(JSON.stringify(exported));assert.deepEqual(imported.measurements,result.measurements);assert.deepEqual(imported.curves,result.curves);
  assert.equal(exported.implementationVersion,'20261105-10');assert.equal(exported.image.spatialSamples,1);assert.equal(exported.image.view,'photo');
  const split=C.build({...base,shadowTiming:'split'},groups,lock);assert.equal(C.scenario(split.base,groups[0],lock).state.shadowTiming,'retarded');assert.equal(C.serialize(split).image.shadowTiming,'retarded');
  const observer=C.build({...base,scenario:'observer'},groups,lock);near(observer.measurements[0].delta,observer.measurements[1].delta);assert.ok(observer.curves[0].every(p=>Math.abs(p.delta-observer.curves[0][0].delta)<1e-12));
  assert.throws(()=>C.build(base,[{...groups[0],beta:1},groups[1]],lock));assert.throws(()=>C.parse('{"format":"bad"}'));
});

test('velocity overlay stays visible when viewed end-on',()=>{
  const U=require('../relativity-overlays.js'),labels=[],ctx={setTransform(){},clearRect(){},save(){},restore(){},setLineDash(){},beginPath(){},arc(){},stroke(){},fill(){},moveTo(){},lineTo(){},measureText(text){return {width:text.length*6};},strokeText(){},fillText(text,x,y){labels.push({text,x,y});}};
  const canvas={clientWidth:800,clientHeight:500,width:800,height:500,getContext(){return ctx;}},state={scenario:'flyby',view:'geometry',shape:'cube',environment:'station',yaw:0,pitch:0,contour:false,velocityArrow:true};
  for(const [z,expected] of [[.6,'向屏幕里'],[-.6,'向屏幕外']]){
    const event={camera:[0,1.65,0],center:[0,1.65,8],velocity:[0,0,z],observerVelocity:[0,0,0]},p=U.velocityProjection(state,event,800,500,58);
    near(Math.hypot(p.a[0]-p.b[0],p.a[1]-p.b[1]),0);U.draw(canvas,state,event,58);assert.ok(labels.at(-1).text.includes(expected));
  }
  U.draw(canvas,state,{camera:[0,1.65,0],center:[4,1.65,8],velocity:[.6,0,0],observerVelocity:[0,0,0]},58);
  const last=labels.at(-1);assert.ok(last.x>=0&&last.x+last.text.length*6<=800,'arrow label stays within the viewport');
});

test('comparison shutter samples continue both worldlines from the same locked event',()=>{
  const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const root={RelativityModel:M,RelativityWorlds:W,RelativityOptics:O,RelativitySpectrum:S};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../relativity-renderer.js'),'utf8'),{window:root});
  const R=root.RelativityRenderer,lock={time:1.2,camera:[1,2,3],center:[3,1.4,9]},group={beta:.7,motionAngle:35,motionElevation:25};
  for(const scenarioName of ['flyby','observer']){
    const base={...E.BASE,time:lock.time,scenario:scenarioName,shutter:.8},state=C.scenario(base,group,lock).state,vel=M.motionVelocity(scenarioName,group.beta,group.motionAngle,group.motionElevation);
    for(const dt of [-.3,0,.3]){
      const event=R.eventState({...state,time:lock.time+dt}),expectedCamera=scenarioName==='observer'?M.add(lock.camera,M.scale(vel,dt)):lock.camera,expectedCenter=scenarioName==='flyby'?M.add(lock.center,M.scale(vel,dt)):lock.center;
      for(let k=0;k<3;k++){near(event.camera[k],expectedCamera[k]);near(event.center[k],expectedCenter[k]);}
    }
  }
});
