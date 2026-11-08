'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../relativity-model.js');
const close=(a,b,eps=1e-10)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const vectorClose=(a,b,eps=1e-10)=>a.forEach((v,i)=>close(v,b[i],eps));
function distanceToRestSurface(point,center,beta,shape,half=[1,1,1],r=1){
  const relative=M.sub(point,center), b2=M.dot(beta,beta),g=M.gamma(beta);
  const rest=b2?M.add(relative,M.scale(beta,(g-1)*M.dot(relative,beta)/b2)):relative;
  return shape==='cube'?Math.max(...rest.map((x,i)=>Math.abs(x)/half[i]))-1:M.length(rest)/r-1;
}

test('Lorentz factor and subluminal validation',()=>{
  close(M.gamma([0,0,0]),1);close(M.gamma([0.6,0,0]),1.25);close(M.gamma([0,0,-0.8]),5/3);
  assert.throws(()=>M.gamma([1,0,0]),RangeError);assert.throws(()=>M.gamma([2,0,0]),RangeError);
  assert.throws(()=>M.gamma([NaN,0,0]),RangeError);assert.throws(()=>M.gamma([0,0]),RangeError);
});

test('moving part broad-phase preserves exact component intersections',()=>{
  let seed=19451;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),envs=['station','street','corridor','mountain','harbor'];
  for(let i=0;i<12000;i++){
    const env=envs[i%envs.length],shape=i%3?'artifact':'cube',inside=i%5===0,beta=inside?[0,0,0]:[(random()-.5)*.9,0,(random()-.5)*.9],center=[(random()-.5)*8,1.2,4+random()*8],half=M.objectHalf(env,shape),details=M.objectParts(env,shape),part=details[i%details.length],origin=inside?M.add(center,part.center):[(random()-.5)*4,1.65,random()-.5],direction=M.normalize([random()-.5,random()-.5,inside?random()-.5:.05+random()]),lightCone=i%2===0;
    const bevel=M.objectBevel(env,shape),rest=M.restRay(origin,direction,center,beta,lightCone);let reference=M.beveledBoxIntersection(rest.origin,rest.direction,half,bevel),kind=null;
    for(const part of details){const local=M.sub(rest.origin,part.center),candidate=part.primitive==='cylinder'?M.cylinderIntersection(local,rest.direction,part.radius,part.half[part.axis],part.axis):M.boxIntersection(local,rest.direction,part.half);if(candidate&&(!reference||candidate.distance<reference.distance)){reference=candidate;kind=part.kind;}}
    const actual=M.movingObjectHit({origin,direction,center,beta,shape:'cube',halfSize:half,bevel,lightCone,time:0,details});
    assert.equal(!!actual,!!reference);if(actual){close(actual.distance,reference.distance);assert.equal(actual.part,kind);}
  }
});

test('finite rectangular shutter uses four distinct symmetric midpoint events',()=>{
  assert.deepEqual(M.shutterTimes(2,0),[2]);M.shutterTimes(2,1.6).forEach((t,i)=>close(t,[1.4,1.8,2.2,2.6][i]));
  const samples=M.shutterTimes(-.4,.8);close(samples.reduce((a,b)=>a+b,0)/4,-.4);assert.equal(new Set(samples).size,4);
  assert.throws(()=>M.shutterTimes(0,-1),RangeError);assert.throws(()=>M.shutterTimes(NaN,1),RangeError);
});

test('horizontal heading produces the correct signed velocity for both experiments',()=>{
  vectorClose(M.motionVelocity('flyby',.6,0),[.6,0,0]);vectorClose(M.motionVelocity('flyby',.6,-90),[0,0,-.6]);
  vectorClose(M.motionVelocity('flyby',-.6,90),[0,0,-.6]);vectorClose(M.motionVelocity('observer',.6,0),[0,0,.6]);
  vectorClose(M.motionVelocity('observer',.6,90),[.6,0,0]);
  for(const scenario of ['flyby','observer'])for(const angle of [-180,-90,-45,0,30,90,180])for(const beta of [-.98,-.6,0,.6,.98]){
    const axis=M.motionAxis(scenario,angle),velocity=M.motionVelocity(scenario,beta,angle);close(M.length(axis),1);close(M.length(velocity),Math.abs(beta));close(M.gamma(velocity),1/Math.sqrt(1-beta*beta));
  }
  assert.throws(()=>M.motionVelocity('flyby',1,0),RangeError);assert.throws(()=>M.motionAxis('observer',NaN),RangeError);
});

test('aberration preserves direction length and has a numerical inverse for signed 3D velocities',()=>{
  for(const beta of [[0,0,0],[0,0,.8],[0,0,-.8],[.2,-.3,.5],[-.94,.1,.08],[1e-7,0,0]]){
    for(const n of [[0,0,1],[0,0,-1],[1,0,0],[.1,.2,.7],[-.41,.7,-.2]]){
      const original=M.normalize(n),lab=M.observerToLab(original,beta),again=M.labToObserver(lab,beta);
      close(M.length(lab),1);vectorClose(again,original,1e-9);
    }
  }
});

test('aberration has the correct sign for incoming source directions',()=>{
  const beta=[0,0,.8],labSide=[1,0,0],seen=M.labToObserver(labSide,beta);
  vectorClose(seen,[.6,0,.8]);vectorClose(M.observerToLab(seen,beta),labSide);
  vectorClose(M.observerToLab([0,0,1],beta),[0,0,1]);vectorClose(M.observerToLab([0,0,-1],beta),[0,0,-1]);
  vectorClose(M.labToObserver(labSide,[0,0,-.8]),[.6,0,-.8]);
});

test('stationary-source Doppler factor follows the four-momentum formula',()=>{
  close(M.stationarySourceDoppler([0,0,1],[0,0,.6]),2);
  close(M.stationarySourceDoppler([0,0,-1],[0,0,.6]),.5);
  close(M.stationarySourceDoppler([1,0,0],[0,0,.6]),1.25);
  close(M.stationarySourceDoppler([1,0,0],[0,0,0]),1);
});

test('at zero speed, a photograph and simultaneous lab section share exactly the same surfaces',()=>{
  for(const shape of ['cube','sphere'])for(const origin of [[0,0,0],[.2,.1,-2],[3,0,0]]){
    const args={origin,direction:M.sub([0,0,5],origin),center:[0,0,5],beta:[0,0,0],shape,time:3};
    const photo=M.movingObjectHit({...args,lightCone:true}),geometry=M.movingObjectHit({...args,lightCone:false});
    assert.ok(photo&&geometry);close(photo.distance,geometry.distance);vectorClose(photo.restPoint,geometry.restPoint);
    close(photo.emittedAt,3-photo.distance);assert.equal(geometry.emittedAt,null);
  }
});

test('simultaneous cube is Lorentz-contracted along the velocity axis, not transverse to it',()=>{
  const args={center:[0,0,0],beta:[.8,0,0],shape:'cube',halfSize:[1,1,1],lightCone:false};
  const x=M.movingObjectHit({...args,origin:[-3,0,0],direction:[1,0,0]});
  const y=M.movingObjectHit({...args,origin:[0,-3,0],direction:[0,1,0]});
  close(x.point[0],-.6);close(y.point[1],-1);
});

test('retarded hits are on the past light cone and on the instantaneous moving object surface',()=>{
  let count=0;for(const shape of ['cube','sphere'])for(const beta of [[.8,0,0],[-.75,0,0],[.15,.1,.5],[0,0,0]]){
    for(const dir of [[0,0,1],[.03,.04,1],[-.08,-.03,1]]){
      const args={origin:[0,0,0],direction:dir,center:[1.5,.3,5],beta,shape,halfSize:[1.7,1.7,1.7],radius:1.7,time:2.3};
      const hit=M.movingObjectHit({...args,lightCone:true});if(!hit)continue;count++;
      assert.ok(hit.emittedAt<=args.time);close(M.length(M.sub(hit.point,args.origin)),args.time-hit.emittedAt,2e-10);
      vectorClose(hit.centerAtEmission,M.sub(args.center,M.scale(beta,hit.distance)),2e-10);
      close(distanceToRestSurface(hit.point,hit.centerAtEmission,beta,shape,args.halfSize,args.radius),0,2e-9);
      close(M.length(hit.normal),1);close(M.length(hit.restNormal),1);
    }
  }
  assert.ok(count>=8,`only ${count} hits`);
});

test('light-cone and same-time sections actually differ at relativistic speed',()=>{
  const args={origin:[0,0,0],direction:[0,0,1],center:[3,0,5],beta:[.8,0,0],shape:'cube',halfSize:[1,1,1],time:0};
  const photo=M.movingObjectHit({...args,lightCone:true}),simultaneous=M.movingObjectHit({...args,lightCone:false});
  assert.ok(photo);assert.equal(simultaneous,null);assert.ok(photo.emittedAt<0);
});

test('moving body hit agrees with independently bracketed roots in lab space',()=>{
  for(const shape of ['cube','sphere'])for(const beta of [[.7,0,0],[-.6,0,0],[.1,.2,.45]]){
    const origin=[0,0,0],dir=M.normalize([.08,.02,1]),center=[5*beta[0]+.4,5*beta[1]+.1,5+5*beta[2]],args={origin,direction:dir,center,beta,shape,halfSize:[1.2,1.2,1.2],radius:1.2,time:1};
    const hit=M.movingObjectHit(args);assert.ok(hit);
    const f=s=>distanceToRestSurface(M.add(origin,M.scale(dir,s)),M.sub(center,M.scale(beta,s)),beta,shape,args.halfSize,args.radius);
    let lo=0,hi=0,prev=f(0);for(let s=.001;s<20;s+=.001){const value=f(s);if(value<=0&&prev>0){hi=s;lo=s-.001;break;}prev=value;}
    assert.ok(hi>0);for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(f(mid)>0)lo=mid;else hi=mid;}
    close(hit.distance,(lo+hi)/2,1e-8);
  }
});

test('surface intersections handle inside origins, parallel rays, and misses',()=>{
  close(M.boxIntersection([0,0,0],[1,0,0],[1,1,1]).distance,1);
  assert.equal(M.boxIntersection([2,0,0],[0,1,0],[1,1,1]),null);
  assert.equal(M.sphereIntersection([2,0,0],[0,1,0],1),null);
  close(M.sphereIntersection([0,0,0],[0,1,0],1).distance,1);
  assert.throws(()=>M.movingObjectHit({origin:[0,0,0],direction:[0,0,1],center:[0,0,1],shape:'cone'}),RangeError);
});

test('scene objects have distinct true dimensions and independently intersectable moving parts',()=>{
  const ids=['station','street','corridor','mountain'];
  const shapes=ids.map(id=>M.objectHalf(id,'artifact'));assert.equal(new Set(shapes.map(v=>v.join(','))).size,4);
  for(const id of ids){
    assert.deepEqual(M.objectHalf(id,'cube'),[1.22,1.22,1.22]);assert.ok(M.objectContact(id,'artifact')>0);
    const parts=M.objectParts(id,'artifact');assert.ok(Object.isFrozen(parts));assert.ok(parts.length>0&&parts.length<=12);
    for(const part of parts)assert.ok(Object.isFrozen(part)&&Object.isFrozen(part.center)&&Object.isFrozen(part.half));
  }
  // This ray is below the suitcase body, so a hit can only come from a true
  // cylinder wheel, not the flat facade or a decorative wheel texture.
  const origin=[-.64,-1.04,-1],direction=[0,0,1];
  const wheel=M.movingObjectHit({origin,direction,center:[0,0,0],beta:[0,0,0],shape:'cube',halfSize:M.objectHalf('station','artifact'),radius:1.22,details:M.objectParts('station','artifact')});
  assert.ok(wheel);assert.equal(wheel.part,'luggage-wheel');assert.ok(Math.abs(wheel.distance-.7)<1e-10);
  const without=M.movingObjectHit({origin,direction,center:[0,0,0],beta:[0,0,0],shape:'cube',halfSize:M.objectHalf('station','artifact'),radius:1.22,details:[]});assert.equal(without,null);
});

test('camera center, vertical orientation, and wide aspect ratio produce correct rays',()=>{
  vectorClose(M.cameraRay(100,50,200,100,0,0,60),[0,0,1]);
  assert.ok(M.cameraRay(100,0,200,100,0,0,60)[1]>0);
  assert.ok(M.cameraRay(200,50,200,100,0,0,60)[0]>0);
  vectorClose(M.cameraRay(100,50,200,100,Math.PI/2,0,60),[1,0,0]);
});


test('triangle intersections have correct distances, barycentric boundaries and two-sided normals',()=>{
  const a=[0,0,0],b=[0,0,2],c=[2,0,0];
  const top=M.triangleIntersection([.5,3,.5],[0,-1,0],a,b,c);assert.ok(top);assert.ok(Math.abs(top.distance-3)<1e-12);assert.deepEqual(top.normal,[0,1,0]);
  const bottom=M.triangleIntersection([.5,-2,.5],[0,1,0],a,b,c);assert.ok(bottom);assert.ok(Math.abs(bottom.distance-2)<1e-12);
  assert.equal(M.triangleIntersection([1.1,2,1.1],[0,-1,0],a,b,c),null);
  assert.equal(M.triangleIntersection([.5,2,.5],[1,0,0],a,b,c),null);
  assert.equal(M.triangleIntersection([.5,2,.5],[0,1,0],a,b,c),null);
});

test('scene-specific moving boxes are real, immutable rest-frame geometry with light-cone hits',()=>{
  const worlds=['station','street','corridor','mountain'],kinds=['luggage-handle','parcel-tape','equipment-vent','crate-frame'];
  for(let k=0;k<worlds.length;k++){
    const parts=M.objectParts(worlds[k]);assert.ok(parts.length>=2&&parts.length<=4);assert.ok(Object.isFrozen(parts));
    const part=parts[0];assert.ok(Object.isFrozen(part)&&Object.isFrozen(part.center)&&Object.isFrozen(part.half));assert.equal(part.kind,kinds[k]);
    // Trace toward the protruding face at β=0: it is hit before the main body.
    const origin=[part.center[0],part.center[1],-4],direction=[0,0,1],center=[0,0,0],halfSize=[1.22,1.22,1.22];
    const detailed=M.movingObjectHit({origin,direction,center,beta:[0,0,0],shape:'cube',halfSize,details:parts,time:3});
    const bare=M.movingObjectHit({origin,direction,center,beta:[0,0,0],shape:'cube',halfSize,time:3});
    assert.ok(detailed&&bare);assert.equal(detailed.part,kinds[k]);assert.ok(detailed.distance<bare.distance);
    close(detailed.emittedAt,3-detailed.distance);for(let j=0;j<3;j++)close(detailed.point[j],origin[j]+direction[j]*detailed.distance);
    // Construct an independently solved null ray to this part's front face.
    const beta=.6,g=M.gamma([beta,0,0]),observer=[0,1.65,0],movingCenter=[beta*7.05,1.22,7.5];
    const rest=[part.center[0],part.center[1],part.center[2]-part.half[2]],A=M.sub(M.add(movingCenter,[rest[0]/g,rest[1],rest[2]]),observer),bv=beta*A[0];
    const length=(-bv+Math.sqrt(bv*bv+(1-beta*beta)*M.dot(A,A)))/(1-beta*beta);
    const emission=M.sub(M.add(observer,A),[beta*length,0,0]),dir=M.normalize(M.sub(emission,observer));
    const moving=M.movingObjectHit({origin:observer,direction:dir,center:movingCenter,beta:[beta,0,0],shape:'cube',halfSize,details:parts,time:3});
    assert.ok(moving);assert.equal(moving.part,kinds[k]);close(moving.distance,length);close(moving.emittedAt,3-length);close(moving.centerAtEmission[0],movingCenter[0]-beta*length);
    vectorClose(moving.point,emission);vectorClose(moving.restPoint,rest);
    const sphere=M.movingObjectHit({origin,direction,center,beta:[0,0,0],shape:'sphere',radius:1.22,details:parts,time:3});
    if(sphere)assert.equal(sphere.part,null,'cube-only details must never be attached to spheres');
  }
});
