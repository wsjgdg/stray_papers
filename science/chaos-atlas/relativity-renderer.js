/* Analytic light rays through five shared, finite worlds. No post-process warping. */
(function (root) {
  'use strict';
  const M=root.RelativityModel,W=root.RelativityWorlds,O=root.RelativityOptics,S=root.RelativitySpectrum,T=root.RelativityMaterialSpectrum,Surface=root.RelativitySurface,F=root.RelativityFoliage,G=root.RelativityGeometryPack;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),fract=n=>n-Math.floor(n),HALF=1.22;
  function motionFloor(state){return state.dynamicQuality==='responsive'?10000:state.dynamicQuality==='sharp'?32000:16000;}
  function eventState(state){
    const v=M.motionVelocity(state.scenario,state.beta,state.motionAngle||0,state.motionElevation||0),flyby=state.scenario==='flyby';
    const contact=M.objectContact(state.environment,state.shape),velocity=flyby?v:[0,0,0],observerVelocity=flyby?[0,0,0]:v;
    let camera=flyby?[0,1.65,0]:M.add([0,1.65,0],M.scale(v,state.time));
    // Anchor the worldline near a common retarded position, so heading changes
    // do not simply move the initial subject out of view. Motion stays inertial.
    let center=flyby?M.add([0,contact,7.5],M.scale(v,7.05+state.time)):[2.35,contact+.48,8.8];
    // Parameter comparisons pin a common lab observation event and body centre.
    // Shutter samples continue each inertial worldline from that reference event.
    if(state.lockedEvent){const dt=state.time-state.lockedEvent.time;camera=M.add(state.lockedEvent.camera,M.scale(observerVelocity,dt));center=M.add(state.lockedEvent.center,M.scale(velocity,dt));}
    const second=M.secondaryMotion(state);
    return {camera,center,velocity,observerVelocity,second};
  }
  function isPhoto(state,x,width){return state.view==='photo'||(state.view==='split'&&(state.scenario==='flyby'?x/width<state.split:x/width>=state.split));}
  function spectralAt(state,x,width){return state.spectrumSplit?x/width>=state.split:state.doppler===true;}
  function effectiveFov(state,width,height){const aspect=width/height;return 2*Math.atan(Math.tan(state.fov*Math.PI/360)*Math.max(1,.95/aspect))*180/Math.PI;}
  // The static world is reusable only for identical camera rays and fixture
  // geometry. Moving bodies and their contributions to shadows are traced
  // anew; fixed surface-to-light occlusion may be reused. One bounded cache
  // belongs to each Canvas renderer; observer motion, interaction and
  // non-pixel-centre probes bypass it completely.
  function createStaticRayCache(maxPixels=180000){
    let key='',entries=[],hits=0,misses=0,shadowHits=0,shadowMisses=0;
    return {
      begin(state,width,height,camera){
        if(!state.playing||state.interacting||state.scenario!=='flyby'||width*height>maxPixels)return null;
        const next=[width,height,state.environment,state.scenario,state.yaw,state.pitch,effectiveFov(state,width,height),
          ...camera,state.lightX||0,state.lightZ||0,state.lightYaw||0,state.lightElevation||0,
          state.lightWidthScale??1,state.lightDepthScale??1,state.sunAngularRadius??O.DEFAULT_SUN_RADIUS,O.shadowSampleCount(state),state.sceneMirror===true,state.mirrorX??-2.25,state.mirrorAngle||0].join('/');
        if(next!==key){key=next;entries=new Array(width*height);hits=misses=shadowHits=shadowMisses=0;}
        return {get(x,y,compute){
          const ix=Math.floor(x),iy=Math.floor(y);
          if(x!==ix+.5||y!==iy+.5||ix<0||iy<0||ix>=width||iy>=height)return {hit:compute(),shadows:null};
          const i=iy*width+ix;if(entries[i]!==undefined){hits++;return entries[i];}
          misses++;return entries[i]={hit:compute(),shadows:[]};
        },recordShadow(hit){if(hit)shadowHits++;else shadowMisses++;}};
      },
      clear(){key='';entries=[];hits=misses=shadowHits=shadowMisses=0;},
      stats(){return {hits,misses,shadowHits,shadowMisses,entries:entries.length};}
    };
  }
  // One bounded G-buffer for a paused, instantaneous Canvas observation.
  // It retains exact Float64 geometry and pre-optics surface RGB, not a
  // finished image. Every optical change still re-shades every pixel. The
  // shadow cache is independently keyed; moving the light invalidates it.
  // Mirror bounces, shutter samples, animation, probes and comparisons bypass
  // the buffer rather than pretending that their different rays are equal.
  // Keep the old 12 ms yield on one/unknown-core or data-saving devices.
  function fastStillAllowed(device){return !!(device?.hardwareConcurrency>=2&&!device?.connection?.saveData);}
  function intermediateBudget(memory){
    const mb=1024*1024;
    if(Number.isFinite(memory)&&memory>4)return 32*mb;
    if(Number.isFinite(memory)&&memory>2)return 24*mb;
    return 8*mb;
  }
  function createIntermediateRayCache(maxBytes=8*1024*1024){
    let current=null,disabled=false,used=false;
    const fields=['environment','scenario','shape','view','beta','motionAngle','motionElevation','secondEnabled','secondBeta','secondAngle','secondElevation','time','split','yaw','pitch','fov',
      'lightX','lightZ','lightYaw','lightElevation','lightWidthScale','lightDepthScale','sunAngularRadius','sceneMirror','mirrorX','mirrorAngle'];
    const shadowFields=['softShadows','shadowSamples','shadowTiming','split'];
    const chunkSize=512,fullRecordSize=9,compactBodySize=12,normalSize=3;
    const axes=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    function clear(){current=null;used=false;}
    function begin(state,width,height){
      used=false;
      if(disabled||state.reuseIntermediate===false||state.playing||state.interacting||state.shutter>0||state.sceneMirror===true||state.lockedEvent||!(maxBytes>0))return null;
      const key=JSON.stringify([width,height,...fields.map(f=>state[f]??null)]);
      if(!current||current.key!==key){
        // The original full buffer is fastest when there is ample memory. On
        // smaller devices, encode exact axis-aligned normals by an integer,
        // keep non-axis/body data as Float64 in bounded sparse chunks, and
        // reconstruct the identical camera ray on lookup. No Float32,
        // interpolation, ray substitution or resolution change is involved.
        const compact=width*height*62>maxBytes*.62;
        let stride=1,cols=width,rows=height;
        const chunkReserve=chunkSize*(compactBodySize+normalSize)*8;
        while(compact&&cols*rows*16+chunkReserve>maxBytes){
          stride*=2;cols=Math.ceil(width/stride);rows=Math.ceil(height/stride);if(stride>Math.max(width,height))return null;
        }
        const count=cols*rows;
        // If the typed-buffer budget leaves room for sparse body data, retain
        // material on alternating columns; otherwise use a quarter of samples.
        const materialRows=compact&&count*16+Math.ceil(cols/2)*rows*25+Math.max(chunkReserve,maxBytes*.25)<=maxBytes?1:2;
        try{current={key,width,height,stride,cols,rows,count,compact,materialRows,bytes:count*(compact?15:62),tag:new Uint16Array(count),
          bodyIndex:new Uint32Array(count),normalCode:compact?new Uint8Array(count):null,data:new Float64Array(count*(compact?1:7)),
          meta:[null,null],byCenter:new WeakMap(),byName:new Map(),bodyChunks:[],bodyCount:0,normalChunks:[],normalCount:0,filled:0,
          material:null,materialFlags:null,shadow:null,shadowFlags:null,shadowKey:'',hits:0,misses:0,materialHits:0,shadowHits:0};}
        catch(_){clear();disabled=true;return null;}
      }
      const c=current,shadowKey=JSON.stringify(shadowFields.map(f=>state[f]??null));
      if(c.shadowKey!==shadowKey){if(c.shadowFlags)c.shadowFlags.fill(0);c.shadowKey=shadowKey;}
      c.hits=c.misses=c.materialHits=c.shadowHits=0;used=true;
      return api;
    }
    function index(x,y){
      const c=current;if(!c)return -1;const ix=Math.floor(x),iy=Math.floor(y);
      if(x!==ix+.5||y!==iy+.5||ix<0||iy<0||ix>=c.width||iy>=c.height||ix%c.stride||iy%c.stride)return -1;
      return (iy/c.stride)*c.cols+ix/c.stride;
    }
    function metaFor(hit){
      const c=current;let id,key;
      if(hit.body){key='body/'+hit.bodyId+'/'+hit.kind;id=c.byName.get(key);}
      else if(hit.center){id=c.byCenter.get(hit.center);}
      else{key='static/'+hit.kind+'/'+hit.material;id=c.byName.get(key);}
      if(id!==undefined)return id;
      id=c.meta.length;if(id>=65535)return 0;
      c.meta.push({kind:hit.kind,material:hit.material,center:hit.center,half:hit.half,body:!!hit.body,bodyId:hit.bodyId});
      if(key)c.byName.set(key,id);else c.byCenter.set(hit.center,id);return id;
    }
    // Compact hard shadows need only one byte per sample. Reserve that space
    // even if the initial image has shadows off, so enabling them later does
    // not evict geometry or push the typed-buffer budget over its limit.
    function reservedShadow(c){return c.compact&&!c.shadowFlags?c.count:0;}
    function bodySlot(){
      const c=current,chunk=Math.floor(c.bodyCount/chunkSize),size=c.compact?compactBodySize:fullRecordSize;
      if(chunk===c.bodyChunks.length){
        const cost=chunkSize*size*8;if(c.bytes+reservedShadow(c)+cost>maxBytes)return -1;
        try{c.bodyChunks.push(new Float64Array(chunkSize*size));c.bytes+=cost;}catch(_){return -1;}
      }
      return c.bodyCount++;
    }
    function normalSlot(){
      const c=current,chunk=Math.floor(c.normalCount/chunkSize);
      if(chunk===c.normalChunks.length){
        const cost=chunkSize*normalSize*8;if(c.bytes+reservedShadow(c)+cost>maxBytes)return -1;
        try{c.normalChunks.push(new Float64Array(chunkSize*normalSize));c.bytes+=cost;}catch(_){return -1;}
      }
      return c.normalCount++;
    }
    function axisCode(normal){
      // Object.is also preserves the sign of zero; unusual normals use the
      // sparse Float64 path rather than changing even a signed-zero value.
      const [x,y,z]=normal;
      if(Object.is(y,0)&&Object.is(z,0)){if(x===1)return 1;if(x===-1)return 2;}
      if(Object.is(x,0)&&Object.is(z,0)){if(y===1)return 3;if(y===-1)return 4;}
      if(Object.is(x,0)&&Object.is(y,0)){if(z===1)return 5;if(z===-1)return 6;}
      return 0;
    }
    function remember(x,y,result){
      const c=current,i=index(x,y);if(!c||i<0||c.tag[i])return;
      const hit=result.hit;let tag=1,slot=-1;
      if(hit){
        tag=metaFor(hit);if(!tag)return;
        if(hit.body){slot=bodySlot();if(slot<0)return;c.bodyIndex[i]=slot+1;}
        else if(c.compact){
          const code=axisCode(hit.normal);
          if(code)c.normalCode[i]=code;
          else{
            slot=normalSlot();if(slot<0)return;c.bodyIndex[i]=slot+1;c.normalCode[i]=7;
            const a=c.normalChunks[Math.floor(slot/chunkSize)],p=(slot%chunkSize)*normalSize;
            for(let k=0;k<3;k++)a[p+k]=hit.normal[k];
          }
        }
      }
      const d=c.data;
      if(c.compact){
        if(hit){
          d[i]=hit.distance;
          if(hit.body){const a=c.bodyChunks[Math.floor(slot/chunkSize)],p=(slot%chunkSize)*compactBodySize;
            for(let k=0;k<3;k++){a[p+k]=hit.normal[k];a[p+3+k]=hit.point[k];a[p+6+k]=hit.restPoint[k];a[p+9+k]=hit.restNormal[k];}}
        }
      }else{
        const o=i*7,dir=result.labDirection;d[o]=dir[0];d[o+1]=dir[1];d[o+2]=dir[2];
        if(hit){d[o+3]=hit.distance;d[o+4]=hit.normal[0];d[o+5]=hit.normal[1];d[o+6]=hit.normal[2];
          if(slot>=0){const a=c.bodyChunks[Math.floor(slot/chunkSize)],p=(slot%chunkSize)*fullRecordSize;
            for(let k=0;k<3;k++){a[p+k]=hit.point[k];a[p+3+k]=hit.restPoint[k];a[p+6+k]=hit.restNormal[k];}}}
      }
      c.tag[i]=tag;c.filled++;
    }
    function lookup(x,y,state,prepared){
      const c=current,i=index(x,y);if(!c||i<0)return null;const tag=c.tag[i];if(!tag){c.misses++;return null;}c.hits++;
      const d=c.data,o=i*7,photo=isPhoto(state,x,c.width),shadowInstant=state.shadowTiming==='instant'||(state.shadowTiming==='split'&&x/c.width>=state.split);
      // The same prepared ray routine and event state produced the original
      // Float64 direction. Recompute it, including aberration, when compact.
      const direction=c.compact?prepared.ray(x,y):null;
      const labDirection=c.compact?(state.scenario==='observer'&&photo?M.observerToLab(direction,prepared.observerVelocity):direction):[d[o],d[o+1],d[o+2]];
      let hit=null;
      if(tag!==1){
        const m=c.meta[tag],distance=c.compact?d[i]:d[o+3];let normal,bodyArray=null,bodyOffset=0;
        if(c.compact){
          if(m.body){const slot=c.bodyIndex[i]-1;bodyArray=c.bodyChunks[Math.floor(slot/chunkSize)];bodyOffset=(slot%chunkSize)*compactBodySize;normal=[bodyArray[bodyOffset],bodyArray[bodyOffset+1],bodyArray[bodyOffset+2]];}
          else{const code=c.normalCode[i];if(code===7){const slot=c.bodyIndex[i]-1,a=c.normalChunks[Math.floor(slot/chunkSize)],p=(slot%chunkSize)*normalSize;normal=[a[p],a[p+1],a[p+2]];}else normal=axes[code-1].slice();}
        }else normal=[d[o+4],d[o+5],d[o+6]];
        hit={kind:m.kind,material:m.material,distance,normal};
        if(m.body){const slot=c.bodyIndex[i]-1,a=bodyArray||c.bodyChunks[Math.floor(slot/chunkSize)],p=c.compact?bodyOffset:(slot%chunkSize)*fullRecordSize,k=c.compact?3:0;
          hit.body=true;hit.bodyId=m.bodyId;hit.velocity=m.bodyId==='B'?prepared.second.velocity:prepared.velocity;
          hit.point=[a[p+k],a[p+k+1],a[p+k+2]];hit.restPoint=[a[p+k+3],a[p+k+4],a[p+k+5]];hit.restNormal=[a[p+k+6],a[p+k+7],a[p+k+8]];
        }else{hit.point=M.add(prepared.camera,M.scale(labDirection,distance));if(m.center){hit.center=m.center;hit.half=m.half;}}
      }
      return {camera:prepared.camera,center:prepared.center,velocity:prepared.velocity,observerVelocity:prepared.observerVelocity,second:prepared.second,
        direction:labDirection,labDirection,photo,shadowInstant,spectral:spectralAt(state,x,c.width),hit,kernels:prepared.kernels};
    }
    function materialIndex(c,i){
      if(!c.compact)return i;
      const x=i%c.cols,y=Math.floor(i/c.cols);
      return x%2||y%c.materialRows?-1:(y/c.materialRows)*Math.ceil(c.cols/2)+x/2;
    }
    function allocMaterial(){
      const c=current;if(c.material)return true;
      const count=c.compact?Math.ceil(c.cols/2)*Math.ceil(c.rows/c.materialRows):c.count,cost=count*25;
      if(c.bytes+reservedShadow(c)+cost>maxBytes)return false;
      try{c.material=new Float64Array(count*3);c.materialFlags=new Uint8Array(count);c.bytes+=cost;return true;}catch(_){c.material=null;c.materialFlags=null;return false;}
    }
    function material(i){const c=current;if(i<0||!c)return null;const m=materialIndex(c,i);if(m<0||!c.materialFlags?.[m])return null;c.materialHits++;const j=m*3;return [c.material[j],c.material[j+1],c.material[j+2]];}
    function saveMaterial(i,rgb){const c=current;if(i<0||!c?.tag[i])return;const m=materialIndex(c,i);if(m<0||!allocMaterial())return;const j=m*3;c.material[j]=rgb[0];c.material[j+1]=rgb[1];c.material[j+2]=rgb[2];c.materialFlags[m]=1;}
    function invalidateMaterial(){if(current?.materialFlags)current.materialFlags.fill(0);}
    function allocShadow(soft){
      const c=current;
      if(c.compact){
        if(!c.shadowFlags){if(c.bytes+c.count>maxBytes)return false;try{c.shadowFlags=new Uint8Array(c.count);c.bytes+=c.count;}catch(_){return false;}}
        if(soft&&!c.shadow){const cost=c.count*16;if(c.bytes+cost>maxBytes)return false;try{c.shadow=new Float64Array(c.count*2);c.bytes+=cost;}catch(_){return false;}}
        return true;
      }
      if(c.shadow)return true;const cost=c.count*17;if(c.bytes+cost>maxBytes)return false;
      try{c.shadow=new Float64Array(c.count*2);c.shadowFlags=new Uint8Array(c.count);c.bytes+=cost;return true;}catch(_){c.shadow=null;c.shadowFlags=null;return false;}
    }
    function shadePreparation(result,state,x,y){
      const c=current,i=index(x,y);if(!c||i<0||!c.tag[i]||!result.hit)return null;
      const prepared={cache:api,index:i};
      if(state.shadows!==false&&!(state.emissionMap&&(state.scenario==='observer'||result.photo))){
        const light=O.keyLight(state.environment||'station',result.hit.point,state);let info;
        if(c.shadowFlags?.[i]){
          c.shadowHits++;const flag=c.shadowFlags[i];
          info=flag===1?{shadowed:false}:state.softShadows?{shadowed:true,sampleCount:O.shadowSampleCount(state),weightedDirect:c.shadow[i*2],weightedVisible:c.shadow[i*2+1]}:{shadowed:true,light,cosine:M.dot(result.hit.normal,light.direction)};
        }else{
          info=O.shadingIllumination(state,result,light);
          if(allocShadow(!!state.softShadows)){c.shadowFlags[i]=info.shadowed?2:1;if(state.softShadows&&info.shadowed){c.shadow[i*2]=info.weightedDirect;c.shadow[i*2+1]=info.weightedVisible;}}
        }
        prepared.light=light;prepared.info=info;
      }
      return prepared;
    }
    function stats(){const c=current;return {active:used,bytes:c?.bytes||0,maxBytes,stride:c?.stride||0,slots:c?.count||0,geometryHits:used?c?.hits||0:0,geometryMisses:used?c?.misses||0:0,materialHits:used?c?.materialHits||0:0,shadowHits:used?c?.shadowHits||0:0};}
    const api=Object.freeze({begin,clear,suspend(){used=false;},filled:()=>current?.filled||0,lookup,remember,material,saveMaterial,invalidateMaterial,shadePreparation,stats});return api;
  }
  function trace(state,x,y,width,height,prepared=null){
    const reused=prepared?.intermediate?.lookup(x,y,state,prepared);if(reused)return reused;
    const {camera,center,velocity,observerVelocity,second}=prepared||eventState(state);
    const direction=prepared?prepared.ray(x,y):M.cameraRay(x,y,width,height,state.yaw,state.pitch,effectiveFov(state,width,height));
    const photo=isPhoto(state,x,width);
    const labDirection=state.scenario==='observer'&&photo?M.observerToLab(direction,observerVelocity):direction;
    const world=()=>W.traceWithFixture(camera,labDirection,state.environment,state.scenario==='observer',state);
    const staticEntry=prepared?.staticWorld?prepared.staticWorld.get(x,y,world):null,env=staticEntry?staticEntry.hit:world();
    const bodyShape=state.shape==='artifact'?'cube':state.shape,lightCone=state.scenario==='flyby'?photo:true,kernels=prepared?.kernels;
    const args=kernels?null:{origin:camera,direction:labDirection,center,beta:velocity,shape:bodyShape,halfSize:M.objectHalf(state.environment,state.shape),radius:HALF,bevel:M.objectBevel(state.environment,state.shape),lightCone,time:state.time,details:M.objectParts(state.environment||'station',state.shape)};
    let body=kernels?kernels.a.hit(camera,labDirection,center,lightCone,state.time):M.movingObjectHit(args),bodyId='A',bodyVelocity=velocity;
    if(second){const other=kernels?kernels.b.hit(camera,labDirection,second.center,lightCone,state.time):M.movingObjectHit({...args,center:second.center,beta:second.velocity});if(other&&(!body||other.distance<body.distance)){body=other;bodyId='B';bodyVelocity=second.velocity;}}
    const bodyKind=body&&(body.part||bodyShape);
    const hit=body&&(!env||body.distance<env.distance)?{...body,body:true,bodyId,velocity:bodyVelocity,kind:bodyKind,material:W.material[bodyKind]}:env;
    const shadowInstant=state.shadowTiming==='instant'||(state.shadowTiming==='split'&&x/width>=state.split);
    // Static surface-to-light geometry can be reused, but moving bodies are
    // still intersected afresh for every shadow ray and every shutter event.
    const cacheable=hit===env&&staticEntry?.shadows,result={camera,center,velocity,observerVelocity,second,direction,labDirection,photo,shadowInstant,spectral:spectralAt(state,x,width),hit};
    if(prepared?.internal){if(kernels)result.kernels=kernels;if(cacheable){result.staticEntry=staticEntry;result.staticCache=prepared.staticWorld;}}
    else{
      // Keep the public single-ray result serializable and exactly comparable
      // to trace(); private reuse metadata must not leak into probe results.
      if(kernels)Object.defineProperty(result,'kernels',{value:kernels});
      if(cacheable)Object.defineProperties(result,{staticEntry:{value:staticEntry},staticCache:{value:prepared.staticWorld}});
    }
    if(prepared?.intermediate)prepared.intermediate.remember(x,y,result);
    return result;
  }
  // One backward-traced specular bounce at a stationary ideal panel. The
  // secondary ray starts at the reflection event, not at the observation
  // time: c=1, including the tiny numerical offset along the outgoing ray.
  // No recursive reflection or motion of the mirror itself is implied.
  function traceReflection(state,primary){
    if(state.sceneMirror!==true||!primary?.photo||primary.hit?.kind!=='mirror-panel'||state.emissionMap)return null;
    const h=primary.hit,n=h.normal,incident=primary.labDirection;
    const direction=M.normalize(M.sub(incident,M.scale(n,2*M.dot(incident,n))));
    const epsilon=.003,mirrorTime=state.time-h.distance,time=mirrorTime-epsilon;
    const origin=M.add(h.point,M.scale(direction,epsilon)),bounceState={...state,time};
    const event=eventState(bounceState),world=W.traceWithFixture(origin,direction,state.environment,state.scenario==='observer',bounceState);
    const shape=state.shape==='artifact'?'cube':state.shape;
    const args={origin,direction,center:event.center,beta:event.velocity,shape,halfSize:M.objectHalf(state.environment,state.shape),radius:HALF,bevel:M.objectBevel(state.environment,state.shape),lightCone:true,time,details:M.objectParts(state.environment||'station',state.shape)};
    let body=M.movingObjectHit(args),bodyId='A',velocity=event.velocity;
    if(event.second){const other=M.movingObjectHit({...args,center:event.second.center,beta:event.second.velocity});if(other&&(!body||other.distance<body.distance)){body=other;bodyId='B';velocity=event.second.velocity;}}
    const kind=body&&(body.part||shape),hit=body&&(!world||body.distance<world.distance)?{...body,body:true,bodyId,velocity,kind,material:W.material[kind]}:world;
    const ray={...event,camera:origin,direction,labDirection:direction,observerLabDirection:primary.labDirection,photo:true,
      shadowInstant:primary.shadowInstant,spectral:primary.spectral,hit,reflectedFrom:{point:h.point,time:mirrorTime,distance:h.distance,direction:incident,epsilon}};
    return {state:bounceState,ray,mirrorTime,origin,direction,sourceTime:hit?time-hit.distance:null,totalDistance:hit?h.distance+epsilon+hit.distance:null};
  }
  // The camera and observation event are constant across a completed render.
  // Prepare them once; preserve cameraRay's arithmetic and public single-ray
  // path so the pixels, light-cone intersections and probe stay identical.
  function prepareTrace(state,width,height,staticCache=null,internal=false,intermediate=null){
    if(!(width>0&&height>0))throw new RangeError('Camera dimensions must be positive');
    state={...state}; // A prepared observation must not change mid-frame.
    const {yaw,pitch}=state,cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp];
    const right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
    const aspect=width/height,t=Math.tan(effectiveFov(state,width,height)*Math.PI/360);
    const prepared={...eventState(state),internal,details:M.objectParts(state.environment||'station',state.shape),ray(x,y){
      const sx=(2*x/width-1)*aspect,sy=1-2*y/height;
      return M.normalize(M.add(forward,M.add(M.scale(right,sx*t),M.scale(up,sy*t))));
    }};
    const common={shape:state.shape==='artifact'?'cube':state.shape,halfSize:M.objectHalf(state.environment,state.shape),radius:HALF,bevel:M.objectBevel(state.environment,state.shape),details:prepared.details};
    prepared.kernels={a:M.prepareMovingObject({...common,beta:prepared.velocity}),b:prepared.second?M.prepareMovingObject({...common,beta:prepared.second.velocity}):null};
    prepared.staticWorld=staticCache?.begin(state,width,height,prepared.camera)||null;
    prepared.intermediate=intermediate;
    return (x,y)=>trace(state,x,y,width,height,prepared);
  }
  const vertex=`attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}`;
  const fragment=(mirror=false,accurateLine=false)=>{let source=`
// Unified, data-driven finite world geometry
precision highp float;
uniform vec2 u_resolution,u_jitter,u_lightHalf;
uniform vec3 u_camera,u_center,u_centerB,u_halfSize,u_velocity,u_velocityB,u_lightDirection,u_lightPosition,u_partCenter,u_partHalf;
uniform float u_yaw,u_pitch,u_tanFov,u_beta,u_split,u_time,u_exposure,u_debugLightGain,u_bevel,u_lineWavelength,u_roughnessScale,u_sunRadius;
uniform float u_nodeBase,u_primitiveBase,u_nodeCount,u_partBase,u_partCount;
uniform int u_scenario,u_shape,u_view,u_debug,u_environment,u_secondEnabled,u_shadows,u_soft,u_shadowSamples,u_spectral,u_spectrumSplit,u_emissionMap,u_sourceMode,u_shadowTiming,u_surfaceMode,u_linearOutput,u_material,u_toneMode;
uniform sampler2D u_sky,u_stone,u_crate,u_facade,u_asphalt,u_wall,u_mountains,u_sign;
const float PI=3.141592653589793;
const float HALF=1.22;
vec3 sky(vec3 rd){
  float u=fract(.5+atan(rd.x,rd.z)/(2.0*PI));
  float v=clamp((u_environment==3?.21:.05)+.82*max(rd.y,0.0),.03,.96);
  if(u_environment==3)return texture2D(u_mountains,vec2(u,.5+.5*v)).rgb;
  if(u_environment==4)return texture2D(u_sky,vec2(u,v)).rgb;
  if(u_environment==2)return vec3(.39,.42,.42)*(1.0+.10*max(rd.y,0.0));
  return texture2D(u_sky,vec2(u,u_environment==1?.5*v:.5+.5*v)).rgb;
}
vec2 objectUV(vec2 uv){
  uv=clamp(uv,.003,.997);return vec2(((u_environment==4?3.0:float(u_environment))+uv.x)*.25,.5+.5*uv.y);
}
float boxHit(vec3 ro,vec3 rd,vec3 h,out vec3 normal){
  if((abs(rd.x)<.00000001&&abs(ro.x)>h.x)||(abs(rd.y)<.00000001&&abs(ro.y)>h.y)||(abs(rd.z)<.00000001&&abs(ro.z)>h.z))return 1e20;
  vec3 safe=vec3(abs(rd.x)<.00000001?(rd.x<0.0?-.00000001:.00000001):rd.x,abs(rd.y)<.00000001?(rd.y<0.0?-.00000001:.00000001):rd.y,abs(rd.z)<.00000001?(rd.z<0.0?-.00000001:.00000001):rd.z);
  vec3 t0=(-h-ro)/safe,t1=(h-ro)/safe,tmin=min(t0,t1),tmax=max(t0,t1);
  float near=max(max(tmin.x,tmin.y),tmin.z),far=min(min(tmax.x,tmax.y),tmax.z);
  if(far<max(near,.00001))return 1e20;
  float t=near>.00001?near:far;vec3 p=ro+t*rd,q=abs(p/h);normal=vec3(0.0);
  if(q.x>=q.y&&q.x>=q.z)normal.x=sign(p.x);else if(q.y>=q.z)normal.y=sign(p.y);else normal.z=sign(p.z);
  return t;
}
bool clipEdge(vec3 ro,vec3 rd,vec3 n,float bound,inout float near,inout float far,inout vec3 nearN,inout vec3 farN){
  float den=dot(n,rd),gap=bound-dot(n,ro);if(abs(den)<1e-9)return gap>=0.0;
  float t=gap/den;if(den<0.0){if(t>near){near=t;nearN=n;}}else if(t<far){far=t;farN=n;}return near<=far;
}
float bevelBoxHit(vec3 ro,vec3 rd,vec3 h,float bevel,out vec3 normal){
  vec3 broadNormal;if(boxHit(ro,rd,h,broadNormal)>1e19)return 1e20;
  vec3 safe=vec3(abs(rd.x)<1e-8?(rd.x<0.0?-1e-8:1e-8):rd.x,abs(rd.y)<1e-8?(rd.y<0.0?-1e-8:1e-8):rd.y,abs(rd.z)<1e-8?(rd.z<0.0?-1e-8:1e-8):rd.z);
  vec3 ta=(-h-ro)/safe,tb=(h-ro)/safe,lo=min(ta,tb),hi=max(ta,tb);
  float near=max(max(lo.x,lo.y),lo.z),far=min(min(hi.x,hi.y),hi.z);
  vec3 pn=ro+near*rd,pf=ro+far*rd,an=abs(pn/h),af=abs(pf/h);
  vec3 nn=an.x>=an.y&&an.x>=an.z?vec3(sign(pn.x),0.0,0.0):(an.y>=an.z?vec3(0.0,sign(pn.y),0.0):vec3(0.0,0.0,sign(pn.z)));
  vec3 nf=af.x>=af.y&&af.x>=af.z?vec3(sign(pf.x),0.0,0.0):(af.y>=af.z?vec3(0.0,sign(pf.y),0.0):vec3(0.0,0.0,sign(pf.z)));
  for(int pair=0;pair<3;pair++)for(int side=0;side<4;side++){
    float a=(side==0||side==1)?-1.0:1.0,b=(side==0||side==2)?-1.0:1.0;
    vec3 n=pair==0?vec3(a,b,0.0):(pair==1?vec3(a,0.0,b):vec3(0.0,a,b));
    float bound=(pair==0?h.x+h.y:(pair==1?h.x+h.z:h.y+h.z))-bevel;
    if(!clipEdge(ro,rd,n,bound,near,far,nn,nf))return 1e20;
  }
  if(far<=.00001)return 1e20;normal=normalize(near>.00001?nn:nf);return near>.00001?near:far;
}
float triangleHit(vec3 ro,vec3 rd,vec3 a,vec3 b,vec3 c,out vec3 normal){
  vec3 e1=b-a,e2=c-a,p=cross(rd,e2);float det=dot(e1,p);if(abs(det)<.00000001)return 1e20;
  float inv=1.0/det;vec3 tv=ro-a;float u=dot(tv,p)*inv;if(u<0.0||u>1.0)return 1e20;
  vec3 q=cross(tv,e1);float v=dot(rd,q)*inv;if(v<0.0||u+v>1.0)return 1e20;
  float t=dot(e2,q)*inv;if(t<=.00001)return 1e20;normal=normalize(cross(e1,e2));return t;
}
float sphereHit(vec3 ro,vec3 rd,float radius,out vec3 normal){
  float a=dot(rd,rd),b=dot(ro,rd),c=dot(ro,ro)-radius*radius,disc=b*b-a*c;if(disc<0.0)return 1e20;
  float s=sqrt(max(0.0,disc)),near=(-b-s)/a,far=(-b+s)/a,t=near>.00001?near:(far>.00001?far:1e20);
  if(t<1e19)normal=normalize(ro+t*rd);return t;
}
// Closed cylinder (local y is the axis after a swizzle); matches the CPU
// intersections including caps and rays starting inside the geometry.
float cylinderHit(vec3 ro,vec3 rd,vec3 h,float axis,out vec3 normal){
  vec3 o=axis<.5?ro.yxz:(axis>1.5?ro.xzy:ro),d=axis<.5?rd.yxz:(axis>1.5?rd.xzy:rd);
  float radius=axis<.5?h.y:h.x,halfLen=axis<.5?h.x:(axis>1.5?h.z:h.y);
  float a=dot(d.xz,d.xz),b=dot(o.xz,d.xz),c=dot(o.xz,o.xz)-radius*radius,best=1e20;vec3 n=vec3(0.0);
  if(a>1e-12){float disc=b*b-a*c;if(disc>=0.0){float root=sqrt(max(0.0,disc));
    float t=(-b-root)/a;if(t>.00001&&abs(o.y+t*d.y)<=halfLen){best=t;n=normalize(vec3(o.x+t*d.x,0.0,o.z+t*d.z));}
    t=(-b+root)/a;if(t>.00001&&t<best&&abs(o.y+t*d.y)<=halfLen){best=t;n=normalize(vec3(o.x+t*d.x,0.0,o.z+t*d.z));}
  }}
  if(abs(d.y)>1e-8){
    float t=(-halfLen-o.y)/d.y;vec2 q=o.xz+t*d.xz;if(t>.00001&&t<best&&dot(q,q)<=radius*radius){best=t;n=vec3(0.0,-1.0,0.0);}
    t=(halfLen-o.y)/d.y;q=o.xz+t*d.xz;if(t>.00001&&t<best&&dot(q,q)<=radius*radius){best=t;n=vec3(0.0,1.0,0.0);}
  }
  normal=axis<.5?n.yxz:(axis>1.5?n.xzy:n);return best;
}
// Transparent cutout cards use a shared, synchronous binary mask packed in
// the spare right-hand sign-atlas columns. The CPU tests the same texels.
float foliageHit(vec3 ro,vec3 rd,vec3 c,vec3 h,float axis,float species,out vec3 normal){
  float denom=axis<.5?rd.x:rd.z;if(abs(denom)<1e-8)return 1e20;
  float t=((axis<.5?c.x:c.z)-(axis<.5?ro.x:ro.z))/denom;if(t<=.00001)return 1e20;
  vec3 p=ro+t*rd;float u=axis<.5?(p.z-c.z)/(2.0*h.z)+.5:(p.x-c.x)/(2.0*h.x)+.5;
  float v=(p.y-c.y)/(2.0*h.y)+.5;if(u<0.0||u>=1.0||v<0.0||v>=1.0)return 1e20;
  float ix=floor(u*128.0),iy=min(191.0,floor((1.0-v)*192.0));
  float mask=texture2D(u_sign,vec2((768.0+species*128.0+ix+.5)/1024.0,(256.0-iy-.5)/256.0)).r;
  if(mask<.5)return 1e20;normal=axis<.5?vec3(denom>0.0?-1.0:1.0,0.0,0.0):vec3(0.0,0.0,denom>0.0?-1.0:1.0);return t;
}
// Geometry occupies rows 232-255 of the sign atlas. Each texel is read
// at its exact centre; packed bytes are uploaded without alpha premultiplying.
vec4 geom(float pos){
  return floor(texture2D(u_sign,vec2((mod(pos,1024.0)+.5)/1024.0,(24.0-floor(pos/1024.0)-.5)/256.0))*255.0+.5);
}
float word(vec2 bytes){return bytes.x*256.0+bytes.y;}
vec2 coordinates(vec4 bytes){return (vec2(word(bytes.xy),word(bytes.zw))-32768.0)/400.0;}
void bounds(float pos,out vec3 center,out vec3 halfSize){
  vec2 a=coordinates(geom(pos)),b=coordinates(geom(pos+1.0)),c=coordinates(geom(pos+2.0));
  center=vec3(a,b.x);halfSize=vec3(b.y,c);
}
void primitiveHit(float idx,vec3 ro,vec3 rd,inout float nearest,inout vec3 normal,inout int material,inout vec3 boxCenter,inout vec3 boxHalf){
  float pos=u_primitiveBase+idx*9.0;vec3 c,h,n;bounds(pos,c,h);vec4 m=geom(pos+3.0);float t=1e20;
  if(m.r<.5)t=boxHit(ro-c,rd,h,n);
  else if(m.r<1.5){
    vec2 a=coordinates(geom(pos+4.0)),b=coordinates(geom(pos+5.0)),d=coordinates(geom(pos+6.0));
    vec2 e=coordinates(geom(pos+7.0)),f=coordinates(geom(pos+8.0));
    t=triangleHit(ro,rd,vec3(a,b.x),vec3(b.y,d),vec3(e,f.x),n);
  }else if(m.r<2.5)t=cylinderHit(ro-c,rd,h,m.b,n);
  else t=foliageHit(ro,rd,c,h,m.b,m.a,n);
  if(t<nearest){nearest=t;normal=n;material=int(m.g);boxCenter=c;boxHalf=h;}
}
void worldHit(vec3 ro,vec3 rd,inout float nearest,inout vec3 normal,inout int material,inout vec3 boxCenter,inout vec3 boxHalf){
  float idx=0.0;
  for(int i=0;i<128;i++){
    if(idx>=u_nodeCount)break;
    float pos=u_nodeBase+idx*4.0;vec3 c,h,n;bounds(pos,c,h);h+=vec3(.003);
    vec4 meta=geom(pos+3.0);float next=word(meta.xy),leaf=word(meta.zw),bound=boxHit(ro-c,rd,h,n);
    bool inside=all(lessThanEqual(abs(ro-c),h));
    if(bound>=1e19||(!inside&&bound>=nearest)){idx=next;continue;}
    if(leaf>=32768.0){
      float count=floor((leaf-32768.0)/8192.0)+1.0,first=mod(leaf-32768.0,8192.0);
      // One small bounded loop avoids three copies of the comparatively
      // large primitive-intersection shader. Inlining all three makes even
      // the default hard-shadow path substantially slower on software GL.
      for(int candidate=0;candidate<3;candidate++){
        if(float(candidate)>=count)break;
        primitiveHit(first+float(candidate),ro,rd,nearest,normal,material,boxCenter,boxHalf);
      }
    }
    idx+=1.0;
  }
  if(u_scenario==1){
    vec3 c=vec3(2.35,.24,8.8),h=vec3(1.35,.24,1.35),n;float t=boxHit(ro-c,rd,h,n);
    if(t<nearest){nearest=t;normal=n;material=3;boxCenter=c;boxHalf=h;}
  }
}
float stripe(float x,float period,float width){float a=mod(x+1000.0*period,period);return 1.0-smoothstep(width,width*1.8,min(a,period-a));}
vec2 faceUV(vec3 p,vec3 center,vec3 halfSize,vec3 normal){
  vec3 q=(p-center)/halfSize;
  if(abs(normal.x)>.5)return vec2(q.z,q.y)*.5+.5;
  if(abs(normal.y)>.5)return vec2(q.x,q.z)*.5+.5;
  return vec2(q.x,q.y)*.5+.5;
}
// A nonnegative seven-basis spectrum is integrated against the tabulated
// CIE observer in JS and packed into the sign atlas, indexed by log(D).
float spectrumV(float row){return (256.0-(224.0+row+.5))/256.0;}
float spectrumScaleLog(float col){
  vec2 a=texture2D(u_sign,vec2((col+.5)/1024.0,spectrumV(7.0))).rg*255.0;
  float encoded=floor(a.x+.5)*256.0+floor(a.y+.5);
  return mix(-22.0,1.0,encoded/65535.0);
}
vec3 spectrumRow(float col,float row,float scale){
  vec3 q=texture2D(u_sign,vec2((col+.5)/1024.0,spectrumV(row))).rgb;
  return (q*255.0-128.0)/127.0*scale;
}
vec3 toLinear(vec3 c){c=clamp(c,0.0,1.0);return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 toSRGB(vec3 c){c=max(c,0.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
vec3 displayRadiance(vec3 c){vec3 x=min(toLinear(c),vec3(.995));return x/(1.0-x);}
float pointAttenuation(float d){return min(2.0,26.0/(d*d+1.0));}
float ambientHemisphere(vec3 n){float up=clamp(.5+.5*n.y,0.0,1.0);return (u_environment==0||u_environment==2)?(.64+.06*up):(.49+.14*up);}
float sceneFog(float d){bool indoor=u_environment==0||u_environment==2;float density=u_environment==2?.0015:(u_environment==0?.0025:.012);return clamp(1.0-exp(-d*density),0.0,indoor?.12:.34);}
vec2 surfaceProfile(int m){
  if(m==4){if(u_environment==2)return vec2(.38,.16);if(u_environment==4)return vec2(.32,.75);if(u_environment==3)return vec2(.72,0.0);return vec2(.86,0.0);}
  if(m==18||m==26||m==47)return vec2(.17,.08);
  if(m==25||m==43)return vec2(.38,.16);
  if(m==2||m==10||m==19||m==20||m==23||m==31||m==33||m==36||m==38||m==40||m==41||m==42||m==45||m==46)return vec2(.32,.75);
  if(m==6||m==32||m==34)return vec2(.72,0.0);
  if(m==27||m==35)return vec2(.93,0.0);return vec2(.86,0.0);
}
vec3 surfaceResponse(vec3 rgb,vec3 n,vec3 l,vec3 view,float attenuation,float visibility,int m){
  if(m==13||m==39)return rgb;
  vec2 profile=surfaceProfile(m);float rough=clamp(profile.x*u_roughnessScale,.08,1.0),metal=profile.y;
  vec3 base=toLinear(rgb),extra=vec3(0.0);float nl=max(dot(n,l),0.0),nv=max(dot(n,view),0.0);
  if(nl>0.0&&nv>0.0&&visibility>0.0&&length(l+view)>1e-6){
    vec3 h=normalize(l+view);float nh=max(dot(n,h),0.0),vh=max(dot(view,h),0.0);
    float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.0)+1.0,D=a2/(3.14159265359*den*den),k=(rough+1.0)*(rough+1.0)/8.0;
    float G=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k)),strength=min(4.0,D*G/(4.0*nv+1e-5)*attenuation*visibility*.35);
    vec3 f0=mix(vec3(.04),base,metal),F=f0+(1.0-f0)*pow(1.0-vh,5.0);extra+=strength*F;
  }
  float environmentAmount=(metal+((m==18||m==26||m==47)?.18:0.0))*.12*(1.0-rough);
  if(environmentAmount>0.0)extra+=toLinear(sky(reflect(-view,n)))*base*environmentAmount;
  vec3 raw=displayRadiance(rgb)+extra;return toSRGB(raw/(1.0+raw));
}
vec3 displayRGB(vec3 c){
  c=max(c,0.0);if(u_toneMode==0)return toSRGB(c/(1.0+c));
  float peak=max(c.r,max(c.g,c.b));if(peak<1e-20)return vec3(0.0);
  float mapped=clamp((peak*(2.51*peak+.03))/(peak*(2.43*peak+.59)+.14),0.0,1.0);
  return toSRGB(c*(mapped/peak));
}
// Pack three independent 10-bit logarithmic radiance channels into RGBA8.
// This avoids requiring float framebuffer/blend extensions on WebGL 1, and
// avoids shared-exponent cross-channel clipping of saturated colours.
vec4 encodeRGBE(vec3 v){
  vec3 q=floor(clamp((log2(max(v,vec3(.00006103515625)))+14.0)/22.0*1022.0+1.0,1.0,1023.0)+.5);
  q*=step(vec3(1e-20),v);
  return vec4(floor(q.r/4.0),mod(q.r,4.0)*64.0+floor(q.g/16.0),mod(q.g,16.0)*16.0+floor(q.b/64.0),mod(q.b,64.0)*4.0)/255.0;
}
vec3 spectralColor(vec3 rgb,float D,float lightGain){
  // Shadow attenuation multiplies source radiance before the spectral shift
  // and fixed display tone curve. At D=1 the calibrated matrix is identity.
  if(abs(D-1.0)<.000001&&abs(u_exposure)<.000001&&lightGain==1.0)return clamp(rgb,0.0,1.0);
  vec3 x=min(toLinear(rgb),vec3(.995));x=x/(1.0-x)*lightGain;
  if(abs(D-1.0)<.000001){x*=exp2(u_exposure);return toSRGB(x/(1.0+x));}
  float column=clamp(log(D/.1)/log(100.0)*256.0,0.0,256.0),i=floor(column),f=column-i;
  float scale=exp(mix(spectrumScaleLog(i),spectrumScaleLog(min(i+1.0,256.0)),f));
  float w=min(min(x.r,x.g),x.b);x-=vec3(w);
  float c=min(x.g,x.b);x.gb-=vec2(c);float m=min(x.r,x.b);x.rb-=vec2(m);float y=min(x.r,x.g);x.rg-=vec2(y);
  vec3 result=spectrumRow(column,0.0,scale)*w+spectrumRow(column,1.0,scale)*c+spectrumRow(column,2.0,scale)*m+spectrumRow(column,3.0,scale)*y
    +spectrumRow(column,4.0,scale)*x.r+spectrumRow(column,5.0,scale)*x.g+spectrumRow(column,6.0,scale)*x.b;
  result=max(result*pow(D,5.0)*exp2(u_exposure),0.0);
  return toSRGB(result/(1.0+result));
}
// Two spare sign-atlas rows contain independent signed logarithmic RGB
// coefficients. Decode both endpoints before interpolation to avoid errors
// when a narrow-line component crosses zero outside the display gamut.
vec3 emitterColumn(float col){
  vec3 hi=floor(texture2D(u_sign,vec2((col+.5)/1024.0,(256.0-202.5)/256.0)).rgb*255.0+.5);
  vec3 lo=floor(texture2D(u_sign,vec2((col+.5)/1024.0,(256.0-203.5)/256.0)).rgb*255.0+.5);
  vec3 signum=vec3(1.0)-2.0*step(vec3(128.0),hi),code=mod(hi,128.0)*256.0+lo;
  return signum*exp(vec3(-35.0)+code/32767.0*50.0);
}
vec3 emitterLinear(float D){
  float col=clamp(log(D/.1)/log(100.0)*256.0,0.0,256.0),i=floor(col),f=col-i;
  return mix(emitterColumn(i),emitterColumn(min(i+1.0,256.0)),f);
}
vec3 referenceEmitter(vec3 base,float D,float lightGain){
  vec3 linear=emitterLinear(D);
  float strength=dot(toLinear(base),vec3(.2126,.7152,.0722))*1.6*lightGain*exp2(u_exposure);
  linear=max(linear*strength,vec3(0.0));return toSRGB(linear/(1.0+linear));
}
// 65 x 65 two-factor material LUT in nine otherwise unused atlas rows.
// Each RGB coefficient has an independent signed 15-bit log magnitude.
vec3 materialEntry(float row,float col){
  float p=2.0*(row*65.0+col),y=floor(p/1024.0),x=mod(p,1024.0);
  vec3 hi=floor(texture2D(u_sign,vec2((x+.5)/1024.0,(256.0-(204.5+y))/256.0)).rgb*255.0+.5);
  vec3 lo=floor(texture2D(u_sign,vec2((x+1.5)/1024.0,(256.0-(204.5+y))/256.0)).rgb*255.0+.5);
  vec3 signum=vec3(1.0)-2.0*step(vec3(128.0),hi),code=mod(hi,128.0)*256.0+lo;
  return signum*exp(vec3(-35.0)+code/32767.0*50.0);
}
float measuredR(float i){
  float row=floor(i/1024.0),col=mod(i,1024.0);
  vec2 q=floor(texture2D(u_sign,vec2((col+.5)/1024.0,(256.0-(213.5+row))/256.0)).rg*255.0+.5);
  return (q.x*256.0+q.y)/65535.0;
}
float materialR(float wavelength){
  if(u_material>=4){float p=clamp(wavelength-350.0,0.0,2150.0),i=floor(p);return mix(measuredR(i),measuredR(min(i+1.0,2150.0)),p-i);}
  float w=clamp(wavelength,380.0,780.0);
  if(u_material==1)return .08+.24*exp(-pow((w-450.0)/65.0,2.0))+.10*exp(-pow((w-670.0)/110.0,2.0));
  if(u_material==2)return .11+.48/(1.0+exp(-(w-580.0)/60.0));
  return .52+.08*(w-380.0)/400.0;
}
vec3 materialColor(vec3 base,float total,float outgoing,float lightGain){
  total=clamp(total,.1,10.0);outgoing=clamp(outgoing,.1,10.0);vec3 linear;
  if(u_sourceMode==2)linear=emitterLinear(total)*materialR(u_lineWavelength*outgoing/total);
  else{
    float x=clamp(log(total/.1)/log(100.0)*64.0,0.0,64.0),y=clamp(log(outgoing/.1)/log(100.0)*64.0,0.0,64.0);
    float a=floor(x),b=floor(y),fx=x-a,fy=y-b;
    linear=mix(mix(materialEntry(b,a),materialEntry(b,min(a+1.0,64.0)),fx),mix(materialEntry(min(b+1.0,64.0),a),materialEntry(min(b+1.0,64.0),min(a+1.0,64.0)),fx),fy);
  }
  float strength=dot(toLinear(base),vec3(.2126,.7152,.0722))*1.6*lightGain*exp2(u_exposure);
  linear=max(linear*strength,vec3(0.0));return toSRGB(linear/(1.0+linear));
}
// Dial geometry is evaluated in the material's rest coordinates at this
// particular pixel's emission event (or simultaneous slice), not screen time.
int clockInk(vec3 p,vec3 n,vec3 h,float tau){
  if(n.z>=-.5)return 0;float r0=.23*min(h.x,h.y);vec2 q=(p.xy-vec2(0.0,.43*h.y))/r0;float r=length(q);
  if(r>1.0)return 0;if(r>.90)return 1;
  if(r>.77&&abs(sin(6.0*atan(q.x,q.y)))<.22)return 3;
  float a=2.0*PI*tau/12.0,b=2.0*PI*tau/120.0;vec2 s=vec2(sin(a),cos(a)),h0=vec2(sin(b),cos(b));
  float ds=dot(q,s),dh=dot(q,h0),cs=abs(q.x*s.y-q.y*s.x),ch=abs(q.x*h0.y-q.y*h0.x);
  if(r<.07||(ds>=-.06&&ds<=.75&&cs<.035)||(dh>=-.06&&dh<=.50&&ch<.055))return 3;
  return 2;
}
void main(){
  vec2 p=((gl_FragCoord.xy+u_jitter)/u_resolution)*2.0-1.0;float aspect=u_resolution.x/u_resolution.y;
  float cp=cos(u_pitch),sp=sin(u_pitch),sy=sin(u_yaw),cy=cos(u_yaw);
  vec3 forward=vec3(sy*cp,sp,cy*cp),right=vec3(cy,0.0,-sy),up=vec3(-sy*sp,cp,-cy*sp);
  vec3 observerRay=normalize(forward+right*p.x*aspect*u_tanFov+up*p.y*u_tanFov);
  bool photo=(u_view==0)||(u_view==2&&(u_scenario==0?(gl_FragCoord.x+u_jitter.x)/u_resolution.x<u_split:(gl_FragCoord.x+u_jitter.x)/u_resolution.x>=u_split));
  int spectral=u_spectrumSplit==1?((gl_FragCoord.x+u_jitter.x)/u_resolution.x>=u_split?1:0):u_spectral;
  vec3 rd=observerRay;float g=inversesqrt(1.0-u_beta*u_beta);
  float beta2=dot(u_velocity,u_velocity),boostQ=(g-1.0)/max(beta2,1e-20);
  float beta2B=dot(u_velocityB,u_velocityB),gB=inversesqrt(max(1.0-beta2B,0.000001)),boostQB=(gB-1.0)/max(beta2B,1e-20);
  if(u_scenario==1&&photo)rd=normalize(observerRay+(boostQ*dot(observerRay,u_velocity)-g)*u_velocity);
  vec3 labRay=rd,ro=u_camera,norm=vec3(0.0),normal=vec3(0.0),hitPoint=vec3(0.0),restPoint=vec3(0.0),restNormal=vec3(0.0),boxCenter=vec3(0.0),boxHalf=vec3(1.0);
  vec3 savedNormal=vec3(0.0),savedRestPoint=vec3(0.0),savedRestNormal=vec3(0.0),savedBoxCenter=vec3(0.0),savedBoxHalf=vec3(1.0);
  bool shadowInstant=u_shadowTiming==1||(u_shadowTiming==2&&(gl_FragCoord.x+u_jitter.x)/u_resolution.x>=u_split);
  vec3 lightDirection=u_lightDirection,centerLightDirection=lightDirection;
  float primaryDistance=1e20,lightDistance=1e20,surfaceTime=u_time,cosine=0.0,sampleCosine=0.0,directSum=0.0,visibleSum=0.0;
  int primaryMaterial=0,primaryBody=0;bool shadowed=false;
  float nearest=1e20;int material=0;
  // The same world traversal serves the primary and past-directed light ray.
  // The latter samples the moving object's world tube at the earlier event.
  for(int pass=0;pass<17;pass++){
    if(pass==0){ro=u_camera;rd=labRay;nearest=1e20;}
    else{
      if(u_shadows==0||primaryMaterial==0||primaryMaterial==13||primaryMaterial==39||(u_soft==0&&pass>1)||(u_soft==1&&pass>u_shadowSamples)||(u_emissionMap==1&&u_debug==0&&(u_scenario==1||photo)))break;
      if(u_soft==1){
        float index=float(pass-1);
        if(u_environment==0||u_environment==2||u_environment==4){
          float columns=u_shadowSamples==4?2.0:4.0,rows=float(u_shadowSamples)/columns;
          vec2 cell=vec2(mod(index,columns),floor(index/columns));
          vec2 offset=(2.0*(cell+vec2(.5))/vec2(columns,rows)-vec2(1.0))*u_lightHalf;
          vec3 delta=u_lightPosition+vec3(offset.x,0.0,offset.y)-hitPoint;
          lightDistance=length(delta);lightDirection=lightDistance>.003?delta/lightDistance:vec3(0.0,1.0,0.0);
        }else{
          float columns=u_shadowSamples==16?8.0:4.0,rows=float(u_shadowSamples)/columns;
          float s=sin(u_sunRadius*PI/360.0)*sqrt((floor(index/columns)+.5)/rows),cosineAngle=1.0-2.0*s*s,sineAngle=2.0*s*sqrt(max(0.0,1.0-s*s));
          vec2 sector;
          if(u_shadowSamples==4){float sx=(pass==1||pass==3)?-1.0:1.0,sy=pass<=2?-1.0:1.0;sector=vec2(sx,sy)*.7071067811865476;}
          else{float phi=2.0*PI*(mod(index,columns)+.5)/columns;sector=vec2(cos(phi),sin(phi));}
          vec3 a=normalize(cross(vec3(0.0,1.0,0.0),centerLightDirection)),b=normalize(cross(centerLightDirection,a));
          lightDirection=centerLightDirection*cosineAngle+sineAngle*(sector.x*a+sector.y*b);lightDistance=1e20;
        }
      }
      sampleCosine=max(dot(savedNormal,lightDirection),0.0)*((u_environment==0||u_environment==2||u_environment==4)?pointAttenuation(lightDistance):1.0);directSum+=sampleCosine;
      if(sampleCosine<=0.0||lightDistance<=.003)continue;
      ro=hitPoint+.003*lightDirection;rd=lightDirection;nearest=lightDistance-.003;
    }
    material=0;normal=vec3(0.0);norm=vec3(0.0);int movingBody=0;
    if(rd.y<-.000001){float t=-ro.y/rd.y;if(t>.00001&&t<nearest){nearest=t;normal=vec3(0.0,1.0,0.0);material=1;}}
    vec3 center=u_center;
    if(pass>0&&u_scenario==0)center-=u_velocity*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));
    vec3 rr=ro-center,dr=rd;
    if(u_scenario==0){rr+=boostQ*dot(rr,u_velocity)*u_velocity;dr+=(boostQ*dot(rd,u_velocity)+((pass>0?!shadowInstant:photo)?g:0.0))*u_velocity;}
    float body=u_shape==1?sphereHit(rr,dr,HALF,norm):(u_shape==2?bevelBoxHit(rr,dr,u_halfSize,u_bevel,norm):boxHit(rr,dr,u_halfSize,norm));
    if(body<nearest){nearest=body;restPoint=rr+body*dr;restNormal=norm;normal=norm;if(u_scenario==0)normal+=boostQ*dot(norm,u_velocity)*u_velocity;normal=normalize(normal);material=4;movingBody=1;}
    if(u_shape!=1){
      vec3 partBoundNormal;vec3 partHalf=u_partHalf+vec3(.003),partOffset=rr-u_partCenter;
      float partBound=boxHit(partOffset,dr,partHalf,partBoundNormal);
      bool insidePartBound=all(lessThanEqual(abs(partOffset),partHalf));
      if(partBound<1e19&&(partBound<nearest||insidePartBound))for(int part=0;part<12;part++){
        if(float(part)>=u_partCount)break;
        float partPos=u_partBase+float(part)*4.0;vec3 partCenter,partHalf,partNormal;bounds(partPos,partCenter,partHalf);
        vec4 partMeta=geom(partPos+3.0);
        float partHit=partMeta.r>1.5?cylinderHit(rr-partCenter,dr,partHalf,partMeta.b,partNormal):boxHit(rr-partCenter,dr,partHalf,partNormal);
        if(partHit<nearest){nearest=partHit;restPoint=rr+partHit*dr;restNormal=partNormal;normal=partNormal;if(u_scenario==0)normal+=boostQ*dot(partNormal,u_velocity)*u_velocity;normal=normalize(normal);material=int(partMeta.g);movingBody=1;}
      }
    }
    if(u_secondEnabled==1&&u_scenario==0){
      vec3 centerB=u_centerB;
      if(pass>0)centerB-=u_velocityB*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));
      vec3 rb=ro-centerB,db=rd;
      rb+=boostQB*dot(rb,u_velocityB)*u_velocityB;
      db+=(boostQB*dot(rd,u_velocityB)+((pass>0?!shadowInstant:photo)?gB:0.0))*u_velocityB;
      vec3 normalB;float bodyB=u_shape==1?sphereHit(rb,db,HALF,normalB):(u_shape==2?bevelBoxHit(rb,db,u_halfSize,u_bevel,normalB):boxHit(rb,db,u_halfSize,normalB));
      if(bodyB<nearest){nearest=bodyB;restPoint=rb+bodyB*db;restNormal=normalB;normal=normalize(normalB+boostQB*dot(normalB,u_velocityB)*u_velocityB);material=4;movingBody=2;}
      if(u_shape!=1){
        vec3 boundNormal,partHalf=u_partHalf+vec3(.003),partOffset=rb-u_partCenter;
        float bound=boxHit(partOffset,db,partHalf,boundNormal);bool inside=all(lessThanEqual(abs(partOffset),partHalf));
        if(bound<1e19&&(bound<nearest||inside))for(int part=0;part<12;part++){
          if(float(part)>=u_partCount)break;float pos=u_partBase+float(part)*4.0;vec3 pc,ph,pn;bounds(pos,pc,ph);vec4 meta=geom(pos+3.0);
          float t=meta.r>1.5?cylinderHit(rb-pc,db,ph,meta.b,pn):boxHit(rb-pc,db,ph,pn);
          if(t<nearest){nearest=t;restPoint=rb+t*db;restNormal=pn;normal=normalize(pn+boostQB*dot(pn,u_velocityB)*u_velocityB);material=int(meta.g);movingBody=2;}
        }
      }
    }
    float movingDistance=nearest;
    if(u_environment==0||u_environment==2||u_environment==4){
      vec3 fixtureCenter=u_lightPosition+vec3(0.0,u_environment==0?.05:.06,0.0),fixtureHalf=vec3(u_lightHalf.x,.035,u_lightHalf.y),fixtureNormal;
      float fixture=boxHit(ro-fixtureCenter,rd,fixtureHalf,fixtureNormal);
      if(fixture<nearest){nearest=fixture;normal=fixtureNormal;material=39;boxCenter=fixtureCenter;boxHalf=fixtureHalf;}
    }
    worldHit(ro,rd,nearest,normal,material,boxCenter,boxHalf);
    if(nearest<movingDistance)movingBody=0;
    if(pass==0){
      primaryDistance=nearest;primaryMaterial=material;primaryBody=movingBody;savedNormal=normal;savedRestPoint=restPoint;savedRestNormal=restNormal;savedBoxCenter=boxCenter;savedBoxHalf=boxHalf;
      if(u_debug==1){gl_FragColor=vec4(float(material)/255.0,0.0,0.0,1.0);return;}
      if(material!=0){
        hitPoint=ro+nearest*rd;surfaceTime=u_time-((u_scenario==0&&!photo)?0.0:nearest);
        if(u_environment==0||u_environment==2||u_environment==4){
          vec3 source=u_lightPosition;
          vec3 delta=source-hitPoint;lightDistance=length(delta);lightDirection=lightDistance>.003?delta/lightDistance:vec3(0.0,1.0,0.0);
        }
        centerLightDirection=lightDirection;cosine=dot(savedNormal,lightDirection);
      }
    }else if(material!=0)shadowed=true;else visibleSum+=sampleCosine;
  }
  lightDirection=centerLightDirection;
  ro=u_camera;rd=labRay;nearest=primaryDistance;material=primaryMaterial;normal=savedNormal;restPoint=savedRestPoint;restNormal=savedRestNormal;boxCenter=savedBoxCenter;boxHalf=savedBoxHalf;
  float skyD=(u_scenario==1&&photo)?g*(1.0+dot(u_velocity,rd)):1.0;
  float surfaceD=skyD,outgoingD=skyD;
  if(u_scenario==0&&photo&&primaryBody>0){
    vec3 bodyVelocity=primaryBody==2?u_velocityB:u_velocity;float bodyGamma=primaryBody==2?gB:g;
    surfaceD=1.0/(bodyGamma*(1.0+dot(bodyVelocity,rd)));outgoingD=surfaceD; // body rest frame -> observer
    if(u_surfaceMode==1)surfaceD*=bodyGamma*(1.0+dot(bodyVelocity,centerLightDirection)); // lab lamp -> body
  }
  if(u_debug==2){
    float encoded=floor(clamp(log(surfaceD/.1)/log(100.0),0.0,1.0)*65535.0+.5);
    gl_FragColor=vec4(shadowed?1.0:0.0,floor(encoded/256.0)/255.0,mod(encoded,256.0)/255.0,1.0);return;
  }
  surfaceD=clamp(surfaceD,.1,10.0); // finite spectral lookup domain
  if(u_debug==3){gl_FragColor=vec4(spectralColor(vec3(.2,.4,.7),surfaceD,u_debugLightGain),1.0);return;}
  if(u_debug==4){float coverage=directSum>0.0?1.0-visibleSum/directSum:0.0;gl_FragColor=vec4(clamp(coverage,0.0,1.0),0.0,0.0,1.0);return;}
  if(u_debug==5){gl_FragColor=vec4(referenceEmitter(vec3(.2,.4,.7),surfaceD,u_debugLightGain),1.0);return;}
  if(u_debug==6){gl_FragColor=vec4(materialColor(vec3(.2,.4,.7),surfaceD,outgoingD,u_debugLightGain),1.0);return;}
  // A fixed false-color key encodes t_emit - t_observe = -distance (c=1).
  // Finite surfaces only: neither the infinite sky nor a flyby simultaneous
  // slice has a physically meaningful emission event.
  if(u_emissionMap==1&&material!=0&&(u_scenario==1||photo)){
    float q=clamp(nearest/20.0,0.0,1.0);
    vec3 heat=q<.5?mix(vec3(1.0,.34,.12),vec3(1.0,.82,.35),2.0*q):mix(vec3(1.0,.82,.35),vec3(.05,.44,.85),2.0*q-1.0);
    gl_FragColor=u_linearOutput==1?encodeRGBE(displayRadiance(heat)):vec4(heat,1.0);return;
  }
  vec3 background=sky(rd);if(spectral==1)background=spectralColor(background,skyD,1.0);
  if(u_debug==7&&material==0){gl_FragColor=vec4(clamp(background,0.0,1.0),1.0);return;}
  vec3 color=displayRadiance(background);
  if(material!=0){
    vec3 sun=lightDirection;
    float falloff=(u_environment==0||u_environment==2||u_environment==4)?pointAttenuation(length(u_lightPosition-hitPoint)):1.0;
    float diffuse=max(dot(normal,sun),0.0)*falloff,light=ambientHemisphere(normal)+(u_environment==2||u_environment==0?.30:.37)*diffuse;
    if(material==1){
      vec3 floorColor;
      if(u_environment==1||u_environment==3||u_environment==4){
        floorColor=texture2D(u_asphalt,fract(hitPoint.xz/3.0)).rgb*.88;
        if(u_environment==3&&abs(hitPoint.x)>5.37){vec2 groundUV=vec2(.002+.496*fract(hitPoint.x/5.0),.002+.496*fract(hitPoint.z/5.0));floorColor=texture2D(u_mountains,groundUV).rgb*1.05;float farField=smoothstep(22.0,75.0,nearest);floorColor=mix(floorColor,vec3(.30,.32,.25),farField*.75);}
        float edge=1.0-smoothstep(.04,.085,abs(abs(hitPoint.x)-4.38));
        float dash=(1.0-smoothstep(.035,.07,abs(hitPoint.x)))*(1.0-step(3.1,mod(hitPoint.z+1000.0,7.0)));
        vec3 paint=u_environment==3?vec3(.75,.70,.51):vec3(.78,.78,.72);
        float paintWear=.70+.30*texture2D(u_asphalt,fract(hitPoint.xz/8.0+.23)).r;floorColor=mix(floorColor,paint,max(edge,dash)*.88*paintWear);
        if(u_environment==1){
          float zone=1.0-smoothstep(.65,.72,abs(hitPoint.z-10.6));float zebra=(1.0-step(.58,mod(hitPoint.x+1000.0,1.2)))*(1.0-smoothstep(4.2,4.35,abs(hitPoint.x)));floorColor=mix(floorColor,vec3(.76,.76,.71),zone*zebra*.72);
          vec2 man=hitPoint.xz-vec2(-1.65,5.8);float r=length(man),cover=1.0-smoothstep(.41,.44,r);
          float rim=stripe(r,.12,.012);floorColor=mix(floorColor,vec3(.24,.25,.24)*(1.0-.18*rim),cover*.85);
        }
      }else{
        floorColor=texture2D(u_stone,fract(hitPoint.xz/3.0)).rgb*(u_environment==2?.90:1.05);
        float joints=max(stripe(hitPoint.x,1.7,.012),stripe(hitPoint.z,2.4,.012));
        floorColor=mix(floorColor,floorColor*.55,joints*.70);
        if(u_environment==0){
          float tactile=1.0-smoothstep(.09,.14,abs(abs(hitPoint.x)-3.20));
          vec2 cells=mod(hitPoint.xz+vec2(100.0),vec2(.12,.16))-vec2(.06,.08);float stud=1.0-smoothstep(.018,.032,length(cells));
          floorColor=mix(floorColor,vec3(.64,.53,.32)*(1.0+.20*stud),tactile*.70);
        }
      }
      color=floorColor*(.84+.16*light);
    }else if(material==2||material==3||material==10){
      float grain=texture2D(u_stone,fract(hitPoint.xz/2.0+hitPoint.y*.12)).r;
      vec3 metal=material==2?vec3(.43,.44,.42):(material==10?vec3(.31,.33,.32):vec3(.39,.40,.38));
      color=metal*(.77+.40*light)*(.80+.35*grain);
    }else if(material==5){
      vec2 uv=abs(normal.x)>.5?hitPoint.zy/4.0:hitPoint.xy/4.0;
      color=texture2D(u_wall,fract(uv)).rgb*(u_environment==2?.96:1.02)*light;
      float lower=1.0-smoothstep(.04,.45,hitPoint.y);color*=1.0-.23*lower;
    }else if(material==6||material==20){
      if(material==6){
        vec2 woodUV=clamp(faceUV(hitPoint,boxCenter,boxHalf,normal),.002,.998);if(abs(normal.y)>.5)woodUV=woodUV.yx;
        color=texture2D(u_crate,vec2(woodUV.x,.5*woodUV.y)).rgb*(.78+.30*light);
        float slats=abs(normal.y)>.5?stripe(hitPoint.x-boxCenter.x,.19,.008):stripe(hitPoint.y-boxCenter.y,.18,.008);color*=1.0-.20*slats;
      }else{float grain=texture2D(u_stone,fract(hitPoint.xz/2.2+hitPoint.y*.08)).r;color=vec3(.44,.46,.44)*(.78+.36*light)*(.86+.28*grain);}
    }else if(material==7||material==29){
      vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);
      color=(material==29||abs(normal.z)>.5)?texture2D(u_sign,vec2(clamp(uv.x,0.0,1.0)*.75,(54.0+202.0*clamp(uv.y,0.0,1.0))/256.0)).rgb:vec3(.22,.25,.24);color*=.85+.15*light;
    }else if(material==8||material==17||material==18||material==19){
      vec2 uv=clamp(faceUV(hitPoint,boxCenter,boxHalf,normal),.002,.998);
      vec2 tile=material==8?vec2(0.0,1.0):(material==17?vec2(1.0,1.0):(material==18?vec2(0.0,0.0):vec2(1.0,0.0)));
      bool plain=abs(normal.y)>.5||(material==19&&abs(normal.z)>.5);
      color=plain?(material==19?vec3(.38,.40,.40):vec3(.31,.32,.31)):texture2D(u_facade,vec2((uv.x+tile.x)*.5,.5+(uv.y+tile.y)*.25)).rgb;
      color*=.88+.20*light;
      if(material==18&&!plain&&color.b>color.r*1.02&&color.r<.55)color=mix(color,sky(reflect(rd,normal)),.10);
    }else if(material==46||material==47){
      // Separate finite door and opaque window surfaces share the carriage
      // photo's world-space UVs. Their silhouettes and edges are geometry.
      float carriageZ=6.0+11.0*floor((hitPoint.z-6.0)/11.0+.5);
      vec2 uv=clamp(vec2((hitPoint.z-carriageZ)/10.7+.5,(hitPoint.y-1.66)/3.12+.5),.002,.998);
      color=texture2D(u_facade,vec2(.5+.5*uv.x,.5+.25*uv.y)).rgb*(.88+.20*light);
      if(material==47&&abs(normal.x)>.5)color=mix(color,sky(reflect(rd,normal)),.08);
    }else if(material==16){
      vec2 uv=vec2(.002+.496*fract(hitPoint.x/5.0),.002+.496*fract(hitPoint.z/5.0));
      color=texture2D(u_mountains,uv).rgb*(.80+.28*light);
      color=mix(color,vec3(.30,.33,.25),.10+.22*smoothstep(8.0,48.0,nearest));
    }else if(material==9||material==14){
      color=texture2D(u_stone,fract((abs(normal.y)>.5?hitPoint.xz:hitPoint.zy)/2.6)).rgb*(.88+.18*light);
      if(material==9&&abs(normal.y)>.5){float joints=max(stripe(hitPoint.z,.8,.012),stripe(hitPoint.x,.75,.012));color*=1.0-.25*joints;}
    }else if(material==11){
      vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);color=vec3(.29,.32,.32)*(.8+.3*light);
      float seamV=1.0-smoothstep(.008,.025,abs(uv.x-.5));float border=1.0-smoothstep(.018,.035,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));
      color=mix(color,vec3(.14,.16,.16),max(seamV,border)*.7);
      float handle=step(.70,uv.x)*step(uv.x,.82)*step(.45,uv.y)*step(uv.y,.48);color=mix(color,vec3(.68,.68,.60),handle*.70);
    }else if(material==12){
      color=texture2D(u_wall,fract(hitPoint.xz/4.0)).rgb*(u_environment==2?.77:.70);
    }else if(material==13||material==39){vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);float frame=1.0-smoothstep(.035,.075,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));color=mix(material==39?vec3(.97,.79,.48):vec3(.93,.91,.83),material==39?vec3(.55,.33,.15):vec3(.50,.51,.48),frame*.7);
    }else if(material==15){
      vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);float arrow=1.0-smoothstep(.06,.11,abs(abs(uv.y-.5)-(uv.x-.24)*.65));
      color=mix(vec3(.76,.76,.70),vec3(.48,.29,.23),arrow*step(.24,uv.x)*step(uv.x,.78)*.85);
    }else if(material==21||material==22){
      vec2 uv=clamp(faceUV(hitPoint,boxCenter,boxHalf,normal),.001,.999);float species=material==21?0.0:1.0;
      color=texture2D(u_mountains,vec2(.5+species*.25+.25*uv.x,.5*uv.y)).rgb*(.82+.24*light);
    }else if(material==23){
      float grain=texture2D(u_stone,fract(hitPoint.xz*.4+hitPoint.y*.13)).r;
      color=vec3(.34,.36,.35)*(.75+.35*light)*(.84+.24*grain);
      color*=1.0-.20*stripe(hitPoint.z,4.2,.025);
    }else if(material==24||material==28){
      vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);float border=1.0-smoothstep(.025,.045,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));
      float grain=texture2D(u_wall,fract(hitPoint.zy*.45+hitPoint.x*.12)).r;
      color=(material==24?vec3(.43,.45,.42):vec3(.31,.34,.33))*(.8+.25*light)*(.90+.18*grain);color=mix(color,color*.48,border*.7);
      if(material==24){float vent=step(.18,uv.x)*step(uv.x,.82)*step(.15,uv.y)*step(uv.y,.36)*stripe(uv.y,.048,.008);color=mix(color,vec3(.21,.23,.21),vent*.8);
        float label=step(.18,uv.x)*step(uv.x,.50)*step(.65,uv.y)*step(uv.y,.78);color=mix(color,vec3(.70,.69,.59),label*.72);}
      else{float slot=step(.18,uv.x)*step(uv.x,.82)*step(.72,uv.y)*step(uv.y,.82);color=mix(color,vec3(.09,.10,.10),slot*.85);}
    }else if(material==25||material==26){
      vec3 paint=vec3(.29,.33,.33),refl=sky(reflect(rd,normal));vec2 uv=clamp(faceUV(hitPoint,boxCenter,boxHalf,normal),.002,.998);
      if(material==26){
        color=mix(vec3(.12,.17,.18),refl,.42)*(.78+.26*light);
        if(abs(normal.x)>.5){float pillar=1.0-smoothstep(.015,.04,abs(hitPoint.z-boxCenter.z));color*=1.0-.3*pillar;}
      }else if(boxHalf.z>1.0&&abs(normal.z)>.5){
        color=normal.z<0.0?texture2D(u_facade,vec2(.5*uv.x,.5*uv.y)).rgb:paint*(.72+.35*light);
        if(normal.z>0.0){float grille=step(.22,uv.x)*step(uv.x,.78)*step(.22,uv.y)*step(uv.y,.50);color=mix(color,vec3(.12,.13,.13),grille*.7);}
      }else if(boxHalf.z>1.0&&abs(normal.x)>.5)color=texture2D(u_facade,vec2(.5+.5*uv.x,.5*uv.y)).rgb*(.78+.25*light);
      else color=mix(paint*(.72+.35*light),refl,.10);
      float rim=1.0-smoothstep(.01,.035,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));color*=1.0-.14*rim;
    }else if(material==27){
      vec3 q=(hitPoint-boxCenter)/boxHalf;float ring=length(q.yz);color=vec3(.105,.11,.105)*(.8+.25*light);
      if(abs(normal.x)>.5)color=mix(color,vec3(.40,.41,.39),1.0-smoothstep(.42,.55,ring));
    }else if(material==40){
      vec2 uv=faceUV(hitPoint,boxCenter,boxHalf,normal);vec3 paint=boxCenter.x<0.0?vec3(.22,.34,.34):vec3(.48,.27,.20);
      if(boxCenter.y>3.0)paint=boxCenter.x<0.0?vec3(.37,.38,.34):vec3(.29,.34,.36);
      vec3 weathered=texture2D(u_facade,clamp(uv,.002,.998)).rgb;float luminance=dot(weathered,vec3(.2126,.7152,.0722));
      float edge=1.0-smoothstep(.008,.035,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)));
      color=mix(weathered,paint*(luminance*2.2),.48)*(.70+.35*light);color=mix(color,color*.58,edge*.65);
    }else if(material==41||material==42||material==43||material==44||material==45){
      vec3 base=material==41?vec3(.46,.38,.24):material==43?vec3(.55,.37,.14):material==44?vec3(.29,.38,.37):vec3(.27,.30,.29);
      float grain=texture2D(u_stone,fract(hitPoint.xz*.33+hitPoint.y*.10)).r;
      color=base*(.72+.38*light)*(.80+.25*grain);
    }else if(material==30){
      float bark=texture2D(u_wall,fract(vec2(hitPoint.z*.8+hitPoint.x*.6,hitPoint.y*.35))).r;color=vec3(.25,.21,.17)*(.67+.52*bark)*(.82+.18*light);
    }else if(material>=31&&material<=38){
      // Scene-specific, finite rest-frame pieces use distinct approximate
      // roughness/metal response; these are not measured PBR materials.
      vec3 base=vec3(.30,.20,.15);
      if(material>=32&&material<=34){
        // Rest-frame UVs use each object's actual half-size, so the surface
        // grain and physically raised pieces stay aligned.
        vec3 surface=texture2D(u_crate,objectUV(restPoint.xy/u_halfSize.xy*.5+.5)).rgb;
        base=material==34?mix(surface,vec3(.57,.40,.24),.35):surface;
      }else if(material==35)base=vec3(.085,.09,.085);
      else if(material==36||material==38)base=vec3(.24,.25,.24);
      else if(material==37)base=vec3(.38,.25,.12);
      color=base*(.75+.35*light);
    }else{
      vec3 q=restPoint/u_halfSize;
      if(u_shape!=1){
        vec2 uv=abs(restNormal.z)>.5?vec2(q.x,q.y)*.5+.5:(abs(restNormal.x)>.5?vec2(-q.z,q.y)*.5+.5:vec2(q.x,-q.z)*.5+.5);
        vec3 metal=texture2D(u_crate,objectUV(uv)).rgb;
        if(u_environment==4)metal=texture2D(u_facade,clamp(uv,.002,.998)).rgb;
        float edge=min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)),rim=1.0-smoothstep(.007,.028,edge);
        color=metal*(.76+.30*light);color=mix(color,color*.72,rim*.65);
      }else{
        vec3 r=normalize(restPoint);float lon=atan(r.x,r.z),lat=asin(clamp(r.y,-1.0,1.0));
        // Sample a material-only patch of each scene's atlas (no box handles
        // or plank gaps stretched across a sphere). Put the UV seam at back.
        vec2 uv=vec2(fract(1.0+lon/(2.0*PI)),.5+lat/PI),patch;
        if(u_environment==0)patch=vec2(.10+.80*uv.x,.25+.60*uv.y);
        else if(u_environment==1)patch=vec2(.10+.30*uv.x,.05+.30*uv.y);
        else if(u_environment==2)patch=vec2(.12+.20*uv.x,.25+.45*uv.y);
        else patch=vec2(.44+.12*uv.x,.10+.80*uv.y);
        vec3 surface=texture2D(u_crate,objectUV(patch)).rgb;
        float seam=(u_environment==0?1.0-smoothstep(.008,.026,abs(sin(lon*4.0))):0.0);
        color=surface*(.70+.38*light)*(1.0-.12*seam);
      }
    }
    if(primaryBody==2&&material==4)color*=vec3(.76,.88,1.08);
    if(material==4){
      float hitTime=u_time-((u_scenario==0&&!photo)?0.0:nearest);
      vec3 clockVelocity=primaryBody==2?u_velocityB:u_velocity;float clockGamma=primaryBody==2?gB:g;
      float tau=u_scenario==0?hitTime/clockGamma-dot(clockVelocity,restPoint):hitTime;
      int ink=clockInk(restPoint,restNormal,u_halfSize,tau);
      if(ink==1)color=vec3(.25,.27,.26)*(.75+.25*light);
      else if(ink==2)color=vec3(.80,.80,.74)*(.74+.26*light);
      else if(ink==3)color=vec3(.11,.14,.14)*(.75+.25*light);
    }
    float lightGain=1.0,visibility=1.0;
    if(u_shadows==1&&u_soft==1&&directSum>0.0){float ambient=(u_environment==0||u_environment==2)?.48:.38;float samples=float(u_shadowSamples);lightGain=(ambient+.62*visibleSum/samples)/(ambient+.62*directSum/samples);visibility=visibleSum/directSum;}
    else if(shadowed){float ambient=(u_environment==0||u_environment==2)?.48:.38,direct=.62*max(cosine,0.0)*falloff;lightGain=ambient/(ambient+direct);visibility=0.0;}
    color=surfaceResponse(color,normal,sun,-rd,falloff,visibility,material);
    // Probe readback: the same local RGB input before spectral conversion.
    if(u_debug==7){gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);return;}
    // The master spectrum switch bypasses the assumed emitter and material
    // spectra as well as Doppler shifting; their settings remain available.
    if(spectral==1&&u_material>0&&u_surfaceMode==1&&primaryBody>0)color=materialColor(color,surfaceD,outgoingD,lightGain);
    else if(spectral==1&&u_sourceMode!=0&&primaryBody>0)color=referenceEmitter(color,surfaceD,lightGain);
    else if(spectral==1)color=spectralColor(color,surfaceD,lightGain);
    else if(lightGain<1.0){vec3 raw=min(toLinear(color),vec3(.995));raw=raw/(1.0-raw)*lightGain;color=toSRGB(raw/(1.0+raw));}
    float fog=sceneFog(nearest);
    vec3 fogColor=u_environment==2?(spectral==1?spectralColor(vec3(.43,.44,.43),skyD,1.0):vec3(.43,.44,.43)):background;
    // JPEG sky is SDR, not calibrated HDR: bounded linear airlight prevents a
    // nearly clipped channel from blooming into a scene-wide red/blue cast.
    color=mix(displayRadiance(color),toLinear(fogColor),fog);
  }
  float vignette=1.0-.08*dot(p*.65,p*.65);color*=clamp(vignette,.86,1.0);
  gl_FragColor=u_linearOutput==1?encodeRGBE(color):vec4(clamp(displayRGB(color),0.0,1.0),1.0);
}`;
    function patch(before,after){if(!source.includes(before))throw new Error('Shader variant anchor missing: '+before);source=source.replace(before,after);}
    // The optional line variant integrates the Gaussian and the material
    // response together. The shared/default shader stays byte-for-byte on its
    // original path; compiling this longer loop is deferred until requested.
    if(accurateLine){
      patch('uniform sampler2D u_sky', 'uniform float u_lineNormalization;\nuniform sampler2D u_sky');
      patch('vec3 referenceEmitter(vec3 base,float D,float lightGain){',
        'vec3 lineIntegral(float D,float outgoing,int useMaterial);\nvec3 referenceEmitter(vec3 base,float D,float lightGain){');
      patch('vec3 linear=emitterLinear(D);', 'vec3 linear=lineIntegral(D,1.0,0);');
      patch('vec3 materialColor(vec3 base,float total,float outgoing,float lightGain){', `
vec3 cmfEntry(float i){
  float x=2.0*i;
  vec3 hi=floor(texture2D(u_sign,vec2((x+.5)/1024.0,(256.0-216.5)/256.0)).rgb*255.0+.5);
  vec3 lo=floor(texture2D(u_sign,vec2((x+1.5)/1024.0,(256.0-216.5)/256.0)).rgb*255.0+.5);
  return (hi*256.0+lo)*(2.0/65535.0);
}
vec3 lineCmf(float wavelength){
  float p=clamp((wavelength-380.0)/5.0,0.0,80.0),i=floor(p);
  return mix(cmfEntry(i),cmfEntry(min(i+1.0,80.0)),p-i);
}
vec3 lineIntegral(float D,float outgoing,int useMaterial){
  D=clamp(D,.1,10.0);outgoing=clamp(outgoing,.1,10.0);
  float lo=max(u_lineWavelength-40.0,380.0*D),hi=min(u_lineWavelength+40.0,780.0*D);
  if(hi<=lo)return vec3(0.0);
  float stepSize=(hi-lo)/32.0,gain=pow(D,4.0)*stepSize*u_lineNormalization;vec3 xyz=vec3(0.0);
  for(int i=0;i<32;i++){
    float w=lo+(float(i)+.5)*stepSize,t=(w-u_lineWavelength)/8.0;
    float response=useMaterial==1?materialR(w*outgoing/D):1.0;
    xyz+=lineCmf(w/D)*(exp(-.5*t*t)*gain*response);
  }
  return vec3(dot(xyz,vec3(3.2404542,-1.5371385,-.4985314)),dot(xyz,vec3(-.9692660,1.8760108,.0415560)),dot(xyz,vec3(.0556434,-.2040259,1.0572252)));
}
vec3 materialColor(vec3 base,float total,float outgoing,float lightGain){`);
      patch('if(u_sourceMode==2)linear=emitterLinear(total)*materialR(u_lineWavelength*outgoing/total);',
        'if(u_sourceMode==2)linear=lineIntegral(total,outgoing,1);');
    }
    if(!mirror)return source;
    // Lazily compiled only after the optional mirror is enabled. The default
    // program is byte-for-byte the original fast path, including its loop.
    patch('uniform float u_nodeBase,u_primitiveBase,u_nodeCount,u_partBase,u_partCount;',
      'uniform float u_nodeBase,u_primitiveBase,u_nodeCount,u_partBase,u_partCount,u_mirrorX,u_mirrorAngle;');
    patch('float stripe(float x,float period,float width)', `
void mirrorHit(vec3 ro,vec3 rd,inout float nearest,inout vec3 normal,inout int material,inout vec3 boxCenter,inout vec3 boxHalf){
  float c=cos(u_mirrorAngle),s=sin(u_mirrorAngle);vec3 p=ro-vec3(u_mirrorX,2.10,9.5);
  vec3 o=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z),d=vec3(c*rd.x-s*rd.z,rd.y,s*rd.x+c*rd.z);
  for(int i=0;i<6;i++){
    vec3 q=vec3(0.0),h=vec3(1.05,1.25,.025),n;
    if(i==1){q.x=-1.125;h=vec3(.075,1.40,.06);}else if(i==2){q.x=1.125;h=vec3(.075,1.40,.06);}
    else if(i==3){q.y=-1.325;h=vec3(1.05,.075,.06);}else if(i==4){q.y=1.325;h=vec3(1.05,.075,.06);}
    else if(i==5){q.y=-1.70;h=vec3(.08,.41,.08);}
    float t=boxHit(o-q,d,h,n);
    if(t<nearest){nearest=t;normal=vec3(c*n.x+s*n.z,n.y,-s*n.x+c*n.z);material=i==0?48:49;boxCenter=vec3(u_mirrorX,2.10,9.5);boxHalf=h;}
  }
}
float stripe(float x,float period,float width)`);
    patch('float nearest=1e20;int material=0;', 'float nearest=1e20;int material=0;int bounce=0;float mirrorDistance=0.0,rayTime=u_time;vec3 rayOrigin=u_camera,cameraLabRay=labRay;');
    patch('for(int pass=0;pass<17;pass++){\n    if(pass==0){ro=u_camera;rd=labRay;nearest=1e20;}',
      'for(int pass=0;pass<18;pass++){\n    bool tracePrimary=pass==bounce;int samplePass=pass-bounce;\n    if(tracePrimary){ro=rayOrigin;rd=labRay;nearest=1e20;}');
    patch('(u_soft==0&&pass>1)||(u_soft==1&&pass>u_shadowSamples)', '(u_soft==0&&samplePass>1)||(u_soft==1&&samplePass>u_shadowSamples)');
    patch('float index=float(pass-1);', 'float index=float(samplePass-1);');
    patch('(pass==1||pass==3)?-1.0:1.0,sy=pass<=2?', '(samplePass==1||samplePass==3)?-1.0:1.0,sy=samplePass<=2?');
    patch('if(pass>0&&u_scenario==0)center-=u_velocity*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));',
      'if(u_scenario==0){if(!tracePrimary)center-=u_velocity*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));else if(bounce==1)center-=u_velocity*(u_time-rayTime);}');
    patch('((pass>0?!shadowInstant:photo)?g:0.0)', '((!tracePrimary?!shadowInstant:photo)?g:0.0)');
    patch('if(pass>0)centerB-=u_velocityB*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));',
      'if(!tracePrimary)centerB-=u_velocityB*(u_time-(surfaceTime-(shadowInstant?0.0:.003)));else if(bounce==1)centerB-=u_velocityB*(u_time-rayTime);');
    patch('((pass>0?!shadowInstant:photo)?gB:0.0)', '((!tracePrimary?!shadowInstant:photo)?gB:0.0)');
    patch('worldHit(ro,rd,nearest,normal,material,boxCenter,boxHalf);\n    if(nearest<movingDistance)movingBody=0;\n    if(pass==0){',
      `worldHit(ro,rd,nearest,normal,material,boxCenter,boxHalf);
    mirrorHit(ro,rd,nearest,normal,material,boxCenter,boxHalf);
    if(nearest<movingDistance)movingBody=0;
    if(tracePrimary){
      if(bounce==0&&material==48&&photo&&u_emissionMap==0&&(u_debug==0||u_debug==2||u_debug==4||u_debug==7||u_debug==8)){
        mirrorDistance=nearest;rayTime=u_time-nearest-.003;
        labRay=normalize(reflect(rd,normal));rayOrigin=ro+nearest*rd+.003*labRay;bounce=1;continue;
      }`);
    patch('if(u_debug==1){gl_FragColor=vec4(float(material)/255.0,0.0,0.0,1.0);return;}', `
      if(u_debug==1){gl_FragColor=vec4(float(material)/255.0,0.0,0.0,1.0);return;}
      if(u_debug==8){float d=material==0?65535.0:floor(clamp(nearest*256.0,0.0,65534.0)+.5);
        gl_FragColor=bounce==1?vec4(float(material+1)/255.0,floor(d/256.0)/255.0,mod(d,256.0)/255.0,1.0):vec4(0.0,0.0,0.0,1.0);return;}`);
    patch('hitPoint=ro+nearest*rd;surfaceTime=u_time-((u_scenario==0&&!photo)?0.0:nearest);',
      'hitPoint=ro+nearest*rd;surfaceTime=rayTime-((u_scenario==0&&!photo)?0.0:nearest);');
    patch('ro=u_camera;rd=labRay;nearest=primaryDistance;', 'ro=rayOrigin;rd=labRay;nearest=primaryDistance;');
    patch('float skyD=(u_scenario==1&&photo)?g*(1.0+dot(u_velocity,rd)):1.0;',
      'float skyD=(u_scenario==1&&photo)?g*(1.0+dot(u_velocity,cameraLabRay)):1.0;');
    patch('if(material==1){\n      vec3 floorColor;', 'if(material==48){color=vec3(.08,.10,.11);}\n    else if(material==49){color=vec3(.11,.15,.16)*(.78+.28*light);}\n    else if(material==1){\n      vec3 floorColor;');
    patch('float hitTime=u_time-((u_scenario==0&&!photo)?0.0:nearest);', 'float hitTime=surfaceTime;');
    patch('float vignette=1.0-.08*dot(p*.65,p*.65);', `
  if(bounce==1){
    float f=sceneFog(mirrorDistance);
    vec3 haze=u_environment==2?vec3(.43,.44,.43):sky(cameraLabRay);
    if(spectral==1&&u_scenario==1)haze=spectralColor(haze,skyD,1.0);
    color=mix(color,toLinear(haze),f);
  }
  float vignette=1.0-.08*dot(p*.65,p*.65);`);
    return source;
  }
  function makeSurface(width,height){
    const c=typeof document==='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');
    c.width=width;c.height=height;return c;
  }
  function makeSign(){
    const c=makeSurface(1024,256),x=c.getContext('2d',{willReadFrequently:true});
    x.fillStyle='#243134';x.fillRect(0,0,768,202);x.strokeStyle='#8d9994';x.lineWidth=5;x.strokeRect(6,6,756,190);
    x.fillStyle='#e5e1d5';x.font='600 24px sans-serif';x.fillText('PLATFORM',28,48);x.font='700 90px sans-serif';x.fillText('09',30,158);
    x.font='600 28px sans-serif';x.fillText('INERTIAL STATION',186,112);x.font='20px sans-serif';x.fillText('EASTBOUND',187,151);
    x.beginPath();x.moveTo(604,91);x.lineTo(690,91);x.lineTo(690,65);x.lineTo(742,110);x.lineTo(690,155);x.lineTo(690,129);x.lineTo(604,129);x.closePath();x.fill();
    F.paint(x);const lut=x.createImageData(S.N,8);lut.data.set(S.atlasRows());x.putImageData(lut,0,224);return c;
  }
  function replaceCanvas(canvas){const fresh=canvas.cloneNode(false);[...textureNames,'harborSky','harborMetal'].forEach(name=>delete fresh.dataset[name+'Loaded']);delete fresh.dataset.shaderPrograms;canvas.replaceWith(fresh);return fresh;}
  function glTexture(gl,source,mip=true){
    // WebGL 1 requires power-of-two textures for mipmapping. Filtering distant
    // stone/asphalt prevents the high-frequency road from shimmering.
    const pow2=v=>Math.max(2,Math.min(1024,2**Math.floor(Math.log2(Math.max(2,v)))));
    const width=pow2(source.width),height=pow2(source.height);
    if(mip&&(width!==source.width||height!==source.height)){const c=makeSurface(width,height);c.getContext('2d').drawImage(source,0,0,width,height);source=c;}
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);if(mip)gl.generateMipmap(gl.TEXTURE_2D);return tex;
  }
  function signTexture(gl){
    const c=makeSign(),src=c.getContext('2d').getImageData(0,0,1024,256).data,packed=G.pack();
    src.set(packed.pixels,232*1024*4);src.set(S.cmfAtlasRow(),216*1024*4);
    // Typed-array WebGL uploads do not apply UNPACK_FLIP_Y; reverse rows here.
    const pixels=new Uint8Array(src.length),stride=1024*4;
    for(let y=0;y<256;y++)pixels.set(src.subarray(y*stride,(y+1)*stride),(255-y)*stride);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,256,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);return tex;
  }
  const textureNames=['sky','stone','crate','facade','asphalt','wall','mountains','sign'],assetNames=Object.freeze([...textureNames.filter(name=>name!=='sign'),'harborSky','harborMetal']);
  function makeWebGL(canvas,onAsset,onLost,{parallel=false}={}){
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL is unavailable');
    // Do not query COMPILE_STATUS immediately when the optional parallel
    // extension is available: that query would synchronously wait for compile.
    const parallelExt=parallel?gl.getExtension('KHR_parallel_shader_compile'):null;
    function compile(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!parallelExt&&!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(sh)||'shader compilation failed';gl.deleteShader(sh);throw new Error(error);}return sh;}
    const maxViewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS),maxRenderbuffer=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    const debugInfo=gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName=debugInfo?String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)):'';
    const software=/swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(rendererName);
    // Some browsers hide the renderer identity for privacy. Do not assume that
    // an unidentified implementation is fast hardware: use the low-contention
    // tile cadence until it is positively identified, without calling it software.
    const unknown=!rendererName.trim()||/^(webgl|webkit webgl)$/i.test(rendererName.trim());
    const conservative=software||unknown;
    // One compact program serves all four worlds; their BVHs are data, not
    // thousands of unrolled shader statements compiled on every page load.
    const vertexShader=compile(gl.VERTEX_SHADER,vertex),shader=compile(gl.FRAGMENT_SHADER,fragment());let program=gl.createProgram();
    gl.attachShader(program,vertexShader);gl.attachShader(program,shader);gl.bindAttribLocation(program,0,'a_position');gl.linkProgram(program);
    function afterLink(){
    if(!gl.getShaderParameter(vertexShader,gl.COMPILE_STATUS)||!gl.getShaderParameter(shader,gl.COMPILE_STATUS)||!gl.getProgramParameter(program,gl.LINK_STATUS)){
      const error=gl.getProgramInfoLog(program)||gl.getShaderInfoLog(shader)||gl.getShaderInfoLog(vertexShader)||'shader compilation failed';
      gl.deleteShader(shader);gl.deleteShader(vertexShader);gl.deleteProgram(program);throw new Error(error);
    }
    gl.deleteShader(shader);gl.deleteShader(vertexShader);
    const uniformNames=['resolution','jitter','lightHalf','camera','center','centerB','halfSize','velocity','velocityB','lightDirection','lightPosition','partCenter','partHalf','yaw','pitch','tanFov','beta','split','time','exposure','debugLightGain','bevel','sunRadius','scenario','shape','view','debug','environment','secondEnabled','shadows','soft','shadowSamples','spectral','spectrumSplit','emissionMap','sourceMode','shadowTiming','surfaceMode','linearOutput','material','toneMode','lineWavelength','lineNormalization','roughnessScale','nodeBase','primitiveBase','nodeCount','partBase','partCount','mirrorX','mirrorAngle',...textureNames];
    const locations=pr=>{const out={};uniformNames.forEach(k=>out[k]=gl.getUniformLocation(pr,'u_'+k));return out;};
    const programs=new Map([['shared',{program,uniforms:locations(program)}]]);let u=programs.get('shared').uniforms;
    function selectProgram(mirror,line){
      const key=mirror?(line?'mirror-line':'mirror'):(line?'line':'shared');
      if(!programs.has(key)){
        const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment(mirror,line)),pr=gl.createProgram();
        gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.bindAttribLocation(pr,0,'a_position');gl.linkProgram(pr);
        if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)||!gl.getShaderParameter(fs,gl.COMPILE_STATUS)||!gl.getProgramParameter(pr,gl.LINK_STATUS)){
          const error=gl.getProgramInfoLog(pr)||gl.getShaderInfoLog(fs)||gl.getShaderInfoLog(vs)||'optional shader compilation failed';
          gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteProgram(pr);throw new Error(error);
        }
        gl.deleteShader(vs);gl.deleteShader(fs);programs.set(key,{program:pr,uniforms:locations(pr)});canvas.dataset.shaderPrograms=String(programs.size);
      }
      ({program,uniforms:u}=programs.get(key));
    }
    canvas.dataset.shaderPrograms='1';
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    const temp=makeSurface(2,2),ctx=temp.getContext('2d');ctx.fillStyle='#9ba4a2';ctx.fillRect(0,0,2,2);
    // The mountain atlas has unrelated sky/ground halves: mipmapping across
    // repeated sub-rectangles would bleed sky into the near terrain.
    const textures={};[...textureNames,'harborSky','harborMetal'].forEach(name=>textures[name]=name==='sign'?signTexture(gl):glTexture(gl,temp,!['sky','harborSky','harborMetal','crate','facade','sign','mountains'].includes(name)));
    assetNames.forEach(name=>{
      const ready=image=>{
        if(gl.isContextLost())return;
        gl.deleteTexture(textures[name]);textures[name]=glTexture(gl,image,!['sky','harborSky','harborMetal','crate','facade','sign','mountains'].includes(name));
        if(typeof image.close==='function')image.close();
        canvas.dataset[name+'Loaded']='true';onAsset(name,'true');
      };
      const failed=()=>{canvas.dataset[name+'Loaded']='error';onAsset(name,'error');};
      if(typeof Image==='function'){
        const image=new Image();image.onload=()=>ready(image);image.onerror=failed;image.src=root.RelativityTextures[name];
      }else{
        // HTMLImageElement is unavailable in a worker; the inline data URLs
        // still decode locally, without any request to an external server.
        // WebGL ignores UNPACK_FLIP_Y_WEBGL for ImageBitmap sources. Flip
        // during decoding so atlas rows match the HTMLImageElement path.
        fetch(root.RelativityTextures[name]).then(r=>r.blob()).then(blob=>createImageBitmap(blob,{imageOrientation:'flipY'})).then(ready).catch(failed);
      }
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onLost();},{once:true});
    function dimensions(state,viewport=null){
      const rect=viewport||canvas.getBoundingClientRect(),dpr=Math.min((viewport&&viewport.dpr)||root.devicePixelRatio||1,1.25),budget=state.renderBudget|| (software?(state.playing?(state.shadows===false?40000:24000):100000):(state.playing?160000:500000)),cap=Math.sqrt(budget/Math.max(1,rect.width*rect.height));
      const scale=Math.min(dpr,cap,Math.min(maxViewport[0],maxRenderbuffer)/Math.max(1,rect.width),Math.min(maxViewport[1],maxRenderbuffer)/Math.max(1,rect.height));
      return {width:Math.max(1,Math.round(rect.width*scale)),height:Math.max(1,Math.round(rect.height*scale))};
    }
    const partBounds={};for(const env of W.IDs)for(const shape of ['cube','artifact']){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(const part of M.objectParts(env,shape))for(let k=0;k<3;k++){min[k]=Math.min(min[k],part.center[k]-part.half[k]);max[k]=Math.max(max[k],part.center[k]+part.half[k]);}
      partBounds[env+'/'+shape]={center:min.map((v,i)=>(v+max[i])*.5),half:min.map((v,i)=>(max[i]-v)*.5)};
    }
    let sourceKey='',materialKey='',lineMaterialKey='',activeEnvironment='station';
    function prepare(state,debug=false,viewport=null){
      const lineEnabled=state.spectrumModel==='line'&&(state.doppler===true||state.spectrumSplit||debug===5||debug===6);
      selectProgram(state.sceneMirror===true,lineEnabled);
      activeEnvironment=state.environment||'station';const {width:w,height:h}=dimensions(state,viewport);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);
      const {camera,center,second}=eventState(state),layout=G.pack().layout[state.environment]||G.pack().layout.station;gl.useProgram(program);
      const mode=state.spectrumModel==='blackbody'||state.spectrumModel==='line'?state.spectrumModel:'rgb',temperature=state.temperature||6500,line=state.lineWavelength||656.3,key=[mode,temperature,line].join('/');
      if((state.doppler===true||state.spectrumSplit||debug===5||debug===6)&&mode==='blackbody'&&key!==sourceKey){
        const rows=S.sourceAtlasRows(mode,temperature,line),stride=S.N*4,reversed=new Uint8Array(rows.length);reversed.set(rows.subarray(stride),0);reversed.set(rows.subarray(0,stride),stride);
        gl.bindTexture(gl.TEXTURE_2D,textures.sign);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texSubImage2D(gl.TEXTURE_2D,0,0,52,S.N,2,gl.RGBA,gl.UNSIGNED_BYTE,reversed);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);sourceKey=key;
      }
      const material=state.materialSpectrum||'texture',materialIndex=T?Math.max(0,T.ids.indexOf(material)):0;
      if((state.doppler===true||state.spectrumSplit||debug===6)&&materialIndex&&mode!=='line'){
        const materialTemperature=mode==='rgb'?6504:temperature,mkey=material+'/'+materialTemperature;
        if(materialKey!==mkey){
          const rows=T.atlas(material,materialTemperature),stride=T.WIDTH*4,reversed=new Uint8Array(rows.length);
          for(let y=0;y<T.ROWS;y++)reversed.set(rows.subarray(y*stride,(y+1)*stride),(T.ROWS-1-y)*stride);
          gl.bindTexture(gl.TEXTURE_2D,textures.sign);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
          gl.texSubImage2D(gl.TEXTURE_2D,0,0,256-204-T.ROWS,T.WIDTH,T.ROWS,gl.RGBA,gl.UNSIGNED_BYTE,reversed);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);materialKey=mkey;
        }
      }
      if((state.doppler===true||state.spectrumSplit||debug===6)&&T?.measuredIds.includes(material)&&mode==='line'&&lineMaterialKey!==material){
        const rows=T.lineAtlas(material),stride=1024*4,reversed=new Uint8Array(rows.length);
        for(let y=0;y<3;y++)reversed.set(rows.subarray(y*stride,(y+1)*stride),(2-y)*stride);
        gl.bindTexture(gl.TEXTURE_2D,textures.sign);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,40,1024,3,gl.RGBA,gl.UNSIGNED_BYTE,reversed);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);lineMaterialKey=material;
      }
      const artifact=state.shape==='artifact';
      gl.uniform1f(u.nodeBase,layout.nodeBase);gl.uniform1f(u.primitiveBase,layout.primitiveBase);gl.uniform1f(u.nodeCount,layout.nodeCount);gl.uniform1f(u.partBase,artifact?layout.artifactBase:layout.partBase);gl.uniform1f(u.partCount,artifact?layout.artifactCount:layout.partCount);gl.uniform3fv(u.halfSize,M.objectHalf(state.environment,state.shape));gl.uniform1f(u.bevel,M.objectBevel(state.environment,state.shape));gl.uniform3fv(u.velocity,M.motionVelocity(state.scenario,state.beta,state.motionAngle||0,state.motionElevation||0));gl.uniform3fv(u.velocityB,second?second.velocity:[0,0,0]);gl.uniform3fv(u.centerB,second?second.center:[0,0,0]);gl.uniform1i(u.secondEnabled,second?1:0);gl.uniform3fv(u.lightDirection,O.lightDirection(state));gl.uniform3fv(u.lightPosition,O.lightPosition(state.environment,state));gl.uniform2fv(u.lightHalf,W.lightHalf(state.environment,state));gl.uniform1f(u.sunRadius,state.sunAngularRadius??O.DEFAULT_SUN_RADIUS);gl.uniform1i(u.shadowSamples,O.shadowSampleCount(state));const bounds=partBounds[(state.environment||'station')+'/'+(artifact?'artifact':'cube')]||partBounds['station/cube'];gl.uniform3fv(u.partCenter,bounds.center);gl.uniform3fv(u.partHalf,bounds.half);
      if(state.sceneMirror===true){gl.uniform1f(u.mirrorX,state.mirrorX??-2.25);gl.uniform1f(u.mirrorAngle,(state.mirrorAngle||0)*Math.PI/180);}
      gl.uniform2f(u.resolution,w,h);gl.uniform2f(u.jitter,state.sampleJitter?.[0]||0,state.sampleJitter?.[1]||0);gl.uniform3fv(u.camera,camera);gl.uniform3fv(u.center,center);gl.uniform1f(u.yaw,state.yaw);gl.uniform1f(u.pitch,state.pitch);gl.uniform1f(u.tanFov,Math.tan(effectiveFov(state,w,h)*Math.PI/360));gl.uniform1f(u.beta,state.beta);gl.uniform1f(u.split,state.split);gl.uniform1f(u.time,state.time);gl.uniform1f(u.exposure,state.exposure||0);gl.uniform1f(u.debugLightGain,state.debugLightGain===undefined?1:state.debugLightGain);
      gl.uniform1i(u.scenario,state.scenario==='flyby'?0:1);gl.uniform1i(u.shape,state.shape==='sphere'?1:state.shape==='artifact'?2:0);gl.uniform1i(u.view,state.view==='photo'?0:state.view==='geometry'?1:2);gl.uniform1i(u.debug,debug===true?1:debug||0);gl.uniform1i(u.environment,Math.max(0,W.IDs.indexOf(state.environment)));gl.uniform1i(u.shadows,state.shadows===false?0:1);gl.uniform1i(u.soft,state.softShadows===true?1:0);gl.uniform1i(u.spectral,state.doppler===true?1:0);gl.uniform1i(u.spectrumSplit,state.spectrumSplit?1:0);gl.uniform1i(u.emissionMap,state.emissionMap===true?1:0);gl.uniform1i(u.sourceMode,mode==='blackbody'?1:mode==='line'?2:0);gl.uniform1i(u.shadowTiming,state.shadowTiming==='instant'?1:state.shadowTiming==='split'?2:0);gl.uniform1i(u.surfaceMode,state.surfaceMode==='reflection'?1:0);gl.uniform1i(u.linearOutput,0);gl.uniform1i(u.material,materialIndex);gl.uniform1i(u.toneMode,state.toneMap==='filmic'&&!state.emissionMap?1:0);gl.uniform1f(u.lineWavelength,line);gl.uniform1f(u.lineNormalization,lineEnabled?S.lineNormalization(line):0);gl.uniform1f(u.roughnessScale,state.roughnessScale||1);
      textureNames.forEach((name,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[activeEnvironment==='harbor'?(name==='sky'?'harborSky':name==='facade'?'harborMetal':name):name]);gl.uniform1i(u[name],i);});
      return {width:w,height:h};
    }
    let accumulator=null,probeFramebuffer=null;
    function sampleFramebuffer(){
      if(!probeFramebuffer){
        const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Spectrum sample framebuffer unavailable');
        probeFramebuffer={texture,framebuffer};
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,probeFramebuffer.framebuffer);useSceneTextures();
    }
    function linearAccumulator(width,height){
      if(!accumulator){
        const fs=`precision highp float;
          uniform sampler2D u_sample,u_previous;uniform vec2 u_size;uniform float u_weight;uniform int u_first,u_display,u_toneMode;
          vec3 unpackRGBE(vec4 c){vec4 b=floor(c*255.0+.5);vec3 q=vec3(b.r*4.0+floor(b.g/64.0),mod(b.g,64.0)*16.0+floor(b.b/16.0),mod(b.b,16.0)*64.0+floor(b.a/4.0));return step(vec3(.5),q)*exp2((q-1.0)/1022.0*22.0-14.0);}
          vec4 packRGBE(vec3 v){vec3 q=floor(clamp((log2(max(v,vec3(.00006103515625)))+14.0)/22.0*1022.0+1.0,1.0,1023.0)+.5)*step(vec3(1e-20),v);return vec4(floor(q.r/4.0),mod(q.r,4.0)*64.0+floor(q.g/16.0),mod(q.g,16.0)*16.0+floor(q.b/64.0),mod(q.b,64.0)*4.0)/255.0;}
          vec3 srgb(vec3 c){c=max(c,0.0);return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
          void main(){vec2 uv=gl_FragCoord.xy/u_size;vec3 sampleValue=unpackRGBE(texture2D(u_sample,uv));
            if(u_display==1){vec3 mapped=sampleValue/(1.0+sampleValue);if(u_toneMode==1){float peak=max(sampleValue.r,max(sampleValue.g,sampleValue.b));float shoulder=clamp((peak*(2.51*peak+.03))/(peak*(2.43*peak+.59)+.14),0.0,1.0);mapped=peak>1e-20?sampleValue*(shoulder/peak):vec3(0.0);}gl_FragColor=vec4(clamp(srgb(mapped),0.0,1.0),1.0);return;}
            vec3 previous=u_first==1?vec3(0.0):unpackRGBE(texture2D(u_previous,uv));gl_FragColor=packRGBE(previous+sampleValue*u_weight);}`;
        const vs=compile(gl.VERTEX_SHADER,vertex),sh=compile(gl.FRAGMENT_SHADER,fs),pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,sh);gl.bindAttribLocation(pr,0,'a_position');gl.linkProgram(pr);
        if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)||!gl.getShaderParameter(sh,gl.COMPILE_STATUS)||!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error('Linear accumulation shader: '+(gl.getProgramInfoLog(pr)||gl.getShaderInfoLog(sh)));
        gl.deleteShader(vs);gl.deleteShader(sh);
        const locations={};['sample','previous','size','weight','first','display','toneMode'].forEach(k=>locations[k]=gl.getUniformLocation(pr,'u_'+k));
        accumulator={program:pr,u:locations,textures:[gl.createTexture(),gl.createTexture(),gl.createTexture()],fbos:[gl.createFramebuffer(),gl.createFramebuffer(),gl.createFramebuffer()],width:0,height:0};
      }
      const a=accumulator;if(a.width!==width||a.height!==height){
        a.width=width;a.height=height;
        for(let i=0;i<3;i++){
          gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.textures[i]);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
          gl.bindFramebuffer(gl.FRAMEBUFFER,a.fbos[i]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,a.textures[i],0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Linear shutter framebuffer unavailable');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      }return a;
    }
    function useSceneTextures(){gl.useProgram(program);textureNames.forEach((name,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[activeEnvironment==='harbor'?(name==='sky'?'harborSky':name==='facade'?'harborMetal':name):name]);});}
    function accumulate(a,source,previous,target,first,weight,display,toneMode=false){
      gl.bindFramebuffer(gl.FRAMEBUFFER,target===null?null:a.fbos[target]);gl.useProgram(a.program);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,a.textures[source]);gl.uniform1i(a.u.sample,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,a.textures[previous]);gl.uniform1i(a.u.previous,1);
      gl.uniform2f(a.u.size,a.width,a.height);gl.uniform1f(a.u.weight,weight);gl.uniform1i(a.u.first,first?1:0);gl.uniform1i(a.u.display,display?1:0);gl.uniform1i(a.u.toneMode,toneMode?1:0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    const syncPixel=new Uint8Array(4);
    // A rare synchronous WebGL fallback still needs to restore cached pixels
    // into the real canvas, not into an overlay with stale picking/snapshots.
    // This tiny blit program is created lazily only on a cache hit.
    let cachedBlit=null;
    function presentCached(image,isCurrent=()=>true){
      if(!isCurrent()||gl.isContextLost())return false;
      if(!cachedBlit){
        const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,`precision highp float;
          uniform sampler2D u_image;uniform vec2 u_size;void main(){gl_FragColor=texture2D(u_image,gl_FragCoord.xy/u_size);}`),pr=gl.createProgram();
        gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.bindAttribLocation(pr,0,'a_position');gl.linkProgram(pr);
        if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS)||!gl.getShaderParameter(fs,gl.COMPILE_STATUS)||!gl.getProgramParameter(pr,gl.LINK_STATUS)){
          const error=gl.getProgramInfoLog(pr)||gl.getShaderInfoLog(fs)||'cached-frame blit failed';gl.deleteShader(vs);gl.deleteShader(fs);gl.deleteProgram(pr);throw new Error(error);
        }
        gl.deleteShader(vs);gl.deleteShader(fs);cachedBlit={program:pr,image:gl.getUniformLocation(pr,'u_image'),size:gl.getUniformLocation(pr,'u_size')};
      }
      if(!isCurrent())return false;
      if(canvas.width!==image.width||canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,image.width,image.height);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
      gl.useProgram(cachedBlit.program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
      const texture=gl.createTexture();if(!texture)return false;
      try{
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);if(gl.getError()!==gl.NO_ERROR)return false;
        gl.uniform1i(cachedBlit.image,0);gl.uniform2f(cachedBlit.size,image.width,image.height);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        return gl.getError()===gl.NO_ERROR;
      }finally{gl.deleteTexture(texture);}
    }
    // A synchronous readback provides GPU backpressure. In some browser/driver
    // combinations gl.finish() on its own returns before the shared GPU queue
    // has actually completed, allowing expensive work to pile up while idle.
    function sync(x=0,y=0){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,syncPixel);}
    return {kind:'webgl',canvas,software,unknown,conservative,cacheIdentity:[rendererName,maxViewport[0],maxViewport[1],maxRenderbuffer].join('/'),parallelCompile:!!parallelExt,dimensions,
    programNames(){return Array.from(programs.keys());},presentCached,
    finish(){sync();},
    sampleSpectrum(state,u0,v0,width,height){
      // Called only when no tile job is active. Read one actual pixel at the
      // displayed resolution, without touching or transferring the visible frame.
      const size=prepare({...state,renderBudget:width*height,doppler:false,spectrumSplit:false,emissionMap:false},7,{width,height,dpr:1});
      const x=clamp(Math.floor(u0*size.width),0,size.width-1),y=clamp(size.height-1-Math.floor(v0*size.height),0,size.height-1),pixel=new Uint8Array(4);
      // A one-pixel framebuffer with a virtual pixel offset traces the exact
      // same ray while leaving the displayed (possibly shutter-averaged) frame untouched.
      try{sampleFramebuffer();gl.viewport(0,0,1,1);gl.disable(gl.SCISSOR_TEST);gl.uniform2f(u.jitter,x,y);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}
      finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,size.width,size.height);gl.uniform2f(u.jitter,0,0);}
      return {rgb:Array.from(pixel.slice(0,3),v=>v/255),pixel:[x,size.height-1-y],width:size.width,height:size.height,method:'webgl'};
    },
    render(state,debug=false,viewport=null){
      prepare(state,debug,viewport);gl.disable(gl.SCISSOR_TEST);
      // Debug readbacks describe the centre event. A direct non-tiled render
      // must still honour the same shutter/AA sampling as the Worker path.
      const times=debug?[state.time]:M.shutterTimes(state.time,state.shutter||0),spatial=!debug&&state.antialias?4:1;
      if(times.length*spatial===1){gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return;}
      // Direct and cooperative paths use the very same linear accumulator.
      const job=this.beginTiles(state,viewport,256,{samples:spatial});while(!job.step()){}

    },
    // Render the same full-resolution rays in small bounded GPU submissions.
    // The caller presents only after every tile finishes, so cancellation never
    // exposes a mixture of observations or partially drawn scenes.
    beginTiles(state,viewport,tileSize=96,{samples=1}={}){
      const {width,height}=prepare(state,false,viewport),spatial=samples===4?4:1;
      const offsets=spatial===4?[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]:[[0,0]];
      const times=M.shutterTimes(state.time,state.shutter||0),events=times.map(time=>eventState({...state,time}));
      samples=spatial*times.length;
      const total=Math.ceil(width/tileSize)*Math.ceil(height/tileSize)*samples;
      const linear=samples>1?linearAccumulator(width,height):null;
      let size=clamp(Math.round(tileSize),16,256),x=0,y=0,rowHeight=0,tileWidth=0,sample=0,covered=0;
      gl.enable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);
      function finish(){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);useSceneTextures();gl.uniform1i(u.linearOutput,0);gl.uniform2f(u.jitter,0,0);}
      return {width,height,total,samples,
        step(){
          if(sample===0){
            if(x===0)rowHeight=Math.min(size,height-y);
            tileWidth=Math.min(size,width-x);gl.scissor(x,y,tileWidth,rowHeight);
          }
          const spatialSample=sample%spatial,temporalSample=Math.floor(sample/spatial),event=events[temporalSample];
          if(linear){gl.bindFramebuffer(gl.FRAMEBUFFER,linear.fbos[0]);useSceneTextures();}
          gl.uniform1i(u.linearOutput,linear?1:0);gl.uniform2f(u.jitter,offsets[spatialSample][0],offsets[spatialSample][1]);
          gl.uniform3fv(u.camera,event.camera);gl.uniform3fv(u.center,event.center);if(event.second)gl.uniform3fv(u.centerB,event.second.center);gl.uniform1f(u.time,times[temporalSample]);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
          if(linear){
            const target=1+(sample%2),previous=1+((sample+1)%2);
            accumulate(linear,0,previous,target,sample===0,1/samples,false);
            if(sample===samples-1)accumulate(linear,target,previous,null,true,1,true,state.toneMap==='filmic'&&!state.emissionMap);
          }
          sync(x,y);covered+=tileWidth*rowHeight;sample++;
          if(sample===samples){sample=0;x+=tileWidth;if(x>=width){x=0;y+=rowHeight;}}
          if(y>=height){finish();return true;}return false;
        },
        setTileSize(next){if(Number.isFinite(next))size=clamp(Math.round(next),16,256);},
        cancel(){finish();},
        progress(){return covered/(width*height*samples);}
      };
    },debugMaterials(state){
      this.render(state,true);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    },debugOptics(state){
      this.render(state,2);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    },debugSoftOptics(state){
      this.render({...state,softShadows:true,shadows:true},4);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    },debugSpectrum(state){
      this.render(state,3);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    },debugMaterialSpectrum(state){
      this.render(state,6);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    },debugEmitter(state){
      this.render(state,5);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      this.render(state,false);return {width:canvas.width,height:canvas.height,pixels};
    }};
    }
    if(!parallelExt)return afterLink();
    return new Promise((resolve,reject)=>{
      function poll(){
        try{
          if(gl.isContextLost())throw new Error('WebGL context lost while compiling');
          if(gl.getProgramParameter(program,parallelExt.COMPLETION_STATUS_KHR))resolve(afterLink());
          else setTimeout(poll,24);
        }catch(error){reject(error);}
      }
      setTimeout(poll,0);
    });
  }
  // Match WebGL's non-mipmapped LINEAR, CLAMP_TO_EDGE sampling for CPU
  // textures. The road/stone CPU sources remain prefiltered to 64×64, whereas
  // GPU mipmaps are footprint-dependent. Coordinates use the shader's fract();
  // interpolation is in stored SDR channels. This is not spatial anti-aliasing
  // or extra resolution.
  function sampleTexture(img,u,v,repeat=true){
    u=repeat?fract(u):clamp(u,0,1);v=repeat?fract(v):clamp(v,0,1);
    const x=clamp(u*img.w-.5,0,img.w-1),y=clamp((1-v)*img.h-.5,0,img.h-1),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,img.w-1),y1=Math.min(y0+1,img.h-1),fx=x-x0,fy=y-y0;
    const a=(y0*img.w+x0)*4,b=(y0*img.w+x1)*4,c=(y1*img.w+x0)*4,d=(y1*img.w+x1)*4,p=img.pixels;
    const w0=(1-fx)*(1-fy),w1=fx*(1-fy),w2=(1-fx)*fy,w3=fx*fy;
    return [p[a]*w0+p[b]*w1+p[c]*w2+p[d]*w3,p[a+1]*w0+p[b+1]*w1+p[c+1]*w2+p[d+1]*w3,p[a+2]*w0+p[b+2]*w1+p[c+2]*w2+p[d+2]*w3];
  }
  function makeCanvas(canvas,onAsset){
    const memory=root.navigator?.deviceMemory,limit=root.__RELATIVITY_INTERMEDIATE_BUDGET__??intermediateBudget(memory);
    const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true}),images={},staticRayCache=createStaticRayCache(),intermediate=createIntermediateRayCache(limit);
    if(!ctx)throw new Error('Canvas 2D is unavailable');
    function store(name,image){
      const c=makeSurface(1,1),ground=name==='asphalt'||name==='stone';
      // The fallback traces very few rays. Prefilter high-frequency pavement
      // once so single-sample pixels do not turn fine aggregate into noise.
      c.width=ground?64:image.width;c.height=ground?64:image.height;
      const cx=c.getContext('2d',{willReadFrequently:true});cx.imageSmoothingQuality='high';cx.drawImage(image,0,0,c.width,c.height);
      images[name]={pixels:cx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};intermediate.invalidateMaterial();canvas.dataset[name+'Loaded']='true';if(name!=='sign')onAsset(name,'true');
    }
    store('sign',makeSign());
    assetNames.forEach(name=>{
      const failed=()=>{canvas.dataset[name+'Loaded']='error';onAsset(name,'error');};
      if(typeof Image==='function'){const image=new Image();image.onload=()=>store(name,image);image.onerror=failed;image.src=root.RelativityTextures[name];}
      else fetch(root.RelativityTextures[name]).then(r=>r.blob()).then(blob=>createImageBitmap(blob)).then(image=>{store(name,image);image.close();}).catch(failed);
    });
    function sample(name,u,v,repeat=true){
      const img=images[name];if(!img)return [150,155,150];
      return sampleTexture(img,u,v,repeat);
    }
    function sky(ray,env){const u=fract(.5+Math.atan2(ray[0],ray[2])/(2*Math.PI)),v=clamp((env==='mountain'?.21:.05)+.82*Math.max(ray[1],0),.03,.96);if(env==='corridor')return [99,107,107].map(x=>x*(1+.1*Math.max(ray[1],0)));if(env==='harbor')return sample('harborSky',u,v,false);return sample(env==='mountain'?'mountains':'sky',u,env==='street'?.5*v:.5+.5*v,false);}
    const mul=(a,s)=>a.map(v=>v*s),mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
    function faceUV(p,h){const q=p.map((v,i)=>(v-h.center[i])/h.half[i]),n=h.normal;return Math.abs(n[0])>.5?[q[2]*.5+.5,q[1]*.5+.5]:Math.abs(n[1])>.5?[q[0]*.5+.5,q[2]*.5+.5]:[q[0]*.5+.5,q[1]*.5+.5];}
    function shadingSignature(state){
      // Time and moving-body parameters are deliberately absent: visibility
      // of both moving objects is freshly traced and keyed below every frame.
      return [state.environment,state.scenario,state.shape,state.view,state.doppler,state.exposure,state.shadows,state.softShadows,state.shadowTiming,
        state.lightX,state.lightZ,state.lightYaw,state.lightElevation,state.lightWidthScale,state.lightDepthScale,state.sunAngularRadius,state.shadowSamples,state.roughnessScale,state.emissionMap,state.surfaceMode,state.materialSpectrum,
        state.spectrumModel,state.temperature,state.lineWavelength,state.toneMap].join('/');
    }
    function shade(result,state,inspection=null,signature=null,prepared=null){
      // Reflected moving geometry is time-dependent even when the first hit
      // is cached. Always trace it anew, and never recurse beyond one bounce.
      const bounce=traceReflection(state,result);
      if(bounce){
        const color=shadeCore(bounce.ray,bounce.state,inspection);
        if(inspection)return color;
        const env=state.environment||'station',fog=Surface.fog(result.hit.distance,env);
        let bg=env==='corridor'?[110,112,110]:sky(result.labDirection,env);
        if(state.doppler===true&&state.scenario==='observer')bg=S.shift(bg.map(v=>v/255),M.stationarySourceDoppler(result.labDirection,result.observerVelocity),state.exposure||0).map(v=>v*255);
        return mix(color,S.fogSkyRadiance(bg.map(v=>v/255)),fog);
      }
      const entry=result.staticEntry;
      if(!entry||!signature||inspection)return shadeCore(result,state,inspection,prepared);
      // The cached ray is fixed, but neither A nor B's shadow is: recompute
      // visibility before reusing a stationary surface's shaded radiance.
      const hit=result.hit,env=state.environment||'station';let light=null,info=null,gain=1,visibility=1;
      if(hit&&state.shadows!==false&&!(state.emissionMap&&(state.scenario==='observer'||result.photo))&&hit.kind!=='light'&&hit.kind!=='key-light'){
        light=O.keyLight(env,hit.point,state);info=O.shadingIllumination(state,result,light);
        if(info.shadowed){gain=O.shadowFactor(info,env);visibility=info.sampleCount&&info.weightedDirect>0?info.weightedVisible/info.weightedDirect:0;}
      }
      const slots=entry.radianceCache||(entry.radianceCache=[]);
      for(const slot of slots)if(slot.signature===signature&&slot.photo===result.photo&&slot.gain===gain&&slot.visibility===visibility)return slot.rgb;
      const rgb=shadeCore(result,state,null,{light,info});
      if(slots.length===2)slots.shift();slots.push({signature,photo:result.photo,gain,visibility,rgb});return rgb;
    }
    function shadeCore(result,state,inspection=null,prepared=null){
      const {hit,labDirection}=result,env=state.environment||'station',base=sky(labDirection,env);if(!hit&&inspection){inspection.rgb=base.map(v=>clamp(v/255,0,1));return;}
      if(hit&&state.emissionMap&&(state.scenario==='observer'||result.photo))return S.displayToRadiance(M.emissionColor(hit.distance));if(!hit){const D=state.scenario==='observer'&&result.photo?M.stationarySourceDoppler(result.observerLabDirection||labDirection,result.observerVelocity):1;return S.displayToRadiance(state.doppler===true?S.shift(base.map(v=>v/255),D,state.exposure||0):base.map(v=>v/255));}
      const norm=hit.normal||[0,1,0],p=hit.point,t=hit.distance,key=prepared?.light||O.keyLight(env,p,state),diffuse=Math.max(0,M.dot(norm,key.direction))*Surface.attenuation(key),light=Surface.ambient(norm,env)+(env==='station'||env==='corridor'?.30:.37)*diffuse;let c;
      const mod=(v,s)=>((v%s)+s)%s,near=(v,s,w)=>Math.min(mod(v,s),s-mod(v,s))<w;
      c=prepared?.cache?.material(prepared.index)||null;
      if(!c){switch(hit.material){
        case 48:c=[20,26,28];break;
        case 49:c=mul([28,38,41],.78+.28*light);break;
        case 1:
          if(env==='street'||env==='mountain'||env==='harbor'){
            c=mul(sample('asphalt',p[0]/3,p[2]/3),.88);
            if(env==='mountain'&&Math.abs(p[0])>5.37){c=mul(sample('mountains',.002+.496*fract(p[0]/5),.002+.496*fract(p[2]/5),false),1.05);c=mix(c,[77,82,64],clamp((t-22)/53,0,1)*.75);}
            if(Math.abs(Math.abs(p[0])-4.38)<.07||(Math.abs(p[0])<.06&&mod(p[2]+1000,7)<3.1))c=mix(c,env==='mountain'?[191,179,130]:[199,199,184],.78);
            if(env==='street'&&Math.abs(p[2]-10.6)<.68&&Math.abs(p[0])<4.3&&mod(p[0]+1000,1.2)<.58)c=mix(c,[194,194,181],.72);
            if(env==='street'&&Math.hypot(p[0]+1.65,p[2]-5.8)<.43)c=mix(c,[61,64,61],.85);
          }else{
            c=mul(sample('stone',p[0]/3,p[2]/3),env==='corridor'?.90:1.05);
            if(near(p[0],1.7,.02)||near(p[2],2.4,.02))c=mul(c,.69);
            if(env==='station'&&Math.abs(Math.abs(p[0])-3.2)<.11)c=mix(c,[171,140,82],.63);
          }
          c=mul(c,.84+.16*light);break;
        case 2:case 3:case 10:{const metal=hit.material===2?[110,112,107]:hit.material===10?[79,84,82]:[99,102,97],grain=sample('stone',p[0]/2+p[1]*.12,p[2]/2+p[1]*.12)[0]/255;c=mul(metal,(.77+.40*light)*(.80+.35*grain));break;}
        case 5:{const uv=Math.abs(norm[0])>.5?[p[2]/4,p[1]/4]:[p[0]/4,p[1]/4];c=mul(sample('wall',...uv),(env==='corridor'?.96:1.02)*light*(p[1]<.3?.82:1));break;}
        case 6:case 20:{if(hit.material===6){const uv=faceUV(p,hit).map(v=>clamp(v,.002,.998)),u=Math.abs(norm[1])>.5?uv[1]:uv[0],v=Math.abs(norm[1])>.5?uv[0]:uv[1];c=mul(sample('crate',u,.5*v,false),.78+.30*light);if(near(Math.abs(norm[1])>.5?p[0]-hit.center[0]:p[1]-hit.center[1],.19,.012))c=mul(c,.8);}else{const grain=sample('stone',p[0]/2.2+p[1]*.08,p[2]/2.2+p[1]*.08)[0]/255;c=mul([112,117,112],(.78+.36*light)*(.86+.28*grain));}break;}
        case 7:case 29:{const uv=faceUV(p,hit);c=mul((hit.material===29||Math.abs(norm[2])>.5)?sample('sign',uv[0]*.75,(54+202*uv[1])/256,false):[56,64,61],.85+.15*light);break;}
        case 8:case 17:case 18:case 19:{
          const uv=faceUV(p,hit).map(v=>clamp(v,.002,.998)),tile=hit.material===8?[0,1]:hit.material===17?[1,1]:hit.material===18?[0,0]:[1,0];
          const plain=Math.abs(norm[1])>.5||(hit.material===19&&Math.abs(norm[2])>.5);
          c=mul(plain?(hit.material===19?[97,102,102]:[79,82,79]):sample('facade',(uv[0]+tile[0])*.5,.5+(uv[1]+tile[1])*.25,false),.88+.20*light);break;
        }
        case 46:case 47:{
          const carriageZ=6+11*Math.floor((p[2]-6)/11+.5),u=clamp((p[2]-carriageZ)/10.7+.5,.002,.998),v=clamp((p[1]-1.66)/3.12+.5,.002,.998);
          c=mul(sample('facade',.5+.5*u,.5+.25*v,false),.88+.20*light);
          if(hit.material===47&&Math.abs(norm[0])>.5){const reflected=M.sub(labDirection,M.scale(norm,2*M.dot(labDirection,norm)));c=mix(c,sky(reflected,env),.08);}break;
        }
        case 16:{c=mul(sample('mountains',.002+.496*fract(p[0]/5),.002+.496*fract(p[2]/5),false),.80+.28*light);c=mix(c,[77,84,64],.10+.22*clamp((t-8)/40,0,1));break;}
        case 9:case 14:{const uv=Math.abs(norm[1])>.5?[p[0]/2.6,p[2]/2.6]:[p[2]/2.6,p[1]/2.6];c=mul(sample('stone',...uv),.88+.18*light);if(hit.material===9&&Math.abs(norm[1])>.5&&(near(p[2],.8,.02)||near(p[0],.75,.02)))c=mul(c,.75);break;}
        case 11:{const uv=faceUV(p,hit),border=Math.min(uv[0],1-uv[0],uv[1],1-uv[1])<.03||Math.abs(uv[0]-.5)<.02;c=mul(border?[52,57,57]:[74,82,82],.8+.3*light);break;}
        case 12:c=mul(sample('wall',p[0]/4,p[2]/4),env==='corridor'?.77:.70);break;
        case 13:c=[237,232,212];break;case 39:c=[247,201,122];break;
        case 15:c=[184,181,164];break;
        case 21:case 22:{const uv=faceUV(p,hit).map(v=>clamp(v,.001,.999)),species=hit.material===21?0:1;c=mul(sample('mountains',.5+species*.25+.25*uv[0],.5*uv[1],false),.82+.24*light);break;}
        case 23:{const grain=sample('stone',p[0]*.4+p[1]*.13,p[2]*.4+p[1]*.13)[0]/255;c=mul([87,92,89],(.75+.35*light)*(.84+.24*grain));if(near(p[2],4.2,.04))c=mul(c,.8);break;}
        case 24:case 28:{const uv=faceUV(p,hit),edge=Math.min(uv[0],1-uv[0],uv[1],1-uv[1])<.04;c=mul(hit.material===24?[110,115,107]:[79,87,84],(.8+.25*light)*(edge?.68:1));if(hit.material===24&&uv[0]>.18&&uv[0]<.82&&uv[1]>.15&&uv[1]<.36&&near(uv[1],.048,.009))c=mul(c,.55);if(hit.material===28&&uv[0]>.18&&uv[0]<.82&&uv[1]>.72&&uv[1]<.82)c=mul(c,.3);break;}
        case 25:case 26:{const reflected=M.sub(labDirection,M.scale(norm,2*M.dot(labDirection,norm))),reflection=sky(reflected,env),paint=[74,84,84],uv=faceUV(p,hit).map(v=>clamp(v,.002,.998));
          if(hit.material===26)c=mul(mix([31,43,46],reflection,.42),.78+.26*light);
          else if(hit.half[2]>1&&norm[2]<-.5)c=sample('facade',.5*uv[0],.5*uv[1],false);
          else if(hit.half[2]>1&&Math.abs(norm[0])>.5)c=mul(sample('facade',.5+.5*uv[0],.5*uv[1],false),.78+.25*light);
          else c=mix(mul(paint,.72+.35*light),reflection,.10);break;}
        case 27:{const q=p.map((v,i)=>(v-hit.center[i])/hit.half[i]),ring=Math.hypot(q[1],q[2]);c=mul(Math.abs(norm[0])>.5&&ring<.5?[102,105,99]:[27,28,27],.8+.25*light);break;}
        case 40:{const uv=faceUV(p,hit),paint=hit.center[0]<0?(hit.center[1]>3?[94,97,87]:[56,87,87]):(hit.center[1]>3?[74,87,92]:[122,69,51]);const tex=sample('harborMetal',clamp(uv[0],.002,.998),clamp(uv[1],.002,.998),false),lum=(.2126*tex[0]+.7152*tex[1]+.0722*tex[2])/255,edge=Math.min(uv[0],1-uv[0],uv[1],1-uv[1])<.025;c=mul(mix(tex,mul(paint,lum*2.2),.48),(.70+.35*light)*(edge?.70:1));break;}
        case 41:case 42:case 43:case 44:case 45:{const base=hit.material===41?[117,97,61]:hit.material===43?[140,94,36]:hit.material===44?[74,97,94]:[69,77,74],grain=sample('stone',p[0]*.33+p[1]*.1,p[2]*.33+p[1]*.1)[0]/255;c=mul(base,(.72+.38*light)*(.80+.25*grain));break;}
        case 30:{const bark=sample('wall',p[2]*.8+p[0]*.6,p[1]*.35)[0]/255;c=mul([64,54,43],(.67+.52*bark)*(.82+.18*light));break;}
        case 31:case 32:case 33:case 34:case 35:case 36:case 37:case 38:{
          let base=[77,51,38];
          if(hit.material>=32&&hit.material<=34){
            const half=M.objectHalf(env,state.shape),u=clamp(hit.restPoint[0]/half[0]*.5+.5,.003,.997),v=clamp(hit.restPoint[1]/half[1]*.5+.5,.003,.997);
            const surface=sample('crate',(Math.max(0,W.IDs.indexOf(env))+u)*.25,.5+.5*v,false);
            base=hit.material===34?mix(surface,[145,102,61],.35):surface;
          }else if(hit.material===35)base=[22,23,22];
          else if(hit.material===36||hit.material===38)base=[61,64,61];
          else if(hit.material===37)base=[97,64,31];
          c=mul(base,.75+.35*light);break;
        }
        case 4:
          if(hit.kind==='cube'){
            const half=M.objectHalf(env,state.shape),q=hit.restPoint.map((v,i)=>v/half[i]),nr=hit.restNormal;let uv;
            if(Math.abs(nr[2])>.5)uv=[q[0]*.5+.5,q[1]*.5+.5];else if(Math.abs(nr[0])>.5)uv=[-q[2]*.5+.5,q[1]*.5+.5];else uv=[q[0]*.5+.5,-q[2]*.5+.5];
            c=env==='harbor'?mul(sample('harborMetal',clamp(uv[0],.002,.998),clamp(uv[1],.002,.998),false),.76+.30*light):mul(sample('crate',(Math.max(0,W.IDs.indexOf(env))+clamp(uv[0],.003,.997))*.25,.5+.5*clamp(uv[1],.003,.997),false),.76+.30*light);if(Math.min(uv[0],1-uv[0],uv[1],1-uv[1])<.02)c=mul(c,.82);
          }else{
            const r=M.normalize(hit.restPoint),lon=Math.atan2(r[0],r[2]),lat=Math.asin(clamp(r[1],-1,1)),u=fract(1+lon/(2*Math.PI)),v=.5+lat/Math.PI;
            const patch=env==='station'?[.10+.80*u,.25+.60*v]:env==='street'?[.10+.30*u,.05+.30*v]:env==='corridor'?[.12+.20*u,.25+.45*v]:[.44+.12*u,.10+.80*v];
            const surface=sample('crate',(Math.min(3,Math.max(0,W.IDs.indexOf(env)))+patch[0])*.25,.5+.5*patch[1],false),seam=env==='station'&&Math.abs(Math.sin(lon*4))<.026;c=mul(surface,(.70+.38*light)*(seam?.88:1));
          }break;
        default:c=[130,135,130];
      }
      if(hit.body&&hit.bodyId==='B'&&hit.material===4)c=c.map((v,i)=>v*[.76,.88,1.08][i]);
      if(hit.body&&hit.material===4){
        const hitTime=state.time-((state.scenario==='flyby'&&!result.photo)?0:hit.distance),tau=M.properTime(hitTime,hit.velocity||result.velocity,hit.restPoint),ink=M.clockInk(hit.restPoint,hit.restNormal,M.objectHalf(env,state.shape),tau);
        if(ink===1)c=mul([63.75,68.85,66.3],.75+.25*light);
        else if(ink===2)c=mul([204,204,188.7],.74+.26*light);
        else if(ink===3)c=mul([28.05,35.7,35.7],.75+.25*light);
      }
      prepared?.cache?.saveMaterial(prepared.index,c);}
      let lightGain=1,visibility=1;
      if(state.shadows!==false){
        const info=prepared?.info||(result.kernels?O.shadingIllumination(state,result,key):state.softShadows?O.softIllumination(state,result):O.illumination(state,result));
        if(info.shadowed){lightGain=O.shadowFactor(info,env);visibility=info.sampleCount&&info.weightedDirect>0?info.weightedVisible/info.weightedDirect:0;}
      }
      let surfaceRadiance=null;
      if(hit.material!==13&&hit.material!==39){
        const rgb=c.map(v=>clamp(v/255,0,1)),view=M.scale(labDirection,-1),rough=state.roughnessScale||1;
        const spec=Surface.highlight(rgb,norm,key,view,hit.material,env,rough,visibility),profile=Surface.profile(hit.material,env);
        let reflected=[0,0,0];if(profile[1]>0){const direction=M.sub(labDirection,M.scale(norm,2*M.dot(labDirection,norm)));reflected=Surface.environment(rgb,sky(direction,env).map(v=>v/255),hit.material,env,rough);}
        surfaceRadiance=S.displayToRadiance(rgb).map((v,i)=>v+spec[i]+reflected[i]);
      }
      if(inspection){if(surfaceRadiance)c=S.radianceToDisplay(surfaceRadiance).map(v=>v*255);inspection.rgb=c.map(v=>clamp(v/255,0,1));return;}
      // In these branches the old path encoded linear radiance to sRGB, then
      // immediately decoded it for fog. Algebraically keep it in linear light;
      // retain the same SDR shoulder cap and the same physical shadow gain.
      // A spectral shift, exposure or moving-observer shift still uses the
      // original full conversion below, including the assumed spectrum LUT.
      const directLinear=surfaceRadiance&&(state.doppler!==true||(state.scenario==='flyby'&&!hit.body&&(state.exposure||0)===0&&lightGain===1));
      if(directLinear){
        const cap=.995/(1-.995),gain=state.doppler===true?1:lightGain;
        const raw=surfaceRadiance.map(v=>Math.min(cap,Math.max(0,v))*gain);
        const bg=env==='corridor'?[110,112,110]:base,fog=Surface.fog(t,env);
        return mix(raw,S.fogSkyRadiance(bg.map(v=>v/255)),fog);
      }
      if(surfaceRadiance)c=S.radianceToDisplay(surfaceRadiance).map(v=>v*255);
      const skyD=state.scenario==='observer'&&result.photo?M.stationarySourceDoppler(result.observerLabDirection||result.labDirection,result.observerVelocity):1;
      const factors=O.frequencyFactors(state,result),surfaceD=clamp(factors?.total||1,.1,10),outgoingD=clamp(factors?.outgoing||1,.1,10);
      if(state.doppler===true&&hit.body&&T&&state.materialSpectrum&&state.materialSpectrum!=='texture'&&state.surfaceMode==='reflection')c=T.shift(c.map(v=>v/255),state.materialSpectrum,state.spectrumModel||'rgb',state.temperature||6500,state.lineWavelength||656.3,surfaceD,outgoingD,state.exposure||0,lightGain).map(v=>v*255);
      else if(state.doppler===true&&hit.body&&(state.spectrumModel==='blackbody'||state.spectrumModel==='line'))c=S.sourceShift(c.map(v=>v/255),state.spectrumModel,state.temperature||6500,state.lineWavelength||656.3,surfaceD,state.exposure||0,lightGain).map(v=>v*255);
      else if(state.doppler===true)c=S.shift(c.map(v=>v/255),surfaceD,state.exposure||0,lightGain).map(v=>v*255);
      else if(lightGain<1)c=c.map(v=>{const x=Math.min(S.srgbToLinear(clamp(v/255,0,1)),.995),raw=x/(1-x)*lightGain;return 255*S.linearToSrgb(raw/(1+raw));});
      const bg=state.doppler===true?S.shift((env==='corridor'?[110,112,110]:base).map(v=>v/255),skyD,state.exposure||0).map(v=>v*255):(env==='corridor'?[110,112,110]:base);
      const fog=Surface.fog(t,env);
      return mix(S.displayToRadiance(c.map(v=>v/255)),S.fogSkyRadiance(bg.map(v=>v/255)),fog);
    }
    function beginRender(state,viewport,{previewBudget=0,region=null}={}){
      const rect=viewport||canvas.getBoundingClientRect(),budget=state.renderBudget||(state.playing&&state.shadows!==false?12000:19000),scale=Math.min(1,Math.sqrt(budget/Math.max(1,rect.width*rect.height))),w=Math.max(1,Math.round(rect.width*scale)),h=Math.max(1,Math.round(rect.height*scale));
      // A paused safe-mode frame starts at half width/height, then traces the
      // remaining pixels into the SAME final image. Preview rays are genuine
      // final-resolution rays and are reused, not regenerated or upscaled as
      // a substitute for detail. Neither phase is committed until complete.
      const start=region?Math.max(0,Math.min(h-1,Math.floor(region.start))):0,end=region?Math.max(start+1,Math.min(h,Math.floor(region.end))):h,regionHeight=end-start;
      const total=w*regionHeight,progressive=!region&&previewBudget>0&&total>previewBudget*1.5&&w>1&&h>1,pw=progressive?Math.ceil(w/2):w,ph=progressive?Math.ceil(h/2):regionHeight;
      const out=ctx.createImageData(w,regionHeight),data=out.data,preview=progressive?ctx.createImageData(pw,ph):null,times=M.shutterTimes(state.time,state.shutter||0);
      const buffer=!region?intermediate.begin(state,w,h):(intermediate.suspend(),null);
      // Only an already-computed matching ray buffer qualifies for the
      // responsive optical-update schedule. Never accelerate a cold scene,
      // camera preview or disabled cache merely because one was allocated.
      const reusesGeometry=!!(buffer&&buffer.filled()>0);
      const sampleStates=times.map(time=>({...state,time})),traces=sampleStates.map(sample=>prepareTrace(sample,w,h,staticRayCache,true,buffer)),frameTrace=traces[0];
      const shadeStates=sampleStates.map(s=>s.spectrumSplit?[{...s,doppler:false},{...s,doppler:true}]:[s,s]);
      const shadeSignatures=shadeStates.map(pair=>pair.map(shadingSignature));let index=0,phase=progressive?'preview':'final';
      function pixel(x,y){
        const pX=2*(x+.5)/w-1,pY=1-2*(y+.5)/h,vignette=clamp(1-.08*((pX*.65)**2+(pY*.65)**2),.86,1);
        if(times.length===1){
          const result=frameTrace(x+.5,y+.5),side=result.spectral?1:0,shadeState=shadeStates[0][side],reuse=buffer?.shadePreparation(result,shadeState,x+.5,y+.5),rgb=shade(result,shadeState,null,shadeSignatures[0][side],reuse),v=state.emissionMap&&result.hit&&(state.scenario==='observer'||result.photo)?1:vignette;
          return S.radianceToDisplayTone(rgb.map(c=>c*v),state.emissionMap?'reinhard':state.toneMap).map(c=>c*255);
        }
        const sum=[0,0,0];for(let sample=0;sample<times.length;sample++){
          const result=traces[sample](x+.5,y+.5),side=result.spectral?1:0,sampleState=shadeStates[sample][side],rgb=shade(result,sampleState,null,shadeSignatures[sample][side]),v=state.emissionMap&&result.hit&&(state.scenario==='observer'||result.photo)?1:vignette;
          for(let k=0;k<3;k++)sum[k]+=rgb[k]*v/times.length;
        }return S.radianceToDisplayTone(sum,state.emissionMap?'reinhard':state.toneMap).map(c=>c*255);
      }
      return {
        step(milliseconds=4){
          const deadline=performance.now()+milliseconds,endIndex=phase==='preview'?pw*ph:total;
          do{
            const end=Math.min(index+32,endIndex);
            while(index<end){
              const x=phase==='preview'?(index%pw)*2:index%w,y=phase==='preview'?Math.floor(index/pw)*2:start+Math.floor(index/w);
              if(phase!=='final'||!progressive||(x%2!==0||y%2!==0)){
                const rgb=pixel(x,y),i=((y-start)*w+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
                if(phase==='preview'){const j=index*4;preview.data[j]=data[i];preview.data[j+1]=data[i+1];preview.data[j+2]=data[i+2];preview.data[j+3]=255;}
              }index++;
            }
          }while(index<endIndex&&performance.now()<deadline);
          return index===endIndex;
        },
        result(){
          if(index!==(phase==='preview'?pw*ph:total))throw new Error('Cannot use an incomplete frame');
          return phase==='preview'?preview:out;
        },
        commit(){
          const image=phase==='preview'?preview:out,width=phase==='preview'?pw:w,height=phase==='preview'?ph:regionHeight;
          if(index!==(phase==='preview'?pw*ph:total))throw new Error('Cannot present an incomplete frame');
          if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}ctx.putImageData(image,0,0);
        },
        refine(){if(!progressive||phase!=='preview'||index!==pw*ph)throw new Error('Cannot refine an incomplete preview');phase='final';index=0;},
        progress(){return index/(phase==='preview'?pw*ph:total);},
        width:w,height:h,regionStart:start,regionHeight,previewWidth:pw,previewHeight:ph,progressive,
        get reusesGeometry(){return reusesGeometry&&!!buffer?.filled();},samples:times.length
      };
    }
    return {kind:'canvas',canvas,software:true,finish(){},programNames(){return [];},beginRender,staticCacheStats:()=>staticRayCache.stats(),
      intermediateCacheStats:()=>intermediate.stats(),clearIntermediateCache:()=>intermediate.clear(),
      presentCached(image,isCurrent=()=>true){if(!isCurrent())return false;if(canvas.width!==image.width||canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}ctx.drawImage(image,0,0);return true;},
      sampleSpectrum(state,u0,v0,width,height){
        const x=clamp(Math.floor(u0*width),0,width-1),y=clamp(Math.floor(v0*height),0,height-1),inspection={};
        const s={...state,emissionMap:false};shade(trace(s,x+.5,y+.5,width,height),s,inspection);
        return {...inspection,pixel:[x,y],width,height,method:'canvas'};
      },
      render(state,debug,viewport){const job=beginRender(state,viewport);while(!job.step(Infinity)){}job.commit();}
    };
  }

  function create(canvas,{onAsset=()=>{},onLost=()=>{},forceCanvas=false}={}){
    if(!forceCanvas){try{return makeWebGL(canvas,onAsset,onLost);}catch(error){console.warn('Relativity WebGL fallback:',error.message);canvas=replaceCanvas(canvas);}}
    else canvas=replaceCanvas(canvas);
    return makeCanvas(canvas,onAsset);
  }
  // A no-Worker/file:// fallback uses the same small, interruptible slices on
  // the UI thread rather than synchronously tracing an entire image.
  function createCooperative(canvas,{onAsset=()=>{},onFrame=()=>{},onProgress=()=>{},onReady=()=>{},onError=()=>{},onCameraCache=()=>{},acceptFrame=()=>true}={}){
    let renderer,adapter,active=null,timer=0,disposed=false;const remaining=new Set(['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal']);
    // A single/unknown core or data-saving mode retains the original yielding.
    const reuseDelay=fastStillAllowed(root.navigator)?8:12;
    renderer=create(canvas,{forceCanvas:true,onAsset(name,status){
      if(disposed)return;onAsset(name,status);remaining.delete(name);
      if(remaining.size===0){adapter.busy=false;onReady({kind:'canvas',reason:'main',programs:[]});}
    }});
    canvas=renderer.canvas;
    function startCache(state,revision){
      if(disposed||!root.RelativityCamera||state.playing||state.interacting)return;
      const C=root.RelativityCamera,split=state.view==='split'||state.shadowTiming==='split'||state.spectrumSplit,wide={...state,fov:C.overscan(state.fov),reuseIntermediate:false},rect=canvas.getBoundingClientRect();
      const states=split?[C.sideState(wide,0),C.sideState(wide,1)]:[wide],pixels=C.cacheBudget(state,split),viewport={width:rect.width,height:rect.height};
      const task={phase:'camera-cache',state,revision,wide,states,pixels,viewport,images:[],index:0,computeMs:0,slices:0,maxSliceMs:0};
      task.job=renderer.beginRender({...states[0],renderBudget:pixels},viewport);active=task;timer=setTimeout(run,160);
    }
    function run(){
      timer=0;if(!active||disposed)return;
      try{
        const task=active,started=performance.now(),done=task.job.step(4),duration=performance.now()-started;task.computeMs+=duration;task.slices++;task.maxSliceMs=Math.max(task.maxSliceMs,duration);
        if(done&&task.phase==='camera-cache'){
          task.images.push(task.job.result());task.index++;
          if(task.index<task.states.length){task.job=renderer.beginRender({...task.states[task.index],renderBudget:task.pixels},task.viewport);timer=setTimeout(run,12);}
          else{active=null;onCameraCache({revision:task.revision,environment:task.state.environment,time:task.state.time,yaw:task.state.yaw,pitch:task.state.pitch,fov:task.wide.fov,contentEpoch:task.state.contentEpoch,images:task.images,fullSides:task.images.length===2});}
        }else if(done){
          const isPreview=task.phase==='preview'&&task.job.progressive,info={revision:task.revision,environment:task.state.environment,time:task.state.time,yaw:task.state.yaw,pitch:task.state.pitch,fov:task.state.fov,playing:!!task.state.playing,interacting:!!task.state.interacting,interactionId:task.state.interactionId,contentEpoch:task.state.contentEpoch,staticCache:renderer.staticCacheStats(),intermediateCache:renderer.intermediateCacheStats(),elapsed:Math.round(performance.now()-task.start),computeMs:Math.round(task.computeMs),width:isPreview?task.job.previewWidth:task.job.width,height:isPreview?task.job.previewHeight:task.job.height};
          const accepted=acceptFrame(info);if(accepted){task.job.commit();canvas.dataset.computeMs=String(Math.round(task.computeMs));canvas.dataset.renderPixels=String(info.width*info.height);canvas.dataset.renderSlices=String(task.slices);canvas.dataset.maxSliceMs=String(Math.round(task.maxSliceMs*10)/10);}
          if(task.phase==='settle'&&accepted){
            onFrame({...info,preview:true,quality:'quick',progress:0});task.job=renderer.beginRender({...task.state,renderBudget:task.targetBudget},null,{previewBudget:task.previewBudget});task.phase='preview';task.lastProgress=-1;
            onProgress({revision:task.revision,phase:'canvas',progress:0,width:task.job.width,height:task.job.height,samples:task.job.samples});timer=setTimeout(run,12);
          }else if(isPreview&&accepted){
            const reused=task.job.previewWidth*task.job.previewHeight;task.job.refine();task.phase='canvas';task.lastProgress=-1;task.reused=reused;onFrame({...info,preview:true,quality:'preview',progress:0});
            onProgress({revision:task.revision,phase:'canvas',progress:Math.floor(20*reused/(task.job.width*task.job.height))*5,width:task.job.width,height:task.job.height,samples:task.job.samples});timer=setTimeout(run,task.job.reusesGeometry?reuseDelay:12);
          }else{active=null;adapter.busy=false;onFrame(accepted?info:{revision:task.revision,aborted:true});if(accepted&&!task.state.playing&&!task.state.interacting)startCache(task.state,task.revision);}
        }else{
          if(task.phase==='canvas'||task.phase==='preview'&&task.state.settleCamera){
            const total=task.job.width*task.job.height,reused=task.phase==='canvas'?task.reused:0,fraction=task.phase==='canvas'?(reused+(total-reused)*task.job.progress())/total:task.job.progress()*(task.job.progressive?task.job.previewWidth*task.job.previewHeight/total:1),progress=Math.min(95,Math.floor(fraction*20)*5);
            if(progress!==task.lastProgress){task.lastProgress=progress;onProgress({revision:task.revision,phase:'canvas',progress,width:task.job.width,height:task.job.height,samples:task.job.samples});}
          }
          // Main-thread fallback stays more conservative than a Worker;
          // only matching cached geometry gets a modestly shorter yield.
          timer=setTimeout(run,task.state.interacting||task.phase==='settle'?4:task.state.playing?6:task.job.reusesGeometry?reuseDelay:12);
        }
      }catch(error){active=null;adapter.busy=false;onError(error.message||error);}
    }
    adapter={kind:'canvas',async:true,worker:false,busy:true,canvas:renderer.canvas,
      presentCached(image,isCurrent){return renderer.presentCached(image,isCurrent);},
      clearIntermediateCache(){renderer.clearIntermediateCache();},
      requestSpectrum(state,u,v,width,height,callback){
        try{callback(null,renderer.sampleSpectrum(state,u,v,width,height));}catch(error){callback(error);}
      },
      render(state,revision){
        if(this.busy||disposed)return;if(active&&active.phase==='camera-cache'){if(timer)clearTimeout(timer);timer=0;active=null;}this.busy=true;
        this.interacting=!!state.interacting;const soft=state.shadows!==false&&state.softShadows===true,still=!state.playing&&!state.interacting,settle=still&&state.settleCamera,baseBudget=state.interacting?(state.shadows===false?18000:soft?6000:12000):state.playing?(state.shadows===false?10000:soft?3000:6000):soft?21000:30000,scaled=state.shutter>0?Math.max(2000,Math.round(baseBudget*.35)):baseBudget,previewBudget=still?scaled:Math.max(motionFloor(state),scaled);
        const targetBase=soft?84000:120000,targetBudget=still?(state.shutter>0?Math.round(targetBase*.35):targetBase):previewBudget,quickBase=soft?6000:8000,budget=settle?(state.shutter>0?Math.max(2000,Math.round(quickBase*.35)):quickBase):targetBudget;
        active={state,revision,phase:settle?'settle':'preview',targetBudget,previewBudget,start:performance.now(),computeMs:0,slices:0,maxSliceMs:0,job:renderer.beginRender({...state,renderBudget:budget,reuseIntermediate:state.reuseIntermediate!==false&&!settle},null,{previewBudget:still&&!settle?previewBudget:0})};timer=setTimeout(run,0);
      },
      cancel(){if(!active)return;if(timer)clearTimeout(timer);timer=0;const revision=active.revision,cache=active.phase==='camera-cache';active=null;this.busy=false;if(!cache)onFrame({revision,aborted:true});},
      visibility(visible){if(!visible)this.cancel();},
      dispose(){disposed=true;if(timer)clearTimeout(timer);timer=0;active=null;this.busy=false;}
    };
    return adapter;
  }
  // The worker renders into its own offscreen canvas and transfers only full
  // images. The visible canvas stays on the UI thread for an atomic revision
  // check immediately before presentation.
  function createWorker(canvas,{mode='safe',onAsset=()=>{},onFrame=()=>{},onProgress=()=>{},onReady=()=>{},onError=()=>{},onCameraCache=()=>{},acceptFrame=()=>true}={}){
    if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||
      root.__RELATIVITY_DISABLE_WORKER__||root.location.protocol==='file:')return null;
    const presenter=mode==='safe'?canvas.getContext('2d',{alpha:false,willReadFrequently:true}):(canvas.getContext('bitmaprenderer')||canvas.getContext('2d',{alpha:false}));
    if(!presenter)throw new Error('Image presentation unavailable');
    const worker=new Worker('relativity-render-worker.js?v=20261105-10');let disposed=false,spectrumSequence=0,spectrumCallback=null;canvas.dataset.renderLanes='1';
    function present(data){
      const image=data.image;
      if(!image)throw new Error('Background frame is missing its image');
      if(!acceptFrame(data)){if(image.close)image.close();return false;}
      if(canvas.width!==data.width||canvas.height!==data.height){canvas.width=data.width;canvas.height=data.height;}
      if(presenter.transferFromImageBitmap)presenter.transferFromImageBitmap(image);
      else{presenter.drawImage(image,0,0);if(image.close)image.close();}
      return true;
    }
    const adapter={kind:mode==='webgl'?'webgl':'canvas',async:true,worker:true,busy:true,initialized:false,cancelRequested:false,canvas,
      presentCached(image,isCurrent=()=>true){
        if(disposed||!isCurrent())return false;
        if(presenter.transferFromImageBitmap){
          if(typeof root.createImageBitmap!=='function')return false;
          // bitmaprenderer consumes its input; clone instead of consuming the
          // stored image, and recheck revision after asynchronous creation.
          return root.createImageBitmap(image).then(copy=>{
            if(disposed||!isCurrent()){if(copy.close)copy.close();return false;}
            if(canvas.width!==image.width||canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}
            presenter.transferFromImageBitmap(copy);return true;
          });
        }
        if(canvas.width!==image.width||canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}
        presenter.drawImage(image,0,0);return true;
      },
      clearIntermediateCache(){if(!disposed)worker.postMessage({type:'clear-intermediate'});},
      requestSpectrum(state,u,v,width,height,callback){
        if(disposed){callback(new Error('renderer disposed'));return;}
        const id=++spectrumSequence;spectrumCallback=callback;worker.postMessage({type:'inspect-spectrum',id,state,u,v,width,height});
      },
      render(state,revision){
        if(this.busy||disposed)return;
        this.busy=true;this.interacting=!!state.interacting;const rect=canvas.getBoundingClientRect();
        worker.postMessage({type:'render',state,revision,viewport:{width:rect.width,height:rect.height,dpr:root.devicePixelRatio||1}});
      },
      cancel(){if(!disposed&&this.initialized&&!this.cancelRequested){this.cancelRequested=!!this.busy;worker.postMessage({type:'cancel'});}},
      visibility(visible){if(!disposed)worker.postMessage({type:'visibility',visible});},
      dispose(){if(!disposed){disposed=true;worker.terminate();this.busy=false;}}
    };
    worker.onmessage=event=>{
      if(disposed){if(event.data&&event.data.image&&event.data.image.close)event.data.image.close();for(const image of event.data?.images||[])if(image.close)image.close();return;}const data=event.data||{};
      if(data.type==='asset'){canvas.dataset[data.name+'Loaded']=data.status;onAsset(data.name,data.status);}
      else if(data.type==='ready'){
        canvas.dataset.shaderPrograms=String(data.programs.length);canvas.dataset.preparedWorlds=data.programs.join(',');
        adapter.kind=data.kind;adapter.software=!!data.software;adapter.unknown=!!data.unknown;adapter.cacheIdentity=data.cacheIdentity||'';adapter.parallelCompile=!!data.parallelCompile;adapter.initialized=true;adapter.busy=false;onReady(data);
      }else if(data.type==='lanes'){canvas.dataset.renderLanes=String(data.count);
      }else if(data.type==='preview'){
        try{if(present(data)){canvas.dataset.renderPixels=String(data.budget);canvas.dataset.shaderPrograms=String(data.programs.length);canvas.dataset.preparedWorlds=data.programs.join(',');}}catch(error){adapter.busy=false;onError(error.message||error);return;}
        onFrame({...data,preview:true});
      }else if(data.type==='camera-cache'){
        try{onCameraCache(data);}finally{for(const image of data.images||[])if(image.close)image.close();}
      }else if(data.type==='progress'){
        onProgress(data);
      }else if(data.type==='spectrum-sample'){
        if(data.id===spectrumSequence&&spectrumCallback){const callback=spectrumCallback;spectrumCallback=null;callback(data.error?new Error(data.error):null,data.result);}
      }else if(data.type==='frame'){
        adapter.busy=false;adapter.cancelRequested=false;
        try{if(present(data)){canvas.dataset.lastRenderMs=String(data.elapsed);canvas.dataset.lastFrameLanes=String(data.lanes||1);canvas.dataset.computeMs=String(data.computeMs);canvas.dataset.renderPixels=String(data.budget);canvas.dataset.renderSlices=String(data.slices);canvas.dataset.maxSliceMs=String(data.maxSliceMs);
          canvas.dataset.shaderPrograms=String(data.programs.length);canvas.dataset.preparedWorlds=data.programs.join(',');if(data.adaptive){canvas.dataset.tileSize=String(data.adaptive.tile);canvas.dataset.dynamicBudget=String(data.adaptive.dynamic);}}}catch(error){onError(error.message||error);return;}
        onFrame(data);
      }else if(data.type==='aborted'){
        adapter.busy=false;adapter.cancelRequested=false;onFrame({...data,aborted:true});
      }else if(data.type==='error'){adapter.busy=false;onError(data.message);}
    };
    worker.onerror=event=>{if(!disposed){event.preventDefault();adapter.busy=false;onError(event.message||'Worker rendering failed');}};
    try{
      const cores=root.navigator?.hardwareConcurrency||0,memory=root.navigator?.deviceMemory||0;
      const parallelAllowed=!root.__RELATIVITY_DISABLE_PARALLEL__&&(root.__RELATIVITY_TEST_PARALLEL__===true||(cores>=2&&memory>=4&&!root.navigator?.connection?.saveData));
      const fastStill=fastStillAllowed(root.navigator);
      worker.postMessage({type:'init',textures:root.RelativityTextures,forceWebGL:mode==='webgl',parallelAllowed,fastStill,intermediateBudget:root.__RELATIVITY_INTERMEDIATE_BUDGET__??intermediateBudget(memory)});
    }
    catch(error){worker.terminate();throw error;}
    return adapter;
  }
  root.RelativityRenderer=Object.freeze({create,createWorker,createCooperative,createOffscreen:makeWebGL,createOffscreenAsync:(canvas,onAsset,onLost)=>makeWebGL(canvas,onAsset,onLost,{parallel:true}),createOffscreenCanvas:makeCanvas,createStaticRayCache,createIntermediateRayCache,intermediateBudget,fastStillAllowed,sampleTexture,assetNames,motionFloor,trace,traceReflection,prepareTrace,eventState,isPhoto,spectralAt,effectiveFov,HALF});
})(window);
