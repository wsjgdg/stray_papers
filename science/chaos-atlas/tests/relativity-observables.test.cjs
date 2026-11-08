'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),V=require('../relativity-observables.js');
const close=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const closeVec=(a,b,eps=1e-9)=>a.forEach((v,i)=>close(v,b[i],eps));
const norm=v=>Math.hypot(...v);
function state(extra={}){return {environment:'station',scenario:'flyby',shape:'artifact',beta:.6,motionAngle:0,time:0,yaw:0,pitch:-.025,fov:58,view:'photo',split:.5,...extra};}
function event(s){const v=M.motionVelocity(s.scenario,s.beta,s.motionAngle),camera=s.scenario==='flyby'?[0,1.65,0]:M.add([0,1.65,0],M.scale(v,s.time)),center=s.scenario==='flyby'?M.add([0,M.objectContact(s.environment,s.shape),7.5],M.scale(v,7.05+s.time)):[2.35,M.objectContact(s.environment,s.shape)+.48,8.8];return {camera,center,velocity:s.scenario==='flyby'?v:[0,0,0],observerVelocity:s.scenario==='observer'?v:[0,0,0]};}

test('actual chamfer cuts box corners for primary/inside rays and its mesh lies on the same 18 planes',()=>{
  const h=[.88,1,.42],r=.12;
  assert.equal(M.boxIntersection([2,.99,.41],[-1,0,0],h).distance,1.12);
  assert.equal(M.beveledBoxIntersection([2,.99,.41],[-1,0,0],h,r),null,'corner ray misses chamfered object');
  const a=M.beveledBoxIntersection([2,.97,0],[-1,0,0],h,r);close(a.distance,2-(h[0]+h[1]-r-.97));closeVec(a.normal,[Math.SQRT1_2,Math.SQRT1_2,0]);
  close(M.beveledBoxIntersection([0,0,0],[1,0,0],h,r).distance,h[0]);
  for(const p of M.bevelMesh(h,r).vertices){const a=p.map(Math.abs),limits=[a[0]-h[0],a[1]-h[1],a[2]-h[2],a[0]+a[1]-h[0]-h[1]+r,a[0]+a[2]-h[0]-h[2]+r,a[1]+a[2]-h[1]-h[2]+r];assert.ok(limits.every(q=>q<1e-12));assert.ok(limits.filter(q=>Math.abs(q)<1e-12).length>=3);}
});

test('clock proper time is the Lorentz-transformed event, not merely t/gamma for every material point',()=>{
  const v=[.36,0,.48],local=[.7,.2,-.4],g=M.gamma(v),q=V.contracted(local,v);
  for(const t of [-10,-1,0,2,19]){const labOffset=M.add(M.scale(v,t),q),lorentz=g*(t-M.dot(v,labOffset));close(M.properTime(t,v,local),lorentz);}
  close(M.properTime(3,[0,0,0],local),3);assert.notEqual(M.properTime(3,v,local),3/g);
  const p=M.clockAnchor('station','artifact');assert.ok(V.onSurface('station','artifact',p.point));assert.equal(M.clockInk(p.point,[0,0,-1],M.objectHalf('station','artifact'),0),3);
  const h=M.objectHalf('station','artifact'),r=p.radius;assert.equal(M.clockInk([0,p.point[1]+.65*r,p.point[2]],[0,0,-1],h,0),3);assert.equal(M.clockInk([.65*r,p.point[1],p.point[2]],[0,0,-1],h,3),3);
  assert.equal(M.clockInk([0,p.point[1],p.point[2]],[0,0,1],h,0),0);
});

test('retarded and simultaneous locations follow one material worldline and the past light cone',()=>{
  for(const environment of ['station','street','corridor','mountain'])for(const shape of ['artifact','cube','sphere'])for(const scenario of ['flyby','observer'])for(const beta of [-.98,-.6,0,.6,.98])for(const motionAngle of [-90,0,45,135]){
    const s=state({environment,shape,scenario,beta,motionAngle,time:1.1}),e=event(s),point=M.clockAnchor(environment,shape).point,result=V.evaluate(s,e,point,1200,750);assert.ok(result);
    const ret=result.emission,sim=result.simultaneous;close(s.time-ret.time,ret.distance,2e-9);close(norm(M.sub(ret.point,e.camera)),ret.distance,2e-9);
    closeVec(ret.point,V.atTime(e,point,s.time,ret.time),2e-9);closeVec(sim.point,V.atTime(e,point,s.time,s.time),2e-9);
    close(result.properEmission,M.properTime(ret.time,e.velocity,point));close(result.properNow,M.properTime(s.time,e.velocity,point));
    const screen=ret.screen;if(screen.status==='inside'){
      const effective=2*Math.atan(Math.tan(s.fov*Math.PI/360)*Math.max(1,.95*750/1200))*180/Math.PI,ray=M.cameraRay(screen.x,screen.y,1200,750,s.yaw,s.pitch,effective),lab=scenario==='observer'?M.observerToLab(ray,e.observerVelocity):ray;
      closeVec(lab,M.normalize(M.sub(ret.point,e.camera)),3e-9);
    }
  }
});

test('apparent clock rate includes light travel and agrees with relativistic Doppler factor',()=>{
  for(const scenario of ['flyby','observer'])for(const beta of [-.86,-.3,.3,.86])for(const angle of [-90,0,45,90]){
    const s=state({scenario,beta,motionAngle:angle,time:.4}),e=event(s),p=M.clockAnchor(s.environment,s.shape).point,a=V.retarded(e,p,s.time),dt=1e-5,s2={...s,time:s.time+dt},e2=event(s2),b=V.retarded(e2,p,s2.time),observedRate=(M.properTime(b.time,e2.velocity,p)-M.properTime(a.time,e.velocity,p))/dt;
    // Differentiate with respect to the observer's proper time, not lab time.
    const g=M.gamma(e.observerVelocity),n=M.normalize(M.sub(a.point,e.camera)),expected=M.dopplerFactor(n,e.velocity,e.observerVelocity);
    close(observedRate*g,expected,3e-6);
  }
});

test('visibility distinguishes a real front point, self-occlusion, offscreen and split comparison',()=>{
  const s=state({beta:0}),e=event(s),front=M.clockAnchor('station','artifact').point,a=V.evaluate(s,e,front,1200,750);assert.equal(a.emission.status,'visible');assert.equal(a.emission.visibility.status,'visible');
  const back=[0,0,M.objectHalf('station','artifact')[2]],b=V.evaluate(s,e,back,1200,750);assert.equal(b.emission.visibility.status,'self');
  const out=V.evaluate({...s,yaw:2},e,front,1200,750);assert.ok(['outside','behind'].includes(out.emission.status));
  const geom=V.evaluate({...s,view:'geometry'},e,front,1200,750);assert.equal(geom.emission.status,'not-shown');assert.equal(geom.simultaneous.status,'visible');
  const split=V.evaluate({...s,view:'split',split:.1},e,front,1200,750);assert.equal(split.emission.status,'comparison');assert.equal(split.simultaneous.status,'visible');
  assert.equal(V.evaluate(s,e,[5,5,5],1200,750),null);
});

test('every default marker is a real front-surface point distinct from the clock',()=>{
  for(const environment of ['station','street','corridor','mountain'])for(const shape of ['artifact','cube','sphere']){
    const s=state({environment,shape}),e=event(s),p=M.materialAnchor(environment,shape),clock=M.clockAnchor(environment,shape);
    assert.ok(V.onSurface(environment,shape,p),environment+'/'+shape);assert.ok(norm(M.sub(p,clock.point))>clock.radius*1.5);
    const m=V.evaluate(s,e,p,1200,750);assert.equal(m.emission.visibility.status,'visible',environment+'/'+shape);
  }
});
