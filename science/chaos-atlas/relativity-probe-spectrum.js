/* Spectrum at a sampled pixel. RGB and illumination remain assumptions; selected
 * USGS material curves are measured samples within their documented range. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-spectrum.js'),require('./relativity-material-spectrum.js'));
  else root.RelativityProbeSpectrum=factory(root.RelativitySpectrum,root.RelativityMaterialSpectrum);
})(typeof globalThis==='object'?globalThis:this,function(S,T){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function build(state,{ray=null,factors=null,rgb=null,active=true,min=200,max=1200,step=2}={}){
    if(!(min>0&&max>=min&&step>0))throw new RangeError('Invalid spectrum range');
    const body=!!ray?.hit?.body,material=body&&state.surfaceMode==='reflection'&&state.materialSpectrum&&state.materialSpectrum!=='texture'?state.materialSpectrum:null;
    const selected=state.spectrumModel||'rgb';
    // A named material uses a 6504 K illuminant when RGB was selected. Other
    // finite world surfaces use their own RGB basis, not the body's emitter.
    const model=material?(selected==='rgb'?'blackbody':selected):!ray||body?selected:'rgb';
    const temperature=material&&selected==='rgb'?6504:(state.temperature||6500),line=state.lineWavelength||656.3;
    const linear=rgb?S.displayToRadiance(rgb):[1,1,1];
    const emitter=model==='rgb'?S.rgbReference(linear):S.source(model,temperature,line);
    const theoretical=factors?.total??null,D=active&&theoretical!==null?clamp(theoretical,S.LOW,S.HIGH):1;
    const outgoing=active&&factors?clamp(factors.outgoing,S.LOW,S.HIGH):1;
    const samples=[];let peak=0;
    for(let wavelength=min;wavelength<=max;wavelength+=step){
      const emitted=emitter.at(wavelength),response=material?T.reflectance(material,outgoing*wavelength):null;
      // The renderer integrates the line and material response together;
      // show that same wavelength-dependent response across the line.
      const applied=material?response:1;
      const observed=D**5*emitter.at(D*wavelength)*applied;
      peak=Math.max(peak,emitted,observed);samples.push({wavelength,emitted,observed,response,inMeasuredBand:!material||!T.measuredIds.includes(material)||(outgoing*wavelength>=350&&outgoing*wavelength<=2500)});
    }
    return {samples,peak,model,temperature,line,D,outgoing,theoretical,material,measured:!!material&&T.measuredIds.includes(material),coverage:material?T.coverage(material,outgoing):null,body,active,rgb:rgb?rgb.slice():null,clamped:theoretical!==null&&active&&D!==theoretical};
  }
  return Object.freeze({build});
});
