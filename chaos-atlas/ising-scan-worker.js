'use strict';
importScripts('ising-model.js?v=20261031-3','crystal-model.js?v=20261101-5','ising-crystal-model.js?v=20261101-5','ising-scan-core.js?v=20261101-5');
let token=0,active=null;
function send(kind,jobId,extra={}){self.postMessage({kind,jobId,...extra});}
function start(message){
  // Construct first: a malformed request cannot corrupt an existing scan.
  const candidate=new self.IsingTemperatureScan.Scan(message.options),myToken=++token,jobId=message.jobId;
  active={jobId,scan:candidate};let lastProgress=0;
  send('started',jobId,{options:candidate.options,total:candidate.total});
  function chunk(){
    if(myToken!==token)return;
    try {
      const begin=performance.now();let result;
      do {
        result=candidate.step();
        if(result.point)send('point',jobId,{point:result.point,completed:result.completed,total:result.total});
      } while(!result.done&&performance.now()-begin<14);
      if(result.done){active=null;send('complete',jobId,{completed:result.completed,total:result.total});return;}
      if(performance.now()-lastProgress>=100){lastProgress=performance.now();send('progress',jobId,{completed:result.completed,total:result.total});}
      setTimeout(chunk,0);
    }catch(error){if(myToken===token){active=null;send('error',jobId,{message:String(error&&error.message||error)});}}
  }
  chunk();
}
self.onmessage=event=>{
  const m=event.data||{};
  try {
    if(m.type==='start'){start(m);return;}
    if(m.type==='cancel'&&active&&m.jobId===active.jobId){token++;active=null;send('cancelled',m.jobId);return;}
    if(m.type!=='cancel')throw new Error('未知温度扫描指令。');
  }catch(error){send('error',m.jobId,{message:String(error&&error.message||error)});}
};
