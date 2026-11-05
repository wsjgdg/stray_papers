'use strict';
// Optional: playwright-core, Chromium; axe-core adds accessibility checks.
// RELATIVITY_NO_WEBGL=1 exercises main-thread Canvas; RELATIVITY_SAFE_WORKER=1
// exercises the generic interaction suite on Worker Canvas. Explicit GPU tests
// still request WebGL so they cannot silently pass against the wrong renderer.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright-core');let axe;try{axe=require('axe-core');}catch(_){}
const worldCount=require('../relativity-worlds').IDs.length,root=path.resolve(__dirname,'..'),noWebGL=process.env.RELATIVITY_NO_WEBGL==='1',safeWorker=process.env.RELATIVITY_SAFE_WORKER==='1';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.png':'image/png'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());const {autoRenderer=false,forceWebGL=false,...pageOptions}=options;
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...pageOptions});
  // Exercise real worker WebGL even on software-only CI. Dedicated tests
  // below also verify the default low-contention Worker Canvas path.
  if(!noWebGL&&(forceWebGL||(!safeWorker&&!autoRenderer)))await page.addInitScript(()=>{window.__RELATIVITY_FORCE_WORKER_WEBGL__=true;});
  if(noWebGL)await page.addInitScript(()=>{window.__RELATIVITY_DISABLE_WORKER__=true;const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};});
  return page;
}
async function open(page){await page.goto(base+'relativity.html',{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:60000});}
async function data(page){return page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));}
async function selectStandardCube(page){
  if((await data(page)).shape==='cube')return;
  const wasOpen=await page.locator('#control-panel').isVisible();if(!wasOpen)await page.locator('#toggle-controls').click();
  await paintAfter(page,()=>page.locator('button[data-shape="cube"]').click());if(!wasOpen)await page.locator('#toggle-controls').click();
}
async function assetsReady(page){await page.waitForFunction(()=>['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal'].every(k=>document.querySelector('#relativity-scene').dataset[k+'Loaded']==='true')&&document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function setRange(page,selector,value){await page.locator(selector).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function paintAfter(page,action){
  const frame=Number((await data(page)).frame);await action();
  // A previous preview's HD refinement may finish between reading `frame` and
  // the action. Do not mistake that completion for the new parameter state.
  await page.waitForFunction(n=>{const d=document.querySelector('#relativity-stage').dataset;return Number(d.frame)>n&&d.renderPending==='false';},frame,{timeout:60000});
}
async function viewVisible(page){return page.evaluate(()=>{const stage=document.querySelector('#relativity-stage'),preview=document.querySelector('#camera-preview'),canvas=document.querySelector('#relativity-scene');return stage.dataset.cameraPreview==='true'?(!preview.hidden&&getComputedStyle(preview).display!=='none'):getComputedStyle(canvas).opacity==='1';});}
async function thumb(page){return page.evaluate(()=>{const a=document.querySelector('#relativity-scene'),c=document.createElement('canvas');c.width=120;c.height=75;const x=c.getContext('2d');x.drawImage(a,0,0,c.width,c.height);return Array.from(x.getImageData(0,0,c.width,c.height).data);});}
function diff(a,b){let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)count++;return count;}
async function assertAxe(page,label){if(!axe)return;const v=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(v,[],label+': '+JSON.stringify(v));}

test('starts paused in a full-screen, offline workbench with both drawers available', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[],external=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});await open(page);
  const d=await data(page);assert.equal(d.renderer,noWebGL||safeWorker?'canvas':'webgl');assert.equal(d.scenario,'flyby');assert.equal(d.view,'photo');assert.equal(d.beta,'0.60');assert.equal(d.playing,'false');assert.equal(await page.locator('#control-panel').isHidden(),true);assert.equal(await page.locator('#knowledge-panel').isHidden(),true);
  assert.equal(await page.locator('#render-fallback').isVisible(),noWebGL);assert.equal(await page.locator('#relativity-scene').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1440);
  await page.locator('#toggle-controls').click();assert.equal(await page.locator('#control-panel').isVisible(),true);await page.locator('#toggle-knowledge').click();assert.equal(await page.locator('#knowledge-panel').isVisible(),true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
});

test('progressive Canvas preview reuses genuine rays and finishes pixel-identically', {timeout:120000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:480,height:300}});await open(page);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const c=document.createElement('canvas');let count=0;window.__progressive=RelativityRenderer.createOffscreenCanvas(c,(name,status)=>{if(status==='error')reject(Error(name));else if(++count===9)resolve();});}));
  const results=await page.evaluate(()=>{
    const r=window.__progressive,view={width:97,height:65},out=[];
    for(const [i,environment] of RelativityWorlds.IDs.entries())for(const mode of ['normal','shutter']){
      const s={environment,scenario:i%2?'observer':'flyby',shape:'artifact',beta:i%2?-.72:.6,motionAngle:25,view:'photo',time:.2,split:.5,yaw:.12,pitch:-.06,fov:58,doppler:true,shadows:true,softShadows:i===2,shutter:mode==='shutter'?.8:0,spectrumModel:i===0?'rgb':i%2?'blackbody':'line',temperature:4800,lineWavelength:656.3,exposure:0,renderBudget:6305};
      const job=r.beginRender(s,view,{previewBudget:1000});if(!job.progressive)throw Error('expected progressive job');while(!job.step(Infinity)){}job.commit();const ctx=r.canvas.getContext('2d'),preview=ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data.slice(),pw=r.canvas.width,ph=r.canvas.height;
      job.refine();while(!job.step(Infinity)){}job.commit();const fine=ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data.slice();
      const reference=r.beginRender(s,view);while(!reference.step(Infinity)){}reference.commit();const direct=ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data;let mismatch=0,previewMismatch=0;
      for(let n=0;n<direct.length;n++)if(direct[n]!==fine[n])mismatch++;
      for(let y=0;y<ph;y++)for(let x=0;x<pw;x++)for(let k=0;k<4;k++)if(preview[(y*pw+x)*4+k]!==fine[((y*2)*job.width+x*2)*4+k])previewMismatch++;
      out.push({environment,mode,width:job.width,height:job.height,pw,ph,mismatch,previewMismatch});
    }return out;
  });
  assert.equal(results.length,worldCount*2);for(const r of results){assert.equal(r.mismatch,0,JSON.stringify(r));assert.equal(r.previewMismatch,0,JSON.stringify(r));assert.equal(r.pw,Math.ceil(r.width/2));assert.equal(r.ph,Math.ceil(r.height/2));}
});

test('camera-only pending frames stay visible; probes wait and physical changes still hide stale pixels', {timeout:150000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}});await page.addInitScript(()=>{
    const Original=window.Worker;window.__holdCamera=false;window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{
      if(m.type==='render'&&m.state.settleCamera&&window.__holdCamera){window.__holdCamera=false;window.__heldCamera=m;window.__releaseCamera=()=>post(m,...rest);return;}return post(m,...rest);
    };return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.evaluate(()=>window.__holdCamera=true);await page.locator('#relativity-scene').focus();await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(()=>typeof window.__releaseCamera==='function');let d=await data(page);assert.equal(d.viewPending,'true');assert.equal(d.renderPending,'true');
  assert.equal(await viewVisible(page),true);assert.equal(d.cameraPreview,'true');assert.match(await page.locator('#scene-preparing').textContent(),/近似视角预览/);
  await page.keyboard.press('Enter');assert.equal((await data(page)).probe,undefined,'old camera pixels must not be used as a new probe');
  await page.evaluate(()=>window.__releaseCamera());await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderPending==='false'&&d.probe&&d.drawnYaw===d.yaw;},null,{timeout:60000});
  const actual=await data(page),expected=await page.evaluate(()=>{const d=document.querySelector('#relativity-stage').dataset,s={...RelativityExperiments.BASE,yaw:Number(d.yaw),pitch:Number(d.pitch),fov:Number(d.fov)};return RelativityRenderer.trace(s,500,325,1000,650).hit?.distance;});
  assert.ok(Number.isFinite(expected));assert.ok(Math.abs(Number(actual.probeDistance)-expected)<.00002,'the queued probe must trace the displayed camera');
  await page.evaluate(()=>{window.__holdCamera=true;delete window.__releaseCamera;});await page.mouse.move(500,250);await page.mouse.wheel(0,180);await page.waitForFunction(()=>typeof window.__releaseCamera==='function');d=await data(page);assert.equal(d.viewPending,'true');assert.notEqual(Number(d.fov),58);assert.equal(await viewVisible(page),true,'wheel zoom shows the approximate view while a matching frame is pending');
  await page.evaluate(()=>window.__releaseCamera());await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  await page.evaluate(()=>{window.__holdCamera=true;delete window.__releaseCamera;});await page.locator('#relativity-scene').focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>typeof window.__releaseCamera==='function');
  await setRange(page,'#beta',.86);d=await data(page);assert.equal(d.viewPending,'false');assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'0','a changed physical event must not expose an older image');
  await page.evaluate(()=>window.__releaseCamera());await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.beta==='0.86'&&d.renderPending==='false';},null,{timeout:60000});
});

test('safe Canvas presents a full preview and four-times-denser still without idle redraw', {timeout:150000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1200,height:750}});await page.addInitScript(()=>{
    const Original=window.Worker;window.__qualityEvents=[];window.Worker=function(...args){const w=new Original(...args);w.addEventListener('message',e=>{const m=e.data;if(['preview','progress','frame'].includes(m.type))window.__qualityEvents.push({type:m.type,revision:m.revision,width:m.width,height:m.height,progress:m.progress,phase:m.phase});});return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:90000});
  const events=await page.evaluate(()=>window.__qualityEvents),final=events.filter(e=>e.type==='frame').at(-1),preview=events.find(e=>e.type==='preview'&&e.revision===final.revision),progress=events.filter(e=>e.type==='progress'&&e.revision===final.revision).map(e=>e.progress);
  assert.ok(preview&&final,JSON.stringify(events));assert.ok(final.width*final.height>preview.width*preview.height*3.9,JSON.stringify({preview,final}));assert.ok(final.width*final.height>195000);assert.ok(progress.length>2);for(let i=1;i<progress.length;i++)assert.ok(progress[i]>=progress[i-1],`progress regressed: ${progress}`);
  const n=(await data(page)).frame;await page.waitForTimeout(1500);assert.equal((await data(page)).frame,n,'finished still must not redraw while idle');
});

test('touch camera on the main-thread Canvas fallback never blanks and refines offline', {timeout:150000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>window.__RELATIVITY_DISABLE_WORKER__=true);
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:60000});assert.equal((await data(page)).worker,'false');
  const cdp=await page.context().newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  await touch('touchStart',190,270);await touch('touchMove',235,280);await touch('touchMove',270,290);await touch('touchEnd',270,290);
  let d=await data(page);assert.notEqual(d.yaw,'0.00000');assert.equal(await viewVisible(page),true);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderPending==='false'&&d.drawnYaw===d.yaw;},null,{timeout:60000});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#relativity-scene');return d.quality==='final'&&d.qualityPending==='false'&&c.width*c.height>110000;},null,{timeout:90000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.deepEqual(errors,[]);
});

test('a drag preview never crosses a newer physical event', {timeout:150000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8'),needle='const start=performance.now(),pixels=budget(msg.state);';
  const slow=original.replace(needle,"if(msg.state.interacting){const until=performance.now()+1200;while(performance.now()<until){}}\n      "+needle);assert.notEqual(slow,original);
  await page.route('**/relativity-render-worker.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:slow}));await page.addInitScript(()=>{
    const Original=window.Worker;window.__holdCancel=false;window.__holdNew=false;window.__cameraJobs=[];window.__cameraReplies=[];window.Worker=function(...a){const w=new Original(...a),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{if(m.type==='cancel'&&window.__holdCancel)return;if(m.type==='render'){window.__cameraJobs.push({revision:m.revision,interacting:m.state.interacting,beta:m.state.beta});if(window.__holdNew&&m.state.beta===.86){window.__releaseNew=()=>post(m,...rest);return;}}return post(m,...rest);};w.addEventListener('message',e=>{if(e.data.type==='frame')window.__cameraReplies.push({revision:e.data.revision,interacting:e.data.interacting});});return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);await page.mouse.move(250,220);await page.mouse.down();await page.mouse.move(285,225);
  await page.waitForFunction(()=>window.__cameraJobs.some(x=>x.interacting));const oldRevision=await page.evaluate(()=>window.__cameraJobs.find(x=>x.interacting).revision);await page.evaluate(()=>{window.__holdCancel=true;window.__holdNew=true;});
  await setRange(page,'#beta',.86);const pending=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene'),d=document.querySelector('#relativity-stage').dataset;window.__originalPixels={width:c.width,height:c.height,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data};return {renderPending:d.renderPending,viewPending:d.viewPending,opacity:getComputedStyle(c).opacity};});assert.equal(pending.renderPending,'true');assert.equal(pending.viewPending,'false');assert.equal(pending.opacity,'0','reduced-motion styles must not animate stale physical pixels');
  await page.waitForFunction(rev=>window.__cameraReplies.some(x=>x.revision===rev),oldRevision,{timeout:60000});
  const changed=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene'),old=window.__originalPixels;if(c.width!==old.width||c.height!==old.height)return -1;const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<a.length;i++)if(a[i]!==old.data[i])n++;return n;});assert.equal(changed,0,'an obsolete interaction frame must not overwrite the raw canvas while the new event is held');
  await page.evaluate(()=>{window.__holdCancel=false;window.__holdNew=false;if(window.__releaseNew)window.__releaseNew();});await page.mouse.up();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.beta==='0.86'&&d.renderPending==='false'&&d.drawnYaw===d.yaw;},null,{timeout:60000});assert.deepEqual(errors,[]);
});

test('all worlds keep showing real camera frames throughout scene changes and dragging', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1200,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await assetsReady(page);
  for(const environment of ['station','street','corridor','mountain','harbor']){
    if(environment!=='station')await page.locator(`button[data-environment="${environment}"]`).click();
    await page.waitForFunction(env=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment===env&&d.renderPending==='false';},environment,{timeout:60000});
    const before=await data(page);await page.mouse.move(500,300);await page.mouse.down();for(let i=1;i<=14;i++){await page.mouse.move(500+i*6,300+i);await page.waitForTimeout(35);}
    await page.waitForFunction(({n,yaw})=>{const d=document.querySelector('#relativity-stage').dataset;return Number(d.frame)>n&&d.drawnYaw!==yaw;},{n:Number(before.frame),yaw:before.drawnYaw},{timeout:30000});const during=await data(page);assert.notEqual(during.drawnYaw,before.drawnYaw,environment);assert.equal(during.interacting,'true');assert.equal(await viewVisible(page),true,environment);
    await page.mouse.up();assert.equal(await viewVisible(page),true,environment);await page.waitForFunction(env=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment===env&&d.renderPending==='false'&&d.drawnYaw===d.yaw;},environment,{timeout:60000});
  }assert.deepEqual(errors,[]);
});

test('prepared frame rays exactly match individual probes across worlds, views and aspect ratios', {timeout:120000},async t=>{
  const page=await newPage(t,{autoRenderer:true});await open(page);
  const checked=await page.evaluate(()=>{
    const R=RelativityRenderer;let cases=0,rays=0;const mismatch=[];
    for(const [width,height] of [[120,75],[75,130],[320,90]])for(const environment of RelativityWorlds.IDs)
      for(const scenario of ['flyby','observer'])for(const shape of ['cube','sphere'])for(const beta of [-.98,-.72,0,.6,.98])for(const view of ['photo','geometry','split']){
        const state={environment,scenario,shape,beta,view,time:beta*4,split:.47,yaw:beta*.7,pitch:-.19,fov:58},prepared=R.prepareTrace(state,width,height);
        const points=[[.5,.5],[width-.5,height-.5],[width/2,height/2],[width*.47-.01,height*.28],[width*.47+.01,height*.72],[width*.17,height*.38],[width*.83,height*.62]];
        for(const [x,y] of points){const a=prepared(x,y),b=R.trace(state,x,y,width,height);rays++;if(JSON.stringify(a)!==JSON.stringify(b)&&mismatch.length<3)mismatch.push({state,width,height,x,y,a,b});}
        cases++;
      }
    const state={environment:'street',scenario:'flyby',shape:'cube',beta:.6,view:'photo',time:-1,split:.5,yaw:.2,pitch:-.1,fov:58};
    const snapshot={...state},prepared=R.prepareTrace(state,120,75);state.beta=-.98;state.environment='mountain';state.yaw=2;
    const snapshotStable=JSON.stringify(prepared(60,40))===JSON.stringify(R.trace(snapshot,60,40,120,75));
    let rejectsInvalid=false;try{R.prepareTrace(snapshot,0,75);}catch(e){rejectsInvalid=e instanceof RangeError;}
    return {cases,rays,mismatch,snapshotStable,rejectsInvalid};
  });
  assert.equal(checked.cases,worldCount*180);assert.equal(checked.rays,worldCount*1260);assert.deepEqual(checked.mismatch,[]);assert.equal(checked.snapshotStable,true);assert.equal(checked.rejectsInvalid,true);
});

test('all worlds: shader material hits agree with CPU rays for both shapes and signed speeds', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t);await open(page);
  const results=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-300px;top:0;width:120px;height:90px';document.body.append(c);const r=RelativityRenderer.create(c),R=RelativityRenderer;
    const types={...RelativityWorlds.material,sky:0};const out=[];
    function check(state){
      const got=r.debugMaterials(state);let mismatch=0,total=0,body=0;const samples=[],seen={};
      for(let y=0;y<got.height;y+=2)for(let x=0;x<got.width;x+=2){const hit=R.trace(state,x+.5,y+.5,got.width,got.height).hit,kind=hit?.kind||'sky',actual=got.pixels[((got.height-1-y)*got.width+x)*4];seen[kind]=(seen[kind]||0)+1;if(hit?.body||kind==='cube'||kind==='sphere')body++;if(types[kind]!==actual){mismatch++;if(samples.length<2)samples.push({x,y,kind,actual,distance:hit?.distance,point:hit?.point});}total++;}
      out.push({...state,mismatch,total,body,samples,seen});
    }
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const shape of ['cube','sphere'])for(const beta of [0,.86,-.72])for(const view of ['photo','geometry','split'])check({environment,scenario,shape,beta,view,time:0,split:.47,yaw:.10,pitch:-.025,fov:58});
    // The camera can be inside a hierarchy bound; entry-distance pruning must
    // not discard a closer surface inside that same bound.
    for(const environment of RelativityWorlds.IDs)for(const yaw of [0,1.45,-2.4])check({environment,scenario:'observer',shape:'cube',beta:.86,view:'photo',time:6,split:.47,yaw,pitch:.05,fov:58});
    return out;
  });
  const total=results.reduce((n,r)=>n+r.total,0),mismatch=results.reduce((n,r)=>n+r.mismatch,0);
  t.diagnostic(`${results.length} GPU/CPU cases, ${total} rays, ${mismatch} material mismatches`);
  assert.equal(results.length,worldCount*39);assert.ok(total>=worldCount*105000);for(const r of results)assert.ok(r.mismatch/r.total<.005,JSON.stringify(r));
  assert.ok(results.filter(r=>r.body>20).length>=100,'body intersections must be exercised');
  for(const [world,kind] of [['station','luggage-handle'],['street','parcel-tape'],['corridor','equipment-vent'],['mountain','crate-frame'],['station','train'],['station','bin'],['street','building-brick'],['street','building-glass'],['street','car-body'],['street','car-window'],['street','tire'],['street','tree-deciduous'],['corridor','rail'],['corridor','pipe'],['corridor','cabinet'],['mountain','terrain'],['mountain','tree-conifer']]){
    const count=results.filter(r=>r.environment===world).reduce((sum,r)=>sum+(r.seen[kind]||0),0);
    assert.ok(count>10,`${world} must actually exercise ${kind} intersections, got ${count}`);
  }
});

test('scene-specific moving objects have real silhouettes, parts and CPU/GPU ray agreement', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:500}});await open(page);
  assert.equal((await data(page)).shape,'artifact');
  const cases=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-200px;top:0;width:120px;height:75px';document.body.append(c);
    const r=RelativityRenderer.create(c),R=RelativityRenderer,types={...RelativityWorlds.material,sky:0},out=[];
    function check(s){
      const got=r.debugMaterials(s);let mismatch=0,total=0,body=0;const seen={};
      for(let y=0;y<got.height;y+=2)for(let x=0;x<got.width;x+=2){const hit=R.trace(s,x+.5,y+.5,got.width,got.height).hit,kind=hit?.kind||'sky',actual=got.pixels[((got.height-1-y)*got.width+x)*4];seen[kind]=(seen[kind]||0)+1;if(hit?.body)body++;if(types[kind]!==actual)mismatch++;total++;}
      out.push({environment:s.environment,scenario:s.scenario,beta:s.beta,view:s.view,mismatch,total,body,seen});
    }
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const beta of [0,.86,-.72])for(const view of ['photo','split'])check({environment,scenario,shape:'artifact',beta,view,time:0,split:.47,yaw:.10,pitch:-.025,fov:58});
    // An observer at the subject traverses the conservative part envelope;
    // an exit distance alone must not cull nearer components inside it.
    for(const environment of RelativityWorlds.IDs)check({environment,scenario:'observer',shape:'artifact',beta:.98,motionAngle:15,view:'geometry',time:9.3,split:.5,yaw:.1,pitch:-.025,fov:58});
    return out;
  });
  assert.equal(cases.length,worldCount*13);for(const c of cases)assert.ok(c.mismatch/c.total<.008,JSON.stringify(c));
  assert.ok(cases.filter(c=>c.body>10).length>30);assert.ok(cases.some(c=>c.seen['luggage-wheel']>0));
  await page.locator('#toggle-controls').click();await page.locator('button[data-shape="cube"]').click();assert.equal((await data(page)).shape,'cube');
  await page.locator('button[data-shape="sphere"]').click();assert.equal((await data(page)).shape,'sphere');
});

test('oblique motion updates real geometry, Doppler and shadows consistently on CPU and GPU', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:500}});await open(page);
  const results=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-120px;top:0;width:80px;height:60px';document.body.append(c);
    const r=RelativityRenderer.create(c),R=RelativityRenderer,O=RelativityOptics,types={...RelativityWorlds.material,sky:0},out=[];
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const beta of [-.72,.6])for(const motionAngle of [-90,-45,45,90]){
      const state={environment,scenario,shape:'artifact',beta,motionAngle,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:true,doppler:true};
      const material=r.debugMaterials(state),optics=r.debugOptics(state);let mismatch=0,total=0,shadowMismatch=0,maxD=0,matched=0;
      for(let y=0;y<material.height;y+=3)for(let x=0;x<material.width;x+=3){
        const ray=R.trace(state,x+.5,y+.5,material.width,material.height),kind=ray.hit?.kind||'sky',i=((material.height-1-y)*material.width+x)*4;total++;
        if(types[kind]!==material.pixels[i]){mismatch++;continue;}matched++;
        const expected=O.frequencyRatio(state,ray)||1,D=.1*Math.pow(100,(optics.pixels[i+1]*256+optics.pixels[i+2])/65535);maxD=Math.max(maxD,Math.abs(D-expected)/expected);
        if((optics.pixels[i]>127)!==O.illumination(state,ray).shadowed)shadowMismatch++;
      }out.push({environment,scenario,beta,motionAngle,mismatch,total,matched,shadowMismatch,maxD});
    }return out;
  });
  assert.equal(results.length,worldCount*16);for(const r of results){assert.ok(r.mismatch/r.total<.01,JSON.stringify(r));assert.ok(r.shadowMismatch/r.matched<.012,JSON.stringify(r));assert.ok(r.maxD<.0003,JSON.stringify(r));}
  await page.locator('#toggle-controls').click();await setRange(page,'#motion-angle',-90);let d=await data(page);assert.equal(d.motionAngle,'-90');
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  const forward=await thumb(page);await setRange(page,'#motion-angle',90);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.ok(diff(forward,await thumb(page))>30,'changing heading must alter the actual rendered scene');
  await page.locator('button[data-scenario="observer"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).motionAngle,'90');assert.equal(await page.locator('button[data-motion-angle="90"]').getAttribute('aria-pressed'),'true');
});

test('same-event contour and emission-time key follow real intersections on Canvas and WebGL', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true});await open(page);
  const audit=await page.evaluate(()=>{
    const W=RelativityWorlds,R=RelativityRenderer,M=RelativityModel,out=[];
    const glc=document.createElement('canvas');glc.style='width:80px;height:60px';document.body.append(glc);const gpu=R.create(glc),gl=glc.getContext('webgl');
    const cc=document.createElement('canvas'),cpu=R.createOffscreenCanvas(cc,()=>{});
    for(const environment of W.IDs)for(const scenario of ['flyby','observer'])for(const view of ['photo','split']){
      const state={environment,scenario,shape:'artifact',beta:.6,motionAngle:45,view,time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:true,doppler:true,emissionMap:true,renderBudget:4800};
      gpu.render(state);const gp=new Uint8Array(glc.width*glc.height*4);gl.readPixels(0,0,glc.width,glc.height,gl.RGBA,gl.UNSIGNED_BYTE,gp);
      cpu.render(state,false,{width:glc.width,height:glc.height});const cp=cc.getContext('2d').getImageData(0,0,cc.width,cc.height).data;
      let n=0,gpuGood=0,cpuGood=0;
      for(let y=0;y<glc.height;y+=2)for(let x=0;x<glc.width;x+=2){const ray=R.trace(state,x+.5,y+.5,glc.width,glc.height);if(!ray.hit||(scenario==='flyby'&&!ray.photo))continue;
        const want=M.emissionColor(ray.hit.distance).map(v=>Math.round(v*255)),gi=((glc.height-1-y)*glc.width+x)*4,ci=(y*cc.width+x)*4;n++;
        if(want.every((v,k)=>Math.abs(v-gp[gi+k])<=3))gpuGood++;if(want.every((v,k)=>Math.abs(v-cp[ci+k])<=1))cpuGood++;
      }out.push({environment,scenario,view,n,gpuGood,cpuGood});
    }return out;
  });
  assert.equal(audit.length,worldCount*4);for(const r of audit){assert.ok(r.n>100,JSON.stringify(r));assert.ok(r.gpuGood/r.n>.98,JSON.stringify(r));assert.equal(r.cpuGood,r.n,JSON.stringify(r));}
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#toggle-contour').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).contour,'true');assert.ok(Number((await data(page)).contourPolygons)>1);assert.equal(await page.locator('#geometry-contour').isVisible(),true);
  await page.locator('#toggle-emission').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).emissionMap,'true');assert.equal(await page.locator('#emission-legend').isVisible(),true,JSON.stringify(await page.evaluate(()=>{const e=document.querySelector('#emission-legend'),p=e.parentElement;return {hidden:e.hidden,parentHidden:p.hidden,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON(),parentRect:p.getBoundingClientRect().toJSON(),stage:{...document.querySelector('#relativity-stage').dataset},rules:Array.from(document.styleSheets).flatMap(s=>{try{return Array.from(s.cssRules)}catch{return []}}).filter(r=>r.selectorText&&r.style.visibility&&e.matches(r.selectorText)).map(r=>r.cssText),ancestors:[p,p.parentElement,p.parentElement.parentElement,document.body,document.documentElement].map(a=>[a.id,getComputedStyle(a).visibility])};})));
  await page.locator('button[data-view="geometry"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});assert.equal((await data(page)).contourPolygons,'0');assert.equal(await page.locator('#geometry-contour').isVisible(),true,'velocity diagram remains available in the geometry view');
});

test('blackbody and line spectra change the actual body and agree between CPU and GPU', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:900,height:560}});await open(page);
  const audit=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='width:80px;height:60px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];
    for(const spectrumModel of ['blackbody','line'])for(const scenario of ['flyby','observer'])for(const beta of [-.6,.6]){
      const state={environment:'station',scenario,shape:'artifact',beta,motionAngle:45,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:false,doppler:true,exposure:0,spectrumModel,temperature:6500,lineWavelength:656.3};
      const materials=r.debugMaterials(state),g=r.debugEmitter(state);let total=0,sum=0,max=0,bad=[];
      for(let y=0;y<g.height;y+=3)for(let x=0;x<g.width;x+=3){const ray=RelativityRenderer.trace(state,x+.5,y+.5,g.width,g.height),D=RelativityOptics.frequencyRatio(state,ray)||1,expected=RelativitySpectrum.sourceShift([.2,.4,.7],spectrumModel,6500,656.3,D),i=((g.height-1-y)*g.width+x)*4;
        if((ray.hit?RelativityWorlds.material[ray.hit.kind]:0)!==materials.pixels[i])continue;
        for(let k=0;k<3;k++){const d=Math.abs(expected[k]*255-g.pixels[i+k]);if(d>10&&bad.length<5)bad.push({x,y,D,k,cpu:expected[k]*255,gpu:g.pixels[i+k],kind:ray.hit?.kind});max=Math.max(max,d);sum+=d;total++;}}
      out.push({spectrumModel,scenario,beta,max,mean:sum/total,bad});
    }return out;
  });
  for(const r of audit){assert.ok(r.mean<1.7,JSON.stringify(r));assert.ok(r.max<18,JSON.stringify(r));}
  const before=await thumb(page);await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#spectrum-model').selectOption('blackbody');await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.ok(diff(before,await thumb(page))>20);assert.equal((await data(page)).spectrumModel,'blackbody');
  await setRange(page,'#spectrum-temperature',3000);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});assert.equal((await data(page)).temperature,'3000');
  await page.locator('#spectrum-model').selectOption('line');await page.locator('button[data-line="486.1"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).lineWavelength,'486.1');await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe!==undefined);assert.match(await page.locator('#spectrum-status').innerText(),/D =/);
});

test('adjustable light and frozen-versus-retarded shadow comparison agree on CPU and GPU', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:900,height:560}});await open(page);
  const audit=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='width:90px;height:60px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];let physicalDifference=0;
    for(const environment of RelativityWorlds.IDs)for(const shadowTiming of ['retarded','instant','split'])for(const beta of [-.72,.6])for(const softShadows of [false,true]){
      const state={environment,scenario:'flyby',shape:'artifact',beta,motionAngle:45,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:true,softShadows,doppler:true,shadowTiming,lightX:1.5,lightZ:-1,lightYaw:45,lightElevation:-15};
      const gpu=softShadows?r.debugSoftOptics(state):r.debugOptics(state);let n=0,bad=0;
      for(let y=0;y<gpu.height;y+=2)for(let x=0;x<gpu.width;x+=2){const ray=RelativityRenderer.trace(state,x+.5,y+.5,gpu.width,gpu.height),i=((gpu.height-1-y)*gpu.width+x)*4;
        if(softShadows){const info=RelativityOptics.softIllumination(state,ray),expected=info.sampleCount&&info.weightedDirect>0?1-info.weightedVisible/info.weightedDirect:0;if(Math.abs(gpu.pixels[i]/255-expected)>.08)bad++;}
        else if((gpu.pixels[i]>127)!==RelativityOptics.illumination(state,ray).shadowed)bad++;n++;
        if(shadowTiming==='split'){const ref=RelativityOptics.illumination({...state,shadowTiming:'retarded'},{...ray,shadowInstant:false}),instant=RelativityOptics.illumination({...state,shadowTiming:'instant'},{...ray,shadowInstant:true});if(ref.shadowed!==instant.shadowed)physicalDifference++;}
      }out.push({environment,shadowTiming,beta,softShadows,n,bad});
    }return {out,physicalDifference};
  });
  assert.equal(audit.out.length,worldCount*12);for(const r of audit.out)assert.ok(r.bad/r.n<.02,JSON.stringify(r));assert.ok(audit.physicalDifference>10,JSON.stringify(audit));
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await setRange(page,'#light-x',2);await page.locator('button[data-shadow-timing="split"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).shadowTiming,'split');assert.equal((await data(page)).view,'photo');assert.equal(await page.locator('#split-left-label').innerText(),'传播延迟');
  await page.locator('button[data-environment="mountain"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});await setRange(page,'#light-yaw',90);assert.equal((await data(page)).lightYaw,'90');
});

test('finite shutter averages four independently ray-traced events in reconstructed linear intensity', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:500}});await open(page);
  const audit=await page.evaluate(async()=>{
    const R=RelativityRenderer,M=RelativityModel,S=RelativitySpectrum,view={width:120,height:80,dpr:1},out=[];
    const linearAverage=(frames,i,k)=>255*S.radianceToDisplay([frames.reduce((sum,a)=>sum+S.displayToRadiance([a[i+k]/255])[0]/frames.length,0)])[0];
    // Individual RGBA8 samples have already lost up to half a display code.
    // Inverting a near-white byte can amplify that loss; compare the float
    // shutter accumulation against the full interval allowed by quantization.
    const linearBounds=(frames,i,k)=>{
      const invert=s=>{const l=S.srgbToLinear(Math.max(0,Math.min(1,s)));return l>=1?Infinity:l/(1-l);};
      let lo=0,hi=0;for(const frame of frames){const byte=frame[i+k];lo+=invert((byte-.5)/255)/frames.length;hi+=invert((byte+.5)/255)/frames.length;}
      const display=v=>Number.isFinite(v)?255*S.radianceToDisplay([v])[0]:255;
      return [Math.max(0,display(lo)-.5),Math.min(255,display(hi)+.5)];
    };
    const glc=document.createElement('canvas');glc.style='width:120px;height:80px';document.body.append(glc);let gpuDone,gpuCount=0;const gpuLoaded=new Promise(resolve=>gpuDone=resolve),gpu=R.create(glc,{onAsset:()=>{if(++gpuCount===9)gpuDone();}}),gl=glc.getContext('webgl');
    const cc=document.createElement('canvas');let done;const loaded=new Promise(resolve=>done=resolve);let count=0;const cpu=R.createOffscreenCanvas(cc,()=>{if(++count===9)done();});await Promise.all([loaded,gpuLoaded]);
    for(const scenario of ['flyby','observer']){
      const state={environment:'station',scenario,shape:'artifact',beta:.86,motionAngle:25,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:false,doppler:false,shutter:1.6,renderBudget:9600};
      const times=M.shutterTimes(state.time,state.shutter),gp=[],cp=[];
      const grabGL=()=>{const p=new Uint8Array(glc.width*glc.height*4);gl.readPixels(0,0,glc.width,glc.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
      for(const time of times){gpu.render({...state,time,shutter:0},false,view);gp.push(grabGL());cpu.render({...state,time,shutter:0},false,view);cp.push(cc.getContext('2d').getImageData(0,0,cc.width,cc.height).data);}
      const job=gpu.beginTiles(state,view,37);while(!job.step()){}const g=grabGL();gpu.render(state,false,view);const direct=grabGL();cpu.render(state,false,view);const c=cc.getContext('2d').getImageData(0,0,cc.width,cc.height).data;
      let gpuMax=0,gpuMean=0,gpuOutliers=0,cpuMax=0,cpuBoundError=0,directMax=0,directMean=0,directOutliers=0,changed=0,n=0;for(let i=0;i<g.length;i+=4)for(let k=0;k<3;k++){
        const ga=linearAverage(gp,i,k),ca=linearAverage(cp,i,k),[lo,hi]=linearBounds(cp,i,k),err=Math.abs(g[i+k]-ga),directErr=Math.abs(g[i+k]-direct[i+k]);gpuMax=Math.max(gpuMax,err);if(err>5)gpuOutliers++;cpuMax=Math.max(cpuMax,Math.abs(c[i+k]-ca));cpuBoundError=Math.max(cpuBoundError,lo-c[i+k],c[i+k]-hi);directMax=Math.max(directMax,directErr);directMean+=directErr;if(directErr>5)directOutliers++;gpuMean+=err;if(Math.abs(ga-gp[0][i+k])>4)changed++;n++;}
      out.push({scenario,samples:job.samples,gpuMax,gpuMean:gpuMean/n,gpuOutlierRate:gpuOutliers/n,cpuMax,cpuBoundError,directMax,directMean:directMean/n,directOutlierRate:directOutliers/n,changed});
      if(scenario==='flyby'){
        const frames=[];for(const time of times)for(const jitter of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]){gpu.render({...state,time,shutter:0,sampleJitter:jitter},false,view);frames.push(grabGL());}
        const combined=gpu.beginTiles(state,view,37,{samples:4});while(!combined.step()){}const pixels=grabGL();gpu.render({...state,antialias:true},false,view);const direct=grabGL();let err=0,max=0,directMax=0,directMean=0,directOutliers=0,count=0;
        for(let i=0;i<pixels.length;i+=4)for(let k=0;k<3;k++){const expected=linearAverage(frames,i,k),d=Math.abs(expected-pixels[i+k]),directErr=Math.abs(direct[i+k]-pixels[i+k]);err+=d;max=Math.max(max,d);directMax=Math.max(directMax,directErr);directMean+=directErr;if(directErr>8)directOutliers++;count++;}
        out.push({scenario:'combined',samples:combined.samples,gpuMax:max,gpuMean:err/count,directMax,directMean:directMean/count,directOutlierRate:directOutliers/count});
      }
    }return out;
  });
  t.diagnostic('shutter comparison '+JSON.stringify(audit));
  for(const r of audit){assert.ok(r.directMax<=16&&r.directMean<1.5&&r.directOutlierRate<.002,`direct and tiled render must agree within rasterisation tolerance: ${JSON.stringify(r)}`);if(r.scenario==='combined'){assert.equal(r.samples,16);assert.ok(r.gpuMax<=16,JSON.stringify(r));assert.ok(r.gpuMean<3,JSON.stringify(r));continue;}assert.equal(r.samples,4);assert.ok(r.gpuMax<=10,JSON.stringify(r));assert.ok(r.gpuMean<1.2,JSON.stringify(r));assert.ok(r.gpuOutlierRate<.002,JSON.stringify(r));assert.ok(r.cpuBoundError<.01,JSON.stringify(r));assert.ok(r.changed>100,JSON.stringify(r));}
  await page.locator('#toggle-controls').click();await setRange(page,'#shutter',1.6);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).shutter,'1.6');assert.match(await page.locator('#render-detail').innerText(),/4 个快门时刻/);
  await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe!==undefined);assert.match(await page.locator('#probe-summary').innerText(),/快门中心/);
});

test('an obsolete 16-sample shutter frame is never shown after parameters change', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:320,height:200}});await page.addInitScript(()=>{
    const Original=window.Worker;window.__holdCancel=false;window.__holdNext=false;window.__sent=[];window.__received=[];
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{
      if(m.type==='cancel'&&window.__holdCancel)return;
      if(m.type==='render'){window.__sent.push({revision:m.revision,environment:m.state.environment,shutter:m.state.shutter,antialias:m.state.antialias});if(window.__holdNext){window.__heldRender=true;window.__releaseRender=()=>post(m,...rest);return;}}
      return post(m,...rest);
    };w.addEventListener('message',e=>{if(e.data.type==='frame'||e.data.type==='preview'||e.data.type==='progress')window.__received.push({type:e.data.type,revision:e.data.revision,samples:e.data.samples});});return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.qualityPending==='false',null,{timeout:90000});
  await page.evaluate(()=>{document.querySelector('#toggle-antialias').click();const s=document.querySelector('#shutter');s.value='1.6';s.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.__received.some(e=>e.type==='progress'&&e.samples===16),null,{timeout:90000});
  const oldRevision=await page.evaluate(()=>window.__sent.filter(e=>e.shutter===1.6&&e.antialias).at(-1).revision),before=await thumb(page);
  await page.evaluate(()=>{window.__holdCancel=true;window.__holdNext=true;const s=document.querySelector('#shutter');s.value='0';s.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#toggle-antialias').click();document.querySelector('button[data-environment="mountain"]').click();});
  assert.equal((await data(page)).renderPending,'true');assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'0');
  await page.waitForFunction(rev=>window.__received.some(e=>e.type==='frame'&&e.revision===rev),oldRevision,{timeout:90000});
  await page.waitForFunction(()=>window.__heldRender===true,null,{timeout:30000});assert.equal(diff(before,await thumb(page)),0,'an obsolete completed 16-sample frame must not replace the accepted image');
  await page.evaluate(()=>{window.__holdCancel=false;window.__holdNext=false;window.__releaseRender();});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment==='mountain'&&d.renderPending==='false';},null,{timeout:60000});
  const d=await data(page);assert.equal(d.shutter,'0.0');assert.equal(d.antialias,'false');assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'1');
});

test('guided experiments and offline JSON snapshots preserve real parameters and A/B results', {timeout:240000},async t=>{
  const page=await newPage(t,{viewport:{width:1000,height:620}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.locator('#toggle-controls').click();await page.locator('#experiment-guide summary').click();await page.locator('button[data-experiment="terrell"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.view==='photo'&&d.contour==='true'&&d.shape==='cube'&&d.renderPending==='false';},null,{timeout:60000});assert.match(await page.locator('#guide-observe').innerText(),/发射时刻/);
  await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe!==undefined);
  if(await page.locator('#pin-ray').isDisabled()){
    await page.locator('button[data-view="photo"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});await page.locator('#probe-center').click();
  }
  assert.equal(await page.locator('#pin-ray').isDisabled(),false);await page.locator('#pin-ray').click();await page.locator('#relativity-scene').focus();await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.reference!==undefined);
  await page.locator('#toggle-controls').click();await page.locator('#save-local').click();assert.match(await page.locator('#snapshot-status').innerText(),/已保存/);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('relativity-observation-v1')));assert.equal(saved.parameters.beta,.86);assert.ok(saved.measurements.current);assert.ok(saved.measurements.reference);assert.ok(Number.isFinite(saved.measurements.reference.emissionTime));
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-snapshot').click();const download=await downloadPromise;const content=JSON.parse(require('node:fs').readFileSync(await download.path(),'utf8'));assert.equal(content.format,'relativity-observation');assert.deepEqual(content.measurements,saved.measurements);
  await page.locator('button[data-experiment="shadow"]').click();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.environment==='mountain'&&d.shadowTiming==='split'&&d.renderPending==='false';},null,{timeout:60000});
  const visibleShadowChanges=await page.evaluate(()=>{const s=RelativityExperiments.recipe('shadow'),trace=RelativityRenderer.prepareTrace(s,120,75);let changed=0;for(let y=12;y<50;y+=2)for(let x=0;x<120;x+=2){const ray=trace(x+.5,y+.5);if(!ray.hit||ray.hit.body)continue;const a=RelativityOptics.illumination(s,{...ray,shadowInstant:false}),b=RelativityOptics.illumination(s,{...ray,shadowInstant:true});if(a.shadowed!==b.shadowed)changed++;}return changed;});assert.ok(visibleShadowChanges>20,`shadow comparison must differ above the bottom dock: ${visibleShadowChanges}`);
  await page.locator('button[data-experiment="spectrum"]').click();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.spectrumModel==='line'&&d.renderPending==='false';},null,{timeout:60000});assert.equal((await data(page)).lineWavelength,'656.3');
  await page.locator('#restore-local').click();await page.waitForFunction(()=>document.querySelector('#snapshot-status').textContent.includes('重新计算'),null,{timeout:60000});assert.equal((await data(page)).beta,'0.86');assert.ok((await data(page)).reference);
  await page.locator('button[data-experiment="aberration"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.scenario==='observer');
  await page.locator('#snapshot-file').setInputFiles({name:'observation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(content))});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.scenario==='flyby'&&document.querySelector('#snapshot-status').textContent.includes('重新计算'),null,{timeout:60000});assert.equal((await data(page)).scenario,'flyby');
  await page.locator('#snapshot-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"unexpected"}')});await page.waitForFunction(()=>document.querySelector('#snapshot-status').textContent.includes('不支持'));assert.match(await page.locator('#snapshot-status').innerText(),/不支持/);assert.equal((await data(page)).scenario,'flyby');assert.deepEqual(errors,[]);
});

test('all switchable worlds preserve the event and have visibly different ray-traced geometry', {timeout:240000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await assetsReady(page);
  assert.equal(await page.locator('button[data-environment]').count(),worldCount);
  await page.locator('#toggle-controls').click();await setRange(page,'#beta',.6);await page.locator('button[data-shape="sphere"]').click();await setRange(page,'#event-time',-1.25);await page.locator('button[data-view="split"]').click();await setRange(page,'#split-position',62);await page.locator('#toggle-controls').click();
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);assert.ok((await data(page)).probe);await page.locator('#toggle-knowledge').click();
  const before=await data(page),images=[];
  for(const env of ['station','street','corridor','mountain','harbor']){
    if(env==='station')images.push(await thumb(page));
    else {await paintAfter(page,()=>page.locator(`button[data-environment="${env}"]`).click());images.push(await thumb(page));}
    const d=await data(page);assert.equal(d.environment,env);assert.equal(await page.locator(`button[data-environment="${env}"]`).getAttribute('aria-pressed'),'true');
    if(!noWebGL&&!safeWorker){const n=Number(await page.locator('#relativity-scene').getAttribute('data-shader-programs'));assert.equal(n,1,'all worlds use the same data-driven program');}
    for(const key of ['beta','time','shape','scenario','view','split','yaw','pitch','fov'])assert.equal(d[key],before[key],`${env}: ${key}`);
    if(env!=='station'){assert.equal(d.probe,undefined);assert.equal(await page.locator('#probe-marker').isHidden(),true);}
  }
  for(let i=0;i<images.length;i++)for(let j=i+1;j<images.length;j++)assert.ok(diff(images[i],images[j])>500,`world images ${i} ${j} should differ`);
  await page.locator('#toggle-controls').click();await page.locator('button[data-scenario="observer"]').click();await setRange(page,'#event-time',2);await page.locator('#toggle-controls').click();
  const observer=await data(page);await paintAfter(page,()=>page.locator('button[data-environment="street"]').click());const after=await data(page);
  for(const key of ['scenario','beta','time','view','shape'])assert.equal(after[key],observer[key],`observer ${key}`);assert.equal(after.environment,'street');if(!noWebGL&&!safeWorker)assert.equal(await page.locator('#relativity-scene').getAttribute('data-shader-programs'),'1','returning to a world reuses the shared program');
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#relativity-stage').dataset.time)>2.05,null,{timeout:30000});
  await page.locator('button[data-environment="mountain"]').click();const playing=await data(page);assert.equal(playing.environment,'mountain');assert.equal(playing.playing,'true');assert.ok(Number(playing.time)>2);
  await page.locator('#play').click();assert.equal((await data(page)).playing,'false');assert.deepEqual(errors,[]);
});

test('zero speed makes photographs and simultaneous views coincide; finite speed and split use the correct rays', {timeout:90000,skip:noWebGL},async t=>{
  const page=await newPage(t);await open(page);
  const result=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-250px;top:0;width:120px;height:90px';document.body.append(c);const r=RelativityRenderer.create(c);
    const compare=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i])n++;return n;};
    const results=[];for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const shape of ['cube','sphere']){
      const s={environment,scenario,shape,beta:0,view:'photo',time:0,split:.43,yaw:0,pitch:-.025,fov:58};let a=r.debugMaterials(s);s.view='geometry';let b=r.debugMaterials(s);const atZero=compare(a.pixels,b.pixels);
      s.beta=.86;s.view='photo';a=r.debugMaterials(s);s.view='geometry';b=r.debugMaterials(s);const atSpeed=compare(a.pixels,b.pixels);s.view='split';const mixed=r.debugMaterials(s);let wrong=0;
      for(let y=0;y<mixed.height;y++)for(let x=0;x<mixed.width;x++){const i=(y*mixed.width+x)*4,photo=scenario==='flyby'?(x+.5)/mixed.width<s.split:(x+.5)/mixed.width>=s.split;if(mixed.pixels[i] !== (photo?a.pixels[i]:b.pixels[i]))wrong++;}
      results.push({environment,scenario,shape,atZero,atSpeed,wrong});
    }return results;
  });
  for(const r of result){assert.equal(r.atZero,0,JSON.stringify(r));assert.ok(r.atSpeed>100,JSON.stringify(r));assert.equal(r.wrong,0,JSON.stringify(r));}
});

test('speed, shape, time and comparison controls alter the actual rendered image', {timeout:120000},async t=>{
  const page=await newPage(t,{deviceScaleFactor:.25}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await assetsReady(page);
  // Preview and HD have identical pixel dimensions at this device scale, so
  // quality refinement cannot masquerade as a change in the physical image.
  if(!noWebGL&&!safeWorker)assert.deepEqual(await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height})),{w:360,h:225});
  let first=await thumb(page);await page.locator('#toggle-controls').click();
  await paintAfter(page,()=>setRange(page,'#beta',0));let still=await thumb(page);assert.ok(diff(first,still)>250,'velocity must change pixels');assert.equal((await data(page)).gamma,'1.000000');
  await paintAfter(page,()=>page.locator('button[data-view="geometry"]').click());
  // At zero velocity all surfaces coincide, but an actual clock face can
  // show earlier hands in the light-cone photograph than in the t=0 slice.
  assert.ok(diff(still,await thumb(page))<20,'only the small clock face may differ at zero speed');
  const mismatches=await page.evaluate(()=>{const R=RelativityRenderer,s={...RelativityExperiments.BASE,beta:0,view:'photo'},bad=[];for(let y=1;y<75;y+=3)for(let x=1;x<120;x+=3){s.view='photo';const a=R.trace(s,x,y,120,75);s.view='geometry';const b=R.trace(s,x,y,120,75);if((a.hit?.kind||'sky')!==(b.hit?.kind||'sky')||Math.abs((a.hit?.distance||0)-(b.hit?.distance||0))>1e-8)bad.push([x,y]);}return bad;});assert.deepEqual(mismatches,[],'all zero-speed ray intersections must coincide');
  await paintAfter(page,()=>page.locator('button[data-view="photo"]').click());
  await paintAfter(page,()=>page.locator('button[data-shape="sphere"]').click());let sphere=await thumb(page);assert.ok(diff(still,sphere)>200,'shape must change pixels');assert.equal((await data(page)).shape,'sphere');
  await paintAfter(page,()=>page.locator('button[data-beta="0.86"]').click());await paintAfter(page,()=>page.locator('#compare-example').click());let d=await data(page);assert.equal(d.view,'split');assert.equal(d.time,'-2.000');assert.equal(d.beta,'0.86');assert.equal(await page.locator('#split-left-label').textContent(),'光锥照片');assert.equal(await page.locator('#split-right-label').textContent(),'同时几何');
  await paintAfter(page,()=>setRange(page,'#split-position',65));assert.equal((await data(page)).split,'0.650');const time=(await data(page)).time;await paintAfter(page,()=>page.locator('button[data-view="photo"]').click());assert.equal((await data(page)).time,time,'changing view must not silently change the event');
  await setRange(page,'#event-time',-1);assert.equal((await data(page)).time,'-1.000');await page.locator('#reset').click();assert.equal((await data(page)).time,'0.000');
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#relativity-stage').dataset.time)>.12,null,{timeout:30000});await page.locator('#play').click();d=await data(page);assert.equal(d.playing,'false');assert.ok(Number(d.time)>.12);assert.deepEqual(errors,[]);
});

test('clicked light ray uses the selected observation event and opens the real probe', {timeout:90000},async t=>{
  const page=await newPage(t);await open(page);await selectStandardCube(page);const expected=await page.evaluate(()=>{
    const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={scenario:'flyby',shape:'cube',beta:.60,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58};return RelativityRenderer.trace(s,c.width/2,c.height/2,c.width,c.height);
  });assert.equal(expected.hit.kind,'cube');
  await page.mouse.click(720,450);await page.waitForFunction(distance=>{const d=document.querySelector('#relativity-stage').dataset;return d.probe==='cube'&&Math.abs(Number(d.probeDistance)-distance)<1e-5;},expected.hit.distance,{timeout:60000});const d=await data(page);assert.equal(d.probe,'cube');assert.equal(d.probePhoto,'true');assert.ok(Math.abs(Number(d.probeDistance)-expected.hit.distance)<1e-5);await page.locator('#knowledge-panel').waitFor({state:'visible'});await page.locator('#probe-data').waitFor({state:'visible'});assert.equal(await page.locator('#probe-time').textContent(),expected.hit.emittedAt.toFixed(2));assert.match(await page.locator('#probe-summary').textContent(),/方块表面/);
  assert.equal(await page.locator('#probe-marker').isVisible(),true);await page.locator('button[data-view="geometry"]').click();assert.equal(await page.locator('#probe-marker').isHidden(),true);assert.equal((await data(page)).probe,undefined);
  await page.locator('#toggle-knowledge').click();await page.locator('#toggle-controls').click();await setRange(page,'#beta',.6);await setRange(page,'#event-time',-3);await page.locator('#toggle-controls').click();
  const x=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={scenario:'flyby',shape:'cube',beta:.6,time:-3,view:'geometry',split:.5,yaw:0,pitch:-.025,fov:58};for(let x=500;x<1080;x+=5)if(RelativityRenderer.trace(s,x,c.height/2,c.width,c.height).hit?.kind==='cube')return x;return null;});assert.ok(x!==null);await page.mouse.click(x,450);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probePhoto==='false');
  assert.equal((await data(page)).probePhoto,'false');await page.locator('#probe-data').waitFor({state:'visible'});assert.equal(await page.locator('#probe-time').textContent(),'—');assert.match(await page.locator('#probe-summary').textContent(),/不对应一次实际拍照/);
});

test('new environmental details can be picked as finite ray hits in each scene', {timeout:240000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await selectStandardCube(page);await assetsReady(page);
  for(const [environment,kind,label] of [['station','bin','站台垃圾桶'],['street','car-body','停放车辆'],['street','tree-deciduous','行道树冠'],['corridor','cabinet','设备柜'],['corridor','pipe','管线'],['mountain','tree-conifer','针叶树冠']]){
    if(await page.locator('#knowledge-panel').isVisible())await page.locator('#toggle-knowledge').click();
    if((await data(page)).environment!==environment)await paintAfter(page,()=>page.locator(`button[data-environment="${environment}"]`).click());
    const point=await page.evaluate(kind=>{
      const c=document.querySelector('#relativity-scene'),r=c.getBoundingClientRect(),s={environment:document.querySelector('#relativity-stage').dataset.environment,scenario:'flyby',shape:'cube',beta:.60,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58};
      for(let y=100;y<640;y+=5)for(let x=40;x<1400;x+=5){const ray=RelativityRenderer.trace(s,x,y,r.width,r.height);if(ray.hit?.kind===kind&&document.elementFromPoint(r.left+x,r.top+y)===c)return {x,y,distance:ray.hit.distance};}return null;
    },kind);
    assert.ok(point,`${environment}: ${kind} must be visible and clickable`);await page.mouse.click(point.x,point.y);await page.waitForFunction(({kind,distance})=>{const d=document.querySelector('#relativity-stage').dataset;return d.probe===kind&&Math.abs(Number(d.probeDistance)-distance)<1e-5;},{kind,distance:point.distance},{timeout:60000});const d=await data(page);
    assert.equal(d.probe,kind);assert.ok(Math.abs(Number(d.probeDistance)-point.distance)<1e-5);assert.match(await page.locator('#probe-summary').textContent(),new RegExp(label));
    assert.equal(await page.locator('#probe-time').textContent(),(-point.distance).toFixed(2));
  }
  assert.deepEqual(errors,[]);
});

test('Doppler, actual shadows and exposure change the rendered view; the probe reports physical factors', {timeout:180000},async t=>{
  const page=await newPage(t,{deviceScaleFactor:.25}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await selectStandardCube(page);
  await assetsReady(page);
  // Preview and HD have the same size: all pixel comparisons isolate physics.
  if(!noWebGL&&!safeWorker)assert.deepEqual(await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height})),{w:360,h:225});
  let d=await data(page);assert.equal(d.doppler,'true');assert.equal(d.shadows,'true');
  let before=await thumb(page);await paintAfter(page,()=>page.locator('#dock-doppler').click());assert.equal((await data(page)).doppler,'false');let off=await thumb(page);assert.ok(diff(before,off)>100,'spectral physics changes the image');
  await paintAfter(page,()=>page.locator('#dock-doppler').click());assert.equal((await data(page)).doppler,'true');assert.ok(diff(before,await thumb(page))<10,'spectral toggle is reversible');
  await page.mouse.click(720,450);d=await data(page);assert.equal(d.probe,'cube');
  const expected=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={environment:'station',scenario:'flyby',shape:'cube',beta:.60,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58,surfaceMode:'reflection'};const r=RelativityRenderer.trace(s,c.width/2,c.height/2,c.width,c.height);return {D:RelativityOptics.frequencyRatio(s,r),shadow:RelativityOptics.illumination(s,r)};});
  assert.ok(Math.abs(Number(d.probeDoppler)-expected.D)<1e-6);assert.ok(Math.abs(Number(d.probeWavelength)-550/expected.D)<.001);assert.equal(d.probeShadow,expected.shadow.status);
  await page.locator('#pin-ray').click();await page.locator('#toggle-knowledge').click();await page.locator('#toggle-controls').click();await setRange(page,'#wavelength',650);d=await data(page);assert.ok(Math.abs(Number(d.probeWavelength)-650/expected.D)<.001);assert.equal(d.reference,'cube','wavelength readout does not change the ray');
  await paintAfter(page,()=>setRange(page,'#exposure',2));assert.equal((await data(page)).exposure,'2.0');assert.equal((await data(page)).reference,'cube');
  await page.locator('#toggle-controls').click();await paintAfter(page,()=>page.locator('#dock-doppler').click());assert.equal(await page.locator('#exposure').isDisabled(),true);assert.equal((await data(page)).reference,'cube');
  await paintAfter(page,()=>page.locator('button[data-environment="mountain"]').click());await page.locator('#toggle-controls').click();await paintAfter(page,()=>setRange(page,'#beta',0));await page.locator('#toggle-controls').click();
  await paintAfter(page,()=>page.locator('#dock-doppler').click());await page.locator('#toggle-controls').click();await paintAfter(page,()=>setRange(page,'#exposure',0));await page.locator('#toggle-controls').click();
  const stillSpectral=await thumb(page);await paintAfter(page,()=>page.locator('#dock-doppler').click());const withShadow=await thumb(page);assert.ok(diff(stillSpectral,withShadow)<10,'D=1 must not change the image when toggling the spectrum');
  await paintAfter(page,()=>page.locator('#dock-shadows').click());const noShadow=await thumb(page);assert.ok(diff(withShadow,noShadow)>50,'computed shadow visibility must change actual pixels');assert.equal((await data(page)).shadows,'false');
  await paintAfter(page,()=>page.locator('#dock-shadows').click());assert.ok(diff(withShadow,await thumb(page))<10);
  await page.locator('#toggle-controls').click();await paintAfter(page,()=>setRange(page,'#beta',.6));await page.locator('#toggle-controls').click();await page.mouse.click(405,560);d=await data(page);
  assert.equal(d.probe,'floor');assert.equal(d.probeShadow,'shadow');assert.equal(d.probeBlocker,'cube');
  const block=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={environment:'mountain',scenario:'flyby',shape:'cube',beta:.6,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58},r=RelativityRenderer.trace(s,405,560,c.width,c.height);return RelativityOptics.illumination(s,r);});
  assert.ok(Math.abs(Number(d.probeBlockTime)-block.blockingTime)<1e-6);assert.equal(await page.locator('#probe-block-time').textContent(),block.blockingTime.toFixed(3));
  assert.deepEqual(errors,[]);
});

test('GPU shadow rays and Doppler ratios agree with independent CPU probes across four scenes', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t);await open(page);const result=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-120px;top:0;width:80px;height:60px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];
    function check(s){
      const {environment,scenario,beta,view,shape,time}=s,got=r.debugOptics(s);let mismatch=0,total=0,maxD=0,shadow=0;
      for(let y=0;y<got.height;y+=3)for(let x=0;x<got.width;x+=3){
        const ray=RelativityRenderer.trace(s,x+.5,y+.5,got.width,got.height),optics=RelativityOptics.illumination(s,ray),D=RelativityOptics.frequencyRatio(s,ray)||1,i=((got.height-1-y)*got.width+x)*4;
        const found=got.pixels[i]>127,gpuD=.1*Math.pow(100,(got.pixels[i+1]*256+got.pixels[i+2])/65535);maxD=Math.max(maxD,Math.abs(gpuD-D)/D);
        if(found)shadow++;if(found!==optics.shadowed)mismatch++;total++;
      }out.push({environment,scenario,beta,view,shape,time,mismatch,total,maxD,shadow});
    }
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const shape of ['cube','sphere'])for(const beta of [0,.6,-.72])for(const view of ['photo','geometry','split'])check({environment,scenario,shape,beta,view,time:0,split:.47,yaw:.1,pitch:-.025,fov:58,shadows:true,doppler:true,exposure:0});
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const time of [1,scenario==='flyby'?-2:6])check({environment,scenario,shape:'sphere',beta:.86,view:'photo',time,split:.47,yaw:-.15,pitch:.05,fov:58,shadows:true,doppler:true,exposure:0});
    return out;
  });
  const mismatch=result.reduce((n,r)=>n+r.mismatch,0),total=result.reduce((n,r)=>n+r.total,0),shadow=result.reduce((n,r)=>n+r.shadow,0);
  t.diagnostic(`${result.length} configurations; ${total} probes; ${mismatch} shadow boundary differences; ${shadow} shadowed`);
  assert.equal(result.length,worldCount*40);assert.ok(total>=worldCount*21500);assert.ok(shadow>6000);for(const r of result){assert.ok(r.mismatch/r.total<.005,JSON.stringify(r));assert.ok(r.maxD<.0002,JSON.stringify(r));}
});

test('four area-light shadow rays match CPU past-light-cone probes and yield real penumbrae', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t);await open(page);const result=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-120px;top:0;width:96px;height:72px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const shape of ['cube','sphere']){
      const s={environment,scenario,shape,beta:.6,view:'photo',time:0,split:.5,yaw:.08,pitch:-.08,fov:58,shadows:true,softShadows:true,doppler:true},got=r.debugSoftOptics(s);let total=0,mismatch=0,partial=0,max=0;
      for(let y=0;y<got.height;y+=2)for(let x=0;x<got.width;x+=2){
        const ray=RelativityRenderer.trace(s,x+.5,y+.5,got.width,got.height),q=RelativityOptics.softIllumination(s,ray),expected=q.sampleCount&&q.weightedDirect>0?1-q.weightedVisible/q.weightedDirect:0;
        const actual=got.pixels[((got.height-1-y)*got.width+x)*4]/255,error=Math.abs(expected-actual);
        if(error>.04)mismatch++;if(expected>.01&&expected<.99)partial++;max=Math.max(max,error);total++;
      }out.push({environment,scenario,shape,total,mismatch,partial,max});
    }return out;
  });
  const total=result.reduce((n,r)=>n+r.total,0),mismatch=result.reduce((n,r)=>n+r.mismatch,0),partial=result.reduce((n,r)=>n+r.partial,0);
  t.diagnostic(`${result.length} configurations, ${total} samples, ${mismatch} boundary differences, ${partial} partial shadow samples`);
  assert.equal(result.length,worldCount*4);assert.ok(partial>20,JSON.stringify(result));for(const r of result)assert.ok(r.mismatch/r.total<.01,JSON.stringify(r));
});

test('GPU spectral lookup reproduces the CPU CIE integration and fixed tone mapping', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t);await open(page);const result=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-120px;top:0;width:80px;height:60px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];
    for(const environment of ['station','mountain'])for(const scenario of ['flyby','observer'])for(const beta of [0,.6,-.72,.98,-.98])for(const gain of [1,.4]){
      const s={environment,scenario,beta,view:'photo',shape:'cube',time:0,split:.47,yaw:.1,pitch:-.025,fov:58,shadows:false,doppler:true,exposure:beta>0?-1:1,debugLightGain:gain},got=r.debugSpectrum(s);let max=0,error=0,total=0;
      for(let y=0;y<got.height;y+=3)for(let x=0;x<got.width;x+=3){const ray=RelativityRenderer.trace(s,x+.5,y+.5,got.width,got.height),D=RelativityOptics.frequencyRatio(s,ray)||1,cpu=RelativitySpectrum.shift([.2,.4,.7],D,s.exposure,gain),i=((got.height-1-y)*got.width+x)*4;for(let k=0;k<3;k++){const e=Math.abs(got.pixels[i+k]/255-cpu[k]);max=Math.max(max,e);error+=e;total++;}}
      out.push({environment,scenario,beta,gain,max,mean:error/total,total});
    }return out;
  });
  t.diagnostic(`${result.length} spectral configurations; max display-channel error ${Math.max(...result.map(r=>r.max)).toFixed(5)}`);assert.equal(result.length,40);
  for(const r of result){assert.ok(r.max<.03,JSON.stringify(r));assert.ok(r.mean<.006,JSON.stringify(r));}
});

test('two pinned rays compare emission events numerically and support the keyboard', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await selectStandardCube(page);if(axe)await page.addScriptTag({content:axe.source});
  await page.mouse.click(720,450);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe==='cube');assert.equal((await data(page)).probe,'cube');assert.equal(await page.locator('#pin-ray').isEnabled(),true);
  await page.locator('#pin-ray').click();let d=await data(page);assert.equal(d.reference,'cube');assert.equal(d.pairDelta,undefined);assert.equal(await page.locator('#reference-marker').isVisible(),true);assert.match(await page.locator('#pair-status').textContent(),/Shift/);
  const ref=Number(d.referenceDistance);await page.locator('#relativity-scene').focus();
  for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowLeft');for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,m=document.querySelector('#probe-marker');return !!d.pairDelta&&Math.abs(parseFloat(m.style.left)-30)<.01&&Math.abs(parseFloat(m.style.top)-57.5)<.01;},null,{timeout:60000});d=await data(page);assert.equal(d.reference,'cube');assert.ok(d.probe&&d.probe!=='cube'&&d.probe!=='sky');const secondKind=d.probe;assert.ok(Math.abs(Number(d.pairDelta)-(ref-Number(d.probeDistance)))<.000003);
  assert.equal(await page.locator('#pair-delta').textContent(),Number(d.pairDelta).toFixed(3));assert.match(await page.locator('#pair-status').textContent(),/同一事件抵达/);
  assert.equal(await page.locator('#probe-marker').evaluate(e=>e.classList.contains('is-paired')),true);await assertAxe(page,'two-ray comparison');
  await page.locator('#clear-reference').click();assert.equal((await data(page)).reference,undefined);assert.equal(await page.locator('#pair-data').isHidden(),true);
  await page.locator('#pin-ray').click();assert.equal((await data(page)).reference,secondKind);
  await paintAfter(page,()=>page.locator('button[data-environment="mountain"]').click());assert.equal((await data(page)).reference,undefined);assert.equal(await page.locator('#reference-marker').isHidden(),true);
  await page.mouse.click(720,150);assert.equal((await data(page)).probe,'sky');assert.equal(await page.locator('#pin-ray').isDisabled(),true);
  await paintAfter(page,()=>page.locator('button[data-environment="station"]').click());await page.locator('button[data-view="split"]').click();
  await page.mouse.click(500,540);await page.waitForFunction(()=>!document.querySelector('#pin-ray').disabled);assert.equal(await page.locator('#pin-ray').isEnabled(),true);await page.locator('#pin-ray').click();
  await page.mouse.click(900,540);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probePhoto==='false');d=await data(page);assert.notEqual(d.probe,'sky');assert.equal(d.probePhoto,'false');assert.equal(d.pairDelta,undefined);
  assert.equal(await page.locator('#pin-ray').isDisabled(),true);assert.equal(await page.locator('#probe-time').textContent(),'—');assert.match(await page.locator('#probe-summary').textContent(),/不对应一次实际拍照/);
  assert.deepEqual(errors,[]);
});

test('observer comparison uses physical aberration and signed Doppler factor, not a CSS warp', {timeout:90000},async t=>{
  const page=await newPage(t);await open(page);await selectStandardCube(page);await page.locator('#toggle-controls').click();await page.locator('button[data-scenario="observer"]').click();await page.locator('#toggle-controls').click();
  const point={x:1050,y:390};const expected=await page.evaluate(({x,y})=>{const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={scenario:'observer',shape:'cube',beta:.60,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58},r=RelativityRenderer.trace(s,x,y,c.width,c.height);return {ray:r,doppler:RelativityModel.stationarySourceDoppler(r.labDirection,[0,0,s.beta])};},point);
  await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);const d=await data(page);assert.equal(d.scenario,'observer');assert.equal(d.probe,expected.ray.hit?.kind||'sky');assert.ok(Math.abs(Number(d.probeLabAngle)-Math.acos(expected.ray.labDirection[2]))<1e-5);assert.ok(Math.abs(Number(d.probeObserverAngle)-Math.acos(expected.ray.direction[2]))<1e-5);assert.equal(await page.locator('#probe-time').textContent(),expected.doppler.toFixed(3));assert.match(await page.locator('#plot-caption').textContent(),/假设光谱/);
  await page.locator('#toggle-controls').click();await page.locator('#reverse-speed').click();assert.equal((await data(page)).beta,'-0.60');await page.locator('button[data-view="split"]').click();assert.equal(await page.locator('#split-left-label').textContent(),'静止观察者');assert.equal(await page.locator('#split-right-label').textContent(),'高速观察者');
});

test('responsive drawers, keyboard, touch, offline resources and WCAG checks', {timeout:300000},async t=>{
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
    const page=await newPage(t,{viewport,hasTouch:true}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base))external.push(r.url());});await open(page);
    if(axe)await page.addScriptTag({content:axe.source});await assertAxe(page,'initial '+JSON.stringify(viewport));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),viewport.width);const bounds=await page.locator('#play').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height,JSON.stringify(bounds));
    if(viewport.height>viewport.width){const scan=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene').getBoundingClientRect(),s={scenario:'flyby',shape:'cube',beta:.60,time:0,view:'photo',split:.5,yaw:0,pitch:-.025,fov:58},xs=[];for(let x=0;x<=100;x++){const r=RelativityRenderer.trace(s,c.width*x/100,c.height*.5,c.width,c.height);if(r.hit?.kind==='cube')xs.push(x);}return {xs,eff:RelativityRenderer.effectiveFov(s,c.width,c.height)};});assert.ok(scan.xs.length>10&&scan.xs[0]>0&&scan.xs.at(-1)<100,JSON.stringify(scan));assert.ok(scan.eff>58);}
    await page.locator('#toggle-controls').click();await assertAxe(page,'controls '+JSON.stringify(viewport));await setRange(page,'#beta',.6);assert.equal((await data(page)).beta,'0.60');
    await page.locator('button[data-view="split"]').click();await page.locator('button[data-environment="street"]').click();assert.equal((await data(page)).environment,'street');assert.equal((await data(page)).beta,'0.60');await assertAxe(page,'split '+JSON.stringify(viewport));await page.locator('#toggle-controls').click();
    await page.locator('#relativity-scene').focus();const before=await data(page);await page.keyboard.press('ArrowRight');await page.keyboard.press('+');const after=await data(page);assert.notEqual(after.yaw,before.yaw);assert.ok(Number(after.fov)<Number(before.fov));await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);assert.ok((await data(page)).probe);assert.equal(await page.locator('#knowledge-panel').isVisible(),true);await assertAxe(page,'knowledge '+JSON.stringify(viewport));
    // The open drawer must not cover the transport on a compact screen.
    await page.locator('#play').click();assert.equal((await data(page)).playing,'true');await page.locator('#play').click();await page.locator('#toggle-knowledge').click();
    const box=await page.locator('#relativity-scene').boundingBox(),cdp=await page.context().newCDPSession(page),x=box.x+box.width*.45,y=box.y+box.height*.48;
    const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});const yaw=(await data(page)).yaw;await touch('touchStart',x,y);for(let i=1;i<=5;i++)await touch('touchMove',x+i*8,y+i*2);await touch('touchEnd',x+40,y+10);assert.notEqual((await data(page)).yaw,yaw);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await page.close();
  }
});


test('direct file opening keeps sky and material textures origin-clean without a server', {timeout:150000},async t=>{
  const page=await newPage(t,{viewport:{width:800,height:600}}),errors=[],failed=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready');await page.waitForFunction(()=>document.querySelector('#relativity-scene').dataset.skyLoaded==='true');
  await page.waitForFunction(()=>['stone','crate','facade','asphalt','wall','mountains'].every(k=>document.querySelector('#relativity-scene').dataset[k+'Loaded']==='true'),null,{timeout:60000});
  assert.ok(Number(await page.locator('#relativity-scene').getAttribute('data-render-slices'))>10,'file:// fallback must yield instead of blocking the UI for a whole frame');
  for(const env of ['street','corridor','mountain']){await page.locator(`button[data-environment="${env}"]`).click();assert.equal((await data(page)).environment,env);await thumb(page);}
  await page.locator('#toggle-controls').click();await setRange(page,'#beta',.6);assert.equal((await data(page)).beta,'0.60');await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:60000});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
});

test('new guided optics, shutter and observation exports work from file without network', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1200,height:750}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!/^(file:|data:|blob:)/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.renderPending==='false';},null,{timeout:60000});
  await page.locator('#toggle-controls').click();await page.locator('#experiment-guide summary').click();
  for(const [name,property,value] of [['terrell','contour','true'],['shadow','shadowTiming','split'],['spectrum','spectrumModel','line'],['shutter','shutter','1.6']]){
    await page.locator(`button[data-experiment="${name}"]`).click();await page.waitForFunction(({property,value})=>{const d=document.querySelector('#relativity-stage').dataset;return d[property]===value&&d.renderPending==='false';},{property,value},{timeout:60000});
  }
  assert.equal((await data(page)).renderer,'canvas');await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:30000});
  if(await page.locator('#control-panel').isHidden())await page.locator('#toggle-controls').click();
  await page.locator('#save-local').click();assert.match(await page.locator('#snapshot-status').textContent(),/已保存/);
  const event=page.waitForEvent('download');await page.locator('#export-snapshot').click();const download=await event,report=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(report.parameters.shutter,1.6);assert.ok(report.measurements.current);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('direct file opening explains when high-quality worker WebGL cannot start', {timeout:120000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.renderPending==='false';},null,{timeout:60000});
  await page.locator('#toggle-controls').click();await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderMode==='safe'&&d.renderer==='canvas'&&d.renderPending==='false';},null,{timeout:60000});
  assert.match(await page.locator('#render-fallback').textContent(),/无法启动后台 WebGL.*Canvas/);assert.equal(await page.locator('#render-fallback').isVisible(),true);
  assert.equal(await page.locator('button[data-render-mode="safe"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#render-detail').textContent(),/Canvas.*(预览|静止画面)/);assert.deepEqual(errors,[]);
});

test('a shared WebGL setup failure falls back to the safe renderer', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8'),needle='renderer=factory(canvas,';
  const failing=original.replace(needle,"if(msg.forceWebGL)throw new Error('simulated shader compilation failure');\n      "+needle);assert.notEqual(failing,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:failing}));
  await open(page);await assetsReady(page);let d=await data(page);
  assert.equal(d.renderMode,'safe');assert.equal(d.renderer,'canvas');assert.equal(d.worker,'true');assert.equal(await page.locator('#render-fallback').isVisible(),true);
  await paintAfter(page,()=>page.locator('button[data-environment="street"]').click());d=await data(page);
  assert.equal(d.drawnEnvironment,'street');assert.equal(d.beta,'0.60');assert.equal(await page.locator('#relativity-scene').count(),1);assert.deepEqual(errors,[]);
});

test('losing WebGL replaces the canvas and preserves interactive physics', {timeout:90000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true});await page.addInitScript(()=>{window.__RELATIVITY_DISABLE_WORKER__=true;window.__RELATIVITY_FORCE_SYNC_WEBGL__=true;});await open(page);const supported=await page.evaluate(()=>{const gl=document.querySelector('#relativity-scene').getContext('webgl'),ext=gl&&gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});if(!supported){t.skip('WEBGL_lose_context is not supported');return;}
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderer==='canvas',null,{timeout:30000});assert.equal(await page.locator('#render-fallback').isVisible(),true);assert.equal(await page.locator('#relativity-scene').count(),1);
  await page.locator('#toggle-controls').click();await setRange(page,'#beta',-.6);assert.equal((await data(page)).beta,'-0.60');await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:60000});
});

test('default rendering avoids WebGL and leaves an idle scene asleep', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  // Fail loudly if the default path even asks for a WebGL context in Worker.
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const guarded=original.replace('self.window=self;',"self.window=self;const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...a){if(/webgl/i.test(kind))throw new Error('unexpected WebGL');return get.call(this,kind,...a);};");
  assert.notEqual(guarded,original);await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:guarded}));
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__workerEvents=[];
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{window.__workerEvents.push({type:m.type,environment:m.state?.environment});return post(m,...rest);};w.addEventListener('message',e=>window.__workerEvents.push({type:'reply:'+e.data.type}));return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);let d=await data(page);assert.equal(d.worker,'true');assert.equal(d.renderer,'canvas');assert.equal(d.renderMode,'safe');
  assert.equal(await page.locator('#render-fallback').isHidden(),true);
  const dims=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.ok(d.quality==='final'?dims.w*dims.h>195000:dims.w*dims.h>49000&&dims.w*dims.h<51000,JSON.stringify({d,dims}));
  assert.equal(requests.some(url=>url.includes('/assets/relativity-textures.js')),false,'HTTP should not parse the embedded multi-megabyte fallback');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
  assert.ok(Number(await page.locator('#relativity-scene').getAttribute('data-render-slices'))>10,'CPU work must be split into many interruptible slices');
  const fine=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.ok(fine.w*fine.h>195000&&fine.w*fine.h<205000,JSON.stringify(fine));
  // A completed still builds exactly one cancellable wide-view cache for
  // camera interaction. Eligible devices also initialize one optional helper
  // after that cache; wait for its one-time ready/fallback notification before
  // asserting that the paused scene has no further work or messages.
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:90000});
  const helperEligible=await page.evaluate(()=>!window.__RELATIVITY_DISABLE_PARALLEL__&&(window.__RELATIVITY_TEST_PARALLEL__===true||((navigator.hardwareConcurrency||0)>=2&&(navigator.deviceMemory||0)>=4&&!navigator.connection?.saveData)));
  if(helperEligible)await page.waitForFunction(()=>window.__workerEvents.some(e=>e.type==='reply:lanes'),null,{timeout:90000});
  const before=await page.evaluate(()=>({frame:document.querySelector('#relativity-stage').dataset.frame,events:window.__workerEvents.length}));
  await page.waitForTimeout(3500);const after=await page.evaluate(n=>({frame:document.querySelector('#relativity-stage').dataset.frame,events:window.__workerEvents.slice(n)}),before.events);
  assert.equal(after.frame,before.frame,'a completed paused scene must not redraw');assert.deepEqual(after.events,[],'after its one camera cache, a paused scene must not keep rendering or compiling');
  await paintAfter(page,()=>page.locator('button[data-environment="street"]').click());d=await data(page);assert.equal(d.drawnEnvironment,'street');
  await page.mouse.click(720,450);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe==='cube',null,{timeout:60000});
  await page.setViewportSize({width:390,height:844});await assetsReady(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  if(axe){await page.addScriptTag({content:axe.source});await assertAxe(page,'default Canvas mobile');}assert.deepEqual(errors,[]);
});

test('changes during startup are coalesced into one fully textured first frame', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true});await page.addInitScript(()=>{
    const Original=window.Worker;window.__renders=[];window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{if(m.type==='render')window.__renders.push({env:m.state.environment,beta:m.state.beta});return post(m,...rest);};return w;};window.Worker.prototype=Original.prototype;
  });
  await page.route('**/assets/relativity/mountains.jpg*',async route=>{await new Promise(resolve=>setTimeout(resolve,2500));await route.continue();});
  await page.goto(base+'relativity.html',{waitUntil:'load'});
  assert.equal((await data(page)).status,'loading');assert.equal(await page.locator('#scene-loading').isVisible(),true);
  for(const selector of ['.scene-wash','.scene-title','.scene-meta','.scene-note','.stage-hint'])
    assert.equal(await page.locator(selector).evaluate(e=>getComputedStyle(e).display),'none',`${selector} behind loading veil`);
  const targetable=await page.evaluate(()=>{const c=document.querySelector('#relativity-scene'),r=c.getBoundingClientRect();
    if(!(r.width>0&&r.height>0))return false;for(let y=80;y<innerHeight;y+=30)for(let x=80;x<innerWidth;x+=30)if(document.elementFromPoint(x,y)===c)return true;return false;});
  assert.equal(targetable,true,'loading canvas keeps its viewport and remains hit-testable');
  await page.evaluate(()=>{
    document.querySelector('button[data-environment="street"]').click();document.querySelector('button[data-environment="mountain"]').click();
    const beta=document.querySelector('#beta');beta.value='0.86';beta.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');assert.equal((await data(page)).probe,undefined);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.drawnEnvironment==='mountain'&&d.renderPending==='false'&&d.probe;},null,{timeout:60000});
  assert.notEqual(await page.locator('.scene-wash').evaluate(e=>getComputedStyle(e).display),'none');
  assert.notEqual(await page.locator('.scene-title').evaluate(e=>getComputedStyle(e).display),'none');
  const renders=await page.evaluate(()=>window.__renders);assert.deepEqual(renders,[{env:'mountain',beta:.86}]);assert.ok(Number((await data(page)).frame)>=1,'one request may present a complete preview and later refinement');
});

test('cooperative Canvas cancels obsolete work and presents the latest scene', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__jobs=[];
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{window.__jobs.push({type:m.type,env:m.state?.environment});return post(m,...rest);};w.addEventListener('message',e=>window.__jobs.push({type:'reply:'+e.data.type,env:e.data.environment}));return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);
  await page.locator('button[data-environment="street"]').click();
  await page.waitForFunction(()=>window.__jobs.some(e=>e.type==='render'&&e.env==='street'));
  const started=Date.now();await page.evaluate(()=>{
    document.querySelector('button[data-environment="corridor"]').click();document.querySelector('button[data-environment="mountain"]').click();
    document.querySelector('#toggle-controls').click();
  });
  assert.equal(await page.locator('#control-panel').isVisible(),true);assert.ok(Date.now()-started<1500,'controls must remain responsive while a CPU frame is running');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment==='mountain'&&d.renderPending==='false';},null,{timeout:60000});
  const jobs=await page.evaluate(()=>window.__jobs),renders=jobs.filter(e=>e.type==='render').map(e=>e.env);
  assert.ok(jobs.some(e=>e.type==='cancel'));assert.ok(jobs.some(e=>e.type==='reply:aborted'));assert.equal(renders.at(-1),'mountain');assert.ok(!renders.includes('corridor'));
  assert.equal((await data(page)).environment,'mountain');assert.deepEqual(errors,[]);
});

test('camera dragging presents real complete views without a blank loading screen, then refines', {timeout:150000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await assetsReady(page);
  const initialFrame=Number((await data(page)).frame);await page.mouse.move(550,350);await page.mouse.down();
  for(let i=1;i<=18;i++){await page.mouse.move(550+i*7,350+i*2);await page.waitForTimeout(45);}
  const during=await data(page);assert.equal(during.interacting,'true');assert.ok(Number(during.frame)>initialFrame,'real camera frames should arrive during a continuous drag');assert.notEqual(during.drawnYaw,'0.00000');
  assert.equal(during.cameraPreview,'true');assert.equal(await viewVisible(page),true,'a drag keeps an approximate view visible');
  await page.mouse.up();assert.equal(await viewVisible(page),true,'releasing the camera must not blank the screen');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderPending==='false'&&d.drawnYaw===d.yaw;},null,{timeout:60000});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#relativity-scene');return d.quality==='final'&&d.qualityPending==='false'&&c.width*c.height>195000;},null,{timeout:90000});
  assert.deepEqual(errors,[]);
});

test('playback ending automatically presents a refined final-time frame', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true});await open(page);await assetsReady(page);await setRange(page,'#event-time',2.98);await page.locator('#play').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#relativity-scene');return d.playing==='false'&&d.renderPending==='false'&&d.quality==='final'&&d.qualityPending==='false'&&Math.abs(Number(d.drawnTime)-3)<.001&&c.width*c.height>195000;},null,{timeout:90000});
  assert.equal((await data(page)).time,'3.000');
});

test('WebGL high quality reports a preview and finishes at near-screen resolution in all worlds', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await assetsReady(page);const safe=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));
  await page.locator('#toggle-controls').click();await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  assert.equal(await page.locator('#scene-quality').isVisible(),true);assert.match(await page.locator('#render-detail').textContent(),/WebGL.*预览.*高清目标/);
  assert.ok(Number(await page.locator('#scene-quality').getAttribute('aria-valuenow'))>=5);
  const preview=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.ok(preview.w*preview.h<800*600/2);
  const images=[];for(const environment of ['station','street','corridor','mountain']){
    if(environment!=='station')await page.locator(`button[data-environment="${environment}"]`).click();
    await page.waitForFunction(env=>{const d=document.querySelector('#relativity-stage').dataset;return d.environment===env&&d.drawnEnvironment===env&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},environment,{timeout:90000});
    const pixels=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height,slices:Number(c.dataset.renderSlices)}));
    assert.ok(pixels.w>=790&&pixels.h>=590,`${environment}: ${JSON.stringify(pixels)}`);assert.ok(pixels.w*pixels.h>safe.w*safe.h*8);assert.ok(pixels.slices>1,'HD work should be divided into tiles');
    assert.match(await page.locator('#render-detail').textContent(),/WebGL.*800 × 600/);assert.equal(await page.locator('#scene-quality').isHidden(),true);
    images.push(await thumb(page));
  }
  for(let i=0;i<images.length;i++)for(let j=i+1;j<images.length;j++)assert.ok(diff(images[i],images[j])>500);
  assert.deepEqual(errors,[]);
});

test('an unidentified WebGL device is labeled and uses the conservative preview budget', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Simulate browsers that hide WEBGL_debug_renderer_info for privacy.
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const hidden=original.replace('self.window=self;',`self.window=self;{
    const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...a){
      const c=get.call(this,kind,...a);if(/webgl/i.test(kind)&&c){const extension=c.getExtension.bind(c);c.getExtension=name=>name==='WEBGL_debug_renderer_info'?null:extension(name);}return c;
    };
  }`);assert.notEqual(hidden,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:hidden}));
  await open(page);await assetsReady(page);await page.locator('#toggle-controls').click();await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  assert.match(await page.locator('#render-detail').textContent(),/图形设备未识别.*预览/);
  const preview=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));
  assert.ok(preview.w*preview.h>=99000&&preview.w*preview.h<=101000,JSON.stringify(preview));
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
  assert.match(await page.locator('#render-detail').textContent(),/图形设备未识别.*800 × 600/);assert.deepEqual(errors,[]);
});

test('mobile WebGL refines at capped device scale, reduces playback quality and pauses work while hidden', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await open(page);await assetsReady(page);
  await page.locator('#toggle-controls').tap();await page.locator('button[data-render-mode="webgl"]').tap();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  assert.equal(await page.locator('#scene-quality').isVisible(),true);assert.match(await page.locator('#render-detail').textContent(),/预览.*高清目标/);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:120000});
  const still=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));
  assert.equal(still.w,488);assert.equal(still.h,1055);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#toggle-controls').tap();await page.locator('#play').tap();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.playing==='true'&&d.quality==='dynamic'&&d.renderPending==='false';},null,{timeout:60000});
  const dynamic=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.ok(dynamic.w*dynamic.h<90000,JSON.stringify(dynamic));
  await page.locator('#play').tap();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(600);const frame=(await data(page)).frame;await page.waitForTimeout(1500);assert.equal((await data(page)).frame,frame);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:120000});
  assert.deepEqual(errors,[]);
});

test('WebGL camera dragging presents coarse motion and refines after release', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:600}});await open(page);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  await page.mouse.move(350,250);await page.mouse.down();await page.mouse.move(380,255);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='dynamic'&&d.renderPending==='false';},null,{timeout:60000});
  const drag=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.ok(drag.w*drag.h<90000,JSON.stringify(drag));
  assert.match(await page.locator('#render-detail').textContent(),/动态画面/);await page.mouse.up();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:120000});
  const still=await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height}));assert.deepEqual(still,{w:800,h:600});
});

test('tiled WebGL preserves the same rays, materials and shadows as a whole-frame draw', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{viewport:{width:800,height:600}});await open(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.qualityPending==='false',null,{timeout:90000});
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-500px;top:0;width:160px;height:100px';document.body.append(c);let count=0;
    window.__tileReference=RelativityRenderer.create(c,{onAsset(name,status){if(status==='error')reject(Error(name));else if(++count===9)resolve();}});
  }));
  const result=await page.evaluate(()=>{
    const r=window.__tileReference,gl=r.canvas.getContext('webgl'),view={width:160,height:100,dpr:1},out=[];
    for(const environment of RelativityWorlds.IDs)for(const variant of [0,1]){
      const state={environment,scenario:variant?'observer':'flyby',shape:variant?'sphere':'cube',beta:variant?-.72:.86,view:variant?'split':'photo',time:variant?2:0,split:.47,yaw:.12,pitch:-.025,fov:58,doppler:true,shadows:true,exposure:0,renderBudget:16000};
      r.render(state,false,view);gl.finish();const direct=new Uint8Array(160*100*4);gl.readPixels(0,0,160,100,gl.RGBA,gl.UNSIGNED_BYTE,direct);
      gl.clearColor(1,0,1,1);gl.clear(gl.COLOR_BUFFER_BIT);const job=r.beginTiles(state,view,37);while(!job.step()){};
      const tiled=new Uint8Array(direct.length);gl.readPixels(0,0,160,100,gl.RGBA,gl.UNSIGNED_BYTE,tiled);
      let different=0,max=0,total=0;for(let k=0;k<direct.length;k++){const d=Math.abs(direct[k]-tiled[k]);if(d)different++;max=Math.max(max,d);total+=d;}
      out.push({environment,variant,different,max,mean:total/direct.length,tiles:job.total});
    }return out;
  });
  t.diagnostic(JSON.stringify(result));for(const r of result){assert.ok(r.tiles>1);assert.ok(r.mean<.05,JSON.stringify(r));assert.ok(r.different<800,JSON.stringify(r));}
});

test('adaptive tiles cover the same image and four subpixel samples match independent full-frame draws', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:600}});await open(page);
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const c=document.createElement('canvas');c.style='position:fixed;left:-500px;top:0;width:160px;height:100px';document.body.append(c);let count=0;
    window.__aaReference=RelativityRenderer.create(c,{onAsset(name,status){if(status==='error')reject(Error(name));else if(++count===9)resolve();}});
  }));
  const result=await page.evaluate(()=>{
    const r=window.__aaReference,gl=r.canvas.getContext('webgl'),view={width:160,height:100,dpr:1};
    const state={environment:'station',scenario:'flyby',shape:'cube',beta:.60,motionElevation:20,surfaceMode:'reflection',view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,doppler:true,shadows:true,exposure:0,renderBudget:16000};
    const grab=()=>{const out=new Uint8Array(160*100*4);gl.readPixels(0,0,160,100,gl.RGBA,gl.UNSIGNED_BYTE,out);return out;};
    const samples=[];for(const jitter of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]]){r.render({...state,sampleJitter:jitter},false,view);samples.push(grab());}
    const job=r.beginTiles(state,view,37,{samples:4});let steps=0,previous=0;
    while(true){const done=job.step();steps++;job.setTileSize([16,25,39,52][steps%4]);if(job.progress()<previous)throw Error('progress went backwards');previous=job.progress();if(done)break;}
    const S=RelativitySpectrum,out=grab();let max=0,total=0,edge=0,outliers=0;for(let i=0;i<out.length;i+=4)for(let k=0;k<3;k++){
      const radiance=samples.reduce((sum,frame)=>sum+S.displayToRadiance([frame[i+k]/255])[0]/4,0),average=255*S.radianceToDisplay([radiance])[0],d=Math.abs(out[i+k]-average);max=Math.max(max,d);total+=d;if(d>5)outliers++;
      if(Math.abs(average-samples[0][i+k])>3)edge++;
    }
    return {max,mean:total/(160*100*3),outlierRate:outliers/(160*100*3),edge,steps,progress:job.progress()};
  });
  t.diagnostic(JSON.stringify(result));assert.ok(result.steps>60);assert.equal(result.progress,1);assert.ok(result.edge>30,'jitter must actually change edge pixels');
  // Independent RGBA8 reference frames lose precision; the actual AA tiles
  // average log-packed reconstructed linear intensity, not display RGB.
  assert.ok(result.max<=8&&result.mean<1&&result.outlierRate<.002,JSON.stringify(result));
});

test('four-sample antialiasing is opt-in, reports progress and presents a complete still', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:400,height:250}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await assetsReady(page);await page.locator('#toggle-controls').click();assert.equal(await page.locator('#toggle-antialias').isDisabled(),true);
  await page.locator('button[data-render-mode="webgl"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderer==='webgl',null,{timeout:60000});
  await page.locator('#toggle-antialias').click();assert.equal(await page.locator('#toggle-antialias').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.antialias==='true'&&d.qualityPending==='true'&&d.qualityPhase==='high'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  assert.match(await page.locator('#quality-phase').textContent(),/抗锯齿/);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:120000});
  assert.match(await page.locator('#render-detail').textContent(),/400 × 250.*4 次采样/);assert.deepEqual(errors,[]);
});

test('slow refinement presents a complete intermediate frame and monotonically reports total progress', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:600}});
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const needle='previewMs=performance.now()-task.start;';const slow=original.replace(needle,'previewMs=6000;');assert.notEqual(slow,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:slow}));
  await page.addInitScript(()=>{const W=window.Worker;window.__qualityEvents=[];window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(['preview','frame','progress'].includes(e.data.type))window.__qualityEvents.push(e.data)});return w};window.Worker.prototype=W.prototype;});
  await open(page);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:120000});
  const events=await page.evaluate(()=>window.__qualityEvents),frames=events.filter(x=>x.type==='preview'||x.type==='frame'),progress=events.filter(x=>x.type==='progress').map(x=>x.progress);
  assert.deepEqual(frames.map(x=>x.quality),['preview','intermediate',null]);assert.ok(frames[0].width<frames[1].width&&frames[1].width<frames[2].width);
  assert.equal(frames[2].width,800);assert.ok(progress.every((p,i)=>!i||p>=progress[i-1]),JSON.stringify(progress));assert.ok(progress.includes(0));
});

test('parallel shader extension is polled without querying compile status early', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:400,height:250}});
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const patched=original.replace('self.window=self;',`self.window=self;{
    const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){
      const gl=get.call(this,kind,...args);if(/webgl/i.test(kind)&&gl){let polls=0;const ext=gl.getExtension.bind(gl),gp=gl.getProgramParameter.bind(gl),gs=gl.getShaderParameter.bind(gl);
        gl.getExtension=name=>name==='KHR_parallel_shader_compile'?{COMPLETION_STATUS_KHR:0x91B1}:ext(name);
        gl.getProgramParameter=(p,k)=>k===0x91B1?(++polls>=3):gp(p,k);
        gl.getShaderParameter=(sh,k)=>{if(k===gl.COMPILE_STATUS&&polls<3)throw Error('compile queried before completion');return gs(sh,k);};
      }return gl;
    };
  }`);assert.notEqual(patched,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:patched}));
  await page.addInitScript(()=>{const W=window.Worker;window.__ready=[];window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data.type==='ready')window.__ready.push(e.data)});return w};window.Worker.prototype=W.prototype;});
  await open(page);await assetsReady(page);const ready=await page.evaluate(()=>window.__ready);assert.equal(ready.at(-1).parallelCompile,true);assert.equal((await data(page)).renderer,'webgl');
});

test('an obsolete high-resolution render cancels promptly and never replaces the latest scene', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:900,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const W=window.Worker;window.__hqEvents=[];window.Worker=function(...a){const w=new W(...a),post=w.postMessage.bind(w);w.postMessage=(m,...r)=>{if(m.type==='render'||m.type==='cancel')window.__hqEvents.push({type:m.type,env:m.state?.environment});return post(m,...r)};w.addEventListener('message',e=>{if(['frame','preview','aborted'].includes(e.data.type))window.__hqEvents.push({type:'reply:'+e.data.type,env:e.data.environment})});return w;};window.Worker.prototype=W.prototype;});
  await open(page);await page.waitForFunction(()=>Number(document.querySelector('#relativity-stage').dataset.qualityProgress)>=5,null,{timeout:60000});
  const start=Date.now();const pending=await page.locator('button[data-environment="street"]').evaluate(button=>{button.click();return document.querySelector('#render-detail').textContent;});assert.match(pending,/新画面生成中/);assert.doesNotMatch(pending,/高清目标/);await page.locator('#toggle-controls').click();assert.equal(await page.locator('#control-panel').isVisible(),true);assert.ok(Date.now()-start<1500,'controls should remain responsive during tiled rendering');
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.drawnEnvironment==='street',null,{timeout:60000});
  await page.evaluate(()=>{document.querySelector('button[data-environment="corridor"]').click();document.querySelector('button[data-environment="mountain"]').click();});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.environment==='mountain'&&d.drawnEnvironment==='mountain'&&d.quality==='final'&&d.renderPending==='false'&&d.qualityPending==='false';},null,{timeout:90000});
  const events=await page.evaluate(()=>window.__hqEvents);assert.ok(events.some(e=>e.type==='cancel'));assert.ok(events.some(e=>e.type==='reply:aborted'));assert.equal(events.filter(e=>e.type==='reply:frame').at(-1).env,'mountain');
  assert.equal(await page.locator('#relativity-scene').evaluate(c=>c.width),900);assert.deepEqual(errors,[]);
});

test('completed high-quality frame has no GPU backlog or idle redraws', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:600}});await open(page);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
  const browser=page.context().browser(),cdp=await browser.newBrowserCDPSession();
  await page.waitForTimeout(1000);const first=await cdp.send('SystemInfo.getProcessInfo'),frame=(await data(page)).frame;
  await page.waitForTimeout(3500);const last=await cdp.send('SystemInfo.getProcessInfo');assert.equal((await data(page)).frame,frame,'a finished still must not redraw');
  const a=first.processInfo.find(x=>x.type==='GPU'),b=last.processInfo.find(x=>x.type==='GPU'&&x.id===a?.id);
  if(a&&b){const seconds=b.cpuTime-a.cpuTime;t.diagnostic(`GPU process CPU in 3.5 seconds after HD: ${seconds.toFixed(2)} s`);assert.ok(seconds<1.25,`GPU still busy after claimed completion: ${seconds.toFixed(2)}s`);}
});

test('sampling a paused preview does not restart or discard the high-quality render', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:600}});await page.addInitScript(()=>{const W=window.Worker;window.__cancelCount=0;window.Worker=function(...args){const w=new W(...args),send=w.postMessage.bind(w);w.postMessage=(m,...r)=>{if(m.type==='cancel')window.__cancelCount++;return send(m,...r)};return w};window.Worker.prototype=W.prototype;});
  await open(page);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.qualityPending==='true'&&Number(d.qualityProgress)>=5;},null,{timeout:60000});
  const before=await page.evaluate(()=>window.__cancelCount);await page.mouse.click(400,300);await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:30000});
  assert.equal(await page.evaluate(()=>window.__cancelCount),before,'sampling a fixed event must not cancel its HD render');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
});

test('render mode choice is explicit, preserves physics, and returns to the safe path', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await open(page);await assetsReady(page);await page.locator('#toggle-controls').click();await setRange(page,'#beta',-.6);
  await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderMode==='webgl'&&d.renderer==='webgl'&&d.status==='ready'&&d.renderPending==='false';},null,{timeout:60000});
  let d=await data(page);assert.equal(d.beta,'-0.60');assert.equal(await page.locator('button[data-render-mode="webgl"]').getAttribute('aria-pressed'),'true');
  await page.locator('button[data-render-mode="safe"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderMode==='safe'&&d.renderer==='canvas'&&d.status==='ready'&&d.renderPending==='false';},null,{timeout:60000});
  d=await data(page);assert.equal(d.beta,'-0.60');assert.equal(d.environment,'station');assert.equal(await page.locator('button[data-render-mode="safe"]').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
});

test('a page first opened in the background creates no renderer until shown', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true});await page.addInitScript(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});const Original=window.Worker;window.__workers=0;
    window.Worker=function(...args){window.__workers++;return new Original(...args);};window.Worker.prototype=Original.prototype;
  });
  await page.goto(base+'relativity.html',{waitUntil:'load'});await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.__workers),0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>window.__workers),1);assert.equal((await data(page)).renderer,'canvas');
});

test('controls respond while the default frame is rendering on a CPU-throttled page', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{const Original=window.Worker;window.__renders=0;window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{if(m.type==='render')window.__renders++;return post(m,...rest);};return w;};window.Worker.prototype=Original.prototype;});
  await page.goto(base+'relativity.html',{waitUntil:'load'});await page.waitForFunction(()=>window.__renders>0,null,{timeout:30000});
  const start=Date.now();await page.locator('#toggle-controls').click();await setRange(page,'#beta',.72);
  assert.ok(Date.now()-start<2500,'controls must respond before the 4×-throttled frame completes');assert.equal((await data(page)).beta,'0.72');
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
});

test('a hidden page cancels work, stays quiet, and resumes the displayed event', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true});await page.addInitScript(()=>{
    const Original=window.Worker;window.__events=[];
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{window.__events.push({type:m.type,visible:m.visible});return post(m,...rest);};w.addEventListener('message',e=>window.__events.push({type:'reply:'+e.data.type}));return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);await page.locator('#play').click();
  await page.waitForFunction(()=>window.__events.filter(e=>e.type==='render').length>=2);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(500);const before=await page.evaluate(()=>window.__events.length);await page.waitForTimeout(1800);
  assert.equal(await page.evaluate(()=>window.__events.length),before,'hidden page must not schedule more rendering');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(n=>window.__events.length>n,before,{timeout:30000});
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});
  assert.equal((await data(page)).playing,'false');
});

test('worker and direct WebGL match texture orientation and each scene has its own object surface', {timeout:240000,skip:noWebGL},async t=>{
  async function capture(disableWorker){
    const page=await newPage(t,{forceWebGL:true,deviceScaleFactor:.25});if(disableWorker)await page.addInitScript(()=>{window.__RELATIVITY_DISABLE_WORKER__=true;window.__RELATIVITY_FORCE_SYNC_WEBGL__=true;});
    await open(page);await selectStandardCube(page);await assetsReady(page);assert.equal((await data(page)).worker,String(!disableWorker));assert.equal((await data(page)).renderer,'webgl');assert.deepEqual(await page.locator('#relativity-scene').evaluate(c=>({w:c.width,h:c.height})),{w:360,h:225});
    await page.locator('#toggle-controls').click();await paintAfter(page,()=>setRange(page,'#beta',0));await page.locator('#toggle-controls').click();
    const results={};
    for(const shape of ['cube','sphere']){
      if(shape==='sphere'){await page.locator('#toggle-controls').click();await paintAfter(page,()=>page.locator('button[data-shape="sphere"]').click());await page.locator('#toggle-controls').click();}
      for(const env of ['station','street','corridor','mountain']){
        if((await data(page)).environment!==env)await paintAfter(page,()=>page.locator(`button[data-environment="${env}"]`).click());
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        results[shape+'-'+env]=await thumb(page);
        assert.match(await page.locator('#object-material').textContent(),{station:/旅行箱/,street:/快递纸箱/,corridor:/工业设备/,mountain:/木箱/}[env]);
      }
    }
    const masks=await page.evaluate(()=>{
      const s={environment:'station',scenario:'flyby',shape:'cube',beta:0,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58},out={cube:[],sphere:[]};
      for(const shape of ['cube','sphere']){s.shape=shape;for(let y=0;y<75;y++)for(let x=0;x<120;x++)if(RelativityRenderer.trace(s,x+.5,y+.5,120,75).hit?.kind===shape)out[shape].push((y*120+x)*4);}
      return out;
    });
    // Station and city sample different halves of the embedded panorama.
    const skyDifference=await page.evaluate(async()=>{
      const img=new Image();img.src=RelativityTextures.sky;await img.decode();const c=document.createElement('canvas');c.width=48;c.height=24;const x=c.getContext('2d');
      x.drawImage(img,0,0,img.width,img.height/2,0,0,48,24);const a=x.getImageData(0,0,48,24).data;
      x.drawImage(img,0,img.height/2,img.width,img.height/2,0,0,48,24);const b=x.getImageData(0,0,48,24).data;
      let sum=0;for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(a[i+k]-b[i+k]);return sum/(48*24*3);
    });
    await page.context().browser().close();return {results,masks,skyDifference};
  }
  const worker=await capture(false),direct=await capture(true),ids=['station','street','corridor','mountain'];
  assert.ok(worker.skyDifference>8,`independent city/station skies: ${worker.skyDifference}`);
  for(const shape of ['cube','sphere']){
    const mask=worker.masks[shape];assert.ok(mask.length>200,`${shape} sample mask: ${mask.length}`);
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
      const a=worker.results[shape+'-'+ids[i]],b=worker.results[shape+'-'+ids[j]];let sum=0;
      for(const n of mask)for(let k=0;k<3;k++)sum+=Math.abs(a[n+k]-b[n+k]);
      const mean=sum/(mask.length*3);assert.ok(mean>6,`${shape} surfaces ${ids[i]}/${ids[j]}: ${mean}`);
    }
    for(const env of ids){
      const a=worker.results[shape+'-'+env],b=direct.results[shape+'-'+env];let sum=0;
      for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++)sum+=Math.abs(a[i+k]-b[i+k]);
      const mean=sum/(a.length*.75);assert.ok(mean<8,`${shape}/${env} worker/direct mean pixel error ${mean}`);
    }
  }
});

test('delayed worker renders keep controls responsive, coalesce scenes and resolve only the latest queued probes', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const needle='const start=performance.now(),pixels=budget(msg.state);';
  const slow=original.replace(needle,"if(msg.state.environment!=='station'){const until=performance.now()+2500;while(performance.now()<until){}}\n      "+needle);assert.notEqual(slow,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:slow}));
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__relativitySent=[];
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(message,...rest)=>{if(message.type==='render')window.__relativitySent.push({environment:message.state.environment,revision:message.revision});return post(message,...rest);};return w;};
    window.Worker.prototype=Original.prototype;
  });
  await open(page);await selectStandardCube(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  const offset=await page.evaluate(()=>window.__relativitySent.length);
  await page.locator('button[data-environment="street"]').click();
  await page.waitForFunction(()=>window.__relativitySent.some(e=>e.environment==='street'));assert.equal(await page.locator('#scene-preparing').isVisible(),true);
  // This selection targets the old canvas and must be cancelled by the next
  // environment change rather than being applied to a different world.
  await page.mouse.click(120,350);
  const started=Date.now();await page.locator('button[data-environment="corridor"]').click();await page.locator('button[data-environment="mountain"]').click();
  await page.locator('#toggle-controls').click();assert.equal(await page.locator('#control-panel').isVisible(),true);
  const heartbeat=await page.evaluate(()=>new Promise(resolve=>{const t=performance.now();setTimeout(()=>resolve(performance.now()-t),80);}));
  assert.ok(heartbeat<700,`main thread heartbeat during worker delay: ${heartbeat}ms`);assert.ok(Date.now()-started<2000,'controls must react while the 2.5s render is still in flight');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment==='mountain'&&d.renderPending==='false';},null,{timeout:60000});
  let d=await data(page);assert.equal(d.environment,'mountain');assert.equal(d.probe,undefined);assert.equal(await page.locator('#scene-preparing').isHidden(),true);
  const events=await page.evaluate(offset=>window.__relativitySent.slice(offset).map(x=>x.environment),offset);
  assert.equal(events[0],'street');assert.equal(events.at(-1),'mountain');assert.ok(!events.includes('corridor'),`unnecessary intermediate render: ${events}`);
  await page.locator('#toggle-controls').click();
  await page.locator('button[data-environment="street"]').click();await page.mouse.click(720,450);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe==='cube',null,{timeout:60000});await assetsReady(page);
  await page.locator('#pin-ray').click();assert.equal((await data(page)).reference,'cube');
  const prev=await page.evaluate(()=>window.__relativitySent.length);
  await page.locator('#dock-shadows').click();await page.waitForFunction(n=>window.__relativitySent.length>n,prev,{timeout:30000});
  await page.locator('#relativity-scene').focus();for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowLeft');for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,m=document.querySelector('#probe-marker');return !!d.pairDelta&&Math.abs(parseFloat(m.style.left)-30)<.01&&Math.abs(parseFloat(m.style.top)-57.5)<.01;},null,{timeout:60000});
  assert.equal((await data(page)).reference,'cube');assert.deepEqual(errors,[]);
});

test('the shared WebGL program does not preload or compile other worlds while paused', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true});await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  assert.equal(await page.locator('#relativity-scene').getAttribute('data-shader-programs'),'1');
  assert.equal(await page.locator('#relativity-scene').getAttribute('data-prepared-worlds'),'shared');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.qualityPending==='false'&&d.quality==='final';},null,{timeout:90000});
  const frame=(await data(page)).frame;await page.waitForTimeout(3500);
  assert.equal((await data(page)).frame,frame);assert.equal(await page.locator('#relativity-scene').getAttribute('data-shader-programs'),'1');
  await paintAfter(page,()=>page.locator('button[data-environment="mountain"]').click());
  assert.equal(await page.locator('#relativity-scene').getAttribute('data-shader-programs'),'1');
});

test('a background renderer failure keeps state and replaces the transferred canvas', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8'),needle='const start=performance.now(),pixels=budget(msg.state);';
  const failing=original.replace(needle,"if(renderer.kind==='webgl'&&msg.state.environment==='street')throw new Error('simulated worker failure');\n      "+needle);assert.notEqual(failing,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:failing}));
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.locator('button[data-environment="street"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.worker==='true'&&d.renderMode==='safe'&&d.renderer==='canvas'&&d.drawnEnvironment==='street'&&d.renderPending==='false';},null,{timeout:60000});
  const d=await data(page);assert.equal(d.environment,'street');assert.equal(d.beta,'0.60');assert.equal(await page.locator('#relativity-scene').count(),1);assert.equal(await page.locator('#render-fallback').isVisible(),true);
  await paintAfter(page,()=>page.locator('button[data-environment="mountain"]').click());assert.equal((await data(page)).drawnEnvironment,'mountain');assert.deepEqual(errors,[]);
});

test('worker Canvas and main-thread Canvas decode scene textures consistently', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true});
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.evaluate(()=>{const c=document.createElement('canvas');c.style='position:fixed;left:-2000px;top:0;width:1440px;height:900px';document.body.append(c);window.__canvasReference=RelativityRenderer.create(c,{forceCanvas:true});});
  await page.waitForFunction(()=>['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal'].every(k=>window.__canvasReference.canvas.dataset[k+'Loaded']==='true'),null,{timeout:60000});
  const comparisons=[];for(const environment of ['station','street','corridor','mountain','harbor']){
    if(environment!=='station')await paintAfter(page,()=>page.locator(`button[data-environment="${environment}"]`).click());
    await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:90000});
    const comparison=await page.evaluate(environment=>{
      // Match every page parameter: a partial state otherwise silently
      // compares emission with the default reflection model.
      const s={...RelativityExperiments.BASE,environment,renderBudget:200000};
      const r=window.__canvasReference;r.render(s);
      // Compare native pixels directly. A first drawImage downscale of a newly
      // resized Canvas can use a different browser filtering path on its first
      // copy; that is not a texture-decoding or ray-tracing difference.
      const w=document.querySelector('#relativity-scene'),c=r.canvas;
      if(w.width!==c.width||w.height!==c.height)return {environment,dimensions:[w.width,w.height,c.width,c.height]};
      const a=w.getContext('2d').getImageData(0,0,w.width,w.height).data,b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let sum=0,max=0;for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);sum+=d;max=Math.max(max,d);}
      return {environment,mean:sum/(a.length*.75),max,dimensions:[w.width,w.height,c.width,c.height]};
    },environment);
    comparisons.push(comparison);assert.ok(comparison.mean<2,`${environment} worker/main Canvas pixel error ${JSON.stringify(comparison)}`);
  }
  t.diagnostic('same-state worker/main Canvas RGB mean absolute differences '+JSON.stringify(comparisons));
});

test('a failed background Canvas worker also falls back without losing the requested scene', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const needle="const target=settle?Math.min(10000,budget({...msg.state,interacting:true})):still?canvasStillBudget(msg.state):pixels;";
  const failing=original.replace(needle,"if(msg.state.environment==='street')throw new Error('simulated Canvas worker failure');\n        "+needle);assert.notEqual(failing,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:failing}));
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  assert.equal((await data(page)).renderer,'canvas');await page.locator('button[data-environment="street"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.worker==='false'&&d.renderer==='canvas'&&d.drawnEnvironment==='street'&&d.renderPending==='false';},null,{timeout:60000});
  assert.match(await page.locator('#render-fallback').textContent(),/中断/);assert.equal(await page.locator('#relativity-scene').count(),1);assert.deepEqual(errors,[]);
});

test('a probe selected during delayed playback samples the displayed observation event', {timeout:120000,skip:noWebGL},async t=>{
  const page=await newPage(t),original=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8');
  const needle='const start=performance.now(),pixels=budget(msg.state);';
  const slow=original.replace(needle,"if(msg.state.playing){const until=performance.now()+1200;while(performance.now()<until){}}\n      "+needle);assert.notEqual(slow,original);
  await page.route('**/relativity-render-worker.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:slow}));
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.locator('#play').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.playing==='true'&&d.drawnTime!==undefined&&Number(d.time)-Number(d.drawnTime)>.15&&d.renderPending==='false';},null,{timeout:60000});
  // Dispatch on the canvas in the same event-loop turn as reading the frame
  // timestamp, avoiding a race with the next asynchronous worker response.
  const expected=await page.locator('#relativity-scene').evaluate(canvas=>{
    const d=document.querySelector('#relativity-stage').dataset,shown=Number(d.drawnTime),clock=Number(d.time),r=canvas.getBoundingClientRect();
    const s={environment:d.environment,scenario:d.scenario,shape:d.shape,beta:Number(d.beta),time:shown,view:d.view,split:Number(d.split),yaw:Number(d.yaw),pitch:Number(d.pitch),fov:Number(d.fov)};
    const hit=RelativityRenderer.trace(s,r.width/2,r.height/2,r.width,r.height).hit;
    canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return {shown,clock,kind:hit?.kind||'sky',distance:hit?.distance};
  });
  const d=await data(page);assert.ok(expected.clock-expected.shown>.15);assert.equal(d.playing,'false');assert.ok(Math.abs(Number(d.time)-expected.shown)<.001,`selected ${d.time}, displayed ${expected.shown}`);
  assert.equal(d.probe,expected.kind);if(expected.distance!==undefined)assert.ok(Math.abs(Number(d.probeDistance)-expected.distance)<1e-5);
});

test('soft-shadow control changes the rendered image and reports its four physical samples', {timeout:150000},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await assetsReady(page);
  let d=await data(page);assert.equal(d.softShadows,'false');assert.equal(await page.locator('#toggle-soft-shadows').getAttribute('aria-pressed'),'false');
  const hard=await thumb(page);await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await paintAfter(page,()=>page.locator('#toggle-soft-shadows').click());
  d=await data(page);assert.equal(d.softShadows,'true');assert.equal(await page.locator('#toggle-soft-shadows').getAttribute('aria-pressed'),'true');
  const soft=await thumb(page);const changed=diff(hard,soft);t.diagnostic(`hard versus four-sample soft shadows: ${changed} changed thumbnail pixels`);assert.ok(changed>5);
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);
  assert.match(await page.locator('#probe-shadow').textContent(),/[0-4] \/ 4 条受阻/);
  await page.locator('#toggle-shadows').click();assert.equal(await page.locator('#toggle-soft-shadows').isDisabled(),true);assert.equal(await page.locator('#probe-shadow').textContent(),'已关闭');
  await page.locator('#toggle-shadows').click();assert.equal(await page.locator('#toggle-soft-shadows').isEnabled(),true);assert.match(await page.locator('#probe-shadow').textContent(),/[0-4] \/ 4 条受阻/);
  assert.deepEqual(errors,[]);
});

test('optional area-light shadows change a same-resolution WebGL still', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:480,height:300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
  const hard=await thumb(page),dims=await page.locator('#relativity-scene').evaluate(c=>[c.width,c.height]);
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#toggle-soft-shadows').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.softShadows==='true'&&d.renderPending==='false'&&d.quality==='final'&&d.qualityPending==='false';},null,{timeout:120000});
  assert.deepEqual(await page.locator('#relativity-scene').evaluate(c=>[c.width,c.height]),dims);const changed=diff(hard,await thumb(page));
  t.diagnostic(`${changed} changed thumbnail pixels at the same WebGL resolution`);assert.ok(changed>5);assert.deepEqual(errors,[]);
});

test('third-person 3D paths use the actual pinned A/B probes and exclude simultaneous slices', {timeout:150000},async t=>{
  const page=await newPage(t,{autoRenderer:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await selectStandardCube(page);await assetsReady(page);if(axe)await page.addScriptTag({content:axe.source});
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);
  assert.equal(await page.locator('#open-ray-space').isEnabled(),true);await page.locator('#pin-ray').click();await page.locator('#relativity-scene').focus();
  for(let i=0;i<8;i++)await page.keyboard.press('Shift+ArrowLeft');for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowDown');
  await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.pairDelta);const d=await data(page);
  const expected=await page.evaluate(()=>{
    const canvas=document.querySelector('#relativity-scene'),r=canvas.getBoundingClientRect(),m=document.querySelector('#probe-marker');
    const x=parseFloat(m.style.left)/100*r.width,y=parseFloat(m.style.top)/100*r.height;
    return RelativityRenderer.trace({environment:'station',scenario:'flyby',shape:'cube',view:'photo',beta:.6,time:0,split:.5,yaw:0,pitch:-.025,fov:58},x,y,r.width,r.height);
  });
  await page.locator('#open-ray-space').click();assert.equal(await page.locator('#ray-space-dialog').evaluate(e=>e.open),true);await assertAxe(page,'3D light-path dialog');
  const dialog=await page.locator('#ray-space-dialog').evaluate(e=>({...e.dataset}));assert.equal(dialog.rays,'2');assert.equal(dialog.ray0Mode,'photon');assert.equal(dialog.ray1Mode,'photon');
  assert.ok(Math.abs(Number(dialog.ray0Time)-Number(d.referenceTime))<.000002);assert.ok(Math.abs(Number(dialog.ray1Time)+Number(d.probeDistance))<.000002);assert.ok(Math.abs(Number(dialog.delta)-Number(d.pairDelta))<.000002);
  dialog.ray1Point.split(',').map(Number).forEach((v,i)=>assert.ok(Math.abs(v-expected.hit.point[i])<.000002));
  assert.match(await page.locator('#ray-space-delta').textContent(),/抵达同一观察事件/);
  const canvas=page.locator('#ray-space-canvas'),before=await canvas.evaluate(c=>({yaw:c.dataset.yaw,image:c.toDataURL()}));await page.locator('[data-space-action="right"]').click();const after=await canvas.evaluate(c=>({yaw:c.dataset.yaw,image:c.toDataURL()}));assert.notEqual(before.yaw,after.yaw);assert.notEqual(before.image,after.image);
  await canvas.focus();await page.keyboard.press('ArrowUp');assert.notEqual(await canvas.getAttribute('data-pitch'),'0.55000');await page.keyboard.press('Home');assert.equal(await canvas.getAttribute('data-pitch'),'0.55000');
  await page.waitForTimeout(200);const count=await canvas.getAttribute('data-draws');await page.waitForTimeout(900);assert.equal(await canvas.getAttribute('data-draws'),count,'3D view must not continuously animate or redraw');
  await page.keyboard.press('Escape');assert.equal(await page.locator('#ray-space-dialog').evaluate(e=>e.open),false);
  await page.locator('button[data-view="split"]').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false');
  await page.locator('#relativity-scene').focus();for(let i=0;i<3;i++)await page.keyboard.press('Shift+ArrowLeft');await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probePhoto==='true');await page.locator('#pin-ray').click();
  await page.locator('#relativity-scene').focus();for(let i=0;i<10;i++)await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probePhoto==='false');
  await page.locator('#open-ray-space').click();const simultaneous=await page.locator('#ray-space-dialog').evaluate(e=>({...e.dataset}));
  assert.equal(simultaneous.ray1Mode,'slice');assert.equal(simultaneous.ray1Time,'');assert.equal(simultaneous.delta,'');assert.match(await page.locator('#ray-space-rays').textContent(),/不是实际发射事件/);await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
});

test('3D light-path dialog is usable on a narrow touch viewport without overflow', {timeout:120000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:390,height:844},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await assetsReady(page);if(axe)await page.addScriptTag({content:axe.source});
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);await page.locator('#open-ray-space').click();await assertAxe(page,'mobile 3D dialog');
  const bounds=await page.locator('#ray-space-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390.1&&bounds.y>=0&&bounds.y+bounds.height<=844.1,JSON.stringify(bounds));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  const canvas=page.locator('#ray-space-canvas'),yaw=await canvas.getAttribute('data-yaw');await page.locator('[data-space-action="left"]').click();assert.notEqual(await canvas.getAttribute('data-yaw'),yaw);
  const touchYaw=await canvas.getAttribute('data-yaw'),r=await canvas.boundingBox(),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.35,y:r.y+r.height*.4,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.55,y:r.y+r.height*.5,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.notEqual(await canvas.getAttribute('data-yaw'),touchYaw,'touch drag must rotate the 3D view');
  await page.locator('#close-ray-space').click();assert.equal(await page.locator('#ray-space-dialog').evaluate(e=>e.open),false);assert.deepEqual(errors,[]);
});

test('changed still parameters hide the prior image while retaining queued canvas input', {timeout:120000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}});
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__holdNextRender=false;
    window.Worker=function(...args){const w=new Original(...args),post=w.postMessage.bind(w);w.postMessage=(m,...rest)=>{
      if(m.type==='render'&&window.__holdNextRender){window.__holdNextRender=false;window.__heldBeta=m.state.beta;window.__releaseHeldRender=()=>post(m,...rest);return;}
      return post(m,...rest);
    };return w;};window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.evaluate(()=>{window.__holdNextRender=true;});await setRange(page,'#beta',.86);
  await page.waitForFunction(()=>typeof window.__releaseHeldRender==='function');
  assert.equal(await page.evaluate(()=>window.__heldBeta),.86);assert.equal((await data(page)).renderPending,'true');
  assert.equal(await page.locator('#scene-preparing').isVisible(),true);
  assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'0');
  // The invisible canvas still receives input, which is resolved against the
  // matching image rather than the old pixels after the held render completes.
  await page.locator('#relativity-scene').click({position:{x:500,y:250}});
  assert.equal((await data(page)).probe,undefined);
  await page.evaluate(()=>window.__releaseHeldRender());
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderPending==='false'&&d.probe;},null,{timeout:60000});
  assert.equal((await data(page)).beta,'0.86');assert.equal(await page.locator('#scene-preparing').isHidden(),true);
  assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'1');
});

for(const webgl of [false,true])test(`a completed obsolete ${webgl?'WebGL':'Canvas'} worker frame is discarded before display`, {timeout:150000,skip:webgl&&noWebGL},async t=>{
  const page=await newPage(t,webgl?{forceWebGL:true,viewport:{width:500,height:300}}:{autoRenderer:true,viewport:{width:800,height:600}});await page.addInitScript(()=>{
    const Original=window.Worker;window.__holdCancel=false;window.__holdMountain=false;window.__sent=[];window.__received=[];
    window.Worker=function(...args){
      const w=new Original(...args),post=w.postMessage.bind(w);
      w.postMessage=(m,...rest)=>{
        if(m.type==='cancel'&&window.__holdCancel){window.__sent.push('cancel-held');return;}
        if(m.type==='render'&&m.state.environment==='mountain'&&window.__holdMountain){window.__sent.push('mountain-held');window.__releaseMountain=()=>post(m,...rest);return;}
        if(m.type==='render')window.__sent.push(m.state.environment);return post(m,...rest);
      };
      w.addEventListener('message',e=>{if(e.data.type==='frame'||e.data.type==='preview')window.__received.push({type:e.data.type,env:e.data.environment});});return w;
    };window.Worker.prototype=Original.prototype;
  });
  await open(page);await assetsReady(page);if((await data(page)).worker!=='true')return t.skip('Worker/OffscreenCanvas not supported');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false';},null,{timeout:90000});
  const baseline=await thumb(page);await page.evaluate(()=>{window.__holdCancel=true;window.__holdMountain=true;});
  await page.locator('button[data-environment="street"]').click();await page.waitForFunction(()=>window.__sent.includes('street'));
  await page.locator('button[data-environment="mountain"]').click();await page.waitForFunction(()=>window.__sent.includes('cancel-held'));
  assert.equal(await page.locator('#scene-preparing').isVisible(),true);
  assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'0','an old still must not be shown as the requested scene');
  assert.equal(await page.evaluate(()=>{const canvas=document.querySelector('#relativity-scene');for(let y=10;y<innerHeight;y+=10)for(let x=10;x<innerWidth;x+=10)if(document.elementFromPoint(x,y)===canvas)return true;return false;}),true,'pending canvas remains hit-testable');
  await page.waitForFunction(()=>window.__received.some(e=>e.env==='street'),null,{timeout:60000});
  assert.equal(diff(baseline,await thumb(page)),0,'an obsolete preview must not be displayed');
  await page.waitForFunction(()=>window.__sent.includes('mountain-held'),null,{timeout:90000});
  assert.equal((await data(page)).environment,'mountain');const during=await thumb(page);
  const staleChanges=diff(baseline,during);assert.equal(staleChanges,0,`obsolete street frame changed ${staleChanges} thumbnail pixels after the mountain request`);
  await page.evaluate(()=>{window.__holdCancel=false;window.__holdMountain=false;window.__releaseMountain();});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment==='mountain'&&d.renderPending==='false';},null,{timeout:60000});
  assert.ok(diff(baseline,await thumb(page))>100);assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'1');
  assert.equal(await page.locator('#scene-preparing').isHidden(),true);
});

test('surface clock and fixed material point use the matching physical event and survive parameter changes', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1200,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible',null,{timeout:60000});
  let d=await data(page);assert.equal(d.clockStatus,'visible');assert.notEqual(d.clockNow,d.clockSeen);assert.equal(await page.locator('#material-photo-marker').isVisible(),true);
  const expected=await page.evaluate(()=>{const d=document.querySelector('#relativity-stage').dataset,s={...RelativityExperiments.BASE,time:Number(d.drawnTime)},e=RelativityRenderer.eventState(s),m=RelativityObservables.evaluate(s,e,RelativityModel.materialAnchor(s.environment,s.shape),1200,750),c=RelativityObservables.evaluate(s,e,RelativityModel.clockAnchor(s.environment,s.shape).point,1200,750);return {rest:m.restPoint,emission:m.emission.time,point:m.emission.point,now:c.properNow,seen:c.properEmission};});
  assert.ok(Math.abs(Number(d.markerEmissionTime)-expected.emission)<1e-5);assert.ok(Math.abs(Number(d.clockNow)-expected.now)<1e-5);assert.ok(Math.abs(Number(d.clockSeen)-expected.seen)<1e-5);
  const marker=await page.locator('#material-photo-marker').boundingBox();await page.mouse.click(marker.x+marker.width/2,marker.y+marker.height/2);await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();assert.equal(await page.locator('#mark-probe').isEnabled(),true);await page.locator('#mark-probe').click();const rest=(await data(page)).markerRest;assert.equal(await page.locator('#material-mode').textContent(),'所选表面');
  await page.locator('#toggle-knowledge').click();await paintAfter(page,()=>setRange(page,'#event-time',1.2));d=await data(page);assert.equal(d.markerRest,rest);assert.notEqual(d.markerEmissionTime,expected.emission.toFixed(6));assert.notEqual(d.clockSeen,d.clockNow);
  await paintAfter(page,()=>page.locator('button[data-view="geometry"]').click());d=await data(page);assert.equal(d.markerRest,rest);assert.equal(await page.locator('#material-photo-marker').isHidden(),true);assert.match(await page.locator('#clock-seen').textContent(),/未显示/);
  await paintAfter(page,()=>page.locator('button[data-environment="street"]').click());d=await data(page);assert.notEqual(d.markerRest,rest);assert.equal(await page.locator('#material-mode').textContent(),'默认表面');assert.deepEqual(errors,[]);
});

test('occluded material point is reported as a candidate, never as a received light ray', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  const snapshot=await page.evaluate(()=>({format:'relativity-observation',schema:1,parameters:{...RelativityExperiments.BASE,beta:0},measurements:{current:null,reference:null,materialPoint:[0,0,RelativityModel.objectHalf('station','artifact')[2]]}}));
  await page.locator('#snapshot-file').setInputFiles({name:'back.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderPending==='false'&&d.markerOcclusion==='self';},null,{timeout:60000});
  assert.equal(await page.locator('#material-photo-marker').isHidden(),true);assert.match(await page.locator('#material-status').textContent(),/自身遮挡/);await page.locator('#toggle-knowledge').click();await page.locator('#open-ray-space').click();
  assert.match(await page.locator('#ray-space-marker').textContent(),/遮挡/);await page.locator('button[data-diagram="spacetime"]').click();
  await page.waitForFunction(()=>document.querySelector('#spacetime-canvas').dataset.events!==undefined);const chart=await page.locator('#spacetime-canvas').evaluate(e=>({...e.dataset}));assert.equal(chart.photons,'0');assert.equal(chart.events,'3');assert.deepEqual(errors,[]);
});

test('spacetime slider re-traces A/B at the new event while M keeps one rest-frame coordinate', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1200,height:750}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible');
  const mark=await page.locator('#material-photo-marker').boundingBox();await page.mouse.click(mark.x+mark.width/2,mark.y+mark.height/2);await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#pin-ray').click();await page.locator('#relativity-scene').focus();await page.keyboard.press('Shift+ArrowRight');
  const before=await data(page),rest=before.markerRest;await page.locator('#open-ray-space').click();assert.equal((await page.locator('#ray-space-dialog').evaluate(e=>({...e.dataset}))).rays,'2');
  await page.locator('button[data-diagram="spacetime"]').click();await page.waitForFunction(()=>document.querySelector('#spacetime-canvas').dataset.observationTime==='0.000000');if(axe)await page.addScriptTag({content:axe.source});await assertAxe(page,'spacetime dialog');
  await page.locator('#spacetime-axis').selectOption('sight');assert.equal(await page.locator('#spacetime-canvas').getAttribute('data-axis'),'sight');
  await setRange(page,'#spacetime-time',1.2);await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#spacetime-canvas').dataset;return d.renderPending==='false'&&c.observationTime==='1.200000';},null,{timeout:60000});
  const after=await data(page),dialog=await page.locator('#ray-space-dialog').evaluate(e=>({...e.dataset}));assert.equal(after.markerRest,rest);assert.equal(dialog.rays,'2');assert.equal(dialog.ray0Mode,'photon');assert.notEqual(dialog.ray0Time,before.referenceTime);assert.match(await page.locator('#spacetime-status').textContent(),/固定屏幕方向/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1200);assert.deepEqual(errors,[]);
});

test('same-event camera cache remains separate from new physical frames and probe selection', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:90000});
  const initial=await data(page);await page.mouse.move(500,230);await page.mouse.down();for(let i=1;i<=12;i++){await page.mouse.move(500+i*5,230+i);await page.waitForTimeout(15);}
  // Pointer bursts may intentionally be coalesced; what matters is that the
  // visible approximation reaches the latest requested pose, not that every
  // intermediate input caused a separate composite.
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.cameraPreview==='true'&&Math.abs(Number(d.previewYaw)-Number(d.yaw))<.00002;},null,{timeout:30000});
  let d=await data(page);assert.equal(d.cameraPreview,'true');assert.equal(await viewVisible(page),true);assert.ok(Number(d.previewUpdates)>0);assert.notEqual(d.yaw,initial.yaw);assert.equal(d.previewSourceTime,d.drawnTime.replace(/\.0+$/,''));assert.equal(await page.locator('#material-photo-marker').isHidden(),true);
  // Even if a real coarse frame catches up while the pointer is still held,
  // the composited view remains an approximation and must stay labeled.
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.cameraPreview==='true'&&d.renderPending==='false';},null,{timeout:30000});assert.equal(await page.locator('#scene-preparing').isVisible(),true);assert.match(await page.locator('#scene-preparing').textContent(),/近似视角/);
  await setRange(page,'#beta',.86);d=await data(page);assert.equal(d.cameraPreview,'false');assert.equal(d.cameraCache,'false');assert.equal(d.viewPending,'false');assert.equal(await page.locator('#relativity-scene').evaluate(c=>getComputedStyle(c).opacity),'0');
  await page.mouse.up();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.beta==='0.86'&&d.renderPending==='false'&&d.cameraPreview==='false';},null,{timeout:60000});assert.notEqual((await data(page)).frame,initial.frame);assert.deepEqual(errors,[]);
});

test('independent wide caches preserve both sides of flyby, observer, and shadow comparisons', {timeout:360000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:640,height:400}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const canvas=document.createElement('canvas');let loaded=0;window.__cacheCheck=RelativityRenderer.createOffscreenCanvas(canvas,(name,status)=>{if(status==='error')reject(Error(name));else if(++loaded===9)resolve();});}));
  const cases=[{scenario:'flyby',view:'split',shadowTiming:'retarded'},{scenario:'observer',view:'split',shadowTiming:'retarded'},{scenario:'flyby',view:'photo',shadowTiming:'split'}],results=[];
  for(const [i,c] of cases.entries()){
    if(i===0)await page.locator('button[data-view="split"]').click();
    else if(i===1){await page.locator('#toggle-controls').click();await page.locator('button[data-scenario="observer"]').click();await page.locator('#toggle-controls').click();}
    else{await page.locator('#toggle-controls').click();await page.locator('button[data-scenario="flyby"]').click();await page.locator('#advanced-physics > summary').click();await page.locator('button[data-shadow-timing="split"]').click();await page.locator('#toggle-controls').click();}
    await page.waitForFunction(({scenario,view,shadowTiming})=>{const d=document.querySelector('#relativity-stage').dataset;return d.scenario===scenario&&d.view===view&&d.shadowTiming===shadowTiming&&d.cameraCache==='true'&&d.renderPending==='false';},c,{timeout:120000});
    const result=await page.evaluate(({scenario,view,shadowTiming})=>{
      const C=RelativityCamera,R=RelativityRenderer,renderer=window.__cacheCheck,stage=document.querySelector('#relativity-stage'),rect=stage.getBoundingClientRect(),nodes=[...document.querySelectorAll('.camera-preview-cache .camera-preview-image')],state={...RelativityExperiments.BASE,scenario,view,shadowTiming,yaw:Number(stage.dataset.yaw),pitch:Number(stage.dataset.pitch),fov:Number(stage.dataset.fov),time:Number(stage.dataset.drawnTime)};
      const wide={...state,fov:C.overscan(state.fov)},viewport={width:rect.width,height:rect.height},budget=C.cacheBudget(state,true),out=[];
      for(let i=0;i<2;i++){
        const canvas=nodes[i],actual=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),job=renderer.beginRender({...C.sideState(wide,i),renderBudget:budget},viewport);while(!job.step(Infinity)){}const expected=job.result();let sum=0,max=0,bad=0;
        if(actual.width!==expected.width||actual.height!==expected.height)throw Error('cache dimensions mismatch');
        for(let j=0;j<actual.data.length;j+=4)for(let k=0;k<3;k++){const d=Math.abs(actual.data[j+k]-expected.data[j+k]);sum+=d;max=Math.max(max,d);if(d>6)bad++;}
        out.push({width:actual.width,height:actual.height,mean:sum/(actual.width*actual.height*3),max,bad});
      }return out;
    },c);results.push({c,result});
  }
  for(const entry of results)for(const side of entry.result){assert.ok(side.width>1&&side.height>1,JSON.stringify(entry));assert.ok(side.mean<.5,JSON.stringify(entry));assert.ok(side.bad/(side.width*side.height*3)<.02,JSON.stringify(entry));}assert.deepEqual(errors,[]);
});

test('clock face ink follows the same per-pixel proper-time event on CPU and WebGL', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:500}});await open(page);
  await page.evaluate(()=>Promise.all([
    new Promise((resolve,reject)=>{const c=document.createElement('canvas');let n=0;window.__clockCPU=RelativityRenderer.createOffscreenCanvas(c,(name,status)=>{if(status==='error')reject(Error(name));else if(++n===9)resolve();});}),
    new Promise((resolve,reject)=>{const c=document.createElement('canvas');c.style='position:fixed;left:-1000px;width:320px;height:200px';document.body.append(c);let n=0;window.__clockGPU=RelativityRenderer.create(c,{onAsset(name,status){if(status==='error')reject(Error(name));else if(++n===9)resolve();}});})
  ]));
  const results=await page.evaluate(()=>{
    const cpu=window.__clockCPU,gpu=window.__clockGPU,M=RelativityModel,R=RelativityRenderer,view={width:320,height:200,dpr:1},out=[];
    for(const environment of RelativityWorlds.IDs)for(const beta of [0,.6]){
      const state={...RelativityExperiments.BASE,environment,beta,fov:35,shadows:false,doppler:false,renderBudget:64000},gl=gpu.canvas.getContext('webgl');cpu.render(state,false,view);gpu.render(state,false,view);
      const cp=cpu.canvas.getContext('2d').getImageData(0,0,320,200).data,gp=new Uint8Array(320*200*4);gl.readPixels(0,0,320,200,gl.RGBA,gl.UNSIGNED_BYTE,gp);const counts=[0,0,0,0];let sum=0,bad=0,n=0;
      for(let y=0;y<200;y++)for(let x=0;x<320;x++){
        const r=R.trace(state,x+.5,y+.5,320,200),hit=r.hit;if(!hit?.body||hit.material!==4)continue;
        const tau=M.properTime(state.time-hit.distance,r.velocity,hit.restPoint),ink=M.clockInk(hit.restPoint,hit.restNormal,M.objectHalf(environment,state.shape),tau);if(!ink)continue;counts[ink]++;
        for(let k=0;k<3;k++){const d=Math.abs(cp[(y*320+x)*4+k]-gp[((199-y)*320+x)*4+k]);sum+=d;if(d>15)bad++;n++;}
      }out.push({environment,beta,counts,n,mean:sum/n,bad});
    }return out;
  });
  assert.equal(results.length,worldCount*2);for(const r of results){assert.ok(r.counts[1]>10&&r.counts[2]>30&&r.counts[3]>3,JSON.stringify(r));assert.ok(r.mean<3,JSON.stringify(r));assert.ok(r.bad/r.n<.025,JSON.stringify(r));}
});

test('mobile spacetime view remains operable offline with keyboard and touch-sized controls', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible',null,{timeout:60000});
  await page.locator('#toggle-knowledge').click();await page.locator('#open-ray-space').click();await page.locator('button[data-diagram="spacetime"]').click();if(axe)await page.addScriptTag({content:axe.source});await assertAxe(page,'mobile spacetime');
  const dialog=await page.locator('#ray-space-dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=390.1&&dialog.y>=0&&dialog.y+dialog.height<=844.1,JSON.stringify(dialog));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#spacetime-axis').selectOption('z');assert.equal(await page.locator('#spacetime-canvas').getAttribute('data-axis'),'z');await setRange(page,'#spacetime-time',.8);
  await page.waitForFunction(()=>document.querySelector('#spacetime-canvas').dataset.observationTime==='0.800000',null,{timeout:60000});await page.locator('#close-ray-space').click();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('custom material point survives a JSON snapshot and is rechecked when imported', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible');
  const mark=await page.locator('#material-photo-marker').boundingBox();await page.mouse.click(mark.x+mark.width/2,mark.y+mark.height/2);await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);
  if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#mark-probe').click();assert.match(await page.locator('#material-announce').textContent(),/已将采样/);const savedPoint=(await data(page)).markerRest;
  if(await page.locator('#control-panel').isHidden())await page.locator('#toggle-controls').click();const promised=page.waitForEvent('download');await page.locator('#export-snapshot').click();const download=await promised,report=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.deepEqual(report.measurements.materialPoint.map(v=>v.toFixed(6)),savedPoint.split(','));
  await paintAfter(page,()=>page.locator('button[data-environment="street"]').click());assert.notEqual((await data(page)).markerRest,savedPoint);
  await page.locator('#snapshot-file').setInputFiles({name:'surface.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(report))});await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.environment==='station'&&d.renderPending==='false';},null,{timeout:60000});assert.equal((await data(page)).markerRest,savedPoint);assert.equal(await page.locator('#material-mode').textContent(),'所选表面');assert.deepEqual(errors,[]);
});

test('opening a spacetime diagram while playing pauses on the actually displayed event', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible');
  await page.locator('#play').click();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.playing==='true'&&Number(d.drawnTime)>.1&&d.markerStatus==='visible';},null,{timeout:60000});if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#open-ray-space').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.playing==='false'&&d.renderPending==='false';},null,{timeout:60000});await page.locator('button[data-diagram="spacetime"]').click();await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#spacetime-canvas').dataset;return c.observationTime===d.drawnTime;},null,{timeout:60000});
  const d=await data(page),clock=await page.locator('#clock-observation').textContent();assert.ok(Math.abs(Number(clock)-Number(d.drawnTime))<.0006);const time=d.drawnTime;await page.waitForTimeout(350);assert.equal((await data(page)).drawnTime,time);assert.deepEqual(errors,[]);
});

test('resizing a spacetime view explicitly reports that screen-fixed A/B samples were cleared', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.markerStatus==='visible');
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe);if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#pin-ray').click();await page.locator('#relativity-scene').focus();await page.keyboard.press('Shift+ArrowRight');await page.locator('#open-ray-space').click();await page.locator('button[data-diagram="spacetime"]').click();
  await page.setViewportSize({width:760,height:650});await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset,c=document.querySelector('#spacetime-canvas').dataset,status=document.querySelector('#spacetime-status').textContent;return d.renderPending==='false'&&!!c.observationTime&&/(尺寸|视窗).*A\/B.*重新采样/.test(status);},null,{timeout:60000});assert.equal((await page.locator('#ray-space-dialog').evaluate(e=>({...e.dataset}))).rays,'0');assert.deepEqual(errors,[]);
});

test('released camera keeps the detailed labeled approximation until a less coarse matching frame arrives', {timeout:180000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:650}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const source=fs.readFileSync(path.join(root,'relativity-render-worker.js'),'utf8'),needle='const preview=budget(task.msg.state),target=canvasStillBudget(task.msg.state);',delayed=source.replace(needle,"const until=performance.now()+1200;while(performance.now()<until){}\n        "+needle);assert.notEqual(delayed,source);await page.route('**/relativity-render-worker.js*',r=>r.fulfill({status:200,contentType:'text/javascript',body:delayed}));
  await open(page);await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.cameraCache==='true',null,{timeout:90000});await page.mouse.move(500,230);await page.mouse.down();await page.mouse.move(545,240);await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.quality==='quick',null,{timeout:30000});let d=await data(page);assert.equal(d.cameraPreview,'true');assert.equal(d.renderPending,'true');assert.equal(await page.locator('#scene-preparing').isVisible(),true);assert.match(await page.locator('#scene-preparing').textContent(),/近似视角预览/);assert.match(await page.locator('#quality-hint').textContent(),/近似视角，等待匹配预览/);assert.equal(await page.locator('#material-photo-marker').isHidden(),true);
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');assert.equal((await data(page)).probe,undefined,'the approximate image must not be sampled');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.cameraPreview==='false'&&d.renderPending==='false'&&!!d.probe;},null,{timeout:60000});d=await data(page);assert.notEqual(d.quality,'quick');assert.deepEqual(errors,[]);
});

test('3D velocity, layered controls, guided procedures and mobile dock are reachable', {timeout:180000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  assert.equal((await data(page)).motionElevation,'0');assert.equal((await data(page)).surfaceMode,'reflection');assert.equal(await page.locator('#advanced-physics').evaluate(e=>e.open),false);
  await page.locator('#toggle-controls').click();await setRange(page,'#motion-elevation',35);assert.equal((await data(page)).motionElevation,'35');assert.match(await page.locator('#direction-label').innerText(),/y 0\.34/);
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='false',null,{timeout:60000});assert.equal(await page.locator('#geometry-contour').isVisible(),true);
  await page.locator('#experiment-guide > summary').click();
  for(const id of ['terrell','aberration','shadow','spectrum','shutter']){
    await page.locator(`button[data-experiment="${id}"]`).click();assert.equal(await page.locator('#guide-steps').isVisible(),true);
    for(const key of ['operate','observe','verify'])assert.ok((await page.locator('#guide-'+key).innerText()).length>15,id+' '+key);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#toggle-dock').click();assert.equal(await page.locator('#dock-content').isHidden(),true);assert.equal(await page.locator('#toggle-dock').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#toggle-dock').click();assert.equal(await page.locator('#dock-content').isVisible(),true);await page.setViewportSize({width:1000,height:700});assert.equal(await page.locator('#dock-content').isVisible(),true);assert.deepEqual(errors,[]);
});

test('parameter groups generate, export, import and invalidate independent physical comparisons', {timeout:240000},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:1000,height:700},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.locator('#toggle-controls').click();await page.locator('#open-parameter-comparison').click();assert.equal(await page.locator('#parameter-dialog').isVisible(),true);assert.match(await page.locator('#parameter-caption').innerText(),/不是右侧探针/);
  if(axe){await page.addScriptTag({path:require.resolve('axe-core')});await assertAxe(page,'parameter comparison dialog');}
  await page.locator('#comparison-run').click();await page.waitForFunction(()=>!document.querySelector('#comparison-export-data').disabled,null,{timeout:180000});assert.equal(await page.locator('#comparison-results').getAttribute('data-stale'),'false');
  const pixels=await page.evaluate(()=>{const a=document.querySelector('#comparison-image-a'),b=document.querySelector('#comparison-image-b'),x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;let diff=0;for(let i=0;i<x.length;i+=4)if(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])>12)diff++;return {diff,width:a.width,height:a.height};});assert.ok(pixels.diff>100);assert.deepEqual([pixels.width,pixels.height],[360,225]);
  const [dataDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#comparison-export-data').click()]);const saved=JSON.parse(await fs.promises.readFile(await dataDownload.path(),'utf8'));assert.equal(saved.format,'relativity-parameter-comparison');assert.equal(saved.curves.length,2);assert.equal(saved.curves[0].length,81);assert.equal(saved.groups.length,2);assert.equal(saved.base.surfaceMode,'reflection');
  const replay=await page.evaluate(saved=>RelativityComparison.build(saved.base,saved.groups,saved.lockedEvent,saved.image.width,saved.image.height).measurements, saved);assert.deepEqual(replay,saved.measurements);
  const [imageDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#comparison-export-image').click()]);assert.match(imageDownload.suggestedFilename(),/\.png$/);assert.ok((await fs.promises.stat(await imageDownload.path())).size>10000);
  await setRange(page,'#group-b-beta',.2);assert.equal(await page.locator('#comparison-export-data').isDisabled(),true);assert.equal(await page.locator('#comparison-results').getAttribute('data-stale'),'true');
  await page.locator('#comparison-file').setInputFiles({name:'comparison.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>!document.querySelector('#comparison-export-data').disabled,null,{timeout:180000});assert.equal(Number(await page.locator('#group-b-beta').inputValue()),saved.groups[1].beta);
  await page.locator('#comparison-run').click();await setRange(page,'#group-a-beta',.1);await page.waitForTimeout(500);assert.equal(await page.locator('#comparison-export-data').isDisabled(),true);assert.match(await page.locator('#comparison-status').innerText(),/过期/);
  await page.locator('#close-parameter-dialog').click();assert.deepEqual(errors,[]);
});

test('off-axis reflection factors and movable lamp agree between CPU and WebGL', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{forceWebGL:true,viewport:{width:800,height:500}});await open(page);
  const audit=await page.evaluate(()=>{
    const out=[];for(const environment of ['station','corridor','mountain']){
      const c=document.createElement('canvas');c.style='width:92px;height:62px';document.body.append(c);const r=RelativityRenderer.create(c),base={environment,scenario:'flyby',shape:'cube',beta:.76,motionAngle:35,motionElevation:30,view:'photo',time:0,split:.5,yaw:0,pitch:-.025,fov:58,shadows:true,doppler:true,lightX:2,lightZ:-1,lightYaw:30,lightElevation:-5,surfaceMode:'reflection'};
      const gpu=r.debugOptics(base);let n=0,bad=0,body=0,max=0;
      for(let y=0;y<gpu.height;y+=2)for(let x=0;x<gpu.width;x+=2){const ray=RelativityRenderer.trace(base,x+.5,y+.5,gpu.width,gpu.height),f=RelativityOptics.frequencyRatio(base,ray);if(!f)continue;const i=((gpu.height-1-y)*gpu.width+x)*4,encoded=gpu.pixels[i+1]*256+gpu.pixels[i+2],got=.1*Math.pow(100,encoded/65535),expected=Math.max(.1,Math.min(10,f)),err=Math.abs(Math.log(got/expected));max=Math.max(max,err);if(err>.03)bad++;if(ray.hit?.body)body++;n++;}
      let lamp=null;if(environment!=='mountain'){
        const source=RelativityOptics.lightPosition(environment,base),camera=[0,1.65,0],v=RelativityModel.sub(source,camera),s={...base,beta:0,yaw:Math.atan2(v[0],v[2]),pitch:Math.atan2(v[1],Math.hypot(v[0],v[2]))},materials=r.debugMaterials(s);let matched=0,correct=0;
        for(let y=0;y<materials.height;y++)for(let x=0;x<materials.width;x++){const ray=RelativityRenderer.trace(s,x+.5,y+.5,materials.width,materials.height),i=((materials.height-1-y)*materials.width+x)*4;if(ray.hit?.kind==='key-light'){matched++;if(materials.pixels[i]===39)correct++;}}
        lamp={matched,correct};
      }out.push({environment,n,bad,body,max,lamp});c.remove();
    }return out;
  });
  for(const r of audit){assert.ok(r.n>500);assert.ok(r.bad/r.n<.025,JSON.stringify(r));if(r.lamp){assert.ok(r.lamp.matched>5,JSON.stringify(r));assert.ok(r.lamp.correct/r.lamp.matched>.95,JSON.stringify(r));}}
  t.diagnostic('3D two-leg reflection and light panel '+JSON.stringify(audit));
});

test('parameter comparison works in offline file mode without Worker', {timeout:240000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},autoRenderer:true}),external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:90000});
  await page.locator('#toggle-controls').click();await page.locator('#open-parameter-comparison').click();await page.locator('#comparison-run').click();await page.waitForFunction(()=>!document.querySelector('#comparison-export-data').disabled,null,{timeout:180000});assert.match(await page.locator('#comparison-status').innerText(),/已完成/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});

test('assumed material spectral lookup and highlight shoulder agree across CPU and WebGL', {timeout:240000,skip:noWebGL},async t=>{
  const page=await newPage(t,{autoRenderer:true,viewport:{width:800,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  const audit=await page.evaluate(()=>{
    const c=document.createElement('canvas');c.style='width:70px;height:45px';document.body.append(c);const r=RelativityRenderer.create(c),out=[];
    for(const materialSpectrum of ['fabric','wood','metal'])for(const spectrumModel of ['rgb','blackbody','line']){
      const state={...RelativityExperiments.BASE,environment:'station',scenario:'flyby',shape:'artifact',beta:.6,motionAngle:35,motionElevation:12,view:'photo',time:0,yaw:0,pitch:-.025,fov:58,shadows:false,doppler:true,surfaceMode:'reflection',spectrumModel,materialSpectrum,temperature:6500,lineWavelength:656.3,exposure:-1};
      const mats=r.debugMaterials(state),g=r.debugMaterialSpectrum(state);let count=0,sum=0,max=0;
      for(let y=0;y<g.height;y+=2)for(let x=0;x<g.width;x+=2){
        const ray=RelativityRenderer.trace(state,x+.5,y+.5,g.width,g.height),i=((g.height-1-y)*g.width+x)*4;
        if((ray.hit?RelativityWorlds.material[ray.hit.kind]:0)!==mats.pixels[i])continue;
        const f=RelativityOptics.frequencyFactors(state,ray),expected=RelativityMaterialSpectrum.shift([.2,.4,.7],materialSpectrum,spectrumModel,6500,656.3,f?.total||1,f?.outgoing||1,-1,1);
        for(let k=0;k<3;k++){const d=Math.abs(expected[k]*255-g.pixels[i+k]);sum+=d;max=Math.max(max,d);count++;}
      }out.push({materialSpectrum,spectrumModel,count,mean:sum/count,max});
    }return out;
  });
  for(const row of audit){assert.ok(row.count>100,JSON.stringify(row));assert.ok(row.mean<1.5,JSON.stringify(row));assert.ok(row.max<12,JSON.stringify(row));}
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#material-spectrum').selectOption('wood');await page.locator('#tone-map').selectOption('filmic');
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.materialSpectrum==='wood'&&d.toneMap==='filmic'&&d.quality==='final'&&d.renderPending==='false'},null,{timeout:90000});
  assert.deepEqual(errors,[]);
});
