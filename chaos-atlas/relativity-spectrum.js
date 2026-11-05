/* Illustrative spectral radiance model for relativity.html; no runtime dependencies.
 * Spectrum data: CIE 1931 2° observer and seven nonnegative assumed metamers.
 * I_lambda,obs(lambda) = D^5 I_lambda,src(D lambda). D = nu_obs / nu_src.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-spectrum-data.js'));
  else root.RelativitySpectrum=factory(root.RelativitySpectrumData);
})(typeof globalThis==='object'?globalThis:this,function(data){
  'use strict';
  const N=257,LOW=.1,HIGH=10,LOG_LOW=-22,LOG_HIGH=1,T=6504,C2=1.438776877e7;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const xyzToRgb=xyz=>[
    3.2404542*xyz[0]-1.5371385*xyz[1]-.4985314*xyz[2],
    -.9692660*xyz[0]+1.8760108*xyz[1]+.0415560*xyz[2],
    .0556434*xyz[0]-.2040259*xyz[1]+1.0572252*xyz[2]
  ];
  // Relative Planck B_lambda; absolute units cancel in the endpoint ratios.
  function planck(wavelength,temperature=T){
    if(!(wavelength>0&&temperature>0))return 0;
    return 1/(wavelength**5*Math.expm1(C2/(wavelength*temperature)));
  }
  const edgeLow=planck(380),edgeHigh=planck(780);
  function basisAt(index,wavelength){
    const values=data.basis[index];
    if(wavelength<380)return values[0]*planck(wavelength)/edgeLow;
    if(wavelength>780)return values[80]*planck(wavelength)/edgeHigh;
    const i=(wavelength-380)/5,j=Math.floor(i),t=i-j;
    return values[j]*(1-t)+values[Math.min(j+1,80)]*t;
  }
  function directMatrix(D){
    if(!(Number.isFinite(D)&&D>0))throw new RangeError('Doppler factor must be positive');
    return data.basis.map((_,i)=>{
      const xyz=[0,0,0];
      for(let j=0;j<81;j++){
        const power=5*basisAt(i,D*(380+5*j)),cmf=data.cie[j];
        for(let k=0;k<3;k++)xyz[k]+=power*cmf[k];
      }
      return xyzToRgb(xyz);
    });
  }
  let cached;
  function table(){
    if(!cached){
      const matrices=[];for(let i=0;i<N;i++)matrices.push(directMatrix(LOW*(HIGH/LOW)**(i/(N-1))));
      cached=matrices;
    }
    return cached;
  }
  function index(D){return clamp(Math.log(D/LOW)/Math.log(HIGH/LOW)*(N-1),0,N-1);}
  function lookupMatrix(D){
    if(!(Number.isFinite(D)&&D>0))throw new RangeError('Doppler factor must be positive');
    const p=index(D),i=Math.floor(p),f=p-i,t=table(),a=t[i],b=t[Math.min(i+1,N-1)];
    return a.map((row,j)=>row.map((x,k)=>x*(1-f)+b[j][k]*f));
  }
  // Positive decomposition into white, cyan, magenta, yellow, red, green, blue.
  function weights(rgb){
    let [r,g,b]=rgb,w=Math.min(r,g,b);r-=w;g-=w;b-=w;
    const c=Math.min(g,b);g-=c;b-=c;const m=Math.min(r,b);r-=m;b-=m;const y=Math.min(r,g);r-=y;g-=y;
    return [w,c,m,y,r,g,b];
  }
  function observedLinear(restLinear,D,direct=false){
    const w=weights(restLinear),out=[0,0,0],gain=D**5;
    if(direct){
      const matrix=directMatrix(D);
      for(let i=0;i<7;i++)for(let k=0;k<3;k++)out[k]+=w[i]*matrix[i][k]*gain;
    }else{
      if(!(Number.isFinite(D)&&D>0))throw new RangeError('Doppler factor must be positive');
      // Interpolate the same 21 coefficients in place instead of allocating a
      // fresh 7x3 matrix for every shaded pixel. Arithmetic and D^5 are the
      // same as lookupMatrix; direct quadrature remains available for checks.
      const p=index(D),column=Math.floor(p),f=p-column,t=table(),a=t[column],b=t[Math.min(column+1,N-1)];
      for(let i=0;i<7;i++)for(let k=0;k<3;k++)out[k]+=w[i]*(a[i][k]*(1-f)+b[i][k]*f)*gain;
    }
    return out;
  }
  const srgbToLinear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  const linearToSrgb=c=>c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055;
  // Approximate linear scene intensity from the renderer's already-calibrated
  // display reference. RGB source imagery is not measured HDR; reconstruction
  // cannot restore clipped highlights or colours outside the display gamut.
  function displayToRadiance(srgb){
    return srgb.map(c=>{const x=clamp(srgbToLinear(clamp(c,0,1)),0,.995);return x/(1-x);});
  }
  // A JPEG sky has no measured HDR values. Treat its fog/airlight contribution
  // as bounded linear SDR, rather than inverting the display shoulder: a near-
  // white clipped channel otherwise becomes an enormous coloured light source.
  function fogSkyRadiance(srgb){return srgb.map(c=>srgbToLinear(clamp(c,0,1)));}
  function radianceToDisplay(linear){
    return linear.map(c=>{const x=Math.max(0,c);return clamp(linearToSrgb(x/(1+x)),0,1);});
  }
  // Optional highlight shoulder applied after linear sample accumulation. The
  // peak-preserving scale avoids independently clipping a bright RGB channel.
  // It is a display transform, not recovery of clipped JPEG data or calibrated HDR.
  function radianceToDisplayTone(linear,mode='reinhard'){
    if(mode!=='filmic')return radianceToDisplay(linear);
    const positive=linear.map(x=>Math.max(0,x)),peak=Math.max(...positive);
    if(!(peak>0))return [0,0,0];
    const mapped=clamp((peak*(2.51*peak+.03))/(peak*(2.43*peak+.59)+.14),0,1),scale=mapped/peak;
    return positive.map(x=>clamp(linearToSrgb(x*scale),0,1));
  }
  function shift(srgb,D,exposure=0,lightGain=1){
    if(Math.abs(D-1)<1e-12&&exposure===0&&lightGain===1)return srgb.map(c=>clamp(c,0,1));
    // The JPEG has already been displayed. Invert a fixed Reinhard display
    // curve first, then apply the same curve after spectral integration.
    const rest=srgb.map(c=>{const v=clamp(srgbToLinear(clamp(c,0,1)),0,.995);return v/(1-v)*lightGain;});
    return observedLinear(rest,D).map(v=>{v=Math.max(0,v)*2**exposure;return clamp(linearToSrgb(v/(1+v)),0,1);});
  }
  // Pack the precomputed spectral matrix in eight rows of the existing sign
  // atlas, so WebGL 1 never needs a ninth fragment texture unit. Coefficients
  // use signed bytes, with a separately encoded 16-bit log scale per column.
  function atlasRows(){
    const t=table(),out=new Uint8ClampedArray(N*8*4);
    for(let x=0;x<N;x++){
      const a=t[x];let magnitude=1e-30;for(const row of a)for(const v of row)magnitude=Math.max(magnitude,Math.abs(v));
      for(let row=0;row<7;row++)for(let k=0;k<3;k++)out[(row*N+x)*4+k]=Math.round(128+127*clamp(a[row][k]/magnitude,-1,1));
      const encoded=Math.round(65535*clamp((Math.log(magnitude)-LOG_LOW)/(LOG_HIGH-LOG_LOW),0,1)),p=(7*N+x)*4;
      out[p]=encoded>>8;out[p+1]=encoded&255;
      for(let row=0;row<8;row++)out[(row*N+x)*4+3]=255;
    }
    return out;
  }
  // Explicit reference emitters. Source radiance is normalized to unit CIE Y
  // at D=1, not to an absolute physical power; Gaussian broadening is an
  // intentionally enlarged teaching approximation, not a measured line shape.
  const LINE_SIGMA=8,SOURCE_LOG_LOW=-35,SOURCE_LOG_HIGH=15;
  const cmfAt=w=>{
    if(w<380||w>780)return [0,0,0];
    const i=(w-380)/5,j=Math.floor(i),t=i-j,a=data.cie[j],b=data.cie[Math.min(j+1,80)];return a.map((v,k)=>v*(1-t)+b[k]*t);
  };
  function source(model,temperature=6500,line=656.3){
    if(!['blackbody','line'].includes(model)||!Number.isFinite(temperature)||temperature<2000||temperature>12000||!Number.isFinite(line)||line<380||line>780)throw new RangeError('Invalid illustrative emitter');
    const at=model==='blackbody'?w=>planck(w,temperature):w=>Math.exp(-.5*((w-line)/LINE_SIGMA)**2);
    let norm=0;for(let w=380;w<=780;w++)norm+=at(w)*cmfAt(w)[1];
    if(!(norm>0))throw new RangeError('Emitter has no visible reference radiance');
    return {model,temperature,line,at:w=>w>0?at(w)/norm:0};
  }
  function sourceIntegral(emitter,D){
    if(!(Number.isFinite(D)&&D>0))throw new RangeError('Doppler factor must be positive');
    const xyz=[0,0,0],gain=D**5;
    // 1 nm quadrature reduces aliasing for the Doppler-narrowed line; CMFs
    // are linearly interpolated from the attributed 5 nm CIE measurements.
    for(let w=380;w<=780;w++){
      const power=emitter.at(D*w)*gain,c=cmfAt(w);for(let k=0;k<3;k++)xyz[k]+=power*c[k];
    }
    return xyzToRgb(xyz);
  }
  // Integrate the illustrative Gaussian in its own wavelength domain. 32
  // midpoint samples over +/-5 sigma avoid treating a steep material curve as
  // constant across the line; clipping occurs at the visible observer band.
  let lineNormCache;
  function lineNormalization(line){
    if(!lineNormCache||lineNormCache.line!==line){
      const emitter=source('line',6500,line);lineNormCache={line,value:emitter.at(line)};
    }
    return lineNormCache.value;
  }
  function lineIntegral(line,D,response=null,responseScale=1){
    if(!(Number.isFinite(D)&&D>0&&Number.isFinite(responseScale)&&responseScale>0))throw new RangeError('Doppler factor must be positive');
    D=clamp(D,LOW,HIGH);
    const lo=Math.max(line-5*LINE_SIGMA,380*D),hi=Math.min(line+5*LINE_SIGMA,780*D),norm=lineNormalization(line);
    if(!(hi>lo))return [0,0,0];
    const step=(hi-lo)/32,gain=D**4*step*norm,xyz=[0,0,0];
    for(let i=0;i<32;i++){
      const wavelength=lo+(i+.5)*step,t=(wavelength-line)/LINE_SIGMA,c=cmfAt(wavelength/D);
      const p=Math.exp(-.5*t*t)*gain*(response?response(wavelength*responseScale):1);
      for(let k=0;k<3;k++)xyz[k]+=p*c[k];
    }
    return xyzToRgb(xyz);
  }
  // Exact-centre texels encode CIE CMFs to 16 bits, two RGBA texels per
  // wavelength. One spare row of the existing atlas preserves WebGL1's
  // eight-sampler limit; CIE z is below 2, the fixed encoding scale.
  function cmfAtlasRow(){
    const out=new Uint8Array(1024*4);
    for(let i=0;i<81;i++)for(let k=0;k<3;k++){
      const q=Math.round(clamp(data.cie[i][k]/2,0,1)*65535),p=2*i*4;
      out[p+k]=q>>8;out[p+4+k]=q&255;out[p+3]=out[p+7]=255;
    }
    return out;
  }
  let sourceCache;
  function sourceTable(model,temperature=6500,line=656.3){
    const key=[model,temperature,line].join('/');if(sourceCache?.key===key)return sourceCache;
    const emitter=source(model,temperature,line),values=[];
    for(let i=0;i<N;i++)values.push(sourceIntegral(emitter,LOW*(HIGH/LOW)**(i/(N-1))));
    sourceCache={key,emitter,values};return sourceCache;
  }
  function sourceLinear(model,temperature,line,D){
    if(!(Number.isFinite(D)&&D>0))throw new RangeError('Doppler factor must be positive');
    if(model==='line')return lineIntegral(line,D);
    const p=index(D),i=Math.floor(p),f=p-i,t=sourceTable(model,temperature,line).values,a=t[i],b=t[Math.min(i+1,N-1)];
    return a.map((v,k)=>v*(1-f)+b[k]*f);
  }
  function sourceShift(srgb,model,temperature,line,D,exposure=0,lightGain=1){
    const linear=srgb.map(v=>srgbToLinear(clamp(v,0,1))),strength=(.2126*linear[0]+.7152*linear[1]+.0722*linear[2])*1.6*lightGain*2**exposure;
    return sourceLinear(model,temperature,line,D).map(v=>{v=Math.max(0,v)*strength;return clamp(linearToSrgb(v/(1+v)),0,1);});
  }
  function sourceAtlasRows(model,temperature,line){
    const {values}=sourceTable(model,temperature,line),out=new Uint8Array(N*2*4);
    for(let x=0;x<N;x++){
      const rgb=values[x],p=x*4,q=(N+x)*4;
      // Independent signed 15-bit log magnitudes prevent cancellation of small
      // out-of-gamut components when a narrow line crosses an RGB boundary.
      for(let k=0;k<3;k++){
        const encoded=Math.round(32767*clamp((Math.log(Math.max(1e-30,Math.abs(rgb[k])))-SOURCE_LOG_LOW)/(SOURCE_LOG_HIGH-SOURCE_LOG_LOW),0,1));
        out[p+k]=(encoded>>8)|(rgb[k]<0?128:0);out[q+k]=encoded&255;
      }
      out[p+3]=out[q+3]=255;
    }
    return out;
  }
  // One of infinitely many spectra compatible with an RGB colour. The chart
  // defaults to unit linear white; it is not sampled from the selected object.
  // The same seven assumed bases and endpoint extensions drive RGB rendering.
  function rgbReference(linearRGB=[1,1,1]){
    if(!Array.isArray(linearRGB)||linearRGB.length!==3||linearRGB.some(x=>!Number.isFinite(x)||x<0))throw new RangeError('Invalid linear RGB reference');
    const coefficients=weights(linearRGB),rgb=linearRGB.slice();
    return {model:'rgb',linearRGB:rgb,at:wavelength=>wavelength>0?coefficients.reduce((sum,weight,i)=>sum+weight*basisAt(i,wavelength),0):0};
  }
  function comparison(model,temperature,line,D,min=200,max=1200,step=2){
    if(!(Number.isFinite(D)&&D>0&&Number.isFinite(min)&&Number.isFinite(max)&&Number.isFinite(step)&&min>0&&max>=min&&step>0))throw new RangeError('Invalid spectrum comparison');
    const emitter=model==='rgb'?rgbReference():source(model,temperature,line),samples=[];let peak=0,sourcePeak=0,observedPeak=0;
    for(let wavelength=min;wavelength<=max;wavelength+=step){
      const emitted=emitter.at(wavelength),observed=D**5*emitter.at(D*wavelength);sourcePeak=Math.max(sourcePeak,emitted);observedPeak=Math.max(observedPeak,observed);peak=Math.max(peak,emitted,observed);samples.push({wavelength,emitted,observed});
    }
    return {samples,peak,sourcePeak,observedPeak,model,temperature,line,D,min,max};
  }
  return Object.freeze({N,LOW,HIGH,LOG_LOW,LOG_HIGH,T,planck,basisAt,directMatrix,lookupMatrix,weights,observedLinear,displayToRadiance,fogSkyRadiance,radianceToDisplay,radianceToDisplayTone,shift,atlasRows,srgbToLinear,linearToSrgb,LINE_SIGMA,SOURCE_LOG_LOW,SOURCE_LOG_HIGH,cmfAt,cmfAtlasRow,lineNormalization,lineIntegral,source,rgbReference,sourceIntegral,sourceTable,sourceLinear,sourceShift,sourceAtlasRows,comparison});
});
