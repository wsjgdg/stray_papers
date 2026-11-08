'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),O=require('../relativity-optics.js'),S=require('../relativity-spectrum.js'),data=require('../relativity-spectrum-data.js');
const close=(actual,expected,tol=1e-9)=>assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);

test('CIE data and seven nonnegative assumed spectra calibrate to their sRGB primaries',()=>{
  assert.equal(data.cie.length,81);data.cie[35].forEach((v,i)=>close(v,[.5120501,1,.00575][i],1e-8));assert.equal(data.basis.length,7);
  const expected=[[1,1,1],[0,1,1],[1,0,1],[1,1,0],[1,0,0],[0,1,0],[0,0,1]],actual=S.directMatrix(1);
  for(let i=0;i<7;i++){assert.equal(data.basis[i].length,81);assert.ok(data.basis[i].every(x=>Number.isFinite(x)&&x>=0));for(let j=0;j<3;j++)close(actual[i][j],expected[i][j],.00003);}
  for(const rgb of [[.2,.4,.7],[.8,.4,.1],[.14,.14,.14],[0,0,0],[.99,.7,.4]])for(let k=0;k<3;k++)close(S.shift(rgb,1)[k],rgb[k],.0002);
});

test('wavelength shift and D^5 spectral radiance obey the blackbody identity',()=>{
  for(const T of [3200,6504,9000])for(const D of [.15,.4,1,1.8,4,9])for(const lambda of [380,450,550,700,780]){
    const a=D**5*S.planck(D*lambda,T),b=S.planck(lambda,D*T);assert.ok(Math.abs(a/b-1)<1e-12,`${D} ${lambda}`);
    close((D*lambda)/D,lambda,1e-12);
  }
  assert.ok(S.shift([.5,.5,.5],.51)[0]>S.shift([.5,.5,.5],.51)[2]);
  assert.ok(S.shift([.5,.5,.5],.51)[0]<.5,'redshift also reduces assumed radiance at fixed exposure');
  assert.ok(S.shift([.5,.5,.5],2)[2]>S.shift([.5,.5,.5],2)[0]);
  assert.ok(S.shift([.5,.5,.5],1,2)[0]>S.shift([.5,.5,.5],1,0)[0]);
  const unshadow=S.shift([.5,.5,.5],1,0),shadow=S.shift([.5,.5,.5],1,0,.5),linearUn=S.srgbToLinear(unshadow[0]),linearSh=S.srgbToLinear(shadow[0]);
  close((linearSh/(1-linearSh))/(linearUn/(1-linearUn)),.5,1e-6);
});

test('logarithmic spectral lookup tracks direct colorimetric quadrature',()=>{
  let worst=0;for(let j=0;j<=600;j++){
    const D=.1*100**(j/600),direct=S.directMatrix(D).flat(),sample=S.lookupMatrix(D).flat(),scale=Math.max(...direct.map(Math.abs),1e-10);
    const error=Math.max(...direct.map((v,k)=>Math.abs(v-sample[k])))/scale;worst=Math.max(worst,error);
    assert.ok(error<.04,`D=${D}, error=${error}`);
  }
  assert.ok(worst>.001,'exercise interpolation rather than only lookup nodes');
  assert.equal(S.atlasRows().length,S.N*8*4);
});

test('in-place spectral accumulation exactly matches the interpolated matrix',()=>{
  let seed=0x4839102;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let n=0;n<2000;n++){
    const rgb=[random()*4,random()*4,random()*4],D=.01*10000**random(),w=S.weights(rgb),matrix=S.lookupMatrix(D),gain=D**5,reference=[0,0,0];
    for(let i=0;i<7;i++)for(let k=0;k<3;k++)reference[k]+=w[i]*matrix[i][k]*gain;
    assert.deepEqual(S.observedLinear(rgb,D),reference);
  }
  for(const D of [.1,.51,1,2,10]){
    const rgb=[.2,.8,.4],w=S.weights(rgb),matrix=S.directMatrix(D),reference=[0,0,0];
    for(let i=0;i<7;i++)for(let k=0;k<3;k++)reference[k]+=w[i]*matrix[i][k]*D**5;
    assert.deepEqual(S.observedLinear(rgb,D,true),reference);
  }
  for(const D of [0,-1,NaN,Infinity]){
    assert.throws(()=>S.observedLinear([.1,.2,.3],D),RangeError);
    assert.throws(()=>S.observedLinear([.1,.2,.3],D,true),RangeError);
  }
});

test('traceable blackbody and Gaussian line emitters obey spectral transformation',()=>{
  for(const T of [2500,6500,12000])for(const D of [.4,1,2,4]){
    const src=S.source('blackbody',T,656.3);
    for(const lambda of [380,500,650,780])close(D**5*src.at(D*lambda),S.planck(lambda,D*T)/S.planck(lambda,T)*src.at(lambda),1e-12);
    const reference=S.sourceIntegral(src,1),xyzY=.2126729*reference[0]+.7151522*reference[1]+.072175*reference[2];close(xyzY,1,1e-5);
  }
  const src=S.source('line',6500,656.3),D=1.4,shifted=656.3/D;
  assert.ok(src.at(D*shifted)>src.at(D*(shifted+8)));close(D**5*src.at(D*shifted),D**5*src.at(656.3),1e-14);
  const chart=S.comparison('line',6500,656.3,D,200,1200,1),max=chart.samples.reduce((a,b)=>b.observed>a.observed?b:a);
  assert.ok(Math.abs(max.wavelength-shifted)<=.5);assert.equal(S.sourceAtlasRows('blackbody',6500,656.3).length,S.N*2*4);
  assert.throws(()=>S.source('line',6500,900),RangeError);assert.throws(()=>S.source('unknown'),RangeError);
  const rgb=[.5,.5,.5],a=S.sourceShift(rgb,'blackbody',3000,656.3,1),b=S.sourceShift(rgb,'blackbody',9000,656.3,1);assert.ok(a[0]/a[2]>b[0]/b[2]);
});

test('Doppler ratio contracts photon momentum with source and observer velocities',()=>{
  const n=M.normalize([.3,.2,.9]);
  for(const b of [-.98,-.6,0,.6,.98]){
    const g=1/Math.sqrt(1-b*b);
    close(M.dopplerFactor(n,[0,0,0],[0,0,b]),g*(1+b*n[2]));
    close(M.dopplerFactor(n,[b,0,0],[0,0,0]),1/(g*(1+b*n[0])));
    close(M.dopplerFactor(n,[b,0,0],[b,0,0]),1);
  }
  close(M.dopplerFactor([1,0,0],[.6,0,0],[0,0,0]),.5); // receding source
  close(M.dopplerFactor([-1,0,0],[.6,0,0],[0,0,0]),2); // approaching source
});

function surface(state,point,distance,center,velocity=[0,0,0],photo=true){
  return {photo,center,velocity,hit:{kind:'floor',point,normal:[0,1,0],distance},labDirection:[0,0,1]};
}
test('station uses a finite point light: an object behind it cannot cast a shadow',()=>{
  const state={scenario:'observer',environment:'station',shape:'sphere',beta:0,time:0};
  const point=[0,0,0],distance=1.65;
  const blocking=O.illumination(state,surface(state,point,distance,[0,2.585,2.7]));
  assert.equal(blocking.status,'shadow');assert.equal(blocking.blocker,'sphere');assert.equal(blocking.light.kind,'point');assert.ok(blocking.blockingDistance<blocking.light.distance);
  const behind=O.illumination(state,surface(state,point,distance,[0,7.755,8.1]));assert.equal(behind.status,'lit');
  assert.ok(O.shadowFactor(blocking,'station')>0&&O.shadowFactor(blocking,'station')<1);
});

test('moving-cube shadows use the retarded blocker event rather than an instantaneous box',()=>{
  const beta=.6,g=M.gamma([beta,0,0]),state={scenario:'flyby',environment:'mountain',shape:'cube',beta,time:0};
  const p=[-3,0,9.2],distance=Math.hypot(p[0],1.65,p[2]),center=[beta*7.05,1.22,7.5],velocity=[beta,0,0];
  const ray=surface(state,p,distance,center,velocity,true),result=O.illumination(state,ray);
  assert.equal(result.status,'shadow');assert.equal(result.blocker,'cube');assert.ok(result.blockingTime<result.surfaceTime);
  // Independent simultaneous lab-space slabs, using the worldline C(t-s).
  const cx=beta*(7.05+result.surfaceTime),relative=[p[0]-cx,p[1]-1.22,p[2]-7.5],direction=[O.sun[0]+beta,O.sun[1],O.sun[2]],half=[1.22/g,1.22,1.22];
  const analytic=M.boxIntersection(relative,direction,half);assert.ok(analytic);close(result.blockingDistance,analytic.distance,1e-8);close(result.blockingTime,result.surfaceTime-analytic.distance,1e-8);
  const atStart=M.add(p,M.scale(O.sun,O.EPS)),instant=M.movingObjectHit({origin:atStart,direction:O.sun,center:[cx-beta*O.EPS,1.22,7.5],beta:velocity,shape:'cube',halfSize:[1.22,1.22,1.22],radius:1.22,lightCone:false,time:result.surfaceTime-O.EPS});
  assert.equal(instant,null,'an instantaneous shadow query misses the retarded occluder');
});

test('adjustable finite and directional sources move the computed light rays',()=>{
  const p=[1,.4,2],base=O.keyLight('station',p),shifted=O.keyLight('station',p,{lightX:2,lightZ:-1});assert.deepEqual(shifted.position,[2,5.17,4.4]);assert.notDeepEqual(shifted.direction,base.direction);
  for(const light of O.areaLights('station',p,{lightX:2,lightZ:-1}))assert.ok(Math.abs(light.position[0]-2)<.4);
  const d=O.lightDirection({lightYaw:90,lightElevation:10});close(M.length(d),1,1e-12);assert.notDeepEqual(d,O.sun);assert.ok(d[1]>O.sun[1]);
  for(const light of O.areaLights('mountain',p,{lightYaw:90,lightElevation:10}))assert.ok(M.dot(light.direction,d)>.99);
});

test('frozen blocker reference isolates propagation from the surface event',()=>{
  const p=[-3,0,9.2],distance=Math.hypot(p[0],1.65,p[2]),velocity=[.6,0,0],center=[.6*7.05,1.22,7.5],ray=surface({},p,distance,center,velocity,true);
  const state={scenario:'flyby',environment:'mountain',shape:'cube',beta:.6,time:0};
  const retarded=O.illumination(state,ray),frozen=O.illumination({...state,shadowTiming:'instant'},ray);
  assert.equal(retarded.blocker,'cube');assert.equal(frozen.status,'lit');assert.ok(retarded.blockingTime<retarded.surfaceTime);
  const still={...ray,velocity:[0,0,0]},same={...state,beta:0};assert.equal(O.illumination(same,still).shadowed,O.illumination({...same,shadowTiming:'instant'},still).shadowed);
});

test('moving-sphere shadow intersects the retarded world tube at the quadratic root',()=>{
  const beta=.6,g=M.gamma([beta,0,0]),state={scenario:'flyby',environment:'mountain',shape:'sphere',beta,time:0};
  const p=[-2.7,0,9.1],distance=Math.hypot(p[0],1.65,p[2]),center=[beta*7.05,1.22,7.5],velocity=[beta,0,0];
  const hit=O.illumination(state,surface(state,p,distance,center,velocity,true));assert.equal(hit.blocker,'sphere');
  const cx=beta*(7.05+hit.surfaceTime),r=[g*(p[0]-cx),p[1]-1.22,p[2]-7.5],dir=[g*(O.sun[0]+beta),O.sun[1],O.sun[2]];
  const a=M.dot(dir,dir),b=M.dot(r,dir),c=M.dot(r,r)-1.22**2,disc=b*b-a*c;assert.ok(disc>0);
  const root=(-b-Math.sqrt(disc))/a;assert.ok(root>0);close(hit.blockingDistance,root,1e-8);close(hit.blockingTime,hit.surfaceTime-root,1e-8);
});

test('simultaneous flyby geometry has no photographic Doppler ratio and uses slice time',()=>{
  const state={scenario:'flyby',environment:'mountain',shape:'cube',beta:0,time:2};
  const ray=surface(state,[1.5,0,9],10,[0,1.22,7.5],[0,0,0],false);assert.equal(O.frequencyRatio(state,ray),null);
  const result=O.illumination(state,ray);assert.equal(result.surfaceTime,2);
  const observer={...state,scenario:'observer'};close(O.frequencyRatio(observer,ray),1);
});


test('a foliage-card silhouette can cast a real shadow on the finite terrain',()=>{
  const camera=[0,1.65,0],direction=M.cameraRay(1257.5,395.5,1440,900,0,-.025,58);
  const hit=W.trace(camera,direction,'mountain');assert.equal(hit.kind,'terrain');
  const ray={hit,photo:true,velocity:[0,0,0],center:[100,1.22,7.5]},state={environment:'mountain',scenario:'flyby',shape:'cube',beta:0,time:0};
  const light=O.illumination(state,ray);assert.equal(light.blocker,'tree-conifer');assert.equal(light.shadowed,true);
  close(light.blockingTime,light.surfaceTime-light.blockingDistance,1e-8);
});

test('finite rectangular and widened directional lights have four normalized, symmetric samples',()=>{
  for(const env of W.IDs){
    const point=[1.3,.4,2.1],lights=O.areaLights(env,point);assert.equal(lights.length,4);
    for(const light of lights){close(M.length(light.direction),1,1e-12);if(light.position){
      close(M.length(M.sub(light.position,point)),light.distance,1e-12);
      const target=M.add(point,M.scale(light.direction,light.distance));for(let k=0;k<3;k++)close(target[k],light.position[k],1e-12);
    }else assert.equal(light.distance,1e20);}
    if(env==='station'||env==='corridor'||env==='harbor'){
      const mean=[0,1,2].map(k=>lights.reduce((a,b)=>a+b.position[k],0)/4);
      for(let k=0;k<3;k++)close(mean[k],O.keyLight(env,point).position[k],1e-12);
      assert.ok(Math.max(...lights.map(a=>a.position[0]))-Math.min(...lights.map(a=>a.position[0]))>.7);
    }else{
      assert.ok(lights.every(l=>l.kind==='extended-directional'));
      assert.ok(lights.every(l=>M.dot(l.direction,O.sun)>.99));
    }
  }
});

test('area shadows average distinct past light rays, including the moving blocker event',()=>{
  const beta=.6,state={scenario:'flyby',environment:'mountain',shape:'cube',beta,time:0};
  const p=[-3.96,0,9.96],distance=Math.hypot(p[0],1.65,p[2]),center=[beta*7.05,1.22,7.5];
  const ray=surface(state,p,distance,center,[beta,0,0]),soft=O.softIllumination(state,ray);
  assert.equal(soft.sampleCount,4);assert.equal(soft.status,'partial');assert.ok(soft.blocked>0&&soft.blocked<4);
  assert.ok(O.shadowFactor(soft,'mountain')>0&&O.shadowFactor(soft,'mountain')<1);
  const blocker=soft.samples.find(s=>s.blocker==='cube');assert.ok(blocker);
  assert.ok(blocker.blockingTime<blocker.surfaceTime);close(blocker.blockingTime,blocker.surfaceTime-blocker.blockingDistance,1e-8);
  const independently=O.illumination(state,ray,blocker.light);close(blocker.blockingDistance,independently.blockingDistance,1e-12);
  const direct=soft.samples.reduce((a,s)=>a+Math.max(0,s.cosine||0),0)/4;
  const visible=soft.samples.reduce((a,s)=>a+(s.status==='lit'?Math.max(0,s.cosine||0):0),0)/4;
  close(soft.direct,direct,1e-12);close(soft.visible,visible,1e-12);
  close(O.shadowFactor(soft,'mountain'),(.38+.62*visible)/(.38+.62*direct),1e-12);
});


test('a moving rest-frame handle itself occludes at the independently constructed past event',()=>{
  const beta=.6,state={scenario:'flyby',environment:'station',shape:'cube',beta,time:0};
  const p=[0,0,0],distance=1.65,light=O.keyLight('station',p),blockDistance=3,g=M.gamma([beta,0,0]),rest=[0,.86,-1.305];
  const centerAtBlock=M.sub(M.add(p,M.scale(light.direction,blockDistance)),[rest[0]/g,rest[1],rest[2]]);
  const center=M.add(centerAtBlock,[beta*(distance+blockDistance),0,0]);
  const hit=O.illumination(state,surface(state,p,distance,center,[beta,0,0]));
  assert.equal(hit.blocker,'luggage-handle');close(hit.blockingDistance,blockDistance,1e-9);close(hit.blockingTime,-distance-blockDistance,1e-9);
});
