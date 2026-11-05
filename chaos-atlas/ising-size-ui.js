/* The size study runs separately from the main Metropolis chain. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const node=(tag,attrs,text)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));if(text!=null)e.textContent=text;return e;};
  const fmt=(v,d=3)=>v==null||!Number.isFinite(v)?'—':Number(v).toFixed(d),colors=['#f2bd93','#80e2d7','#c2aaf1','#e0db8a'],names={uniform:'总磁化 m',staggered:'交错磁化 mₛ',none:'无适用序参量'},metrics={susceptibility:['序参量涨落 χ/N','ORDER FLUCTUATION','susceptibilitySD'],binder:['Binder U','BINDER CUMULANT','binderSD'],heatCapacity:['能量涨落 C/N','ENERGY FLUCTUATION','heatCapacitySD']};
  function init(getConfig){
    let worker=null,serial=0,active=null,run=null,metric='susceptibility',selected=null,initialized=false;
    const key=p=>p.size+'|'+p.temperature,points=()=>run?[...run.points.values()].sort((a,b)=>a.size-b.size||a.temperature-b.temperature):[];
    function configText(c){return c&&c.ready?`${c.name} · ${c.shapeLabel} · h ${fmt(c.field,2)} · 截断 ${fmt(c.cutoff,2)} · ${c.ruleCount} 条矩阵覆盖`:'主晶格尚未就绪';}
    function refresh(){
      const c=getConfig();$('size-current').textContent='下次运行锁定：'+configText(c)+(run&&run.graphKey!==c.graphKey?'。已显示结果来自先前锁定的图。':'。');
      if(c.ready&&!initialized){$('size-lengths').value=c.sizes.join(',');$('size-min').value=String(c.min);$('size-max').value=String(c.max);initialized=true;}
    }
    function status(message){$('size-status').textContent=message;}
    function updateProgress(n){const v=Math.max(0,Math.min(100,n));$('size-progress').value=v;$('size-progress-value').textContent=Math.floor(v)+'%';}
    function controls(){
      for(const id of ['size-lengths','size-seeds','size-budget','size-min','size-max','size-run'])$(id).disabled=!!active;
      $('size-cancel').disabled=!active||!!active.cancelling;$('size-export').disabled=!run||!points().length;
      const lab=$('micro-lab');lab.dataset.sizeStatus=active?'running':run?run.status:'idle';lab.dataset.sizePoints=String(points().length);
    }
    function start(){
      if(active)return;const c=getConfig();if(!c.ready){status('主晶格尚未就绪。');return;}
      const raw=$('size-lengths').value.trim().split(/[\s,，]+/).filter(Boolean),sizes=raw.map(Number),seeds=Number($('size-seeds').value),long=$('size-budget').value==='long',min=Number($('size-min').value),max=Number($('size-max').value);
      if(raw.length<2||raw.length>4||sizes.some(n=>!Number.isInteger(n)||n<2||n>24)||new Set(sizes).size!==sizes.length){status('请输入 2–4 个不同整数尺寸，范围 2–24。');return;}
      if(!Number.isFinite(min)||!Number.isFinite(max)||min<.25||max>20||min>=max){status('温度范围须满足 0.25 ≤ 最低温 < 最高温 ≤ 20。');return;}
      if(!root.Worker){status('当前浏览器不支持后台 Worker。');return;}
      const options={...c.options,sizes,seeds,warm:long?192:64,samples:long?256:128,points:9,min,max},id=++serial;
      try{
        if(worker)worker.terminate();const local=worker=new Worker('ising-size-worker.js?v=20261101-5');active={id,cancelling:false};run={options,points:new Map(),details:[],status:'running',graphKey:c.graphKey,name:c.name,shapeLabel:c.shapeLabel};selected=null;updateProgress(0);controls();status('正在构建各尺寸的真实相互作用图……');render();
        local.onmessage=event=>{
          const m=event.data;if(local!==worker||!active||m.jobId!==id)return;
          if(m.kind==='started'){run.options=m.options;run.details=m.details;status(`已锁定 ${m.details.length} 个尺寸，预计 ${(m.attempts/1e6).toFixed(2)} 百万次自旋尝试。`);render();return;}
          if(m.kind==='progress'||m.kind==='point'){
            updateProgress(100*m.completed/m.total);if(m.kind==='point'){run.points.set(key(m.point),m.point);if(selected==null)selected=key(m.point);render();}return;
          }
          if(['complete','cancelled','error'].includes(m.kind)){
            run.status=m.kind==='complete'?'complete':m.kind==='cancelled'?'cancelled':'error';active=null;local.terminate();worker=null;
            if(m.kind==='complete'){updateProgress(100);status(`研究完成：${points().length} 个尺寸/温度点，每点合并 ${run.options.seeds} 个独立种子。`);}
            else if(m.kind==='cancelled')status(`已取消；保留 ${points().length} 个部分或完整采样点。`);
            else status('研究未完成：'+(m.message||'后台计算失败。'));controls();render();
          }
        };
        local.onerror=()=>{if(local!==worker||!active)return;active=null;run.status='error';local.terminate();worker=null;status('尺寸研究线程无法启动或运行。');controls();render();};
        local.postMessage({type:'start',jobId:id,options});
      }catch(error){if(worker)worker.terminate();worker=null;active=null;if(run)run.status='error';controls();status('无法启动：'+error.message);}
    }
    function renderChart(){
      const svg=$('size-chart'),items=points(),values=items.filter(p=>Number.isFinite(p[metric])),meta=metrics[metric],w=760,h=270,left=57,right=20,top=16,bottom=34,pw=w-left-right,ph=h-top-bottom;
      svg.replaceChildren();$('size-chart-title').textContent=meta[0];$('size-chart-kicker').textContent=meta[1];$('size-chart-empty').hidden=values.length>0;
      const loT=run?run.options.min:Number($('size-min').value)||1,hiT=run?run.options.max:Number($('size-max').value)||8;
      let low=metric==='binder'?-.1:0,high=metric==='binder'?.75:1;
      if(values.length){const ext=values.flatMap(p=>{const v=p[metric],sd=p[meta[2]]||0;return metric==='binder'?[v]:[v-sd,v+sd];});if(metric==='binder'){low=Math.min(low,...ext);high=Math.max(high,...ext);const pad=Math.max(.03,(high-low)*.05);low-=pad;high+=pad;}else{high=Math.max(1e-4,...ext)*1.1;}}
      const x=t=>left+(t-loT)/(hiT-loT)*pw,y=v=>top+(high-v)/(high-low)*ph;
      for(let i=0;i<=4;i++){const yy=top+i*ph/4,val=high-i*(high-low)/4;svg.appendChild(node('line',{x1:left,y1:yy,x2:w-right,y2:yy,class:'grid'}));svg.appendChild(node('text',{x:left-7,y:yy+3,'text-anchor':'end'},fmt(val,2)));}
      for(let i=0;i<=4;i++){const t=loT+i*(hiT-loT)/4;svg.appendChild(node('text',{x:x(t),y:h-13,'text-anchor':'middle'},fmt(t,1)));}svg.appendChild(node('text',{x:w-right,y:h-1,'text-anchor':'end'},'T'));
      let clipped=false;if(run){for(let i=0;i<run.options.sizes.length;i++){
        const n=run.options.sizes[i],a=values.filter(p=>p.size===n),color=colors[i%colors.length];if(!a.length)continue;
        svg.appendChild(node('path',{d:a.map((p,j)=>(j?'L':'M')+x(p.temperature).toFixed(2)+' '+y(p[metric]).toFixed(2)).join(' '),class:'curve',stroke:color}));
        for(const p of a){const px=x(p.temperature),py=y(p[metric]),sd=p[meta[2]];if(sd!=null){const raw1=y(p[metric]-sd),raw2=y(p[metric]+sd),y1=Math.max(top,Math.min(top+ph,raw1)),y2=Math.max(top,Math.min(top+ph,raw2));if(raw1!==y1||raw2!==y2)clipped=true;svg.appendChild(node('line',{x1:px,y1,x2:px,y2,stroke:color,'stroke-opacity':.62}));svg.appendChild(node('line',{x1:px-3,y1,x2:px+3,y2:y1,stroke:color,'stroke-opacity':.62}));svg.appendChild(node('line',{x1:px-3,y1:y2,x2:px+3,y2,stroke:color,'stroke-opacity':.62}));}
          svg.appendChild(node('circle',{cx:px,cy:py,r:key(p)===selected?5:3.5,fill:color,stroke:'#102b30','stroke-width':1}));svg.appendChild(node('circle',{cx:px,cy:py,r:12,fill:'transparent','data-size':p.size,'data-temperature':p.temperature}));}
      }}
      $('size-error-note').textContent=clipped?'误差线为种子标准差；超出图框部分已截断，完整值见下方读数':'误差线：逐种子估计的样本标准差';
    }
    function render(){
      const a=points(),meta=metrics[metric];document.querySelectorAll('[data-size-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sizeMetric===metric)));
      renderChart();const legend=$('size-legend');legend.replaceChildren();if(run){run.options.sizes.forEach((n,i)=>{const d=run.details.find(x=>x.size===n),span=document.createElement('span'),swatch=document.createElement('i');swatch.style.setProperty('--series-color',colors[i%colors.length]);span.append(swatch,document.createTextNode(`L = ${n} · ${d?names[d.mode]:'建图中'}${d?' · '+d.spinCount+' 自旋':''}`));legend.appendChild(span);});}
      const peaks=[];if(run)for(const n of run.options.sizes){const a0=a.filter(p=>p.size===n&&Number.isFinite(p.susceptibility)),a1=a.filter(p=>p.size===n&&Number.isFinite(p.heatCapacity)),values=a0.length?a0:a1;if(!values.length)continue;const k=a0.length?'susceptibility':'heatCapacity',p=values.reduce((x,y)=>y[k]>x[k]?y:x);peaks.push(`L ${n}: ${k==='susceptibility'?'χ/N':'C/N'} ${fmt(p[k],2)} @ T ${fmt(p.temperature,2)} (${p.seeds} 种子)`);}$('size-peaks').textContent=peaks.length?'已采点的峰值 · '+peaks.join('   /   '):'涨落峰只在完成采样点中比较。';
      const select=$('size-pick');select.replaceChildren();if(!a.length){const o=document.createElement('option');o.textContent='尚无数据';select.appendChild(o);select.disabled=true;}else{for(const p of a){const o=document.createElement('option');o.value=key(p);o.textContent=`L ${p.size} · T ${fmt(p.temperature,2)} · ${p.seeds} 种子`;select.appendChild(o);}if(!a.some(p=>key(p)===selected))selected=key(a[0]);select.value=selected;select.disabled=false;}
      const p=a.find(p=>key(p)===selected);$('size-picked-value').textContent=p?fmt(p[metric],4):'—';$('size-picked-sd').textContent=p?fmt(p[meta[2]],4):'—';
      const body=$('size-table-body');body.replaceChildren();if(!a.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='尚无数据';tr.appendChild(td);body.appendChild(tr);}else for(const p of a){const tr=document.createElement('tr');for(const text of [String(p.size),names[p.mode],fmt(p.temperature,2),String(p.seeds),fmt(p.susceptibility,4),fmt(p.binder,4),fmt(p.heatCapacity,4)]){const td=document.createElement('td');td.textContent=text;tr.appendChild(td);}body.appendChild(tr);}
      controls();refresh();
    }
    $('size-run').addEventListener('click',start);$('size-cancel').addEventListener('click',()=>{if(!active||active.cancelling)return;active.cancelling=true;controls();status('正在取消；已完成点会保留。');worker.postMessage({type:'cancel',jobId:active.id});});
    document.querySelectorAll('[data-size-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.sizeMetric;render();}));
    $('size-pick').addEventListener('change',e=>{selected=e.target.value;render();});$('size-chart').addEventListener('click',e=>{const t=e.target;if(t.dataset&&t.dataset.size){selected=t.dataset.size+'|'+t.dataset.temperature;render();}});
    $('size-export').addEventListener('click',()=>{
      if(!run)return;const cols=['L','temperature','order_type','spin_count','seeds_aggregated','seed','samples','mean_order','mean_order2','mean_order4','seed_susceptibility','seed_binder','seed_heat_capacity','mean_seed_susceptibility','pooled_binder','mean_seed_heat_capacity','seed_sd_susceptibility','seed_sd_binder','seed_sd_heat_capacity','field','warmup_sweeps','sample_sweeps','shape','cutoff','J_same','J_different','active_species','pair_rules_json','structure_json'];
      const csv=v=>{const x=String(v==null?'':v);return /[",\r\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x;},rows=[cols.join(',')],o=run.options;
      for(const p of points())for(const r of p.replicates)rows.push([p.size,p.temperature,p.mode,p.spinCount,p.seeds,r.seed,r.samples,r.m,r.m2,r.m4,r.susceptibility,r.binder,r.heatCapacity,p.susceptibility,p.binder,p.heatCapacity,p.susceptibilitySD,p.binderSD,p.heatCapacitySD,o.field,o.warm,o.samples,o.shape,o.cutoff,o.jSame,o.jDifferent,(o.activeSpecies||[]).join('|'),JSON.stringify(o.pairRules||[]),JSON.stringify(o.structure)].map(csv).join(','));
      const url=URL.createObjectURL(new Blob([rows.join('\n')+'\n'],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='ising-finite-size-study.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    refresh();controls();render();return {refresh,render};
  }
  root.IsingSizeStudyUI={init};
})(window);
