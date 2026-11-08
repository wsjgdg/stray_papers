'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Model=require('../streamer-model.js'),Geometry=require('../streamer-geometry.js'),code=fs.readFileSync(path.join(__dirname,'../streamer-worker.js'),'utf8');
function harness(){
  const events=[],context=vm.createContext({self:{StreamerModel:Model,StreamerGeometry:Geometry,postMessage:(data,transfer)=>events.push({data,transfer})},importScripts:()=>{}});
  vm.runInContext(code,context);return {events,context,send:data=>context.self.onmessage({data})};
}
test('worker uses the same solver, transfers independent arrays and respects generation',()=>{
  const w=harness();w.send({type:'init',generation:7,options:{quality:'quick'},warm:0});assert.equal(w.events.length,1);
  const msg=w.events[0].data,actual=msg.snapshot,m=new Model.Streamer({quality:'quick'});assert.ok(m.solve().converged);
  assert.equal(msg.kind,'ready');assert.equal(msg.generation,7);assert.equal(w.events[0].transfer.length,7);assert.ok(actual.isoLines.length>0&&actual.isoTriangles.length>0);
  const mesh=Geometry.electronIsoMesh(actual,.25);assert.deepEqual(Array.from(actual.isoTriangles),Array.from(mesh.positions));assert.deepEqual(Array.from(actual.isoNormals),Array.from(mesh.normals));
  assert.deepEqual(Array.from(actual.electrons),Array.from(m.snapshot().electrons));assert.deepEqual(Array.from(actual.potential),Array.from(m.snapshot().potential));
  w.send({type:'advance',generation:6,count:5});assert.equal(w.events.length,1);
  w.send({type:'advance',generation:7,count:3});for(let i=0;i<3;i++)assert.ok(m.step().ok);
  const frame=w.events.at(-1).data;assert.equal(frame.snapshot.stats.steps,3);assert.deepEqual(Array.from(frame.snapshot.ions),Array.from(m.snapshot().ions));
});
test('worker pauses at the explicit numerical budget and does not call it a breakdown criterion',()=>{
  const w=harness();w.send({type:'init',generation:2,options:{quality:'quick',field:1.5,amplitude:.15},warm:8});
  const ready=w.events.at(-1).data;assert.equal(ready.kind,'ready');assert.match(ready.halt,/不是物理击穿判据/);
  assert.ok(Math.max(ready.snapshot.stats.maxElectron,ready.snapshot.stats.maxIon)>=30);assert.ok(ready.snapshot.stats.residual<=2e-5);
  w.send({type:'advance',generation:2,count:8});const next=w.events.at(-1).data;
  assert.equal(next.snapshot.stats.steps,ready.snapshot.stats.steps);assert.deepEqual(Array.from(next.snapshot.electrons),Array.from(ready.snapshot.electrons));
});
test('failed field steps retain the previous valid state and report the reason',()=>{
  const w=harness();w.send({type:'init',generation:1,options:{quality:'quick',tolerance:1e-7},warm:0});const before=w.events.at(-1).data.snapshot;
  vm.runInContext('model.maxSweeps=1;',w.context);w.send({type:'advance',generation:1,count:1});const next=w.events.at(-1).data;
  assert.match(next.halt,/保留上一个有效状态/);assert.equal(next.snapshot.stats.steps,0);assert.deepEqual(Array.from(next.snapshot.electrons),Array.from(before.electrons));
  assert.deepEqual(Array.from(next.snapshot.potential),Array.from(before.potential));assert.equal(next.snapshot.stats.residual,before.stats.residual);
});
test('failed initial field is reported instead of delivering an unconverged frame',()=>{
  const w=harness();w.send({type:'init',generation:3,options:{quality:'quick',maxSweeps:1,tolerance:1e-7},warm:0});
  assert.equal(w.events.length,1);assert.equal(w.events[0].data.kind,'error');assert.match(w.events[0].data.message,/未收敛/);
});
