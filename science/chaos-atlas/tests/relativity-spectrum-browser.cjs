'use strict';
// Browser regressions for spectrum visibility, the master switch and SDR fog.
// Requires playwright-core and Chromium; GPU cases require WebGL.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  return browser.newPage({viewport:{width:1200,height:750},reducedMotion:'reduce',...options});
}
async function open(page,url=base){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:120000});}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:180000});}
async function plot(page){return page.locator('#spectrum-plot').evaluate(c=>{
  const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let cyan=0,orange=0,hash=2166136261;
  for(let i=0;i<a.length;i+=4){const r=a[i],g=a[i+1],b=a[i+2];if(g>145&&b>125&&g-r>35)cyan++;if(r>170&&r-g>30&&g-b>20)orange++;hash=Math.imul(Math.imul(Math.imul(hash^r,16777619)^g,16777619)^b,16777619)>>>0;}
  return {model:c.dataset.model,samples:Number(c.dataset.samples),cyan,orange,hash,describedby:c.getAttribute('aria-describedby')};
});}
async function frame(page){return page.locator('#relativity-scene').evaluate(c=>{
  const s=document.createElement('canvas');s.width=c.width;s.height=c.height;const x=s.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0);const a=x.getImageData(0,0,s.width,s.height).data;let h1=2166136261,h2=0;
  for(const n of a){h1=Math.imul(h1^n,16777619)>>>0;h2=(h2+n)>>>0;}
  const i=(Math.floor(s.height*.6)*s.width+Math.floor(s.width/3))*4;return {width:s.width,height:s.height,hash:h1,sum:h2,floor:Array.from(a.slice(i,i+3))};
});}
async function frameDelta(page,save=false){return page.locator('#relativity-scene').evaluate((c,save)=>{
  const s=document.createElement('canvas');s.width=c.width;s.height=c.height;const x=s.getContext('2d',{willReadFrequently:true});x.drawImage(c,0,0);const a=x.getImageData(0,0,s.width,s.height).data;
  if(save){window.__spectrumBaseline={width:s.width,height:s.height,pixels:a.slice()};return {width:s.width,height:s.height};}
  const ref=window.__spectrumBaseline;if(!ref||ref.width!==s.width||ref.height!==s.height)throw Error('frame dimensions changed');
  let sum=0,bad=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-ref.pixels[i]);sum+=d;if(d>12)bad++;max=Math.max(max,d);}return {mean:sum/a.length,bad:bad/a.length,max};
},save);}

test('worker Canvas shows the RGB reference and switches all spectral coloring off without hiding natural material colors', {timeout:240000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  assert.equal(await page.locator('#relativity-stage').getAttribute('data-worker'),'true');
  let chart=await plot(page);assert.equal(chart.model,'rgb');assert.equal(chart.samples,501);assert.ok(chart.cyan>15&&chart.orange>15,JSON.stringify(chart));assert.match(chart.describedby,/spectrum-status/);
  assert.match(await page.locator('#spectrum-status').textContent(),/RGB 假设谱（单位线性白）/);assert.match(await page.locator('#spectrum-status').textContent(),/先采样/);
  await page.locator('#dock-doppler').click();await final(page);const baseline=await frame(page);
  assert.equal(await page.locator('#dock-doppler').getAttribute('aria-pressed'),'false');assert.match(await page.locator('#dock-optics-note').textContent(),/保留材质原色/);
  assert.ok(baseline.floor[0]<210&&baseline.floor[0]-baseline.floor[1]<35&&baseline.floor[0]-baseline.floor[2]<45,JSON.stringify(baseline));
  assert.match(await page.locator('#spectrum-status').textContent(),/光谱已关闭/);chart=await plot(page);assert.ok(chart.cyan>15&&chart.orange>15,JSON.stringify(chart));
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();
  assert.equal(await page.locator('#exposure').isDisabled(),true);
  await page.locator('#spectrum-model').selectOption('line');await page.locator('#material-spectrum').selectOption('fabric');await final(page);
  assert.deepEqual(await frame(page),baseline,'line and material selections do not recolor the off-state frame');
  assert.equal(await page.locator('#spectrum-model').inputValue(),'line');assert.equal(await page.locator('#material-spectrum').inputValue(),'fabric');
  assert.match(await page.locator('#spectrum-status').textContent(),/高斯谱线/);assert.equal((await plot(page)).model,'line');
  await page.locator('#toggle-emission').click();await final(page);assert.notDeepEqual(await frame(page),baseline,'independent emission-time false color still works');
  assert.match(await page.locator('#dock-optics-note').textContent(),/伪彩仍开/);assert.match(await page.locator('#spectrum-status').textContent(),/伪彩独立开启/);
  await page.locator('#toggle-emission').click();await final(page);assert.deepEqual(await frame(page),baseline);
  await page.locator('#surface-mode').selectOption('emission');await final(page);assert.deepEqual(await frame(page),baseline);
  await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();
  assert.match(await page.locator('#probe-summary').textContent(),/理论值，未用于画面/);const theoretical=Number((await page.locator('#relativity-stage').getAttribute('data-probe-doppler')));
  assert.ok(Math.abs(theoretical-1)>.05,`expected a nontrivial theoretical factor, got ${theoretical}`);assert.equal(await page.locator('#relativity-stage').getAttribute('data-spectrum-d'),'1.000000');
  await page.locator('#dock-doppler').click();await final(page);assert.equal(await page.locator('#toggle-doppler').getAttribute('aria-pressed'),'true');
  assert.ok(Math.abs(Number(await page.locator('#relativity-stage').getAttribute('data-spectrum-d'))-theoretical)<1e-5);assert.notDeepEqual(await frame(page),baseline);
  assert.equal(await page.locator('#exposure').isDisabled(),false);assert.equal(await page.locator('#material-spectrum').inputValue(),'fabric');
  await page.locator('#toggle-doppler').click();await final(page);assert.equal(await page.locator('#dock-doppler').getAttribute('aria-pressed'),'false');assert.deepEqual(await frame(page),baseline);
  await page.locator('#spectrum-model').selectOption('rgb');await final(page);const rgbOff=await plot(page);assert.equal(rgbOff.model,'rgb');
  await page.locator('#toggle-doppler').click();await final(page);const rgbOn=await plot(page);
  assert.equal(rgbOn.model,'rgb');assert.notEqual(rgbOn.hash,rgbOff.hash,'the default RGB chart must respond to the sampled D');assert.ok(rgbOn.cyan>15&&rgbOn.orange>15,JSON.stringify(rgbOn));
  assert.ok(Math.abs(Number(await page.locator('#relativity-stage').getAttribute('data-spectrum-d'))-theoretical)<1e-5);
  assert.deepEqual(errors,[]);
});

test('Canvas and WebGL bypass source/material spectra in all worlds and agree on bounded fog', {timeout:240000,skip:process.env.RELATIVITY_NO_WEBGL==='1'},async t=>{
  const page=await newPage(t,{viewport:{width:650,height:420}});await open(page);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    const R=RelativityRenderer,view={width:96,height:60,dpr:1};let cpu,gpu;
    await Promise.all([
      new Promise((resolve,reject)=>{let n=0;cpu=R.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve());}),
      new Promise((resolve,reject)=>{let n=0;const c=document.createElement('canvas');c.style='width:96px;height:60px';document.body.append(c);gpu=R.create(c,{onAsset:(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve()});})
    ]);if(gpu.kind!=='webgl')throw Error('WebGL unavailable');const gl=gpu.canvas.getContext('webgl'),out=[];
    const read=state=>{cpu.render(state,false,view);gpu.render(state,false,view);const a=cpu.canvas.getContext('2d').getImageData(0,0,96,60).data.slice(),b=new Uint8Array(a.length);gl.readPixels(0,0,96,60,gl.RGBA,gl.UNSIGNED_BYTE,b);return {a,b};};
    const mismatch=(a,b)=>{let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n;};
    // SwiftShader can vary a few texture/geometry-edge pixels on identical
    // repeated draws, so assess off-state GPU changes with a numeric tolerance.
    const difference=(a,b)=>{let sum=0,bad=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);sum+=d;if(d>12)bad++;max=Math.max(max,d);}return {mean:sum/a.length,bad:bad/a.length,max};};
    for(const environment of RelativityWorlds.IDs)for(const scenario of ['flyby','observer']){
      const base={...RelativityExperiments.BASE,environment,scenario,shape:'artifact',view:'photo',beta:.6,doppler:false,shadows:true,renderBudget:5760};
      const reference=read(base),variants=[];
      for(const [spectrumModel,materialSpectrum,surfaceMode,exposure] of [['line','texture','emission',4],['line','fabric','reflection',-8],['blackbody','wood','reflection',2],['rgb','metal','reflection',-4]]){
        const actual=read({...base,spectrumModel,materialSpectrum,surfaceMode,exposure});variants.push({spectrumModel,materialSpectrum,surfaceMode,cpu:mismatch(reference.a,actual.a),gpu:difference(reference.b,actual.b)});
      }
      let sum=0,bad=0,count=0;for(let y=0;y<60;y++)for(let x=0;x<96;x++)for(let k=0;k<3;k++){
        const delta=Math.abs(reference.a[(y*96+x)*4+k]-reference.b[((59-y)*96+x)*4+k]);sum+=delta;count++;if(delta>20)bad++;
      }
      const natural=read({...base,emissionMap:true}),falseColor={cpu:mismatch(reference.a,natural.a),gpu:mismatch(reference.b,natural.b)};
      let enabled=null;if(environment==='station'&&scenario==='flyby'){
        const white=read({...base,doppler:true}),line=read({...base,doppler:true,spectrumModel:'line',materialSpectrum:'fabric'});
        enabled={cpu:mismatch(white.a,line.a),gpu:mismatch(white.b,line.b)};
      }
      out.push({environment,scenario,variants,mean:sum/count,bad:bad/count,falseColor,enabled});
    }return out;
  });
  t.diagnostic(JSON.stringify(result.map(({environment,scenario,mean,bad,variants})=>({environment,scenario,mean,bad,off:variants.map(v=>v.gpu)}))));
  assert.equal(result.length,10);for(const r of result){
    for(const v of r.variants){assert.equal(v.cpu,0,JSON.stringify({world:r.environment,scenario:r.scenario,...v}));assert.ok(v.gpu.mean<.1&&v.gpu.bad<.001,JSON.stringify({world:r.environment,scenario:r.scenario,...v}));}
    assert.ok(r.mean<5.5&&r.bad<.03,JSON.stringify(r));assert.ok(r.falseColor.cpu>100&&r.falseColor.gpu>100,JSON.stringify(r));
    if(r.enabled)assert.ok(r.enabled.cpu>100&&r.enabled.gpu>100,JSON.stringify(r));
  }
});

test('worker WebGL also honors the master switch and keeps the chosen spectrum for re-enabling', {timeout:240000,skip:process.env.RELATIVITY_NO_WEBGL==='1'},async t=>{
  const page=await newPage(t,{viewport:{width:480,height:300}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
  await page.locator('#toggle-controls').click();await page.locator('button[data-render-mode="webgl"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.renderer==='webgl'&&d.worker==='true'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:180000});
  await page.locator('#advanced-physics > summary').click();await page.locator('#toggle-doppler').click();await final(page);await frameDelta(page,true);
  await page.locator('#spectrum-model').selectOption('line');await page.locator('#material-spectrum').selectOption('wood');await final(page);
  const off=await frameDelta(page);assert.ok(off.mean<.1&&off.bad<.001,JSON.stringify(off));assert.equal(await page.locator('#exposure').isDisabled(),true);
  await page.locator('#toggle-doppler').click();await final(page);const on=await frameDelta(page);assert.ok(on.mean>.1,JSON.stringify(on));assert.equal(await page.locator('#spectrum-model').inputValue(),'line');assert.deepEqual(errors,[]);
});

test('playback and camera-only changes do not repeatedly recompute an unchanged spectrum plot', {timeout:180000},async t=>{
  const page=await newPage(t,{viewport:{width:800,height:500}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  const draws=Number(await page.locator('#spectrum-plot').getAttribute('data-draws'));assert.ok(draws>=1);
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#relativity-stage').dataset.time)>.2,null,{timeout:30000});
  assert.equal(Number(await page.locator('#spectrum-plot').getAttribute('data-draws')),draws);
  await page.locator('#play').click();await final(page);await page.locator('#relativity-scene').focus();await page.keyboard.press('ArrowLeft');
  assert.equal(Number(await page.locator('#spectrum-plot').getAttribute('data-draws')),draws);await final(page);
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#spectrum-model').selectOption('line');
  assert.equal(Number(await page.locator('#spectrum-plot').getAttribute('data-draws')),draws+1);assert.equal((await plot(page)).model,'line');
  await page.locator('#toggle-controls').click();await page.locator('#view-geometry').click();await final(page);await page.locator('#toggle-knowledge').click();await page.locator('#probe-center').click();
  assert.match(await page.locator('#spectrum-status').textContent(),/同时几何不是照片/);assert.equal(await page.locator('#relativity-stage').getAttribute('data-spectrum-d'),'1.000000');assert.deepEqual(errors,[]);
});

test('offline mobile page displays the reference chart and retains unshifted material colors', {timeout:240000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1}),external=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))external.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
  await open(page,pathToFileURL(path.join(root,'relativity.html')).href);await final(page);assert.equal(await page.locator('#relativity-stage').getAttribute('data-worker'),'false');
  const chart=await plot(page);assert.equal(chart.model,'rgb');assert.ok(chart.cyan>15&&chart.orange>15,JSON.stringify(chart));
  await page.locator('#dock-doppler').tap();await final(page);const baseline=await frame(page);
  await page.locator('#toggle-controls').click();await page.locator('#advanced-physics > summary').click();await page.locator('#spectrum-model').selectOption('line');await page.locator('#material-spectrum').selectOption('metal');await final(page);
  assert.deepEqual(await frame(page),baseline);assert.equal(await page.locator('#exposure').isDisabled(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
  await page.locator('#toggle-controls').click();await page.locator('#toggle-knowledge').click();await page.locator('.spectrum-card').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#spectrum-plot').isVisible(),true);assert.match(await page.locator('#spectrum-status').textContent(),/光谱已关闭/);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});
