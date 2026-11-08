'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),{Study,binder,aggregate}=require('../ising-size-core.js');
const near=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const base={structure:C.preset('cP'),sizes:[2,4],seeds:2,seed:123,warm:2,samples:16,points:3,min:1,max:3};
function run(options){const s=new Study(options),last=new Map();while(!s.done){const r=s.step();if(r.point)last.set(r.point.size+':'+r.point.temperature,r.point);}return {s,points:[...last.values()]};}
test('independent multiseed study is reproducible, accumulates moments and matches an independently advanced chain',()=>{
  const a=run(base),b=run(base);assert.deepEqual(a.points,b.points);assert.equal(a.points.length,6);assert.equal(a.s.completed,a.s.total);assert.equal(a.s.details[0].mode,'uniform');
  const point=a.points.find(p=>p.size===4&&p.temperature===1),seed=123+4*1009,model=new G.IsingCrystal({structure:base.structure,size:4,seed,field:0,temperature:1,initial:'random'});
  let m=0,m2=0,m4=0,e=0,e2=0;model.sweep(2,false);for(let i=0;i<16;i++){model.sweep(1,false);const v=model.spinSum/model.spinCount,x=model.energy/model.spinCount;m+=v;m2+=v*v;m4+=v**4;e+=x;e2+=x*x;}
  const rep=point.replicates[0];near(rep.m,m/16);near(rep.m2,m2/16);near(rep.m4,m4/16);near(rep.e,e/16);near(rep.binder,binder(m2/16,m4/16));near(rep.heatCapacity,64*(e2/16-(e/16)**2));assert.notEqual(a.points.find(p=>p.size===2).replicates[0].seed,seed);
  const reps=point.replicates,pooledM2=(reps[0].m2+reps[1].m2)/2,pooledM4=(reps[0].m4+reps[1].m4)/2;near(point.binder,binder(pooledM2,pooledM4));assert.ok(point.binderSD>=0);
});
test('Binder order is shown only for a suitable connected ferro or bipartite antiferromagnetic graph',()=>{
  let result=run({...base,sizes:[3,4],jSame:-1});assert.equal(result.s.details[0].mode,'none');assert.ok(result.s.details[0].frustratedLoops>0);assert.equal(result.s.details[1].mode,'staggered');assert.ok(result.points.filter(p=>p.size===3).every(p=>p.binder===null&&p.susceptibility===null));assert.ok(result.points.filter(p=>p.size===4).every(p=>p.binder!==null));
  result=run({...base,structure:C.preset('hcp'),sizes:[2,3],jSame:-1});assert.ok(result.s.details.every(d=>d.mode==='none'&&d.frustratedLoops>0));assert.ok(result.points.every(p=>p.binder===null&&Number.isFinite(p.heatCapacity)));
});
test('finite shape and coupling rules feed every studied graph and resource limits are enforced',()=>{
  const o={...base,shape:'sphere',pairRules:[{a:'X1',b:'X1',shell:1,j:-1}]},s=new Study(o);assert.equal(s.options.shape,'sphere');assert.deepEqual(s.options.pairRules,o.pairRules);assert.ok(s.details[1].spinCount<64);assert.ok(s.models.every(m=>m.topology.couplings.every(x=>x===-1)));
  assert.throws(()=>new Study({...base,sizes:[4,4]}),/不同/);assert.throws(()=>new Study({...base,seeds:1}),/预算/);assert.throws(()=>new Study({...base,min:2,max:1}),/温度/);assert.throws(()=>new Study({...base,sizes:[16,20],seeds:8,warm:512,samples:512,points:21}),/预算/);
});

test('fluctuations average within-seed variances and undefined seed Binder does not produce a misleading spread',()=>{
  const r=[{m:1,m2:1,m4:1,absM:1,e:0,e2:0,samples:16,susceptibility:0,binder:2/3,heatCapacity:0},{m:-1,m2:1,m4:1,absM:1,e:0,e2:0,samples:16,susceptibility:0,binder:2/3,heatCapacity:0}];
  const p=aggregate(r,1,4,'uniform',64);near(p.susceptibility,0);near(p.binder,2/3);near(p.heatCapacity,0);
  r.push({...r[0],m:0,m2:0,m4:0,absM:0,binder:null});const q=aggregate(r,1,4,'uniform',64);assert.equal(q.binderSD,null);assert.ok(Number.isFinite(q.binder));
});
