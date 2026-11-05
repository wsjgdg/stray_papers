'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const T=require('../relativity-material-spectrum.js'),S=require('../relativity-spectrum.js'),P=require('../relativity-probe-spectrum.js'),E=require('../relativity-experiments.js');
const display=x=>x.map(v=>S.linearToSrgb(Math.max(0,v)/(1+Math.max(0,v))));
test('assumed material responses are bounded, distinct and explicit outside the visible range',()=>{
  for(const id of ['fabric','wood','metal']){
    for(let w=200;w<=1600;w+=10)assert.ok(T.reflectance(id,w)>0&&T.reflectance(id,w)<1);
    assert.equal(T.reflectance(id,200),T.reflectance(id,380));assert.equal(T.reflectance(id,1600),T.reflectance(id,780));
  }
  assert.ok(T.reflectance('fabric',450)>T.reflectance('fabric',550));assert.ok(T.reflectance('wood',700)>T.reflectance('wood',450));
  assert.throws(()=>T.reflectance('texture',550),RangeError);
});
test('two-factor LUT matches independent 1 nm quadrature and distinguishes the material frame from the lamp frame',()=>{
  for(const id of T.ids.slice(1))for(const total of [.3,.7,1,1.3,2,4])for(const outgoing of [.4,1,1.5,3]){
    const a=display(T.linear(id,'blackbody',6500,656.3,total,outgoing)),b=display(T.direct(id,'blackbody',6500,656.3,total,outgoing));
    assert.ok(Math.max(...a.map((x,k)=>Math.abs(x-b[k])))<.012,`${id}, total=${total}, outgoing=${outgoing}`);
  }
  const a=T.linear('fabric','blackbody',6500,656.3,1.3,.7),b=T.linear('fabric','blackbody',6500,656.3,1.3,1.8);
  assert.ok(Math.max(...a.map((x,k)=>Math.abs(x-b[k])))>.01);
  assert.equal(T.atlas('fabric',6500).length,T.WIDTH*T.ROWS*4);
});
test('line quadrature resolves steep measured reflectance and agrees with 1 nm integration',()=>{
  // Previously a centre-only response made the green channel positive at
  // this steep USGS paint edge, while 1 nm quadrature puts it below zero.
  const edge=T.linear('usgs-paint','line',6500,730,1.2,.65),reference=T.direct('usgs-paint','line',6500,730,1.2,.65);
  assert.ok(edge[1]<0&&reference[1]<0);assert.ok(Math.max(...display(edge).map((v,k)=>Math.abs(v-display(reference)[k])))<.001);
  for(const id of T.ids.slice(1))for(const line of [400,550,730,780])for(const total of [.6,.9,1.2,1.45,1.9])for(const outgoing of [.4,.65,1,2]){
    const a=T.linear(id,'line',6500,line,total,outgoing),b=T.direct(id,'line',6500,line,total,outgoing);
    for(const gain of [.1,1,10]){
      const av=display(a.map(x=>x*gain)),bv=display(b.map(x=>x*gain));
      assert.ok(Math.max(...av.map((x,k)=>Math.abs(x-bv[k])))<.01,`${id}, line=${line}, total=${total}, outgoing=${outgoing}, gain=${gain}`);
    }
  }
  const row=S.cmfAtlasRow();assert.equal(row.length,1024*4);
  for(let i=0;i<81;i++)for(let k=0;k<3;k++){
    const p=i*8,value=(row[p+k]*256+row[p+4+k])*2/65535;
    assert.ok(Math.abs(value-S.cmfAt(380+i*5)[k])<2/65535);
  }
});
test('probe line graph uses the wavelength-dependent measured response, not its centre value',()=>{
  const state={...E.BASE,spectrumModel:'line',lineWavelength:730,materialSpectrum:'usgs-paint',surfaceMode:'reflection'},factors={total:1.2,outgoing:.65};
  const plot=P.build(state,{ray:{hit:{body:true}},factors,rgb:[.2,.4,.7],min:600,max:620,step:2});
  const sample=plot.samples[0],source=S.source('line',6500,730),response=T.reflectance('usgs-paint',.65*sample.wavelength);
  const expected=1.2**5*source.at(1.2*sample.wavelength)*response;
  assert.ok(Math.abs(sample.observed-expected)<1e-12);assert.equal(sample.response,response);
  assert.ok(Math.abs(response-T.reflectance('usgs-paint',730*.65/1.2))>.03);
});
test('highlight shoulder is monotonic and preserves ratios before display encoding',()=>{
  const x=[4,2,1],out=S.radianceToDisplayTone(x,'filmic').map(S.srgbToLinear);
  assert.ok(Math.abs(out[0]/out[1]-2)<1e-10);assert.ok(Math.abs(out[0]/out[2]-4)<1e-10);
  assert.ok(S.radianceToDisplayTone([2,2,2],'filmic')[0]>S.radianceToDisplayTone([1,1,1],'filmic')[0]);
  assert.deepEqual(S.radianceToDisplayTone(x,'reinhard'),S.radianceToDisplay(x));
});
test('new options round-trip and schema-1 files lacking them retain original appearance',()=>{
  const state={...E.BASE,materialSpectrum:'wood',toneMap:'filmic'};assert.deepEqual(E.parameters(state),state);
  const legacy={...state};delete legacy.materialSpectrum;delete legacy.toneMap;
  assert.equal(E.parameters(legacy).materialSpectrum,'texture');assert.equal(E.parameters(legacy).toneMap,'reinhard');
  assert.throws(()=>E.parameters({...state,materialSpectrum:'claimed-measurement'}),RangeError);
});
