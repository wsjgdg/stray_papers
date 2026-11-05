'use strict';
// Optional UI regressions: install playwright-core and provide Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {createHash}=require('node:crypto'),{chromium}=require('playwright-core'),Model=require('../streamer-model.js');
let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/streamer.html';
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});}
async function watchWorker(page){await page.addInitScript(()=>{
  const Original=window.Worker;window.__streamerEvents=[];window.__streamerSent=[];window.__streamerTerminated=0;
  window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w),terminate=w.terminate.bind(w);
    w.postMessage=function(message,...rest){window.__streamerSent.push(structuredClone(message));if(message.type==='advance'&&window.__delayStreamerAdvance){setTimeout(()=>post(message,...rest),window.__delayStreamerAdvance);return;}return post(message,...rest);};
    w.terminate=function(){window.__streamerTerminated++;return terminate();};
    w.addEventListener('message',event=>{const v=event.data,s=v.snapshot,copy=s?{...s,electrons:s.electrons.slice(),ions:s.ions.slice(),potential:s.potential.slice(),mask:s.mask.slice(),isoLines:s.isoLines.slice(),isoTriangles:s.isoTriangles.slice(),isoNormals:s.isoNormals.slice()}:null;
      window.__streamerEvents.push({kind:v.kind,generation:v.generation,snapshot:copy,halt:v.halt,message:v.message});});return w;};
});}
async function watchThree(page){await page.route('**/streamer.js*',async route=>{const response=await route.fetch(),source=await response.text();
  const spy=`if(window.THREE){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...args){const renderer=new Original(...args),render=renderer.render.bind(renderer);renderer.render=function(scene,camera){window.__streamerThree={renderer,scene,camera};return render(scene,camera);};return renderer;};}\n`;
  await route.fulfill({response,body:spy+source});});}
async function disableWebGL(page){await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};});}
async function open(page){await page.goto(base+'streamer.html',{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#streamer-stage').dataset.status),null,{timeout:90000});
  if(await page.locator('#streamer-stage').getAttribute('data-status')!=='ready')throw Error(await page.locator('#stage-error-text').innerText());await twoFrames(page);}
async function twoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function requireWebGL(page,t){if(await page.locator('#streamer-stage').getAttribute('data-renderer')!=='webgl'){t.skip('WebGL unavailable');return false;}return true;}
async function latest(page,kind){return page.evaluate(kind=>{const v=window.__streamerEvents.findLast(e=>e.snapshot&&(!kind||e.kind===kind)),s=v.snapshot;
  return {...v,snapshot:{...s,electrons:Array.from(s.electrons),ions:Array.from(s.ions),potential:Array.from(s.potential),mask:Array.from(s.mask),isoLines:Array.from(s.isoLines),isoTriangles:Array.from(s.isoTriangles),isoNormals:Array.from(s.isoNormals)}};},kind);}
async function generation(page){return Number(await page.locator('#streamer-stage').getAttribute('data-generation'));}
async function waitReset(page,previous){await page.waitForFunction(g=>document.querySelector('#streamer-stage').dataset.status==='ready'&&Number(document.querySelector('#streamer-stage').dataset.generation)>g,previous,{timeout:90000});await twoFrames(page);}
async function setRange(page,id,value){await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function step(page){const n=Number(await page.locator('#streamer-stage').getAttribute('data-steps'));await page.locator('#step').click();
  await page.waitForFunction(n=>Number(document.querySelector('#streamer-stage').dataset.steps)===n+1,n,{timeout:30000});await twoFrames(page);}
async function image(page){await twoFrames(page);const data=await page.locator('#streamer-scene').evaluate(el=>el.toDataURL('image/png'));assert.ok(data.length>10000,'rendered image should not be blank');return createHash('sha256').update(data).digest('hex');}
function close(a,b,tol=1e-6){assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (±${tol})`);}
function maxDiff(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
async function projected(page,x,y,z){return page.evaluate(({x,y,z})=>{const d=window.__streamerEvents.findLast(e=>e.snapshot).snapshot,u=4.8/(d.ny-1),r=document.querySelector('#streamer-scene').getBoundingClientRect();
  const p=new THREE.Vector3((x-(d.nx-1)/2)*u,2.4-y*u,(z-(d.nz-1)/2)*u).project(window.__streamerThree.camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},{x,y,z});}

test('WebGL draws actual Worker densities and the independent coupled model agrees', {timeout:120000},async t=>{
  const page=await newPage(t,{acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const s=(await latest(page,'ready')).snapshot,m=new Model.Streamer({quality:'standard'});assert.ok(m.solve().converged);while(m.time<6)assert.ok(m.step().ok);const expected=m.snapshot();
  assert.equal(s.stats.steps,expected.stats.steps);close(s.stats.time,expected.stats.time,1e-10);assert.ok(maxDiff(s.electrons,expected.electrons)<1e-7);assert.ok(maxDiff(s.ions,expected.ions)<1e-7);assert.ok(maxDiff(s.potential,expected.potential)<1e-6);
  assert.ok(Math.abs(s.stats.chargeBudget)<1e-9);assert.ok(s.stats.residual<=2e-5);
  const clouds=await page.evaluate(()=>{const out={};window.__streamerThree.scene.traverse(o=>{if(o.name==='electron-density'||o.name==='ion-density')out[o.name]={count:o.geometry.attributes.density.count,values:Array.from(o.geometry.attributes.density.array)};});return out;});
  assert.equal(clouds['electron-density'].count,s.electrons.length);assert.equal(clouds['ion-density'].count,s.ions.length);assert.deepEqual(clouds['electron-density'].values,s.electrons);assert.deepEqual(clouds['ion-density'].values,s.ions);
  const iso=await page.evaluate(()=>{const a=window.__streamerThree.scene.getObjectByName('electron-isosurface').geometry.attributes;return {position:Array.from(a.position.array),normal:Array.from(a.normal.array)};});assert.ok(iso.position.length>0);assert.deepEqual(iso.position,s.isoTriangles);assert.deepEqual(iso.normal,s.isoNormals);
  assert.match(await page.locator('#control-panel .panel-description').innerText(),/不是电子轨迹.*不是完整雷电/s);assert.match(await page.locator('[data-note-content=transport] h3').innerText(),/不是粒子运动轨迹/);
  assert.equal(await page.locator('#play-text').innerText(),'播放');assert.equal((await image(page)).length,64);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-image').click()]);const png=fs.readFileSync(await download.path());assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(png.readUInt32BE(16)>500);assert.deepEqual(errors,[]);
});

test('peak and clicked probes, charge texture and field arrows come from real grid values', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const original=await image(page);await page.locator('#probe-peak').click();const d=(await latest(page)).snapshot,peak=d.stats.peakIndex;
  assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-probe-id')),peak);close(Number(await page.locator('#streamer-stage').getAttribute('data-probe-electron')),d.electrons[peak],1e-12);assert.equal(await page.locator('#show-slice').isChecked(),true);
  assert.notEqual(await image(page),original);const z=Math.floor(peak/(d.nx*d.ny)),x=8,y=16,id=x+d.nx*(y+d.ny*z),p=await projected(page,x,y,z);assert.equal(d.mask[id],0);
  await page.mouse.click(p.x,p.y);assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-probe-id')),id);
  close(Number(await page.locator('#streamer-stage').getAttribute('data-probe-ion')),d.ions[id],1e-12);
  const nx=d.nx,plane=d.nx*d.ny,ex=-(d.potential[id+1]-d.potential[id-1])/(2*d.h),ey=-(d.potential[id+nx]-d.potential[id-nx])/(2*d.h),ez=-(d.potential[id+plane]-d.potential[id-plane])/(2*d.h);
  close(Number(await page.locator('#streamer-stage').getAttribute('data-probe-field')),Math.hypot(ex,ey,ez),1e-9);
  const obj=await page.evaluate(()=>{const slice=window.__streamerThree.scene.getObjectByName('field-slice'),a=window.__streamerThree.scene.getObjectByName('electric-field-arrows');return {rgba:Array.from(slice.material.map.image.data),width:slice.material.map.image.width,height:slice.material.map.image.height,arrowCount:a.geometry.attributes.position.count};});
  assert.deepEqual([obj.width,obj.height],[d.nx,d.ny]);assert.ok(obj.arrowCount>50);const row=d.ny-1-y,k=4*(x+row*d.nx),rho=d.ions[id]-d.electrons[id],v=Math.max(0,Math.min(1,Math.abs(rho)/.04)),warm=rho>=0;
  assert.deepEqual(obj.rgba.slice(k,k+4),[Math.round(18+(warm?213:42)*v),Math.round(49+(warm?105:151)*v),Math.round(59+(warm?25:175)*v),Math.round(28+118*Math.sqrt(v))]);
  const before=await image(page);await page.locator('#slice-mode').selectOption('potential');assert.notEqual(await image(page),before);assert.deepEqual(errors,[]);
});

test('probe waits for a committed batch; parameter changes invalidate stale Worker generations', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.evaluate(()=>{window.__delayStreamerAdvance=800;});await page.locator('#play').click();await page.waitForFunction(()=>window.__streamerSent.some(m=>m.type==='advance'));
  await page.locator('#probe-peak').click();assert.equal(await page.locator('#streamer-stage').getAttribute('data-probe-pending'),'true');
  await page.waitForFunction(()=>!document.querySelector('#streamer-stage').dataset.probePending&&document.querySelector('#streamer-stage').dataset.probeId,null,{timeout:30000});
  let last=(await latest(page,'frame')).snapshot;assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-probe-id')),last.stats.peakIndex);assert.equal(await page.locator('#play-text').innerText(),'播放');
  const previous=await generation(page);await page.locator('#play').click();await page.waitForFunction(()=>window.__streamerSent.filter(m=>m.type==='advance').length>1);
  await setRange(page,'#field',.4);await waitReset(page,previous);last=(await latest(page,'ready')).snapshot;
  close(last.field,.4,1e-12);assert.equal(last.stats.steps,0);assert.ok(await page.evaluate(()=>window.__streamerTerminated>=1));
  await page.waitForTimeout(1100);assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-generation'))>previous,true);assert.equal((await latest(page)).generation,Number(await generation(page)));assert.deepEqual(errors,[]);
});

test('single adaptive step and frozen field controls match the independent model', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);let gen=await generation(page);
  await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);const before=(await latest(page,'ready')).snapshot;assert.equal(before.stats.steps,0);
  await step(page);const after=(await latest(page,'frame')).snapshot,m=new Model.Streamer({quality:'quick'});assert.ok(m.solve().converged);assert.ok(m.step().ok);const ref=m.snapshot();
  assert.ok(maxDiff(after.electrons,ref.electrons)<1e-7);assert.ok(maxDiff(after.potential,ref.potential)<1e-6);
  gen=await generation(page);await page.locator('label[for="feedback"]').click();await waitReset(page,gen);let frozen=(await latest(page,'ready')).snapshot;assert.equal(frozen.feedback,false);const phi=frozen.potential;
  await step(page);frozen=(await latest(page,'frame')).snapshot;assert.ok(maxDiff(phi,frozen.potential)<.001);assert.ok(frozen.stats.produced>0);assert.equal(await page.locator('#streamer-stage').getAttribute('data-solved-feedback'),'false');
  assert.deepEqual(errors,[]);
});

test('mouse and repeated keyboard moves reset the actual voxel electrode, not just its picture', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=(await latest(page)).snapshot,tip=await projected(page,before.sourceX,before.rodLength,before.sourceZ),destination=await projected(page,before.sourceX+3,before.rodLength,before.sourceZ);
  await page.locator('[data-tool="source"]').click();const gen=await generation(page);await page.mouse.move(tip.x,tip.y);await page.mouse.down();await page.mouse.move(destination.x,destination.y,{steps:6});
  assert.equal(await page.locator('#streamer-stage').getAttribute('data-status'),'adjusting');assert.match(await page.locator('#stage-notice').textContent(),/旧密度与电场已隐藏/);await page.mouse.up();await waitReset(page,gen);
  let moved=(await latest(page,'ready')).snapshot;assert.equal(moved.sourceX,before.sourceX+3);assert.equal(moved.sourceZ,before.sourceZ);assert.equal(moved.stats.steps,0);assert.ok(maxDiff(moved.potential,before.potential)>.1);
  const prev=await generation(page);await page.locator('#streamer-scene').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await waitReset(page,prev);
  const keyboard=(await latest(page,'ready')).snapshot;assert.equal(keyboard.sourceX,moved.sourceX+2);assert.equal(await page.evaluate(()=>document.activeElement.id),'streamer-scene');assert.deepEqual(errors,[]);
});

test('Canvas fallback uses the same Worker state, can advance, probe and export', {timeout:120000},async t=>{
  const page=await newPage(t,{acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await disableWebGL(page);await open(page);
  assert.equal(await page.locator('#streamer-stage').getAttribute('data-renderer'),'canvas');assert.equal(await page.locator('#stage-fallback').isVisible(),true);const before=await image(page),at=(await latest(page)).snapshot.stats.steps;
  await step(page);assert.equal((await latest(page,'frame')).snapshot.stats.steps,at+1);assert.notEqual(await image(page),before);
  await page.locator('#probe-peak').click();assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-probe-id')),(await latest(page)).snapshot.stats.peakIndex);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-image').click()]);assert.deepEqual([...fs.readFileSync(await download.path()).subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.deepEqual(errors,[]);
});

test('WebGL context loss falls back without restarting the computation', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=(await latest(page)).snapshot,gen=await generation(page);const supported=await page.evaluate(()=>{const gl=window.__streamerThree.renderer.getContext(),extension=gl.getExtension('WEBGL_lose_context');if(!extension)return false;extension.loseContext();return true;});if(!supported){t.skip('WEBGL_lose_context not available');return;}
  await page.waitForFunction(()=>document.querySelector('#streamer-stage').dataset.renderer==='canvas',null,{timeout:30000});assert.equal(await generation(page),gen);assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-steps')),before.stats.steps);
  await step(page);assert.equal((await latest(page)).snapshot.stats.steps,before.stats.steps+1);assert.deepEqual(errors,[]);
});

test('mobile touch probe, drawers, navigation and viewport remain usable', {timeout:120000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  assert.equal(await page.locator('#control-panel').isVisible(),false);assert.equal(await page.locator('#knowledge-panel').isVisible(),false);await page.locator('#toggle-controls').tap();assert.equal(await page.locator('#control-panel').isVisible(),true);
  await page.locator('#probe-peak').tap();const peak=(await latest(page)).snapshot.stats.peakIndex;assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-probe-id')),peak);
  await page.locator('#toggle-controls').click();await page.locator('#toggle-knowledge').tap();assert.equal(await page.locator('#knowledge-panel').isVisible(),true);await page.locator('#toggle-knowledge').click();
  await page.locator('#nav-toggle').tap();assert.equal(await page.locator('#lab-navigation a').count(),9);await page.locator('#nav-position').focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#nav-position').value==='100');
  assert.equal(await page.locator('#lab-navigation a[href="lightning.html"]').isVisible(),true);await page.keyboard.press('Escape');
  const dims=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight}));assert.equal(dims.sw,dims.cw);assert.equal(dims.sh,dims.ch);assert.deepEqual(errors,[]);
});

test('desktop and compact layouts and notes pass axe checks', {timeout:120000,skip:!axe},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript({content:axe.source});await open(page);
  for(const [width,height] of [[1440,900],[390,844],[320,568],[568,320]]){
    await page.setViewportSize({width,height});await twoFrames(page);
    for(const action of ['base','controls','knowledge','nav']){
      if(action==='controls'&&!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();
      if(action==='knowledge'&&!await page.locator('#knowledge-panel').isVisible())await page.locator('#toggle-knowledge').click();
      if(action==='nav')await page.locator('#nav-toggle').click();
      const violations=await page.evaluate(async()=>{const r=await axe.run(document);return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],`${width}×${height} ${action}`);
      if(action==='nav')await page.keyboard.press('Escape');
    }
  }assert.deepEqual(errors,[]);
});

test('touch dragging an electrode changes the actual boundary and recomputes', {timeout:120000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  await page.locator('#toggle-controls').tap();await page.locator('[data-tool="target"]').tap();await page.locator('#toggle-controls').click();
  const d=(await latest(page)).snapshot,start=await projected(page,d.targetX,d.ny-1-d.rodLength,d.targetZ),end=await projected(page,d.targetX-2,d.ny-1-d.rodLength,d.targetZ);
  const cdp=await page.context().newCDPSession(page),gen=await generation(page),touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  await touch('touchStart',start.x,start.y);for(let i=1;i<=8;i++)await touch('touchMove',start.x+(end.x-start.x)*i/8,start.y+(end.y-start.y)*i/8);await touch('touchEnd',end.x,end.y);
  await waitReset(page,gen);const changed=(await latest(page,'ready')).snapshot;assert.equal(changed.targetX,d.targetX-2);assert.equal(changed.targetZ,d.targetZ);assert.equal(changed.stats.steps,0);assert.ok(maxDiff(changed.potential,d.potential)>.1);assert.deepEqual(errors,[]);
});

test('hiding a tab during a queued reset prevents automatic resumption', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.locator('#play').click();const gen=await generation(page);await setRange(page,'#field',.45);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await waitReset(page,gen);assert.equal(await page.locator('#play-text').innerText(),'播放');const n=Number(await page.locator('#streamer-stage').getAttribute('data-steps'));await page.waitForTimeout(400);assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-steps')),n);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(400);assert.equal(await page.locator('#play-text').innerText(),'播放');assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-steps')),n);assert.deepEqual(errors,[]);
});

test('only local assets are required and a failed Worker can be retried', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const url=route.request().url();if(!url.startsWith(base)){remote.push(url);await route.abort();}else await route.continue();});await watchWorker(page);await open(page);
  assert.deepEqual(remote,[]);assert.equal(await page.locator('#streamer-stage').getAttribute('data-status'),'ready');
  await page.route('**/streamer-worker.js*',route=>route.abort());const gen=await generation(page);await page.locator('#reset').click();await page.waitForFunction(()=>document.querySelector('#streamer-stage').dataset.status==='error',null,{timeout:30000});assert.match(await page.locator('#stage-error-text').innerText(),/后台求解器无法启动/);
  await page.unroute('**/streamer-worker.js*');await page.locator('#reset').click();await waitReset(page,gen);assert.equal(Number(await page.locator('#streamer-stage').getAttribute('data-steps')),0);assert.deepEqual(errors,[]);
});
