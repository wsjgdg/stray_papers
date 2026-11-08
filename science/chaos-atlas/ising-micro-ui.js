/* Interactive, offline snapshot analysis. Computation runs in its own worker. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),svgNS='http://www.w3.org/2000/svg';
  const el=(tag,attrs,text)=>{const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));if(text!=null)e.textContent=text;return e;};
  const fmt=(v,d=3)=>v==null||!Number.isFinite(v)?'—':Number(v).toFixed(d),percent=v=>v==null?'—':(100*v).toFixed(1)+'%';
  function init(hooks){
    const dialog=$('micro-lab'),canvas=$('micro-q-canvas'),ctx=canvas.getContext('2d');
    let worker=null,job=0,snapshot=null,result=null,returnFocus=null,tab='frustration',selectedQ=0,drag=null,view={yaw:.7,pitch:.36,zoom:1},screens=[];
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const sizeUI=root.IsingSizeStudyUI&&hooks.studyConfig?root.IsingSizeStudyUI.init(hooks.studyConfig):null;
    function current(){return !!snapshot&&hooks.isCurrent(snapshot);}
    function availability(){
      const stale=!!result&&!current();$('micro-show-cluster').disabled=!result||stale;$('micro-show-loop').disabled=!result||stale||!result.diagnostics.cycle||result.diagnostics.cycle.self;
      if(result&&stale)$('micro-status').textContent='主晶格已改变；以下仍是旧快照。请重新捕获后再在三维场景标色。';
      dialog.dataset.stale=String(stale);
    }
    function chooseTab(name){
      if(!['frustration','clusters','reciprocal','size'].includes(name))return;tab=name;
      document.querySelectorAll('[data-micro-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.microTab===name)));
      document.querySelectorAll('[data-micro-pane]').forEach(p=>{p.hidden=p.dataset.microPane!==name;});dialog.dataset.tab=name;
      if(name==='reciprocal')requestAnimationFrame(drawQ);
      if(name==='size'&&sizeUI)sizeUI.refresh();
    }
    function open(name){
      returnFocus=document.activeElement;dialog.hidden=false;chooseTab(name||'frustration');availability();$('micro-close').focus({preventScroll:true});
      if(name!=='size'&&!result&&!worker)capture();else requestAnimationFrame(drawQ);
    }
    function close(){
      dialog.hidden=true;const target=returnFocus&&returnFocus.isConnected?returnFocus:$('micro-open-control');if(target&&target.getClientRects().length)target.focus({preventScroll:true});
    }
    function capture(){
      const snap=hooks.snapshot();if(!snap){$('micro-status').textContent='主晶格尚未就绪，请稍候。';return;}
      if(!root.Worker){$('micro-status').textContent='当前浏览器不支持后台 Worker。';return;}
      if(worker){worker.terminate();worker=null;}
      snapshot=snap;result=null;selectedQ=0;const span=Number($('micro-q-span').value),id=++job;
      $('micro-snapshot').textContent=`${snap.name} · ${snap.options.size}³ · ${snap.shapeLabel}\nT ${fmt(snap.temperature,2)} / h ${fmt(snap.field,2)} · 第 ${snap.sweeps} 扫描\n活跃 ${snap.spinCount} · 手动翻转 ${snap.manualFlips} 次`;
      $('micro-status').textContent='正在构建同一实际相互作用图……';$('micro-show-cluster').disabled=true;$('micro-show-loop').disabled=true;$('micro-capture').disabled=true;dialog.dataset.status='running';
      try{
        const local=worker=new Worker('ising-micro-worker.js?v=20261101-5');
        local.onmessage=event=>{
          const m=event.data;if(local!==worker||m.jobId!==id)return;
          if(m.kind==='progress'){$('micro-status').textContent='正在计算：'+m.stage+'……';return;}
          if(m.kind==='error'){local.terminate();worker=null;$('micro-capture').disabled=false;dialog.dataset.status='error';$('micro-status').textContent='分析失败：'+m.message;return;}
          if(m.kind!=='result')return;
          result=m;local.terminate();worker=null;$('micro-capture').disabled=false;dialog.dataset.status='ready';
          $('micro-status').textContent='分析完成：完整自旋快照，不修改主采样。';render();availability();hooks.onAnalysis(result,snapshot);
        };
        local.onerror=()=>{if(local!==worker)return;local.terminate();worker=null;$('micro-capture').disabled=false;dialog.dataset.status='error';$('micro-status').textContent='后台分析线程无法启动或运行。';};
        const spins=snap.spins.slice();local.postMessage({type:'analyze',jobId:id,options:snap.options,spins:spins.buffer,span},[spins.buffer]);
      }catch(error){if(worker)worker.terminate();worker=null;$('micro-capture').disabled=false;dialog.dataset.status='error';$('micro-status').textContent='无法启动分析：'+error.message;}
    }
    function render(){
      if(!result)return;const d=result.diagnostics,c=result.clusters,r=result.reciprocal;
      $('micro-satisfied').textContent=percent(d.satisfiedFraction);$('micro-bonds').textContent=d.bonds?`${d.bonds} 条键中 ${d.unsatisfiedBonds} 条不满足`:'没有非零相互作用键';
      $('micro-unsat-weight').textContent=percent(d.unsatisfiedWeightFraction);$('micro-loops').textContent=String(d.frustratedFundamentalLoops);
      $('micro-staggered').textContent=fmt(d.absStaggered);$('micro-staggered-note').textContent=d.absStaggered==null?'当前图不适用该全局交错序参量':'单连通全负 J 二分图';
      $('micro-loop-detail').textContent=!d.bonds?'当前图没有非零键，不能判断回路偏好。':!d.cycle?'符号约束可同时满足；生成树中没有发现负符号乘积回路。':d.cycle.self?'发现一条周期自连接负耦合：其能量为常数，不能画成有限长度的线段。':`找到 ${d.cycle.length} 条实际键组成的闭合回路，J 符号乘积 ${d.cycle.sign}；其中 ${d.cycle.edges.filter(e=>e.wrapped).length} 条跨周期边界。`;
      $('micro-cluster-count').textContent=String(c.count);$('micro-largest').textContent=c.largest?percent(c.largest.fraction):'—';$('micro-largest-note').textContent=c.largest?`${c.largest.size} / ${c.spinCount} 自旋`:'—';$('micro-snapshot-m').textContent=fmt(result.correlations.magnetization);
      const select=$('micro-cluster-select');select.replaceChildren();const all=document.createElement('option');all.value='0';all.textContent='全部团块分别着色';select.appendChild(all);
      c.groups.slice(0,50).forEach(g=>{const o=document.createElement('option');o.value=String(g.id);o.textContent=`#${g.id} · ${g.spin>0?'↑':'↓'} · ${g.size} 自旋 (${percent(g.fraction)})`;select.appendChild(o);});select.disabled=false;
      renderCorrelation();selectedQ=r.peakIndex;const q=$('micro-q-pick');q.replaceChildren();r.points.forEach((p,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`(${fmt(p.h,3)}, ${fmt(p.k,3)}, ${fmt(p.l,3)}) · ${fmt(p.intensity,3)}`;q.appendChild(o);});q.disabled=false;updateQ();requestAnimationFrame(drawQ);
      dialog.dataset.bonds=String(d.bonds);dialog.dataset.unsatisfied=String(d.unsatisfiedBonds);dialog.dataset.frustratedLoops=String(d.frustratedFundamentalLoops);dialog.dataset.clusterCount=String(c.count);dialog.dataset.largestCluster=String(c.largest?c.largest.size:0);dialog.dataset.qPeak=String(r.peak);
    }
    function renderCorrelation(){
      const s=$('micro-correlation'),pts=result.correlations.points;s.replaceChildren();const w=720,h=240,left=47,right=18,top=20,bottom=35,width=w-left-right,height=h-top-bottom,max=Math.max(1,pts.at(-1).distance),x=d=>left+d/max*width,y=v=>top+(1-v)/2*height;
      for(const value of [-1,-.5,0,.5,1]){s.appendChild(el('line',{x1:left,y1:y(value),x2:w-right,y2:y(value),class:'grid'}));s.appendChild(el('text',{x:left-8,y:y(value)+3,'text-anchor':'end'},String(value)));}
      for(const p of pts)s.appendChild(el('text',{x:x(p.distance),y:h-15,'text-anchor':'middle'},String(p.distance)));s.appendChild(el('text',{x:w-right,y:h-2,'text-anchor':'end'},'d / 晶胞'));
      const colors=['#f0bd91','#87e3d8','#b8b4f1'];for(let axis=0;axis<3;axis++){
        const valid=pts.filter(p=>p.axes[axis].value!=null),path=valid.map((p,i)=>(i?'L':'M')+x(p.distance)+' '+y(p.axes[axis].value)).join(' ');
        s.appendChild(el('path',{d:path,class:'curve',stroke:colors[axis]}));for(const p of valid)s.appendChild(el('circle',{cx:x(p.distance),cy:y(p.axes[axis].value),r:3,fill:colors[axis]}));
        s.appendChild(el('text',{x:left+axis*75,y:12,fill:colors[axis]},['a 方向','b 方向','c 方向'][axis]));
      }
      const d=pts[1];$('micro-correlation-note').textContent=d?`d = 1 的有效点对：a ${d.axes[0].count} · b ${d.axes[1].count} · c ${d.axes[2].count}；m² = ${fmt(result.correlations.magnetization**2)}。`:'没有非零距离点对。';
    }
    function updateQ(){
      if(!result)return;const r=result.reciprocal,p=r.points[selectedQ];$('micro-q-pick').value=String(selectedQ);$('micro-q-value').textContent=fmt(p.intensity,4);$('micro-q-norm').textContent=fmt(Math.hypot(...p.q),4);$('micro-q-peak').textContent=fmt(r.peak,4);dialog.dataset.qSelected=String(selectedQ);dialog.dataset.qValue=String(p.intensity);drawQ();
    }
    function drawQ(){
      if(!ctx||dialog.hidden||tab!=='reciprocal'||!result)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const dpr=Math.min(2,root.devicePixelRatio||1);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const r=result.reciprocal,sy=Math.sin(view.yaw),cy=Math.cos(view.yaw),sp=Math.sin(view.pitch),cp=Math.cos(view.pitch),right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],front=[sy*cp,sp,cy*cp],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],max=Math.max(...r.points.map(p=>Math.hypot(...p.q)))||1,scale=Math.min(w,h)*.43/max*view.zoom;
      const proj=q=>({x:w/2+dot(q,right)*scale,y:h/2-dot(q,up)*scale,z:dot(q,front)}),axisPoints=[[r.span,0,0],[0,r.span,0],[0,0,r.span]].map(v=>r.points.find(p=>Math.abs(p.h-v[0])<1e-9&&Math.abs(p.k-v[1])<1e-9&&Math.abs(p.l-v[2])<1e-9));
      for(let i=0;i<3;i++){const a=proj([0,0,0]),b=proj(axisPoints[i].q);ctx.strokeStyle=['#d2a78e','#7fcfc3','#aaa9d9'][i];ctx.globalAlpha=.45;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.globalAlpha=.9;ctx.fillStyle=ctx.strokeStyle;ctx.font='10px monospace';ctx.fillText(['b₁','b₂','b₃'][i],b.x+4,b.y-4);}ctx.globalAlpha=1;
      screens=r.points.map((p,i)=>({...proj(p.q),i,intensity:p.intensity})).sort((a,b)=>a.z-b.z);const log=Math.log1p(r.peak)||1;
      for(const p of screens){const strength=clamp(Math.log1p(p.intensity)/log,0,1),radius=1.5+strength*5;ctx.globalAlpha=.22+.75*strength;ctx.fillStyle=strength>.67?'#ffe0aa':strength>.32?'#94e5d8':'#6fa2ba';ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();if(p.i===selectedQ){ctx.globalAlpha=1;ctx.strokeStyle='#fff3d9';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(p.x,p.y,radius+4,0,Math.PI*2);ctx.stroke();}}
      ctx.globalAlpha=1;canvas.dataset.points=String(screens.length);canvas.dataset.yaw=String(view.yaw);canvas.dataset.zoom=String(view.zoom);
    }
    for(const [id,name] of [['micro-open-control','frustration'],['micro-open-frustration','frustration'],['micro-open-clusters','clusters'],['micro-open-reciprocal','reciprocal'],['micro-open-size','size']])$(id).addEventListener('click',()=>open(name));
    $('micro-close').addEventListener('click',close);$('micro-capture').addEventListener('click',capture);$('micro-q-span').addEventListener('change',()=>{$('micro-status').textContent='倒空间范围已更改；点击「冻结并分析当前快照」重新计算。';});
    document.querySelectorAll('[data-micro-tab]').forEach(b=>b.addEventListener('click',()=>chooseTab(b.dataset.microTab)));
    $('micro-q-pick').addEventListener('change',e=>{selectedQ=Number(e.target.value);updateQ();});
    $('micro-show-cluster').addEventListener('click',()=>{if(!result||!current()){availability();return;}hooks.showCluster(result.clusters,Number($('micro-cluster-select').value),snapshot);close();});
    $('micro-show-loop').addEventListener('click',()=>{if(!result||!current()){availability();return;}hooks.showLoop(result.diagnostics.cycle,snapshot);close();});
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw:view.yaw,pitch:view.pitch,moved:false};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>3)drag.moved=true;view.yaw=drag.yaw-dx*.009;view.pitch=clamp(drag.pitch+dy*.009,-1.35,1.35);drawQ();e.preventDefault();});
    function end(e){if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(!d.moved&&e.type==='pointerup'&&result){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best=null,dist=144;for(const p of screens){const d2=(p.x-x)**2+(p.y-y)**2;if(d2<=dist){dist=d2;best=p.i;}}if(best!==null){selectedQ=best;updateQ();}}try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch(_){}e.preventDefault();}
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',e=>{e.preventDefault();view.zoom=clamp(view.zoom*Math.exp(-e.deltaY*.001),.5,2.5);drawQ();},{passive:false});
    canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')view.yaw-=.1;else if(e.key==='ArrowRight')view.yaw+=.1;else if(e.key==='ArrowUp')view.pitch=clamp(view.pitch+.1,-1.35,1.35);else if(e.key==='ArrowDown')view.pitch=clamp(view.pitch-.1,-1.35,1.35);else if(e.key==='+'||e.key==='=')view.zoom=clamp(view.zoom*1.1,.5,2.5);else if(e.key==='-')view.zoom=clamp(view.zoom/1.1,.5,2.5);else if(e.key==='Home')view={yaw:.7,pitch:.36,zoom:1};else return;e.preventDefault();drawQ();});
    document.addEventListener('keydown',e=>{if(dialog.hidden)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}if(e.key==='Tab'){const f=[...dialog.querySelectorAll('button:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(x=>x.getClientRects().length);if(!f.length){e.preventDefault();return;}const i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&(i<0||i===f.length-1)){e.preventDefault();f[0].focus();}}},true);
    if('ResizeObserver'in root)new ResizeObserver(drawQ).observe(canvas);else root.addEventListener('resize',drawQ);
    return {open,refresh:()=>{if(!dialog.hidden){availability();if(tab==='size'&&sizeUI)sizeUI.refresh();}}};
  }
  root.IsingMicroUI={init};
})(window);
