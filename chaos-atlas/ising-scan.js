/* The scan is a separate Worker and never advances or mutates the main lattice. */
(function (root) {
  'use strict';
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const METRICS={
    order:{field:'meanAbsMagnetization',kicker:'ORDER PARAMETER / 序参量',title:'平均绝对磁化 ⟨|m|⟩',explanation:'⟨|m|⟩ 是每次扫描的绝对磁化再取平均，与 |⟨m⟩| 不同。'},
    susceptibility:{field:'susceptibility',kicker:'MAGNETIC FLUCTUATIONS / 磁化涨落',title:'磁化涨落估计 χ/N',explanation:'χ/N = N(⟨m²⟩ − ⟨m⟩²) / T；短窗、相关样本和未平衡会显著影响峰值。'},
    heat:{field:'heatCapacity',kicker:'ENERGY FLUCTUATIONS / 能量涨落',title:'能量涨落估计 C/N',explanation:'C/N = N(⟨e²⟩ − ⟨e⟩²) / T²；有限体系与有限预算下的峰不是严格奇点。'},
    energy:{field:'meanEnergyPerSpin',kicker:'ENERGY / 平均能量',title:'平均每格能量 ⟨e⟩',explanation:'e = H/N；含当前外场能。比较不同外场时，能量曲线的物理条件也不同。'}
  };
  const fmt=(value,digits=3)=>Number.isFinite(value)?value.toFixed(digits):'—';
  const directionName=d=>d==='heat'?'升温':'降温';
  function createSvg(tag,attrs,text){const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));if(text!==undefined)el.textContent=text;return el;}
  function niceStep(value){if(!Number.isFinite(value)||value<=0)return 1;const p=10**Math.floor(Math.log10(value)),x=value/p;return (x<=1?1:x<=2?2:x<=5?5:10)*p;}
  function init(options){
    const dialog=$('scan-lab'),chart=$('scan-chart'),runs={heat:null,cool:null};
    let worker=null,active=null,serial=0,metric='order',selected=null,userSelected=false,returnFocus=null,progress=0;
    const getConfig=options.getConfig,applyTemperature=options.applyTemperature;
    function current(){return getConfig();}
    function allPoints(){return ['heat','cool'].flatMap(d=>runs[d]?runs[d].points.map(point=>({direction:d,point})):[]);}
    function temperatures(){return [...new Set(allPoints().map(item=>item.point.temperature))].sort((a,b)=>a-b);}
    function reconcileSelection(){
      const ts=temperatures();if(!ts.length){selected=null;return ts;}
      const target=userSelected&&selected!==null?selected:4.5;
      if(!userSelected||selected===null||!ts.some(t=>Math.abs(t-selected)<1e-9))selected=ts.reduce((best,t)=>Math.abs(t-target)<Math.abs(best-target)?t:best,ts[0]);
      return ts;
    }
    function status(text){$('scan-status').textContent=text;}
    function updateConfig(){
      const c=current();$('scan-current-config').textContent=c.ready?`${c.size}³  ·  h ${fmt(c.field,2)}  ·  种子 ${c.seed}  ·  ${c.structureName||'简单立方'}${c.structure?' · '+c.activeSpecies.join('/')+' · '+({periodic:'周期',box:'开放晶胞块',sphere:'球',cylinder:'圆柱',hex:'六角柱'}[c.shape]||'周期')+' · 截断 '+fmt(c.cutoff,2)+' · J '+fmt(c.jSame,1)+' / '+fmt(c.jDifferent,1):''}`:'主晶格尚未就绪';
      const min=c.minTemperature||1,max=c.maxTemperature||8;$('scan-range-value').textContent=`${fmt(min,2)} → ${fmt(max,1)}`;$('scan-range-step').textContent=`15 点 · 每步 ΔT = ${fmt((max-min)/14,3)} · kB = 1`;
      const simple=(c.graphKey||'simple-ising')==='simple-ising'&&Math.abs(c.field)<1e-12&&['heat','cool'].every(d=>!runs[d]||((runs[d].options.graphKey||'simple-ising')==='simple-ising'&&Math.abs(runs[d].options.field)<1e-12));
      $('scan-tc-note').innerHTML=simple?'简单立方零场无限体系参考 · T<sub>c</sub> ≈ 4.5115':'不同图与耦合没有统一的 T<sub>c</sub> 参考';
      const disabled=!!active||!c.ready||!window.Worker;
      $('scan-run-heat').disabled=disabled;$('scan-run-cool').disabled=disabled;$('scan-budget').disabled=!!active;
      $('scan-clear').disabled=!!active||!allPoints().length;$('scan-export').disabled=!allPoints().length;
      $('scan-apply').disabled=!c.ready||selected===null;
      $('scan-cancel').hidden=!active;$('scan-cancel').disabled=!!(active&&active.cancelling);
      dialog.dataset.status=active?'running':'idle';dialog.dataset.heatPoints=String(runs.heat?runs.heat.points.length:0);dialog.dataset.coolPoints=String(runs.cool?runs.cool.points.length:0);
      dialog.dataset.metric=metric;dialog.dataset.selected=selected===null?'':String(selected);
      $('scan-stage-status').textContent=active?'扫描中 '+Math.floor(progress)+'%':'TEMPERATURE SCAN ↗';
    }
    function updateProgress(value){progress=Math.max(0,Math.min(100,value));$('scan-progress').value=progress;$('scan-progress-value').textContent=Math.floor(progress)+'%';$('scan-stage-status').textContent=active?'扫描中 '+Math.floor(progress)+'%':'TEMPERATURE SCAN ↗';}
    function runMeta(direction){
      const r=runs[direction];if(!r)return '尚未运行';
      const o=r.options,states={running:'采样中',complete:'已完成',cancelled:'已取消',error:'中断'};
      return `${o.size}³ · h ${fmt(o.field,2)} · 种子 ${o.seed} · ${o.structureName||'简单立方'}${o.structure?' · '+o.activeSpecies.join('/')+' · '+({periodic:'周期',box:'开放晶胞块',sphere:'球',cylinder:'圆柱',hex:'六角柱'}[o.shape]||'周期')+' · J '+fmt(o.jSame,1)+'/'+fmt(o.jDifferent,1):''} · 预热 ${o.warm} / 采样 ${o.samples} · ${r.points.length}/${o.points} 点 · ${states[r.status]}`;
    }
    function compareNote(){
      const a=runs.heat,b=runs.cool;
      if(!a||!b)return '分别运行升温与降温后可在同一温度对照；两条曲线使用各自的初态和随机序列。';
      const labels={size:'尺寸',field:'外场',seed:'种子',warm:'预热',samples:'采样数',graphKey:'结构 / 耦合 / 活跃组元 / 边界',min:'最低温度',max:'最高温度'};
      const diff=Object.keys(labels).filter(k=>a.options[k]!==b.options[k]).map(k=>labels[k]);
      return diff.length?'注意：两条曲线的'+diff.join('、')+'不同；观察到的差别不能只归因于扫描方向。':'两条曲线的尺寸、外场、种子和预算一致；初态与扫描路径不同，有限采样差异不是热力学滞后。';
    }
    function findPoint(direction,t){const r=runs[direction];return r&&r.points.find(p=>Math.abs(p.temperature-t)<1e-9);}
    function updateReadouts(){
      const ts=reconcileSelection(),select=$('scan-pick');select.replaceChildren();
      if(!ts.length){const empty=document.createElement('option');empty.value='';empty.textContent='尚无采样点';select.appendChild(empty);select.disabled=true;}
      else {
        for(const t of ts){const option=document.createElement('option');option.value=String(t);option.textContent='T = '+fmt(t,2);select.appendChild(option);}
        select.value=String(selected);select.disabled=false;
      }
      for(const d of ['heat','cool']){const p=selected===null?null:findPoint(d,selected);$('scan-'+d+'-value').textContent=p?fmt(p[METRICS[metric].field],4):'—';$('scan-'+d+'-meta').textContent=runMeta(d);}
      $('scan-compare-note').textContent=compareNote();
      const peaks=['heat','cool'].map(d=>{const r=runs[d];if(!r||!r.points.length)return directionName(d)+' —';const p=r.points.reduce((a,b)=>b.susceptibility>a.susceptibility?b:a);return directionName(d)+' '+fmt(p.susceptibility,2)+' @ T '+fmt(p.temperature,2);});
      $('scan-peak-value').textContent=allPoints().length?peaks.join('   /   '):'—';updateConfig();
    }
    function updateTable(){
      const body=$('scan-table-body'),items=allPoints();body.replaceChildren();$('scan-table-summary').textContent='查看逐点数据表（'+items.length+'）';
      if(!items.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='尚无采样数据';tr.appendChild(td);body.appendChild(tr);return;}
      for(const {direction,point:p} of items){
        const tr=document.createElement('tr');tr.dataset.direction=direction;tr.dataset.temperature=String(p.temperature);
        for(const value of [directionName(direction),fmt(p.temperature,2),fmt(p.meanAbsMagnetization,4),fmt(p.susceptibility,4),fmt(p.heatCapacity,4),fmt(p.meanEnergyPerSpin,4),String(p.samples)]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}
        body.appendChild(tr);
      }
    }
    function chartBounds(items){
      if(metric==='order')return [0,1];
      const values=items.map(({point})=>point[METRICS[metric].field]).filter(Number.isFinite);
      if(metric!=='energy'){const wanted=(values.length?Math.max(...values):1)*1.1||1,step=niceStep(wanted/4);return [0,Math.ceil(wanted/step)*step];}
      if(!values.length)return [-4.5,1];
      const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.08,(hi-lo)*.07),step=niceStep((hi-lo+2*pad)/4);
      return [Math.floor((lo-pad)/step)*step,Math.ceil((hi+pad)/step)*step];
    }
    function renderChart(){
      if(dialog.hidden||!chart.clientWidth||!chart.clientHeight)return;
      const w=chart.clientWidth,h=chart.clientHeight,margin={left:56,right:20,top:20,bottom:39},pw=Math.max(1,w-margin.left-margin.right),ph=Math.max(1,h-margin.top-margin.bottom),items=allPoints(),[min,max]=chartBounds(items);
      const available=['heat','cool'].map(d=>runs[d]&&runs[d].options).filter(Boolean),c=current();
      const xMin=Math.min(c.minTemperature||1,...available.map(o=>o.min)),xMax=Math.max(c.maxTemperature||8,...available.map(o=>o.max));
      const x=t=>margin.left+(t-xMin)/(xMax-xMin)*pw,y=v=>margin.top+(max-v)/(max-min)*ph;
      chart.setAttribute('viewBox',`0 0 ${w} ${h}`);chart.replaceChildren();
      for(let i=0;i<=4;i++){
        const yy=margin.top+ph*i/4,value=max-(max-min)*i/4;
        chart.appendChild(createSvg('line',{x1:margin.left,y1:yy,x2:w-margin.right,y2:yy,class:'scan-grid'}));
        chart.appendChild(createSvg('text',{x:margin.left-8,y:yy+3,'text-anchor':'end'},fmt(value,Math.abs(max-min)<.1?3:2)));
      }
      const ticks=xMin===1&&xMax===8?Array.from({length:8},(_,i)=>i+1):Array.from({length:5},(_,i)=>xMin+(xMax-xMin)*i/4);
      for(const t of ticks){
        const xx=x(t);chart.appendChild(createSvg('line',{x1:xx,y1:margin.top,x2:xx,y2:margin.top+ph,class:'scan-grid'}));
        chart.appendChild(createSvg('text',{x:xx,y:margin.top+ph+19,'text-anchor':'middle'},Number(t.toFixed(2)).toString()));
      }
      chart.appendChild(createSvg('line',{x1:margin.left,y1:margin.top+ph,x2:w-margin.right,y2:margin.top+ph,class:'scan-axis'}));
      chart.appendChild(createSvg('text',{x:w-margin.right,y:h-5,'text-anchor':'end'},'T'));
      const simple=(c.graphKey||'simple-ising')==='simple-ising'&&Math.abs(c.field)<1e-12&&available.every(o=>(o.graphKey||'simple-ising')==='simple-ising'&&Math.abs(o.field)<1e-12);
      if(simple){const ref=x(4.5115);chart.appendChild(createSvg('line',{x1:ref,y1:margin.top,x2:ref,y2:margin.top+ph,class:'scan-reference'}));chart.appendChild(createSvg('text',{x:ref+4,y:margin.top+11,fill:'#efc8a2'},'Tc∞'));}
      chart.dataset.temperatureMin=String(xMin);chart.dataset.temperatureMax=String(xMax);
      for(const d of ['heat','cool']){
        const r=runs[d];if(!r||!r.points.length)continue;
        const color=d==='heat'?'#f2b88e':'#80e1d6',ordered=[...r.points].sort((a,b)=>a.temperature-b.temperature),key=METRICS[metric].field;
        const path=ordered.map((p,i)=>(i?'L':'M')+x(p.temperature).toFixed(2)+' '+y(p[key]).toFixed(2)).join(' ');
        const attrs={d:path,class:'scan-curve',stroke:color,'data-direction':d};if(r.status!=='complete')attrs['stroke-dasharray']='6 5';chart.appendChild(createSvg('path',attrs));
        for(const p of ordered){
          const cx=x(p.temperature),cy=y(p[key]),chosen=selected!==null&&Math.abs(selected-p.temperature)<1e-9;
          if(chosen)chart.appendChild(createSvg('circle',{cx,cy,r:8,fill:'none',stroke:color,'stroke-width':1,opacity:.8}));
          chart.appendChild(createSvg('circle',{cx,cy,r:chosen?4.5:3.5,fill:color,class:'scan-dot'}));
          const target=createSvg('circle',{cx,cy,r:12,class:'scan-target','data-direction':d,'data-temperature':p.temperature});chart.appendChild(target);
        }
      }
      $('scan-chart-message').hidden=items.length>0;
    }
    function render(){
      const m=METRICS[metric];$('scan-metric-kicker').textContent=m.kicker;$('scan-metric-title').textContent=m.title;$('scan-metric-explanation').textContent=m.explanation;
      document.querySelectorAll('button[data-scan-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scanMetric===metric)));
      updateReadouts();updateTable();renderChart();
    }
    function onWorkerMessage(event){
      const m=event.data;if(!active||m.jobId!==active.jobId)return;
      const r=runs[active.direction];
      if(m.kind==='started'){$('scan-progress-label').textContent=directionName(active.direction)+'扫描中';return;}
      if(m.kind==='progress'||m.kind==='point'){
        updateProgress(100*m.completed/m.total);if(m.kind==='point'){r.points.push(m.point);render();}return;
      }
      if(m.kind==='complete'||m.kind==='cancelled'||m.kind==='error'){
        r.status=m.kind==='complete'?'complete':m.kind==='cancelled'?'cancelled':'error';
        const text=m.kind==='complete'?`${directionName(active.direction)}扫描完成：${r.points.length} 个真实采样点。`:m.kind==='cancelled'?`已取消；保留 ${r.points.length} 个已完成的采样点。`:'扫描中断：'+(m.message||'后台计算失败。');
        if(m.kind==='complete')updateProgress(100);active=null;$('scan-progress-label').textContent=m.kind==='complete'?'本次扫描完成':m.kind==='cancelled'?'本次扫描已取消':'本次扫描中断';status(text);render();
      }
    }
    function start(direction){
      const c=current();if(active||!c.ready)return;
      if(!window.Worker){status('当前浏览器不支持后台 Worker，无法运行扫描。');return;}
      const long=$('scan-budget').value==='long',o={size:c.size,field:c.field,seed:c.seed,direction,warm:long?256:64,samples:long?256:128,points:15,min:c.minTemperature||1,max:c.maxTemperature||8,graphKey:c.graphKey||'simple-ising',structureName:c.structureName||'简单立方'};
      if(c.structure)Object.assign(o,{structure:c.structure,cutoff:c.cutoff,jSame:c.jSame,jDifferent:c.jDifferent,activeSpecies:c.activeSpecies,shape:c.shape,pairRules:c.pairRules});
      try{
        if(!worker){
          const local=worker=new Worker('ising-scan-worker.js?v=20261101-5');local.onmessage=event=>{if(worker===local)onWorkerMessage(event);};
          local.onerror=()=>{if(!active||worker!==local)return;const r=runs[active.direction];r.status='error';active=null;worker.terminate();worker=null;$('scan-progress-label').textContent='本次扫描中断';status('后台扫描线程无法启动或运行；已保留完成的点。');render();};
        }
        const jobId=++serial;active={jobId,direction,cancelling:false};runs[direction]={options:o,points:[],status:'running'};updateProgress(0);
        $('scan-progress-label').textContent=directionName(direction)+'扫描中';status(directionName(direction)+'扫描已开始；主晶格与扫描相互独立。');render();
        worker.postMessage({type:'start',jobId,options:o});
      }catch(error){if(active&&runs[direction])runs[direction].status='error';active=null;status('无法启动扫描：'+(error&&error.message||error));render();}
    }
    function open(){
      returnFocus=document.activeElement;dialog.hidden=false;updateConfig();render();$('scan-close').focus({preventScroll:true});requestAnimationFrame(renderChart);
    }
    function close(){
      dialog.hidden=true;const target=returnFocus&&returnFocus.isConnected?returnFocus:$('scan-open-stage');if(target&&target.getClientRects().length)target.focus({preventScroll:true});else $('scan-open-stage').focus({preventScroll:true});
    }
    for(const id of ['scan-open-stage','scan-open-control','scan-open-card'])$(id).addEventListener('click',open);
    $('scan-close').addEventListener('click',close);
    $('scan-run-heat').addEventListener('click',()=>start('heat'));$('scan-run-cool').addEventListener('click',()=>start('cool'));
    $('scan-cancel').addEventListener('click',()=>{if(!active||active.cancelling)return;active.cancelling=true;status('正在取消，已完成的温度点会保留。');updateConfig();worker.postMessage({type:'cancel',jobId:active.jobId});});
    $('scan-clear').addEventListener('click',()=>{if(active)return;runs.heat=null;runs.cool=null;selected=null;userSelected=false;updateProgress(0);$('scan-progress-label').textContent='等待运行';status('曲线已清空；主晶格未改变。');render();});
    $('scan-pick').addEventListener('change',event=>{selected=Number(event.target.value);userSelected=true;updateReadouts();renderChart();});
    chart.addEventListener('click',event=>{
      const ts=temperatures(),rect=chart.getBoundingClientRect();if(!ts.length||rect.width<=76)return;
      const min=Number(chart.dataset.temperatureMin||1),max=Number(chart.dataset.temperatureMax||8),t=min+(max-min)*(event.clientX-rect.left-56)/(rect.width-76);selected=ts.reduce((best,value)=>Math.abs(value-t)<Math.abs(best-t)?value:best,ts[0]);userSelected=true;updateReadouts();renderChart();
    });
    $('scan-apply').addEventListener('click',()=>{if(selected===null||!current().ready)return;applyTemperature(selected);close();});
    document.querySelectorAll('button[data-scan-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.scanMetric;render();}));
    $('scan-export').addEventListener('click',()=>{
      const columns=['direction','status','L','field','seed','warmup_sweeps','sampling_sweeps','temperature','mean_abs_m','mean_m','chi_per_spin','heat_capacity_per_spin','energy_per_spin','total_sweeps','structure','cutoff','J_same','J_different','active_species','structure_json','sample_shape','pair_rules_json'];
      const csv=value=>{const text=String(value==null?'':value);return /[\",\r\n]/.test(text)?'\"'+text.replace(/\"/g,'\"\"')+'\"':text;};
      const rows=[columns.join(',')];for(const {direction,point:p} of allPoints()){const r=runs[direction],o=r.options;rows.push([direction,r.status,o.size,o.field,o.seed,o.warm,o.samples,p.temperature,p.meanAbsMagnetization,p.meanMagnetization,p.susceptibility,p.heatCapacity,p.meanEnergyPerSpin,p.sweeps,o.structureName||'简单立方',o.structure?o.cutoff:'',o.structure?o.jSame:'',o.structure?o.jDifferent:'',o.structure?o.activeSpecies.join('|'):'',o.structure?JSON.stringify(o.structure):'',o.shape||'periodic',o.structure?JSON.stringify(o.pairRules||[]):''].map(csv).join(','));}
      const url=URL.createObjectURL(new Blob([rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='ising-temperature-scan.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    document.addEventListener('keydown',event=>{
      if(dialog.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(event.key==='Tab'){
        const focusable=[...dialog.querySelectorAll('button:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length);
        if(!focusable.length){event.preventDefault();return;}const i=focusable.indexOf(document.activeElement);
        if(event.shiftKey&&(i<=0)){event.preventDefault();focusable.at(-1).focus();}else if(!event.shiftKey&&(i<0||i===focusable.length-1)){event.preventDefault();focusable[0].focus();}
      }
    },true);
    if('ResizeObserver'in window)new ResizeObserver(()=>renderChart()).observe(chart);else window.addEventListener('resize',renderChart);
    render();
    return {refresh:updateConfig};
  }
  root.IsingScan={init};
})(window);
