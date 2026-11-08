'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Discharge}=require('../lightning-model.js'),Event=require('../lightning-event.js');
function one(){const m=new Discharge({quality:'quick',eta:4,seed:19});assert.ok(m.solve().converged);for(let i=0;i<8;i++)assert.ok(m.step().ok);const before=m.snapshot();assert.ok(m.step().ok);return {m,before,after:m.snapshot()};}
function close(a,b,tol=1e-6){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}
test('one actual event compares the same two fields and free-space gradients',()=>{
  const {before,after}=one(),c=Event.compare(before,after);assert.equal(after.stats.steps,before.stats.steps+1);assert.ok(c.maxPhi>0&&c.maxE>0);assert.ok(c.best>=0);
  const id=c.best,nx=before.nx,ny=before.ny,s=nx*ny,h=before.h;
  function e(p){return Math.hypot((p[id+1]-p[id-1])/(2*h),(p[id+nx]-p[id-nx])/(2*h),(p[id+s]-p[id-s])/(2*h));}
  close(c.eb[id],e(before.potential));close(c.ea[id],e(after.potential));close(c.deltaE[id],e(after.potential)-e(before.potential));close(c.deltaPhi[id],after.potential[id]-before.potential[id]);
  const x=id%nx,j=(id-x)/nx,y=j%ny,z=(j-y)/ny,p=Event.sample(c,x,y,z);close(p.deltaE,c.deltaE[id]);
  const chosen=after.lastChoice.site,selected=Event.sample(c,chosen%nx,Math.floor(chosen/nx)%ny,Math.floor(chosen/(nx*ny)));
  assert.equal(selected.valid,false);assert.ok(selected.probBefore>0);assert.equal(selected.probAfter,null);assert.ok(Number.isNaN(selected.fieldAfter));
  const plane=Event.slice(c,'deltaE',z);assert.ok(plane.scale>0);assert.equal(plane.bytes.length,nx*ny*4);
});
test('contact and incompatible or stale snapshots never produce a post-event field',()=>{
  const {before,after}=one();assert.throws(()=>Event.compare(before,{...after,stats:{...after.stats,complete:true}}),/没有可比较/);
  assert.throws(()=>Event.compare(before,{...after,electrodeRadius:.08}),/电极或网格/);
  assert.throws(()=>Event.compare(before,{...after,eta:2}),/相邻/);assert.throws(()=>Event.compare(before,{...after,stats:{...after.stats,steps:after.stats.steps+1}}),/相邻/);
});
