(async function () {
  'use strict';
  await window.RelativityTextureReady;
  const C=window.RelativityCamera,F=window.RelativityFrameCache,M=window.RelativityModel,R=window.RelativityRenderer,W=window.RelativityWorlds,O=window.RelativityOptics,S=window.RelativitySpectrum,ProbeSpectrum=window.RelativityProbeSpectrum,LightPath=window.RelativityLightPath,V=window.RelativityObservables,Space=window.RelativityRaySpace,Spacetime=window.RelativitySpacetime,Slice=window.RelativitySpacetimeSlice,Overlays=window.RelativityOverlays,Experiments=window.RelativityExperiments,$=id=>document.getElementById(id);
  const stage=$('relativity-stage'),workbench=$('workbench'),plot=$('ray-plot'),plotCtx=plot.getContext('2d');
  const spaceDialog=$('ray-space-dialog'),spaceCanvas=$('ray-space-canvas');
  let spaceView={yaw:-.7,pitch:.55,zoom:1.25},spaceModel=null,spaceDrag=null,pathContext=null,pathPlaying=false,pathFrame=0,pathLast=0;
  const cameraPreview=C.createPreview(stage,$('camera-preview'),$('geometry-contour'));let drawnFrame=null;
  const state={...Experiments.BASE,playing:false};
  const spacetimeCanvas=$('spacetime-canvas'),sliceCanvas=$('slice-canvas');let sliceCache=null,sliceModel=null,diagram='space',drawnState=null,drawnMarker=null,markerPoint=M.materialAnchor(state.environment,state.shape),markerCustom=false,pendingTimeAnchors=null,spaceAwaitingFrame=false,timelineNotice='';
  let renderMode=window.__RELATIVITY_FORCE_WORKER_WEBGL__===true?'webgl':'safe',renderWarning='';
  let renderer,dirty=true,frame=0,playbackAnchor=null,lastPaint=0,lastHud=0,paintCount=0,revision=0,drawnRevision=-1,drawnTime=0,probe=null,reference=null,pendingProbe=null,pendingRestore=null,drag=null,displayWidth=0,displayHeight=0,contentEpoch=0,drawnContentEpoch=-1,interactionId=0,settleCamera=false,spectrumKey='';
  let probeSpectrum=null,probeSpectrumSeq=0,probeRefreshRevision=-1;
  const cacheBudget=F.budgets(navigator.deviceMemory),stillFrames=F.create({maxBytes:cacheBudget.bytes,maxEntries:cacheBudget.entries,release(image){if(image?.close)image.close();else if(image){image.width=1;image.height=1;}}});
  let stillCacheEnabled=true,stillCacheError='',cacheRestore=null,cacheRestores=0,cacheIndicatorTimer=0;
  let physicalTimes=[],physicalMode='';
  // Camera input can arrive much faster than a low-end compositor can blend
  // the detailed, wide and current-ray preview layers. Coalesce only those
  // temporary reprojections; real ray frames and their pixel budget are
  // unchanged, and preview updates do not add to the physical FPS.
  let dragPreviewTimer=0,dragPreviewLast=0,dragPreviewTarget=null;
  let slowPreview=((navigator.hardwareConcurrency||0)>0&&(navigator.hardwareConcurrency||0)<=2)||((navigator.deviceMemory||0)>0&&(navigator.deviceMemory||0)<=4);
  function cancelDragPreview(resetClock=false){
    if(dragPreviewTimer)clearTimeout(dragPreviewTimer);
    dragPreviewTimer=0;dragPreviewTarget=null;if(resetClock)dragPreviewLast=0;
  }
  function previewInterval(){
    // Retain a fast path on capable devices, and back off if measured real
    // frames reveal an overloaded compositor. Hysteresis avoids oscillation.
    const fps=Number(stage.dataset.physicalFps);
    if(fps>0&&fps<9)slowPreview=true;else if(fps>=15)slowPreview=false;
    return slowPreview?200:40;
  }
  function queueDragPreview(){
    dragPreviewTarget={pose:{yaw:state.yaw,pitch:state.pitch,fov:state.fov},interactionId:drag.id,epoch:contentEpoch};
    const apply=()=>{
      dragPreviewTimer=0;const next=dragPreviewTarget;dragPreviewTarget=null;
      if(!next||!drag?.moved||drag.id!==next.interactionId||contentEpoch!==next.epoch||!cameraPreview.active)return;
      dragPreviewLast=performance.now();cameraPreview.update(next.pose);
    };
    const wait=Math.max(0,previewInterval()-(performance.now()-dragPreviewLast));
    if(!wait){if(dragPreviewTimer)clearTimeout(dragPreviewTimer);apply();}
    else if(!dragPreviewTimer)dragPreviewTimer=setTimeout(apply,wait);
  }
  function clearPhysicalFps(){physicalTimes=[];physicalMode='';stage.dataset.physicalFps='';$('physical-fps').textContent='物理帧率：暂停';}
  function recordPhysicalFrame(info){
    const mode=info.playing&&state.playing?'播放':info.interacting&&drag?.moved?'拖动':'';
    if(!mode||info.preview){if(!state.playing&&!drag?.moved&&!info.preview)clearPhysicalFps();return;}
    const now=performance.now();if(physicalMode!==mode||physicalTimes.length&&now-physicalTimes[physicalTimes.length-1]>5000)physicalTimes=[];
    physicalMode=mode;physicalTimes.push(now);while(physicalTimes.length>2&&now-physicalTimes[0]>5000)physicalTimes.shift();
    const fps=physicalTimes.length>1?(physicalTimes.length-1)*1000/(now-physicalTimes[0]):null;
    stage.dataset.physicalFps=fps===null?'':fps.toFixed(2);
    $('physical-fps').textContent='物理帧率：'+(fps===null?'测量中':fps.toFixed(1)+' 帧/秒')+'（'+mode+'；不含重投影）';
  }
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const finite=(v,d=2)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
  const speedText=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toFixed(2);
  const deg=x=>finite(x*180/Math.PI,1)+'°';
  const angle=v=>Math.acos(clamp(M.dot(v,M.motionAxis(state.scenario,state.motionAngle,state.motionElevation)),-1,1));
  const nameOf=kind=>({cube:state.shape==='artifact'?({station:'旅行箱表面',street:'纸箱表面',corridor:'设备外壳',mountain:'木箱表面',harbor:'货箱表面'})[state.environment]:'方块表面',sphere:'球体表面',floor:state.environment==='station'?'站台地面':state.environment==='corridor'?'长廊地面':'道路表面',frame:state.environment==='station'?'车站框架':'长廊框架',pedestal:'静止基座',wall:state.environment==='corridor'?'长廊墙面':'站台墙面',rail:'栏杆',bench:'站台座椅','bench-leg':'座椅支撑',sign:'车站标识',building:'城市建筑','building-brick':'砖砌建筑','building-glass':'玻璃建筑',train:'静止列车车身','train-roof':'列车立体车顶','train-trim':'列车门框','train-door':'列车车门','train-window':'列车窗面（不透明近似）',terrain:'山坡地表',sidewalk:'人行道',pole:'立柱',door:'长廊门',ceiling:'天花板',light:'装饰灯具','key-light':'可移动主灯',parapet:'公路护栏基座',marker:'公路标识','tree-conifer':'针叶树冠','tree-deciduous':'行道树冠',trunk:'树干',pipe:'管线',cabinet:'设备柜','car-body':'停放车辆','car-window':'车窗',tire:'轮胎',bin:'站台垃圾桶','platform-panel':'站台信息牌','luggage-handle':'旅行箱提手','parcel-tape':'纸箱胶带','equipment-vent':'设备通风片','crate-frame':'木箱框条','luggage-wheel':'旅行箱滚轮','luggage-rail':'旅行箱拉杆','equipment-switch':'设备开关','equipment-foot':'设备支脚','cargo-container':'集装箱','gantry':'龙门吊','cargo-rail':'货箱锁杆','cargo-moving-rail':'运动货箱框条','forklift':'叉车','drum':'货场油桶','mirror-panel':'理想镜板','mirror-frame':'镜面边框与支架','moving-B':'运动物体 B'})[kind]||'远景天空';
  function schedule(){if(!frame)frame=requestAnimationFrame(tick);}
  function renderName(){return renderer.kind==='webgl'?'WebGL'+(renderer.software?'（软件图形）':renderer.unknown?'（图形设备未识别）':''):'Canvas';}
  function stillContext(){
    if(!renderer?.canvas)return null;const rect=renderer.canvas.getBoundingClientRect();
    if(!(rect.width>0&&rect.height>0))return null;
    return {width:rect.width,height:rect.height,dpr:window.devicePixelRatio||1,mode:renderMode,kind:renderer.kind,worker:!!renderer.worker,software:!!renderer.software,unknown:!!renderer.unknown,identity:renderer.cacheIdentity||''};
  }
  const cacheListItems=new Map();
  function cacheCompatible(entry,context){
    try{return !!context&&stillFrames.has(entry)&&stillFrames.key(entry.parameters,context)===entry.key;}catch(_){return false;}
  }
  function selectCachedFrame(entry){
    const context=stillContext();if(!stillCacheEnabled||!cacheCompatible(entry,context))return;
    pause();Object.assign(state,entry.parameters);resetMaterialPoint();clearProbe();pendingRestore=null;pendingTimeAnchors=null;
    // The normal exact-key restore path still owns revision checks and bitmap
    // presentation; a thumbnail never becomes an approximate physical frame.
    settleCamera=false;changed();
  }
  function renderStillCacheList(context){
    const list=$('still-cache-list'),entries=stillFrames.list(),keys=new Set(entries.map(entry=>entry.key));
    for(const [key,item] of cacheListItems)if(!keys.has(key)){item.row.remove();cacheListItems.delete(key);}
    const count=entries.length+' 张';if($('still-cache-count').textContent!==count)$('still-cache-count').textContent=count;
    if($('still-cache-empty').hidden!==(entries.length>0))$('still-cache-empty').hidden=entries.length>0;
    let current='';try{if(context&&!state.playing&&!drag?.moved)current=stillFrames.key(state,context);}catch(_){}
    const focused=document.activeElement;let reordered=false;
    entries.forEach((entry,index)=>{
      let item=cacheListItems.get(entry.key);
      if(!item||item.entry!==entry){
        if(item)item.row.remove();const row=document.createElement('div'),button=document.createElement('button'),text=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');
        row.setAttribute('role','listitem');button.type='button';button.className='cache-gallery-item';entry.image.setAttribute('aria-hidden','true');
        text.append(title,detail);button.append(entry.image,text);row.append(button);item={entry,row,button,title,detail};cacheListItems.set(entry.key,item);
        button.addEventListener('click',()=>selectCachedFrame(entry));
      }
      const p=entry.parameters,compatible=stillCacheEnabled&&cacheCompatible(entry,context),view=p.spectrumSplit?'光谱左右对照':p.shadowTiming==='split'?'阴影左右对照':p.view==='split'?'双视图':p.view==='geometry'?'同时几何':'光锥照片';
      const label=(W.labels[p.environment]||p.environment)+' · '+(p.scenario==='observer'?'高速观察者':'运动物体')+' · '+view;
      const shape=p.shape==='sphere'?'球体':p.shape==='cube'?'方块':'场景物件',spectral=p.spectrumSplit?'光谱对照':'光谱'+(p.doppler?'开':'关'),shadow=!p.shadows?'阴影关':p.softShadows?'软影 '+p.shadowSamples+' 条':'硬影';
      const detail=shape+' · t '+finite(p.time,2)+' · β '+speedText(p.beta)+' · 水平 '+deg(p.yaw)+' / 俯仰 '+deg(p.pitch)+' · 视场 '+finite(p.fov,0)+'° · '+spectral+' / '+shadow+(p.sceneMirror?' · 场景镜':'')+(p.shutter>0?' · 快门 '+finite(p.shutter,1):'');
      const detailText=detail+(compatible?'':' · 视窗或渲染模式不同'),pressed=String(compatible&&entry.key===current),aria=label+'，'+detail+(compatible?'，恢复此完整画面':'，视窗或渲染模式不同，暂不可恢复');
      // The status updates while playing; avoid unnecessary gallery DOM writes
      // and layout invalidations when its content has not actually changed.
      if(item.title.textContent!==label)item.title.textContent=label;
      if(item.detail.textContent!==detailText)item.detail.textContent=detailText;
      if(item.button.disabled===compatible)item.button.disabled=!compatible;
      if(item.button.getAttribute('aria-pressed')!==pressed)item.button.setAttribute('aria-pressed',pressed);
      if(item.button.getAttribute('aria-label')!==aria)item.button.setAttribute('aria-label',aria);
      if(list.children[index]!==item.row){list.insertBefore(item.row,list.children[index]||null);reordered=true;}
    });
    if(reordered&&focused?.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});
  }
  function updateStillCache(){
    const stats=stillFrames.stats(),context=stillContext();let previous=null;
    if(stillCacheEnabled&&context&&!state.playing&&!drag?.moved)previous=stillFrames.previous(state,context);
    stage.dataset.stillCacheEntries=String(stats.entries);stage.dataset.stillCacheBytes=String(stats.bytes);stage.dataset.stillCacheRestores=String(cacheRestores);
    $('toggle-still-cache').setAttribute('aria-pressed',String(stillCacheEnabled));$('toggle-still-cache').textContent='清晰帧缓存：'+(stillCacheEnabled?'开':'关');
    $('clear-still-cache').disabled=!stats.entries;$('previous-cached-view').disabled=!previous||!!state.playing||!!drag?.moved;
    const status=stillCacheError||(!stillCacheEnabled?'缓存已关闭；再次打开后从当前完整静帧开始。':
      '已保存 '+stats.entries+' / '+stats.maxEntries+' 张 · 约 '+(stats.bytes/1048576).toFixed(1)+' / '+(stats.maxBytes/1048576).toFixed(0)+' MiB · 仅本页内存');
    if($('still-cache-status').textContent!==status)$('still-cache-status').textContent=status;
    renderStillCacheList(context);
  }
  function rememberStill(info){
    if(!stillCacheEnabled||!renderer||!info||info.preview||info.cached||info.playing||info.interacting||state.playing||drag?.moved)return;
    const context=stillContext(),canvas=renderer.canvas;
    // Early placeholder textures are never valid completed scene frames.
    if(!context||!assetNames.every(name=>canvas.dataset[name+'Loaded']==='true')||!(canvas.width>0&&canvas.height>0))return;
    try{
      const started=performance.now(),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
      const x=copy.getContext('2d',{alpha:false});if(!x)throw new Error('canvas copy unavailable');x.drawImage(canvas,0,0);
      const record={environment:info.environment,time:info.time,yaw:info.yaw??state.yaw,pitch:info.pitch??state.pitch,fov:info.fov??state.fov,width:copy.width,height:copy.height};
      stillFrames.put(state,context,copy,record);stage.dataset.stillCacheCaptureMs=finite(performance.now()-started,2);stillCacheError='';updateStillCache();
    }catch(error){
      // A failed optional copy never breaks the actual renderer.
      stillFrames.clear();stillCacheEnabled=false;stillCacheError='当前浏览器无法保存清晰帧，已关闭缓存；原渲染继续。';updateStillCache();
    }
  }
  function tryRestoreStill(){
    if(!stillCacheEnabled||state.playing||drag?.moved||!renderer?.presentCached||!assetNames.every(name=>renderer.canvas.dataset[name+'Loaded']==='true'))return false;
    const context=stillContext();if(!context)return false;const entry=stillFrames.get(state,context);if(!entry){stage.dataset.stillCacheLookup='miss';return false;}
    const target=renderer,token={revision,entry},valid=()=>{
      const now=stillContext();return !document.hidden&&renderer===target&&revision===token.revision&&!state.playing&&!drag?.moved&&stillCacheEnabled&&stillFrames.has(entry)&&!!now&&stillFrames.key(state,now)===entry.key;
    };
    stage.dataset.stillCacheLookup='restoring';dirty=false;settleCamera=false;cacheRestore=token;
    function done(ok){
      if(cacheRestore===token)cacheRestore=null;
      if(!valid())return;
      if(!ok){stillFrames.delete(entry);stage.dataset.stillCacheLookup='error';dirty=true;updateStillCache();schedule();return;}
      cacheRestores++;stage.dataset.stillCacheLookup='hit';stage.dataset.stillCacheHit='true';
      const notice=$('cache-indicator');if(cacheIndicatorTimer)clearTimeout(cacheIndicatorTimer);
      notice.textContent=stage.dataset.stillCacheSnap==='true'?'已吸附至缓存视角 · 清晰帧':'已恢复已缓存的清晰帧';notice.hidden=false;
      cacheIndicatorTimer=setTimeout(()=>{notice.hidden=true;cacheIndicatorTimer=0;},2500);
      target.canvas.dataset.renderPixels=String(entry.image.width*entry.image.height);
      completeFrame({...entry.info,revision:token.revision,contentEpoch,playing:false,interacting:false,cached:true});
      if(stillFrames.has(entry)&&entry.wide&&!cameraPreview.active)cameraPreview.remember(entry.wide.images,{...entry.wide.info,revision:token.revision,contentEpoch},state,entry.wide.fullSides);
      updateStillCache();
    }
    try{
      const result=target.presentCached(entry.image,valid);
      if(result&&typeof result.then==='function')result.then(done,()=>done(false));else done(result);
    }catch(_){done(false);}
    return true;
  }
  function markDirty({camera=false,lightweight=false,snapped=false,optical=false}={}){
    const motionOnly=camera&&lightweight&&!!drag?.moved;
    if(!motionOnly)cancelDragPreview();
    if(!camera){contentEpoch++;cameraPreview.invalidate();}
    revision++;cacheRestore=null;if(cacheIndicatorTimer)clearTimeout(cacheIndicatorTimer);cacheIndicatorTimer=0;$('cache-indicator').hidden=true;
    stage.dataset.stillCacheHit='false';stage.dataset.stillCacheSnap=String(!!snapped);if(probe){probeSpectrum=null;probeSpectrumSeq++;probeRefreshRevision=-1;stage.dataset.spectrumSample='pending';spectrumKey='';updateSpectrum();}
    if(pendingTimeAnchors&&pendingTimeAnchors.revision!==revision){
      if(pendingTimeAnchors.data.current||pendingTimeAnchors.data.reference)timelineNotice='参数或视窗已变化，A/B 重采样已取消；请重新采样。';
      pendingTimeAnchors=null;
    }
    // The first camera move has already invalidated all measurements. Avoid
    // rewriting the whole workbench for every subsequent pointer position.
    if(!motionOnly){
      $('material-photo-marker').hidden=true;$('material-geometry-marker').hidden=true;stage.dataset.markerStatus='pending';stage.dataset.clockStatus='pending';
      $('material-status').textContent=camera?'视角预览中；等待匹配的光线帧。':'正在计算与当前参数匹配的事件…';
      $('clock-observation').textContent='等待匹配画面';$('clock-now').textContent='等待匹配画面';$('clock-seen').textContent='等待匹配画面';$('clock-emission').textContent='—';$('material-sim').textContent='—';$('material-emit').textContent='—';
    }
    if(pendingRestore&&pendingRestore.revision!==revision){pendingRestore=null;$('snapshot-status').textContent='参数已再次更改，取消恢复采样位置。';}
    dirty=true;if(stage.dataset.renderPending!=='true')stage.dataset.renderPending='true';
    if(stage.dataset.qualityPending!=='false')stage.dataset.qualityPending='false';if(!$('scene-quality').hidden)$('scene-quality').hidden=true;
    // Camera-only moves may keep the last completed camera frame visible,
    // but an unrelated parameter change must never expose an old physical
    // event as the new one. Probes are queued until the requested revision.
    let keepCamera=camera&&drawnContentEpoch===contentEpoch&&stage.dataset.status==='ready'&&!!drawnFrame;
    if(keepCamera){
      if(!cameraPreview.active)keepCamera=cameraPreview.begin(renderer.canvas,drawnFrame,state);
      else if(motionOnly)queueDragPreview();else cameraPreview.update(state);
    }
    settleCamera=!!(keepCamera&&!(drag&&drag.moved));if(stage.dataset.viewPending!==String(keepCamera))stage.dataset.viewPending=String(keepCamera);
    if(stage.dataset.status==='ready'){
      const message=keepCamera?'近似视角预览 · 松手后重新光追':optical?'正在更新光谱 / 阴影画面，可继续操作…':'正在生成新画面，可继续操作…';
      if($('scene-preparing').hidden)$('scene-preparing').hidden=false;if($('scene-preparing').textContent!==message)$('scene-preparing').textContent=message;
    }
    if(renderer&&displayWidth&&displayHeight){
      const next=keepCamera?'视角更新中':state.playing||drag&&drag.moved?'动态画面生成中（将降低分辨率）':optical?'光学画面更新中':'新画面生成中';
      const text='当前：'+renderName()+' · '+displayWidth+' × '+displayHeight+' 像素 · '+next;if($('render-detail').textContent!==text)$('render-detail').textContent=text;
    }
    // Let one short drag frame finish; only camera changes in this exact
    // interaction may display it. All physical changes cancel immediately.
    if(renderer&&renderer.cancel&&!(keepCamera&&drag&&drag.moved&&renderer.interacting))renderer.cancel();
    if(spaceDialog.open)updateSpace();schedule();
  }
  function canPresentFrame(info){
    if(info.revision===revision)return true;
    return !!(drag&&drag.moved&&info.interacting&&info.interactionId===drag.id&&info.contentEpoch===contentEpoch&&stage.dataset.viewPending==='true'&&info.revision>drawnRevision);
  }
  function completeFrame(info){
    const current=info.revision===revision,dragFrame=!current&&canPresentFrame(info);
    if(!info.aborted&&(current||dragFrame)){
      // The tiny released-pose frame verifies the camera quickly, but replacing
      // a detailed same-event reprojection with it makes the view needlessly
      // blurry. Keep the clearly labeled approximation until the larger real
      // preview arrives; sampling and snapshots remain queued meanwhile.
      const holdQuick=!!(current&&cameraPreview.active&&!(drag&&drag.moved)&&info.preview&&info.quality==='quick');
      drawnRevision=info.revision;drawnContentEpoch=info.contentEpoch??contentEpoch;drawnTime=info.time;drawnFrame={...info,contentEpoch:drawnContentEpoch};
      stage.dataset.renderPending=String(!current||holdQuick);if(current&&!holdQuick)stage.dataset.viewPending='false';stage.dataset.status='ready';stage.dataset.frame=String(++paintCount);stage.dataset.drawnEnvironment=info.environment;stage.dataset.drawnTime=finite(info.time,6);
      stage.dataset.drawnYaw=finite(info.yaw??state.yaw,5);stage.dataset.drawnPitch=finite(info.pitch??state.pitch,5);
      stage.dataset.qualityPending=String(!!info.preview);stage.dataset.quality=info.preview?(info.quality||'preview'):state.playing||drag&&drag.moved?'dynamic':'final';
      stage.dataset.qualityProgress=info.preview?String(info.progress||0):'100';
      recordPhysicalFrame(info);
      if(info.staticCache){stage.dataset.staticCacheHits=String(info.staticCache.hits);stage.dataset.staticCacheMisses=String(info.staticCache.misses);stage.dataset.staticShadowHits=String(info.staticCache.shadowHits||0);stage.dataset.staticShadowMisses=String(info.staticCache.shadowMisses||0);}
      if(info.intermediateCache&&!info.preview){const c=info.intermediateCache;Object.assign(stage.dataset,{intermediateActive:String(c.active),intermediateBytes:String(c.bytes),intermediateLimit:String(c.maxBytes),intermediateStride:String(c.stride),intermediateGeometryHits:String(c.geometryHits),intermediateMaterialHits:String(c.materialHits),intermediateShadowHits:String(c.shadowHits)});}
      $('scene-loading').hidden=true;if(current){$('scene-preparing').hidden=!(cameraPreview.active&&(holdQuick||drag&&drag.moved));if(holdQuick)$('scene-preparing').textContent='近似视角预览 · 真实画面细化中';}
      // A lagging drag frame is a real earlier camera sample from this same
      // interaction. Diagrams use its camera, never the newest unrendered pose.
      const drawn={...state,yaw:info.yaw??state.yaw,pitch:info.pitch??state.pitch,fov:info.fov??state.fov,time:info.time},contour=drawn.contour&&drawn.scenario==='flyby'&&drawn.view!=='geometry';drawnState=drawn;
      $('geometry-contour').hidden=!contour&&!drawn.velocityArrow;
      if(contour||drawn.velocityArrow){const rect=stage.getBoundingClientRect();stage.dataset.contourPolygons=String(Overlays.draw($('geometry-contour'),drawn,R.eventState(drawn),R.effectiveFov(drawn,rect.width,rect.height)));}
      else delete stage.dataset.contourPolygons;
      if(cameraPreview.active){
        if(current&&!(drag&&drag.moved)&&!holdQuick){cameraPreview.end();cancelDragPreview();}
        else{
          // The accepted real frame already reprojects to the latest pose;
          // discard a queued duplicate rather than recompositing it again.
          cameraPreview.accept(renderer.canvas,drawnFrame,state);
          if(drag?.moved){cancelDragPreview();dragPreviewLast=performance.now();}
        }
      }
      if(!cameraPreview.active)updateMeasurements(drawn);
      if(current&&!cameraPreview.active&&probe&&probeRefreshRevision!==revision){
        const p=probe;probe={...R.trace(drawn,p.x,p.y,p.width,p.height),x:p.x,y:p.y,width:p.width,height:p.height};
        probeRefreshRevision=revision;updateProbe();requestProbeSpectrum(drawn);
      }
      $('contour-legend').hidden=!contour;$('emission-legend').hidden=!drawn.emissionMap;$('observation-legend').hidden=!contour&&!drawn.emissionMap;
      if(info.preview){
        $('scene-quality').hidden=false;$('scene-quality').setAttribute('aria-valuenow',String(info.progress||0));$('quality-percent').textContent=(info.progress||0)+'%';
        $('quality-hint').textContent=holdQuick?'近似视角，等待匹配预览':'匹配预览已显示 · 可继续操作';
        if(renderer.kind==='canvas'&&!holdQuick)$('quality-phase').textContent='流畅模式细化中';
      }else $('scene-quality').hidden=true;
      showRenderDetails(info);
      if(current&&pendingRestore&&pendingRestore.revision===revision){const saved=pendingRestore.data;pendingRestore=null;restoreSamples(saved);}
      const refreshSpace=spaceAwaitingFrame||!!pendingTimeAnchors;
      if(current&&pendingTimeAnchors&&!cameraPreview.active){const pending=pendingTimeAnchors;pendingTimeAnchors=null;if(pending.revision===revision)restoreTimelineSamples(pending.data);}
      if(current&&pendingProbe&&!cameraPreview.active){const next=pendingProbe;pendingProbe=null;selectRay(next.x,next.y,next.width,next.height);}
      // Refinement of one observation event does not continuously redraw
      // the independent diagram, but a newly computed event must refresh it.
      if(refreshSpace||!spaceDialog.open)updateSpace();
      if(current&&!info.preview&&!info.cached)rememberStill(info);
    }
    if(dirty)schedule();
  }
  function rememberCameraCache(info){
    if(info.revision!==revision||info.contentEpoch!==contentEpoch||!drawnFrame||cameraPreview.active||state.playing||Math.abs(info.time-drawnTime)>=1e-7)return;
    cameraPreview.remember(info.images,info,state,info.fullSides);
    // Preserve this already-traced wide underlay alongside the exact still so
    // returning to a cached scene does not lose the existing drag preview. Its
    // additional image buffers share the still cache's hard byte/entry limit.
    const context=stillCacheEnabled?stillContext():null,entry=context?stillFrames.peek(state,context):null;if(!entry)return;
    const copies=[];try{
      for(const source of info.images){
        const copy=document.createElement('canvas');copy.width=source.width;copy.height=source.height;const x=copy.getContext('2d',{alpha:false});if(!x)throw new Error('wide canvas copy unavailable');
        if(source.data&&typeof source.data.length==='number')x.putImageData(source,0,0);else x.drawImage(source,0,0);copies.push(copy);
      }
      stillFrames.attachWide(entry,copies,{environment:info.environment,time:info.time,yaw:info.yaw,pitch:info.pitch,fov:info.fov},info.fullSides);updateStillCache();
    }catch(_){for(const copy of copies){copy.width=1;copy.height=1;}}
  }
  function showRenderDetails(info={}){
    if(!renderer)return;
    const width=info.width||renderer.canvas.width,height=info.height||renderer.canvas.height;
    displayWidth=width;displayHeight=height;
    const name=renderName();
    const phase=info.cached?'静止画面 · 缓存复用'+(stage.dataset.stillCacheSnap==='true'?'（已吸附至缓存视角）':''):info.preview?(renderer.kind==='canvas'?'预览，画面细化中':info.quality==='intermediate'?'中清画面，高清生成中':'预览，高清生成中'):state.playing||drag&&drag.moved?'动态画面，暂停后生成清晰帧':state.antialias&&renderer.kind==='webgl'?'静止画面 · 4 次采样':'静止画面';
    $('render-detail').textContent='当前：'+name+' · '+width+' × '+height+' 像素 · '+phase+(state.shutter>0?' · 4 个快门时刻':'');
  }
  function renderProgress(info){
    if(info.revision!==revision)return;
    stage.dataset.qualityPending='true';stage.dataset.qualityTarget=info.width+'x'+info.height;stage.dataset.qualityProgress=String(info.progress);stage.dataset.qualityPhase=info.phase;
    const canvasRefinement=info.phase==='canvas',waitingPreview=stage.dataset.renderPending==='true',approximatePreview=waitingPreview&&cameraPreview.active;
    $('quality-phase').textContent=canvasRefinement?(waitingPreview?'流畅模式预览生成中':'流畅模式细化中'):info.phase==='middle'?'中清生成中':state.antialias?(state.shutter>0?'高清抗锯齿与快门采样中':'高清抗锯齿生成中'):state.shutter>0?'高清快门采样生成中':'高清生成中';
    $('quality-hint').textContent=approximatePreview?'近似视角，等待匹配预览':waitingPreview?'等待匹配预览 · 可继续操作':'匹配预览已显示 · 可继续操作';
    $('scene-quality').hidden=false;$('scene-quality').setAttribute('aria-label',canvasRefinement?(waitingPreview?'流畅模式预览生成进度':'流畅模式画面细化进度'):'高清画面生成进度');$('scene-quality').setAttribute('aria-valuenow',String(info.progress));$('quality-percent').textContent=info.progress+'%';
    const current=(displayWidth||renderer.canvas.width)+' × '+(displayHeight||renderer.canvas.height),target=(canvasRefinement?'细化目标 ':'高清目标 ')+info.width+' × '+info.height;
    $('render-detail').textContent=waitingPreview?'当前：'+renderName()+' · 正在生成匹配预览 · '+target+' · '+info.progress+'%':'当前：'+renderName()+' · '+(stage.dataset.quality==='intermediate'?'中清':'预览')+' '+current+' → '+target+' · '+info.progress+'%'+(state.shutter>0?' · 4 个快门时刻':'');
  }
  const assetNames=['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal'];
  function assetsChanged(){
    // Cooperative renderers wait for their textures before the first frame.
    // A legacy synchronous WebGL fallback still needs a redraw on completion.
    if(renderer&&!renderer.async&&assetNames.every(name=>['true','error'].includes(renderer.canvas.dataset[name+'Loaded'])))markDirty();
  }
  function updateRenderMode(){
    for(const button of document.querySelectorAll('button[data-render-mode]'))button.setAttribute('aria-pressed',String(button.dataset.renderMode===renderMode));
    stage.dataset.renderMode=renderMode;$('toggle-antialias').disabled=renderMode!=='webgl';
  }
  function freshCanvas(canvas){
    const next=canvas.cloneNode(false);
    for(const name of assetNames)delete next.dataset[name+'Loaded'];
    for(const name of ['shaderPrograms','preparedWorlds','lastRenderMs','computeMs','renderPixels','renderSlices','maxSliceMs'])delete next.dataset[name];
    canvas.replaceWith(next);return next;
  }
  function installRenderer(canvas,mode,allowWorker=true){
    let next=null;
    if(allowWorker)try{next=R.createWorker(canvas,{mode,onAsset:assetsChanged,onFrame:completeFrame,acceptFrame:canPresentFrame,onProgress:renderProgress,onCameraCache:rememberCameraCache,onReady:info=>{
      stage.dataset.renderer=info.kind;
      if(renderWarning){$('render-fallback').textContent=renderWarning;$('render-fallback').hidden=false;}
      else $('render-fallback').hidden=true;
      schedule();
    },onError:changeRenderer});}
    catch(error){
      // A canvas whose presentation context was created cannot switch to another kind.
      canvas=freshCanvas(canvas);console.warn('Relativity worker unavailable:',error.message);
    }
    if(!next){
      if(mode==='webgl'&&window.__RELATIVITY_FORCE_SYNC_WEBGL__===true)next=R.create(canvas,{onAsset:assetsChanged,onLost:changeRenderer});
      else{
        if(mode==='webgl')renderWarning='当前环境无法启动后台 WebGL，已改用低负载 Canvas 分片渲染。';
        else if(!renderWarning)renderWarning='后台渲染不可用，已改用主线程分片渲染；分辨率较低。';
        renderMode='safe';next=R.createCooperative(canvas,{onAsset:assetsChanged,onFrame:completeFrame,onProgress:renderProgress,acceptFrame:canPresentFrame,onCameraCache:rememberCameraCache,onReady:()=>schedule(),onError:changeRenderer});
      }
    }
    renderer=next;displayWidth=0;displayHeight=0;bindCanvas(next.canvas);stage.dataset.renderer=next.kind;stage.dataset.worker=String(!!next.worker);stage.dataset.qualityPending='false';delete stage.dataset.qualityTarget;delete stage.dataset.qualityProgress;$('scene-quality').hidden=true;
    $('render-detail').textContent=next.kind==='webgl'?'正在初始化 WebGL 画面…':'正在准备流畅模式画面…';
    if(renderWarning){$('render-fallback').textContent=renderWarning;$('render-fallback').hidden=false;}else $('render-fallback').hidden=true;
    if(next.visibility)next.visibility(!document.hidden);updateRenderMode();
  }
  function changeRenderer(message){
    if(!renderer)return;
    if(renderer.kind==='canvas'&&!renderer.worker){stage.dataset.status='error';$('scene-loading').hidden=false;$('scene-loading').textContent='场景渲染失败，请刷新页面。';return;}
    if(message)console.warn('Relativity worker/WebGL fallback:',message);
    const retryWorker=renderMode==='webgl',previous=renderer;if(previous.dispose)previous.dispose();
    const canvas=freshCanvas(previous.canvas);renderMode='safe';
    renderWarning='渲染模式不可用或中断，已切换到低负载 Canvas 分片光线求交。';
    stage.dataset.status='loading';$('scene-loading').hidden=false;installRenderer(canvas,'safe',retryWorker);markDirty();
  }
  // A tab opened in the background should not even create its renderer until shown.
  if(!document.hidden)installRenderer($('relativity-scene'),renderMode);else updateRenderMode();
  for(const button of document.querySelectorAll('button[data-render-mode]'))button.addEventListener('click',()=>{
    const mode=button.dataset.renderMode;if(mode===renderMode)return;
    const previous=renderer;if(previous&&previous.dispose)previous.dispose();const canvas=previous?freshCanvas(previous.canvas):$('relativity-scene');
    renderMode=mode;renderWarning='';stage.dataset.status='loading';$('scene-loading').hidden=false;
    installRenderer(canvas,mode);markDirty();
  });

  function progress(input){const min=Number(input.min),max=Number(input.max);input.style.setProperty('--progress',((Number(input.value)-min)/(max-min)*100)+'%');}
  function update(){
    const g=M.gamma([state.beta,0,0]),contraction=1/g,observer=state.scenario==='observer';
    for(const button of document.querySelectorAll('button[data-environment]'))button.setAttribute('aria-pressed',String(button.dataset.environment===state.environment));
    for(const button of document.querySelectorAll('button[data-scenario]'))button.setAttribute('aria-pressed',String(button.dataset.scenario===state.scenario));
    for(const button of document.querySelectorAll('button[data-shape]'))button.setAttribute('aria-pressed',String(button.dataset.shape===state.shape));
    for(const button of document.querySelectorAll('button[data-view]'))button.setAttribute('aria-pressed',String(!state.spectrumSplit&&button.dataset.view===state.view));
    for(const button of document.querySelectorAll('button[data-beta]'))button.setAttribute('aria-pressed',String(Math.abs(Number(button.dataset.beta)-state.beta)<.0001));
    $('toggle-antialias').setAttribute('aria-pressed',String(state.antialias));$('toggle-antialias').textContent='静止抗锯齿：'+(state.antialias?'开':'关');
    $('object-section').hidden=observer;
    const materials={station:'旅行箱帆布',street:'快递纸箱',corridor:'工业设备面板',mountain:'山地木箱',harbor:'货场金属货箱'};
    const detail={station:'旅行箱有倒角箱体、圆柱滚轮、护边与拉杆',street:'纸箱有倒角与立体封条和环绕束带',corridor:'设备有倒角外壳、通风片、开关和支脚',mountain:'木箱有倒角主体、框条、横梁与底座',harbor:'货箱有倒角主体和立体锁杆、护框'};
    $('object-material').textContent='当前外观：'+materials[state.environment]+'；'+(state.shape==='artifact'?detail[state.environment]+'，几何仍为简化模型。':state.shape==='cube'?'标准方块主体带独立立体部件。':'理想球体无方块部件。');
    $('beta').value=state.beta;$('beta-big').textContent=speedText(state.beta);progress($('beta'));
    const motion=M.motionVelocity(state.scenario,state.beta,state.motionAngle,state.motionElevation);
    $('direction-label').textContent=state.beta===0?'相对环境静止':`速度分量 x ${finite(motion[0],2)} / y ${finite(motion[1],2)} / z ${finite(motion[2],2)}`;
    $('motion-elevation').value=state.motionElevation;$('motion-elevation-value').textContent=state.motionElevation+'°';progress($('motion-elevation'));
    $('second-body-controls').hidden=observer;$('toggle-second-body').setAttribute('aria-pressed',String(state.secondEnabled));$('toggle-second-body').textContent='第二个运动物体 B：'+(state.secondEnabled?'开':'关');$('second-body-settings').hidden=!state.secondEnabled;
    for(const [id,value] of [['second-beta',state.secondBeta],['second-angle',state.secondAngle],['second-elevation',state.secondElevation]]){$(id).value=value;$(id+'-value').textContent=id==='second-beta'?speedText(value)+' c':value+'°';progress($(id));}
    $('toggle-velocity-arrow').setAttribute('aria-pressed',String(state.velocityArrow));$('toggle-velocity-arrow').textContent='场景速度箭头：'+(state.velocityArrow?'开':'关');
    $('motion-angle').value=state.motionAngle;$('motion-angle-value').textContent=state.motionAngle+'°';progress($('motion-angle'));
    $('motion-angle-note').textContent=(observer?'正 β 时水平 0° 向前、90° 向右。':'正 β 时水平 0° 向右、−90° 迎面。')+' 正仰角向上，负 β 整体反向。箭头为实验室同时方向示意，不是光线；匀速直线，可穿透场景。';
    const headingLabels=observer?{'-90':'向左','0':'向前','90':'向右','180':'向后'}:{'-90':'迎面','0':'横向 →','90':'远离','180':'横向 ←'};
    for(const button of document.querySelectorAll('button[data-motion-angle]')){button.textContent=headingLabels[button.dataset.motionAngle];button.setAttribute('aria-pressed',String(Number(button.dataset.motionAngle)===state.motionAngle));}
    $('dock-beta').innerHTML=speedText(state.beta)+' <small>c</small>';$('dock-gamma').textContent=finite(g);$('metric-gamma').textContent=finite(g);$('metric-contraction').textContent=finite(contraction,3);
    $('dock-title').textContent=observer?'高速观察者':'运动物体';
    $('scene-note-title').textContent=state.beta===0?'静止参照':observer?'高速观察者':'高速掠过';$('scene-note-sub').textContent=observer?W.labels[state.environment]+'静止 · 改变视向':'来自不同过去时刻的光';
    $('scene-environment').textContent=W.labels[state.environment]+' / INERTIAL FRAME';
    $('scene-title-detail').textContent=observer?'迎面而来的世界，改变了方向。':'一张照片，不是同一时刻的世界。';
    $('view-photo').textContent=observer?'高速视野':'光锥照片';$('view-geometry').textContent=observer?'静止视野':'同时几何';
    $('view-photo').setAttribute('aria-label',observer?'高速视野：高速观察者接收的视野':'光锥照片：运动物体的光行时照片');$('view-geometry').setAttribute('aria-label',observer?'静止视野：同一事件中实验室静止观察者的视野':'同时几何：同一实验室时刻的物体几何形状，不是照片');
    $('split-left-label').textContent=state.spectrumSplit?'光谱关闭':state.shadowTiming==='split'?'传播延迟':observer?'静止观察者':'光锥照片';$('split-right-label').textContent=state.spectrumSplit?'光谱开启':state.shadowTiming==='split'?'冻结参考':observer?'高速观察者':'同时几何';
    const split=state.view==='split'||state.shadowTiming==='split'||state.spectrumSplit;$('split-overlay').hidden=!split;$('split-handle').hidden=!split;$('split-control').hidden=!split;workbench.classList.toggle('split-active',split);
    const percent=Math.round(state.split*100);$('split-overlay').style.setProperty('--split',(state.split*100)+'%');$('split-handle').style.setProperty('--split',(state.split*100)+'%');$('split-handle').setAttribute('aria-valuenow',String(percent));$('split-handle').setAttribute('aria-valuetext',percent+'%');$('split-position').value=percent;$('split-value').textContent=percent+'%';
    const range=$('event-time');range.min=observer?'0':'-3';range.max=observer?'8':'3';range.value=state.time;$('time-value').textContent=finite(state.time);$('playback-rate').value=String(state.playbackRate);
    $('time-label').textContent='实验室时间 t';$('spacetime-time').min=range.min;$('spacetime-time').max=range.max;$('spacetime-time').value=state.time;$('spacetime-time-value').textContent=finite(state.time);$('slice-time').min=range.min;$('slice-time').max=range.max;$('slice-time').value=state.time;$('slice-time-value').textContent=finite(state.time);
    $('fov').value=state.fov;$('fov-value').textContent=Math.round(state.fov)+'°';progress($('fov'));
    $('shutter').value=state.shutter;$('shutter-value').textContent=finite(state.shutter,1);progress($('shutter'));
    $('dynamic-quality').value=state.dynamicQuality;stage.dataset.dynamicQuality=state.dynamicQuality;
    $('toggle-contour').disabled=observer;$('toggle-contour').setAttribute('aria-pressed',String(state.contour));$('toggle-contour').textContent='同时轮廓：'+(state.contour?'开':'关');
    $('toggle-emission').setAttribute('aria-pressed',String(state.emissionMap));$('toggle-emission').textContent='发射时刻伪彩：'+(state.emissionMap?'开':'关');
    $('toggle-doppler').setAttribute('aria-pressed',String(state.doppler));$('toggle-doppler').textContent='多普勒光谱：'+(state.doppler?'开':'关');
    const opticsNote=state.spectrumSplit?(state.emissionMap?'伪彩覆盖两侧色彩':'同一照片 · 左关右开'):state.emissionMap?(state.doppler?'发射时刻伪彩覆盖光谱色':'光谱已关 · 伪彩仍开'):state.doppler?(state.materialSpectrum.startsWith('usgs-')&&state.surfaceMode==='reflection'?'实测材质 / 假设光源':'假设光谱 · 左侧调曝光'):'光谱已关 · 保留材质原色';
    $('spectrum-split').setAttribute('aria-pressed',String(state.spectrumSplit));$('dock-doppler').disabled=$('toggle-doppler').disabled=state.spectrumSplit;
    if($('dock-optics-note').textContent!==opticsNote)$('dock-optics-note').textContent=opticsNote;
    $('toggle-scene-mirror').setAttribute('aria-pressed',String(state.sceneMirror));$('toggle-scene-mirror').textContent='场景理想镜面：'+(state.sceneMirror?'开':'关');
    $('scene-mirror-controls').hidden=!state.sceneMirror;$('scene-mirror-x').value=state.mirrorX;$('scene-mirror-x-value').textContent=finite(state.mirrorX,2);$('scene-mirror-angle').value=state.mirrorAngle;$('scene-mirror-angle-value').textContent=state.mirrorAngle+'°';
    $('toggle-shadows').setAttribute('aria-pressed',String(state.shadows));$('toggle-shadows').textContent='光线遮挡：'+(state.shadows?'开':'关');$('toggle-soft-shadows').disabled=!state.shadows;$('toggle-soft-shadows').setAttribute('aria-pressed',String(state.softShadows));$('toggle-soft-shadows').textContent='面积光软阴影：'+(state.softShadows?'开':'关');$('dock-doppler').setAttribute('aria-pressed',String(state.doppler));$('dock-shadows').setAttribute('aria-pressed',String(state.shadows));
    for(const button of document.querySelectorAll('button[data-shadow-timing]'))button.setAttribute('aria-pressed',String(button.dataset.shadowTiming===state.shadowTiming));
    const indoor=state.environment==='station'||state.environment==='corridor'||state.environment==='harbor';$('point-light-controls').hidden=!indoor;$('direction-light-controls').hidden=indoor;
    for(const [id,value,suffix] of [['light-x',state.lightX,''],['light-z',state.lightZ,''],['light-yaw',state.lightYaw,'°'],['light-elevation',state.lightElevation,'°']]){$(id).value=value;$(id+'-value').textContent=(suffix?String(value):finite(value,1))+suffix;progress($(id));}
    const lampHalf=W.lightHalf(state.environment,state);
    for(const [id,value,size] of [['light-width',state.lightWidthScale,2*lampHalf[0]],['light-depth',state.lightDepthScale,2*lampHalf[1]]]){$(id).value=value;$(id+'-value').textContent=finite(size,2)+' 单位（'+finite(value,2)+'×）';progress($(id));}
    $('sun-radius').value=state.sunAngularRadius;$('sun-radius-value').textContent=finite(state.sunAngularRadius,2)+'°';progress($('sun-radius'));
    $('shadow-samples').value=String(state.shadowSamples);
    for(const button of document.querySelectorAll('button[data-sun-radius]'))button.setAttribute('aria-pressed',String(Number(button.dataset.sunRadius)===state.sunAngularRadius));
    $('exposure').disabled=!state.doppler&&!state.spectrumSplit;$('exposure').value=state.exposure;$('exposure-value').textContent=(state.exposure>0?'+':'')+finite(state.exposure,1)+' EV';progress($('exposure'));
    $('roughness-scale').value=state.roughnessScale;$('roughness-scale-value').textContent=finite(state.roughnessScale,2)+'×';progress($('roughness-scale'));
    $('surface-mode').value=state.surfaceMode;$('material-spectrum').value=state.materialSpectrum;$('material-spectrum').disabled=state.surfaceMode!=='reflection';$('tone-map').value=state.toneMap;$('spectrum-model').value=state.spectrumModel;$('temperature-controls').hidden=state.spectrumModel!=='blackbody';$('line-controls').hidden=state.spectrumModel!=='line';
    $('spectrum-temperature').value=state.temperature;$('temperature-value').textContent=state.temperature+' K';progress($('spectrum-temperature'));
    $('spectrum-line').value=state.lineWavelength;$('line-value').textContent=finite(state.lineWavelength,1)+' nm';progress($('spectrum-line'));
    $('wavelength').value=state.wavelength;$('wavelength-value').textContent=state.wavelength+' nm';progress($('wavelength'));
    $('play-icon').textContent=state.playing?'Ⅱ':'▶';$('play-text').textContent=state.playing?'暂停':'播放';$('play').setAttribute('aria-label',state.playing?'暂停时间':'播放时间');$('header-status').textContent=state.playing?'时间播放中':'事件已定格';
    $('card-index').textContent=observer?'02 / ABERRATION':'01 / LIGHT TRAVEL TIME';
    $('card-title').textContent=observer?'运动改变光的来向':'不同位置的光，来自不同过去';
    $('card-copy').textContent=observer?'在同一观察事件，把高速观察者看到的每个像素方向变换到实验室系，再与静止场景求交。前方光线在观察者视野中更集中；反向运动则相反。':'摄影机的每个像素都沿过去光锥寻找物体表面。物体在光飞行期间继续运动，因此照片不等于同一时刻的几何切片。';
    $('card-equation').innerHTML=observer?'cos θ′ = (cos θ + β) / (1 + β cos θ)':'t<sub>发射</sub> = t<sub>观察</sub> − 距离 / c';
    $('card-note').textContent=observer?'对照左侧是与高速相机在同一事件相遇的实验室静止观察者，右侧是高速观察者。视向变化不是后期屏幕扭曲。':'对照左侧是照片，右侧是实验室同时形状（含洛伦兹收缩，不是照片）；两侧始终对应同一观察事件。';
    Object.assign(stage.dataset,{environment:state.environment,scenario:state.scenario,shape:state.shape,view:state.view,beta:state.beta.toFixed(2),motionAngle:String(state.motionAngle),motionElevation:String(state.motionElevation),secondEnabled:String(state.secondEnabled),secondBeta:state.secondBeta.toFixed(2),secondAngle:String(state.secondAngle),secondElevation:String(state.secondElevation),velocityArrow:String(state.velocityArrow),gamma:finite(g,6),time:finite(state.time,3),playbackRate:String(state.playbackRate),split:finite(state.split,3),yaw:finite(state.yaw,5),pitch:finite(state.pitch,5),fov:String(state.fov),playing:String(state.playing),doppler:String(state.doppler),spectrumSplit:String(state.spectrumSplit),roughnessScale:finite(state.roughnessScale,2),shadows:String(state.shadows),softShadows:String(state.softShadows),shadowSamples:String(state.shadowSamples),shadowTiming:state.shadowTiming,lightX:finite(state.lightX,1),lightZ:finite(state.lightZ,1),lightYaw:String(state.lightYaw),lightElevation:String(state.lightElevation),lightWidthScale:finite(state.lightWidthScale,2),lightDepthScale:finite(state.lightDepthScale,2),sunAngularRadius:finite(state.sunAngularRadius,2),antialias:String(state.antialias),shutter:finite(state.shutter,1),contour:String(state.contour),emissionMap:String(state.emissionMap),surfaceMode:state.surfaceMode,materialSpectrum:state.materialSpectrum,sceneMirror:String(state.sceneMirror),mirrorX:finite(state.mirrorX,2),mirrorAngle:String(state.mirrorAngle),toneMap:state.toneMap,spectrumModel:state.spectrumModel,temperature:String(state.temperature),lineWavelength:finite(state.lineWavelength,1),exposure:finite(state.exposure,1),wavelength:String(state.wavelength)});
    updateProbe();updateSpectrum();updateStillCache();
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function clearProbe(){probe=null;reference=null;pendingProbe=null;probeSpectrum=null;probeSpectrumSeq++;probeRefreshRevision=-1;stage.dataset.spectrumSample='none';$('probe-marker').hidden=true;$('reference-marker').hidden=true;}
  function pause(){state.playing=false;playbackAnchor=null;clearPhysicalFps();}
  function anchorPlayback(now){playbackAnchor={time:state.time,wall:now};}
  function advancePlayback(now){
    if(!playbackAnchor){anchorPlayback(now);return false;}
    const max=state.scenario==='observer'?8:3;
    state.time=Experiments.playbackTime(playbackAnchor.time,playbackAnchor.wall,now,state.playbackRate,max);
    if(state.time<max)return false;
    // Discard any in-flight frame at the previous event before resolving the
    // exact endpoint, just as an explicit parameter change does.
    pause();revision++;contentEpoch++;stage.dataset.viewPending='false';stage.dataset.renderPending='true';if(renderer?.cancel)renderer.cancel();return true;
  }
  function resetExperiment(){pause();state.time=0;clearProbe();update();markDirty();}
  function changed(camera=false,optical=false){update();markDirty({camera,optical});}
  function tick(now){
    frame=0;if(document.hidden||!renderer){playbackAnchor=null;return;}
    if(state.playing){
      advancePlayback(now);dirty=true;if(now-lastHud>75||!state.playing){lastHud=now;update();}
    }
    // The fixed 130 ms cadence previously capped even a fast cached frame at
    // about 7 fps. A dedicated worker on multi-core devices may submit up to
    // 20 real frames/s; a slower frame still completes before another starts.
    // Keep the more conservative cadence for one-core/main-thread fallbacks.
    const minInterval=renderer.kind==='canvas'&&state.playing?(renderer.worker&&(navigator.hardwareConcurrency||0)>=2?50:130):0;
    // A completed still may be shown immediately even while an obsolete
    // Worker job is being cancelled. Revision checks reject its late frames.
    if(dirty&&!state.playing&&!drag?.moved&&!cacheRestore&&tryRestoreStill())return;
    if(dirty&&!renderer.busy&&now-lastPaint>=minInterval){
      const snapshot={...state,interacting:!!(drag&&drag.moved),settleCamera,interactionId:drag?.id??0,contentEpoch,reuseIntermediate:stillCacheEnabled},renderRevision=revision;dirty=false;settleCamera=false;lastPaint=now;
      try{
        if(renderer.async)renderer.render(snapshot,renderRevision);
        else{renderer.render(snapshot);completeFrame({revision:renderRevision,environment:snapshot.environment,time:snapshot.time,yaw:snapshot.yaw,pitch:snapshot.pitch,fov:snapshot.fov,interacting:snapshot.interacting,interactionId:snapshot.interactionId,contentEpoch:snapshot.contentEpoch});}
      }catch(error){
        if(renderer.kind!=='webgl')throw error;
        changeRenderer(error.message);return;
      }
    }
    if(state.playing||(dirty&&!renderer.busy))schedule();
  }
  function startStop(){
    if(state.playing)pause();else{const max=state.scenario==='observer'?8:3;if(state.time>=max)state.time=state.scenario==='observer'?0:-3;clearProbe();state.playing=true;anchorPlayback(performance.now());}
    changed();
  }
  function setBeta(value){
    state.beta=clamp(Math.round(Number(value)*100)/100,-.98,.98);if(Object.is(state.beta,-0))state.beta=0;
    resetExperiment();
  }
  document.querySelectorAll('button[data-environment]').forEach(button=>button.addEventListener('click',()=>{if(state.environment!==button.dataset.environment){state.environment=button.dataset.environment;resetMaterialPoint();$('scene-preparing').hidden=false;clearProbe();changed();}}));
  document.querySelectorAll('button[data-scenario]').forEach(button=>button.addEventListener('click',()=>{if(state.scenario!==button.dataset.scenario){state.scenario=button.dataset.scenario;state.yaw=0;state.pitch=-.025;state.fov=58;resetExperiment();}}));
  document.querySelectorAll('button[data-shape]').forEach(button=>button.addEventListener('click',()=>{if(state.shape!==button.dataset.shape){state.shape=button.dataset.shape;resetMaterialPoint();resetExperiment();}}));
  document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>{if(state.view!==button.dataset.view||state.shadowTiming==='split'||state.spectrumSplit){state.view=button.dataset.view;state.spectrumSplit=false;if(state.shadowTiming==='split')state.shadowTiming='retarded';pause();clearProbe();changed();}}));
  document.querySelectorAll('button[data-beta]').forEach(button=>button.addEventListener('click',()=>setBeta(button.dataset.beta)));
  $('beta').addEventListener('input',e=>setBeta(e.target.value));$('reverse-speed').addEventListener('click',()=>setBeta(-state.beta));
  function setMotionAngle(value){const n=Number(value);if(!Number.isFinite(n))return;state.motionAngle=clamp(Math.round(n/5)*5,-180,180);resetExperiment();}
  $('motion-angle').addEventListener('input',e=>setMotionAngle(e.target.value));
  $('motion-elevation').addEventListener('input',e=>{state.motionElevation=clamp(Math.round(Number(e.target.value)/5)*5,-90,90);resetExperiment();});
  $('toggle-velocity-arrow').addEventListener('click',()=>{state.velocityArrow=!state.velocityArrow;changed();});
  $('toggle-second-body').addEventListener('click',()=>{state.secondEnabled=!state.secondEnabled;resetExperiment();});
  for(const [id,key,min,max,step] of [['second-beta','secondBeta',-.98,.98,.01],['second-angle','secondAngle',-180,180,5],['second-elevation','secondElevation',-90,90,5]])$(id).addEventListener('input',e=>{const value=Number(e.target.value);state[key]=clamp(Math.round(value/step)*step,min,max);resetExperiment();});
  $('second-opposite').addEventListener('click',()=>{state.secondBeta=-state.beta;state.secondAngle=state.motionAngle;state.secondElevation=state.motionElevation;resetExperiment();});
  $('second-independent').addEventListener('click',()=>{state.secondBeta=-.6;state.secondAngle=state.secondElevation=0;resetExperiment();});
  document.querySelectorAll('button[data-motion-angle]').forEach(button=>button.addEventListener('click',()=>setMotionAngle(button.dataset.motionAngle)));
  $('event-time').addEventListener('input',e=>{pause();state.time=Number(e.target.value);clearProbe();changed();});
  $('playback-rate').addEventListener('change',e=>{
    const next=Number(e.target.value);if(!Experiments.playbackRates.includes(next)){e.target.value=String(state.playbackRate);return;}
    // First bring the old-rate anchor to this instant, then start the new
    // segment there, so changing the rate never jumps or rewinds time.
    const now=performance.now(),ended=state.playing&&advancePlayback(now);state.playbackRate=next;
    if(state.playing)anchorPlayback(now);update();if(ended){dirty=true;schedule();}
  });
  function setSplit(value){const next=clamp(Math.round(value*100)/100,.1,.9);if(next===state.split)return;state.split=next;clearProbe();changed();}
  $('split-position').addEventListener('input',e=>setSplit(Number(e.target.value)/100));
  const splitHandle=$('split-handle');
  function moveSplit(event){const r=stage.getBoundingClientRect();setSplit((event.clientX-r.left)/r.width);}
  splitHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();splitHandle.setPointerCapture(event.pointerId);moveSplit(event);});
  splitHandle.addEventListener('pointermove',event=>{if(splitHandle.hasPointerCapture(event.pointerId))moveSplit(event);});
  splitHandle.addEventListener('keydown',event=>{let value=state.split;if(event.key==='ArrowLeft'||event.key==='ArrowDown')value-=.01;else if(event.key==='ArrowRight'||event.key==='ArrowUp')value+=.01;else if(event.key==='Home')value=.1;else if(event.key==='End')value=.9;else return;event.preventDefault();setSplit(value);});
  $('fov').addEventListener('input',e=>{state.fov=Number(e.target.value);clearProbe();changed(true);});
  $('toggle-antialias').addEventListener('click',()=>{state.antialias=!state.antialias;changed();});
  function setShutter(value){state.shutter=clamp(Math.round(Number(value)*10)/10,0,1.6);changed();}
  $('shutter').addEventListener('input',e=>setShutter(e.target.value));document.querySelectorAll('button[data-shutter]').forEach(button=>button.addEventListener('click',()=>setShutter(button.dataset.shutter)));
  $('toggle-contour').addEventListener('click',()=>{state.contour=!state.contour;changed();});
  $('toggle-emission').addEventListener('click',()=>{state.emissionMap=!state.emissionMap;changed();});
  $('surface-mode').addEventListener('change',e=>{state.surfaceMode=e.target.value;changed();});
  $('material-spectrum').addEventListener('change',e=>{if(window.RelativityMaterialSpectrum.ids.includes(e.target.value)){state.materialSpectrum=e.target.value;changed();}});
  $('roughness-scale').addEventListener('input',e=>{state.roughnessScale=clamp(Number(e.target.value),.5,1.5);changed();});
  $('tone-map').addEventListener('change',e=>{if(['reinhard','filmic'].includes(e.target.value)){state.toneMap=e.target.value;changed();}});
  $('toggle-doppler').addEventListener('click',()=>{state.doppler=!state.doppler;changed(false,true);});
  $('toggle-shadows').addEventListener('click',()=>{state.shadows=!state.shadows;changed(false,true);});
  $('toggle-scene-mirror').addEventListener('click',()=>{state.sceneMirror=!state.sceneMirror;clearProbe();changed();});
  $('scene-mirror-x').addEventListener('input',e=>{state.mirrorX=clamp(Number(e.target.value),-4,4);clearProbe();changed();});
  $('scene-mirror-angle').addEventListener('input',e=>{state.mirrorAngle=clamp(Number(e.target.value),-45,45);clearProbe();changed();});
  $('toggle-soft-shadows').addEventListener('click',()=>{state.softShadows=!state.softShadows;changed();});
  document.querySelectorAll('button[data-shadow-timing]').forEach(button=>button.addEventListener('click',()=>{state.shadowTiming=button.dataset.shadowTiming;if(state.shadowTiming==='split'){state.view='photo';state.spectrumSplit=false;pause();clearProbe();}changed();}));
  $('spectrum-split').addEventListener('click',()=>{state.spectrumSplit=!state.spectrumSplit;if(state.spectrumSplit){state.view='photo';if(state.shadowTiming==='split')state.shadowTiming='retarded';state.emissionMap=false;}pause();clearProbe();changed();});
  for(const [id,key] of [['light-x','lightX'],['light-z','lightZ'],['light-yaw','lightYaw'],['light-elevation','lightElevation'],['light-width','lightWidthScale'],['light-depth','lightDepthScale'],['sun-radius','sunAngularRadius']])$(id).addEventListener('input',e=>{state[key]=Number(e.target.value);changed();});
  $('shadow-samples').addEventListener('change',e=>{const count=Number(e.target.value);if(O.SHADOW_SAMPLES.includes(count)){state.shadowSamples=count;changed();}});
  document.querySelectorAll('button[data-sun-radius]').forEach(button=>button.addEventListener('click',()=>{state.sunAngularRadius=Number(button.dataset.sunRadius);changed();}));
  $('reset-light').addEventListener('click',()=>{state.lightX=state.lightZ=state.lightYaw=state.lightElevation=0;state.lightWidthScale=state.lightDepthScale=1;state.sunAngularRadius=O.DEFAULT_SUN_RADIUS;state.shadowSamples=4;changed();});
  $('dock-doppler').addEventListener('click',()=>{state.doppler=!state.doppler;changed(false,true);});$('dock-shadows').addEventListener('click',()=>{state.shadows=!state.shadows;changed(false,true);});
  $('exposure').addEventListener('input',e=>{state.exposure=Number(e.target.value);changed();});
  $('wavelength').addEventListener('input',e=>{state.wavelength=Number(e.target.value);update();});
  $('spectrum-model').addEventListener('change',e=>{if(['rgb','blackbody','line'].includes(e.target.value)){state.spectrumModel=e.target.value;changed();}});
  $('spectrum-temperature').addEventListener('input',e=>{state.temperature=clamp(Number(e.target.value),2500,12000);changed();});
  function setLine(value){state.lineWavelength=clamp(Math.round(Number(value)*10)/10,380,780);changed();}
  $('spectrum-line').addEventListener('input',e=>setLine(e.target.value));
  document.querySelectorAll('button[data-line]').forEach(button=>button.addEventListener('click',()=>setLine(button.dataset.line)));
  $('dynamic-quality').addEventListener('change',e=>{if(['responsive','balanced','sharp'].includes(e.target.value)){state.dynamicQuality=e.target.value;clearPhysicalFps();changed();}});
  $('play').addEventListener('click',startStop);$('reset').addEventListener('click',resetExperiment);
  $('reset-view').addEventListener('click',()=>{state.yaw=0;state.pitch=-.025;state.fov=58;clearProbe();changed(true);});
  $('probe-center').addEventListener('click',()=>{const rect=renderer.canvas.getBoundingClientRect();selectRay(rect.width/2,rect.height/2,rect.width,rect.height);});
  $('toggle-still-cache').addEventListener('click',()=>{
    stillCacheEnabled=!stillCacheEnabled;stillCacheError='';
    if(!stillCacheEnabled){stillFrames.clear();renderer?.clearIntermediateCache?.();if(cacheRestore?.revision===revision){cacheRestore=null;dirty=true;schedule();}}
    else if(drawnRevision===revision&&!dirty&&!state.playing&&!drag?.moved&&stage.dataset.quality==='final'&&stage.dataset.renderPending==='false')rememberStill({...drawnFrame,cached:false});
    updateStillCache();
  });
  $('clear-still-cache').addEventListener('click',()=>{
    stillFrames.clear();renderer?.clearIntermediateCache?.();if(cacheRestore?.revision===revision){cacheRestore=null;dirty=true;schedule();}stillCacheError='';updateStillCache();
  });
  $('previous-cached-view').addEventListener('click',()=>{
    const context=stillContext(),entry=stillCacheEnabled&&context&&!state.playing&&!drag?.moved?stillFrames.previous(state,context):null;if(!entry)return;
    state.yaw=entry.pose.yaw;state.pitch=entry.pose.pitch;state.fov=entry.pose.fov;clearProbe();changed(true);
  });
  $('show-sampled-spectrum').addEventListener('click',()=>$('spectrum-card').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
  $('pin-ray').addEventListener('click',()=>{
    if(emission(probe)===null)return;
    reference=probe;const marker=$('reference-marker');marker.style.left=(probe.x/probe.width*100)+'%';marker.style.top=(probe.y/probe.height*100)+'%';marker.hidden=false;update();
  });
  $('clear-reference').addEventListener('click',()=>{reference=null;$('reference-marker').hidden=true;update();});
  $('mark-probe').addEventListener('click',()=>{
    if(!probe?.hit?.body||probe.hit.bodyId==='B'||stage.dataset.renderPending==='true'||cameraPreview.active||!V.onSurface(state.environment,state.shape,probe.hit.restPoint,2e-4))return;
    markerPoint=probe.hit.restPoint.slice();markerCustom=true;if(drawnState){updateMeasurements(drawnState);updateSpace();}$('material-announce').textContent='已将采样表面设为固定材料点 M。';
  });
  $('reset-material').addEventListener('click',()=>{resetMaterialPoint();if(drawnState&&stage.dataset.renderPending==='false'&&!cameraPreview.active){updateMeasurements(drawnState);updateSpace();}$('material-announce').textContent='材料点 M 已回到默认表面。';});

  const localSnapshotKey='relativity-observation-v1';
  function applyParameters(parameters){
    pause();clearProbe();pendingProbe=null;const different=state.environment!==parameters.environment||state.shape!==parameters.shape;Object.assign(state,parameters,{playing:false});if(different)resetMaterialPoint();update();markDirty();
  }
  document.querySelectorAll('button[data-experiment]').forEach(button=>button.addEventListener('click',()=>{
    const preset=Experiments.presets.find(p=>p.id===button.dataset.experiment);if(!preset)return;
    applyParameters(Experiments.recipe(preset.id));$('experiment-instruction').textContent='已载入：'+preset.title+'。按下列三个步骤验证；更改参数会清除两束光采样。';$('guide-steps').hidden=false;for(const key of ['operate','observe','verify'])$('guide-'+key).textContent=preset.procedure[key];
    for(const b of document.querySelectorAll('button[data-experiment]'))b.setAttribute('aria-pressed',String(b===button));
  }));
  function savedSample(sample){
    if(!sample)return null;
    const instant=state.shadowTiming==='instant'||(state.shadowTiming==='split'&&sample.x/sample.width>=state.split),ray={...sample,shadowInstant:instant};
    const bounce=R.traceReflection(state,ray),sourceRay=bounce?.ray||ray,sourceState=bounce?.state||state,hit=sourceRay.hit;
    const D=O.frequencyRatio(sourceState,sourceRay),light=state.shadows?(state.softShadows?O.softIllumination(sourceState,sourceRay):O.illumination(sourceState,sourceRay)):null;
    const reflection=bounce?{kind:'stationary-ideal-plane',mirrorPoint:sample.hit.point,mirrorTime:bounce.mirrorTime,observerToMirror:sample.hit.distance,
      reflectedDirection:bounce.direction,mirrorToSource:hit?bounce.ray.reflectedFrom.epsilon+hit.distance:null,sourcePoint:hit?.point||null,
      sourceTime:bounce.sourceTime,totalDistance:bounce.totalDistance}:null;
    return {u:sample.x/sample.width,v:sample.y/sample.height,aspect:sample.width/sample.height,source:hit?.kind||'sky',body:!!hit?.body,bodyId:hit?.body?(hit.bodyId||'A'):null,photo:sample.photo,
      observationTime:state.time,camera:sample.camera,direction:sample.direction,labDirection:sample.labDirection,distance:bounce?bounce.totalDistance:(hit?.distance??null),emissionTime:bounce?bounce.sourceTime:emission(sample),
      doppler:D,frequencyFactors:O.frequencyFactors(sourceState,sourceRay),referenceWavelength:state.wavelength,observedWavelength:D===null?null:state.wavelength/D,reflection,
      shadow:light?{status:light.status,blocker:light.blocker||null,blockingTime:light.blockingTime??null,timing:instant?'instant-reference':'retarded'}:null};
  }
  function makeSnapshot(){
    if(state.playing||cameraPreview.active||drag?.moved||drawnRevision!==revision||Math.abs(drawnTime-state.time)>1e-7||dirty||stage.dataset.renderPending!=='false')throw new Error('请先暂停并等待与当前参数匹配的完整画面。');
    const current=savedSample(probe),fixed=savedSample(reference),a=fixed?.emissionTime,b=current?.emissionTime;
    return {format:'relativity-observation',schema:1,savedAt:new Date().toISOString(),units:'laboratory coordinates; c=1',parameters:Experiments.parameters(state),
      presentation:{renderMode,note:'Rendering mode is recorded, not automatically restored.'},measurements:{current,reference:fixed,materialPoint:markerPoint.slice(),emissionDelta:a!=null&&b!=null&&!fixed?.reflection&&!current?.reflection?b-a:null},
      limitations:'USGS reflectances are measured samples, not texture, BRDF or illuminant measurements. The stationary ideal scene mirror traces one bounce. Other spectra and lighting are approximate; with the spectrum switch off the image uses ordinary texture colors, while probe frequency ratios remain theoretical. Finite shutter averages four reconstructed linear-intensity samples before display; source RGB and clipped gamut are approximations. Probes refer to the shutter centre.'};
  }
  function saveMessage(error){$('snapshot-status').textContent=error?.message||String(error);}
  $('save-local').addEventListener('click',()=>{try{const value=JSON.stringify(makeSnapshot());localStorage.setItem(localSnapshotKey,value);$('snapshot-status').textContent='已保存到此浏览器的本机存储；再次保存会覆盖这一份。';}catch(error){saveMessage(error);}});
  function loadSnapshot(text){
    const saved=Experiments.parse(text);applyParameters(saved.parameters);markerPoint=saved.materialPoint?saved.materialPoint.slice():M.materialAnchor(state.environment,state.shape);markerCustom=!!saved.materialPoint&&M.length(M.sub(markerPoint,M.materialAnchor(state.environment,state.shape)))>1e-6;pendingRestore={revision,data:saved};
    $('experiment-instruction').textContent='已导入实验参数；匹配画面完成后将尝试重算保存的采样位置。';$('snapshot-status').textContent='正在恢复参数和采样…';
  }
  $('restore-local').addEventListener('click',()=>{try{const value=localStorage.getItem(localSnapshotKey);if(!value)throw new Error('本机尚无已保存的实验。');loadSnapshot(value);}catch(error){saveMessage(error);}});
  $('export-snapshot').addEventListener('click',()=>{try{
    const blob=new Blob([JSON.stringify(makeSnapshot(),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='relativity-observation.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('snapshot-status').textContent='JSON 已生成；包含参数与当时的测量结果。';
  }catch(error){saveMessage(error);}});
  $('import-snapshot').addEventListener('click',()=>$('snapshot-file').click());
  $('snapshot-file').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>1048576)throw new Error('快照文件不能超过 1 MB。');loadSnapshot(await file.text());}catch(error){saveMessage(error);}});
  function restoreSamples(saved){
    const rect=renderer.canvas.getBoundingClientRect(),aspect=rect.width/rect.height;let skipped=false;
    function restore(position){
      if(!position)return null;
      if(Math.abs(position.aspect/aspect-1)>.005){skipped=true;return null;}
      const x=position.u*rect.width,y=position.v*rect.height,ray=R.trace(state,x,y,rect.width,rect.height);return {...ray,x,y,width:rect.width,height:rect.height};
    }
    probe=restore(saved.current);reference=restore(saved.reference);
    if(probe&&reference&&Math.abs(probe.x-reference.x)<.001&&Math.abs(probe.y-reference.y)<.001)reference=probe;
    function place(id,sample){const marker=$(id);marker.hidden=!sample;if(sample){marker.style.left=(100*sample.x/sample.width)+'%';marker.style.top=(100*sample.y/sample.height)+'%';}}
    place('probe-marker',probe);place('reference-marker',reference);update();if(probe){probeRefreshRevision=revision;requestProbeSpectrum(drawnState||state);}
    $('snapshot-status').textContent=skipped?'参数已恢复；画布比例不同，旧采样仅保存在 JSON 中，请重新采样。':'参数已恢复，保存的采样位置已在当前画面重新计算。';
  }

  $('compare-example').addEventListener('click',()=>{pause();state.beta=.86;state.time=state.scenario==='flyby'?-2:0;state.view='split';state.spectrumSplit=false;state.shadowTiming=state.shadowTiming==='split'?'retarded':state.shadowTiming;state.yaw=0;state.pitch=-.025;state.fov=58;clearProbe();changed();});
  document.addEventListener('visibilitychange',()=>{
    // Freeze the clock while the page is hidden. Hidden time is neither
    // replayed nor silently added when the user returns.
    if(document.hidden){if(state.playing&&playbackAnchor)advancePlayback(performance.now());playbackAnchor=null;}
    else if(state.playing)anchorPlayback(performance.now());
    if(!renderer&&!document.hidden)installRenderer($('relativity-scene'),renderMode);if(renderer&&renderer.visibility)renderer.visibility(!document.hidden);
    if(!document.hidden){update();markDirty();}
  });
  function noteResizeSamples(){if(spaceDialog.open&&(probe||reference||pendingTimeAnchors?.data.current||pendingTimeAnchors?.data.reference))timelineNotice='画布尺寸已变化，A/B 方向已清除；请重新采样。';}
  window.addEventListener('resize',()=>{noteResizeSamples();clearProbe();update();markDirty();});
  if('ResizeObserver'in window)new ResizeObserver(()=>{noteResizeSamples();if(probe||reference){clearProbe();update();}markDirty();}).observe(stage);
  function bindCanvas(canvas){
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;cancelDragPreview(true);drag={x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch,moved:false,id:++interactionId};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{
      if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y,first=!drag.moved;
      if(Math.hypot(dx,dy)>4)drag.moved=true;if(!drag.moved)return;
      if(first)stage.dataset.interacting='true';state.yaw=drag.yaw-dx*.005;state.pitch=clamp(drag.pitch+dy*.005,-1.25,1.25);
      if(first||!cameraPreview.active){clearProbe();changed(true);return;}
      if(probe||reference||pendingProbe){clearProbe();update();}
      stage.dataset.yaw=finite(state.yaw,5);stage.dataset.pitch=finite(state.pitch,5);markDirty({camera:true,lightweight:true});
    });
    canvas.addEventListener('pointerup',event=>{if(!drag)return;const selected=!drag.moved;cancelDragPreview();drag=null;stage.dataset.interacting='false';
      if(selected){const rect=canvas.getBoundingClientRect();selectRay(event.clientX-rect.left,event.clientY-rect.top,rect.width,rect.height);}
      else{
        // Only snap on release, by at most .02 rad (~1.15°, 4 CSS px of this drag); all other
        // physical parameters and viewport must match the cached frame.
        const context=stillCacheEnabled&&!state.playing?stillContext():null,near=context?stillFrames.nearby(state,context):null;
        let snapped=false;if(near){snapped=near.distance>1e-10;state.yaw=near.entry.pose.yaw;state.pitch=near.entry.pose.pitch;update();}
        markDirty({camera:true,snapped});
      }
    });
    canvas.addEventListener('pointercancel',()=>{const moved=drag&&drag.moved;cancelDragPreview();drag=null;stage.dataset.interacting='false';if(moved)markDirty({camera:true});});
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.fov=clamp(Math.round(state.fov+Math.sign(event.deltaY)*3),35,100);clearProbe();changed(true);},{passive:false});
    canvas.addEventListener('keydown',event=>{
      if(event.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();const r=canvas.getBoundingClientRect(),anchor=pendingProbe||probe,x=anchor?anchor.x:r.width/2,y=anchor?anchor.y:r.height/2;
        const dx=event.key==='ArrowLeft'?-r.width*.025:event.key==='ArrowRight'?r.width*.025:0;
        const dy=event.key==='ArrowUp'?-r.height*.025:event.key==='ArrowDown'?r.height*.025:0;
        selectRay(clamp(x+dx,1,r.width-1),clamp(y+dy,1,r.height-1),r.width,r.height);return;
      }
      if(event.key===' '){event.preventDefault();startStop();return;}
      if(event.key==='Enter'){event.preventDefault();const r=canvas.getBoundingClientRect();selectRay(r.width/2,r.height/2,r.width,r.height);return;}
      if(event.key==='Escape'){clearProbe();update();return;}
      if(event.key==='ArrowLeft')state.yaw+=.09;else if(event.key==='ArrowRight')state.yaw-=.09;
      else if(event.key==='ArrowUp')state.pitch=clamp(state.pitch+.09,-1.25,1.25);else if(event.key==='ArrowDown')state.pitch=clamp(state.pitch-.09,-1.25,1.25);
      else if(event.key==='+'||event.key==='=')state.fov=clamp(state.fov-3,35,100);else if(event.key==='-')state.fov=clamp(state.fov+3,35,100);else return;
      event.preventDefault();clearProbe();changed(true);
    });
  }
  function selectRay(x,y,width,height){
    if(cameraPreview.active||!$('scene-preparing').hidden||stage.dataset.status!=='ready'||drawnRevision!==revision){
      // Do not sample the old image with new parameters. Queue the latest
      // request and apply it as soon as the matching frame is displayed.
      if(state.playing){pause();update();markDirty();}
      pendingProbe={x,y,width,height};return;
    }
    // During playback use the time of the actual displayed frame, not the
    // newer simulation clock waiting behind an in-flight GPU render.
    const wasPlaying=state.playing;if(wasPlaying)state.time=drawnTime;
    pause();timelineNotice='';const ray=R.trace(state,x,y,width,height);probe={...ray,x,y,width,height};
    const marker=$('probe-marker');marker.style.left=(x/width*100)+'%';marker.style.top=(y/height*100)+'%';marker.hidden=false;
    probeRefreshRevision=revision;probeSpectrum=null;update();
    if(wasPlaying)markDirty();else requestProbeSpectrum(drawnState||state);
    if($('knowledge-panel').hidden)$('toggle-knowledge').click();
  }
  function emission(sample){
    if(!sample||!sample.hit||R.traceReflection(state,sample))return null;
    // A simultaneous geometric slice can occlude a static surface differently
    // from the real past-light-cone view, so it is never treated as a photo.
    if(state.scenario==='flyby'&&!sample.photo)return null;
    return state.time-sample.hit.distance;
  }
  function updatePair(){
    const current=emission(probe),fixed=emission(reference),comparing=!!reference&&probe!==reference;
    $('pin-ray').disabled=current===null;$('pin-ray').textContent=reference?'用当前光线替换 A':'固定当前光线为 A';
    $('clear-reference').hidden=!reference;$('pair-data').hidden=!reference;
    $('probe-marker').classList.toggle('is-paired',comparing);
    if(!reference){
      $('pair-status').textContent='先采样一束光，固定为 A，再点击画面选择 B。';
      delete stage.dataset.reference;delete stage.dataset.referenceTime;delete stage.dataset.referenceDistance;delete stage.dataset.pairDelta;
      return;
    }
    const source=nameOf(reference.hit.kind);$('pair-a').textContent=source+' / '+finite(fixed,3);
    $('pair-b').textContent=comparing&&current!==null?nameOf(probe.hit.kind)+' / '+finite(current,3):'—';
    $('pair-delta').textContent=comparing&&current!==null?((current-fixed>=0?'+':'')+finite(current-fixed,3)):'—';
    $('pair-status').textContent=!comparing?'A 已固定；可收起知识卡后点另一处，或聚焦画面按 Shift + 方向键选择 B。':current===null?(probe&&R.traceReflection(state,probe)?'镜面折线路径暂不支持 A/B；A 已保留，请采样直射表面。':'B 没有有限的发射时刻；请采样其他表面。'):Math.abs(current-fixed)<.0005?'A 与 B 的发射时刻相同，精度限于当前显示。':current>fixed?'B 的光比 A 更晚发出，但它们在同一事件抵达。':'B 的光比 A 更早发出，但它们在同一事件抵达。';
    stage.dataset.reference=reference.hit.kind;stage.dataset.referenceTime=finite(fixed,6);stage.dataset.referenceDistance=finite(reference.hit.distance,6);
    if(comparing&&current!==null)stage.dataset.pairDelta=finite(current-fixed,6);else delete stage.dataset.pairDelta;
  }
  function updateProbe(){
    $('mark-probe').disabled=!(probe?.hit?.body&&probe.hit.bodyId!=='B'&&V.onSurface(state.environment,state.shape,probe.hit.restPoint,2e-4));
    updatePair();
    const data=$('probe-data');data.hidden=!probe;
    if(!probe){
      $('probe-mode').textContent='未采样';$('probe-summary').textContent='点击画面中任意位置，或采样画面正中央。计算该方向的光路；移动视角或改变实验后会清除。';
      $('plot-caption').textContent='示意图在采样后显示；物体与光线路径使用所选事件。';delete stage.dataset.probeMirrorTime;delete stage.dataset.probeMirrorSource;delete stage.dataset.probeMirrorSourceTime;delete stage.dataset.probe;delete stage.dataset.probeBody;delete stage.dataset.probePhoto;delete stage.dataset.probeDistance;delete stage.dataset.probeLabAngle;delete stage.dataset.probeObserverAngle;delete stage.dataset.probeDoppler;delete stage.dataset.probeWavelength;delete stage.dataset.probeShadow;delete stage.dataset.probeBlocker;delete stage.dataset.probeBlockTime;drawPlot(null);updateSpace();return;
    }
    const {hit,photo,direction,labDirection}=probe,observer=state.scenario==='observer';
    probe.shadowInstant=state.shadowTiming==='instant'||(state.shadowTiming==='split'&&probe.x/probe.width>=state.split);
    const bounce=R.traceReflection(state,probe),sourceRay=bounce?.ray||probe,sourceState=bounce?.state||state;
    const factor=O.frequencyRatio(sourceState,sourceRay),light=state.shadows?(state.softShadows?O.softIllumination(sourceState,sourceRay):O.illumination(sourceState,sourceRay)):null;
    const factors=O.frequencyFactors(sourceState,sourceRay);
    $('probe-doppler').textContent=factor===null?'—':finite(factor,3)+(factors?.reflected?'（入 '+finite(factors.incident,3)+' × 出 '+finite(factors.outgoing,3)+'）':'');
    const lambda=factor===null?null:state.wavelength/factor;
    $('probe-wavelength').textContent=lambda===null?'—':finite(lambda,1)+' nm'+(lambda<380?' / 紫外':lambda>780?' / 红外':' / 可见范围');
    const blockerName=light?.blockerBody?'运动物体 '+light.blockerBody+' · '+nameOf(light.blocker):nameOf(light?.blocker);
    $('probe-shadow').textContent=!state.shadows?'已关闭':light.sampleCount?(light.blocked+' / '+light.sampleCount+' 条受阻'+(light.blocker?'（首个：'+blockerName+'）':'')):light.status==='shadow'?'被'+blockerName+'遮挡':light.status==='lit'?'主光可达':light.status==='unlit'?'背光或无直接光':light.status==='emissive'?'自发光面':'无限远天空';
    $('probe-block-label').textContent=probe.shadowInstant?'冻结参考时刻 t':'遮挡时刻 t';
    $('probe-block-time').textContent=light&&light.blocker?finite(light.blockingTime,3):'—';
    if(factor!==null){stage.dataset.probeDoppler=finite(factor,6);stage.dataset.probeWavelength=finite(lambda,3);}else{delete stage.dataset.probeDoppler;delete stage.dataset.probeWavelength;}
    if(light){stage.dataset.probeShadow=light.status;if(light.blocker){stage.dataset.probeBlocker=light.blocker;stage.dataset.probeBlockTime=finite(light.blockingTime,6);}else{delete stage.dataset.probeBlocker;delete stage.dataset.probeBlockTime;}}else{delete stage.dataset.probeShadow;delete stage.dataset.probeBlocker;delete stage.dataset.probeBlockTime;}
    const which=state.view==='split'||state.shadowTiming==='split'||state.spectrumSplit?(probe.x/probe.width>=state.split?'右侧':'左侧'):(photo?'照片':'对照');
    const probeSpectral=R.spectralAt(state,probe.x,probe.width);
    $('probe-mode').textContent=which;
    const source=(hit?.body?'运动物体 '+(hit.bodyId||'A')+' · ':'')+nameOf(hit&&hit.kind);
    const labAngle=angle(labDirection),observerAngle=angle(direction);
    if(observer){
      const factor=photo?M.stationarySourceDoppler(labDirection,probe.observerVelocity):1;
      $('probe-summary').textContent=`${which} · ${source}。镜头方向与所选运动轴的夹角：观察者 ${deg(observerAngle)}，实验室 ${deg(labAngle)}。`;
      $('probe-dt-label').textContent='观察者角 θ′ / 实验室角 θ';$('probe-distance').textContent=deg(observerAngle)+' / '+deg(labAngle);
      $('probe-event-label').textContent='静止光源频率比 ν′ / ν';$('probe-time').textContent=finite(factor,3);
      $('probe-extra-label').textContent='来源 / 光程 c = 1';$('probe-extra').textContent=source+(hit?' / '+finite(hit.distance):' / 未限定');
      $('plot-caption').textContent='水平为实验室角 θ，竖直为观察者角 θ′，均相对所选运动轴。频率比由光行差计算；'+(probeSpectral?'光源与纹理使用假设光谱，所选 USGS 材料样本另有实测反射响应。':'光谱已关闭，此频率比仅为理论值，不用于画面。');
      drawAnglePlot(labAngle,observerAngle,photo?state.beta:0);
    }else{
      const simultaneous=!photo,emitted=hit?(simultaneous?null:state.time-hit.distance):null;
      $('probe-summary').textContent=hit?`${which} · 命中${source}。${simultaneous?'这是实验室同时几何切片，不对应一次实际拍照。':'此点的光在观察之前发出，光程按 c = 1 计算。'}`:`${which} · 光线通向远景天空；天空贴图不设有限光程。`;
      $('probe-dt-label').textContent='光程 / c';$('probe-distance').textContent=hit&&!simultaneous?finite(hit.distance)+' 时间单位':'—';
      $('probe-event-label').textContent='发射时刻 t';$('probe-time').textContent=emitted===null?'—':finite(emitted);
      $('probe-extra-label').textContent='来源';$('probe-extra').textContent=source;
      $('plot-caption').textContent=simultaneous?'俯视 x–z 投影：采样视线与同一时刻的几何位置；这不是光行时照片。':hit?'俯视 x–z 投影：实线为所选光路；运动物体仅在被命中时显示发射与观察位置。':'此方向未命中有限距离几何。';
      drawPlot(probe);
    }
    if(bounce){
      const target=bounce.ray.hit,source=target?(target.body?'运动物体 '+(target.bodyId||'A')+' · ':'')+nameOf(target.kind):'无限远天空';
      $('probe-summary').textContent='经静止理想镜面反射 · 镜中来源：'+source+'。镜面事件 t = '+finite(bounce.mirrorTime,3)+'；'+(target?'源表面事件 t = '+finite(bounce.sourceTime,3)+'，两段光程合计 '+finite(bounce.totalDistance,3)+'。':'天空不设有限发射时刻。')+' 现有 A/B 与三维直射光路图不绘制折线，镜面采样时暂不使用。';
      $('probe-dt-label').textContent='两段光程 / c';$('probe-distance').textContent=target?finite(bounce.totalDistance,3):'—';
      $('probe-event-label').textContent='镜中源事件 t';$('probe-time').textContent=target?finite(bounce.sourceTime,3):'—';
      $('probe-extra-label').textContent='镜面事件 t / 来源';$('probe-extra').textContent=finite(bounce.mirrorTime,3)+' / '+source;
      $('plot-caption').textContent='俯视 x–z：实线经过镜面点再到镜中来源；图中光线反向追踪。';drawPlot(probe,bounce);
      stage.dataset.probeMirrorTime=finite(bounce.mirrorTime,6);stage.dataset.probeMirrorSource=target?.kind||'sky';stage.dataset.probeMirrorSourceTime=target?finite(bounce.sourceTime,6):'';
    }else{delete stage.dataset.probeMirrorTime;delete stage.dataset.probeMirrorSource;delete stage.dataset.probeMirrorSourceTime;}
    if(!probeSpectral)$('probe-summary').textContent+=' 光谱已关闭；下方频率比和波长是理论值，未用于画面。';
    if(state.emissionMap)$('probe-summary').textContent+=' 发射时刻伪彩独立开启，覆盖有限表面的颜色。';
    if(state.shutter>0)$('probe-summary').textContent+=' 探针只对应快门中心时刻；画面是四个时刻的近似线性光强平均。';
    stage.dataset.probe=hit?hit.kind:'sky';stage.dataset.probeBody=hit?.body?hit.bodyId||'A':'';stage.dataset.probePhoto=String(photo);stage.dataset.probeDistance=hit?finite(hit.distance,6):'';stage.dataset.probeLabAngle=finite(labAngle,6);stage.dataset.probeObserverAngle=finite(observerAngle,6);updateSpace();
  }
  function resetMaterialPoint(){markerPoint=M.materialAnchor(state.environment,state.shape);markerCustom=false;drawnMarker=null;}
  const pointText=p=>'('+p.map(v=>finite(v,2)).join(', ')+')';
  function visibilityText(result){
    return ({visible:'可见',self:'被物体自身遮挡',world:'被场景中的'+nameOf(result.visibility.blocker)+'遮挡',outside:'画面外',behind:'相机后方',comparison:'落在对照另一侧', 'not-shown':'当前视图未显示',coincident:'与相机重合','off-surface':'未命中该表面'})[result.status]||result.status;
  }
  function updateMeasurements(drawn){
    const rect=stage.getBoundingClientRect(),event=R.eventState(drawn),clock=V.evaluate(drawn,event,M.clockAnchor(drawn.environment,drawn.shape).point,rect.width,rect.height),mark=V.evaluate(drawn,event,markerPoint,rect.width,rect.height);
    drawnMarker=mark;if(!clock||!mark){$('material-status').textContent='材料点不在当前物体表面，请重新选择。';$('clock-seen').textContent='—';return;}
    $('clock-observation').textContent=finite(drawn.time,3);$('clock-now').textContent=finite(clock.properNow,3);let seen=clock.emission;
    if(drawn.scenario==='observer'&&seen.status!=='visible'&&clock.simultaneous.status==='visible')seen=clock.simultaneous;
    const visible=seen.status==='visible',shown=visible&&!drawn.emissionMap;
    $('clock-seen').textContent=shown?finite(clock.properEmission,3):drawn.emissionMap&&visible?'伪彩覆盖':visibilityText(seen);
    $('clock-emission').textContent=shown?finite(clock.emission.time,3):'—';
    const mode=drawn.scenario==='observer'?'物体在实验室静止，运动的是观察者。':'同时切片上的钟按静止系同步约定计时；收到的节奏还受光行时和多普勒效应影响。';
    $('clock-note').textContent=mode+' 表盘一圈为 12 个固有时间单位；'+(drawn.shutter>0?'读数取快门中心，画面平均四个时刻。':'零点取物体中心在实验室 t = 0 的事件。')+' 数值取表盘中心事件；辨认还受局部遮挡、分辨率和光谱影响。';
    $('material-mode').textContent=markerCustom?'所选表面':'默认表面';$('material-rest').textContent=pointText(mark.restPoint);$('material-sim').textContent=pointText(mark.simultaneous.point);
    $('material-emit').textContent=pointText(mark.emission.point)+' / '+finite(mark.emission.time,3);
    const photoText=visibilityText(mark.emission),geomText=visibilityText(mark.simultaneous);
    $('material-status').textContent=(drawn.scenario==='observer'?'高速视野：':'照片：')+photoText+'；'+(drawn.scenario==='observer'?'静止视野：':'同时几何：')+geomText+'。'+(mark.emission.visibility.status==='visible'?'':'光锥交点被挡或未命中，不能视为收到的光。');
    const put=(id,scr,show,diagram=false)=>{const el=$(id);el.hidden=!show;if(show){el.style.left=(100*scr.x/rect.width)+'%';el.style.top=(100*scr.y/rect.height)+'%';el.classList.toggle('is-diagram',diagram);}};
    put('material-photo-marker',mark.emission.screen,mark.emission.status==='visible');
    const geom=mark.simultaneous,ghost=drawn.scenario==='flyby'&&drawn.contour&&drawn.view!=='geometry'&&geom.screen.status==='inside'&&(drawn.view!=='split'||geom.screen.x/rect.width<drawn.split);
    $('material-geometry-marker').dataset.label=drawn.scenario==='observer'?'M 静止视野':'M 同时';
    put('material-geometry-marker',geom.screen,geom.status==='visible'||ghost,geom.status!=='visible');
    Object.assign(stage.dataset,{markerStatus:mark.emission.status,markerOcclusion:mark.emission.visibility.status,markerRest:mark.restPoint.map(v=>finite(v,6)).join(','),markerEmissionTime:finite(mark.emission.time,6),markerEmissionPoint:mark.emission.point.map(v=>finite(v,6)).join(','),markerSimultaneousPoint:mark.simultaneous.point.map(v=>finite(v,6)).join(','),clockStatus:shown?'visible':(drawn.emissionMap&&visible?'false-color':seen.status),clockObservationTime:finite(drawn.time,6),clockNow:finite(clock.properNow,6),clockEmissionTime:finite(clock.emission.time,6),clockSeen:finite(clock.properEmission,6)});
  }
  function updateSpace(){
    $('open-ray-space').disabled=stage.dataset.renderPending==='true'||cameraPreview.active||(!probe&&!drawnMarker)||!!(probe&&R.traceReflection(drawnState||state,probe));
    document.querySelector('[data-diagram="light-path"]').disabled=!probe||!!R.traceReflection(drawnState||state,probe);
    if(!spaceDialog.open)return;
    if(stage.dataset.renderPending==='true'||cameraPreview.active||!drawnState){
      spaceAwaitingFrame=true;spaceModel=null;$('ray-space-observation').textContent='等待与当前参数匹配的物理帧…';$('ray-space-rays').replaceChildren();$('ray-space-marker').textContent='材料点和时间轴等待重算。';$('ray-space-delta').textContent='等待匹配事件。';$('spacetime-status').textContent='正在重算观察事件和 A/B 采样方向…';drawSpace();return;
    }
    spaceAwaitingFrame=false;spaceModel=Space.build(drawnState,probe,reference,drawnMarker);
    const position=p=>p?'('+p.map(v=>finite(v,2)).join(', ')+')':'—';
    $('ray-space-observation').textContent=spaceModel.observation?'位置 '+position(spaceModel.observation.point)+' · t = '+finite(spaceModel.observation.time,3):'先在画面中采样。';
    const list=$('ray-space-rays');list.replaceChildren();
    for(const ray of spaceModel.rays){
      const card=document.createElement('div');card.className='ray-space-ray'+(ray.id==='A'?' is-a':'');
      const title=document.createElement('strong');title.textContent=ray.id+' / '+nameOf(ray.source);card.append(title);
      const info=document.createElement('p');
      info.textContent=ray.mode==='photon'?'发射位置 '+position(ray.point)+' · t = '+finite(ray.emittedAt,3)+' · 光程 '+finite(ray.distance,3):ray.mode==='slice'?'同时几何视线：'+position(ray.point)+'，不是实际发射事件。':'无限远天空：只绘制方向，不指定距离或发射时间。';
      card.append(info);list.append(card);
    }
    const m=spaceModel.marker;
    $('ray-space-marker').textContent=m?'M：同时 '+position(m.simultaneous.point)+'；光锥交点 '+position(m.emission.point)+' / t = '+finite(m.emission.time,3)+'。'+(m.emission.visibility.status==='visible'?'该方向无遮挡（可能不在画面内）。':'光线被遮挡或不在表面，不画已收到的 M 光路。'):'';
    $('spacetime-status').textContent=(timelineNotice?timelineNotice+' ':'')+'事件 t = '+finite(spaceModel.observation.time,3)+'；'+(probe||reference?'A/B 固定屏幕方向重新求交，':'尚无 A/B 采样，')+'M 固定物体静止系坐标。';
    $('ray-space-delta').textContent=spaceModel.delta!==null?'发射时差 B − A = '+(spaceModel.delta>=0?'+':'')+finite(spaceModel.delta,3)+'；两束光抵达同一观察事件。':reference?(spaceModel.rays.length<2?'A 已固定；关闭窗口后选择 B。':'B 没有有限发射事件，不能计算时差。'):'可固定当前光线为 A，再采样 B。';
    spaceDialog.dataset.rays=String(spaceModel.rays.length);spaceDialog.dataset.delta=spaceModel.delta===null?'':finite(spaceModel.delta,6);
    for(let i=0;i<2;i++)for(const field of ['Mode','Time','Point'])delete spaceDialog.dataset['ray'+i+field];
    spaceModel.rays.forEach((ray,i)=>{spaceDialog.dataset['ray'+i+'Mode']=ray.mode;spaceDialog.dataset['ray'+i+'Time']=ray.emittedAt===null?'':finite(ray.emittedAt,6);spaceDialog.dataset['ray'+i+'Point']=ray.point?ray.point.map(v=>finite(v,6)).join(','):'';});
    drawSpace();
  }
  function drawSpace(){
    if(!spaceDialog.open)return;
    if(diagram==='light-path'){drawLightPath();return;}
    if(diagram==='slice'){
      const mode=$('slice-plane').value;
      if(!sliceCache||sliceCache.space!==spaceModel||sliceCache.mode!==mode){sliceModel=Slice.build(spaceModel,drawnState,mode);sliceCache={space:spaceModel,mode};}
      sliceCanvas.dataset.plane=mode;sliceCanvas.dataset.events=String(sliceModel.events.length);sliceCanvas.dataset.inSlice=String(sliceModel.events.filter(e=>e.inSlice).length);sliceCanvas.dataset.intersections=String(sliceModel.near.filter(Boolean).length+sliceModel.far.filter(Boolean).length);
      const missing=['A','B','M','当前'].includes(mode)&&!sliceModel.basis?.selection;
      $('slice-status').textContent=!sliceModel.observation?'等待与画面一致的物理事件…':(missing?'所选事件不可用，暂用 xz 切片。':'')+(sliceModel.events.length?sliceModel.events.map(e=>e.id+'：'+(e.inSlice?'位于切片'+(e.kind==='blocked'?'（遮挡）':e.kind==='simultaneous'?'（同时事件）':''):'切片外，法向偏移 '+finite(e.offset,3))).join('；'):'尚无有限 A/B/M 事件。');
      sliceCanvas.dataset.draws=String((Number(sliceCanvas.dataset.draws)||0)+1);Slice.draw(sliceCanvas,sliceModel,spaceView);return;
    }
    if(diagram==='spacetime'){
      const projected=Spacetime.build(spaceModel,$('spacetime-axis').value);spacetimeCanvas.dataset.axis=$('spacetime-axis').value;spacetimeCanvas.dataset.events=String(projected.events.length);spacetimeCanvas.dataset.photons=String(projected.photons.length);spacetimeCanvas.dataset.observationTime=projected.observation?finite(projected.observation.time,6):'';
      spacetimeCanvas.dataset.draws=String((Number(spacetimeCanvas.dataset.draws)||0)+1);Spacetime.draw(spacetimeCanvas,projected);return;
    }
    spaceCanvas.dataset.yaw=finite(spaceView.yaw,5);spaceCanvas.dataset.pitch=finite(spaceView.pitch,5);spaceCanvas.dataset.zoom=finite(spaceView.zoom,5);
    spaceCanvas.dataset.draws=String((Number(spaceCanvas.dataset.draws)||0)+1);
    Space.draw(spaceCanvas,spaceModel||{observation:null,rays:[]},spaceView);
  }
  function drawLightPath(){
    if(!pathContext){$('light-path-status').textContent='请先在主画面采样一束光。';return;}
    const t=Number($('light-path-time').value),s={...pathContext.state,time:t},p=pathContext;
    const ray=R.trace(s,p.u*p.width,p.v*p.height,p.width,p.height),path=LightPath.build(s,ray),model=Space.build(s,ray,null);
    model.lightPath=path;Space.draw(spaceCanvas,model,spaceView);$('light-path-time-value').textContent=finite(t,2);
    const at=path.surface?'表面 t = '+finite(path.surfaceTime,3)+' → 观察 t = '+finite(path.observationTime,3)+'。 ':'';
    const detail=path.status==='lit'?(path.lightKind==='point'?'主光发出 t = '+finite(path.sourceTime,3)+'，光程 '+finite(path.incomingDistance,3)+'。':'平行光来自无限远，图中只画局部方向，不定义光源发出时刻。'):path.status==='blocked'?'反向光路在 '+(path.blockerBody?'运动物体 '+path.blockerBody+' · ':'')+nameOf(path.blocker)+' 终止，遮挡 t = '+finite(path.blockerTime,3)+'；主光没有直达表面。':path.reason||'当前方向没有有限表面。';
    $('light-path-status').textContent=at+detail;
    Object.assign(spaceCanvas.dataset,{pathStatus:path.status,pathTime:finite(t,6),pathSurfaceTime:path.surface?finite(path.surfaceTime,6):'',pathBlockTime:path.blockerTime==null?'':finite(path.blockerTime,6),pathSourceTime:path.sourceTime==null?'':finite(path.sourceTime,6),pathBlocker:path.blocker||'',draws:String((Number(spaceCanvas.dataset.draws)||0)+1)});
  }
  function stopPath(){pathPlaying=false;pathLast=0;if(pathFrame)cancelAnimationFrame(pathFrame);pathFrame=0;$('light-path-play').textContent='播放光路';}
  function animatePath(now){
    pathFrame=0;if(!pathPlaying||!spaceDialog.open||diagram!=='light-path'){stopPath();return;}
    if(pathLast){const range=$('light-path-time'),next=Number(range.value)+Math.min((now-pathLast)/1000,.08)*.65;range.value=next>Number(range.max)?range.min:next;drawLightPath();}
    pathLast=now;pathFrame=requestAnimationFrame(animatePath);
  }
  $('light-path-time').addEventListener('input',()=>{stopPath();drawSpace();});
  $('light-path-play').addEventListener('click',()=>{if(pathPlaying)stopPath();else{pathPlaying=true;pathLast=0;$('light-path-play').textContent='暂停光路';pathFrame=requestAnimationFrame(animatePath);}});
  $('light-path-reset').addEventListener('click',()=>{stopPath();if(pathContext){$('light-path-time').value=pathContext.state.time;drawSpace();}});
  function changeSpace(action){
    if(action==='left')spaceView.yaw-=.17;else if(action==='right')spaceView.yaw+=.17;
    else if(action==='up')spaceView.pitch=clamp(spaceView.pitch+.13,.12,1.35);else if(action==='down')spaceView.pitch=clamp(spaceView.pitch-.13,.12,1.35);
    else if(action==='zoom-in')spaceView.zoom=clamp(spaceView.zoom*1.15,.55,2.2);else if(action==='zoom-out')spaceView.zoom=clamp(spaceView.zoom/1.15,.55,2.2);
    else if(action==='reset')spaceView={yaw:-.7,pitch:.55,zoom:1.25};drawSpace();
  }
  $('open-ray-space').addEventListener('click',()=>{
    if(!probe&&!drawnMarker)return;if(state.playing){state.time=drawnTime;pause();update();markDirty();}if(typeof spaceDialog.showModal==='function')spaceDialog.showModal();else spaceDialog.setAttribute('open','');
    updateSpace();requestAnimationFrame(drawSpace);
    if(document.fonts&&document.fonts.load)document.fonts.load('600 12px "Noto Sans SC Variable"','观察发射同时视线无限远方向物体空间切片向上为未来').then(drawSpace).catch(()=>{});
  });
  $('close-ray-space').addEventListener('click',()=>{stopPath();if(typeof spaceDialog.close==='function')spaceDialog.close();else spaceDialog.removeAttribute('open');});
  spaceDialog.addEventListener('close',stopPath);
  document.querySelectorAll('button[data-diagram]').forEach(button=>button.addEventListener('click',()=>{
    stopPath();diagram=button.dataset.diagram;const isTime=diagram==='spacetime',isSlice=diagram==='slice',isPath=diagram==='light-path';for(const b of document.querySelectorAll('button[data-diagram]'))b.setAttribute('aria-pressed',String(b===button));
    if(isPath&&probe&&drawnState){pathContext={state:{...drawnState,playing:false},u:probe.x/probe.width,v:probe.y/probe.height,width:probe.width,height:probe.height};const range=$('light-path-time');range.min=drawnState.scenario==='observer'?'0':'-3';range.max=drawnState.scenario==='observer'?'8':'3';range.value=drawnState.time;}
    spaceCanvas.hidden=isTime||isSlice;spacetimeCanvas.hidden=!isTime;sliceCanvas.hidden=!isSlice;$('ray-space-toolbar').hidden=isTime;$('space-hint').hidden=isTime;$('spacetime-controls').hidden=!isTime;$('slice-controls').hidden=!isSlice;$('light-path-controls').hidden=!isPath;requestAnimationFrame(drawSpace);
  }));
  $('spacetime-axis').addEventListener('change',drawSpace);$('slice-plane').addEventListener('change',drawSpace);
  function timelinePosition(sample){return sample?{u:sample.x/sample.width,v:sample.y/sample.height,aspect:sample.width/sample.height}:null;}
  function changeTimeline(e){
    const saved=pendingTimeAnchors?.data||{current:timelinePosition(probe),reference:timelinePosition(reference)};pendingTimeAnchors=null;timelineNotice='';pause();clearProbe();state.time=Number(e.target.value);markDirty();pendingTimeAnchors={revision,data:saved};update();
  }
  $('spacetime-time').addEventListener('input',changeTimeline);$('slice-time').addEventListener('input',changeTimeline);
  function restoreTimelineSamples(saved){
    const rect=renderer.canvas.getBoundingClientRect(),aspect=rect.width/rect.height;let skipped=false;
    const restore=p=>{if(!p)return null;if(Math.abs(p.aspect/aspect-1)>.005){skipped=true;return null;}const x=p.u*rect.width,y=p.v*rect.height,ray=R.trace(drawnState,x,y,rect.width,rect.height);return {...ray,x,y,width:rect.width,height:rect.height};};
    probe=restore(saved.current);reference=restore(saved.reference);if(probe&&reference&&Math.abs(probe.x-reference.x)<.001&&Math.abs(probe.y-reference.y)<.001)reference=probe;
    for(const [id,sample] of [['probe-marker',probe],['reference-marker',reference]]){const el=$(id);el.hidden=!sample;if(sample){el.style.left=(100*sample.x/sample.width)+'%';el.style.top=(100*sample.y/sample.height)+'%';}}
    timelineNotice=skipped?'画布比例已变化，请重新采样 A/B。':'';update();if(probe){probeRefreshRevision=revision;requestProbeSpectrum(drawnState||state);}
  }
  document.querySelectorAll('[data-space-action]').forEach(button=>button.addEventListener('click',()=>changeSpace(button.dataset.spaceAction)));
  for(const canvas of [spaceCanvas,sliceCanvas]){
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;spaceDrag={x:event.clientX,y:event.clientY,yaw:spaceView.yaw,pitch:spaceView.pitch};canvas.setPointerCapture(event.pointerId);});
    canvas.addEventListener('pointermove',event=>{if(!spaceDrag)return;spaceView.yaw=spaceDrag.yaw+(event.clientX-spaceDrag.x)*.008;spaceView.pitch=clamp(spaceDrag.pitch+(event.clientY-spaceDrag.y)*.006,.12,1.35);drawSpace();});
  for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{spaceDrag=null;});
    canvas.addEventListener('wheel',event=>{event.preventDefault();changeSpace(event.deltaY<0?'zoom-in':'zoom-out');},{passive:false});
    canvas.addEventListener('keydown',event=>{
    const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down','+':'zoom-in','=':'zoom-in','-':'zoom-out',Home:'reset'}[event.key];
    if(action){event.preventDefault();changeSpace(action);}
  });
  }
  if('ResizeObserver'in window){const observer=new ResizeObserver(()=>{if(spaceDialog.open)drawSpace();});observer.observe(spaceCanvas);observer.observe(spacetimeCanvas);observer.observe(sliceCanvas);}

  function requestProbeSpectrum(drawn){
    if(!probe||!drawn||!renderer)return;
    const id=++probeSpectrumSeq,p=probe,requestedRevision=revision,width=Math.max(1,renderer.canvas.width),height=Math.max(1,renderer.canvas.height);
    probeSpectrum=null;stage.dataset.spectrumSample='pending';spectrumKey='';updateSpectrum();
    if(!renderer.requestSpectrum){stage.dataset.spectrumSample='unavailable';spectrumKey='';updateSpectrum();return;}
    renderer.requestSpectrum({...drawn,playing:false,interacting:false},p.x/p.width,p.y/p.height,width,height,(error,result)=>{
      if(id!==probeSpectrumSeq||!probe||requestedRevision!==revision)return;
      if(error||!result?.rgb){stage.dataset.spectrumSample='unavailable';probeSpectrum=null;}
      else{
        const x=result.pixel[0]+.5,y=result.pixel[1]+.5,primary=R.trace(drawn,x,y,result.width,result.height),bounce=R.traceReflection(drawn,primary),ray=bounce?.ray||primary;
        probeSpectrum={...result,ray,reflected:!!bounce,x,y};stage.dataset.spectrumSample='ready';
      }
      spectrumKey='';updateSpectrum();
    });
  }
  function updateSpectrum(){
    const selected=probeSpectrum?.ray||probe,measured=selected?O.frequencyRatio(state,selected):null,active=probeSpectrum?R.spectralAt(state,probeSpectrum.x,probeSpectrum.width):probe?R.spectralAt(state,probe.x,probe.width):state.doppler;
    const D=active&&measured!==null?measured:1;
    // Cache the expensive 501-point graph during unchanged playback/drag HUD updates.
    const factors=selected?O.frequencyFactors(state,selected):null;
    const key=[state.spectrumModel,state.temperature,state.lineWavelength,D,measured===null,!!probe,active,state.spectrumSplit,state.surfaceMode,state.materialSpectrum,!!selected?.hit?.body,state.emissionMap,stage.dataset.spectrumSample||'none',probeSpectrum?.rgb?.join(',')].join('/');
    if(key===spectrumKey)return;spectrumKey=key;
    const c=$('spectrum-plot'),ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#192b30';ctx.fillRect(0,0,w,h);
    c.dataset.draws=String(Number(c.dataset.draws||0)+1);ctx.font='9px monospace';ctx.fillStyle='#b9cbc3';
    // Until the renderer readback completes, show the explicitly labelled unit
    // reference; never call an unsampled RGB curve a measured material spectrum.
    const sampled=probeSpectrum,comparison=ProbeSpectrum.build(state,{ray:sampled?.ray||null,factors:sampled?factors:null,rgb:sampled?.rgb||null,active:!!active}),x=nm=>20+(nm-200)/1000*229,y=value=>111-(comparison.peak?value/comparison.peak:0)*91;
    ctx.fillStyle='rgba(205,224,209,.10)';ctx.fillRect(x(380),14,x(780)-x(380),97);ctx.strokeStyle='#607873';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(20,12);ctx.lineTo(20,111);ctx.lineTo(249,111);ctx.stroke();
    for(const [field,color,width,dash] of [['observed','#f4ae7d',2.5,[]],['emitted','#81dcd0',1.5,[4,3]]]){
      ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();comparison.samples.forEach((sample,i)=>{const X=x(sample.wavelength),Y=y(sample[field]);if(!i)ctx.moveTo(X,Y);else ctx.lineTo(X,Y);});ctx.stroke();
    }
    if(comparison.material){
      for(const valid of comparison.measured?[true,false]:[true]){ctx.strokeStyle=valid?'#b9e68f':'#668071';ctx.lineWidth=1;ctx.setLineDash(valid?[2,3]:[1,4]);ctx.beginPath();let drawing=false;
        comparison.samples.forEach(sample=>{const include=!comparison.measured||sample.inMeasuredBand===valid,X=x(sample.wavelength),Y=111-sample.response*91;if(include){if(drawing)ctx.lineTo(X,Y);else ctx.moveTo(X,Y);drawing=true;}else drawing=false;});ctx.stroke();}
    }
    ctx.setLineDash([]);ctx.fillStyle='#b9cbc3';ctx.fillText('200',15,125);ctx.fillText('380',x(380)-9,125);ctx.fillText('780',x(780)-9,125);ctx.fillText('1200 nm',211,125);
    const label=comparison.model==='rgb'?(sampled?'采样像素 RGB 假设谱':'RGB 假设谱（单位线性白）'):comparison.model==='blackbody'?'黑体 '+comparison.temperature+' K':'高斯谱线 '+finite(comparison.line,1)+' nm';
    const material=comparison.material?' · '+(comparison.measured?'USGS 实测 '+window.RelativityMaterialSpectrum.sampleLabels[comparison.material]:'假设 '+({fabric:'布料',wood:'木材',metal:'金属'})[comparison.material])+' 响应':'';
    let note;
    if(!sampled){
      if(probe&&measured===null)note='（同时几何不是照片；D = 1 仅供参考'+(!active?'，此侧光谱已关闭':'')+'）';
      else if(probe)note='（'+(stage.dataset.spectrumSample==='unavailable'?'采样读取不可用，显示参考':'正在读取采样像素；当前为参考')+(!active?'；此侧光谱已关闭':'')+'）';
      else if(state.spectrumSplit)note='（光谱开 / 关对照；先采样任一侧，当前示范 D = 1）';
      else note=active?'（先采样光线；当前示范 D = 1）':'（光谱已关闭；先采样光线，D = 1 参考不用于画面）';
    }else note=measured===null?'（同时几何不是照片；D = 1 仅供参考）':!active?'（此侧光谱已关闭；D = 1 参考，不用于画面）':comparison.body?(state.surfaceMode==='reflection'?'（入射 × 出射频移）':'（表面自发光频移参考）'):'（该表面的 RGB 假设，并非实测）';
    const range=comparison.clamped?' 理论 D = '+finite(comparison.theoretical,3)+'；画面与曲线限制在 0.1–10。':'';
    const falseColor=state.emissionMap?' 发射时刻伪彩独立开启并覆盖颜色。':'';
    const band=comparison.measured?' 可见区按波长长度计算，实测覆盖约 '+Math.round(100*comparison.coverage)+'%；其余为端点外推。':'';
    $('spectrum-status').textContent=(sampled?.reflected?'镜中来源 · ':'')+label+material+' · D = '+finite(comparison.D,3)+note+range+band+falseColor;
    stage.dataset.spectrumD=finite(comparison.D,6);c.dataset.model=comparison.model;c.dataset.samples=String(comparison.samples.length);c.dataset.material=comparison.material||'';c.dataset.measured=String(comparison.measured);c.dataset.coverage=comparison.coverage===null?'':finite(comparison.coverage,4);

  }

  function plotBase(){
    plotCtx.clearRect(0,0,260,118);plotCtx.fillStyle='#192b30';plotCtx.fillRect(0,0,260,118);
    plotCtx.strokeStyle='#425856';plotCtx.lineWidth=1;plotCtx.beginPath();plotCtx.moveTo(23,10);plotCtx.lineTo(23,99);plotCtx.lineTo(250,99);plotCtx.stroke();
    plotCtx.font='9px "Noto Sans SC Variable", monospace';plotCtx.fillStyle='#aebfbb';
  }
  function drawPlot(p,bounce=null){
    plotBase();plotCtx.fillText('x →',231,112);plotCtx.fillText('z',9,13);
    if(!p){plotCtx.fillStyle='#bdd0c7';plotCtx.fillText('SELECT A RAY',94,58);return;}
    const body=p.hit&&(p.hit.body||p.hit.kind==='cube'||p.hit.kind==='sphere'),emissionCenter=body&&p.photo&&p.hit.centerAtEmission,bodyCenter=p.hit?.bodyId==='B'&&p.second?p.second.center:p.center;
    const coords=[p.camera];if(body)coords.push(bodyCenter);if(p.hit)coords.push(p.hit.point);if(emissionCenter)coords.push(emissionCenter);if(bounce?.ray.hit)coords.push(bounce.ray.hit.point);
    let xmin=Math.min(...coords.map(a=>a[0]))-1.7,xmax=Math.max(...coords.map(a=>a[0]))+1.7,zmin=Math.min(...coords.map(a=>a[2]))-1,zmax=Math.max(...coords.map(a=>a[2]))+1.7;
    if(xmax-xmin<3)xmax=xmin+3;if(zmax-zmin<3)zmax=zmin+3;
    const xy=v=>[26+(v[0]-xmin)/(xmax-xmin)*218,96-(v[2]-zmin)/(zmax-zmin)*82];
    function point(v,color,r=3){const [x,y]=xy(v);plotCtx.fillStyle=color;plotCtx.beginPath();plotCtx.arc(x,y,r,0,2*Math.PI);plotCtx.fill();}
    function line(a,b,color,dash=[]){const A=xy(a),B=xy(b);plotCtx.setLineDash(dash);plotCtx.strokeStyle=color;plotCtx.lineWidth=1.5;plotCtx.beginPath();plotCtx.moveTo(...A);plotCtx.lineTo(...B);plotCtx.stroke();plotCtx.setLineDash([]);}
    if(p.hit){line(p.camera,p.hit.point,'#e8c5a6');point(p.hit.point,'#f8e3c9');}
    if(bounce?.ray.hit){line(p.hit.point,bounce.ray.hit.point,'#8cded1');point(bounce.ray.hit.point,'#8cded1');}
    if(emissionCenter){line(emissionCenter,bodyCenter,'#87c2c2',[3,3]);point(emissionCenter,'#88c9c7');}
    if(body)point(bodyCenter,'#ebaa85');point(p.camera,'#f6ebd7',4);
    plotCtx.fillStyle='#e8c5a6';plotCtx.fillText(body&&!p.photo?'采样方向':'所选光路',31,15);if(emissionCenter){plotCtx.fillStyle='#88c9c7';plotCtx.fillText('发射中心',100,15);}if(body){plotCtx.fillStyle='#ebaa85';plotCtx.fillText('当前中心',173,15);}
  }
  function drawAnglePlot(labAngle,observerAngle,beta){
    plotBase();plotCtx.fillText('θ',246,111);plotCtx.fillText('θ′',4,12);plotCtx.fillText('0',13,110);plotCtx.fillText('π',238,110);plotCtx.fillText('π',8,20);
    plotCtx.strokeStyle='#607574';plotCtx.setLineDash([3,3]);plotCtx.beginPath();plotCtx.moveTo(23,99);plotCtx.lineTo(247,12);plotCtx.stroke();plotCtx.setLineDash([]);
    plotCtx.beginPath();plotCtx.strokeStyle='#eac29f';plotCtx.lineWidth=2;
    for(let i=0;i<=100;i++){const th=Math.PI*i/100,prime=Math.acos(clamp((Math.cos(th)+beta)/(1+beta*Math.cos(th)),-1,1)),x=23+i/100*224,y=99-prime/Math.PI*87;if(i===0)plotCtx.moveTo(x,y);else plotCtx.lineTo(x,y);}plotCtx.stroke();
    const x=23+labAngle/Math.PI*224,y=99-observerAngle/Math.PI*87;plotCtx.fillStyle='#acd7d0';plotCtx.beginPath();plotCtx.arc(x,y,3.5,0,2*Math.PI);plotCtx.fill();
  }
  const mobileDock=window.matchMedia('(max-width: 620px)');
  function setDockCollapsed(collapsed){const closed=!!collapsed&&mobileDock.matches;$('dock-content').hidden=closed;$('experiment-dock').classList.toggle('dock-collapsed',closed);workbench.classList.toggle('dock-collapsed',closed);$('toggle-dock').setAttribute('aria-expanded',String(!closed));$('toggle-dock').textContent=closed?'展开底部控制区 ⌃':'收起底部控制区 ⌄';measureDock();}
  $('toggle-dock').addEventListener('click',()=>setDockCollapsed(!$('dock-content').hidden));
  if(mobileDock.addEventListener)mobileDock.addEventListener('change',()=>{if(!mobileDock.matches)setDockCollapsed(false);});
  function measureDock(){if(!mobileDock.matches)return;const a=$('experiment-dock').getBoundingClientRect(),b=$('toggle-dock').getBoundingClientRect();workbench.style.setProperty('--dock-clearance',Math.max(58,Math.min(innerHeight-112,Math.ceil(innerHeight-Math.min(a.top,b.top)+10)))+'px');}
  if('ResizeObserver'in window){const dockObserver=new ResizeObserver(measureDock);dockObserver.observe($('experiment-dock'));dockObserver.observe($('toggle-dock'));}window.addEventListener('resize',measureDock);measureDock();
  window.RelativityComparisonUI.create({getCurrent(){
    if(state.playing){pause();update();markDirty();}
    return {parameters:Experiments.parameters(state),event:R.eventState(state)};
  }});
  if(document.fonts?.load)document.fonts.load('600 11px "Noto Sans SC Variable"','实验室方向').catch(()=>{});
  update();markDirty();
})().catch(error=>{
  const stage=document.getElementById('relativity-stage'),loading=document.getElementById('scene-loading');
  if(stage)stage.dataset.status='error';if(loading)loading.textContent='场景加载失败：'+(error&&error.message||error);
  console.error('Relativity initialization failed:',error);
});
