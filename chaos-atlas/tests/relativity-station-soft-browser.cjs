'use strict';
// Optional real Chromium regressions. Set CHROMIUM_PATH/NODE_PATH as for the
// other relativity browser suites; the first two tests require WebGL.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  return browser.newPage({viewport:{width:960,height:600},reducedMotion:'reduce',...options});
}
async function open(page,url=base){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:90000});}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:240000});}
async function range(page,id,value){await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function axeCheck(page){if(!axe)return;await page.addScriptTag({content:axe.source});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);}

test('WebGL and Canvas trace matching 4/8/16-ray penumbrae across five environments', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const results=await page.evaluate(async()=>{
    const R=RelativityRenderer,O=RelativityOptics,E=RelativityExperiments,W=RelativityWorlds,width=96,height=60,view={width,height,dpr:1};let gpu,cpu;
    await Promise.all([
      new Promise((resolve,reject)=>{let n=0;gpu=R.create(document.createElement('canvas'),{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});}),
      new Promise((resolve,reject)=>{let n=0;cpu=R.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());})
    ]);if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const gl=gpu.canvas.getContext('webgl');
    function read(){const out=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;}
    const out=[];
    for(const environment of W.IDs)for(const variant of ['4','8','16','observer']){
      const shadowSamples=variant==='observer'?16:Number(variant),state={...E.BASE,environment,shape:'sphere',beta:.72,secondEnabled:true,secondBeta:-.43,secondAngle:25,time:.3,
        scenario:variant==='observer'?'observer':'flyby',view:variant==='observer'?'split':'photo',softShadows:true,shadowSamples,lightWidthScale:1.65,lightDepthScale:1.8,
        sunAngularRadius:shadowSamples===4?.27:shadowSamples===8?4.58:6.5,shadowTiming:shadowSamples===8?'instant':'retarded',renderBudget:width*height};
      gpu.render(state,1,view);const materials=read();gpu.render(state,4,view);const shadows=read();cpu.render(state,false,view);
      const pixels=cpu.canvas.getContext('2d').getImageData(0,0,width,height).data;gpu.render(state,false,view);const colors=read();
      let matDiff=0,shadowCount=0,shadowSum=0,shadowBad=0,partial=0,colorSum=0,colorBad=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,j=((height-1-y)*width+x)*4,ray=R.trace(state,x+.5,y+.5,width,height),material=ray.hit?.material||0;
        if(material!==materials[j])matDiff++;
        const info=O.softIllumination(state,ray),expected=info.weightedDirect>0?1-info.weightedVisible/info.weightedDirect:0,d=Math.abs(expected-shadows[j]/255);
        if(info.sampleCount){shadowSum+=d;shadowBad+=d>.1;shadowCount++;if(expected>.001&&expected<.999)partial++;}
        for(let k=0;k<3;k++){const d=Math.abs(pixels[i+k]-colors[j+k]);colorSum+=d;colorBad+=d>20;}
      }
      out.push({environment,variant,materialMismatch:matDiff/(width*height),softMean:shadowSum/shadowCount,softBad:shadowBad/shadowCount,partial,
        colorMean:colorSum/(width*height*3),colorBad:colorBad/(width*height*3)});
    }return out;
  });
  t.diagnostic(JSON.stringify(results));assert.equal(results.length,20);
  for(const q of results){assert.ok(q.materialMismatch<.012,JSON.stringify(q));assert.ok(q.softMean<.012&&q.softBad<.025,JSON.stringify(q));assert.ok(q.colorMean<6&&q.colorBad<.05,JSON.stringify(q));}
  for(const q of results.filter(x=>x.variant==='16'))assert.ok(q.partial>20,JSON.stringify(q));
});

test('packed three-item BVH leaves expose the actual train roof, door, trim and window to WebGL', {timeout:180000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    const R=RelativityRenderer,E=RelativityExperiments,width=96,height=60,view={width,height,dpr:1};let gpu;
    await new Promise((resolve,reject)=>{let n=0;gpu=R.create(document.createElement('canvas'),{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});});
    if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const gl=gpu.canvas.getContext('webgl');
    const state={...E.BASE,shape:'sphere',beta:0,yaw:-Math.PI/2,pitch:-.3,fov:58,doppler:false,lockedEvent:{camera:[-4.2,3.9,5.4],center:[30,30,30],time:0},renderBudget:width*height};
    gpu.render(state,1,view);const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);
    const counts={};for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const hit=R.trace(state,x+.5,y+.5,width,height).hit;if(!hit||!['train-roof','train-door','train-trim','train-window'].includes(hit.kind))continue;
      const q=counts[hit.kind]||(counts[hit.kind]={total:0,match:0});q.total++;if(data[((height-1-y)*width+x)*4]===hit.material)q.match++;
    }return {counts,layout:RelativityGeometryPack.pack().layout.station};
  });
  t.diagnostic(JSON.stringify(result));assert.equal(result.layout.primitiveCount,164);assert.ok(result.layout.nodeCount<=128);
  for(const kind of ['train-roof','train-door','train-trim','train-window']){const q=result.counts[kind];assert.ok(q&&q.total>=15,JSON.stringify(result));assert.ok(q.match/q.total>.94,JSON.stringify(result));}
});

test('desktop controls, Worker messages and local snapshots retain adjustable light settings', {timeout:360000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=window.Worker;window.__softStates=[];window.Worker=function(...args){const worker=new Native(...args),post=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>{if(message.type==='render'&&message.state)window.__softStates.push({...message.state});return post(message,...rest);};return worker;};window.Worker.prototype=Native.prototype;});
  await open(page);await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-soft-shadows'),'false');
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  await page.locator('#shadow-samples').selectOption('16');await range(page,'#light-width',2);await range(page,'#light-depth',.5);await page.locator('#toggle-soft-shadows').click();await final(page);
  assert.equal(await page.locator('#relativity-stage').getAttribute('data-shadow-samples'),'16');assert.equal(await page.locator('#light-width-value').textContent(),'3.12 单位（2.00×）');assert.equal(await page.locator('#light-depth-value').textContent(),'0.25 单位（0.50×）');
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();
  await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:30000});assert.match(await page.locator('#probe-shadow').textContent(),/\/ 16 条受阻/);
  await page.locator('button[data-environment="street"]').click();await final(page);if(await page.locator('#control-panel').isHidden())await page.locator('#toggle-controls').click();assert.equal(await page.locator('#direction-light-controls').evaluate(e=>e.hidden),false);assert.equal(await page.locator('#point-light-controls').evaluate(e=>e.hidden),true);
  await page.locator('button[data-sun-radius="0.27"]').click();await final(page);assert.equal(await page.locator('#sun-radius-value').textContent(),'0.27°');assert.equal(await page.locator('button[data-sun-radius="0.27"]').getAttribute('aria-pressed'),'true');
  await page.locator('#save-local').click();assert.match(await page.locator('#snapshot-status').textContent(),/已保存/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('relativity-observation-v1')).parameters);
  assert.deepEqual([saved.shadowSamples,saved.lightWidthScale,saved.lightDepthScale,saved.sunAngularRadius],[16,2,.5,.27]);
  await page.locator('#reset-light').click();await final(page);assert.equal(await page.locator('#shadow-samples').inputValue(),'4');assert.equal(await page.locator('#sun-radius-value').textContent(),'4.58°');
  await page.locator('#restore-local').click();await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-shadow-samples'),'16');assert.equal(await page.locator('#sun-radius-value').textContent(),'0.27°');
  const sent=await page.evaluate(()=>window.__softStates);assert.ok(sent.some(s=>s.softShadows&&s.shadowSamples===16&&s.lightWidthScale===2&&s.lightDepthScale===.5));assert.ok(sent.some(s=>s.environment==='street'&&s.sunAngularRadius===.27));
  await axeCheck(page);assert.deepEqual(errors,[]);
});

test('playback cancels obsolete 16-sample frames on scene change and pause', {timeout:240000},async t=>{
  const page=await pageFor(t,{viewport:{width:960,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await final(page);await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  await page.locator('#shadow-samples').selectOption('16');await page.locator('#toggle-soft-shadows').click();await page.locator('#toggle-controls').click();
  await page.locator('#event-time').evaluate(e=>{e.value='-3';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('#play').click();await page.waitForFunction(()=>{const s=document.querySelector('#relativity-stage').dataset;return s.playing==='true'&&s.quality==='dynamic'&&s.shadowSamples==='16';},null,{timeout:60000});
  await page.locator('button[data-environment="street"]').click();await page.locator('#play').click();await final(page);
  const first=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));
  assert.equal(first.playing,'false');assert.equal(first.environment,'street');assert.equal(first.drawnEnvironment,'street');assert.equal(first.shadowSamples,'16');
  assert.ok(Math.abs(Number(first.time)-Number(first.drawnTime))<.002,JSON.stringify(first));
  await page.waitForTimeout(750);const after=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));
  assert.equal(after.drawnEnvironment,'street');assert.equal(after.drawnTime,first.drawnTime);assert.equal(after.quality,'final');assert.deepEqual(errors,[]);
});

test('320px local-file controls remain accessible and do not use network requests', {timeout:360000},async t=>{
  const page=await pageFor(t,{viewport:{width:320,height:760},isMobile:true,hasTouch:true,deviceScaleFactor:1}),external=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await open(page,pathToFileURL(path.join(root,'relativity.html')).href);await final(page);await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  await page.locator('#shadow-samples').selectOption('8');await range(page,'#light-width',1.5);await page.locator('#toggle-soft-shadows').click();await final(page);
  assert.equal(await page.locator('#relativity-stage').getAttribute('data-shadow-samples'),'8');assert.equal(await page.locator('#light-width-value').textContent(),'2.34 单位（1.50×）');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);const rect=await page.locator('#shadow-samples').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=320.5,JSON.stringify(rect));
  await axeCheck(page);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});
