/* Assumed and explicitly identified measured reflectances under a specified illuminant.
 * CIE 1931 2° observer: DOI 10.25039/CIE.DS.rmcs7wkw (relativity-spectrum-data.js).
 * fabric/wood/metal are teaching assumptions; usgs-* are individual USGS
 * measured samples, not measurements of our textures or an angular BRDF.
 * No RGB-to-spectrum inversion. Outside each measured range is a guess.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-spectrum.js'),require('./relativity-measured-data.js'));
  else root.RelativityMaterialSpectrum=factory(root.RelativitySpectrum,root.RelativityMeasuredData);
})(typeof globalThis==='object'?globalThis:this,function(S,measured){
  'use strict';
  const N=65,WIDTH=1024,ROWS=Math.ceil(N*N*2/WIDTH),LOG_LOW=-35,LOG_HIGH=15;
  const ids=Object.freeze(['texture','fabric','wood','metal','usgs-paint','usgs-pine','usgs-nylon']);
  const measuredIds=Object.freeze(['usgs-paint','usgs-pine','usgs-nylon']);
  const sampleLabels=Object.freeze({'usgs-paint':'GDS333 浅灰油漆铝板','usgs-pine':'GDS365 松木胶合板','usgs-nylon':'GDS431 红色尼龙布'});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function reflectance(id,wavelength){
    if(!ids.includes(id)||id==='texture'||!Number.isFinite(wavelength)||wavelength<=0)throw new RangeError('Invalid illustrative reflectance');
    if(measuredIds.includes(id)){
      if(!measured)throw new Error('USGS measured data not loaded');
      const waves=measured.wavelengths,values=measured[id],w=clamp(wavelength,waves[0],waves[waves.length-1]);
      // ASD wavelengths are approximately 1 nm apart; correct the candidate
      // against the original positions, preserving their tiny decimal offsets.
      let lo=clamp(Math.floor(w-350),0,waves.length-2);
      while(lo>0&&waves[lo]>w)lo--;while(lo<waves.length-2&&waves[lo+1]<=w)lo++;
      const hi=lo+1,t=(w-waves[lo])/(waves[hi]-waves[lo]);return values[lo]*(1-t)+values[hi]*t;
    }
    // Outside 380–780 nm the assumed endpoints are held constant.
    const w=clamp(wavelength,380,780);
    if(id==='fabric')return .08+.24*Math.exp(-(((w-450)/65)**2))+.10*Math.exp(-(((w-670)/110)**2));
    if(id==='wood')return .11+.48/(1+Math.exp(-(w-580)/60));
    return .52+.08*(w-380)/400;
  }
  const responses=Object.fromEntries(ids.slice(1).map(id=>[id,wavelength=>reflectance(id,wavelength)]));
  function coverage(id,outgoing=1){
    if(!measuredIds.includes(id))return null;
    if(!(Number.isFinite(outgoing)&&outgoing>0))throw new RangeError('Doppler factor must be positive');
    // Portion of the observer's 380–780 nm interval whose corresponding
    // material-frame wavelength is within the USGS sample's measured band.
    const low=measured.wavelengths[0]/outgoing,high=measured.wavelengths[measured.wavelengths.length-1]/outgoing;
    return Math.max(0,Math.min(780,high)-Math.max(380,low))/400;
  }
  const xyzToRgb=xyz=>[3.2404542*xyz[0]-1.5371385*xyz[1]-.4985314*xyz[2],-.9692660*xyz[0]+1.8760108*xyz[1]+.0415560*xyz[2],.0556434*xyz[0]-.2040259*xyz[1]+1.0572252*xyz[2]];
  function direct(id,model,temperature,line,total,outgoing,step=1){
    if(!(Number.isFinite(total)&&total>0&&Number.isFinite(outgoing)&&outgoing>0))throw new RangeError('Doppler factors must be positive');
    const source=S.source(model==='line'?'line':'blackbody',model==='rgb'?6504:temperature,line),xyz=[0,0,0],gain=total**5;
    for(let w=380;w<=780;w+=step){const p=source.at(total*w)*gain*reflectance(id,outgoing*w)*step,c=S.cmfAt(w);for(let k=0;k<3;k++)xyz[k]+=p*c[k];}
    return xyzToRgb(xyz);
  }
  // Blackbody table: total = D_in D_out; reflectance is evaluated at the
  // MATERIAL rest-frame wavelength D_out lambda_observed, not D_total lambda.
  // A 5 nm CIE grid is used here; the narrow line uses separate quadrature.
  let cache=[];
  function table(id,temperature=6504){
    if(!ids.includes(id)||id==='texture')throw new RangeError('Unknown reflectance');
    const key=id+'/'+temperature,old=cache.find(x=>x.key===key);if(old)return old;
    const source=S.source('blackbody',temperature,656.3),waves=81,emitted=new Float64Array(N*waves),reflected=new Float64Array(N*waves),values=new Float64Array(N*N*3);
    for(let i=0;i<N;i++){
      const d=.1*100**(i/(N-1)),gain=d**5;
      for(let j=0;j<waves;j++){const w=380+5*j;emitted[i*waves+j]=source.at(d*w)*gain;reflected[i*waves+j]=reflectance(id,d*w);}
    }
    for(let row=0;row<N;row++)for(let col=0;col<N;col++){
      const xyz=[0,0,0];for(let j=0;j<waves;j++){const p=5*emitted[col*waves+j]*reflected[row*waves+j],c=S.cmfAt(380+5*j);for(let k=0;k<3;k++)xyz[k]+=p*c[k];}
      values.set(xyzToRgb(xyz),(row*N+col)*3);
    }
    const entry={key,values};cache=[entry,...cache].slice(0,3);return entry;
  }
  function index(d){return clamp(Math.log(d/.1)/Math.log(100)*(N-1),0,N-1);}
  function linear(id,model,temperature,line,total,outgoing){
    if(!(Number.isFinite(total)&&total>0&&Number.isFinite(outgoing)&&outgoing>0))throw new RangeError('Doppler factors must be positive');
    total=clamp(total,.1,10);outgoing=clamp(outgoing,.1,10);
    if(model==='line'){
      if(!responses[id])throw new RangeError('Unknown reflectance');
      // Evaluate the measured or illustrative response across the line, not
      // just at its centre. Source wavelengths map into the material frame by
      // D_out / D_total; the same 32 nodes are used by the WebGL shader.
      return S.lineIntegral(line,total,responses[id],outgoing/total);
    }
    const values=table(id,model==='rgb'?6504:temperature).values,x=index(total),y=index(outgoing),i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j;
    const at=(a,b,k)=>values[(Math.min(b,N-1)*N+Math.min(a,N-1))*3+k];
    return [0,1,2].map(k=>(at(i,j,k)*(1-fx)+at(i+1,j,k)*fx)*(1-fy)+(at(i,j+1,k)*(1-fx)+at(i+1,j+1,k)*fx)*fy);
  }
  function shift(base,id,model,temperature,line,total,outgoing,exposure=0,lightGain=1){
    const x=base.map(v=>S.srgbToLinear(clamp(v,0,1))),strength=(.2126*x[0]+.7152*x[1]+.0722*x[2])*1.6*lightGain*2**exposure;
    return linear(id,model,temperature,line,total,outgoing).map(v=>{v=Math.max(0,v)*strength;return clamp(S.linearToSrgb(v/(1+v)),0,1);});
  }
  // Compact 16-bit GPU line-response atlas: all 2151 original 1 nm ASD
  // channels, linearly filtered in shader; no second spectrum texture needed.
  function lineAtlas(id){
    if(!measuredIds.includes(id))throw new RangeError('Not a measured sample');
    const out=new Uint8Array(1024*3*4),values=measured[id];
    for(let i=0;i<values.length;i++){
      const q=Math.round(clamp(values[i],0,1)*65535),at=i*4;
      out[at]=q>>8;out[at+1]=q&255;out[at+3]=255;
    }
    return out;
  }
  function atlas(id,temperature=6504){
    const values=table(id,temperature).values,out=new Uint8Array(WIDTH*ROWS*4);
    for(let i=0;i<N*N;i++)for(let k=0;k<3;k++){
      const v=values[i*3+k],q=Math.round(32767*clamp((Math.log(Math.max(1e-30,Math.abs(v)))-LOG_LOW)/(LOG_HIGH-LOG_LOW),0,1));
      out[(2*i)*4+k]=(q>>8)|(v<0?128:0);out[(2*i+1)*4+k]=q&255;
      out[(2*i)*4+3]=out[(2*i+1)*4+3]=255;
    }
    return out;
  }
  return Object.freeze({N,WIDTH,ROWS,ids,measuredIds,sampleLabels,coverage,reflectance,direct,table,linear,shift,atlas,lineAtlas});
});
