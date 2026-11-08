'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),O=require('../relativity-optics.js'),S=require('../relativity-spectrum.js'),T=require('../relativity-material-spectrum.js'),E=require('../relativity-experiments.js'),D=require('../relativity-measured-data.js'),P=require('../relativity-probe-spectrum.js');
const root={RelativityModel:M,RelativityWorlds:W,RelativityOptics:O,RelativitySpectrum:S,RelativityMaterialSpectrum:T,RelativitySurface:require('../relativity-surface.js')};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../relativity-renderer.js'),'utf8'),{window:root,console});const R=root.RelativityRenderer;
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t*Math.max(1,Math.abs(a),Math.abs(b)),`${a} vs ${b}`);
function rays(state,predicate=()=>true){let all=[];for(let y=0;y<60;y++)for(let x=0;x<96;x++){const ray=R.trace(state,x+.5,y+.5,96,60),bounce=R.traceReflection(state,ray);if(bounce&&predicate(bounce,ray))all.push({bounce,ray,x,y});}return all;}

test('finite, rotating mirror and stand are real occluding geometry only when enabled',()=>{
  const start=[-2.25,2.1,0],dir=[0,0,1],plain={...E.BASE,beta:0},mirror={...plain,sceneMirror:true};
  assert.notEqual(W.traceWithFixture(start,dir,'station',false,plain)?.kind,'mirror-panel');
  const hit=W.traceWithFixture(start,dir,'station',false,mirror);assert.equal(hit.kind,'mirror-panel');close(hit.distance,9.475);assert.deepEqual(Array.from(hit.normal),[0,0,-1]);
  assert.equal(W.occluded(start,dir,'station',false,mirror,9.48),true);assert.equal(W.occluded(start,dir,'station',false,mirror,9.47),false);
  const tilted={...mirror,mirrorAngle:30},h=W.mirrorIntersection(start,dir,tilted);assert.equal(h.kind,'mirror-panel');close(M.length(h.normal),1);close(h.normal[0],-.5);close(h.normal[2],-Math.sqrt(3)/2);
  assert.ok(W.mirrorParts.every(p=>Object.isFrozen(p.center)&&Object.isFrozen(p.half)));
  assert.equal(W.mirrorIntersection([-3.34,2.1,0],dir,mirror)?.kind,'mirror-frame');
});

test('one-bounce paths obey reflection law and BOTH retarded segments for moving source',()=>{
  const state={...E.BASE,sceneMirror:true,shape:'sphere',beta:.6,time:0,doppler:false},items=rays(state,b=>b.ray.hit?.body);
  assert.ok(items.length>30,`body pixels ${items.length}`);
  for(const {ray,bounce} of items){
    const n=ray.hit.normal,a=ray.labDirection,b=bounce.direction;
    close(M.length(b),1);close(M.dot(a,n),-M.dot(b,n));
    const cross=M.cross(n,M.sub(a,b));close(M.length(cross),0);
    close(bounce.mirrorTime,state.time-ray.hit.distance);
    close(bounce.sourceTime,state.time-bounce.totalDistance);
    close(bounce.sourceTime,bounce.ray.hit.emittedAt);
    const v=bounce.ray.hit.velocity,center=R.eventState(state).center,expected=M.add(center,M.scale(v,bounce.sourceTime-state.time));
    expected.forEach((v,i)=>close(v,bounce.ray.hit.centerAtEmission[i]));
    const f=O.frequencyFactors(bounce.state,bounce.ray);close(f.total,f.incident*f.outgoing);
  }
  const direct=rays(state,b=>b.ray.hit?.body)[0],moved=rays({...state,time:1},b=>b.ray.hit?.body);
  assert.ok(moved.length>0);assert.notEqual(direct.bounce.sourceTime,moved[0].bounce.sourceTime);
});

test('moving observer frequency uses mirror-to-observer direction, not reflected incoming direction',()=>{
  const state={...E.BASE,sceneMirror:true,scenario:'observer',shape:'sphere',beta:.7,time:0},items=rays(state,b=>b.ray.hit);
  assert.ok(items.length>0);for(const {ray,bounce} of items){
    const f=O.frequencyFactors(bounce.state,bounce.ray),expected=M.stationarySourceDoppler(ray.labDirection,ray.observerVelocity);close(f.total,expected);close(f.outgoing,expected);
    assert.ok(Math.abs(expected-M.stationarySourceDoppler(bounce.direction,ray.observerVelocity))>.001);
  }
});

test('mirror only bounces photographic rays, not slice or false-color, and follows second worldline',()=>{
  const base={...E.BASE,sceneMirror:true,shape:'sphere',beta:.72,secondEnabled:true,secondBeta:-.45,secondAngle:25};
  const both=rays(base,b=>b.ray.hit?.body);assert.ok(both.some(x=>x.bounce.ray.hit.bodyId==='A'));
  const stateB={...base,beta:.6,secondBeta:-.9,secondAngle:0,time:3,mirrorX:2,mirrorAngle:40};
  const second=rays(stateB,b=>b.ray.hit?.bodyId==='B');assert.ok(second.length>0,'a mirror must be able to reflect body B');
  for(const {bounce} of second.slice(0,10)){
    const reference=R.eventState(stateB).second,expected=M.add(reference.center,M.scale(reference.velocity,bounce.sourceTime-stateB.time));
    expected.forEach((v,i)=>close(bounce.ray.hit.centerAtEmission[i],v));
    const local=bounce.ray.second;local.center.forEach((v,i)=>close(bounce.ray.hit.centerAtEmission[i],v-local.velocity[i]*bounce.ray.hit.distance));
  }
  const s={...base,view:'geometry'},ray=R.trace(s,35.5,30.5,96,60);assert.equal(R.traceReflection(s,ray),null);
  const color={...base,emissionMap:true};for(let y=20;y<40;y++)for(let x=20;x<45;x++)assert.equal(R.traceReflection(color,R.trace(color,x+.5,y+.5,96,60)),null);
});

test('USGS originals, sampling positions and generated JS are exactly reproducible',()=>{
  const dir=path.join(__dirname,'../data/usgs-splib07a');
  const files={
    wavelengths:['splib07a_Wavelengths_ASD_0.35-2.5_microns_2151_ch.txt','57f67300f64ae49fcb8bf5a967cf097e978317047e13e8baf476e2f62af9a23c'],
    'usgs-paint':['splib07a_Painted_Aluminum_GDS333_LgGr_ASDFRa_AREF.txt','0af50ab8ad3dbd00560808e05905aaad382e465905354d264c51a46afbf0f5d4'],
    'usgs-pine':['splib07a_Plywood_GDS365_Fresh_Pine_ASDFRa_AREF.txt','179430d3ddb15e024b6b8349ca30e672609e6e92943149acd9fc988eb2eb5246'],
    'usgs-nylon':['splib07a_Nylon_Fabric_GDS431_Red_RpSt_ASDFRa_AREF.txt','07b6c93d70476c3ff41cdb2507caad8d17bb0b74a4211fd7ee2217fa3a738a93']};
  for(const [key,[file,hash]] of Object.entries(files)){
    const bytes=fs.readFileSync(path.join(dir,file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),hash);
    const values=bytes.toString('ascii').trim().split(/\r?\n/).slice(1).map(Number);assert.equal(values.length,2151);assert.equal(D[key].length,2151);
    for(let i=0;i<values.length;i++)close(D[key][i],values[i]*(key==='wavelengths'?1000:1),1e-12);
  }
  const generated=path.join(__dirname,'../relativity-measured-data.js'),before=fs.readFileSync(generated);
  cp.execFileSync('python3',[path.join(__dirname,'../scripts/extract-usgs-spectra.py'),'--check']);assert.deepEqual(fs.readFileSync(generated),before);
});

test('measured spectra use exact samples, interpolation, finite band and explicit endpoint extrapolation',()=>{
  for(const id of T.measuredIds){
    const data=D[id],waves=D.wavelengths;for(let i=0;i<2151;i+=7)close(T.reflectance(id,waves[i]),data[i],1e-12);
    for(let i=0;i<2150;i+=43){const w=(waves[i]+waves[i+1])/2;close(T.reflectance(id,w),(data[i]+data[i+1])/2,1e-12);}
    close(T.reflectance(id,100),data[0],1e-12);close(T.reflectance(id,9000),data[2150],1e-12);
    close(T.coverage(id,1),1);close(T.coverage(id,.2),0);close(T.coverage(id,10),0);
    const buffer=T.lineAtlas(id);assert.equal(buffer.length,1024*3*4);for(let i=0;i<2151;i+=17){const got=(buffer[i*4]*256+buffer[i*4+1])/65535;assert.ok(Math.abs(got-data[i])<1/65535);}
    const body={hit:{body:true}},state={...E.BASE,materialSpectrum:id,spectrumModel:'blackbody'},s=P.build(state,{ray:body,factors:{total:1,outgoing:.5},rgb:[.5,.5,.5]});
    assert.equal(s.material,id);assert.equal(s.measured,true);assert.ok(s.coverage>0&&s.coverage<1);assert.ok(s.samples.some(v=>!v.inMeasuredBand)&&s.samples.some(v=>v.inMeasuredBand));
  }
  assert.equal(T.coverage('fabric',1),null);assert.throws(()=>T.reflectance('usgs-pine',-1),RangeError);
});

test('mirror and measured samples round-trip while legacy schema 1 remains disabled',()=>{
  const s={...E.BASE,sceneMirror:true,mirrorX:1.25,mirrorAngle:-24,materialSpectrum:'usgs-nylon'};
  assert.deepEqual(E.parameters(s),s);const serialized=JSON.stringify({format:'relativity-observation',schema:1,parameters:s,measurements:{}});assert.deepEqual(E.parse(serialized).parameters,s);
  const old={...E.BASE};delete old.sceneMirror;delete old.mirrorX;delete old.mirrorAngle;assert.equal(E.parameters(old).sceneMirror,false);assert.equal(E.parameters(old).mirrorX,-2.25);assert.equal(E.parameters(old).mirrorAngle,0);
  for(const bad of [{mirrorX:5},{mirrorAngle:46},{sceneMirror:'yes'},{materialSpectrum:'fake'}])assert.throws(()=>E.parameters({...s,...bad}));
});
