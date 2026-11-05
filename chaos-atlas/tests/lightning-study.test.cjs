'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Discharge}=require('../lightning-model.js'),Study=require('../lightning-study.js');
function close(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);}
test('statistics report all samples, censoring, sample standard deviation and Wilson interval',()=>{
  const samples=[{complete:true,junctions:2,length:.4,steps:20,residual:1e-6},{complete:false,junctions:4,length:.8,steps:30,residual:2e-6},{complete:false,junctions:3,length:.6,steps:30,residual:3e-6}];
  const s=Study.summarize(samples);assert.deepEqual([s.n,s.contact,s.censored],[3,1,2]);close(s.rate,1/3);close(s.junctions.mean,3);close(s.junctions.sd,1);close(s.length.mean,.6);close(s.length.sd,.2);close(s.steps.mean,80/3);assert.ok(s.interval[0]<s.rate&&s.interval[1]>s.rate);assert.equal(s.maxResidual,3e-6);
  const all=Study.summarize(samples.map(x=>({...x,complete:false})));assert.equal(all.rate,0);assert.equal(all.interval[0],0);assert.ok(all.interval[1]>0);
  assert.equal(Study.summarize([samples[0]]).junctions.sd,null,'sample standard deviation is undefined for n=1');
  assert.throws(()=>Study.summarize([]),/没有完成/);
});
test('growth length is the exact graph bond length excluding the electrode scaffold',()=>{
  const m=new Discharge({quality:'quick',electrodeShape:'blunt',electrodeRadius:.08,electrodeLength:.16,eta:4,seed:19});assert.ok(m.solve().converged);assert.equal(Study.measure(m).length,0);
  for(let i=0;i<12;i++)assert.ok(m.step().ok);let sum=0;for(let e=m.seedSegmentCount;e<m.segments.length/2;e++){
    const a=m.coords(m.segments[2*e]),b=m.coords(m.segments[2*e+1]);sum+=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*m.h;
  }
  const value=Study.measure(m);close(value.length,sum);assert.equal(value.steps,12);assert.equal(value.junctions,m.stats().junctions);assert.equal(value.seed,19);
});
