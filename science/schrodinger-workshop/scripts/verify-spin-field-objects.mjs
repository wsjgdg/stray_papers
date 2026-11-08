#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spComposeField, spNormalizeFieldObjects, spSector, spProduct, spEnergy } from '../src/physics/spin.js';
import { SpinApp } from '../src/spin.js';

const close=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const objects=[
  {id:'g',shape:'gaussian',center:3,width:1,amp:2},
  {id:'b',shape:'box',center:1,width:1,amp:1},
  {id:'s',shape:'staggered',center:5,width:2,amp:0.5},
];
const field=spComposeField(8,[0,0,0.25,0,0,0,0,0],objects);
close(field[3],2.5);
close(field[2],0.25+2*Math.exp(-0.5)+1);
close(field[0],1+2*Math.exp(-4.5)); // box edge is included
close(field[5],2*Math.exp(-2)+0.5);
close(field[6],2*Math.exp(-4.5)-0.5);
assert.deepEqual(spNormalizeFieldObjects(8,objects),objects);
assert.throws(()=>spNormalizeFieldObjects(8,[...objects,{...objects[0]}]),/duplicate id/);
assert.throws(()=>spNormalizeFieldObjects(8,[{id:'wide',shape:'box',center:2,width:8.5,amp:1}]),/invalid field object/);
assert.throws(()=>spNormalizeFieldObjects(8,[{id:'strong',shape:'box',center:2,width:1,amp:4.1}]),/invalid field object/);
assert.throws(()=>spNormalizeFieldObjects(8,Array.from({length:25},(_,i)=>({id:`o${i}`,shape:'box',center:0,width:1,amp:1}))),/object count/);
assert.throws(()=>spComposeField(8,null,[{shape:'ring',center:0,width:1,amp:1}]),/invalid field object/);
assert.throws(()=>spComposeField(8,new Float64Array(7),[]),/length/);

// The composed profile is supplied to the existing fixed-Sz XXZ sector; verify its
// diagonal Zeeman contribution against a product state without changing the sector.
const spins=[1,-1,1,-1,1,-1,1,-1];
const sector0=spSector(8,4,{J:1,delta:1,h:0});
const sectorField=spSector(8,4,{J:1,delta:1,h:0,field});
const state=spProduct(sector0,spins);
const shift=spEnergy(sectorField,state.re,state.im)-spEnergy(sector0,state.re,state.im);
const expected=-0.5*field.reduce((sum,b,i)=>sum+b*spins[i],0);
close(shift,expected);
assert.equal(sectorField.nUp,4);
assert.equal(sectorField.Sz,0);

// Exercise app-level scene serialization and URL parsing without a browser DOM.
function makeApp(){
  const app=Object.create(SpinApp.prototype),elements=new Map();
  app.state={preset:'xxx',L:8,delta:1,h:0,mode:'evo',tool:'object',view:'Sx',proj:'2d',nUp:4,
    spins:Int8Array.from(spins),t:0,frames:0,paused:false,dt:0.04,spf:2,bz:null,
    fieldBase:new Float64Array(8),fieldObjects:[],selectedFieldObject:null,
    objectShape:'gaussian',objectAmp:1.5,objectWidth:1.5};
  app.container={querySelectorAll:()=>[]};
  app.q=sel=>{if(!elements.has(sel))elements.set(sel,{value:'',textContent:''});return elements.get(sel);};
  app.syncObjectPanel=()=>{};app.syncPanel=()=>{};app.draw=()=>{};app.measureAll=()=>{};
  app.queueUrl=()=>{};app._nextFieldObjectId=1;
  app.state.fieldBase[7]=0.25;app.state.fieldObjects=spNormalizeFieldObjects(8,objects);
  app.state.selectedFieldObject='g';app.rebuildField();
  return app;
}
const sourceApp=makeApp(),saved=sourceApp.serialize();
const params=new URLSearchParams(sourceApp.queryFor(saved));
const fromUrl=sourceApp.readUrlSpec(params);
assert.equal(fromUrl.fieldObjects.length,3);
assert.equal(fromUrl.bz[7],0.25);
const importedApp=makeApp();
assert.equal(importedApp.applySpec(saved),true);
assert.deepEqual(importedApp.state.fieldObjects,saved.fieldObjects);
assert.deepEqual(Array.from(importedApp.state.bz),Array.from(sourceApp.state.bz));
assert.equal(importedApp.state.selectedFieldObject,'g');
assert.equal(importedApp.sec.Sz,0);
const beforeInvalid=JSON.stringify(importedApp.serialize());
assert.equal(importedApp.applySpec({...saved,fieldObjects:[{id:'bad',shape:'ring',center:1,width:1,amp:1}]}),false);
assert.equal(JSON.stringify(importedApp.serialize()),beforeInvalid,'invalid object import must be atomic');
const interactionApp=makeApp();
const addedId=interactionApp.addFieldObject(6,{shape:'box',width:1,amp:1.25});
assert.ok(addedId);
interactionApp.setObjectShape('staggered');
interactionApp.setObjectProperty('amp',-2);
let added=interactionApp.state.fieldObjects.find(o=>o.id===addedId);
assert.equal(added.shape,'staggered');assert.equal(added.amp,-2);
interactionApp.moveFieldObject(addedId,4);
assert.equal(added.center,4);
assert.equal(interactionApp.duplicateFieldObject(),true);
assert.equal(interactionApp.state.fieldObjects.length,5);
assert.equal(interactionApp.deleteFieldObject(),true);
assert.equal(interactionApp.state.fieldObjects.length,4);
interactionApp.clearField(false);
assert.equal(interactionApp.state.fieldObjects.length,0);
assert.equal(interactionApp.state.bz.some(v=>v!==0),false);
const profileApp=makeApp();
profileApp.measureAll=SpinApp.prototype.measureAll;profileApp.syncHud=()=>{};
profileApp.sec=spSector(8,4,{J:1,delta:1,h:0,field:profileApp.state.bz});
const profileState=spProduct(profileApp.sec,spins);profileApp.re=profileState.re;profileApp.im=profileState.im;
profileApp.hist=[];profileApp.state.t=0;profileApp.state.view='Sx';
const oldProfile=new Float64Array(9).fill(0.2),activeJob={sec:profileApp.sec,k:0,order:[1],out:new Float64Array(9),L:8,re:profileState.re.slice(),im:profileState.im.slice()};
profileApp._sxProf=oldProfile;profileApp._sxJob=activeJob;
profileApp.measureAll(false);
assert.equal(profileApp._sxJob,activeJob,'routine measurement must not restart an in-flight profile');
assert.equal(profileApp._sxProf,oldProfile,'keep the last complete S(x) visible while refreshing');
assert.ok(profileApp._sxPending,'queue only the latest evolving state');
profileApp._sxJob={sec:profileApp.sec,k:0,order:[],out:new Float64Array(9).fill(0.3),L:8,re:profileState.re.slice(),im:profileState.im.slice()};
profileApp.stepSx(8);
assert.ok(profileApp._sxJob,'finish current curve, then start the queued latest snapshot');
assert.equal(profileApp._sxProf[0],0);
assert.equal(profileApp._sxProf[8],0);
console.log('Spin field-object profiles, composition, validation, fixed-Sz binding, Zeeman energy, object lifecycle/serialization, and non-flashing S(x) refresh PASS');
