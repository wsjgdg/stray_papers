'use strict';
// Optional integration tests: install playwright-core and supply Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{Scan}=require('../ising-scan-core.js'),{interfaces}=require('../ising-analysis.js');
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
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function instrument(page){
  await page.addInitScript(()=>{window.__mainEvents=[];window.__scanEvents=[];const Native=window.Worker;window.Worker=function(url,...args){const w=new Native(url,...args),events=String(url).includes('ising-scan-worker.js')?window.__scanEvents:String(url).includes('ising-worker.js')?window.__mainEvents:null;if(events)w.addEventListener('message',e=>events.push(structuredClone(e.data)));return w;};});
}
async function captureThree(page){
  await page.route('**/vendor/three.min.js*',async route=>{const response=await route.fetch(),body=(await response.text())+`\n;(function(){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...a){const r=new Original(...a);window.__renderer=r;const render=r.render;r.render=function(s,c){window.__scene=s;window.__camera=c;return render.call(this,s,c);};return r;};})();`;await route.fulfill({response,body});});
}
async function open(page){await page.goto(base+'ising.html');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.status==='ready',null,{timeout:60000});await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins!==undefined,null,{timeout:30000});}
async function data(page){return page.locator('#ising-stage').evaluate(e=>({...e.dataset}));}
async function waitReadyAfter(page,g){await page.waitForFunction(n=>{const d=document.querySelector('#ising-stage').dataset;return d.status==='ready'&&Number(d.generation)>n;},g,{timeout:60000});}
async function setRange(page,id,value){await page.locator(id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function lastMain(page,kind){return page.evaluate(kind=>{const a=window.__mainEvents.findLast(e=>e.kind===kind);return a?{...a,spins:[...new Int8Array(a.spins)]}:null;},kind);}
async function waitScan(page,direction,count=15){await page.waitForFunction(({direction,count})=>{const d=document.querySelector('#scan-lab').dataset;return Number(d[direction+'Points'])===count&&d.status==='idle';},{direction,count},{timeout:60000});}
function runReference(options){const scan=new Scan(options),points=[];while(!scan.done){const r=scan.step();if(r.point)points.push(r.point);}return points;}
function near(a,b,t=1e-9){assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);}

test('periodic interface filter displays exactly the computed sites in arrows, points, and voxels without changing the state', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await instrument(page);await captureThree(page);await open(page);
  if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  const generation=Number((await data(page)).generation);await page.locator('#initial-spins').selectOption('domains');await waitReadyAfter(page,generation);
  await setRange(page,'#layers',20);await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawLayers==='20');
  const before=await lastMain(page,'ready'),prior=await data(page);await page.locator('#boundary-only').check();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='1600');
  let d=await data(page);assert.equal(d.interfaceSites,'1600');assert.equal(d.interfaceBonds,'800');assert.equal(d.visibleSpins,'1600');assert.equal(await page.locator('#boundary-empty').isVisible(),false);
  const matrices=await page.evaluate(()=>{
    const a=window.__scene.getObjectByName('ising-arrows'),v=window.__scene.getObjectByName('ising-voxels'),p=window.__scene.getObjectByName('ising-points');let errors=[];
    for(let i=0;i<8000;i++){const x=i%20,expected=[0,9,10,19].includes(x),av=Math.abs(a.instanceMatrix.array[i*16])>1e-6,vv=Math.abs(v.instanceMatrix.array[i*16])>1e-6,pv=Math.abs(p.geometry.attributes.position.array[i*3])<100;
      if(av!==expected||vv!==expected||pv!==expected){errors.push(i);if(errors.length>=10)break;}}
    return {errors,arrows:a.visible,voxels:v.visible,points:p.visible};
  });assert.deepEqual(matrices.errors,[]);assert.equal(matrices.arrows,true);
  for(const view of ['points','voxels','arrows']){await page.locator(`[data-quick-view="${view}"]`).click();await page.waitForFunction(v=>{const d=document.querySelector('#ising-stage').dataset;return d.drawView===v&&d.drawSpins==='1600';},view);const flags=await page.evaluate(()=>['ising-arrows','ising-points','ising-voxels'].map(n=>window.__scene.getObjectByName(n).visible));assert.equal(flags[['arrows','points','voxels'].indexOf(view)],true);}
  await page.locator('[data-note="domains"]').click();assert.equal(await page.locator('#card-interface-value').textContent(),'20.0% / 3.3%');
  await setRange(page,'#layers',12);await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='960');d=await data(page);assert.equal(d.interfaceSites,'1600');assert.equal(d.interfaceBonds,'800');assert.equal(d.correlation,String(before.stats.neighborCorrelation));
  await page.locator('#boundary-only').uncheck();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='4800');
  const restored=await page.evaluate(()=>{const a=window.__scene.getObjectByName('ising-arrows'),v=window.__scene.getObjectByName('ising-voxels'),p=window.__scene.getObjectByName('ising-points');for(let i=0;i<4800;i++)if(!a.instanceMatrix.array[i*16]||!v.instanceMatrix.array[i*16]||Math.abs(p.geometry.attributes.position.array[i*3])>100)return false;return true;});assert.equal(restored,true);
  d=await data(page);for(const key of ['generation','sweeps','magnetization','energy','sampleCount'])assert.equal(d[key],prior[key],key);assert.deepEqual(errors,[]);
});

test('interface sites update after real manual flips, preserve hidden probe coordinates, and have an honest empty state', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await instrument(page);await open(page);
  const g=Number((await data(page)).generation);await page.locator('#initial-spins').selectOption('up');await waitReadyAfter(page,g);await page.locator('#boundary-only').check();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='0');
  assert.equal(await page.locator('#boundary-empty').isVisible(),true);assert.equal((await data(page)).interfaceSites,'0');
  await page.locator('#flip-probe').click();await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.interfaceSites==='7'&&d.interfaceBonds==='6'&&d.drawSpins==='7';});
  const flipped=await lastMain(page,'flipped'),mask=interfaces(20,flipped.spins);assert.equal(mask.sites,7);assert.equal(mask.bonds,6);assert.equal(await page.locator('#boundary-empty').isVisible(),false);
  for(const axis of ['x','y','z'])await page.locator('#probe-'+axis).fill('0');await page.locator('#set-probe').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.probeIndex==='0');
  assert.equal(mask.mask[0],0);await page.locator('button[data-tool="probe"]').click();assert.equal(await page.locator('#probe-overlay').isVisible(),true);
  await page.locator('#ising-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.probeIndex!=='0');assert.equal(mask.mask[Number((await data(page)).probeIndex)],1);
  for(const [axis,value] of [['x','10'],['y','10'],['z','7']])await page.locator('#probe-'+axis).fill(value);await page.locator('#set-probe').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.probeIndex==='3010');await page.locator('#flip-probe').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='0');
  assert.equal((await data(page)).sweeps,'0');assert.equal(await page.locator('#boundary-empty').isVisible(),true);assert.deepEqual(errors,[]);
});

test('Canvas fallback filters actual drawn points, arrow heads and voxels using the same periodic mask', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};
    const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,fill=proto.fill,rect=proto.fillRect;window.__paint={fill:0,rect:0};
    function target(ctx){return ctx.canvas.id==='ising-scene'&&['#ffc08f','#7de2df'].includes(ctx.fillStyle);}
    proto.clearRect=function(...args){if(this.canvas.id==='ising-scene')window.__paint={fill:0,rect:0};return clear.apply(this,args);};
    proto.fill=function(...args){if(target(this))window.__paint.fill++;return fill.apply(this,args);};
    proto.fillRect=function(...args){if(target(this))window.__paint.rect++;return rect.apply(this,args);};
  });
  await instrument(page);await open(page);assert.equal((await data(page)).renderer,'canvas');const g=Number((await data(page)).generation);await page.locator('#initial-spins').selectOption('domains');await waitReadyAfter(page,g);await setRange(page,'#layers',20);await page.locator('#boundary-only').check();
  for(const [view,key] of [['points','fill'],['arrows','fill'],['voxels','rect']]){
    await page.locator(`[data-quick-view="${view}"]`).click();await page.waitForFunction(v=>{const d=document.querySelector('#ising-stage').dataset;return d.drawView===v&&d.drawSpins==='1600';},view);
    const count=await page.evaluate(key=>window.__paint[key],key);assert.equal(count,1600,view);
  }
  await page.locator('#boundary-only').uncheck();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='8000');assert.equal(await page.evaluate(()=>window.__paint.rect),8000);assert.deepEqual(errors,[]);
});

test('losing WebGL preserves the filtered lattice and statistics in the Canvas fallback', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await captureThree(page);await open(page);
  if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  const g=Number((await data(page)).generation);await page.locator('#initial-spins').selectOption('domains');await waitReadyAfter(page,g);await setRange(page,'#layers',20);await page.locator('#boundary-only').check();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins==='1600');const before=await data(page);
  const available=await page.evaluate(()=>{const gl=window.__renderer.getContext(),ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});if(!available){t.skip('WEBGL_lose_context unavailable');return;}
  await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.renderer==='canvas'&&d.drawSpins==='1600';},null,{timeout:30000});const after=await data(page);
  for(const key of ['generation','sweeps','magnetization','energy','sampleCount','interfaceSites','interfaceBonds','boundaryOnly'])assert.equal(after[key],before[key],key);assert.deepEqual(errors,[]);
});

test('two independent scan curves match actual seeded model samples, selectable values, table, CSV and main-lattice application', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await instrument(page);await open(page);
  const g=Number((await data(page)).generation);await page.locator('#lattice-size').selectOption('12');await waitReadyAfter(page,g);const before=await data(page),old=await lastMain(page,'ready');
  await page.locator('#scan-open-stage').click();assert.match(await page.locator('#scan-current-config').textContent(),/12³.*0.00.*20261031/);
  await page.locator('#scan-run-heat').click();await waitScan(page,'heat');await page.locator('#scan-run-cool').click();await waitScan(page,'cool');
  const messages=await page.evaluate(()=>window.__scanEvents.filter(e=>e.kind==='point'));
  for(const direction of ['heat','cool']){
    const reference=runReference({size:12,field:0,seed:20261031,direction,warm:64,samples:128,points:15,min:1,max:8}),actual=messages.filter(m=>m.jobId===(direction==='heat'?1:2)).map(m=>m.point);assert.equal(actual.length,15);
    for(let i=0;i<15;i++){assert.equal(actual[i].temperature,reference[i].temperature);assert.equal(actual[i].samples,128);for(const key of ['meanMagnetization','meanAbsMagnetization','meanEnergyPerSpin','susceptibility','heatCapacity'])near(actual[i][key],reference[i][key],1e-8);}
  }
  assert.equal(await page.locator('#scan-table-body tr').count(),30);assert.match(await page.locator('#scan-compare-note').textContent(),/不是热力学滞后/);
  const peakText=await page.locator('#scan-peak-value').textContent();for(const [direction,id] of [['升温',1],['降温',2]]){const p=messages.filter(e=>e.jobId===id).map(e=>e.point).reduce((a,b)=>b.susceptibility>a.susceptibility?b:a);assert.ok(peakText.includes(`${direction} ${p.susceptibility.toFixed(2)} @ T ${p.temperature.toFixed(2)}`));}
  for(const [metric,key] of [['order','meanAbsMagnetization'],['susceptibility','susceptibility'],['heat','heatCapacity'],['energy','meanEnergyPerSpin']]){
    await page.locator(`[data-scan-metric="${metric}"]`).click();await page.locator('#scan-pick').selectOption('6');
    for(const [direction,id] of [['heat',1],['cool',2]]){const p=messages.find(m=>m.jobId===id&&m.point.temperature===6).point;near(Number(await page.locator('#scan-'+direction+'-value').textContent()),p[key],.000051);}
  }
  await page.locator('#scan-chart circle.scan-target[data-temperature="3"]').last().click();assert.equal(await page.locator('#scan-pick').inputValue(),'3');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#scan-export').click()]);const csv=fs.readFileSync(await download.path(),'utf8').trim().split('\n');assert.equal(csv.length,31);assert.match(csv[0],/direction,status,L,field,seed,warmup_sweeps,sampling_sweeps/);assert.match(csv[1],/^heat,complete,12,0,20261031,64,128,/);
  const after=await data(page);for(const key of ['generation','sweeps','magnetization','energy','sampleCount','temperature','field'])assert.equal(after[key],before[key],key);
  await page.locator('#scan-apply').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.temperature==='3');const applied=await lastMain(page,'configured');assert.equal(applied.stats.temperature,3);assert.equal(applied.stats.sweeps,old.stats.sweeps);assert.deepEqual(applied.spins,old.spins);assert.equal(await page.locator('#scan-lab').isVisible(),false);
  await page.locator('#scan-open-stage').click();await page.locator('#scan-run-heat').click();await waitScan(page,'heat');const again=await page.evaluate(()=>window.__scanEvents.filter(e=>e.kind==='point'&&e.jobId===3).map(e=>e.point));assert.deepEqual(again,messages.filter(e=>e.jobId===1).map(e=>e.point));assert.deepEqual(errors,[]);
});

test('scan cancellation preserves only completed points, prevents stale results and allows rerunning', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await instrument(page);await open(page);
  const g=Number((await data(page)).generation);await page.locator('#lattice-size').selectOption('24');await waitReadyAfter(page,g);const before=await data(page);await page.locator('#scan-open-stage').click();await page.locator('#scan-budget').selectOption('long');await page.locator('#scan-run-heat').click();await page.locator('#scan-cancel').click();
  await page.waitForFunction(()=>document.querySelector('#scan-lab').dataset.status==='idle',null,{timeout:30000});assert.match(await page.locator('#scan-status').textContent(),/已取消/);
  const cancelled=await page.evaluate(()=>window.__scanEvents.findIndex(e=>e.kind==='cancelled'&&e.jobId===1));assert.ok(cancelled>=0);await page.waitForTimeout(250);
  assert.equal(await page.evaluate(i=>window.__scanEvents.slice(i+1).some(e=>e.jobId===1),cancelled),false);const after=await data(page);for(const key of ['sweeps','magnetization','energy','sampleCount','generation'])assert.equal(after[key],before[key]);
  await page.locator('#scan-budget').selectOption('quick');await page.locator('#scan-run-heat').click();await waitScan(page,'heat');assert.match(await page.locator('#scan-heat-meta').textContent(),/15\/15 点 · 已完成/);assert.deepEqual(errors,[]);
});

test('different scan conditions are labeled, scan continues while closed, and failed Worker does not fabricate results', {timeout:120000},async t=>{
  const page=await newPage(t);await instrument(page);await open(page);let g=Number((await data(page)).generation);await page.locator('#lattice-size').selectOption('12');await waitReadyAfter(page,g);
  await page.locator('#scan-open-stage').click();await page.locator('#scan-run-heat').click();await page.locator('#scan-close').click();await page.waitForFunction(()=>document.querySelector('#scan-lab').dataset.heatPoints==='15',null,{timeout:60000});
  await setRange(page,'#field',.6);await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.field==='0.6');await page.locator('#scan-open-stage').click();await page.locator('#scan-run-cool').click();await waitScan(page,'cool');
  assert.match(await page.locator('#scan-heat-meta').textContent(),/h 0.00/);assert.match(await page.locator('#scan-cool-meta').textContent(),/h 0.60/);assert.match(await page.locator('#scan-compare-note').textContent(),/外场不同/);
  await page.locator('#scan-clear').click();assert.equal(await page.locator('#scan-table-body tr').count(),1);assert.match(await page.locator('#scan-table-body').textContent(),/尚无采样数据/);
  const failed=await newPage(t);await failed.route('**/ising-scan-worker.js*',route=>route.abort());await open(failed);await failed.locator('#scan-open-stage').click();await failed.locator('#scan-run-heat').click();await failed.waitForFunction(()=>document.querySelector('#scan-lab').dataset.status==='idle'&&document.querySelector('#scan-status').textContent.includes('无法启动'),null,{timeout:20000});assert.equal(await failed.locator('#scan-lab').getAttribute('data-heat-points'),'0');assert.match(await failed.locator('#scan-chart-message').textContent(),/尚无曲线/);
});

test('scan and interface remain accessible, offline, focus-trapped and responsive on desktop and mobile', {timeout:120000},async t=>{
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    const page=await newPage(t,{viewport}),external=[],errors=[];page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));await open(page);
    const layout=await page.evaluate(()=>{const button=document.querySelector('#scan-open-stage').getBoundingClientRect(),caption=document.querySelector('.vortex-caption'),title=caption.getBoundingClientRect(),hud=document.querySelector('.lab-bottom').getBoundingClientRect();return {buttonTop:button.top,buttonBottom:button.bottom,titleBottom:getComputedStyle(caption).display==='none'?0:title.bottom,hudTop:hud.top};});
    assert.ok(layout.buttonTop>=layout.titleBottom-1,JSON.stringify({viewport,layout}));assert.ok(layout.buttonBottom<layout.hudTop,JSON.stringify({viewport,layout}));
    await page.locator('#scan-open-stage').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'scan-close');
    if(axe){await page.addScriptTag({content:axe.source});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>v.id);});assert.deepEqual(violations,[],JSON.stringify(viewport));}
    const dimensions=await page.evaluate(()=>{const b=document.querySelector('.scan-body');return {width:b.clientWidth,scrollWidth:b.scrollWidth,chart:document.querySelector('#scan-chart').getBoundingClientRect().width};});assert.ok(dimensions.scrollWidth<=dimensions.width+1,JSON.stringify(dimensions));assert.ok(dimensions.chart>240);
    if(viewport.width===1440){await page.locator('#scan-run-heat').click();await waitScan(page,'heat');}
    await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName.toLowerCase()),'summary');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'scan-close');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#scan-lab').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'scan-open-stage');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
});
