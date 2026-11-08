#!/usr/bin/env node
import assert from 'node:assert/strict';
import { PathsApp } from '../src/paths.js';
import {
  PI_DEFAULTS, PI_PRESETS, piABPhase, piAmpAt, piBarrierAction, piFluxTubeY, piPathSpiral,
  piHasBarrier, piNormalizeFluxObjects, piNormalizeBarrierObjects, piSlits,
} from '../src/physics/paths.js';

const close=(a,b,tol=1e-11)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} (tol ${tol})`);
const base={L1:160,L2:400,ys:0,d:48,w:8,nslit:2,flux:0.37,barrier:0.04,barrierWidth:12,barrierXWidth:12,modes:1,K:8,W:8,nxi:5,nY:17,yFov:80,openA:true,openB:true,eps:0};
const tube={id:'flux-main',x:base.L1,y:piFluxTubeY(base),flux:base.flux};
const fluxes=piNormalizeFluxObjects([tube],base);
for(const slit of piSlits(base))for(const Y of [-75,-15,0,33,82]){
  close(piABPhase(slit,base,Y),piABPhase(slit,{...base,fluxObjects:fluxes},Y));
}
const split=[
  {id:'flux-a',x:132,y:13,flux:0.25},
  {id:'flux-b',x:375,y:-22,flux:-0.4},
];
const both=piNormalizeFluxObjects(split,base);
for(const slit of piSlits(base))for(const Y of [-60,0,47]){
  close(piABPhase(slit,{...base,fluxObjects:both},Y),
    piABPhase(slit,{...base,fluxObjects:[both[0]]},Y)+piABPhase(slit,{...base,fluxObjects:[both[1]]},Y));
}
assert.throws(()=>piNormalizeFluxObjects(Array.from({length:9},(_,i)=>({id:`f${i}`,x:100,y:0,flux:0.1})),base),/at most 8/);
assert.throws(()=>piNormalizeFluxObjects([{...tube,id:'bad/id'}],base),/invalid source/);
assert.throws(()=>piNormalizeFluxObjects([tube,{...tube}],base),/invalid source/);

const legacyBarrier={V0:base.barrier,x:base.L1+base.L2/2,y:0,sigmaX:base.barrierXWidth,sigmaY:base.barrierWidth};
const barrierObjects=piNormalizeBarrierObjects([legacyBarrier],base);
close(piBarrierAction(base.L2,base.L1,24,35,[3],base),piBarrierAction(base.L2,base.L1,24,35,[3],{...base,barrierObjects}));
const twoBarrier=piNormalizeBarrierObjects([
  {id:'well-a',x:195,y:-12,V0:-0.08,sigmaX:18,sigmaY:9},
  {id:'barrier-b',x:420,y:20,V0:0.11,sigmaX:24,sigmaY:15},
],base);
const a=piBarrierAction(base.L2,base.L1,24,35,[3],{...base,barrierObjects:[twoBarrier[0]]});
const b=piBarrierAction(base.L2,base.L1,24,35,[3],{...base,barrierObjects:[twoBarrier[1]]});
close(piBarrierAction(base.L2,base.L1,24,35,[3],{...base,barrierObjects:twoBarrier}),a+b);
assert.ok(piHasBarrier({barrierObjects:twoBarrier}));
assert.ok(piHasBarrier({barrier:-0.04}),'negative legacy scalar potentials use the path-integral branch too');
assert.ok(piHasBarrier({barrierObjects:[{V0:-0.1}]}),'negative Gaussian wells use the path-integral branch too');
assert.throws(()=>piNormalizeBarrierObjects([{...legacyBarrier,sigmaX:81}],base),/invalid source/);
assert.throws(()=>piNormalizeBarrierObjects(Array.from({length:9},(_,i)=>({...legacyBarrier,id:`b${i}`})),base),/at most 8/);

// The physics API remains backward compatible: one central tube/barrier in object form
// reproduces legacy single-source amplitudes; source contributions sum in phase/action.
const oldFlux={...base,barrier:0,flux:0.37};
const newFlux={...oldFlux,fluxObjects:fluxes};
for(const Y of [-40,0,38]){
  const x=piAmpAt(Y,oldFlux),y=piAmpAt(Y,newFlux);
  close(x.raw.re,y.raw.re,1e-9);close(x.raw.im,y.raw.im,1e-9);
}
const oldBarrier={...base,flux:0,barrier:0.04};
const newBarrier={...oldBarrier,barrierObjects:barrierObjects};
close(piAmpAt(12,oldBarrier).raw.re,piAmpAt(12,{...oldBarrier,barrierObjects:[]}).raw.re,1e-9);
close(piABPhase(24,oldFlux,10),piABPhase(24,{...oldFlux,fluxObjects:[]},10));
for(const Y of [-20,12]){
  const x=piAmpAt(Y,oldBarrier),y=piAmpAt(Y,newBarrier);
  close(x.raw.re,y.raw.re,1e-9);close(x.raw.im,y.raw.im,1e-9);
}
const multiBarrier={...base,barrier:0,barrierObjects:twoBarrier,Y:19};
const spiral=piPathSpiral(multiBarrier),amplitude=piAmpAt(19,multiBarrier).raw;
close(spiral.total.re,amplitude.re,1e-9);close(spiral.total.im,amplitude.im,1e-9);

function fakeApp(){
  const app=Object.create(PathsApp.prototype);
  app.state={preset:'double',proj:'2d',L1:base.L1,L2:base.L2,d:base.d,w:base.w,W:base.W,flux:0,barrier:0,
    barrierWidth:12,barrierXWidth:12,fluxObjects:[],barrierObjects:[],selectedFluxId:null,selectedBarrierId:null,
    K:8,modes:1,nxi:5,Y:0,openA:true,openB:true,coherent:true,nslit:2,eps:0};
  app.view={yFov:120};app.cam={yaw:0,pitch:0,dist:8};app._sourceSeq=1;
  app.syncPanel=()=>{};app.syncSourcePanels=()=>{};app.syncStateUrl=()=>{};app._touch=()=>{};
  return app;
}
const app=fakeApp();
const fid=app.addFluxObject();assert.ok(fid);assert.equal(app.state.fluxObjects.length,1);
app.setParam('flux',-0.3);assert.equal(app.state.fluxObjects[0].flux,-0.3);
app.setParam('fluxX',220);app.setParam('fluxY',18);
assert.equal(app.state.fluxObjects[0].x,220);assert.equal(app.state.fluxObjects[0].y,18);
const fid2=app.addFluxObject();app.setParam('flux',0.6);
assert.notEqual(fid,fid2);assert.equal(app.state.fluxObjects[0].flux,-0.3);assert.equal(app.state.fluxObjects[1].flux,0.6);
const bid=app.addBarrierObject();assert.ok(bid);assert.equal(app.state.barrierObjects[0].V0,0.05);
app.setParam('barrier',-0.075);app.setParam('barrierX',300);app.setParam('barrierY',-16);
app.setParam('barrierXWidth',20);app.setParam('barrierWidth',14);
assert.deepEqual(app.state.barrierObjects[0],{id:bid,x:300,y:-16,V0:-0.075,sigmaX:20,sigmaY:14});
assert.equal(app.duplicateBarrierObject(),true);assert.equal(app.state.barrierObjects.length,2);
const duplicate=app.state.barrierObjects[1];app.setParam('barrier',0.12);
assert.equal(app.state.barrierObjects[0].V0,-0.075);assert.equal(duplicate.V0,0.12);
assert.equal(app.deleteBarrierObject(),true);assert.equal(app.state.barrierObjects.length,1);
assert.equal(app.deleteFluxObject(),true);assert.equal(app.state.fluxObjects.length,1);
assert.equal(app.deleteFluxObject(),true);assert.equal(app.state.fluxObjects.length,0);
const capped=fakeApp();for(let i=0;i<8;i++)assert.ok(capped.addFluxObject());
assert.equal(capped.addFluxObject(),false);assert.equal(capped.state.fluxObjects.length,8);

// State links carry the full source arrays, selection, and the surrounding simulation values.
const urlApp=fakeApp();urlApp.state.fluxObjects=both.map(o=>({...o}));urlApp.state.selectedFluxId='flux-b';
urlApp.state.barrierObjects=twoBarrier.map(o=>({...o}));urlApp.state.selectedBarrierId='well-a';
urlApp.state.proj='3d';urlApp.cam={yaw:0.5,pitch:0.3,dist:7.2};delete urlApp.syncStateUrl;
const oldLocation=globalThis.location,oldHistory=globalThis.history;
globalThis.location={search:'',pathname:'/paths.html',hash:''};
let lastUrl='';globalThis.history={state:null,replaceState(_s,_t,url){lastUrl=url;}};
urlApp.syncStateUrl();const query=new URL(lastUrl,'https://example.test').searchParams;
assert.equal(JSON.parse(query.get('fobj')).length,2);assert.equal(JSON.parse(query.get('bobj')).length,2);
assert.equal(query.get('fsel'),'flux-b');assert.equal(query.get('bsel'),'well-a');assert.equal(query.get('L1'),String(base.L1));
assert.equal(query.get('proj'),'3d');assert.equal(query.get('cam'),'0.500,0.300,7.200');
if(oldLocation===undefined)delete globalThis.location;else globalThis.location=oldLocation;
if(oldHistory===undefined)delete globalThis.history;else globalThis.history=oldHistory;

console.log('Path-page additive AB flux sources, Gaussian potential sources, legacy equivalence, object editing, validation, and share-link serialization PASS');
