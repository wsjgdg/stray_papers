/* A finite Ising graph built from a periodic crystal unit cell.
 * All interactions and magnetic-site choices are adjustable teaching
 * assumptions, not measured material parameters or real-time dynamics. */
(function (root, factory) {
  'use strict';
  const C=typeof module==='object'&&module.exports?require('./crystal-model.js'):root.CrystalGeometry;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CrystalIsing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const WINDOW=256, MAX_ATOMS=16000, MAX_EDGES=600000;
  const mod=(x,n)=>(x%n+n)%n;
  function createTopology(options={}) {
    if(!C)throw new Error('晶体几何资源不可用。');
    const {structure,size=8,cutoff=1.08,jSame=1,jDifferent=1,shape='periodic',pairRules=[]}=options;
    if(!Number.isInteger(size)||size<2||size>32)throw new Error('每方向重复数须为 2–32。');
    if(!Number.isFinite(jSame)||!Number.isFinite(jDifferent)||Math.abs(jSame)>2||Math.abs(jDifferent)>2)throw new Error('耦合 J 须在 −2 到 2 之间。');
    if(!['periodic','box','sphere','cylinder','hex'].includes(shape))throw new Error('未知边界或样品形状。');
    const periodic=shape==='periodic',crystal=C.build(structure,cutoff),sites=crystal.sites,siteCount=sites.length,cells=size**3,count=cells*siteCount;
    if(count>MAX_ATOMS)throw new Error('结构点位过多，请减少晶胞重复数（最多 '+MAX_ATOMS+' 个点位）。');
    const species=[...new Set(sites.map(s=>s.element))];
    const active=options.activeSpecies==null?species.slice():options.activeSpecies;
    if(!Array.isArray(active)||!active.length||new Set(active).size!==active.length||active.some(s=>!species.includes(s)))throw new Error('至少选择一个有效的活跃自旋组元。');
    const enabled=new Set(active),siteActive=sites.map(s=>enabled.has(s.element)),present=new Uint8Array(count),spinActive=new Uint8Array(count);
    // Shells are globally ranked geometric distances, not material exchange
    // constants or pair-specific bond lengths. Symmetric pair rules override
    // the same/different defaults. Rules beyond the current cutoff persist but
    // are inactive until that shell is included again.
    const pair=(a,b)=>a<=b?[a,b]:[b,a],key=(a,b,shell)=>pair(a,b).join('|')+'|'+shell;
    if(!Array.isArray(pairRules)||pairRules.length>256)throw new Error('耦合规则须为至多 256 项的数组。');
    const ruleMap=new Map(),normalizedRules=[];
    for(const r of pairRules){
      if(!r||!species.includes(r.a)||!species.includes(r.b)||!Number.isInteger(r.shell)||r.shell<1||r.shell>256||!Number.isFinite(r.j)||Math.abs(r.j)>2)throw new Error('耦合规则的组元、壳层或 J 无效。');
      const [a,b]=pair(r.a,r.b),k=key(a,b,r.shell);if(ruleMap.has(k))throw new Error('同一组元对和壳层不能重复设置。');
      ruleMap.set(k,r.j);normalizedRules.push({a,b,shell:r.shell,j:r.j});
    }
    normalizedRules.sort((a,b)=>a.shell-b.shell||a.a.localeCompare(b.a)||a.b.localeCompare(b.b));
    const rawDistances=crystal.neighbors.flatMap(row=>row.map(e=>e.distance)).sort((a,b)=>a-b),shellDistances=[];
    for(const d of rawDistances)if(!shellDistances.length||Math.abs(d-shellDistances[shellDistances.length-1])>Math.max(1e-8,crystal.nearest*1e-6))shellDistances.push(d);
    function shellOf(d){for(let i=0;i<shellDistances.length;i++)if(Math.abs(d-shellDistances[i])<=Math.max(1e-8,crystal.nearest*1e-6))return i+1;throw new Error('无法识别邻接距离壳层。');}
    const typeMap=new Map(),interactionTypes=[];
    for(let s=0;s<siteCount;s++)for(const edge of crystal.neighbors[s]){
      const a=sites[s].element,b=sites[edge.site].element,shell=shellOf(edge.distance),k=key(a,b,shell);if(typeMap.has(k))continue;
      const names=pair(a,b),j=ruleMap.has(k)?ruleMap.get(k):(a===b?jSame:jDifferent),item={a:names[0],b:names[1],shell,distance:shellDistances[shell-1],j,directed:0,selfDirected:0};
      typeMap.set(k,interactionTypes.length);interactionTypes.push(item);
    }
    // Preserve stable indices in the adjacency, independent of display order.

    // All finite specimens fit within the parallelepiped.  The minimum
    // distance from its centre to a face is n/(2 |b_i|), where b_i are
    // reciprocal covectors without 2π. Cylinder/prism fit in that sphere.
    const center=C.point(crystal.vectors,[size/2,size/2,size/2]),inscribed=.92*size/(2*Math.max(...crystal.vectors.reciprocal.map(v=>Math.hypot(...v))));
    const radius=shape==='sphere'?inscribed:inscribed/Math.SQRT2,halfHeight=radius;
    const shapeData={type:shape,center,radius,halfHeight};let presentCount=0,activeCount=0;
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let s=0;s<siteCount;s++){
      const i=(x+size*y+size*size*z)*siteCount+s,f=sites[s].fraction;
      let inside=true;
      if(!periodic&&shape!=='box'){
        const p=C.point(crystal.vectors,[x+f[0],y+f[1],z+f[2]]),dx=p[0]-center[0],dy=p[1]-center[1],dz=p[2]-center[2],eps=1e-10;
        if(shape==='sphere')inside=dx*dx+dy*dy+dz*dz<=radius*radius+eps;
        else if(shape==='cylinder')inside=dx*dx+dy*dy<=radius*radius+eps&&Math.abs(dz)<=halfHeight+eps;
        else inside=Math.abs(dx)<=Math.sqrt(3)*radius/2+eps&&Math.abs(dy)<=radius-Math.abs(dx)/Math.sqrt(3)+eps&&Math.abs(dz)<=halfHeight+eps;
      }
      if(inside){present[i]=1;presentCount++;if(siteActive[s]){spinActive[i]=1;activeCount++;}}
    }
    if(!activeCount)throw new Error('样品内没有活跃自旋；请选择更大晶胞重复数或其他组元。');
    const templates=sites.map(()=>[]),selfJ=new Float64Array(siteCount),selfDirected=new Uint32Array(siteCount),selfAbs=new Float64Array(siteCount),selfBySite=sites.map(()=>[]);
    for(let s=0;s<siteCount;s++){
      if(!siteActive[s])continue;
      for(const edge of crystal.neighbors[s]){
        if(!siteActive[edge.site])continue;
        const shell=shellOf(edge.distance),type=typeMap.get(key(sites[s].element,sites[edge.site].element,shell)),j=interactionTypes[type].j;
        if(j===0)continue;
        // A periodic translated copy can collapse to the same spin. Such
        // self-terms are constant and must not enter the flip local field.
        if(periodic&&edge.site===s&&edge.offset.every(v=>mod(v,size)===0)){
          selfJ[s]+=j/2;selfDirected[s]++;selfAbs[s]+=Math.abs(j);selfBySite[s].push(type);continue;
        }
        templates[s].push({site:edge.site,offset:edge.offset,j,type});
      }
    }
    const offsets=new Uint32Array(count+1),activeIndices=new Uint32Array(activeCount),surface=new Uint8Array(count);
    let edges=0,activeCursor=0,selfEnergy=0,selfEdges=0,absWeight=0,surfaceCount=0,surfaceSpinCount=0,maxDegree=0;
    function target(x,y,z,e){
      const X=x+e.offset[0],Y=y+e.offset[1],Z=z+e.offset[2];
      if(!periodic&&(X<0||X>=size||Y<0||Y>=size||Z<0||Z>=size))return -1;
      return (mod(X,size)+size*mod(Y,size)+size*size*mod(Z,size))*siteCount+e.site;
    }
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let s=0;s<siteCount;s++){
      const i=(x+size*y+size*size*z)*siteCount+s;offsets[i]=edges;if(!present[i])continue;
      if(!periodic){let missing=false;for(const e of crystal.neighbors[s]){const j=target(x,y,z,e);if(j<0||!present[j]){missing=true;break;}}if(missing){surface[i]=1;surfaceCount++;if(spinActive[i])surfaceSpinCount++;}}
      if(!spinActive[i])continue;activeIndices[activeCursor++]=i;selfEnergy-=selfJ[s];selfEdges+=selfDirected[s];absWeight+=selfAbs[s];for(const type of selfBySite[s])interactionTypes[type].selfDirected++;
      let degree=0;for(const e of templates[s]){const j=target(x,y,z,e);if(j>=0&&spinActive[j]){edges++;degree++;absWeight+=Math.abs(e.j);interactionTypes[e.type].directed++;}}
      maxDegree=Math.max(maxDegree,degree);
      if(edges>MAX_EDGES)throw new Error('当前晶胞和截断产生的相互作用过多，请减少重复数或收窄截断（最多 '+MAX_EDGES+' 条有向邻接）。');
    }
    offsets[count]=edges;
    const targets=new Uint32Array(edges),couplings=new Float64Array(edges),wrapped=new Uint8Array(edges),edgeTypes=new Uint16Array(edges);
    let cursor=0;
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let s=0;s<siteCount;s++){
      const i=(x+size*y+size*size*z)*siteCount+s;if(!spinActive[i])continue;
      for(const e of templates[s]){
        const j=target(x,y,z,e);if(j<0||!spinActive[j])continue;
        targets[cursor]=j;couplings[cursor]=e.j;edgeTypes[cursor]=e.type;
        const X=x+e.offset[0],Y=y+e.offset[1],Z=z+e.offset[2];wrapped[cursor]=Number(periodic&&(X<0||X>=size||Y<0||Y>=size||Z<0||Z>=size));cursor++;
      }
    }
    const bondCount=(edges+selfEdges)/2;
    if(!Number.isInteger(bondCount))throw new Error('邻接不成对，请调整结构参数。');
    const visited=new Uint8Array(count),queue=new Uint32Array(activeIndices.length);
    let components=0,largest=0;
    for(const start of activeIndices){
      if(visited[start])continue;components++;let head=0,tail=0;visited[start]=1;queue[tail++]=start;
      while(head<tail){const i=queue[head++];for(let k=offsets[i];k<offsets[i+1];k++){const j=targets[k];if(!visited[j]){visited[j]=1;queue[tail++]=j;}}}
      largest=Math.max(largest,tail);
    }
    return {crystal,size,count,siteCount,cells,species,activeSpecies:active.slice(),siteActive,present,spinActive,presentCount,surface,surfaceCount,surfaceSpinCount,shape,shapeData,periodic,activeIndices,
      offsets,targets,couplings,wrapped,edgeTypes,interactionTypes,shellDistances,pairRules:normalizedRules,maxDegree,bondCount,selfEdges,selfEnergy,components,largest,
      meanDegree:(edges+selfEdges)/activeCount,meanAbsField:absWeight/activeCount,cutoff,jSame,jDifferent};
  }
  function interfaces(top,spins){
    if(!top||!spins||spins.length!==top.count)throw new Error('自旋数量与晶体图不匹配。');
    const mask=new Uint8Array(top.count),opposite=new Uint16Array(top.count);let sites=0,directed=0;
    for(const i of top.activeIndices){
      const spin=spins[i];if(spin!==1&&spin!==-1)throw new Error('活跃自旋必须为 +1 或 −1。');let local=0;
      for(let k=top.offsets[i];k<top.offsets[i+1];k++)if(spins[top.targets[k]]!==spin)local++;
      opposite[i]=local;directed+=local;if(local){mask[i]=1;sites++;}
    }
    const bonds=directed/2;if(!Number.isInteger(bonds))throw new Error('周期邻接不成对。');
    return {mask,opposite,sites,bonds,count:top.activeIndices.length,siteFraction:sites/top.activeIndices.length,
      bondFraction:top.bondCount?bonds/top.bondCount:null};
  }
  class IsingCrystal {
    constructor(options={}){
      const {temperature=4.51,field=0,seed=20261031,initial='random'}=options;
      if(!Number.isFinite(temperature)||temperature<.25||temperature>20)throw new Error('温度必须在 0.25–20 之间。');
      if(!Number.isFinite(field)||field< -5||field>5)throw new Error('外场必须在 −5–5 之间。');
      if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('随机种子无效。');
      if(!['random','up','down','domains'].includes(initial))throw new Error('未知初始排列。');
      this.topology=createTopology(options);const top=this.topology;
      this.size=top.size;this.count=top.count;this.spinCount=top.activeIndices.length;this.temperature=temperature;this.field=field;this.seed=seed;this.rngState=seed>>>0;this.initial=initial;
      this.spins=new Int8Array(top.count);
      if(options.spins!=null){
        if(options.spins.length!==top.count)throw new Error('初始自旋数量不匹配。');
        for(let i=0;i<top.count;i++){
          const expected=top.spinActive[i],s=options.spins[i];
          if(expected?(s!==1&&s!==-1):s!==0)throw new Error('活跃点位须为 ±1，非活跃点位须为 0。');this.spins[i]=s;
        }
      }else for(const i of top.activeIndices){
        const cell=Math.floor(i/top.siteCount),x=cell%top.size;
        this.spins[i]=initial==='up'?1:initial==='down'?-1:initial==='domains'?(x<top.size/2?1:-1):this.random()<.5?-1:1;
      }
      this.spinSum=0;for(const i of top.activeIndices)this.spinSum+=this.spins[i];
      this.energy=this.recomputeEnergy();this.sweeps=0;this.lastAttempts=0;this.lastAccepted=0;this.manualFlips=0;
      this.sampleM=new Float64Array(WINDOW);this.sampleE=new Float64Array(WINDOW);this.sampleCount=0;this.sampleCursor=0;
    }
    random(){this.rngState=(this.rngState+0x6d2b79f5)>>>0;let t=this.rngState;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
    checkIndex(i){if(!Number.isInteger(i)||i<0||i>=this.count)throw new Error('位置不在晶格内。');}
    sums(i){const t=this.topology,s=this.spins;let weighted=0,raw=0;for(let k=t.offsets[i];k<t.offsets[i+1];k++){const v=s[t.targets[k]];raw+=v;weighted+=t.couplings[k]*v;}return {weighted,raw};}
    local(i){
      this.checkIndex(i);const t=this.topology,site=i%t.siteCount,cell=Math.floor(i/t.siteCount),spin=this.spins[i];
      const x=cell%this.size,y=Math.floor(cell/this.size)%this.size,z=Math.floor(cell/(this.size*this.size));
      if(!spin)return {index:i,x,y,z,site,element:t.crystal.sites[site].element,present:!!t.present[i],spin:0,degree:0,neighborSum:0,weightedSum:0,deltaEnergy:null,probability:null};
      const sums=this.sums(i),deltaEnergy=2*spin*(sums.weighted+this.field),probability=deltaEnergy<=0?1:Math.exp(-deltaEnergy/this.temperature);
      return {index:i,x,y,z,site,element:t.crystal.sites[site].element,spin,degree:t.offsets[i+1]-t.offsets[i],neighborSum:sums.raw,weightedSum:sums.weighted,deltaEnergy,probability};
    }
    flip(i){const local=this.local(i);if(!local.spin)throw new Error('这个组元未启用自旋，不能翻转。');this.spins[i]=-local.spin;this.spinSum-=2*local.spin;this.energy+=local.deltaEnergy;this.manualFlips++;this.clearSamples();this.lastAttempts=0;this.lastAccepted=0;return this.local(i);}
    configure(options={}){
      const t=options.temperature==null?this.temperature:options.temperature,h=options.field==null?this.field:options.field;
      if(!Number.isFinite(t)||t<.25||t>20)throw new Error('温度必须在 0.25–20 之间。');
      if(!Number.isFinite(h)||h< -5||h>5)throw new Error('外场必须在 −5–5 之间。');
      if(t===this.temperature&&h===this.field)return false;
      this.energy-=(h-this.field)*this.spinSum;this.temperature=t;this.field=h;this.clearSamples();this.lastAttempts=0;this.lastAccepted=0;return true;
    }
    clearSamples(){this.sampleCount=0;this.sampleCursor=0;}
    recordSample(){this.sampleM[this.sampleCursor]=this.spinSum/this.spinCount;this.sampleE[this.sampleCursor]=this.energy/this.spinCount;this.sampleCursor=(this.sampleCursor+1)%WINDOW;this.sampleCount=Math.min(WINDOW,this.sampleCount+1);}
    sweep(count=1,record=true){
      if(!Number.isInteger(count)||count<1||count>2000)throw new Error('扫描次数必须是 1–2000 的整数。');
      const t=this.topology,s=this.spins,active=t.activeIndices;let accepted=0;
      for(let n=0;n<count;n++){
        for(let trial=0;trial<active.length;trial++){
          const i=active[Math.floor(this.random()*active.length)],spin=s[i];let sum=0;
          for(let k=t.offsets[i];k<t.offsets[i+1];k++)sum+=t.couplings[k]*s[t.targets[k]];
          const dE=2*spin*(sum+this.field);
          if(dE<=0||this.random()<Math.exp(-dE/this.temperature)){s[i]=-spin;this.spinSum-=2*spin;this.energy+=dE;accepted++;}
        }
        this.sweeps++;if(record)this.recordSample();
      }
      this.lastAttempts=active.length*count;this.lastAccepted=accepted;return this.stats();
    }
    recomputeEnergy(){
      const t=this.topology,s=this.spins;let directed=0;
      for(const i of t.activeIndices)for(let k=t.offsets[i];k<t.offsets[i+1];k++)directed+=t.couplings[k]*s[i]*s[t.targets[k]];
      return -.5*directed+t.selfEnergy-this.field*this.spinSum;
    }
    stats(){
      const top=this.topology,count=this.sampleCount,m=this.spinSum/this.spinCount,e=this.energy/this.spinCount;
      let meanM=0,meanAbsM=0,meanE=0,varianceM=0,varianceE=0,product=top.selfEdges;
      for(const i of top.activeIndices)for(let k=top.offsets[i];k<top.offsets[i+1];k++)product+=this.spins[i]*this.spins[top.targets[k]];
      for(let i=0;i<count;i++){meanM+=this.sampleM[i];meanAbsM+=Math.abs(this.sampleM[i]);meanE+=this.sampleE[i];}
      if(count){meanM/=count;meanAbsM/=count;meanE/=count;for(let i=0;i<count;i++){varianceM+=(this.sampleM[i]-meanM)**2;varianceE+=(this.sampleE[i]-meanE)**2;}varianceM/=count;varianceE/=count;}
      return {size:this.size,count:this.count,spinCount:this.spinCount,siteCount:top.siteCount,temperature:this.temperature,field:this.field,seed:this.seed,initial:this.initial,
        sweeps:this.sweeps,magnetization:m,energyPerSpin:e,energy:this.energy,upFraction:(1+m)/2,neighborCorrelation:top.bondCount?product/(2*top.bondCount):null,
        acceptance:this.lastAttempts?this.lastAccepted/this.lastAttempts:null,attempts:this.lastAttempts,accepted:this.lastAccepted,manualFlips:this.manualFlips,
        sampleCount:count,meanMagnetization:count?meanM:null,meanAbsMagnetization:count?meanAbsM:null,meanEnergyPerSpin:count?meanE:null,
        susceptibility:count>=16?this.spinCount*varianceM/this.temperature:null,heatCapacity:count>=16?this.spinCount*varianceE/(this.temperature*this.temperature):null,
        meanDegree:top.meanDegree,bondCount:top.bondCount,components:top.components,largestComponent:top.largest,structureName:top.crystal.config.name,shape:top.shape,presentCount:top.presentCount,surfaceCount:top.surfaceCount,surfaceSpinCount:top.surfaceSpinCount};
    }
  }
  return {WINDOW,MAX_ATOMS,MAX_EDGES,createTopology,interfaces,IsingCrystal};
});
