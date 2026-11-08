#!/usr/bin/env node
import assert from 'node:assert/strict';
import { LOCAL_FIELD_SHAPES, normalizeLocalFieldObjects, composeLocalField } from '../src/physics/localfield.js';
import { hbSector, hbSetField, hbProductFromPattern, hbEnergy } from '../src/physics/hubbard.js';
import { HubbardApp } from '../src/hubbard.js';

const close=(a,b,tol=1e-11)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const objects=[
  {id:'g',shape:'gaussian',center:3,width:1,amp:-2},
  {id:'b',shape:'box',center:1,width:1,amp:1},
  {id:'s',shape:'staggered',center:5,width:2,amp:0.5},
];
const base=new Float64Array(8);base[7]=0.25;
const field=composeLocalField(8,base,objects,{maxAmplitude:6});
close(field[3],-1.5);
close(field[2],-2*Math.exp(-0.5)+1);
close(field[0],-2*Math.exp(-4.5)+1);
close(field[5],-2*Math.exp(-2)+0.5);
close(field[6],-2*Math.exp(-4.5)-0.5);
close(field[7],0.25+0.5-2*Math.exp(-8));
assert.deepEqual(normalizeLocalFieldObjects(8,objects,{maxAmplitude:6}),objects);
assert.deepEqual(LOCAL_FIELD_SHAPES,['gaussian','box','staggered']);
assert.throws(()=>normalizeLocalFieldObjects(8,[...objects,{...objects[0]}]),/duplicate id/);
assert.throws(()=>normalizeLocalFieldObjects(8,[{id:'bad',shape:'box',center:0,width:1,amp:6.1}],{maxAmplitude:6}),/invalid field object/);
assert.throws(()=>composeLocalField(8,new Float64Array(7),[]),/length/);

// The composed potential enters the diagonal Hubbard term without changing the fixed-N sector.
const sec0=hbSector(8,4,4),secF=hbSector(8,4,4);
hbSetField(sec0,null);hbSetField(secF,field);
const pat=Int8Array.from([1,2,3,0,1,2,0,3]);
const psi=hbProductFromPattern(sec0,pat);
const delta=hbEnergy(secF,psi.re,psi.im,1,2)-hbEnergy(sec0,psi.re,psi.im,1,2);
let expected=0;for(let i=0;i<8;i++)expected+=field[i]*((pat[i]&1?1:0)+(pat[i]&2?1:0));
close(delta,expected);
assert.equal(secF.dim,sec0.dim);

function makeApp(){
  const app=Object.create(HubbardApp.prototype),els=new Map();
  app.state={preset:'quench',L:8,U:2,mode:'evo',tool:'object',muDepth:2,muSign:-1,mu:new Float64Array(8),muBase:new Float64Array(8),
    fieldObjects:normalizeLocalFieldObjects(8,objects,{maxAmplitude:6}),selectedFieldObject:'g',objectShape:'gaussian',objectAmp:-1.5,objectWidth:1.5,
    pat:Int8Array.from([1,2,1,2,1,2,1,2]),nUp:4,nDn:4,t:0,frames:0,paused:false,view:'Sx',proj:'2d',Umax:8};
  app.container={querySelectorAll:()=>[]};
  app.q=s=>{if(!els.has(s))els.set(s,{value:'',textContent:'',disabled:false,classList:{toggle(){}}});return els.get(s);};
  app.syncObjectPanel=()=>{};app.syncPanel=()=>{};app.draw=()=>{};app.measureAll=()=>{};app.afterHChange=()=>{};app.queueUrl=()=>{};app.toast=()=>{};
  app.sec=hbSector(8,4,4);app.re=new Float64Array(app.sec.dim);app.im=new Float64Array(app.sec.dim);
  app.state.muBase.set(base);app.rebuildField();app._nextFieldObjectId=1;
  app.proto=null;app.protoSaved=null;app.protoStart=0;app.hist=[];app.job=null;app.gapJob=null;app.gap=null;
  return app;
}
const app=makeApp();
const saved=app.serialize(),params=new URLSearchParams(app.queryFor(saved)),parsed=app.readUrlSpec(params);
assert.equal(parsed.fieldObjects.length,3);
assert.deepEqual(Array.from(parsed.mu),Array.from(base));
assert.equal(parsed.selectedFieldObject,'g');
const imported=makeApp();
assert.equal(imported.applySpec(saved),true);
assert.deepEqual(imported.state.fieldObjects,saved.fieldObjects);
assert.deepEqual(Array.from(imported.state.mu),Array.from(app.state.mu));
assert.equal(imported.state.selectedFieldObject,'g');
assert.equal(await imported.importJsonFile({text:async()=>JSON.stringify(saved)}),true);
const stable=JSON.stringify(imported.serialize());
assert.equal(imported.applySpec({...saved,fieldObjects:[{id:'x',shape:'ring',center:1,width:1,amp:1}]}),false);
assert.equal(JSON.stringify(imported.serialize()),stable,'invalid object import must not partially apply');

const editing=makeApp();
const id=editing.addFieldObject(6,{shape:'box',width:1,amp:1.25});assert.ok(id);
editing.setObjectShape('staggered');editing.setObjectProperty('amp',-2);editing.moveFieldObject(id,4);
let edited=editing.state.fieldObjects.find(o=>o.id===id);
assert.equal(edited.shape,'staggered');assert.equal(edited.amp,-2);assert.equal(edited.center,4);
assert.equal(editing.duplicateFieldObject(),true);assert.equal(editing.state.fieldObjects.length,5);
assert.equal(editing.deleteFieldObject(),true);assert.equal(editing.state.fieldObjects.length,4);
editing.clearField(false);assert.equal(editing.state.fieldObjects.length,0);assert.equal(editing.hasField(),false);

// Protocol μ pulses are temporary overlays. Stopping restores the recomposed editable scene,
// including brush/object edits made while the pulse is active (not a stale μ snapshot).
const proto=makeApp();
proto.startProtocol('pulse');proto.state.t=proto.protoStart+proto.proto.T/2;proto.applyProtocol(true);
assert.ok(proto.state.mu[0] < -3.0,'pulse should add a temporary local well over the static scene');
const staticBefore=composeLocalField(8,proto.state.muBase,proto.state.fieldObjects,{maxAmplitude:6});
proto.paintSite(7,-1);
assert.notEqual(proto.state.mu[7],staticBefore[7],'brush edit remains visible while protocol is active');
proto.stopProtocol(true);
const staticAfter=composeLocalField(8,proto.state.muBase,proto.state.fieldObjects,{maxAmplitude:6});
assert.deepEqual(Array.from(proto.state.mu),Array.from(staticAfter));
assert.equal(proto.proto,null);assert.equal(proto.protoSaved,null);
console.log('Hubbard additive potential objects, Hamiltonian binding, editing, URL/JSON round-trip, invalid-import atomicity, and protocol restoration PASS');
