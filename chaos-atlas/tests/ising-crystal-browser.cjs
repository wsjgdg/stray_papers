'use strict';
// Optional browser integration: NODE_PATH with playwright-core and CHROMIUM_PATH.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),C=require('../crystal-model.js'),G=require('../ising-crystal-model.js'),{Scan}=require('../ising-scan-core.js');
let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.woff2':'font/woff2'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+(name==='/'?'/ising.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(error){if(i===2||!/signal=SIGSEGV/.test(String(error)))throw error;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function watch(page){
  await page.addInitScript(()=>{
    window.__mainEvents=[];window.__scanEvents=[];window.__workerPosts=[];const Native=window.Worker;
    window.Worker=function(url,...args){const w=new Native(url,...args),events=String(url).includes('ising-scan-worker.js')?window.__scanEvents:String(url).includes('ising-worker.js')?window.__mainEvents:null;
      if(events){w.addEventListener('message',e=>events.push(structuredClone(e.data)));const send=w.postMessage.bind(w);w.postMessage=function(m,...rest){window.__workerPosts.push({url:String(url),message:structuredClone(m)});return send(m,...rest);};}return w;};
  });
}
async function watchThree(page){
  await page.route('**/vendor/three.min.js*',async route=>{const response=await route.fetch(),body=(await response.text())+`\n;(function(){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...a){const r=new Original(...a);window.__renderer=r;const render=r.render;r.render=function(s,c){window.__scene=s;window.__camera=c;return render.call(this,s,c);};return r;};})();`;await route.fulfill({response,body});});
}
async function open(page){await page.goto(base+'ising.html');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.status==='ready',null,{timeout:60000});await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins!==undefined,null,{timeout:30000});}
const data=page=>page.locator('#ising-stage').evaluate(e=>({...e.dataset}));
async function afterGeneration(page,old){await page.waitForFunction(g=>{const d=document.querySelector('#ising-stage').dataset;return d.status==='ready'&&Number(d.generation)>g;},old,{timeout:60000});}
async function structure(page,id){const old=Number((await data(page)).generation);await page.locator('#spin-structure').selectOption(id);await afterGeneration(page,old);}
async function size(page,n){const old=Number((await data(page)).generation);await page.locator('#lattice-size').selectOption(String(n));await afterGeneration(page,old);}
async function apply(page){const old=Number((await data(page)).generation);await page.locator('#spin-apply-graph').click();await afterGeneration(page,old);}
async function range(page,id,value){await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function last(page,kind){return page.evaluate(kind=>{const e=window.__mainEvents.findLast(e=>e.kind===kind);return e?{...e,spins:[...new Int8Array(e.spins)]}:null;},kind);}
async function waitDraw(page,layers){await page.waitForFunction(n=>document.querySelector('#ising-stage').dataset.drawLayers===String(n),layers,{timeout:30000});}
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} ± ${t}`);
function csvLine(line){const out=[];let v='',quote=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quote&&line[i+1]==='"'){v+='"';i++;}else quote=!quote;}else if(c===','&&!quote){out.push(v);v='';}else v+=c;}out.push(v);return out;}

test('HCP changes both the periodic Hamiltonian and actual rendered 120-degree unit-cell geometry', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);
  assert.equal(await page.locator('#spin-structure optgroup option').count(),46);
  await structure(page,'hcp');await size(page,4);let snapshot=await last(page,'ready');
  const ref=new G.IsingCrystal({structure:C.preset('hcp'),size:4,temperature:4.51,field:0,seed:20261031,initial:'random'});
  assert.deepEqual(snapshot.spins,[...ref.spins]);near(snapshot.stats.energy,ref.energy);assert.equal(snapshot.stats.spinCount,128);near(snapshot.stats.meanDegree,12);
  assert.match(await page.locator('#spin-graph-summary').textContent(),/平均键度 12\.00/);assert.equal(await page.locator('.critical-meter').isHidden(),true);
  await range(page,'#layers',4);await waitDraw(page,4);
  if((await data(page)).renderer==='webgl'){
    const positions=await page.evaluate(()=>{const mesh=window.__scene.getObjectByName('ising-arrows'),a=mesh.instanceMatrix.array;return [0,2,8,32].map(i=>Array.from(a.slice(i*16+12,i*16+15)));});
    const delta=j=>positions[j].map((x,k)=>x-positions[0][k]),A=delta(1),B=delta(2),D=delta(3),v=ref.topology.crystal.vectors,factor=A[0]/v.A[0];
    for(let k=0;k<3;k++){near(A[k],v.A[k]*factor,2e-6);near(B[k],v.B[k]*factor,2e-6);near(D[k],v.C[k]*factor,2e-6);}
    near(A.reduce((s,x,k)=>s+x*B[k],0)/(Math.hypot(...A)*Math.hypot(...B)),-.5,2e-6);
  }
  for(const axis of ['x','y','z'])await page.locator('#probe-'+axis).fill('0');await page.locator('#probe-site').selectOption('0');await page.locator('#set-probe').click();
  await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.probeIndex==='0'&&document.querySelector('#ising-stage').dataset.probeDelta!=='');
  await page.locator('button[data-tool="probe"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.neighborSites==='12');
  const p=(await last(page,'probed')).probe,local=ref.local(0);assert.equal(p.degree,12);near(p.weightedSum,local.weightedSum);near(p.deltaEnergy,local.deltaEnergy);near(p.probability,local.probability);
  const t0=ref.topology,visibleLinks=Array.from(t0.wrapped.slice(t0.offsets[0],t0.offsets[1])).filter(x=>!x).length;assert.equal(Number((await data(page)).neighborLinks),visibleLinks);
  await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.sweeps==='1');snapshot=await last(page,'frame');ref.sweep(1);assert.deepEqual(snapshot.spins,[...ref.spins]);near(snapshot.stats.energy,ref.energy);assert.deepEqual(errors,[]);
});

test('species, signed coupling drafts, element coloring and zero-bond states feed the real worker', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);await structure(page,'nacl');await size(page,4);
  const before=await data(page);await range(page,'#spin-j-same',.7);await range(page,'#spin-j-different',-1.3);assert.equal((await data(page)).generation,before.generation);assert.match(await page.locator('#spin-graph-note').textContent(),/草稿/);
  await apply(page);let snapshot=await last(page,'ready'),ref=new G.IsingCrystal({structure:C.preset('nacl'),size:4,temperature:4.51,field:0,seed:20261031,initial:'random',jSame:.7,jDifferent:-1.3});
  assert.deepEqual(snapshot.spins,[...ref.spins]);near(snapshot.stats.energy,ref.energy,1e-8);assert.match(await page.locator('#spin-graph-note').textContent(),/反铁磁/);
  await page.locator('#spin-color-mode').selectOption('element');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.colorMode==='element');
  assert.equal(await page.locator('#spin-legend-up').isHidden(),true);assert.match(await page.locator('#spin-element-legend').textContent(),/Na/);assert.match(await page.locator('#spin-element-legend').textContent(),/Cl/);
  if((await data(page)).renderer==='webgl'){
    const expected=await page.evaluate(({a,b})=>[new THREE.Color(a).toArray(),new THREE.Color(b).toArray()],{a:C.color(ref.topology.crystal.sites[0].element),b:C.color(ref.topology.crystal.sites[4].element)});
    await page.waitForFunction(value=>{const mesh=window.__scene.getObjectByName('ising-arrows');return mesh&&mesh.instanceColor&&Math.abs(mesh.instanceColor.array[0]-value)<1e-5;},expected[0][0]);
    const colors=await page.evaluate(()=>{const mesh=window.__scene.getObjectByName('ising-arrows'),a=mesh.instanceColor.array;return [Array.from(a.slice(0,3)),Array.from(a.slice(12,15))];});
    for(let i=0;i<2;i++)for(let k=0;k<3;k++)near(colors[i][k],expected[i][k],1e-5);
  }
  const generation=(await data(page)).generation;await page.locator('#spin-species-list input[value="Na"]').uncheck();await page.locator('#spin-species-list input[value="Cl"]').uncheck();await page.locator('#spin-apply-graph').click();assert.equal((await data(page)).generation,generation);assert.match(await page.locator('#spin-graph-note').textContent(),/至少选择/);
  await page.locator('#spin-species-list input[value="Na"]').check();await apply(page);
  snapshot=await last(page,'ready');ref=new G.IsingCrystal({structure:C.preset('nacl'),size:4,temperature:4.51,field:0,seed:20261031,initial:'random',jSame:.7,jDifferent:-1.3,activeSpecies:['Na']});
  assert.deepEqual(snapshot.spins,[...ref.spins]);assert.equal(snapshot.stats.bondCount,0);assert.equal(snapshot.stats.neighborCorrelation,null);assert.equal(snapshot.stats.components,256);assert.equal(Number((await data(page)).activeSpins),256);
  await page.locator('[data-note="domains"]').click();assert.equal(await page.locator('#card-correlation').textContent(),'—');assert.equal(await page.locator('#card-interface-value').textContent(),'0.0% / —');
  const inactive=ref.topology.crystal.sites.findIndex(site=>site.element==='Cl');for(const axis of ['x','y','z'])await page.locator('#probe-'+axis).fill('0');await page.locator('#probe-site').selectOption(String(inactive));await page.locator('#set-probe').click();
  await page.waitForFunction(i=>{const d=document.querySelector('#ising-stage').dataset;return d.probeIndex===String(i)&&d.probeSpin==='0';},inactive);assert.match(await page.locator('#probe-readout').textContent(),/未启用/);
  await page.locator('#flip-probe').click();assert.match(await page.locator('#stage-notice').textContent(),/无法翻转/);assert.equal((await data(page)).sweeps,'0');
  if((await data(page)).renderer==='webgl'){
    const visual=await page.evaluate(i=>{const a=window.__scene.getObjectByName('ising-arrows').instanceMatrix.array,n=window.__scene.getObjectByName('ising-inactive-sites').instanceMatrix.array;return {arrow:a[i*16],neutral:n[i*16]};},inactive);near(visual.arrow,0);assert.ok(visual.neutral>0);
  }
  await page.locator('#spin-color-mode').selectOption('element');assert.match(await page.locator('#spin-element-legend').textContent(),/Na/);assert.doesNotMatch(await page.locator('#spin-element-legend').textContent(),/Cl/);assert.equal(await page.locator('#spin-neutral-key').isHidden(),false);
  await page.locator('#card-interface').click();assert.equal((await data(page)).colorMode,'spin');assert.equal((await data(page)).view,'points');
  await page.locator('#spin-color-mode').selectOption('element');const prior=Number((await data(page)).generation);await page.locator('#card-domains').click();await afterGeneration(page,prior);assert.equal((await data(page)).colorMode,'spin');assert.equal((await data(page)).view,'voxels');assert.equal((await data(page)).initial,'domains');assert.deepEqual(errors,[]);
});

test('committed edited atlas cell is applied to the actual spin graph, not just its display', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await page.locator('#crystal-open').click();await page.locator('#crystal-preset').selectOption('cP');
  await page.locator('.crystal-editor summary').first().click();await page.locator('#crystal-gamma').fill('80');await page.locator('#crystal-apply').click();await page.waitForFunction(()=>document.querySelector('#crystal-lab').dataset.preset==='custom');
  const g=Number((await data(page)).generation);await page.locator('#crystal-use-spins').click();await afterGeneration(page,g);assert.equal(await page.locator('#crystal-lab').isVisible(),false);assert.equal((await data(page)).structure,'custom');
  const posted=await page.evaluate(()=>window.__workerPosts.findLast(e=>e.message.type==='reset').message.options),snapshot=await last(page,'ready');assert.equal(posted.structure.cell[5],80);assert.equal(posted.structure.id,'custom');
  const ref=new G.IsingCrystal(posted);assert.deepEqual(snapshot.spins,[...ref.spins]);near(snapshot.stats.energy,ref.energy);near(snapshot.stats.meanDegree,ref.topology.meanDegree);assert.match(await page.locator('#spin-graph-summary').textContent(),/自定义晶胞/);
  await structure(page,'simple-ising');assert.match(await page.locator('#spin-temperature-hint').textContent(),/4\.5115/);assert.equal(await page.locator('#spin-graph-options').isHidden(),true);assert.deepEqual(errors,[]);
});

test('temperature scan locks the selected graph, matches independent sampling, exports reconstructable parameters and labels mixed curves', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await structure(page,'hcp');await size(page,4);const before=await data(page);
  await page.locator('#scan-open-stage').click();assert.match(await page.locator('#scan-current-config').textContent(),/六方密排/);assert.match(await page.locator('#scan-range-value').textContent(),/1\.00 → 18\.0/);assert.equal(await page.locator('#scan-chart .scan-reference').count(),0);
  await page.locator('#scan-run-heat').click();await page.waitForFunction(()=>{const d=document.querySelector('#scan-lab').dataset;return d.heatPoints==='15'&&d.status==='idle';},null,{timeout:60000});
  const events=await page.evaluate(()=>window.__scanEvents),started=events.find(e=>e.kind==='started'&&e.jobId===1),points=events.filter(e=>e.kind==='point'&&e.jobId===1).map(e=>e.point);
  assert.equal(started.options.structure.id,'hcp');assert.equal(started.options.size,4);assert.equal(started.options.max,18);assert.equal(started.options.min,1);assert.equal(points.length,15);
  const scan=new Scan(started.options),reference=[];while(!scan.done){const v=scan.step();if(v.point)reference.push(v.point);}assert.deepEqual(points,reference);
  const after=await data(page);for(const k of ['generation','sweeps','magnetization','energy','temperature'])assert.equal(after[k],before[k],k);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#scan-export').click()]);const rows=fs.readFileSync(await download.path(),'utf8').trim().split('\n').map(csvLine),header=rows[0],first=rows[1];assert.equal(rows.length,16);
  assert.equal(first[header.indexOf('structure')],C.preset('hcp').name);assert.deepEqual(JSON.parse(first[header.indexOf('structure_json')]),C.preset('hcp'));assert.equal(first[header.indexOf('active_species')],'Mg');
  await page.locator('#scan-close').click();await structure(page,'simple-ising');await page.locator('#scan-open-stage').click();assert.equal(await page.locator('#scan-chart .scan-reference').count(),0);await page.locator('#scan-run-cool').click();await page.waitForFunction(()=>{const d=document.querySelector('#scan-lab').dataset;return d.coolPoints==='15'&&d.status==='idle';},null,{timeout:60000});
  assert.match(await page.locator('#scan-compare-note').textContent(),/结构 \/ 耦合 \/ 活跃组元/);assert.match(await page.locator('#scan-compare-note').textContent(),/最高温度/);await page.locator('#scan-pick').selectOption('18');assert.equal(await page.locator('#scan-cool-value').textContent(),'—');assert.notEqual(await page.locator('#scan-heat-value').textContent(),'—');
  await page.locator('#scan-apply').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.temperature==='18');assert.equal(await page.locator('#temperature').inputValue(),'18');assert.deepEqual(errors,[]);
});

test('Canvas fallback draws inactive sites and the same graph data through view changes and probing', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};
    const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,fill=proto.fill;window.__fills={};proto.clearRect=function(...args){if(this.canvas.id==='ising-scene')window.__fills={};return clear.apply(this,args);};proto.fill=function(...args){if(this.canvas.id==='ising-scene')window.__fills[this.fillStyle]=(window.__fills[this.fillStyle]||0)+1;return fill.apply(this,args);};
  });
  await watch(page);await open(page);assert.equal((await data(page)).renderer,'canvas');await structure(page,'nacl');await size(page,4);await page.locator('#spin-species-list input[value="Cl"]').uncheck();await apply(page);await range(page,'#layers',4);await waitDraw(page,4);
  await page.locator('[data-quick-view="points"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='points');const fills=await page.evaluate(()=>window.__fills);assert.equal(fills['#8ba69a'],256);assert.equal((fills['#ffc08f']||0)+(fills['#7de2df']||0),256);
  const before=await last(page,'ready'),d=await data(page);await page.locator('[data-quick-view="arrows"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='arrows');await page.locator('#spin-color-mode').selectOption('element');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.colorMode==='element');
  for(const axis of ['x','y','z'])await page.locator('#probe-'+axis).fill('0');await page.locator('#probe-site').selectOption('4');await page.locator('#set-probe').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.probeSpin==='0');
  const after=await last(page,'probed');assert.deepEqual(after.spins,before.spins);for(const key of ['generation','sweeps','magnetization','energy'])assert.equal((await data(page))[key],d[key]);assert.match(await page.locator('#stage-fallback').textContent(),/Canvas/);assert.deepEqual(errors,[]);
});

test('WebGL context loss retains a selected crystal graph and resumes in Canvas', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await structure(page,'spinel');await size(page,4);const before=await data(page),snapshot=await last(page,'ready');
  const supported=await page.evaluate(()=>{const ext=window.__renderer.getContext().getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});if(!supported){t.skip('WEBGL_lose_context unavailable');return;}
  await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.renderer==='canvas',null,{timeout:30000});const after=await data(page);for(const key of ['generation','structure','siteCount','activeSpins','meanDegree','sweeps','energy','magnetization'])assert.equal(after[key],before[key],key);
  await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.sweeps==='1');assert.equal((await last(page,'frame')).spins.length,snapshot.spins.length);assert.deepEqual(errors,[]);
});

test('rebuilding between dense crystal graphs releases old render resources', {timeout:120000},async t=>{
  const page=await newPage(t);await watchThree(page);await open(page);if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  const memories=[];for(let i=0;i<3;i++){await structure(page,'spinel');await size(page,4);await range(page,'#layers',4);await page.waitForFunction(()=>{const o=window.__scene&&window.__scene.getObjectByName('ising-arrows');return o&&o.count===3584;},{},{timeout:30000});memories.push(await page.evaluate(()=>({...window.__renderer.info.memory})));
    await structure(page,'hcp');await size(page,6);await range(page,'#layers',6);await page.waitForFunction(()=>{const o=window.__scene&&window.__scene.getObjectByName('ising-arrows');return o&&o.count===432;},{},{timeout:30000});}
  assert.ok(memories.at(-1).geometries<=memories[0].geometries+1,JSON.stringify(memories));assert.ok(memories.at(-1).textures<=memories[0].textures+1,JSON.stringify(memories));
});

test('crystal graph controls and scan remain offline, responsive and accessible at desktop and mobile sizes', {timeout:180000},async t=>{
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    const page=await newPage(t,{viewport}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await open(page);
    if(await page.locator('#control-panel').isHidden())await page.locator('#toggle-controls').click();await structure(page,'nacl');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);assert.equal(await page.locator('#spin-species-list input').count(),2);assert.match(await page.locator('#spin-graph-note').textContent(),/教学假设/);
    if(axe){await page.addScriptTag({content:axe.source});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],JSON.stringify({viewport,violations}));}
    if(!(await page.locator('#control-panel').isHidden())&&viewport.width<1100)await page.locator('#toggle-controls').click();await page.locator('#scan-open-stage').click();assert.match(await page.locator('#scan-current-config').textContent(),/NaCl/);
    if(axe){const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>v.id);});assert.deepEqual(violations,[],JSON.stringify(viewport));}
    const layout=await page.evaluate(()=>{const b=document.querySelector('.scan-body');return {width:b.clientWidth,scrollWidth:b.scrollWidth};});assert.ok(layout.scrollWidth<=layout.width+1,JSON.stringify({viewport,layout}));await page.keyboard.press('Escape');assert.equal(await page.locator('#scan-lab').isVisible(),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
});
