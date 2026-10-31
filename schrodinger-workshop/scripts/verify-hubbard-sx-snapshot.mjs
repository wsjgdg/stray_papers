#!/usr/bin/env node
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { hbSector, hbEntropyAt, hbKrylovExp } from '../src/physics/hubbard.js';
import { HubbardApp } from '../src/hubbard.js';

const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} (tol ${tol})`);
const L=8,sec=hbSector(L,L>>1,L>>1),re=new Float64Array(sec.dim),im=new Float64Array(sec.dim);
let norm=0;
for(let i=0;i<sec.dim;i++){
  re[i]=Math.sin((i+1)*0.013)+0.27*Math.cos((i+5)*0.031);
  im[i]=0.41*Math.cos((i+3)*0.019)-0.16*Math.sin((i+7)*0.037);
  norm+=re[i]*re[i]+im[i]*im[i];
}
const scale=1/Math.sqrt(norm);
for(let i=0;i<sec.dim;i++){re[i]*=scale;im[i]*=scale;}
const refRe=re.slice(),refIm=im.slice(),dt=0.035;
const expectedEvolution=hbKrylovExp(sec,re,im,1,4,dt,12);
assert.notEqual(expectedEvolution.re,re);assert.notEqual(expectedEvolution.im,im);
assert.deepEqual(re,refRe);assert.deepEqual(im,refIm,'Krylov evolution must not mutate the published input vectors');

const expectedProfile=new Float64Array(L+1);
for(let c=1;c<L;c++)expectedProfile[c]=hbEntropyAt(sec,refRe,refIm,c).S;
const app=Object.create(HubbardApp.prototype);
app.state={L,dt,spf:1,U:4,t:0,frames:0,mode:'evo'};
app.sec=sec;app.re=re;app.im=im;app.job=null;app.probe={sx:null,sxL:0};
app._dirty={sx:true,nk:true,nn:true};app.sxJob=null;app.sxMs=0;app.pushCheckpoint=()=>{};
app.startSx();
assert.strictEqual(app.sxJob.re,re,'S(x) task should retain, not copy, the published real vector');
assert.strictEqual(app.sxJob.im,im,'S(x) task should retain, not copy, the published imaginary vector');
const retainedRe=app.sxJob.re,retainedIm=app.sxJob.im;
app.evolveFrame();
assert.strictEqual(app.re.length,sec.dim);assert.notStrictEqual(app.re,retainedRe);
assert.notStrictEqual(app.im,retainedIm);
assert.deepEqual(retainedRe,refRe,'later evolution must leave the task snapshot unchanged');
assert.deepEqual(retainedIm,refIm,'later evolution must leave the task snapshot unchanged');
app.stepSx(10000);
assert.equal(app.sxJob,null);
for(let c=0;c<=L;c++)close(app.probe.sx[c],expectedProfile[c]);
assert.equal(app._dirty.sx,false);
const avoidedBytes=2*sec.dim*Float64Array.BYTES_PER_ELEMENT;
console.log(`Hubbard S(x) keeps immutable state-vector references across evolution, matches the prior-state profile, and avoids ${avoidedBytes} bytes of duplicate vector allocation at L=${L} PASS`);
