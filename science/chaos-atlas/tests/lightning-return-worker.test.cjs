'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks'),Return=require('../lightning-return.js');
function tree(){const mask=new Uint8Array(15);mask[13]=2;return {nx:3,ny:5,nz:1,segments:[1,4,4,7,4,3,3,6,7,10,10,13],mask,stats:{complete:true}};}
function harness(){
  const events=[],waiters=[],self={LightningReturn:Return,postMessage:(data,transfer)=>{events.push({data,transfer});for(const f of [...waiters])f(data);}};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','lightning-return-worker.js'),'utf8'),vm.createContext({self,performance,setTimeout,importScripts:()=>{}}));
  return {events,send:data=>self.onmessage({data}),wait:kind=>new Promise((resolve,reject)=>{
    const old=events.find(e=>e.data.kind===kind);if(old)return resolve(old.data);
    const timeout=setTimeout(()=>reject(Error('return worker timeout')),30000);
    waiters.push(data=>{if(data.kind==='return-error'&&kind!=='return-error'){clearTimeout(timeout);reject(Error(data.message));}else if(data.kind===kind){clearTimeout(timeout);resolve(data);}});
  })};
}
function near(a,b,tol){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}
test('worker frames are independently reproducible RLC states, with actual probe arrays and transferable buffers',async()=>{
  const w=harness(),d=tree(),opts={height:2000,voltage:10e6,resistance:.1,groundResistance:10};w.send({type:'compute',tree:d,options:opts,duration:20e-6,frames:21});
  const result=await w.wait('return-result');assert.equal(result.frames,21);assert.equal(result.edges,24);assert.ok(result.dt<=result.dtMax);
  assert.equal(result.mainIndices[0],result.edges-1);assert.equal(result.currents.length,21*24);assert.ok(result.metrics.groundCurrent.some(v=>v>0));
  const m=new Return.ReturnStroke(d,opts),steps=m.setOutputInterval(1e-6);assert.equal(steps,result.perFrame);
  for(let f=0;f<result.frames;f++){
    if(f)for(let n=0;n<steps;n++)assert.ok(m.step().ok);
    near(result.times[f],m.time,1e-17);near(result.metrics.groundCurrent[f],m.stats().groundCurrent,1e-7);
    near(result.metrics.energyError[f],m.stats().energyError,1e-5);near(result.metrics.chargeError[f],0,1e-12);
    for(const e of [0,5,result.edges-1]){
      const idx=f*result.edges+e;near(result.currents[idx],m.current[e],Math.max(.01,Math.abs(m.current[e])*1e-6));
      near(result.heating[idx],m.heat[e]/m.lengths[e],Math.max(.001,Math.abs(result.heating[idx])*1e-6));
    }
  }
  assert.ok(w.events.some(e=>e.data.kind==='return-progress'));assert.equal(w.events.find(e=>e.data.kind==='return-result').transfer.length,17);
});
test('worker reports invalid assumptions rather than returning a fabricated result',async()=>{
  const w=harness();w.send({type:'compute',tree:tree(),options:{inductance:.1e-6,capacitance:1e-12},duration:20e-6});
  const e=await w.wait('return-error');assert.match(e.message,/光速/);assert.equal(w.events.some(x=>x.data.kind==='return-result'),false);
});
