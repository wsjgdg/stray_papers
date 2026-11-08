'use strict';const test=require('node:test'),assert=require('node:assert/strict'),M=require('../relativity-mirror.js');
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
test('normal incidence agrees with moving-mirror analytic encounter and two-way Doppler factor',()=>{
  for(const beta of [-.95,-.7,-.1,0,.2,.6,.9,.98]){
    const r=M.solve({beta,distance:6});assert.equal(r.status,'hit');near(r.meeting.time,6/(1-beta),1e-7);near(r.meeting.point[0],6/(1-beta),1e-7);
    near(r.reflected.frequencyRatio,(1-beta)/(1+beta),1e-9);near(r.reflected.outgoing[0],-1);near(r.detector.time,12/(1-beta),1e-7);
  }
});
test('arbitrary mirror orientation reflects in its own rest frame and preserves null directions',()=>{
  for(const beta of [-.7,0,.7])for(const mirrorAngle of [-45,-20,0,30,45])for(const velocityAngle of [-25,0,40]){
    const r=M.solve({beta,mirrorAngle,velocityAngle,incidentAngle:8,halfWidth:30});if(r.status!=='hit')continue;
    const f=r.reflected;near(M.length(f.restIncoming),1);near(M.length(f.restOutgoing),1);near(M.length(f.outgoing),1);
    near(M.dot(f.restOutgoing,r.normal),-M.dot(f.restIncoming,r.normal));
    const ti=M.dot(f.restIncoming,r.tangent),to=M.dot(f.restOutgoing,r.tangent);near(ti,to);
    near(M.dot(r.meeting.restPoint,r.normal),0,1e-8);
    const inverse=M.photonToRest(f.outgoing,r.velocity);near(inverse.frequency*f.frequencyRatio,f.restFrequency,1e-8);
  }
});
test('finite mirror aperture does not reflect an infinite-plane miss; invalid events are reported',()=>{
  const hit=M.solve({beta:.2,mirrorAngle:0,incidentAngle:0,halfWidth:.1});assert.equal(hit.status,'hit');
  const miss=M.solve({beta:0,mirrorAngle:0,incidentAngle:30,halfWidth:.1});assert.equal(miss.status,'miss');assert.equal(miss.reflected,null);
  assert.equal(M.solve({mirrorAngle:90}).status,'parallel');assert.throws(()=>M.solve({beta:1}),RangeError);
});
