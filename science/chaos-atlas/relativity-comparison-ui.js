/* Controller for the independent parameter study. No network or approximation
 * frames are involved; on file:// the same renderer runs in cooperative slices. */
(function(root){
  'use strict';
  function create({getCurrent}){
    const C=root.RelativityComparison,R=root.RelativityRenderer,$=id=>document.getElementById(id),dialog=$('parameter-dialog');
    const imageEls=[$('comparison-image-a'),$('comparison-image-b')],color=['#9be0d3','#ffc195'];
    let base=null,lock=null,result=null,worker=null,ready=null,token=0,workerActive=0,fallback=null,fallbackReady=null;
    const fields=[['group-a-beta','group-a-angle','group-a-elevation'],['group-b-beta','group-b-angle','group-b-elevation']];
    const fmt=(x,n=3)=>Number(x).toFixed(n),signed=(x,n=2)=>(x>=0?'+':'')+fmt(x,n);
    const textPoint=p=>'('+p.map(x=>fmt(x,2)).join(', ')+')';
    function groups(){return fields.map(ids=>({beta:Number($(ids[0]).value),motionAngle:Number($(ids[1]).value),motionElevation:Number($(ids[2]).value)}));}
    function setGroups(values){values.forEach((g,i)=>{const ids=fields[i];$(ids[0]).value=g.beta;$(ids[1]).value=g.motionAngle;$(ids[2]).value=g.motionElevation;});updateFields();}
    function updateFields(){for(const ids of fields){$(ids[0]+'-value').textContent=signed(Number($(ids[0]).value))+' c';for(const id of ids.slice(1))$(id+'-value').textContent=$(id).value+'°';}}
    function setStatus(message){$('comparison-status').textContent=message;}
    function stale(message='参数已修改；请重新生成。先前画面和数据已过期。'){
      token++;if(worker)worker.postMessage({type:'cancel'});result=null;$('comparison-results').dataset.stale='true';$('comparison-export-image').disabled=true;$('comparison-export-data').disabled=true;setStatus(message);
    }
    function lockCurrent(preserveGroups=false){
      const current=getCurrent();base=current.parameters;lock={time:base.time,camera:current.event.camera.slice(),center:current.event.center.slice()};if(current.event.second)lock.secondCenter=current.event.second.center.slice();
      if(!preserveGroups){const b=base.beta===.86?0:.86;setGroups([{beta:base.beta,motionAngle:base.motionAngle,motionElevation:base.motionElevation},{beta:b,motionAngle:base.motionAngle,motionElevation:base.motionElevation}]);}
      context();stale('已锁定主实验台当前参数和观察事件；点击「生成两组对照」。');
    }
    function context(){
      if(!base||!lock)return;
      const name=root.RelativityWorlds.labels[base.environment]||'未知场景',kind=base.scenario==='flyby'?'运动物体':'高速观察者';
      $('parameter-context').textContent=`${name} / ${kind} · t=${fmt(base.time,2)} · 相机 ${textPoint(lock.camera)} · 主体中心 ${textPoint(lock.center)} · 镜头偏航 ${fmt(base.yaw*180/Math.PI,1)}° / 俯仰 ${fmt(base.pitch*180/Math.PI,1)}° · FOV ${base.fov}° · ${base.shutter?'四点快门':'瞬时快门'}`;
    }
    function statusName(s){return ({visible:'可见',self:'自身遮挡',world:'场景遮挡',outside:'画面外',behind:'相机后方',comparison:'不在照片侧',coincident:'与相机重合','off-surface':'表面未命中','not-shown':'未显示'})[s]||s;}
    function showData(){
      const tbody=$('comparison-table');tbody.replaceChildren();
      result.measurements.forEach((m,i)=>{
        const tr=document.createElement('tr');for(const [value,head] of [['参数组 '+(i?'B':'A'),true],[fmt(m.left.emissionTime),false],[fmt(m.right.emissionTime),false],[signed(m.delta,3),false]]){const cell=document.createElement(head?'th':'td');if(head)cell.scope='row';cell.textContent=value;tr.append(cell);}tbody.append(tr);
      });
      $('comparison-visibility').textContent=result.measurements.map((m,i)=>`${i?'B':'A'}：L ${statusName(m.left.status)}，R ${statusName(m.right.status)}`).join('；')+'。被遮挡或画面外的数字是候选交点，非已收到的光。';
      const label=g=>`β ${signed(g.beta)}c · 水平 ${g.motionAngle}° · 仰角 ${g.motionElevation}°`;
      $('comparison-label-a').textContent='参数组 A　/　'+label(result.groups[0]);$('comparison-label-b').textContent='参数组 B　/　'+label(result.groups[1]);
      drawCurve();
    }
    function drawCurve(){
      const canvas=$('comparison-curve'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,all=result.curves.flat().map(p=>p.delta),lo=Math.min(...all),hi=Math.max(...all),span=Math.max(.1,hi-lo),min=lo-.10*span,max=hi+.10*span;
      const X=beta=>44+(beta+.98)/1.96*(w-62),Y=delta=>h-30-(delta-min)/(max-min)*(h-48);
      ctx.fillStyle='#14272a';ctx.fillRect(0,0,w,h);ctx.font='11px sans-serif';ctx.fillStyle='#c5d8d0';ctx.strokeStyle='#56726a';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(44,14);ctx.lineTo(44,h-30);ctx.lineTo(w-18,h-30);ctx.stroke();
      ctx.fillText('R − L / c=1',48,13);ctx.fillStyle=color[0];ctx.fillText('A',w-58,16);ctx.fillStyle=color[1];ctx.fillText('B',w-34,16);ctx.fillStyle='#c5d8d0';ctx.fillText('−0.98',35,h-12);ctx.fillText('0',X(0)-3,h-12);ctx.fillText('+0.98 β',w-60,h-12);ctx.fillText(fmt(max,2),2,23);ctx.fillText(fmt(min,2),2,h-28);
      if(min<0&&max>0){ctx.strokeStyle='#4b615c';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(44,Y(0));ctx.lineTo(w-18,Y(0));ctx.stroke();ctx.setLineDash([]);}
      result.curves.forEach((curve,i)=>{ctx.strokeStyle=color[i];ctx.lineWidth=2;ctx.beginPath();curve.forEach((p,j)=>{if(j===0)ctx.moveTo(X(p.beta),Y(p.delta));else ctx.lineTo(X(p.beta),Y(p.delta));});ctx.stroke();
        const x=X(result.groups[i].beta),y=Y(result.measurements[i].delta);ctx.fillStyle=color[i];ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fill();ctx.fillText(i?'B':'A',x+6,y-5);});
    }
    function frame(index,source,width,height){
      const c=imageEls[index];c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0,width,height);
      const m=result.measurements[index];for(const [id,p] of [['L',m.left],['R',m.right]]){
        if(p.status!=='visible'||!Number.isFinite(p.screen.x)||!Number.isFinite(p.screen.y))continue;
        const x=p.screen.x,y=p.screen.y;ctx.beginPath();ctx.arc(x,y,4,0,2*Math.PI);ctx.fillStyle='#f7d1a8';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#102426';ctx.stroke();
        ctx.font='bold 12px sans-serif';ctx.lineWidth=3;ctx.strokeText(id,x+6,y-6);ctx.fillStyle='#fff1dd';ctx.fillText(id,x+6,y-6);
      }
    }
    function done(id){if(id!==token||!result)return;workerActive=0;$('comparison-results').dataset.stale='false';$('comparison-export-image').disabled=false;$('comparison-export-data').disabled=false;setStatus('两张独立光锥照片与候选发射事件已完成；可下载 PNG 和可再次导入的 JSON。');}
    function fail(id,error){if(id!==token)return;workerActive=0;setStatus('对照生成失败：'+String(error&&error.message||error));}
    function startWorker(){
      if(worker&&ready)return ready;if(root.location.protocol==='file:'||root.__RELATIVITY_DISABLE_WORKER__||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return Promise.resolve(false);
      try{
        const w=new Worker('relativity-comparison-worker.js?v=20261105-10');worker=w;
        ready=new Promise((resolve,reject)=>{
          let initialized=false;
          w.onmessage=e=>{const m=e.data||{};
            if(m.type==='ready'){initialized=true;resolve(true);return;}
            if(m.type==='error'){if(!initialized){reject(new Error(m.message));return;}const id=workerActive;w.terminate();worker=null;ready=null;if(id===token)runFallback(id).catch(error=>fail(id,error));return;}
            if(m.id!==token){if(m.image&&m.image.close)m.image.close();return;}
            if(m.type==='frame'){frame(m.index,m.image,m.width,m.height);if(m.image.close)m.image.close();}
            else if(m.type==='progress')setStatus(`正在计算参数组 ${m.index?'B':'A'} · ${Math.round(m.progress*100)}%（独立真实光线）`);
            else if(m.type==='done')done(m.id);
          };
          w.onerror=e=>{e.preventDefault();if(!initialized)reject(new Error(e.message||'Worker 不可用'));else{const id=workerActive;w.terminate();worker=null;ready=null;if(id===token)runFallback(id).catch(error=>fail(id,error));}};
          w.postMessage({type:'init',textures:root.RelativityTextures});
        }).catch(()=>{w.terminate();if(worker===w){worker=null;ready=null;}return false;});return ready;
      }catch(_){worker=null;ready=null;return Promise.resolve(false);}
    }
    async function ensureFallback(){
      if(fallbackReady)return fallbackReady;
      fallbackReady=new Promise((resolve,reject)=>{
        // The fallback must wait for the renderer's complete asset list,
        // including the harbor sky and metal. Otherwise early frames can
        // silently use its placeholder color for a slow or failed texture.
        try{const canvas=document.createElement('canvas');let remain=R.assetNames.length;const renderer=R.createOffscreenCanvas(canvas,(name,status)=>{if(status==='error'){reject(new Error('材质加载失败：'+name));return;}if(--remain===0)resolve({renderer,canvas});});}
        catch(error){reject(error);}
      }).catch(e=>{fallbackReady=null;throw e;});return fallbackReady;
    }
    function renderStates(){return result.groups.map(g=>({...C.scenario(result.base,g,result.lock).state,renderBudget:result.width*result.height,antialias:false}));}
    async function runFallback(id){
      const f=await ensureFallback();if(id!==token||!result)return;fallback=f;const states=renderStates(),viewport={width:result.width,height:result.height};let index=0,job=f.renderer.beginRender(states[0],viewport);
      function step(){
        if(id!==token||!result)return;
        try{if(job.step(4)){job.commit();frame(index,f.canvas,f.canvas.width,f.canvas.height);if(++index===2){done(id);return;}job=f.renderer.beginRender(states[index],viewport);}
          setStatus(`正在计算参数组 ${index?'B':'A'} · ${Math.round(job.progress()*100)}%（主线程分片）`);setTimeout(step,12);
        }catch(error){fail(id,error);}
      }step();
    }
    async function run(existing=null){
      const id=++token;if(worker)worker.postMessage({type:'cancel'});$('comparison-export-image').disabled=true;$('comparison-export-data').disabled=true;$('comparison-results').dataset.stale='true';
      try{
        result=existing||C.build(base,groups(),lock);showData();setStatus('正在准备独立光线追踪…');const available=await startWorker();if(id!==token||!result)return;
        if(available){workerActive=id;worker.postMessage({type:'run',id,width:result.width,height:result.height,states:renderStates()});}else await runFallback(id);
      }catch(error){fail(id,error);}
    }
    function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    async function exportImage(){
      if(!result)return;const captured=result;
      if(document.fonts?.load){try{await Promise.all([document.fonts.load('700 19px "Noto Sans SC Variable"','两组参数同一观察事件'),document.fonts.load('400 12px "Noto Sans SC Variable"','相机水平仰角发射时间可见遮挡画面外候选交点不等于可见光完整参数见')]);}catch(_){}}
      if(result!==captured)return;
      const w=result.width,h=result.height,canvas=document.createElement('canvas');canvas.width=2*w+48;canvas.height=h+400;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#17282b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#f5e8d6';ctx.font='700 19px "Noto Sans SC Variable", sans-serif';ctx.fillText('两组参数 · 同一观察事件',16,27);ctx.font='12px "Noto Sans SC Variable", sans-serif';ctx.fillStyle='#cadbd1';
      ctx.fillText(`t=${fmt(base.time,2)}  相机 ${textPoint(lock.camera)}  FOV ${base.fov}°`,16,47);
      imageEls.forEach((image,i)=>{const x=16+i*(w+16);ctx.fillStyle=color[i];ctx.fillText(`${i?'B':'A'}  β ${signed(result.groups[i].beta)}c  水平 ${result.groups[i].motionAngle}°  仰角 ${result.groups[i].motionElevation}°`,x,68);ctx.drawImage(image,x,78,w,h);});
      let y=h+99;ctx.fillStyle='#ecdfcd';ctx.font='12px "Noto Sans SC Variable", sans-serif';result.measurements.forEach((m,i)=>{ctx.fillText(`${i?'B':'A'}  L=${fmt(m.left.emissionTime)} (${statusName(m.left.status)})   R=${fmt(m.right.emissionTime)} (${statusName(m.right.status)})   R−L=${signed(m.delta,3)}`,16,y);y+=21;});
      ctx.drawImage($('comparison-curve'),16,y+3,Math.min(500,canvas.width-32),220);ctx.fillStyle='#c7d6ce';ctx.font='10px "Noto Sans SC Variable", sans-serif';ctx.fillText('候选交点不等于可见光；场景与光谱均为近似。完整参数见 JSON。',16,canvas.height-12);
      canvas.toBlob(blob=>{if(blob)download(blob,'relativity-parameter-comparison.png');else setStatus('无法生成 PNG。');},'image/png');
    }
    $('open-parameter-comparison').addEventListener('click',()=>{lockCurrent();if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');});
    $('close-parameter-dialog').addEventListener('click',()=>{if(typeof dialog.close==='function')dialog.close();else{dialog.removeAttribute('open');stale('已关闭');}});
    dialog.addEventListener('close',()=>{stale('已关闭参数对照。');if(worker){worker.terminate();worker=null;ready=null;}});
    $('comparison-lock-current').addEventListener('click',()=>lockCurrent(true));
    fields.flat().forEach(id=>$(id).addEventListener('input',()=>{updateFields();stale();}));
    $('comparison-run').addEventListener('click',()=>run());$('comparison-export-image').addEventListener('click',exportImage);
    $('comparison-export-data').addEventListener('click',()=>{if(result)download(new Blob([JSON.stringify(C.serialize(result),null,2)],{type:'application/json'}),'relativity-parameter-comparison.json');});
    $('comparison-import').addEventListener('click',()=>$('comparison-file').click());
    $('comparison-file').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>1048576)throw new Error('对照文件过大');const saved=C.parse(await file.text());base=saved.base;lock=saved.lock;setGroups(saved.groups);context();await run(saved);}catch(error){stale('导入失败：'+(error.message||error));}finally{e.target.value='';}});
    updateFields();return Object.freeze({lockCurrent});
  }
  root.RelativityComparisonUI=Object.freeze({create});
})(window);
