'use strict';
// Optional: NODE_PATH with playwright-core; CHROMIUM_PATH points to Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png'};let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(b));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,{mode='worker-canvas',viewport={width:480,height:300},memory,offline=false}={}){
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  const p=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({mode,memory})=>{
    if(memory)Object.defineProperty(navigator,'deviceMemory',{value:memory,configurable:true});
    if(mode==='worker-webgl'||mode==='sync-webgl')window.__RELATIVITY_FORCE_WORKER_WEBGL__=true;
    if(mode==='cooperative'||mode==='sync-webgl')window.__RELATIVITY_DISABLE_WORKER__=true;
    if(mode==='sync-webgl')window.__RELATIVITY_FORCE_SYNC_WEBGL__=true;
    window.__renderPosts=[];const Original=window.Worker;
    if(Original){window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(msg,...transfer)=>{if(msg?.type==='render')window.__renderPosts.push({revision:msg.revision,environment:msg.state.environment,interacting:!!msg.state.interacting,playing:!!msg.state.playing});return post(msg,...transfer);};return w;};window.Worker.prototype=Original.prototype;}
  },{mode,memory});
  await p.goto(offline?pathToFileURL(path.join(root,'relativity.html')).href:base,{waitUntil:'load'});
  await final(p);return {p,errors};
}
async function final(p){await p.waitForFunction(()=>{const d=document.querySelector('#relativity-stage')?.dataset;return d?.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:60000});}
async function data(p){return p.locator('#relativity-stage').evaluate(e=>({...e.dataset}));}
async function press(p,sel){await p.evaluate(sel=>document.querySelector(sel).click(),sel);}
async function savePixels(p,label){return p.evaluate(label=>{const src=document.querySelector('#relativity-scene'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d');x.drawImage(src,0,0);(window.__cachePixels??={})[label]={width:c.width,height:c.height,data:x.getImageData(0,0,c.width,c.height).data};},label);}
async function comparePixels(p,label){return p.evaluate(label=>{const a=window.__cachePixels[label],src=document.querySelector('#relativity-scene'),c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d');x.drawImage(src,0,0);const b=x.getImageData(0,0,c.width,c.height).data;if(a.width!==c.width||a.height!==c.height)return {dimensions:false};let changed=0,max=0;for(let i=0;i<b.length;i++){const d=Math.abs(a.data[i]-b[i]);changed+=d!==0;max=Math.max(max,d);}return {dimensions:true,changed,max};},label);}
async function noRenderOnHit(p,action){
  const before=await p.evaluate(()=>window.__renderPosts.length),hits=Number((await data(p)).stillCacheRestores);await action();await final(p);
  const d=await data(p);assert.equal(d.stillCacheHit,'true',JSON.stringify(d));assert.equal(Number(d.stillCacheRestores),hits+1);assert.equal(await p.evaluate(()=>window.__renderPosts.length),before,'a cache hit must not submit a new physical render');
}

test('finished Canvas frames are pixel-exact on scene, optical and camera round trips, with real sampling', {timeout:240000},async t=>{
  const {p,errors}=await pageFor(t);let d=await data(p);assert.equal(d.worker,'true');assert.equal(d.renderer,'canvas');assert.equal(d.stillCacheEntries,'1');await savePixels(p,'station');
  await press(p,'[data-environment="street"]');await final(p);d=await data(p);assert.equal(d.stillCacheHit,'false');assert.equal(d.stillCacheEntries,'2');await savePixels(p,'street');
  await noRenderOnHit(p,()=>press(p,'[data-environment="station"]'));assert.deepEqual(await comparePixels(p,'station'),{dimensions:true,changed:0,max:0});assert.match(await p.locator('#render-detail').textContent(),/缓存复用/);
  // Request a probe in the same turn as the scene switch: it must be queued
  // until the restored real canvas and current parameters agree.
  await noRenderOnHit(p,()=>p.evaluate(()=>{document.querySelector('[data-environment="street"]').click();document.querySelector('#relativity-scene').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));}));
  assert.deepEqual(await comparePixels(p,'street'),{dimensions:true,changed:0,max:0});await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumSample==='ready',null,{timeout:60000});assert.ok((await data(p)).probe);
  await press(p,'#dock-doppler');await final(p);assert.equal((await data(p)).stillCacheHit,'false','a new Doppler setting needs a new frame');await savePixels(p,'street-no-doppler');
  await noRenderOnHit(p,()=>press(p,'#dock-doppler'));assert.deepEqual(await comparePixels(p,'street'),{dimensions:true,changed:0,max:0});
  await noRenderOnHit(p,()=>press(p,'#dock-doppler'));assert.deepEqual(await comparePixels(p,'street-no-doppler'),{dimensions:true,changed:0,max:0});
  await press(p,'#dock-shadows');await final(p);assert.equal((await data(p)).stillCacheHit,'false','a new shadow state needs a new frame');
  await noRenderOnHit(p,()=>press(p,'#dock-shadows'));assert.deepEqual(await comparePixels(p,'street-no-doppler'),{dimensions:true,changed:0,max:0});
  // This is a new camera; once completed, the previous-view button must jump
  // to a previously computed pose rather than approximating its pixels.
  await p.locator('#relativity-scene').focus();await p.keyboard.press('ArrowRight');await final(p);d=await data(p);assert.equal(d.yaw,'-0.09000');assert.equal(d.stillCacheHit,'false');
  assert.equal(await p.locator('#previous-cached-view').isDisabled(),false);
  await noRenderOnHit(p,()=>press(p,'#previous-cached-view'));d=await data(p);assert.equal(d.yaw,'0.00000');assert.deepEqual(await comparePixels(p,'street-no-doppler'),{dimensions:true,changed:0,max:0});
  assert.deepEqual(errors,[]);
});

test('release near a cached view snaps the actual camera; a different event or viewport does not', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{viewport:{width:500,height:320}});await savePixels(p,'original');
  // Travel far enough to start a real drag, then release 0.4 CSS px away
  // from the start (0.002 rad). The old view is exact only after snapping.
  await p.mouse.move(250,120);await p.mouse.down();await p.mouse.move(330,120);await p.mouse.move(250.4,120);await p.mouse.up();await final(p);
  let d=await data(p);assert.equal(d.stillCacheHit,'true');assert.equal(d.stillCacheSnap,'true');assert.equal(d.yaw,'0.00000');assert.equal(d.drawnYaw,d.yaw);assert.match(await p.locator('#render-detail').textContent(),/已吸附/);assert.equal(await p.locator('#cache-indicator').isVisible(),true);assert.match(await p.locator('#cache-indicator').textContent(),/已吸附至缓存视角/);assert.deepEqual(await comparePixels(p,'original'),{dimensions:true,changed:0,max:0});
  await p.evaluate(()=>{const el=document.querySelector('#event-time');el.value='0.5';el.dispatchEvent(new Event('input',{bubbles:true}));});await final(p);assert.equal((await data(p)).stillCacheHit,'false');
  await p.setViewportSize({width:501,height:320});await final(p);assert.equal((await data(p)).stillCacheHit,'false','a different viewport must not reuse even a physically identical frame');
  assert.deepEqual(errors,[]);
});

test('returning to a cached scene restores its already-computed wide drag underlay, including split sides', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{viewport:{width:400,height:260}});
  async function wideReady(){await p.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.cameraCache==='true'&&d.renderPending==='false'&&d.quality==='final';},null,{timeout:60000});}
  async function saveWide(label){await p.evaluate(label=>{const list=[...document.querySelectorAll('.camera-preview-cache .camera-preview-image')];(window.__wide??={})[label]=list.map(c=>({width:c.width,height:c.height,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data}));},label);}
  async function compareWide(label,sides){return p.evaluate(({label,sides})=>{const list=[...document.querySelectorAll('.camera-preview-cache .camera-preview-image')],saved=window.__wide[label];return list.slice(0,sides).map((c,i)=>{if(c.width!==saved[i].width||c.height!==saved[i].height)return -1;const a=saved[i].data,b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let j=0;j<a.length;j++)if(a[j]!==b[j])n++;return n;});},{label,sides});}
  await wideReady();await saveWide('station');const fullBytes=await p.locator('#relativity-scene').evaluate(c=>c.width*c.height*4);assert.ok(Number((await data(p)).stillCacheBytes)>fullBytes);
  await press(p,'[data-environment="street"]');await final(p);await wideReady();await noRenderOnHit(p,()=>press(p,'[data-environment="station"]'));assert.equal((await data(p)).cameraCache,'true');assert.deepEqual(await compareWide('station',1),[0]);
  await press(p,'[data-view="split"]');await final(p);await wideReady();await saveWide('split');
  await noRenderOnHit(p,()=>press(p,'[data-view="photo"]'));await noRenderOnHit(p,()=>press(p,'[data-view="split"]'));assert.equal((await data(p)).cameraCache,'true');assert.deepEqual(await compareWide('split',2),[0,0]);
  assert.deepEqual(errors,[]);
});

test('uncompleted previews and playback are not cached; low-memory LRU evicts the oldest view', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{viewport:{width:240,height:180},memory:2});let d=await data(p);assert.equal(d.stillCacheEntries,'1');await savePixels(p,'first');
  await p.locator('#relativity-scene').focus();for(let i=0;i<8;i++){await p.keyboard.press('ArrowRight');await final(p);}
  d=await data(p);assert.equal(d.stillCacheEntries,'8');assert.match(await p.locator('#still-cache-status').textContent(),/8 \/ 8 张/);
  // The original yaw was least-recently used and no longer qualifies.
  await press(p,'#reset-view');await final(p);d=await data(p);assert.equal(d.yaw,'0.00000');assert.equal(d.stillCacheHit,'false');assert.equal(d.stillCacheEntries,'8');
  // A new physical state may have a preview; it cannot become a cached still
  // until its full frame has arrived. Returning immediately uses the saved A.
  const before=d.stillCacheEntries;await press(p,'[data-environment="street"]');d=await data(p);assert.equal(d.stillCacheEntries,before);assert.equal(d.renderPending,'true');
  await noRenderOnHit(p,()=>press(p,'[data-environment="station"]'));assert.deepEqual(await comparePixels(p,'first'),{dimensions:true,changed:0,max:0});
  const count=(await data(p)).stillCacheEntries;await press(p,'#play');await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.playing==='true');await p.waitForTimeout(600);d=await data(p);assert.equal(d.stillCacheEntries,count);assert.equal(d.stillCacheHit,'false');
  assert.deepEqual(errors,[]);
});

test('a delayed WebGL bitmap cannot overwrite a newer scene or survive a cache clear', {timeout:240000},async t=>{
  const {p,errors}=await pageFor(t,{mode:'worker-webgl',viewport:{width:320,height:220}});let d=await data(p);assert.equal(d.worker,'true');assert.equal(d.renderer,'webgl');await savePixels(p,'station');
  await press(p,'[data-environment="street"]');await final(p);await savePixels(p,'street');
  await p.evaluate(()=>{const orig=window.createImageBitmap;window.__delayNext=true;window.createImageBitmap=function(source,...args){const promise=orig.call(this,source,...args);if(window.__delayNext&&source instanceof HTMLCanvasElement){window.__delayNext=false;return promise.then(b=>new Promise(resolve=>window.__releaseCachedBitmap=()=>resolve(b)));}return promise;};});
  await press(p,'[data-environment="station"]');await p.waitForFunction(()=>typeof window.__releaseCachedBitmap==='function');
  await noRenderOnHit(p,()=>press(p,'[data-environment="street"]'));assert.deepEqual(await comparePixels(p,'street'),{dimensions:true,changed:0,max:0});const hits=Number((await data(p)).stillCacheRestores);
  await p.evaluate(()=>window.__releaseCachedBitmap());await p.waitForTimeout(100);d=await data(p);assert.equal(d.environment,'street');assert.equal(d.drawnEnvironment,'street');assert.equal(Number(d.stillCacheRestores),hits);assert.deepEqual(await comparePixels(p,'street'),{dimensions:true,changed:0,max:0});
  await p.evaluate(()=>{window.__delayNext=true;delete window.__releaseCachedBitmap;});await press(p,'[data-environment="station"]');await p.waitForFunction(()=>typeof window.__releaseCachedBitmap==='function');
  await press(p,'#clear-still-cache');await p.evaluate(()=>window.__releaseCachedBitmap());await final(p);d=await data(p);assert.equal(d.environment,'station');assert.equal(d.drawnEnvironment,'station');assert.equal(d.stillCacheHit,'false');
  assert.deepEqual(errors,[]);
});

test('synchronous WebGL blit restores exact pixels and preserves later scene rendering', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{viewport:{width:320,height:220}});await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await p.evaluate(async()=>{
    const R=RelativityRenderer,E=RelativityExperiments,view={width:80,height:60,dpr:1};let r;
    await new Promise((ok,bad)=>{let n=0;r=R.create(document.createElement('canvas'),{onAsset:(name,status)=>status==='error'?bad(Error(name)):++n===9&&ok()});});if(r.kind!=='webgl')return {unavailable:true};
    const gl=r.canvas.getContext('webgl'),read=()=>{const a=new Uint8Array(80*60*4);gl.readPixels(0,0,80,60,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;},diff=(a,b)=>a.reduce((n,x,i)=>n+(x!==b[i]),0);
    const A={...E.BASE,renderBudget:4800},B={...A,environment:'street',yaw:.1};r.render(A,false,view);const a=read(),copy=document.createElement('canvas');copy.width=80;copy.height=60;copy.getContext('2d').drawImage(r.canvas,0,0);
    r.render(B,false,view);const b=read();const blocked=r.presentCached(copy,()=>false),afterBlocked=read();const applied=r.presentCached(copy,()=>true),restored=read();r.render(B,false,view);const rerender=read();
    return {blocked,applied,blockedDifference:diff(b,afterBlocked),restoredDifference:diff(a,restored),rerenderDifference:diff(b,rerender),glError:gl.getError()};
  });
  if(result.unavailable)return t.skip('WebGL unavailable');assert.deepEqual(result,{blocked:false,applied:true,blockedDifference:0,restoredDifference:0,rerenderDifference:0,glError:0});assert.deepEqual(errors,[]);
});

test('synchronous WebGL and renderer-mode round trips use only matching backends', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{mode:'sync-webgl',viewport:{width:320,height:220}});let d=await data(p);assert.equal(d.worker,'false');assert.equal(d.renderer,'webgl');await savePixels(p,'sync-station');
  await press(p,'[data-environment="street"]');await final(p);await noRenderOnHit(p,()=>press(p,'[data-environment="station"]'));assert.deepEqual(await comparePixels(p,'sync-station'),{dimensions:true,changed:0,max:0});
  await press(p,'[data-render-mode="safe"]');await final(p);d=await data(p);assert.equal(d.renderer,'canvas');assert.equal(d.stillCacheHit,'false','different render backends must not share a frame');
  await press(p,'[data-render-mode="webgl"]');
  await p.waitForFunction(()=>['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal'].every(k=>document.querySelector('#relativity-scene').dataset[k+'Loaded']==='true'));
  await p.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.stillCacheHit==='true'&&d.renderPending==='false';},null,{timeout:60000});
  assert.deepEqual(await comparePixels(p,'sync-station'),{dimensions:true,changed:0,max:0});assert.deepEqual(errors,[]);
});

test('offline cooperative fallback, low-memory budget, controls and mobile accessibility', {timeout:240000},async t=>{
  const {p,errors}=await pageFor(t,{mode:'cooperative',viewport:{width:320,height:600},memory:2,offline:true});let d=await data(p);assert.equal(d.worker,'false');assert.equal(d.renderer,'canvas');assert.match(await p.locator('#still-cache-status').textContent(),/8 MiB/);assert.equal(d.stillCacheEntries,'1');await savePixels(p,'offline');
  await press(p,'[data-environment="street"]');await final(p);await noRenderOnHit(p,()=>press(p,'[data-environment="station"]'));assert.deepEqual(await comparePixels(p,'offline'),{dimensions:true,changed:0,max:0});
  await p.locator('#toggle-controls').click();await p.locator('#still-cache-gallery').scrollIntoViewIfNeeded();
  assert.equal(await p.locator('#still-cache-list button').count(),2);
  const geometry=await p.locator('#still-cache-list').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,items:[...el.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,right:b.getBoundingClientRect().right}))}));
  assert.ok(geometry.scroll<=geometry.client+1,JSON.stringify(geometry));assert.ok(geometry.items.every(i=>i.right<=320&&i.width<=geometry.client+1),JSON.stringify(geometry));
  if(axe){await p.addScriptTag({content:axe.source});const populated=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(populated,[]);}
  await p.locator('#toggle-still-cache').scrollIntoViewIfNeeded();await p.locator('#toggle-still-cache').click();assert.equal(await p.locator('#toggle-still-cache').getAttribute('aria-pressed'),'false');assert.equal((await data(p)).stillCacheEntries,'0');
  await p.locator('#toggle-still-cache').click();assert.equal(await p.locator('#toggle-still-cache').getAttribute('aria-pressed'),'true');assert.equal((await data(p)).stillCacheEntries,'1');await p.locator('#clear-still-cache').click();assert.equal((await data(p)).stillCacheEntries,'0');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),320);
  if(axe){await p.addScriptTag({content:axe.source});const violations=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);}
  assert.deepEqual(errors,[]);
});

test('visual gallery restores full physical state and exact pixels by keyboard; mismatched viewports are disabled', {timeout:180000},async t=>{
  const {p,errors}=await pageFor(t,{viewport:{width:500,height:320},memory:4});await savePixels(p,'gallery-station');
  await press(p,'[data-environment="harbor"]');await final(p);
  await p.evaluate(()=>{const x=document.querySelector('#event-time');x.value='1.2';x.dispatchEvent(new Event('input',{bubbles:true}));});await final(p);
  await press(p,'#dock-doppler');await final(p);await savePixels(p,'gallery-harbor');
  assert.ok(await p.locator('#still-cache-list button').count()>=3);
  assert.equal(await p.locator('#still-cache-list canvas').count(),await p.locator('#still-cache-list button').count());
  await p.locator('#toggle-controls').click();
  const station=p.locator('#still-cache-list button').filter({hasText:'车站站台'}).last();await station.scrollIntoViewIfNeeded();await station.focus();
  await noRenderOnHit(p,()=>p.keyboard.press('Enter'));let d=await data(p);assert.equal(d.environment,'station');assert.equal(d.doppler,'true');assert.equal(d.time,'0.000');assert.deepEqual(await comparePixels(p,'gallery-station'),{dimensions:true,changed:0,max:0});
  assert.equal(await station.evaluate(el=>document.activeElement===el),true,'LRU reorder must retain keyboard focus');assert.equal(await station.getAttribute('aria-pressed'),'true');
  // Playback may have an in-flight physical frame. Selecting an old still
  // must pause and cancel it, rather than letting it overwrite the selection.
  await press(p,'#play');await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.playing==='true');await p.waitForTimeout(250);
  const harbor=p.locator('#still-cache-list button').filter({hasText:'港口货场'}).filter({hasText:'光谱关'}).first();await harbor.scrollIntoViewIfNeeded();await harbor.focus();await p.keyboard.press('Enter');await final(p);
  d=await data(p);assert.equal(d.playing,'false');assert.equal(d.stillCacheHit,'true');assert.equal(d.environment,'harbor');assert.equal(d.doppler,'false');assert.equal(d.time,'1.200');assert.deepEqual(await comparePixels(p,'gallery-harbor'),{dimensions:true,changed:0,max:0});
  assert.equal(await harbor.evaluate(el=>document.activeElement===el),true);assert.equal(await harbor.getAttribute('aria-pressed'),'true');await p.waitForTimeout(300);assert.deepEqual(await comparePixels(p,'gallery-harbor'),{dimensions:true,changed:0,max:0});
  await p.setViewportSize({width:501,height:320});await p.waitForFunction(()=>[...document.querySelectorAll('#still-cache-list button')].some(x=>x.disabled));
  assert.equal(await harbor.isDisabled(),true);assert.match(await harbor.getAttribute('aria-label'),/暂不可恢复/);
  await final(p);await press(p,'#clear-still-cache');assert.equal(await p.locator('#still-cache-list button').count(),0);assert.equal(await p.locator('#still-cache-empty').isHidden(),false);assert.deepEqual(errors,[]);
});
