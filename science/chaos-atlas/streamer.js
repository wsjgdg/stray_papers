(function(){
  'use strict';
  const $=id=>document.getElementById(id),M=window.StreamerModel,THREE=window.THREE;
  const stage=$('streamer-stage'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let canvas=$('streamer-scene'),worker=null,renderer=null,scene=null,camera=null,ctx=null,object=null;
  const boundCanvases=new WeakSet(),HEIGHT=4.8;
  const presets={
    default:{field:.65,diffusion:.16,amplitude:.012,ionMobility:.015,feedback:true,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:6,description:'从中性种子真实预演到约 t = 6；重置从 t = 0 开始。'},
    weak:{field:.38,diffusion:.16,amplitude:.012,ionMobility:.015,feedback:true,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:6,description:'较弱的极板平均场；比较电子漂移和碰撞电离的变化。'},
    charge:{field:.8,diffusion:.16,amplitude:.080,ionMobility:.015,feedback:true,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:6,description:'提高种子密度以增强空间电荷反馈；可关闭反馈后从初态对比。'},
    offset:{field:.65,diffusion:.16,amplitude:.020,ionMobility:.015,feedback:true,sourceX:-45,sourceZ:-15,targetX:45,targetZ:15,warm:6,description:'错位针极改变电势与电子输运；种子始终靠近负极。'}
  };
  const state={
    preset:'default',field:.65,diffusion:.16,amplitude:.012,ionMobility:.015,feedback:true,
    sourceX:0,sourceZ:0,targetX:0,targetZ:0,quality:'standard',tolerance:2e-5,
    showElectrons:true,showIons:true,showIso:true,showSlice:false,sliceMode:'charge',slice:0,exposure:-1.52,
    tool:'orbit',note:'transport',probeId:null,pendingProbe:null,probeNotice:'尚未选择网格点。',
    playing:!reduced.matches&&!document.hidden,speed:1,ready:false,busy:false,failed:false,generation:0,data:null,halt:'',
    width:0,height:0,dpr:1,renderer:'',camera:{yaw:.42,pitch:.26,zoom:1},bounds:null,pixels:1,
    drag:null,resetTimer:null,queuedPlaying:false,accumulator:0,lastFrame:0,dirty:true,lastNotice:''
  };
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),vec=(x,y,z)=>({x,y,z});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z),scale=(a,s)=>vec(a.x*s,a.y*s,a.z*s);
  const fmt=(n,d=3)=>Number.isFinite(n)?(Math.abs(n)>=10000||(Math.abs(n)>0&&Math.abs(n)<.001)?Number(n).toExponential(2):Number(n).toFixed(d)):'—';
  const exp=n=>Number.isFinite(n)?Number(n).toExponential(1):'—';
  function basis(){const {yaw,pitch}=state.camera,sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    return {right:vec(cy,0,-sy),up:vec(-sy*sp,cp,-cy*sp),front:vec(sy*cp,sp,cy*cp)};}
  function grid(){return M.GRIDS[state.quality]||M.GRIDS.standard;}
  function coordFromSlider(value,n){return clamp(Math.round(2+(clamp(value,-100,100)+100)*(n-5)/200),2,n-3);}
  function sliderFromCoord(value,n){return clamp(Math.round((value-2)*200/(n-5)-100),-100,100);}
  function sliceIndex(data){return clamp(Math.round((state.slice+100)*(data.nz-1)/200),0,data.nz-1);}
  function sliceSlider(index,n){return clamp(Math.round(index*200/(n-1)-100),-100,100);}
  function solverOptions(){const g=grid();return {quality:state.quality,field:state.field,diffusion:state.diffusion,amplitude:state.amplitude,
    ionMobility:state.ionMobility,feedback:state.feedback,tolerance:state.tolerance,
    sourceX:coordFromSlider(state.sourceX,g.nx),sourceZ:coordFromSlider(state.sourceZ,g.nz),
    targetX:coordFromSlider(state.targetX,g.nx),targetZ:coordFromSlider(state.targetZ,g.nz)};}
  function progress(input){const lo=Number(input.min),hi=Number(input.max);input.style.setProperty('--progress',clamp(100*(Number(input.value)-lo)/(hi-lo),0,100)+'%');}
  function notice(text){text=text||'';if(text===state.lastNotice)return;state.lastNotice=text;$('stage-notice').textContent=text;$('stage-notice').hidden=!text;
    requestAnimationFrame(()=>{updateFraming();state.dirty=true;});}
  function fail(message){if(worker){worker.terminate();worker=null;}state.failed=true;state.ready=false;state.busy=false;state.playing=false;state.pendingProbe=null;
    delete stage.dataset.probePending;stage.dataset.status='error';$('stage-error-text').textContent=message;$('stage-error').hidden=false;notice('');updatePlayback();}
  function disposeObject(){
    if(!object||!scene){object=null;return;}scene.remove(object.group);
    object.group.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){for(const material of (Array.isArray(node.material)?node.material:[node.material])){if(material.map)material.map.dispose();material.dispose();}}});object=null;
  }
  function invalidate(){
    state.generation++;stage.dataset.generation=String(state.generation);if(worker){worker.terminate();worker=null;}
    state.ready=false;state.busy=false;state.failed=false;state.pendingProbe=null;delete stage.dataset.probePending;state.accumulator=0;state.lastFrame=0;
  }
  function requestReset(warm=0){
    if(state.resetTimer){clearTimeout(state.resetTimer);state.resetTimer=null;state.playing=state.queuedPlaying;}
    invalidate();state.busy=true;state.data=null;state.halt='';state.probeId=null;state.probeNotice='尚未选择网格点。';disposeObject();canvas.style.opacity='0';
    stage.dataset.status='loading';stage.dataset.time='0';stage.dataset.steps='0';$('stage-error-text').textContent=warm?'正在求解电势并预演到 t ≈ '+warm+'，请稍候……':'正在根据新初态求解三维泊松场，请稍候……';
    $('stage-error').hidden=false;notice('');updateControls();updatePlayback();updateTelemetry();state.dirty=true;
    try{
      if(!window.Worker)throw Error('当前浏览器不支持后台 Worker');
      const local=worker=new Worker('streamer-worker.js?v=20261031-25'),generation=state.generation;
      local.onerror=()=>{if(worker===local&&generation===state.generation)fail('后台求解器无法启动。请通过本地服务器打开页面，并确认 Worker 可用。');};
      local.onmessage=event=>{
        if(worker!==local||generation!==state.generation)return;const message=event.data||{};if(message.generation!==generation)return;
        if(message.kind==='error'){fail('流注求解已停止：'+message.message);return;}
        if(message.kind!=='ready'&&message.kind!=='frame')return;
        state.data=message.snapshot;state.halt=message.halt||'';state.ready=true;state.busy=false;state.failed=false;stage.dataset.status='ready';$('stage-error').hidden=true;
        if(state.halt){state.playing=false;state.accumulator=0;notice(state.halt);}else if(state.pendingProbe)notice('已暂停，等待已提交的时间步完成后探测。');else notice('');
        if(state.pendingProbe){const pending=state.pendingProbe;state.pendingProbe=null;delete stage.dataset.probePending;completeProbe(pending);if(state.halt)notice(state.halt);}
        updateControls();updateTelemetry();updatePlayback();updateObjects();updateFraming();state.dirty=true;
        // Do not reveal an old framebuffer underneath newly solved parameters.
        draw();canvas.style.opacity='';
      };
      local.postMessage({type:'init',generation,options:solverOptions(),warm});
    }catch(error){fail('无法启动后台求解器：'+(error&&error.message||error)+'。请通过本地服务器打开。');}
  }
  function queueReset(){
    if(!state.resetTimer){state.queuedPlaying=state.playing;invalidate();state.data=null;state.halt='';state.probeId=null;disposeObject();canvas.style.opacity='0';
      stage.dataset.status='loading';$('stage-error-text').textContent='参数已改变，停止调节后从初态重新求解……';$('stage-error').hidden=false;notice('');}
    clearTimeout(state.resetTimer);state.playing=false;updateControls();updatePlayback();updateTelemetry();
    state.resetTimer=setTimeout(()=>{state.resetTimer=null;state.playing=state.queuedPlaying;requestReset(0);},180);
  }
  function sendSteps(count){if(!state.ready||state.busy||state.halt||!worker)return;state.busy=true;worker.postMessage({type:'advance',generation:state.generation,count});updatePlayback();}
  function setPlaying(value){if(!state.ready||state.failed)return;if(value&&state.halt){notice(state.halt+' 点击重置可重新开始。');return;}
    state.playing=!!value;state.accumulator=0;state.lastFrame=0;
    if(value&&state.pendingProbe){state.pendingProbe=null;delete stage.dataset.probePending;state.probeNotice='已取消待处理的探测。';notice('');}
    updatePlayback();}
  function updatePlayback(){
    $('play').disabled=!state.ready||state.failed||!!state.halt;$('step').disabled=!state.ready||state.busy||state.failed||!!state.halt;
    $('reset').disabled=!state.ready&&!state.failed;$('save-image').disabled=!state.ready;
    $('play-symbol').textContent=state.playing?'Ⅱ':'▶';$('play-text').textContent=state.playing?'暂停':'播放';$('play').setAttribute('aria-label',state.playing?'暂停演化':'播放演化');
    $('header-status').textContent=state.failed?'求解已停止':!state.ready?'正在求解电场':state.halt?'保护暂停':state.playing?'粒子与电场演化中':'模拟已暂停';
    $('stage-status').textContent=state.failed?'SOLVER STOPPED':!state.ready?'SOLVING FIELD':state.halt?'SAFETY PAUSE':state.playing?'SELF-CONSISTENT TRANSPORT':'TRANSPORT PAUSED';
    if(state.ready&&state.playing&&!state.data.feedback)$('stage-status').textContent='FIXED FIELD TRANSPORT';
    document.querySelector('.top-status').classList.toggle('paused',!state.playing);stage.classList.toggle('paused',!state.playing);
  }
  function setNote(note){state.note=note;document.querySelectorAll('[data-note]').forEach(el=>{const active=el.dataset.note===note;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-note-content]').forEach(el=>{el.hidden=el.dataset.noteContent!==note;});document.dispatchEvent(new CustomEvent('lab:contentchange'));}
  function setTool(tool){state.tool=tool;if(tool==='probe')state.showSlice=true;updateControls();updateObjects();updateFraming();state.dirty=true;}
  function updateControls(){
    const g=grid(),h=24/(g.nx-1);
    for(const [id,key,digits,suffix] of [['field','field',2,''],['diffusion','diffusion',2,''],['amplitude','amplitude',3,''],['ion-mobility','ionMobility',3,''],['camera-zoom','camera.zoom',2,'×']]){
      const value=key==='camera.zoom'?state.camera.zoom:state[key];$(id).value=String(value);$(id+'-value').textContent=Number(value).toFixed(digits)+suffix;progress($(id));
    }
    for(const [id,key,n] of [['source-x','sourceX',g.nx],['source-z','sourceZ',g.nz],['target-x','targetX',g.nx],['target-z','targetZ',g.nz]]){
      $(id).value=String(state[key]);$(id+'-value').textContent=((coordFromSlider(state[key],n)-(n-1)/2)*h).toFixed(1);progress($(id));
    }
    $('slice-z').value=String(state.slice);$('slice-z-value').textContent=((sliceIndex(g)-(g.nz-1)/2)*h).toFixed(1);$('slice-z').disabled=!state.showSlice;progress($('slice-z'));
    $('exposure').value=String(state.exposure);$('exposure-value').textContent=fmt(10**state.exposure,3);progress($('exposure'));
    $('feedback').checked=state.feedback;$('show-electrons').checked=state.showElectrons;$('show-ions').checked=state.showIons;$('show-iso').checked=state.showIso;$('show-slice').checked=state.showSlice;
    $('slice-mode').value=state.sliceMode;$('slice-mode').disabled=!state.showSlice;$('grid-quality').value=state.quality;$('solver-accuracy').value=String(state.tolerance);
    document.querySelectorAll('[data-preset]').forEach(el=>{const active=el.dataset.preset===state.preset;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    $('preset-description').textContent=state.preset?presets[state.preset].description:'自定义初态；粒子或电极参数变化后从 t = 0 重算。';
    document.querySelectorAll('button[data-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tool===state.tool)));
    const instructions={orbit:'拖动空白处旋转视角；滚轮或滑块缩放。',probe:'点击剖面选择网格点；Enter 选择电子峰值，方向键可移动探针。',source:'在负极针尖高度的水平面点击或拖动；松手后重算。方向键调整网格位置。',target:'在正极针尖高度的水平面点击或拖动；松手后重算。方向键调整网格位置。'};
    $('tool-description').textContent=instructions[state.tool];$('stage-instruction').textContent=state.tool==='orbit'?'↔ 拖动旋转 · 滚轮缩放':state.tool==='probe'?'点击剖面探测 · Enter 选择电子峰值':'拖动针极 · 松手后从初态重算';
    canvas.classList.toggle('precise',state.tool!=='orbit');canvas.setAttribute('aria-label',state.tool==='orbit'?'三维电子与离子密度场。拖动旋转，滚轮缩放；方向键旋转，空格播放或暂停。':state.tool==='probe'?'剖面探针。点击剖面，或按 Enter 探测电子峰值；方向键移动探针，空格播放或暂停。':(state.tool==='source'?'负极':'正极')+'移动模式。拖动针尖高度的水平面，或按方向键调整位置；松手后从初态重算。');
    document.querySelectorAll('[data-speed]').forEach(el=>{const active=Number(el.dataset.speed)===state.speed;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    stage.dataset.tool=state.tool;stage.dataset.showSlice=String(state.showSlice);stage.dataset.feedback=String(state.feedback);stage.dataset.sliceMode=state.sliceMode;
    $('charge-slice').setAttribute('aria-pressed',String(state.showSlice&&state.sliceMode==='charge'));
  }
  function localField(d,id){
    const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny,nx=d.nx,plane=d.nx*d.ny,p=d.potential,h=d.h;
    const ex=-(p[x<d.nx-1?id+1:id]-p[x>0?id-1:id])/(2*h),ey=-(p[y<d.ny-1?id+nx:id]-p[y>0?id-nx:id])/(2*h),ez=-(p[z<d.nz-1?id+plane:id]-p[z>0?id-plane:id])/(2*h);
    return {x,y,z,ex,ey,ez,mag:Math.hypot(ex,ey,ez)};
  }
  function updateTelemetry(){
    const d=state.data;if(!d){for(const id of ['time-readout','electron-readout','field-readout','residual-readout','card-production','card-charge','card-feedback','card-budget','card-absorbed','card-numerics','probe-density','probe-charge','probe-field'])$(id).textContent='—';$('probe-readout').textContent=state.probeNotice;return;}
    const s=d.stats;$('time-readout').textContent=fmt(s.time,2);$('electron-readout').textContent=fmt(s.maxElectron,3);$('field-readout').textContent=fmt(s.maxField,3);$('residual-readout').textContent=exp(s.residual);
    $('card-production').textContent=fmt(s.produced,2)+' / '+fmt(s.ionization,3);$('card-charge').textContent=fmt(s.charge,3)+' / '+fmt(s.maxField,3);
    $('card-feedback').textContent=d.feedback?'自洽泊松场':'固定外加场';$('card-budget').textContent=exp(s.chargeBudget)+' / '+exp(s.residual);
    $('card-absorbed').textContent=fmt(s.absorbedElectrons,3)+' / '+fmt(s.absorbedIons,3);$('card-numerics').textContent=d.nx+'×'+d.ny+'×'+d.nz+' / '+fmt(s.lastStep,4);
    const id=state.probeId;if(id!==null&&id>=0&&id<d.mask.length&&d.mask[id]===M.EMPTY){
      const f=localField(d,id),ne=d.electrons[id],ni=d.ions[id],rate=f.mag>1e-12?ne*f.mag*Math.exp(-1/f.mag):0;
      $('probe-readout').textContent='网格 ('+f.x+', '+f.y+', '+f.z+') · t = '+fmt(s.time,2);$('probe-density').textContent=fmt(ne,4)+' / '+fmt(ni,4);
      $('probe-charge').textContent=fmt(ni-ne,4)+' / '+fmt(d.potential[id],3);$('probe-field').textContent=fmt(f.mag,3)+' / '+fmt(rate,4);
      stage.dataset.probeId=String(id);stage.dataset.probeElectron=String(ne);stage.dataset.probeIon=String(ni);stage.dataset.probeField=String(f.mag);
    }else{$('probe-readout').textContent=state.probeNotice;$('probe-density').textContent='—';$('probe-charge').textContent='—';$('probe-field').textContent='—';delete stage.dataset.probeId;delete stage.dataset.probeElectron;delete stage.dataset.probeIon;delete stage.dataset.probeField;}
    stage.dataset.time=String(s.time);stage.dataset.steps=String(s.steps);stage.dataset.residual=String(s.residual);stage.dataset.chargeBudget=String(s.chargeBudget);
    stage.dataset.sourceX=String(d.sourceX);stage.dataset.sourceZ=String(d.sourceZ);stage.dataset.targetX=String(d.targetX);stage.dataset.targetZ=String(d.targetZ);stage.dataset.solvedFeedback=String(d.feedback);
  }
  function point(d,id){const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny,u=HEIGHT/(d.ny-1);return vec((x-(d.nx-1)/2)*u,HEIGHT/2-y*u,(z-(d.nz-1)/2)*u);}
  function pointAt(d,x,y,z){return point(d,x+d.nx*(y+d.ny*z));}
  function electrodePoint(d,which,preview=true){
    let x=which==='source'?d.sourceX:d.targetX,z=which==='source'?d.sourceZ:d.targetZ;
    if(preview&&state.drag&&state.drag.tool===which&&state.drag.changed){x=coordFromSlider(state[which+'X'],d.nx);z=coordFromSlider(state[which+'Z'],d.nz);}
    const y=which==='source'?d.rodLength:d.ny-1-d.rodLength;return pointAt(d,x,y,z);
  }
  function project(p){const b=basis(),box=state.bounds;return {x:box.centerX+dot(p,b.right)*state.pixels,y:box.centerY-dot(p,b.up)*state.pixels,depth:dot(p,b.front)};}
  function rayAt(x,y){const b=basis(),box=state.bounds,origin=add(scale(b.right,(x-box.centerX)/state.pixels),scale(b.up,(box.centerY-y)/state.pixels));return {origin,front:b.front};}
  function intersectPlane(x,y,axis,value){const ray=rayAt(x,y),v=ray.front[axis];if(Math.abs(v)<.07)return null;return add(ray.origin,scale(ray.front,(value-ray.origin[axis])/v));}
  function bounds(){
    const box=stage.getBoundingClientRect(),hud=document.querySelector('.lab-bottom').getBoundingClientRect();let left=46,right=state.width-46,top=state.height<=540?52:98,bottom=state.height-30;
    const caption=stage.querySelector('.vortex-caption');if(state.width<=520&&state.height>400&&getComputedStyle(caption).display!=='none')top=Math.max(top,caption.getBoundingClientRect().bottom-box.top+10);
    if(!$('control-panel').hidden)left=Math.max(left,$('control-panel').getBoundingClientRect().right-box.left+14);
    if(!$('knowledge-panel').hidden)right=Math.min(right,$('knowledge-panel').getBoundingClientRect().left-box.left-14);
    const hudTop=hud.top-box.top;if(hud.width&&hudTop>top+55)bottom=Math.min(bottom,hudTop-18);
    const legend=stage.querySelector('.stage-bottom').getBoundingClientRect();if(legend.height&&legend.top-box.top>top+55)bottom=Math.min(bottom,legend.top-box.top-12);
    if(right-left<110){left=38;right=state.width-38;}if(bottom-top<70){top=48;bottom=Math.max(top+55,Math.min(state.height-40,hudTop-10));}
    return {left,right,top,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
  }
  function updateFraming(){
    if(!state.width||!state.height)return;const hud=document.querySelector('.lab-bottom').getBoundingClientRect(),hudTop=hud.top-stage.getBoundingClientRect().top;
    const safe=state.height-hudTop+12,legendMin=state.width<=360?174:150,panelMin=state.height<=540?12:state.width<=360?180:158;
    stage.style.setProperty('--vortex-legend-bottom',Math.ceil(Math.max(legendMin,safe))+'px');$('workbench').style.setProperty('--vortex-panel-bottom',Math.ceil(Math.min(state.height-130,Math.max(panelMin,safe)))+'px');
    const b=state.bounds=bounds(),v=basis();state.pixels=Math.max(1,Math.min(b.width*.92/4.6,b.height*.9/5.8))*state.camera.zoom;
    if(camera){camera.left=-b.centerX/state.pixels;camera.right=(state.width-b.centerX)/state.pixels;camera.top=b.centerY/state.pixels;camera.bottom=-(state.height-b.centerY)/state.pixels;
      camera.near=.1;camera.far=100;camera.position.set(v.front.x*20,v.front.y*20,v.front.z*20);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
    updatePointUniforms();state.dirty=true;
  }
  function resize(){const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;state.width=r.width;state.height=r.height;
    state.dpr=Math.max(.25,Math.min(window.devicePixelRatio||1,1.5,1800/Math.max(r.width,r.height)));
    if(renderer){renderer.setPixelRatio(state.dpr);renderer.setSize(r.width,r.height,false);}else if(ctx){canvas.width=Math.round(r.width*state.dpr);canvas.height=Math.round(r.height*state.dpr);canvas.style.width='100%';canvas.style.height='100%';ctx.setTransform(state.dpr,0,0,state.dpr,0,0);}
    stage.dataset.renderScale=String(state.dpr);updateFraming();}
  function replaceCanvas(){const focus=document.activeElement===canvas,next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;bindCanvas();updateControls();if(focus)canvas.focus({preventScroll:true});}
  function useCanvas(reason,replace=true){
    if(renderer){try{renderer.dispose();}catch(_){}renderer=null;}disposeObject();scene=null;camera=null;if(replace)replaceCanvas();
    ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('WebGL 和 Canvas 2D 均不可用');state.renderer='canvas';stage.dataset.renderer='canvas';$('stage-fallback').hidden=false;
    $('stage-fallback').textContent=(reason||'WebGL 不可用，已切换到相同数据的 Canvas 投影。')+' 等值线为稀疏采样。';resize();state.dirty=true;
  }
  function setupRenderer(){
    try{if(!THREE||typeof THREE.WebGLRenderer!=='function')throw Error('未加载 WebGL');renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);state.renderer='webgl';stage.dataset.renderer='webgl';$('stage-fallback').hidden=true;
    }catch(_){useCanvas('WebGL 不可用，已切换到相同电荷和电场数据的 Canvas 投影。',true);}
  }
  function pointMaterial(color){return new THREE.ShaderMaterial({
    uniforms:{uColor:{value:new THREE.Color(color)},uReference:{value:10**state.exposure},uSize:{value:12}},
    vertexShader:`attribute float density; uniform float uReference; uniform float uSize; varying float vAmount;
      void main(){float ref=max(uReference,0.000001); float d=max(density,0.0); vAmount=clamp(log(1.0+d/(ref*0.1))/log(11.0),0.0,1.0);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(uSize*(0.25+0.9*sqrt(vAmount)),1.0,46.0);}`,
    fragmentShader:`uniform vec3 uColor; varying float vAmount; void main(){float r=length(gl_PointCoord-vec2(0.5))*2.0; float glow=pow(max(0.0,1.0-r),1.7);
      gl_FragColor=vec4(uColor,glow*pow(vAmount,0.8)*0.32);}`,
    transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending
  });}
  function makeObject(d){
    const group=new THREE.Group(),u=HEIGHT/(d.ny-1),width=(d.nx-1)*u,depth=(d.nz-1)*u;
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width,HEIGHT,depth)),new THREE.LineBasicMaterial({color:0x668a90,transparent:true,opacity:.32,depthWrite:false}));group.add(outline);
    for(const y of [-HEIGHT/2,HEIGHT/2]){const plate=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color:y>0?0x3b838c:0x9f714c,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide}));plate.rotation.x=-Math.PI/2;plate.position.y=y;group.add(plate);
      const grid=new THREE.GridHelper(width,8,y>0?0x72999a:0x9f8870,0x446168);grid.position.y=y;grid.material.transparent=true;grid.material.opacity=.21;grid.material.depthWrite=false;group.add(grid);}
    const positions=new Float32Array(d.electrons.length*3);for(let i=0;i<d.electrons.length;i++){const p=point(d,i);positions[3*i]=p.x;positions[3*i+1]=p.y;positions[3*i+2]=p.z;}
    function cloud(name,color){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const attribute=new THREE.BufferAttribute(new Float32Array(d.electrons.length),1);attribute.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('density',attribute);
      const points=new THREE.Points(geometry,pointMaterial(color));points.name=name;points.frustumCulled=false;group.add(points);return points;}
    const electrons=cloud('electron-density',0x68dfff),ions=cloud('ion-density',0xf4a46d);
    const iso=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.ShaderMaterial({
      vertexShader:`varying vec3 vNormal;void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`varying vec3 vNormal;void main(){float rim=pow(1.0-abs(normalize(vNormal).z),1.7);gl_FragColor=vec4(0.47,0.82,0.93,0.018+0.105*rim);}`,
      transparent:true,side:THREE.DoubleSide,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
    iso.name='electron-isosurface';iso.frustumCulled=false;group.add(iso);
    const length=d.rodLength*u,neg=new THREE.Mesh(new THREE.CylinderGeometry(.065,.095,length,12),new THREE.MeshBasicMaterial({color:0x9ed8df})),pos=new THREE.Mesh(new THREE.CylinderGeometry(.095,.065,length,12),new THREE.MeshBasicMaterial({color:0xe6b187}));group.add(neg,pos);
    const negTip=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color:0xd5faff})),posTip=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color:0xffd2a6}));group.add(negTip,posTip);
    const fieldBytes=new Uint8Array(d.nx*d.ny*4),texture=new THREE.DataTexture(fieldBytes,d.nx,d.ny,THREE.RGBAFormat);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    const slice=new THREE.Mesh(new THREE.PlaneGeometry(width,HEIGHT),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide}));slice.name='field-slice';slice.visible=false;group.add(slice);
    const arrows=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe2f6d9,transparent:true,opacity:.75,depthWrite:false,depthTest:false}));arrows.name='electric-field-arrows';arrows.visible=false;group.add(arrows);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),new THREE.MeshBasicMaterial({color:0xffe5ae,depthTest:false}));marker.name='probe-marker';marker.visible=false;group.add(marker);
    scene.add(group);return {group,u,electrons,ions,iso,neg,pos,negTip,posTip,slice,texture,fieldBytes,arrows,marker};
  }
  function sliceColor(d,id){
    if(state.sliceMode==='potential'){
      const v=d.voltage>1e-12?clamp(d.potential[id]/d.voltage,0,1):0;return [Math.round(23+188*v),Math.round(64+104*v),Math.round(88+28*v),92];
    }
    const rho=d.ions[id]-d.electrons[id],v=clamp(Math.abs(rho)/.04,0,1),warm=rho>=0;
    return [Math.round(18+(warm?213:42)*v),Math.round(49+(warm?105:151)*v),Math.round(59+(warm?25:175)*v),Math.round(28+118*Math.sqrt(v))];
  }
  function makeArrows(d){
    const z=sliceIndex(d),dx=Math.max(2,Math.round(d.nx/8)),dy=Math.max(2,Math.round(d.ny/11)),raw=[];let max=0;
    for(let y=2;y<d.ny-2;y+=dy)for(let x=2;x<d.nx-2;x+=dx){const i=x+d.nx*(y+d.ny*z);if(d.mask[i]!==M.EMPTY)continue;const f=localField(d,i),vx=f.ex,vy=-f.ey,mag=Math.hypot(vx,vy);if(mag<1e-10)continue;max=Math.max(max,mag);raw.push({i,vx,vy,mag});}
    const lines=[];for(const a of raw){if(a.mag<max*.02)continue;const p=point(d,a.i),vx=a.vx/a.mag,vy=a.vy/a.mag,len=.08+.20*Math.sqrt(a.mag/max),tip=vec(p.x+vx*len,p.y+vy*len,p.z+.008),start=vec(p.x,p.y,p.z+.008),back=vec(tip.x-vx*.055,tip.y-vy*.055,tip.z);
      lines.push(start,tip,tip,vec(back.x-vy*.025,back.y+vx*.025,tip.z),tip,vec(back.x+vy*.025,back.y-vx*.025,tip.z));}
    return lines;
  }
  function updatePointUniforms(){if(!object||!state.data)return;const px=state.pixels*object.u*.90*state.dpr,ref=10**state.exposure;
    for(const cloud of [object.electrons,object.ions]){cloud.material.uniforms.uSize.value=px;cloud.material.uniforms.uReference.value=ref;}}
  function updateObjects(){
    const d=state.data;if(!scene||!d)return;if(!object)object=makeObject(d);
    const hiding=!!(state.drag&&state.drag.changed&&(state.drag.tool==='source'||state.drag.tool==='target'));
    object.electrons.visible=state.showElectrons&&!hiding;object.ions.visible=state.showIons&&!hiding;object.iso.visible=state.showIso&&!hiding;
    object.iso.geometry.setAttribute('position',new THREE.BufferAttribute(d.isoTriangles,3));object.iso.geometry.setAttribute('normal',new THREE.BufferAttribute(d.isoNormals,3));stage.dataset.isoTriangles=String(d.isoTriangles.length/9);stage.dataset.isoSegments=String(d.isoLines.length/6);
    object.electrons.geometry.attributes.density.array.set(d.electrons);object.electrons.geometry.attributes.density.needsUpdate=true;
    object.ions.geometry.attributes.density.array.set(d.ions);object.ions.geometry.attributes.density.needsUpdate=true;
    const a=electrodePoint(d,'source'),b=electrodePoint(d,'target'),length=d.rodLength*object.u;
    object.neg.position.set(a.x,HEIGHT/2-length/2,a.z);object.pos.position.set(b.x,-HEIGHT/2+length/2,b.z);object.negTip.position.set(a.x,a.y,a.z);object.posTip.position.set(b.x,b.y,b.z);
    object.slice.visible=state.showSlice&&!hiding;object.arrows.visible=state.showSlice&&!hiding;
    if(state.showSlice&&!hiding){const z=sliceIndex(d),rgba=object.fieldBytes;
      for(let row=0;row<d.ny;row++)for(let x=0;x<d.nx;x++){const y=d.ny-1-row,id=x+d.nx*(y+d.ny*z),color=sliceColor(d,id),k=4*(x+row*d.nx);rgba.set(color,k);}
      object.texture.needsUpdate=true;object.slice.position.z=(z-(d.nz-1)/2)*object.u;const lines=makeArrows(d),array=new Float32Array(lines.length*3);
      lines.forEach((p,i)=>{array[3*i]=p.x;array[3*i+1]=p.y;array[3*i+2]=p.z;});object.arrows.geometry.setAttribute('position',new THREE.BufferAttribute(array,3));object.arrows.geometry.computeBoundingSphere();}
    object.marker.visible=state.probeId!==null&&state.showSlice&&!hiding&&state.probeId<d.mask.length&&!d.mask[state.probeId];if(object.marker.visible){const p=point(d,state.probeId);object.marker.position.set(p.x,p.y,p.z+.012);}
    updatePointUniforms();
  }
  function drawLine(a,b,color,width=1){const p=project(a),q=project(b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}
  function drawCanvas(){
    if(!ctx||!state.bounds)return;ctx.clearRect(0,0,state.width,state.height);const d=state.data;if(!d)return;
    const u=HEIGHT/(d.ny-1),w=(d.nx-1)*u/2,zmax=(d.nz-1)*u/2,ys=[-HEIGHT/2,HEIGHT/2];
    for(const y of ys){for(const z of [-zmax,zmax])drawLine(vec(-w,y,z),vec(w,y,z),'rgba(119,161,164,.28)');for(const x of [-w,w])drawLine(vec(x,y,-zmax),vec(x,y,zmax),'rgba(119,161,164,.28)');
      for(let k=1;k<8;k++){const x=-w+2*w*k/8,z=-zmax+2*zmax*k/8;drawLine(vec(x,y,-zmax),vec(x,y,zmax),'rgba(106,145,146,.13)');drawLine(vec(-w,y,z),vec(w,y,z),'rgba(106,145,146,.13)');}}
    for(const x of [-w,w])for(const z of [-zmax,zmax])drawLine(vec(x,-HEIGHT/2,z),vec(x,HEIGHT/2,z),'rgba(119,161,164,.24)');
    const hiding=!!(state.drag&&state.drag.changed&&(state.drag.tool==='source'||state.drag.tool==='target'));
    if(state.showSlice&&!hiding){const z=sliceIndex(d);for(let y=0;y<d.ny-1;y++)for(let x=0;x<d.nx-1;x++){
      const id=x+d.nx*(y+d.ny*z),c=sliceColor(d,id),a=project(pointAt(d,x,y,z)),b=project(pointAt(d,x+1,y,z)),c1=project(pointAt(d,x+1,y+1,z)),e=project(pointAt(d,x,y+1,z));
      ctx.fillStyle='rgba('+c[0]+','+c[1]+','+c[2]+','+(c[3]/255*.9)+')';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c1.x,c1.y);ctx.lineTo(e.x,e.y);ctx.closePath();ctx.fill();}}
    if(!hiding){ctx.globalCompositeOperation='lighter';const ref=10**state.exposure,unitPixels=state.pixels*u;
      for(const [arr,enabled,color] of [[d.electrons,state.showElectrons,'77,192,243'],[d.ions,state.showIons,'239,145,89']])if(enabled){
        for(let id=0;id<arr.length;id++){const value=arr[id];if(value<ref*.002)continue;const amount=clamp(Math.log1p(value/(ref*.1))/Math.log(11),0,1),p=project(point(d,id)),radius=clamp(unitPixels*(.18+.45*Math.sqrt(amount)),.7,16);
          ctx.fillStyle='rgba('+color+','+(amount*.13)+')';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();}}
      ctx.globalCompositeOperation='source-over';}
    // The fallback samples the same Worker-generated contour to limit Canvas
    // drawing cost; every shown segment still comes from the density field.
    if(state.showIso&&!hiding){const lines=d.isoLines;for(let i=0;i<lines.length;i+=24)drawLine(vec(lines[i],lines[i+1],lines[i+2]),vec(lines[i+3],lines[i+4],lines[i+5]),'rgba(152,223,232,.18)',.7);}
    if(state.showSlice&&!hiding){const lines=makeArrows(d);for(let i=0;i<lines.length;i+=2)drawLine(lines[i],lines[i+1],'rgba(222,245,219,.70)',1);}
    const a=electrodePoint(d,'source'),b=electrodePoint(d,'target');drawLine(vec(a.x,HEIGHT/2,a.z),a,'#b5e4e6',3);drawLine(vec(b.x,-HEIGHT/2,b.z),b,'#ebba90',3);
    for(const [p,color] of [[a,'#d9faff'],[b,'#ffddb1']]){const q=project(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(q.x,q.y,3,0,2*Math.PI);ctx.fill();}
    if(state.probeId!==null&&state.showSlice&&!hiding&&!d.mask[state.probeId]){const q=project(point(d,state.probeId));ctx.strokeStyle='#ffe3ae';ctx.lineWidth=2;ctx.beginPath();ctx.arc(q.x,q.y,6,0,2*Math.PI);ctx.stroke();}
  }
  function draw(){if(!state.width||!state.height)return;try{if(renderer&&scene&&camera)renderer.render(scene,camera);else drawCanvas();state.dirty=false;}
    catch(_){try{useCanvas('WebGL 绘制失败，已切换到相同数据的 Canvas 投影。',true);drawCanvas();state.dirty=false;}catch(error){fail('无法绘制当前计算结果：'+error.message);}}}
  function completeProbe(pending){
    const d=state.data;if(!d)return;let id;
    if(pending.kind==='peak'){
      if(!(d.stats.maxElectron>0)){state.probeNotice='当前没有电子密度，无法选择峰值。';state.probeId=null;notice(state.probeNotice);updateTelemetry();return;}
      id=d.stats.peakIndex;const z=localField(d,id).z;state.slice=sliceSlider(z,d.nz);
    }else if(pending.kind==='id')id=pending.id;
    else{const z=sliceIndex(d),plane=(z-(d.nz-1)/2)*HEIGHT/(d.ny-1),p=intersectPlane(pending.x,pending.y,'z',plane);
      if(!p){notice('当前视角几乎平行于剖面，请先旋转视角再探测。');return;}
      const u=HEIGHT/(d.ny-1),x=Math.round(p.x/u+(d.nx-1)/2),y=Math.round((HEIGHT/2-p.y)/u);
      if(x<0||x>=d.nx||y<0||y>=d.ny){notice('请点击计算域内的剖面网格。');return;}id=x+d.nx*(y+d.ny*z);
    }
    if(id<0||id>=d.mask.length||d.mask[id]!==M.EMPTY){state.probeId=null;state.probeNotice='该网格为吸收电极，请选择自由网格。';notice(state.probeNotice);}
    else{state.probeId=id;state.probeNotice='';notice('');}
    state.showSlice=true;state.tool='probe';setNote('probe');updateControls();updateTelemetry();updateObjects();state.dirty=true;
  }
  function requestProbe(pending){
    if(!state.ready)return;state.playing=false;state.accumulator=0;updatePlayback();
    if(state.busy){state.pendingProbe=pending;stage.dataset.probePending='true';notice('已暂停，等待已提交的时间步完成后探测。');}
    else completeProbe(pending);
  }
  function beginElectrodeChange(drag){
    if(drag.changed)return;drag.changed=true;drag.wasPlaying=state.playing;invalidate();state.playing=false;stage.dataset.status='adjusting';state.probeId=null;
    notice('正在移动电极；旧密度与电场已隐藏，松手后从初态重算。');updatePlayback();
  }
  function moveElectrode(x,y,drag){
    const d=state.data;if(!d||!state.bounds)return;const p0=electrodePoint(d,drag.tool,false),p=intersectPlane(x,y,'y',p0.y);
    if(!p){notice('当前视角几乎平行于针尖平面，请先旋转视角。');return;}
    const u=HEIGHT/(d.ny-1),ix=clamp(Math.round(p.x/u+(d.nx-1)/2),2,d.nx-3),iz=clamp(Math.round(p.z/u+(d.nz-1)/2),2,d.nz-3),keyX=drag.tool+'X',keyZ=drag.tool+'Z';
    if(ix===coordFromSlider(state[keyX],d.nx)&&iz===coordFromSlider(state[keyZ],d.nz))return;
    beginElectrodeChange(drag);state[keyX]=sliderFromCoord(ix,d.nx);state[keyZ]=sliderFromCoord(iz,d.nz);state.preset=null;updateControls();updateObjects();state.dirty=true;
  }
  function bindCanvas(){
    if(boundCanvases.has(canvas))return;boundCanvases.add(canvas);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(renderer){useCanvas('WebGL 上下文丢失，已切换到相同数据的 Canvas 投影。',true);state.dirty=true;}});
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==undefined&&event.button!==0)return;if(!state.bounds)return;canvas.focus({preventScroll:true});const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;
      state.drag={id:event.pointerId,tool:state.tool,x,y,startX:x,startY:y,changed:false};try{canvas.setPointerCapture(event.pointerId);}catch(_){}
      if(state.tool==='source'||state.tool==='target')moveElectrode(x,y,state.drag);
    });
    canvas.addEventListener('pointermove',event=>{
      const d=state.drag;if(!d||event.pointerId!==d.id)return;const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;
      if(d.tool==='orbit'){state.camera.yaw+=(x-d.x)*.008;state.camera.pitch=clamp(state.camera.pitch+(y-d.y)*.008,-1.15,1.15);updateFraming();}
      else if(d.tool==='source'||d.tool==='target')moveElectrode(x,y,d);
      d.x=x;d.y=y;state.dirty=true;
    });
    function end(event){const d=state.drag;if(!d||event.pointerId!==d.id)return;state.drag=null;try{canvas.releasePointerCapture(event.pointerId);}catch(_){}
      if((d.tool==='source'||d.tool==='target')&&d.changed){state.playing=d.wasPlaying;requestReset(0);}
      else if(d.tool==='probe'&&Math.hypot(d.x-d.startX,d.y-d.startY)<12)requestProbe({kind:'point',x:d.x,y:d.y});
      else{updateObjects();state.dirty=true;}}
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.camera.zoom=clamp(state.camera.zoom*Math.exp(-event.deltaY*.001),.55,1.65);updateControls();updateFraming();},{passive:false});
    canvas.addEventListener('dblclick',()=>{if(state.tool==='orbit')resetView();});
    canvas.addEventListener('keydown',event=>{
      const k=event.key;if(k===' '){event.preventDefault();setPlaying(!state.playing);return;}
      if(k==='+'||k==='='||k==='-'){event.preventDefault();state.camera.zoom=clamp(state.camera.zoom+(k==='-'?-.08:.08),.55,1.65);updateControls();updateFraming();return;}
      if(state.tool==='probe'&&k==='Enter'){event.preventDefault();requestProbe({kind:'peak'});return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k))return;event.preventDefault();
      if(state.tool==='orbit'){state.camera.yaw+=(k==='ArrowRight'?.12:k==='ArrowLeft'?-.12:0);state.camera.pitch=clamp(state.camera.pitch+(k==='ArrowUp'?-.1:k==='ArrowDown'?.1:0),-1.15,1.15);updateFraming();}
      else if((state.tool==='source'||state.tool==='target')&&(state.ready||state.resetTimer)){const g=grid(),which=state.tool,keyX=which+'X',keyZ=which+'Z';let x=coordFromSlider(state[keyX],g.nx),z=coordFromSlider(state[keyZ],g.nz);
        x=clamp(x+(k==='ArrowRight'?1:k==='ArrowLeft'?-1:0),2,g.nx-3);z=clamp(z+(k==='ArrowDown'?1:k==='ArrowUp'?-1:0),2,g.nz-3);state[keyX]=sliderFromCoord(x,g.nx);state[keyZ]=sliderFromCoord(z,g.nz);state.preset=null;queueReset();}
      else if(state.tool==='probe'&&state.data&&state.probeId!==null){const d=state.data,f=localField(d,state.probeId),x=clamp(f.x+(k==='ArrowRight'?1:k==='ArrowLeft'?-1:0),0,d.nx-1),y=clamp(f.y+(k==='ArrowDown'?1:k==='ArrowUp'?-1:0),0,d.ny-1);requestProbe({kind:'id',id:x+d.nx*(y+d.ny*f.z)});}
    });
  }
  function resetView(){state.camera={yaw:.42,pitch:.26,zoom:1};updateControls();updateFraming();}
  function saveImage(){
    draw();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const c=out.getContext('2d'),g=c.createRadialGradient(out.width*.5,out.height*.41,0,out.width*.5,out.height*.41,out.width*.65);
    g.addColorStop(0,'#1a3843');g.addColorStop(.55,'#0d242d');g.addColorStop(1,'#07141b');c.fillStyle=g;c.fillRect(0,0,out.width,out.height);c.drawImage(canvas,0,0);
    c.font=Math.max(12,Math.round(out.width/100))+'px sans-serif';c.textBaseline='bottom';c.fillStyle='rgba(0,8,15,.72)';c.fillRect(0,out.height-34,out.width,34);c.fillStyle='#e2edf3';c.fillText('局部流注密度场 · 非电子轨迹，也不是完整雷电',12,out.height-10);
    out.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='local-streamer.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
  }
  function applyPreset(name){const p=presets[name];if(!p)return;for(const key of ['field','diffusion','amplitude','ionMobility','feedback','sourceX','sourceZ','targetX','targetZ'])state[key]=p[key];state.preset=name;requestReset(p.warm);}
  function bindControls(){
    document.querySelectorAll('[data-preset]').forEach(el=>el.addEventListener('click',()=>applyPreset(el.dataset.preset)));
    document.querySelectorAll('button[data-tool]').forEach(el=>el.addEventListener('click',()=>setTool(el.dataset.tool)));
    document.querySelectorAll('[data-note]').forEach(el=>el.addEventListener('click',()=>setNote(el.dataset.note)));
    for(const [id,key] of [['field','field'],['diffusion','diffusion'],['amplitude','amplitude'],['ion-mobility','ionMobility'],['source-x','sourceX'],['source-z','sourceZ'],['target-x','targetX'],['target-z','targetZ']])$(id).addEventListener('input',event=>{state[key]=Number(event.target.value);state.preset=null;queueReset();});
    $('feedback').addEventListener('change',event=>{state.feedback=event.target.checked;state.preset=null;queueReset();});
    for(const [id,key] of [['grid-quality','quality'],['solver-accuracy','tolerance']])$(id).addEventListener('change',event=>{state[key]=key==='tolerance'?Number(event.target.value):event.target.value;state.preset=null;queueReset();});
    for(const [id,key] of [['show-electrons','showElectrons'],['show-ions','showIons'],['show-iso','showIso'],['show-slice','showSlice']])$(id).addEventListener('change',event=>{state[key]=event.target.checked;
      if(id==='show-slice'&&!state.showSlice&&state.tool==='probe'){state.tool='orbit';notice('已隐藏剖面并切回旋转视角。');}updateControls();updateObjects();updateFraming();state.dirty=true;});
    $('slice-mode').addEventListener('change',event=>{state.sliceMode=event.target.value;updateControls();updateObjects();state.dirty=true;});
    $('slice-z').addEventListener('input',event=>{state.slice=Number(event.target.value);state.probeId=null;state.probeNotice='剖面已移动，请重新选择网格点。';updateControls();updateTelemetry();updateObjects();state.dirty=true;});
    $('exposure').addEventListener('input',event=>{state.exposure=Number(event.target.value);updateControls();updatePointUniforms();state.dirty=true;});
    $('camera-zoom').addEventListener('input',event=>{state.camera.zoom=Number(event.target.value);updateControls();updateFraming();});
    $('play').addEventListener('click',()=>setPlaying(!state.playing));$('step').addEventListener('click',()=>{setPlaying(false);sendSteps(1);});$('reset').addEventListener('click',()=>requestReset(0));
    $('reset-view').addEventListener('click',resetView);$('save-image').addEventListener('click',saveImage);
    document.querySelectorAll('[data-speed]').forEach(el=>el.addEventListener('click',()=>{state.speed=Number(el.dataset.speed);state.accumulator=0;updateControls();}));
    for(const id of ['probe-peak','probe-peak-card','transport-probe'])$(id).addEventListener('click',()=>requestProbe({kind:'peak'}));
    $('charge-slice').addEventListener('click',()=>{state.showSlice=true;state.sliceMode='charge';updateControls();updateObjects();state.dirty=true;});
    document.addEventListener('lab:panelchange',()=>requestAnimationFrame(updateFraming));document.addEventListener('lab:contentchange',()=>requestAnimationFrame(updateFraming));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;
      // A delayed reset or electrode drag remembers its pre-interaction play
      // state. Clear that as well so a hidden tab never resumes on its own.
      state.playing=false;state.queuedPlaying=false;if(state.drag)state.drag.wasPlaying=false;state.accumulator=0;state.lastFrame=0;updatePlayback();});
    window.addEventListener('resize',resize);if('ResizeObserver'in window){const observer=new ResizeObserver(resize);observer.observe(stage);observer.observe(document.querySelector('.lab-bottom'));}
  }
  function frame(now){
    const dt=state.lastFrame?clamp((now-state.lastFrame)/1000,0,.15):0;state.lastFrame=now;
    if(state.playing&&state.ready&&!state.halt&&!document.hidden){state.accumulator=Math.min(.8,state.accumulator+dt*1.5*state.speed);
      if(!state.busy){const step=state.data.stats.lastStep||.08;if(state.accumulator>=step){const count=clamp(Math.floor(state.accumulator/step),1,8);state.accumulator=Math.max(0,state.accumulator-count*step);sendSteps(count);}}}
    if(state.dirty)draw();requestAnimationFrame(frame);
  }
  bindCanvas();setupRenderer();bindControls();resize();updateControls();updatePlayback();setNote('transport');requestReset(presets.default.warm);requestAnimationFrame(frame);
})();
