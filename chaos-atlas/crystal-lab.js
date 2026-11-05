/* Interactive, independent crystallographic geometry lab. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),API=window.CrystalGeometry,THREE=window.THREE,dialog=$('crystal-lab'),viewport=$('crystal-viewport');
  if(!dialog||!API)return;
  const compact=matchMedia('(max-width:1100px), (max-aspect-ratio:5/4)'),NS='http://www.w3.org/2000/svg';
  const refs=[[1,0,0],[1,1,0],[1,1,1],[2,0,0],[2,1,0],[2,1,1],[2,2,0],[3,1,1]];
  let canvas=$('crystal-canvas'),ctx=null,renderer=null,scene=null,camera=null,root=null,raycaster=null,frame=0,resizeObserver=null,lastFocus=null,initialized=false;
  const state={config:API.preset('perovskite'),model:null,supercell:null,copies:2,cutoff:1.08,showLinks:true,showGhosts:true,spacefill:false,
    selected:0,renderer:'',width:0,height:0,dpr:1,yaw:.65,pitch:.32,zoom:1,drag:null,world:[],worldScale:1,origin:[0,0,0],radius:.1,fitRadius:2,meshes:[],segments:[],links:[],hexSegments:[],hkl:[1,0,0],weight:'equal',changed:false};
  const fmt=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—',dist=n=>Number.isFinite(n)&&n!==0&&Math.abs(n)<.001?n.toExponential(2):fmt(n,3),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const vec=(x,y,z)=>[x,y,z],plus=(a,b)=>a.map((x,i)=>x+b[i]),minus=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  function status(message,error=false){$('crystal-edit-status').textContent=message;$('crystal-edit-status').classList.toggle('error',error);}
  function svg(tag,attrs,text){const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!==undefined)n.textContent=text;return n;}
  function presetSelect(){
    const select=$('crystal-preset');select.replaceChildren();
    const all=document.createElement('optgroup');all.label='七大晶系 · 14 种布拉菲点阵';
    for(const p of API.BRAVAIS){const o=document.createElement('option');o.value=p.id;o.textContent=p.family+' / '+p.name;all.appendChild(o);}select.appendChild(all);
    for(const group of ['单元素结构','二元结构','三元结构','多元结构']){
      const g=document.createElement('optgroup');g.label=group+' · 理想化或近似原型';
      for(const p of API.PROTOTYPES.filter(x=>x.group===group)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;g.appendChild(o);}select.appendChild(g);
    }
    const custom=document.createElement('option');custom.value='custom';custom.textContent='自定义晶胞（当前）';custom.disabled=true;custom.hidden=true;select.appendChild(custom);select.value=state.config.id;
    const list=$('crystal-elements');for(const e of ['X1','X2','X3',...API.ELEMENTS]){const option=document.createElement('option');option.value=e;list.appendChild(option);}
  }
  function addBasisRow(atom,index){
    const row=document.createElement('div');row.className='crystal-basis-row';
    const names=['element','x','y','z'];for(const name of names){const input=document.createElement('input');input.dataset.field=name;input.setAttribute('aria-label',`基元 ${index+1} ${name==='element'?'元素符号':name+' 坐标'}`);
      if(name==='element'){input.type='text';input.maxLength=3;input.setAttribute('list','crystal-elements');input.value=atom.element;}
      else{input.type='number';input.min='0';input.max='0.999999999';input.step='any';input.value=String(Number(atom[name].toFixed(9)));}row.appendChild(input);}
    const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.dataset.remove='true';remove.setAttribute('aria-label',`删除基元 ${index+1}`);row.appendChild(remove);$('crystal-basis-rows').appendChild(row);
  }
  function reindexRows(){[...$('crystal-basis-rows').children].forEach((row,i)=>{row.querySelectorAll('input').forEach(input=>input.setAttribute('aria-label',`基元 ${i+1} ${input.dataset.field==='element'?'元素符号':input.dataset.field+' 坐标'}`));row.querySelector('button').setAttribute('aria-label',`删除基元 ${i+1}`);});}
  function syncEditor(){
    const ids=['a','b','c','alpha','beta','gamma'];ids.forEach((id,i)=>{$('crystal-'+id).value=String(Number(state.config.cell[i].toFixed(9)));});$('crystal-center').value=state.config.center;
    $('crystal-basis-rows').replaceChildren();state.config.basis.forEach(addBasisRow);$('crystal-add-basis').disabled=state.config.basis.length>=32;
  }
  function getDraft(){
    const c={...state.config,cell:['a','b','c','alpha','beta','gamma'].map(id=>{const input=$('crystal-'+id);if(input.value.trim()==='')throw new Error('晶胞参数不能为空。');return Number(input.value);}),center:$('crystal-center').value,basis:[]};
    for(const row of $('crystal-basis-rows').children){const inputs=row.querySelectorAll('input'),symbol=inputs[0].value.trim();if(!symbol||[...inputs].slice(1).some(i=>i.value.trim()===''))throw new Error('元素与分数坐标不能为空。');
      c.basis.push({element:symbol,x:Number(inputs[1].value),y:Number(inputs[2].value),z:Number(inputs[3].value)});}
    // Retain exact prototype fractions when the rounded editor was not changed.
    const old=state.config;if(c.center===old.center&&c.cell.length===old.cell.length)c.cell=c.cell.map((v,i)=>Math.abs(v-old.cell[i])<1e-8?old.cell[i]:v);
    c.basis=c.basis.map((a,i)=>{const b=old.basis[i];if(!b||a.element!==b.element)return a;for(const k of ['x','y','z'])if(Math.abs(a[k]-b[k])<1e-8)a[k]=b[k];return a;});
    const changed=c.center!==old.center||c.cell.some((v,i)=>v!==old.cell[i])||JSON.stringify(c.basis)!==JSON.stringify(old.basis);
    if(changed){c.name='自定义晶胞';c.note='基于“'+old.name+'”修改；对称性和具体材料不再自动保证。';c.id='custom';c.family='自定义';c.bravais='custom';c.prototype=false;}
    return {config:c,changed};
  }
  function commit(config,cutoff=state.cutoff,copies=state.copies,changed=false){
    const model=API.build(config,cutoff),supercell=API.supercell(model,copies);
    state.config=config;state.model=model;state.supercell=supercell;state.cutoff=cutoff;state.copies=copies;state.changed=changed;
    state.selected=chooseCentral(supercell);prepareWorld();updateAll();rebuild();
  }
  function chooseCentral(supercell,site=null){
    const c=(supercell.copies-1)/2,maxDegree=Math.max(...state.model.neighbors.map(x=>x.length));let best=Infinity,index=0;
    supercell.atoms.forEach((a,i)=>{if(a.ghost||(site!==null&&a.site!==site))return;const f=state.model.sites[a.site].fraction,d=a.cell.reduce((s,x,j)=>s+(x+f[j]-c-.5)**2,0)+(maxDegree-state.model.neighbors[a.site].length)*8;if(d<best){best=d;index=i;}});return index;
  }
  function selectSite(delta){
    const current=state.supercell.atoms[state.selected].site,n=state.model.sites.length,next=(current+delta+n)%n;
    state.selected=chooseCentral(state.supercell,next);updateAll();rebuild();
  }
  function loadPreset(id){
    try{const cfg=API.preset(id);commit(cfg,state.cutoff,state.copies,false);syncEditor();$('crystal-preset').value=id;status('已加载结构原型；编辑后须点击应用。');}catch(error){$('crystal-preset').value=state.config.id;status(error.message,true);}
  }
  function worldPosition(cart){return cart.map((v,i)=>(v-state.origin[i])*state.worldScale);}
  function prepareWorld(){
    const v=state.model.vectors,n=state.copies,corners=[];for(const x of [0,n])for(const y of [0,n])for(const z of [0,n])corners.push(API.point(v,[x,y,z]));
    const lo=[0,1,2].map(k=>Math.min(...corners.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...corners.map(p=>p[k])));
    state.origin=lo.map((x,k)=>(x+hi[k])/2);state.worldScale=3.5/Math.max(...hi.map((x,k)=>x-lo[k]));state.world=state.supercell.atoms.map(a=>worldPosition(a.cart));
    const spacing=state.model.nearest*state.worldScale;state.radius=clamp(spacing*(state.spacefill?.43:.22),.045,.27);
    state.segments=[];state.hexSegments=[];state.links=[];
    function box(x,y,z,nx,ny,nz,target){const xyz=[];for(const a of [0,1])for(const b of [0,1])for(const c of [0,1])xyz.push(worldPosition(API.point(v,[x+a*nx,y+b*ny,z+c*nz])));
      for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))target.push([xyz[i],xyz[i|bit]]);}
    box(0,0,0,n,n,n,state.segments);const unit=[];box(0,0,0,1,1,1,unit);state.unitSegments=unit;
    for(const e of state.supercell.edges){if(!state.showGhosts&&(state.supercell.atoms[e.a].ghost||state.supercell.atoms[e.b].ghost))continue;state.links.push([state.world[e.a],state.world[e.b],e.a,e.b]);}
    const [a,b,c,alpha,beta,gamma]=state.config.cell,isHex=state.config.center==='P'&&Math.abs(a-b)<1e-7&&Math.abs(alpha-90)<1e-7&&Math.abs(beta-90)<1e-7&&Math.abs(gamma-120)<1e-7;
    $('crystal-hex-key').hidden=!isHex;
    if(isHex){
      const u=n>1?1:0,base=API.point(v,[u,u,u]),r=a/Math.sqrt(3),top=[],bottom=[];
      for(let i=0;i<6;i++){const angle=(30+i*60)*Math.PI/180,x=r*Math.cos(angle),y=r*Math.sin(angle);top.push(worldPosition(plus(base,[x,y,c/2])));bottom.push(worldPosition(plus(base,[x,y,-c/2])));}
      for(let i=0;i<6;i++){const j=(i+1)%6;state.hexSegments.push([top[i],top[j]],[bottom[i],bottom[j]],[top[i],bottom[i]]);}
    }
    const points=state.world.filter((p,i)=>state.showGhosts||!state.supercell.atoms[i].ghost),edges=state.segments.concat(state.unitSegments,state.hexSegments).flatMap(v=>v);
    state.fitRadius=Math.max(1,...points.map(p=>Math.hypot(...p)+state.radius),...edges.map(p=>Math.hypot(...p)));
  }
  function updateAll(){
    if(!state.model)return;
    const m=state.model,sc=state.supercell,selected=sc.atoms[state.selected]||sc.atoms[0],site=m.sites[selected.site],neighbors=m.neighbors[selected.site],species=[...new Set(m.sites.map(x=>x.element))];
    const label=state.config.name,centering=state.config.bravais==='hR'?'R · 菱方原胞':state.config.center+' · 所用晶胞';
    $('crystal-stage-name').textContent=label;$('crystal-stage-subtitle').textContent=(state.config.family==='自定义'?'自定义几何':state.config.family+'晶系')+' · '+centering+' · '+m.sites.length+' 个唯一点位 / 胞';
    $('crystal-preset-note').textContent=state.config.note;$('crystal-repeat-value').textContent=`${state.copies} × ${state.copies} × ${state.copies}`;$('crystal-cutoff-value').textContent=fmt(state.cutoff,2)+'×';
    $('crystal-repeat').value=String(state.copies);$('crystal-cutoff').value=String(state.cutoff);$('crystal-show-links').checked=state.showLinks;$('crystal-show-ghosts').checked=state.showGhosts;$('crystal-spacefill').checked=state.spacefill;
    $('crystal-preset').value=state.config.id;document.querySelectorAll('button[data-crystal-preset]').forEach(b=>b.classList.toggle('active',b.dataset.crystalPreset===state.config.id));
    $('crystal-fact-title').textContent=label;$('crystal-fact-description').textContent=state.config.note;
    $('crystal-fact-count').textContent=m.sites.length+' / '+species.length+' 种';$('crystal-fact-distance').textContent=dist(m.nearest)+' 单位';
    $('crystal-fact-supercell').textContent=sc.actual+' / '+(state.showGhosts?sc.ghosts:0);$('crystal-bottom-cell').textContent=String(m.sites.length);$('crystal-bottom-distance').textContent=dist(m.nearest)+' 单位';$('crystal-bottom-species').textContent=species.join(' · ');
    $('crystal-selection').textContent=`点位 ${selected.site+1}/${m.sites.length} · ${selected.element} · 胞内 (${site.fraction.map(x=>fmt(x,3)).join(', ')})${selected.ghost?' · 周期镜像':''}`;
    $('crystal-neighbors').textContent=String(neighbors.length)+' 个';const counts={};for(const n of neighbors){const symbol=m.sites[n.site].element;counts[symbol]=(counts[symbol]||0)+1;}
    $('crystal-neighbor-species').textContent=Object.keys(counts).length?'按组元：'+Object.entries(counts).map(([k,v])=>k+' '+v).join(' · '):'当前全局距离阈值内，此位置没有邻居。';
    // Group by the displayed precision, so two rounded-identical values do not
    // appear as separate, misleading shells for a distorted structure.
    const shells=[];for(const n of [...neighbors].sort((a,b)=>a.distance-b.distance)){const label=dist(n.distance);let last=shells.at(-1);if(!last||last.label!==label){last={label,count:0};shells.push(last);}last.count++;}
    $('crystal-neighbor-shells').textContent=shells.length?'近似距离分布：'+shells.slice(0,4).map(x=>x.label+' × '+x.count).join(' · ')+(shells.length>4?' · …':''):'';
    const legend=$('crystal-species-legend');legend.replaceChildren();for(const s of species){const span=document.createElement('span'),i=document.createElement('i');i.style.setProperty('--species-color',API.color(s));span.appendChild(i);span.appendChild(document.createTextNode(s));legend.appendChild(span);}
    dialog.dataset.preset=state.config.id;dialog.dataset.sites=String(m.sites.length);dialog.dataset.actual=String(sc.actual);dialog.dataset.ghosts=String(state.showGhosts?sc.ghosts:0);dialog.dataset.nearest=String(m.nearest);dialog.dataset.selectedSite=String(selected.site);dialog.dataset.degree=String(neighbors.length);dialog.dataset.species=species.join(',');dialog.dataset.edges=String(state.showLinks?state.links.length:0);dialog.dataset.repeat=String(state.copies);
    updateReflection();
  }
  function updateReflection(){
    try{
      const [h,k,l]=state.hkl,r=API.reflection(state.model,h,k,l,state.weight),maximum=state.model.sites.reduce((s,p)=>s+API.weight(p.element,state.weight),0)**2;
      $('crystal-reflection-value').textContent=fmt(r.intensity,3)+' / '+dist(r.d);$('crystal-reflection-status').textContent=r.intensity<maximum*1e-14?'此权重下振幅相消；这不是实测衍射谱。':'按当前坐标与所选常数权重计算；d 使用晶胞长度单位。';
      dialog.dataset.reflection=`${h},${k},${l}`;dialog.dataset.intensity=String(r.intensity);dialog.dataset.spacing=String(r.d);
      const graph=$('crystal-reflections'),values=refs.map(v=>API.reflection(state.model,...v,state.weight).intensity),max=Math.max(...values,1e-30);graph.replaceChildren();
      graph.appendChild(svg('line',{x1:13,y1:70,x2:230,y2:70,stroke:'#729188','stroke-width':.8}));
      refs.forEach((item,i)=>{const x=15+i*27,v=values[i],height=57*v/max,active=item.every((x,j)=>x===state.hkl[j]);graph.appendChild(svg('rect',{x,y:70-Math.max(height,1),width:15,height:Math.max(height,1),fill:active?'#f1bb8e':'#7ecfc4',opacity:v<max*1e-14?.25:.9}));graph.appendChild(svg('text',{x:x+7.5,y:82,'text-anchor':'middle'},item.join('')));});
      graph.setAttribute('aria-label','选定晶面指数的相对结构因子柱图；当前 '+h+','+k+','+l+' 的 |F|² 为 '+fmt(r.intensity,3));
    }catch(error){$('crystal-reflection-value').textContent='—';$('crystal-reflection-status').textContent=error.message;}
  }
  function disposeGroup(){
    if(!root)return;scene.remove(root);const gs=new Set(),ms=new Set();root.traverse(obj=>{if(obj.geometry)gs.add(obj.geometry);if(obj.material)(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(m=>ms.add(m));});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());root=null;state.meshes=[];
  }
  function lineGeometry(segments,color,opacity,name){
    const coords=[];for(const [a,b] of segments)coords.push(...a,...b);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
    const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));l.name=name;return l;
  }
  function rebuild(){
    if(!state.model)return;
    if(state.renderer==='webgl'){
      disposeGroup();root=new THREE.Group();scene.add(root);
      const geometry=new THREE.SphereGeometry(1,20,14),normal=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.38,metalness:.08}),ghost=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.48,metalness:.02,transparent:true,opacity:.32,depthWrite:false});
      for(const isGhost of [false,true]){
        if(isGhost&&!state.showGhosts)continue;const indices=state.supercell.atoms.map((a,i)=>a.ghost===isGhost?i:-1).filter(i=>i>=0);if(!indices.length)continue;
        const mesh=new THREE.InstancedMesh(geometry,isGhost?ghost:normal,indices.length),dummy=new THREE.Object3D();mesh.name=isGhost?'crystal-ghosts':'crystal-atoms';mesh.userData.indices=indices;
        indices.forEach((i,n)=>{dummy.position.fromArray(state.world[i]);dummy.scale.setScalar(state.radius);dummy.updateMatrix();mesh.setMatrixAt(n,dummy.matrix);mesh.setColorAt(n,new THREE.Color(API.color(state.supercell.atoms[i].element)));});
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;root.add(mesh);state.meshes.push(mesh);
      }
      root.add(lineGeometry(state.segments,'#6faaa5',.5,'crystal-supercell-frame'));root.add(lineGeometry(state.unitSegments,'#f2c18e',.75,'crystal-unit-frame'));
      if(state.hexSegments.length)root.add(lineGeometry(state.hexSegments,'#f8c994',.88,'crystal-hex-frame'));
      if(state.showLinks)root.add(lineGeometry(state.links,'#b6dbcc',.48,'crystal-distance-links'));
      const marker=new THREE.Mesh(new THREE.RingGeometry(.88,1,40),new THREE.MeshBasicMaterial({color:'#ffe5b6',transparent:true,opacity:.9,depthWrite:false,depthTest:false,side:THREE.DoubleSide}));marker.name='crystal-selected';marker.position.fromArray(state.world[state.selected]);marker.scale.setScalar(state.radius*1.45);root.add(marker);
    }
    requestDraw();
  }
  function viewBasis(){const y=state.yaw,p=state.pitch,front=[Math.sin(y)*Math.cos(p),Math.cos(y)*Math.cos(p),Math.sin(p)],right=[-Math.cos(y),Math.sin(y),0],up=[-Math.sin(y)*Math.sin(p),-Math.cos(y)*Math.sin(p),Math.cos(p)];return {front,right,up};}
  function projection(p){const b=viewBasis(),pixels=Math.min(state.width,state.height)*.44/(state.fitRadius*state.zoom);return {x:state.width/2+dot(p,b.right)*pixels,y:state.height/2-dot(p,b.up)*pixels,depth:dot(p,b.front),pixels};}
  function updateCamera(){
    if(!camera)return;const b=viewBasis(),aspect=state.width/Math.max(1,state.height),vertical=THREE.MathUtils.degToRad(camera.fov/2),halfAngle=Math.min(vertical,Math.atan(Math.tan(vertical)*aspect)),distance=Math.max(5,state.fitRadius/Math.sin(Math.max(.05,halfAngle))*1.08)*state.zoom;
    camera.aspect=aspect;camera.position.set(...scale(b.front,distance));camera.up.set(0,0,1);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();const marker=root&&root.getObjectByName('crystal-selected');if(marker)marker.quaternion.copy(camera.quaternion);
  }
  function drawCanvas(){
    if(!ctx)return;ctx.clearRect(0,0,state.width,state.height);
    function lines(items,stroke,width=1){ctx.beginPath();ctx.strokeStyle=stroke;ctx.lineWidth=width;for(const [a,b] of items){const x=projection(a),y=projection(b);ctx.moveTo(x.x,x.y);ctx.lineTo(y.x,y.y);}ctx.stroke();}
    lines(state.segments,'rgba(121,183,175,.50)');lines(state.unitSegments,'rgba(239,194,148,.8)');if(state.hexSegments.length)lines(state.hexSegments,'rgba(247,202,151,.9)');if(state.showLinks)lines(state.links,'rgba(185,219,204,.48)');
    const points=state.supercell.atoms.map((a,i)=>({a,i,p:projection(state.world[i])})).filter(x=>state.showGhosts||!x.a.ghost).sort((a,b)=>a.p.depth-b.p.depth);
    for(const {a,i,p} of points){ctx.globalAlpha=a.ghost?.34:1;ctx.fillStyle=API.color(a.element);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,state.radius*p.pixels),0,Math.PI*2);ctx.fill();
      if(i===state.selected){ctx.strokeStyle='#fff1c8';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(4,state.radius*p.pixels*1.45),0,Math.PI*2);ctx.stroke();}}
    ctx.globalAlpha=1;
  }
  function draw(){
    frame=0;if(dialog.hidden||!state.model)return;
    if(state.renderer==='webgl'){
      try{updateCamera();renderer.render(scene,camera);if(renderer.getContext().isContextLost())throw new Error('WebGL context lost');if((renderer.info.programs||[]).some(p=>p.diagnostics&&p.diagnostics.runnable===false))throw new Error('shader failure');}
      catch(_){useCanvas('WebGL 中断，已切换到同一结构的 Canvas 投影。');drawCanvas();}
    }else drawCanvas();
    dialog.dataset.drawn='true';dialog.dataset.drawWidth=String(state.width);dialog.dataset.drawHeight=String(state.height);
  }
  function requestDraw(){if(!frame&&!dialog.hidden)frame=requestAnimationFrame(draw);}
  function size(){
    const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;state.width=r.width;state.height=r.height;state.dpr=Math.min(window.devicePixelRatio||1,1.5);
    if(state.renderer==='webgl'){renderer.setPixelRatio(state.dpr);renderer.setSize(state.width,state.height,false);updateCamera();}
    else if(ctx){canvas.width=Math.max(1,Math.round(state.width*state.dpr));canvas.height=Math.max(1,Math.round(state.height*state.dpr));ctx.setTransform(state.dpr,0,0,state.dpr,0,0);}
    requestDraw();
  }
  function useCanvas(message){
    if(renderer){disposeGroup();try{renderer.dispose();}catch(_){}renderer=null;scene=null;camera=null;}
    const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D 不可用。');state.renderer='canvas';dialog.dataset.renderer='canvas';$('crystal-fallback').textContent=message;$('crystal-fallback').hidden=false;bindCanvas();size();
  }
  function setupRenderer(){
    try{
      if(!THREE||!THREE.WebGLRenderer)throw new Error('WebGL resource unavailable');
      renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);scene=new THREE.Scene();
      camera=new THREE.PerspectiveCamera(38,1,.05,100);camera.up.set(0,0,1);raycaster=new THREE.Raycaster();
      scene.add(new THREE.HemisphereLight(0xdaf4ec,0x314751,1.65));const key=new THREE.DirectionalLight(0xffe3c3,2.1);key.position.set(4,-6,9);scene.add(key);const fill=new THREE.DirectionalLight(0x9bdded,1.1);fill.position.set(-5,3,4);scene.add(fill);
      state.renderer='webgl';dialog.dataset.renderer='webgl';$('crystal-fallback').hidden=true;
    }catch(_){useCanvas('WebGL 不可用，已切换到同一结构的 Canvas 投影。');}
    bindCanvas();size();rebuild();
  }
  function pick(event){
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(!rect.width||!rect.height)return null;
    const isWebGL=state.renderer==='webgl'&&raycaster&&camera;
    if(isWebGL){updateCamera();raycaster.setFromCamera(new THREE.Vector2(x/rect.width*2-1,1-y/rect.height*2),camera);const hits=raycaster.intersectObjects(state.meshes,false);if(hits.length)return hits[0].object.userData.indices[hits[0].instanceId];}
    let best=null,bestScore=Infinity;const front=viewBasis().front,vector=isWebGL?new THREE.Vector3():null;
    state.world.forEach((p,i)=>{if(!state.showGhosts&&state.supercell.atoms[i].ghost)return;
      let q;if(isWebGL){vector.fromArray(p).project(camera);const depth=dot(p,front),pixels=state.height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*(camera.position.length()-depth));q={x:(vector.x+1)*state.width/2,y:(1-vector.y)*state.height/2,depth,pixels};}else q=projection(p);
      const radius=Math.max(event.pointerType==='touch'?14:5,state.radius*q.pixels*1.15),d=(q.x-x)**2+(q.y-y)**2;if(d>radius*radius)return;const score=d-q.depth*radius*.2;if(score<bestScore){bestScore=score;best=i;}});return best;
  }
  const bound=new WeakSet();
  function bindCanvas(){
    if(bound.has(canvas))return;bound.add(canvas);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(state.renderer==='webgl'){try{useCanvas('WebGL 中断，已切换到同一结构的 Canvas 投影。');requestDraw();}catch(error){status(error.message,true);}}});
    canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;state.drag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:state.yaw,pitch:state.pitch,moved:false};canvas.setPointerCapture(event.pointerId);event.preventDefault();});
    canvas.addEventListener('pointermove',event=>{const d=state.drag;if(!d||d.id!==event.pointerId)return;const dx=event.clientX-d.x,dy=event.clientY-d.y;if(Math.hypot(dx,dy)>4)d.moved=true;state.yaw=d.yaw-dx*.008;state.pitch=clamp(d.pitch+dy*.008,-1.3,1.3);requestDraw();event.preventDefault();});
    function end(event){const d=state.drag;if(!d||d.id!==event.pointerId)return;state.drag=null;try{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);}catch(_){}if(!d.moved&&event.type==='pointerup'){const i=pick(event);if(i!==null){state.selected=i;updateAll();rebuild();}}requestDraw();}
    canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
    canvas.addEventListener('wheel',event=>{event.preventDefault();state.zoom=clamp(state.zoom*Math.exp(event.deltaY*.001),.55,1.8);requestDraw();},{passive:false});
    canvas.addEventListener('keydown',event=>{if(event.key==='Home'){event.preventDefault();resetView();return;}if(event.key==='+'||event.key==='='){event.preventDefault();state.zoom=clamp(state.zoom/1.1,.55,1.8);requestDraw();return;}if(event.key==='-'||event.key==='_'){event.preventDefault();state.zoom=clamp(state.zoom*1.1,.55,1.8);requestDraw();return;}
      if(event.key==='Enter'){event.preventDefault();selectSite(1);return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();if(event.key==='ArrowLeft')state.yaw-=.1;if(event.key==='ArrowRight')state.yaw+=.1;if(event.key==='ArrowUp')state.pitch=clamp(state.pitch+.1,-1.3,1.3);if(event.key==='ArrowDown')state.pitch=clamp(state.pitch-.1,-1.3,1.3);requestDraw();});
  }
  function resetView(){state.yaw=.65;state.pitch=.32;state.zoom=1;requestDraw();}
  function setPanel(side,open){
    const other=side==='left'?'right':'left',panel=$('crystal-'+(side==='left'?'controls':'notes')),shell=$('crystal-'+side+'-shell'),toggle=$('crystal-toggle-'+side);
    if(open&&compact.matches&&!$('crystal-'+(other==='left'?'controls':'notes')).hidden)setPanel(other,false);
    if(!open&&panel.contains(document.activeElement))toggle.focus({preventScroll:true});panel.hidden=!open;shell.classList.toggle('closed',!open);dialog.classList.toggle(side+'-closed',!open);toggle.setAttribute('aria-expanded',String(open));
    const name=side==='left'?'结构控制台':'结构知识卡';toggle.setAttribute('aria-label',(open?'收起':'展开')+name);toggle.querySelector('span').textContent=open?'收起':(side==='left'?'结构':'知识');requestAnimationFrame(size);
  }
  function open(){
    lastFocus=document.activeElement;document.dispatchEvent(new CustomEvent('crystal:opened'));dialog.hidden=false;
    if(!initialized){initialized=true;try{presetSelect();commit(state.config);syncEditor();setupRenderer();if('ResizeObserver'in window){resizeObserver=new ResizeObserver(()=>requestAnimationFrame(size));resizeObserver.observe(viewport);}}catch(error){dialog.dataset.status='error';status('无法建立结构图谱：'+(error&&error.message||error),true);}}
    setPanel('left',!compact.matches);setPanel('right',!compact.matches);dialog.dataset.status=state.model&&state.renderer?'ready':'error';$('crystal-close').focus({preventScroll:true});requestAnimationFrame(()=>{size();requestDraw();});
  }
  function close(){dialog.hidden=true;if(frame){cancelAnimationFrame(frame);frame=0;}const target=lastFocus&&lastFocus.isConnected&&lastFocus.getClientRects().length?lastFocus:$('crystal-open');target.focus({preventScroll:true});}
  function save(){
    try{if(state.renderer==='webgl'){updateCamera();renderer.render(scene,camera);}else drawCanvas();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const p=out.getContext('2d');p.fillStyle='#0c232a';p.fillRect(0,0,out.width,out.height);p.drawImage(canvas,0,0);const h=Math.max(32,out.height*.045);p.fillStyle='#07171ee8';p.fillRect(0,out.height-h,out.width,h);p.font=Math.max(12,Math.round(out.width/60))+'px sans-serif';p.fillStyle='#e4eee5';p.textBaseline='middle';p.fillText(state.config.name+' · 晶胞点位 '+state.model.sites.length+' · 静态示意',12,out.height-h/2,out.width-24);const a=document.createElement('a');a.href=out.toDataURL('image/png');a.download='crystal-structure.png';a.click();}catch(error){status('截图无法保存：'+error.message,true);}
  }
  $('crystal-open').addEventListener('click',open);$('crystal-close').addEventListener('click',close);$('crystal-toggle-left').addEventListener('click',() => setPanel('left',$('crystal-controls').hidden));$('crystal-toggle-right').addEventListener('click',() => setPanel('right',$('crystal-notes').hidden));
  $('crystal-use-spins').addEventListener('click',()=>{
    // Send the committed geometry, not an unapplied editor draft.
    const detail={structure:JSON.parse(JSON.stringify(state.config)),cutoff:state.cutoff,applied:false,error:''};
    document.dispatchEvent(new CustomEvent('crystal:apply-to-spin',{detail}));
    if(!detail.applied){status(detail.error||'自旋实验当前不可用，结构未应用。',true);return;}
    close();
  });
  $('crystal-preset').addEventListener('change',event=>loadPreset(event.target.value));document.querySelectorAll('button[data-crystal-preset]').forEach(b=>b.addEventListener('click',()=>loadPreset(b.dataset.crystalPreset)));
  $('crystal-add-basis').addEventListener('click',()=>{const n=$('crystal-basis-rows').children.length;if(n>=32){status('最多 32 个基元位置。',true);return;}addBasisRow({element:'X2',x:.25,y:.25,z:.25},n);$('crystal-add-basis').disabled=n+1>=32;status('已添加草稿；修改后点击应用。');});
  $('crystal-basis-rows').addEventListener('click',event=>{if(!event.target.dataset.remove)return;const rows=$('crystal-basis-rows');if(rows.children.length<=1){status('至少保留一个基元位置。',true);return;}event.target.parentElement.remove();reindexRows();$('crystal-add-basis').disabled=false;status('基元草稿已修改，点击应用后生效。');});
  $('crystal-apply').addEventListener('click',()=>{try{const draft=getDraft();if(!draft.changed){status('晶胞与基元未改变。');return;}commit(draft.config,state.cutoff,state.copies,true);syncEditor();status('已应用自定义结构；空间群与材料身份不再自动保证。');}catch(error){status('未应用：'+error.message,true);}});
  $('crystal-repeat').addEventListener('input',event=>{try{const n=Number(event.target.value),sc=API.supercell(state.model,n);state.copies=n;state.supercell=sc;state.selected=chooseCentral(sc);prepareWorld();updateAll();rebuild();status('显示范围已改变；晶胞与周期邻域未改变。');}catch(error){event.target.value=String(state.copies);status(error.message,true);}});
  $('crystal-cutoff').addEventListener('input',event=>{try{const f=Number(event.target.value),m=API.build(state.config,f),sc=API.supercell(m,state.copies);state.model=m;state.supercell=sc;state.cutoff=f;state.selected=Math.min(state.selected,sc.atoms.length-1);prepareWorld();updateAll();rebuild();status('距离阈值已更新；连线仍不自动代表化学键。');}catch(error){event.target.value=String(state.cutoff);status(error.message,true);}});
  $('crystal-show-links').addEventListener('change',e=>{state.showLinks=e.target.checked;updateAll();rebuild();});$('crystal-show-ghosts').addEventListener('change',e=>{state.showGhosts=e.target.checked;if(!state.showGhosts&&state.supercell.atoms[state.selected].ghost)state.selected=chooseCentral(state.supercell);prepareWorld();updateAll();rebuild();});$('crystal-spacefill').addEventListener('change',e=>{state.spacefill=e.target.checked;prepareWorld();updateAll();rebuild();});
  $('crystal-weight').addEventListener('change',e=>{state.weight=e.target.value;updateReflection();});$('crystal-reflection-apply').addEventListener('click',()=>{const values=['h','k','l'].map(id=>{const e=$('crystal-'+id);return e.value.trim()===''?NaN:Number(e.value);});try{API.reflection(state.model,...values,state.weight);state.hkl=values;updateReflection();}catch(error){$('crystal-reflection-status').textContent=error.message;}});
  $('crystal-reflections').addEventListener('click',event=>{const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*240,i=clamp(Math.floor((x-15)/27),0,refs.length-1);state.hkl=refs[i].slice();['h','k','l'].forEach((id,j)=>{$('crystal-'+id).value=String(state.hkl[j]);});updateReflection();});
  $('crystal-previous-site').addEventListener('click',()=>selectSite(-1));$('crystal-next-site').addEventListener('click',()=>selectSite(1));
  $('crystal-zoom-in').addEventListener('click',()=>{state.zoom=clamp(state.zoom/1.18,.55,1.8);requestDraw();});$('crystal-zoom-out').addEventListener('click',()=>{state.zoom=clamp(state.zoom*1.18,.55,1.8);requestDraw();});
  $('crystal-reset-view').addEventListener('click',resetView);$('crystal-save').addEventListener('click',save);
  document.addEventListener('keydown',event=>{if(dialog.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}if(event.key==='Tab'){
    const focusable=[...dialog.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),summary,canvas[tabindex]')].filter(el=>el.getClientRects().length);if(!focusable.length){event.preventDefault();return;}const i=focusable.indexOf(document.activeElement);if(event.shiftKey&&i<=0){event.preventDefault();focusable.at(-1).focus();}else if(!event.shiftKey&&(i<0||i===focusable.length-1)){event.preventDefault();focusable[0].focus();}}
  },true);
  window.addEventListener('resize',()=>{if(!dialog.hidden)requestAnimationFrame(size);});
})();
