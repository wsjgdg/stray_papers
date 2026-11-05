'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../relativity-spectrum.js');
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);

test('default RGB chart uses the documented assumed white basis, not an invented object spectrum',()=>{
  const rgb=S.rgbReference();assert.equal(rgb.model,'rgb');assert.deepEqual(rgb.linearRGB,[1,1,1]);
  for(const wavelength of [200,375,380,451.2,550,780,840,1200])near(rgb.at(wavelength),S.basisAt(0,wavelength));
  for(const value of S.sourceIntegral(rgb,1))near(value,1,.002);
  const arbitrary=[.7,.35,.1],weighted=S.rgbReference(arbitrary),weights=S.weights(arbitrary);
  for(const wavelength of [250,380,510,780,900])near(weighted.at(wavelength),weights.reduce((sum,w,i)=>sum+w*S.basisAt(i,wavelength),0));
  assert.equal(rgb.at(0),0);assert.throws(()=>S.rgbReference([-1,0,0]),RangeError);assert.throws(()=>S.rgbReference([NaN,0,0]),RangeError);
});

test('RGB, blackbody, and line charts use the same D^5 wavelength transformation',()=>{
  for(const model of ['rgb','blackbody','line'])for(const D of [.5,1,1.4,2]){
    const graph=S.comparison(model,6500,656.3,D,200,1200,2),source=model==='rgb'?S.rgbReference():S.source(model,6500,656.3);
    assert.equal(graph.samples.length,501);assert.ok(graph.peak>0);
    for(const sample of graph.samples){
      near(sample.emitted,source.at(sample.wavelength),1e-12);
      near(sample.observed,D**5*source.at(D*sample.wavelength),1e-12);
      if(D===1)assert.equal(sample.observed,sample.emitted);
    }
  }
  assert.throws(()=>S.comparison('rgb',6500,656.3,0),RangeError);
  assert.throws(()=>S.comparison('rgb',6500,656.3,1,200,1200,0),RangeError);
});

test('SDR sky fog remains bounded in linear light instead of inventing clipped HDR energy',()=>{
  const sky=[254/255,218/255,182/255],fog=S.fogSkyRadiance(sky),reconstruction=S.displayToRadiance(sky);
  assert.ok(fog.every(c=>c>=0&&c<=1));for(let i=0;i<3;i++)near(fog[i],S.srgbToLinear(sky[i]));
  assert.ok(reconstruction[0]>100,'exercise a near-white sky pixel which previously blew up the red channel');
  assert.ok(fog[0]<1&&fog[0]>fog[1]&&fog[1]>fog[2],'preserve the actual sky hue without creating extra radiance');
  assert.deepEqual(S.fogSkyRadiance([-1,0,1.4]),[0,0,1]);
});
