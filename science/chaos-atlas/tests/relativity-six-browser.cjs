'use strict';
// Optional browser regressions for the six extensions. Requires playwright-core
// and Chromium; the color parity test additionally requires WebGL.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base,failLane=false;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';
    if(name==='/relativity-render-lane.js'&&failLane){
      res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});
      res.end(failLane==='init'?"onmessage=e=>{if(e.data.type==='init')throw Error('injected initialization failure');};":"onmessage=e=>{if(e.data.type==='init')postMessage({type:'ready'});else if(e.data.type==='render')throw Error('injected lane failure');};");return;
    }
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function makePage(t,options={}){
  const {forceLane=false,observeLane=false,lowEnd=false,...pageOptions}=options,args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:900,height:560},reducedMotion:'reduce',...pageOptions});
  if(lowEnd)await page.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>2});});
  if(forceLane||observeLane)await page.addInitScript(force=>{if(force)window.__RELATIVITY_TEST_PARALLEL__=true;window.__laneFrames=[];const Native=window.Worker;window.Worker=function(...args){const w=new Native(...args);w.addEventListener('message',event=>{const m=event.data;if(['frame','preview','lanes','error'].includes(m.type))window.__laneFrames.push({type:m.type,lanes:m.lanes,count:m.count,environment:m.environment,revision:m.revision,interacting:m.interacting});});return w;};window.Worker.prototype=Native.prototype;},forceLane);
  return page;
}
async function open(page,url=base){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:90000});}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false'&&d.drawnYaw===d.yaw;},null,{timeout:180000});}
async function range(page,selector,value){await page.locator(selector).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function axeModal(page){if(!axe)return;await page.addScriptTag({content:axe.source});const issues=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(issues,[]);}

test('two Canvas row bands reuse the identical full-frame rays, including shutter and split', {timeout:120000},async t=>{
  const page=await makePage(t);await open(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    const c=document.createElement('canvas');let count=0,renderer;await new Promise((resolve,reject)=>{renderer=RelativityRenderer.createOffscreenCanvas(c,(name,status)=>status==='error'?reject(Error(name)):++count===9&&resolve());});
    let cases=0,different=0;const per=[];
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer'])for(const shutter of [0,.4]){
      const state={...RelativityExperiments.BASE,environment,scenario,shape:'artifact',beta:.6,view:'split',split:.47,time:0,yaw:.12,pitch:-.025,shutter,renderBudget:97*65},viewport={width:97,height:65};
      function run(region){const job=renderer.beginRender(state,viewport,region?{region}:{});while(!job.step(Infinity)){}return job.result().data;}
      const all=run(null),top=run({start:0,end:34}),bottom=run({start:34,end:65}),joined=new Uint8ClampedArray(all.length);joined.set(top);joined.set(bottom,97*34*4);
      let mismatch=0;for(let i=0;i<all.length;i++)if(all[i]!==joined[i])mismatch++;different+=mismatch;cases++;per.push({environment,scenario,shutter,mismatch});
    }return {cases,different,per};
  });assert.equal(result.cases,20);assert.equal(result.different,0,JSON.stringify(result.per));
});

test('optional two-lane Worker presents only complete matching frames and survives cancellation', {timeout:180000},async t=>{
  const page=await makePage(t,{forceLane:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-scene').dataset.renderLanes==='2',null,{timeout:90000});
  await page.mouse.move(400,250);await page.mouse.down();for(let i=0;i<25;i++){await page.mouse.move(400+i*3,250+i*.3);await page.waitForTimeout(35);}
  await page.waitForFunction(()=>document.querySelector('#relativity-scene').dataset.lastFrameLanes==='2',null,{timeout:30000});
  // Cancel an in-flight old world and keep dragging; no band from it may be
  // presented together with the new world or the new physical beta.
  await page.evaluate(()=>document.querySelector('button[data-environment="harbor"]').click());
  await page.locator('#beta').evaluate(el=>{el.value='.86';el.dispatchEvent(new Event('input',{bubbles:true}));});
  for(let i=25;i<45;i++){await page.mouse.move(400+i*3,250+i*.3);await page.waitForTimeout(35);}
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.drawnEnvironment==='harbor'&&d.beta==='0.86'&&d.interacting==='true';},null,{timeout:60000});
  await page.mouse.up();await final(page);
  const result=await page.evaluate(()=>({stage:{...document.querySelector('#relativity-stage').dataset},canvas:{...document.querySelector('#relativity-scene').dataset},frames:window.__laneFrames}));
  assert.equal(result.stage.drawnEnvironment,'harbor');assert.equal(result.stage.beta,'0.86');assert.equal(result.stage.drawnYaw,result.stage.yaw);assert.equal(result.canvas.lastFrameLanes,'1');
  assert.ok(result.frames.some(f=>f.type==='frame'&&f.lanes===2&&f.interacting));assert.ok(result.frames.some(f=>f.type==='preview'&&f.lanes===2&&!f.interacting));assert.deepEqual(errors,[]);
});

test('a failed helper falls back to one worker without an incomplete or stale image', {timeout:180000},async t=>{
  failLane=true;t.after(()=>{failLane=false;});const page=await makePage(t,{forceLane:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.waitForFunction(()=>document.querySelector('#relativity-scene').dataset.renderLanes==='2',null,{timeout:90000});
  await page.mouse.move(400,250);await page.mouse.down();for(let i=0;i<15;i++){await page.mouse.move(400+i*3,250);await page.waitForTimeout(45);}
  await page.waitForFunction(()=>document.querySelector('#relativity-scene').dataset.renderLanes==='1',null,{timeout:30000});await page.mouse.up();await final(page);
  const result=await page.evaluate(()=>({stage:{...document.querySelector('#relativity-stage').dataset},frames:window.__laneFrames}));
  assert.equal(result.stage.status,'ready');assert.equal(result.stage.drawnYaw,result.stage.yaw);assert.ok(result.frames.some(f=>f.type==='frame'&&f.lanes===1));assert.ok(!result.frames.some(f=>f.type==='error'));assert.deepEqual(errors,[]);
});

test('helper initialization failure leaves the single-worker renderer usable', {timeout:180000},async t=>{
  failLane='init';t.after(()=>{failLane=false;});const page=await makePage(t,{forceLane:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.waitForFunction(()=>window.__laneFrames.some(f=>f.type==='lanes'&&f.count===1),null,{timeout:90000});
  await page.mouse.move(400,250);await page.mouse.down();for(let i=0;i<12;i++){await page.mouse.move(400+i*3,250);await page.waitForTimeout(45);}await page.mouse.up();await final(page);
  assert.equal(await page.locator('#relativity-scene').getAttribute('data-render-lanes'),'1');assert.equal(await page.locator('#relativity-stage').getAttribute('data-status'),'ready');
  assert.ok(await page.evaluate(()=>window.__laneFrames.some(f=>f.type==='frame'&&f.lanes===1)));assert.deepEqual(errors,[]);
});

test('low-end devices do not start an extra lane and hidden pages pause physical frames', {timeout:180000},async t=>{
  const page=await makePage(t,{lowEnd:true,observeLane:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);await page.waitForTimeout(3000);
  assert.equal(await page.locator('#relativity-scene').getAttribute('data-render-lanes'),'1');
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.playing==='true');await page.waitForTimeout(450);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(400);
  const before=await page.evaluate(()=>({time:document.querySelector('#relativity-stage').dataset.time,frames:window.__laneFrames.filter(f=>f.type==='frame'||f.type==='preview').length}));await page.waitForTimeout(900);
  const hidden=await page.evaluate(()=>({time:document.querySelector('#relativity-stage').dataset.time,frames:window.__laneFrames.filter(f=>f.type==='frame'||f.type==='preview').length}));assert.deepEqual(hidden,before);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(t=>Number(document.querySelector('#relativity-stage').dataset.time)>Number(t),before.time,{timeout:30000});await page.locator('#play').click();await final(page);
  assert.ok(await page.evaluate(()=>window.__laneFrames.every(f=>f.type!=='lanes'||f.count===1)));assert.deepEqual(errors,[]);
});

test('mirror, light clock and A/B/M 2+1 slices expose their physical state to interaction and keyboard', {timeout:180000},async t=>{
  const page=await makePage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.locator('button[data-environment="harbor"]').click();await final(page);await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  await page.locator('#open-mirror-lab').click();assert.equal(await page.locator('#mirror-dialog').getAttribute('open'),'');
  await range(page,'#mirror-beta',.8);assert.equal(await page.locator('#mirror-dialog').getAttribute('data-frequency'),'0.111');assert.equal(await page.locator('#mirror-dialog').getAttribute('data-status'),'hit');
  await page.locator('#mirror-canvas').focus();let yaw=await page.locator('#mirror-canvas').getAttribute('data-camera-yaw');await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#mirror-canvas').getAttribute('data-camera-yaw'),yaw);
  await range(page,'#mirror-angle',35);assert.notEqual(await page.locator('#mirror-dialog').getAttribute('data-frequency'),null);await page.keyboard.press('Escape');assert.equal(await page.locator('#mirror-dialog').isHidden(),true);
  await page.locator('#open-light-clock').click();await range(page,'#clock-beta',-.6);await page.locator('button[data-clock-angle="0"]').click();
  assert.equal(await page.locator('#clock-dialog').getAttribute('data-round-proper'),'6.000');assert.equal(await page.locator('#clock-dialog').getAttribute('data-round-lab'),'7.500');
  assert.equal(await page.locator('#clock-dialog').getAttribute('data-clock-b'),'1.800');assert.ok(await page.locator('#clock-events tr').count()>=5);
  await page.locator('#clock-canvas').focus();yaw=await page.locator('#clock-canvas').getAttribute('data-camera-yaw');await page.keyboard.press('ArrowLeft');assert.notEqual(await page.locator('#clock-canvas').getAttribute('data-camera-yaw'),yaw);await page.keyboard.press('Escape');assert.equal(await page.locator('#clock-dialog').isHidden(),true);
  await page.locator('#toggle-controls').click();await page.locator('#relativity-scene').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!!document.querySelector('#relativity-stage').dataset.probe,null,{timeout:60000});if(await page.locator('#knowledge-panel').isHidden())await page.locator('#toggle-knowledge').click();await page.locator('#pin-ray').click();
  await page.locator('#relativity-scene').focus();await page.keyboard.press('Shift+ArrowRight');await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.reference!==undefined,null,{timeout:60000});
  await page.waitForFunction(()=>!document.querySelector('#open-ray-space').disabled,null,{timeout:60000});await page.locator('#open-ray-space').click();await page.locator('button[data-diagram="slice"]').click();
  for(const id of ['A','B','M']){
    await page.locator('#slice-plane').selectOption(id);await page.waitForFunction(x=>document.querySelector('#slice-canvas').dataset.plane===x,id);
    assert.match(await page.locator('#slice-status').innerText(),new RegExp(id+'：位于切片'));
  }
  await page.locator('#slice-canvas').focus();const draws=Number(await page.locator('#slice-canvas').getAttribute('data-draws'));await page.keyboard.press('ArrowRight');assert.ok(Number(await page.locator('#slice-canvas').getAttribute('data-draws'))>draws);
  assert.equal(await page.evaluate(()=>document.fonts.check('11px "Noto Sans SC Variable"','实验室空间切片')),true);await axeModal(page);await page.keyboard.press('Escape');assert.equal(await page.locator('#ray-space-dialog').isHidden(),true);assert.deepEqual(errors,[]);
});

test('mobile local-file labs, keyboard and 2+1 slice remain usable with no network', {timeout:180000},async t=>{
  const page=await makePage(t,{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}),external=[],errors=[];page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await open(page,pathToFileURL(path.join(root,'relativity.html')).href);await final(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('button[data-environment="harbor"]').tap();await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-drawn-environment'),'harbor');assert.equal(await page.locator('#relativity-scene').getAttribute('data-harbor-metal-loaded'),'true');
  const touch=await page.context().newCDPSession(page);async function dragTouch(selector){const r=await page.locator(selector).boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2;await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+36,y:y+12}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  for(const [openButton,dialog,canvas,close] of [['#open-mirror-lab','#mirror-dialog','#mirror-canvas','#close-mirror-lab'],['#open-light-clock','#clock-dialog','#clock-canvas','#close-light-clock']]){
    await page.locator(openButton).click();const bounds=await page.locator(dialog).boundingBox();assert.ok(bounds.width<=390&&bounds.height<=844,JSON.stringify(bounds));
    await page.locator(canvas).focus();const yaw=await page.locator(canvas).getAttribute('data-camera-yaw');await page.keyboard.press('ArrowRight');const keyYaw=await page.locator(canvas).getAttribute('data-camera-yaw');assert.notEqual(keyYaw,yaw);await dragTouch(canvas);assert.notEqual(await page.locator(canvas).getAttribute('data-camera-yaw'),keyYaw);await page.locator(close).click();
  }
  await page.locator('#toggle-controls').click();await page.locator('#toggle-knowledge').click();await page.waitForFunction(()=>!document.querySelector('#open-ray-space').disabled,null,{timeout:60000});await page.locator('#open-ray-space').click();await page.locator('button[data-diagram="slice"]').click();await page.locator('#slice-plane').selectOption('M');
  assert.match(await page.locator('#slice-status').innerText(),/M：位于切片/);await page.locator('#slice-canvas').focus();await page.keyboard.press('ArrowUp');const draws=Number(await page.locator('#slice-canvas').getAttribute('data-draws'));await dragTouch('#slice-canvas');assert.ok(Number(await page.locator('#slice-canvas').getAttribute('data-draws'))>draws);await axeModal(page);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});

test('harbor Canvas and WebGL agree on textured finite geometry, light and material colors', {timeout:180000,skip:process.env.RELATIVITY_NO_WEBGL==='1'},async t=>{
  const page=await makePage(t);await open(page);
  const result=await page.evaluate(async()=>{
    const R=RelativityRenderer,view={width:160,height:100,dpr:1};let cpu,gpu;
    await Promise.all([
      new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');cpu=R.createOffscreenCanvas(c,(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());}),
      new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');c.style='width:160px;height:100px';document.body.append(c);gpu=R.create(c,{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});})
    ]);if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const out=[];
    for(const scenario of ['flyby','observer'])for(const materialSpectrum of ['texture','metal'])for(const beta of [0,.6]){
      const state={...RelativityExperiments.BASE,environment:'harbor',shape:'artifact',scenario,beta,materialSpectrum,view:'photo',fov:58,time:0,renderBudget:16000,shadows:true};cpu.render(state,false,view);gpu.render(state,false,view);
      const a=cpu.canvas.getContext('2d').getImageData(0,0,160,100).data,gl=gpu.canvas.getContext('webgl'),b=new Uint8Array(a.length);gl.readPixels(0,0,160,100,gl.RGBA,gl.UNSIGNED_BYTE,b);
      let sum=0,n=0,bad=0,max=0;const seen={};for(let y=0;y<100;y++)for(let x=0;x<160;x++){
        const hit=R.trace(state,x+.5,y+.5,160,100).hit,kind=hit?.kind||'sky';seen[kind]=(seen[kind]||0)+1;
        for(let k=0;k<3;k++){const d=Math.abs(a[(y*160+x)*4+k]-b[((99-y)*160+x)*4+k]);sum+=d;n++;if(d>20)bad++;max=Math.max(max,d);}
      }out.push({scenario,materialSpectrum,beta,mean:sum/n,bad:bad/n,max,seen});
    }return out;
  });
  assert.equal(result.length,8);for(const r of result){assert.ok(r.mean<2.5,JSON.stringify(r));assert.ok(r.bad<.01,JSON.stringify(r));assert.ok(r.seen['cargo-container']>100);assert.ok(r.seen.sky>100);}
  t.diagnostic(JSON.stringify(result.map(({scenario,materialSpectrum,beta,mean,bad,max})=>({scenario,materialSpectrum,beta,mean,bad,max}))));
});

test('harbor reaches WebGL high quality and its containers remain pickable finite geometry', {timeout:240000,skip:process.env.RELATIVITY_NO_WEBGL==='1'},async t=>{
  const page=await makePage(t,{viewport:{width:800,height:600}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.locator('button[data-environment="harbor"]').click();await final(page);await page.locator('#toggle-controls').click();await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.drawnEnvironment==='harbor'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:180000});
  const size=await page.locator('#relativity-scene').evaluate(c=>({width:c.width,height:c.height,slices:Number(c.dataset.renderSlices)}));assert.ok(size.width>=790&&size.height>=590,JSON.stringify(size));assert.ok(size.slices>1,'high-quality harbor render should use multiple GPU tiles');
  await page.locator('#toggle-controls').click();
  const hit=await page.evaluate(()=>{
    const c=document.querySelector('#relativity-scene'),r=c.getBoundingClientRect(),state={...RelativityExperiments.BASE,environment:'harbor'};
    for(let y=70;y<r.height-120;y+=5)for(let x=42;x<r.width-35;x+=5){const p=RelativityRenderer.trace(state,x,y,r.width,r.height).hit;if(p?.kind==='cargo-container'&&document.elementFromPoint(r.left+x,r.top+y)===c)return {x:r.left+x,y:r.top+y,distance:p.distance};}return null;
  });
  assert.ok(hit,'a real container should be visible and selectable');await page.mouse.click(hit.x,hit.y);await page.waitForFunction(distance=>{const d=document.querySelector('#relativity-stage').dataset;return d.probe==='cargo-container'&&Math.abs(Number(d.probeDistance)-distance)<1e-5;},hit.distance,{timeout:30000});
  assert.match(await page.locator('#probe-summary').innerText(),/集装箱/);assert.deepEqual(errors,[]);
});
