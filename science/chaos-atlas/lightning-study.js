/* Measurements for independent DBM realizations. Length is the sum of actual
 * grown bond lengths (in plate-spacing units), excluding electrode scaffold.
 * A non-contact run at the fixed event budget is explicitly right-censored.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightningStudy=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function measure(m){
    let length=0;for(let j=m.seedSegmentCount*2;j<m.segments.length;j+=2){const a=m.coords(m.segments[j]),b=m.coords(m.segments[j+1]);length+=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*m.h;}
    const c=m.candidates();let maxField=0;
    for(let i=0;i<c.ids.length;i++)maxField=Math.max(maxField,c.drops[i]/m.h*(c.faceLinks[i]?1:Math.SQRT1_2));
    const center=m.index(Math.floor(m.nx/2),Math.floor(m.ny/2),Math.floor(m.nz/2)),st=m.stats();
    return {quality:m.quality,nx:m.nx,ny:m.ny,nz:m.nz,h:m.h,eta:m.eta,seed:m.seed,steps:m.steps,complete:m.complete,
      junctions:st.junctions,length,potentialCenter:m.potential[center],maxField,residual:st.residual};
  }
  function meanSD(values){
    if(!values.length)return {mean:NaN,sd:NaN};const mean=values.reduce((a,b)=>a+b,0)/values.length;
    const sd=values.length>1?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1)):null;return {mean,sd};
  }
  function summarize(samples){
    if(!samples.length)throw Error('没有完成的样本');
    const n=samples.length,contact=samples.filter(x=>x.complete).length,p=contact/n,z=1.96,d=1+z*z/n;
    const center=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
    return {n,contact,censored:n-contact,rate:p,interval:[Math.max(0,center-half),Math.min(1,center+half)],
      junctions:meanSD(samples.map(x=>x.junctions)),length:meanSD(samples.map(x=>x.length)),steps:meanSD(samples.map(x=>x.steps)),
      maxResidual:Math.max(...samples.map(x=>x.residual))};
  }
  return {measure,meanSD,summarize};
});
