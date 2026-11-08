'use strict';
importScripts('ising-model.js?v=20261031-3','crystal-model.js?v=20261101-5','ising-crystal-model.js?v=20261101-5','ising-microstructure.js?v=20261101-5','ising-size-core.js?v=20261101-5');
let token=0,active=null;
function send(kind,jobId,extra={}){self.postMessage({kind,jobId,...extra});}
function start(m){
  const study=new self.IsingSizeStudyCore.Study(m.options),mine=++token,jobId=m.jobId;active={jobId,study};
  send('started',jobId,{options:study.options,details:study.details.map(({gauge,...rest})=>rest),total:study.total,attempts:study.attempts});let last=0;
  function chunk(){
    if(mine!==token)return;
    try{const begin=performance.now();let r;
      do{r=study.step();if(r.point)send('point',jobId,{point:r.point,completed:r.completed,total:r.total});}while(!r.done&&performance.now()-begin<14);
      if(r.done){active=null;send('complete',jobId,{completed:r.completed,total:r.total});return;}
      if(performance.now()-last>100){last=performance.now();send('progress',jobId,{completed:r.completed,total:r.total});}setTimeout(chunk,0);
    }catch(error){if(mine===token){active=null;send('error',jobId,{message:String(error&&error.message||error)});}}
  }chunk();
}
self.onmessage=event=>{const m=event.data||{};try{if(m.type==='start'){start(m);return;}if(m.type==='cancel'&&active&&active.jobId===m.jobId){token++;active=null;send('cancelled',m.jobId);return;}if(m.type!=='cancel')throw new Error('未知尺寸研究指令。');}catch(error){send('error',m.jobId,{message:String(error&&error.message||error)});}};
