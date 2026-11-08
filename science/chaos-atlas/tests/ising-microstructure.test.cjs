'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),M=require('../ising-microstructure.js');
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function graph(id='cP',size=4,more={}){return G.createTopology({structure:C.preset(id),size,...more});}
function state(t,fn){const s=new Int8Array(t.count);for(const i of t.activeIndices){const c=Math.floor(i/t.siteCount);s[i]=fn(c%t.size,Math.floor(c/t.size)%t.size,Math.floor(c/t.size**2),i);}return s;}
test('satisfaction and staggered order correctly distinguish cubic ferro and antiferromagnets',()=>{
  let t=graph(),s=state(t,()=>1),d=M.diagnostics(t,s);assert.equal(d.bonds,192);assert.equal(d.unsatisfiedBonds,0);assert.equal(d.satisfiedFraction,1);assert.equal(d.staggeredMagnetization,null);assert.equal(d.frustratedFundamentalLoops,0);
  t=graph('cP',4,{jSame:-1});s=state(t,(x,y,z)=>(x+y+z)%2?-1:1);d=M.diagnostics(t,s);assert.equal(d.unsatisfiedBonds,0);assert.equal(d.allAntiferromagnetic,true);near(d.absStaggered,1);assert.equal(d.signCompatible,true);assert.equal(d.cycle,null);
  s.fill(1);d=M.diagnostics(t,s);assert.equal(d.unsatisfiedBonds,192);near(d.satisfiedFraction,0);near(d.absStaggered,0);
});
test('geometric frustration returns an actual negative-sign fundamental loop, independently of the snapshot',()=>{
  const t=graph('hcp',4,{jSame:-1}),up=state(t,()=>1),checker=state(t,(x,y,z,i)=>i%2?1:-1),a=M.diagnostics(t,up),b=M.diagnostics(t,checker);
  assert.equal(a.signCompatible,false);assert.ok(a.frustratedFundamentalLoops>0);assert.equal(a.frustratedFundamentalLoops,b.frustratedFundamentalLoops);assert.equal(a.staggeredMagnetization,null);assert.ok(a.cycle.length>=3);assert.equal(a.cycle.sign,-1);assert.equal(a.cycle.edges.length,a.cycle.length);
  for(const e of a.cycle.edges){let found=false;for(let k=t.offsets[e.from];k<t.offsets[e.from+1];k++)if(t.targets[k]===e.to&&t.couplings[k]===e.j&&!!t.wrapped[k]===e.wrapped)found=true;assert.ok(found);}
});
test('same-spin components use real graph connectivity, including periodic boundaries and open masks',()=>{
  const t=graph(),uniform=state(t,()=>1),split=state(t,x=>x<2?1:-1),checker=state(t,(x,y,z)=>(x+y+z)%2?1:-1);
  let c=M.clusters(t,uniform);assert.equal(c.count,1);assert.equal(c.largest.size,64);assert.ok(t.activeIndices.every(i=>c.labels[i]===1));
  c=M.clusters(t,split);assert.equal(c.count,2);assert.deepEqual(c.groups.map(v=>v.size),[32,32]);assert.notEqual(c.labels[0],c.labels[2]);
  c=M.clusters(t,checker);assert.equal(c.count,64);assert.equal(c.largest.size,1);
  const sphere=graph('cP',4,{shape:'sphere'});c=M.clusters(sphere,state(sphere,()=>1));assert.equal(c.largest.size,27);assert.ok(c.labels.every((v,i)=>!!v===!!sphere.spinActive[i]));
});
test('directional correlations count actual translated same-basis pairs',()=>{
  const t=graph(),s=state(t,x=>x<2?1:-1),r=M.correlations(t,s,2);near(r.magnetization,0);assert.equal(r.points.length,3);assert.deepEqual(r.points[1].axes.map(a=>a.value),[0,1,1]);assert.deepEqual(r.points[2].axes.map(a=>a.value),[-1,1,1]);assert.deepEqual(r.points[1].axes.map(a=>a.count),[64,64,64]);
  const box=graph('cP',4,{shape:'box'}),c=M.correlations(box,state(box,()=>1),1);assert.deepEqual(c.points[1].axes.map(a=>a.count),[48,48,48]);
});
test('3D snapshot structure factor gives ferromagnetic and antiferromagnetic peaks at the expected q',()=>{
  const t=graph(),ferro=state(t,()=>1),af=state(t,(x,y,z)=>(x+y+z)%2?-1:1),f=M.structureFactor(t,ferro),g=M.structureFactor(t,af);
  const find=(r,h,k,l)=>r.points.find(v=>v.h===h&&v.k===k&&v.l===l).intensity;
  near(find(f,0,0,0),64);near(find(f,.5,.5,.5),0);near(find(g,0,0,0),0);near(find(g,.5,.5,.5),64);near(find(g,-.5,-.5,-.5),64);assert.equal(g.points.length,729);near(g.peak,64);
  const masked=graph('cP',4,{shape:'sphere'}),v=M.structureFactor(masked,state(masked,()=>1));near(v.points.find(q=>q.h===0&&q.k===0&&q.l===0).intensity,27);
});
