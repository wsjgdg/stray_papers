'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../relativity-experiments.js');
const root={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../relativity-renderer.js'),'utf8'),{window:root,console});
const {sampleTexture}=root.RelativityRenderer;
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const closeRGB=(actual,expected,tolerance=1e-9)=>{assert.equal(actual.length,3);for(let i=0;i<3;i++)close(actual[i],expected[i],tolerance);};

test('renderer exposes the full immutable scene asset list, including harbor textures',()=>{
  const names=Array.from(root.RelativityRenderer.assetNames);assert.deepEqual(names,['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal']);assert.equal(Object.isFrozen(root.RelativityRenderer.assetNames),true);
});

test('CPU texture sampling follows WebGL texel centers, clamp, vertical orientation and repeat coordinates',()=>{
  // Stored image rows are top to bottom. GL's v=1 addresses the top row.
  const image={w:2,h:2,pixels:new Uint8ClampedArray([
    0,20,40,255, 100,120,140,255,
    200,220,240,255, 250,230,210,255
  ])};
  closeRGB(sampleTexture(image,.25,.75,false),[0,20,40]);
  closeRGB(sampleTexture(image,.75,.75,false),[100,120,140]);
  closeRGB(sampleTexture(image,.25,.25,false),[200,220,240]);
  closeRGB(sampleTexture(image,.75,.25,false),[250,230,210]);
  closeRGB(sampleTexture(image,.5,.5,false),[137.5,147.5,157.5]);
  closeRGB(sampleTexture(image,-3,8,false),[0,20,40]);
  closeRGB(sampleTexture(image,-.25,1.75,true),[100,120,140]);
  closeRGB(sampleTexture({w:1,h:1,pixels:new Uint8ClampedArray([8,17,42,255])},.42,.81,false),[8,17,42]);
  const a=sampleTexture(image,.49999,.63,false),b=sampleTexture(image,.50001,.63,false);
  assert.ok(Math.max(...a.map((v,i)=>Math.abs(v-b[i])))<.01,'sub-texel movement is continuous within a texture');
});

test('bilinear weights agree with an independent scalar reference across coordinates and image sizes',()=>{
  let seed=1234;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  for(const [w,h] of [[1,7],[8,1],[3,5],[16,9]]){
    const pixels=Uint8ClampedArray.from({length:w*h*4},()=>Math.floor(random()*256)),image={w,h,pixels};
    function reference(u,v,repeat){
      if(repeat){u-=Math.floor(u);v-=Math.floor(v)}else{u=Math.max(0,Math.min(1,u));v=Math.max(0,Math.min(1,v));}
      const x=Math.max(0,Math.min(w-1,u*w-.5)),y=Math.max(0,Math.min(h-1,(1-v)*h-.5)),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      const out=[0,0,0];for(let j=0;j<2;j++)for(let i=0;i<2;i++)for(let k=0;k<3;k++)out[k]+=pixels[(Math.min(iy+j,h-1)*w+Math.min(ix+i,w-1))*4+k]*(i?fx:1-fx)*(j?fy:1-fy);
      return out;
    }
    for(let i=0;i<1000;i++){const u=random()*6-3,v=random()*6-3,repeat=i%2===0;closeRGB(sampleTexture(image,u,v,repeat),reference(u,v,repeat),1e-10);}
  }
});

test('wall-clock playback advances at the requested rate independent of physical frame cadence',()=>{
  for(const fps of [3,4,10,60]){
    const start=-2.5,anchor=1300,end=4300;let last=start;
    for(let t=anchor;t<=end;t+=1000/fps)last=E.playbackTime(start,anchor,t,1,3);
    close(E.playbackTime(start,anchor,end,1,3),-.55);assert.ok(last<=-.55+1e-9);
  }
  for(const rate of E.playbackRates)close(E.playbackTime(-2,500,1500,rate,3),-2+.65*rate);
  close(E.playbackTime(2.9,100,10100,2,3),3); // endpoint, never wrap implicitly
  close(E.playbackTime(-1,1000,999,1,3),-1); // stale animation timestamp
  assert.throws(()=>E.playbackTime(0,0,10,0,3),RangeError);
  assert.throws(()=>E.playbackTime(0,0,NaN,1,3),RangeError);
});

test('rate changes and hidden-tab pauses re-anchor without jumps or backfilling hidden time',()=>{
  const before=E.playbackTime(-2,100,2100,.5,3);
  close(before,-1.35);
  close(E.playbackTime(before,2100,2100,2,3),before);
  const atHide=E.playbackTime(before,2100,2600,2,3);close(atHide,-.7);
  // Re-anchor at visibility restoration; 8 seconds spent hidden do not count.
  const afterResume=E.playbackTime(atHide,10600,11100,2,3);close(afterResume,-.05);
});

test('playback rate is validated, snapshotted and compatible with older snapshots',()=>{
  assert.equal(E.parameters({...E.BASE,playbackRate:.25}).playbackRate,.25);
  assert.throws(()=>E.parameters({...E.BASE,playbackRate:1.3}),/无效参数/);
  const old={...E.BASE};delete old.playbackRate;
  assert.equal(E.parameters(old).playbackRate,1);
  const snapshot=JSON.stringify({format:'relativity-observation',schema:1,parameters:{...E.BASE,playbackRate:2},measurements:{}});
  assert.equal(E.parse(snapshot).parameters.playbackRate,2);
  assert.equal(E.recipe('terrell').playbackRate,1);
});
