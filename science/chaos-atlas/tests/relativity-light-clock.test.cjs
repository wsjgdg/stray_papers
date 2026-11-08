'use strict';const test=require('node:test'),assert=require('node:assert/strict'),C=require('../relativity-light-clock.js');
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('each end-to-end pulse segment and detector flash is null in the lab frame',()=>{
  for(const beta of [-.9,-.4,0,.6,.9])for(const angle of [-60,0,30,90,130]){
    const c=C.create({beta,angle,arm:3});for(let i=0;i<c.events.length;i++){
      const e=c.events[i];near(e.arrival-e.time,C.length(C.sub(e.position,c.detector)),1e-8);
      if(i){const p=c.events[i-1];near(e.time-p.time,C.length(C.sub(e.position,p.position)),1e-8);}
    }
  }
});
test('roundtrip time dilation and unequal longitudinal legs are distinct from signal delays',()=>{
  for(const beta of [-.8,0,.6,.9])for(const angle of [0,30,90]){
    const c=C.create({beta,angle,arm:4}),[a,b,a2]=c.events;near(a2.proper-a.proper,8);near(a2.time-a.time,8*c.gamma);near(c.roundTripLab,c.gamma*c.roundTripProper);
    near(b.time-a.time,c.gamma*c.arm*(1+beta*Math.cos(angle*Math.PI/180)));
    near(a2.time-b.time,c.gamma*c.arm*(1-beta*Math.cos(angle*Math.PI/180)));
    assert.ok(a2.arrival>=a2.time);near(c.at(1).clockB-c.at(1).clockA,-beta*c.arm*Math.cos(angle*Math.PI/180));
  }
});
test('zero speed clocks are synchronous and a current pulse remains on its null segment',()=>{
  const c=C.create({beta:0,angle:45,arm:2});near(c.at(0).clockA,c.at(0).clockB);near(c.events[1].time,2);near(c.events[2].time,4);
  const a=c.at(1);near(C.length(C.sub(a.photon,c.events[0].position)),1);assert.equal(a.leg,0);assert.throws(()=>c.at(-1),RangeError);
});
