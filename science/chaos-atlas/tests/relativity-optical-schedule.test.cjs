'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(__dirname,'..');

test('cached-ray fast schedule is disabled for one/unknown core and data-saving mode',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'relativity-renderer.js'),'utf8'),context);
  const allowed=context.window.RelativityRenderer.fastStillAllowed;
  for(const device of [undefined,{}, {hardwareConcurrency:0},{hardwareConcurrency:1},{hardwareConcurrency:2,connection:{saveData:true}},{hardwareConcurrency:8,connection:{saveData:true}}])assert.equal(allowed(device),false);
  for(const device of [{hardwareConcurrency:2},{hardwareConcurrency:4,connection:{saveData:false}}])assert.equal(allowed(device),true);
});

test('only a populated matching Canvas buffer uses shorter Worker yields',()=>{
  const context=vm.createContext({self:{},importScripts(){},setTimeout(){return 1;},clearTimeout(){},postMessage(){}});
  vm.runInContext(fs.readFileSync(path.join(dir,'relativity-render-worker.js'),'utf8'),context);
  const run=s=>vm.runInContext(s,context);
  assert.equal(run("stillDelay({kind:'canvas',job:{reusesGeometry:true}})"),12);
  run('fastStill=true');
  assert.equal(run("stillDelay({kind:'canvas',job:{reusesGeometry:true}})"),4);
  assert.equal(run("stillDelay({kind:'canvas',job:{reusesGeometry:false}})"),12);
  assert.equal(run("stillDelay({kind:'canvas',job:{}})"),12);
  assert.equal(run("stillDelay({kind:'webgl',job:{reusesGeometry:true}})"),12);
});

test('unreported or low device memory keeps the eight MiB intermediate budget',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dir,'relativity-renderer.js'),'utf8'),context);
  const budget=context.window.RelativityRenderer.intermediateBudget,MiB=1024*1024;
  assert.equal(budget(undefined),8*MiB);assert.equal(budget(0),8*MiB);assert.equal(budget(2),8*MiB);
  assert.equal(budget(4),24*MiB);assert.equal(budget(8),32*MiB);
});
