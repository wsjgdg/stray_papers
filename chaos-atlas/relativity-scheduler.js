/* Bounded, measured scheduling for optional WebGL rendering.
 * This never creates a graphics context or starts background work. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RelativityScheduler=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function create(conservative){
    let tile=conservative?64:96,tileMs=0,seen=0,frames=0;
    let dynamic=conservative?24000:80000;
    const tileMax=conservative?80:128,dynamicMin=conservative?6000:16000,dynamicMax=conservative?48000:160000;
    function observeTile(ms){
      if(!Number.isFinite(ms)||ms<0)return;
      // The first submission can include lazy compilation and is not a useful
      // estimate of the cost of a typical tile. Never let it grow the budget.
      seen++;if(seen===1)return;
      tileMs=tileMs?tileMs*.75+Math.min(ms,250)*.25:Math.min(ms,250);
      if(seen%4===0){
        if(tileMs>22)tile=clamp(tile-8,48,tileMax);
        else if(tileMs<6)tile=clamp(tile+8,48,tileMax);
      }
    }
    function observeDynamic(ms){
      if(!Number.isFinite(ms)||ms<=0)return dynamic;
      frames++;const target=conservative?300:160;
      // Change gradually and only after a full presented frame. One transient
      // stall cannot suddenly quadruple the GPU workload or starve motion.
      if(ms>target*1.20)dynamic=Math.max(dynamicMin,Math.round(dynamic*.80));
      else if(ms<target*.70)dynamic=Math.min(dynamicMax,Math.round(dynamic*1.10));
      return dynamic;
    }
    function delay(){return clamp(Math.round(6+tileMs*.25),8,24);}
    return {observeTile,observeDynamic,delay,tile:()=>tile,dynamic:()=>dynamic,
      snapshot:()=>({tile,tileMs,dynamic,frames})};
  }
  // The extra complete middle frame is worthwhile only if it is substantially
  // sharper than the preview AND final refinement is estimated to be slow.
  function plan(previewPixels,targetPixels,previewMs){
    if(!(previewPixels>0&&targetPixels>0&&previewMs>=0))return null;
    const estimate=previewMs*targetPixels/previewPixels;
    if(targetPixels<350000||targetPixels<previewPixels*3||estimate<6500||(targetPixels<700000&&estimate<14000))return null;
    const middle=Math.min(Math.floor(targetPixels*.55),Math.max(Math.ceil(previewPixels*1.8),Math.round(Math.sqrt(previewPixels*targetPixels))));
    return middle>previewPixels*1.5?{middle,estimateMs:Math.round(estimate)}:null;
  }
  return Object.freeze({create,plan});
});
