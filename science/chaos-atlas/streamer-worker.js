'use strict';
// The Poisson/transport loop runs off the UI thread. Every delivered frame is
// a copy of a solved state; a failed solve never replaces the last good frame.
importScripts('streamer-model.js?v=20261031-24','streamer-geometry.js?v=20261031-25');
const Model=self.StreamerModel,Geometry=self.StreamerGeometry,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const LIMIT={time:60,steps:6000,density:30};
let model=null,generation=0,halt='';
function guard(){
  const s=model.stats();
  if(Math.max(s.maxElectron,s.maxIon)>=LIMIT.density)halt='教学计算达到密度上限 '+LIMIT.density+'，已保护暂停；这不是物理击穿判据。';
  else if(s.time>=LIMIT.time)halt='教学计算达到时间上限 '+LIMIT.time+'，已保护暂停；这不是物理击穿判据。';
  else if(s.steps>=LIMIT.steps)halt='教学计算达到步数上限 '+LIMIT.steps+'，已保护暂停；这不是物理击穿判据。';
}
function advance(){
  if(halt)return;
  const result=model.step();
  if(!result.ok){halt='数值步未通过：'+result.reason+(Number.isFinite(result.residual)?'，残差 '+result.residual.toExponential(2):'')+'；保留上一个有效状态。';return;}
  guard();
}
function send(kind){
  const snapshot=model.snapshot();
  // Extract the 25%-of-peak electron surface and sparse fallback contour off
  // the UI thread, from this exact snapshot. They are interpolated teaching views.
  snapshot.isoLines=Geometry.electronIsoLines(snapshot,.25);
  const mesh=Geometry.electronIsoMesh(snapshot,.25);snapshot.isoTriangles=mesh.positions;snapshot.isoNormals=mesh.normals;
  const keys=['electrons','ions','potential','mask','isoLines','isoTriangles','isoNormals'];
  self.postMessage({kind,generation,snapshot,halt,limit:LIMIT},keys.map(k=>snapshot[k].buffer));
}
self.onmessage=function(event){
  const data=event.data||{};
  try{
    if(data.type==='init'){
      generation=data.generation;halt='';model=new Model.Streamer(data.options||{});
      const result=model.solve();
      if(!result.converged)throw Error('初始泊松场未收敛，残差 '+result.residual.toExponential(2));
      const warm=clamp(Number(data.warm)||0,0,8);
      while(model.time<warm&&!halt)advance();
      send('ready');return;
    }
    if(!model||data.generation!==generation)return;
    if(data.type==='advance'){
      const count=clamp(Math.floor(Number(data.count)||1),1,8);
      for(let i=0;i<count&&!halt;i++)advance();
      send('frame');
    }
  }catch(error){
    self.postMessage({kind:'error',generation,message:String(error&&error.message||error)});
  }
};
