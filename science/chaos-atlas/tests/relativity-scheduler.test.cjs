'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../relativity-scheduler.js');

test('WebGL tile scheduling reacts to measured work within conservative bounds',()=>{
  const c=S.create(true);assert.equal(c.tile(),64);assert.equal(c.dynamic(),24000);
  c.observeTile(150);assert.equal(c.tile(),64,'first lazy compilation must not be mistaken for steady cost');
  for(let i=0;i<24;i++)c.observeTile(45);
  assert.ok(c.tile()<64&&c.tile()>=48);assert.ok(c.delay()>=8&&c.delay()<=24);
  for(let i=0;i<80;i++)c.observeTile(1);
  assert.ok(c.tile()>48&&c.tile()<=80);assert.ok(c.delay()>=8&&c.delay()<=24);
  const before=c.snapshot();c.observeTile(NaN);c.observeTile(-1);assert.deepEqual(c.snapshot(),before);
});

test('motion pixel budget adapts gradually, not above device caps or below floor',()=>{
  for(const [conservative,min,max] of [[true,6000,48000],[false,16000,160000]]){
    const c=S.create(conservative),first=c.dynamic();c.observeDynamic(5000);
    assert.equal(c.dynamic(),Math.max(min,Math.round(first*.8)));
    for(let i=0;i<100;i++)c.observeDynamic(5000);assert.equal(c.dynamic(),min);
    for(let i=0;i<100;i++)c.observeDynamic(1);assert.equal(c.dynamic(),max);
    const end=c.dynamic();c.observeDynamic(NaN);c.observeDynamic(0);assert.equal(c.dynamic(),end);
  }
});

test('middle quality is planned only when it helps a slow, significantly larger still',()=>{
  assert.equal(S.plan(100000,480000,300),null,'fast frame does not pay for an extra pass');
  assert.equal(S.plan(100000,200000,5000),null,'small resolution gain does not justify another frame');
  const p=S.plan(100000,900000,1200);assert.ok(p);assert.ok(p.middle>180000&&p.middle<495000);assert.equal(p.estimateMs,10800);
  assert.equal(S.plan(0,900000,1200),null);
});
