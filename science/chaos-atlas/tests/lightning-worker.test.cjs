'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks'),Model=require('../lightning-model.js'),Study=require('../lightning-study.js'),Event=require('../lightning-event.js');
function harness(file){
  const events=[],waiters=[],self={LightningModel:Model,LightningStudy:Study,postMessage:(data,transfer)=>{events.push({data,transfer});for(const f of [...waiters])f(data);}};
  const context=vm.createContext({self,performance,setTimeout,importScripts:()=>{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  function wait(kind){return new Promise((resolve,reject)=>{const old=events.find(x=>x.data.kind===kind);if(old)return resolve(old.data);const timeout=setTimeout(()=>reject(Error('worker timeout '+kind)),30000);waiters.push(function receive(data){if(data.kind==='error'){clearTimeout(timeout);reject(Error(data.message));}else if(data.kind===kind){clearTimeout(timeout);resolve(data);}});});}
  return {events,send:data=>self.onmessage({data}),wait};
}
function model(o,n){const m=new Model.Discharge(o);assert.ok(m.solve().converged);for(let i=0;i<n&&!m.complete;i++)assert.ok(m.step().ok);return m;}
function close(a,b,t=1e-9){assert.ok(Math.abs(a-b)<t,`${a} vs ${b}`);}
test('worker captures a real single event with independent before/after arrays',async()=>{
  const w=harness('lightning-worker.js');w.send({type:'init',generation:7,options:{quality:'quick',eta:4,seed:19},warm:0});await w.wait('ready');w.send({type:'capture',generation:7});const msg=await w.wait('capture');
  const m=model({quality:'quick',eta:4,seed:19},0),before=m.snapshot();assert.ok(m.step().ok);const after=m.snapshot();
  assert.deepEqual(Array.from(msg.before.potential),Array.from(before.potential));assert.deepEqual(Array.from(msg.primary.potential),Array.from(after.potential));assert.deepEqual(Array.from(msg.primary.segments),Array.from(after.segments));
  assert.ok(msg.before.potential.buffer!==msg.primary.potential.buffer);assert.equal(w.events.find(x=>x.data.kind==='capture').transfer.length,22);assert.ok(Event.compare(msg.before,msg.primary).maxE>0);
});
test('capture on contact explicitly has no post-contact electrostatic solve',async()=>{
  const options={quality:'quick',eta:6,seed:3},m=model(options,0);while(!m.complete){assert.ok(m.step().ok);assert.ok(m.steps<300);}const at=m.steps;
  const w=harness('lightning-worker.js');w.send({type:'init',generation:9,options,warm:at-1});await w.wait('ready');w.send({type:'capture',generation:9});const msg=await w.wait('capture');
  assert.equal(msg.before.stats.steps,at-1);assert.equal(msg.before.stats.complete,false);assert.equal(msg.primary.stats.complete,true);assert.deepEqual(Array.from(msg.before.potential),Array.from(msg.primary.potential));assert.throws(()=>Event.compare(msg.before,msg.primary),/没有可比较/);
});
test('grid study solves each requested grid independently from the same physical configuration',async()=>{
  const opts={eta:4,seed:19,tolerance:1e-5,electrodeShape:'blunt',electrodeRadius:.08,electrodeLength:.16,sourceXSlider:0,sourceZSlider:0,targetXSlider:0,targetZSlider:0};
  const w=harness('lightning-analysis-worker.js');w.send({type:'grid',pair:['quick','standard'],events:4,options:opts});const msg=await w.wait('result');assert.equal(msg.mode,'grid');
  for(let i=0;i<2;i++){
    const quality=['quick','standard'][i],m=model({...opts,quality},4),expected=Study.measure(m),actual=msg.results[i];
    assert.equal(actual.steps,4);assert.equal(actual.nx,m.nx);assert.equal(actual.junctions,expected.junctions);close(actual.length,expected.length);close(actual.potentialCenter,expected.potentialCenter);close(actual.residual,expected.residual);
  }
});
test('ensemble uses paired seeds, actual growth and explicit event-budget censoring',async()=>{
  const opts={eta:4,seed:19,tolerance:1e-5,electrodeShape:'needle',electrodeRadius:.03,electrodeLength:.11,sourceXSlider:0,sourceZSlider:0,targetXSlider:0,targetZSlider:0};
  const w=harness('lightning-analysis-worker.js');w.send({type:'stats',quality:'quick',samples:2,events:8,etaB:1,options:opts});const msg=await w.wait('result');
  assert.equal(msg.mode,'stats');assert.deepEqual(Array.from(msg.etas),[4,1]);
  for(let group=0;group<2;group++)for(let j=0;j<2;j++){
    const m=model({...opts,quality:'quick',eta:group?1:4,seed:19+j},8),actual=msg.samples[group][j],expected=Study.measure(m);
    assert.equal(actual.seed,19+j);assert.equal(actual.steps,8);assert.equal(actual.complete,false);assert.equal(actual.junctions,expected.junctions);close(actual.length,expected.length);close(actual.residual,expected.residual);
    assert.equal(msg.summary[group].n,2);assert.equal(msg.summary[group].censored,2);assert.equal(msg.summary[group].contact,0);
  }
});
