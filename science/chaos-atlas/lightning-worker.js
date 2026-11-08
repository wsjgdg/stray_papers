'use strict';
// Each real 3-D field is solved off the UI thread. Long warmups and advance
// batches yield between complete events so messages and cancellation remain
// responsive; a single relaxation solve is never split or shown as converged.
importScripts('lightning-model.js?v=20261031-30');
const LIMIT=3000,Model=self.LightningModel;
let primary=null,reference=null,generation=0,job=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function initialize(options) {
  const field=new Model.Discharge(options),initial=field.solve();
  if(!initial.converged)throw Error('初始电势未收敛；残差 '+initial.residual.toExponential(2));
  return field;
}
function advance(field) {
  if(!field||field.complete||field.steps>=LIMIT)return;
  const result=field.step();
  if(!result.ok)throw Error('电势求解或生长停止：'+result.reason+'；残差 '+field.solveInfo.residual.toExponential(2));
}
function done(field){return !field||field.complete||field.steps>=LIMIT;}
function send(kind,before=null) {
  const a=primary.snapshot(),b=reference?reference.snapshot():null,transfer=[];
  for(const v of [a,b,before])if(v)for(const key of ['potential','mask','segments','sourceBody','targetBody','candidateIds','probabilities','drops','faceLinks','diagonalLinks','links'])transfer.push(v[key].buffer);
  self.postMessage({kind,generation,primary:a,reference:b,before,limit:LIMIT,
    primaryLimited:!primary.complete&&primary.steps>=LIMIT,
    referenceLimited:!!reference&&!reference.complete&&reference.steps>=LIMIT},transfer);
}
function runEvents(count,kind,token){
  let attempted=0,lastProgress=0;
  function chunk(){
    if(token!==job)return;
    try{
      const start=performance.now();let n=0;
      while(attempted<count&&!(done(primary)&&done(reference))&&n<5&&(n===0||performance.now()-start<25)){
        advance(primary);advance(reference);attempted++;n++;
      }
      if(attempted<count&&!(done(primary)&&done(reference))){
        const now=performance.now();if(kind==='ready'&&(now-lastProgress>200)){lastProgress=now;self.postMessage({kind:'progress',generation,attempted,total:count});}
        setTimeout(chunk,0);
      }else send(kind);
    }catch(error){self.postMessage({kind:'error',generation,message:String(error&&error.message||error)});}
  }
  chunk();
}
self.onmessage=function(event) {
  const data=event.data||{};
  try {
    if(data.type==='init'){
      const token=++job;generation=data.generation;primary=initialize(data.options||{});
      reference=data.compare?initialize({...data.options,eta:data.referenceEta}):null;
      runEvents(clamp(Math.floor(Number(data.warm)||0),0,240),'ready',token);return;
    }
    if(data.generation!==generation||!primary)return;
    if(data.type==='capture'){
      ++job;const before=primary.snapshot();advance(primary);advance(reference);send('capture',before);
    } else if(data.type==='advance'){
      runEvents(clamp(Math.floor(Number(data.count)||1),1,16),'frame',++job);
    } else if(data.type==='configure'){
      if(Number.isFinite(Number(data.eta)))primary.eta=clamp(Number(data.eta),0,8);
      send('configured');
    }
  } catch(error) {
    self.postMessage({kind:'error',generation,message:String(error&&error.message||error)});
  }
};
