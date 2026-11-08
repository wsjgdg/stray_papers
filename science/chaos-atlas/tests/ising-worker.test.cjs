'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks'),api=require('../ising-model.js'),crystal=require('../crystal-model.js'),graph=require('../ising-crystal-model.js');
function harness(clock=performance){
  const events=[],waiters=[],self={IsingLattice:api,CrystalIsing:graph,postMessage(data,transfer=[]){events.push({data,transfer});for(const fn of [...waiters])fn(data);}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','ising-worker.js'),'utf8'),vm.createContext({self,performance:clock,setTimeout,importScripts:()=>{},Int8Array,Number}));
  return {events,send:data=>self.onmessage({data}),wait:(kind,id)=>new Promise((resolve,reject)=>{
    const match=d=>d.kind===kind&&(id===undefined||d.requestId===id),existing=events.find(e=>match(e.data));if(existing)return resolve(existing.data);
    const timeout=setTimeout(()=>reject(Error('worker timeout: '+kind)),10000);
    waiters.push(data=>{if(match(data)){clearTimeout(timeout);resolve(data);}else if(data.kind==='error'&&kind!=='error'&&(id===undefined||id===data.requestId)){clearTimeout(timeout);reject(Error(data.message));}});
  })};
}

test('worker warm-up and each transferred frame equal an independently advanced model',async()=>{
  const w=harness(),options={size:8,temperature:4.51,field:.2,seed:12,initial:'random'};
  w.send({type:'reset',generation:1,requestId:1,options,warm:27,probeIndex:6});const ready=await w.wait('ready',1);
  const ref=new api.Ising3D(options);for(let i=0;i<27;i++)ref.sweep(1,false);ref.clearSamples();
  assert.deepEqual([...new Int8Array(ready.spins)],[...ref.spins]);assert.deepEqual(ready.stats,ref.stats());assert.deepEqual(ready.probe,ref.local(6));assert.equal(ready.stats.sampleCount,0);
  assert.equal(w.events.find(e=>e.data.kind==='ready').transfer.length,1);
  w.send({type:'advance',generation:1,requestId:2,sweeps:4});const frame=await w.wait('frame',2);ref.sweep(4);
  assert.deepEqual([...new Int8Array(frame.spins)],[...ref.spins]);assert.deepEqual(frame.stats,ref.stats());assert.deepEqual(frame.probe,ref.local(6));
  w.send({type:'configure',generation:1,requestId:3,temperature:6,field:-.3});const configured=await w.wait('configured',3);ref.configure({temperature:6,field:-.3});
  assert.deepEqual(configured.stats,ref.stats());assert.equal(configured.stats.sweeps,31);assert.equal(configured.stats.sampleCount,0);assert.deepEqual([...new Int8Array(configured.spins)],[...ref.spins]);
  w.send({type:'flip',generation:1,requestId:4,index:5});const flipped=await w.wait('flipped',4);ref.flip(5);
  assert.deepEqual([...new Int8Array(flipped.spins)],[...ref.spins]);assert.deepEqual(flipped.probe,ref.local(5));assert.deepEqual(flipped.stats,ref.stats());
});

test('invalid commands do not mutate a valid worker; old-generation commands are ignored',async()=>{
  const w=harness();w.send({type:'reset',generation:7,requestId:1,options:{size:4,seed:1},warm:0});const start=await w.wait('ready',1);
  w.send({type:'configure',generation:7,requestId:2,temperature:3,field:20});const error=await w.wait('error',2);assert.match(error.message,/外场/);
  w.send({type:'advance',generation:6,requestId:999,sweeps:1});w.send({type:'inspect',generation:7,requestId:3});const after=await w.wait('inspected',3);
  assert.deepEqual([...new Int8Array(after.spins)],[...new Int8Array(start.spins)]);assert.deepEqual(after.stats,start.stats);assert.ok(!w.events.some(e=>e.data.requestId===999));
  w.send({type:'advance',generation:7,requestId:4,sweeps:17});assert.match((await w.wait('error',4)).message,/扫描数/);
});

test('a newer reset cancels an in-flight prewarm rather than publishing a stale lattice',async()=>{
  let tick=0;const w=harness({now:()=>tick+=10});
  w.send({type:'reset',generation:1,requestId:1,options:{size:12,seed:42},warm:300});assert.ok(w.events.some(e=>e.data.kind==='progress'&&e.data.generation===1));
  w.send({type:'reset',generation:2,requestId:2,options:{size:4,seed:43,initial:'up'},warm:0});const ready=await w.wait('ready',2);
  assert.equal(ready.generation,2);assert.equal(ready.stats.count,64);await new Promise(resolve=>setTimeout(resolve,20));assert.ok(!w.events.some(e=>e.data.kind==='ready'&&e.data.generation===1));
});


test('worker samples the selected multicomponent periodic graph and reports inactive sites honestly',async()=>{
  const w=harness(),options={structure:crystal.preset('nacl'),size:4,cutoff:1.42,activeSpecies:['Na'],jSame:.8,jDifferent:-.4,temperature:5,field:.1,seed:13,initial:'random'};
  const ref=new graph.IsingCrystal(options),probe=ref.topology.activeIndices[11];w.send({type:'reset',generation:10,requestId:1,options,warm:12,probeIndex:probe});
  const ready=await w.wait('ready',1);for(let i=0;i<12;i++)ref.sweep(1,false);ref.clearSamples();
  assert.deepEqual([...new Int8Array(ready.spins)],[...ref.spins]);assert.deepEqual(ready.stats,ref.stats());assert.deepEqual(ready.probe,ref.local(probe));
  w.send({type:'advance',generation:10,requestId:2,sweeps:3});const frame=await w.wait('frame',2);ref.sweep(3);assert.deepEqual([...new Int8Array(frame.spins)],[...ref.spins]);assert.deepEqual(frame.stats,ref.stats());
  const inactive=ref.spins.findIndex(s=>s===0);w.send({type:'probe',generation:10,requestId:3,index:inactive});assert.equal((await w.wait('probed',3)).probe.spin,0);
  w.send({type:'flip',generation:10,requestId:4,index:inactive});assert.match((await w.wait('error',4)).message,/未启用自旋/);
});
