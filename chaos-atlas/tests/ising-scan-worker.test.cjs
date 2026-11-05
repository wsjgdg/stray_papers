'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const scanAPI=require('../ising-scan-core.js');
function harness(){
  const events=[],listeners=[],self={IsingTemperatureScan:scanAPI,postMessage(d){events.push(d);for(const f of [...listeners])f(d);}};let tick=0;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','ising-scan-worker.js'),'utf8'),vm.createContext({self,performance:{now:()=>tick+=7},setTimeout,importScripts:()=>{}}));
  return {events,send:data=>self.onmessage({data}),wait:(kind,id)=>new Promise((resolve,reject)=>{
    const match=d=>d.kind===kind&&d.jobId===id,existing=events.find(match);if(existing)return resolve(existing);
    const timeout=setTimeout(()=>reject(Error('scan worker timeout '+kind)),15000);
    listeners.push(d=>{if(match(d)){clearTimeout(timeout);resolve(d);}else if(d.kind==='error'&&d.jobId===id&&kind!=='error'){clearTimeout(timeout);reject(Error(d.message));}});
  })};
}
function reference(options){const s=new scanAPI.Scan(options),out=[];while(!s.done){const r=s.step();if(r.point)out.push(r.point);}return out;}

test('worker streams reproducible results identical to the independent scan core',async()=>{
  const w=harness(),options={size:4,field:.2,seed:501,direction:'cool',warm:3,samples:16,points:3,min:2,max:6};
  w.send({type:'start',jobId:1,options});await w.wait('complete',1);
  assert.deepEqual(w.events.filter(e=>e.kind==='point').map(e=>e.point),reference(options));
  assert.equal(w.events.at(-1).completed,57);assert.ok(w.events.some(e=>e.kind==='progress'));
});

test('cancelling or replacing a running scan prevents stale point and completion messages',async()=>{
  const w=harness(),options={size:8,seed:4,direction:'heat',warm:200,samples:200,points:15};
  w.send({type:'start',jobId:4,options});assert.ok(w.events.some(e=>e.kind==='started'&&e.jobId===4));
  w.send({type:'cancel',jobId:4});await w.wait('cancelled',4);const stop=w.events.length;
  w.send({type:'start',jobId:5,options:{size:4,seed:5,direction:'cool',warm:0,samples:16,points:2}});await w.wait('complete',5);
  assert.ok(!w.events.slice(stop).some(e=>e.jobId===4));assert.equal(w.events.filter(e=>e.kind==='point'&&e.jobId===5).length,2);
});

test('invalid start is reported without cancelling the active valid job',async()=>{
  const w=harness(),options={size:4,seed:7,warm:0,samples:16,points:2};w.send({type:'start',jobId:8,options});
  w.send({type:'start',jobId:9,options:{size:1}});assert.match((await w.wait('error',9)).message,/尺寸/);await w.wait('complete',8);
  assert.equal(w.events.filter(e=>e.kind==='point'&&e.jobId===8).length,2);
});
