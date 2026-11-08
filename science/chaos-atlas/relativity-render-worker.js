/* Cooperative background renderer. One shared WebGL program handles all
 * worlds; no scenes are compiled speculatively. Canvas frames and paused
 * high-resolution WebGL frames are cancellable, yielding between small jobs. */
'use strict';
self.window=self;
let loadError=null;
try{
  importScripts('relativity-model.js?v=20261105-10','relativity-foliage-mask.js?v=20261105-10',
    'relativity-worlds.js?v=20261105-10','relativity-geometry-pack.js?v=20261105-10',
    'relativity-spectrum-data.js?v=20261105-10','relativity-spectrum.js?v=20261105-10','relativity-surface.js?v=20261105-10','relativity-measured-data.js?v=20261105-10','relativity-material-spectrum.js?v=20261105-10',
    'relativity-optics.js?v=20261105-10','relativity-scheduler.js?v=20261105-10','relativity-camera.js?v=20261105-10','relativity-renderer.js?v=20261105-10');
}catch(error){loadError=String(error&&error.message||error);}

const HD_BUDGET=2000000;
let renderer=null,canvas=null,active=null,chunkTimer=0,visible=true,broken=false,remaining=9,preference=null,scheduler=null,canvasMotionBudget=16000,canvasPlaybackBudget=16000,fastStill=false;
let lane=null,laneReady=false,laneDisabled=false,laneToken=0,laneTimer=0,laneTextures=null,probeRequest=null;
function sampleProbe(){
  if(!probeRequest||!renderer||active||broken)return;
  const q=probeRequest;probeRequest=null;
  try{postMessage({type:'spectrum-sample',id:q.id,result:renderer.sampleSpectrum(q.state,q.u,q.v,q.width,q.height)});}
  catch(error){postMessage({type:'spectrum-sample',id:q.id,error:String(error&&error.message||error)});}
}
// A dedicated worker can yield to its message queue between short ray batches
// without the browser's nested-timer clamp adding ~4ms of idle time per batch.
// Keep batches short and periodically yield through a timer even on two-core
// devices, so input and the compositor can run; avoid a 4–6 ms timer after
// every 4 ms batch. A generation invalidates stale callbacks on cancellation.
let motionGeneration=0,motionBurst=0;
const motionChannel=typeof MessageChannel==='function'?new MessageChannel():null;
if(motionChannel)motionChannel.port1.onmessage=event=>{if(event.data===motionGeneration)runChunk();};
function queueMotion(){if(motionChannel&&++motionBurst%4!==0)motionChannel.port2.postMessage(motionGeneration);else chunkTimer=setTimeout(runChunk,0);}
function reportFailure(error){
  if(broken)return;broken=true;if(chunkTimer)clearTimeout(chunkTimer);chunkTimer=0;if(laneTimer)clearTimeout(laneTimer);if(lane)lane.terminate();lane=null;laneReady=false;laneTextures=null;
  if(active&&active.job.cancel)active.job.cancel();for(const image of active?.images||[])if(image.close)image.close();active=null;
  postMessage({type:'error',message:String(error&&error.message||error)});
}
function rendererPreference(forceWebGL){
  // WebGL is opt-in because even a hardware driver can block the browser's
  // shared GPU service while compiling a shader.
  return forceWebGL?{kind:'webgl'}:{kind:'canvas',reason:'safe'};
}
function budget(state){
  const soft=state.shadows!==false&&state.softShadows===true,moving=state.playing||state.interacting;
  // The opt-in four-ray mode trades preview resolution for responsiveness;
  // the final WebGL target is still the full HD budget.
  if(renderer.kind==='canvas'){
    const base=state.interacting?Math.round(canvasMotionBudget*(state.shadows===false?1.5:soft?.5:1)):state.playing?Math.round(canvasPlaybackBudget*(state.shadows===false?1.5:soft?.5:1)):soft?35000:50000;
    const scaled=state.shutter>0?Math.max(2000,Math.round(base*.35)):base;
    return moving?Math.max(RelativityRenderer.motionFloor(state),scaled):scaled;
  }
  const base=moving?scheduler.dynamic():renderer.conservative?100000:200000;
  const shading=soft?Math.round(base*.60):base,scaled=state.shutter>0?Math.max(3000,Math.round(shading*.35)):shading;
  return moving?Math.max(RelativityRenderer.motionFloor(state),scaled):scaled;
}
function canvasStillBudget(state){
  const soft=state.shadows!==false&&state.softShadows===true,base=soft?140000:200000;
  return state.shutter>0?Math.round(base*.35):base;
}
// A matching, already-populated per-ray buffer makes optical updates much
// shorter; do not impose the cold-render 12 ms idle gap on every 4 ms slice.
// Still yield between slices so messages/cancellation remain responsive.
// Cold scenes, camera underlays, mirrors and shutter frames keep the old duty.
function stillDelay(task){return fastStill&&task.kind==='canvas'&&task.job?.reusesGeometry?4:12;}
function cancel(){
  motionGeneration++;
  if(!active)return;if(chunkTimer)clearTimeout(chunkTimer);chunkTimer=0;
  const task=active;active=null;if(task.parallel&&laneReady)lane.postMessage({type:'cancel'});if(task.job.cancel)task.job.cancel();
  for(const image of task.images||[])if(image.close)image.close();
  if(task.phase!=='camera-cache')postMessage({type:'aborted',revision:task.msg.revision});
}
function frame(msg,start,pixels,computeMs,slices=0,maxSliceMs=0,type='frame',quality=null,progress=100,lanes=1){
  // Transfer only complete images. The UI thread checks the revision *before*
  // displaying the bitmap, so a cancel racing the last tile cannot show stale pixels.
  const image=canvas.transferToImageBitmap();
  postMessage({type,revision:msg.revision,environment:msg.state.environment,
    time:msg.state.time,yaw:msg.state.yaw,pitch:msg.state.pitch,fov:msg.state.fov,playing:!!msg.state.playing,interacting:!!msg.state.interacting,interactionId:msg.state.interactionId,contentEpoch:msg.state.contentEpoch,elapsed:Math.round(performance.now()-start),computeMs:Math.round(computeMs),slices,maxSliceMs:Math.round(maxSliceMs*10)/10,
    budget:pixels,width:canvas.width,height:canvas.height,programs:renderer.programNames(),quality,progress,lanes,image,staticCache:renderer.staticCacheStats?renderer.staticCacheStats():null,intermediateCache:renderer.intermediateCacheStats?renderer.intermediateCacheStats():null,
    adaptive:scheduler?scheduler.snapshot():null},[image]);
}
function startCameraCache(msg){
  if(!visible||broken||msg.state.playing||msg.state.interacting)return;
  const C=RelativityCamera,split=msg.state.view==='split'||msg.state.shadowTiming==='split'||msg.state.spectrumSplit,wide={...msg.state,fov:C.overscan(msg.state.fov),reuseIntermediate:false};
  const states=split?[C.sideState(wide,0),C.sideState(wide,1)]:[wide],pixels=C.cacheBudget(msg.state,split);
  const task={kind:renderer.kind,phase:'camera-cache',msg,wide,states,pixels,images:[],index:0,computeMs:0,slices:0,maxSliceMs:0};
  task.job=renderer.kind==='canvas'?renderer.beginRender({...states[0],renderBudget:pixels},msg.viewport):renderer.beginTiles({...states[0],renderBudget:pixels},msg.viewport,scheduler.tile());
  active=task;chunkTimer=setTimeout(runChunk,160);
}
function qualityProgress(task){
  return Math.min(95,Math.floor(20*(task.completedWork+task.work*task.job.progress())/task.totalWork)*5);
}
function reportProgress(task,progress){
  if(progress===task.lastProgress)return;task.lastProgress=progress;
  postMessage({type:'progress',revision:task.msg.revision,progress,width:task.finalWidth,height:task.finalHeight,
    phase:task.kind==='canvas'?'canvas':task.phase,stageWidth:task.job.width,stageHeight:task.job.height,samples:task.job.samples});
}
function startQuality(previous,phase,budgetPixels,completedWork,totalWork,finalSize){
  const samples=phase==='high'&&previous.msg.state.antialias?4:1;
  const job=renderer.beginTiles({...previous.msg.state,renderBudget:budgetPixels},previous.msg.viewport,scheduler.tile(),{samples});
  const work=job.width*job.height*job.samples;
  active={kind:'webgl',phase,msg:previous.msg,start:previous.start,pixels:job.width*job.height,computeMs:previous.computeMs,
    slices:0,maxSliceMs:previous.maxSliceMs,lastProgress:-1,job,work,completedWork,totalWork,finalWidth:finalSize.width,finalHeight:finalSize.height};
  reportProgress(active,qualityProgress(active));chunkTimer=setTimeout(runChunk,scheduler.delay());
}
// Complete only after both row bands belong to the same revision and event.
// The helper never posts an independently displayable frame.
function assembleLanes(task){
  const band=task.band,w=task.job.width,h=task.job.height,split=task.job.regionHeight;
  if(!band||band.width!==w||band.height!==h||band.regionStart!==split||band.regionHeight!==h-split||band.data.byteLength!==w*(h-split)*4)throw new Error('Invalid parallel frame band');
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:true});
  ctx.putImageData(task.job.result(),0,0);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(band.data),w,h-split),0,split);
  task.computeMs=Math.max(task.computeMs,band.computeMs);task.slices+=band.slices;task.maxSliceMs=Math.max(task.maxSliceMs,band.maxSliceMs);task.lanesUsed=2;
}
function complete(task){
      if(task.phase==='camera-cache'){
        task.images.push(canvas.transferToImageBitmap());task.index++;
        if(task.index<task.states.length){
          const next={...task.states[task.index],renderBudget:task.pixels};
          task.job=task.kind==='canvas'?renderer.beginRender(next,task.msg.viewport):renderer.beginTiles(next,task.msg.viewport,scheduler.tile());chunkTimer=setTimeout(runChunk,12);
        }else{
          active=null;postMessage({type:'camera-cache',revision:task.msg.revision,environment:task.msg.state.environment,time:task.msg.state.time,yaw:task.msg.state.yaw,pitch:task.msg.state.pitch,fov:task.wide.fov,contentEpoch:task.msg.state.contentEpoch,images:task.images,fullSides:task.images.length===2},task.images);
        }
      }else if(task.kind==='canvas'&&task.phase==='settle'){
        // Resolve the released camera pose quickly, then improve that exact
        // event in the background instead of keeping an outdated view up.
        frame(task.msg,task.start,canvas.width*canvas.height,task.computeMs,task.slices,task.maxSliceMs,'preview','quick',0,task.lanesUsed||1);
        task.parallel=false;task.band=null;task.mainDone=false;task.lanesUsed=1;
        const preview=budget(task.msg.state),target=canvasStillBudget(task.msg.state);
        task.job=renderer.beginRender({...task.msg.state,renderBudget:target},task.msg.viewport,{previewBudget:preview});
        task.phase='preview';task.pixels=task.job.width*task.job.height;task.slices=0;task.lastProgress=-1;task.finalWidth=task.job.width;task.finalHeight=task.job.height;
        reportProgress(task,0);chunkTimer=setTimeout(runChunk,12);
      }else if(task.kind==='canvas'&&task.phase==='preview'&&task.job.progressive){
        // The complete quarter-resolution preview and the later detailed
        // frame share the exact same event and reused rays.
        frame(task.msg,task.start,canvas.width*canvas.height,task.computeMs,task.slices,task.maxSliceMs,'preview','preview',0);
        const reused=task.job.previewWidth*task.job.previewHeight;task.job.refine();task.phase='canvas';task.pixels=task.job.width*task.job.height;
        task.work=task.pixels-reused;task.completedWork=reused;task.totalWork=task.pixels;task.finalWidth=task.job.width;task.finalHeight=task.job.height;task.lastProgress=-1;
        reportProgress(task,qualityProgress(task));chunkTimer=setTimeout(runChunk,stillDelay(task));
      }else if(task.kind==='webgl'&&task.phase==='preview'&&!task.msg.state.playing&&!task.msg.state.interacting){
        // All quality levels are complete, matching observations. Intermediate
        // frames are only added when the measured preview predicts a long wait.
        frame(task.msg,task.start,task.pixels,task.computeMs,task.slices,task.maxSliceMs,'preview','preview',0);
        const finalSize=renderer.dimensions({...task.msg.state,renderBudget:HD_BUDGET},task.msg.viewport),finalPixels=finalSize.width*finalSize.height;
        const temporal=RelativityModel.shutterTimes(task.msg.state.time,task.msg.state.shutter||0).length;
        const samples=(task.msg.state.antialias?4:1)*temporal,previewMs=performance.now()-task.start;
        const plan=RelativityScheduler.plan(task.pixels,finalPixels,previewMs*(task.msg.state.antialias?4:1));
        const middleSize=plan?renderer.dimensions({...task.msg.state,renderBudget:plan.middle},task.msg.viewport):null;
        const middleWork=middleSize?middleSize.width*middleSize.height*temporal:0,totalWork=middleWork+finalPixels*samples;
        startQuality(task,middleSize?'middle':'high',middleSize?plan.middle:HD_BUDGET,0,totalWork,finalSize);
      }else if(task.kind==='webgl'&&task.phase==='middle'){
        const completed=task.completedWork+task.work,progress=Math.min(95,Math.floor(20*completed/task.totalWork)*5);
        frame(task.msg,task.start,task.pixels,task.computeMs,task.slices,task.maxSliceMs,'preview','intermediate',progress);
        startQuality(task,'high',HD_BUDGET,completed,task.totalWork,{width:task.finalWidth,height:task.finalHeight});
      }else{
        active=null;
        if(task.kind==='webgl'&&(task.msg.state.playing||task.msg.state.interacting))scheduler.observeDynamic(performance.now()-task.start);
        if(task.kind==='canvas'&&task.msg.state.interacting){
          const elapsed=Math.max(1,performance.now()-task.start),targetMs=task.lanesUsed===2?125:170,factor=Math.max(.65,Math.min(1.3,targetMs/elapsed));
          canvasMotionBudget=Math.max(10000,Math.min(24000,Math.round(canvasMotionBudget*(.7+.3*factor))));
        }else if(task.kind==='canvas'&&task.msg.state.playing){
          const elapsed=Math.max(1,performance.now()-task.start),factor=Math.max(.65,Math.min(1.25,320/elapsed));
          canvasPlaybackBudget=Math.max(6000,Math.min(16000,Math.round(canvasPlaybackBudget*(.7+.3*factor))));
        }
        frame(task.msg,task.start,task.pixels,task.computeMs,task.slices,task.maxSliceMs,'frame',null,100,task.lanesUsed||1);
        sampleProbe();
        if(!task.msg.state.playing&&!task.msg.state.interacting)startCameraCache(task.msg);
      }
}
// If the optional helper is unsupported or fails, restart the exact same
// observation on the original single renderer, rather than leaving a half frame.
function disableLane(){
  laneDisabled=true;laneReady=false;if(lane){lane.terminate();lane=null;}laneTextures=null;postMessage({type:'lanes',count:1});
  const task=active;if(!task||!task.parallel)return;
  if(chunkTimer)clearTimeout(chunkTimer);chunkTimer=0;motionGeneration++;
  task.parallel=false;task.band=null;task.mainDone=false;task.computeMs=0;task.slices=0;task.maxSliceMs=0;
  try{task.job=renderer.beginRender({...task.msg.state,renderBudget:task.target},task.msg.viewport);queueMotion();}
  catch(error){reportFailure(error);}
}
function scheduleLane(){
  if(laneDisabled||lane||!laneTextures||renderer?.kind!=='canvas'||typeof Worker!=='function')return;
  function attempt(){
    laneTimer=0;if(broken||laneDisabled)return;
    // Do not compete with the first frame, its refinement, or a camera cache.
    if(!visible||active){laneTimer=setTimeout(attempt,1500);return;}
    try{
      lane=new Worker('relativity-render-lane.js?v=20261105-10');
      lane.onerror=event=>{event.preventDefault();disableLane();};
      lane.onmessage=event=>{
        const data=event.data||{};if(laneDisabled||broken)return;
        if(data.type==='ready'){laneReady=true;laneTextures=null;postMessage({type:'lanes',count:2});}
        else if(data.type==='error')disableLane();
        else if(data.type==='done'){
          const task=active;if(!task||!task.parallel||task.laneToken!==data.token)return;
          task.band=data;
          if(task.mainDone)try{assembleLanes(task);complete(task);}catch(error){disableLane();}
        }
      };
      lane.postMessage({type:'init',textures:laneTextures});
    }catch(error){disableLane();}
  }
  laneTimer=setTimeout(attempt,1500);
}
function runChunk(){
  chunkTimer=0;if(!active||broken||!visible)return;
  try{
    const task=active,started=performance.now(),done=task.kind==='webgl'?task.job.step():task.job.step(4),duration=performance.now()-started;
    task.computeMs+=duration;task.slices++;task.maxSliceMs=Math.max(task.maxSliceMs,duration);
    if(task.kind==='webgl'){scheduler.observeTile(duration);task.job.setTileSize(scheduler.tile());}
    if(done){
      if(task.kind==='canvas'){
        if(task.parallel){task.mainDone=true;if(!task.band)return;assembleLanes(task);}
        else task.job.commit();
      }
      complete(task);
    }else{
      if(task.kind==='webgl'){
        if(task.phase!=='preview'&&task.phase!=='camera-cache')reportProgress(task,qualityProgress(task));
        chunkTimer=setTimeout(runChunk,scheduler.delay());
      }else{
        if(task.phase==='canvas')reportProgress(task,qualityProgress(task));
        else if(task.phase==='preview'&&task.msg.state.settleCamera){
          const fraction=task.job.progress()*(task.job.progressive?task.job.previewWidth*task.job.previewHeight/(task.job.width*task.job.height):1);
          reportProgress(task,Math.min(95,Math.floor(fraction*20)*5));
        }
        // Dynamic frames share a short, periodically yielding queue; still
        // refinement remains duty-limited and cancellable in the background.
        if(task.msg.state.interacting||task.msg.state.playing||task.phase==='settle')queueMotion();
        else chunkTimer=setTimeout(runChunk,stillDelay(task));
      }
    }
  }catch(error){if(active?.parallel)disableLane();else reportFailure(error);}
}
onmessage=event=>{
  const msg=event.data||{};if(broken)return;
  if(msg.type==='init'){
    if(loadError){reportFailure(loadError);return;}
    try{
      canvas=new OffscreenCanvas(1,1);canvas.dataset={};fastStill=!!msg.fastStill;self.__RELATIVITY_INTERMEDIATE_BUDGET__=msg.intermediateBudget;self.RelativityTextures=msg.textures;if(msg.parallelAllowed&&!msg.forceWebGL)laneTextures=msg.textures;
      if(typeof canvas.transferToImageBitmap!=='function')throw new Error('Offscreen image presentation unavailable');
      preference=rendererPreference(msg.forceWebGL);
      const factory=preference.kind==='canvas'?RelativityRenderer.createOffscreenCanvas:RelativityRenderer.createOffscreenAsync;
      renderer=factory(canvas,(name,status)=>{
        if(status==='error'){reportFailure('Cannot decode scene texture: '+name);return;}
        postMessage({type:'asset',name,status});
        if(--remaining===0){postMessage({type:'ready',kind:renderer.kind,reason:preference.reason,software:renderer.software,unknown:renderer.unknown,cacheIdentity:renderer.cacheIdentity,parallelCompile:renderer.parallelCompile,programs:renderer.programNames()});scheduleLane();}
      },()=>reportFailure('WebGL context lost'));
      function installed(next){renderer=next;if(renderer.kind==='webgl')scheduler=RelativityScheduler.create(renderer.conservative);self.RelativityTextures=null;}
      if(renderer&&typeof renderer.then==='function'){const pending=renderer;renderer=null;pending.then(installed,reportFailure);}
      else installed(renderer);
    }catch(error){reportFailure(error);}
  }else if(msg.type==='render'&&renderer&&visible){
    if(active&&active.phase==='camera-cache')cancel();
    try{
      const start=performance.now(),pixels=budget(msg.state);
      const still=!msg.state.playing&&!msg.state.interacting,settle=still&&msg.state.settleCamera;
      if(renderer.kind==='canvas'){
        const target=settle?Math.min(10000,budget({...msg.state,interacting:true})):still?canvasStillBudget(msg.state):pixels;
        const renderState={...msg.state,renderBudget:target,reuseIntermediate:msg.state.reuseIntermediate!==false&&!settle};
        let job=renderer.beginRender(renderState,msg.viewport,{previewBudget:still&&!settle?pixels:0});
        const parallel=laneReady&&(msg.state.interacting||settle)&&job.height>=4;
        if(parallel){
          const split=Math.max(1,Math.min(job.height-1,Math.round(job.height*.55))),height=job.height,token=++laneToken;
          job=renderer.beginRender(renderState,msg.viewport,{region:{start:0,end:split}});
          active={kind:'canvas',phase:settle?'settle':'preview',msg,start,target,pixels:still?job.width*height:pixels,computeMs:0,slices:0,maxSliceMs:0,job,parallel:true,laneToken:token,band:null,mainDone:false};
          lane.postMessage({type:'render',token,state:renderState,viewport:msg.viewport,region:{start:split,end:height}});
        }else active={kind:'canvas',phase:settle?'settle':'preview',msg,start,target,pixels:still?job.width*job.height:pixels,computeMs:0,slices:0,maxSliceMs:0,job,parallel:false};
        runChunk();
      }else{
        // The preview and dynamic frames are tiled too: a single large GPU
        // draw can still hold up the browser even if it was issued in a Worker.
        const webglPixels=settle?budget({...msg.state,interacting:true}):pixels;
        const job=renderer.beginTiles({...msg.state,renderBudget:webglPixels},msg.viewport,scheduler.tile());
        active={kind:'webgl',phase:'preview',msg,start,pixels:job.width*job.height,computeMs:0,slices:0,maxSliceMs:0,lastProgress:-1,job};
        runChunk();
      }
    }catch(error){reportFailure(error);}
  }else if(msg.type==='clear-intermediate'){renderer?.clearIntermediateCache?.();}
  else if(msg.type==='inspect-spectrum'){
    probeRequest=msg;if(active?.phase==='camera-cache')cancel();sampleProbe();
  }else if(msg.type==='cancel'){cancel();sampleProbe();}
  else if(msg.type==='visibility'){visible=!!msg.visible;if(!visible)cancel();else sampleProbe();}
};
