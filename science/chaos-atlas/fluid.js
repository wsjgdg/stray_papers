(function () {
  'use strict';
  const $ = id => document.getElementById(id), api = window.VortexFluid, analysis=window.FluidAnalysis, THREE = window.THREE;
  const stage = $('fluid-stage'), canvas = $('fluid-scene'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const GRID = { quick: {nx:36,ny:24,nz:24,h:.2}, standard: {nx:48,ny:32,nz:32,h:.15}, high: {nx:72,ny:48,nz:48,h:.1} };
  const PRESET_NOTES = {
    chase:'两环同向追逐；染料先后交换不单独证明涡核穿越。',
    opposed:'等强反向环流使两环迎面靠近；继续计算不代表已验证真实重联。',
    unequal:'前后环流与半径不等，比较不同强度下的初态相互作用。',
    close:'初始间距缩短至 0.50，染料更早靠近并可能互相覆盖。',
    smallChase:'后方 A 环较小、前方 B 环较大；观察两种染料的追近与交错。',
    largeChase:'后方 A 环较大、前方 B 环较小；初期可能拉开，随后仍受相互作用和墙壁影响。',
    offset:'相向环流大小不等；观察接近过程中的非对称运动与整体漂移。',
    wide:'半径较大、环流较弱；与「小环快行」比较同一时间的迁移。',
    narrow:'半径较小、环流较强；与「大环慢行」比较同一时间的迁移。',
    symmetric:'初始三维速度扰动为零；染料仍不均匀，盒壁与网格也会影响对称。',
    perturbed:'三维扰动设为 0.080；与「零扰对照」比较，不代表湍流或真实重联。',
    viscous:'黏度 ν=0.030；对照「同向追逐」的 ν=0.006，观察速度场的黏性衰减。',
    custom:'当前初态或黏度已自定义；选择预设会重新建立初态。'
  };
  const state = {
    initial: api ? { ...api.PRESETS.chase } : null, preset:'chase', viscosity:api && api.PRESET_VISCOSITY ? api.PRESET_VISCOSITY.chase : .006, quality:matchMedia('(max-width: 520px)').matches ? 'quick' : 'standard', dt:.04, iterations:32,
    playing:!reduced.matches, speed:1, ready:false, failed:false, busy:false, generation:0, note:'equations',
    width:0, height:0, dpr:0, renderScale:1, renderQuality:'auto', renderMode:'contour', contourLevel:.4,
    slowFrames:0, slowTicks:0, fastFrames:0, lastRender:0,
    dirty:true, checked:false, drag:null, accumulator:0, lastFrame:0, timer:null,
    slice:{enabled:false,axis:'z',position:0,arrows:true,version:0,timer:null,data:null},
    force:{mode:'orbit',strength:1.8,radius:.55,pending:null,applied:0},
    compare:{metric:'gap',current:null,reference:null,currentImage:null,currentImageTime:null,pendingMeta:null},
    camera:{yaw:.58,pitch:.20,distance:12}, follow:true, targetX:0, stats:null, dimensions:null, pendingInitial:null, activeInitial:null
  };
  let renderer=null, scene=null, camera=null, volume=null, texture=null, worker=null, workerUrl=null, wire=null;
  let sliceGroup=null,slicePlane=null,sliceTexture=null,sliceLines=null,sliceBorder=null,forceMarker=null;
  let pointerRay=null;

  function fail(message) {
    state.failed=true; state.ready=false; state.playing=false; state.busy=false;
    if (worker) { worker.terminate(); worker=null; }
    if (workerUrl) { URL.revokeObjectURL(workerUrl); workerUrl=null; }
    $('stage-error-text').textContent=message; $('stage-error').hidden=false;
    stage.dataset.renderer='unavailable'; $('stage-notice').hidden=true;
    document.querySelectorAll('#control-panel input, #control-panel select, #control-panel button[data-preset], #control-panel button[data-orientation], #control-panel button[data-render-mode], #control-panel button[data-tool], #slice-toggle, #force-center, [data-speed], #reset-view, #save-image, [data-try-preset]').forEach(el=>{el.disabled=true;});
    updatePlayback();
  }
  function updatePlayback() {
    $('play').disabled=state.failed || !state.ready; $('step').disabled=state.failed || !state.ready || state.playing || state.busy;
    $('step').setAttribute('aria-label','单步推进 '+state.dt.toFixed(2)+' 模拟时间');$('step').title='单步推进 '+state.dt.toFixed(2);
    $('reset').disabled=state.failed || !state.ready;
    $('save-reference').disabled=state.failed || !analysis || !state.ready || !state.compare.current || !state.compare.current.points.length;
    $('force-center').disabled=state.failed || !state.ready || state.force.mode!=='force';
    $('play-text').textContent=state.playing ? '暂停' : '播放'; $('play-symbol').textContent=state.playing ? 'Ⅱ' : '▶';
    $('play').setAttribute('aria-label',state.playing ? '暂停模拟' : '播放模拟');
    const status=state.failed ? '流体不可用' : !state.ready ? '正在计算初态' : state.playing ? '流体计算中' : '实验已暂停';
    $('header-status').textContent=status; $('stage-status').textContent=state.failed ? 'SOLVER UNAVAILABLE' : !state.ready ? 'SOLVER INITIALIZING' : state.playing ? 'SOLVER RUNNING' : 'SOLVER PAUSED';
    stage.classList.toggle('paused',!state.playing); document.querySelector('.top-status').classList.toggle('paused',!state.playing);
  }
  function setPlaying(value) {
    if (state.failed || !state.ready) return;
    state.playing=Boolean(value); state.accumulator=0; state.lastFrame=0;
    // When paused, restore the automatic preview's detail for inspection;
    // a slow renderer must not leave a stationary image permanently blurry.
    if (!state.playing && state.renderQuality==='auto') { state.renderScale=1; resize(); }
    state.dirty=true; updatePlayback();
  }
  function progress(input) {
    const p=100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min));
    input.style.setProperty('--progress',Math.max(0,Math.min(100,p))+'%');
  }
  function updateControls() {
    if (!state.initial) return;
    const p=state.initial;
    for (const [id,value,digits] of [['radius-a',p.radiusA,2],['radius-b',p.radiusB,2],['separation',p.gap,2],
      ['gamma-a',Math.abs(p.gammaA),2],['gamma-b',Math.abs(p.gammaB),2],['viscosity',state.viscosity,3],['perturbation',p.perturbation||0,3]]) {
      const input=$(id); input.value=String(value); $(id+'-value').textContent=value.toFixed(digits); progress(input);
    }
    $('grid-quality').value=state.quality;$('time-step').value=state.dt.toFixed(2);$('pressure-iterations').value=String(state.iterations); $('follow-dye').checked=state.follow; updateZoom();
    document.querySelectorAll('[data-preset]').forEach(button=>{ const active=button.dataset.preset===state.preset; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
    const presetNote=PRESET_NOTES[state.preset] || PRESET_NOTES.custom;
    if ($('preset-description').textContent!==presetNote) $('preset-description').textContent=presetNote;
    document.querySelectorAll('[data-orientation]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.orientation==='same') === (p.gammaB>0))));
    document.querySelectorAll('[data-speed]').forEach(button=>{const active=Number(button.dataset.speed)===state.speed;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    updateDisplayControls(); updateSliceControls(); updateToolControls();
  }
  function updateDisplayControls() {
    document.querySelectorAll('[data-render-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.renderMode===state.renderMode)));
    const threshold=$('contour-level'); threshold.value=String(Math.round(100*state.contourLevel));
    threshold.disabled=state.failed || state.renderMode!=='contour'; progress(threshold);
    $('contour-level-value').textContent=threshold.value+'%'; $('render-quality').value=state.renderQuality;
    $('render-description').textContent=state.renderMode==='contour' ? '等浓度轮廓 + 体积 · 并非固体表面' : '被动染料 · 柔和体积累积';
    if (volume) { volume.material.uniforms.displayMode.value=state.renderMode==='contour' ? 1 : 0; volume.material.uniforms.contourLevel.value=state.contourLevel; }
    state.dirty=true;
  }
  function sliceSpec() {
    const s=state.slice; return s.enabled ? {axis:s.axis,position:s.position,version:s.version} : null;
  }
  function sliceCoordinate() {
    const s=state.slice, grid=GRID[state.quality], n=s.axis==='x'?grid.nx:s.axis==='y'?grid.ny:grid.nz;
    const index=Math.max(0,Math.min(n-1,Math.round((s.position+1)*n*.5-.5)));
    return (index+.5-n/2)*grid.h;
  }
  function updateSliceControls() {
    const s=state.slice, enabled=s.enabled && !state.failed;
    $('slice-toggle').setAttribute('aria-pressed',String(s.enabled));
    $('slice-toggle').textContent=s.enabled?'◈　隐藏涡量剖面':'◈　显示涡量剖面';
    $('slice-axis').value=s.axis; $('slice-axis').disabled=!enabled;
    $('slice-position').value=String(Math.round(100*s.position)); $('slice-position').disabled=!enabled; progress($('slice-position'));
    $('slice-arrows').checked=s.arrows; $('slice-arrows').disabled=!enabled;
    $('slice-position-value').textContent=s.axis.toUpperCase()+' = '+sliceCoordinate().toFixed(2);
    $('field-hud').hidden=!enabled;
    $('field-hud-value').textContent='剖面 '+s.axis.toUpperCase()+' = '+sliceCoordinate().toFixed(2);
    if (sliceGroup) sliceGroup.visible=enabled && !!s.data && s.data.version===s.version;
    if (sliceLines) sliceLines.visible=s.arrows;
    if (!s.enabled) $('slice-readout').textContent='开启后读取当前速度网格的剖面。';
    else if (!s.data || s.data.version!==s.version) $('slice-readout').textContent='正在读取当前速度网格…';
    state.dirty=true;
  }
  function updateToolControls() {
    const f=state.force, active=f.mode==='force' && !state.failed;
    document.querySelectorAll('button[data-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tool===f.mode)));
    for(const [id,value,digits] of [['force-strength',f.strength,1],['force-radius',f.radius,2]]) {
      $(id).value=String(value);$(id).disabled=!active;$(id+'-value').textContent=value.toFixed(digits);progress($(id));
    }
    $('force-center').disabled=!active || !state.ready;canvas.classList.toggle('push-tool',active);stage.dataset.tool=f.mode;
    $('stage-instruction').textContent=active?'拖动在剖面上推流 · 滚轮缩放':'↔ 拖动旋转 · 滚轮缩放';
    canvas.setAttribute('aria-label',active?'三维流体推流模式。沿当前剖面拖动施加外力；控制台可试推、改变强度和半径。方向键旋转视角，空格播放或暂停。':'三维流体体积图。拖动旋转，滚轮或控制台缩放；方向键旋转，加减号缩放，空格播放或暂停。');
    if (!active && forceMarker) forceMarker.visible=false;
    state.dirty=true;
  }
  function pointOnSlice(event) {
    if (!pointerRay || !camera || !state.slice.enabled || !state.slice.data || state.slice.data.version!==state.slice.version) return null;
    updateCamera();const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*2-1,y=1-(event.clientY-rect.top)/rect.height*2;
    pointerRay.setFromCamera(new THREE.Vector2(x,y),camera);
    const axis=state.slice.axis,normal=axis==='x'?new THREE.Vector3(1,0,0):axis==='y'?new THREE.Vector3(0,1,0):new THREE.Vector3(0,0,1);
    const coord=sliceCoordinate(),plane=new THREE.Plane(normal,-coord),point=pointerRay.ray.intersectPlane(plane,new THREE.Vector3());
    if (!point || Math.abs(point.x)>3.6 || Math.abs(point.y)>2.4 || Math.abs(point.z)>2.4) return null;
    return point;
  }
  function moveForceMarker(point) {
    if (!forceMarker || !sliceGroup || !point) return;
    sliceGroup.updateMatrixWorld(true);const local=sliceGroup.worldToLocal(point.clone());
    forceMarker.position.set(local.x,local.y,.03);forceMarker.scale.setScalar(state.force.radius);forceMarker.visible=true;state.dirty=true;
  }
  function queueForce(center,direction) {
    if (!state.ready || state.failed || state.force.mode!=='force') return;
    if (Math.hypot(direction.x,direction.y,direction.z)<1e-8) return;
    state.force.pending={center:[center.x,center.y,center.z],direction:[direction.x,direction.y,direction.z],strength:state.force.strength,radius:state.force.radius};
    if (!state.playing && !state.busy) requestStep();
  }
  function scheduleSlice() {
    clearTimeout(state.slice.timer);
    state.slice.timer=setTimeout(()=>{
      if (worker && !state.failed && state.slice.enabled) worker.postMessage({type:'slice',generation:state.generation,slice:sliceSpec()});
    },50);
  }
  function showSlice(slice) {
    const s=state.slice;
    if (!slice || !s.enabled || slice.version!==s.version || !sliceGroup || state.stats && slice.time+1e-8<state.stats.time) return;
    if (!Number.isInteger(slice.width) || !Number.isInteger(slice.height) || !Number.isFinite(slice.maxVorticity) || !Number.isFinite(slice.maxPlaneSpeed)) throw new Error('无效的速度剖面');
    const values=new Float32Array(slice.values), count=slice.width*slice.height;
    if (values.length!==count*3) throw new Error('无效的速度剖面长度');
    let rgba;
    if (!sliceTexture || sliceTexture.image.width!==slice.width || sliceTexture.image.height!==slice.height) {
      if (sliceTexture) sliceTexture.dispose();
      rgba=new Uint8Array(count*4);sliceTexture=new THREE.DataTexture(rgba,slice.width,slice.height,THREE.RGBAFormat,THREE.UnsignedByteType);
      sliceTexture.minFilter=THREE.LinearFilter;sliceTexture.magFilter=THREE.LinearFilter;sliceTexture.generateMipmaps=false;sliceTexture.colorSpace=THREE.SRGBColorSpace;
      slicePlane.material.map=sliceTexture;slicePlane.material.needsUpdate=true;
    } else rgba=sliceTexture.image.data;
    const low=[14,36,45],mid=[52,150,141],high=[247,190,112], max=Math.max(slice.maxVorticity,1e-12);
    for(let i=0;i<count;i++) {
      const t=Math.sqrt(Math.max(0,Math.min(1,values[3*i]/max))), a=t<.55?low:mid, b=t<.55?mid:high, f=t<.55?t/.55:(t-.55)/.45, q=4*i;
      rgba[q]=Math.round(a[0]+(b[0]-a[0])*f);rgba[q+1]=Math.round(a[1]+(b[1]-a[1])*f);rgba[q+2]=Math.round(a[2]+(b[2]-a[2])*f);rgba[q+3]=255;
    }
    sliceTexture.needsUpdate=true;
    const width=slice.axis==='x'?4.8:7.2,height=4.8;
    slicePlane.scale.set(width,height,1);sliceBorder.scale.set(width,height,1);
    sliceGroup.position.set(0,0,0);sliceGroup.rotation.set(0,0,0);
    if (slice.axis==='z') sliceGroup.position.z=slice.coordinate;
    else if (slice.axis==='y') {sliceGroup.position.y=slice.coordinate;sliceGroup.rotation.x=Math.PI/2;}
    else {
      sliceGroup.position.x=slice.coordinate;
      sliceGroup.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
    }
    const positions=[], cols=11, rows=7, maxSpeed=Math.max(slice.maxPlaneSpeed,1e-12), spacing=Math.min(width/cols,height/rows);
    function segment(x1,y1,x2,y2) {positions.push(x1,y1,.015,x2,y2,.015);}
    for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
      const i=Math.min(slice.width-1,Math.floor((col+.5)*slice.width/cols)),j=Math.min(slice.height-1,Math.floor((row+.5)*slice.height/rows)),q=3*(i+slice.width*j);
      const vx=values[q+1],vy=values[q+2],speed=Math.hypot(vx,vy);if(speed<maxSpeed*.06)continue;
      const dx=vx/speed,dy=vy/speed,len=spacing*.72*Math.min(1,speed/maxSpeed),x=((i+.5)/slice.width-.5)*width,y=((j+.5)/slice.height-.5)*height;
      const x0=x-dx*len*.48,y0=y-dy*len*.48,x1=x+dx*len*.52,y1=y+dy*len*.52,head=Math.min(len*.42,spacing*.17);
      segment(x0,y0,x1,y1);segment(x1,y1,x1-dx*head-dy*head*.55,y1-dy*head+dx*head*.55);segment(x1,y1,x1-dx*head+dy*head*.55,y1-dy*head-dx*head*.55);
    }
    sliceLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));sliceLines.geometry.computeBoundingSphere();
    s.data={axis:slice.axis,version:slice.version,time:slice.time,coordinate:slice.coordinate,maxVorticity:slice.maxVorticity,maxPlaneSpeed:slice.maxPlaneSpeed};
    $('slice-readout').textContent='t = '+slice.time.toFixed(2)+'　|ω| 最大 '+slice.maxVorticity.toFixed(3)+'　面内速度最大 '+slice.maxPlaneSpeed.toFixed(3);
    stage.dataset.slice=slice.axis;stage.dataset.sliceTime=String(slice.time);stage.dataset.slicePosition=String(slice.coordinate);stage.dataset.sliceVorticity=String(slice.maxVorticity);
    updateSliceControls();
  }
  function comparisonMetadata() {
    const button=document.querySelector('[data-preset="'+state.preset+'"]'), grid=GRID[state.quality];
    return {label:button && button.lastChild ? button.lastChild.textContent.trim() : '自定义',initial:{...state.initial},viscosity:state.viscosity,
      diffusivity:.0005,grid:state.quality,gridLabel:[grid.nx,grid.ny,grid.nz].join('×'),dt:state.dt,iterations:state.iterations,forced:false,generation:state.generation};
  }
  function captureThumbnail() {
    if (!renderer || !state.ready) return null;
    try {
      render();const b=bounds(),output=document.createElement('canvas');output.width=320;output.height=Math.max(80,Math.round(320*b.height/b.width));
      const ctx=output.getContext('2d'),gradient=ctx.createRadialGradient(output.width*.5,output.height*.47,0,output.width*.5,output.height*.47,output.width*.7);
      gradient.addColorStop(0,'#203b39');gradient.addColorStop(1,'#0c1719');ctx.fillStyle=gradient;ctx.fillRect(0,0,output.width,output.height);
      ctx.drawImage(canvas,Math.max(0,b.left*state.dpr),Math.max(0,b.top*state.dpr),b.width*state.dpr,b.height*state.dpr,0,0,output.width,output.height);
      return output.toDataURL('image/png');
    } catch (_) { return null; }
  }
  function setCompareImage(id,placeholder,src) {
    const image=$(id),empty=$(placeholder);image.hidden=!src;empty.hidden=!!src;
    if (src && image.getAttribute('src')!==src) image.src=src;
    else if (!src && image.hasAttribute('src')) image.removeAttribute('src');
  }
  function saveReference() {
    const c=state.compare;if (!analysis || !state.ready || !c.current || !c.current.points.length) return;
    c.reference={...c.current,initial:{...c.current.initial},points:c.current.points.map(point=>({...point})),time:state.stats.time,image:captureThumbnail()};
    c.currentImage=null;c.currentImageTime=null;updateComparison();
  }
  function maybeCaptureComparison() {
    const c=state.compare,r=c.reference;
    if (!r || !c.current || r.generation===c.current.generation || c.currentImage || !state.ready) return;
    if (Math.abs(state.stats.time-r.time)<1e-7) {c.currentImage=captureThumbnail();c.currentImageTime=state.stats.time;}
  }
  function updateComparison() {
    const c=state.compare,r=c.reference,run=c.current,points=run ? run.points : [], ref=r ? r.points : [];
    $('save-reference').disabled=state.failed || !analysis || !state.ready || !points.length;
    $('clear-reference').disabled=state.failed || !r;
    document.querySelectorAll('[data-compare-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.compareMetric===c.metric)));
    $('reference-meta').textContent=r ? '参考「'+r.label+'」 · '+r.gridLabel+' · Δt='+r.dt.toFixed(2)+' · ν='+r.viscosity.toFixed(3)+' · 压力上限 '+r.iterations+' · 至 t='+r.time.toFixed(2) : '尚未保留参考；记录只在当前页面内保存。';
    setCompareImage('reference-image','reference-placeholder',r && r.image);setCompareImage('current-image','current-placeholder',c.currentImage);
    $('reference-image-time').textContent=r?'t='+r.time.toFixed(2):'—';
    $('current-image-time').textContent=c.currentImageTime!=null?'t='+c.currentImageTime.toFixed(2):'—';
    $('current-placeholder').textContent=r && run && r.generation!==run.generation && state.stats && state.stats.time>r.time+1e-7 ? '步长未恰好对齐' : '等待对照时刻';
    if (state.note!=='compare') return;
    const all=ref.concat(points), key=c.metric;
    let tmax=Math.max(.04,all.length?all[all.length-1].time:0,ref.length?ref[ref.length-1].time:0);
    let ymin=0,ymax=0;
    for(const p of all){ymin=Math.min(ymin,p[key]);ymax=Math.max(ymax,p[key]);}
    if (ymax-ymin<1e-8) {ymin-=.5;ymax+=.5;} else {const pad=(ymax-ymin)*.08;ymin-=pad;ymax+=pad;}
    function pathFor(list) {
      if (!list.length) return '';
      const stride=Math.max(1,Math.ceil(list.length/300)), chosen=[];
      for(let i=0;i<list.length;i+=stride)chosen.push(list[i]);
      if(chosen[chosen.length-1]!==list[list.length-1])chosen.push(list[list.length-1]);
      return chosen.map((p,i)=>(i?'L':'M')+(24+216*p.time/tmax).toFixed(2)+' '+(84-73*(p[key]-ymin)/(ymax-ymin)).toFixed(2)).join(' ');
    }
    $('compare-current-line').setAttribute('d',pathFor(points));$('compare-reference-line').setAttribute('d',pathFor(ref));
    $('compare-axis-high').textContent=ymax.toFixed(1);$('compare-axis-low').textContent=ymin.toFixed(1);$('compare-axis-time').textContent='t = '+tmax.toFixed(2);
    const current=points[points.length-1],reference=analysis && r && current ? analysis.at(ref,current.time) : null;
    if (!r) $('compare-result').textContent='保留参考后，可在同一模拟时间比较。';
    else if (!current || !reference) $('compare-result').textContent='参考记录至 t='+r.time.toFixed(2)+'；当前时间不在其记录范围内。';
    else {
      const a=current[key],b=reference[key],d=a-b;
      $('compare-result').textContent='t='+current.time.toFixed(2)+'：当前 '+a.toFixed(3)+' / 参考 '+b.toFixed(3)+' / 差 '+(d>=0?'+':'')+d.toFixed(3);
    }
    $('compare-context').textContent=analysis ? analysis.context(r,run)+' 染料质心不是涡核。' : '对照模块未加载；流体仍可正常计算。';
  }
  function updateReadouts(stats, dimensions) {
    state.stats=stats; state.dimensions=dimensions;
    $('time-readout').textContent=stats.time.toFixed(2);
    $('grid-readout').textContent=dimensions.join('×');
    $('divergence-readout').textContent=stats.divergenceRms.toExponential(1).replace('e-','e−');
    const gap=stats.dyeCenterB-stats.dyeCenterA, shownGap=Math.abs(gap)<.005 ? 0 : gap;
    $('dye-gap-readout').textContent=(shownGap>0?'+':'')+shownGap.toFixed(2);
    $('card-divergence').textContent=$('divergence-readout').textContent;
    $('card-dye-gap').textContent=$('dye-gap-readout').textContent;
    $('card-mass').textContent=stats.dyeMassA.toFixed(2)+' / '+stats.dyeMassB.toFixed(2);
    $('card-grid').textContent=dimensions.join('×')+' / '+state.dt.toFixed(2); $('card-cfl').textContent=stats.cfl.toFixed(2);
    $('card-projection').textContent=stats.projectionIterations+' / '+stats.projectionLimit+' · '+(stats.projectionConverged?'达标':'未达标');
    $('card-projection-target').textContent=stats.projectionTarget.toExponential(1).replace('e-','e−');
    stage.dataset.steps=String(stats.steps); stage.dataset.time=String(stats.time); stage.dataset.grid=dimensions.join('x');
    stage.dataset.divergence=String(stats.divergenceRms); stage.dataset.centerX=String(stats.dyeCenterX);
    stage.dataset.projectionIterations=String(stats.projectionIterations);stage.dataset.projectionConverged=String(stats.projectionConverged);
  }
  function requestReset() {
    if (!worker || state.failed) return;
    clearTimeout(state.timer); state.timer=null;
    // An obsolete step or high-resolution initialization can be expensive.
    // Cancel it instead of accumulating a queue of stale slider resets.
    if (state.busy) {
      worker.terminate(); worker=null;
      try { spawnWorker(); } catch (error) { fail('流体后台线程无法启动：'+error.message+'。'); return; }
    }
    state.generation++; state.ready=false; state.busy=true; state.checked=false; state.accumulator=0; state.lastFrame=0;
    state.slice.data=null;updateSliceControls();
    state.force.pending=null;state.force.applied=0;stage.dataset.forceSteps='0';if(forceMarker)forceMarker.visible=false;
    state.compare.pendingMeta=comparisonMetadata();state.compare.currentImage=null;state.compare.currentImageTime=null;updateComparison();
    $('stage-notice').textContent='正在重新建立流体初态…'; $('stage-notice').hidden=false;
    state.pendingInitial={...state.initial}; updatePlayback(); updateFraming();
    worker.postMessage({type:'reset',generation:state.generation,options:{...GRID[state.quality],dt:state.dt,viscosity:state.viscosity,diffusivity:.0005,iterations:state.iterations},initial:state.pendingInitial,slice:sliceSpec()});
  }
  function scheduleReset() {
    if (state.failed) return;
    clearTimeout(state.timer); state.timer=setTimeout(requestReset,180);
  }
  function setPreset(name, pause) {
    if (!api || !api.PRESETS[name] || !api.PRESET_VISCOSITY || !Number.isFinite(api.PRESET_VISCOSITY[name])) return;
    if (pause) { state.playing=false; if (state.renderQuality==='auto') {state.renderScale=1;resize();} }
    state.initial={...api.PRESETS[name]}; state.viscosity=api.PRESET_VISCOSITY[name]; state.preset=name; updateControls(); requestReset();
    if (pause && compact.matches && !$('knowledge-panel').hidden) $('toggle-knowledge').click();
  }
  function selectNote(name) {
    state.note=name;
    document.querySelectorAll('[data-note]').forEach(button=>{ const active=button.dataset.note===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active)); });
    document.querySelectorAll('[data-note-content]').forEach(content=>{content.hidden=content.dataset.noteContent!==name;});
    if (name==='compare') updateComparison();
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function requestStep() {
    if (!worker || !state.ready || state.busy || state.failed) return;
    const force=state.force.pending;state.force.pending=null;
    state.busy=true; worker.postMessage({type:'step',generation:state.generation,slice:sliceSpec(),force}); updatePlayback();
  }
  function spawnWorker() {
    const blob=new Blob([api.workerSource()],{type:'application/javascript'}); workerUrl=URL.createObjectURL(blob);
    worker=new Worker(workerUrl); URL.revokeObjectURL(workerUrl); workerUrl=null;
    const own=worker;
    worker.onerror=event=>{event.preventDefault();if(worker===own)fail('流体后台线程无法运行，请刷新或切换到涡丝对照。');};
    worker.onmessage=event=>{
      const m=event.data;
      if (worker!==own || m.generation!==state.generation || state.failed) return;
      if (m.kind==='error') { fail('流体求解未能继续：'+m.message+'。可切换到涡丝对照。'); return; }
      if (m.kind==='slice') {
        try { showSlice(m.slice); } catch(error) { fail('流场剖面无法显示：'+error.message+'。'); }
        return;
      }
      if (m.kind!=='ready' && m.kind!=='frame') return;
      try {
        const [nx,ny,nz]=m.dimensions, data=new Uint8Array(m.density), oldData=texture && texture.image.data, bounds=m.bounds;
        if (data.length!==nx*ny*nz*4 || !m.stats || !Number.isFinite(m.stats.divergenceRms) || !bounds || !Number.isFinite(bounds.peak) ||
            !Array.isArray(bounds.min) || !Array.isArray(bounds.max) || bounds.min.length!==3 || bounds.max.length!==3) throw new Error('无效的网格数据');
        if (!texture || texture.image.width!==nx || texture.image.height!==ny || texture.image.depth!==nz) {
          if (texture) texture.dispose();
          texture=new THREE.Data3DTexture(data,nx,ny,nz); texture.format=THREE.RGBAFormat; texture.type=THREE.UnsignedByteType;
          texture.minFilter=THREE.LinearFilter; texture.magFilter=THREE.LinearFilter; texture.unpackAlignment=1;
          texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping; texture.generateMipmaps=false;
          volume.material.uniforms.density.value=texture;
        } else texture.image.data=data;
        // Peak and visible-dye bounds are computed on the worker from the
        // exact packed bytes, keeping two full-grid scans off the UI thread.
        volume.material.uniforms.densityPeak.value=bounds.peak/65535;
        const [minX,minY,minZ]=bounds.min,[maxX,maxY,maxZ]=bounds.max;
        const half=volume.material.uniforms.halfBox.value, lo=volume.material.uniforms.dyeMin.value, hi=volume.material.uniforms.dyeMax.value;
        if (maxX<0) {lo.set(0,0,0);hi.set(0,0,0);}
        else {
          lo.set((2*Math.max(0,minX-1)/nx-1)*half.x,(2*Math.max(0,minY-1)/ny-1)*half.y,(2*Math.max(0,minZ-1)/nz-1)*half.z);
          hi.set((2*Math.min(nx,maxX+2)/nx-1)*half.x,(2*Math.min(ny,maxY+2)/ny-1)*half.y,(2*Math.min(nz,maxZ+2)/nz-1)*half.z);
        }
        texture.needsUpdate=true;stage.dataset.bufferReused=String(!!m.recycled);
        // The previous frame is no longer referenced by the texture. Transfer
        // that buffer back for the next worker frame instead of allocating a
        // new volume-sized byte array every step.
        if (oldData && oldData.buffer && oldData.buffer.byteLength===data.length)
          worker.postMessage({type:'recycle',generation:state.generation,density:oldData.buffer},[oldData.buffer]);
        state.busy=false; state.ready=true; updateReadouts(m.stats,m.dimensions);
        if (m.kind==='ready') {
          state.activeInitial=state.pendingInitial;state.targetX=state.follow ? m.stats.dyeCenterX : 0; $('stage-notice').hidden=true;
          state.compare.current={...state.compare.pendingMeta,points:[]};
        } else if (state.follow) state.targetX+=(m.stats.dyeCenterX-state.targetX)*.4;
        if (m.appliedForce && state.compare.current) {state.compare.current.forced=true;state.force.applied++;stage.dataset.forceSteps=String(state.force.applied);}
        if (analysis && state.compare.current) analysis.append(state.compare.current.points,m.stats);
        if (m.slice) showSlice(m.slice);
        else if (state.slice.enabled && (!state.slice.data || state.slice.data.version!==state.slice.version)) scheduleSlice();
        $('stage-error').hidden=true; updatePlayback(); updateFraming(); state.dirty=true;
        maybeCaptureComparison();updateComparison();
        if (!state.playing && state.force.pending) requestStep();
      } catch(error) { fail('流体体积数据无法显示：'+error.message+'。'); }
    };
  }
  function setupWorker() {
    if (!api || typeof api.Fluid3D!=='function' || typeof api.workerSource!=='function') throw new Error('数值求解模块没有加载');
    spawnWorker(); requestReset();
  }

  const vertexShader=`
    out vec3 samplePosition;
    out vec3 eyePosition;
    void main() {
      samplePosition = position;
      eyePosition = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader=`
    precision highp float;
    precision highp sampler3D;
    uniform sampler3D density;
    uniform vec3 halfBox;
    uniform vec3 dyeMin;
    uniform vec3 dyeMax;
    uniform int displayMode;
    uniform float densityPeak;
    uniform float contourLevel;
    in vec3 samplePosition;
    in vec3 eyePosition;
    out vec4 outputColor;
    vec2 boxHit(vec3 o, vec3 d) {
      vec3 safeD = sign(d) * max(abs(d), vec3(0.000001));
      safeD = mix(safeD, vec3(0.000001), equal(safeD, vec3(0.0)));
      vec3 a = (dyeMin-o)/safeD, b = (dyeMax-o)/safeD;
      vec3 nearV=min(a,b), farV=max(a,b);
      return vec2(max(max(nearV.x,nearV.y),nearV.z),min(min(farV.x,farV.y),farV.z));
    }
    vec3 atDistance(vec3 ray, float t) { return (eyePosition+ray*t)/(2.0*halfBox)+0.5; }
    vec2 dyeAt(vec3 uv) {
      vec4 bytes=texture(density,clamp(uv,vec3(0.0),vec3(1.0)));
      // Each dye uses high/low UNORM8 channels; this linear combination also
      // commutes with trilinear texture interpolation.
      return vec2(bytes.r*256.0+bytes.g,bytes.b*256.0+bytes.a)/257.0;
    }
    float amountAt(vec3 uv) { vec2 dye=dyeAt(uv); return dye.x+dye.y; }
    vec3 tintAt(vec2 dye) {
      return (dye.x*vec3(0.95,0.56,0.33)+dye.y*vec3(0.38,0.84,0.77))/max(dye.x+dye.y,0.00001);
    }
    void main() {
      vec3 direction=normalize(samplePosition-eyePosition);
      vec2 hit=boxHit(eyePosition,direction);
      float start=max(hit.x,0.0), end=hit.y;
      if (end<=start) discard;
      vec4 sum=vec4(0.0);
      if (displayMode==0) {
        // Original soft, line-integrated volume; the same simulated field is
        // used by both views, with no decorative procedural flow textures.
        float stepSize=(end-start)/48.0;
        for (int n=0;n<48;n++) {
          float t=start+(float(n)+0.5)*stepSize;
          vec3 uv=atDistance(direction,t);
          vec2 dye=dyeAt(uv); float amount=dye.x+dye.y;
          if (amount>0.003) {
            vec2 lightDye=dyeAt(uv+vec3(-0.025,0.050,0.032));
            float light=0.34+0.85*exp(-2.4*(lightDye.x+lightDye.y));
            float a=1.0-exp(-4.0*amount*stepSize);
            sum.rgb+=(1.0-sum.a)*a*tintAt(dye)*light;
            sum.a+=(1.0-sum.a)*a;
            if (sum.a>0.985) break;
          }
        }
      } else {
        // A translucent isosurface of A+B, overlaid on a faint volume. Its
        // threshold is a fraction of the peak of this frame's texture, not a
        // physical interface. Bisect the first crossing along each ray.
        float stepSize=(end-start)/64.0, threshold=max(0.002,densityPeak*contourLevel), previous=start;
        bool foundSurface=false;
        for (int n=0;n<64;n++) {
          float t=start+(float(n)+0.5)*stepSize; vec3 uv=atDistance(direction,t);
          vec2 dye=dyeAt(uv); float amount=dye.x+dye.y;
          if (!foundSurface && amount>=threshold) {
            float lo=previous, hi=t;
            for (int j=0;j<4;j++) {
              float mid=(lo+hi)*0.5;
              if (amountAt(atDistance(direction,mid))>=threshold) hi=mid; else lo=mid;
            }
            vec3 pt=atDistance(direction,hi), e=1.0/vec3(textureSize(density,0));
            vec3 gradient=vec3(
              amountAt(pt+vec3(e.x,0.0,0.0))-amountAt(pt-vec3(e.x,0.0,0.0)),
              amountAt(pt+vec3(0.0,e.y,0.0))-amountAt(pt-vec3(0.0,e.y,0.0)),
              amountAt(pt+vec3(0.0,0.0,e.z))-amountAt(pt-vec3(0.0,0.0,e.z))
            )/e/halfBox;
            vec3 normal=normalize(-gradient+vec3(0.000001));
            float diffuse=max(dot(normal,normalize(vec3(-0.4,0.8,0.6))),0.0);
            float facing=max(dot(normal,-direction),0.0);
            vec3 color=tintAt(dyeAt(pt))*(0.30+0.75*diffuse+0.16*pow(1.0-facing,2.0));
            float alpha=0.72;
            sum.rgb+=(1.0-sum.a)*alpha*color; sum.a+=(1.0-sum.a)*alpha;
            foundSurface=true;
          }
          // Below this threshold smoothstep is exactly zero, so skip the
          // exponential and tint division without changing the image.
          float relativeAmount=amount/max(densityPeak,0.001);
          if (relativeAmount>0.08) {
            float visible=smoothstep(0.08,0.22,relativeAmount);
            float alpha=1.0-exp(-2.0*amount*visible*stepSize);
            sum.rgb+=(1.0-sum.a)*alpha*tintAt(dye)*0.85; sum.a+=(1.0-sum.a)*alpha;
          }
          previous=t;
          if (sum.a>0.985) break;
        }
      }
      if (sum.a<0.001) discard;
      outputColor=vec4(sum.rgb/sum.a,sum.a);
    }
  `;
  function setupRenderer() {
    if (!THREE || !THREE.Data3DTexture) throw new Error('三维绘图模块没有加载');
    const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
    if (!gl) throw new Error('此设备或浏览器不支持 WebGL2');
    if (gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)<72) throw new Error('设备的三维纹理容量不足');
    renderer=new THREE.WebGLRenderer({canvas,context:gl,alpha:true,antialias:false,preserveDrawingBuffer:true});
    renderer.setClearColor(0x000000,0); renderer.autoClear=false; renderer.outputColorSpace=THREE.SRGBColorSpace;
    scene=new THREE.Scene(); camera=new THREE.PerspectiveCamera(45,1,.1,100);
    const geometry=new THREE.BoxGeometry(7.2,4.8,4.8);
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.BackSide,
      uniforms:{density:{value:null},halfBox:{value:new THREE.Vector3(3.6,2.4,2.4)},
        dyeMin:{value:new THREE.Vector3(-3.6,-2.4,-2.4)},dyeMax:{value:new THREE.Vector3(3.6,2.4,2.4)},
        displayMode:{value:state.renderMode==='contour'?1:0},densityPeak:{value:0},contourLevel:{value:state.contourLevel}}});
    volume=new THREE.Mesh(geometry,material); scene.add(volume);
    sliceGroup=new THREE.Group();sliceGroup.name='velocity-slice';sliceGroup.visible=false;scene.add(sliceGroup);
    const planeGeometry=new THREE.PlaneGeometry(1,1);
    slicePlane=new THREE.Mesh(planeGeometry,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.88,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));
    slicePlane.name='vorticity-plane';slicePlane.renderOrder=2;sliceGroup.add(slicePlane);
    sliceBorder=new THREE.LineSegments(new THREE.EdgesGeometry(planeGeometry),new THREE.LineBasicMaterial({color:0xb9e1cb,transparent:true,opacity:.85,depthTest:false,depthWrite:false}));
    sliceBorder.name='slice-border';sliceBorder.renderOrder=3;sliceGroup.add(sliceBorder);
    sliceLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffe4bd,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));
    sliceLines.name='in-plane-velocity';sliceLines.renderOrder=3;sliceGroup.add(sliceLines);
    const markerPoints=[];for(let i=0;i<40;i++){const a=2*Math.PI*i/40;markerPoints.push(Math.cos(a),Math.sin(a),0);}
    const markerGeometry=new THREE.BufferGeometry();markerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(markerPoints,3));
    forceMarker=new THREE.LineLoop(markerGeometry,new THREE.LineBasicMaterial({color:0xffd19d,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));
    forceMarker.name='force-brush';forceMarker.visible=false;forceMarker.renderOrder=4;sliceGroup.add(forceMarker);pointerRay=new THREE.Raycaster();
    wire=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0xa1c3b1,transparent:true,opacity:.22,depthTest:false}));
    wire.renderOrder=4; scene.add(wire);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('WebGL2 上下文已丢失。请刷新页面或切换到涡丝对照。');});
    stage.dataset.renderer='webgl2';
  }
  function bounds() {
    const stageBox=stage.getBoundingClientRect(), hud=$('workbench').querySelector('.lab-bottom').getBoundingClientRect();
    let left=48,right=state.width-48,top=104,bottom=state.height-160;
    if (!$('control-panel').hidden) left=Math.max(left,$('control-panel').getBoundingClientRect().right-stageBox.left+12);
    if (!$('knowledge-panel').hidden) right=Math.min(right,$('knowledge-panel').getBoundingClientRect().left-stageBox.left-12);
    const hudTop=hud.top-stageBox.top;
    if (hud.width && hudTop>top+60) bottom=Math.min(bottom,hudTop-22);
    const legend=stage.querySelector('.stage-bottom').getBoundingClientRect();
    if (legend.height && legend.top-stageBox.top>top+60) bottom=Math.min(bottom,legend.top-stageBox.top-12);
    if (right-left<110) {left=44;right=state.width-44;}
    if (bottom-top<70) {top=48;bottom=Math.max(top+55,Math.min(state.height-40,hudTop-12));}
    return {left,right,top,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
  }
  function updateFraming() {
    if (!state.width || !state.height || !camera) return;
    const hud=document.querySelector('.lab-bottom').getBoundingClientRect(), hudTop=hud.top-stage.getBoundingClientRect().top;
    const safe=state.height-hudTop+12, legendMin=state.width<=360 ? 174 : 150, panelMin=state.height<=540 ? 12 : state.width<=360 ? 180 : 158;
    stage.style.setProperty('--vortex-legend-bottom',Math.ceil(Math.max(legendMin,safe))+'px');
    $('workbench').style.setProperty('--vortex-panel-bottom',Math.ceil(Math.min(state.height-130,Math.max(panelMin,safe)))+'px');
    const b=bounds(), pixels=Math.max(1,Math.min(b.width*.90/4.8,b.height*.88/4.2));
    const fov=Math.max(22,Math.min(125,2*Math.atan(state.height/(2*pixels*12))*180/Math.PI));
    camera.fov=fov; camera.aspect=state.width/state.height;
    camera.setViewOffset(state.width,state.height,state.width/2-b.centerX,state.height/2-b.centerY,state.width,state.height); camera.updateProjectionMatrix();
    state.dirty=true;
  }
  function resize() {
    if (!renderer) return;
    const box=stage.getBoundingClientRect(); if (!box.width || !box.height) return;
    state.width=box.width; state.height=box.height;
    const side=Math.max(state.width,state.height), screenDpr=window.devicePixelRatio||1;
    // Render pixels are independent of physical grid cells. Explicit "sharp"
    // keeps up to 2x device pixels (capped at 2048 on the longest side);
    // automatic mode may lower its backing size during sustained slow motion.
    let ratio=state.renderQuality==='sharp' ? Math.min(Math.max(1,screenDpr),2,2048/side)
      : state.renderQuality==='fast' ? Math.min(.55,850/side)
      : Math.min(state.renderScale,1400/side);
    if (state.drag) ratio=Math.min(ratio,.60);
    ratio=Math.max(.1,ratio);
    if (state.dpr!==ratio || canvas.width!==Math.round(state.width*ratio) || canvas.height!==Math.round(state.height*ratio)) {
      renderer.setPixelRatio(ratio); renderer.setSize(state.width,state.height,false); state.dpr=ratio;
    }
    stage.dataset.renderScale=String(ratio); stage.dataset.renderQuality=state.renderQuality;
    $('render-scale-hint').textContent='当前画布 '+canvas.width+'×'+canvas.height+' · 屏幕像素 '+Math.round(100*ratio/screenDpr)+'%'+(state.drag?' · 拖动临时降采样':'');
    updateFraming();
  }
  function updateCamera() {
    const c=state.camera, sy=Math.sin(c.yaw), cy=Math.cos(c.yaw), sp=Math.sin(c.pitch), cp=Math.cos(c.pitch), x=state.targetX;
    camera.position.set(x+sy*cp*c.distance,sp*c.distance,cy*cp*c.distance); camera.lookAt(x,0,0); camera.updateMatrixWorld();
  }
  function render() {
    if (!renderer || !state.ready || state.failed) return;
    updateCamera();
    // Do not ray-march pixels hidden under panels and the transport dock.
    const b=bounds(), margin=12, x=Math.max(0,b.left-margin), y=Math.max(0,state.height-b.bottom-margin);
    renderer.setScissorTest(false); renderer.clear(); renderer.setScissor(x,y,Math.min(state.width-x,b.width+2*margin),Math.min(state.height-y,b.height+2*margin));renderer.setScissorTest(true);
    const started=performance.now(); renderer.render(scene,camera); const cost=performance.now()-started;
    if ((renderer.info.programs||[]).some(program=>program.diagnostics && program.diagnostics.runnable===false)) throw new Error('体积着色器编译失败');
    const gl=renderer.getContext(); if (gl.isContextLost()) throw new Error('WebGL2 上下文丢失');
    if (!state.checked && state.stats && state.stats.steps===0) {
      // Detect a silently blank renderer using points on the initialized dye
      // ring. If readback itself is blocked, do not infer a drawing failure.
      let readable=false, lit=false;
      for (const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
        const initial=state.activeInitial;
        const p=new THREE.Vector3(-initial.gap/2,initial.radiusA*Math.cos(angle),initial.radiusA*Math.sin(angle)).project(camera);
        const px=Math.round((p.x*.5+.5)*gl.drawingBufferWidth),py=Math.round((p.y*.5+.5)*gl.drawingBufferHeight);
        if (px<3 || py<3 || px>=gl.drawingBufferWidth-3 || py>=gl.drawingBufferHeight-3) continue;
        const screenX=px/state.dpr,screenY=state.height-py/state.dpr;
        if(screenX<b.left-margin || screenX>b.right+margin || screenY<b.top-margin || screenY>b.bottom+margin) continue;
        try { const pixels=new Uint8Array(5*5*4);gl.readPixels(px-2,py-2,5,5,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          if (gl.getError()===gl.NO_ERROR) {readable=true;if(pixels.some((value,i)=>i%4===3 && value>1)){lit=true;break;}}
        } catch (_) { /* Readback can be restricted independently of drawing. */ }
      }
      if (readable && !lit) throw new Error('WebGL2 返回了空白体积');
      state.checked=true;
    }
    // Automatic resolution is allowed to adapt only while playing. "Sharp"
    // and "fast" are explicit choices, and a paused frame stays sharp.
    if (state.renderQuality==='auto' && state.playing && !state.drag) {
      if (cost>70) {state.slowFrames++;state.fastFrames=0;}
      else if (cost<15) {state.fastFrames++;state.slowFrames=0;}
      else {state.slowFrames=0;state.fastFrames=0;}
      if (state.slowFrames>=2 && state.renderScale>.5) {state.renderScale=Math.max(.5,state.renderScale*.82);state.slowFrames=0;resize();}
      else if (state.fastFrames>=100 && state.renderScale<1) {state.renderScale=Math.min(1,state.renderScale+.05);state.fastFrames=0;resize();}
    } else {state.slowFrames=0;state.fastFrames=0;}
  }
  function animate(now) {
    if (!state.lastFrame) state.lastFrame=now;
    const rawElapsed=Math.max(0,(now-state.lastFrame)/1000), elapsed=Math.min(.12,rawElapsed); state.lastFrame=now;
    // Some WebGL implementations enqueue rendering cheaply but present very
    // slowly. Adapt to consistently slow animation frames as well as CPU draw
    // time; this changes pixels only, never solver resolution or dynamics.
    if (state.renderQuality==='auto' && state.ready && state.playing && !state.drag) {
      // GPU presentation can stall individual frames while intervening rAFs
      // look fast. React to one long stall or several slow frames rather than
      // requiring three consecutive slow callbacks.
      if (rawElapsed>.25) state.slowTicks=3;
      else if (rawElapsed>.09) state.slowTicks+=1;
      else state.slowTicks=Math.max(0,state.slowTicks-.15);
      if (state.slowTicks>=3 && state.renderScale>.5) {state.renderScale=Math.max(.5,state.renderScale*.82);state.slowTicks=0;resize();}
    } else state.slowTicks=0;
    if (state.ready && state.playing && !state.failed) {
      state.accumulator=Math.min(.12,state.accumulator+elapsed*state.speed);
      if (state.accumulator>=state.dt && !state.busy) {state.accumulator-=state.dt;requestStep();}
    }
    if (state.dirty && state.ready && !state.failed && now-state.lastRender>=(state.drag?33:50)) {
      state.dirty=false; state.lastRender=now;
      try {render();} catch(error) {fail('三维体积渲染不可用：'+error.message+'。可切换到涡丝对照。');}
    }
    requestAnimationFrame(animate);
  }
  function updateZoom() {
    const input=$('camera-zoom'), zoom=12/state.camera.distance; input.value=String(zoom);
    $('camera-zoom-value').textContent=zoom.toFixed(2)+'×'; progress(input);
  }
  function resetView() { state.camera={yaw:.58,pitch:.20,distance:12}; updateZoom();updateFraming();state.dirty=true; }
  function bind() {
    document.querySelectorAll('button[data-tool]').forEach(button=>button.addEventListener('click',()=>{
      state.force.mode=button.dataset.tool;state.force.pending=null;
      if (state.force.mode==='force' && !state.slice.enabled) {state.slice.enabled=true;state.slice.version++;state.slice.data=null;updateSliceControls();scheduleSlice();}
      updateToolControls();
    }));
    $('force-strength').addEventListener('input',event=>{state.force.strength=Number(event.target.value);updateToolControls();});
    $('force-radius').addEventListener('input',event=>{state.force.radius=Number(event.target.value);if(forceMarker)forceMarker.scale.setScalar(state.force.radius);updateToolControls();});
    $('force-center').addEventListener('click',()=>{
      const axis=state.slice.axis,c=sliceCoordinate(),center=axis==='x'?new THREE.Vector3(c,0,0):axis==='y'?new THREE.Vector3(0,c,0):new THREE.Vector3(0,0,c);
      const direction=axis==='x'?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);queueForce(center,direction);
    });
    $('slice-toggle').addEventListener('click',()=>{
      state.slice.enabled=!state.slice.enabled;state.slice.version++;state.slice.data=null;
      if(!state.slice.enabled && state.force.mode==='force'){state.force.mode='orbit';state.force.pending=null;updateToolControls();}
      updateSliceControls();if(state.slice.enabled)scheduleSlice();
    });
    $('slice-axis').addEventListener('change',event=>{state.slice.axis=event.target.value;state.slice.version++;state.slice.data=null;state.force.pending=null;if(forceMarker)forceMarker.visible=false;updateSliceControls();scheduleSlice();});
    $('slice-position').addEventListener('input',event=>{state.slice.position=Number(event.target.value)/100;state.slice.version++;state.slice.data=null;state.force.pending=null;if(forceMarker)forceMarker.visible=false;updateSliceControls();scheduleSlice();});
    $('slice-arrows').addEventListener('change',event=>{state.slice.arrows=event.target.checked;updateSliceControls();});
    $('save-reference').addEventListener('click',saveReference);
    $('clear-reference').addEventListener('click',()=>{state.compare.reference=null;state.compare.currentImage=null;state.compare.currentImageTime=null;updateComparison();});
    document.querySelectorAll('[data-compare-metric]').forEach(button=>button.addEventListener('click',()=>{state.compare.metric=button.dataset.compareMetric;updateComparison();}));
    document.querySelectorAll('[data-render-mode]').forEach(button=>button.addEventListener('click',()=>{state.renderMode=button.dataset.renderMode;updateDisplayControls();}));
    $('contour-level').addEventListener('input',event=>{state.contourLevel=Number(event.target.value)/100;updateDisplayControls();});
    $('render-quality').addEventListener('change',event=>{state.renderQuality=event.target.value;state.renderScale=1;state.slowFrames=state.slowTicks=state.fastFrames=0;resize();});
    const inputs=[['radius-a','radiusA'],['radius-b','radiusB'],['separation','gap'],['gamma-a','gammaA'],['gamma-b','gammaB'],['perturbation','perturbation']];
    for (const [id,key] of inputs) $(id).addEventListener('input',event=>{
      const value=Number(event.target.value); state.initial[key]=key==='gammaB' ? Math.sign(state.initial.gammaB)*value : value;
      state.preset='custom'; updateControls(); scheduleReset();
    });
    $('viscosity').addEventListener('input',event=>{state.viscosity=Number(event.target.value);state.preset='custom';updateControls();scheduleReset();});
    $('grid-quality').addEventListener('change',event=>{state.quality=event.target.value;updateControls();requestReset();});
    $('time-step').addEventListener('change',event=>{state.dt=Number(event.target.value);updateControls();requestReset();});
    $('pressure-iterations').addEventListener('change',event=>{state.iterations=Number(event.target.value);updateControls();requestReset();});
    $('follow-dye').addEventListener('change',event=>{state.follow=event.target.checked;state.targetX=state.follow && state.stats ? state.stats.dyeCenterX : 0;state.dirty=true;});
    $('camera-zoom').addEventListener('input',event=>{state.camera.distance=12/Number(event.target.value);updateZoom();state.dirty=true;});
    document.querySelectorAll('[data-orientation]').forEach(button=>button.addEventListener('click',()=>{
      const sign=button.dataset.orientation==='same'?1:-1;
      if (Math.sign(state.initial.gammaB)===sign) return;
      state.initial.gammaB=sign*Math.abs(state.initial.gammaB);state.preset='custom';updateControls();requestReset();
    }));
    document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>setPreset(button.dataset.preset,false)));
    document.querySelectorAll('[data-try-preset]').forEach(button=>button.addEventListener('click',()=>setPreset(button.dataset.tryPreset,true)));
    document.querySelectorAll('[data-note]').forEach(button=>button.addEventListener('click',()=>selectNote(button.dataset.note)));
    document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{state.speed=Number(button.dataset.speed);state.accumulator=0;updateControls();}));
    $('play').addEventListener('click',()=>setPlaying(!state.playing)); $('step').addEventListener('click',requestStep); $('reset').addEventListener('click',requestReset);
    $('reset-view').addEventListener('click',resetView);
    $('save-image').addEventListener('click',()=>{
      if (!state.ready || state.failed) return;
      try {
        render(); const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
        const ctx=output.getContext('2d'), gradient=ctx.createRadialGradient(output.width*.5,output.height*.47,0,output.width*.5,output.height*.47,Math.max(output.width,output.height)*.65);
        gradient.addColorStop(0,'#203b39');gradient.addColorStop(1,'#0c1719');ctx.fillStyle=gradient;ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(canvas,0,0);
        const link=document.createElement('a');link.download='vortex-fluid.png';link.href=output.toDataURL('image/png');link.click();
      } catch(error) { $('stage-notice').textContent='当前画布无法导出，请尝试浏览器截图。';$('stage-notice').hidden=false;updateFraming(); }
    });
    canvas.addEventListener('pointerdown',event=>{
      if (event.button!==0) return;
      if (state.force.mode==='force') {
        const point=pointOnSlice(event);if (!point || !state.ready) return;
        state.drag={id:event.pointerId,kind:'force',point};moveForceMarker(point);
      } else state.drag={id:event.pointerId,kind:'orbit',x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);resize();
    });
    canvas.addEventListener('pointermove',event=>{
      if (!state.drag || state.drag.id!==event.pointerId) return;
      if (state.drag.kind==='force') {
        const point=pointOnSlice(event);
        if (!point) {state.drag.point=null;if(forceMarker)forceMarker.visible=false;state.dirty=true;return;}
        moveForceMarker(point);
        if (state.drag.point) {
          const delta=point.clone().sub(state.drag.point);
          if (delta.length()>=.035) {const center=point.clone().add(state.drag.point).multiplyScalar(.5);queueForce(center,delta);state.drag.point=point;}
        } else state.drag.point=point;
      } else {
        const dx=event.clientX-state.drag.x,dy=event.clientY-state.drag.y;state.drag.x=event.clientX;state.drag.y=event.clientY;
        state.camera.yaw+=dx*.008;state.camera.pitch=Math.max(-1.25,Math.min(1.25,state.camera.pitch+dy*.008));state.dirty=true;
      }
    });
    function end(event) {
      if (!state.drag || state.drag.id!==event.pointerId) return;
      state.drag=null;if(forceMarker)forceMarker.visible=false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      resize();state.dirty=true;
    }
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.camera.distance=Math.max(8,Math.min(22,state.camera.distance*Math.exp(event.deltaY*.001)));updateZoom();state.dirty=true;},{passive:false});
    canvas.addEventListener('dblclick',resetView);
    canvas.addEventListener('keydown',event=>{
      let handled=true;
      if(event.key==='ArrowLeft')state.camera.yaw-=.12;else if(event.key==='ArrowRight')state.camera.yaw+=.12;
      else if(event.key==='ArrowUp')state.camera.pitch=Math.max(-1.25,state.camera.pitch-.12);else if(event.key==='ArrowDown')state.camera.pitch=Math.min(1.25,state.camera.pitch+.12);
      else if(event.key==='+'||event.key==='='){state.camera.distance=Math.max(8,state.camera.distance/1.12);updateZoom();}else if(event.key==='-'||event.key==='_'){state.camera.distance=Math.min(22,state.camera.distance*1.12);updateZoom();}
      else if(event.key===' ')setPlaying(!state.playing);else handled=false;
      if(handled){event.preventDefault();state.dirty=true;}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden && state.playing)setPlaying(false);});
    document.addEventListener('lab:panelchange',()=>{updateFraming();state.dirty=true;});
    window.addEventListener('resize',resize);
    if('ResizeObserver' in window){const observer=new ResizeObserver(()=>{updateFraming();state.dirty=true;});observer.observe(document.querySelector('.lab-bottom'));}
  }
  try {
    // Keep the knowledge cards and navigation usable even when WebGL2,
    // Workers, or the numerical module cannot be initialized.
    bind(); updateControls();
    if (!api) throw new Error('流体求解模块没有加载');
    setupRenderer(); resize(); setupWorker(); requestAnimationFrame(animate);
  } catch(error) { fail('三维流体无法启动：'+error.message+'。可切换到涡丝对照。'); }
})();
