'use strict';
// Independent cancellable studies: each number is derived from actual DBM
// fields and growth. Every work slice ends between complete field solves.
importScripts('lightning-model.js?v=20261031-30','lightning-study.js?v=20261031-30');
const Model=self.LightningModel,Study=self.LightningStudy,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function coord(v,n,ny,radius){const margin=Math.max(2,Math.ceil((Number(radius)||.03)*(ny-1)));return clamp(Math.round(margin+(clamp(Number(v)||0,-100,100)+100)*(n-1-2*margin)/200),margin,n-1-margin);}
function optionsFor(base,quality,seed,eta){
  const g=Model.GRIDS[quality];if(!g)throw Error('未知网格');
  return {...base,quality,seed,eta,sourceX:coord(base.sourceXSlider,g.nx,g.ny,base.electrodeRadius),sourceZ:coord(base.sourceZSlider,g.nz,g.ny,base.electrodeRadius),targetX:coord(base.targetXSlider,g.nx,g.ny,base.electrodeRadius),targetZ:coord(base.targetZSlider,g.nz,g.ny,base.electrodeRadius)};
}
function solve(base,quality,seed,eta){
  const m=new Model.Discharge(optionsFor(base,quality,seed,eta)),result=m.solve();if(!result.converged)throw Error('初始场未达到残差要求');return m;
}
function grow(m){const r=m.step();if(!r.ok)throw Error('生长场未达到残差要求：'+r.reason);}
function error(mode,e){self.postMessage({kind:'error',mode,message:String(e&&e.message||e)});}
function grid(data){
  const pair=Array.isArray(data.pair)?data.pair:[],budget=clamp(Math.floor(Number(data.events)||0),0,50),base=data.options||{};
  if(pair.length!==2||pair.some(x=>!Model.GRIDS[x]))throw Error('网格对照配置无效');
  let index=0,field=null,initial=null,results=[],lastProgress=0;
  function chunk(){
    try{
      const start=performance.now();let count=0;
      while(index<pair.length&&(count===0||performance.now()-start<25)){
        if(!field){field=solve(base,pair[index],base.seed,base.eta);initial=Study.measure(field);}
        if(field.steps>=budget||field.complete){results.push({...Study.measure(field),initial});field=null;initial=null;index++;continue;}
        grow(field);count++;
      }
      const now=performance.now();if(index<pair.length){
        if(now-lastProgress>200){lastProgress=now;self.postMessage({kind:'progress',mode:'grid',index,steps:field?field.steps:0,total:budget});}
        setTimeout(chunk,0);
      }else self.postMessage({kind:'result',mode:'grid',results,budget});
    }catch(e){error('grid',e);}
  }
  chunk();
}
function statistics(data){
  const base=data.options||{},quality=data.quality,n=clamp(Math.floor(Number(data.samples)||1),1,24),budget=clamp(Math.floor(Number(data.events)||1),1,300);
  if(!Model.GRIDS[quality])throw Error('统计网格无效');const etaA=clamp(Number(base.eta)||0,0,8),etaB=clamp(Number(data.etaB)||0,0,8),start=(Number(base.seed)>>>0)||1;
  const groups=[[],[]],etas=[etaA,etaB];let index=0,field=null,lastProgress=0;
  function chunk(){
    try{
      const startTime=performance.now();let count=0;
      while(index<n*2&&(count===0||performance.now()-startTime<25)){
        if(!field){const group=Math.floor(index/n),sample=index%n,seed=((start-1+sample)%4294967295)+1;field=solve(base,quality,seed,etas[group]);}
        if(field.steps>=budget||field.complete){groups[Math.floor(index/n)].push(Study.measure(field));field=null;index++;continue;}
        grow(field);count++;
      }
      const now=performance.now();if(index<n*2){
        if(now-lastProgress>200){lastProgress=now;self.postMessage({kind:'progress',mode:'stats',completed:index,total:n*2,steps:field?field.steps:0,budget});}
        setTimeout(chunk,0);
      }else self.postMessage({kind:'result',mode:'stats',quality,budget,etas,samples:groups,summary:groups.map(Study.summarize)});
    }catch(e){error('stats',e);}
  }
  chunk();
}
self.onmessage=function(event){const data=event.data||{};try{if(data.type==='grid')grid(data);else if(data.type==='stats')statistics(data);}catch(e){error(data.type,e);}};
