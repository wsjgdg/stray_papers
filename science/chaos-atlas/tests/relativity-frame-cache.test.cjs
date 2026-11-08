'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../relativity-frame-cache.js'),E=require('../relativity-experiments.js');
const state=()=>({...E.BASE});
const view=()=>({width:1200,height:750,dpr:1,mode:'safe',kind:'canvas',worker:true,software:false,unknown:false});
const image=(id,width=10,height=10)=>({id,width,height});
test('cache identity includes physical state, camera, viewport and rendering backend',()=>{
  const s=state(),c=view(),base=F.key(s,c);
  for(const [k,v] of Object.entries({environment:'street',time:.01,beta:.59,yaw:.001,pitch:-.03,fov:61,doppler:false,shadows:false,softShadows:true,sceneMirror:true,materialSpectrum:'usgs-pine',shutter:.8,antialias:true}))
    assert.notEqual(F.key({...s,[k]:v},c),base,k);
  for(const changes of [{width:1199},{height:749},{dpr:1.25},{worker:false},{mode:'webgl',kind:'webgl'},{software:true},{identity:'another GPU'}])assert.notEqual(F.key(s,{...c,...changes}),base);
  for(const [k,v] of Object.entries({wavelength:600,playbackRate:2,dynamicQuality:'sharp',contour:true,velocityArrow:false}))assert.equal(F.key({...s,[k]:v},c),base,k);
  assert.throws(()=>F.key(s,{...c,width:0}),RangeError);assert.throws(()=>F.key({...s,time:NaN},c),RangeError);
});
test('bounded LRU evicts and releases images; oversized and duplicate entries are safe',()=>{
  const released=[],cache=F.create({maxBytes:800,maxEntries:2,release:x=>released.push(x.id)}),s=state(),c=view();
  cache.put(s,c,image('A'));cache.put({...s,yaw:.1},c,image('B'));assert.equal(cache.stats().bytes,800);
  assert.equal(cache.get(s,c).image.id,'A');cache.put({...s,yaw:.2},c,image('C'));
  assert.equal(cache.get({...s,yaw:.1},c),null);assert.deepEqual(released,['B']);assert.equal(cache.stats().evictions,1);
  cache.put(s,c,image('A2'));assert.deepEqual(released,['B','A']);assert.equal(cache.stats().bytes,800);
  assert.equal(cache.put(s,c,image('big',100,100)),false);assert.equal(released.at(-1),'big');assert.equal(cache.get(s,c).image.id,'A2');
  const old=cache.get(s,c);assert.equal(cache.has(old),true);assert.equal(cache.delete(old),true);assert.equal(cache.has(old),false);
  cache.clear();assert.equal(cache.stats().entries,0);assert.equal(cache.stats().bytes,0);assert.deepEqual(released,['B','A','big','A2','C']);
});
test('nearby pose is constrained to the same exact event and can be snapped to a real cached camera',()=>{
  const cache=F.create(),s=state(),c=view();cache.put(s,c,image('origin'));
  const close={...s,yaw:.002,pitch:s.pitch+.001};assert.equal(cache.nearby(close,c).entry.image.id,'origin');
  assert.equal(cache.nearby({...s,yaw:.019},c).entry.image.id,'origin');assert.equal(cache.nearby({...s,yaw:.0201},c),null);assert.equal(cache.nearby({...close,environment:'harbor'},c),null);
  assert.equal(cache.nearby({...close,time:.00000001},c),null);assert.equal(cache.nearby({...close,fov:61},c),null);
  assert.equal(cache.nearby({...close,doppler:false},c),null);assert.equal(cache.nearby(close,{...c,width:1199}),null);
  assert.ok(Math.abs(F.angleDifference(2*Math.PI+.001,.001))<1e-12);
  assert.equal(cache.nearby({...s,yaw:2*Math.PI+.001},c).entry.image.id,'origin');
});
test('previous cached view changes only the camera, and never crosses another physical state or backend',()=>{
  const cache=F.create(),s=state(),c=view();cache.put(s,c,image('A'));cache.put({...s,yaw:.3,fov:70},c,image('B'));
  assert.equal(cache.previous(s,c).image.id,'B');assert.equal(cache.previous({...s,yaw:.3,fov:70},c).image.id,'A');
  assert.equal(cache.previous({...s,shadows:false},c),null);assert.equal(cache.previous(s,{...c,worker:false}),null);
  assert.ok(F.budgets(2).bytes<F.budgets(4).bytes&&F.budgets(4).bytes<F.budgets(8).bytes);
});
test('wide drag underlays share the same budget, protect the full frame and are released on eviction',()=>{
  const released=[],cache=F.create({maxBytes:850,maxEntries:3,release:x=>released.push(x.id)}),s=state(),c=view();
  cache.put(s,c,image('A'));cache.put({...s,yaw:.1},c,image('B'));const A=cache.peek(s,c);
  assert.equal(cache.attachWide(A,[image('wide',5,5)],{time:0},false),true);assert.equal(cache.stats().bytes,500);assert.equal(cache.stats().evictions,1);assert.deepEqual(released,['B']);
  assert.equal(cache.attachWide(A,[image('too-big',20,20)],{},false),false);assert.deepEqual(released,['B','too-big']);assert.equal(A.wide.images[0].id,'wide');
  assert.equal(cache.attachWide(A,[image('new-wide',4,4)],{},false),true);assert.equal(cache.stats().bytes,464);assert.deepEqual(released,['B','too-big','wide']);
  cache.clear();assert.deepEqual(released,['B','too-big','wide','A','new-wide']);assert.equal(cache.stats().bytes,0);
  assert.equal(cache.attachWide(A,[image('stale')],{},false),false);assert.equal(released.at(-1),'stale');
});
test('gallery snapshots all controls and lists most-recent entries without cloning image buffers',()=>{
  const cache=F.create(),s=state(),c=view(),a=image('A'),b=image('B');
  cache.put(s,c,a);s.beta=.2;s.yaw=.3;s.environment='harbor';s.doppler=false;cache.put(s,c,b);
  assert.deepEqual(cache.list().map(x=>x.image.id),['B','A']);
  const first=cache.list()[1];assert.equal(first.parameters.beta,E.BASE.beta);assert.equal(first.parameters.environment,'station');assert.equal(first.parameters.doppler,true);
  assert.equal(Object.isFrozen(first.parameters),true);assert.equal(first.image,a);assert.equal(cache.list()[0].image,b);
  cache.get({...E.BASE},c);assert.deepEqual(cache.list().map(x=>x.image.id),['A','B']);cache.clear();assert.deepEqual(cache.list(),[]);
});
