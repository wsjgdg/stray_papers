/* Finite-budget temperature scan using the same 3D Metropolis model.
 * Each temperature warm-starts from the preceding simulated microstate.
 * Monte Carlo sweeps are not physical time or a guarantee of equilibrium. */
(function (root, factory) {
  'use strict';
  const model = typeof module === 'object' && module.exports ? require('./ising-model.js') : root.IsingLattice;
  const crystal = typeof module === 'object' && module.exports ? require('./ising-crystal-model.js') : root.CrystalIsing;
  const api = factory(model,crystal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IsingTemperatureScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (modelAPI,crystalAPI) {
  'use strict';
  class Scan {
    constructor(options = {}) {
      const {size=12,field=0,seed=20261031,direction='heat',warm=64,samples=128,points=15,min=1,max=8}=options;
      if (!modelAPI || !modelAPI.Ising3D) throw new Error('伊辛模型资源不可用。');
      if (!Number.isInteger(size)||size<2||size>32) throw new Error('扫描晶格尺寸须为 2–32。');
      if (!Number.isFinite(field)||field< -5||field>5) throw new Error('扫描外场超出范围。');
      if (!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw new Error('随机种子无效。');
      if (!['heat','cool'].includes(direction)) throw new Error('扫描方向无效。');
      if (!Number.isInteger(warm)||warm<0||warm>1000) throw new Error('每点预热须为 0–1000 次扫描。');
      if (!Number.isInteger(samples)||samples<16||samples>modelAPI.WINDOW) throw new Error('每点采样须为 16–256 次扫描。');
      if (!Number.isInteger(points)||points<2||points>41) throw new Error('温度点数须为 2–41。');
      if (!Number.isFinite(min)||!Number.isFinite(max)||min<.25||max>20||min>=max) throw new Error('温度范围无效。');
      this.options={size,field,seed,direction,warm,samples,points,min,max};
      this.temperatures=Array.from({length:points},(_,i)=>min+(max-min)*i/(points-1));
      if(direction==='cool')this.temperatures.reverse();
      const modelOptions={size,field,seed,temperature:this.temperatures[0],initial:direction==='heat'?'up':'random'};
      if(options.structure){
        if(!crystalAPI||!crystalAPI.IsingCrystal)throw new Error('晶体自旋模型资源不可用。');
        Object.assign(modelOptions,{structure:options.structure,cutoff:options.cutoff,jSame:options.jSame,jDifferent:options.jDifferent,activeSpecies:options.activeSpecies,shape:options.shape,pairRules:options.pairRules});
        this.model=new crystalAPI.IsingCrystal(modelOptions);
        Object.assign(this.options,{structure:options.structure,cutoff:this.model.topology.cutoff,jSame:this.model.topology.jSame,jDifferent:this.model.topology.jDifferent,activeSpecies:this.model.topology.activeSpecies,shape:this.model.topology.shape,pairRules:this.model.topology.pairRules});
      }else this.model=new modelAPI.Ising3D(modelOptions);
      this.index=0;this.atPoint=0;this.completed=0;this.total=points*(warm+samples);this.done=false;
      this.model.clearSamples();
    }
    step() {
      if(this.done)throw new Error('温度扫描已经结束。');
      const o=this.options,measuring=this.atPoint>=o.warm;
      this.model.sweep(1,measuring);this.atPoint++;this.completed++;
      let point=null;
      if(this.atPoint===o.warm+o.samples){
        const s=this.model.stats();
        point={index:this.index,temperature:s.temperature,field:s.field,size:s.size,seed:s.seed,
          samples:s.sampleCount,meanMagnetization:s.meanMagnetization,meanAbsMagnetization:s.meanAbsMagnetization,
          meanEnergyPerSpin:s.meanEnergyPerSpin,susceptibility:s.susceptibility,heatCapacity:s.heatCapacity,
          lastMagnetization:s.magnetization,lastEnergyPerSpin:s.energyPerSpin,sweeps:s.sweeps};
        this.index++;this.atPoint=0;this.done=this.index===o.points;
        if(!this.done){this.model.configure({temperature:this.temperatures[this.index]});this.model.clearSamples();}
      }
      return {point,done:this.done,completed:this.completed,total:this.total};
    }
  }
  return {Scan};
});
