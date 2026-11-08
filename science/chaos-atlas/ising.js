(function () {
  'use strict';
  const $ = id => document.getElementById(id), THREE = window.THREE, API = window.IsingLattice, INSIGHTS = window.IsingInsights, CRYSTAL = window.CrystalGeometry, GRAPH = window.CrystalIsing;
  const stage = $('ising-stage'), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)');
  const SIDE = 3.6, HISTORY = 150;
  const PRESETS = {
    critical:{temperature:4.51,field:0,initial:'random',warm:120,description:'从随机初态真实预演 120 次扫描，继续观察临界附近的涨落；这不保证已经平衡。'},
    cold:{temperature:2.5,field:0,initial:'up',warm:0,description:'从全部向上的初态开始；低温下能量代价较大的翻转较少。'},
    hot:{temperature:7,field:0,initial:'random',warm:30,description:'随机初态在高温下真实预演 30 次扫描；观察磁化与局域方向的涨落。'},
    quench:{temperature:2.8,field:0,initial:'random',warm:0,description:'从无序排列开始低温采样；观察不同方向的区域如何演化。'},
    field:{temperature:5.5,field:.6,initial:'random',warm:60,description:'在正外场下从随机初态真实预演 60 次扫描；比较不同外场下的方向偏置。'}
  };
  const state = {
    size:20, temperature:4.51, field:0, seed:20261031, initial:'random', preset:'critical', warm:120, crystal:null, colorMode:'spin',
    layers:14, view:'arrows', tool:'orbit', boundaryOnly:false, surfaceOnly:false, interface:null, selected:10+20*10+400*7,
    showFlashes:!reduced.matches, flashMask:null, flashUntil:0, flashRevision:0, flashCache:null,
    playing:!reduced.matches&&!document.hidden, speed:1, ready:false, busy:false, failed:false, generation:0, request:0,
    pendingConfig:null, pendingProbe:null, pendingFlips:[], inFlight:'', spins:null, stats:null, probe:null, history:[],
    width:0, height:0, dpr:1, bounds:null, pixels:1, camera:{yaw:.48,pitch:.29,zoom:1},
    renderer:'', bondType:'', domain:null, cycle:null, drag:null, dirty:true, lastFrame:0, lastDraw:0, accumulator:0, screenSites:[]
  };
  let canvas = $('ising-scene'), worker = null, renderer = null, scene = null, camera = null, raycaster = null, ctx = null, objects = null;
  const bound = new WeakSet(), background = new Image(); background.src = 'assets/ising-visual-bg.jpg';
  let glowMap=null, reticleMap=null, scanUI=null, microUI=null, matrixDraft=new Map(), matrixCleared=false, bondCache=null, cycleCache=null;
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const signed = (v,d=2) => (v > 0 ? '+' : '') + Number(v).toFixed(d);
  const vec = (x,y,z) => ({x,y,z});
  const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
  function progress(input) {
    const lo=Number(input.min),hi=Number(input.max),v=Number(input.value);
    input.style.setProperty('--progress',clamp((v-lo)/(hi-lo)*100,0,100)+'%');
  }
  function basis() {
    const y=state.camera.yaw,p=state.camera.pitch,sy=Math.sin(y),cy=Math.cos(y),sp=Math.sin(p),cp=Math.cos(p);
    return {front:vec(sy*cp,sp,cy*cp),right:vec(cy,0,-sy),up:vec(-sy*sp,cp,-cy*sp)};
  }
  const SIZES=[2,3,4,5,6,8,10,12,16,20,24];
  function siteMultiplicity(){return state.crystal?state.crystal.topology.siteCount:1;}
  function visibleTotal(){return state.size*state.size*state.layers*siteMultiplicity();}
  function isVisibleSite(i) { return (!state.crystal||!!state.crystal.topology.present[i])&&(!state.surfaceOnly||!!(state.crystal&&state.crystal.topology.surface[i]))&&(!state.boundaryOnly||!!(state.interface&&state.interface.mask[i])); }
  function visibleCount() {
    const count=visibleTotal();if(!state.crystal&&!state.boundaryOnly)return count;
    let visible=0;for(let i=0;i<count;i++)if((!state.crystal||state.crystal.topology.spinActive[i])&&isVisibleSite(i))visible++;
    return visible;
  }
  function coords(index) {
    const n=state.size,S=siteMultiplicity(),site=index%S,cell=Math.floor(index/S);
    return {x:cell%n,y:Math.floor(cell/n)%n,z:Math.floor(cell/(n*n)),site};
  }
  function indexOf(x,y,z,site=0) { return (x+state.size*y+state.size*state.size*z)*siteMultiplicity()+site; }
  function point(index) {
    if(state.crystal){const a=state.crystal.visual.positions,j=index*3;return vec(a[j],a[j+1],a[j+2]);}
    const c=coords(index),u=SIDE/(state.size-1),mid=(state.size-1)/2;
    return vec((c.x-mid)*u,(c.y-mid)*u,(c.z-mid)*u);
  }
  function neighborsOf(index) {
    if(state.crystal){const t=state.crystal.topology,out=[];for(let k=t.offsets[index];k<t.offsets[index+1];k++)out.push({index:t.targets[k],wrap:!!t.wrapped[k]});return out;}
    const {x,y,z}=coords(index),n=state.size;
    return [
      {index:indexOf((x+1)%n,y,z),wrap:x===n-1},{index:indexOf((x+n-1)%n,y,z),wrap:x===0},
      {index:indexOf(x,(y+1)%n,z),wrap:y===n-1},{index:indexOf(x,(y+n-1)%n,z),wrap:y===0},
      {index:indexOf(x,y,(z+1)%n),wrap:z===n-1},{index:indexOf(x,y,(z+n-1)%n),wrap:z===0}
    ];
  }
  function crystalVisual(top){
    const n=top.size,v=top.crystal.vectors,corners=[];
    for(const z of [0,n])for(const y of [0,n])for(const x of [0,n])corners.push(CRYSTAL.point(v,[x,y,z]));
    const lo=[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])));
    const shaped=!['periodic','box'].includes(top.shape),center=shaped?top.shapeData.center:lo.map((x,k)=>(x+hi[k])/2),factor=SIDE/(shaped?2*top.shapeData.radius:Math.max(...hi.map((x,k)=>x-lo[k])));
    const worldCart=p=>vec((p[0]-center[0])*factor,(p[1]-center[1])*factor,(p[2]-center[2])*factor);
    const world=f=>worldCart(CRYSTAL.point(v,f)),positions=new Float32Array(top.count*3);
    for(let i=0;i<top.count;i++){
      const site=i%top.siteCount,cell=Math.floor(i/top.siteCount),x=cell%n,y=Math.floor(cell/n)%n,z=Math.floor(cell/(n*n)),f=top.crystal.sites[site].fraction;
      const p=world([x+f[0],y+f[1],z+f[2]]);positions.set([p.x,p.y,p.z],i*3);
    }
    const frame=[];for(const z of [0,n])for(const y of [0,n])for(const x of [0,n])frame.push(world([x,y,z]));
    const shapeEdges=[],c=top.shapeData.center,r=top.shapeData.radius,h=top.shapeData.halfHeight;
    function line(a,b){shapeEdges.push([worldCart(a.map((x,k)=>x+c[k])),worldCart(b.map((x,k)=>x+c[k]))]);}
    if(top.shape==='sphere'){
      for(let axis=0;axis<3;axis++)for(let i=0;i<64;i++){const a=i*Math.PI*2/64,b=(i+1)*Math.PI*2/64,pa=[0,0,0],pb=[0,0,0];pa[(axis+1)%3]=r*Math.cos(a);pa[(axis+2)%3]=r*Math.sin(a);pb[(axis+1)%3]=r*Math.cos(b);pb[(axis+2)%3]=r*Math.sin(b);line(pa,pb);}
    }else if(top.shape==='cylinder'||top.shape==='hex'){
      const count=top.shape==='hex'?6:48,phase=top.shape==='hex'?Math.PI/6:0;
      for(let i=0;i<count;i++){const a=phase+i*Math.PI*2/count,b=phase+(i+1)*Math.PI*2/count,xy=[r*Math.cos(a),r*Math.sin(a)],next=[r*Math.cos(b),r*Math.sin(b)];line([xy[0],xy[1],-h],[next[0],next[1],-h]);line([xy[0],xy[1],h],[next[0],next[1],h]);if(top.shape==='hex'||i%4===0)line([xy[0],xy[1],-h],[xy[0],xy[1],h]);}
    }
    return {positions,frame,shapeEdges,world,spacing:Math.min(.45,top.crystal.nearest*factor),colors:top.crystal.sites.map(a=>CRYSTAL.color(a.element))};
  }
  function crystalSlice(){const n=state.size,l=state.layers,w=state.crystal.visual.world;return [w([0,0,l]),w([n,0,l]),w([n,n,l]),w([0,n,l])];}
  function crystalCandidate(structure,cutoff,jSame,jDifferent,activeSpecies,requestedSize=null,extra={}){
    if(!CRYSTAL||!GRAPH)throw new Error('晶体自旋模型资源不可用。');
    const geometry=CRYSTAL.build(structure,cutoff),species=[...new Set(geometry.sites.map(a=>a.element))],active=activeSpecies||species;
    if(!Array.isArray(active)||!active.length||active.some(x=>!species.includes(x)))throw new Error('至少选择一个当前结构中的活跃组元。');
    if(!Number.isFinite(jSame)||!Number.isFinite(jDifferent)||Math.abs(jSame)>2||Math.abs(jDifferent)>2)throw new Error('耦合 J 须在 −2 到 2 之间。');
    const set=new Set(active);let perCell=0;
    geometry.sites.forEach((site,i)=>{if(!set.has(site.element))return;for(const e of geometry.neighbors[i])if(set.has(geometry.sites[e.site].element)&&(site.element===geometry.sites[e.site].element?jSame:jDifferent)!==0)perCell++;});
    const sizes=SIZES.filter(n=>n**3*geometry.sites.length<=GRAPH.MAX_ATOMS&&n**3*perCell<=GRAPH.MAX_EDGES);
    if(!sizes.length)throw new Error('该结构的点位或邻接过多，请收窄截断。');
    if(requestedSize!=null&&!sizes.includes(requestedSize))throw new Error('这个重复数超出计算预算，请减小重复数或截断。');
    // Prefer a legible first crystal; subsequent choices approximately retain the current active count without overwhelming the viewport.
    const target=state.crystal&&state.stats?Math.min(4000,state.stats.spinCount||state.stats.count):1500;
    const size=requestedSize==null?sizes.reduce((a,b)=>Math.abs(geometry.sites.length*b**3-target)<Math.abs(geometry.sites.length*a**3-target)?b:a,sizes[0]):requestedSize;
    const topology=GRAPH.createTopology({structure,size,cutoff,jSame,jDifferent,activeSpecies:active,...extra});
    return {structure:JSON.parse(JSON.stringify(structure)),topology,visual:crystalVisual(topology),sizes};
  }
  function centralIndex(){
    const mid=Math.floor(state.size/2),z=Math.min(mid,state.layers-1);if(!state.crystal)return indexOf(mid,mid,z,0);
    let best=null,bestD=Infinity;for(const i of state.crystal.topology.activeIndices){const p=coords(i);if(p.z>=state.layers)continue;const d=(p.x-mid)**2+(p.y-mid)**2+(p.z-z)**2;if(d<bestD){best=i;bestD=d;}}
    if(best===null){best=state.crystal.topology.activeIndices[0];state.layers=Math.max(state.layers,coords(best).z+1);}return best;
  }
  // Glow marks only net differences between two published states. A site
  // flipped twice within a batch is unchanged in the snapshot and not lit.
  function markChanges(previous,next) {
    if(!state.showFlashes||!previous||previous.length!==next.length){state.flashMask=null;state.flashUntil=0;state.flashRevision++;stage.dataset.flashChanged='0';return;}
    const mask=new Uint8Array(next.length);let changed=0;
    for(let i=0;i<next.length;i++)if(previous[i]!==next[i]){mask[i]=1;changed++;}
    state.flashMask=mask;state.flashRevision++;state.flashUntil=changed?performance.now()+420:0;stage.dataset.flashChanged=String(changed);
  }
  // Subsample only for legibility: every displayed flash remains a genuine
  // net change; a bright marker is not a count of all accepted updates.
  function visibleFlashes() {
    const budget=state.width<=520?96:260,count=visibleTotal(),c=state.flashCache;
    if(c&&c.revision===state.flashRevision&&c.layers===state.layers&&c.budget===budget)return c.indices;
    const indices=[];let available=0;
    if(state.flashMask){for(let i=0;i<count;i++)if(state.flashMask[i]&&isVisibleSite(i))available++;const stride=Math.max(1,Math.ceil(available/budget));let ordinal=0;
      for(let i=0;i<count;i++)if(state.flashMask[i]&&isVisibleSite(i)&&ordinal++%stride===0)indices.push(i);}
    state.flashCache={revision:state.flashRevision,layers:state.layers,budget,indices};
    stage.dataset.flashEligible=String(available);stage.dataset.flashSites=String(indices.length);return indices;
  }
  function project(p) {
    const b=basis(),box=state.bounds;
    return {x:box.centerX+dot(p,b.right)*state.pixels,y:box.centerY-dot(p,b.up)*state.pixels,depth:dot(p,b.front)};
  }
  function updateProbeOverlay() {
    const el=$('probe-overlay'),p=state.probe,count=visibleTotal();
    if(state.tool!=='probe'||!state.ready||!state.bounds||!p||p.index!==state.selected||state.selected>=count){el.hidden=true;return;}
    $('probe-overlay-position').textContent='('+p.x+', '+p.y+', '+p.z+')'+(state.crystal?' · '+p.element:'')+'  '+(p.spin?'自旋 '+signed(p.spin,0):(p.present===false?'样品之外':'非活跃点位'));
    $('probe-overlay-detail').textContent=p.spin?(state.crystal?'J 加权邻居和 '+signed(p.weightedSum,2):'邻居和 '+signed(p.neighborSum,0))+'  ·  ΔE '+signed(p.deltaEnergy,2):(p.present===false?'该点位已从样品移除':'该组元未启用自旋');
    const q=project(point(state.selected)),w=Math.min(190,Math.max(128,state.width*.4));
    const left=clamp(q.x+18,Math.max(6,state.bounds.left),Math.max(6,state.bounds.right-w));
    const top=clamp(q.y-55,Math.max(50,state.bounds.top),Math.max(50,state.bounds.bottom-58));
    el.style.left=Math.round(left)+'px';el.style.top=Math.round(top)+'px';el.hidden=false;
  }
  const labelIds=['spin-temperature-hint','spin-local-explanation','spin-local-formula','spin-critical-explanation','spin-critical-note','spin-hamiltonian','spin-domain-note','spin-limits-explanation','spin-domain-explanation','spin-probe-hint','spin-neighbor-tab','spin-interface-label','spin-interface-hint','spin-preset-critical-label','spin-preset-cold-label','spin-preset-hot-label','spin-preset-quench-label','spin-critical-tab-label','spin-critical-title','spin-order-explanation','card-quench','card-domains','card-critical','card-interface'];
  const originalLabels=Object.fromEntries(labelIds.map(id=>[id,$(id).innerHTML]));
  function populateStructures(){
    const select=$('spin-structure');
    if(!CRYSTAL)return;
    const lattice=document.createElement('optgroup');lattice.label='七晶系 · 14 布拉菲点阵';
    for(const p of CRYSTAL.BRAVAIS){const o=document.createElement('option');o.value=p.id;o.textContent=p.family+' / '+p.name;lattice.appendChild(o);}select.appendChild(lattice);
    for(const name of ['单元素结构','二元结构','三元结构','多元结构']){
      const group=document.createElement('optgroup');group.label=name+' · 示意自旋';
      for(const p of CRYSTAL.PROTOTYPES.filter(x=>x.group===name)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;group.appendChild(o);}select.appendChild(group);
    }
    const custom=document.createElement('option');custom.value='custom';custom.textContent='自定义晶胞（来自图谱）';custom.hidden=true;custom.disabled=true;select.appendChild(custom);
  }
  function setModelLabels(){
    const dynamic=!!state.crystal;
    if(!dynamic)for(const id of labelIds)$(id).innerHTML=originalLabels[id];
    else{
      $('spin-temperature-hint').textContent='当前晶格没有通用的临界温度；示意耦合和连接方式决定行为，有限采样不证明严格相变。';
      $('spin-local-explanation').textContent='每次随机选一个活跃自旋。其能量变化由相互作用图中实际邻居、各条耦合和外场共同决定；非活跃组元不参与采样。';
      $('spin-local-formula').innerHTML='ΔE = 2sᵢ(h + Σ<sub>邻居</sub>Jᵢⱼsⱼ)<br>P(接受) = min(1, e<sup>−ΔE/T</sup>)';
      $('spin-order-explanation').textContent='m 是所有活跃自旋的平均值。铁磁耦合倾向相同方向；负 J、挫折或未连通的图可能具有不同的低温排列，总磁化不能识别所有有序态。';
      $('spin-critical-title').innerHTML='有限尺寸，<br><em>涨落也可被测量。</em>';$('spin-critical-tab-label').textContent='有限尺寸与涨落';
      $('card-quench').innerHTML='从随机初态低温采样 <span aria-hidden="true">↗</span>';$('card-domains').innerHTML='设置对半初态并切换体素 <span aria-hidden="true">↗</span>';
      $('spin-critical-explanation').textContent='不同结构、边界、活跃组元和耦合可能产生不同集体行为；此模型不自动知道材料的临界温度。有限系统与有限采样只提供趋势。';
      $('spin-critical-note').textContent='短窗涨落估计需要充分平衡；有限尺寸、自相关和所选哈密顿量都会影响结果。受挫、反铁磁或未连通的图可能不适合用总磁化衡量有序。';
      $('spin-hamiltonian').innerHTML='H = − Σ<sub>⟨ij⟩</sub>Jᵢⱼsᵢsⱼ − h Σᵢsᵢ<br>只计活跃组元与非零耦合，每条键计一次';
      $('spin-domain-explanation').textContent='活跃点位具有 ±1 自旋；灰色小球是未启用自旋的结构点位。默认颜色表示方向，也可改成按组元着色并通过箭头看方向。';
      $('spin-domain-note').textContent='关联和相反键按活跃的非零耦合图统计，与化学键或真实畴壁不同。反铁磁耦合下，相反方向可能是低能排列；切层与筛选不改变计算。';
      $('spin-limits-explanation').textContent='几何来自所选晶胞与样品边界；在距离截断内按组元选择常数 J，并对活跃自旋做随机点 Metropolis 采样。一次扫描尝试活跃自旋数 N 次，允许重复抽取。';
      $('spin-probe-hint').textContent='探针使用当前结构、样品边界和截断中的实际相互作用；周期跨边界只标记不连线。非活跃点位不能翻转；手动翻转不推进采样。'+(state.crystal.topology.maxDegree>128?' 密集图最多显示 128 条邻接标记；计算与读数仍完整。':'');
      $('spin-neighbor-tab').textContent='实际邻接与 Metropolis';$('spin-interface-label').textContent='只显示相反邻接点';$('spin-interface-hint').textContent='活跃相互作用中至少一个自旋相反';
      $('spin-preset-critical-label').textContent='中温示例';$('spin-preset-cold-label').textContent='低温示例';$('spin-preset-hot-label').textContent='高温示例';$('spin-preset-quench-label').textContent='低温演化';$('card-critical').innerHTML='切换到中温示例 <span aria-hidden="true">↗</span>';$('card-interface').innerHTML='只看相反邻接点 <span aria-hidden="true">↗</span>';
    }
    $('boundary-empty').textContent=dynamic?'当前可见层没有相反邻接点；统计仍覆盖完整计算图。':'当前可见层没有界面格点；统计仍覆盖完整晶格。';
    document.querySelector('#boundary-label span').textContent=dynamic?'INTERFACE / 相反邻接':'INTERFACE / 畴壁筛选';
    $('spin-size-label').textContent=dynamic?'每方向晶胞重复数':'晶格边长 L';$('spin-stage-name').textContent=dynamic?state.crystal.structure.name+' · METROPOLIS SAMPLING':'简单立方 · METROPOLIS SAMPLING';
    $('temperature').min='.25';$('temperature').max='20';document.querySelector('.critical-meter i').style.left=((4.5115-.25)/(20-.25)*100)+'%';
    $('spin-unit-heading').innerHTML=dynamic?'J₀ = k<sub>B</sub> = 1 · J 可调':'J₀ = k<sub>B</sub> = 1';$('spin-cell-heading').textContent=dynamic?(state.crystal.topology.periodic?'PERIODIC UNIT CELLS':'FINITE SAMPLE'):'PERIODIC CUBE';$('spin-layers-label').textContent=dynamic?'显示的晶胞 c 方向层数':'显示的 Z 层数';
    document.querySelector('.critical-meter').hidden=dynamic;
  }
  function ruleKey(a,b,shell){return (a<=b?a+'|'+b:b+'|'+a)+'|'+shell;}
  function updateMatrix(){
    if(!state.crystal)return;const t=state.crystal.topology,select=$('spin-matrix-shell'),wanted=Number(select.value)||1;
    select.replaceChildren();t.shellDistances.forEach((d,i)=>{const o=document.createElement('option');o.value=String(i+1);o.textContent=`第 ${i+1} 壳 · ${(d/t.crystal.nearest).toFixed(3)} × 最近距离`;select.appendChild(o);});
    const shell=Math.min(wanted,t.shellDistances.length)||1;select.value=String(shell);
    const table=document.createElement('table'),head=document.createElement('tr'),corner=document.createElement('th');corner.textContent='组元';head.appendChild(corner);
    for(const e of t.species){const th=document.createElement('th');th.scope='col';th.textContent=e;head.appendChild(th);}table.appendChild(head);
    for(let i=0;i<t.species.length;i++){
      const row=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=t.species[i];row.appendChild(th);
      for(let j=0;j<t.species.length;j++){
        const cell=document.createElement('td');if(j<i){cell.textContent='·';row.appendChild(cell);continue;}
        const a=t.species[i],b=t.species[j],k=ruleKey(a,b,shell),type=t.interactionTypes.find(x=>ruleKey(x.a,x.b,x.shell)===k);
        if(!type){cell.textContent='—';row.appendChild(cell);continue;}
        const input=document.createElement('input');input.type='number';input.min='-2';input.max='2';input.step='0.01';input.value=String(matrixDraft.has(k)?matrixDraft.get(k).j:(matrixCleared?(type.a===type.b?t.jSame:t.jDifferent):type.j));input.setAttribute('aria-label',`第 ${shell} 壳 ${a} 与 ${b} 的耦合 J`);
        input.addEventListener('input',()=>{const v=input.value.trim(),names=a<=b?[a,b]:[b,a];matrixDraft.set(k,{a:names[0],b:names[1],shell,j:v===''?NaN:Number(v)});$('spin-matrix-note').textContent='矩阵草稿尚未应用；切换壳层会保留草稿，点击「应用矩阵并重建」后才改变采样。';});
        cell.appendChild(input);row.appendChild(cell);
      }table.appendChild(row);
    }
    $('spin-matrix-table').replaceChildren(table);
  }
  function updateBondOptions(){
    const select=$('spin-bond-highlight');select.replaceChildren();const none=document.createElement('option');none.value='';none.textContent='不高亮键';select.appendChild(none);
    if(state.crystal){const t=state.crystal.topology;[...t.interactionTypes].sort((a,b)=>a.shell-b.shell||a.a.localeCompare(b.a)||a.b.localeCompare(b.b)).forEach(type=>{
      const o=document.createElement('option');o.value=ruleKey(type.a,type.b,type.shell);o.textContent=`第 ${type.shell} 壳 · ${type.a}—${type.b} · J ${signed(type.j,2)} · ${(type.directed+type.selfDirected)/2} 键`;select.appendChild(o);
    });}
    select.value='';state.bondType='';bondCache=null;$('spin-bond-note').textContent='显示实际非零耦合键；周期跨边界键和显示层外的键不画长直线。';
  }
  function highlightedSegments(){
    if(!state.crystal||!state.bondType)return null;const t=state.crystal.topology,type=t.interactionTypes.findIndex(v=>ruleKey(v.a,v.b,v.shell)===state.bondType);if(type<0)return null;
    const key=[state.generation,state.layers,state.boundaryOnly,state.surfaceOnly,state.stats&&state.stats.sweeps,state.stats&&state.stats.manualFlips,type].join('/');if(bondCache&&bondCache.key===key)return bondCache;
    const cap=1600,positions=[],count=visibleTotal();let omitted=0;
    for(let i=0;i<count;i++){
      if(!t.spinActive[i]||!isVisibleSite(i))continue;
      for(let k=t.offsets[i];k<t.offsets[i+1];k++){
        const j=t.targets[k];if(t.edgeTypes[k]!==type||j<=i||j>=count||t.wrapped[k]||!isVisibleSite(j))continue;
        if(positions.length>=cap*6){omitted++;continue;}const a=point(i),b=point(j);positions.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
    }
    const v=t.interactionTypes[type],total=(v.directed+v.selfDirected)/2;
    bondCache={key,positions:new Float32Array(positions),shown:positions.length/6,total,omitted};
    $('spin-bond-note').textContent=`该类实际键 ${total.toLocaleString('en-US')} 条；当前画出 ${bondCache.shown.toLocaleString('en-US')} 条${omitted?'（显示上限 1600）':''}。跨周期边界和隐藏层不画长线。`;
    stage.dataset.highlightBonds=String(bondCache.shown);stage.dataset.highlightTotal=String(total);return bondCache;
  }
  function renderedCycle(){
    if(!state.cycle)return null;const key=[state.generation,state.layers,state.boundaryOnly,state.surfaceOnly].join('/');
    if(cycleCache&&cycleCache.key===key&&cycleCache.ref===state.cycle)return cycleCache;
    const positions=[],count=visibleTotal();for(const e of state.cycle.edges){
      if(e.wrapped||e.from===e.to||e.from>=count||e.to>=count||!isVisibleSite(e.from)||!isVisibleSite(e.to))continue;
      if(positions.length>=5000*6)break;const a=point(e.from),b=point(e.to);positions.push(a.x,a.y,a.z,b.x,b.y,b.z);
    }
    cycleCache={key,ref:state.cycle,positions:new Float32Array(positions),shown:positions.length/6};stage.dataset.loopEdges=String(cycleCache.shown);
    $('micro-live-label').textContent=`受挫回路 · ${state.cycle.length} 条键 · 当前画出 ${cycleCache.shown} 条`;return cycleCache;
  }
  function setGraphControls(){
    const dynamic=!!state.crystal,select=$('spin-structure');select.value=dynamic?(state.crystal.structure.id||'custom'):'simple-ising';$('spin-sample-shape').value=dynamic?state.crystal.topology.shape:'periodic';
    $('spin-graph-options').hidden=!dynamic;$('probe-site-label').hidden=!dynamic;$('probe-site').hidden=!dynamic;
    const sizeSelect=$('lattice-size');sizeSelect.replaceChildren();
    if(!dynamic){
      for(const n of [12,16,20,24]){const o=document.createElement('option');o.value=String(n);o.textContent=`${n}³ · ${(n**3).toLocaleString('en-US')} 自旋`;sizeSelect.appendChild(o);}
      $('spin-graph-summary').textContent='简单立方 · 六邻居 · 均一 J = 1';
    }else{
      const t=state.crystal.topology;matrixDraft=new Map(t.pairRules.map(r=>[ruleKey(r.a,r.b,r.shell),{...r}]));matrixCleared=false;updateMatrix();
      for(const n of state.crystal.sizes){const o=document.createElement('option');o.value=String(n);o.textContent=`${n}³ 晶胞 · ${(t.siteCount*n**3).toLocaleString('en-US')} 点位`;sizeSelect.appendChild(o);}
      $('spin-graph-summary').textContent=`${state.crystal.structure.name} · ${t.siteCount} 点位 / 胞 · 活跃 ${t.activeIndices.length.toLocaleString('en-US')} / ${t.count.toLocaleString('en-US')} · 平均键度 ${t.meanDegree.toFixed(2)} · 连通分量 ${t.components}`+(t.periodic?'':` · 样品 ${t.presentCount.toLocaleString('en-US')} 点位 · 几何缺邻 ${t.surfaceCount}`);
      $('spin-graph-note').textContent=(t.components>1?'当前相互作用图包含 '+t.components+' 个连通分量；未连通或孤立点不保证出现集体相变。':'相互作用图已连通。')+(t.interactionTypes.some(v=>v.j<0&&(v.directed+v.selfDirected)>0)?' 负 J 可产生反铁磁排列或挫折，总磁化不能识别全部有序。':'')+' J、活跃组元与统一磁矩都是教学假设，不是材料实测值；修改后需点击应用并重建。';
      for(const [id,val] of [['spin-cutoff',t.cutoff],['spin-j-same',t.jSame],['spin-j-different',t.jDifferent]]){$(id).value=String(val);progress($(id));$(id+'-value').textContent=id==='spin-cutoff'?Number(val).toFixed(2)+'×':signed(val,2);}
      const species=$('spin-species-list');species.replaceChildren();for(const e of t.species){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=e;input.checked=t.activeSpecies.includes(e);input.setAttribute('aria-label','启用 '+e+' 自旋');label.append(input,document.createTextNode(e));species.appendChild(label);}
      const probe=$('probe-site');probe.replaceChildren();t.crystal.sites.forEach((atom,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${i+1} · ${atom.element} (${atom.fraction.map(x=>x.toFixed(2)).join(', ')})`;probe.appendChild(o);});
    }
    sizeSelect.value=String(state.size);$('spin-color-mode').value=state.colorMode;setModelLabels();syncProbeInputs();
    const legend=$('spin-element-legend');legend.replaceChildren();if(dynamic){for(const e of state.crystal.topology.activeSpecies){const b=document.createElement('b'),dot=document.createElement('i');dot.style.setProperty('--element-color',CRYSTAL.color(e));b.append(dot,document.createTextNode(' '+e));legend.appendChild(b);}}
    $('spin-neutral-key').hidden=!dynamic||state.crystal.topology.activeIndices.length===state.crystal.topology.presentCount;updateBondOptions();updateLegend();
  }
  function updateLegend(){const element=!!state.crystal&&state.colorMode==='element',domain=state.colorMode==='domain'&&!!state.domain;$('spin-legend-up').hidden=element||domain;$('spin-legend-down').hidden=element||domain;$('spin-element-legend').hidden=!element;$('spin-domain-key').hidden=!domain;}
  function domainColor(id){return 'hsl('+Math.round((id*.61803398875%1)*360)+', 68%, 68%)';}
  function refreshDomainSelection(){
    if(!state.domain)return;const group=state.domain.groups.find(g=>g.id===state.domain.selected);
    $('micro-live-label').textContent=group?`选中团块 #${group.id} · ${group.size} 自旋 · ${group.spin>0?'向上':'向下'}`:'全部团块按连通关系着色';
    $('stage-caption').textContent=group?'高亮所选真实团块 · 探针可更换':'各团块分别着色 · 探针点击选择';
    stage.dataset.domainSelected=String(state.domain.selected);if(objects)objects.renderedVisible.fill(0);state.dirty=true;
  }
  function clearMicroView(){
    if(!state.domain&&!state.cycle)return;state.domain=null;state.cycle=null;cycleCache=null;if(state.colorMode==='domain')state.colorMode='spin';
    const option=$('spin-color-mode').querySelector('option[value="domain"]');option.disabled=true;$('spin-color-mode').value=state.colorMode;
    $('micro-live').hidden=true;$('stage-caption').textContent='颜色对应实际自旋 · 光效仅作表现';delete stage.dataset.domainSelected;delete stage.dataset.domainClusters;delete stage.dataset.loopEdges;
    if(objects)objects.renderedVisible.fill(0);updateLegend();state.dirty=true;
  }
  function showClusterView(clusters,selected){
    clearMicroView();state.domain={labels:clusters.labels,groups:clusters.groups,selected};state.colorMode='domain';state.view='arrows';state.tool='probe';state.boundaryOnly=false;state.surfaceOnly=false;state.layers=state.size;
    $('spin-color-mode').querySelector('option[value="domain"]').disabled=false;$('spin-color-mode').value='domain';$('micro-live').hidden=false;stage.dataset.domainClusters=String(clusters.count);refreshDomainSelection();updateLegend();updateControls();revealScene();
  }
  function showCycleView(cycle){
    clearMicroView();state.cycle=cycle;state.layers=state.size;state.boundaryOnly=false;state.surfaceOnly=false;$('micro-live').hidden=false;
    renderedCycle();$('stage-caption').textContent='粉色线是负符号乘积回路；跨界键省略';updateControls();state.dirty=true;revealScene();
  }
  function installCrystal(structure,cutoff=1.08,jSame=1,jDifferent=1,active=null,size=null,extra={}){
    const candidate=crystalCandidate(structure,cutoff,jSame,jDifferent,active,size,extra);
    state.crystal=candidate;state.size=candidate.topology.size;state.layers=Math.max(1,Math.min(state.size,Math.round(state.size*.7)));state.selected=centralIndex();
    state.temperature=clamp(state.temperature,.25,20);state.preset=null;state.boundaryOnly=false;state.surfaceOnly=false;state.colorMode='spin';setGraphControls();resetWorker(0);
  }
  function installSimple(){
    state.crystal=null;state.size=20;state.layers=14;state.selected=centralIndex();state.temperature=clamp(state.temperature,.25,20);state.preset=null;state.boundaryOnly=false;state.surfaceOnly=false;state.colorMode='spin';setGraphControls();resetWorker(0);
  }
  function notice(message) {
    const el=$('stage-notice');message=message||'';
    if(el.textContent===message&&el.hidden===!message)return;
    el.textContent=message;el.hidden=!message;requestAnimationFrame(updateFraming);
  }
  function fail(message) {
    if(worker){worker.terminate();worker=null;}
    state.failed=true;state.ready=false;state.busy=false;state.playing=false;state.pendingConfig=null;state.pendingProbe=null;state.pendingFlips=[];
    stage.dataset.status='error';$('stage-error-text').textContent=message;$('stage-error').hidden=false;notice('');updateControls();updatePlayback();
  }
  function updatePlayback() {
    const unavailable=state.failed||!state.ready;
    $('play').disabled=unavailable;$('step').disabled=unavailable||state.playing||state.busy||!!state.pendingConfig||!!state.pendingFlips.length;
    $('reset').disabled=unavailable;$('save-image').disabled=unavailable;
    $('play-symbol').textContent=state.playing?'Ⅱ':'▶';$('play-text').textContent=state.playing?'暂停':'播放';
    $('play').setAttribute('aria-label',state.playing?'暂停采样':'播放采样');
    const status=state.failed?'采样不可用':!state.ready?'正在建立晶格':state.playing?'正在采样':'采样已暂停';
    $('header-status').textContent=status;$('stage-status').textContent=state.failed?'SAMPLING UNAVAILABLE':!state.ready?'LATTICE INITIALIZING':state.playing?'LATTICE SAMPLING':'LATTICE PAUSED';
    document.querySelector('.top-status').classList.toggle('paused',!state.playing);stage.classList.toggle('paused',!state.playing);
    stage.dataset.playing=String(!!state.playing);
  }
  function setPlaying(value) {
    if(!state.ready||state.failed)return;
    state.playing=!!value;state.accumulator=0;state.lastFrame=0;updatePlayback();state.dirty=true;
    if(state.playing)pump();
  }
  function setNote(name) {
    document.querySelectorAll('[data-note]').forEach(el=>{const active=el.dataset.note===name;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('[data-note-content]').forEach(el=>{el.hidden=el.dataset.noteContent!==name;});
    document.dispatchEvent(new CustomEvent('lab:contentchange'));
  }
  function updateCanvasAccessibility() {
    canvas.classList.toggle('probe-tool',state.tool==='probe');
    const instruction=state.tool==='probe'
      ?'晶格探针模式。点击自旋可选点；Enter 定位到当前可见区域中心附近，方向键旋转视角，空格播放或暂停。'
      :'三维自旋晶格。拖动旋转，滚轮缩放；方向键旋转，加减号缩放，空格播放或暂停。';
    canvas.setAttribute('aria-label',instruction+(state.boundaryOnly?' 当前只显示相反邻接点。':'')+(state.surfaceOnly?' 当前只显示几何缺邻点。':''));
    $('stage-instruction').textContent=state.tool==='probe'?'点击自旋定位探针 · 滚轮缩放':'↔ 拖动旋转 · 滚轮缩放';
    $('stage-caption').textContent=state.cycle?'粉色线是受挫回路 · 跨周期边界省略':state.domain?'团块颜色对应冻结快照 · 点选自旋更换':state.tool==='probe'?'点选晶格查看实际邻接 · 光效仅作表现':state.crystal&&state.colorMode==='element'?'颜色对应组元 · 箭头方向对应自旋':'颜色对应实际自旋 · 光效仅作表现';
  }
  function updateControls() {
    const disabled=state.failed||!state.ready;
    $('layers').max=String(state.size);
    for(const [id,value,digits] of [['temperature',state.temperature,2],['field',state.field,2],['layers',state.layers,0]]){
      const input=$(id);input.value=String(value);progress(input);
      $(id+'-value').textContent=id==='field'?signed(value,digits):id==='layers'?state.layers+' / '+state.size:Number(value).toFixed(digits);
    }
    $('lattice-size').value=String(state.size);$('initial-spins').value=state.initial;$('show-flashes').checked=state.showFlashes;$('boundary-only').checked=state.boundaryOnly;$('surface-only').checked=state.surfaceOnly;$('seed-status').textContent='生效种子：'+state.seed+'；修改输入后需点「应用并重建」。';
    $('spin-structure').disabled=disabled;for(const id of ['spin-cutoff','spin-j-same','spin-j-different','spin-apply-graph','spin-color-mode','probe-site','spin-sample-shape','spin-apply-shape','spin-matrix-shell','spin-matrix-apply','spin-matrix-clear','spin-bond-highlight'])$(id).disabled=disabled;document.querySelectorAll('#spin-species-list input,#spin-matrix-table input').forEach(el=>{el.disabled=disabled;});
    for(const id of ['temperature','field','lattice-size','initial-spins','seed','apply-seed','layers','show-flashes','boundary-only','set-probe','flip-probe','card-flip','card-quench','card-critical','card-slice','card-domains','card-interface','field-positive','field-negative','field-zero'])$(id).disabled=disabled;
    $('surface-only').disabled=$('card-surface').disabled=disabled||!state.crystal||state.crystal.topology.periodic;
    document.querySelectorAll('[data-preset]').forEach(el=>{const active=el.dataset.preset===state.preset;el.disabled=disabled;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('button[data-view]').forEach(el=>{el.disabled=disabled;el.setAttribute('aria-pressed',String(el.dataset.view===state.view));});
    document.querySelectorAll('button[data-quick-view]').forEach(el=>{el.disabled=disabled;el.setAttribute('aria-pressed',String(el.dataset.quickView===state.view));});$('flash-key').hidden=!state.showFlashes;
    document.querySelectorAll('button[data-tool]').forEach(el=>{el.disabled=disabled;el.setAttribute('aria-pressed',String(el.dataset.tool===state.tool));});
    document.querySelectorAll('[data-speed]').forEach(el=>{const active=Number(el.dataset.speed)===state.speed;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
    for(const axis of ['x','y','z']){const input=$('probe-'+axis);input.max=String(state.size-1);input.disabled=disabled;}
    const description=state.preset&&PRESETS[state.preset]?(state.crystal?'示意温度与当前耦合图有关，不代表材料临界点；预演与采样均真实执行。':PRESETS[state.preset].description):'当前参数已自定义；改变温度与外场不会重排自旋。';
    if($('preset-description').textContent!==description)$('preset-description').textContent=description;
    const applying=!!state.pendingConfig||state.inFlight==='configure';
    $('parameter-status').textContent=applying?'参数正在后台应用；实时读数仍对应已计算的状态。':'更改参数保留当前自旋和扫描数；短窗口统计重新开始。';
    $('card-layers').textContent=state.layers+' / '+state.size+(state.crystal?' 晶胞层':' 层');
    updateCanvasAccessibility();updateProbeOverlay();stage.dataset.view=state.view;stage.dataset.tool=state.tool;stage.dataset.layers=String(state.layers);stage.dataset.initial=state.initial;
    const shown=visibleCount(),layerTotal=visibleTotal();
    stage.dataset.visibleSpins=String(shown);stage.dataset.boundaryOnly=String(state.boundaryOnly);stage.dataset.surfaceOnly=String(state.surfaceOnly);stage.dataset.flashesEnabled=String(state.showFlashes);
    stage.dataset.structure=state.crystal?(state.crystal.structure.id||'custom'):'simple-ising';stage.dataset.siteCount=String(siteMultiplicity());stage.dataset.colorMode=state.colorMode;stage.dataset.sampleShape=state.crystal?state.crystal.topology.shape:'periodic';
    if(state.crystal){const t=state.crystal.topology;stage.dataset.activeSpins=String(t.activeIndices.length);stage.dataset.meanDegree=String(t.meanDegree);stage.dataset.components=String(t.components);stage.dataset.presentSites=String(t.presentCount);stage.dataset.surfaceSites=String(t.surfaceCount);}else{delete stage.dataset.activeSpins;delete stage.dataset.meanDegree;delete stage.dataset.components;delete stage.dataset.presentSites;delete stage.dataset.surfaceSites;}
    $('boundary-label').hidden=!(state.boundaryOnly||state.surfaceOnly)||!state.ready;
    document.querySelector('#boundary-label span').textContent=state.surfaceOnly?(state.boundaryOnly?'SURFACE ∩ INTERFACE / 交集':'SURFACE / 几何缺邻'):(state.crystal?'INTERFACE / 相反邻接':'INTERFACE / 畴壁筛选');
    $('boundary-label-value').textContent=shown.toLocaleString('en-US')+' / '+layerTotal.toLocaleString('en-US')+' 可见层格点';
    $('boundary-empty').textContent=state.surfaceOnly?'当前可见层没有符合条件的几何缺邻点；统计仍覆盖完整样品。':state.crystal?'当前可见层没有相反邻接点；统计仍覆盖完整计算图。':'当前可见层没有界面格点；统计仍覆盖完整晶格。';
    $('boundary-empty').hidden=!(state.boundaryOnly||state.surfaceOnly)||!state.ready||shown>0;
    if(state.interface){stage.dataset.interfaceSites=String(state.interface.sites);stage.dataset.interfaceBonds=String(state.interface.bonds);}
    if(scanUI)scanUI.refresh();

  }
  function addHistory(stats,clear) {
    if(clear)state.history=[];
    if(stats&&(!state.history.length||state.history[state.history.length-1].sweeps!==stats.sweeps)){
      state.history.push({sweeps:stats.sweeps,magnetization:stats.magnetization});if(state.history.length>HISTORY)state.history.shift();
    }
  }
  function drawHistory() {
    const h=state.history,line=$('history-line'),mark=$('history-point');
    if(!h.length){line.setAttribute('d','');mark.setAttribute('visibility','hidden');$('history-note').textContent='等待真实采样。';return;}
    const start=h[0].sweeps,end=h[h.length-1].sweeps;
    const x=s=>10+(end>start?222*(s-start)/(end-start):0),y=m=>39-31*clamp(m,-1,1);
    line.setAttribute('d',h.map((q,i)=>(i?'L':'M')+x(q.sweeps).toFixed(2)+' '+y(q.magnetization).toFixed(2)).join(' '));
    const last=h[h.length-1];mark.setAttribute('cx',x(last.sweeps).toFixed(2));mark.setAttribute('cy',y(last.magnetization).toFixed(2));mark.removeAttribute('visibility');
    $('history-chart').setAttribute('aria-label','最近 '+h.length+' 个真实磁化采样，扫描 '+start+' 至 '+end+'，当前磁化 '+last.magnetization.toFixed(3));
    $('history-note').textContent='扫描 '+start+'–'+end+' · '+h.length+' 个显示采样；参数变化或手动翻转后重新记录。';
  }
  function syncProbeInputs(){const c=coords(state.selected);for(const axis of ['x','y','z'])$('probe-'+axis).value=String(c[axis]);if(state.crystal)$('probe-site').value=String(c.site);}
  function updateReadouts() {
    const s=state.stats,p=state.probe;
    if(!s)return;
    $('sweep-readout').textContent=String(s.sweeps);$('mag-readout').textContent=signed(s.magnetization,3);$('energy-readout').textContent=s.energyPerSpin.toFixed(3);
    const m=clamp(s.magnetization,-1,1),endpoint=50+50*m,track=$('magnetization-track');
    track.style.setProperty('--bar-start',Math.min(50,endpoint)+'%');track.style.setProperty('--bar-width',Math.abs(endpoint-50)+'%');
    track.dataset.sign=m>0?'up':m<0?'down':'zero';$('mag-readout').dataset.sign=track.dataset.sign;
    $('accept-readout').textContent=s.acceptance==null?'—':(s.acceptance*100).toFixed(1)+'%';
    $('card-order').textContent=signed(s.magnetization,3)+' / '+(s.meanAbsMagnetization==null?'—':s.meanAbsMagnetization.toFixed(3));
    $('card-fluctuation').textContent=(s.susceptibility==null?'—':s.susceptibility.toFixed(3))+' / '+(s.heatCapacity==null?'—':s.heatCapacity.toFixed(3));
    $('card-samples').textContent=s.sampleCount+' / '+API.WINDOW;$('card-field').textContent=signed(s.field,2)+' / '+(s.upFraction*100).toFixed(1)+'%';
    $('card-correlation').textContent=s.neighborCorrelation==null?'—':s.neighborCorrelation.toFixed(3);
    $('card-interface-value').textContent=state.interface?(100*state.interface.siteFraction).toFixed(1)+'% / '+(state.interface.bondFraction==null?'—':(100*state.interface.bondFraction).toFixed(1)+'%'):'—';$('card-size').textContent=s.size+'³ / '+(s.spinCount||s.count).toLocaleString('en-US')+(state.crystal?' 活跃自旋':'');$('card-surface-count').textContent=state.crystal&&!state.crystal.topology.periodic?state.crystal.topology.surfaceCount+' / '+state.crystal.topology.surfaceSpinCount:'周期 · 无自由表面';
    if(p&&p.index===state.selected){
      if(state.crystal&&!p.spin){$('probe-readout').textContent=`晶胞 (${p.x}, ${p.y}, ${p.z}) · 点位 ${p.site+1} · ${p.element}\n`+(p.present?'此组元未启用自旋，不参与相互作用或采样。':'此位置位于开放样品之外，不参与计算。');$('card-probe').textContent='—';}
      else{
        const detail=state.crystal?`${p.element} · 点位 ${p.site+1} · ${p.degree} 个相互作用邻居\nJ 加权邻居和 ${signed(p.weightedSum,2)}`:'六邻居之和 '+signed(p.neighborSum,0);
        $('probe-readout').textContent='位置 ('+p.x+', '+p.y+', '+p.z+') · 自旋 '+signed(p.spin,0)+'\n'+detail+' · 外场 '+signed(s.field,2)+'\n若随机选中此点：ΔE = '+signed(p.deltaEnergy,2)+' · P = '+(p.probability*100).toFixed(1)+'%';
        $('card-probe').textContent=signed(p.deltaEnergy,2)+' / '+(p.probability*100).toFixed(1)+'%';
      }
      stage.dataset.probeSpin=String(p.spin);stage.dataset.probeDelta=p.deltaEnergy==null?'':String(p.deltaEnergy);stage.dataset.probeProbability=p.probability==null?'':String(p.probability);
    }else{$('probe-readout').textContent='正在读取选中的自旋……';$('card-probe').textContent='—';delete stage.dataset.probeSpin;delete stage.dataset.probeDelta;delete stage.dataset.probeProbability;}
    stage.dataset.sweeps=String(s.sweeps);stage.dataset.temperature=String(s.temperature);stage.dataset.field=String(s.field);
    stage.dataset.magnetization=String(s.magnetization);stage.dataset.energy=String(s.energyPerSpin);stage.dataset.correlation=String(s.neighborCorrelation);
    stage.dataset.sampleCount=String(s.sampleCount);stage.dataset.acceptance=s.acceptance==null?'':String(s.acceptance);stage.dataset.size=String(s.size);stage.dataset.probeIndex=String(state.selected);
    drawHistory();updateProbeOverlay();
  }
  function resetWorker(warm=0) {
    clearMicroView();if(microUI)microUI.refresh();
    if(worker){worker.terminate();worker=null;}
    state.generation++;state.request++;state.ready=false;state.failed=false;state.busy=true;state.inFlight='reset';state.accumulator=0;state.lastFrame=0;
    state.pendingConfig=null;state.pendingProbe=null;state.pendingFlips=[];state.spins=null;state.stats=null;state.probe=null;state.interface=null;state.history=[];state.warm=warm;state.flashMask=null;state.flashUntil=0;state.flashRevision++;stage.dataset.flashChanged='0';stage.dataset.flashSites='0';delete stage.dataset.interfaceSites;delete stage.dataset.interfaceBonds;
    stage.dataset.status='loading';stage.dataset.generation=String(state.generation);stage.dataset.sweeps='0';$('stage-error-text').textContent=warm?'正在随机采样预演 '+warm+' 次扫描，请稍候……':'正在建立三维晶格，请稍候……';$('stage-error').hidden=false;
    notice('');syncProbeInputs();updateControls();updatePlayback();state.dirty=true;
    try {
      if(!window.Worker||!API||!INSIGHTS||(state.crystal&&!GRAPH))throw new Error('当前浏览器不支持后台 Worker 或模型资源加载失败。');
      const local=worker=new Worker('ising-worker.js?v=20261101-5'),generation=state.generation,requestId=state.request;
      local.onmessage=event=>{
        const m=event.data;if(local!==worker||m.generation!==generation)return;
        if(m.kind==='progress'){$('stage-error-text').textContent='正在真实预演 '+m.completed+' / '+m.warm+' 次扫描，请稍候……';return;}
        if(m.requestId!==state.request)return;
        if(m.kind==='error'){fail('晶格采样失败：'+m.message);return;}
        if(!['ready','frame','configured','probed','flipped','inspected'].includes(m.kind))return;
        try {
          const spins=new Int8Array(m.spins);
          if(!m.stats||spins.length!==m.stats.count||m.stats.size!==state.size)throw new Error('后台返回的晶格尺寸不匹配。');
          if(m.kind==='frame'||m.kind==='flipped'){clearMicroView();markChanges(state.spins,spins);}
          if(m.kind==='ready'||m.kind==='frame'||m.kind==='flipped'||!state.interface)state.interface=state.crystal?GRAPH.interfaces(state.crystal.topology,spins):INSIGHTS.interfaces(state.size,spins);
          state.spins=spins;state.stats=m.stats;state.probe=m.probe;state.busy=false;state.inFlight='';if(microUI)microUI.refresh();
          if(m.kind==='ready'){
            state.ready=true;stage.dataset.status='ready';$('stage-error').hidden=true;
            if(state.renderer==='webgl')buildObjects();
            addHistory(m.stats,true);requestAnimationFrame(updateFraming);
          } else if(m.kind==='frame')addHistory(m.stats,false);
          else if(m.kind==='configured'||m.kind==='flipped')addHistory(m.stats,true);
          updateControls();updateReadouts();updatePlayback();state.dirty=true;pump();
        } catch(error) { fail('读取晶格失败：'+(error&&error.message||error)); }
      };
      local.onerror=()=>{if(local===worker)fail('后台采样线程启动或运行失败。');};
      const options={size:state.size,temperature:state.temperature,field:state.field,seed:state.seed,initial:state.initial};
      if(state.crystal){const t=state.crystal.topology;Object.assign(options,{structure:state.crystal.structure,cutoff:t.cutoff,jSame:t.jSame,jDifferent:t.jDifferent,activeSpecies:t.activeSpecies,shape:t.shape,pairRules:t.pairRules});}
      local.postMessage({type:'reset',generation,requestId,options,warm,probeIndex:state.selected});
    }catch(error){fail('无法启动后台采样：'+(error&&error.message||error));}
  }
  function post(type,params={}) {
    if(!worker||!state.ready||state.busy||state.failed)return false;
    state.busy=true;state.inFlight=type;state.request++;
    worker.postMessage({type,generation:state.generation,requestId:state.request,...params});updateControls();updatePlayback();return true;
  }
  function pump() {
    if(!state.ready||state.busy||state.failed)return;
    if(state.pendingConfig){const p=state.pendingConfig;state.pendingConfig=null;post('configure',p);return;}
    if(state.pendingFlips.length){const index=state.pendingFlips.shift();post('flip',{index});return;}
    if(state.pendingProbe!==null){const index=state.pendingProbe;state.pendingProbe=null;post('probe',{index});return;}
    updateControls();updatePlayback();
  }
  function queueConfig(temperature=state.temperature,field=state.field) {
    if(!state.ready||state.failed)return;
    if(temperature===state.temperature&&field===state.field)return;
    state.temperature=temperature;state.field=field;state.preset=null;
    state.pendingConfig={temperature,field};updateControls();pump();
  }
  function setProbe(index,expand=true) {
    if(!state.ready||!Number.isInteger(index)||index<0||index>=state.size**3*siteMultiplicity())return;
    state.selected=index;if(state.domain&&state.domain.labels[index]){state.domain.selected=state.domain.labels[index];refreshDomainSelection();}syncProbeInputs();const c=coords(index);
    if(expand&&c.z>=state.layers)state.layers=c.z+1;
    state.pendingProbe=index;state.probe=null;updateControls();updateReadouts();state.dirty=true;pump();
  }
  function flipProbe() {
    if(!state.ready||state.failed)return;
    if(state.crystal&&state.spins[state.selected]===0){notice(state.crystal.topology.present[state.selected]?'该组元未启用自旋，无法翻转。':'该位置在样品之外，无法翻转。');return;}
    if(state.pendingFlips.length>=8){notice('正在处理翻转，请稍候。');return;}
    state.pendingProbe=null;state.pendingFlips.push(state.selected);notice('');pump();
  }
  function applyPreset(name) {
    const p=PRESETS[name];if(!p||!state.ready||state.failed)return;
    state.preset=name;state.field=p.field;state.initial=p.initial;
    if(state.crystal){
      const z=state.crystal.topology.meanAbsField,mid=clamp(z*.75,.5,15);
      state.temperature=clamp(name==='cold'?z*.25:name==='hot'?z*1.5:name==='quench'?z*.32:name==='field'?mid*1.15:mid,.25,20);
    }else state.temperature=p.temperature;
    resetWorker(p.warm);
  }
  function revealScene() {
    if(compact.matches){if(!$('knowledge-panel').hidden)$('toggle-knowledge').click();if(!$('control-panel').hidden)$('toggle-controls').click();}
  }
  function bounds() {
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
  function updateFraming() {
    if(!state.width||!state.height)return;
    const hud=document.querySelector('.lab-bottom').getBoundingClientRect(),hudTop=hud.top-stage.getBoundingClientRect().top;
    const safe=state.height-hudTop+12,legendMin=state.width<=360?174:150,panelMin=state.height<=540?12:state.width<=360?180:158;
    stage.style.setProperty('--vortex-legend-bottom',Math.ceil(Math.max(legendMin,safe))+'px');
    $('workbench').style.setProperty('--vortex-panel-bottom',Math.ceil(Math.min(state.height-130,Math.max(panelMin,safe)))+'px');
    const box=state.bounds=bounds(),b=basis();
    state.pixels=Math.max(1,Math.min(box.width*.91/5.6,box.height*.90/5.8))*state.camera.zoom;
    if(camera){
      camera.left=-box.centerX/state.pixels;camera.right=(state.width-box.centerX)/state.pixels;
      camera.top=box.centerY/state.pixels;camera.bottom=-(state.height-box.centerY)/state.pixels;camera.near=.1;camera.far=100;
      camera.position.set(b.front.x*20,b.front.y*20,b.front.z*20);camera.up.set(0,1,0);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    }
    updateProbeOverlay();state.dirty=true;
  }
  function resize() {
    const box=stage.getBoundingClientRect();if(!box.width||!box.height)return;
    state.width=box.width;state.height=box.height;state.dpr=Math.max(.25,Math.min(window.devicePixelRatio||1,1.5,1800/Math.max(box.width,box.height)));
    if(renderer){renderer.setPixelRatio(state.dpr);renderer.setSize(box.width,box.height,false);}
    else if(ctx){canvas.width=Math.round(box.width*state.dpr);canvas.height=Math.round(box.height*state.dpr);canvas.style.width='100%';canvas.style.height='100%';ctx.setTransform(state.dpr,0,0,state.dpr,0,0);}
    stage.dataset.renderScale=String(state.dpr);updateFraming();
  }
  function disposeObjects() {
    if(!objects)return;
    if(scene)scene.remove(objects.group);
    objects.group.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material){const materials=Array.isArray(node.material)?node.material:[node.material];for(const m of materials)m.dispose();}});
    objects=null;
  }
  function makeGlowTexture() {
    if(glowMap)return glowMap;
    const image=document.createElement('canvas');image.width=image.height=64;
    const q=image.getContext('2d'),g=q.createRadialGradient(32,32,1,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.20,'rgba(255,255,255,.95)');g.addColorStop(.42,'rgba(255,255,255,.38)');g.addColorStop(.72,'rgba(255,255,255,.07)');g.addColorStop(1,'rgba(255,255,255,0)');
    q.fillStyle=g;q.fillRect(0,0,64,64);glowMap=new THREE.CanvasTexture(image);glowMap.colorSpace=THREE.SRGBColorSpace;return glowMap;
  }
  function makeReticleTexture() {
    if(reticleMap)return reticleMap;
    const image=document.createElement('canvas');image.width=image.height=128;const q=image.getContext('2d');
    q.strokeStyle='rgba(255,245,218,.95)';q.lineWidth=3;q.beginPath();q.arc(64,64,37,0,Math.PI*2);q.stroke();
    q.strokeStyle='rgba(255,220,170,.95)';q.lineWidth=3;q.beginPath();
    for(const [x,y,sx,sy] of [[16,16,1,1],[112,16,-1,1],[16,112,1,-1],[112,112,-1,-1]]){q.moveTo(x,y+sy*14);q.lineTo(x,y);q.lineTo(x+sx*14,y);}
    q.stroke();reticleMap=new THREE.CanvasTexture(image);reticleMap.colorSpace=THREE.SRGBColorSpace;return reticleMap;
  }
  function arrowGeometry() {
    const stem=new THREE.CylinderGeometry(.050,.050,.43,7),head=new THREE.ConeGeometry(.15,.28,7),core=new THREE.OctahedronGeometry(.105,0);
    stem.translate(0,-.13,0);head.translate(0,.205,0);
    const originals=[stem,head,core],gs=originals.map(g=>g.index?g.toNonIndexed():g.clone()),positions=[],normals=[];
    for(const g of gs){positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();}
    for(const g of originals)g.dispose();const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return geometry;
  }
  function groundArc(group,radius,start,end,color,opacity,y) {
    const pts=[];for(let i=0;i<=64;i++){const a=start+(end-start)*i/64;pts.push(new THREE.Vector3(radius*Math.cos(a),y,radius*Math.sin(a)));}
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false})));
  }
  function buildObjects() {
    if(!scene||!THREE||!state.spins)return;disposeObjects();
    const n=state.size,count=state.spins.length,spacing=state.crystal?state.crystal.visual.spacing:SIDE/(n-1),group=new THREE.Group();group.name='ising-lattice';scene.add(group);
    const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.31,metalness:.16});
    const arrows=new THREE.InstancedMesh(arrowGeometry(),material,count),voxels=new THREE.InstancedMesh(new THREE.BoxGeometry(.80,.80,.80),material.clone(),count);
    arrows.name='ising-arrows';voxels.name='ising-voxels';arrows.frustumCulled=false;voxels.frustumCulled=false;
    arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);voxels.instanceMatrix.setUsage(THREE.StaticDrawUsage);group.add(arrows,voxels);
    let neutral=null;if(state.crystal){neutral=new THREE.InstancedMesh(new THREE.SphereGeometry(.22,10,8),new THREE.MeshStandardMaterial({color:0x8ba69a,transparent:true,opacity:.6,roughness:.65,depthWrite:false}),count);neutral.name='ising-inactive-sites';neutral.frustumCulled=false;neutral.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(neutral);}
    const dummy=new THREE.Object3D(),positions=new Float32Array(count*3),colors=new Float32Array(count*3);
    for(let i=0;i<count;i++){
      const p=point(i);positions[3*i]=p.x;positions[3*i+1]=p.y;positions[3*i+2]=p.z;
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(spacing);dummy.updateMatrix();voxels.setMatrixAt(i,dummy.matrix);
    }
    voxels.instanceMatrix.needsUpdate=true;
    const cloudGeometry=new THREE.BufferGeometry();cloudGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));cloudGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const glow=new THREE.Points(cloudGeometry,new THREE.PointsMaterial({map:makeGlowTexture(),size:7,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false}));
    glow.name='ising-glow';glow.frustumCulled=false;glow.renderOrder=2;group.add(glow);
    const dots=new THREE.Points(cloudGeometry,new THREE.PointsMaterial({map:makeGlowTexture(),size:5,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.92,alphaTest:.20,depthWrite:true}));
    dots.name='ising-points';dots.frustumCulled=false;dots.renderOrder=1;group.add(dots);
    const flashGeometry=new THREE.BufferGeometry();flashGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));flashGeometry.setDrawRange(0,0);
    const flash=new THREE.Points(flashGeometry,new THREE.PointsMaterial({map:makeGlowTexture(),color:0xfff2d8,size:10,sizeAttenuation:false,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    flash.name='ising-net-changes';flash.frustumCulled=false;flash.renderOrder=3;group.add(flash);
    let edgeGeometry,sliceGeometry,planeGeometry;
    const d=(SIDE+spacing)/2;
    if(state.crystal){
      const coords=[],visual=state.crystal.visual,frame=visual.frame;if(visual.shapeEdges.length){for(const [a,b] of visual.shapeEdges)coords.push(a.x,a.y,a.z,b.x,b.y,b.z);}else for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit)){const a=frame[i],b=frame[i|bit];coords.push(a.x,a.y,a.z,b.x,b.y,b.z);}
      edgeGeometry=new THREE.BufferGeometry();edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
      sliceGeometry=new THREE.BufferGeometry();sliceGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(12),3).setUsage(THREE.DynamicDrawUsage));
      planeGeometry=new THREE.BufferGeometry();planeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(18),3).setUsage(THREE.DynamicDrawUsage));
    }else{
      const cageGeometry=new THREE.BoxGeometry(SIDE+spacing,SIDE+spacing,SIDE+spacing);edgeGeometry=new THREE.EdgesGeometry(cageGeometry);cageGeometry.dispose();
      const slicePoints=[[-d,-d,0],[d,-d,0],[d,d,0],[-d,d,0]].map(p=>new THREE.Vector3(...p));sliceGeometry=new THREE.BufferGeometry().setFromPoints(slicePoints);planeGeometry=new THREE.PlaneGeometry(2*d,2*d);
    }
    const edges=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:0x80b9bd,transparent:true,opacity:.37}));edges.name='ising-periodic-frame';group.add(edges);
    const slice=new THREE.LineLoop(sliceGeometry,new THREE.LineBasicMaterial({color:0xa2e6df,transparent:true,opacity:.65,depthWrite:false}));slice.name='ising-cut-outline';group.add(slice);
    const plane=new THREE.Mesh(planeGeometry,new THREE.MeshBasicMaterial({color:0x7bd8cf,transparent:true,opacity:.025,side:THREE.DoubleSide,depthWrite:false}));plane.name='ising-cut-plane';group.add(plane);
    const floorY=-SIDE/2-spacing*.85,floor=new THREE.GridHelper(5,16,0x548b87,0x335c60);floor.position.y=floorY;floor.material.transparent=true;floor.material.opacity=.16;group.add(floor);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(2.42,64),new THREE.MeshBasicMaterial({color:0x459c98,transparent:true,opacity:.035,side:THREE.DoubleSide,depthWrite:false}));
    disc.rotation.x=-Math.PI/2;disc.position.y=floorY-.012;group.add(disc);
    groundArc(group,2.42,0,Math.PI*2,0x65c6c6,.27,floorY+.006);
    groundArc(group,2.58,.12,Math.PI*.82,0xf6bd8a,.35,floorY+.007);
    groundArc(group,2.58,Math.PI*1.12,Math.PI*1.82,0x77ded9,.32,floorY+.007);
    const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:makeReticleTexture(),transparent:true,opacity:.86,depthTest:false,depthWrite:false}));
    marker.name='ising-probe-marker';marker.renderOrder=6;marker.scale.set(spacing*1.85,spacing*1.85,1);group.add(marker);
    const neighborCapacity=state.crystal?Math.max(6,Math.min(128,state.crystal.topology.maxDegree)):6;
    const neighborMarkers=new THREE.InstancedMesh(new THREE.OctahedronGeometry(.38,0),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:.9,depthTest:false,depthWrite:false}),neighborCapacity);
    neighborMarkers.name='ising-neighbor-markers';neighborMarkers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);neighborMarkers.frustumCulled=false;neighborMarkers.renderOrder=5;neighborMarkers.count=0;group.add(neighborMarkers);
    const lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(neighborCapacity*6),3).setUsage(THREE.DynamicDrawUsage));lineGeometry.setDrawRange(0,0);
    const neighborLines=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0xffe6c4,transparent:true,opacity:.72,depthTest:false,depthWrite:false}));
    neighborLines.name='ising-neighbor-links';neighborLines.frustumCulled=false;neighborLines.renderOrder=5;group.add(neighborLines);
    const bondGeometry=new THREE.BufferGeometry();bondGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(1600*6),3).setUsage(THREE.DynamicDrawUsage));bondGeometry.setDrawRange(0,0);
    const bondLines=new THREE.LineSegments(bondGeometry,new THREE.LineBasicMaterial({color:0xffd18d,transparent:true,opacity:.68,depthWrite:false}));bondLines.name='ising-highlighted-bonds';bondLines.frustumCulled=false;bondLines.renderOrder=4;group.add(bondLines);
    const cycleGeometry=new THREE.BufferGeometry();cycleGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(5000*6),3).setUsage(THREE.DynamicDrawUsage));cycleGeometry.setDrawRange(0,0);
    const cycleLines=new THREE.LineSegments(cycleGeometry,new THREE.LineBasicMaterial({color:0xff7ca9,transparent:true,opacity:.98,depthTest:false,depthWrite:false}));cycleLines.name='ising-frustrated-loop';cycleLines.frustumCulled=false;cycleLines.renderOrder=6;group.add(cycleLines);
    objects={group,arrows,voxels,neutral,glow,dots,flash,slice,plane,marker,neighborMarkers,neighborLines,neighborCapacity,bondLines,bondKey:'',cycleLines,cycleRef:null,cycleKey:'',domainColors:new Map(),muted:new THREE.Color('#354d4a'),dummy,rendered:new Int8Array(count),renderedVisible:new Int8Array(count),spacing,
      elementColors:state.crystal?state.crystal.visual.colors.map(c=>new THREE.Color(c)):[],colorMode:state.colorMode,
      up:new THREE.Color('#ffc08f'),down:new THREE.Color('#7de2df'),flashRevision:-1,flashLayer:-1,flashBudget:-1};
  }
  function syncObjects() {
    if(!objects||!state.spins)return;
    const {arrows,voxels,neutral,glow,dots,flash,slice,plane,marker,neighborMarkers,neighborLines,neighborCapacity,dummy,rendered,renderedVisible,spacing,up,down}=objects,count=visibleTotal();
    const cycle=renderedCycle();objects.cycleLines.visible=!!cycle;
    if(cycle&&(objects.cycleRef!==cycle.ref||objects.cycleKey!==cycle.key)){const attr=objects.cycleLines.geometry.attributes.position;attr.array.set(cycle.positions);attr.needsUpdate=true;objects.cycleLines.geometry.setDrawRange(0,cycle.shown*2);objects.cycleRef=cycle.ref;objects.cycleKey=cycle.key;}
    const highlights=highlightedSegments();objects.bondLines.visible=!!highlights;
    if(highlights&&objects.bondKey!==highlights.key){const a=objects.bondLines.geometry.attributes.position;a.array.set(highlights.positions);a.needsUpdate=true;objects.bondLines.geometry.setDrawRange(0,highlights.shown*2);objects.bondKey=highlights.key;}
    arrows.count=count;voxels.count=count;if(neutral)neutral.count=count;arrows.visible=state.view==='arrows';voxels.visible=state.view==='voxels';dots.visible=state.view==='points';glow.visible=state.view!=='voxels';glow.geometry.setDrawRange(0,count);
    const cell=spacing*state.pixels;dots.material.size=clamp(cell*.60,3,9);glow.material.size=clamp(cell*.95,4,12);glow.material.opacity=(state.view==='points'?.045:.07)*clamp((cell-3)/9,.2,1);
    flash.material.size=clamp(cell*.72,4,9);
    if(objects.colorMode!==state.colorMode){renderedVisible.fill(0);objects.colorMode=state.colorMode;}
    let changed=false;const attr=glow.geometry.attributes.color,pos=glow.geometry.attributes.position;
    for(let i=0;i<count;i++){
      const spin=state.spins[i],visible=isVisibleSite(i),v=visible?1:-1;if(rendered[i]===spin&&renderedVisible[i]===v)continue;rendered[i]=spin;renderedVisible[i]=v;changed=true;
      const p=point(i),active=visible&&spin!==0;dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(spin>0?0:Math.PI,0,0);dummy.scale.setScalar(active?spacing*(state.domain&&state.domain.selected&&state.domain.labels[i]!==state.domain.selected ? .58 : 1):0);dummy.updateMatrix();arrows.setMatrixAt(i,dummy.matrix);
      dummy.rotation.set(0,0,0);dummy.updateMatrix();voxels.setMatrixAt(i,dummy.matrix);
      if(neutral){dummy.scale.setScalar(visible&&!spin?spacing:0);dummy.updateMatrix();neutral.setMatrixAt(i,dummy.matrix);}
      pos.setXYZ(i,active?p.x:1e6,active?p.y:1e6,active?p.z:1e6);
      let color=state.crystal&&state.colorMode==='element'?objects.elementColors[i%siteMultiplicity()]:(spin>0?up:down);
      if(state.colorMode==='domain'&&state.domain&&spin){const id=state.domain.labels[i];if(state.domain.selected&&id!==state.domain.selected)color=objects.muted;else{if(!objects.domainColors.has(id))objects.domainColors.set(id,new THREE.Color(domainColor(id)));color=objects.domainColors.get(id);}}
      arrows.setColorAt(i,color);voxels.setColorAt(i,color);attr.setXYZ(i,color.r,color.g,color.b);
    }
    if(changed){arrows.instanceMatrix.needsUpdate=true;voxels.instanceMatrix.needsUpdate=true;if(neutral)neutral.instanceMatrix.needsUpdate=true;pos.needsUpdate=true;if(arrows.instanceColor)arrows.instanceColor.needsUpdate=true;if(voxels.instanceColor)voxels.instanceColor.needsUpdate=true;attr.needsUpdate=true;}
    if(state.crystal){const p=crystalSlice(),a=slice.geometry.attributes.position,b=plane.geometry.attributes.position;for(let i=0;i<4;i++)a.setXYZ(i,p[i].x,p[i].y,p[i].z);[0,1,2,0,2,3].forEach((k,i)=>b.setXYZ(i,p[k].x,p[k].y,p[k].z));a.needsUpdate=true;b.needsUpdate=true;}
    else{const cutZ=-SIDE/2+(state.layers-1)*spacing+spacing*.5;slice.position.z=cutZ;plane.position.z=cutZ;}
    slice.visible=plane.visible=state.layers<state.size&&(!state.crystal||!state.crystal.visual.shapeEdges.length);
    const budget=state.width<=520?96:260;
    if(objects.flashRevision!==state.flashRevision||objects.flashLayer!==state.layers||objects.flashBudget!==budget){
      const a=flash.geometry.attributes.position.array;let j=0;
      for(const i of visibleFlashes()){const p=point(i);a[j++]=p.x;a[j++]=p.y;a[j++]=p.z;}
      flash.geometry.attributes.position.needsUpdate=true;flash.geometry.setDrawRange(0,j/3);objects.flashRevision=state.flashRevision;objects.flashLayer=state.layers;objects.flashBudget=budget;
    }
    const remaining=state.showFlashes?clamp((state.flashUntil-performance.now())/420,0,1):0;flash.visible=remaining>0&&flash.geometry.drawRange.count>0;flash.material.opacity=remaining*.32;
    marker.visible=state.selected<count&&(!state.crystal||!!state.crystal.topology.present[state.selected]);if(marker.visible){const p=point(state.selected);marker.position.set(p.x,p.y,p.z);marker.material.opacity=state.tool==='probe'?.95:.56;}
    const showNeighbors=state.tool==='probe'&&state.selected<count&&(!state.crystal||!!state.crystal.topology.present[state.selected]);neighborMarkers.visible=neighborLines.visible=showNeighbors;
    let shown=0,linked=0;
    if(showNeighbors){
      const selected=point(state.selected),line=neighborLines.geometry.attributes.position;
      for(const neighbor of neighborsOf(state.selected)){
        if(neighbor.index>=count)continue;if(shown>=neighborCapacity)break;const p=point(neighbor.index);
        dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(spacing);dummy.updateMatrix();neighborMarkers.setMatrixAt(shown,dummy.matrix);
        neighborMarkers.setColorAt(shown,state.crystal&&state.colorMode==='element'?objects.elementColors[neighbor.index%siteMultiplicity()]:(state.spins[neighbor.index]>0?up:down));shown++;
        if(!neighbor.wrap){line.setXYZ(linked*2,selected.x,selected.y,selected.z);line.setXYZ(linked*2+1,p.x,p.y,p.z);linked++;}
      }
      neighborMarkers.count=shown;neighborMarkers.instanceMatrix.needsUpdate=true;if(neighborMarkers.instanceColor)neighborMarkers.instanceColor.needsUpdate=true;
      line.needsUpdate=true;neighborLines.geometry.setDrawRange(0,linked*2);
    }
    stage.dataset.neighborSites=String(shown);stage.dataset.neighborLinks=String(linked);stage.dataset.neighborTruncated=String(showNeighbors&&neighborsOf(state.selected).length>neighborCapacity);
    objects.group.updateMatrixWorld(true);
  }
  function replaceCanvas() {
    const hadFocus=document.activeElement===canvas,next=canvas.cloneNode(false);canvas.replaceWith(next);canvas=next;bindCanvas();updateCanvasAccessibility();if(hadFocus)canvas.focus({preventScroll:true});
  }
  function useCanvas(reason,replace=true) {
    if(renderer){try{disposeObjects();renderer.dispose();}catch(_){}renderer=null;}
    scene=null;camera=null;raycaster=null;objects=null;
    if(replace)replaceCanvas();ctx=canvas.getContext('2d',{alpha:true});if(!ctx)throw new Error('WebGL 与 Canvas 2D 均不可用。');
    state.renderer='canvas';stage.dataset.renderer='canvas';$('stage-fallback').textContent=reason||'WebGL 不可用，已切换到相同自旋数据的 Canvas 投影。';$('stage-fallback').hidden=false;resize();state.dirty=true;
  }
  function setupRenderer() {
    try {
      if(!THREE||typeof THREE.WebGLRenderer!=='function')throw new Error('未加载 WebGL');
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);raycaster=new THREE.Raycaster();
      scene.add(new THREE.AmbientLight(0xc9ece3,1.05));const light=new THREE.DirectionalLight(0xffe1c1,1.5);light.position.set(5,8,7);scene.add(light);
      const fill=new THREE.DirectionalLight(0x90e5e3,.72);fill.position.set(-5,-2,-5);scene.add(fill);
      state.renderer='webgl';stage.dataset.renderer='webgl';$('stage-fallback').hidden=true;
    }catch(error){useCanvas('WebGL 不可用，已切换到相同自旋数据的 Canvas 投影。',true);}
  }
  function drawWebGL() {
    if(!objects)buildObjects();syncObjects();renderer.render(scene,camera);
    if((renderer.info.programs||[]).some(p=>p.diagnostics&&p.diagnostics.runnable===false))throw new Error('着色器编译失败。');
    if(renderer.getContext().isContextLost())throw new Error('WebGL 上下文丢失。');
  }
  function drawCanvas() {
    ctx.clearRect(0,0,state.width,state.height);const count=visibleTotal(),spacing=state.crystal?state.crystal.visual.spacing:SIDE/(state.size-1),sites=[];
    function lineBetween(a,b){a=project(a);b=project(b);ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
    function frame() {
      const d=SIDE/2+spacing*.5,corners=[];if(state.crystal)corners.push(...state.crystal.visual.frame.map(project));else for(const z of [-d,d])for(const y of [-d,d])for(const x of [-d,d])corners.push(project(vec(x,y,z)));
      ctx.strokeStyle='rgba(137,196,194,.38)';ctx.lineWidth=1;ctx.beginPath();
      if(state.crystal&&state.crystal.visual.shapeEdges.length){for(const [a,b] of state.crystal.visual.shapeEdges)lineBetween(a,b);}else for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit)){const a=corners[i],b=corners[i|bit];ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();
      if(state.layers<state.size&&(!state.crystal||!state.crystal.visual.shapeEdges.length)){
        ctx.strokeStyle='rgba(158,231,219,.65)';ctx.beginPath();
        if(state.crystal){const p=crystalSlice();for(let i=0;i<4;i++)lineBetween(p[i],p[(i+1)%4]);}
        else{const z=-SIDE/2+(state.layers-1)*spacing+spacing*.5;lineBetween(vec(-d,-d,z),vec(d,-d,z));lineBetween(vec(d,-d,z),vec(d,d,z));lineBetween(vec(d,d,z),vec(-d,d,z));lineBetween(vec(-d,d,z),vec(-d,-d,z));}ctx.stroke();
      }
    }
    function platform() {
      const y=-SIDE/2-spacing*.85;ctx.strokeStyle='rgba(116,203,197,.23)';ctx.lineWidth=1;ctx.beginPath();
      for(let i=0;i<=64;i++){const a=i*Math.PI*2/64,p=project(vec(2.42*Math.cos(a),y,2.42*Math.sin(a)));if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}ctx.stroke();
      ctx.strokeStyle='rgba(87,159,155,.13)';ctx.beginPath();for(let i=-6;i<=6;i++){const d=i*2.5/6;lineBetween(vec(d,y,-2.5),vec(d,y,2.5));lineBetween(vec(-2.5,y,d),vec(2.5,y,d));}ctx.stroke();
    }
    platform();frame();
    for(let i=0;i<count;i++){if(!isVisibleSite(i))continue;const q=project(point(i));sites.push({i,x:q.x,y:q.y,depth:q.depth});}
    sites.sort((a,b)=>a.depth-b.depth);const size=Math.max(1,spacing*state.pixels),b=basis();
    for(const q of sites){
      const spin=state.spins[q.i],warm=spin>0;let color=!spin?'#8ba69a':state.crystal&&state.colorMode==='element'?state.crystal.visual.colors[q.i%siteMultiplicity()]:(warm?'#ffc08f':'#7de2df');if(spin&&state.colorMode==='domain'&&state.domain){const id=state.domain.labels[q.i];color=state.domain.selected&&id!==state.domain.selected?'#354d4a':domainColor(id);}ctx.strokeStyle=color;ctx.fillStyle=color;
      if(!spin){ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(q.x,q.y,Math.max(1,size*.18),0,Math.PI*2);ctx.fill();continue;}
      if(state.view==='voxels'){const r=Math.max(.65,size*.40);ctx.globalAlpha=.90;ctx.fillRect(q.x-r,q.y-r,r*2,r*2);}
      else if(state.view==='points'){ctx.globalAlpha=.90;ctx.beginPath();ctx.arc(q.x,q.y,Math.max(.8,size*.24),0,Math.PI*2);ctx.fill();}
      else {
        const dx=b.right.y*spin,dy=-b.up.y*spin,len=size*.36,ax=q.x-dx*len,ay=q.y-dy*len,bx=q.x+dx*len,by=q.y+dy*len;
        ctx.globalAlpha=.95;ctx.lineWidth=Math.max(.7,size*.10);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
        const norm=Math.hypot(dx,dy)||1,px=-dy/norm,py=dx/norm,head=Math.max(1,size*.16);
        ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx-dx*head+px*head*.65,by-dy*head+py*head*.65);ctx.lineTo(bx-dx*head-px*head*.65,by-dy*head-py*head*.65);ctx.closePath();ctx.fill();
      }
    }
    ctx.globalAlpha=1;state.screenSites=sites;
    const remaining=state.showFlashes?clamp((state.flashUntil-performance.now())/420,0,1):0,flashIndices=visibleFlashes();
    if(remaining>0&&flashIndices.length){ctx.fillStyle='#fff3d7';ctx.globalAlpha=remaining*.35;for(const i of flashIndices){const q=project(point(i));ctx.beginPath();ctx.arc(q.x,q.y,Math.max(1.3,size*.22),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
    const cycle=renderedCycle();if(cycle){ctx.lineWidth=2;ctx.strokeStyle='rgba(255,124,169,.95)';ctx.beginPath();const a=cycle.positions;for(let k=0;k<a.length;k+=6){const p=project(vec(a[k],a[k+1],a[k+2])),q=project(vec(a[k+3],a[k+4],a[k+5]));ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}ctx.stroke();}
    const highlights=highlightedSegments();if(highlights){ctx.lineWidth=1;ctx.strokeStyle='rgba(255,209,141,.67)';ctx.beginPath();const a=highlights.positions;for(let k=0;k<a.length;k+=6){const p=project(vec(a[k],a[k+1],a[k+2])),q=project(vec(a[k+3],a[k+4],a[k+5]));ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);}ctx.stroke();}
    let shown=0,linked=0;
    if(state.tool==='probe'&&state.selected<count){
      const p=project(point(state.selected));ctx.lineWidth=1;ctx.strokeStyle='rgba(255,229,190,.8)';ctx.beginPath();
      for(const neighbor of neighborsOf(state.selected)){if(neighbor.index>=count)continue;shown++;if(!neighbor.wrap){const q=project(point(neighbor.index));ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);linked++;}}ctx.stroke();
      for(const neighbor of neighborsOf(state.selected)){if(neighbor.index>=count)continue;const q=project(point(neighbor.index));ctx.strokeStyle=state.crystal&&state.colorMode==='element'?state.crystal.visual.colors[neighbor.index%siteMultiplicity()]:(state.spins[neighbor.index]>0?'#ffc08f':'#7de2df');ctx.beginPath();ctx.arc(q.x,q.y,Math.max(3,size*.36),0,Math.PI*2);ctx.stroke();}
    }
    stage.dataset.neighborSites=String(shown);stage.dataset.neighborLinks=String(linked);
    if(state.selected<count&&(!state.crystal||state.crystal.topology.present[state.selected])){const p=project(point(state.selected)),r=Math.max(4,size*.55);ctx.strokeStyle='#fff2cb';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.moveTo(p.x-r-3,p.y);ctx.lineTo(p.x-r-1,p.y);ctx.moveTo(p.x+r+1,p.y);ctx.lineTo(p.x+r+3,p.y);ctx.stroke();}
  }
  function draw() {
    if(!state.ready||state.failed||!state.spins)return;
    try {if(state.renderer==='webgl')drawWebGL();else drawCanvas();}
    catch(error){if(state.renderer==='webgl'){try{useCanvas('WebGL 渲染中断，继续使用同一自旋数据的 Canvas 投影。',true);drawCanvas();}catch(next){fail('模型渲染不可用：'+next.message);}}else fail('模型渲染不可用：'+error.message);}
    if(!state.failed){stage.dataset.drawWidth=String(state.width);stage.dataset.drawHeight=String(state.height);stage.dataset.drawSpins=String(visibleCount());stage.dataset.drawSweeps=String(state.stats.sweeps);stage.dataset.drawView=state.view;stage.dataset.drawLayers=String(state.layers);}
  }
  function animate(now) {
    if(!state.lastFrame)state.lastFrame=now;
    const elapsed=clamp((now-state.lastFrame)/1000,0,.12);state.lastFrame=now;
    if(state.ready&&state.playing&&!state.failed){
      state.accumulator=Math.min(8,state.accumulator+elapsed*12*state.speed);
      if(state.accumulator>=1&&!state.busy&&!state.pendingConfig&&!state.pendingFlips.length&&state.pendingProbe===null){
        const steps=Math.min(4,Math.floor(state.accumulator));state.accumulator-=steps;post('advance',{sweeps:steps});
      }
    }
    if(state.flashUntil&&state.ready){if(now<state.flashUntil)state.dirty=true;else{state.flashUntil=0;state.dirty=true;}}
    if(state.dirty&&state.ready&&!state.failed&&now-state.lastDraw>=(state.drag?32:45)){state.dirty=false;state.lastDraw=now;draw();}
    requestAnimationFrame(animate);
  }
  function pick(event) {
    if(!state.ready)return null;
    const r=canvas.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;
    if(state.renderer==='webgl'&&objects&&camera&&raycaster){
      updateFraming();syncObjects();raycaster.setFromCamera(new THREE.Vector2(x/r.width*2-1,1-y/r.height*2),camera);
      if(state.view!=='points'){const hits=raycaster.intersectObject(state.view==='arrows'?objects.arrows:objects.voxels,false),hit=hits.find(h=>isVisibleSite(h.instanceId));if(hit)return hit.instanceId;}
    }
    // Narrow arrow geometry can be much smaller than a finger. If no exact
    // ray hit exists, select a nearby projected, actually visible lattice
    // site; frontmost sites win close ties. This does not alter the physics.
    if(state.renderer==='canvas'&&state.dirty)drawCanvas();
    const radius=Math.max(event.pointerType==='touch'?12:6,(state.crystal?state.crystal.visual.spacing:SIDE/(state.size-1))*state.pixels*.52),limit=radius*radius,count=visibleTotal();
    let best=null,bestScore=Infinity;const b=basis(),box=state.bounds;
    for(let i=0;i<count;i++){
      if(!isVisibleSite(i))continue;const p=point(i),sx=box.centerX+dot(p,b.right)*state.pixels,sy=box.centerY-dot(p,b.up)*state.pixels;
      const d=(sx-x)*(sx-x)+(sy-y)*(sy-y);if(d>limit)continue;
      const score=d-dot(p,b.front)*radius*.4;if(score<bestScore){bestScore=score;best=i;}
    }
    return best;
  }
  function bindCanvas() {
    if(bound.has(canvas))return;bound.add(canvas);
    canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();if(state.renderer!=='webgl')return;
      try{useCanvas('WebGL 已中断，继续使用同一自旋数据的 Canvas 投影。',true);}catch(error){fail('模型渲染不可用：'+error.message);}
    });
    canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0||state.failed||!state.ready)return;
      if(state.tool==='probe'){const index=pick(event);if(index!==null)setProbe(index);event.preventDefault();return;}
      state.drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:state.camera.yaw,pitch:state.camera.pitch};canvas.setPointerCapture(event.pointerId);event.preventDefault();
    });
    canvas.addEventListener('pointermove',event=>{
      if(!state.drag||state.drag.id!==event.pointerId)return;
      state.camera.yaw=state.drag.yaw-(event.clientX-state.drag.x)*.007;state.camera.pitch=clamp(state.drag.pitch+(event.clientY-state.drag.y)*.007,-1.2,1.2);updateFraming();event.preventDefault();
    });
    function end(event){if(!state.drag||state.drag.id!==event.pointerId)return;state.drag=null;try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch(_){}state.dirty=true;}
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.camera.zoom=clamp(state.camera.zoom*Math.exp(-event.deltaY*.001),.55,1.7);updateFraming();},{passive:false});
    canvas.addEventListener('dblclick',event=>{if(state.tool==='orbit'){event.preventDefault();resetView();}});
    canvas.addEventListener('keydown',event=>{
      if(event.key===' '){event.preventDefault();setPlaying(!state.playing);return;}
      if(event.key==='Enter'&&state.tool==='probe'){
        event.preventDefault();const n=Math.floor(state.size/2),cz=Math.min(n,state.layers-1);let target=centralIndex();
        if((state.boundaryOnly||state.surfaceOnly)&&!isVisibleSite(target)){
          let best=Infinity;target=null;const count=visibleTotal();
          for(let i=0;i<count;i++)if(isVisibleSite(i)){const p=coords(i),d=(p.x-n)**2+(p.y-n)**2+(p.z-cz)**2;if(d<best){best=d;target=i;}}
          if(target===null){notice('当前可见层没有符合筛选条件的格点；可关闭筛选或增加显示层。');return;}
        }
        notice('');setProbe(target);return;
      }
      if(event.key==='+'||event.key==='='){event.preventDefault();state.camera.zoom=clamp(state.camera.zoom*1.1,.55,1.7);updateFraming();return;}
      if(event.key==='-'||event.key==='_'){event.preventDefault();state.camera.zoom=clamp(state.camera.zoom/1.1,.55,1.7);updateFraming();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
      if(event.key==='ArrowLeft')state.camera.yaw-=.1;if(event.key==='ArrowRight')state.camera.yaw+=.1;
      if(event.key==='ArrowUp')state.camera.pitch=clamp(state.camera.pitch+.1,-1.2,1.2);if(event.key==='ArrowDown')state.camera.pitch=clamp(state.camera.pitch-.1,-1.2,1.2);
      updateFraming();
    });
  }
  function resetView(){state.camera={yaw:.48,pitch:.29,zoom:1};updateFraming();}
  function saveImage() {
    if(!state.ready||!state.stats)return;
    try {
      if(state.dirty)draw();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const q=out.getContext('2d');
      if(background.complete&&background.naturalWidth){const k=Math.max(out.width/background.naturalWidth,out.height/background.naturalHeight),w=background.naturalWidth*k,h=background.naturalHeight*k;q.drawImage(background,(out.width-w)/2,(out.height-h)/2,w,h);}
      else {q.fillStyle='#10282a';q.fillRect(0,0,out.width,out.height);}
      const shade=q.createLinearGradient(0,0,0,out.height);shade.addColorStop(0,'rgba(3,11,17,.25)');shade.addColorStop(1,'rgba(3,11,17,.48)');q.fillStyle=shade;q.fillRect(0,0,out.width,out.height);q.drawImage(canvas,0,0);
      q.fillStyle='rgba(3,13,18,.80)';q.fillRect(0,out.height-34,out.width,34);q.fillStyle='#e2eee7';q.font=Math.max(12,Math.round(out.width/100))+'px sans-serif';q.textBaseline='bottom';
      const s=state.stats;q.fillText('伊辛采样 · '+(state.crystal?state.crystal.structure.name+' · ':'')+s.size+'³ · T '+s.temperature.toFixed(2)+' · h '+signed(s.field,2)+' · '+s.sweeps+' 扫描 · 显示 '+state.layers+'/'+s.size+' 层'+(state.boundaryOnly?' · 仅界面格点':'')+(state.surfaceOnly?' · 仅几何缺邻点':'')+'；背景仅为表现',12,out.height-10,out.width-24);
      const a=document.createElement('a');a.download='ising-lattice.png';a.href=out.toDataURL('image/png');a.click();
    }catch(error){notice('截图无法保存：'+(error&&error.message||error));}
  }
  function bind() {
    document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
    $('temperature').addEventListener('input',event=>queueConfig(Number(event.target.value),state.field));
    $('field').addEventListener('input',event=>queueConfig(state.temperature,Number(event.target.value)));
    $('lattice-size').addEventListener('change',event=>{
      if(!state.ready)return;const n=Number(event.target.value);
      if(state.crystal){const t=state.crystal.topology;try{installCrystal(state.crystal.structure,t.cutoff,t.jSame,t.jDifferent,t.activeSpecies,n,{shape:t.shape,pairRules:t.pairRules});}catch(error){event.target.value=String(state.size);notice(error.message);}return;}
      if(![12,16,20,24].includes(n))return;
      state.size=n;state.layers=Math.max(1,Math.min(n,Math.round(n*.7)));const mid=Math.floor(n/2);state.selected=indexOf(mid,mid,Math.min(mid,state.layers-1));state.preset=null;resetWorker(0);
    });
    $('spin-structure').addEventListener('change',event=>{
      if(!state.ready)return;const id=event.target.value;try{if(id==='simple-ising')installSimple();else installCrystal(CRYSTAL.preset(id),1.08,1,1,null,null,{shape:state.crystal?state.crystal.topology.shape:'periodic'});}catch(error){event.target.value=state.crystal?(state.crystal.structure.id||'custom'):'simple-ising';notice('未切换结构：'+error.message);}
    });
    for(const id of ['spin-cutoff','spin-j-same','spin-j-different'])$(id).addEventListener('input',event=>{const value=Number(event.target.value);progress(event.target);$(id+'-value').textContent=id==='spin-cutoff'?value.toFixed(2)+'×':signed(value,2);$('spin-graph-note').textContent='这是尚未应用的草稿；点击「应用耦合与组元并重建」后生效。';});
    $('spin-species-list').addEventListener('change',()=>{$('spin-graph-note').textContent='这是尚未应用的草稿；点击「应用耦合与组元并重建」后生效。';});
    $('spin-apply-graph').addEventListener('click',()=>{
      if(!state.ready||!state.crystal)return;const active=[...document.querySelectorAll('#spin-species-list input:checked')].map(e=>e.value);
      try{installCrystal(state.crystal.structure,Number($('spin-cutoff').value),Number($('spin-j-same').value),Number($('spin-j-different').value),active,state.size,{shape:state.crystal.topology.shape,pairRules:state.crystal.topology.pairRules});}catch(error){$('spin-graph-note').textContent='未应用：'+error.message;notice('未应用：'+error.message);}
    });
    $('spin-apply-shape').addEventListener('click',()=>{
      if(!state.ready)return;const shape=$('spin-sample-shape').value,t=state.crystal&&state.crystal.topology,structure=state.crystal?state.crystal.structure:CRYSTAL.preset('cP');
      try{installCrystal(structure,t?t.cutoff:1.08,t?t.jSame:1,t?t.jDifferent:1,t?t.activeSpecies:null,state.size,{shape,pairRules:t?t.pairRules:[]});}catch(error){$('spin-sample-shape').value=t?t.shape:'periodic';notice('未应用样品形状：'+error.message);}
    });
    $('spin-matrix-shell').addEventListener('change',updateMatrix);
    $('spin-matrix-clear').addEventListener('click',()=>{matrixDraft.clear();matrixCleared=true;if(state.crystal){updateMatrix();$('spin-matrix-note').textContent='已清空矩阵草稿；点击应用后恢复同/异组元默认值。';}});
    $('spin-matrix-apply').addEventListener('click',()=>{
      if(!state.ready||!state.crystal)return;const t=state.crystal.topology,rules=[...matrixDraft.values()];
      try{installCrystal(state.crystal.structure,t.cutoff,t.jSame,t.jDifferent,t.activeSpecies,state.size,{shape:t.shape,pairRules:rules});$('spin-matrix-note').textContent=`已应用 ${rules.length} 条对称组元对 / 壳层规则；截断外规则暂不生效。`;}
      catch(error){$('spin-matrix-note').textContent='未应用：'+error.message;notice('矩阵未应用：'+error.message);}
    });
    $('spin-bond-highlight').addEventListener('change',event=>{state.bondType=event.target.value;bondCache=null;if(!state.bondType){delete stage.dataset.highlightBonds;delete stage.dataset.highlightTotal;$('spin-bond-note').textContent='显示实际非零耦合键；周期跨边界键和显示层外的键不画长直线。';}state.dirty=true;});
    $('spin-color-mode').addEventListener('change',event=>{const mode=event.target.value;if(mode!=='domain')clearMicroView();state.colorMode=mode==='element'?'element':mode==='domain'&&state.domain?'domain':'spin';if(state.colorMode==='element')state.view='arrows';updateLegend();updateControls();state.dirty=true;});
    $('micro-live-clear').addEventListener('click',()=>{clearMicroView();updateControls();});
    $('initial-spins').addEventListener('change',event=>{
      const initial=event.target.value;if(!state.ready||!['random','up','down','domains'].includes(initial)||initial===state.initial)return;
      state.initial=initial;state.preset=null;resetWorker(0);
    });
    $('apply-seed').addEventListener('click',()=>{
      if(!state.ready)return;const input=$('seed'),value=Number(input.value);
      if(input.value.trim()===''||!Number.isInteger(value)||value<0||value>0xffffffff){notice('随机种子须为 0–4294967295 的整数。');return;}
      state.seed=value;state.preset=null;resetWorker(0);
    });
    $('layers').addEventListener('input',event=>{state.layers=clamp(Number(event.target.value),1,state.size);updateControls();state.dirty=true;});
    $('show-flashes').addEventListener('change',event=>{state.showFlashes=event.target.checked;if(!state.showFlashes){state.flashUntil=0;state.flashMask=null;state.flashRevision++;stage.dataset.flashChanged='0';}updateControls();state.dirty=true;});
    $('boundary-only').addEventListener('change',event=>{state.boundaryOnly=event.target.checked;state.flashRevision++;updateControls();updateCanvasAccessibility();state.dirty=true;});
    $('surface-only').addEventListener('change',event=>{state.surfaceOnly=event.target.checked;state.flashRevision++;updateControls();updateCanvasAccessibility();state.dirty=true;});
    $('card-surface').addEventListener('click',()=>{if(!state.ready||!state.crystal||state.crystal.topology.periodic)return;state.surfaceOnly=true;state.boundaryOnly=false;state.layers=state.size;state.flashRevision++;updateControls();updateCanvasAccessibility();state.dirty=true;revealScene();});
    function changeView(view){state.view=view;if(view!=='arrows'&&state.colorMode==='element'){state.colorMode='spin';$('spin-color-mode').value='spin';updateLegend();}updateControls();state.dirty=true;}
    document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>changeView(button.dataset.view)));
    document.querySelectorAll('button[data-quick-view]').forEach(button=>button.addEventListener('click',()=>changeView(button.dataset.quickView)));
    document.querySelectorAll('button[data-tool]').forEach(button=>button.addEventListener('click',()=>{state.tool=button.dataset.tool;updateControls();state.dirty=true;if(state.tool==='probe'&&compact.matches&&!$('control-panel').hidden)$('toggle-controls').click();}));
    $('set-probe').addEventListener('click',()=>{
      const fields=['x','y','z'].map(a=>$('probe-'+a)),values=fields.map(i=>Number(i.value));
      if(fields.some(i=>i.value.trim()==='')||values.some(v=>!Number.isInteger(v)||v<0||v>=state.size)){notice('探针坐标须为 0 到 '+(state.size-1)+' 的整数。');return;}
      const site=state.crystal?Number($('probe-site').value):0;if(!Number.isInteger(site)||site<0||site>=siteMultiplicity()){notice('请选择有效的晶胞点位。');return;}
      notice('');setProbe(indexOf(...values,site));
    });
    $('flip-probe').addEventListener('click',flipProbe);$('card-flip').addEventListener('click',()=>{flipProbe();revealScene();});
    $('card-quench').addEventListener('click',()=>{applyPreset('quench');revealScene();});$('card-critical').addEventListener('click',()=>{applyPreset('critical');revealScene();});
    $('card-slice').addEventListener('click',()=>{state.layers=Math.max(1,Math.ceil(state.size/2));updateControls();state.dirty=true;revealScene();});
    $('card-interface').addEventListener('click',()=>{if(!state.ready)return;state.boundaryOnly=true;state.surfaceOnly=false;changeView('points');state.flashRevision++;updateControls();updateCanvasAccessibility();state.dirty=true;revealScene();});
    $('card-domains').addEventListener('click',()=>{if(!state.ready)return;state.initial='domains';state.preset=null;state.boundaryOnly=false;state.surfaceOnly=false;changeView('voxels');state.layers=state.size;updateCanvasAccessibility();resetWorker(0);revealScene();});
    $('field-positive').addEventListener('click',()=>queueConfig(state.temperature,.6));$('field-negative').addEventListener('click',()=>queueConfig(state.temperature,-.6));$('field-zero').addEventListener('click',()=>queueConfig(state.temperature,0));
    document.querySelectorAll('[data-note]').forEach(button=>button.addEventListener('click',()=>setNote(button.dataset.note)));
    $('play').addEventListener('click',()=>setPlaying(!state.playing));$('step').addEventListener('click',()=>{if(!state.playing)post('advance',{sweeps:1});});
    $('reset').addEventListener('click',()=>{if(state.ready)resetWorker(0);});$('reset-view').addEventListener('click',resetView);$('save-image').addEventListener('click',saveImage);
    document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{state.speed=Number(button.dataset.speed);updateControls();}));
    document.addEventListener('crystal:opened',()=>{if(state.playing)setPlaying(false);});
    document.addEventListener('crystal:apply-to-spin',event=>{const d=event.detail;if(!d)return;if(!state.ready||state.failed){d.error='相变实验尚未就绪；请稍候再应用。';return;}try{installCrystal(d.structure,d.cutoff,1,1,null);d.applied=true;}catch(error){d.error='结构未应用：'+error.message;}});
    document.addEventListener('lab:panelchange',()=>requestAnimationFrame(updateFraming));window.addEventListener('resize',resize);
    const motionChanged=()=>{if(reduced.matches&&state.showFlashes){state.showFlashes=false;state.flashUntil=0;state.flashMask=null;state.flashRevision++;stage.dataset.flashChanged='0';updateControls();state.dirty=true;}};
    if(reduced.addEventListener)reduced.addEventListener('change',motionChanged);else if(reduced.addListener)reduced.addListener(motionChanged);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){state.flashUntil=0;state.dirty=true;if(state.playing){state.playing=false;state.accumulator=0;state.lastFrame=0;updatePlayback();}}});
    if('ResizeObserver' in window){new ResizeObserver(()=>requestAnimationFrame(resize)).observe(stage);new ResizeObserver(()=>requestAnimationFrame(updateFraming)).observe(document.querySelector('.lab-bottom'));}
  }
  try {
    populateStructures();setGraphControls();bindCanvas();setupRenderer();bind();setNote('neighbors');resize();
    if(window.IsingScan)scanUI=window.IsingScan.init({getConfig:()=>{
      const c={size:state.size,field:state.field,seed:state.seed,ready:state.ready&&!state.failed,graphKey:'simple-ising',structureName:'简单立方',minTemperature:1,maxTemperature:8};
      if(state.crystal){const t=state.crystal.topology;Object.assign(c,{structure:state.crystal.structure,cutoff:t.cutoff,jSame:t.jSame,jDifferent:t.jDifferent,activeSpecies:t.activeSpecies,structureName:state.crystal.structure.name,shape:t.shape,pairRules:t.pairRules,minTemperature:clamp(Math.round(t.meanAbsField*.15*4)/4,.25,1),maxTemperature:clamp(Math.ceil(t.meanAbsField*1.5),2,20)});c.graphKey=JSON.stringify([c.structure,c.cutoff,c.jSame,c.jDifferent,c.activeSpecies,c.shape,c.pairRules]);}
      return c;
    },applyTemperature:t=>queueConfig(t,state.field)});
    if(window.IsingMicroUI)microUI=window.IsingMicroUI.init({snapshot:()=>{
      if(!state.ready||!state.spins||!state.stats)return null;setPlaying(false);const t=state.crystal&&state.crystal.topology;
      const options=t?{structure:state.crystal.structure,size:state.size,cutoff:t.cutoff,jSame:t.jSame,jDifferent:t.jDifferent,activeSpecies:t.activeSpecies,shape:t.shape,pairRules:t.pairRules}:{structure:CRYSTAL.preset('cP'),size:state.size,cutoff:1.08,jSame:1,jDifferent:1,shape:'periodic'};
      return {options,spins:state.spins.slice(),generation:state.generation,sweeps:state.stats.sweeps,manualFlips:state.stats.manualFlips,temperature:state.stats.temperature,field:state.stats.field,spinCount:state.stats.spinCount||state.stats.count,name:state.crystal?state.crystal.structure.name:'简单立方',shapeLabel:({periodic:'周期边界',box:'开放晶胞块',sphere:'球形',cylinder:'圆柱',hex:'六角柱'})[options.shape]};
    },studyConfig:()=>{
      const t=state.crystal&&state.crystal.topology,options=t?{structure:state.crystal.structure,cutoff:t.cutoff,jSame:t.jSame,jDifferent:t.jDifferent,activeSpecies:t.activeSpecies,shape:t.shape,pairRules:t.pairRules}:{structure:CRYSTAL.preset('cP'),cutoff:1.08,jSame:1,jDifferent:1,shape:'periodic',pairRules:[]};
      options.field=state.stats?state.stats.field:state.field;options.seed=state.seed;
      const choices=t?state.crystal.sizes:[2,3,4,5,6,8,10,12],preferred=[4,6,8].filter(n=>choices.includes(n));let sizes=preferred.length>=2?preferred:choices.filter(n=>n<=8).slice(-3);if(sizes.length<2)sizes=[2,3];
      const scale=t?t.meanAbsField:6,min=t?clamp(Math.round(scale*.15*4)/4,.25,1):1,max=t?clamp(Math.ceil(scale*1.5),2,20):8;
      return {ready:state.ready&&!state.failed,options,name:state.crystal?state.crystal.structure.name:'简单立方',shapeLabel:({periodic:'周期边界',box:'开放晶胞块',sphere:'球形',cylinder:'圆柱',hex:'六角柱'})[options.shape],field:options.field,cutoff:options.cutoff,ruleCount:options.pairRules.length,sizes,min,max,graphKey:JSON.stringify(options)};
    },isCurrent:s=>!!state.ready&&!!state.stats&&s.generation===state.generation&&s.sweeps===state.stats.sweeps&&s.manualFlips===state.stats.manualFlips,
      onAnalysis:(r)=>{const d=r.diagnostics,c=r.clusters;$('card-satisfaction').textContent=d.satisfiedFraction==null?'—':(d.satisfiedFraction*100).toFixed(1)+'%';$('card-frustration').textContent=String(d.frustratedFundamentalLoops);$('card-clusters').textContent=String(c.count);$('card-largest').textContent=c.largest?(100*c.largest.fraction).toFixed(1)+'%':'—';$('card-qpeak').textContent=r.reciprocal.peak.toFixed(3);},
      showCluster:(clusters,selected)=>showClusterView(clusters,selected),showLoop:cycle=>showCycleView(cycle)});
    resetWorker(120);requestAnimationFrame(animate);
  }
  catch(error){fail('初始化失败：'+(error&&error.message||error));}
})();
