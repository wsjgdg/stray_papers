'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ReturnStroke,LIGHT_SPEED}=require('../lightning-return.js'),{Discharge}=require('../lightning-model.js');
function straight(n){
  const segments=[],mask=new Uint8Array(2*(n+1));for(let y=0;y<n;y++)segments.push(2*y,2*y+2);mask[2*n]=2;
  return {nx:2,ny:n+1,nz:1,segments,mask,seedSegmentCount:0,stats:{complete:true}};
}
function branched(){
  const mask=new Uint8Array(15);mask[13]=2;
  return {nx:3,ny:5,nz:1,segments:[1,4,4,7,4,3,3,6,7,10,10,13],mask,seedSegmentCount:0,stats:{complete:true}};
}
function advance(m,t){while(m.time+0.1*m.dt<t){const r=m.step();assert.ok(r.ok,r.reason);}}
function near(a,b,tol){assert.ok(Math.abs(a-b)<=tol,`${a} versus ${b}, tolerance ${tol}`);}
test('a lossless precharged uniform line has finite travel time and the expected V0/Z0 current',()=>{
  const m=new ReturnStroke(straight(100),{height:2000,voltage:10e6,resistance:0,groundResistance:0,parts:1});
  near(m.waveSpeed,1e8,1e-6);near(m.impedance,200,1e-12);m.setOutputInterval(.02e-6);
  let p=0;for(let i=1;i<m.mainIndices.length;i++)if(Math.abs(m.mainDistances[i]-1000)<Math.abs(m.mainDistances[p]-1000))p=i;
  const mid=m.mainIndices[p];advance(m,5e-6);assert.ok(Math.abs(m.current[mid])<1,'far end is not instantaneously driven');
  let arrival=null,sum=0,n=0;
  while(m.time<13e-6){
    if(arrival===null&&Math.abs(m.current[mid])>=.25*m.voltageMagnitude/m.impedance)arrival=m.time;
    if(m.time>=6e-6&&m.time<=12e-6){sum+=m.stats().groundCurrent;n++;}assert.ok(m.step().ok);
  }
  assert.ok(arrival!==null);near(arrival,m.mainDistances[p]/m.waveSpeed,.25e-6);
  near(sum/n,m.voltageMagnitude/m.impedance,1500);assert.ok(m.waveSpeed<LIGHT_SPEED);
  near(m.stats().energyError,0,m.initialEnergy*2e-12);near(m.stats().chargeError,0,1e-11);
});
test('branch capacitance produces transient branch current even though its steady DC end is open',()=>{
  const m=new ReturnStroke(branched(),{height:2000,resistance:.1,groundResistance:10});m.setOutputInterval(.1e-6);
  const branchEdge=2*m.parts;advance(m,2e-6);assert.ok(Math.abs(m.current[branchEdge])<1e-5);
  let peak=0;while(m.time<50e-6){assert.ok(m.step().ok);peak=Math.max(peak,Math.abs(m.current[branchEdge]));}
  assert.ok(peak>100,'open branch is charged and can carry transient current');assert.ok(m.heat[branchEdge]>0);
  const s=m.stats();assert.ok(s.channelHeat>0&&s.groundLoss>0);near(s.energyError,0,m.initialEnergy*2e-12);near(s.chargeError,0,1e-11);
});
test('the staggered discrete energy and charge budgets close with resistance and a ground load',()=>{
  const m=new ReturnStroke(branched(),{height:3000,voltage:15e6,resistance:.4,inductance:3e-6,capacitance:60e-12,groundResistance:60});
  m.setOutputInterval(.2e-6);advance(m,75e-6);const s=m.stats();
  assert.ok(s.channelHeat>0&&s.groundLoss>0&&s.stored>=0);near(s.energyError,0,m.initialEnergy*3e-12);near(s.chargeError,0,2e-11);
  const totalHeat=m.heat.reduce((a,b)=>a+b,0);near(totalHeat,m.channelHeat,m.initialEnergy*1e-12);
  const cur=new Float32Array(m.edges),h=new Float32Array(m.edges),v=new Float32Array(m.edges);m.capture(cur,h,v);
  for(let i=0;i<m.edges;i++){near(cur[i],m.current[i],Math.max(.01,Math.abs(m.current[i])*1e-6));near(h[i],m.heat[i]/m.lengths[i],Math.max(1e-5,h[i]*1e-6));assert.ok(Number.isFinite(v[i]));}
});
test('arrival-time error decreases when a straight channel is spatially refined',()=>{
  const errors=[];
  for(const n of [20,50,100]){
    const m=new ReturnStroke(straight(n),{height:2000,resistance:0,groundResistance:0,parts:1});m.setOutputInterval(.02e-6);
    let p=0;for(let i=1;i<m.mainIndices.length;i++)if(Math.abs(m.mainDistances[i]-1000)<Math.abs(m.mainDistances[p]-1000))p=i;
    while(m.time<15e-6&&Math.abs(m.current[m.mainIndices[p]])<.25*m.voltageMagnitude/m.impedance)assert.ok(m.step().ok);
    errors.push(Math.abs(m.time-m.mainDistances[p]/m.waveSpeed));
  }
  assert.ok(errors[1]<errors[0]&&errors[2]<errors[1],String(errors));
});
test('invalid topologies, nonphysical parameters and unstable time steps are rejected',()=>{
  const s=branched();assert.throws(()=>new ReturnStroke({...s,stats:{complete:false}}),/已接触/);
  assert.throws(()=>new ReturnStroke({...s,segments:[1,4,2,13]}),/连接无效/);
  assert.throws(()=>new ReturnStroke({...s,segments:[1,7,7,13]}),/相邻/);
  const bad={...s,mask:s.mask.slice()};bad.mask[13]=0;assert.throws(()=>new ReturnStroke(bad),/目标/);
  assert.throws(()=>new ReturnStroke(s,{inductance:.1e-6,capacitance:1e-12}),/光速/);
  assert.throws(()=>new ReturnStroke(s,{resistance:-.1}),/电阻/);
  const m=new ReturnStroke(s);assert.throws(()=>m.setDt(m.maxDt*1.01),/步长/);m.setDt(m.maxDt*.5);m.step();assert.throws(()=>m.setDt(m.maxDt*.2),/开始后/);
});
test('real contact topology, source-electrode scaffold and user parameters stay independent of DBM',()=>{
  const d=new Discharge({quality:'quick',electrodeShape:'blunt',electrodeRadius:.08,electrodeLength:.16,eta:6,seed:3});assert.ok(d.solve().converged);
  for(let i=0;i<300&&!d.complete;i++)assert.ok(d.step().ok);assert.ok(d.complete);
  const frame=d.snapshot(),original=Array.from(frame.segments);
  const a=new ReturnStroke(frame,{voltage:10e6,groundResistance:0}),b=new ReturnStroke(frame,{voltage:20e6,groundResistance:0});
  assert.equal(a.edges,(frame.segments.length/2-frame.seedSegmentCount)*4);assert.equal(a.mainIndices[0],a.groundEdge);assert.ok(a.totalLength>a.mainLength);
  a.setOutputInterval(.1e-6);b.setOutputInterval(.1e-6);advance(a,4e-6);advance(b,4e-6);
  near(b.stats().groundCurrent,2*a.stats().groundCurrent,1e-7);near(b.channelHeat,4*a.channelHeat,1e-7);
  assert.deepEqual(Array.from(frame.segments),original);near(a.stats().energyError,0,a.initialEnergy*2e-12);
});
test('a numerical safety failure leaves the last committed state untouched',()=>{
  const m=new ReturnStroke(branched());m.setOutputInterval(.2e-6);advance(m,1e-6);m.alpha[0]=Infinity;
  const prev={v:Array.from(m.voltage),i:Array.from(m.current),heat:Array.from(m.heat),time:m.time,q:m.groundCharge};const r=m.step();
  assert.equal(r.ok,false);assert.match(r.reason,/不是物理击穿判据/);assert.deepEqual(Array.from(m.voltage),prev.v);assert.deepEqual(Array.from(m.current),prev.i);assert.deepEqual(Array.from(m.heat),prev.heat);assert.equal(m.time,prev.time);assert.equal(m.groundCharge,prev.q);
});

test('the full user-facing parameter extremes remain finite, passive and subluminal',()=>{
  const d=new Discharge({quality:'quick',eta:4.6,seed:27});assert.ok(d.solve().converged);while(!d.complete&&d.steps<200)assert.ok(d.step().ok);assert.ok(d.complete);const snapshot=d.snapshot();
  for(const height of [500,5000])for(const voltage of [1e6,30e6])for(const r of [.02,.8])for(const [l,c] of [[1e-6,20e-12],[8e-6,120e-12]])for(const groundResistance of [0,100]){
    const m=new ReturnStroke(snapshot,{height,voltage,resistance:r,inductance:l,capacitance:c,groundResistance});m.setOutputInterval(.5e-6);advance(m,10e-6);
    const s=m.stats();assert.ok(m.waveSpeed<LIGHT_SPEED);assert.ok(m.voltage.every(Number.isFinite)&&m.current.every(Number.isFinite));assert.ok(s.stored>=0&&s.channelHeat>=0&&s.groundLoss>=0);near(s.energyError,0,m.initialEnergy*1e-10);near(s.chargeError,0,Math.max(1e-9,Math.abs(m.initialCharge)*1e-10));
  }
});

test('an open top reflects the lossless wave; sign reversal is not an invented second stroke',()=>{
  const m=new ReturnStroke(straight(100),{height:2000,resistance:0,groundResistance:0,parts:1});m.setOutputInterval(.05e-6);
  advance(m,15e-6);assert.ok(m.stats().groundCurrent>30000);advance(m,50e-6);assert.ok(m.stats().groundCurrent< -30000);near(m.stats().energyError,0,m.initialEnergy*2e-12);
});
