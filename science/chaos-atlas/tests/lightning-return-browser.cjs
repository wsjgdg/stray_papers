'use strict';
// Browser integration of the independent branched RLC model. Run with
// playwright-core, CHROMIUM_PATH and (optionally) axe-core installed locally.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),{createHash}=require('node:crypto');
const {chromium}=require('playwright-core'),Return=require('../lightning-return.js');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url==='/')url='/lightning.html';const file=path.resolve(root,'.'+url);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let b;
  for(let i=0;i<3;i++){try{b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>b.close());return b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function watch(page){await page.addInitScript(()=>{
  const Original=window.Worker;window.__returnEvents=[];window.__returnJobs=[];window.__returnTerminated=0;window.__returnResult=null;
  window.Worker=function(url,...args){const w=new Original(url,...args);if(String(url).includes('lightning-return-worker')){
    const post=w.postMessage.bind(w),terminate=w.terminate.bind(w);w.postMessage=function(message,...extra){window.__returnJobs.push(structuredClone(message));if(window.__returnDelay){setTimeout(()=>post(message,...extra),window.__returnDelay);return;}return post(message,...extra);};
    w.terminate=function(){window.__returnTerminated++;return terminate();};w.addEventListener('message',event=>{const d=event.data;window.__returnEvents.push({kind:d.kind,frame:d.frame,message:d.message});if(d.kind==='return-result')window.__returnResult=structuredClone(d);});
  }return w;};
});}
async function watchThree(page){await page.route('**/lightning.js*',async route=>{const response=await route.fetch(),source=await response.text(),spy=`if(window.THREE){const Old=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...a){const r=new Old(...a),render=r.render.bind(r);r.render=function(scene,camera){window.__returnThree={scene,camera,renderer:r};return render(scene,camera)};return r;};}\n`;await route.fulfill({response,body:spy+source});});}
async function open(page){await page.goto(base+'lightning.html',{waitUntil:'load'});await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#lightning-stage').dataset.status),null,{timeout:90000});assert.equal(await page.locator('#lightning-stage').getAttribute('data-status'),'ready');}
async function input(page,id,value){await page.locator(id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function contact(page){await page.locator('#thermal-example').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.status==='ready'&&document.querySelector('#lightning-stage').dataset.complete==='true',null,{timeout:90000});}
async function calculate(page){await page.locator('#return-compute').click();await page.waitForFunction(()=>['paused','running'].includes(document.querySelector('#lightning-stage').dataset.return),null,{timeout:90000});}
async function example(page){await page.locator('#return-example').click();await page.waitForFunction(()=>['paused','running'].includes(document.querySelector('#lightning-stage').dataset.return),null,{timeout:90000});}
function near(a,b,tol){assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (tol ${tol})`);}
async function dataset(page){return page.locator('#lightning-stage').evaluate(e=>({...e.dataset}));}
async function twoFrames(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}

test('the visible wave, graph and probes are derived from a reproducible RLC solve of the real DBM contact tree', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);
  assert.equal(await page.locator('#return-compute').isDisabled(),true);await example(page);await input(page,'#return-time',80);await twoFrames(page);
  const state=await dataset(page),info=await page.evaluate(()=>{
    const j=window.__returnJobs.at(-1),r=window.__returnResult,e=Number(document.querySelector('#lightning-stage').dataset.returnProbeEdge),f=Number(document.querySelector('#lightning-stage').dataset.returnFrame),k=f*r.edges+e;
    return {tree:{...j.tree,segments:Array.from(j.tree.segments),mask:Array.from(j.tree.mask)},options:j.options,duration:j.duration,frames:r.frames,parts:r.parts,dt:r.dt,perFrame:r.perFrame,edge:e,groundEdge:r.edges-1,probe:r.currents[k],voltage:r.voltages[k],heat:r.heating[k],ground:r.metrics.groundCurrent[f],energy:r.metrics.energyError[f],initialEnergy:r.initialEnergy,wave:r.waveSpeed,impedance:r.impedance};
  });
  assert.equal(state.complete,'true');assert.equal(state.steps,'69');assert.equal(state.return,'paused');assert.equal(Number(state.returnFrame),80);assert.equal(state.thermal,'off');assert.equal(info.parts,4);
  const m=new Return.ReturnStroke(info.tree,info.options),per=m.setOutputInterval(info.duration/(info.frames-1));assert.equal(per,info.perFrame);
  for(let i=0;i<80*per;i++)assert.ok(m.step().ok);near(Number(state.returnTime),m.time,1e-15);near(Number(state.returnGround),m.stats().groundCurrent,1e-7);
  near(info.probe,m.current[info.edge],Math.max(.01,Math.abs(m.current[info.edge])*1e-6));near(Number(state.returnProbeCurrent),-info.probe,.01);near(Number(state.returnProbeVoltage),info.voltage,.01);
  near(info.heat,m.heat[info.edge]/m.lengths[info.edge],Math.max(1e-4,info.heat*1e-6));const main=new Set(m.mainIndices);let branch=0;for(let e=0;e<m.edges;e++)if(!main.has(e))branch=Math.max(branch,Math.abs(m.current[e]));near(Number(state.returnBranchCurrent),branch,Math.max(.01,branch*1e-6));assert.ok(Math.abs(info.energy/info.initialEnergy)<1e-12);
  assert.match(await page.locator('#return-chart').getAttribute('aria-label'),/接地点.*探针/);assert.match(await page.locator('#stage-title').innerText(),/回击传播/);assert.match(await page.locator('#metric-label-1').innerText(),/回击时间/);
  if(state.renderer==='webgl'){
    const e=info.groundEdge,actual=await page.evaluate(e=>{const core=window.__returnThree.scene.getObjectByName('discharge-core'),c=new THREE.Color();core.getColorAt(e,c);const marker=window.__returnThree.scene.getObjectByName('return-current-probe');return {rgb:c.toArray(),marker:marker.visible};},e);
    const i=await page.evaluate(e=>{const r=window.__returnResult,f=Number(document.querySelector('#lightning-stage').dataset.returnFrame);return Math.abs(r.currents[f*r.edges+e]);},e);
    const x=Math.pow(Math.min(1,i/(info.options.voltage/info.impedance)),.42);near(actual.rgb[0],.08+.74*x,1e-6);near(actual.rgb[1],.12+.84*x,1e-6);near(actual.rgb[2],.20+.80*x,1e-6);assert.equal(actual.marker,true);
  }
  assert.deepEqual(errors,[]);
});

test('physical parameters invalidate and recompute; display and probe controls never rerun the solver', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await contact(page);await calculate(page);await input(page,'#return-time',80);
  const first=await dataset(page),jobs=await page.evaluate(()=>window.__returnJobs.length),edge=Number(first.returnProbeEdge);
  await input(page,'#return-probe',10);await page.locator('#return-encoding').selectOption('power');await page.locator('#return-rate').selectOption('15');await input(page,'#return-time',120);
  assert.notEqual(Number((await dataset(page)).returnProbeEdge),edge);assert.equal(await page.evaluate(()=>window.__returnJobs.length),jobs);
  assert.match(await page.locator('#return-legend-label').innerText(),/功率/);await page.locator('#return-encoding').selectOption('heat');assert.match(await page.locator('#return-legend-label').innerText(),/焦耳能/);
  await input(page,'#return-voltage',20);assert.equal((await dataset(page)).return,'off');assert.match(await page.locator('#return-status').innerText(),/参数已变化/);assert.equal(await page.locator('#return-play').isDisabled(),true);
  await calculate(page);await input(page,'#return-time',80);const second=await dataset(page);near(Number(second.returnGround),2*Number(first.returnGround),1e-6);
  assert.equal(await page.evaluate(()=>window.__returnJobs.length),jobs+1);assert.equal(second.steps,'69');assert.deepEqual(errors,[]);
});

test('bottom transport, keyboard, seeking and the existing DC model remain consistent', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await contact(page);await calculate(page);
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'播放回击');assert.equal(await page.locator('#reset').getAttribute('aria-label'),'回击回到起点');
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#lightning-stage').dataset.returnFrame)>3,null,{timeout:30000});await page.locator('#play').click();const n=Number((await dataset(page)).returnFrame);
  await page.locator('#step').click();assert.equal(Number((await dataset(page)).returnFrame),n+1);await page.locator('button[data-speed="2"]').click();assert.equal(await page.locator('button[data-speed="2"]').getAttribute('aria-pressed'),'true');
  await page.locator('#reset').click();assert.equal(Number((await dataset(page)).returnFrame),0);await page.locator('#lightning-scene').focus();await page.keyboard.press('Space');assert.equal((await dataset(page)).return,'running');await page.keyboard.press('Space');assert.equal((await dataset(page)).return,'paused');
  await page.locator('#thermal-step').click();let d=await dataset(page);assert.equal(d.return,'hidden');assert.equal(d.thermal,'paused');assert.equal(await page.locator('#play').isDisabled(),true);assert.equal(await page.locator('#metric-label-1').innerText(),'生长步数');assert.match(await page.locator('#return-comparison').textContent(),/0.000（无量纲）/);
  await page.locator('#return-view').click();d=await dataset(page);assert.equal(d.return,'paused');assert.equal(d.thermal,'hidden');assert.equal(await page.locator('#play').getAttribute('aria-label'),'播放回击');
  await page.locator('#return-view').click();assert.equal((await dataset(page)).return,'hidden');assert.equal(await page.locator('#play').isDisabled(),true);assert.deepEqual(errors,[]);
});

test('cancel, changed geometry and tab hiding prevent stale or unexpected replay', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await page.addInitScript(()=>{window.__returnDelay=800;});await open(page);await contact(page);
  await page.locator('#return-compute').click();assert.equal((await dataset(page)).return,'computing');await page.locator('#return-cancel').click();assert.equal((await dataset(page)).return,'off');assert.match(await page.locator('#return-status').innerText(),/取消/);
  await page.locator('#return-compute').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='paused',null,{timeout:90000});assert.ok(await page.evaluate(()=>window.__returnTerminated)>=2);
  await page.locator('#return-play').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='running');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await dataset(page)).return,'paused');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await dataset(page)).return,'paused');
  await page.locator('#electrode-shape').selectOption('blunt');await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.status==='ready'&&document.querySelector('#lightning-stage').dataset.complete==='false',null,{timeout:90000});assert.equal((await dataset(page)).return,'off');assert.equal(await page.locator('#return-play').isDisabled(),true);assert.deepEqual(errors,[]);
});

test('Canvas fallback renders the actual replay, changes with time and exports a PNG', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,...a){return /webgl/i.test(k)?null:get.call(this,k,...a);};});
  await open(page);assert.equal((await dataset(page)).renderer,'canvas');await contact(page);await calculate(page);await input(page,'#return-time',0);await twoFrames(page);
  async function hash(){const data=await page.locator('#lightning-scene').evaluate(c=>c.toDataURL('image/png'));return createHash('sha256').update(data).digest('hex');}
  const before=await hash();await input(page,'#return-time',120);await twoFrames(page);assert.notEqual(await hash(),before);await page.locator('#return-encoding').selectOption('power');await twoFrames(page);assert.match(await page.locator('#return-legend-label').innerText(),/功率/);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-image').click()]);const bytes=fs.readFileSync(await download.path());assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.deepEqual(errors,[]);
});

test('mobile example leaves the model visible and bottom return transport works', {timeout:120000},async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await page.locator('#toggle-controls').tap();await example(page);
  await page.waitForFunction(()=>document.querySelector('#control-panel').hidden,null,{timeout:30000});assert.equal(await page.locator('#play').getAttribute('aria-label'),'暂停回击');await page.locator('#play').tap();assert.equal((await dataset(page)).return,'paused');
  await page.locator('#step').tap();assert.match(await page.locator('#metric-label-1').innerText(),/回击时间/);await page.locator('#toggle-controls').tap();await page.locator('#return-readout').scrollIntoViewIfNeeded();
  const fit=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,doc:document.documentElement.scrollWidth,chart:document.querySelector('#return-chart').getBoundingClientRect().toJSON(),panel:document.querySelector('#control-panel').getBoundingClientRect().toJSON()}));
  assert.equal(fit.doc,fit.viewport);assert.ok(fit.chart.left>=fit.panel.left&&fit.chart.right<=fit.panel.right+1);assert.deepEqual(errors,[]);
});

test('offline worker failure is explicit, preserves the main model and permits retry', {timeout:120000},async t=>{
  const page=await pageFor(t),remote=[];await page.route('**/*',route=>{const u=route.request().url();if(!u.startsWith(base)&&!u.startsWith('data:')&&!u.startsWith('blob:')){remote.push(u);return route.abort();}return route.continue();});await watch(page);await open(page);await contact(page);
  const abort=route=>route.abort();await page.route('**/lightning-return-worker.js*',abort);await page.locator('#return-compute').click();await page.waitForFunction(()=>document.querySelector('#return-status').textContent.includes('无法启动'),null,{timeout:30000});
  assert.equal((await dataset(page)).status,'ready');assert.equal((await dataset(page)).complete,'true');assert.equal(await page.locator('#return-compute').isDisabled(),false);
  await page.unroute('**/lightning-return-worker.js*',abort);await calculate(page);assert.equal((await dataset(page)).return,'paused');assert.deepEqual(remote,[]);
});

test('new card, controls and mobile layout pass axe accessibility checks', {timeout:120000,skip:!axe},async t=>{
  const page=await pageFor(t);await page.addInitScript({content:axe.source});await open(page);
  async function audit(label){const violations=await page.evaluate(async()=>{const r=await axe.run(document);return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],label);}
  await page.locator('[data-note="return"]').click();await audit('return card');await page.locator('.return-advanced summary').click();await audit('expanded controls');
  await contact(page);await calculate(page);await audit('active return');await page.setViewportSize({width:390,height:844});await twoFrames(page);await audit('mobile');await page.locator('#toggle-controls').click();await audit('mobile controls');
});

test('a hidden tab during automatic precomputation never starts replay behind the user', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await page.addInitScript(()=>{window.__returnDelay=1200;});await open(page);
  await page.locator('#return-example').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='computing',null,{timeout:90000});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='paused',null,{timeout:90000});assert.equal(Number((await dataset(page)).returnFrame),0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await dataset(page)).return,'paused');assert.deepEqual(errors,[]);
});

test('changing an electrode while the return Worker is in flight discards the old generation', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await page.addInitScript(()=>{window.__returnDelay=1400;});await open(page);await contact(page);
  await page.locator('#return-compute').click();assert.equal((await dataset(page)).return,'computing');await page.locator('#electrode-shape').selectOption('blunt');
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.status==='ready'&&document.querySelector('#lightning-stage').dataset.complete==='false',null,{timeout:90000});
  await page.waitForTimeout(1600);assert.equal((await dataset(page)).return,'off');assert.equal(await page.evaluate(()=>window.__returnEvents.filter(e=>e.kind==='return-result').length),0);assert.ok(await page.evaluate(()=>window.__returnTerminated)>=1);assert.deepEqual(errors,[]);
});

test('grid display uses the same four solved line elements and background studies do not mutate replay', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);await contact(page);await page.locator('button[data-appearance="grid"]').click();await calculate(page);await input(page,'#return-time',100);
  const before=await dataset(page);assert.equal(Number(before.renderSegments),Number(before.drawSegments)*4);const sent=await page.evaluate(()=>window.__returnJobs.length);
  await page.locator('#grid-events').fill('2');await page.locator('#grid-study').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.gridStudy==='done',null,{timeout:60000});const after=await dataset(page);
  assert.equal(after.return,'paused');assert.equal(after.returnFrame,before.returnFrame);assert.equal(after.returnGround,before.returnGround);assert.equal(await page.evaluate(()=>window.__returnJobs.length),sent);assert.deepEqual(errors,[]);
});

test('hiding while the DBM contact prewarm is queued prevents later automatic playback', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);
  await page.addInitScript(()=>{const Previous=window.Worker;window.Worker=function(url,...args){const w=new Previous(url,...args);if(String(url).includes('lightning-worker.js')){const post=w.postMessage.bind(w);w.postMessage=function(msg,...rest){if(msg.type==='init'&&window.__slowContact){setTimeout(()=>post(msg,...rest),1200);return;}return post(msg,...rest);};}return w;};});
  await open(page);await page.evaluate(()=>{window.__slowContact=true;});await page.locator('#return-example').click();assert.equal((await dataset(page)).status,'loading');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='paused',null,{timeout:90000});assert.equal(Number((await dataset(page)).returnFrame),0);assert.deepEqual(errors,[]);
});

test('the return-stroke knowledge card launches the example from a mobile drawer', {timeout:120000},async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);
  await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="return"]').tap();await page.locator('#return-card-example').tap();
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.return==='running',null,{timeout:90000});assert.equal(await page.locator('#control-panel').isHidden(),true);assert.equal(await page.locator('#knowledge-panel').isHidden(),true);assert.deepEqual(errors,[]);
});

test('a WebGL context loss preserves return-stroke samples and controls in Canvas', {timeout:120000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);
  if((await dataset(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await contact(page);await calculate(page);await input(page,'#return-time',120);const before=await dataset(page);
  await page.locator('#lightning-scene').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.renderer==='canvas');
  const after=await dataset(page);assert.equal(after.return,'paused');assert.equal(after.returnFrame,before.returnFrame);assert.equal(after.returnGround,before.returnGround);assert.equal(after.returnProbeCurrent,before.returnProbeCurrent);
  await page.locator('#step').click();assert.equal(Number((await dataset(page)).returnFrame),121);await twoFrames(page);assert.ok((await page.locator('#lightning-scene').evaluate(c=>c.toDataURL('image/png'))).startsWith('data:image/png'));assert.deepEqual(errors,[]);
});
