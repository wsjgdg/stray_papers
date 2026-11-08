/* Three-dimensional, quasistatic dielectric-breakdown growth model.
 * The discharge is a conductor at phi=0; a separate electrode is fixed at
 * phi=1. Top and bottom plates are fixed at 0 and 1; the four side walls are
 * insulating. Other cells satisfy a weighted graph approximation of Laplace
 * equation. A growth bond is sampled with probability proportional to its
 * local bond field raised to eta. The graph
 * uses six face and twelve edge-diagonal neighbours with weights 1 and 1/2.
 * This is a stochastic pattern-formation model, NOT a plasma solver.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LightningModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const EMPTY=0, CHANNEL=1, TARGET=2, SOURCE=3;
  const DIRECTIONS=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],
    [-1,-1,0],[-1,1,0],[1,-1,0],[1,1,0],[-1,0,-1],[-1,0,1],[1,0,-1],[1,0,1],
    [0,-1,-1],[0,-1,1],[0,1,-1],[0,1,1]];
  const NDIR=18;
  const GRIDS=Object.freeze({quick:{nx:17,ny:25,nz:17},standard:{nx:25,ny:37,nz:25},fine:{nx:33,ny:49,nz:33},ultra:{nx:41,ny:61,nz:41}});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function int(value, fallback, min, max) {
    value=Number(value);
    return Number.isFinite(value) ? clamp(Math.round(value),min,max) : fallback;
  }
  function real(value, fallback, min, max) {
    value=Number(value);
    return Number.isFinite(value) ? clamp(value,min,max) : fallback;
  }
  function RNG(seed) { this.state=(Number(seed)>>>0)||0x6d2b79f5; }
  RNG.prototype.next=function() {
    let t=this.state=(this.state+0x6d2b79f5)>>>0;
    t=Math.imul(t^(t>>>15),t|1);
    t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
  class Discharge {
    constructor(options={}) {
      const size=GRIDS[options.quality]||GRIDS.standard;
      this.quality=GRIDS[options.quality]?options.quality:'standard';
      this.nx=int(options.nx,size.nx,7,41);this.ny=int(options.ny,size.ny,9,61);this.nz=int(options.nz,size.nz,7,41);
      this.count=this.nx*this.ny*this.nz;this.h=1/(this.ny-1);
      this.eta=real(options.eta,2.4,0,8);
      this.seed=(Number(options.seed)>>>0)||1;this.random=new RNG(this.seed);
      // Physical dimensions are fractions of the plate spacing; the voxelized
      // surface changes with h. A margin prevents the body clipping side walls.
      this.electrodeShape=options.electrodeShape==='blunt'?'blunt':'needle';
      this.electrodeLength=real(options.electrodeLength,.11,.08,.20);
      this.electrodeRadius=real(options.electrodeRadius,.03,.02,.10);
      const margin=Math.max(2,Math.ceil(this.electrodeRadius/this.h));
      if(2*margin>this.nx-1||2*margin>this.nz-1)throw Error('电极半径超过计算域侧向尺寸');
      this.sourceX=int(options.sourceX,Math.floor(this.nx/2),margin,this.nx-1-margin);
      this.sourceZ=int(options.sourceZ,Math.floor(this.nz/2),margin,this.nz-1-margin);
      this.targetX=int(options.targetX,Math.floor(this.nx/2),margin,this.nx-1-margin);
      this.targetZ=int(options.targetZ,Math.floor(this.nz/2),margin,this.nz-1-margin);
      this.tolerance=real(options.tolerance,1e-5,1e-7,1e-2);
      this.maxSweeps=int(options.maxSweeps,1600,1,10000);
      // The largest grid benefits from a less aggressive relaxation in measured
      // event solves. Residual checking and the discrete equation are unchanged.
      this.omega=real(options.omega,this.quality==='ultra'?1.75:1.86,1,1.95);
      this.potential=new Float64Array(this.count);this.mask=new Uint8Array(this.count);
      this.neighbors=new Int32Array(this.count*NDIR);this.invDegree=new Float64Array(this.count);
      this.missing=new Float64Array(this.count);this.even=[];this.odd=[];
      this.frontier=[];this.frontierPos=new Int32Array(this.count);this.frontierPos.fill(-1);
      this.links=new Uint8Array(this.count);this.children=new Uint16Array(this.count);
      this.parent=new Int32Array(this.count);this.parent.fill(-1);
      this.seedMask=new Uint8Array(this.count);this.seedChildren=null;this.seedSegmentCount=0;this.sourceBody=[];this.targetBody=[];
      this.segments=[];this.channelCount=0;this.steps=0;this.complete=false;
      this.lastChoice=null;this.solveInfo={converged:false,residual:Infinity,sweeps:0};
      this._initGrid();
    }
    index(x,y,z){return x+this.nx*(y+this.ny*z);}
    coords(i){const x=i%this.nx,j=(i-x)/this.nx,y=j%this.ny,z=(j-y)/this.ny;return {x,y,z};}
    _initGrid() {
      const {nx,ny,nz,neighbors,potential,mask,invDegree,missing}=this;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const i=this.index(x,y,z),k=i*NDIR;let degree=0,omitted=0;
        for(let j=0;j<NDIR;j++){
          const d=DIRECTIONS[j],xx=x+d[0],yy=y+d[1],zz=z+d[2],weight=j<6?1:.5;
          if(xx>=0&&xx<nx&&yy>=0&&yy<ny&&zz>=0&&zz<nz){neighbors[k+j]=this.index(xx,yy,zz);degree+=weight;}
          else{neighbors[k+j]=i;omitted+=weight;}
        }
        missing[i]=omitted;invDegree[i]=1/degree;
        potential[i]=y/(ny-1);
        ((x+y+z)&1?this.odd:this.even).push(i);
      }
      this.even=Int32Array.from(this.even);this.odd=Int32Array.from(this.odd);
      // Two equipotential plates with independently movable protruding tips.
      // Side walls are insulating. The plates and both needles are actual
      // boundary conditions; only the designated negative tip seeds growth.
      for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
        let i=this.index(x,0,z);mask[i]=SOURCE;potential[i]=0;
        i=this.index(x,ny-1,z);mask[i]=TARGET;potential[i]=1;
      }
      this.rodLength=Math.max(1,Math.round(this.electrodeLength/this.h));
      const rodPhysical=this.rodLength*this.h,radius=this.electrodeRadius,cap=Math.min(radius,rodPhysical);
      // The same target length and radius are used at every grid spacing. Each
      // voxel center inside a cone or capped cylinder becomes an actual fixed
      // potential cell. The surface is necessarily stair-stepped at finite h.
      const within=(dx,dz,d)=>{
        let r;if(this.electrodeShape==='needle')r=radius*Math.max(0,1-d/rodPhysical);
        else if(d<=rodPhysical-cap)r=radius;
        else {const u=(d-(rodPhysical-cap))/cap;r=radius*Math.sqrt(Math.max(0,1-u*u));}
        return Math.hypot(dx*this.h,dz*this.h)<=r+1e-12;
      };
      const reach=Math.ceil(radius/this.h),sourceSet=new Uint8Array(this.count);
      for(let d=1;d<=this.rodLength;d++)for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++)if(within(dx,dz,d*this.h)){
        const si=this.index(this.sourceX+dx,d,this.sourceZ+dz),ti=this.index(this.targetX+dx,ny-1-d,this.targetZ+dz);
        sourceSet[si]=1;mask[ti]=TARGET;potential[ti]=1;this.targetBody.push(ti);
      }
      const root=this.index(this.sourceX,0,this.sourceZ);sourceSet[root]=1;this.sourceBody.push(root);
      this.targetBody.push(this.index(this.targetX,ny-1,this.targetZ));
      mask[root]=CHANNEL;potential[root]=0;this.channelCount=1;this._exposeNeighbors(root);
      // Seed the centerline first, preserving the classic one-cell needle.
      let previous=root;
      for(let y=1;y<=this.rodLength;y++){
        const i=this.index(this.sourceX,y,this.sourceZ);this._appendChannel(i,previous);this.sourceBody.push(i);previous=i;
      }
      // Attach every other conductor voxel to the connected seed scaffold.
      // It is bookkeeping inside one equipotential electrode, not a discharge.
      for(let q=0;q<this.sourceBody.length;q++){
        const parent=this.sourceBody[q],k=parent*NDIR;
        for(let j=0;j<NDIR;j++){
          const i=neighbors[k+j];if(i!==parent&&sourceSet[i]&&mask[i]!==CHANNEL){this._appendChannel(i,parent);this.sourceBody.push(i);}
        }
      }
      for(const i of this.sourceBody)this.seedMask[i]=1;
      this.seedChildren=Uint16Array.from(this.children);this.seedSegmentCount=this.segments.length/2;
      this.sourceBody=Int32Array.from(this.sourceBody);this.targetBody=Int32Array.from(this.targetBody);
      // Electrode scaffold cells are not stochastic growth events.
      this.steps=0;
    }
    _exposeNeighbors(i){
      const k=i*NDIR,n=this.neighbors;
      for(let d=0;d<NDIR;d++){
        const j=n[k+d];if(j===i||this.mask[j]===CHANNEL||this.mask[j]===SOURCE)continue;
        if(this.links[j]===0){this.frontierPos[j]=this.frontier.length;this.frontier.push(j);}
        this.links[j]++;
      }
    }
    _removeFrontier(i) {
      const pos=this.frontierPos[i];if(pos<0)return;
      const last=this.frontier.pop();
      if(pos<this.frontier.length){this.frontier[pos]=last;this.frontierPos[last]=pos;}
      this.frontierPos[i]=-1;this.links[i]=0;
    }
    _appendChannel(i,parent) {
      this._removeFrontier(i);this.mask[i]=CHANNEL;this.potential[i]=0;
      this.parent[i]=parent;this.children[parent]++;this.segments.push(parent,i);this.channelCount++;
      this._exposeNeighbors(i);
    }
    // Residual is the maximum difference between a cell and the weighted mean
    // of its graph neighbours; omitted side-wall bonds give zero normal flux.
    // In scaled units this is the local graph Laplace residual / weighted degree.
    // The two parity groups are a fixed SOR ordering, not independent colors:
    // diagonal neighbours in the same group are updated sequentially.
    residual() {
      const {potential:p,mask,neighbors:n,missing,invDegree}=this;let max=0;
      for(let i=0;i<this.count;i++)if(mask[i]===EMPTY){
        const k=i*NDIR,old=p[i];
        const sum=p[n[k]]+p[n[k+1]]+p[n[k+2]]+p[n[k+3]]+p[n[k+4]]+p[n[k+5]]
          +.5*(p[n[k+6]]+p[n[k+7]]+p[n[k+8]]+p[n[k+9]]+p[n[k+10]]+p[n[k+11]]+p[n[k+12]]+p[n[k+13]]+p[n[k+14]]+p[n[k+15]]+p[n[k+16]]+p[n[k+17]])-missing[i]*old;
        max=Math.max(max,Math.abs(sum*invDegree[i]-old));
      }
      return max;
    }
    solve(maxSweeps=this.maxSweeps,tolerance=this.tolerance) {
      maxSweeps=int(maxSweeps,this.maxSweeps,1,10000);tolerance=real(tolerance,this.tolerance,1e-7,1e-2);
      const {potential:p,mask,neighbors:n,missing,invDegree,omega}=this,groups=[this.even,this.odd];
      let residual=Infinity,sweeps=0;
      for(;sweeps<maxSweeps;sweeps++){
        for(let color=0;color<2;color++){
          const group=groups[color];
          for(let v=0;v<group.length;v++){
            const i=group[v];if(mask[i]!==EMPTY)continue;
            const k=i*NDIR,old=p[i],sum=p[n[k]]+p[n[k+1]]+p[n[k+2]]+p[n[k+3]]+p[n[k+4]]+p[n[k+5]]
              +.5*(p[n[k+6]]+p[n[k+7]]+p[n[k+8]]+p[n[k+9]]+p[n[k+10]]+p[n[k+11]]+p[n[k+12]]+p[n[k+13]]+p[n[k+14]]+p[n[k+15]]+p[n[k+16]]+p[n[k+17]])-missing[i]*old;
            p[i]=old+omega*(sum*invDegree[i]-old);
          }
        }
        if((sweeps&7)===7||sweeps===maxSweeps-1){
          residual=this.residual();
          if(!Number.isFinite(residual)){this.solveInfo={converged:false,residual,sweeps:sweeps+1};return this.solveInfo;}
          if(residual<=tolerance){sweeps++;break;}
        }
      }
      this.solveInfo={converged:residual<=tolerance,residual,sweeps};return this.solveInfo;
    }
    candidates() {
      if(this.complete)return {ids:new Int32Array(0),probabilities:new Float32Array(0),drops:new Float32Array(0),faceLinks:new Uint8Array(0),diagonalLinks:new Uint8Array(0),total:0};
      const count=this.frontier.length,ids=new Int32Array(count),probabilities=new Float32Array(count),drops=new Float32Array(count);
      const faceLinks=new Uint8Array(count),diagonalLinks=new Uint8Array(count),diagonalFactor=Math.pow(Math.SQRT1_2,this.eta);
      let total=0,maxDrop=0;
      for(let k=0;k<count;k++){
        const i=this.frontier[k],drop=clamp(this.potential[i],0,1);ids[k]=i;drops[k]=drop;maxDrop=Math.max(maxDrop,drop);
        for(let d=0;d<NDIR;d++){const j=this.neighbors[i*NDIR+d];if(j!==i&&this.mask[j]===CHANNEL){if(d<6)faceLinks[k]++;else diagonalLinks[k]++;}}
      }
      // A face bond has length h, an edge-diagonal has length sqrt(2) h.
      // Sum their individual probabilities for each candidate site. Common
      // voltage and h factors cancel in the normalized distribution.
      for(let k=0;k<count;k++){
        const factor=faceLinks[k]+diagonalLinks[k]*diagonalFactor;
        const weight=factor*(this.eta===0?1:Math.pow(maxDrop?drops[k]/maxDrop:0,this.eta));
        probabilities[k]=weight;total+=weight;
      }
      if(total>0)for(let k=0;k<count;k++)probabilities[k]/=total;
      return {ids,probabilities,drops,faceLinks,diagonalLinks,total};
    }
    step() {
      if(this.complete)return {ok:false,reason:'complete'};
      if(!this.solveInfo.converged)return {ok:false,reason:'unconverged'};
      const all=this.candidates();if(!(all.total>0))return {ok:false,reason:'no-growth'};
      const ticket=this.random.next();let sum=0,choice=all.ids.length-1;
      for(let k=0;k<all.ids.length;k++){sum+=all.probabilities[k];if(ticket<sum){choice=k;break;}}
      const i=all.ids[choice],parents=[],base=i*NDIR,diagonalFactor=Math.pow(Math.SQRT1_2,this.eta);let parentWeight=0;
      for(let d=0;d<NDIR;d++){
        const j=this.neighbors[base+d];if(j!==i&&this.mask[j]===CHANNEL){const weight=d<6?1:diagonalFactor;parents.push({index:j,weight,distance:d<6?1:Math.SQRT2});parentWeight+=weight;}
      }
      if(!parents.length)return {ok:false,reason:'no-parent'};
      let draw=this.random.next()*parentWeight,chosen=parents[parents.length-1];
      for(const parent of parents){draw-=parent.weight;if(draw<0){chosen=parent;break;}}
      const parent=chosen.index;
      this.lastChoice={site:i,parent,probability:all.probabilities[choice],drop:all.drops[choice],distance:chosen.distance,connections:parents.length};
      if(this.mask[i]===TARGET){
        this.segments.push(parent,i);this.parent[i]=parent;this.children[parent]++;this.complete=true;this.steps++;
        // Once electrodes touch, the opposing Dirichlet boundary values are
        // incompatible: stop BEFORE another electrostatic solve.
        return {ok:true,complete:true,converged:true};
      }
      this._appendChannel(i,parent);this.steps++;
      const info=this.solve();
      return {ok:info.converged,reason:info.converged?'':'unconverged',complete:false,...info};
    }
    stats() {
      let junctions=0,tips=0;
      for(let i=0;i<this.count;i++)if(this.mask[i]===CHANNEL){
        const grownChildren=this.children[i]-(this.seedMask[i]?this.seedChildren[i]:0);
        if(grownChildren>1)junctions++;if(!this.seedMask[i]&&grownChildren===0)tips++;
      }
      return {steps:this.steps,channelCount:this.channelCount,junctions,tips,frontier:this.complete?0:this.frontier.length,
        complete:this.complete,residual:this.solveInfo.residual,sweeps:this.solveInfo.sweeps,converged:this.solveInfo.converged};
    }
    snapshot() {
      const c=this.candidates();
      return {nx:this.nx,ny:this.ny,nz:this.nz,h:this.h,eta:this.eta,seed:this.seed,rodLength:this.rodLength,
        sourceX:this.sourceX,sourceZ:this.sourceZ,targetX:this.targetX,targetZ:this.targetZ,
        electrodeShape:this.electrodeShape,electrodeLength:this.electrodeLength,electrodeRadius:this.electrodeRadius,seedSegmentCount:this.seedSegmentCount,
        sourceBody:Int32Array.from(this.sourceBody),targetBody:Int32Array.from(this.targetBody),
        potential:Float32Array.from(this.potential),mask:Uint8Array.from(this.mask),segments:Int32Array.from(this.segments),
        candidateIds:c.ids,probabilities:c.probabilities,drops:c.drops,faceLinks:c.faceLinks,diagonalLinks:c.diagonalLinks,
        links:Uint8Array.from(this.links),stats:this.stats(),lastChoice:this.lastChoice};
    }
  }
  return {Discharge,GRIDS,EMPTY,CHANNEL,TARGET,SOURCE,RNG,DIRECTIONS,NDIR};
});
