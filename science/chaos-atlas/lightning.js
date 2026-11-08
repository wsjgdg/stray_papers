(function(){
  'use strict';
  const $=id=>document.getElementById(id),M=window.LightningModel,A=window.LightningAppearance,T=window.LightningThermal,E=window.LightningEvent,THREE=window.THREE;
  const stage=$('lightning-stage'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const compact=matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  let canvas=$('lightning-scene'),worker=null,renderer=null,scene=null,camera=null,ctx=null;
  let objects={primary:null,reference:null};
  const canvasBindings=new WeakSet(),pathCache=new WeakMap(),HEIGHT=4.8;
  const storm=new Image();storm.src='assets/lightning-storm-bg.jpg';
  const presets={
    branch:{eta:4.0,seed:19,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:120,description:'从初态数值预演 120 步；继续观察路径与电场相互改变。'},
    needle:{eta:4.6,seed:27,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:42,description:'更强地偏选高场强连接；较少分支是倾向而不是单次结果的保证。'},
    bush:{eta:1.0,seed:2026,sourceX:0,sourceZ:0,targetX:0,targetZ:0,warm:110,description:'较低 η 让弱场候选仍有机会生长，预演 110 个真实事件。'},
    offset:{eta:2.8,seed:42,sourceX:-65,sourceZ:-18,targetX:65,targetZ:18,warm:70,description:'两针横向错位，电势和通道随可移动边界重新计算。'}
  };
  const state={
    preset:'branch',eta:4.0,referenceEta:1,seed:19,quality:'standard',tolerance:1e-5,appearance:'glow',
    electrodeShape:'needle',electrodeLength:.11,electrodeRadius:.03,
    sourceX:0,sourceZ:0,targetX:0,targetZ:0,compare:false,tool:'orbit',showCandidates:false,showSlice:false,slice:0,
    playing:!reduced.matches,speed:1,ready:false,busy:false,failed:false,generation:0,pendingEta:null,
    primary:null,reference:null,primaryLimited:false,referenceLimited:false,limit:3000,
    width:0,height:0,dpr:1,renderer:'',camera:{yaw:.42,pitch:.26,zoom:1},layout:'horizontal',
    bounds:null,pixels:1,offsets:{primary:{x:0,y:0,z:0},reference:{x:0,y:0,z:0}},
    drag:null,probeId:null,pendingProbe:null,probeNotice:'尚未选择候选节点。',lastFrame:0,accumulator:0,dirty:true,note:'growth',
    resetTimer:null,expectedWarm:120,lastNotice:'',lastLayoutKey:'',etaHistoryChanged:false,
    thermal:{model:null,running:false,visible:false,voltage:2,cooling:.5,encoding:'temperature',last:0,accumulator:0},
    stroke:{worker:null,data:null,running:false,visible:false,auto:false,autoPlay:false,frame:0,cursor:0,last:0,probe:50,probeSlot:0,encoding:'current',rate:5,multiplier:1,height:2000,voltage:10,resistance:.10,inductance:2,capacitance:50,ground:10,duration:50,status:'等待计算通道接触目标电极。'},
    study:{worker:null,mode:'',gridResult:null,gridStatus:'使用当前电极、η 和种子，各自独立从初态求解两套网格。',statsResult:null,statsStatus:'尚未运行；起始种子使用当前实验的随机种子。'},
    event:{comparison:null,view:'current',x:50,y:50,wanted:false,inFlight:false,accept:false,status:'尚未捕获事件。'}
  };
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const vec=(x,y,z)=>({x,y,z});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const add=(a,b)=>vec(a.x+b.x,a.y+b.y,a.z+b.z);
  const scale=(v,s)=>vec(v.x*s,v.y*s,v.z*s);
  function basis(){
    const {yaw,pitch}=state.camera,sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    return {right:vec(cy,0,-sy),up:vec(-sy*sp,cp,-cy*sp),front:vec(sy*cp,sp,cy*cp)};
  }
  function gridSize(){return M.GRIDS[state.quality]||M.GRIDS.standard;}
  function electrodeMargin(){return Math.max(2,Math.ceil(state.electrodeRadius*(gridSize().ny-1)));}
  function coordFromSlider(value,n){const m=electrodeMargin();return clamp(Math.round(m+(clamp(value,-100,100)+100)*(n-1-2*m)/200),m,n-1-m);}
  function sliderFromCoord(value,n){const m=electrodeMargin();return clamp(Math.round((value-m)*200/(n-1-2*m)-100),-100,100);}
  function coordValue(value,n,ny){return (coordFromSlider(value,n)-(n-1)/2)/(ny-1);}
  function solverOptions(){
    const g=gridSize();return {quality:state.quality,eta:state.eta,seed:state.seed,tolerance:state.tolerance,
      electrodeShape:state.electrodeShape,electrodeLength:state.electrodeLength,electrodeRadius:state.electrodeRadius,
      sourceX:coordFromSlider(state.sourceX,g.nx),sourceZ:coordFromSlider(state.sourceZ,g.nz),
      targetX:coordFromSlider(state.targetX,g.nx),targetZ:coordFromSlider(state.targetZ,g.nz)};
  }
  function sliceIndex(data){return clamp(Math.round((state.slice+100)*(data.nz-1)/200),0,data.nz-1);}
  function progress(input){
    const lo=Number(input.min),hi=Number(input.max),v=Number(input.value);input.style.setProperty('--progress',clamp(100*(v-lo)/(hi-lo),0,100)+'%');
  }
  function notice(text){
    text=text||'';if(state.lastNotice===text)return;state.lastNotice=text;
    $('stage-notice').textContent=text;$('stage-notice').hidden=!text;
    requestAnimationFrame(()=>{updateFraming();state.dirty=true;});
  }
  function fail(message){
    if(worker){worker.terminate();worker=null;}state.failed=true;state.ready=false;state.busy=false;state.playing=false;state.pendingProbe=null;delete stage.dataset.probePending;
    stage.dataset.status='error';$('stage-error-text').textContent=message;$('stage-error').hidden=false;notice('');
    invalidateStudies('主求解失败，后台计算已取消。');clearEvent('求解失败，前后场已清除。');state.event.inFlight=false;clearThermal();clearStroke('主求解失败，回击数据已清除。');updateThermalControls();updateStrokeControls();updatePlayback();
  }
  function resetObjects(){
    if(!scene){objects={primary:null,reference:null};return;}
    for(const obj of [objects.primary,objects.reference])if(obj){
      scene.remove(obj.group);obj.group.traverse(node=>{
        if(node.geometry)node.geometry.dispose();
        if(node.material){const materials=Array.isArray(node.material)?node.material:[node.material];for(const material of materials){if(material.map)material.map.dispose();material.dispose();}}
      });
    }
    objects={primary:null,reference:null};
  }
  function requestReset(warm=0){
    invalidateStudies();clearEvent('模型已重置；请重新捕获事件。');state.event.inFlight=false;clearThermal();clearStroke('模型已重置，回击数据已清除。');
    if(state.resetTimer){clearTimeout(state.resetTimer);state.resetTimer=null;state.playing=state.queuedPlaying;}
    state.generation++;state.ready=false;state.failed=false;state.busy=true;canvas.style.opacity='0';
    state.primary=null;state.reference=null;state.primaryLimited=false;state.referenceLimited=false;state.pendingEta=null;
    state.probeId=null;state.pendingProbe=null;delete stage.dataset.probePending;state.probeNotice='尚未选择候选节点。';state.accumulator=0;state.lastFrame=0;state.expectedWarm=warm;state.etaHistoryChanged=false;
    resetObjects();if(worker){worker.terminate();worker=null;}
    $('stage-error-text').textContent=warm?'正在计算三维电势并预演 '+warm+' 个真实生长事件，请稍候……':'正在根据当前位置计算三维电势场，请稍候……';
    $('stage-error').hidden=false;stage.dataset.status='loading';stage.dataset.steps='0';notice('');updateControls();updatePlayback();state.dirty=true;
    try{
      if(!window.Worker)throw Error('当前浏览器不支持后台 Worker。');
      const local=worker=new Worker('lightning-worker.js?v=20261031-30'),generation=state.generation;
      local.onerror=event=>{if(worker===local&&generation===state.generation)fail('后台电势求解器无法启动。请通过本地服务器打开页面，并确认 Worker 可用。');};
      local.onmessage=event=>{
        if(worker!==local||generation!==state.generation)return;
        const message=event.data||{};if(message.generation!==state.generation)return;
        if(message.kind==='error'){fail('电势求解已停止：'+message.message);return;}
        if(message.kind==='progress'){$('stage-error-text').textContent='正在预演真实生长事件 '+message.attempted+' / '+message.total+'；后台求解中……';stage.dataset.warmProgress=message.attempted+'/'+message.total;return;}
        if(!['ready','frame','configured','capture'].includes(message.kind))return;
        state.primary=message.primary;state.reference=message.reference;state.primaryLimited=message.primaryLimited;state.referenceLimited=message.referenceLimited;state.limit=message.limit;
        state.ready=true;state.busy=false;state.failed=false;stage.dataset.status='ready';delete stage.dataset.warmProgress;$('stage-error').hidden=true;
        if(message.kind==='capture'){
          const ev=state.event;ev.inFlight=false;
          if(ev.accept&&!state.playing){
            if(state.primary.stats.complete){ev.comparison=null;ev.view='current';ev.status='该事件接触电极；DBM 未计算接触后的电势场，不能显示差值。';}
            else try{
              ev.comparison=E.compare(message.before,state.primary);ev.view='deltaPhi';ev.status='已捕获同一事件的两次求解。';state.showSlice=true;
              const d=state.primary,id=ev.comparison.best;if(id>=0){const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny;ev.x=Math.round(100*x/(d.nx-1));ev.y=Math.round(100*y/(d.ny-1));state.slice=Math.round(200*z/(d.nz-1)-100);}
            }catch(error){ev.comparison=null;ev.view='current';ev.status='无法比较该事件：'+error.message;}
          }
          ev.accept=false;
        }
        if(Math.abs(state.primary.eta-state.eta)>1e-8)state.pendingEta=state.eta;
        if(state.probeId!==null&&!state.primary.candidateIds.includes(state.probeId)){
          state.probeId=null;state.probeNotice=state.primary.stats.complete?'电弧已接触正极；候选探测停止。':'该位置已不再是候选节点，请重新探测。';
        }
        const primaryDone=state.primary.stats.complete||state.primaryLimited;
        const referenceDone=!state.reference||state.reference.stats.complete||state.referenceLimited;
        if(primaryDone&&referenceDone){state.playing=false;state.accumulator=0;
          notice(state.primaryLimited||state.referenceLimited?'达到 '+state.limit+' 步的显示容量，已暂停。':'电弧已接触正极或下极板；模型在接触前最后一个电场处停止。');
        }else if(state.compare&&primaryDone){notice('实验 B 已停止；对照 A 继续生长，两个模型独立计算。');}
        else if(state.compare&&state.reference&&(state.reference.stats.complete||state.referenceLimited)){notice('对照 A 已停止；实验 B 继续生长，两个模型独立计算。');}
        else if(state.drag&&(state.drag.tool==='source'||state.drag.tool==='target'))notice('正在移动电极；旧通道隐藏，松手后重算电势。');
        else if(Math.abs(state.primary.eta-state.eta)>1e-8)notice('η 正在后台应用；已提交的生长步完成后更新概率。');
        else if(state.event.wanted)notice('已暂停，等待已提交的生长步完成后捕获下一事件。');
        else if(state.pendingProbe)notice('已暂停，正在完成已提交的生长步后探测。');
        else notice('');
        updateControls();updateTelemetry();updatePlayback();updateObjects();updateFraming();state.dirty=true;
        // Render the new generation before revealing it; never flash an old
        // framebuffer underneath a newly selected boundary.
        draw();if(!state.failed)canvas.style.opacity='';pumpConfiguration();
        if(!state.busy&&state.pendingProbe&&Math.abs(state.primary.eta-state.eta)<1e-8){
          const pending=state.pendingProbe;state.pendingProbe=null;delete stage.dataset.probePending;completeProbe(pending);
        }
        pumpCapture();
        if(message.kind==='ready'&&state.stroke.auto){
          const shouldPlay=state.stroke.autoPlay&&!document.hidden;state.stroke.auto=false;
          if(state.primary.stats.complete&&!state.compare)startStroke(shouldPlay);
          else{state.stroke.status='预演未接通；请继续生长后再计算回击。';updateStrokeControls();}
        }
      };
      local.postMessage({type:'init',generation,options:solverOptions(),compare:state.compare,referenceEta:state.referenceEta,warm});
    }catch(error){fail('无法启动后台求解器：'+(error&&error.message||error)+'。请通过本地服务器打开页面。');}
  }
  function queueReset(){
    if(!state.resetTimer){
      invalidateStudies();clearEvent('模型参数已变化；请重新捕获事件。');state.event.inFlight=false;clearThermal();clearStroke('模型参数已变化，回击数据已清除。');state.queuedPlaying=state.playing;
      // Invalidate in-flight work immediately. An old snapshot must never be
      // presented as the field for the newly selected electrode or grid.
      state.generation++;if(worker){worker.terminate();worker=null;}
      state.ready=false;state.failed=false;state.busy=false;state.pendingEta=null;state.pendingProbe=null;delete stage.dataset.probePending;state.primary=null;state.reference=null;
      resetObjects();canvas.style.opacity='0';stage.dataset.status='loading';
      $('stage-error-text').textContent='参数已改变，停止调节后重新计算电势和路径……';$('stage-error').hidden=false;
      $('reference-label').hidden=$('primary-label').hidden=true;
    }
    clearTimeout(state.resetTimer);state.playing=false;state.accumulator=0;updatePlayback();
    state.resetTimer=setTimeout(()=>{state.resetTimer=null;state.playing=state.queuedPlaying;requestReset(0);},180);
  }
  function pumpConfiguration(){
    if(!state.ready||state.busy||!worker||state.pendingEta===null)return;
    const eta=state.pendingEta;state.pendingEta=null;state.busy=true;
    worker.postMessage({type:'configure',generation:state.generation,eta});updatePlayback();
  }
  function sendSteps(count){
    if(!state.ready||state.busy||!worker)return;
    clearEvent('继续生长后，旧事件对照已清除。');state.busy=true;worker.postMessage({type:'advance',generation:state.generation,count});updatePlayback();
  }
  function setPlaying(value){
    if(!state.ready||state.failed)return;
    const done=state.primary&&(state.primary.stats.complete||state.primaryLimited)&&(!state.reference||state.reference.stats.complete||state.referenceLimited);
    if(value&&done){notice('电弧已停止；点击重置可按当前参数从零开始。');return;}
    if(value)clearEvent('继续生长后，旧事件对照已清除。');
    if(value&&state.pendingProbe){state.pendingProbe=null;delete stage.dataset.probePending;state.probeNotice='探测已取消；生长继续。';updateTelemetry();}
    state.playing=!!value;state.accumulator=0;state.lastFrame=0;updatePlayback();state.dirty=true;
  }
  function updatePlayback(){
    const done=state.primary&&(state.primary.stats.complete||state.primaryLimited)&&(!state.reference||state.reference.stats.complete||state.referenceLimited);
    const rmode=!!(state.stroke.visible&&state.stroke.data),r=state.stroke;
    $('play').disabled=rmode?false:state.failed||!state.ready||!!done;
    $('step').disabled=rmode?(r.running||r.frame>=r.data.frames-1):state.failed||!state.ready||state.playing||state.busy||!!done;
    $('reset').disabled=rmode?false:!state.ready&&!state.failed;$('save-image').disabled=state.failed||!state.ready;
    $('step').setAttribute('aria-label',rmode?'回击单步':'生长一步');$('step').title=rmode?'回击单步':'生长一步';
    $('reset').setAttribute('aria-label',rmode?'回击回到起点':'按当前参数从零开始');$('reset').title=rmode?'回击回到起点':'按当前参数从零开始';
    $('transport-controls').setAttribute('aria-label',rmode?'回击播放和视角控制':'生长和视角控制');$('speed-controls').setAttribute('aria-label',rmode?'回击回放倍速':'目标生长速度');
    const etaPending=state.primary&&Math.abs(state.primary.eta-state.eta)>1e-8;
    $('probe-strongest').disabled=state.failed||!state.ready||!state.primary||!state.primary.candidateIds.length||!!etaPending;
    $('probe-strongest-card').disabled=$('probe-strongest').disabled;
    const noCapture=state.failed||!state.ready||!state.primary||state.primary.stats.complete||state.primaryLimited||state.event.wanted||state.event.inFlight;
    $('event-capture').disabled=noCapture;$('event-card-capture').disabled=noCapture;
    const running=rmode?r.running:state.playing;$('play-symbol').textContent=running?'Ⅱ':'▶';$('play-text').textContent=running?'暂停':'播放';
    $('play').setAttribute('aria-label',(running?'暂停':'播放')+(rmode?'回击':'生长'));updateSpeedControls();
    const stroke=state.stroke;
    let status=state.failed?'求解不可用':!state.ready?'正在计算初态':stroke.worker?'回击后台求解中':stroke.running?'回击正在回放':stroke.visible&&stroke.data?'回击已暂停':done?'本轮生长已停止':state.playing?'电场驱动生长中':state.busy?'暂停 · 正在收尾':'实验已暂停';
    $('header-status').textContent=status;$('stage-status').textContent=state.failed?'SOLVER UNAVAILABLE':!state.ready?'FIELD INITIALIZING':stroke.worker?'RETURN STROKE SOLVING':stroke.running?'RETURN STROKE REPLAY':stroke.visible&&stroke.data?'RETURN STROKE PAUSED':done?'GROWTH STOPPED':state.playing?'FIELD-DRIVEN GROWTH':'GROWTH PAUSED';
    document.querySelector('.top-status').classList.toggle('paused',!(state.playing||stroke.running));stage.classList.toggle('paused',!(state.playing||stroke.running));
  }
  function clearThermal(){const v=state.thermal;v.model=null;v.running=false;v.visible=false;v.last=0;v.accumulator=0;}
  function thermalReady(){return !!(T&&state.ready&&!state.failed&&!state.compare&&!state.drag&&state.primary&&state.primary.stats.complete);}
  function updateThermalControls(){
    const v=state.thermal,ready=thermalReady(),m=v.model,st=m&&m.stats();
    for(const [id,value,digits] of [['thermal-voltage',v.voltage,1],['thermal-cooling',v.cooling,2]]){$(id).value=String(value);$(id+'-value').textContent=value.toFixed(digits);progress($(id));}
    for(const id of ['thermal-play','thermal-step'])$(id).disabled=!ready||!!(st&&st.halt);$('thermal-reset').disabled=!ready;
    $('thermal-encoding').value=v.encoding;$('thermal-view').disabled=!m;$('thermal-play').setAttribute('aria-pressed',String(v.running));$('thermal-view').setAttribute('aria-pressed',String(v.visible));
    $('thermal-play').textContent=v.running?'暂停电热':m?'继续电热':'开始电热';$('thermal-view').textContent=v.visible?'恢复通道外观':'显示电热色阶';
    updateVisualScope();
    $('thermal-readout').textContent=st?'t '+st.time.toFixed(2)+' · I '+st.current.toFixed(3)+' · 峰值 T '+st.maxTemperature.toFixed(2)+' · 通道功率 '+st.channelPower.toFixed(3)+(st.halt?' · '+st.halt:''):
      state.compare?'关闭双模型对照后可观察电热。':ready?'通道已接通；可启动独立电热模型。':'等待计算通道接触正极。';
    $('thermal-card').textContent=st?st.current.toFixed(3)+' / '+st.maxTemperature.toFixed(2):'—';
    stage.dataset.thermal=st?(v.running?'running':v.visible?'paused':'hidden'):'off';
    if(st){stage.dataset.thermalTime=String(st.time);stage.dataset.thermalCurrent=String(st.current);stage.dataset.thermalTemperature=String(st.maxTemperature);stage.dataset.thermalPower=String(st.channelPower);stage.dataset.thermalBudget=String(st.budget);}
    else for(const key of ['thermalTime','thermalCurrent','thermalTemperature','thermalPower','thermalBudget'])delete stage.dataset[key];
  }
  function initThermal(){
    if(!thermalReady())return false;const v=state.thermal;
    if(!v.model){try{v.model=new T.Electrothermal(state.primary,{voltage:v.voltage,cooling:v.cooling});}catch(error){notice('电热模型无法建立：'+error.message);return false;}}
    if(state.stroke.visible){state.stroke.visible=false;state.stroke.running=false;state.stroke.last=0;updateObjects();updateStrokeControls();updatePlayback();}
    v.visible=true;return true;
  }
  function refreshThermal(){
    if(state.renderer==='webgl'&&objects.primary&&state.primary)paintPathColors(objects.primary,state.primary,true);
    updateThermalControls();state.dirty=true;
  }
  function showContactExample(){
    state.playing=false;state.compare=false;state.preset='';state.quality='quick';state.eta=4.6;state.seed=27;
    state.sourceX=state.sourceZ=state.targetX=state.targetZ=0;state.electrodeShape='needle';state.electrodeLength=.11;state.electrodeRadius=.03;requestReset(120);
  }
  // Independent post-contact transmission-line experiment. The DBM provides
  // topology only; SI scale, precharge and RLC parameters are explicit input.
  function clearStroke(reason=''){
    const v=state.stroke;if(v.worker){v.worker.terminate();v.worker=null;}
    v.data=null;v.running=false;v.visible=false;v.auto=false;v.autoPlay=false;v.frame=0;v.cursor=0;v.last=0;v.probeSlot=0;v.status=reason;
  }
  function strokeReady(){return !!(state.ready&&!state.failed&&!state.compare&&!state.drag&&state.primary&&state.primary.stats.complete);}
  function strokeOptions(){
    const v=state.stroke;return {height:v.height,voltage:v.voltage*1e6,resistance:v.resistance,inductance:v.inductance*1e-6,capacitance:v.capacitance*1e-12,groundResistance:v.ground};
  }
  function updateVisualScope(){
    const s=state.stroke,t=state.thermal,returning=!!(s.visible&&s.data),thermal=!!(t.visible&&t.model);
    const scope=returning?'DBM + 回击 RLC':thermal?'DBM + 电热示意':'DBM 示意';
    $('model-scope').textContent=scope;$('compact-model-label').textContent=scope+' · 非完整雷电';$('lightning-model-panel').setAttribute('aria-label',returning?'三维假设通道中的回击传播场景':'三维电极和电弧生长场景');$('lightning-telemetry').setAttribute('aria-label',returning?'回击实时数据':'电弧实时数据');updateCanvasAccessibility();
    $('stage-phase').textContent=returning?'02 / RETURN-STROKE MODEL':'01 / FIELD-DRIVEN GROWTH';$('stage-title').textContent=returning?'接地后的回击传播':'电场驱动的随机击穿';$('target-legend-text').textContent=returning?'接地端 / 下极板':'正极 / 下极板';
    $('channel-legend').hidden=$('candidate-legend').hidden=returning;
    const previous=stage.dataset.visualScope,contact='电弧已接触正极或下极板；模型在接触前最后一个电场处停止。';
    if(returning&&previous!=='return'&&state.lastNotice===contact)notice('');
    else if(!returning&&previous==='return'&&state.primary&&state.primary.stats.complete&&!state.lastNotice)notice(contact);
    stage.dataset.visualScope=returning?'return':thermal?'thermal':'dbm';
    $('appearance-caption').textContent=returning?'RLC 模型色阶 · 云与光晕为表现':thermal?'独立电热色阶 · 合成云与光晕为表现':state.appearance==='glow'?'节点与分叉由模型计算 · 合成云与光效为表现':'仅显示计算节点之间的直线连接';
  }
  function selectStrokeProbe(){
    const v=state.stroke,m=v.data;if(!m||!m.mainIndices.length){v.probeSlot=0;return;}
    const desired=v.probe*m.mainLength/100;let lo=0,hi=m.mainDistances.length-1;
    while(lo<hi){const mid=(lo+hi)>>1;if(m.mainDistances[mid]<desired)lo=mid+1;else hi=mid;}
    if(lo>0&&Math.abs(m.mainDistances[lo-1]-desired)<Math.abs(m.mainDistances[lo]-desired))lo--;
    v.probeSlot=lo;
  }
  function strokeProbePosition(){
    const v=state.stroke,m=v.data,d=state.primary;if(!m||!d||!m.mainIndices.length)return null;
    const edge=m.mainIndices[v.probeSlot],e=m.seedSegmentCount+Math.floor(edge/m.parts),part=edge%m.parts;
    if(2*e+1>=d.segments.length)return null;
    const p=A.node(d,d.segments[2*e],HEIGHT),q=A.node(d,d.segments[2*e+1],HEIGHT),f=(part+.5)/m.parts;
    return vec(p[0]+f*(q[0]-p[0]),p[1]+f*(q[1]-p[1]),p[2]+f*(q[2]-p[2]));
  }
  function strokeScale(m,encoding){
    const reference=m.options.voltage/m.impedance;
    if(encoding==='power')return {value:m.options.resistance*reference*reference,label:'单位长度功率 0–'+(m.options.resistance*reference*reference/1e6).toFixed(1)+' MW/m'};
    if(encoding==='heat')return {value:m.options.resistance*reference*reference*10e-6,label:'累计焦耳能 0–'+(m.options.resistance*reference*reference*10e-6/1000).toFixed(1)+' kJ/m'};
    return {value:reference,label:'|I| 0–'+(reference/1000).toFixed(1)+' kA'};
  }
  function strokeIntensity(m,frame,edge,fixedScale){
    const k=frame*m.edges+edge,I=Math.abs(m.currents[k]),scale=fixedScale===undefined?strokeScale(m,state.stroke.encoding).value:fixedScale;
    const value=state.stroke.encoding==='power'?m.options.resistance*I*I:state.stroke.encoding==='heat'?m.heating[k]:I;
    return scale>0?clamp(value/scale,0,1):0;
  }
  function strokeColor(x,encoding){
    const t=Math.pow(clamp(x,0,1),.42);
    return encoding==='current'?[.08+.74*t,.12+.84*t,.20+.80*t]:[.16+.84*t,.075+.77*t,.055+.62*t];
  }
  function drawStrokeChart(){
    const chart=$('return-chart'),q=chart.getContext('2d');if(!q)return;
    const w=chart.width,h=chart.height,left=53,right=w-12,top=18,bottom=h-28,mid=(top+bottom)/2,half=(bottom-top)/2;
    q.clearRect(0,0,w,h);q.fillStyle='#122d30';q.fillRect(0,0,w,h);q.strokeStyle='#3b5e58';q.lineWidth=1;
    for(let i=0;i<=4;i++){const x=left+(right-left)*i/4;q.beginPath();q.moveTo(x,top);q.lineTo(x,bottom);q.stroke();}
    for(const y of [top,mid,bottom]){q.beginPath();q.moveTo(left,y);q.lineTo(right,y);q.stroke();}
    const v=state.stroke,m=v.data;q.font='17px sans-serif';q.fillStyle='#a8c4b7';q.textAlign='center';q.textBaseline='middle';
    if(!m){q.fillText('计算后显示实际电流波形',w/2,h/2);chart.setAttribute('aria-label','接地点和主通道探针的电流曲线；尚未计算。');return;}
    const edge=m.mainIndices[v.probeSlot];let max=0;
    for(let f=0;f<m.frames;f++)max=Math.max(max,Math.abs(m.metrics.groundCurrent[f]),Math.abs(m.currents[f*m.edges+edge]));
    max=Math.max(max,1)*1.12;const xAt=f=>left+(right-left)*f/(m.frames-1),yAt=i=>mid-i/max*half;
    for(const [color,sample] of [['#ffca91',f=>m.metrics.groundCurrent[f]],['#81e5f6',f=>-m.currents[f*m.edges+edge]]]){
      q.strokeStyle=color;q.lineWidth=2.2;q.beginPath();for(let f=0;f<m.frames;f++){const x=xAt(f),y=yAt(sample(f));if(f)q.lineTo(x,y);else q.moveTo(x,y);}q.stroke();
    }
    q.strokeStyle='rgba(236,249,230,.7)';q.lineWidth=1;q.beginPath();q.moveTo(xAt(v.frame),top);q.lineTo(xAt(v.frame),bottom);q.stroke();
    q.fillStyle='#b8d0c4';q.font='15px sans-serif';q.textAlign='right';q.fillText((max/1000).toFixed(0)+'kA',left-5,top+3);q.fillText('0',left-5,mid);q.fillText('−'+(max/1000).toFixed(0),left-5,bottom-2);
    q.textAlign='left';q.fillText('0',left,bottom+17);q.textAlign='right';q.fillText((m.times[m.frames-1]*1e6).toFixed(0)+' μs',right,bottom+17);
    const probe=-m.currents[v.frame*m.edges+edge]/1000,ground=m.metrics.groundCurrent[v.frame]/1000;
    chart.setAttribute('aria-label','回击电流随时间曲线。橙色为接地点，青色为探针；当前接地 '+ground.toFixed(2)+' 千安，探针 '+probe.toFixed(2)+' 千安。');
  }
  function updateStrokeControls(){
    const v=state.stroke,m=v.data,ready=strokeReady(),opts=strokeOptions(),speed=1/Math.sqrt(opts.inductance*opts.capacitance),imp=Math.sqrt(opts.inductance/opts.capacitance);
    for(const [id,value,digits] of [['return-height',v.height,0],['return-voltage',v.voltage,1],['return-resistance',v.resistance,2],['return-inductance',v.inductance,1],['return-capacitance',v.capacitance,0],['return-ground',v.ground,0]]){
      $(id).value=String(value);$(id+'-value').textContent=Number(value).toFixed(digits);progress($(id));
    }
    $('return-parameter').textContent='等效波速 '+speed.toExponential(2)+' m/s · 阻抗 '+imp.toFixed(0)+' Ω';
    $('return-duration').value=String(v.duration);$('return-encoding').value=v.encoding;$('return-rate').value=String(v.rate);
    $('return-compute').disabled=!ready||!!v.worker;$('return-cancel').disabled=!v.worker;
    $('return-play').disabled=!m||!!v.worker;$('return-step').disabled=!m||!!v.worker||v.running||v.frame>=m.frames-1;
    $('return-reset').disabled=!m||!!v.worker;$('return-view').disabled=!m||!!v.worker;
    $('return-probe').disabled=$('return-time').disabled=!m||!!v.worker;$('return-probe').value=String(v.probe);progress($('return-probe'));
    $('return-time').value=String(m?v.frame:0);progress($('return-time'));
    $('return-play').setAttribute('aria-pressed',String(v.running));$('return-view').setAttribute('aria-pressed',String(v.visible));
    $('return-play').textContent=v.running?'暂停回击':m&&v.frame>=m.frames-1?'从头播放':'播放回击';$('return-view').textContent=v.visible?'恢复通道外观':'显示回击色阶';
    const base=state.compare?'关闭双模型对照后可计算回击。':ready?'通道已接通；可后台计算回击。':'等待计算通道接触目标电极。';
    const status=v.worker||m?v.status:(v.status?v.status+' ':'')+base;
    if($('return-status').textContent!==status)$('return-status').textContent=status;
    $('return-legend').hidden=!(v.visible&&m);updateVisualScope();
    stage.dataset.return=v.worker?'computing':m?(v.running?'running':v.visible?'paused':'hidden'):'off';
    if(!m){
      $('return-probe-value').textContent='—';$('return-time-value').textContent='—';$('return-readout').textContent='尚未计算回击。';$('return-card').textContent='—';
      $('return-comparison').textContent='—';for(const key of ['returnFrame','returnTime','returnGround','returnProbeCurrent','returnProbeVoltage','returnProbeEdge','returnBranchCurrent','returnEnergyError','returnChargeError','returnScale'])delete stage.dataset[key];
      drawStrokeChart();updateTelemetry();return;
    }
    const edge=m.mainIndices[v.probeSlot],idx=v.frame*m.edges+edge,I=-m.currents[idx],V=m.voltages[idx],heat=m.heating[idx],ground=m.metrics.groundCurrent[v.frame],time=m.times[v.frame]*1e6;
    let branchMax=0;for(const e of m.branchIndices)branchMax=Math.max(branchMax,Math.abs(m.currents[v.frame*m.edges+e]));
    const dc=state.thermal.model;let dcBranch=0;if(dc)for(let e=dc.seedSegmentCount;e<dc.edges;e++)if(!dc.onPath[e])dcBranch=Math.max(dcBranch,Math.abs(dc.currents[e]));
    const energyError=m.metrics.energyError[v.frame],chargeError=m.metrics.chargeError[v.frame],energyRel=m.initialEnergy?Math.abs(energyError)/m.initialEnergy:0,scale=strokeScale(m,v.encoding);
    $('return-probe-value').textContent=(m.mainDistances[v.probeSlot]/1000).toFixed(2)+' km';$('return-time-value').textContent=time.toFixed(2);
    $('return-legend-label').textContent=scale.label+' · 非线性';
    $('return-readout').textContent='t '+time.toFixed(2)+' μs · 接地 I '+(ground/1000).toFixed(2)+' kA\n探针 I '+(I/1000).toFixed(2)+' kA · V '+(V/1e6).toFixed(2)+' MV\n探针功率 '+(m.options.resistance*I*I/1e6).toFixed(2)+' MW/m · 累计热 '+(heat/1000).toFixed(2)+' kJ/m\n悬空支路最大 |I| '+(m.branchIndices.length?(branchMax/1000).toFixed(2)+' kA':'无支路')+'\n接地净注入 '+m.metrics.groundCharge[v.frame].toFixed(3)+' C / 初始 '+m.initialCharge.toFixed(3)+' C\n通道焦耳热 '+(m.metrics.channelHeat[v.frame]/1e6).toFixed(2)+' MJ · 接地耗散 '+(m.metrics.groundLoss[v.frame]/1e6).toFixed(2)+' MJ\n离散储能 '+(m.metrics.stored[v.frame]/1e6).toFixed(2)+' / 初始 '+(m.initialEnergy/1e6).toFixed(2)+' MJ\n能量残差 '+energyRel.toExponential(1)+'（相对初始能量） · 电荷残差 '+chargeError.toExponential(1)+' C';
    $('return-card').textContent=(m.waveSpeed/1e8).toFixed(2)+'×10⁸ m/s / '+(I/1000).toFixed(2)+' kA';
    $('return-comparison').textContent=(m.branchIndices.length?(branchMax/1000).toFixed(2)+' kA':'无支路')+' / '+(dc?dcBranch.toFixed(3)+'（无量纲）':'直流未启动');
    stage.dataset.returnBranchCurrent=String(branchMax);stage.dataset.returnFrame=String(v.frame);stage.dataset.returnTime=String(m.times[v.frame]);stage.dataset.returnGround=String(ground);stage.dataset.returnProbeCurrent=String(I);stage.dataset.returnProbeVoltage=String(V);stage.dataset.returnProbeEdge=String(edge);stage.dataset.returnEnergyError=String(energyError);stage.dataset.returnChargeError=String(chargeError);stage.dataset.returnScale=String(scale.value);
    drawStrokeChart();updateTelemetry();
  }
  function refreshStroke(rebuild=false){
    if(state.renderer==='webgl'&&objects.primary&&state.primary){if(rebuild)updateObjects();else{paintPathColors(objects.primary,state.primary,true);updateStrokeMarker(objects.primary);}}
    updateStrokeControls();updateThermalControls();updatePlayback();state.dirty=true;
  }
  function invalidateStroke(reason){
    const had=!!(state.stroke.data||state.stroke.worker||state.stroke.auto||state.stroke.visible),rebuild=state.stroke.visible;
    clearStroke(had?reason:'');if(rebuild)updateObjects();updateStrokeControls();updateThermalControls();updatePlayback();state.dirty=true;
  }
  function startStroke(autoPlay=false){
    if(!strokeReady()||state.stroke.worker)return;setNote('return');const v=state.stroke,wasVisible=v.visible||state.thermal.visible;
    clearStroke('');v.status='正在建立等效传输线……';v.autoPlay=!!autoPlay;
    state.thermal.running=false;state.thermal.visible=false;state.thermal.last=0;
    if(wasVisible)updateObjects();updateThermalControls();updateStrokeControls();updatePlayback();state.dirty=true;
    try{
      if(!window.Worker)throw Error('当前浏览器不支持 Worker');
      const local=v.worker=new Worker('lightning-return-worker.js?v=20261031-30');
      local.onmessage=event=>{
        if(v.worker!==local)return;const msg=event.data||{};
        if(msg.kind==='return-progress'){
          v.status='后台求解 '+msg.frame+' / '+msg.total+' 帧 · '+msg.edges+' 线段 · Δt '+(msg.dt*1e9).toFixed(1)+' ns';updateStrokeControls();return;
        }
        if(msg.kind==='return-error'){
          local.terminate();v.worker=null;v.autoPlay=false;v.status='回击求解停止：'+msg.message;updateStrokeControls();updatePlayback();return;
        }
        if(msg.kind!=='return-result')return;
        const expected=(state.primary.segments.length/2-state.primary.seedSegmentCount)*msg.parts;
        if(msg.edges!==expected||msg.frames<2||!msg.mainIndices.length){local.terminate();v.worker=null;v.autoPlay=false;v.status='回击结果与当前通道不匹配，已丢弃。';updateStrokeControls();updatePlayback();return;}
        local.terminate();v.worker=null;const onMain=new Uint8Array(msg.edges);for(const edge of msg.mainIndices)onMain[edge]=1;const branches=[];for(let edge=0;edge<msg.edges;edge++)if(!onMain[edge])branches.push(edge);msg.branchIndices=Int32Array.from(branches);v.data=msg;v.frame=0;v.cursor=0;v.visible=true;selectStrokeProbe();
        v.status='已计算 '+msg.frames+' 帧 · '+msg.edges+' 线段 · Δt '+(msg.dt*1e9).toFixed(1)+' ns\n主通道 '+(msg.mainLength/1000).toFixed(2)+' km · 全树 '+(msg.totalLength/1000).toFixed(2)+' km；拖动时间可回放。';
        v.running=v.autoPlay&&!document.hidden;const hidePanel=v.running&&compact.matches;v.autoPlay=false;v.last=0;
        refreshStroke(true);if(hidePanel&&!$('control-panel').hidden)$('toggle-controls').click();
      };
      local.onerror=()=>{if(v.worker!==local)return;local.terminate();v.worker=null;v.autoPlay=false;v.status='回击 Worker 无法启动，请通过本地服务器打开并重试。';updateStrokeControls();updatePlayback();};
      local.postMessage({type:'compute',tree:state.primary,options:strokeOptions(),duration:v.duration*1e-6});updateStrokeControls();updatePlayback();
    }catch(error){if(v.worker){v.worker.terminate();v.worker=null;}v.autoPlay=false;v.status='回击求解无法启动：'+(error&&error.message||error);updateStrokeControls();updatePlayback();}
  }
  function showStrokeExample(){
    setNote('return');showContactExample();state.stroke.auto=true;state.stroke.autoPlay=true;state.stroke.status='正在预演接通，随后计算回击。';updateStrokeControls();
  }
  function studyOptions(){return {eta:state.eta,seed:state.seed,tolerance:state.tolerance,sourceXSlider:state.sourceX,sourceZSlider:state.sourceZ,targetXSlider:state.targetX,targetZSlider:state.targetZ,electrodeShape:state.electrodeShape,electrodeLength:state.electrodeLength,electrodeRadius:state.electrodeRadius};}
  function invalidateStudies(reason='模型参数已变化；请重新计算。'){
    const v=state.study;if(!v)return;const mode=v.mode,hadGrid=!!v.gridResult||mode==='grid',hadStats=!!v.statsResult||mode==='stats';
    if(v.worker){v.worker.terminate();v.worker=null;}v.mode='';v.gridResult=null;v.statsResult=null;
    if(hadGrid)v.gridStatus=reason;if(hadStats)v.statsStatus=reason;
    if(hadGrid||hadStats)$('study-announcement').textContent=reason;updateStudyControls();
  }
  function invalidateStudy(mode,reason){
    const v=state.study;if(!v)return;const active=v.mode===mode,key=mode==='grid'?'gridResult':'statsResult',status=mode==='grid'?'gridStatus':'statsStatus',had=!!v[key]||active;
    if(active&&v.worker){v.worker.terminate();v.worker=null;v.mode='';}v[key]=null;if(had){v[status]=reason;$('study-announcement').textContent=reason;}updateStudyControls();
  }
  function studyTable(out,headings,rows,footer){
    out.replaceChildren();const table=document.createElement('table'),head=document.createElement('tr');
    for(const text of headings){const th=document.createElement('th');th.scope='col';th.textContent=text;head.appendChild(th);}table.appendChild(head);
    for(const row of rows){const tr=document.createElement('tr');for(const text of row){const td=document.createElement('td');td.textContent=String(text);tr.appendChild(td);}table.appendChild(tr);}
    out.appendChild(table);const foot=document.createElement('div');foot.textContent=footer;out.appendChild(foot);
  }
  function updateStudyControls(){
    const v=state.study;if(!v)return;const running=!!v.worker;
    $('grid-study').disabled=running||!state.ready||state.failed;$('grid-cancel').disabled=!running||v.mode!=='grid';
    $('stats-run').disabled=$('stats-card-run').disabled=running||!state.ready||state.failed;$('stats-cancel').disabled=!running||v.mode!=='stats';$('stats-main-eta').textContent=state.eta.toFixed(1);
    stage.dataset.gridStudy=running&&v.mode==='grid'?'running':v.gridResult?'done':'idle';stage.dataset.statsStudy=running&&v.mode==='stats'?'running':v.statsResult?'done':'idle';
    const out=$('grid-results');if(!v.gridResult){out.textContent=v.gridStatus;}
    else{
      const data=v.gridResult,rows=[['尺寸',x=>x.nx+'×'+x.ny+'×'+x.nz],['实际事件',x=>x.steps+(x.complete?' · 接通':'')],['分叉节点',x=>String(x.junctions)],['生长通道长度',x=>x.length.toFixed(3)],['初态中心电势',x=>x.initial.potentialCenter.toFixed(4)],['初态最大候选场',x=>x.initial.maxField.toFixed(3)],['末态中心电势',x=>x.potentialCenter.toFixed(4)],['最大残差',x=>x.residual.toExponential(1)]];
      studyTable(out,['真实求解','网格 A','网格 B'],rows.map(([label,fn])=>[label,fn(data.results[0]),fn(data.results[1])]),'各自从初态计算；长度不含电极内部骨架。接触时电势取接触前最后一场。');
    }
    const target=$('stats-results');if(!v.statsResult){target.textContent=v.statsStatus;for(const k of ['statsSamples','statsContactsA','statsContactsB','statsCensoredA','statsCensoredB'])delete stage.dataset[k];return;}
    const data=v.statsResult,a=data.summary[0],b=data.summary[1],percent=x=>(100*x).toFixed(1)+'%',mean=x=>x.mean.toFixed(2)+' ± '+(x.sd===null?'—':x.sd.toFixed(2)),interval=x=>percent(x.interval[0])+'–'+percent(x.interval[1]);
    const rows=[['样本数',a.n,b.n],['预算内接通',a.contact+'/'+a.n+' ('+percent(a.rate)+')',b.contact+'/'+b.n+' ('+percent(b.rate)+')'],['未接通 / 截尾',a.censored,b.censored],['95% Wilson 区间',interval(a),interval(b)],['分叉数均值 ± SD',mean(a.junctions),mean(b.junctions)],['生长长度均值 ± SD',mean(a.length),mean(b.length)],['实际事件均值 ± SD',mean(a.steps),mean(b.steps)],['最大残差',a.maxResidual.toExponential(1),b.maxResidual.toExponential(1)]];
    const first=data.samples[0][0];studyTable(target,['真实样本','η '+data.etas[0].toFixed(1),'η '+data.etas[1].toFixed(1)],rows,'网格 '+first.nx+'×'+first.ny+'×'+first.nz+' · 种子从 '+first.seed+' 起 · 每个样本最多 '+data.budget+' 事件。长度单位为极板间距，不含电极。');
    stage.dataset.statsSamples=String(a.n);stage.dataset.statsContactsA=String(a.contact);stage.dataset.statsContactsB=String(b.contact);stage.dataset.statsCensoredA=String(a.censored);stage.dataset.statsCensoredB=String(b.censored);
  }
  function startStudy(mode,payload){
    const v=state.study;if(!state.ready||v.worker)return;
    if(mode==='grid'){v.gridResult=null;v.gridStatus='正在后台独立求解两组网格……';}else{v.statsResult=null;v.statsStatus='正在后台独立求解随机样本……';}
    try{
      const local=v.worker=new Worker('lightning-analysis-worker.js?v=20261031-30');v.mode=mode;
      local.onmessage=event=>{if(v.worker!==local)return;const m=event.data||{};if(m.mode!==mode)return;
        if(m.kind==='progress'){
          if(mode==='grid')v.gridStatus='网格 '+(m.index+1)+' / 2 · 真实事件 '+m.steps+' / '+m.total;
          else v.statsStatus='已完成 '+m.completed+' / '+m.total+' 个样本 · 当前事件 '+m.steps+' / '+m.budget;
          updateStudyControls();
        }else if(m.kind==='result'){
          if(mode==='grid'){v.gridResult=m;v.gridStatus='完成';}else{v.statsResult=m;v.statsStatus='完成';}
          local.terminate();v.worker=null;v.mode='';$('study-announcement').textContent=mode==='grid'?'网格对照计算完成。':'随机种子统计完成。';updateStudyControls();
        }else if(m.kind==='error'){
          if(mode==='grid')v.gridStatus='对照已停止：'+m.message;else v.statsStatus='统计已停止：'+m.message;
          local.terminate();v.worker=null;v.mode='';$('study-announcement').textContent='后台计算已停止：'+m.message;updateStudyControls();
        }
      };
      local.onerror=()=>{if(v.worker!==local)return;local.terminate();v.worker=null;v.mode='';if(mode==='grid')v.gridStatus='后台对照无法启动，请通过本地服务器打开。';else v.statsStatus='后台统计无法启动，请通过本地服务器打开。';$('study-announcement').textContent='后台计算无法启动。';updateStudyControls();};
      local.postMessage({...payload,type:mode,options:studyOptions()});updateStudyControls();
    }catch(error){v.worker=null;v.mode='';if(mode==='grid')v.gridStatus='后台对照无法启动：'+error.message;else v.statsStatus='后台统计无法启动：'+error.message;updateStudyControls();}
  }
  function runGridStudy(){
    const pair=$('grid-pair').value.split(':'),events=clamp(Math.floor(Number($('grid-events').value)||0),0,50);$('grid-events').value=String(events);startStudy('grid',{pair,events});
  }
  function runStatistics(){
    const raw=Number($('stats-eta').value),etaB=Math.round(clamp(Number.isFinite(raw)?raw:1,0,6)*10)/10,samples=clamp(Math.floor(Number($('stats-samples').value)||1),1,24),events=clamp(Math.floor(Number($('stats-events').value)||1),1,300),quality=$('stats-grid').value;
    $('stats-eta').value=etaB.toFixed(1);$('stats-samples').value=String(samples);$('stats-events').value=String(events);startStudy('stats',{etaB,samples,events,quality});
  }
  function clearEvent(reason='前后场已清除。'){
    const v=state.event;if(!v)return;const changed=!!(v.comparison||v.wanted||v.inFlight);v.comparison=null;v.view='current';v.wanted=false;v.accept=false;v.status=reason;
    if(changed){updateEventControls();if(state.primary)updateObjects();state.dirty=true;}
  }
  function pumpCapture(){
    const v=state.event;if(!v.wanted||!state.ready||state.busy||!worker||state.pendingEta!==null||!state.primary||Math.abs(state.primary.eta-state.eta)>1e-8)return;
    if(state.primary.stats.complete||state.primaryLimited){v.wanted=false;v.status='生长已停止，无法捕获下一事件。';updateEventControls();updatePlayback();return;}
    v.wanted=false;v.inFlight=true;v.accept=true;v.status='正在后台求解单次事件的前后场……';state.busy=true;
    worker.postMessage({type:'capture',generation:state.generation});updateEventControls();updatePlayback();
  }
  function requestCapture(){
    if(!state.ready||!state.primary||state.primary.stats.complete||state.primaryLimited||state.event.inFlight)return;
    setPlaying(false);state.pendingProbe=null;delete stage.dataset.probePending;clearEvent('');
    const v=state.event;v.wanted=true;v.accept=true;v.status=state.busy?'等待已提交的生长步完成……':'准备捕获下一事件……';
    updateEventControls();updatePlayback();pumpConfiguration();pumpCapture();
  }
  function eventProbe(){
    const v=state.event,c=v.comparison;if(!c)return null;const d=c.before;
    return E.sample(c,Math.round(v.x*(d.nx-1)/100),Math.round(v.y*(d.ny-1)/100),sliceIndex(d));
  }
  function updateEventControls(){
    const v=state.event;if(!v)return;const c=v.comparison,p=eventProbe();
    $('event-view').value=v.view;$('event-view').disabled=!c;$('event-x').disabled=$('event-y').disabled=!c;
    $('event-x').value=String(v.x);$('event-y').value=String(v.y);progress($('event-x'));progress($('event-y'));
    $('event-x-value').textContent=p?((p.x-(c.before.nx-1)/2)*c.before.h).toFixed(3):'—';$('event-y-value').textContent=p?(p.y*c.before.h).toFixed(3):'—';
    stage.dataset.event=v.wanted?'waiting':v.inFlight?'capturing':c?'ready':'off';
    const diffVisible=!!(c&&state.showSlice&&(v.view==='deltaPhi'||v.view==='deltaE'));$('event-legend').hidden=!diffVisible;
    if(!c){$('event-readout').textContent=v.status;$('event-scale').textContent='剖面 Z 使用下方「电场与精度」中的滑杆；场强只在事件前后均为空间的内部节点计算。';for(const k of ['eventBefore','eventAfter','eventProbe','eventDeltaPhi','eventDeltaE'])delete stage.dataset[k];return;}
    const prob=n=>n===null?'非候选':(n*100).toFixed(3)+'%',fmt=n=>Number(n).toFixed(5);
    let text='事件 '+c.before.stats.steps+' → '+c.after.stats.steps+' · 剖面节点 ('+p.x+', '+p.y+', '+p.z+')\n';
    text+=p.valid?'φ '+fmt(p.phiBefore)+' → '+fmt(p.phiAfter)+' · Δ '+fmt(p.deltaPhi)+'\n|E| '+fmt(p.fieldBefore)+' → '+fmt(p.fieldAfter)+' · Δ '+fmt(p.deltaE):'此处是边界或状态改变的单元；不显示场差。';
    text+='\n候选概率 '+prob(p.probBefore)+' → '+prob(p.probAfter);$('event-readout').textContent=text;
    const sliced=E.slice(c,v.view,p.z);$('event-legend-scale').textContent='±'+sliced.scale.toExponential(1);$('event-scale').textContent=(v.view==='deltaPhi'||v.view==='deltaE'?'当前剖面差值色阶 ±'+sliced.scale.toExponential(2)+'；暖色增加、冷色减少，非线性色阶增强微弱变化。':'前 / 后为该事件的真实求解。')+' 剖面 Z 在下方调节；仅比较前后均为空间的内部节点。';
    stage.dataset.eventBefore=String(c.before.stats.steps);stage.dataset.eventAfter=String(c.after.stats.steps);stage.dataset.eventProbe=String(p.id);
    if(p.valid){stage.dataset.eventDeltaPhi=String(p.deltaPhi);stage.dataset.eventDeltaE=String(p.deltaE);}else{delete stage.dataset.eventDeltaPhi;delete stage.dataset.eventDeltaE;}
  }
  function revealControl(id){
    if($('control-panel').hidden){if(compact.matches&&!$('knowledge-panel').hidden)$('toggle-knowledge').click();$('toggle-controls').click();}
    requestAnimationFrame(()=>$(id).scrollIntoView({block:'nearest',behavior:'auto'}));
  }
  function setNote(note){
    state.note=note;document.querySelectorAll('[data-note]').forEach(el=>{const active=el.dataset.note===note;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-note-content]').forEach(el=>{el.hidden=el.dataset.noteContent!==note;});
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function updateCanvasAccessibility(){
    const returning=!!(state.stroke.visible&&state.stroke.data);
    canvas.setAttribute('aria-label',state.tool==='orbit'?(returning?'三维回击传输线模型。':'三维电弧生长模型。')+'拖动旋转视角，滚轮缩放；方向键旋转，加减号缩放，空格播放或暂停。':
      state.tool==='probe'?'候选探针模式。点击候选节点或按 Enter 选择当前概率最大的节点；空格播放或暂停。':
      (state.tool==='source'?'负极':'正极')+'移动模式。点击或拖动针尖高度的水平面，方向键微调位置；松手后重新求解。');
  }
  function updateSpeedControls(){
    const speed=state.stroke.visible&&state.stroke.data?state.stroke.multiplier:state.speed;
    document.querySelectorAll('[data-speed]').forEach(el=>{const active=Number(el.dataset.speed)===speed;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
  }
  function updateControls(){
    const g=gridSize();
    for(const [id,value,digits] of [['eta',state.eta,1],['reference-eta',state.referenceEta,1],['camera-zoom',state.camera.zoom,2],['electrode-length',state.electrodeLength,2],['electrode-radius',state.electrodeRadius,3]]){
      $(id).value=String(value);$(id+'-value').textContent=Number(value).toFixed(digits)+(id==='camera-zoom'?'×':'');progress($(id));
    }
    for(const [id,key,n] of [['source-x','sourceX',g.nx],['source-z','sourceZ',g.nz],['target-x','targetX',g.nx],['target-z','targetZ',g.nz]]){
      $(id).value=String(state[key]);$(id+'-value').textContent=coordValue(state[key],n,g.ny).toFixed(2);progress($(id));
    }
    $('slice-z').value=String(state.slice);const z=clamp(Math.round((state.slice+100)*(g.nz-1)/200),0,g.nz-1);
    $('slice-z-value').textContent=((z-(g.nz-1)/2)/(g.ny-1)).toFixed(2);$('slice-z').disabled=!state.showSlice;progress($('slice-z'));
    $('random-seed').value=String(state.seed);$('grid-quality').value=state.quality;$('solver-accuracy').value=String(state.tolerance);$('electrode-shape').value=state.electrodeShape;
    const boundary=state.ready&&state.primary;$('electrode-cells').textContent=boundary?'实际边界：负极 '+boundary.sourceBody.length+' 个体素 / 正极 '+boundary.targetBody.length+' 个体素；伸入 '+(boundary.rodLength*boundary.h).toFixed(3)+'。粗网格可能无法分辨小幅改动。':'连续尺寸将吸附到网格；两侧同步修改，边界变化后重算。';
    $('show-candidates').checked=state.showCandidates;$('show-slice').checked=state.showSlice;
    document.querySelectorAll('button[data-appearance]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.appearance===state.appearance)));
    stage.dataset.appearance=state.appearance;$('appearance-caption').textContent=state.appearance==='glow'?'节点与分叉由模型计算 · 合成云与光效为表现':'仅显示计算节点之间的直线连接';
    $('growth-field-toggle').setAttribute('aria-pressed',String(state.showSlice));$('growth-field-toggle').innerHTML=(state.showSlice?'隐藏电势剖面':'显示电势剖面')+' <span aria-hidden="true">↗</span>';
    document.querySelectorAll('button[data-preset]').forEach(el=>{const active=el.dataset.preset===state.preset;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    $('preset-description').textContent=state.preset&&presets[state.preset]?presets[state.preset].description:'参数已自定义；修改电极、网格或种子会从第 0 步重算。';
    document.querySelectorAll('button[data-tool]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.tool===state.tool)));
    const instructions={orbit:'拖动空白处旋转模型，滚轮或下方滑块缩放。',source:'在负极针尖高度的水平面点击或拖动；松手后从初态重算。方向键可调整位置。',target:'在正极针尖高度的水平面点击或拖动；松手后从初态重算。方向键可调整位置。',probe:'点击或触摸候选点以测量；也可按 Enter 测量当前概率最大的节点。'};
    $('tool-description').textContent=instructions[state.tool];$('stage-instruction').textContent=state.tool==='orbit'?'↔ 拖动旋转 · 滚轮缩放':state.tool==='probe'?'点击候选点测量 · Enter 选择最强候选':'在针尖高度点击或拖动 · 松手后重算';
    canvas.classList.toggle('precise',state.tool!=='orbit');
    updateCanvasAccessibility();
    $('compare-toggle').setAttribute('aria-pressed',String(state.compare));$('compare-toggle').textContent=state.compare?'◉　关闭双电弧对照':'◉　开启双电弧对照';
    $('compare-card-action').innerHTML=(state.compare?'关闭双电弧对照':'开启双电弧对照')+' <span aria-hidden="true">↗</span>';
    $('primary-label-detail').textContent='η = '+state.eta.toFixed(1);$('reference-label-detail').textContent='η = '+state.referenceEta.toFixed(1);
    updateSpeedControls();
    stage.dataset.tool=state.tool;stage.dataset.compare=String(state.compare);stage.dataset.eta=String(state.eta);stage.dataset.showSlice=String(state.showSlice);stage.dataset.showCandidates=String(state.showCandidates);updateThermalControls();updateStrokeControls();updateStudyControls();updateEventControls();
  }
  function candidate(data,id){
    if(!data||id===null)return null;const at=data.candidateIds.indexOf(id);if(at<0)return null;
    const index=data.candidateIds[at],x=index%data.nx,j=(index-x)/data.nx,y=j%data.ny,z=(j-y)/data.ny;
    const faces=data.faceLinks[at],diagonals=data.diagonalLinks[at],faceField=data.drops[at]/data.h;
    return {index,x,y,z,phi:data.drops[at],faceField,diagonalField:faceField/Math.SQRT2,faces,diagonals,probability:data.probabilities[at]};
  }
  function updateTelemetry(){
    if(!state.primary)return;const p=state.primary,st=p.stats;
    const r=state.stroke,m=r.visible&&r.data?r.data:null;let labels,values;
    if(m){const e=m.mainIndices[r.probeSlot],k=r.frame*m.edges+e;labels=['回击时间','接地电流','探针电流','相对能量残差'];values=[(m.times[r.frame]*1e6).toFixed(2)+' μs',(m.metrics.groundCurrent[r.frame]/1000).toFixed(1)+' kA',(-m.currents[k]/1000).toFixed(1)+' kA',Math.abs(m.metrics.energyError[r.frame]/m.initialEnergy).toExponential(1)];}
    else{labels=['生长步数','候选节点','分叉节点','最大电势残差'];values=[String(st.steps),String(st.frontier),String(st.junctions),Number(st.residual).toExponential(1)];}
    for(let i=0;i<4;i++)$('metric-label-'+(i+1)).textContent=labels[i];
    for(const [id,value] of [['steps-readout',values[0]],['frontier-readout',values[1]],['junction-readout',values[2]],['residual-readout',values[3]]])$(id).textContent=value;
    $('card-growth').textContent=p.eta.toFixed(1)+' / '+st.frontier;
    $('card-accuracy').textContent=p.nx+'×'+p.ny+'×'+p.nz+' / '+Number(st.residual).toExponential(1);
    const pInfo=candidate(p,state.probeId);
    if(pInfo){
      $('probe-readout').textContent='网格 ('+pInfo.x+', '+pInfo.y+', '+pInfo.z+') · 当前实验 B';
      const etaPending=Math.abs(p.eta-state.eta)>1e-8;
      $('probe-potential').textContent=pInfo.phi.toFixed(4);
      $('probe-field').textContent=(pInfo.faces?pInfo.faceField.toFixed(3):'—')+' / '+(pInfo.diagonals?pInfo.diagonalField.toFixed(3):'—');
      $('probe-probability').textContent=(etaPending?'更新中':(100*pInfo.probability).toFixed(2)+'%')+' / '+pInfo.faces+'·'+pInfo.diagonals;
      stage.dataset.probeId=String(pInfo.index);stage.dataset.probeProbability=etaPending?'':String(pInfo.probability);stage.dataset.probeField=String(pInfo.faces?pInfo.faceField:pInfo.diagonalField);
    }else{
      $('probe-readout').textContent=state.probeNotice;$('probe-potential').textContent='—';$('probe-field').textContent='—';$('probe-probability').textContent='—';
      delete stage.dataset.probeId;delete stage.dataset.probeProbability;delete stage.dataset.probeField;
    }
    const a=state.reference?state.reference.stats:null;
    $('compare-a').textContent=a?a.steps+' / '+a.junctions+(a.complete?' · 已接触':''):'未开启';
    $('compare-b').textContent=st.steps+' / '+st.junctions+(st.complete?' · 已接触':'');
    $('compare-result').textContent=state.reference?'两侧使用相同种子，独立求场；'+(a.complete||st.complete?'先接触的一侧不再生长。':'目前分别在第 '+a.steps+' / '+st.steps+' 步。')+(state.etaHistoryChanged?' B 的 η 曾在生长中途改变；重置后才是全程单变量比较。':''):'开启对照后从第 0 步开始。概率不同会使相同随机数选中不同位置，路径和后续电场随之分开。';
    stage.dataset.steps=String(st.steps);stage.dataset.frontier=String(st.frontier);stage.dataset.residual=String(st.residual);stage.dataset.complete=String(st.complete);
    stage.dataset.referenceSteps=a?String(a.steps):'';stage.dataset.seed=String(p.seed);stage.dataset.solvedEta=String(p.eta);
  }
  function point(data,index){
    const x=index%data.nx,j=(index-x)/data.nx,y=j%data.ny,z=(j-y)/data.ny,u=HEIGHT/(data.ny-1);
    return vec((x-(data.nx-1)/2)*u,HEIGHT/2-y*u,(z-(data.nz-1)/2)*u);
  }
  function electrodePoint(data,which,preview=true){
    const n=which==='source'?data.sourceX:data.targetX,z=which==='source'?data.sourceZ:data.targetZ;
    let x=n,k=z;
    if(preview&&state.drag&&(state.drag.tool==='source'||state.drag.tool==='target')){
      x=coordFromSlider(state[which+'X'],data.nx);k=coordFromSlider(state[which+'Z'],data.nz);
    }
    const y=which==='source'?data.rodLength:data.ny-1-data.rodLength;
    return point(data,x+data.nx*(y+data.ny*k));
  }
  function project(p,offset=vec(0,0,0)){
    const b=basis(),q=add(p,offset),box=state.bounds;
    return {x:box.centerX+dot(q,b.right)*state.pixels,y:box.centerY-dot(q,b.up)*state.pixels,depth:dot(q,b.front)};
  }
  function bounds(){
    const box=stage.getBoundingClientRect(),hud=document.querySelector('.lab-bottom').getBoundingClientRect();
    let left=46,right=state.width-46,top=state.height<=540?52:98,bottom=state.height-30;
    const caption=stage.querySelector('.vortex-caption');
    if(state.width<=520&&state.height>400&&getComputedStyle(caption).display!=='none')top=Math.max(top,caption.getBoundingClientRect().bottom-box.top+10);
    if(!$('control-panel').hidden)left=Math.max(left,$('control-panel').getBoundingClientRect().right-box.left+14);
    if(!$('knowledge-panel').hidden)right=Math.min(right,$('knowledge-panel').getBoundingClientRect().left-box.left-14);
    const hudTop=hud.top-box.top;if(hud.width&&hudTop>top+55)bottom=Math.min(bottom,hudTop-18);
    const legend=stage.querySelector('.stage-bottom').getBoundingClientRect();if(legend.height&&legend.top-box.top>top+55)bottom=Math.min(bottom,legend.top-box.top-12);
    if(right-left<110){left=38;right=state.width-38;}
    if(bottom-top<70){top=48;bottom=Math.max(top+55,Math.min(state.height-40,hudTop-10));}
    return {left,right,top,bottom,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
  }
  function updateFraming(){
    if(!state.width||!state.height)return;
    const hud=document.querySelector('.lab-bottom').getBoundingClientRect(),hudTop=hud.top-stage.getBoundingClientRect().top;
    const safe=state.height-hudTop+12,legendMin=state.width<=360?174:150,panelMin=state.height<=540?12:state.width<=360?180:158;
    stage.style.setProperty('--vortex-legend-bottom',Math.ceil(Math.max(legendMin,safe))+'px');
    $('workbench').style.setProperty('--vortex-panel-bottom',Math.ceil(Math.min(state.height-130,Math.max(panelMin,safe)))+'px');
    const b=state.bounds=bounds(),basisNow=basis();
    state.layout=state.compare&&b.width/b.height<.90?'vertical':'horizontal';
    const dim=state.compare?(state.layout==='vertical'?{width:5.0,height:11.7}:{width:9.1,height:6.0}):{width:5.0,height:5.8};
    state.pixels=Math.max(1,Math.min(b.width*.92/dim.width,b.height*.90/dim.height))*state.camera.zoom;
    const axis=state.layout==='vertical'?basisNow.up:basisNow.right,spacing=state.layout==='vertical'?3.05:2.25;
    state.offsets.primary=state.compare?scale(axis,spacing):vec(0,0,0);state.offsets.reference=state.compare?scale(axis,-spacing):vec(0,0,0);
    if(camera){
      camera.left=-b.centerX/state.pixels;camera.right=(state.width-b.centerX)/state.pixels;
      camera.top=b.centerY/state.pixels;camera.bottom=-(state.height-b.centerY)/state.pixels;camera.near=.1;camera.far=100;
      camera.position.set(basisNow.front.x*20,basisNow.front.y*20,basisNow.front.z*20);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    }
    if(objects.primary)objects.primary.group.position.set(state.offsets.primary.x,state.offsets.primary.y,state.offsets.primary.z);
    if(objects.reference)objects.reference.group.position.set(state.offsets.reference.x,state.offsets.reference.y,state.offsets.reference.z);
    stage.dataset.layout=state.layout;state.dirty=true;
  }
  function resize(){
    const r=stage.getBoundingClientRect();if(!r.width||!r.height)return;
    state.width=r.width;state.height=r.height;const side=Math.max(r.width,r.height);
    state.dpr=Math.max(.25,Math.min(window.devicePixelRatio||1,1.5,1800/side));
    if(renderer){renderer.setPixelRatio(state.dpr);renderer.setSize(r.width,r.height,false);}
    else if(ctx){canvas.width=Math.round(r.width*state.dpr);canvas.height=Math.round(r.height*state.dpr);canvas.style.width='100%';canvas.style.height='100%';ctx.setTransform(state.dpr,0,0,state.dpr,0,0);}
    stage.dataset.renderScale=String(state.dpr);updateFraming();state.dirty=true;
  }
  function replaceCanvas(){const hadFocus=document.activeElement===canvas,next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;bindCanvas();updateControls();if(hadFocus)canvas.focus({preventScroll:true});}
  function useCanvas(reason,replace=true){
    if(renderer){try{renderer.dispose();}catch(_){}renderer=null;}scene=null;camera=null;objects={primary:null,reference:null};
    if(replace)replaceCanvas();ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw Error('WebGL 和 Canvas 2D 均不可用');
    state.renderer='canvas';stage.dataset.renderer='canvas';$('stage-fallback').hidden=false;$('stage-fallback').textContent=reason||'WebGL 不可用，已切换到相同数据的 Canvas 投影。';resize();state.dirty=true;
  }
  function setupRenderer(){
    try{
      if(!THREE||typeof THREE.WebGLRenderer!=='function')throw Error('未加载 WebGL');
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
      state.renderer='webgl';stage.dataset.renderer='webgl';$('stage-fallback').hidden=true;
    }catch(error){useCanvas('WebGL 不可用，已切换到相同电势和通道数据的 Canvas 投影。',true);}
  }
  function sprite(color,size){
    const c=document.createElement('canvas');c.width=64;c.height=64;const q=c.getContext('2d'),gradient=q.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba('+color+',0.55)');gradient.addColorStop(.22,'rgba('+color+',0.22)');gradient.addColorStop(1,'rgba('+color+',0)');
    q.fillStyle=gradient;q.fillRect(0,0,64,64);const texture=new THREE.CanvasTexture(c);
    const result=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));result.scale.set(size,size,1);return result;
  }
  function electrodeGeometry(data,which){
    const ids=which==='source'?data.sourceBody:data.targetBody,cx=which==='source'?data.sourceX:data.targetX,cz=which==='source'?data.sourceZ:data.targetZ,u=HEIGHT/(data.ny-1),set=new Set(ids),positions=[],colors=[];
    const faces=[[-1,0,0,[-1,-1,-1,-1,-1,1,-1,1,1,-1,1,-1],.68],[1,0,0,[1,-1,1,1,-1,-1,1,1,-1,1,1,1],.80],
      [0,1,0,[-1,-1,1,-1,-1,-1,1,-1,-1,1,-1,1],.62],[0,-1,0,[-1,1,-1,-1,1,1,1,1,1,1,1,-1],.96],
      [0,0,-1,[1,-1,-1,-1,-1,-1,-1,1,-1,1,1,-1],.72],[0,0,1,[-1,-1,1,1,-1,1,1,1,1,-1,1,1],.88]];
    for(const id of ids){const x=id%data.nx,j=(id-x)/data.nx,y=j%data.ny,z=(j-y)/data.ny;
      for(const [dx,dy,dz,v,shade] of faces){const xx=x+dx,yy=y+dy,zz=z+dz;if(xx>=0&&xx<data.nx&&yy>=0&&yy<data.ny&&zz>=0&&zz<data.nz&&set.has(xx+data.nx*(yy+data.ny*zz)))continue;
        for(const k of [0,1,2,0,2,3]){positions.push((x-cx+v[3*k]*.5)*u,HEIGHT/2-(y-v[3*k+1]*.5)*u,(z-cz+v[3*k+2]*.5)*u);colors.push(shade,shade,shade);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
  }
  function makeObject(data){
    const group=new THREE.Group(),u=HEIGHT/(data.ny-1),width=(data.nx-1)*u,depth=(data.nz-1)*u;
    const cage=[];
    const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width,HEIGHT,depth)),new THREE.LineBasicMaterial({color:0x71939e,transparent:true,opacity:.32,depthWrite:false}));group.add(outline);cage.push({object:outline,full:.32,soft:.11});
    for(const y of [-HEIGHT/2,HEIGHT/2]){
      const plate=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color:y>0?0x3b838c:0x9f714c,transparent:true,opacity:.06,depthWrite:false,side:THREE.DoubleSide}));
      plate.rotation.x=-Math.PI/2;plate.position.y=y;group.add(plate);cage.push({object:plate,full:.06,soft:.015});
      const grid=new THREE.GridHelper(width,8,y>0?0x72999a:0x9f8870,0x446168);grid.position.y=y;grid.material.transparent=true;grid.material.opacity=.22;grid.material.depthWrite=false;group.add(grid);cage.push({object:grid,full:.22,soft:.075});
    }
    const geometry=new THREE.CylinderGeometry(1,1,1,8,1,true),max=A.MAX_BONDS*A.DETAIL_PARTS;
    function lines(name,color,opacity,soft){
      // View-facing falloff makes the two additive sleeves softer than the old
      // hard-edged neon tubes. Width and brightness are presentation only.
      const material=soft?new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:opacity}},
        vertexShader:`varying float vFacing;varying vec3 vTint;void main(){vec4 p=instanceMatrix*vec4(position,1.0);vec3 n=normalize(normalMatrix*mat3(instanceMatrix)*normal);vFacing=abs(n.z);vTint=instanceColor;gl_Position=projectionMatrix*modelViewMatrix*p;}`,
        fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vFacing;varying vec3 vTint;void main(){gl_FragColor=vec4(uColor*vTint,uOpacity*pow(clamp(vFacing,0.0,1.0),2.4));}`,
        transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}):
        new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:false,blending:THREE.NormalBlending});
      const mesh=new THREE.InstancedMesh(geometry,material,max);mesh.name=name;mesh.count=0;mesh.renderOrder=soft?(name==='discharge-halo'?1:2):3;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.setColorAt(0,new THREE.Color(1,1,1));group.add(mesh);return mesh;
    }
    const halo=lines('discharge-halo',0x719cff,.055,true),glow=lines('discharge-glow',0x9fdcff,.25,true),core=lines('discharge-core',0xf0f9ff,.98,false);
    const neg=new THREE.Mesh(electrodeGeometry(data,'source'),new THREE.MeshBasicMaterial({color:0x94c6c8,transparent:true,vertexColors:true,side:THREE.DoubleSide}));neg.name='source-electrode-voxels';
    const pos=new THREE.Mesh(electrodeGeometry(data,'target'),new THREE.MeshBasicMaterial({color:0xd6a57b,transparent:true,vertexColors:true,side:THREE.DoubleSide}));pos.name='target-electrode-voxels';group.add(neg,pos);
    const negTip=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:0xc5f5f8,transparent:true}));
    const posTip=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:0xffd4a4,transparent:true}));group.add(negTip,posTip);
    const negGlow=sprite('91,219,255',.38),posGlow=sprite('255,172,103',.34);group.add(negGlow,posGlow);
    const fieldBytes=new Uint8Array(data.nx*data.ny*4),texture=new THREE.DataTexture(fieldBytes,data.nx,data.ny,THREE.RGBAFormat);
    texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
    const slice=new THREE.Mesh(new THREE.PlaneGeometry(width,HEIGHT),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.70,depthWrite:false,side:THREE.DoubleSide}));slice.visible=false;group.add(slice);
    const arrows=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xe2f6d9,transparent:true,opacity:.75,depthWrite:false}));arrows.visible=false;group.add(arrows);
    const candidates=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({size:.057,vertexColors:true,transparent:true,opacity:.90,depthWrite:false,depthTest:false}));candidates.frustumCulled=false;candidates.visible=false;group.add(candidates);
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),new THREE.MeshBasicMaterial({color:0xffdda3,depthTest:false}));marker.visible=false;group.add(marker);
    const markerGlow=sprite('255,216,151',.6);markerGlow.material.depthTest=false;markerGlow.visible=false;group.add(markerGlow);
    const eventMarker=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:0xffcf8f,depthTest:false}));eventMarker.name='event-field-probe';eventMarker.visible=false;group.add(eventMarker);
    const returnMarker=new THREE.Mesh(new THREE.SphereGeometry(.060,12,8),new THREE.MeshBasicMaterial({color:0xffd4a4,depthTest:false}));returnMarker.name='return-current-probe';returnMarker.visible=false;returnMarker.renderOrder=5;group.add(returnMarker);
    // Highlight only the latest *actual* accepted node; the flare is decorative.
    const newest=sprite('166,220,255',.22);newest.visible=false;group.add(newest);
    scene.add(group);return {group,cage,halo,glow,core,neg,pos,negTip,posTip,negGlow,posGlow,slice,texture,fieldBytes,arrows,candidates,marker,markerGlow,eventMarker,returnMarker,newest,unit:u};
  }
  function fieldColor(v){v=clamp(v,0,1);return [Math.round(25+190*v),Math.round(72+102*v),Math.round(92+24*v)];}
  function makeArrows(data){
    const z=sliceIndex(data),dx=Math.max(2,Math.round(data.nx/8)),dy=Math.max(2,Math.round(data.ny/11)),raw=[];let max=0;
    for(let y=2;y<data.ny-2;y+=dy)for(let x=2;x<data.nx-2;x+=dx){
      const i=x+data.nx*(y+data.ny*z);if(data.mask[i]!==M.EMPTY)continue;
      const ex=-(data.potential[i+1]-data.potential[i-1])/(2*data.h),ey=(data.potential[i+data.nx]-data.potential[i-data.nx])/(2*data.h);
      const mag=Math.hypot(ex,ey);if(mag<1e-8)continue;max=Math.max(max,mag);raw.push({i,ex,ey,mag});
    }
    const segments=[];
    for(const a of raw){
      if(a.mag<max*.02)continue;const p=point(data,a.i),vx=a.ex/a.mag,vy=a.ey/a.mag,len=.08+.20*Math.sqrt(a.mag/max);
      const tip=vec(p.x+vx*len,p.y+vy*len,p.z+.008),start=vec(p.x,p.y,p.z+.008),back=vec(tip.x-vx*.055,tip.y-vy*.055,tip.z);
      segments.push(start,tip,tip,vec(back.x-vy*.025,back.y+vx*.025,tip.z),tip,vec(back.x+vy*.025,back.y-vx*.025,tip.z));
    }
    return segments;
  }
  function updateFieldObject(obj,data,isPrimary){
    obj.slice.visible=state.showSlice;obj.arrows.visible=state.showSlice;if(!state.showSlice)return;
    const z=sliceIndex(data),rgba=obj.fieldBytes,ev=isPrimary&&state.event.comparison&&state.event.view!=='current'?state.event:null;
    if(ev){rgba.set(E.slice(ev.comparison,ev.view,z).bytes);obj.arrows.visible=false;obj.slice.material.opacity=.95;}
    else{
      obj.slice.material.opacity=.70;
      for(let row=0;row<data.ny;row++)for(let x=0;x<data.nx;x++){
        const y=data.ny-1-row,i=x+data.nx*(y+data.ny*z),color=fieldColor(data.potential[i]),k=4*(x+row*data.nx);
        rgba[k]=color[0];rgba[k+1]=color[1];rgba[k+2]=color[2];rgba[k+3]=104;
      }
      const lines=makeArrows(data),array=new Float32Array(lines.length*3);for(let i=0;i<lines.length;i++){array[i*3]=lines[i].x;array[i*3+1]=lines[i].y;array[i*3+2]=lines[i].z;}
      obj.arrows.geometry.setAttribute('position',new THREE.BufferAttribute(array,3));obj.arrows.geometry.computeBoundingSphere();
    }
    obj.texture.needsUpdate=true;obj.slice.position.z=(z-(data.nz-1)/2)*obj.unit;
  }
  function pathFor(data){
    let paths=pathCache.get(data);if(!paths){paths={};pathCache.set(data,paths);}
    const key=state.appearance+(state.stroke.visible&&state.stroke.data?'|return':'');
    return paths[key]||(paths[key]=A.makePath(data,state.appearance==='glow',HEIGHT,state.stroke.visible&&state.stroke.data?state.stroke.data.parts:undefined));
  }
  function thermalIntensity(model,edge){
    if(state.thermal.encoding==='current')return clamp(Math.abs(model.currents[edge])/3,0,1);
    if(state.thermal.encoding==='power')return clamp(model.power[edge]/model.lengths[edge]/5,0,1);
    return clamp((model.temperature[edge]-1)/4,0,1);
  }
  function thermalColor(x){x=clamp(x,0,1);return [.15+.85*Math.pow(x,.3),.12+.75*Math.pow(x,.6),.16+.55*x];}
  function paintPathColors(obj,data,isPrimary){
    if(!obj||!data)return;const path=pathFor(data),thermal=isPrimary&&state.thermal.visible?state.thermal.model:null,stroke=isPrimary&&state.stroke.visible?state.stroke.data:null,color=new THREE.Color();
    const scale=stroke?strokeScale(stroke,state.stroke.encoding).value:0;
    for(let j=0;j<path.radii.length;j++){
      const edge=path.edgeOffset+Math.floor(j/path.parts),sub=(edge-data.seedSegmentCount)*(stroke?stroke.parts:1)+(j%path.parts);
      const rgb=stroke?strokeColor(strokeIntensity(stroke,state.stroke.frame,sub,scale),state.stroke.encoding):thermal?thermalColor(thermalIntensity(thermal,edge)):[1,1,1];color.setRGB(rgb[0],rgb[1],rgb[2]);
      for(const mesh of [obj.halo,obj.glow,obj.core])mesh.setColorAt(j,color);
    }
    for(const mesh of [obj.halo,obj.glow,obj.core])if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
  function updateStrokeMarker(obj){
    if(!obj||!obj.returnMarker)return;const p=state.stroke.visible&&state.stroke.data&&!state.drag?strokeProbePosition():null;obj.returnMarker.visible=!!p;
    if(p)obj.returnMarker.position.set(p.x,p.y,p.z);
  }
  function updateElectrodes(obj,data){
    const a=electrodePoint(data,'source'),b=electrodePoint(data,'target');
    obj.neg.position.set(a.x,0,a.z);obj.pos.position.set(b.x,0,b.z);
    for(const el of [obj.negTip,obj.negGlow])el.position.set(a.x,a.y,a.z);for(const el of [obj.posTip,obj.posGlow])el.position.set(b.x,b.y,b.z);
  }
  function updateObject(obj,data,isPrimary){
    if(!obj||!data)return;updateElectrodes(obj,data);
    const hidePath=!!(state.drag&&(state.drag.tool==='source'||state.drag.tool==='target'));
    obj.halo.visible=obj.glow.visible=obj.core.visible=!hidePath;
    obj.slice.visible=obj.arrows.visible=state.showSlice&&!hidePath;
    const full=state.appearance==='grid'||state.showSlice||state.showCandidates||state.tool!=='orbit';
    for(const part of obj.cage)part.object.material.opacity=full?part.full:part.soft;
    for(const electrode of [obj.neg,obj.pos,obj.negTip,obj.posTip])electrode.material.opacity=full?.9:.42;
    obj.negGlow.material.opacity=obj.posGlow.material.opacity=full?.8:.3;
    const path=pathFor(data),positions=path.positions,segmentCount=path.radii.length;
    const dummy=new THREE.Object3D(),fromAxis=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
    for(let j=0;j<segmentCount;j++){
      const k=j*6,ax=positions[k],ay=positions[k+1],az=positions[k+2],bx=positions[k+3],by=positions[k+4],bz=positions[k+5];
      direction.set(bx-ax,by-ay,bz-az);const len=direction.length();if(len<1e-9)continue;
      dummy.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);dummy.quaternion.setFromUnitVectors(fromAxis,direction.normalize());
      const radius=path.radii[j];
      for(const [mesh,mul] of [[obj.halo,11],[obj.glow,4.2],[obj.core,1]]){dummy.scale.set(radius*mul,len*(state.appearance==='glow'?1.035:1),radius*mul);dummy.updateMatrix();mesh.setMatrixAt(j,dummy.matrix);}
    }
    for(const mesh of [obj.halo,obj.glow,obj.core]){mesh.count=segmentCount;mesh.instanceMatrix.needsUpdate=true;}
    paintPathColors(obj,data,isPrimary);if(isPrimary)updateStrokeMarker(obj);
    if(isPrimary)stage.dataset.renderSegments=String(segmentCount);
    if(!hidePath)updateFieldObject(obj,data,isPrimary);
    const ep=isPrimary&&state.showSlice&&state.event.view!=='current'&&!hidePath?eventProbe():null;obj.eventMarker.visible=!!ep;
    if(ep){const pos=point(data,ep.id);obj.eventMarker.position.set(pos.x,pos.y,pos.z+.015);}
    const etaPending=isPrimary&&Math.abs(data.eta-state.eta)>1e-8;
    const visibleCandidates=state.showCandidates&&!hidePath&&!data.stats.complete&&!etaPending;obj.candidates.visible=visibleCandidates;
    if(visibleCandidates){
      const n=data.candidateIds.length,positions=new Float32Array(n*3),colors=new Float32Array(n*3);let max=0;
      for(const value of data.probabilities)max=Math.max(max,value);
      for(let j=0;j<n;j++){
        const p=point(data,data.candidateIds[j]),v=max?Math.sqrt(data.probabilities[j]/max):0;positions[3*j]=p.x;positions[3*j+1]=p.y;positions[3*j+2]=p.z;
        colors[3*j]=.24+.65*v;colors[3*j+1]=.52+.44*v;colors[3*j+2]=.50+.43*v;
      }
      obj.candidates.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));obj.candidates.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    }
    const probe=isPrimary?candidate(data,state.probeId):null;obj.marker.visible=obj.markerGlow.visible=!!probe&&!hidePath;
    if(probe){const p=point(data,probe.index);obj.marker.position.set(p.x,p.y,p.z);obj.markerGlow.position.set(p.x,p.y,p.z);}
    obj.newest.visible=!!data.lastChoice&&!hidePath&&!(isPrimary&&state.stroke.visible&&state.stroke.data);
    if(obj.newest.visible){const p=point(data,data.lastChoice.site);obj.newest.position.set(p.x,p.y,p.z);}
  }
  function updateObjects(){
    if(state.renderer!=='webgl'||!state.primary||!scene)return;
    if(!objects.primary)objects.primary=makeObject(state.primary);updateObject(objects.primary,state.primary,true);
    if(state.reference){if(!objects.reference)objects.reference=makeObject(state.reference);objects.reference.group.visible=true;updateObject(objects.reference,state.reference,false);}
    else if(objects.reference)objects.reference.group.visible=false;
    updateFraming();
  }
  function placeLabels(){
    if(!state.reference){$('reference-label').hidden=true;$('primary-label').hidden=true;return;}
    for(const [id,which] of [['reference-label','reference'],['primary-label','primary']]){
      const c=project(vec(0,0,0),state.offsets[which]),el=$(id);el.style.left=c.x.toFixed(1)+'px';el.style.top=(c.y-2.90*state.pixels).toFixed(1)+'px';el.hidden=false;
    }
  }
  function drawWebGL(){
    updateFraming();renderer.setScissorTest(false);renderer.clear();renderer.render(scene,camera);placeLabels();
    if((renderer.info.programs||[]).some(p=>p.diagnostics&&p.diagnostics.runnable===false))throw Error('WebGL 着色器编译失败');
    if(renderer.getContext().isContextLost())throw Error('WebGL 上下文丢失');
  }
  function drawCanvas(){
    updateFraming();ctx.clearRect(0,0,state.width,state.height);
    function line(a,b,offset){const p=project(a,offset),q=project(b,offset);ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}
    function draw(data,which){
      if(!data)return;const offset=state.offsets[which],u=HEIGHT/(data.ny-1),w=(data.nx-1)*u/2,d=(data.nz-1)*u/2,h=HEIGHT/2;
      const corners=[vec(-w,-h,-d),vec(w,-h,-d),vec(w,-h,d),vec(-w,-h,d),vec(-w,h,-d),vec(w,h,-d),vec(w,h,d),vec(-w,h,d)];
      const full=state.appearance==='grid'||state.showSlice||state.showCandidates||state.tool!=='orbit';
      ctx.lineWidth=1;ctx.strokeStyle=full?'rgba(124,174,178,.34)':'rgba(124,174,178,.11)';ctx.beginPath();
      for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])line(corners[a],corners[b],offset);ctx.stroke();
      for(const yy of [-h,h]){
        ctx.beginPath();for(let j=-3;j<=3;j++){const t=j/4;line(vec(-w,yy,d*t),vec(w,yy,d*t),offset);line(vec(w*t,yy,-d),vec(w*t,yy,d),offset);}
        ctx.strokeStyle=full?'rgba(124,174,178,.18)':'rgba(124,174,178,.07)';ctx.stroke();
      }
      const hiding=!!(state.drag&&(state.drag.tool==='source'||state.drag.tool==='target'));
      if(state.showSlice&&!hiding){
        const z=sliceIndex(data),ev=which==='primary'&&state.event.comparison&&state.event.view!=='current'?state.event:null,bytes=ev?E.slice(ev.comparison,ev.view,z).bytes:null;ctx.globalAlpha=.32;
        for(let y=0;y<data.ny-1;y++)for(let x=0;x<data.nx-1;x++){
          const i=x+data.nx*(y+data.ny*z),j=i+data.nx,k=4*(x+(data.ny-1-y)*data.nx);
          if(bytes&&!bytes[k+3])continue;if(bytes)ctx.globalAlpha=.75*bytes[k+3]/255;const color=bytes?[bytes[k],bytes[k+1],bytes[k+2]]:fieldColor((data.potential[i]+data.potential[i+1]+data.potential[j]+data.potential[j+1])/4);
          const a=project(point(data,i),offset),b=project(point(data,i+1),offset),c=project(point(data,j+1),offset),e=project(point(data,j),offset);
          ctx.fillStyle='rgb('+color.join(',')+')';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(e.x,e.y);ctx.closePath();ctx.fill();
        }
        ctx.globalAlpha=1;if(!ev){ctx.strokeStyle='rgba(226,246,217,.78)';ctx.lineWidth=1;ctx.beginPath();const arrows=makeArrows(data);for(let j=0;j<arrows.length;j+=2)line(arrows[j],arrows[j+1],offset);ctx.stroke();}
        else{const ep=eventProbe();if(ep){const p=project(point(data,ep.id),offset);ctx.fillStyle='#ffcf8f';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();}}
      }
      if(!hiding){
        const path=pathFor(data),segments=path.positions,thermal=which==='primary'&&state.thermal.visible?state.thermal.model:null,stroke=which==='primary'&&state.stroke.visible?state.stroke.data:null;
        const colorScale=stroke?strokeScale(stroke,state.stroke.encoding).value:0;
        for(const pass of [{width:14,color:'rgba(103,150,255,.075)',blur:18,alpha:.075},{width:5,color:'rgba(149,211,255,.26)',blur:7,alpha:.26},{width:1.2,color:'rgba(244,250,255,.98)',blur:0,alpha:.98}]){
          ctx.lineWidth=pass.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowBlur=pass.blur;
          for(let bin=0;bin<(thermal||stroke?8:1);bin++){
            const rgb=stroke?strokeColor(bin/7,state.stroke.encoding):thermal?thermalColor(bin/7):null;ctx.strokeStyle=rgb?'rgba('+rgb.map(x=>Math.round(x*255)).join(',')+','+pass.alpha+')':pass.color;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();
            for(let j=0;j<segments.length;j+=6){const piece=j/6,edge=path.edgeOffset+Math.floor(piece/path.parts),sub=(edge-data.seedSegmentCount)*(stroke?stroke.parts:1)+(piece%path.parts),intensity=stroke?strokeIntensity(stroke,state.stroke.frame,sub,colorScale):thermal?thermalIntensity(thermal,edge):0,v=clamp(Math.round(intensity*7),0,7);if(v!==bin)continue;line(vec(segments[j],segments[j+1],segments[j+2]),vec(segments[j+3],segments[j+4],segments[j+5]),offset);}ctx.stroke();
          }
          ctx.shadowBlur=0;
        }
        if(stroke){const p=strokeProbePosition();if(p){const b=project(p,offset);ctx.fillStyle='#ffd4a4';ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();}}
      }
      if(!hiding&&data.lastChoice&&!(which==='primary'&&state.stroke.visible&&state.stroke.data)){
        const tip=project(point(data,data.lastChoice.site),offset);
        ctx.fillStyle='#d9ffff';ctx.shadowColor='#7ae6ff';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(tip.x,tip.y,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      }
      for(const whichElectrode of ['source','target']){
        const p=electrodePoint(data,whichElectrode),original=electrodePoint(data,whichElectrode,false),b=project(p,offset),ids=whichElectrode==='source'?data.sourceBody:data.targetBody;
        ctx.globalAlpha=full?.85:.42;ctx.fillStyle=whichElectrode==='source'?'#a3d2d4':'#edb987';
        const cells=Array.from(ids,id=>{const cell=point(data,id);cell.x+=p.x-original.x;cell.z+=p.z-original.z;return project(cell,offset);}).sort((a,b)=>a.depth-b.depth);
        const size=Math.max(1,u*state.pixels*.9);for(const cell of cells)ctx.fillRect(cell.x-size/2,cell.y-size/2,size,size);
        ctx.fillStyle=whichElectrode==='source'?'#d9ffff':'#ffdcaf';ctx.shadowColor=whichElectrode==='source'?'#6bdfff':'#ffb273';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(b.x,b.y,2.5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
      }
      if(state.showCandidates&&!hiding&&!data.stats.complete&&(which!=='primary'||Math.abs(data.eta-state.eta)<1e-8)){
        let max=0;for(const v of data.probabilities)max=Math.max(max,v);
        for(let i=0;i<data.candidateIds.length;i++){
          const p=project(point(data,data.candidateIds[i]),offset),v=max?Math.sqrt(data.probabilities[i]/max):0;
          ctx.fillStyle='rgba('+Math.round(80+160*v)+','+Math.round(145+100*v)+','+Math.round(145+100*v)+',.85)';ctx.beginPath();ctx.arc(p.x,p.y,1.5+v,0,Math.PI*2);ctx.fill();
        }
      }
      const selected=which==='primary'?candidate(data,state.probeId):null;
      if(selected&&!hiding){const p=project(point(data,selected.index),offset);ctx.strokeStyle='#ffdda3';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();}
    }
    draw(state.reference,'reference');draw(state.primary,'primary');placeLabels();
  }
  function draw(){
    if(!state.width||!state.height||!state.primary)return;
    try{if(state.renderer==='webgl')drawWebGL();else drawCanvas();}
    catch(error){
      if(state.renderer==='webgl'){
        try{useCanvas('WebGL 渲染中断，已切换到相同电势和路径的 Canvas 投影。',true);drawCanvas();}
        catch(e){fail('无法绘制实验：'+(e.message||e));return;}
      }else{fail('无法绘制实验：'+(error.message||error));return;}
    }
    stage.dataset.drawWidth=String(state.width);stage.dataset.drawHeight=String(state.height);stage.dataset.drawSegments=String(state.primary.segments.length/2-state.primary.seedSegmentCount);stage.dataset.renderSegments=String(pathFor(state.primary).radii.length);
    state.dirty=false;
  }
  function animate(now){
    if(state.playing&&state.ready&&!state.failed){
      if(!state.lastFrame)state.lastFrame=now;
      const dt=Math.min(.12,Math.max(0,(now-state.lastFrame)/1000));state.lastFrame=now;
      state.accumulator=Math.min(5,state.accumulator+dt*16*state.speed);
      if(!state.busy&&state.pendingEta!==null)pumpConfiguration();
      else if(!state.busy&&state.accumulator>=1){const n=Math.min(5,Math.floor(state.accumulator));state.accumulator-=n;sendSteps(n);}
    }else state.lastFrame=0;
    const th=state.thermal;
    if(th.running&&th.model&&!document.hidden){
      if(!th.last)th.last=now;th.accumulator=Math.min(.2,th.accumulator+Math.min(.12,Math.max(0,(now-th.last)/1000)));th.last=now;let changed=false;
      while(th.accumulator>=.04){th.accumulator-=.04;const result=th.model.step(.04);changed=true;if(!result.ok){th.running=false;notice(result.reason);break;}}
      if(changed)refreshThermal();
    }else th.last=0;
    const rs=state.stroke;
    if(rs.running&&rs.visible&&rs.data&&!document.hidden){
      if(!rs.last)rs.last=now;const elapsed=Math.min(.12,Math.max(0,(now-rs.last)/1000));rs.last=now;
      const frameMicros=(rs.data.times[1]-rs.data.times[0])*1e6;rs.cursor=Math.min(rs.data.frames-1,rs.cursor+elapsed*rs.rate*rs.multiplier/frameMicros);
      const frame=Math.min(rs.data.frames-1,Math.floor(rs.cursor));let changed=frame!==rs.frame;rs.frame=frame;
      if(rs.frame>=rs.data.frames-1){rs.running=false;rs.last=0;changed=true;}
      if(changed)refreshStroke();
    }else rs.last=0;
    if(state.dirty)draw();requestAnimationFrame(animate);
  }
  function markCustom(){state.preset='';}
  function setTool(tool,fromPanel=false){
    state.tool=tool;
    if(tool!=='probe'&&state.pendingProbe){state.pendingProbe=null;delete stage.dataset.probePending;state.probeNotice='探测已取消。';updateTelemetry();}
    if(tool==='probe')state.showCandidates=true;
    if((tool==='source'||tool==='target')&&Math.abs(state.camera.pitch)<.22)state.camera.pitch=.30;
    if(fromPanel&&compact.matches){
      if(!$('control-panel').hidden)$('toggle-controls').click();
      if(!$('knowledge-panel').hidden)$('toggle-knowledge').click();
      requestAnimationFrame(()=>canvas.focus({preventScroll:true}));
    }
    updateControls();updateObjects();updateFraming();state.dirty=true;
  }
  function completeProbe(request){
    if(!state.primary)return;
    if(!state.primary.candidateIds.length){
      state.probeId=null;state.probeNotice='电弧已停止，没有可探测的候选节点。';updateTelemetry();updateObjects();state.dirty=true;return;
    }
    let best=0;
    if(request.mode==='strongest'){
      for(let i=1;i<state.primary.probabilities.length;i++)if(state.primary.probabilities[i]>state.primary.probabilities[best])best=i;
    }else{
      const box=stage.getBoundingClientRect(),x=request.clientX-box.left,y=request.clientY-box.top,offset=state.offsets.primary;let distance=23*23;best=-1;
      for(let i=0;i<state.primary.candidateIds.length;i++){
        const p=project(point(state.primary,state.primary.candidateIds[i]),offset),d=(p.x-x)**2+(p.y-y)**2;if(d<distance){distance=d;best=i;}
      }
    }
    if(best<0){state.probeId=null;state.probeNotice='未选中候选点；请点亮点，或使用「概率最大的候选位置」。';}
    else{state.probeId=state.primary.candidateIds[best];state.probeNotice='';}
    notice('');setNote('probe');updateTelemetry();updateObjects();state.dirty=true;
  }
  function requestProbe(request){
    if(!state.ready||!state.primary||!state.primary.candidateIds.length)return;
    setPlaying(false);
    if(state.busy||Math.abs(state.primary.eta-state.eta)>1e-8){
      // A submitted batch cannot be undone. Wait for that exact frame and
      // any queued η configuration, then measure its current candidates.
      state.pendingProbe=request;stage.dataset.probePending='true';state.probeId=null;
      state.probeNotice='正在等待已提交的生长步与概率更新。';notice('已暂停，正在完成已提交的生长步后探测。');
      setNote('probe');updateTelemetry();updateObjects();state.dirty=true;return;
    }
    completeProbe(request);
  }
  function pickStrongest(fromPanel=false){
    if(!state.ready||!state.primary||!state.primary.candidateIds.length)return;
    setTool('probe',fromPanel);requestProbe({mode:'strongest'});
  }
  function pickAt(event){requestProbe({mode:'position',clientX:event.clientX,clientY:event.clientY});}
  function moveElectrode(event,tool){
    if(!state.primary||!state.bounds)return false;
    const rect=stage.getBoundingClientRect(),b=basis(),offset=state.offsets.primary;
    const x=(event.clientX-rect.left-state.bounds.centerX)/state.pixels-dot(offset,b.right);
    const y=(state.bounds.centerY-(event.clientY-rect.top))/state.pixels-dot(offset,b.up);
    if(Math.abs(b.front.y)<.15)return false;
    // Invert through the horizontal plane of the *tip*, so grabbing an
    // existing needle does not jump by a rod-length projection on pointerdown.
    const base=add(scale(b.right,x),scale(b.up,y)),height=electrodePoint(state.primary,tool,false).y;
    const target=add(base,scale(b.front,(height-base.y)/b.front.y)),g=state.primary,u=HEIGHT/(g.ny-1);
    const margin=electrodeMargin(),ix=clamp(Math.round(target.x/u+(g.nx-1)/2),margin,g.nx-1-margin),iz=clamp(Math.round(target.z/u+(g.nz-1)/2),margin,g.nz-1-margin);
    const xkey=tool+'X',zkey=tool+'Z',sx=sliderFromCoord(ix,g.nx),sz=sliderFromCoord(iz,g.nz);
    const changed=coordFromSlider(state[xkey],g.nx)!==ix||coordFromSlider(state[zkey],g.nz)!==iz;
    state[xkey]=sx;state[zkey]=sz;
    if(changed){if(!state.drag.changed){invalidateStudies('电极已移动；后台结果已清除。');clearEvent('电极已移动；前后场已清除。');clearThermal();clearStroke('电极已移动，回击数据已清除。');}markCustom();state.drag.changed=true;updateControls();notice('正在移动电极；旧通道隐藏，松手后重算电势。');
      for(const [obj,data] of [[objects.primary,state.primary],[objects.reference,state.reference]])if(obj&&data){updateElectrodes(obj,data);obj.halo.visible=obj.glow.visible=obj.core.visible=false;obj.slice.visible=obj.arrows.visible=obj.candidates.visible=obj.marker.visible=obj.markerGlow.visible=obj.eventMarker.visible=obj.returnMarker.visible=obj.newest.visible=false;}
      state.dirty=true;
    }
    return changed;
  }
  function bindCanvas(){
    if(canvasBindings.has(canvas))return;canvasBindings.add(canvas);
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();if(state.renderer==='webgl')try{useCanvas('WebGL 上下文丢失，已切换到相同数据的 Canvas 投影。',true);}catch(e){fail('图形上下文丢失且 Canvas 不可用。');}
    });
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||!state.ready||state.failed)return;
      if(state.tool==='probe'){pickAt(event);event.preventDefault();return;}
      if(state.drag)return;canvas.setPointerCapture(event.pointerId);
      if(state.tool==='source'||state.tool==='target'){
        state.drag={tool:state.tool,pointer:event.pointerId,wasPlaying:state.playing,changed:false,oldX:state[state.tool+'X'],oldZ:state[state.tool+'Z']};
        state.playing=false;updatePlayback();moveElectrode(event,state.tool);
      }else state.drag={tool:'orbit',pointer:event.pointerId,x:event.clientX,y:event.clientY,yaw:state.camera.yaw,pitch:state.camera.pitch};
      event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
      if(!state.drag||event.pointerId!==state.drag.pointer)return;
      if(state.drag.tool==='orbit'){
        state.camera.yaw=state.drag.yaw-(event.clientX-state.drag.x)*.007;state.camera.pitch=clamp(state.drag.pitch+(event.clientY-state.drag.y)*.007,-1.20,1.20);
        updateFraming();state.dirty=true;
      }else moveElectrode(event,state.drag.tool);
      event.preventDefault();
    });
    function finish(event,cancel){
      if(!state.drag||event.pointerId!==state.drag.pointer)return;const drag=state.drag;state.drag=null;
      if(drag.tool==='source'||drag.tool==='target'){
        if(cancel){state[drag.tool+'X']=drag.oldX;state[drag.tool+'Z']=drag.oldZ;state.playing=drag.wasPlaying;notice('');updateControls();updateObjects();updatePlayback();state.dirty=true;}
        else if(drag.changed){state.playing=drag.wasPlaying;requestReset(0);}
        else{state.playing=drag.wasPlaying;notice('');updateObjects();updatePlayback();state.dirty=true;}
      }
      try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch(_){}
    }
    canvas.addEventListener('pointerup',event=>finish(event,false));canvas.addEventListener('pointercancel',event=>finish(event,true));
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.camera.zoom=clamp(state.camera.zoom*Math.exp(-event.deltaY*.001),.55,1.65);updateControls();updateFraming();},{passive:false});
    canvas.addEventListener('dblclick',event=>{if(state.tool==='orbit'){event.preventDefault();resetView();}});
    canvas.addEventListener('keydown',event=>{
      if(event.key===' '){event.preventDefault();if(state.stroke.visible&&state.stroke.data)$('return-play').click();else setPlaying(!state.playing);return;}
      if(event.key==='Enter'&&state.tool==='probe'){event.preventDefault();pickStrongest(false);return;}
      if(event.key==='+'||event.key==='='){state.camera.zoom=clamp(state.camera.zoom*1.1,.55,1.65);event.preventDefault();updateControls();updateFraming();return;}
      if(event.key==='-'||event.key==='_'){state.camera.zoom=clamp(state.camera.zoom/1.1,.55,1.65);event.preventDefault();updateControls();updateFraming();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
      if(state.tool==='source'||state.tool==='target'){
        const g=gridSize(),key=state.tool+((event.key==='ArrowLeft'||event.key==='ArrowRight')?'X':'Z'),n=key.endsWith('X')?g.nx:g.nz;
        const delta=(event.key==='ArrowLeft'||event.key==='ArrowUp')?-1:1,margin=electrodeMargin(),cell=clamp(coordFromSlider(state[key],n)+delta,margin,n-1-margin);
        state[key]=sliderFromCoord(cell,n);markCustom();updateControls();queueReset();
      }else{
        if(event.key==='ArrowLeft')state.camera.yaw-=.1;if(event.key==='ArrowRight')state.camera.yaw+=.1;
        if(event.key==='ArrowUp')state.camera.pitch=clamp(state.camera.pitch+.1,-1.2,1.2);if(event.key==='ArrowDown')state.camera.pitch=clamp(state.camera.pitch-.1,-1.2,1.2);
        updateFraming();
      }
    });
  }
  function resetView(){state.camera={yaw:.42,pitch:.26,zoom:1};updateControls();updateFraming();state.dirty=true;}
  function saveImage(){
    if(!state.ready)return;try{
      if(state.dirty)draw();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const q=out.getContext('2d');
      if(state.appearance==='glow'&&storm.complete&&storm.naturalWidth){
        const factor=Math.max(out.width/storm.naturalWidth,out.height/storm.naturalHeight),w=storm.naturalWidth*factor,h=storm.naturalHeight*factor;
        q.drawImage(storm,(out.width-w)/2,(out.height-h)/2,w,h);const shade=q.createLinearGradient(0,0,0,out.height);
        shade.addColorStop(0,'rgba(4,12,20,.50)');shade.addColorStop(1,'rgba(4,12,20,.56)');q.fillStyle=shade;q.fillRect(0,0,out.width,out.height);
      }else{const gradient=q.createRadialGradient(out.width*.5,out.height*.43,0,out.width*.5,out.height*.43,Math.max(out.width,out.height)*.68);
        gradient.addColorStop(0,'#19353e');gradient.addColorStop(.55,'#0d222b');gradient.addColorStop(1,'#071319');q.fillStyle=gradient;q.fillRect(0,0,out.width,out.height);}
      q.drawImage(canvas,0,0);q.font=Math.max(12,Math.round(out.width/100))+'px sans-serif';q.textBaseline='bottom';
      q.fillStyle='rgba(0,8,15,.72)';q.fillRect(0,out.height-34,out.width,34);q.fillStyle='#e2edf3';
      let label='DBM 模拟 · 非真实雷电；合成云及辉光为视觉表现';
      if(state.stroke.visible&&state.stroke.data){const name={current:'电流',power:'功率',heat:'累计热'}[state.stroke.encoding];label='DBM + 回击 RLC 示例 · '+name+'色阶 · t '+(state.stroke.data.times[state.stroke.frame]*1e6).toFixed(2)+' μs；非真实光谱';}
      else if(state.thermal.visible&&state.thermal.model){const name={temperature:'温度',current:'电流',power:'单位长度功率'}[state.thermal.encoding];label='DBM + 简化电热 · '+name+'色阶；非真实雷电，云与光晕为表现';}
      else if(state.event.comparison&&state.showSlice&&state.event.view!=='current'){const name={before:'事件前电势',after:'事件后电势',deltaPhi:'Δφ',deltaE:'Δ|E|'}[state.event.view],slice=E.slice(state.event.comparison,state.event.view,sliceIndex(state.primary));label='DBM 单事件 '+name+((state.event.view==='deltaPhi'||state.event.view==='deltaE')?' · 剖面色阶 ±'+slice.scale.toExponential(2):'')+'；非真实雷电';}
      q.fillText(label,12,out.height-10,out.width-24);
      const a=document.createElement('a');a.download='lightning-growth.png';a.href=out.toDataURL('image/png');a.click();
    }catch(error){notice('截图无法保存：'+(error&&error.message||error));}
  }
  function bind(){
    document.querySelectorAll('button[data-preset]').forEach(button=>button.addEventListener('click',()=>{
      const p=presets[button.dataset.preset];if(!p)return;
      state.preset=button.dataset.preset;state.eta=p.eta;state.seed=p.seed;state.sourceX=p.sourceX;state.sourceZ=p.sourceZ;state.targetX=p.targetX;state.targetZ=p.targetZ;
      state.compare=false;state.probeId=null;requestReset(p.warm);
    }));
    document.querySelectorAll('button[data-tool]').forEach(button=>button.addEventListener('click',()=>setTool(button.dataset.tool,true)));
    $('event-capture').addEventListener('click',requestCapture);$('event-card-capture').addEventListener('click',()=>{revealControl('event-capture');requestCapture();});
    $('event-view').addEventListener('change',event=>{state.event.view=event.target.value;if(state.event.comparison&&state.event.view!=='current')state.showSlice=true;updateControls();updateObjects();state.dirty=true;});
    for(const [id,key] of [['event-x','x'],['event-y','y']])$(id).addEventListener('input',event=>{state.event[key]=Number(event.target.value);updateEventControls();updateObjects();state.dirty=true;});
    $('grid-study').addEventListener('click',runGridStudy);$('grid-cancel').addEventListener('click',()=>invalidateStudy('grid','网格对照已取消。'));
    $('stats-run').addEventListener('click',runStatistics);$('stats-card-run').addEventListener('click',()=>{revealControl('stats-run');runStatistics();});$('stats-cancel').addEventListener('click',()=>invalidateStudy('stats','随机种子统计已取消；未完成样本不计入结果。'));
    $('stats-grid').addEventListener('change',()=>invalidateStudy('stats','统计设置已变化；请重新计算。'));
    for(const id of ['stats-eta','stats-samples','stats-events'])$(id).addEventListener('input',()=>invalidateStudy('stats','统计设置已变化；请重新计算。'));
    $('grid-pair').addEventListener('change',()=>invalidateStudy('grid','对照设置已变化；请重新计算。'));$('grid-events').addEventListener('input',()=>invalidateStudy('grid','对照设置已变化；请重新计算。'));
    $('return-example').addEventListener('click',showStrokeExample);$('return-card-example').addEventListener('click',()=>{revealControl('return-example');showStrokeExample();});
    for(const [id,key] of [['return-height','height'],['return-voltage','voltage'],['return-resistance','resistance'],['return-inductance','inductance'],['return-capacitance','capacitance'],['return-ground','ground']])$(id).addEventListener('input',event=>{state.stroke[key]=Number(event.target.value);invalidateStroke('回击参数已变化，请重新计算。');});
    $('return-duration').addEventListener('change',event=>{state.stroke.duration=Number(event.target.value);invalidateStroke('回击时长已变化，请重新计算。');});
    $('return-compute').addEventListener('click',()=>startStroke(false));$('return-cancel').addEventListener('click',()=>invalidateStroke('回击后台计算已取消。'));
    $('return-encoding').addEventListener('change',event=>{state.stroke.encoding=event.target.value;refreshStroke();});
    $('return-rate').addEventListener('change',event=>{state.stroke.rate=Number(event.target.value);state.stroke.last=0;updateStrokeControls();});
    $('return-probe').addEventListener('input',event=>{state.stroke.probe=Number(event.target.value);selectStrokeProbe();refreshStroke();});
    function activateStroke(){
      const v=state.stroke,rebuild=!v.visible;v.visible=true;state.thermal.visible=false;state.thermal.running=false;state.thermal.last=0;return rebuild;
    }
    $('return-time').addEventListener('input',event=>{const v=state.stroke;if(!v.data)return;const rebuild=activateStroke();v.running=false;v.last=0;v.cursor=v.frame=clamp(Number(event.target.value),0,v.data.frames-1);refreshStroke(rebuild);});
    $('return-play').addEventListener('click',()=>{const v=state.stroke;if(!v.data)return;const rebuild=activateStroke();if(v.frame>=v.data.frames-1)v.cursor=v.frame=0;v.running=!v.running;v.last=0;refreshStroke(rebuild);});
    $('return-step').addEventListener('click',()=>{const v=state.stroke;if(!v.data||v.running)return;const rebuild=activateStroke();v.frame=Math.min(v.data.frames-1,v.frame+1);v.cursor=v.frame;v.last=0;refreshStroke(rebuild);});
    $('return-reset').addEventListener('click',()=>{const v=state.stroke;if(!v.data)return;const rebuild=activateStroke();v.running=false;v.cursor=v.frame=0;v.last=0;refreshStroke(rebuild);});
    $('return-view').addEventListener('click',()=>{const v=state.stroke;if(!v.data)return;if(v.visible){v.visible=false;v.running=false;v.last=0;}else activateStroke();refreshStroke(true);});
    $('thermal-example').addEventListener('click',showContactExample);$('thermal-card-example').addEventListener('click',()=>{revealControl('thermal-example');showContactExample();});
    for(const [id,key] of [['thermal-voltage','voltage'],['thermal-cooling','cooling']])$(id).addEventListener('input',event=>{
      const v=state.thermal;v[key]=Number(event.target.value);if(v.model)v.model.setParameters({voltage:v.voltage,cooling:v.cooling});refreshThermal();
    });
    $('thermal-encoding').addEventListener('change',event=>{state.thermal.encoding=event.target.value;refreshThermal();});
    $('thermal-play').addEventListener('click',()=>{if(!initThermal())return;const v=state.thermal;v.running=!v.running;v.last=0;v.accumulator=0;refreshThermal();});
    $('thermal-step').addEventListener('click',()=>{if(!initThermal())return;const v=state.thermal;v.running=false;const result=v.model.step(.04);if(!result.ok)notice(result.reason);refreshThermal();});
    $('thermal-reset').addEventListener('click',()=>{clearThermal();if(initThermal())refreshThermal();});
    $('thermal-view').addEventListener('click',()=>{const v=state.thermal;if(!v.model)return;const change=!v.visible&&state.stroke.visible;if(change){state.stroke.visible=false;state.stroke.running=false;state.stroke.last=0;}v.visible=!v.visible;if(change){updateObjects();updateStrokeControls();updatePlayback();}refreshThermal();});

    document.querySelectorAll('button[data-appearance]').forEach(button=>button.addEventListener('click',()=>{state.appearance=button.dataset.appearance;updateControls();updateObjects();state.dirty=true;}));
    $('eta').addEventListener('input',event=>{
      const next=Number(event.target.value);
      if(state.ready&&state.primary&&(state.primary.stats.steps>0||state.busy)&&Math.abs(next-state.eta)>1e-8)state.etaHistoryChanged=true;
      if(Math.abs(next-state.eta)>1e-8){invalidateStudies();clearEvent('η 已变化；请重新捕获事件。');}state.eta=next;markCustom();state.pendingEta=state.eta;updateControls();
      if(state.primary&&Math.abs(state.primary.eta-state.eta)>1e-8)notice('η 正在后台应用；已提交的生长步完成后更新概率。');
      updateTelemetry();updateObjects();updatePlayback();pumpConfiguration();
    });
    $('reference-eta').addEventListener('input',event=>{
      state.referenceEta=Number(event.target.value);updateControls();if(state.compare)queueReset();
    });
    for(const [id,key] of [['source-x','sourceX'],['source-z','sourceZ'],['target-x','targetX'],['target-z','targetZ']])$(id).addEventListener('input',event=>{
      state[key]=Number(event.target.value);markCustom();updateControls();queueReset();
    });
    $('random-seed').addEventListener('change',event=>{
      const n=Number(event.target.value);state.seed=Number.isFinite(n)?clamp(Math.round(n),1,4294967295):1;markCustom();updateControls();queueReset();
    });
    $('new-seed').addEventListener('click',()=>{
      let n=0;try{const a=new Uint32Array(1);crypto.getRandomValues(a);n=a[0];}catch(_){n=Math.floor(Math.random()*4294967295);}
      state.seed=n||1;markCustom();updateControls();queueReset();
    });
    $('electrode-shape').addEventListener('change',event=>{state.electrodeShape=event.target.value==='blunt'?'blunt':'needle';markCustom();updateControls();queueReset();});
    for(const [id,key] of [['electrode-length','electrodeLength'],['electrode-radius','electrodeRadius']])$(id).addEventListener('input',event=>{state[key]=Number(event.target.value);markCustom();updateControls();queueReset();});
    $('grid-quality').addEventListener('change',event=>{if(!M.GRIDS[event.target.value])return;state.quality=event.target.value;markCustom();updateControls();queueReset();});
    $('solver-accuracy').addEventListener('change',event=>{state.tolerance=Number(event.target.value);markCustom();updateControls();queueReset();});
    $('show-candidates').addEventListener('change',event=>{
      state.showCandidates=event.target.checked;
      if(!state.showCandidates&&state.tool==='probe'){state.tool='orbit';if(state.pendingProbe)state.probeNotice='探测已取消。';state.pendingProbe=null;delete stage.dataset.probePending;updateTelemetry();notice('候选节点已隐藏，指针已切回旋转视角。');}
      updateControls();updateObjects();state.dirty=true;
    });
    $('show-slice').addEventListener('change',event=>{state.showSlice=event.target.checked;updateControls();updateObjects();state.dirty=true;});
    $('growth-field-toggle').addEventListener('click',()=>{state.showSlice=!state.showSlice;updateControls();updateObjects();state.dirty=true;});
    $('slice-z').addEventListener('input',event=>{state.slice=Number(event.target.value);updateControls();updateObjects();state.dirty=true;});
    $('camera-zoom').addEventListener('input',event=>{state.camera.zoom=Number(event.target.value);updateControls();updateFraming();});
    function toggleCompare(){state.compare=!state.compare;state.probeId=null;requestReset(0);}
    $('compare-toggle').addEventListener('click',toggleCompare);$('compare-card-action').addEventListener('click',toggleCompare);
    $('probe-strongest').addEventListener('click',()=>pickStrongest(true));$('probe-strongest-card').addEventListener('click',()=>pickStrongest(true));
    document.querySelectorAll('[data-note]').forEach(el=>el.addEventListener('click',()=>setNote(el.dataset.note)));
    document.querySelectorAll('[data-note-action]').forEach(el=>el.addEventListener('click',()=>{setTool(el.dataset.noteAction,true);setNote(el.dataset.noteAction);}));
    $('play').addEventListener('click',()=>{if(state.stroke.visible&&state.stroke.data)$('return-play').click();else setPlaying(!state.playing);});$('step').addEventListener('click',()=>{if(state.stroke.visible&&state.stroke.data)$('return-step').click();else sendSteps(1);});$('reset').addEventListener('click',()=>{if(state.stroke.visible&&state.stroke.data)$('return-reset').click();else requestReset(0);});
    document.querySelectorAll('[data-speed]').forEach(el=>el.addEventListener('click',()=>{if(state.stroke.visible&&state.stroke.data){state.stroke.multiplier=Number(el.dataset.speed);state.stroke.last=0;}else{state.speed=Number(el.dataset.speed);state.accumulator=0;}updateControls();}));
    $('reset-view').addEventListener('click',resetView);$('save-image').addEventListener('click',saveImage);
    window.addEventListener('resize',resize);document.addEventListener('lab:panelchange',()=>requestAnimationFrame(()=>{updateFraming();state.dirty=true;}));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden)return;
      // Pause even while loading/debouncing or while an electrode is held.
      // Otherwise a queued restore could restart after the tab was hidden.
      if(state.resetTimer)state.queuedPlaying=false;if(state.drag)state.drag.wasPlaying=false;
      state.playing=false;state.accumulator=0;state.lastFrame=0;state.thermal.running=false;state.thermal.last=0;state.stroke.running=false;state.stroke.autoPlay=false;state.stroke.last=0;updateThermalControls();updateStrokeControls();updatePlayback();
    });
    if('ResizeObserver' in window){
      const stageObserver=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(Math.abs(r.width-state.width)>.25||Math.abs(r.height-state.height)>.25)resize();});stageObserver.observe(stage);
      const hudObserver=new ResizeObserver(()=>{updateFraming();state.dirty=true;});hudObserver.observe(document.querySelector('.lab-bottom'));
    }
  }
  try{
    if(!M||!A||!T||!E)throw Error('未加载介质击穿、电热、场对照或显示模块');bind();setupRenderer();bindCanvas();resize();updateControls();setNote('growth');updatePlayback();requestReset(presets.branch.warm);requestAnimationFrame(animate);
  }catch(error){fail('实验无法初始化：'+(error&&error.message||error));}
})();
