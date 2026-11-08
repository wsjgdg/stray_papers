/* Bounded, in-memory cache of complete still frames. A cached image is valid
 * only for the same physical/optical parameters, camera, viewport and backend.
 * It is not an interpolator and must never turn a nearby image into a new
 * observation without first snapping the actual camera to the cached pose. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-experiments.js'));
  else root.RelativityFrameCache=factory(root.RelativityExperiments);
})(typeof globalThis==='object'?globalThis:this,function(Experiments){
  'use strict';
  // These controls affect only DOM/overlay/probe UI or dynamic-frame budgets,
  // not the pixels of a finished, paused ray-traced frame.
  const NON_IMAGE=new Set(['playbackRate','dynamicQuality','wavelength','contour','velocityArrow']);
  const FIELDS=Object.freeze(Object.keys(Experiments.BASE).filter(k=>!NON_IMAGE.has(k)));
  const CAMERA=new Set(['yaw','pitch','fov']);
  function contextKey(context){
    const {width,height,dpr,mode,kind,worker,software,unknown,identity}=context||{};
    if(!(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0&&Number.isFinite(dpr)&&dpr>0))throw new RangeError('Invalid cache viewport');
    return [width,height,dpr,mode,kind,!!worker,!!software,!!unknown,identity||''];
  }
  function key(state,context,exclude=[]){
    const omitted=new Set(exclude);
    const fields=FIELDS.filter(name=>!omitted.has(name)).map(name=>{
      const value=state[name];
      if(value===undefined||typeof value==='number'&&!Number.isFinite(value))throw new RangeError('Invalid cache state: '+name);
      return value;
    });
    return JSON.stringify([contextKey(context),fields]);
  }
  function budgets(memory){
    // Browser deviceMemory is only a hint; unreported memory uses a
    // conservative limit, not an assumption of a high-end device.
    const mb=1024*1024;
    if(Number.isFinite(memory)&&memory>0&&memory<=2)return {bytes:8*mb,entries:8};
    if(Number.isFinite(memory)&&memory>4)return {bytes:48*mb,entries:20};
    return {bytes:24*mb,entries:12};
  }
  function angleDifference(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
  function create({maxBytes=24*1024*1024,maxEntries=12,release=()=>{}}={}){
    if(!(Number.isFinite(maxBytes)&&maxBytes>0&&Number.isInteger(maxEntries)&&maxEntries>0))throw new RangeError('Invalid cache budget');
    const entries=new Map();let bytes=0,hits=0,misses=0,evictions=0;
    function releaseImage(image){try{release(image);}catch(_){}}
    function imageBytes(image){const width=image?.width,height=image?.height,cost=width*height*4;return Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0&&Number.isSafeInteger(cost)?cost:0;}
    function discard(k,evicted=false){
      const old=entries.get(k);if(!old)return false;entries.delete(k);bytes-=old.bytes;if(evicted)evictions++;
      releaseImage(old.image);for(const image of old.wide?.images||[])releaseImage(image);return true;
    }
    function put(state,context,image,info={}){
      const cost=imageBytes(image);
      if(!cost||cost>maxBytes){releaseImage(image);return false;}
      const k=key(state,context);if(entries.has(k))discard(k);
      while(entries.size>=maxEntries||bytes+cost>maxBytes)discard(entries.keys().next().value,true);
      const pose={yaw:state.yaw,pitch:state.pitch,fov:state.fov};
      // A gallery selection restores the complete saved experiment, not just
      // its camera. Snapshot primitive parameters so later UI edits cannot
      // silently relabel a stored image with another physical state.
      const parameters=Object.freeze(Object.fromEntries(Object.keys(Experiments.BASE).map(name=>[name,state[name]])));
      entries.set(k,{key:k,group:key(state,context,['yaw','pitch']),cameraGroup:key(state,context,[...CAMERA]),image,info:{...info},parameters,pose,bytes:cost});bytes+=cost;return true;
    }
    function get(state,context){
      const k=key(state,context),entry=entries.get(k);if(!entry){misses++;return null;}
      hits++;entries.delete(k);entries.set(k,entry);return entry;
    }
    // The optional already-computed wide view is an approximate drag underlay,
    // not the full frame. Count its pixel buffers against the same LRU budget.
    function attachWide(entry,images,info,fullSides=false){
      if(!Array.isArray(images))return false;
      if(!images.length||images.some(image=>!imageBytes(image))||!entry||entries.get(entry.key)!==entry){for(const image of images)releaseImage(image);return false;}
      const cost=images.reduce((n,image)=>n+imageBytes(image),0),old=entry.wide?.bytes||0;
      if(!Number.isSafeInteger(cost)||entry.bytes-old+cost>maxBytes){for(const image of images)releaseImage(image);return false;}
      if(entry.wide){for(const image of entry.wide.images)releaseImage(image);entry.bytes-=old;bytes-=old;entry.wide=null;}
      while(bytes+cost>maxBytes){const victim=[...entries.keys()].find(k=>k!==entry.key);if(victim===undefined){for(const image of images)releaseImage(image);return false;}discard(victim,true);}
      entry.wide={images,info:{...info},fullSides:!!fullSides,bytes:cost};entry.bytes+=cost;bytes+=cost;return true;
    }
    function nearby(state,context,maxAngle=.02){
      if(!(Number.isFinite(maxAngle)&&maxAngle>=0))throw new RangeError('Invalid snap tolerance');
      const group=key(state,context,['yaw','pitch']);let best=null,distance=Infinity;
      for(const entry of entries.values())if(entry.group===group){
        const dy=angleDifference(state.yaw,entry.pose.yaw),dp=state.pitch-entry.pose.pitch;
        // Conservatively bound both yaw and pitch (not just the forward axis:
        // near a pole a yaw change can still rotate the image noticeably).
        const delta=Math.hypot(dy,dp);
        if(delta<=maxAngle&&delta<distance){distance=delta;best=entry;}
      }
      return best?{entry:best,distance}:null;
    }
    function previous(state,context){
      const group=key(state,context,[...CAMERA]),current=key(state,context);
      const list=[...entries.values()];for(let i=list.length-1;i>=0;i--)if(list[i].cameraGroup===group&&list[i].key!==current)return list[i];
      return null;
    }
    return Object.freeze({put,get,attachWide,nearby,previous,list:()=>[...entries.values()].reverse(),peek:(state,context)=>entries.get(key(state,context))||null,key:(state,context)=>key(state,context),has:entry=>!!entry&&entries.get(entry.key)===entry,
      delete:entry=>!!entry&&entries.get(entry.key)===entry&&discard(entry.key),clear(){for(const k of [...entries.keys()])discard(k);},
      stats(){return {entries:entries.size,bytes,maxBytes,maxEntries,hits,misses,evictions};}});
  }
  return Object.freeze({FIELDS,budgets,key,angleDifference,create});
});
