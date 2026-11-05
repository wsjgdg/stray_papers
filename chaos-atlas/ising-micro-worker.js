'use strict';
importScripts('crystal-model.js?v=20261101-5','ising-crystal-model.js?v=20261101-5','ising-microstructure.js?v=20261101-5');
self.onmessage=event=>{
  const m=event.data||{};
  try{
    if(m.type!=='analyze')throw new Error('未知微观分析指令。');
    const top=self.CrystalIsing.createTopology(m.options),spins=new Int8Array(m.spins);
    self.postMessage({kind:'progress',jobId:m.jobId,stage:'相互作用与团块'});
    const diagnostics=self.IsingMicrostructure.diagnostics(top,spins),clusters=self.IsingMicrostructure.clusters(top,spins),correlations=self.IsingMicrostructure.correlations(top,spins);
    self.postMessage({kind:'progress',jobId:m.jobId,stage:'三维倒空间'});
    const reciprocal=self.IsingMicrostructure.structureFactor(top,spins,{radius:4,span:m.span});
    self.postMessage({kind:'result',jobId:m.jobId,diagnostics,clusters,correlations,reciprocal},[clusters.labels.buffer]);
  }catch(error){self.postMessage({kind:'error',jobId:m.jobId,message:String(error&&error.message||error)});}
};
