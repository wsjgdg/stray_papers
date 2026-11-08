/* Reaction–diffusion on an actual triangulated sphere, not an animated texture. */
(function (root, factory) {
  'use strict';
  const api = factory();
  function workerMain(makeModel) {
    'use strict';
    const M = makeModel();
    let generation = 0, mesh = null, primary = null, reference = null, probeIndex = null, comparisonMode = 'diffusion', modeDegree = 10, showMode = false;
    function fieldSnapshot(model, includeSpectrum, transfers) {
      const u = new Float32Array(model.u), v = new Float32Array(model.v);
      transfers.push(u.buffer, v.buffer);
      const spectrum=includeSpectrum ? model.spectrum(18) : null;
      if (spectrum) spectrum.time=model.time;
      let mode=null;
      if(showMode){mode=model.projectMode(modeDegree);mode.time=model.time;transfers.push(mode.values.buffer);mode.values=mode.values.buffer;}
      return { u:u.buffer, v:v.buffer, stats:model.statistics(), spectrum, mode,
        probe:probeIndex===null ? null : model.probe(probeIndex) };
    }
    function send(kind, includeSpectrum, includeMesh, warmHistory=null) {
      const transfers = [];
      const packet = { kind, generation, primary:fieldSnapshot(primary, includeSpectrum, transfers),
        reference:reference ? fieldSnapshot(reference, includeSpectrum, transfers) : null, warmHistory };
      if (includeMesh) {
        const positions = new Float32Array(mesh.positions), triangles = new Uint32Array(mesh.triangles);
        packet.mesh = {positions:positions.buffer, triangles:triangles.buffer, vertices:mesh.count, faces:mesh.triangles.length/3,
          level:mesh.level, area:mesh.totalArea};
        transfers.push(positions.buffer, triangles.buffer);
      }
      self.postMessage(packet, transfers);
    }
    self.onmessage = event => {
      const m = event.data;
      try {
        if (m.type === 'reset') {
          generation = m.generation;
          mesh = M.makeSphere(m.level);
          probeIndex = m.probePoint ? M.nearestVertex(mesh,m.probePoint) : null;
          comparisonMode=['radius','model'].includes(m.comparisonMode) ? m.comparisonMode : 'diffusion';
          modeDegree=m.modeDegree==null?10:m.modeDegree;showMode=!!m.showMode;
          if(!Number.isInteger(modeDegree)||modeDegree<1||modeDegree>18)throw new Error('Invalid projection degree');
          primary = new M.ReactionSphere(mesh, m.options);
          if(m.compare&&comparisonMode==='model'&&!m.referenceOptions)throw new Error('Missing reference model');
          reference = m.compare ? new M.ReactionSphere(mesh, comparisonMode==='model'?m.referenceOptions:{...m.options,
            ratio:comparisonMode==='diffusion'?1:m.options.ratio,radius:comparisonMode==='radius'?1:m.options.radius}) : null;
          const warm = m.warm == null ? 0 : m.warm;
          if (!Number.isFinite(warm) || warm<0 || warm>300) throw new Error('Invalid warm-up time');
          // Prewarm samples are recorded from actual intermediate solver states;
          // no synthetic history is inferred from the final field.
          const warmHistory=[];
          function recordWarm(){const spectrum=primary.spectrum(18),stats=primary.statistics();warmHistory.push({time:primary.time,power:spectrum.power,stdU:stats.stdU});}
          if(warm>0)recordWarm();
          const interval=primary.model==='gray-scott'?10:1;
          let remaining=warm,nextSample=interval;
          while(remaining>1e-10) {
            const dt=Math.min(.5,remaining);M.advanceTogether(reference?[primary,reference]:[primary],dt);remaining-=dt;
            if(primary.time+1e-9>=nextSample){recordWarm();nextSample+=interval;}
          }
          send('ready', true, true,warmHistory);
        } else if (m.generation === generation && primary) {
          if (m.type === 'advance') {
            // Both experiments use exactly the same adaptive substeps; only
            // the chosen diffusion ratio or fixed physical radius differs.
            M.advanceTogether(reference ? [primary,reference] : [primary],m.duration);
            send('frame', !!m.spectrum, false);
          } else if (m.type === 'configure') {
            primary.configure({b:m.b,ratio:m.ratio,feed:m.feed,kill:m.kill});
            if (reference&&comparisonMode!=='model') reference.configure({b:m.b,ratio:comparisonMode==='diffusion'?1:m.ratio,feed:m.feed,kill:m.kill});
            send('configured', true, false);
          } else if (m.type === 'poke') {
            primary.poke(m.point, m.strength, m.radius);
            if (reference&&comparisonMode!=='model') reference.poke(m.point, m.strength, m.radius);
            send('poked', true, false);
          } else if (m.type === 'probe') {
            probeIndex=m.point===null ? null : M.nearestVertex(mesh,m.point);
            send('probed',false,false);
          } else if (m.type === 'mode') {
            if(!Number.isInteger(m.degree)||m.degree<1||m.degree>18)throw new Error('Invalid projection degree');
            modeDegree=m.degree;showMode=!!m.show;send('mode',false,false);
          } else if (m.type === 'inspect') send('inspected', true, false);
        }
      } catch (error) {
        self.postMessage({kind:'error', generation:m.generation, message:String(error && error.message || error)});
      }
    };
  }
  api.workerSource = () => '(' + workerMain.toString() + ')(' + factory.toString() + ');';
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TuringSphere = api;
})(typeof window !== 'undefined' ? window : globalThis, function makeModel() {
  'use strict';
  const PI = Math.PI, A = 1, DU = .002, GRAY_DU = .0016;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const finite = Number.isFinite;

  // An icosphere has no latitude/longitude seam or singular pole. The
  // cotangent finite-element Laplacian below evolves scalars on its surface,
  // not in a three-dimensional volume.
  function makeSphere(level = 4) {
    if (!Number.isInteger(level) || level < 2 || level > 5) throw new Error('Invalid sphere mesh level');
    const t = (1 + Math.sqrt(5)) / 2;
    const source = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
      [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
    const vertices = source.map(v => {const d=Math.hypot(...v); return v.map(x=>x/d);});
    let faces = [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
      [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
      [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
    for (let pass=0; pass<level; pass++) {
      const cache = new Map(), next = [];
      function middle(a,b) {
        const lo=Math.min(a,b), hi=Math.max(a,b), key=lo+','+hi;
        if (cache.has(key)) return cache.get(key);
        const p=vertices[a], q=vertices[b], x=p[0]+q[0], y=p[1]+q[1], z=p[2]+q[2], d=Math.hypot(x,y,z);
        const index=vertices.length; vertices.push([x/d,y/d,z/d]); cache.set(key,index); return index;
      }
      for(const [a,b,c] of faces) {
        const ab=middle(a,b), bc=middle(b,c), ca=middle(c,a);
        next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
      }
      faces=next;
    }
    const count=vertices.length, positions=new Float64Array(count*3), triangles=new Uint32Array(faces.length*3);
    for(let i=0;i<count;i++) positions.set(vertices[i],i*3);
    const area=new Float64Array(count), edgeWeights=new Map();
    function addEdge(i,j,w) {
      const lo=Math.min(i,j), hi=Math.max(i,j), key=lo*count+hi;
      edgeWeights.set(key,(edgeWeights.get(key)||0)+w);
    }
    function dot(a,b) {return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
    for(let f=0;f<faces.length;f++) {
      const [i,j,k]=faces[f],p=vertices[i],q=vertices[j],r=vertices[k];triangles.set([i,j,k],f*3);
      const ab=[q[0]-p[0],q[1]-p[1],q[2]-p[2]], ac=[r[0]-p[0],r[1]-p[1],r[2]-p[2]];
      const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]], twice=Math.hypot(...cross);
      if (!(twice>1e-14)) throw new Error('Degenerate sphere triangle');
      const ar=twice/6;area[i]+=ar;area[j]+=ar;area[k]+=ar;
      const ba=[-ab[0],-ab[1],-ab[2]],bc=[r[0]-q[0],r[1]-q[1],r[2]-q[2]],
        ca=[-ac[0],-ac[1],-ac[2]],cb=[-bc[0],-bc[1],-bc[2]];
      addEdge(j,k,.5*dot(ab,ac)/twice);
      addEdge(i,k,.5*dot(ba,bc)/twice);
      addEdge(i,j,.5*dot(ca,cb)/twice);
    }
    const rows=Array.from({length:count},()=>[]);
    for(const [key,w] of edgeWeights) {
      const i=Math.floor(key/count), j=key-i*count;
      if (!(w>0)) throw new Error('Nonpositive sphere diffusion weight');
      rows[i].push([j,w]);rows[j].push([i,w]);
    }
    const offsets=new Uint32Array(count+1);
    for(let i=0;i<count;i++){rows[i].sort((a,b)=>a[0]-b[0]);offsets[i+1]=offsets[i]+rows[i].length;}
    const neighbors=new Uint32Array(offsets[count]), weights=new Float64Array(offsets[count]), degree=new Float64Array(count);
    let totalArea=0,maxRate=0;
    for(let i=0;i<count;i++) {
      totalArea+=area[i];let sum=0;
      for(let j=0;j<rows[i].length;j++){const [neighbor,w]=rows[i][j],p=offsets[i]+j;neighbors[p]=neighbor;weights[p]=w;sum+=w;}
      degree[i]=sum;maxRate=Math.max(maxRate,sum/area[i]);
    }
    return {level,count,positions,triangles,area,totalArea,offsets,neighbors,weights,degree,maxRate,harmonics:null};
  }

  function legendre(l,x) {
    if (!Number.isInteger(l) || l<0 || l>40 || !finite(x)) throw new Error('Invalid spherical harmonic');
    if (l===0) return 1;
    let a=1,b=x;
    for(let n=2;n<=l;n++){const c=((2*n-1)*x*b-(n-1)*a)/n;a=b;b=c;}
    return b;
  }
  // On an ideal sphere of fixed physical radius R the Laplace–Beltrami
  // eigenvalue is -l(l+1)/R². This is early linear theory, not the nonlinear
  // final pattern or the triangulated mesh's exact eigenvalues.
  function validRadius(radius) {return finite(radius)&&radius>=.6&&radius<=1.35;}
  function growthRate(b,ratio,l,radius=1) {
    if (!finite(b) || b<=1 || b>=2 || !finite(ratio) || ratio<1 || ratio>40 || !Number.isInteger(l) || l<0 || l>100 || !validRadius(radius)) throw new Error('Invalid stability parameters');
    const k=l*(l+1)/(radius*radius), x=b-1-DU*k, y=A*A, z=-b, w=-A*A-DU*ratio*k;
    const trace=x+w, discriminant=(x-w)*(x-w)+4*y*z;
    return .5*(trace+(discriminant>0?Math.sqrt(discriminant):0));
  }
  function criticalRatio(b) {
    if (!finite(b) || b<=1 || b>=2) throw new Error('Invalid reaction parameter');
    return A*A*(1+Math.sqrt(b))**2/(b-1)**2;
  }
  // The first discrete spherical mode to cross zero: det(J-k²D)=0.
  // For q=DU*l(l+1)/R² with 0<q<B-1, r_l=(1+q)/(q(B-1-q)).
  // The envelope is an ideal-sphere prediction, not the triangulated solver.
  function phaseBoundary(b,radius=1) {
    if(!finite(b)||b<=1||b>=2||!validRadius(radius))throw new Error('Invalid phase parameters');
    let critical=Infinity,degree=null;
    for(let l=1;l<=100;l++) {
      const q=DU*l*(l+1)/(radius*radius);if(q>=b-1)break;
      const threshold=(1+q)/(q*(b-1-q));
      if(threshold<critical){critical=threshold;degree=l;}
    }
    return {criticalRatio:critical,degree,continuous:criticalRatio(b)};
  }
  function prediction(b,ratio,maxL=24,radius=1) {
    if (!Number.isInteger(maxL) || maxL<1 || maxL>100 || !validRadius(radius)) throw new Error('Invalid spectrum limit or radius');
    const rates=[];let best=-Infinity, fastest=0, first=null,last=null;
    for(let l=0;l<=maxL;l++) {
      const rate=growthRate(b,ratio,l,radius);rates.push(rate);
      if(rate>best){best=rate;fastest=l;}if(l>0 && rate>0){if(first===null)first=l;last=l;}
    }
    return {rates,fastest,maxGrowth:best,first,last,criticalRatio:criticalRatio(b),localGrowth:growthRate(b,ratio,0)};
  }
  function rng(seed) {
    let s=(seed>>>0)||1;
    return () => {s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};
  }
  function initialPerturbation(mesh, seed, kind, degree) {
    const n=mesh.count,p=mesh.positions, values=new Float64Array(n);
    if (kind==='mode') {
      for(let i=0;i<n;i++) values[i]=legendre(degree,p[i*3+2]);
    } else if(kind==='noise') {
      // Smooth deterministic perturbation: tiny, not a precomputed final
      // pattern. The same seed is used for both experiments in comparison.
      const random=rng(seed), waves=[];
      for(let j=0;j<12;j++) {
        const z=2*random()-1,angle=2*PI*random(),r=Math.sqrt(Math.max(0,1-z*z));
        waves.push([r*Math.cos(angle),r*Math.sin(angle),z,7+6*random(),2*PI*random()]);
      }
      for(let i=0;i<n;i++) {
        const x=p[3*i],y=p[3*i+1],z=p[3*i+2];let sum=0;
        for(const w of waves) sum+=Math.sin(w[3]*(x*w[0]+y*w[1]+z*w[2])+w[4]);
        values[i]=sum;
      }
    } else throw new Error('Invalid initial perturbation');
    let mean=0;for(let i=0;i<n;i++)mean+=mesh.area[i]*values[i];mean/=mesh.totalArea;
    let max=0;for(let i=0;i<n;i++){values[i]-=mean;max=Math.max(max,Math.abs(values[i]));}
    if(max>0)for(let i=0;i<n;i++)values[i]/=max;
    return values;
  }
  function validateOptions(b,ratio,kind,degree,amplitude,seed) {
    return finite(b)&&b>=1.4&&b<=1.95&&finite(ratio)&&ratio>=1&&ratio<=40&&
      ['noise','mode'].includes(kind)&&Number.isInteger(degree)&&degree>=1&&degree<=18&&
      finite(amplitude)&&amplitude>=0&&amplitude<=.08&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff;
  }

  function validateGray(ratio,feed,kill,kind,degree,amplitude,seed) {
    return finite(ratio)&&ratio>=.1&&ratio<=1.5&&finite(feed)&&feed>=.015&&feed<=.08&&finite(kill)&&kill>=.045&&kill<=.075&&
      ['patch','rest'].includes(kind)&&Number.isInteger(degree)&&degree>=1&&degree<=18&&finite(amplitude)&&amplitude>=0&&amplitude<=.6&&
      Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff;
  }
  function grayGrowthRate(feed,kill,ratio,l,radius=1) {
    if(!validateGray(ratio,feed,kill,'rest',1,0,1)||!validRadius(radius)||!Number.isInteger(l)||l<0||l>100)throw new Error('Invalid Gray–Scott stability parameters');
    const wave=l*(l+1)/(radius*radius);
    // Linearization at the always-present (1,0) state is diagonal. Other
    // nonzero equilibria may exist but are not classified by this prediction.
    return Math.max(-feed-GRAY_DU*wave,-(feed+kill)-GRAY_DU*ratio*wave);
  }
  function grayPrediction(feed,kill,ratio,maxL=24,radius=1) {
    if(!Number.isInteger(maxL)||maxL<1||maxL>100)throw new Error('Invalid spectrum limit');
    const rates=[];for(let l=0;l<=maxL;l++)rates.push(grayGrowthRate(feed,kill,ratio,l,radius));
    return {rates,fastest:0,maxGrowth:rates[0],first:null,last:null,criticalRatio:null,localGrowth:rates[0]};
  }

  function nearestVertex(mesh,point) {
    if(!mesh || !Array.isArray(point) || point.length!==3 || !point.every(finite))throw new Error('Invalid probe point');
    const length=Math.hypot(...point);if(length<1e-9)throw new Error('Invalid probe point');
    const x=point[0]/length,y=point[1]/length,z=point[2]/length,p=mesh.positions;
    let best=0,bestDot=-Infinity;
    for(let i=0;i<mesh.count;i++) {const d=x*p[3*i]+y*p[3*i+1]+z*p[3*i+2];if(d>bestDot){bestDot=d;best=i;}}
    return best;
  }

  class ReactionSphere {
    constructor(mesh, options={}) {
      if (!mesh || !Number.isInteger(mesh.count) || !mesh.area) throw new Error('Invalid sphere mesh');
      this.mesh=mesh;this.model=options.model||'brusselator';this.b=options.b==null?1.8:options.b;
      this.ratio=options.ratio==null?(this.model==='gray-scott'?.5:20):options.ratio;
      this.feed=options.feed==null?.05:options.feed;this.kill=options.kill==null?.065:options.kill;
      this.du=this.model==='gray-scott'?GRAY_DU:DU;this.radius=options.radius==null?1:options.radius;
      this.seed=options.seed==null?20261031:options.seed;this.kind=options.kind||(this.model==='gray-scott'?'patch':'noise');
      this.degree=options.degree==null?10:options.degree;this.amplitude=options.amplitude==null?(this.model==='gray-scott'?.5:.03):options.amplitude;
      const valid=this.model==='brusselator'?validateOptions(this.b,this.ratio,this.kind,this.degree,this.amplitude,this.seed):
        this.model==='gray-scott'&&validateGray(this.ratio,this.feed,this.kill,this.kind,this.degree,this.amplitude,this.seed);
      if(!valid||!validRadius(this.radius)) throw new Error('Invalid reaction–diffusion parameters');
      const n=mesh.count;this.u=new Float64Array(n);this.v=new Float64Array(n);
      this.pu=new Float64Array(n);this.pv=new Float64Array(n);this.ku=new Float64Array(n);this.kv=new Float64Array(n);
      this.nu=new Float64Array(n);this.nv=new Float64Array(n);
      if(this.model==='brusselator') {
        const initial=initialPerturbation(mesh,this.seed,this.kind,this.degree);
        for(let i=0;i<n;i++){const d=this.amplitude*initial[i];this.u[i]=A+d;this.v[i]=this.b/A-.3*d;}
      } else {
        // Finite Gaussian V-rich patches on the (1,0) state; no final pattern
        // is stored. The rest option contains no V and is an exact equilibrium.
        const centers=[[0,0,1],[.866,0,-.5],[-.433,.75,-.5],[-.433,-.75,-.5],[.5,.7,.5099],[-.7,.3,.648]].map(v=>{const len=Math.hypot(...v);return v.map(x=>x/len);});
        for(let i=0;i<n;i++) {
          let amount=0;if(this.kind==='patch')for(const c of centers){const dot=clamp(mesh.positions[3*i]*c[0]+mesh.positions[3*i+1]*c[1]+mesh.positions[3*i+2]*c[2],-1,1),angle=Math.acos(dot);amount+=Math.exp(-angle*angle/(2*.2*.2));}
          const d=this.amplitude*amount;this.u[i]=Math.max(0,1-d);this.v[i]=d;
        }
      }
      this.time=0;this.substeps=0;this.pokes=0;
    }
    configure(options) {
      const b=options.b==null?this.b:options.b,ratio=options.ratio==null?this.ratio:options.ratio,
        feed=options.feed==null?this.feed:options.feed,kill=options.kill==null?this.kill:options.kill;
      const valid=this.model==='brusselator'?validateOptions(b,ratio,this.kind,this.degree,this.amplitude,this.seed):validateGray(ratio,feed,kill,this.kind,this.degree,this.amplitude,this.seed);
      if(!valid) throw new Error('Invalid reaction–diffusion parameters');
      this.b=b;this.ratio=ratio;this.feed=feed;this.kill=kill;
    }
    laplacian(values, out = new Float64Array(this.mesh.count)) {
      const {count,offsets,neighbors,weights,degree,area}=this.mesh;
      if (!values || values.length!==count || !out || out.length!==count || values===out) throw new Error('Invalid field for Laplacian');
      for(let i=0;i<count;i++) {
        let sum=-degree[i]*values[i];for(let p=offsets[i];p<offsets[i+1];p++)sum+=weights[p]*values[neighbors[p]];
        out[i]=sum/(area[i]*this.radius*this.radius);
      }
      return out;
    }
    derivatives(u,v,outU,outV) {
      const {count,offsets,neighbors,weights,degree,area}=this.mesh, b=this.b,du=this.du,dv=du*this.ratio,r2=this.radius*this.radius,gray=this.model==='gray-scott';
      for(let i=0;i<count;i++) {
        const x=u[i],y=v[i];let lu=-degree[i]*x,lv=-degree[i]*y;
        for(let p=offsets[i];p<offsets[i+1];p++){const j=neighbors[p],w=weights[p];lu+=w*u[j];lv+=w*v[j];}
        if(gray) {
          const reaction=x*y*y;outU[i]=-reaction+this.feed*(1-x)+du*lu/(area[i]*r2);
          outV[i]=reaction-(this.feed+this.kill)*y+dv*lv/(area[i]*r2);
        } else {
          const reaction=x*x*y;outU[i]=A-(b+1)*x+reaction+du*lu/(area[i]*r2);
          outV[i]=b*x-reaction+dv*lv/(area[i]*r2);
        }
      }
    }
    maxStep() {
      // Include the model-specific nonlinear reaction scales as well as the
      // diffusion CFL; positivity is additionally checked before committing.
      const rate=this.mesh.maxRate/(this.radius*this.radius),diffusionU=this.du*rate,diffusionV=this.du*this.ratio*rate;
      if(this.model==='gray-scott') {
        let maxV2=0,maxUV=0;for(let i=0;i<this.u.length;i++){maxV2=Math.max(maxV2,this.v[i]*this.v[i]);maxUV=Math.max(maxUV,2*this.u[i]*this.v[i]);}
        return Math.min(.25,.72/Math.max(diffusionU+this.feed+maxV2,diffusionV+this.feed+this.kill+maxUV));
      }
      let maxU2=0;for(let i=0;i<this.u.length;i++)maxU2=Math.max(maxU2,this.u[i]*this.u[i]);
      return Math.min(.025,.72/Math.max(diffusionU+this.b+1,diffusionV+maxU2));
    }
    substepsFor(duration) {
      if (!finite(duration) || duration<=0 || duration>2) throw new Error('Invalid integration duration');
      return Math.max(1,Math.ceil(duration/this.maxStep()));
    }
    // SSP-RK2 / Heun candidate. Do not commit until both stages are finite
    // and nonnegative; if needed the caller retries with a shorter step.
    tryStep(dt) {
      const {u,v,pu,pv,ku,kv,nu,nv}=this,n=u.length;
      this.derivatives(u,v,ku,kv);
      for(let i=0;i<n;i++){
        pu[i]=u[i]+dt*ku[i];pv[i]=v[i]+dt*kv[i];
        if(!finite(pu[i])||!finite(pv[i])||pu[i]<0||pv[i]<0||pu[i]>1000||pv[i]>1000)return false;
      }
      this.derivatives(pu,pv,nu,nv);
      for(let i=0;i<n;i++){
        pu[i]=u[i]+.5*dt*(ku[i]+nu[i]);pv[i]=v[i]+.5*dt*(kv[i]+nv[i]);
        if(!finite(pu[i])||!finite(pv[i])||pu[i]<0||pv[i]<0||pu[i]>1000||pv[i]>1000)return false;
      }
      return true;
    }
    commitStep() {this.u.set(this.pu);this.v.set(this.pv);}
    advance(duration,count) {advanceTogether([this],duration,count);return this;}
    poke(point,strength=.06,radius=.25) {
      if (!Array.isArray(point) || point.length!==3 || !point.every(finite) || !finite(strength) || strength<=0 || strength>(this.model==='gray-scott'?.6:.15) || !finite(radius) || radius<.08 || radius>.7) throw new Error('Invalid surface perturbation');
      const length=Math.hypot(...point);if(length<1e-9)throw new Error('Invalid surface perturbation point');
      const center=point.map(v=>v/length), {count,positions}=this.mesh, denom=2*radius*radius;
      for(let i=0;i<count;i++) {
        const dot=clamp(positions[3*i]*center[0]+positions[3*i+1]*center[1]+positions[3*i+2]*center[2],-1,1);
        const angle=Math.acos(dot);if(angle>3*radius)continue;
        const d=strength*Math.exp(-angle*angle/denom);
        if(this.model==='gray-scott'){this.u[i]=Math.max(0,this.u[i]-d);this.v[i]+=d;}
        else {this.u[i]+=d;this.v[i]=Math.max(0,this.v[i]-.3*d);}
      }
      this.pokes++;
    }
    // At one actual mesh vertex, distinguish the solver's cotangent diffusion
    // term from a tangent-plane least-squares estimate of the local flux.
    // The latter is a vector visualization, not a second evolution equation.
    probe(index) {
      const {count,positions,offsets,neighbors,weights,area}=this.mesh;
      if(!Number.isInteger(index)||index<0||index>=count)throw new Error('Invalid probe vertex');
      const n=[positions[3*index],positions[3*index+1],positions[3*index+2]];
      let t=Math.abs(n[2])<.9 ? [-n[1],n[0],0] : [0,-n[2],n[1]];
      const length=Math.hypot(...t);t=t.map(v=>v/length);
      const s=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];
      const u=this.u[index],v=this.v[index];let lu=0,lv=0,xx=0,xy=0,yy=0,ux=0,uy=0,vx=0,vy=0;
      for(let k=offsets[index];k<offsets[index+1];k++) {
        const j=neighbors[k],w=weights[k],dx=positions[3*j]-n[0],dy=positions[3*j+1]-n[1],dz=positions[3*j+2]-n[2];
        const a=this.radius*(dx*t[0]+dy*t[1]+dz*t[2]),b=this.radius*(dx*s[0]+dy*s[1]+dz*s[2]),du=this.u[j]-u,dv=this.v[j]-v;
        lu+=w*du;lv+=w*dv;xx+=w*a*a;xy+=w*a*b;yy+=w*b*b;ux+=w*a*du;uy+=w*b*du;vx+=w*a*dv;vy+=w*b*dv;
      }
      const determinant=xx*yy-xy*xy;
      function flux(x,y,diffusion) {
        if(!(determinant>1e-18))return [0,0,0];
        const g1=(yy*x-xy*y)/determinant,g2=(xx*y-xy*x)/determinant;
        return t.map((q,i)=>-diffusion*(g1*q+g2*s[i]));
      }
      const gray=this.model==='gray-scott',reactionU=gray?-u*v*v+this.feed*(1-u):A-(this.b+1)*u+u*u*v,
        reactionV=gray?u*v*v-(this.feed+this.kill)*v:this.b*u-u*u*v;
      const diffusionU=this.du*lu/(area[index]*this.radius*this.radius),diffusionV=this.du*this.ratio*lv/(area[index]*this.radius*this.radius);
      return {index,point:n,time:this.time,u,v,reactionU,reactionV,diffusionU,diffusionV,
        totalU:reactionU+diffusionU,totalV:reactionV+diffusionV,fluxU:flux(ux,uy,this.du),fluxV:flux(vx,vy,this.du*this.ratio)};
    }
    // Count vertex-graph connected regions above a fixed, explicitly labelled
    // concentration threshold. Stripes or merged spots are each one region.
    countRegions(values,threshold) {
      const {count,offsets,neighbors}=this.mesh;
      if(!values||values.length!==count||!finite(threshold))throw new Error('Invalid region field');
      const visited=new Uint8Array(count),stack=new Uint32Array(count);let regions=0;
      for(let i=0;i<count;i++) {
        if(visited[i]||values[i]<threshold)continue;
        visited[i]=1;stack[0]=i;let length=1;regions++;
        while(length){const vertex=stack[--length];for(let p=offsets[vertex];p<offsets[vertex+1];p++){
          const j=neighbors[p];if(!visited[j]&&values[j]>=threshold){visited[j]=1;stack[length++]=j;}
        }}
      }
      return regions;
    }
    statistics() {
      const {count,area,totalArea}=this.mesh;let meanU=0,meanV=0,minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
      for(let i=0;i<count;i++) {
        const u=this.u[i],v=this.v[i],a=area[i];meanU+=a*u;meanV+=a*v;
        minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
      }
      meanU/=totalArea;meanV/=totalArea;let variance=0;
      for(let i=0;i<count;i++){const d=this.u[i]-meanU;variance+=area[i]*d*d;}
      const gray=this.model==='gray-scott',regionField=gray?'v':'u',regionThreshold=gray?.18:1.25,
        regions=this.countRegions(gray?this.v:this.u,regionThreshold);
      return {time:this.time,model:this.model,b:this.b,feed:this.feed,kill:this.kill,du:this.du,ratio:this.ratio,radius:this.radius,area:totalArea*this.radius*this.radius,meanU,meanV,minU,maxU,minV,maxV,stdU:Math.sqrt(variance/totalArea),
        regions,regionsU:gray?null:regions,regionField,regionThreshold,substeps:this.substeps,pokes:this.pokes};
    }
    spectrum(maxL=18) {return harmonicSpectrum(this.mesh,this.u,maxL);}
    projectMode(degree) {return projectMode(this.mesh,this.u,degree);}
  }

  // Adaptive positivity-preserving integration shared by the two comparison
  // experiments. Every model uses exactly the same substep, including retries.
  function advanceTogether(models,duration,minimumCount) {
    if(!Array.isArray(models)||!models.length||!models.every(m=>m instanceof ReactionSphere)||
      !finite(duration)||duration<=0||duration>2)throw new Error('Invalid integration duration');
    if(minimumCount!=null&&(!Number.isInteger(minimumCount)||minimumCount<1||minimumCount>10000))throw new Error('Invalid integration substeps');
    let left=duration,count=0;const limit=minimumCount?duration/minimumCount:Infinity;
    while(left>duration*1e-12) {
      let dt=Math.min(left,limit,...models.map(m=>m.maxStep())), attempts=0;
      while(!models.every(m=>m.tryStep(dt))) {
        dt*=.5;if(++attempts>20||dt<1e-10)throw new Error('Reaction–diffusion step could not remain nonnegative');
      }
      for(const model of models)model.commitStep();
      left-=dt;if(++count>10000)throw new Error('Too many reaction–diffusion substeps');
    }
    for(const model of models){model.time+=duration;model.substeps+=count;}
    return count;
  }

  // Area-weighted real spherical-harmonic projection of the actual numerical
  // U field. Finite triangular quadrature and finite l limit introduce error;
  // unlike the prediction, this quantity includes nonlinear evolution.
  function harmonicBasis(mesh,maxL) {
    if (!Number.isInteger(maxL) || maxL<1 || maxL>18) throw new Error('Invalid measured spectrum limit');
    if(mesh.harmonics && mesh.harmonics.maxL===maxL)return mesh.harmonics;
    const n=mesh.count,modes=(maxL+1)**2,basis=new Float32Array(n*modes), norms=Array.from({length:maxL+1},()=>[]);
    for(let l=0;l<=maxL;l++)for(let m=0;m<=l;m++) {
      let ratio=1;for(let q=l-m+1;q<=l+m;q++)ratio/=q;
      norms[l][m]=Math.sqrt((2*l+1)/(4*PI)*ratio)*(m?Math.SQRT2:1);
    }
    for(let i=0;i<n;i++) {
      const x=mesh.positions[3*i],y=mesh.positions[3*i+1],z=mesh.positions[3*i+2],radial=Math.sqrt(Math.max(0,1-z*z));
      const phi=Math.atan2(y,x), area=mesh.area[i];let pmm=1;
      for(let m=0;m<=maxL;m++) {
        if(m>0)pmm*=-(2*m-1)*radial;
        const cm=Math.cos(m*phi),sm=Math.sin(m*phi);let previous=0,current=pmm;
        for(let l=m;l<=maxL;l++) {
          if(l===m) current=pmm;
          else if(l===m+1){previous=pmm;current=(2*m+1)*z*pmm;}
          else {const next=((2*l-1)*z*current-(l+m-1)*previous)/(l-m);previous=current;current=next;}
          const base=l*l, scale=area*norms[l][m]*current;
          if(m===0)basis[base*n+i]=scale;
          else {basis[(base+2*m-1)*n+i]=scale*cm;basis[(base+2*m)*n+i]=scale*sm;}
        }
      }
    }
    mesh.harmonics={maxL,basis};return mesh.harmonics;
  }
  function harmonicSpectrum(mesh,values,maxL=18) {
    const n=mesh.count;if(!values || values.length!==n)throw new Error('Invalid field for harmonic spectrum');
    const {basis}=harmonicBasis(mesh,maxL),power=new Float64Array(maxL+1);let mean=0;
    for(let i=0;i<n;i++)mean+=mesh.area[i]*values[i];mean/=mesh.totalArea;
    for(let l=1;l<=maxL;l++) {
      let sumSquares=0;
      for(let mode=l*l;mode<(l+1)*(l+1);mode++) {
        let coefficient=0;const base=mode*n;
        for(let i=0;i<n;i++)coefficient+=(values[i]-mean)*basis[base+i];
        sumSquares+=coefficient*coefficient;
      }
      power[l]=Math.sqrt(sumSquares/mesh.totalArea);
    }
    let dominant=1;for(let l=2;l<=maxL;l++)if(power[l]>power[dominant])dominant=l;
    return {power:Array.from(power),dominant,time:null};
  }
  // Reconstruct the signed sum of all real Y_lm at the chosen degree from
  // the same area-weighted coefficients used by the measured power spectrum.
  // This is a filtered component of U-mean(U), not a concentration field.
  function projectMode(mesh,values,degree) {
    const n=mesh.count;if(!values||values.length!==n||!Number.isInteger(degree)||degree<1||degree>18)throw new Error('Invalid mode projection');
    const {basis}=harmonicBasis(mesh,18),coefficients=new Float64Array(2*degree+1),filtered=new Float32Array(n);
    let mean=0;for(let i=0;i<n;i++)mean+=mesh.area[i]*values[i];mean/=mesh.totalArea;
    let sumSquares=0;
    for(let j=0;j<coefficients.length;j++) {
      let value=0;const offset=(degree*degree+j)*n;
      for(let i=0;i<n;i++)value+=(values[i]-mean)*basis[offset+i];
      coefficients[j]=value;sumSquares+=value*value;
    }
    for(let j=0;j<coefficients.length;j++) {
      const offset=(degree*degree+j)*n,c=coefficients[j];
      for(let i=0;i<n;i++)filtered[i]+=c*basis[offset+i]/mesh.area[i];
    }
    return {degree,power:Math.sqrt(sumSquares/mesh.totalArea),values:filtered,coefficients:Array.from(coefficients)};
  }
  return {A,DU,GRAY_DU,makeSphere,nearestVertex,ReactionSphere,advanceTogether,legendre,growthRate,criticalRatio,phaseBoundary,prediction,grayGrowthRate,grayPrediction,harmonicSpectrum,projectMode};
});
