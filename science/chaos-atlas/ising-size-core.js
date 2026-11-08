/* Independent finite-size, multi-seed, finite-budget Ising study. */
(function(root,factory){
  'use strict';
  const G=typeof module==='object'&&module.exports?require('./ising-crystal-model.js'):root.CrystalIsing;
  const M=typeof module==='object'&&module.exports?require('./ising-microstructure.js'):root.IsingMicrostructure;
  const api=factory(G,M);if(typeof module==='object'&&module.exports)module.exports=api;else root.IsingSizeStudyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(G,M){
  'use strict';
  const MAX_ATTEMPTS=60000000;
  const sd=values=>{const a=values.filter(Number.isFinite);if(a.length<2||a.length!==values.length)return null;const mean=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-mean)**2,0)/(a.length-1));};
  const mean=(a,key)=>a.reduce((v,x)=>v+x[key],0)/a.length;
  function binder(m2,m4){return m2>1e-24?1-m4/(3*m2*m2):null;}
  function aggregate(reps,temperature,size,mode,spinCount){
    const m2=mode==='none'?null:mean(reps,'m2'),m4=mode==='none'?null:mean(reps,'m4'),e=mean(reps,'e');
    return {size,temperature,mode,spinCount,seeds:reps.length,samplesPerSeed:reps[0].samples,
      order:mode==='none'?null:mean(reps,'absM'),susceptibility:mode==='none'?null:mean(reps,'susceptibility'),binder:mode==='none'?null:binder(m2,m4),
      heatCapacity:mean(reps,'heatCapacity'),energy:e,
      susceptibilitySD:sd(reps.map(r=>r.susceptibility)),binderSD:sd(reps.map(r=>r.binder)),heatCapacitySD:sd(reps.map(r=>r.heatCapacity)),replicates:reps.slice()};
  }
  class Study{
    constructor(options={}){
      const {structure,sizes=[4,6,8],field=0,seed=20261031,seeds=3,warm=64,samples=128,points=9,min=1,max=8,cutoff=1.08,jSame=1,jDifferent=1,activeSpecies,shape='periodic',pairRules=[]}=options;
      if(!structure)throw new Error('尺寸研究需要确定晶胞。');
      if(!Array.isArray(sizes)||sizes.length<2||sizes.length>4||sizes.some(n=>!Number.isInteger(n)||n<2||n>24)||new Set(sizes).size!==sizes.length)throw new Error('请输入 2–4 个不同的重复数，每项为 2–24。');
      if(!Number.isFinite(field)||field< -5||field>5||!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('外场或初始种子无效。');
      if(!Number.isInteger(seeds)||seeds<2||seeds>8||!Number.isInteger(warm)||warm<0||warm>512||!Number.isInteger(samples)||samples<16||samples>512)throw new Error('多种子或采样预算无效。');
      if(!Number.isInteger(points)||points<3||points>21||!Number.isFinite(min)||!Number.isFinite(max)||min<.25||max>20||min>=max)throw new Error('温度范围或点数无效。');
      this.options={structure,sizes:sizes.slice().sort((a,b)=>a-b),field,seed,seeds,warm,samples,points,min,max,cutoff,jSame,jDifferent,activeSpecies,shape,pairRules};
      this.temperatures=Array.from({length:points},(_,i)=>min+(max-min)*i/(points-1));
      const o=this.options;this.models=o.sizes.map(size=>this.createModel(size,0));this.details=this.models.map(model=>{
        const d=M.diagnostics(model.topology,model.spins);let mode='none';if(d.components===1&&d.bonds>0&&d.negativeBonds===0)mode='uniform';else if(d.absStaggered!=null)mode='staggered';
        return {size:model.size,spinCount:model.spinCount,mode,gauge:d.gauge,negativeBonds:d.negativeBonds,positiveBonds:d.positiveBonds,frustratedLoops:d.frustratedFundamentalLoops,components:d.components};
      });
      const attempts=this.details.reduce((sum,d)=>sum+d.spinCount,0)*seeds*points*(warm+samples);
      if(attempts>MAX_ATTEMPTS)throw new Error(`预算约 ${Math.round(attempts/1e6)} 百万次尝试，超过 ${MAX_ATTEMPTS/1e6} 百万；请缩小尺寸、种子数或采样。`);
      this.attempts=attempts;this.total=o.sizes.length*seeds*points*(warm+samples);this.completed=0;this.sizeIndex=0;this.seedIndex=0;this.temperatureIndex=0;this.atPoint=0;this.done=false;
      this.bins=o.sizes.map(()=>this.temperatures.map(()=>[]));this.model=this.models[0];this.resetSums();
    }
    seedFor(size,seedIndex){return (this.options.seed+size*1009+seedIndex)>>>0;}
    createModel(size,seedIndex){const o=this.options;return new G.IsingCrystal({structure:o.structure,size,field:o.field,seed:this.seedFor(size,seedIndex),temperature:o.min,initial:'random',cutoff:o.cutoff,jSame:o.jSame,jDifferent:o.jDifferent,activeSpecies:o.activeSpecies,shape:o.shape,pairRules:o.pairRules});}
    resetSums(){this.sumM=0;this.sumAbsM=0;this.sumM2=0;this.sumM4=0;this.sumE=0;this.sumE2=0;}
    step(){
      if(this.done)throw new Error('尺寸研究已经结束。');
      const o=this.options,model=this.model,detail=this.details[this.sizeIndex];model.sweep(1,false);this.atPoint++;this.completed++;
      if(this.atPoint>o.warm){
        let m=0;if(detail.mode==='uniform')m=model.spinSum/model.spinCount;else if(detail.mode==='staggered'){for(const i of model.topology.activeIndices)m+=detail.gauge[i]*model.spins[i];m/=model.spinCount;}
        const e=model.energy/model.spinCount,m2=m*m;this.sumM+=m;this.sumAbsM+=Math.abs(m);this.sumM2+=m2;this.sumM4+=m2*m2;this.sumE+=e;this.sumE2+=e*e;
      }
      let point=null;
      if(this.atPoint===o.warm+o.samples){
        const T=this.temperatures[this.temperatureIndex],N=model.spinCount,m=this.sumM/o.samples,m2=this.sumM2/o.samples,m4=this.sumM4/o.samples,e=this.sumE/o.samples,e2=this.sumE2/o.samples;
        const rep={seed:this.seedFor(detail.size,this.seedIndex),samples:o.samples,m,m2,m4,absM:this.sumAbsM/o.samples,e,e2,
          susceptibility:detail.mode==='none'?null:Math.max(0,N*(m2-m*m)/T),binder:detail.mode==='none'?null:binder(m2,m4),heatCapacity:Math.max(0,N*(e2-e*e)/(T*T))};
        const bin=this.bins[this.sizeIndex][this.temperatureIndex];bin.push(rep);point=aggregate(bin,T,detail.size,detail.mode,N);this.atPoint=0;this.resetSums();
        this.temperatureIndex++;
        if(this.temperatureIndex<o.points)model.configure({temperature:this.temperatures[this.temperatureIndex]});
        else{
          this.temperatureIndex=0;this.seedIndex++;
          if(this.seedIndex<o.seeds)this.model=this.createModel(detail.size,this.seedIndex);
          else{this.seedIndex=0;this.sizeIndex++;if(this.sizeIndex<o.sizes.length)this.model=this.models[this.sizeIndex];else this.done=true;}
        }
      }
      return {point,done:this.done,completed:this.completed,total:this.total};
    }
  }
  return {Study,aggregate,binder,MAX_ATTEMPTS};
});
