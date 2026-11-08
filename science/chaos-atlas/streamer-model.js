/* A dimensionless, three-dimensional negative-streamer teaching model.
 * Electron and positive-ion densities obey conservative drift-diffusion and
 * equal-pair Townsend impact ionization. Their space charge closes a Poisson
 * solve. This is a minimal fluid model for a non-attaching gas, not a model of
 * real air chemistry, plasma heating, a return stroke or cloud-scale lightning.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.StreamerModel=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EMPTY=0,CATHODE=1,ANODE=2;
  const GRIDS=Object.freeze({quick:{nx:17,ny:25,nz:17},standard:{nx:25,ny:37,nz:25},fine:{nx:33,ny:49,nz:33}});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function finite(value,fallback,lo,hi){value=Number(value);return Number.isFinite(value)?clamp(value,lo,hi):fallback;}
  function integer(value,fallback,lo,hi){value=Number(value);return Number.isFinite(value)?clamp(Math.round(value),lo,hi):fallback;}
  class Streamer {
    constructor(options={}){
      const quality=GRIDS[options.quality]?options.quality:'standard',g=GRIDS[quality];
      this.quality=quality;this.nx=g.nx;this.ny=g.ny;this.nz=g.nz;this.count=g.nx*g.ny*g.nz;
      this.h=24/(this.nx-1);this.height=(this.ny-1)*this.h;this.width=(this.nx-1)*this.h;
      this.field=finite(options.field,.65,0,1.5);this.diffusion=finite(options.diffusion,.16,0,.6);
      this.ionMobility=finite(options.ionMobility,.015,0,.12);this.ionDiffusion=this.diffusion*this.ionMobility;
      this.amplitude=finite(options.amplitude,.012,0,.15);this.seedRadius=finite(options.seedRadius,2.6,1.5,5);
      this.sourceX=integer(options.sourceX,Math.floor(this.nx/2),2,this.nx-3);this.sourceZ=integer(options.sourceZ,Math.floor(this.nz/2),2,this.nz-3);
      this.targetX=integer(options.targetX,Math.floor(this.nx/2),2,this.nx-3);this.targetZ=integer(options.targetZ,Math.floor(this.nz/2),2,this.nz-3);
      this.feedback=options.feedback!==false;this.omega=finite(options.omega,1.84,1,1.95);
      this.tolerance=finite(options.tolerance,2e-5,1e-7,1e-2);this.maxSweeps=integer(options.maxSweeps,1600,1,10000);
      this.maxStep=finite(options.maxStep,.16,.001,.4);
      this.mask=new Uint8Array(this.count);this.electrons=new Float64Array(this.count);this.ions=new Float64Array(this.count);
      this.potential=new Float64Array(this.count);this.ex=new Float64Array(this.count);this.ey=new Float64Array(this.count);this.ez=new Float64Array(this.count);
      this.neighbors=new Int32Array(this.count*6);this.missing=new Uint8Array(this.count);this.invDegree=new Float64Array(this.count);this.even=[];this.odd=[];
      this.dElectron=new Float64Array(this.count);this.dIon=new Float64Array(this.count);
      this.savedPotential=new Float64Array(this.count);
      this.time=0;this.steps=0;this.absorbedE=0;this.absorbedI=0;this.produced=0;
      this.solveInfo={converged:false,residual:Infinity,sweeps:0};this.lastStep=0;this.maxField=0;this.maxConductivity=0;this.maxIonizationRate=0;
      this.initialize();
    }
    index(x,y,z){return x+this.nx*(y+this.ny*z);}
    coords(i){const x=i%this.nx,j=(i-x)/this.nx,y=j%this.ny,z=(j-y)/this.ny;return{x,y,z};}
    initialize(){
      const {nx,ny,nz,h,neighbors,missing,invDegree,potential,mask,electrons,ions}=this;
      const tip=4.5,rodR=1.3;
      this.rodLength=Math.max(1,Math.round(tip/h));this.rodHeight=this.rodLength*h;this.voltage=this.field*this.height;
      const cx=this.sourceX*h,cz=this.sourceZ*h,seedY=this.rodHeight+1.8,denom=2*this.seedRadius*this.seedRadius;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=this.index(x,y,z),k=i*6,near=[x?i-1:-1,x<nx-1?i+1:-1,y?i-nx:-1,y<ny-1?i+nx:-1,z?i-nx*ny:-1,z<nz-1?i+nx*ny:-1];
        let degree=0;for(let j=0;j<6;j++){if(near[j]>=0){neighbors[k+j]=near[j];degree++;}else neighbors[k+j]=i;}
        missing[i]=6-degree;invDegree[i]=1/degree;potential[i]=this.field*y*h;((x+y+z)&1?this.odd:this.even).push(i);
        const sourceR=Math.hypot((x-this.sourceX)*h,(z-this.sourceZ)*h),targetR=Math.hypot((x-this.targetX)*h,(z-this.targetZ)*h);
        if(y===0||(y<=this.rodLength&&sourceR<=rodR))mask[i]=CATHODE;
        else if(y===ny-1||(y>=ny-1-this.rodLength&&targetR<=rodR))mask[i]=ANODE;
        if(mask[i]){potential[i]=mask[i]===CATHODE?0:this.voltage;continue;}
        const distance=(x*h-cx)**2+(z*h-cz)**2+(y*h-seedY)**2,value=this.amplitude*Math.exp(-distance/denom);
        electrons[i]=ions[i]=value;
      }
      this.even=Int32Array.from(this.even);this.odd=Int32Array.from(this.odd);
      this.initialCharge=this.totalCharge();
    }
    residual(){
      const {potential:p,electrons:e,ions:i,mask,neighbors:n,missing,invDegree,h}=this;let max=0;
      for(let q=0;q<this.count;q++)if(mask[q]===EMPTY){const k=6*q,old=p[q],sum=p[n[k]]+p[n[k+1]]+p[n[k+2]]+p[n[k+3]]+p[n[k+4]]+p[n[k+5]]-missing[q]*old;
        const rho=this.feedback?i[q]-e[q]:0;max=Math.max(max,Math.abs((sum+h*h*rho)*invDegree[q]-old));}
      return max;
    }
    solve(maxSweeps=this.maxSweeps,tolerance=this.tolerance){
      maxSweeps=integer(maxSweeps,this.maxSweeps,1,10000);tolerance=finite(tolerance,this.tolerance,1e-7,1e-2);
      const {potential:p,electrons:e,ions:i,mask,neighbors:n,missing,invDegree,h,omega}=this,groups=[this.even,this.odd];let residual=Infinity,sweeps=0;
      for(;sweeps<maxSweeps;sweeps++){
        for(let color=0;color<2;color++){const group=groups[color];for(let j=0;j<group.length;j++){
          const q=group[j];if(mask[q]!==EMPTY)continue;const k=q*6,old=p[q],rho=this.feedback?i[q]-e[q]:0;
          const sum=p[n[k]]+p[n[k+1]]+p[n[k+2]]+p[n[k+3]]+p[n[k+4]]+p[n[k+5]]-missing[q]*old;
          p[q]=old+omega*((sum+h*h*rho)*invDegree[q]-old);
        }}
        if((sweeps&7)===7||sweeps===maxSweeps-1){residual=this.residual();if(!Number.isFinite(residual))break;if(residual<=tolerance){sweeps++;break;}}
      }
      this.solveInfo={converged:Number.isFinite(residual)&&residual<=tolerance,residual,sweeps};
      if(this.solveInfo.converged)this.updateField();return this.solveInfo;
    }
    updateField(){
      const {potential:p,mask,neighbors:n,ex,ey,ez,electrons:e,ions:i,h,ionMobility}=this;let maxField=0,maxConductivity=0,maxIonizationRate=0,maxFace=[0,0,0];
      for(let q=0;q<this.count;q++){
        if(mask[q]!==EMPTY){ex[q]=ey[q]=ez[q]=0;continue;}
        const k=q*6;
        ex[q]=-(p[n[k+1]]-p[n[k]])/(2*h);ey[q]=-(p[n[k+3]]-p[n[k+2]])/(2*h);ez[q]=-(p[n[k+5]]-p[n[k+4]])/(2*h);
        const E=Math.hypot(ex[q],ey[q],ez[q]),rate=E>1e-12?E*Math.exp(-1/E):0;
        maxField=Math.max(maxField,E);maxConductivity=Math.max(maxConductivity,e[q]+ionMobility*i[q]);maxIonizationRate=Math.max(maxIonizationRate,rate);
        for(let a=0;a<3;a++)for(let side=0;side<2;side++){const j=n[k+2*a+side];if(j!==q)maxFace[a]=Math.max(maxFace[a],Math.abs(p[j]-p[q])/h);}
      }
      this.maxField=maxField;this.maxConductivity=maxConductivity;this.maxIonizationRate=maxIonizationRate;this.maxFace=maxFace;
    }
    stableStep(){
      const {h,diffusion,ionMobility,ionDiffusion,maxConductivity,maxIonizationRate,maxFace,maxStep}=this;
      const transport=(maxFace[0]+maxFace[1]+maxFace[2])/h+6*diffusion/(h*h);
      const ionTransport=ionMobility*(maxFace[0]+maxFace[1]+maxFace[2])/h+6*ionDiffusion/(h*h);
      // An outflow can occur on both faces of an axis. The factor .42 means
      // the sum of all outgoing drift and diffusion coefficients remains at
      // most .84, even if both faces carry the maximum speed outward.
      const adv=.42/Math.max(transport,ionTransport,1e-12),relax=.35/Math.max(maxConductivity,1e-12),reaction=.22/Math.max(maxIonizationRate,1e-12);
      return Math.min(maxStep,adv,relax,reaction);
    }
    // Conservative upwind advection plus centered diffusion on each shared
    // face. Electrode faces absorb outgoing particles and never emit them.
    step(dt=this.maxStep){
      if(!this.solveInfo.converged)return {ok:false,reason:'unconverged'};
      dt=Math.min(finite(dt,this.maxStep,1e-8,this.maxStep),this.stableStep());
      if(!Number.isFinite(dt)||dt<1e-8)return {ok:false,reason:'time-step'};
      const {potential:p,mask,electrons:e,ions:i,dElectron:de,dIon:di,h,diffusion,ionDiffusion,ionMobility}=this;
      de.fill(0);di.fill(0);let lostE=0,lostI=0;
      const pair=(a,b)=>{
        const ma=mask[a],mb=mask[b];if(ma&&mb)return;
        const E=-(p[b]-p[a])/h,ve=-E,vi=ionMobility*E,ea=ma?0:e[a],eb=mb?0:e[b],ia=ma?0:i[a],ib=mb?0:i[b];
        let fe=ve*(ve>=0?ea:eb)-diffusion*(eb-ea)/h,fi=vi*(vi>=0?ia:ib)-ionDiffusion*(ib-ia)/h;
        if(ma){fe=Math.min(0,fe);fi=Math.min(0,fi);}else if(mb){fe=Math.max(0,fe);fi=Math.max(0,fi);}
        const transferE=dt*fe/h,transferI=dt*fi/h;
        if(!ma){de[a]-=transferE;di[a]-=transferI;}else{lostE-=transferE;lostI-=transferI;}
        if(!mb){de[b]+=transferE;di[b]+=transferI;}else{lostE+=transferE;lostI+=transferI;}
      };
      const {nx,ny,nz}=this;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const a=x+nx*(y+ny*z);if(x+1<nx)pair(a,a+1);if(y+1<ny)pair(a,a+nx);if(z+1<nz)pair(a,a+nx*ny);
      }
      let generated=0;
      for(let q=0;q<this.count;q++)if(mask[q]===EMPTY){
        let ne=e[q]+de[q],ni=i[q]+di[q];
        // No artificial density clipping: a negative value is a numerical
        // failure, except for floating roundoff at an empty cell.
        if(!Number.isFinite(ne)||!Number.isFinite(ni)||ne < -1e-12||ni < -1e-12)return {ok:false,reason:'negative-density'};
        ne=Math.max(0,ne);ni=Math.max(0,ni);const E=Math.hypot(this.ex[q],this.ey[q],this.ez[q]);
        const rate=E>1e-12?E*Math.exp(-1/E):0,birth=ne*Math.expm1(rate*dt);
        de[q]=ne+birth;di[q]=ni+birth;generated+=birth;
        if(!Number.isFinite(de[q])||!Number.isFinite(di[q])||de[q]>1e6||di[q]>1e6)return {ok:false,reason:'density-limit'};
      }
      // Commit only after both transport and the new Poisson solve succeed.
      // A failed solve must not leave a half-updated field or particle state.
      this.savedPotential.set(p);const previousSolve=this.solveInfo;
      this.electrons=de;this.ions=di;this.dElectron=e;this.dIon=i;
      const result=this.solve();
      if(!result.converged){
        this.electrons=e;this.ions=i;this.dElectron=de;this.dIon=di;
        p.set(this.savedPotential);this.solveInfo=previousSolve;
        return {ok:false,reason:'unconverged',dt,...result};
      }
      const cell=h*h*h;this.absorbedE+=lostE*cell;this.absorbedI+=lostI*cell;this.produced+=generated*cell;this.time+=dt;this.steps++;this.lastStep=dt;
      return {ok:true,reason:'',dt,...result};
    }
    totalCharge(){let value=0;for(let q=0;q<this.count;q++)value+=this.ions[q]-this.electrons[q];return value*this.h**3;}
    stats(){
      let emax=0,imax=0,eTotal=0,iTotal=0,ionization=0,tipY=0,peakIndex=0;
      const {electrons:e,ions:i,ex,ey,ez,mask,nx,ny,h}=this;
      for(let q=0;q<this.count;q++)if(mask[q]===EMPTY){
        const ne=e[q],ni=i[q];eTotal+=ne;iTotal+=ni;imax=Math.max(imax,ni);if(ne>emax){emax=ne;peakIndex=q;}
        const E=Math.hypot(ex[q],ey[q],ez[q]);ionization+=ne*(E>1e-12?E*Math.exp(-1/E):0);
      }
      const threshold=emax*.12;
      if(emax>0)for(let q=0;q<this.count;q++)if(mask[q]===EMPTY&&e[q]>=threshold){const y=Math.floor(q/nx)%ny;tipY=Math.max(tipY,y*h);}
      const cell=h**3,q=this.totalCharge(),budget=q-this.initialCharge-this.absorbedE+this.absorbedI;
      return {time:this.time,steps:this.steps,lastStep:this.lastStep,maxElectron:emax,maxIon:imax,electrons:eTotal*cell,ions:iTotal*cell,
        maxField:this.maxField,maxConductivity:this.maxConductivity,ionization:ionization*cell,tipY,peakIndex,charge:q,chargeBudget:budget,
        absorbedElectrons:this.absorbedE,absorbedIons:this.absorbedI,produced:this.produced,residual:this.solveInfo.residual,sweeps:this.solveInfo.sweeps,converged:this.solveInfo.converged};
    }
    snapshot(){return{nx:this.nx,ny:this.ny,nz:this.nz,h:this.h,height:this.height,field:this.field,voltage:this.voltage,diffusion:this.diffusion,ionMobility:this.ionMobility,
      amplitude:this.amplitude,seedRadius:this.seedRadius,sourceX:this.sourceX,sourceZ:this.sourceZ,targetX:this.targetX,targetZ:this.targetZ,rodLength:this.rodLength,feedback:this.feedback,
      electrons:Float32Array.from(this.electrons),ions:Float32Array.from(this.ions),potential:Float32Array.from(this.potential),mask:Uint8Array.from(this.mask),stats:this.stats()};}
  }
  return{Streamer,GRIDS,EMPTY,CATHODE,ANODE};
});
