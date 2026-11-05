'use strict';
// Optional real-browser regression. Run with playwright-core and Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  return browser.newPage({viewport:{width:960,height:600},reducedMotion:'reduce',...options});
}
async function open(page,url=base+'relativity.html'){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:90000});}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:180000});}
async function input(page,id,value){await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}

test('Canvas and WebGL agree on split colors, two worldlines, shadow events and isolated RGB readback', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    const R=RelativityRenderer,O=RelativityOptics,view={width:96,height:60,dpr:1};let cpu,gpu;
    await Promise.all([
      new Promise((resolve,reject)=>{let n=0;cpu=R.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());}),
      new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');c.style='width:96px;height:60px';document.body.append(c);gpu=R.create(c,{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});})
    ]);if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const gl=gpu.canvas.getContext('webgl'),width=96,height=60;
    const read=state=>{cpu.render(state,false,view);gpu.render(state,false,view);const a=cpu.canvas.getContext('2d').getImageData(0,0,width,height).data.slice(),b=new Uint8Array(a.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,b);return {a,b};};
    const compare=(a,b)=>{let sum=0,bad=0,n=0,max=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<3;k++){const d=Math.abs(a[(y*width+x)*4+k]-b[((height-1-y)*width+x)*4+k]);sum+=d;bad+=d>20;n++;max=Math.max(max,d);}return {mean:sum/n,bad:bad/n,max};};
    const base={...RelativityExperiments.BASE,shape:'sphere',beta:.72,secondEnabled:true,secondBeta:-.43,secondAngle:25,time:.3,view:'photo',spectrumSplit:true,split:.5,renderBudget:width*height,shadows:true};
    const worlds=[];
    for(const [i,environment] of RelativityWorlds.IDs.entries()){
      const state={...base,environment,roughnessScale:i%2?.5:1.5};const frame=read(state);gpu.render(state,2,view);const optics=new Uint8Array(frame.a.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,optics);
      let count=0,shadowMismatch=0,dMax=0,aHits=0,bHits=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const ray=R.trace(state,x+.5,y+.5,width,height);if(!ray.hit?.body)continue;
        if(ray.hit.bodyId==='A')aHits++;else bHits++;const q=((height-1-y)*width+x)*4,shadow=O.illumination(state,ray).shadowed;
        if(shadow!==(optics[q]>127))shadowMismatch++;const decoded=.1*Math.pow(100,(optics[q+1]*256+optics[q+2])/65535),expected=O.frequencyRatio(state,ray);
        dMax=Math.max(dMax,Math.abs(decoded-expected));count++;
      }
      worlds.push({environment,...compare(frame.a,frame.b),aHits,bHits,count,shadowMismatch,dMax});
    }
    const split=read(base),off=read({...base,spectrumSplit:false,doppler:false}),on=read({...base,spectrumSplit:false,doppler:true});let cpuMismatch=0,gpuDiff=0,gpuBad=0,n=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=0;k<3;k++){
      const reference=x<width/2?off:on,i=(y*width+x)*4+k,g=((height-1-y)*width+x)*4+k;
      if(split.a[i]!==reference.a[i])cpuMismatch++;const d=Math.abs(split.b[g]-reference.b[g]);gpuDiff+=d;gpuBad+=d>12;n++;
    }
    // The readback must not paint its unshifted pixel into the visible frame,
    // even when the preceding image used four temporal shutter samples.
    const before=read({...base,shutter:.8});const probes=[];
    for(const [u,v] of [[.35,.4],[.62,.54],[.8,.72]]){const c=cpu.sampleSpectrum(base,u,v,width,height),g=gpu.sampleSpectrum(base,u,v,width,height);probes.push({cpu:c.rgb,gpu:g.rgb,d:Math.max(...c.rgb.map((a,i)=>Math.abs(a-g.rgb[i])))});}
    const after=new Uint8Array(before.b.length);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after);let changed=0;for(let i=0;i<after.length;i++)if(after[i]!==before.b[i])changed++;
    return {worlds,cpuMismatch,gpuMean:gpuDiff/n,gpuBad:gpuBad/n,probes,frameChanged:changed};
  });
  t.diagnostic(JSON.stringify(result));
  for(const world of result.worlds){assert.ok(world.aHits>0&&world.bHits>0,JSON.stringify(world));assert.ok(world.mean<6&&world.bad<.04,JSON.stringify(world));assert.ok(world.dMax<.002,JSON.stringify(world));assert.ok(world.shadowMismatch/world.count<.03,JSON.stringify(world));}
  assert.equal(result.cpuMismatch,0);assert.ok(result.gpuMean<.1&&result.gpuBad<.001);assert.equal(result.frameChanged,0,'sampling must not overwrite the displayed shutter frame');
  for(const probe of result.probes)assert.ok(probe.d<.08,JSON.stringify(probe));
});

test('desktop controls connect split, sampled spectrum, independent light-path time and two bodies', {timeout:300000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.locator('#spectrum-split').click();await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-spectrum-split'),'true');assert.match(await page.locator('#spectrum-status').textContent(),/光谱开 \/ 关对照/);
  await page.locator('#split-handle').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#split-handle').getAttribute('aria-valuenow'),'51');await final(page);
  await page.locator('#toggle-controls').click();await page.locator('#toggle-second-body').click();await input(page,'#second-beta',-.35);await input(page,'#second-angle',30);await page.locator('#advanced-physics > summary').click();await input(page,'#roughness-scale',.6);await final(page);
  assert.equal(await page.locator('#roughness-scale-value').textContent(),'0.60×');assert.equal(await page.locator('#relativity-stage').getAttribute('data-second-enabled'),'true');
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumSample==='ready',null,{timeout:120000});
  assert.match(await page.locator('#spectrum-status').textContent(),/采样像素/);assert.equal(await page.locator('#spectrum-plot').getAttribute('data-samples'),'501');
  await page.locator('#show-sampled-spectrum').click();assert.equal(await page.locator('#spectrum-plot').isVisible(),true);
  await page.waitForFunction(()=>!document.querySelector('#open-ray-space').disabled,null,{timeout:30000});await page.locator('#open-ray-space').click();await page.locator('[data-diagram="light-path"]').click();
  await page.waitForFunction(()=>!!document.querySelector('#ray-space-canvas').dataset.pathStatus,null,{timeout:30000});let state=await page.locator('#ray-space-canvas').evaluate(e=>({...e.dataset}));assert.ok(['lit','blocked','unlit','emissive','sky'].includes(state.pathStatus));
  const mainTime=await page.locator('#relativity-stage').getAttribute('data-time');await input(page,'#light-path-time',1.1);
  await page.waitForFunction(()=>document.querySelector('#ray-space-canvas').dataset.pathTime==='1.100000',null,{timeout:30000});assert.equal(await page.locator('#relativity-stage').getAttribute('data-time'),mainTime);
  const before=await page.locator('#ray-space-canvas').getAttribute('data-path-time');await page.locator('#light-path-play').click();await page.waitForFunction(t=>document.querySelector('#ray-space-canvas').dataset.pathTime!==t,before,{timeout:30000});await page.locator('#light-path-play').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#ray-space-dialog').isHidden(),true);
  assert.deepEqual(errors,[]);
});

test('offline mobile exposes new controls, keyboard split and light-path without external requests', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),external=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await open(page,pathToFileURL(path.join(root,'relativity.html')).href);await final(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#spectrum-split').tap();await final(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:120000});
  const cdp=await page.context().newCDPSession(page),startYaw=Number(await page.locator('#relativity-stage').getAttribute('data-yaw'));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:275,y:310,id:1}]});
  for(let i=0;i<8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:275+i*5,y:310+i,id:1}]});
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraPreview==='true',null,{timeout:30000});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await final(page);
  const endYaw=Number(await page.locator('#relativity-stage').getAttribute('data-yaw'));assert.notEqual(endYaw,startYaw);
  assert.ok(Math.abs(Number(await page.locator('#relativity-stage').getAttribute('data-drawn-yaw'))-endYaw)<.00002,'touch release must finish the latest physical view');await cdp.detach();
  await page.locator('#toggle-controls').click();await page.locator('#toggle-second-body').click();await page.locator('#advanced-physics > summary').click();await input(page,'#roughness-scale',1.3);await final(page);
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumSample==='ready',null,{timeout:120000});
  await page.waitForFunction(()=>!document.querySelector('#open-ray-space').disabled,null,{timeout:30000});await page.locator('#open-ray-space').click();await page.locator('[data-diagram="light-path"]').click();
  await page.waitForFunction(()=>!!document.querySelector('#ray-space-canvas').dataset.pathStatus,null,{timeout:30000});const bounds=await page.locator('#ray-space-dialog').boundingBox();assert.ok(bounds.width<=390&&bounds.height<=844,JSON.stringify(bounds));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});

test('two independent bodies mutually cast retarded shadows in both CPU and WebGL', {timeout:240000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const out=await page.evaluate(async()=>{
    let gpu;await new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');c.style='width:100px;height:75px';document.body.append(c);gpu=RelativityRenderer.create(c,{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});});if(gpu.kind!=='webgl')throw Error('WebGL unavailable');
    const gl=gpu.canvas.getContext('webgl'),R=RelativityRenderer,O=RelativityOptics,view={width:100,height:75,dpr:1},pixel=new Uint8Array(4),out=[];
    for(const q of [
      {center:[-2.1,1.8,6.2],secondCenter:[2.7,1.22,8],x:58,y:42,target:'B',blocker:'A'},
      {center:[-1.5,1.22,8],secondCenter:[3.5,1.8,6.2],x:50,y:42,target:'A',blocker:'B'}
    ]){
      const s={...RelativityExperiments.BASE,shape:'sphere',beta:-.3,secondEnabled:true,secondBeta:.3,time:0,renderBudget:7500,lockedEvent:{camera:[0,1.65,0],center:q.center,secondCenter:q.secondCenter,time:0}},ray=R.trace(s,q.x+.5,q.y+.5,100,75),info=O.illumination(s,ray);
      gpu.render(s,2,view);gl.readPixels(q.x,74-q.y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const blocked=pixel[0];
      const clear=q.blocker==='B'?{...s,secondEnabled:false}:{...s,lockedEvent:{...s.lockedEvent,center:[100,100,100]}};
      const clearRay=R.trace(clear,q.x+.5,q.y+.5,100,75),clearInfo=O.illumination(clear,clearRay);gpu.render(clear,2,view);gl.readPixels(q.x,74-q.y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      out.push({target:ray.hit?.bodyId,blocker:info.blockerBody,cpu:info.shadowed,gpu:blocked,clearTarget:clearRay.hit?.bodyId,clearCpu:clearInfo.shadowed,clearGpu:pixel[0]});
    }return out;
  });
  t.diagnostic(JSON.stringify(out));assert.deepEqual(out.map(x=>[x.target,x.blocker]),[['B','A'],['A','B']]);for(const r of out){assert.equal(r.cpu,true);assert.equal(r.gpu,255);assert.equal(r.clearCpu,false);assert.equal(r.clearGpu,0);assert.equal(r.target,r.clearTarget);}
});

test('dynamic quality and physical FPS count presented rays rather than camera reprojection', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:1000,height:625}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#dynamic-quality').selectOption('responsive');await page.locator('#toggle-controls').click();await input(page,'#event-time',-2.8);await final(page);
  await page.evaluate(()=>{const s=document.querySelector('#relativity-stage');window.__physics=[];window.__physicalObserver=new MutationObserver(()=>{if(s.dataset.quality==='dynamic'){const last=window.__physics.at(-1);if(!last||last.frame!==s.dataset.frame)window.__physics.push({time:performance.now(),frame:s.dataset.frame,fps:s.dataset.physicalFps,hits:s.dataset.staticCacheHits,shadowHits:s.dataset.staticShadowHits,pixels:document.querySelector('#relativity-scene').dataset.renderPixels});}});window.__physicalObserver.observe(s,{attributes:true,attributeFilter:['data-frame']});});
  await page.locator('#play').click();await page.waitForFunction(()=>window.__physics.length>=5&&Number(document.querySelector('#relativity-stage').dataset.staticShadowHits)>0,null,{timeout:60000});
  const frames=await page.evaluate(()=>window.__physics),fps=Number(await page.locator('#relativity-stage').getAttribute('data-physical-fps'));assert.ok(fps>0&&Number.isFinite(fps));assert.ok(Number(frames.at(-1).hits)>0);assert.ok(Number(frames.at(-1).shadowHits)>0);assert.ok(Number(frames.at(-1).pixels)>=9900);
  const measured=(frames.length-1)*1000/(frames.at(-1).time-frames[0].time);assert.ok(Math.abs(measured-fps)/measured<.25,JSON.stringify({measured,fps,frames}));
  await page.locator('#play').click();await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-physical-fps'),'');
  await page.evaluate(()=>window.__physics=[]);const box=await page.locator('#relativity-scene').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;await page.mouse.move(x,y);await page.mouse.down();
  for(let i=0;i<36;i++){await page.mouse.move(x+50*Math.sin(i/7),y+8*Math.sin(i/9));await new Promise(r=>setTimeout(r,60));}
  const drag=await page.evaluate(()=>window.__physics);assert.ok(drag.length>=2,'drag must present actual physical frames');assert.ok(Number(drag.at(-1).fps)>0);await page.mouse.up();await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-physical-fps'),'');
  assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({playbackFrames:frames.length,measured,fps,dragFrames:drag.length,dragFps:drag.at(-1).fps,dragPixels:drag.at(-1).pixels}));
});

test('rapid camera moves coalesce and the latest split view survives release or invalidation', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:900,height:562}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>4});});
  await open(page);await final(page);await page.locator('#spectrum-split').click();await final(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:120000});
  const box=await page.locator('#relativity-scene').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
  async function burst(){
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+12,y);
    return page.evaluate(({x,y})=>{
      const stage=document.querySelector('#relativity-stage'),canvas=document.querySelector('#relativity-scene'),before=Number(stage.dataset.previewUpdates||0);
      for(let i=0;i<30;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,bubbles:true,clientX:x+16+i*2,clientY:y+Math.sin(i/4)*4}));
      return {updates:Number(stage.dataset.previewUpdates||0)-before,yaw:stage.dataset.yaw,preview:stage.dataset.cameraPreview,split:stage.dataset.spectrumSplit};
    },{x,y});
  }
  const first=await burst();assert.equal(first.preview,'true');assert.equal(first.split,'true');
  assert.ok(first.updates<=2,JSON.stringify(first)+'; a burst should not recomposite 30 times');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.cameraPreview==='true'&&Math.abs(Number(d.previewYaw)-Number(d.yaw))<.00002;},null,{timeout:30000});
  const expected=await page.locator('#relativity-stage').getAttribute('data-yaw');await page.mouse.up();await final(page);
  let d=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));assert.equal(d.cameraPreview,'false');assert.equal(d.drawnYaw,expected);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:120000});
  await burst();await input(page,'#beta',.71);
  d=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));assert.equal(d.cameraPreview,'false');assert.equal(d.cameraCache,'false');
  await page.waitForTimeout(350);assert.equal(await page.locator('#relativity-stage').getAttribute('data-camera-preview'),'false','a queued old drag must not reappear after a physics change');
  await page.mouse.up();await final(page);d=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));assert.equal(d.beta,'0.71');assert.equal(d.cameraPreview,'false');assert.deepEqual(errors,[]);
});

test('cached playing frames match fresh rays with two bodies, soft shadows and shutter samples', {timeout:240000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const out=await page.evaluate(async()=>{
    let r;await new Promise((resolve,reject)=>{let n=0;r=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());});
    const view={width:80,height:50,dpr:1},base={...RelativityExperiments.BASE,renderBudget:4000,secondEnabled:true,secondBeta:-.43,secondAngle:25,beta:.72,spectrumSplit:true,shadows:true},out=[];
    for(const environment of RelativityWorlds.IDs)for(const softShadows of [false,true])for(const shutter of [0,.8]){
      let changed=0;for(const time of [0,.25]){
        const s={...base,environment,softShadows,shutter,time};r.render({...s,playing:true},false,view);const a=r.canvas.getContext('2d').getImageData(0,0,80,50).data.slice();r.render({...s,playing:false},false,view);const b=r.canvas.getContext('2d').getImageData(0,0,80,50).data;
        for(let i=0;i<a.length;i++)changed+=a[i]!==b[i];
      }out.push({environment,softShadows,shutter,changed,cache:r.staticCacheStats()});
    }return out;
  });
  assert.equal(out.length,20);for(const r of out){assert.equal(r.changed,0,JSON.stringify(r));assert.ok(r.cache.hits>0&&r.cache.shadowHits>0,JSON.stringify(r));}t.diagnostic(JSON.stringify(out));
});

test('cached stationary radiance follows material, spectrum, split and light changes', {timeout:300000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const out=await page.evaluate(async()=>{
    let renderer;await new Promise((resolve,reject)=>{let n=0;renderer=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());});
    const view={width:64,height:40,dpr:1},base={...RelativityExperiments.BASE,renderBudget:2560,secondEnabled:true,secondBeta:-.43,secondAngle:25,beta:.72};
    // Reuse the SAME renderer and ray entries through parameter transitions.
    // A non-playing frame independently retraces the stationary world.
    const variants=[
      ['baseline',{}],['doppler-off',{doppler:false}],['exposure',{exposure:1.2}],['roughness',{roughnessScale:.5}],
      ['shadow-off',{shadows:false}],['soft-shadow',{softShadows:true}],['frozen-shadow',{shadowTiming:'instant'}],
      ['split-shadow',{shadowTiming:'split',split:.37}],['geometry',{view:'geometry'}],['view-split',{view:'split',split:.64}],
      ['spectrum-split-a',{spectrumSplit:true,split:.36}],['spectrum-split-b',{spectrumSplit:true,split:.67}],
      ['blackbody',{spectrumModel:'blackbody',temperature:4100}],['line',{spectrumModel:'line',lineWavelength:486.1}],
      ['fabric',{materialSpectrum:'fabric'}],['metal',{materialSpectrum:'metal',roughnessScale:1.5}],
      ['emission',{surfaceMode:'emission'}],['emission-map',{emissionMap:true}],['filmic',{toneMap:'filmic'}],
      ['light-position',{lightX:2,lightZ:-1}],['light-direction',{lightYaw:30,lightElevation:-10}],
      ['moving-both',{secondAngle:-40,secondElevation:20,secondBeta:.31,beta:-.53}],['baseline-again',{}]
    ];
    const results=[];
    for(const environment of RelativityWorlds.IDs)for(const [name,change] of variants){
      let changed=0;const state={...base,...change,environment};
      for(const time of [-.7,.4]){
        renderer.render({...state,time,playing:true},false,view);
        const cached=renderer.canvas.getContext('2d').getImageData(0,0,view.width,view.height).data.slice();
        renderer.render({...state,time,playing:false},false,view);
        const fresh=renderer.canvas.getContext('2d').getImageData(0,0,view.width,view.height).data;
        for(let i=0;i<cached.length;i++)changed+=cached[i]!==fresh[i];
      }
      results.push({environment,name,changed,cache:renderer.staticCacheStats()});
    }
    return results;
  });
  assert.equal(out.length,5*23);for(const row of out){assert.equal(row.changed,0,JSON.stringify(row));assert.ok(row.cache.hits>0,JSON.stringify(row));}
  t.diagnostic(JSON.stringify({comparisons:out.length,rgbaBytes:out.length*2*64*40*4}));
});

test('Canvas and WebGL agree on two-body soft-shadow shutter accumulation', {timeout:240000},async t=>{
  const page=await pageFor(t,{viewport:{width:600,height:400}});await open(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const out=await page.evaluate(async()=>{
    let cpu,gpu;await Promise.all([new Promise((resolve,reject)=>{let n=0;cpu=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());}),new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');c.style='width:96px;height:60px';document.body.append(c);gpu=RelativityRenderer.create(c,{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});})]);if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const gl=gpu.canvas.getContext('webgl'),view={width:96,height:60,dpr:1},out=[];
    for(const environment of ['station','corridor','harbor']){
      const state={...RelativityExperiments.BASE,environment,shape:'sphere',beta:.72,secondEnabled:true,secondBeta:-.43,secondAngle:25,roughnessScale:.65,spectrumSplit:true,softShadows:true,shutter:.8,time:.3,renderBudget:5760};cpu.render(state,false,view);gpu.render(state,false,view);
      const a=cpu.canvas.getContext('2d').getImageData(0,0,96,60).data,b=new Uint8Array(a.length);gl.readPixels(0,0,96,60,gl.RGBA,gl.UNSIGNED_BYTE,b);let sum=0,bad=0,n=0;for(let y=0;y<60;y++)for(let x=0;x<96;x++)for(let k=0;k<3;k++){const d=Math.abs(a[(y*96+x)*4+k]-b[((59-y)*96+x)*4+k]);sum+=d;bad+=d>20;n++;}out.push({environment,mean:sum/n,bad:bad/n});
    }return out;
  });
  t.diagnostic(JSON.stringify(out));for(const r of out)assert.ok(r.mean<6&&r.bad<.04,JSON.stringify(r));
});
