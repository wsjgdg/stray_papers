/* Snapshot diagnostics for the actual finite/periodic Ising interaction graph.
 * These are descriptive observables, not material parameters or equilibrium proofs. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IsingMicrostructure=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function check(top,spins){
    if(!top||!top.activeIndices||!top.offsets||!spins||spins.length!==top.count)throw new Error('自旋快照与相互作用图不匹配。');
    for(const i of top.activeIndices)if(spins[i]!==1&&spins[i]!==-1)throw new Error('活跃位点的快照自旋须为 ±1。');
  }
  function diagnostics(top,spins){
    check(top,spins);const n=top.count,gauge=new Int8Array(n),parent=new Int32Array(n),parentEdge=new Int32Array(n),depth=new Int32Array(n),queue=new Uint32Array(top.activeIndices.length);
    parent.fill(-1);parentEdge.fill(-1);
    let unsatisfied=0,weight=0,unsatisfiedWeight=0,negative=0,positive=0,conflicts=0,first=null,components=0;
    // Self interactions are counted separately by the graph because they do
    // not enter a flip's local field. They still contribute to the Hamiltonian.
    for(const type of top.interactionTypes){
      if(!type.selfDirected)continue;const c=type.selfDirected,j=type.j;weight+=c*Math.abs(j);
      if(j<0){negative+=c;unsatisfied+=c;unsatisfiedWeight+=c*Math.abs(j);conflicts+=c;if(!first)first={self:true};}else positive+=c;
    }
    for(const i of top.activeIndices)for(let k=top.offsets[i];k<top.offsets[i+1];k++){
      const j=top.couplings[k],bad=j*spins[i]*spins[top.targets[k]]<0;weight+=Math.abs(j);if(j<0)negative++;else positive++;
      if(bad){unsatisfied++;unsatisfiedWeight+=Math.abs(j);}
    }
    // Assign a sign gauge along a spanning forest: τ_i τ_j = sign(J_ij).
    // Every inconsistent non-tree edge closes a negative-product fundamental
    // loop. The count depends on the forest; existence does not.
    for(const start of top.activeIndices){
      if(gauge[start])continue;components++;let head=0,tail=0;queue[tail++]=start;gauge[start]=1;
      while(head<tail){const i=queue[head++];for(let k=top.offsets[i];k<top.offsets[i+1];k++){
        const j=top.targets[k],expected=gauge[i]*(top.couplings[k]>0?1:-1);
        if(!gauge[j]){gauge[j]=expected;parent[j]=i;parentEdge[j]=k;depth[j]=depth[i]+1;queue[tail++]=j;}
      }}
    }
    for(const i of top.activeIndices)for(let k=top.offsets[i];k<top.offsets[i+1];k++){
      const j=top.targets[k];if(gauge[i]*gauge[j]!==Math.sign(top.couplings[k])){conflicts++;if(!first)first={i,j,k};}
    }
    let cycle=null;
    if(first&&first.self){
      const type=top.interactionTypes.find(v=>v.selfDirected&&v.j<0);cycle={length:1,sign:-1,edges:[],self:true,type:{a:type.a,b:type.b,shell:type.shell}};
    }else if(first){
      let a=first.i,b=first.j;const left=[],right=[];
      const push=(list,child)=>{const p=parent[child],k=parentEdge[child];list.push({from:p,to:child,wrapped:!!top.wrapped[k],j:top.couplings[k]});return p;};
      while(depth[a]>depth[b])a=push(left,a);while(depth[b]>depth[a])b=push(right,b);
      while(a!==b){a=push(left,a);b=push(right,b);}
      const closing={from:first.i,to:first.j,wrapped:!!top.wrapped[first.k],j:top.couplings[first.k]},edges=[...left,...right.reverse(),closing];
      cycle={length:edges.length,sign:edges.reduce((v,e)=>v*Math.sign(e.j),1),edges,self:false};
    }
    const bonds=(negative+positive)/2,allAntiferromagnetic=negative>0&&positive===0,compatible=conflicts===0;
    let staggered=null;
    if(allAntiferromagnetic&&compatible&&components===1){let sum=0;for(const i of top.activeIndices)sum+=gauge[i]*spins[i];staggered=sum/top.activeIndices.length;}
    return {bonds,unsatisfiedBonds:unsatisfied/2,satisfiedFraction:bonds?1-unsatisfied/(2*bonds):null,
      unsatisfiedWeightFraction:weight?unsatisfiedWeight/weight:null,negativeBonds:negative/2,positiveBonds:positive/2,
      frustratedFundamentalLoops:conflicts/2,signCompatible:compatible,components,allAntiferromagnetic,
      staggeredMagnetization:staggered,absStaggered:staggered==null?null:Math.abs(staggered),cycle,gauge};
  }
  function clusters(top,spins){
    check(top,spins);const labels=new Uint32Array(top.count),queue=new Uint32Array(top.activeIndices.length),groups=[];let id=0;
    for(const start of top.activeIndices){
      if(labels[start])continue;id++;let head=0,tail=0;labels[start]=id;queue[tail++]=start;
      while(head<tail){const i=queue[head++];for(let k=top.offsets[i];k<top.offsets[i+1];k++){const j=top.targets[k];if(!labels[j]&&spins[j]===spins[i]){labels[j]=id;queue[tail++]=j;}}}
      groups.push({temporary:id,spin:spins[start],size:tail,first:start});
    }
    groups.sort((a,b)=>b.size-a.size||a.first-b.first);const remap=new Uint32Array(id+1);
    groups.forEach((v,i)=>{remap[v.temporary]=i+1;v.id=i+1;v.fraction=v.size/top.activeIndices.length;delete v.temporary;});
    for(const i of top.activeIndices)labels[i]=remap[labels[i]];
    return {labels,groups,count:groups.length,largest:groups[0]||null,spinCount:top.activeIndices.length};
  }
  function correlations(top,spins,maxDistance=8){
    check(top,spins);if(!Number.isInteger(maxDistance)||maxDistance<0||maxDistance>16)throw new Error('关联距离须在 0–16 之间。');
    const n=top.size,S=top.siteCount,limit=Math.min(maxDistance,top.periodic?Math.floor(n/2):n-1),out=[];
    let m=0;for(const i of top.activeIndices)m+=spins[i];m/=top.activeIndices.length;
    for(let d=0;d<=limit;d++){
      const axes=[];for(let axis=0;axis<3;axis++){
        let sum=0,count=0;for(const i of top.activeIndices){
          const site=i%S,cell=Math.floor(i/S),xyz=[cell%n,Math.floor(cell/n)%n,Math.floor(cell/(n*n))];xyz[axis]+=d;
          if(!top.periodic&&xyz[axis]>=n)continue;xyz[axis]%=n;
          const j=(xyz[0]+n*xyz[1]+n*n*xyz[2])*S+site;if(!top.spinActive[j])continue;sum+=spins[i]*spins[j];count++;
        }
        const value=count?sum/count:null;axes.push({axis:'abc'[axis],count,value,connected:value==null?null:value-m*m});
      }out.push({distance:d,axes});
    }return {magnetization:m,points:out};
  }
  function structureFactor(top,spins,options={}){
    check(top,spins);const {radius=4,span=.5}=options;
    if(!Number.isInteger(radius)||radius<1||radius>5||!Number.isFinite(span)||span<=0||span>2)throw new Error('倒空间网格或范围无效。');
    const total=(2*radius+1)**3;if(total*top.activeIndices.length>24000000)throw new Error('倒空间计算预算过大，请缩小样品或网格。');
    const n=top.size,S=top.siteCount,N=top.activeIndices.length,frac=new Float64Array(N*3),values=new Int8Array(N),reciprocal=top.crystal.vectors.reciprocal;
    for(let k=0;k<N;k++){const i=top.activeIndices[k],site=i%S,cell=Math.floor(i/S),f=top.crystal.sites[site].fraction;frac[k*3]=cell%n+f[0];frac[k*3+1]=Math.floor(cell/n)%n+f[1];frac[k*3+2]=Math.floor(cell/(n*n))+f[2];values[k]=spins[i];}
    const points=[];let peak=0,peakIndex=0;
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)for(let c=-radius;c<=radius;c++){
      const h=a*span/radius,k=b*span/radius,l=c*span/radius;let re=0,im=0;
      for(let i=0;i<N;i++){const phase=2*Math.PI*(h*frac[3*i]+k*frac[3*i+1]+l*frac[3*i+2]);re+=values[i]*Math.cos(phase);im+=values[i]*Math.sin(phase);}
      const intensity=(re*re+im*im)/N,q=[0,1,2].map(i=>2*Math.PI*(h*reciprocal[0][i]+k*reciprocal[1][i]+l*reciprocal[2][i]));
      if(intensity>peak){peak=intensity;peakIndex=points.length;}points.push({h,k,l,q,intensity});
    }
    return {points,peak,peakIndex,spinCount:N,radius,span};
  }
  return {diagnostics,clusters,correlations,structureFactor};
});
