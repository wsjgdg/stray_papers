/* Incompressible 3-D fluid on a staggered MAC grid, in dimensionless units.
   Velocity uses semi-Lagrangian advection, explicit viscosity and a bounded
   preconditioned-conjugate-gradient pressure projection. Passive dye uses conservative limited fluxes;
   it is not vorticity or actual smoke. Closed, free-slip walls. This is a
   low-resolution numerical demonstration, not a validated engineering CFD
   solver. The worker runs this same module. */
(function (root, makeModel) {
  'use strict';
  const api = makeModel();
  function workerMain(factory) {
    const { Fluid3D } = factory();
    let fluid = null, generation = 0, spareDensity = null;
    function makeSlice(request) {
      if (!request) return null;
      const slice = fluid.sampleSlice(request.axis, request.position);
      slice.version = request.version;
      slice.values = slice.values.buffer;
      return slice;
    }
    function report(kind, sliceRequest, appliedForce = false) {
      const recycled=!!spareDensity, target=spareDensity ? new Uint8Array(spareDensity) : null;
      spareDensity=null;
      const pixels=fluid.densityPixels(target), bounds=fluid.densityBounds(pixels), slice=makeSlice(sliceRequest), transfers=[pixels.buffer];
      if (slice) transfers.push(slice.values);
      self.postMessage({ kind, generation, dimensions: [fluid.nx, fluid.ny, fluid.nz], h: fluid.h,
        dt: fluid.dt, stats: fluid.stats, density: pixels.buffer, bounds, recycled, slice, appliedForce }, transfers);
    }
    self.onmessage = event => {
      const m = event.data;
      try {
        if (m.type === 'reset') {
          generation = m.generation; spareDensity=null;
          fluid = new Fluid3D(m.options);
          fluid.initialize(m.initial);
          report('ready', m.slice);
        } else if (m.type === 'step' && fluid && m.generation === generation) {
          fluid.step(m.force || null); report('frame', m.slice, !!m.force);
        } else if (m.type === 'slice' && fluid && m.generation === generation) {
          const slice = makeSlice(m.slice);
          self.postMessage({ kind: 'slice', generation, time: fluid.stats.time, slice }, [slice.values]);
        } else if (m.type === 'recycle' && fluid && m.generation === generation) {
          if (m.density && m.density.byteLength===fluid.nx*fluid.ny*fluid.nz*4 && !spareDensity) spareDensity=m.density;
        }
      } catch (error) {
        self.postMessage({ kind: 'error', generation: m.generation, message: String(error && error.message || error) });
      }
    };
  }
  api.workerSource = () => '(' + workerMain.toString() + ')(' + makeModel.toString() + ');';
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VortexFluid = api;
})(typeof window !== 'undefined' ? window : globalThis, function makeModel() {
  'use strict';
  // Presets are initial conditions, not prerecorded trajectories. Each uses
  // the same grid solver; viscosity is kept separately from the ring geometry
  // so the worker receives it as a numerical option.
  const PRESETS = {
    chase:      { radiusA:.86, radiusB:.86, gap:.80, gammaA:3.0, gammaB: 3.0, perturbation:.025 },
    opposed:    { radiusA:.86, radiusB:.86, gap:1.60,gammaA:3.0, gammaB:-3.0, perturbation:.025 },
    unequal:    { radiusA:.86, radiusB:.73, gap:1.00,gammaA:3.4, gammaB: 2.3, perturbation:.025 },
    close:      { radiusA:.86, radiusB:.86, gap:.50, gammaA:3.0, gammaB: 3.0, perturbation:.015 },
    smallChase: { radiusA:.62, radiusB:1.18,gap:.90, gammaA:3.0, gammaB: 3.0, perturbation:.015 },
    largeChase: { radiusA:1.18,radiusB:.62, gap:.80, gammaA:2.5, gammaB: 3.4, perturbation:.015 },
    offset:     { radiusA:.86, radiusB:.86, gap:1.60,gammaA:3.8, gammaB:-1.8, perturbation:.025 },
    wide:       { radiusA:1.15,radiusB:1.15,gap:1.20,gammaA:2.0, gammaB: 2.0, perturbation:.015 },
    narrow:     { radiusA:.62, radiusB:.62, gap:1.20,gammaA:3.4, gammaB: 3.4, perturbation:.015 },
    symmetric:  { radiusA:.86, radiusB:.86, gap:.80, gammaA:3.0, gammaB: 3.0, perturbation:0 },
    perturbed:  { radiusA:.86, radiusB:.86, gap:.80, gammaA:3.0, gammaB: 3.0, perturbation:.080 },
    viscous:    { radiusA:.86, radiusB:.86, gap:.80, gammaA:3.0, gammaB: 3.0, perturbation:.025 }
  };
  const PRESET_VISCOSITY = {
    chase:.006, opposed:.006, unequal:.006, close:.004,
    smallChase:.006, largeChase:.006, offset:.006,
    wide:.006, narrow:.006, symmetric:.006, perturbed:.006, viscous:.030
  };
  const SAMPLES = 28;
  const COS = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) COS[i] = Math.cos((i + .5) * 2 * Math.PI / SAMPLES);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const index = (i, j, k, nx, ny) => i + nx * (j + ny * k);

  // Clamped trilinear interpolation of a scalar array. Coordinates are in
  // that array's own index space, not physical coordinates.
  function sample(a, nx, ny, nz, x, y, z) {
    x = clamp(x, 0, nx - 1); y = clamp(y, 0, ny - 1); z = clamp(z, 0, nz - 1);
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const i1 = Math.min(i + 1, nx - 1), j1 = Math.min(j + 1, ny - 1), k1 = Math.min(k + 1, nz - 1);
    const tx = x - i, ty = y - j, tz = z - k, nxy = nx * ny;
    const b0 = i + nx * j + nxy * k, b1 = i1 + nx * j + nxy * k;
    const c0 = i + nx * j1 + nxy * k, c1 = i1 + nx * j1 + nxy * k;
    const d0 = i + nx * j + nxy * k1, d1 = i1 + nx * j + nxy * k1;
    const e0 = i + nx * j1 + nxy * k1, e1 = i1 + nx * j1 + nxy * k1;
    const l00 = a[b0] + tx * (a[b1] - a[b0]), l01 = a[c0] + tx * (a[c1] - a[c0]);
    const l10 = a[d0] + tx * (a[d1] - a[d0]), l11 = a[e0] + tx * (a[e1] - a[e0]);
    return (l00 + ty * (l01 - l00)) * (1 - tz) + (l10 + ty * (l11 - l10)) * tz;
  }
  // Component velocities are stored at the normal faces of cells; sample in
  // cell-coordinate space where cell centers are (i+.5,j+.5,k+.5).
  function velU(f, x, y, z) { return sample(f.u, f.nx + 1, f.ny, f.nz, x, y - .5, z - .5); }
  function velV(f, x, y, z) { return sample(f.v, f.nx, f.ny + 1, f.nz, x - .5, y, z - .5); }
  function velW(f, x, y, z) { return sample(f.w, f.nx, f.ny, f.nz + 1, x - .5, y - .5, z); }
  function departureCell(f,i,j,k,sign) {
    const {nx,ny,dt,h,u,v,w}=f, q=index(i,j,k,nx,ny), iu=index(i,j,k,nx+1,ny), iv=index(i,j,k,nx,ny+1);
    const ux=(u[iu]+u[iu+1])*.5, uy=(v[iv]+v[iv+nx])*.5, uz=(w[q]+w[q+nx*ny])*.5;
    const x=i+.5,y=j+.5,z=k+.5,a=sign*dt/h, mx=x+.5*a*ux,my=y+.5*a*uy,mz=z+.5*a*uz;
    return [x+a*velU(f,mx,my,mz),y+a*velV(f,mx,my,mz),z+a*velW(f,mx,my,mz)];
  }
  // At a MAC face, the normal component is already present and the two
  // tangential components are averages of four neighboring faces. This gives
  // the same trilinear sample as velU/V/W at that point without 24 fetches.
  function departureFace(f,i,j,k,axis,sign,out) {
    const {nx,ny,dt,h,u,v,w}=f; let ux,uy,uz,x,y,z;
    if (axis===0) {
      x=i;y=j+.5;z=k+.5; const a=index(i,j,k,nx+1,ny), b=index(i,j,k,nx,ny+1), c=index(i,j,k,nx,ny);
      ux=u[a]; uy=(v[b]+v[b-1]+v[b+nx]+v[b+nx-1])*.25;
      uz=(w[c]+w[c-1]+w[c+nx*ny]+w[c+nx*ny-1])*.25;
    } else if (axis===1) {
      x=i+.5;y=j;z=k+.5; const a=index(i,j,k,nx+1,ny), b=index(i,j,k,nx,ny+1), c=index(i,j,k,nx,ny);
      ux=(u[a]+u[a+1]+u[a-(nx+1)]+u[a-(nx+1)+1])*.25; uy=v[b];
      uz=(w[c]+w[c-nx]+w[c+nx*ny]+w[c+nx*ny-nx])*.25;
    } else {
      x=i+.5;y=j+.5;z=k; const a=index(i,j,k,nx+1,ny), b=index(i,j,k,nx,ny+1), c=index(i,j,k,nx,ny);
      ux=(u[a]+u[a+1]+u[a-(nx+1)*ny]+u[a-(nx+1)*ny+1])*.25;
      uy=(v[b]+v[b+nx]+v[b-nx*(ny+1)]+v[b-nx*(ny+1)+nx])*.25; uz=w[c];
    }
    const a=sign*dt/h,mx=x+.5*a*ux,my=y+.5*a*uy,mz=z+.5*a*uz, result=out||[0,0,0];
    result[0]=x+a*velU(f,mx,my,mz);result[1]=y+a*velV(f,mx,my,mz);result[2]=z+a*velW(f,mx,my,mz);
    return result;
  }
  // Smoothed Biot–Savart ring provides an initial velocity field only. After
  // initialization, every grid cell evolves via Navier–Stokes, without forcing
  // either ring to retain an axisymmetric shape.
  function ringVelocity(r, x, radius, center, gamma, core) {
    const dx = x - center, base = r * r + radius * radius + dx * dx + core * core, twice = 2 * r * radius;
    let radial = 0, axial = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const c = COS[i], q = base - twice * c, inv = 1 / (q * Math.sqrt(q));
      radial += c * inv; axial += (radius * radius - radius * r * c) * inv;
    }
    const scale = gamma / (2 * SAMPLES);
    return [scale * radius * dx * radial, scale * axial];
  }
  function torusVelocity(x, y, z, initial, core) {
    const r = Math.hypot(y, z), a = ringVelocity(r, x, initial.radiusA, -initial.gap / 2, initial.gammaA, core);
    const b = ringVelocity(r, x, initial.radiusB, initial.gap / 2, initial.gammaB, core);
    const ur = a[0] + b[0], axis = a[1] + b[1], inv = r > 1e-9 ? 1 / r : 0;
    return [axis, ur * y * inv, ur * z * inv];
  }
  // A small 3-D, divergence-free initial perturbation: curl(A_x,0,0).
  // This is part of the initial velocity field, not a visual noise effect or
  // an ongoing external force. It seeds departures from axial symmetry.
  function perturbationVelocity(x, y, z, initial) {
    const amp = initial.perturbation || 0, r = Math.hypot(y,z);
    if (amp === 0 || r < 1e-8) return [0,0];
    const theta = Math.atan2(z,y), ct=y/r, st=z/r, sigma=.28, mode=3;
    let vy=0, vz=0;
    for (const [radius, center, phase] of [[initial.radiusA,-initial.gap/2,0],[initial.radiusB,initial.gap/2,.8]]) {
      const q=Math.exp(-((r-radius)**2+(x-center)**2)/(2*sigma*sigma));
      const angle=mode*theta+phase, ar=-(r-radius)/(sigma*sigma)*amp*q*Math.cos(angle), at=-mode*amp*q*Math.sin(angle);
      const dy=ct*ar-st*at/r, dz=st*ar+ct*at/r;
      vy += dz; vz -= dy;
    }
    return [vy,vz];
  }
  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function validateInitial(p) {
    return p && ['radiusA','radiusB','gap','gammaA','gammaB'].every(k => finite(p[k])) &&
      (p.perturbation == null || finite(p.perturbation) && p.perturbation >= 0 && p.perturbation <= .08) &&
      p.radiusA >= .45 && p.radiusA <= 1.25 && p.radiusB >= .45 && p.radiusB <= 1.25 &&
      p.gap >= .4 && p.gap <= 2.2 && p.gammaA >= .4 && p.gammaA <= 4 &&
      Math.abs(p.gammaB) >= .4 && Math.abs(p.gammaB) <= 4;
  }

  class Fluid3D {
    constructor(options = {}) {
      this.nx = options.nx == null ? 48 : options.nx; this.ny = options.ny == null ? 32 : options.ny; this.nz = options.nz == null ? 32 : options.nz;
      if (![this.nx,this.ny,this.nz].every(n => Number.isInteger(n) && n >= 4 && n <= 100)) throw new Error('Invalid grid dimensions');
      this.h = options.h == null ? 7.2 / this.nx : options.h;
      this.dt = options.dt == null ? .04 : options.dt; this.viscosity = options.viscosity == null ? .006 : options.viscosity;
      this.diffusivity = options.diffusivity == null ? .0005 : options.diffusivity;
      this.iterations = options.iterations == null ? 32 : options.iterations;
      if (![this.h,this.dt,this.viscosity,this.diffusivity].every(finite) || this.h <= 0 || this.dt <= 0 ||
          this.viscosity < 0 || this.diffusivity < 0 || Math.max(this.viscosity,this.diffusivity) * this.dt / (this.h * this.h) > 1 / 6 ||
          !Number.isInteger(this.iterations) || this.iterations < 1 || this.iterations > 200) throw new Error('Invalid numerical parameters');
      const c = this.nx * this.ny * this.nz;
      this.u = new Float32Array((this.nx + 1) * this.ny * this.nz);
      this.v = new Float32Array(this.nx * (this.ny + 1) * this.nz);
      this.w = new Float32Array(this.nx * this.ny * (this.nz + 1));
      this.nextU = new Float32Array(this.u.length); this.nextV = new Float32Array(this.v.length); this.nextW = new Float32Array(this.w.length);
      this.dyeA = new Float32Array(c); this.dyeB = new Float32Array(c);
      this.nextA = new Float32Array(c); this.nextB = new Float32Array(c);
      this.correctA = new Float32Array(c); this.correctB = new Float32Array(c);
      this.rhsA = new Float32Array(c); this.rhsB = new Float32Array(c);
      this.pressure = new Float64Array(c); this.nextPressure = null; this.divergence = new Float32Array(c); this.cg = null;
      this.steps = 0; this.initial = null; this.stats = null;
    }
    initialize(initial = PRESETS.chase) {
      if (!validateInitial(initial)) throw new Error('Invalid ring initial conditions');
      this.initial = { ...initial };
      const { nx,ny,nz,h } = this, core = .25, dyeWidth = .23;
      this.steps = 0; this.pressure.fill(0); if (this.nextPressure) this.nextPressure.fill(0);
      // The walls are a real part of this finite calculation. Normal face
      // velocities are zero; tangential derivatives use free-slip boundaries.
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
        const q = index(i,j,k,nx+1,ny);
        this.u[q] = i === 0 || i === nx ? 0 : torusVelocity((i-nx/2)*h,(j+.5-ny/2)*h,(k+.5-nz/2)*h,initial,core)[0];
      }
      for (let k = 0; k < nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) {
        const q = index(i,j,k,nx,ny+1), x=(i+.5-nx/2)*h, y=(j-ny/2)*h, z=(k+.5-nz/2)*h;
        this.v[q] = j === 0 || j === ny ? 0 : torusVelocity(x,y,z,initial,core)[1] + perturbationVelocity(x,y,z,initial)[0];
      }
      for (let k = 0; k <= nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const q = index(i,j,k,nx,ny), x=(i+.5-nx/2)*h, y=(j+.5-ny/2)*h, z=(k-nz/2)*h;
        this.w[q] = k === 0 || k === nz ? 0 : torusVelocity(x,y,z,initial,core)[2] + perturbationVelocity(x,y,z,initial)[1];
      }
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const x=(i+.5-nx/2)*h, y=(j+.5-ny/2)*h, z=(k+.5-nz/2)*h, r=Math.hypot(y,z), theta=Math.atan2(z,y), q=index(i,j,k,nx,ny);
        // Inhomogeneous initial dye is a real transported scalar, not animated
        // shader noise. It does not alter the fluid's velocity or vorticity.
        const dxA=x+initial.gap/2, drA=r-initial.radiusA, dxB=x-initial.gap/2, drB=r-initial.radiusB;
        const detailA=.72+.15*Math.sin(3*theta+2*dxA/dyeWidth)+.13*Math.cos(5*theta+2*drA/dyeWidth);
        const detailB=.72+.15*Math.sin(3*theta+2*dxB/dyeWidth+.7)+.13*Math.cos(5*theta+2*drB/dyeWidth+.4);
        this.dyeA[q]=detailA*Math.exp(-(drA*drA+dxA*dxA)/(2*dyeWidth*dyeWidth));
        this.dyeB[q]=detailB*Math.exp(-(drB*drB+dxB*dxB)/(2*dyeWidth*dyeWidth));
      }
      // Initial projection may need more iterations for long-wavelength wall
      // corrections on the fine grid; it is bounded and stops on residual.
      this.project(Math.max(150, this.iterations));
      this.updateStats();
      return this;
    }
    // Centered finite-volume divergence. The six boundary-normal velocities
    // live on the grid and remain identically zero.
    computeDivergence() {
      const {nx,ny,nz,h,u,v,w,divergence: d} = this;
      let sum = 0, max = 0;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const q = index(i,j,k,nx,ny), a = index(i,j,k,nx+1,ny), b = index(i,j,k,nx,ny+1), c = q;
        const v0 = (u[a+1]-u[a] + v[b+nx]-v[b] + w[c+nx*ny]-w[c]) / h;
        d[q] = v0; sum += v0*v0; max = Math.max(max,Math.abs(v0));
      }
      return { rms: Math.sqrt(sum / d.length), max };
    }
    // Solve the Neumann pressure Poisson equation on the MAC cell centers.
    // -L is positive semidefinite; removing the mean right-hand side fixes
    // compatibility, and subtracting the pressure mean fixes its gauge. A
    // diagonally preconditioned conjugate-gradient iteration reduces both
    // smooth and checkerboard residuals much faster than a Jacobi sweep.
    project(iterations = this.iterations) {
      const {nx,ny,nz,h,dt}=this, before=this.computeDivergence(), n=nx*ny*nz, nxy=nx*ny;
      if (!this.cg) {
        const degree=new Uint8Array(n);
        for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)
          degree[index(i,j,k,nx,ny)]=(i>0?1:0)+(i+1<nx?1:0)+(j>0?1:0)+(j+1<ny?1:0)+(k>0?1:0)+(k+1<nz?1:0);
        this.cg={degree,r:new Float64Array(n),z:new Float64Array(n),d:new Float64Array(n),ap:new Float64Array(n)};
      }
      const {degree,r,z,d,ap}=this.cg,p=this.pressure;
      const target=Math.max(1e-9,before.rms*.005);
      if (before.rms<1e-12) {
        p.fill(0);this.lastProjection={before:before.rms,after:before.rms,max:before.max,iterations:0,limit:iterations,target,converged:true};return this.lastProjection;
      }
      function apply(v,out) {
        for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++) {
          const q=i+nx*j+nxy*k;let value=degree[q]*v[q];
          if(i>0)value-=v[q-1];if(i+1<nx)value-=v[q+1];
          if(j>0)value-=v[q-nx];if(j+1<ny)value-=v[q+nx];
          if(k>0)value-=v[q-nxy];if(k+1<nz)value-=v[q+nxy];out[q]=value;
        }
      }
      // Warm-start from the preceding pressure. The mean of the discrete
      // divergence should be zero for closed walls, but remove its tiny
      // floating-point residue to avoid asking the singular system to solve
      // an incompatible constant mode.
      const scale=-h*h/dt,rhs=this.divergence;let rhsMean=0;
      for(let q=0;q<n;q++)rhsMean+=scale*rhs[q];rhsMean/=n;
      apply(p,ap);let rho=0,ss=0,zeroSS=0;
      for(let q=0;q<n;q++){const b=scale*rhs[q]-rhsMean;r[q]=b-ap[q];ss+=r[q]*r[q];zeroSS+=b*b;}
      // A previous pressure is only useful if it starts closer to the new
      // right-hand side than zero. This also prevents re-projecting an almost
      // divergence-free field with an obsolete, large pressure correction.
      if (ss>zeroSS) {p.fill(0);ss=zeroSS;for(let q=0;q<n;q++)r[q]=scale*rhs[q]-rhsMean;}
      for(let q=0;q<n;q++){z[q]=r[q]/degree[q];d[q]=z[q];rho+=r[q]*z[q];}
      const residualTarget=h*h/dt*target,threshold=n*residualTarget*residualTarget;let count=0;
      while(count<iterations && ss>threshold && rho>1e-28) {
        apply(d,ap);let denominator=0;for(let q=0;q<n;q++)denominator+=d[q]*ap[q];
        if (!(denominator>1e-28) || !Number.isFinite(denominator)) break;
        const alpha=rho/denominator;ss=0;
        for(let q=0;q<n;q++){p[q]+=alpha*d[q];r[q]-=alpha*ap[q];ss+=r[q]*r[q];}
        count++;if(ss<=threshold)break;
        let nextRho=0;for(let q=0;q<n;q++){z[q]=r[q]/degree[q];nextRho+=r[q]*z[q];}
        const beta=nextRho/rho;for(let q=0;q<n;q++)d[q]=z[q]+beta*d[q];rho=nextRho;
      }
      // A capped CG iterate need not monotonically reduce its Euclidean
      // residual. If it is worse than applying no correction, keep the
      // original velocity rather than increasing its divergence.
      if (!Number.isFinite(ss) || ss>zeroSS*(1+1e-10)) {
        p.fill(0);this.lastProjection={before:before.rms,after:before.rms,max:before.max,iterations:count,limit:iterations,target,converged:false};return this.lastProjection;
      }
      let pMean=0;for(let q=0;q<n;q++)pMean+=p[q];pMean/=n;for(let q=0;q<n;q++)p[q]-=pMean;
      const factor=dt/h;
      for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=1;i<nx;i++) {
        const q=index(i,j,k,nx,ny),a=index(i,j,k,nx+1,ny);this.u[a]-=factor*(p[q]-p[q-1]);
      }
      for(let k=0;k<nz;k++)for(let j=1;j<ny;j++)for(let i=0;i<nx;i++) {
        const q=index(i,j,k,nx,ny),a=index(i,j,k,nx,ny+1);this.v[a]-=factor*(p[q]-p[q-nx]);
      }
      for(let k=1;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++) {
        const q=index(i,j,k,nx,ny);this.w[q]-=factor*(p[q]-p[q-nxy]);
      }
      const after=this.computeDivergence();
      this.lastProjection={before:before.rms,after:after.rms,max:after.max,iterations:count,limit:iterations,target,converged:after.rms<=target*(1+1e-6)+1e-12};
      return this.lastProjection;
    }
    // Retained as a numerical baseline for regression checks; the live
    // solver uses the faster-converging conjugate-gradient projection above.
    projectJacobi(iterations = this.iterations) {
      const {nx,ny,nz,h,dt} = this, before = this.computeDivergence();
      let p = this.pressure, next = this.nextPressure || new Float64Array(this.pressure.length);
      // Reuse the previous pressure as a warm start. Neumann conditions at the
      // six walls correspond to zero normal velocity and a pressure gauge.
      const h2dt = h*h/dt, nxy = nx*ny, rhs = this.divergence;
      for (let iter = 0; iter < iterations; iter++) {
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const q = i + nx*j + nxy*k; let sum = 0, n = 0;
          if (i > 0) { sum += p[q-1]; n++; } if (i+1 < nx) { sum += p[q+1]; n++; }
          if (j > 0) { sum += p[q-nx]; n++; } if (j+1 < ny) { sum += p[q+nx]; n++; }
          if (k > 0) { sum += p[q-nxy]; n++; } if (k+1 < nz) { sum += p[q+nxy]; n++; }
          // Weighted Jacobi damps the alternating checkerboard eigenmode
          // that ordinary Jacobi leaves oscillating on a Neumann grid.
          const estimate = (sum - h2dt*rhs[q]) / n;
          next[q] = p[q] + .8 * (estimate - p[q]);
        }
        const swap = p; p = next; next = swap;
      }
      this.pressure = p; this.nextPressure = next;
      const factor = dt / h;
      for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
        const q = index(i,j,k,nx,ny), a = index(i,j,k,nx+1,ny); this.u[a] -= factor * (p[q] - p[q-1]);
      }
      for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
        const q = index(i,j,k,nx,ny), b = index(i,j,k,nx,ny+1); this.v[b] -= factor * (p[q] - p[q-nx]);
      }
      for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const q = index(i,j,k,nx,ny); this.w[q] -= factor * (p[q] - p[q-nxy]);
      }
      const after = this.computeDivergence();
      this.lastProjection = { before: before.rms, after: after.rms, max: after.max, iterations, limit:iterations, target:null, converged:false };
      return this.lastProjection;
    }
    // Semi-Lagrangian midpoint backtracing. Explicit Laplacian viscosity is
    // stable only under the documented dt*nu/h² <= 1/6 condition.
    advectVelocity() {
      const {nx,ny,nz,dt,h,viscosity} = this, coeff = viscosity*dt/(h*h), departure=[0,0,0];
      const specs = [
        {old:this.u, out:this.nextU, sx:nx+1,sy:ny,sz:nz, ox:0,oy:.5,oz:.5, axis:0},
        {old:this.v, out:this.nextV, sx:nx,sy:ny+1,sz:nz, ox:.5,oy:0,oz:.5, axis:1},
        {old:this.w, out:this.nextW, sx:nx,sy:ny,sz:nz+1, ox:.5,oy:.5,oz:0, axis:2}
      ];
      for (const s of specs) {
        const {old,out,sx,sy,sz,ox,oy,oz,axis} = s, nxy=sx*sy;
        for (let k=0;k<sz;k++) for (let j=0;j<sy;j++) for (let i=0;i<sx;i++) {
          const q=i+sx*j+nxy*k;
          if ((axis===0 && (i===0 || i===sx-1)) || (axis===1 && (j===0 || j===sy-1)) || (axis===2 && (k===0 || k===sz-1))) { out[q]=0; continue; }
          const p=departureFace(this,i,j,k,axis,-1,departure);
          const advected=sample(old,sx,sy,sz,p[0]-ox,p[1]-oy,p[2]-oz);
          // Tangential components have zero wall-normal derivative; the
          // normal component's boundary values have already been set to zero.
          const lap = old[i>0?q-1:q] + old[i+1<sx?q+1:q] + old[j>0?q-sx:q] + old[j+1<sy?q+sx:q] +
                      old[k>0?q-nxy:q] + old[k+1<sz?q+nxy:q] - 6*old[q];
          out[q] = advected + coeff*lap;
        }
      }
      [this.u,this.nextU]=[this.nextU,this.u]; [this.v,this.nextV]=[this.nextV,this.v]; [this.w,this.nextW]=[this.nextW,this.w];
    }
    dyeFlux(a,b,ra,rb) {
      const {nx,ny,nz,h,u,v,w,diffusivity}=this, nxy=nx*ny, inv=1/h, k=diffusivity/h;
      ra.fill(0); rb.fill(0);
      function minmod(x,y) { return x*y<=0 ? 0 : Math.sign(x)*Math.min(Math.abs(x),Math.abs(y)); }
      function flux(field,l,r,ll,rr,velocity) {
        const middle=field[r]-field[l], left=field[l]+.5*minmod(field[l]-field[ll],middle), right=field[r]-.5*minmod(middle,field[rr]-field[r]);
        return (velocity*(velocity>=0?left:right)-k*middle)*inv;
      }
      function add(l,r,ll,rr,velocity) {
        const fa=flux(a,l,r,ll,rr,velocity), fb=flux(b,l,r,ll,rr,velocity);
        ra[l]-=fa;ra[r]+=fa;rb[l]-=fb;rb[r]+=fb;
      }
      // Each internal face adds exactly opposite flux to its two adjacent
      // cells. Closed faces have zero flux. MUSCL/minmod limits new extrema.
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let i=1;i<nx;i++) {
        const r=i+nx*y+nxy*z,l=r-1;add(l,r,i>1?l-1:l,i+1<nx?r+1:r,u[index(i,y,z,nx+1,ny)]);
      }
      for(let z=0;z<nz;z++)for(let j=1;j<ny;j++)for(let x=0;x<nx;x++) {
        const r=x+nx*j+nxy*z,l=r-nx;add(l,r,j>1?l-nx:l,j+1<ny?r+nx:r,v[index(x,j,z,nx,ny+1)]);
      }
      for(let z=1;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
        const r=x+nx*y+nxy*z,l=r-nxy;add(l,r,z>1?l-nxy:l,z+1<nz?r+nxy:r,w[r]);
      }
    }
    advectDye() {
      const {nx,ny,nz,h,dt,diffusivity,u,v,w,rhsA:ra,rhsB:rb,nextA:ta,nextB:tb}=this;
      let a=this.dyeA,b=this.dyeB,ca=this.correctA,cb=this.correctB,maxRate=0;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
        const q=index(x,y,z,nx,ny), i=index(x,y,z,nx+1,ny), j=index(x,y,z,nx,ny+1);
        const rate=Math.max(Math.abs(u[i]),Math.abs(u[i+1]))+Math.max(Math.abs(v[j]),Math.abs(v[j+nx]))+Math.max(Math.abs(w[q]),Math.abs(w[q+nx*ny]));
        maxRate=Math.max(maxRate,rate);
      }
      // SSP-RK2 finite-volume advection with a bounded multidimensional CFL.
      // Subcycling is used only for dye; the velocity time step is unchanged.
      const cfl=dt*(maxRate/h+6*diffusivity/(h*h)), substeps=Math.max(1,Math.ceil(cfl/.45));
      if (substeps>32) throw new Error('Tracer CFL is too large to integrate safely');
      const step=dt/substeps;
      for(let s=0;s<substeps;s++) {
        this.dyeFlux(a,b,ra,rb);
        for(let q=0;q<a.length;q++) {ta[q]=a[q]+step*ra[q];tb[q]=b[q]+step*rb[q];}
        this.dyeFlux(ta,tb,ra,rb);
        for(let q=0;q<a.length;q++) {ca[q]=.5*(a[q]+ta[q]+step*ra[q]);cb[q]=.5*(b[q]+tb[q]+step*rb[q]);}
        [a,ca]=[ca,a];[b,cb]=[cb,b];
      }
      this.dyeA=a;this.correctA=ca;this.dyeB=b;this.correctB=cb;this.dyeSubsteps=substeps;
    }
    // A bounded, localized external acceleration acts on the staggered face
    // velocities. The following pressure projection restores the approximate
    // no-through-wall, divergence-free constraint; dye is not directly painted.
    applyForce(force) {
      const {nx,ny,nz,h,dt}=this;
      if (!force || !Array.isArray(force.center) || !Array.isArray(force.direction) || force.center.length!==3 || force.direction.length!==3 ||
          !force.center.every(finite) || !force.direction.every(finite) || !finite(force.strength) || !finite(force.radius) ||
          force.strength<0 || force.strength>3 || force.radius<.25 || force.radius>1.2 ||
          Math.abs(force.center[0])>nx*h/2 || Math.abs(force.center[1])>ny*h/2 || Math.abs(force.center[2])>nz*h/2)
        throw new Error('Invalid external force');
      const length=Math.hypot(...force.direction);
      if (length<1e-9) throw new Error('Invalid external force direction');
      const specs=[
        {field:this.u,sx:nx+1,sy:ny,sz:nz,offset:[0,.5,.5],axis:0},
        {field:this.v,sx:nx,sy:ny+1,sz:nz,offset:[.5,0,.5],axis:1},
        {field:this.w,sx:nx,sy:ny,sz:nz+1,offset:[.5,.5,0],axis:2}
      ];
      const dims=[nx,ny,nz], reach=3*force.radius/h, inv2sigma=1/(2*force.radius*force.radius);
      for(const spec of specs) {
        const component=dt*force.strength*force.direction[spec.axis]/length;if(Math.abs(component)<1e-15)continue;
        const counts=[spec.sx,spec.sy,spec.sz], weights=[], limits=[];
        for(let a=0;a<3;a++) {
          const center=force.center[a]/h+dims[a]/2-spec.offset[a],lower=a===spec.axis?1:0,upper=counts[a]-1-(a===spec.axis?1:0);
          const lo=Math.max(lower,Math.ceil(center-reach)),hi=Math.min(upper,Math.floor(center+reach)),w=new Float64Array(counts[a]);
          for(let i=lo;i<=hi;i++){const d=(i-center)*h;w[i]=Math.exp(-d*d*inv2sigma);}
          weights.push(w);limits.push([lo,hi]);
        }
        const [wx,wy,wz]=weights,[[x0,x1],[y0,y1],[z0,z1]]=limits,nxy=spec.sx*spec.sy;
        for(let k=z0;k<=z1;k++)for(let j=y0;j<=y1;j++)for(let i=x0;i<=x1;i++)
          spec.field[i+spec.sx*j+nxy*k]+=component*wx[i]*wy[j]*wz[k];
      }
    }
    step(force = null) {
      this.advectVelocity(); if (force) this.applyForce(force); this.project(); this.advectDye(); this.steps++; this.updateStats();
      if (![this.stats.divergenceRms,this.stats.maxSpeed,this.stats.dyeMassA,this.stats.dyeMassB,this.stats.dyeCenterA,this.stats.dyeCenterB].every(finite)) throw new Error('Numerical state became non-finite');
      return this.stats;
    }
    updateStats() {
      const {nx,ny,nz,h,dt} = this; let speed=0, massA=0, massB=0, momentA=0, momentB=0;
      for (let k=0;k<nz;k++) for (let j=0;j<ny;j++) for (let i=0;i<nx;i++) {
        const q=index(i,j,k,nx,ny), a=index(i,j,k,nx+1,ny), b=index(i,j,k,nx,ny+1), x=(i+.5-nx/2)*h;
        const ux=(this.u[a]+this.u[a+1])*.5, uy=(this.v[b]+this.v[b+nx])*.5, uz=(this.w[q]+this.w[q+nx*ny])*.5;
        speed=Math.max(speed,Math.hypot(ux,uy,uz)); massA+=this.dyeA[q]; massB+=this.dyeB[q];
        momentA+=this.dyeA[q]*x; momentB+=this.dyeB[q]*x;
      }
      this.stats = { time:this.steps*dt, steps:this.steps, divergenceRms:this.computeDivergence().rms,
        projectionBefore:this.lastProjection.before,projectionIterations:this.lastProjection.iterations,
        projectionLimit:this.lastProjection.limit,projectionTarget:this.lastProjection.target,projectionConverged:this.lastProjection.converged,
        maxSpeed:speed, cfl:speed*dt/h,
        dyeMassA:massA*h**3, dyeMassB:massB*h**3, dyeCenterA:massA>1e-12 ? momentA/massA : 0,
        dyeCenterB:massB>1e-12 ? momentB/massB : 0, dyeCenterX:(massA+massB)>1e-12 ? (momentA+momentB)/(massA+massB) : 0 };
      return this.stats;
    }
    // Cell-center velocity reconstructed from the two adjacent MAC faces.
    // The slice derives a true discrete curl from this evolving velocity,
    // not from the passive dye or a prerecorded vortex shape.
    cellVelocityComponent(component, i, j, k) {
      const {nx,ny,u,v,w}=this, q=index(i,j,k,nx,ny);
      if (component===0) { const a=index(i,j,k,nx+1,ny); return (u[a]+u[a+1])*.5; }
      if (component===1) { const a=index(i,j,k,nx,ny+1); return (v[a]+v[a+nx])*.5; }
      return (w[q]+w[q+nx*ny])*.5;
    }
    sampleSlice(axis, position) {
      if (!['x','y','z'].includes(axis) || !finite(position) || position < -1 || position > 1) throw new Error('Invalid field slice');
      const {nx,ny,nz,h}=this, axisIndex={x:0,y:1,z:2}[axis], sizes=[nx,ny,nz];
      const fixed=clamp(Math.round((position+1)*sizes[axisIndex]*.5-.5),0,sizes[axisIndex]-1);
      const width=axis==='x'?ny:nx, height=axis==='z'?ny:nz, values=new Float32Array(width*height*3);
      let maxVorticity=0, maxPlaneSpeed=0;
      const component=(c,i,j,k)=>this.cellVelocityComponent(c,i,j,k);
      const derivative=(c,a,i,j,k)=>{
        const coord=a===0?i:a===1?j:k, left=Math.max(0,coord-1), right=Math.min(sizes[a]-1,coord+1);
        const lo=a===0?component(c,left,j,k):a===1?component(c,i,left,k):component(c,i,j,left);
        const hi=a===0?component(c,right,j,k):a===1?component(c,i,right,k):component(c,i,j,right);
        return (hi-lo)/((right-left)*h);
      };
      for(let v=0;v<height;v++) for(let u=0;u<width;u++) {
        const i=axis==='x'?fixed:u, j=axis==='x'?u:axis==='y'?fixed:v, k=axis==='z'?fixed:v;
        const vx=component(0,i,j,k),vy=component(1,i,j,k),vz=component(2,i,j,k);
        const wx=derivative(2,1,i,j,k)-derivative(1,2,i,j,k);
        const wy=derivative(0,2,i,j,k)-derivative(2,0,i,j,k);
        const wz=derivative(1,0,i,j,k)-derivative(0,1,i,j,k);
        const vort=Math.hypot(wx,wy,wz), a=axis==='x'?vy:vx, b=axis==='z'?vy:vz, q=3*(u+width*v);
        values[q]=vort;values[q+1]=a;values[q+2]=b;
        maxVorticity=Math.max(maxVorticity,vort);maxPlaneSpeed=Math.max(maxPlaneSpeed,Math.hypot(a,b));
      }
      return {axis,index:fixed,coordinate:(fixed+.5-sizes[axisIndex]/2)*h,width,height,
        maxVorticity,maxPlaneSpeed,time:this.steps*this.dt,values};
    }
    densityPixels(target) {
      // Pack each dye into two normalized 8-bit channels. Decoding the high
      // and low bytes is linear, so hardware trilinear filtering still
      // interpolates the two 16-bit concentrations rather than their bytes as
      // independent colors. Readouts continue using the unquantized arrays.
      const length=this.dyeA.length*4;
      const out=target && target.length===length ? target : new Uint8Array(length);
      for (let i=0;i<this.dyeA.length;i++) {
        const a=Math.round(65535*clamp(this.dyeA[i],0,1)), b=Math.round(65535*clamp(this.dyeB[i],0,1)), q=4*i;
        out[q]=a>>>8; out[q+1]=a&255; out[q+2]=b>>>8; out[q+3]=b&255;
      }
      return out;
    }
    densityBounds(data) {
      const {nx,ny,nz}=this,plane=nx*ny;
      if (!data || data.length!==plane*nz*4) throw new Error('Invalid packed dye field');
      let peak=0;
      for(let q=0;q<data.length;q+=4)peak=Math.max(peak,256*data[q]+data[q+1]+256*data[q+2]+data[q+3]);
      const cutoff=Math.min(65535*.001,Math.max(1,peak*.01));
      let minX=nx,minY=ny,minZ=nz,maxX=-1,maxY=-1,maxZ=-1;
      for(let cell=0,q=0;q<data.length;cell++,q+=4) {
        if(256*data[q]+data[q+1]+256*data[q+2]+data[q+3]<cutoff)continue;
        const x=cell%nx,y=Math.floor(cell/nx)%ny,z=Math.floor(cell/plane);
        minX=Math.min(minX,x);minY=Math.min(minY,y);minZ=Math.min(minZ,z);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);maxZ=Math.max(maxZ,z);
      }
      return {peak,min:[minX,minY,minZ],max:[maxX,maxY,maxZ]};
    }
  }
  return { Fluid3D, PRESETS, PRESET_VISCOSITY, sample, ringVelocity, torusVelocity, perturbationVelocity, validateInitial, velU, velV, velW, departureCell, departureFace };
});
