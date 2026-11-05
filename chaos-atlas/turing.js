(function () {
  'use strict';
  const $=id=>document.getElementById(id), M=window.TuringSphere, THREE=window.THREE;
  const stage=$('turing-stage'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const compact=matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  let canvas=$('turing-scene');
  const LEVELS={quick:3,standard:4,high:5};
  const PRESETS={
    bloom:   {b:1.8,ratio:20,kind:'noise',degree:10,amplitude:.03,warm:16,description:'从同一微扰数值预演至 t=16，继续观察图案成长。'},
    growth:  {b:1.8,ratio:20,kind:'noise',degree:10,amplitude:.03,warm:0,description:'从微小随机扰动开始；观察不均匀浓度逐渐被放大。'},
    uniform: {b:1.8,ratio:1,kind:'noise',degree:10,amplitude:.03,warm:0,description:'反应参数和扰动相同，但 U 与 V 等速扩散；观察扰动衰减。'},
    critical:{b:1.8,ratio:9,kind:'mode',degree:12,amplitude:.03,warm:0,description:'接近连续理论临界比；单一模态增长缓慢，有限网格会改变具体结果。'},
    mode:    {b:1.8,ratio:20,kind:'mode',degree:10,amplitude:.03,warm:0,description:'以 l=10 的轴对称微扰开始，比较早期预测增长与实际模态幅度。'},
    strong:  {b:1.8,ratio:30,kind:'noise',degree:10,amplitude:.03,warm:8,description:'底物 V 扩散更快；从 t=8 继续观察真实浓度场的非线性生长。'},
    'gray-spots':{model:'gray-scott',feed:.05,kill:.065,ratio:.5,kind:'patch',amplitude:.5,warm:200,description:'从有限幅 V 种子实际预演至 t=200；斑纹由 Gray–Scott 方程演化得到。'},
    'gray-start':{model:'gray-scott',feed:.05,kill:.065,ratio:.5,kind:'patch',amplitude:.5,warm:0,description:'从静息背景上的有限幅局部种子开始，观察真实反应与扩散。'},
    'gray-worms':{model:'gray-scott',feed:.04,kill:.06,ratio:.5,kind:'patch',amplitude:.5,warm:200,description:'改变补给与移除率；数值预演至 t=200 后观察连接与条纹。'},
    'gray-rest':{model:'gray-scott',feed:.05,kill:.065,ratio:.5,kind:'rest',amplitude:.5,warm:0,description:'均匀 (1,0) 静息态；没有 V 种子时不会自发生成图案，可用触碰注入 V。'}
  };
  const state={
    model:'brusselator',preset:'bloom',b:1.8,ratio:20,brussRatio:20,grayRatio:.5,feed:.05,kill:.065,grayKind:'patch',grayAmplitude:.5,radius:1,kind:'noise',degree:10,amplitude:.03,seed:20261031,quality:'standard',
    compare:false,comparisonMode:'diffusion',tool:'orbit',display:'u',modeDegree:10,historyScale:'log',history:[],historyEvents:[],contours:true,pokeStrength:.06,pokeRadius:.25,
    playing:!reduced.matches,speed:1,ready:false,busy:false,failed:false,generation:0,
    width:0,height:0,dpr:0,renderer:'',camera:{yaw:.48,pitch:.20,distance:6},layout:'horizontal',
    drag:null,lastFrame:0,accumulator:0,lastDraw:0,dirty:true,mesh:null,primary:null,reference:null,
    note:'comparison',pendingConfig:null,pendingPoke:null,pendingProbe:null,pendingMode:null,probePoint:null,pendingInspect:false,baseline:null,observation:null,timer:null,warm:16,checked:false
  };
  let worker=null,renderer=null,scene=null,camera=null,raycaster=null,ctx=null;
  let objects={primary:null,reference:null}, fallbackCenters=null;
  const boundCanvases=new WeakSet();
  const vec=(x,y,z)=>({x,y,z});
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

  function fail(message) {
    state.failed=true;state.ready=false;state.busy=false;state.playing=false;
    if(worker){worker.terminate();worker=null;}
    $('stage-error-text').textContent=message;$('stage-error').hidden=false;$('stage-notice').hidden=true;
    stage.dataset.status='error';
    document.querySelectorAll('#control-panel input,#control-panel select,#control-panel button,[data-speed],#reset-view,#save-image,#compare-card-action,#show-mode-action,#history-degree-input,[data-history-scale]').forEach(el=>{el.disabled=true;});
    updatePlayback();
  }
  function progress(input) {
    const lo=Number(input.min),hi=Number(input.max),v=Number(input.value);
    input.style.setProperty('--progress',clamp(100*(v-lo)/(hi-lo),0,100)+'%');
  }
  function updatePlayback() {
    $('play').disabled=state.failed||!state.ready;
    $('step').disabled=state.failed||!state.ready||state.playing||state.busy;
    $('reset').disabled=state.failed||!state.ready;
    $('save-image').disabled=state.failed||!state.ready;
    $('compare-card-action').disabled=state.failed||!state.ready;
    $('poke-center').disabled=state.failed||!state.ready;
    $('probe-center').disabled=state.failed||!state.ready;
    $('play-symbol').textContent=state.playing?'Ⅱ':'▶';$('play-text').textContent=state.playing?'暂停':'播放';
    $('play').setAttribute('aria-label',state.playing?'暂停模拟':'播放模拟');
    const status=state.failed?'模拟不可用':!state.ready?'正在计算初态':state.playing?'反应扩散中':'实验已暂停';
    $('header-status').textContent=status;$('stage-status').textContent=state.failed?'SOLVER UNAVAILABLE':!state.ready?'SURFACE INITIALIZING':state.playing?'SURFACE EVOLVING':'SURFACE PAUSED';
    document.querySelector('.top-status').classList.toggle('paused',!state.playing);
    stage.classList.toggle('paused',!state.playing);
  }
  function setPlaying(value) {
    if(!state.ready||state.failed)return;
    state.playing=!!value;state.accumulator=0;state.lastFrame=0;updatePlayback();state.dirty=true;
  }
  function updateControls() {
    const gray=state.model==='gray-scott',ratioInput=$('diffusion-ratio'),pokeInput=$('poke-strength');
    ratioInput.min=gray?'.10':'1';ratioInput.max=gray?'1.50':'40';ratioInput.step=gray?'.05':'1';
    pokeInput.min=gray?'.05':'.01';pokeInput.max=gray?'.60':'.15';pokeInput.step=gray?'.05':'.01';
    $('reaction-model').value=state.model;$('model-tag').textContent=gray?'GRAY–SCOTT':'BRUSSELATOR';
    $('bruss-presets').hidden=gray;$('gray-presets').hidden=!gray;$('bruss-parameters').hidden=gray;$('gray-parameters').hidden=!gray;
    $('bruss-initial').hidden=gray;$('gray-initial').hidden=!gray;$('gray-seed-kind').value=state.grayKind;
    $('gray-seed-amplitude').disabled=state.failed||state.grayKind==='rest';
    for(const [id,value,digits] of [['diffusion-ratio',state.ratio,gray?2:0],['reaction-b',state.b,2],['gray-feed',state.feed,3],['gray-kill',state.kill,3],['gray-seed-amplitude',state.grayAmplitude,3],['sphere-radius',state.radius,2],['seed-degree',state.degree,0],
      ['mode-degree',state.modeDegree,0],['history-degree-input',state.modeDegree,0],['seed-amplitude',state.amplitude,3],['poke-strength',state.pokeStrength,3]]) {
      const input=$(id);input.value=String(value);$(id+'-value').textContent=Number(value).toFixed(digits);progress(input);
    }
    const du=gray?M.GRAY_DU:M.DU;$('diffusion-hint').textContent='Dᵤ = '+du.toFixed(gray?4:3)+' · Dᵥ = '+(du*state.ratio).toFixed(gray?4:3);
    $('seed-kind').value=state.kind;$('seed-degree').disabled=state.failed||state.kind!=='mode';
    $('mesh-quality').value=state.quality;$('show-contours').checked=state.contours;
    $('poke-strength').disabled=state.failed||state.tool!=='paint';
    document.querySelectorAll('button[data-preset]').forEach(el=>{
      const active=el.dataset.preset===state.preset;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));
    });
    const description=PRESETS[state.preset]?PRESETS[state.preset].description:'当前参数已自定义；浓度字段继续演化。';
    $('preset-description').textContent=state.compare?(state.comparisonMode==='model'?'双球从 t=0 分别按两套方程和初态演化；不是同初态的单变量实验。':'双球从 t=0 的同一角度分布初态开始；只改变'+(state.comparisonMode==='radius'?'固定球半径。':'扩散比。')):
      state.warm===0 && (state.preset==='bloom'||state.preset==='strong'||state.preset==='gray-spots'||state.preset==='gray-worms')?'当前从 t=0 的初态重新开始。':description;
    document.querySelectorAll('button[data-comparison]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.comparison===state.comparisonMode)));
    $('compare-hint').textContent=state.comparisonMode==='model'?'模型对照：A 使用另一套方程的默认参数和初态，B 使用当前模型；同半径、同步时间，但方程、初态、参数与速率不同，并非单变量对照。':
      state.comparisonMode==='radius'?'半径对照：A 固定 R=1，B 使用当前 R；扩散系数、反应、初始角度分布与时间步相同。开启、切换或修改半径会重置。':'扩散对照：A 固定等速扩散，B 使用当前扩散比；反应、半径、初始角度分布与时间步相同。开启或切换对照会重置。';
    $('poke-hint').textContent=(gray?'Gray–Scott 激发会向局部加入 V 并扣除 U；':'Brusselator 激发会向局部加入 U 并扣除少量 V；')+
      (state.compare&&state.comparisonMode==='model'?'模型对照时只激发实验 B。':'同模型双球会在同一位置施加相同扰动。')+' 也可使用按钮或聚焦球面按 Enter。';
    document.querySelectorAll('button[data-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tool===state.tool)));
    document.querySelectorAll('button[data-display]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.display===state.display)));
    document.querySelectorAll('[data-speed]').forEach(el=>{const selected=Number(el.dataset.speed)===state.speed;el.classList.toggle('active',selected);el.setAttribute('aria-pressed',String(selected));});
    $('compare-toggle').setAttribute('aria-pressed',String(state.compare));$('compare-toggle').textContent=state.compare?'◉　关闭双球对照':state.comparisonMode==='model'?'◉　开启两套模型对照':'◉　开启同初态双球对照';
    $('compare-card-action').textContent=state.compare?'结束双球实验 ↗':state.comparisonMode==='model'?'开始两套模型对照 ↗':'开始同初态双球实验 ↗';
    $('stage-title').textContent=gray?'有限幅激发，形成斑纹':'扩散，让均匀失稳';
    const step=gray||(state.compare&&state.comparisonMode==='model')?1:.2;
    $('step').setAttribute('aria-label','单步推进 '+step+' 模拟时间');$('step').title='单步推进 '+step;
    const zoom=6/state.camera.distance;$('camera-zoom').value=String(zoom);$('camera-zoom-value').textContent=zoom.toFixed(2)+'×';progress($('camera-zoom'));
    canvas.classList.toggle('paint-tool',state.tool==='paint');canvas.classList.toggle('probe-tool',state.tool==='probe');
    canvas.setAttribute('aria-label',state.tool==='paint'?'球面激发模式。点击或拖动球面施加局部扰动；Enter 激发镜头前方，方向键旋转视角，空格播放或暂停。':
      state.tool==='probe'?'球面探针模式。点击或拖动选点，Enter 探测镜头前方；方向键旋转视角，空格播放或暂停。':'球面浓度图。拖动旋转，滚轮或控制台缩放；方向键旋转，加减号缩放，空格播放或暂停。');
    $('stage-instruction').textContent=state.tool==='paint'?'点击或拖动球面激发 · 滚轮缩放':state.tool==='probe'?'点击或拖动探针 · 滚轮缩放':'↔ 拖动旋转 · 滚轮缩放';
    updateDisplayLabels();
    document.querySelectorAll('[data-history-scale]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.historyScale===state.historyScale)));
    stage.dataset.tool=state.tool;stage.dataset.display=state.display;stage.dataset.model=state.model;stage.dataset.modeDegree=String(state.modeDegree);stage.dataset.compare=String(state.compare);stage.dataset.comparisonMode=state.comparisonMode;
    if(state.note==='phase')drawPhase();
    state.dirty=true;
  }
  function modeReady(field) {return !!(field&&field.mode&&field.mode.degree===state.modeDegree&&field.mode.values.length===field.u.length);}
  function updateDisplayLabels() {
    const ready=state.display==='mode'&&modeReady(state.primary),waiting=state.display==='mode'&&!ready;
    const display=waiting?'u':state.display,radius=(state.primary&&state.primary.stats.radius)||state.radius,gray=state.model==='gray-scott',mixed=state.compare&&state.comparisonMode==='model';
    $('stage-caption').textContent=waiting?'正在计算投影 · 暂显示实际 U':display==='mode'?'l='+state.modeDegree+' 有符号投影 · 非浓度':(display==='u'?'颜色是实际 U 浓度':'颜色是实际 V 浓度')+' · R='+radius.toFixed(2);
    $('legend-low-text').textContent=display==='mode'?'投影 ≤ −0.20':mixed?'两模型各自低值':gray?(display==='u'?'U ≤ 0.20':'V ≤ 0.00'):(display==='u'?'U ≤ 0.40':'V ≤ 0.30');
    $('legend-high-text').textContent=display==='mode'?'投影 ≥ +0.20':mixed?'两模型各自高值':gray?(display==='u'?'U ≥ 1.00':'V ≥ 0.45'):(display==='u'?'U ≥ 4.50':'V ≥ 2.30');
    $('legend-contour-text').textContent=display==='mode'?'投影 = 0':mixed?'各模型固定阈值':gray?(display==='u'?'U = 0.50':'V = 0.18'):(display==='u'?'U = 1.25':'V = 1.45');
    const bruss=display==='u'?'Brusselator U 固定 0.40–4.50，平方根映射，等值线 U=1.25。':'Brusselator V 固定 0.30–2.30，线性映射，等值线 V=1.45。';
    const grayText=display==='u'?'Gray–Scott U 固定 0.20–1.00，等值线 U=0.50。':'Gray–Scott V 固定 0.00–0.45，等值线 V=0.18。';
    $('color-scale-note').textContent=waiting?'正在计算 l='+state.modeDegree+' 的球谐投影，暂时显示实际 U。':display==='mode'
      ?'U 减去面积均值后，按真实网格面积投影并重建 l='+state.modeDegree+' 的全部实球谐分量。显示的是有符号滤波场，不是浓度；固定色阶 −0.20–+0.20，范围外截色，等值线为零。'
      :mixed?'两模型使用各自固定绝对色阶，颜色不能跨模型直接比较数值。'+bruss+grayText+' 范围外截色。':
      gray?grayText+' 范围外截色，不随画面自动拉伸。':bruss.replace('Brusselator ','')+' 范围外截色，不随画面自动拉伸。';
    stage.dataset.modeReady=String(ready);
  }
  function setPreset(name) {
    const p=PRESETS[name];if(!p||state.failed)return;
    if(p.model==='gray-scott')Object.assign(state,{model:'gray-scott',preset:name,feed:p.feed,kill:p.kill,ratio:p.ratio,grayRatio:p.ratio,grayKind:p.kind,grayAmplitude:p.amplitude});
    else Object.assign(state,{model:'brusselator',preset:name,b:p.b,ratio:p.ratio,brussRatio:p.ratio,kind:p.kind,degree:p.degree,amplitude:p.amplitude});
    requestReset(state.compare?0:p.warm);
  }
  function sourceOptions() {
    const gray=state.model==='gray-scott';return {model:state.model,b:state.b,feed:state.feed,kill:state.kill,ratio:state.ratio,radius:state.radius,
      kind:gray?state.grayKind:state.kind,degree:state.degree,amplitude:gray?state.grayAmplitude:state.amplitude,seed:state.seed};
  }
  function referenceModelOptions() {
    return state.model==='gray-scott'
      ?{model:'brusselator',b:1.8,ratio:20,radius:state.radius,kind:'noise',degree:10,amplitude:.03,seed:state.seed}
      :{model:'gray-scott',feed:.05,kill:.065,ratio:.5,radius:state.radius,kind:'patch',degree:10,amplitude:.5,seed:state.seed};
  }
  function requestReset(warm=0) {
    if(!M||state.failed)return;
    clearTimeout(state.timer);state.timer=null;
    if(worker){worker.terminate();worker=null;}
    state.generation++;state.ready=false;state.busy=true;state.checked=false;state.accumulator=0;state.lastFrame=0;
    state.pendingConfig=null;state.pendingPoke=null;state.pendingProbe=null;state.pendingMode=null;state.pendingInspect=false;state.baseline=null;state.observation=null;state.history=[];state.historyEvents=[];state.warm=warm;
    stage.dataset.status='initializing';$('stage-notice').textContent=warm?'正在计算预演与球面浓度…':'正在建立球面初态…';$('stage-notice').hidden=false;
    updateControls();updatePlayback();
    try {
      const url=URL.createObjectURL(new Blob([M.workerSource()],{type:'application/javascript'}));
      worker=new Worker(url);URL.revokeObjectURL(url);
      const own=worker;
      own.onerror=event=>{event.preventDefault();if(worker===own)fail('反应扩散后台线程无法运行。请刷新，或使用项目自带的静态服务器。');};
      own.onmessage=event=>receiveWorker(own,event.data);
      own.postMessage({type:'reset',generation:state.generation,level:LEVELS[state.quality],options:sourceOptions(),referenceOptions:referenceModelOptions(),compare:state.compare,comparisonMode:state.comparisonMode,probePoint:state.probePoint,modeDegree:state.modeDegree,showMode:state.display==='mode',warm});
    } catch(error) {fail('无法启动反应扩散后台线程：'+error.message+'。请使用项目自带的静态服务器。');}
  }
  function scheduleReset() {
    if(state.failed)return;clearTimeout(state.timer);state.timer=setTimeout(()=>requestReset(0),180);
  }
  function post(type,extra={}) {
    if(!worker||!state.ready||state.busy||state.failed)return false;
    state.busy=true;worker.postMessage({type,generation:state.generation,...extra});updatePlayback();return true;
  }
  function flushPending() {
    if(!state.ready||state.busy||state.failed)return;
    if(state.pendingConfig){const config=state.pendingConfig;state.pendingConfig=null;post('configure',config);return;}
    if(state.pendingPoke){const poke=state.pendingPoke;state.pendingPoke=null;post('poke',poke);return;}
    if(state.pendingProbe){const probe=state.pendingProbe;state.pendingProbe=null;post('probe',probe);return;}
    if(state.pendingMode){const mode=state.pendingMode;state.pendingMode=null;post('mode',mode);return;}
    if(state.pendingInspect){state.pendingInspect=false;post('inspect');}
  }
  function requestConfigure() {
    state.pendingConfig={b:state.b,ratio:state.ratio,feed:state.feed,kill:state.kill};flushPending();
  }
  function queuePoke(point) {
    if(!state.ready||state.failed||state.tool!=='paint')return;
    state.pendingPoke={point:[point.x,point.y,point.z],strength:state.pokeStrength,radius:state.pokeRadius};flushPending();
  }
  function queueProbe(point) {
    if(!state.ready||state.failed)return;
    state.probePoint=[point.x,point.y,point.z];state.pendingProbe={point:state.probePoint};flushPending();
  }
  function requestMode() {state.pendingMode={degree:state.modeDegree,show:state.display==='mode'};flushPending();}
  function decodeField(packet,previous) {
    if(!packet||!packet.stats||!Number.isFinite(packet.stats.stdU))throw new Error('无效的浓度读数');
    const u=new Float32Array(packet.u),v=new Float32Array(packet.v),n=state.mesh.positions.length/3;
    if(u.length!==n||v.length!==n)throw new Error('无效的球面浓度长度');
    const mode=packet.mode?{...packet.mode,values:new Float32Array(packet.mode.values)}:null;
    if(mode&&mode.values.length!==n)throw new Error('无效的球谐投影长度');
    return {u,v,stats:packet.stats,probe:packet.probe||null,mode,spectrum:packet.spectrum||(previous&&previous.spectrum)||null};
  }
  function receiveWorker(own,m) {
    if(worker!==own||m.generation!==state.generation||state.failed)return;
    if(m.kind==='error'){fail('球面求解未能继续：'+m.message+'。请降低参数或重置。');return;}
    if(!['ready','frame','configured','poked','probed','mode','inspected'].includes(m.kind))return;
    try {
      if(m.kind==='ready') {
        const positions=new Float32Array(m.mesh.positions),triangles=new Uint32Array(m.mesh.triangles);
        if(positions.length!==m.mesh.vertices*3||triangles.length!==m.mesh.faces*3)throw new Error('无效的球面网格');
        state.mesh={positions,triangles,vertices:m.mesh.vertices,faces:m.mesh.faces,level:m.mesh.level,area:m.mesh.area};
        if(state.renderer==='webgl')buildObjects();
      }
      if(!state.mesh)throw new Error('球面网格尚未建立');
      state.primary=decodeField(m.primary,state.primary);
      state.reference=m.reference?decodeField(m.reference,state.reference):null;
      if(state.compare!==!!state.reference)throw new Error('双球状态不一致');
      if(m.kind==='ready'){state.history=Array.isArray(m.warmHistory)?m.warmHistory.slice():[];state.historyEvents=[];}
      if(m.primary.spectrum)recordHistory(m.kind);
      if(m.primary.spectrum&&state.note==='spectrum')observeSpectrum(m.kind);
      state.busy=false;state.ready=true;stage.dataset.status='ready';$('stage-error').hidden=true;$('stage-notice').hidden=true;
      updateReadouts();updatePlayback();updateFraming();state.dirty=true;
      if(state.renderer==='webgl')updateObjects();
      flushPending();
    } catch(error){fail('球面数据无法显示：'+error.message+'。');}
  }
  function recordHistory(kind) {
    const field=state.primary,spectrum=field.spectrum,reference=state.reference;
    if(!spectrum||!Number.isFinite(spectrum.time))return;
    const entry={time:spectrum.time,power:spectrum.power.slice(),stdU:field.stats.stdU,
      referencePower:reference&&reference.spectrum?reference.spectrum.power.slice():null,referenceStd:reference?reference.stats.stdU:null};
    const last=state.history[state.history.length-1];
    if(last&&Math.abs(last.time-entry.time)<1e-8)state.history[state.history.length-1]=entry;
    else if(!last||entry.time>last.time)state.history.push(entry);
    if(['configured','poked'].includes(kind)) {
      const lastEvent=state.historyEvents[state.historyEvents.length-1],label=kind==='configured'?'参数改变':'局部激发';
      if(!lastEvent||Math.abs(lastEvent.time-entry.time)>1e-8||lastEvent.label!==label)state.historyEvents.push({time:entry.time,label});
    }
    // Keep a bounded, genuinely sampled series; thinning older points never
    // invents intermediate states or removes the first recorded state.
    if(state.history.length>480)state.history=state.history.filter((_,i)=>i===0||i%2===0||i===state.history.length-1);
    if(state.historyEvents.length>120)state.historyEvents=state.historyEvents.slice(-120);
    stage.dataset.historyCount=String(state.history.length);stage.dataset.historyStart=String(state.history[0].time);stage.dataset.historyEnd=String(state.history[state.history.length-1].time);
  }
  function theory(stats) {
    return stats.model==='gray-scott'?M.grayPrediction(stats.feed,stats.kill,stats.ratio,24,stats.radius):M.prediction(stats.b,stats.ratio,24,stats.radius);
  }
  function rateAt(stats,l) {
    return stats.model==='gray-scott'?M.grayGrowthRate(stats.feed,stats.kill,stats.ratio,l,stats.radius):M.growthRate(stats.b,stats.ratio,l,stats.radius);
  }
  function measurableMode(stats) {
    const rates=theory(stats).rates;
    let mode=1;for(let l=2;l<=18;l++)if(rates[l]>rates[mode])mode=l;
    return mode;
  }
  function observeSpectrum(kind) {
    const field=state.primary,s=field.stats,spectrum=field.spectrum,l=measurableMode(s),amplitude=spectrum.power[l];
    const next={time:spectrum.time,l,amplitude,b:s.b,ratio:s.ratio},prior=state.baseline;
    if(['ready','configured','poked'].includes(kind)){state.baseline=next;state.observation=null;return;}
    if(prior&&prior.l===l&&prior.b===s.b&&prior.ratio===s.ratio&&next.time-prior.time>=.19&&prior.amplitude>1e-10&&amplitude>1e-10) {
      state.observation={l,rate:Math.log(amplitude/prior.amplitude)/(next.time-prior.time),from:prior.time,to:next.time};
      state.baseline=next;
    } else if(!prior||prior.l!==l||prior.b!==s.b||prior.ratio!==s.ratio)state.baseline=next;
  }
  function selectNote(name) {
    if(name==='spectrum'&&state.note!=='spectrum'){state.baseline=null;state.observation=null;}
    state.note=name;
    document.querySelectorAll('button[data-note]').forEach(el=>{const active=el.dataset.note===name;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-note-content]').forEach(el=>{el.hidden=el.dataset.noteContent!==name;});
    if(name==='spectrum'&&state.ready){state.pendingInspect=true;flushPending();drawSpectrum();}
    if(name==='phase')drawPhase();
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function formatSigned(value,digits=3) {return (value>=0?'+':'')+value.toFixed(digits);}
  function updateReadouts() {
    if(!state.primary)return;
    const s=state.primary.stats,r=state.reference&&state.reference.stats,p=theory(s),gray=s.model==='gray-scott',mixed=state.comparisonMode==='model';
    $('time-readout').textContent=s.time.toFixed(1);$('ratio-readout').textContent=s.ratio.toFixed(gray?2:0);
    $('growth-label').textContent=gray?'静息态增长率':'理论最快增长率';
    $('variance-readout').textContent=s.stdU.toFixed(3);$('growth-readout').textContent=formatSigned(p.maxGrowth,3);
    $('card-current-std').textContent=s.stdU.toFixed(4);$('card-reference-std').textContent=r?r.stdU.toFixed(4):'未开启';
    $('card-equilibrium').textContent=gray?'1.00 / 0.00':'1.00 / '+s.b.toFixed(2);$('card-local-growth').textContent=formatSigned(p.localGrowth,3);
    $('card-range').textContent=s.minU.toFixed(2)+' / '+s.maxU.toFixed(2);
    $('card-mesh').textContent=state.mesh.vertices+' / '+state.mesh.faces;$('card-critical').textContent=gray?'不适用':p.criticalRatio.toFixed(2);
    $('card-critical-label').textContent=gray?'Brusselator 临界扩散比':'连续波数临界扩散比（近似）';
    $('limits-note').textContent=gray?'扩散使用球面余切拉普拉斯算子，反应采用自适应子步的二阶 Heun 积分。Gray–Scott 的 (1,0) 线性稳定，有限幅斑纹与网格、初态和参数有关；没有分析其他非零均匀态。不模拟球面生长或浓度稀释。':'扩散使用三角网格上的余切拉普拉斯算子，反应采用自适应子步的二阶 Heun 积分。临界比允许波数连续变化；固定半径球面只允许离散的 l 阶，有限网格、扰动与非线性演化也会产生差异。此处不模拟球面随时间生长或浓度稀释。';
    $('card-radius').textContent=s.radius.toFixed(2)+' / '+s.area.toFixed(2);
    updateDisplayLabels();
    const regionLabel=stats=>stats.regionField.toUpperCase()+'≥'+stats.regionThreshold.toFixed(2);
    $('card-region-label').textContent=mixed&&r?'A: '+regionLabel(r)+' / B: '+regionLabel(s):(gray?'V ≥ 0.18':'U ≥ 1.25')+' 连通区域 · A / B';
    $('card-regions').textContent=(r?r.regions:'—')+' / '+s.regions;
    const dominant=field=>field&&field.spectrum?'l='+field.spectrum.dominant+' (t='+field.spectrum.time.toFixed(1)+')':'—';
    $('card-dominant').textContent=dominant(state.reference)+' / '+dominant(state.primary);
    const modelName=stats=>stats.model==='gray-scott'?'Gray–Scott':'Brusselator',ratioText=stats=>stats.ratio.toFixed(stats.model==='gray-scott'?2:0);
    $('reference-label-detail').textContent=r?(mixed?modelName(r):state.comparisonMode==='radius'?'R = '+r.radius.toFixed(2):'Dᵥ / Dᵤ = '+ratioText(r)):'—';
    $('primary-label-ratio').textContent=mixed?modelName(s):state.comparisonMode==='radius'?'R = '+s.radius.toFixed(2):'Dᵥ / Dᵤ = '+ratioText(s);
    $('comparison-status').textContent=r
      ? mixed?'两球 t='+s.time.toFixed(1)+'，同半径与同步子步；A 为 '+modelName(r)+'，B 为 '+modelName(s)+'。初态、方程、参数、色阶及时间尺度不同，非单变量对照。触碰只作用于 B。'
      :'两球 t='+s.time.toFixed(1)+'；相同反应、初态和子步。'+(state.comparisonMode==='radius'?'同一扩散系数，A 的 R=1，B 的 R='+s.radius.toFixed(2)+'；画面按半径比例显示。':'相同半径，A 等速扩散，B 扩散比 '+ratioText(s)+'。')
      : '当前为单球。可选择对照扩散比、固定球半径或不同反应方程；开启后各自从初态重新开始。';
    $('comparison-heading').innerHTML=mixed?'不同的方程，<br><em>不同的形成机制。</em>':state.comparisonMode==='radius'?'同样的反应，<br><em>不同的球半径。</em>':'同样的反应，<br><em>不同的扩散。</em>';
    $('comparison-explanation').textContent=mixed?'Brusselator 可在局部稳定的均匀态附近因扩散失稳；Gray–Scott 此处从稳定静息态上的有限幅种子形成图案。两者不是仅改变一个参数的公平对照。':gray?'Gray–Scott 中 U 供给、V 自催化并被移除。静息态对微小扰动稳定；有限幅种子与扩散、反应共同决定是否形成或维持斑纹。':'均匀反应会使小扰动最终衰减；但 U 自催化并消耗底物 V，足够快的 V 扩散可改变空间反馈，使部分波纹增长，均匀态因扩散而失稳。';
    $('reaction-explanation').textContent=gray?'Gray–Scott 的 U 是被补给的底物，V 经 U+2V→3V 自催化并被移除；这里在同一封闭球面上数值求解两种浓度。':'采用简化的 Brusselator 自催化—底物耗竭模型。U 和 V 都只存在于球面，各自扩散并参与非线性反应；V 参与促进 U 的自催化，并非直接抑制 U。';
    $('reaction-formula').innerHTML=gray?'∂U/∂t = −UV² + F(1−U) + DᵤΔₛU<br>∂V/∂t = UV² − (F+k)V + DᵥΔₛV':'∂U/∂t = A − (B+1)U + U²V + DᵤΔₛU<br>∂V/∂t = BU − U²V + DᵥΔₛV';
    $('reaction-note').textContent=gray?'(1,0) 的两个反应特征值为 −F 和 −(F+k)，加入正扩散后仍为负。此处只分析该静息态；其他非零均匀态可能存在，不作分类。':'A=1，界面限定 B<2，因此均匀反应的线性增长率为负。V 扩散更快不等于总会形成图案，仍需检查空间模态。';
    $('nonlinear-explanation').textContent=gray?'有限幅 V 种子启动 UV² 自催化，消耗 U，并与补给、移除和扩散耦合。斑纹可变化或消退，不应直接称为 (1,0) 的线性图灵失稳。':'早期可以近似看作各个球谐模态独立变化；振幅变大后，U²V 反应使不同模态相互作用，线性预测不再决定最终图案。';
    $('nonlinear-note').textContent=gray?'对比「均匀静息态」与有限幅种子；改变 F、k 或触碰注入 V，观察真实数值演化。':'可以选「单一球谐模态」观察早期增长，再切回随机微扰。球面颜色使用固定浓度范围，不会把微小噪声自动拉伸成强烈花纹。';
    stage.dataset.time=String(s.time);stage.dataset.ratio=String(s.ratio);stage.dataset.radius=String(s.radius);stage.dataset.b=String(s.b);stage.dataset.feed=String(s.feed);stage.dataset.kill=String(s.kill);stage.dataset.std=String(s.stdU);stage.dataset.regions=String(s.regions);
    stage.dataset.vertices=String(state.mesh.vertices);stage.dataset.faces=String(state.mesh.faces);stage.dataset.pokes=String(s.pokes);
    stage.dataset.localGrowth=String(p.localGrowth);stage.dataset.predictedGrowth=String(p.maxGrowth);stage.dataset.fastest=String(p.fastest);
    stage.dataset.referenceStd=r?String(r.stdU):'';stage.dataset.referenceTime=r?String(r.time):'';
    if(state.primary.spectrum)stage.dataset.spectrumTime=String(state.primary.spectrum.time);
    updateProbeReadout();
    if(state.note==='phase')drawPhase();
    if(state.note==='spectrum')drawSpectrum();
  }
  function updateProbeReadout() {
    const p=state.primary&&state.primary.probe,r=state.reference&&state.reference.probe;
    $('probe-empty').hidden=!!p;$('probe-details').hidden=!p;$('probe-reference').hidden=!r;
    stage.dataset.probeIndex=p?String(p.index):'';
    if(!p)return;
    $('probe-location').textContent='#'+p.index+' · t='+p.time.toFixed(1);
    $('probe-concentration').textContent=p.u.toFixed(4)+' / '+p.v.toFixed(4);
    $('probe-u-terms').textContent=formatSigned(p.reactionU,4)+' / '+formatSigned(p.diffusionU,4);
    $('probe-v-terms').textContent=formatSigned(p.reactionV,4)+' / '+formatSigned(p.diffusionV,4);
    $('probe-totals').textContent=formatSigned(p.totalU,4)+' / '+formatSigned(p.totalV,4);
    $('probe-flux').textContent=Math.hypot(...p.fluxU).toFixed(4)+' / '+Math.hypot(...p.fluxV).toFixed(4);
    if(r)$('probe-reference').textContent='对照 A · 同一顶点 #'+r.index+'：U / V = '+r.u.toFixed(4)+' / '+r.v.toFixed(4)+'；U 反应 / 扩散 = '+formatSigned(r.reactionU,4)+' / '+formatSigned(r.diffusionU,4)+'；V 反应 / 扩散 = '+formatSigned(r.reactionV,4)+' / '+formatSigned(r.diffusionV,4)+'。';
    stage.dataset.probeTime=String(p.time);stage.dataset.probeU=String(p.u);stage.dataset.probeV=String(p.v);
    stage.dataset.probeReactionU=String(p.reactionU);stage.dataset.probeDiffusionU=String(p.diffusionU);
    stage.dataset.probeFluxU=String(Math.hypot(...p.fluxU));stage.dataset.probeFluxV=String(Math.hypot(...p.fluxV));
  }
  let phaseCache=null;
  function drawPhase() {
    const gray=state.model==='gray-scott';$('phase-bruss').hidden=gray;$('phase-gray').hidden=!gray;
    if(gray){stage.dataset.phaseClass='not-applicable';stage.dataset.phaseCritical='';return;}
    const radius=state.radius,x=b=>36+(b-1.4)/.55*226,y=ratio=>155-(clamp(ratio,1,40)-1)/39*141;
    if(!phaseCache||phaseCache.radius!==radius) {
      const discrete=[],continuous=[];
      for(let i=0;i<=110;i++) {
        const b=1.4+.55*i/110,boundary=M.phaseBoundary(b,radius),px=x(b).toFixed(2);
        discrete.push([px,y(boundary.criticalRatio).toFixed(2)]);continuous.push([px,y(boundary.continuous).toFixed(2)]);
      }
      const path=points=>points.map(([px,py],i)=>(i?'L':'M')+px+' '+py).join(' ');
      phaseCache={radius,discrete:path(discrete),continuous:path(continuous),fill:'M36 14H262 '+discrete.slice().reverse().map(([px,py])=>'L'+px+' '+py).join(' ')+' Z'};
      $('phase-boundary').setAttribute('d',phaseCache.discrete);$('phase-continuous').setAttribute('d',phaseCache.continuous);$('phase-unstable').setAttribute('d',phaseCache.fill);
    }
    const px=x(state.b),py=y(state.ratio),boundary=M.phaseBoundary(state.b,radius),prediction=M.prediction(state.b,state.ratio,24,radius);
    for(const id of ['phase-point','phase-point-halo']){$(id).setAttribute('cx',px.toFixed(2));$(id).setAttribute('cy',py.toFixed(2));}
    $('phase-crosshair').setAttribute('d',`M36 ${py.toFixed(2)}H${px.toFixed(2)} M${px.toFixed(2)} ${py.toFixed(2)}V155`);
    $('phase-radius').textContent='R='+radius.toFixed(2);$('phase-parameters').textContent=state.b.toFixed(2)+' / '+state.ratio.toFixed(0);
    $('phase-threshold').textContent=boundary.criticalRatio.toFixed(2)+' · l='+boundary.degree;
    const unstable=state.ratio>boundary.criticalRatio;
    $('phase-result').textContent=(unstable?'可失稳':'稳定')+' · σ='+formatSigned(prediction.maxGrowth,3);
    $('phase-observed').textContent=state.primary?state.primary.stats.stdU.toFixed(4)+' · t='+state.primary.stats.time.toFixed(1):'等待数值场';
    $('phase-chart').setAttribute('aria-label','稳定性相图，B '+state.b.toFixed(2)+'，扩散比 '+state.ratio.toFixed(0)+'，理论'+(unstable?'可失稳':'稳定')+'。方向键调整参数。');
    stage.dataset.phaseCritical=String(boundary.criticalRatio);stage.dataset.phaseClass=unstable?'unstable':'stable';
  }
  function setPhaseParameters(b,ratio) {
    if(state.failed||state.model!=='brusselator')return;
    state.b=Math.round(clamp(b,1.4,1.95)*100)/100;state.ratio=Math.round(clamp(ratio,1,40));state.brussRatio=state.ratio;state.preset='custom';state.warm=0;
    updateControls();requestConfigure();
  }
  function drawSpectrum() {
    if(!state.primary)return;
    const s=state.primary.stats,p=theory(s),rates=p.rates,gray=s.model==='gray-scott';
    $('theory-title').textContent=gray?'(1,0) 静息态 · 预测增长率':'连续球面 · 预测增长率 σ';
    const low=Math.min(-.10,...rates),high=Math.max(.10,...rates),span=Math.max(1e-9,high-low);
    const x=l=>28+221*l/24,y=value=>91-79*(value-low)/span;
    $('theory-line').setAttribute('d',rates.map((v,i)=>(i?'L':'M')+x(i).toFixed(2)+' '+y(v).toFixed(2)).join(' '));
    $('theory-zero').setAttribute('d','M28 '+y(0).toFixed(2)+'H249');
    $('theory-marker').setAttribute('cx',x(p.fastest).toFixed(2));$('theory-marker').setAttribute('cy',y(p.maxGrowth).toFixed(2));
    $('theory-high').textContent=high.toFixed(2);$('theory-low').textContent=low.toFixed(2);
    $('theory-band').textContent=p.first==null?'l≤24 无正增长':'l='+p.first+'–'+p.last+(p.last===24?'+':'')+' 可增长';
    const spectrum=state.primary.spectrum,power=spectrum?spectrum.power:[],top=Math.max(.005,...power);
    const group=$('measured-bars');
    if(!group.childElementCount)for(let l=1;l<=18;l++){const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('class','measured-bar');rect.setAttribute('x',String(29+(l-1)*12));rect.setAttribute('width','8');group.appendChild(rect);}
    for(let l=1;l<=18;l++) {
      const height=60*(power[l]||0)/top,rect=group.children[l-1];rect.setAttribute('y',(72-height).toFixed(2));rect.setAttribute('height',height.toFixed(2));
      rect.classList.toggle('dominant',!!spectrum&&l===spectrum.dominant);
    }
    $('measured-high').textContent=top.toFixed(3);
    $('measured-dominant').textContent=spectrum?'l='+spectrum.dominant+' · t='+spectrum.time.toFixed(1):'尚未采样';
    const l=measurableMode(s),observation=state.observation;
    $('mode-rate-label').textContent='l='+l+(gray?' · 静息态增长率':' · 理论增长率');$('mode-rate-predicted').textContent=formatSigned(rateAt(s,l),3);
    $('mode-rate-measured').textContent=observation&&observation.l===l?formatSigned(observation.rate,3):'等待采样';
    $('mode-rate-window').textContent=observation&&observation.l===l
      ?'l='+l+' 在 t='+observation.from.toFixed(1)+'–'+observation.to.toFixed(1)+' 的实测幅度比取对数后除以时间差；改变参数或触碰会重新采样。'
      :'播放或单步两次以比较同一模态的实际变化；参数变化或触碰后重新采样。';
    $('spectrum-note').textContent=(gray?'理论曲线仅对 (1,0) 静息态线性化，所有阶数都衰减；当前有限幅斑纹不在该线性范围，其他非零均匀态未分类。实测是 U 投影的有限时间变化。':'理论只预测均匀态附近的特征增长率。实测是 U 投影幅度的有限时间变化；初始反应方向混合、有限网格、触碰及非线性饱和均可使两者不同。')
      +(state.quality==='quick'?' 快速网格的高阶投影误差较大；建议用标准或精细网格复查。':'');
    stage.dataset.measuredMode=String(l);stage.dataset.measuredGrowth=observation&&observation.l===l?String(observation.rate):'';
    drawHistory();
  }
  function drawHistory() {
    const history=state.history,l=state.modeDegree;
    $('history-degree').textContent=String(l);
    if(!history.length){$('history-range').textContent='等待采样';$('history-mode').setAttribute('d','');$('history-std').setAttribute('d','');$('history-latest').setAttribute('visibility','hidden');return;}
    const start=history[0].time,end=history[history.length-1].time,values=history.flatMap(h=>[h.power[l]||0,h.stdU||0]);
    const max=Math.max(1e-8,...values),positive=values.filter(x=>x>1e-9),log=state.historyScale==='log';
    const low=log?Math.max(1e-8,(positive.length?Math.min(...positive):1e-8)*.75):0,high=log?Math.max(low*10,max*1.25):max*1.1;
    const transform=value=>log?Math.log(Math.max(low,value)):value,lo=transform(low),hi=transform(high),span=Math.max(1e-9,hi-lo);
    const x=t=>34+(end>start?215*(t-start)/(end-start):0),y=v=>87-77*(transform(v)-lo)/span;
    const path=fn=>history.map((h,i)=>(i?'L':'M')+x(h.time).toFixed(2)+' '+y(fn(h)).toFixed(2)).join(' ');
    $('history-mode').setAttribute('d',path(h=>h.power[l]||0));$('history-std').setAttribute('d',path(h=>h.stdU||0));
    const last=history[history.length-1],dot=$('history-latest');dot.setAttribute('cx',x(last.time).toFixed(2));dot.setAttribute('cy',y(last.power[l]||0).toFixed(2));dot.removeAttribute('visibility');
    const fmt=value=>value>=.01?value.toFixed(value>=1?2:3):value.toExponential(1);
    $('history-high').textContent=fmt(high);$('history-low').textContent=fmt(low);$('history-start').textContent='t='+start.toFixed(1);$('history-end').textContent='t='+end.toFixed(1);
    $('history-range').textContent=history.length+' 个真实采样';
    const events=$('history-events');events.replaceChildren();
    for(const event of state.historyEvents)if(event.time>=start&&event.time<=end) {
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('class','history-event');
      line.setAttribute('x1',x(event.time));line.setAttribute('x2',x(event.time));line.setAttribute('y1','10');line.setAttribute('y2','87');
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=event.label+' · t='+event.time.toFixed(1);line.appendChild(title);events.appendChild(line);
    }
    $('history-note').textContent='曲线只记录真实计算的离散采样（对数轴的零值显示在下限），不提供回放。虚线竖标表示参数改变或局部激发；重置清空历史。'
      +(state.warm>0?' 预演中的点也来自实际中间步。':'')+(state.quality==='quick'?' 快速网格高阶投影误差较大。':'');
    stage.dataset.historySelected=String(l);stage.dataset.historyLastPower=String(last.power[l]||0);
  }

  const PALETTE=[[.025,.105,.15],[.04,.25,.27],[.09,.53,.47],[.34,.75,.63],[.95,.64,.36],[1,.91,.66]];
  function displayedField(field) {
    if(state.display==='mode')return modeReady(field)?{values:field.mode.values,type:'mode',model:field.stats.model}:{values:field.u,type:'u',model:field.stats.model};
    return {values:field[state.display],type:state.display,model:field.stats.model};
  }
  function colorFor(value,field,model) {
    if(field==='mode') {
      const t=clamp(value/.20,-1,1),neutral=[.13,.23,.24],negative=[.20,.65,.78],positive=[1,.69,.38],target=t<0?negative:positive,a=Math.abs(t);
      return neutral.map((v,i)=>v+(target[i]-v)*a);
    }
    // Absolute, fixed concentration ranges: unlike per-frame normalization,
    // tiny fluctuations do not masquerade as fully developed patterns.
    const gray=model==='gray-scott',raw=gray?(field==='u'?(value-.20)/.80:value/.45):(field==='u'?(value-.4)/4.1:(value-.3)/2.0);
    const t=!gray&&field==='u'?Math.sqrt(clamp(raw,0,1)):clamp(raw,0,1);
    const q=t*(PALETTE.length-1),i=Math.min(PALETTE.length-2,Math.floor(q)),f=q-i,a=PALETTE[i],b=PALETTE[i+1];
    return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
  }
  const linear=x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
  function contourSegments(field) {
    const shown=displayedField(field),values=shown.values,threshold=shown.type==='mode'?0:shown.model==='gray-scott'?(shown.type==='u'?.50:.18):(shown.type==='u'?1.25:1.45),{positions,triangles}=state.mesh,points=[];
    function cross(a,b) {
      const va=values[a],vb=values[b];if((va<threshold)===(vb<threshold)||va===vb)return null;
      const t=(threshold-va)/(vb-va),x=positions[3*a]+t*(positions[3*b]-positions[3*a]),
        y=positions[3*a+1]+t*(positions[3*b+1]-positions[3*a+1]),z=positions[3*a+2]+t*(positions[3*b+2]-positions[3*a+2]),
        scale=1.004/Math.hypot(x,y,z);return [x*scale,y*scale,z*scale];
    }
    for(let i=0;i<triangles.length;i+=3) {
      const a=triangles[i],b=triangles[i+1],c=triangles[i+2],hits=[cross(a,b),cross(b,c),cross(c,a)].filter(Boolean);
      if(hits.length===2)points.push(...hits[0],...hits[1]);
    }
    return new Float32Array(points);
  }
  function disposeObject(object) {
    if(!object)return;
    if(object.group&&scene)scene.remove(object.group);
    if(object.mesh){object.mesh.geometry.dispose();object.mesh.material.dispose();}
    if(object.lines){object.lines.geometry.dispose();object.lines.material.dispose();}
    if(object.probeGroup)object.probeGroup.traverse(child=>{if(child.geometry)child.geometry.dispose();if(child.material)child.material.dispose();});
  }
  function makeObject(name) {
    const group=new THREE.Group();group.name=name;
    const geometry=new THREE.BufferGeometry(),positions=state.mesh.positions.slice(),normals=state.mesh.positions.slice();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(positions.length),3));
    geometry.setIndex(new THREE.BufferAttribute(state.mesh.triangles.slice(),1));geometry.computeBoundingSphere();
    const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.48,metalness:.05});
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name+'-surface';group.add(mesh);
    const lineGeometry=new THREE.BufferGeometry();
    // At most one segment (two xyz vertices) per triangular face. Reuse one
    // dynamic buffer instead of creating a GPU buffer for every frame.
    const linePositions=new THREE.BufferAttribute(new Float32Array(state.mesh.triangles.length*2),3);
    linePositions.setUsage(THREE.DynamicDrawUsage);lineGeometry.setAttribute('position',linePositions);lineGeometry.setDrawRange(0,0);
    lineGeometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.01);
    const lines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0xffe4bd,transparent:true,opacity:.65,depthTest:true}));
    lines.name=name+'-contour';group.add(lines);
    const probeGroup=new THREE.Group(),marker=new THREE.Mesh(new THREE.SphereGeometry(.027,12,8),new THREE.MeshBasicMaterial({color:0xfef3dc}));probeGroup.name=name+'-probe';
    const arrows=[new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.1,0xffc88d),
      new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.1,0xa1fff0)];
    probeGroup.add(marker,...arrows);probeGroup.visible=false;group.add(probeGroup);scene.add(group);return {group,mesh,lines,probeGroup,marker,arrows};
  }
  function buildObjects() {
    disposeObject(objects.primary);disposeObject(objects.reference);
    objects.primary=makeObject('primary');objects.reference=makeObject('reference');objects.reference.group.visible=state.compare;
  }
  function updateObject(object,field) {
    if(!object||!field)return;
    const color=object.mesh.geometry.getAttribute('color'),shown=displayedField(field),values=shown.values;
    for(let i=0;i<values.length;i++){const c=colorFor(values[i],shown.type,shown.model);color.setXYZ(i,linear(c[0]),linear(c[1]),linear(c[2]));}
    color.needsUpdate=true;object.lines.visible=state.contours;
    const probe=field.probe;object.probeGroup.visible=!!probe;
    if(probe) {
      const origin=new THREE.Vector3(...probe.point).multiplyScalar(1.016);object.marker.position.copy(origin);
      for(const [i,flux] of [probe.fluxU,probe.fluxV].entries()) {
        const arrow=object.arrows[i],direction=new THREE.Vector3(...flux),length=Math.min(.55,direction.length()*8)/field.stats.radius;
        arrow.visible=length>1e-5;
        if(arrow.visible){arrow.position.copy(origin);arrow.setDirection(direction.normalize());arrow.setLength(length,Math.min(.10,length*.38),Math.min(.065,length*.24));}
      }
    }
    if(state.contours) {
      const segments=contourSegments(field),geometry=object.lines.geometry,attribute=geometry.getAttribute('position');
      attribute.array.set(segments);attribute.needsUpdate=true;geometry.setDrawRange(0,segments.length/3);
    }
  }
  function updateObjects() {
    if(state.renderer!=='webgl'||!objects.primary)return;
    updateObject(objects.primary,state.primary);objects.reference.group.visible=!!state.reference;
    if(state.reference)updateObject(objects.reference,state.reference);
  }
  function replaceCanvas() {
    state.drag=null;state.pendingPoke=null;
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
    canvas.classList.toggle('paint-tool',state.tool==='paint');bindCanvas();
  }
  function useCanvas(reason,replace=true) {
    if(renderer){renderer.dispose();renderer=null;}
    if(replace)replaceCanvas();
    ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('WebGL 和 Canvas 2D 均不可用');
    state.renderer='canvas';stage.dataset.renderer='canvas';state.checked=true;
    $('stage-fallback').hidden=false;$('stage-fallback').textContent=reason||'WebGL 不可用，已切换到同一数值场的 Canvas 投影。';
    resize();state.dirty=true;
  }
  function setupRenderer() {
    try {
      if(!THREE||typeof THREE.WebGLRenderer!=='function')throw new Error('未加载 WebGL 渲染器');
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});
      renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(45,1,.1,100);raycaster=new THREE.Raycaster();
      scene.add(new THREE.AmbientLight(0xffffff,.74));
      const warm=new THREE.DirectionalLight(0xffdfb5,2.2);warm.position.set(-3,5,6);scene.add(warm);
      const rim=new THREE.DirectionalLight(0x76e7d2,1.45);rim.position.set(5,-1,-3);scene.add(rim);
      state.renderer='webgl';stage.dataset.renderer='webgl';$('stage-fallback').hidden=true;
    } catch(error) {useCanvas('WebGL 不可用，已切换到同一数值场的 Canvas 投影。',true);}
  }
  function bounds() {
    const box=stage.getBoundingClientRect(),hud=document.querySelector('.lab-bottom').getBoundingClientRect();
    let left=48,right=state.width-48,top=105,bottom=state.height-160;
    const caption=stage.querySelector('.vortex-caption');
    if(state.width<=520&&state.height>400&&getComputedStyle(caption).display!=='none')
      top=Math.max(top,caption.getBoundingClientRect().bottom-box.top+10);
    if(!$('control-panel').hidden)left=Math.max(left,$('control-panel').getBoundingClientRect().right-box.left+12);
    if(!$('knowledge-panel').hidden)right=Math.min(right,$('knowledge-panel').getBoundingClientRect().left-box.left-12);
    const hudTop=hud.top-box.top;if(hud.width&&hudTop>top+60)bottom=Math.min(bottom,hudTop-18);
    const legend=stage.querySelector('.stage-bottom').getBoundingClientRect();
    if(legend.height&&legend.top-box.top>top+60)bottom=Math.min(bottom,legend.top-box.top-12);
    if(right-left<110){left=42;right=state.width-42;}
    if(bottom-top<70){top=48;bottom=Math.max(top+55,Math.min(state.height-40,hudTop-12));}
    return {left,right,top,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
  }
  function visualRadii() {
    const primary=state.primary?state.primary.stats.radius:state.radius;
    const reference=state.reference?state.reference.stats.radius:(state.comparisonMode==='radius'?1:primary);
    return {primary,reference};
  }
  function framingSize() {
    const {primary,reference}=visualRadii();
    return {width:state.compare&&state.layout==='horizontal'?2*(primary+reference+.19)+.17:2*Math.max(primary,state.compare?reference:0)+.45,
      height:state.compare&&state.layout==='vertical'?2*(primary+reference+.19)+.57:2*Math.max(primary,state.compare?reference:0)+.85};
  }
  function updateFraming() {
    if(!state.width||!state.height)return;
    const hud=document.querySelector('.lab-bottom').getBoundingClientRect(),hudTop=hud.top-stage.getBoundingClientRect().top;
    const safe=state.height-hudTop+12,legendMin=state.width<=360?174:150,panelMin=state.height<=540?12:state.width<=360?180:158;
    stage.style.setProperty('--vortex-legend-bottom',Math.ceil(Math.max(legendMin,safe))+'px');
    $('workbench').style.setProperty('--vortex-panel-bottom',Math.ceil(Math.min(state.height-130,Math.max(panelMin,safe)))+'px');
    const b=bounds();state.layout=state.compare&&b.width/b.height<.86?'vertical':'horizontal';
    const size=framingSize(),physicalWidth=size.width,physicalHeight=size.height;
    const pixels=Math.max(1,Math.min(b.width*.9/physicalWidth,b.height*.87/physicalHeight));
    if(camera) {
      camera.fov=clamp(2*Math.atan(state.height/(2*pixels*6))*180/Math.PI,18,120);camera.aspect=state.width/state.height;
      camera.setViewOffset(state.width,state.height,state.width/2-b.centerX,state.height/2-b.centerY,state.width,state.height);camera.updateProjectionMatrix();
    }
    state.dirty=true;
  }
  function resize() {
    const box=stage.getBoundingClientRect();if(!box.width||!box.height)return;
    state.width=box.width;state.height=box.height;
    const side=Math.max(state.width,state.height),screen=window.devicePixelRatio||1;
    const ratio=Math.max(.2,Math.min(state.drag?.65:Math.min(screen,1.5),1600/side));state.dpr=ratio;
    if(renderer){renderer.setPixelRatio(ratio);renderer.setSize(state.width,state.height,false);}
    else if(ctx){canvas.width=Math.round(state.width*ratio);canvas.height=Math.round(state.height*ratio);canvas.style.width='100%';canvas.style.height='100%';ctx.setTransform(ratio,0,0,ratio,0,0);}
    stage.dataset.renderScale=String(ratio);updateFraming();
  }
  function basis() {
    const c=state.camera,sy=Math.sin(c.yaw),cy=Math.cos(c.yaw),sp=Math.sin(c.pitch),cp=Math.cos(c.pitch);
    return {right:vec(cy,0,-sy),up:vec(-sy*sp,cp,-cy*sp),front:vec(sy*cp,sp,cy*cp)};
  }
  function updateCamera() {
    if(!camera)return;const c=state.camera,b=basis();camera.position.set(b.front.x*c.distance,b.front.y*c.distance,b.front.z*c.distance);
    camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    if(objects.primary) {
      const radii=visualRadii(),axis=state.layout==='vertical'?b.up:b.right;
      const pd=state.compare?radii.reference+.19:0,rd=state.compare?radii.primary+.19:0;
      objects.primary.group.scale.setScalar(radii.primary);objects.reference.group.scale.setScalar(radii.reference);
      objects.primary.group.position.set(axis.x*pd,axis.y*pd,axis.z*pd);
      objects.reference.group.position.set(-axis.x*rd,-axis.y*rd,-axis.z*rd);
      objects.primary.group.updateMatrixWorld(true);objects.reference.group.updateMatrixWorld(true);
    }
  }
  function placeLabels() {
    if(!state.compare||!state.reference){$('reference-label').hidden=true;$('primary-label').hidden=true;return;}
    const b=basis(),up=new THREE.Vector3(b.up.x,b.up.y,b.up.z);
    for(const [id,obj,field] of [['reference-label',objects.reference,state.reference],['primary-label',objects.primary,state.primary]]) {
      const p=obj.group.position.clone().addScaledVector(up,-(field.stats.radius+.06)).project(camera),el=$(id);
      el.style.left=((p.x*.5+.5)*state.width).toFixed(1)+'px';el.style.top=((1-p.y)*.5*state.height).toFixed(1)+'px';el.hidden=false;
    }
  }
  function drawWebGL() {
    updateCamera();renderer.setScissorTest(false);renderer.clear();renderer.render(scene,camera);placeLabels();
    if((renderer.info.programs||[]).some(p=>p.diagnostics&&p.diagnostics.runnable===false))throw new Error('球面着色器编译失败');
    const gl=renderer.getContext();if(gl.isContextLost())throw new Error('WebGL 上下文丢失');
    if(!state.checked&&state.primary) {
      const pos=objects.primary.group.position.clone().project(camera),x=Math.round((pos.x*.5+.5)*gl.drawingBufferWidth),y=Math.round((pos.y*.5+.5)*gl.drawingBufferHeight);
      if(x>=0&&y>=0&&x<gl.drawingBufferWidth&&y<gl.drawingBufferHeight) {
        try {const pixel=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(gl.getError()===gl.NO_ERROR&&pixel[3]<2)throw new Error('WebGL 返回空白球面');}
        catch(error){if(error.message==='WebGL 返回空白球面')throw error;}
      }
      state.checked=true;
    }
  }
  function dot(p,q) {return p.x*q.x+p.y*q.y+p.z*q.z;}
  function drawCanvas() {
    const b=bounds(),base=basis(),size=framingSize(),radii=visualRadii(),
      pixels=Math.max(1,Math.min(b.width*.9/size.width,b.height*.87/size.height))*6/state.camera.distance;
    const pd=state.compare?(radii.reference+.19)*pixels:0,rd=state.compare?(radii.primary+.19)*pixels:0,horizontal=state.layout==='horizontal';
    fallbackCenters={primary:{x:b.centerX+(horizontal?pd:0),y:b.centerY-(horizontal?0:pd),r:pixels*radii.primary},
      reference:{x:b.centerX-(horizontal?rd:0),y:b.centerY+(horizontal?0:rd),r:pixels*radii.reference},basis:base};
    ctx.clearRect(0,0,state.width,state.height);
    function sphere(field,center) {
      const pos=state.mesh.positions,tri=state.mesh.triangles,shown=displayedField(field),values=shown.values,n=values.length,screen=new Float32Array(n*3);
      for(let i=0;i<n;i++) {const p=vec(pos[3*i],pos[3*i+1],pos[3*i+2]);screen[3*i]=center.x+center.r*dot(p,base.right);screen[3*i+1]=center.y-center.r*dot(p,base.up);screen[3*i+2]=dot(p,base.front);}
      for(let j=0;j<tri.length;j+=3) {
        const a=tri[j],b=tri[j+1],c=tri[j+2],front=(screen[3*a+2]+screen[3*b+2]+screen[3*c+2])/3;if(front<0)continue;
        const color=colorFor((values[a]+values[b]+values[c])/3,shown.type,shown.model),illum=.52+.48*Math.max(0,front);
        ctx.fillStyle='rgb('+color.map(v=>Math.round(255*clamp(v*illum,0,1))).join(',')+')';
        ctx.beginPath();ctx.moveTo(screen[3*a],screen[3*a+1]);ctx.lineTo(screen[3*b],screen[3*b+1]);ctx.lineTo(screen[3*c],screen[3*c+1]);ctx.closePath();ctx.fill();
        // Cover hairline antialiasing cracks between adjacent projected faces.
        ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.55;ctx.stroke();
      }
      if(state.contours) {
        const segments=contourSegments(field);ctx.strokeStyle='rgba(255,226,184,.68)';ctx.lineWidth=.8;ctx.beginPath();
        for(let i=0;i<segments.length;i+=6) {
          const a=vec(segments[i],segments[i+1],segments[i+2]),c=vec(segments[i+3],segments[i+4],segments[i+5]);
          if(dot(a,base.front)<=0||dot(c,base.front)<=0)continue;
          ctx.moveTo(center.x+center.r*dot(a,base.right),center.y-center.r*dot(a,base.up));ctx.lineTo(center.x+center.r*dot(c,base.right),center.y-center.r*dot(c,base.up));
        }ctx.stroke();
      }
      if(field.probe) {
        const p=field.probe,n=vec(...p.point);
        if(dot(n,base.front)>0) {
          const x=center.x+center.r*1.016*dot(n,base.right),y=center.y-center.r*1.016*dot(n,base.up);
          for(const [flux,color] of [[p.fluxU,'#ffc88d'],[p.fluxV,'#a1fff0']]) {
            const magnitude=Math.hypot(...flux),length=Math.min(.55,magnitude*8);if(length<1e-5)continue;
            const d=vec(...flux),ex=x+pixels*length*dot(d,base.right)/magnitude,ey=y-pixels*length*dot(d,base.up)/magnitude;
            const angle=Math.atan2(ey-y,ex-x),head=Math.min(9,Math.hypot(ex-x,ey-y)*.35);
            ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
            ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-head*Math.cos(angle-.45),ey-head*Math.sin(angle-.45));ctx.lineTo(ex-head*Math.cos(angle+.45),ey-head*Math.sin(angle+.45));ctx.closePath();ctx.fill();
          }
          ctx.fillStyle='#fff1d9';ctx.beginPath();ctx.arc(x,y,3,0,2*Math.PI);ctx.fill();
        }
      }
    }
    if(state.reference)sphere(state.reference,fallbackCenters.reference);sphere(state.primary,fallbackCenters.primary);
    for(const [id,center] of [['reference-label',fallbackCenters.reference],['primary-label',fallbackCenters.primary]]) {
      const el=$(id);el.hidden=!state.compare;if(state.compare){el.style.left=center.x+'px';el.style.top=(center.y+center.r+5)+'px';}
    }
  }
  function render() {
    if(!state.ready||state.failed)return;
    try {if(state.renderer==='webgl')drawWebGL();else drawCanvas();}
    catch(error){if(state.renderer==='webgl'){try{useCanvas('WebGL 渲染已中断，继续使用同一数值场的 Canvas 投影。',true);drawCanvas();}catch(e){fail('球面渲染不可用：'+e.message+'。');}}else fail('球面渲染不可用：'+error.message+'。');}
    if(!state.failed){stage.dataset.drawWidth=String(state.width);stage.dataset.drawHeight=String(state.height);}
  }
  function animate(now) {
    if(!state.lastFrame)state.lastFrame=now;
    const elapsed=Math.min(.12,Math.max(0,(now-state.lastFrame)/1000));state.lastFrame=now;
    if(state.ready&&state.playing&&!state.failed) {
      const fast=state.model==='gray-scott'||(state.compare&&state.comparisonMode==='model'),quantum=fast?1:.2,interval=fast?3:.6;
      state.accumulator=Math.min(quantum*3,state.accumulator+elapsed*(fast?20:4)*state.speed);
      if(state.accumulator>=quantum&&!state.busy&&!state.pendingConfig&&!state.pendingPoke&&!state.pendingProbe&&!state.pendingMode) {
        state.accumulator-=quantum;
        const last=state.primary.spectrum&&state.primary.spectrum.time;
        const spectrum=last==null||state.primary.stats.time-last>=interval;
        post('advance',{duration:quantum,spectrum});
      }
    }
    if(state.dirty&&state.ready&&!state.failed&&now-state.lastDraw>=(state.drag?33:50)) {
      state.dirty=false;state.lastDraw=now;render();
    }
    requestAnimationFrame(animate);
  }
  function pointOnSurface(event) {
    if(!state.ready)return null;
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(state.renderer==='webgl') {
      updateCamera();raycaster.setFromCamera(new THREE.Vector2(x/rect.width*2-1,1-y/rect.height*2),camera);
      const meshes=state.reference?[objects.primary.mesh,objects.reference.mesh]:[objects.primary.mesh];
      const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit)return null;
      const p=hit.object.worldToLocal(hit.point.clone()).normalize();return vec(p.x,p.y,p.z);
    }
    if(!fallbackCenters)return null;
    for(const center of state.reference?[fallbackCenters.primary,fallbackCenters.reference]:[fallbackCenters.primary]) {
      const sx=(x-center.x)/center.r,sy=-(y-center.y)/center.r,d=sx*sx+sy*sy;if(d>1)continue;
      const sz=Math.sqrt(Math.max(0,1-d)),b=fallbackCenters.basis;
      return vec(b.right.x*sx+b.up.x*sy+b.front.x*sz,b.right.y*sx+b.up.y*sy+b.front.y*sz,b.right.z*sx+b.up.z*sy+b.front.z*sz);
    }
    return null;
  }
  function bindCanvas() {
    if(boundCanvases.has(canvas))return;boundCanvases.add(canvas);
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||state.failed)return;
      if(state.tool==='paint'||state.tool==='probe') {const point=pointOnSurface(event);if(!point)return;state.drag={id:event.pointerId,kind:state.tool,point};if(state.tool==='paint')queuePoke(point);else queueProbe(point);}
      else state.drag={id:event.pointerId,kind:'orbit',x:event.clientX,y:event.clientY};
      canvas.setPointerCapture(event.pointerId);resize();
    });
    canvas.addEventListener('pointermove',event=>{
      if(!state.drag||state.drag.id!==event.pointerId)return;
      if(state.drag.kind==='paint'||state.drag.kind==='probe') {
        const point=pointOnSurface(event);if(!point){state.drag.point=null;return;}
        if(!state.drag.point||Math.hypot(point.x-state.drag.point.x,point.y-state.drag.point.y,point.z-state.drag.point.z)>.06){if(state.drag.kind==='paint')queuePoke(point);else queueProbe(point);state.drag.point=point;}
      } else {
        state.camera.yaw+=(event.clientX-state.drag.x)*.008;state.camera.pitch=clamp(state.camera.pitch+(event.clientY-state.drag.y)*.008,-1.25,1.25);
        state.drag.x=event.clientX;state.drag.y=event.clientY;state.dirty=true;
      }
    });
    function end(event) {if(!state.drag||state.drag.id!==event.pointerId)return;state.drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);resize();state.dirty=true;}
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.camera.distance=clamp(state.camera.distance*Math.exp(event.deltaY*.001),4,10);updateControls();state.dirty=true;},{passive:false});
    canvas.addEventListener('dblclick',resetView);
    canvas.addEventListener('keydown',event=>{
      let handled=true;
      if(event.key==='ArrowLeft')state.camera.yaw-=.12;else if(event.key==='ArrowRight')state.camera.yaw+=.12;
      else if(event.key==='ArrowUp')state.camera.pitch=clamp(state.camera.pitch-.12,-1.25,1.25);else if(event.key==='ArrowDown')state.camera.pitch=clamp(state.camera.pitch+.12,-1.25,1.25);
      else if(event.key==='+'||event.key==='=')state.camera.distance=clamp(state.camera.distance/1.12,4,10);
      else if(event.key==='-'||event.key==='_')state.camera.distance=clamp(state.camera.distance*1.12,4,10);
      else if(event.key==='Enter'&&state.tool==='paint')queuePoke(basis().front);
      else if(event.key==='Enter'&&state.tool==='probe')queueProbe(basis().front);
      else if(event.key===' ')setPlaying(!state.playing);else handled=false;
      if(handled){event.preventDefault();updateControls();state.dirty=true;}
    });
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(state.renderer!=='webgl')return;try{useCanvas('WebGL 上下文丢失；已保留浓度并切换到 Canvas 投影。',true);}catch(error){fail('绘图上下文不可用：'+error.message+'。');}});
  }
  function resetView() {state.camera={yaw:.48,pitch:.20,distance:6};updateControls();updateFraming();state.dirty=true;}
  function bind() {
    document.querySelectorAll('button[data-preset]').forEach(el=>el.addEventListener('click',()=>setPreset(el.dataset.preset)));
    $('reaction-model').addEventListener('change',event=>{
      const gray=event.target.value==='gray-scott';state.display=gray?'v':'u';state.pokeStrength=gray?.4:.06;
      setPreset(gray?'gray-spots':'bloom');
    });
    for(const [id,key] of [['diffusion-ratio','ratio'],['reaction-b','b'],['gray-feed','feed'],['gray-kill','kill']]) $(id).addEventListener('input',event=>{
      state[key]=Number(event.target.value);if(key==='ratio'){if(state.model==='gray-scott')state.grayRatio=state.ratio;else state.brussRatio=state.ratio;}
      state.preset='custom';state.warm=0;updateControls();requestConfigure();
    });
    $('sphere-radius').addEventListener('input',event=>{state.radius=Number(event.target.value);state.warm=0;updateControls();scheduleReset();});
    document.querySelectorAll('button[data-comparison]').forEach(el=>el.addEventListener('click',()=>{
      if(state.comparisonMode===el.dataset.comparison)return;state.comparisonMode=el.dataset.comparison;selectNote('comparison');
      if(state.compare)requestReset(0);else updateControls();
    }));
    $('seed-kind').addEventListener('change',event=>{state.kind=event.target.value;state.preset='custom';state.warm=0;updateControls();requestReset(0);});
    $('gray-seed-kind').addEventListener('change',event=>{state.grayKind=event.target.value;state.preset='custom';state.warm=0;updateControls();requestReset(0);});
    $('gray-seed-amplitude').addEventListener('input',event=>{state.grayAmplitude=Number(event.target.value);state.preset='custom';state.warm=0;updateControls();scheduleReset();});
    for(const [id,key] of [['seed-degree','degree'],['seed-amplitude','amplitude']]) $(id).addEventListener('input',event=>{
      state[key]=Number(event.target.value);state.preset='custom';state.warm=0;updateControls();scheduleReset();
    });
    $('mesh-quality').addEventListener('change',event=>{state.quality=event.target.value;state.warm=0;updateControls();requestReset(0);});
    $('compare-toggle').addEventListener('click',()=>{state.compare=!state.compare;requestReset(0);});
    $('compare-card-action').addEventListener('click',()=>{$('compare-toggle').click();if(compact.matches&&!$('knowledge-panel').hidden)$('toggle-knowledge').click();});
    $('phase-card-action').addEventListener('click',()=>{
      if($('knowledge-panel').hidden)$('toggle-knowledge').click();selectNote('phase');
      requestAnimationFrame(()=>{const target=state.model==='gray-scott'?$('phase-gray'):$('phase-chart');if(state.model!=='gray-scott')target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});});
    });
    const phase=$('phase-chart');
    function phasePoint(event) {
      const rect=phase.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*280,py=(event.clientY-rect.top)/rect.height*190;
      setPhaseParameters(1.4+(px-36)/226*.55,1+(155-py)/141*39);
    }
    phase.addEventListener('pointerdown',event=>{if(event.button!==0||state.failed)return;phase.setPointerCapture(event.pointerId);phasePoint(event);event.preventDefault();});
    phase.addEventListener('pointermove',event=>{if(phase.hasPointerCapture(event.pointerId))phasePoint(event);});
    phase.addEventListener('pointerup',event=>{if(phase.hasPointerCapture(event.pointerId))phase.releasePointerCapture(event.pointerId);});
    phase.addEventListener('keydown',event=>{
      const step=event.shiftKey?5:1;let b=state.b,ratio=state.ratio;
      if(event.key==='ArrowLeft')b-=.01*step;else if(event.key==='ArrowRight')b+=.01*step;
      else if(event.key==='ArrowUp')ratio+=step;else if(event.key==='ArrowDown')ratio-=step;else return;
      event.preventDefault();setPhaseParameters(b,ratio);
    });
    document.querySelectorAll('button[data-tool]').forEach(el=>el.addEventListener('click',()=>{state.tool=el.dataset.tool;state.pendingPoke=null;if(state.tool==='probe')selectNote('probe');updateControls();}));
    $('probe-center').addEventListener('click',()=>{state.tool='probe';selectNote('probe');updateControls();queueProbe(basis().front);});
    $('poke-strength').addEventListener('input',event=>{state.pokeStrength=Number(event.target.value);updateControls();});
    $('poke-center').addEventListener('click',()=>{state.tool='paint';updateControls();queuePoke(basis().front);});
    function setDisplay(display) {state.display=display;updateControls();updateObjects();requestMode();}
    document.querySelectorAll('button[data-display]').forEach(el=>el.addEventListener('click',()=>setDisplay(el.dataset.display)));
    for(const id of ['mode-degree','history-degree-input'])$(id).addEventListener('input',event=>{
      state.modeDegree=Number(event.target.value);updateControls();if(state.display==='mode'){updateObjects();requestMode();}if(state.note==='spectrum')drawHistory();
    });
    $('show-mode-action').addEventListener('click',()=>{setDisplay('mode');if(compact.matches&&!$('knowledge-panel').hidden)$('toggle-knowledge').click();});
    document.querySelectorAll('[data-history-scale]').forEach(el=>el.addEventListener('click',()=>{state.historyScale=el.dataset.historyScale;updateControls();drawHistory();}));
    $('show-contours').addEventListener('change',event=>{state.contours=event.target.checked;updateControls();updateObjects();});
    $('camera-zoom').addEventListener('input',event=>{state.camera.distance=6/Number(event.target.value);updateControls();state.dirty=true;});
    document.querySelectorAll('button[data-note]').forEach(el=>el.addEventListener('click',()=>selectNote(el.dataset.note)));
    document.querySelectorAll('[data-speed]').forEach(el=>el.addEventListener('click',()=>{state.speed=Number(el.dataset.speed);state.accumulator=0;updateControls();}));
    $('play').addEventListener('click',()=>setPlaying(!state.playing));$('step').addEventListener('click',()=>post('advance',{duration:state.model==='gray-scott'||(state.compare&&state.comparisonMode==='model')?1:.2,spectrum:true}));
    $('reset').addEventListener('click',()=>requestReset(0));$('reset-view').addEventListener('click',resetView);
    $('save-image').addEventListener('click',()=>{
      if(!state.ready||state.failed)return;
      try {render();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const c=out.getContext('2d');
        const gradient=c.createRadialGradient(out.width*.5,out.height*.47,0,out.width*.5,out.height*.47,Math.max(out.width,out.height)*.65);
        gradient.addColorStop(0,'#203c3b');gradient.addColorStop(1,'#0b1719');c.fillStyle=gradient;c.fillRect(0,0,out.width,out.height);c.drawImage(canvas,0,0);
        const a=document.createElement('a');a.download='turing-pattern.png';a.href=out.toDataURL('image/png');a.click();
      } catch(_){$('stage-notice').textContent='当前画布无法导出，请尝试浏览器截图。';$('stage-notice').hidden=false;updateFraming();}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.playing)setPlaying(false);});
    document.addEventListener('lab:panelchange',()=>{updateFraming();state.dirty=true;});window.addEventListener('resize',resize);
    if('ResizeObserver' in window){
      const observer=new ResizeObserver(()=>{updateFraming();state.dirty=true;});observer.observe(document.querySelector('.lab-bottom'));
      // Mobile browsers can settle the viewport height after the window resize
      // event. Observe the actual stage so camera, picking and labels never
      // remain one orientation behind the CSS layout.
      const stageObserver=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(Math.abs(r.width-state.width)>.25||Math.abs(r.height-state.height)>.25)resize();});
      stageObserver.observe(stage);
    }
  }
  try {
    bind();if(!M)throw new Error('反应扩散模块没有加载');setupRenderer();bindCanvas();resize();updateControls();requestReset(16);requestAnimationFrame(animate);
  } catch(error){fail('球面反应扩散无法启动：'+error.message+'。');}
})();
