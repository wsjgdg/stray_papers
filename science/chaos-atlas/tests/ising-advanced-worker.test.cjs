'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),M=require('../ising-microstructure.js'),Core=require('../ising-size-core.js');
function harness(file,api){
  const events=[],listeners=[],self={...api,postMessage(d){events.push(d);for(const f of [...listeners])f(d);}};let tick=0;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),vm.createContext({self,performance:{now:()=>tick+=7},setTimeout,importScripts:()=>{},Int8Array}));
  return {events,send:data=>self.onmessage({data}),wait:(kind,id)=>new Promise((resolve,reject)=>{const match=d=>d.kind===kind&&d.jobId===id,existing=events.find(match);if(existing)return resolve(existing);const timeout=setTimeout(()=>reject(Error('worker timeout '+kind)),15000);listeners.push(d=>{if(match(d)){clearTimeout(timeout);resolve(d);}else if(d.kind==='error'&&d.jobId===id&&kind!=='error'){clearTimeout(timeout);reject(Error(d.message));}});})};
}
test('snapshot worker computes real graph diagnostics, clusters, correlations and reciprocal intensities',async()=>{
  const options={structure:C.preset('hcp'),size:4,shape:'sphere',jSame:-1},model=new G.IsingCrystal({...options,seed:29}),w=harness('ising-micro-worker.js',{CrystalIsing:G,IsingMicrostructure:M});
  const spins=model.spins.slice();w.send({type:'analyze',jobId:1,options,spins:spins.buffer,span:.5});const r=await w.wait('result',1),t=model.topology;
  assert.deepEqual(r.diagnostics,M.diagnostics(t,spins));assert.deepEqual(r.clusters,M.clusters(t,spins));assert.deepEqual(r.correlations,M.correlations(t,spins));assert.deepEqual(r.reciprocal,M.structureFactor(t,spins));
  w.send({type:'analyze',jobId:2,options,spins:new ArrayBuffer(1),span:.5});assert.match((await w.wait('error',2)).message,/不匹配/);
});
test('finite-size worker streams the same seeded series as the core and supports cancellation',async()=>{
  const options={structure:C.preset('cP'),sizes:[3,4],shape:'box',seed:41,seeds:2,warm:1,samples:16,points:3,min:1,max:3,pairRules:[{a:'X1',b:'X1',shell:1,j:-1}]};
  const w=harness('ising-size-worker.js',{IsingSizeStudyCore:Core});w.send({type:'start',jobId:3,options});await w.wait('complete',3);
  const expected=[],s=new Core.Study(options);while(!s.done){const r=s.step();if(r.point)expected.push(r.point);}assert.deepEqual(w.events.filter(v=>v.kind==='point'&&v.jobId===3).map(v=>v.point),expected);
  w.send({type:'start',jobId:4,options:{...options,warm:64,samples:128}});w.send({type:'cancel',jobId:4});await w.wait('cancelled',4);const after=w.events.length;
  w.send({type:'start',jobId:5,options});await w.wait('complete',5);assert.ok(!w.events.slice(after).some(v=>v.jobId===4));
});
test('invalid size request does not silently replace a currently valid study',async()=>{
  const options={structure:C.preset('cP'),sizes:[3,4],seeds:2,warm:0,samples:16,points:3,min:1,max:3};const w=harness('ising-size-worker.js',{IsingSizeStudyCore:Core});
  w.send({type:'start',jobId:6,options});w.send({type:'start',jobId:7,options:{...options,sizes:[4,4]}});assert.match((await w.wait('error',7)).message,/不同/);await w.wait('complete',6);
});
