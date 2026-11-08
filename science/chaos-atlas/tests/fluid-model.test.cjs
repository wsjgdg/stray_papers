'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const F = require('../fluid-model.js');
const V = require('../vortex-model.js');
const near = (a,b,tol=1e-6) => assert.ok(Math.abs(a-b) <= tol, `${a} != ${b} (±${tol})`);
const idx = (i,j,k,nx,ny) => i + nx * (j + ny*k);

function centroid(f, dye) {
  let m=0, x=0, r=0;
  for (let k=0;k<f.nz;k++) for (let j=0;j<f.ny;j++) for (let i=0;i<f.nx;i++) {
    const v=dye[idx(i,j,k,f.nx,f.ny)]; m+=v;
    x+=v*(i+.5-f.nx/2)*f.h; r+=v*Math.hypot((j+.5-f.ny/2)*f.h,(k+.5-f.nz/2)*f.h);
  }
  return { x:x/m, r:r/m, mass:m*f.h**3 };
}

test('trilinear sampling interpolates a linear scalar field and clamps at the box', () => {
  const nx=5,ny=6,nz=7,a=new Float32Array(nx*ny*nz);
  for(let k=0;k<nz;k++) for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) a[idx(i,j,k,nx,ny)]=i+2*j+3*k;
  near(F.sample(a,nx,ny,nz,2.4,1.2,3.3),2.4+2*1.2+3*3.3,1e-6);
  near(F.sample(a,nx,ny,nz,-2,99,1),2*(ny-1)+3);
});

test('two 16-bit packed dye concentrations decode accurately and interpolate linearly', () => {
  const f=new F.Fluid3D({nx:4,ny:4,nz:4,h:1});
  f.dyeA.set([-.2,.49999,.50001,1.2]); f.dyeB.set([.0001,.997,.007,1]);
  const bytes=f.densityPixels(), decode=(i,offset)=>((bytes[4*i+offset]<<8)|bytes[4*i+offset+1])/65535;
  for (let i=0;i<4;i++) {
    near(decode(i,0),Math.max(0,Math.min(1,f.dyeA[i])),.50001/65535);
    near(decode(i,2),Math.max(0,Math.min(1,f.dyeB[i])),.50001/65535);
  }
  // Linear filtering of the high/low UNORM8 channels commutes with decoding,
  // even when adjacent samples cross a high-byte boundary.
  for (const offset of [0,2]) {
    const t=.37, high=((1-t)*bytes[4+offset]+t*bytes[8+offset])/255;
    const low=((1-t)*bytes[5+offset]+t*bytes[9+offset])/255;
    near((256*high+low)/257,(1-t)*decode(1,offset)+t*decode(2,offset),1e-12);
  }
});

test('worker-ready packed dye buffers are reusable and their conservative bounds match the bytes', () => {
  const f=new F.Fluid3D({nx:6,ny:5,nz:4,h:1}),q=idx(2,3,1,6,5),r=idx(4,1,2,6,5);
  f.dyeA[q]=.75;f.dyeB[r]=.25;const target=new Uint8Array(6*5*4*4),pixels=f.densityPixels(target);
  assert.equal(pixels,target);const bounds=f.densityBounds(pixels);assert.deepEqual(bounds.min,[2,1,1]);assert.deepEqual(bounds.max,[4,3,2]);
  assert.equal(bounds.peak,Math.round(.75*65535));
  const empty=f.densityBounds(new Uint8Array(target.length));assert.deepEqual(empty.max,[-1,-1,-1]);assert.equal(empty.peak,0);
  assert.throws(()=>f.densityBounds(new Uint8Array(3)),/packed/);
});

test('optimized MAC face and cell midpoint traces match independent trilinear velocity sampling', () => {
  const f=new F.Fluid3D({nx:7,ny:6,nz:5,h:.2,dt:.03}); let seed=73;
  for(const a of [f.u,f.v,f.w]) for(let n=0;n<a.length;n++){seed=(1664525*seed+1013904223)>>>0;a[n]=seed/2**32-.5;}
  function independent(x,y,z,sign) {
    const h=sign*f.dt/f.h, ux=F.velU(f,x,y,z),uy=F.velV(f,x,y,z),uz=F.velW(f,x,y,z);
    const mx=x+.5*h*ux,my=y+.5*h*uy,mz=z+.5*h*uz;
    return [x+h*F.velU(f,mx,my,mz),y+h*F.velV(f,mx,my,mz),z+h*F.velW(f,mx,my,mz)];
  }
  for(let k=0;k<f.nz;k++)for(let j=0;j<f.ny;j++)for(let i=0;i<f.nx;i++)for(const sign of [-1,1]) {
    const c=F.departureCell(f,i,j,k,sign), cr=independent(i+.5,j+.5,k+.5,sign); c.forEach((v,n)=>near(v,cr[n],1e-10));
    for(const axis of [0,1,2]) {
      if ((axis===0&&i===0)||(axis===1&&j===0)||(axis===2&&k===0)) continue;
      const p=F.departureFace(f,i,j,k,axis,sign), q=independent(i+(axis===0?0:.5),j+(axis===1?0:.5),k+(axis===2?0:.5),sign);
      p.forEach((v,n)=>near(v,q[n],1e-10));
      const scratch=[0,0,0];assert.equal(F.departureFace(f,i,j,k,axis,sign,scratch),scratch);scratch.forEach((v,n)=>near(v,q[n],1e-10));
    }
  }
});

test('initial velocity is the smoothed Biot–Savart field, including the analytic axis', () => {
  const R=.86, core=.25, gamma=3, dx=.37;
  const axis=F.ringVelocity(0,dx,R,0,gamma,core);
  near(axis[0],0); near(axis[1],gamma*R*R/(2*(R*R+dx*dx+core*core)**1.5),1e-12);
  for(const [r,x] of [[.86,0],[.86,.1],[.7,.15],[1,.4]]) {
    const actual=F.ringVelocity(r,x,R,0,gamma,core), reference=V.fieldAt([R,0,.9,1],[gamma,0],r,x,core);
    near(actual[0],reference[0],.001); near(actual[1],reference[1],.001);
  }
});

test('the three-dimensional initial perturbation is a divergence-free velocity curl', () => {
  const p=F.PRESETS.chase, x=-.47, y=.66, z=.52, d=1e-5;
  const vyY=(F.perturbationVelocity(x,y+d,z,p)[0]-F.perturbationVelocity(x,y-d,z,p)[0])/(2*d);
  const vzZ=(F.perturbationVelocity(x,y,z+d,p)[1]-F.perturbationVelocity(x,y,z-d,p)[1])/(2*d);
  assert.ok(Math.abs(vyY+vzZ)<1e-7); assert.ok(Math.abs(vyY)>1e-3);
  assert.deepEqual(F.perturbationVelocity(x,y,z,{...p,perturbation:0}),[0,0]);
});

test('MAC pressure projection reduces divergence and preserves impermeable walls', () => {
  const f=new F.Fluid3D({nx:12,ny:8,nz:8,h:.2,dt:.04,iterations:160});
  let seed=12345; const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32-.5);
  for(let k=0;k<f.nz;k++) for(let j=0;j<f.ny;j++) for(let i=1;i<f.nx;i++) f.u[idx(i,j,k,f.nx+1,f.ny)]=random();
  for(let k=0;k<f.nz;k++) for(let j=1;j<f.ny;j++) for(let i=0;i<f.nx;i++) f.v[idx(i,j,k,f.nx,f.ny+1)]=random();
  for(let k=1;k<f.nz;k++) for(let j=0;j<f.ny;j++) for(let i=0;i<f.nx;i++) f.w[idx(i,j,k,f.nx,f.ny)]=random();
  const {before,after}=f.project(); assert.ok(after < before*.08, `${before} -> ${after}`);
  for(let k=0;k<f.nz;k++) for(let j=0;j<f.ny;j++) for(const i of [0,f.nx]) near(f.u[idx(i,j,k,f.nx+1,f.ny)],0);
  for(let k=0;k<f.nz;k++) for(const j of [0,f.ny]) for(let i=0;i<f.nx;i++) near(f.v[idx(i,j,k,f.nx,f.ny+1)],0);
  for(const k of [0,f.nz]) for(let j=0;j<f.ny;j++) for(let i=0;i<f.nx;i++) near(f.w[idx(i,j,k,f.nx,f.ny)],0);
});

test('bounded conjugate-gradient projection reduces smooth divergence more than the old Jacobi baseline', () => {
  for(const [nx,ny,nz,h] of [[36,24,24,.2],[48,32,32,.15],[72,48,48,.1]]) {
    const opts={nx,ny,nz,h,dt:.04,iterations:32},cg=new F.Fluid3D(opts),jac=new F.Fluid3D(opts);
    for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=1;i<nx;i++) {
      const q=idx(i,j,k,nx+1,ny),value=Math.sin(Math.PI*i/nx)*Math.cos(2*Math.PI*(j+.5)/ny);
      cg.u[q]=jac.u[q]=value;
    }
    const a=cg.project(),b=jac.projectJacobi();
    assert.ok(a.after<a.before*.04,`${nx}: ${JSON.stringify(a)}`);
    assert.ok(a.after<b.after*.2,`${nx}: cg=${a.after}, jacobi=${b.after}`);
    assert.ok(a.iterations<=32&&a.iterations>0);assert.ok(Math.abs(cg.pressure.reduce((x,y)=>x+y,0)/cg.pressure.length)<1e-9);
  }
});

test('the four pressure limits stop honestly and reduce a localized-force residual in this finite case', () => {
  const results=[];
  for(const limit of [16,32,64,96]) {
    const f=new F.Fluid3D({nx:48,ny:32,nz:32,h:.15,iterations:limit});f.initialize(F.PRESETS.chase);
    f.step({center:[0,0,0],direction:[1,0,0],strength:3,radius:.25});const p=f.lastProjection;
    assert.equal(p.limit,limit);assert.ok(p.iterations<=limit);assert.ok(p.after<=p.before);
    near(p.target,Math.max(1e-9,p.before*.005),1e-12);assert.equal(p.converged,p.after<=p.target*(1+1e-6)+1e-12);results.push(p);
  }
  assert.ok(results[1].after<results[0].after);assert.ok(results[2].after<results[1].after);
  assert.equal(results[2].converged,true);assert.ok(results[3].iterations<96);near(results[2].after,results[3].after,1e-12);
  // A single case does not guarantee monotone residuals for all CG iterates.
});

test('warm-start projection never reintroduces stale pressure divergence on an already projected field', () => {
  const f=new F.Fluid3D({nx:36,ny:24,nz:24,h:.2,iterations:32});f.initialize(F.PRESETS.chase);
  for(let i=0;i<4;i++) {
    const result=f.project();assert.ok(result.after<=result.before+3e-8,JSON.stringify(result));
    assert.equal(result.converged,result.after<=result.target*(1+1e-6)+1e-12);
  }
});

test('pressure projection leaves a discrete divergence-free free-slip flow unchanged', () => {
  const f=new F.Fluid3D({nx:12,ny:10,nz:8,h:.2,dt:.04,iterations:80}),ratio=Math.sin(Math.PI/(2*f.nx))/Math.sin(Math.PI/(2*f.ny));
  for(let k=0;k<f.nz;k++)for(let j=0;j<f.ny;j++)for(let i=0;i<=f.nx;i++)
    f.u[idx(i,j,k,f.nx+1,f.ny)]=Math.sin(Math.PI*i/f.nx)*Math.cos(Math.PI*(j+.5)/f.ny)*Math.cos(Math.PI*(k+.5)/f.nz);
  for(let k=0;k<f.nz;k++)for(let j=0;j<=f.ny;j++)for(let i=0;i<f.nx;i++)
    f.v[idx(i,j,k,f.nx,f.ny+1)]=-ratio*Math.cos(Math.PI*(i+.5)/f.nx)*Math.sin(Math.PI*j/f.ny)*Math.cos(Math.PI*(k+.5)/f.nz);
  const u=Float32Array.from(f.u),v=Float32Array.from(f.v),div=f.computeDivergence();assert.ok(div.rms<5e-7,JSON.stringify(div));
  f.project();for(let i=0;i<u.length;i++)near(f.u[i],u[i],3e-7);for(let i=0;i<v.length;i++)near(f.v[i],v[i],3e-7);
});

test('zero velocity and uniform passive dye remain exactly still', () => {
  const f=new F.Fluid3D({nx:12,ny:8,nz:8,h:.2,dt:.04});
  f.dyeA.fill(.4); f.dyeB.fill(.7); f.project(); f.step();
  for(const a of [f.u,f.v,f.w]) assert.ok(a.every(v=>v===0));
  for(const [a,v] of [[f.dyeA,.4],[f.dyeB,.7]]) for(const x of a) near(x,v,3e-8);
  near(f.stats.divergenceRms,0); near(f.stats.time,.04);
});

test('a passive dye blob follows the actual face velocity rather than a prescribed animation', () => {
  const f=new F.Fluid3D({nx:32,ny:16,nz:16,h:.1,dt:.05,diffusivity:0});
  for(let k=0;k<f.nz;k++) for(let j=0;j<f.ny;j++) for(let i=1;i<f.nx;i++) f.u[idx(i,j,k,f.nx+1,f.ny)]=.3;
  for(let k=0;k<f.nz;k++) for(let j=0;j<f.ny;j++) for(let i=0;i<f.nx;i++) {
    const q=idx(i,j,k,f.nx,f.ny); f.dyeA[q]=Math.exp(-((i-13)**2+(j-8)**2+(k-8)**2)/4);
  }
  const before=centroid(f,f.dyeA); f.advectDye(); const after=centroid(f,f.dyeA);
  near(after.x-before.x,.3*f.dt,2e-5); near(after.mass,before.mass,5e-7); // finite-volume flux conserves up to roundoff
});

test('closed-box finite-volume dye transport is positive and conserves both dye integrals', () => {
  const f=new F.Fluid3D({nx:36,ny:24,nz:24,h:.2,dt:.04,iterations:32}); f.initialize(F.PRESETS.opposed);
  const a=f.stats.dyeMassA,b=f.stats.dyeMassB;
  for(let n=0;n<55;n++) f.step();
  near(f.stats.dyeMassA/a,1,2e-6); near(f.stats.dyeMassB/b,1,2e-6);
  assert.ok(f.dyeA.every(v=>v>=-1e-8 && Number.isFinite(v))); assert.ok(f.dyeB.every(v=>v>=-1e-8 && Number.isFinite(v)));
});

test('positive viscosity adds the discrete Laplacian of the actual velocity', () => {
  const options={nx:12,ny:8,nz:8,h:.2,dt:.04,diffusivity:0}, a=new F.Fluid3D({...options,viscosity:0}), b=new F.Fluid3D({...options,viscosity:.02});
  for(let k=0;k<a.nz;k++) for(let j=1;j<a.ny;j++) for(let i=0;i<a.nx;i++) {
    const q=idx(i,j,k,a.nx,a.ny+1); a.v[q]=b.v[q]=Math.sin(Math.PI*(i+.5)/a.nx);
  }
  const i=5,j=4,k=4,q=idx(i,j,k,a.nx,a.ny+1), old=b.v[q];
  const lap=b.v[q-1]+b.v[q+1]+b.v[q-a.nx]+b.v[q+a.nx]+b.v[q-a.nx*(a.ny+1)]+b.v[q+a.nx*(a.ny+1)]-6*old;
  a.advectVelocity(); b.advectVelocity();
  near(b.v[q]-a.v[q],.02*.04/(.2*.2)*lap,1e-7); assert.ok(b.v[q]<a.v[q]);
});

test('a bounded local force changes actual MAC face velocities, not dye, and is projected at the walls', () => {
  const f=new F.Fluid3D({nx:12,ny:8,nz:8,h:.2,dt:.04,iterations:160}),force={center:[0,0,0],direction:[1,0,0],strength:2,radius:.5};
  f.dyeA.fill(.25);const beforeDye=Float32Array.from(f.dyeA);f.applyForce(force);
  const i=6,j=3,k=3,q=idx(i,j,k,f.nx+1,f.ny),x=(i-f.nx/2)*f.h,y=(j+.5-f.ny/2)*f.h,z=(k+.5-f.nz/2)*f.h;
  near(f.u[q],f.dt*force.strength*Math.exp(-(x*x+y*y+z*z)/(2*force.radius**2)),2e-8);
  assert.ok(f.v.every(v=>v===0)&&f.w.every(v=>v===0));assert.deepEqual(f.dyeA,beforeDye);
  const projection=f.project();assert.ok(projection.after<projection.before*.20,JSON.stringify(projection));
  for(let k=0;k<f.nz;k++)for(let j=0;j<f.ny;j++)for(const i of [0,f.nx])near(f.u[idx(i,j,k,f.nx+1,f.ny)],0);
  assert.throws(()=>f.applyForce({...force,strength:4}),/force/);assert.throws(()=>f.applyForce({...force,direction:[0,0,0]}),/direction/);
});

test('a force step evolves the real fluid and conserved dye rather than moving a visual overlay', () => {
  const opts={nx:12,ny:8,nz:8,h:.2,dt:.04,iterations:120,diffusivity:0},a=new F.Fluid3D(opts),b=new F.Fluid3D(opts);
  for(let k=0;k<a.nz;k++)for(let j=0;j<a.ny;j++)for(let i=0;i<a.nx;i++){
    const q=idx(i,j,k,a.nx,a.ny);a.dyeA[q]=b.dyeA[q]=Math.exp(-((i-5)**2+(j-4)**2+(k-4)**2)/4);
  }
  a.project();b.project();a.updateStats();b.updateStats();const mass=a.stats.dyeMassA;
  a.step({center:[0,0,0],direction:[1,0,0],strength:2,radius:.5});b.step();
  assert.ok(a.stats.maxSpeed>.005);near(b.stats.maxSpeed,0);near(a.stats.dyeMassA,mass,2e-6);
  assert.ok(a.dyeA.some((v,i)=>Math.abs(v-b.dyeA[i])>1e-6));near(a.stats.time,.04);
});

test('same and opposed rings generate different transported 3-D dye and do not stop at near-core', () => {
  function run(preset) {
    const f=new F.Fluid3D({nx:36,ny:24,nz:24,h:.2,dt:.04,iterations:32});
    f.initialize({...F.PRESETS[preset],perturbation:0}); const a=centroid(f,f.dyeA), b=centroid(f,f.dyeB);
    for(let i=0;i<90;i++) f.step();
    return { f, startA:a,startB:b,endA:centroid(f,f.dyeA),endB:centroid(f,f.dyeB) };
  }
  const same=run('chase'), opposite=run('opposed');
  assert.equal(same.f.stats.time,3.6); assert.equal(opposite.f.stats.steps,90);
  assert.ok(same.endA.x > same.startA.x+.7 && same.endB.x > same.startB.x+.7);
  assert.ok(same.startA.x < same.startB.x && same.endA.x > same.endB.x, 'the two dye centroids exchange order in this finite run');
  // Dye centroids are not vortex-core trackers; this does not prove a
  // topological vortex passage or a periodic orbit.
  assert.ok(opposite.endA.x > opposite.startA.x+.3 && opposite.endB.x < opposite.startB.x-.3);
  assert.ok(opposite.endA.r > opposite.startA.r+.3, JSON.stringify(opposite));
  assert.ok(Number.isFinite(opposite.f.stats.divergenceRms) && opposite.f.stats.maxSpeed>0);
});

test('all twelve preset configurations are distinct, supported by the controls, and satisfy the explicit diffusion bound on every grid', () => {
  const keys=Object.keys(F.PRESETS);assert.equal(keys.length,12);assert.deepEqual(Object.keys(F.PRESET_VISCOSITY).sort(),keys.slice().sort());
  const configurations=new Set();
  for(const key of keys) {
    const p=F.PRESETS[key],viscosity=F.PRESET_VISCOSITY[key];assert.ok(F.validateInitial(p),key);
    for(const [value,min,step] of [[p.radiusA,.45,.01],[p.radiusB,.45,.01],[p.gap,.4,.02],[p.gammaA,.4,.1],[Math.abs(p.gammaB),.4,.1],[p.perturbation,0,.005],[viscosity,0,.001]])
      near((value-min)/step,Math.round((value-min)/step),1e-9);
    assert.ok(viscosity>=0&&viscosity<=.03,key);
    for(const h of [.2,.15,.1]) assert.ok(viscosity*.04/(h*h)<=1/6,key);
    configurations.add(JSON.stringify({...p,viscosity}));
  }
  assert.equal(configurations.size,keys.length,'each preset has a unique initial condition or viscosity');
});

test('preset flows evolve, conserve dye, and show the intended finite-time contrasts', () => {
  const results={};
  for(const key of Object.keys(F.PRESETS)) {
    const f=new F.Fluid3D({nx:36,ny:24,nz:24,h:.2,dt:.04,viscosity:F.PRESET_VISCOSITY[key]});f.initialize(F.PRESETS[key]);
    const initial={...f.stats};let atOne;
    for(let n=0;n<50;n++){f.step();if(n===24)atOne={...f.stats};}
    near(f.stats.time,2);near(f.stats.dyeMassA/initial.dyeMassA,1,2e-6);near(f.stats.dyeMassB/initial.dyeMassB,1,2e-6);
    assert.ok(f.dyeA.every(v=>Number.isFinite(v)&&v>=-1e-8),key);assert.ok(f.dyeB.every(v=>Number.isFinite(v)&&v>=-1e-8),key);
    assert.ok(Number.isFinite(f.stats.divergenceRms)&&f.stats.maxSpeed>0,key);results[key]={initial,atOne,end:{...f.stats},f};
  }
  const gap=s=>s.dyeCenterB-s.dyeCenterA;
  assert.ok(gap(results.close.atOne)<gap(results.chase.atOne)-.15,'closer rings bring the dye centroids together sooner');
  assert.ok(gap(results.smallChase.end)<0,'the smaller rear dye centroid has moved ahead in this finite run');
  assert.ok(gap(results.largeChase.atOne)>gap(results.largeChase.initial)+.15,'the small leading dye centroid initially pulls ahead');
  assert.ok(results.offset.end.dyeCenterX-results.opposed.end.dyeCenterX>.15,'asymmetric opposed rings drift differently');
  assert.ok(results.narrow.atOne.dyeCenterX-results.wide.atOne.dyeCenterX>.25,'small strong rings move faster in this comparison');
  assert.ok(results.viscous.end.maxSpeed<results.chase.end.maxSpeed-.1,'higher viscosity changes the computed velocity');
  let difference=0,norm=0;const a=results.perturbed.f.dyeA,b=results.symmetric.f.dyeA;
  for(let i=0;i<a.length;i++){difference+=(a[i]-b[i])**2;norm+=b[i]**2;}
  assert.ok(Math.sqrt(difference/norm)>.1,'3-D perturbation changes the transported dye field');
  // These finite-time dye/velocity comparisons are not proof of vortex-core
  // passage, turbulence, long-term periodicity, or physical reconnection.
});

test('time-step refinement shows shrinking finite-time differences at the same grid and initial state', () => {
  function run(dt) {
    const f=new F.Fluid3D({nx:24,ny:16,nz:16,h:.3,dt,iterations:64});f.initialize(F.PRESETS.chase);const mass=f.stats.dyeMassA;
    for(let n=0;n<Math.round(1.2/dt);n++)f.step();
    near(f.stats.time,1.2);near(f.stats.dyeMassA/mass,1,2e-6);
    return {gap:f.stats.dyeCenterB-f.stats.dyeCenterA,speed:f.stats.maxSpeed,divergence:f.stats.divergenceRms};
  }
  const coarse=run(.04),middle=run(.02),fine=run(.01);
  assert.ok(Math.abs(middle.gap-fine.gap)<.65*Math.abs(coarse.gap-middle.gap),JSON.stringify({coarse,middle,fine}));
  assert.ok(Math.abs(middle.speed-fine.speed)<.65*Math.abs(coarse.speed-middle.speed),JSON.stringify({coarse,middle,fine}));
  assert.ok([coarse,middle,fine].every(x=>Number.isFinite(x.divergence)&&x.divergence<.001));
  // This is one finite-time refinement check, not a general CFD validation.
});

test('three grid settings produce measurable finite-time comparisons for one shared initial state', () => {
  function run(nx,ny,nz,h) {
    const f=new F.Fluid3D({nx,ny,nz,h,dt:.04,iterations:64});f.initialize(F.PRESETS.chase);const mass=f.stats.dyeMassA;
    for(let n=0;n<10;n++)f.step();near(f.stats.time,.4);near(f.stats.dyeMassA/mass,1,2e-6);
    return {gap:f.stats.dyeCenterB-f.stats.dyeCenterA,speed:f.stats.maxSpeed};
  }
  const quick=run(36,24,24,.2),standard=run(48,32,32,.15),fine=run(72,48,48,.1);
  assert.ok(Math.abs(standard.gap-fine.gap)<Math.abs(quick.gap-fine.gap),JSON.stringify({quick,standard,fine}));
  assert.ok(Math.abs(standard.speed-fine.speed)<Math.abs(quick.speed-fine.speed),JSON.stringify({quick,standard,fine}));
  // This single short comparison illustrates sensitivity, not verified grid convergence.
});

test('movable orthogonal slices use the actual MAC velocity and its discrete curl', () => {
  const f=new F.Fluid3D({nx:12,ny:8,nz:6,h:.2}),omega=1.7;
  // Solid-body rotation u=-omega*y, v=omega*x has constant curl (0,0,2*omega).
  // This analytical field exercises the finite-difference calculation,
  // including the one-sided cell-centered differences at slice edges.
  for(let k=0;k<f.nz;k++)for(let j=0;j<f.ny;j++)for(let i=0;i<=f.nx;i++)
    f.u[idx(i,j,k,f.nx+1,f.ny)]=-omega*(j+.5-f.ny/2)*f.h;
  for(let k=0;k<f.nz;k++)for(let j=0;j<=f.ny;j++)for(let i=0;i<f.nx;i++)
    f.v[idx(i,j,k,f.nx,f.ny+1)]=omega*(i+.5-f.nx/2)*f.h;
  for(const axis of ['x','y','z']) for(const position of [-1,0,1]) {
    const s=f.sampleSlice(axis,position);assert.equal(s.axis,axis);assert.equal(s.values.length,s.width*s.height*3);
    near(s.maxVorticity,2*omega,2e-6);assert.equal(s.time,0);
    for(let q=0;q<s.values.length;q+=3)near(s.values[q],2*omega,2e-6);
    if(axis==='z') {
      const i=3,j=2,q=3*(i+s.width*j);
      near(s.values[q+1],-omega*(j+.5-f.ny/2)*f.h,2e-7);
      near(s.values[q+2],omega*(i+.5-f.nx/2)*f.h,2e-7);
    }
    if(axis==='x')assert.deepEqual([s.width,s.height],[f.ny,f.nz]);
    if(axis==='y')assert.deepEqual([s.width,s.height],[f.nx,f.nz]);
    if(axis==='z')assert.deepEqual([s.width,s.height],[f.nx,f.ny]);
  }
  assert.throws(()=>f.sampleSlice('q',0),/slice/);assert.throws(()=>f.sampleSlice('z',2),/slice/);
});

test('the worker executes the same solver, transfers real density, and ignores stale generation steps', () => {
  const messages=[], self={postMessage: (message, transfers)=>messages.push({message,transfers})};
  vm.runInNewContext(F.workerSource(), { self, Math, Number, Float32Array, Float64Array, Uint8Array, Error, Array });
  const options={nx:12,ny:8,nz:8,h:.6,dt:.04,iterations:12};
  self.onmessage({data:{type:'reset',generation:5,options,initial:F.PRESETS.chase}});
  assert.equal(messages[0].message.kind,'ready'); assert.equal(messages[0].message.stats.steps,0);
  assert.equal(messages[0].message.density.byteLength,12*8*8*4);
  self.onmessage({data:{type:'step',generation:4}}); assert.equal(messages.length,1);
  self.onmessage({data:{type:'step',generation:5}}); assert.equal(messages[1].message.stats.steps,1);
  assert.notDeepEqual(Buffer.from(messages[0].message.density),Buffer.from(messages[1].message.density));
  self.onmessage({data:{type:'slice',generation:5,slice:{axis:'y',position:.3,version:7}}});
  const slice=messages[2].message;assert.equal(slice.kind,'slice');assert.equal(slice.slice.version,7);assert.equal(slice.slice.axis,'y');
  assert.equal(new Float32Array(slice.slice.values).length,12*8*3);near(slice.time,.04);assert.equal(messages[2].transfers.length,1);
  self.onmessage({data:{type:'slice',generation:4,slice:{axis:'y',position:0,version:8}}});assert.equal(messages.length,3);
  self.onmessage({data:{type:'recycle',generation:5,density:messages[0].message.density}});
  self.onmessage({data:{type:'step',generation:5}});assert.equal(messages[3].message.recycled,true);assert.equal(messages[3].message.stats.steps,2);
  assert.equal(messages[3].message.bounds.min.length,3);assert.ok(messages[3].message.bounds.peak>0);
});

test('dimensions, initial conditions, and explicit diffusion stability are validated', () => {
  assert.throws(()=>new F.Fluid3D({nx:0}),/dimensions/);
  assert.throws(()=>new F.Fluid3D({h:.1,dt:.2,viscosity:.03}),/numerical/);
  assert.throws(()=>new F.Fluid3D({dt:0}),/numerical/);
  const f=new F.Fluid3D(); assert.throws(()=>f.initialize({...F.PRESETS.chase,gammaB:0}),/initial/);
  assert.throws(()=>f.initialize({...F.PRESETS.chase,perturbation:1}),/initial/);
});
