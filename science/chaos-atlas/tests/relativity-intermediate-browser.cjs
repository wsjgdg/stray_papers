'use strict';
// NODE_PATH=... CHROMIUM_PATH=... node --test tests/relativity-intermediate-browser.cjs
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core');const root=path.resolve(__dirname,'..');let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();const ext=path.extname(file),mime=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':ext==='.jpg'?'image/jpeg':'application/octet-stream';fs.readFile(file,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'}).end(b));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,{memory=4,viewport={width:480,height:300},budget=24*1024*1024,cooperative=false}={}){
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  const page=await browser.newPage({viewport,reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({memory,budget,cooperative})=>{Object.defineProperty(navigator,'deviceMemory',{value:memory,configurable:true});window.__RELATIVITY_INTERMEDIATE_BUDGET__=budget;if(cooperative)window.__RELATIVITY_DISABLE_WORKER__=true;},{memory,budget,cooperative});
  await page.goto(base);await final(page);return {page,errors};
}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage')?.dataset;return d?.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:90000});}

test('cached geometry, material and visibility give byte-identical freshly shaded pixels across optics and invalidations', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const results=await page.evaluate(async()=>{
    async function make(){return new Promise((resolve,reject)=>{let n=0;const renderer=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>{if(status==='error')reject(Error(name));else if(++n===9)resolve(renderer);});});}
    const cached=await make(),fresh=await make(),width=160,height=100,view={width,height,dpr:1},base={...RelativityExperiments.BASE,renderBudget:width*height};
    const changes=[{}, {doppler:false},{doppler:false,shadows:false},{doppler:true,shadows:true},{softShadows:true},{softShadows:true,doppler:false},
      {softShadows:true,doppler:false,shadowSamples:8},{shadowTiming:'instant'},{spectrumSplit:true,doppler:false},{emissionMap:true},
      {materialSpectrum:'usgs-pine',spectrumModel:'line',lineWavelength:486.1,roughnessScale:1.5,exposure:1},
      {yaw:.2},{yaw:.2,lightX:1.2},{yaw:.2,lightX:1.2,doppler:false},{environment:'street',secondEnabled:true,shape:'sphere',beta:.82,secondBeta:-.7},
      {environment:'street',secondEnabled:true,shape:'sphere',beta:.82,secondBeta:-.7,doppler:false},
      {environment:'street',scenario:'observer',view:'split',beta:.7},{environment:'street',scenario:'observer',view:'split',beta:.7,doppler:false},
      {environment:'mountain',view:'photo',shadowTiming:'split',secondEnabled:true},{environment:'harbor',time:1.1},{sceneMirror:true},{shutter:.4}];
    const out=[];for(const change of changes){
      const state={...base,...change};cached.render(state,false,view);fresh.render({...state,reuseIntermediate:false},false,view);
      const a=cached.canvas.getContext('2d').getImageData(0,0,width,height).data,b=fresh.canvas.getContext('2d').getImageData(0,0,width,height).data;
      let different=0,max=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)different++;max=Math.max(max,d);}
      out.push({change,different,max,stats:cached.intermediateCacheStats()});
    }return out;
  });
  for(const r of results)assert.equal(r.different,0,JSON.stringify(r));
  assert.equal(results[1].stats.geometryHits,16000);assert.ok(results[1].stats.materialHits>10000);assert.ok(results[1].stats.shadowHits>10000);
  assert.ok(results[2].stats.geometryHits>10000);assert.equal(results[2].stats.shadowHits,0);
  assert.equal(results[4].stats.shadowHits,0,'switching to soft visibility must trace again');assert.ok(results[5].stats.shadowHits>10000);
  assert.equal(results[6].stats.shadowHits,0,'changing sample count invalidates soft visibility');
  assert.equal(results[11].stats.geometryHits,0,'new camera is not the old geometry');assert.equal(results[12].stats.geometryHits,0,'moving the light invalidates material and visibility');
  assert.equal(results.at(-1).stats.active,false);assert.equal(results.at(-2).stats.active,false);assert.deepEqual(errors,[]);
});

test('low-memory buffer retains exact rays at full coverage within its typed-buffer budget', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,budget:8*1024*1024});await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    async function make(){return new Promise((resolve,reject)=>{let n=0;const r=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve(r));});}
    const a=await make(),b=await make(),width=500,height=320,view={width,height,dpr:1},s={...RelativityExperiments.BASE,renderBudget:width*height};
    a.render(s,false,view);a.render({...s,doppler:false},false,view);b.render({...s,doppler:false,reuseIntermediate:false},false,view);
    const x=a.canvas.getContext('2d').getImageData(0,0,width,height).data,y=b.canvas.getContext('2d').getImageData(0,0,width,height).data;let different=0;for(let i=0;i<x.length;i++)different+=x[i]!==y[i];
    const stats=a.intermediateCacheStats();a.clearIntermediateCache();return {stats,different,cleared:a.intermediateCacheStats()};
  });
  assert.equal(result.different,0);assert.equal(result.stats.stride,1,JSON.stringify(result));assert.equal(result.stats.geometryHits,160000);assert.ok(result.stats.materialHits>50000);assert.ok(result.stats.shadowHits>100000);assert.ok(result.stats.bytes<=result.stats.maxBytes);assert.equal(result.cleared.bytes,0);assert.deepEqual(errors,[]);
});

test('compact Float64 cache matches uncached rendering through worlds, bodies, aberration and visibility', {timeout:240000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,budget:1024*1024});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const results=await page.evaluate(async()=>{
    async function make(){return new Promise((resolve,reject)=>{let n=0;const r=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve(r));});}
    const a=await make(),b=await make(),width=160,height=100,viewport={width,height,dpr:1};
    const common={...RelativityExperiments.BASE,renderBudget:width*height,yaw:.23,pitch:-.08,beta:.83};
    const cases=[];
    for(const environment of ['station','street','corridor','mountain','harbor'])for(const scenario of ['flyby','observer']){
      const base={...common,environment,scenario,view:'photo',shape:environment==='street'?'sphere':'artifact',secondEnabled:scenario==='flyby'};
      cases.push({base,change:{doppler:false}});
      cases.push({base,change:{shadows:false}});
    }
    cases.push({base:{...common,view:'split',secondEnabled:true,shadowTiming:'split',spectrumSplit:true},change:{shadows:false}});
    cases.push({base:{...common,scenario:'observer',view:'split',shadowTiming:'instant'},change:{doppler:false}});
    cases.push({base:{...common,softShadows:true,shadowSamples:4},change:{doppler:false}});
    cases.push({base:{...common,shadows:false},change:{shadows:true}});
    cases.push({base:{...common,shape:'sphere',surfaceMode:'reflection',materialSpectrum:'usgs-pine'},change:{doppler:false}});
    const out=[];
    for(const {base,change} of cases){
      a.render(base,false,viewport);const state={...base,...change};a.render(state,false,viewport);b.render({...state,reuseIntermediate:false},false,viewport);
      const x=a.canvas.getContext('2d').getImageData(0,0,width,height).data,y=b.canvas.getContext('2d').getImageData(0,0,width,height).data;
      let different=0;for(let i=0;i<x.length;i++)different+=x[i]!==y[i];out.push({case:{environment:base.environment,scenario:base.scenario,view:base.view,soft:base.softShadows,change},different,stats:a.intermediateCacheStats()});
    }return out;
  });
  for(const result of results){assert.equal(result.different,0,JSON.stringify(result));assert.ok(result.stats.geometryHits>0,JSON.stringify(result));assert.ok(result.stats.bytes<=result.stats.maxBytes,JSON.stringify(result));}
  assert.deepEqual(errors,[]);
});

test('compact cache reproduces exact ray directions and hit geometry, including observer aberration and body normals', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,budget:384*1024});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(()=>{
    const R=RelativityRenderer,width=128,height=80,diffs=[],totals={hit:0,sky:0,body:0,checked:0};
    function compare(a,b,key,caseName){
      const x=a?.[key],y=b?.[key];if(Array.isArray(x)){if(!Array.isArray(y)||x.length!==y.length||x.some((n,i)=>!Object.is(n,y[i])))diffs.push({caseName,key,x,y});}
      else if(!Object.is(x,y))diffs.push({caseName,key,x,y});
    }
    for(const environment of ['station','street','corridor','mountain','harbor'])for(const scenario of ['flyby','observer']){
      const state={...RelativityExperiments.BASE,environment,scenario,shape:'artifact',secondEnabled:scenario==='flyby',beta:.87,yaw:.19,pitch:-.12,view:'photo'};
      const cache=R.createIntermediateRayCache(384*1024);cache.begin(state,width,height);const trace=R.prepareTrace(state,width,height,null,true,cache),name=environment+'/'+scenario;
      for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){
        const a=trace(x+.5,y+.5),b=trace(x+.5,y+.5);totals.checked++;if(a.hit){totals.hit++;if(a.hit.body)totals.body++;}else totals.sky++;
        compare(a,b,'labDirection',name);compare(a,b,'photo',name);compare(a,b,'shadowInstant',name);
        if(!!a.hit!==!!b.hit)diffs.push({caseName:name,key:'hit-presence'});
        else if(a.hit)for(const key of ['kind','material','distance','normal','point','body','bodyId','restPoint','restNormal'])compare(a.hit,b.hit,key,name);
        if(diffs.length>10)return {diffs,totals,stats:cache.stats()};
      }
      if(cache.stats().bytes>cache.stats().maxBytes)diffs.push({caseName:name,key:'budget'});
    }
    return {diffs,totals};
  });
  assert.deepEqual(result.diffs,[],JSON.stringify(result));assert.ok(result.totals.checked>20000);assert.ok(result.totals.hit>1000);assert.ok(result.totals.body>0);assert.deepEqual(errors,[]);
});

test('very small intermediate budgets fall back to exact sparse rays without exceeding the limit', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,budget:128*1024});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    async function make(){return new Promise((resolve,reject)=>{let n=0;const r=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve(r));});}
    const a=await make(),b=await make(),width=200,height=120,view={width,height,dpr:1},s={...RelativityExperiments.BASE,renderBudget:width*height,shape:'sphere',secondEnabled:true};
    a.render(s,false,view);a.render({...s,doppler:false},false,view);b.render({...s,doppler:false,reuseIntermediate:false},false,view);
    const x=a.canvas.getContext('2d').getImageData(0,0,width,height).data,y=b.canvas.getContext('2d').getImageData(0,0,width,height).data;let different=0;for(let i=0;i<x.length;i++)different+=x[i]!==y[i];
    return {different,stats:a.intermediateCacheStats()};
  });
  assert.equal(result.different,0);assert.ok(result.stats.stride>=2,JSON.stringify(result));assert.ok(result.stats.geometryHits>0);assert.ok(result.stats.bytes<=result.stats.maxBytes);assert.deepEqual(errors,[]);
});

test('clearing a populated buffer also cancels its fast-reuse schedule', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,budget:1024*1024});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(async()=>{
    const r=await new Promise((resolve,reject)=>{let n=0;const x=RelativityRenderer.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?reject(Error(name)):++n===9&&resolve(x));});
    const width=160,height=100,view={width,height,dpr:1},state={...RelativityExperiments.BASE,renderBudget:width*height};
    const cold=r.beginRender(state,view),before=cold.reusesGeometry;while(!cold.step(Infinity)){}cold.commit();
    const warm=r.beginRender({...state,doppler:false},view),reused=warm.reusesGeometry;r.clearIntermediateCache();const cleared=warm.reusesGeometry;
    while(!warm.step(Infinity)){}warm.commit();return {before,reused,cleared,stats:r.intermediateCacheStats()};
  });
  assert.equal(result.before,false);assert.equal(result.reused,true);assert.equal(result.cleared,false);assert.equal(result.stats.bytes,0);assert.deepEqual(errors,[]);
});

test('optical switch labels waiting and matching previews without exposing the old frame', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:2,viewport:{width:800,height:500}});
  const pending=await page.evaluate(()=>{document.querySelector('#dock-doppler').click();const s=document.querySelector('#relativity-stage'),c=document.querySelector('#relativity-scene');return {message:document.querySelector('#scene-preparing').textContent,opacity:getComputedStyle(c).opacity,pending:s.dataset.renderPending};});
  assert.match(pending.message,/更新光谱 \/ 阴影/);assert.equal(pending.opacity,'0');assert.equal(pending.pending,'true');
  // The Worker does not claim to have a preview before it presents one.
  assert.equal(await page.locator('#scene-quality').evaluate(e=>e.hidden),true);
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.quality==='preview'&&d.renderPending==='false'&&d.qualityPending==='true';},null,{timeout:30000});
  assert.match(await page.locator('#quality-hint').textContent(),/匹配预览已显示/);assert.match(await page.locator('#quality-phase').textContent(),/细化中/);
  await final(page);assert.deepEqual(errors,[]);
});

test('worker reuses paused optical intermediates, invalidates changed lights, and stops when cache is disabled', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:4});
  async function d(){return page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));}
  async function press(sel){await page.evaluate(sel=>document.querySelector(sel).click(),sel);await final(page);}
  await press('#dock-doppler');let x=await d();assert.equal(x.stillCacheHit,'false');assert.equal(x.intermediateActive,'true');assert.ok(Number(x.intermediateGeometryHits)>100000,JSON.stringify(x));assert.ok(Number(x.intermediateMaterialHits)>10000);assert.ok(Number(x.intermediateShadowHits)>10000);assert.ok(Number(x.intermediateBytes)<=Number(x.intermediateLimit));
  await press('#dock-shadows');x=await d();assert.ok(Number(x.intermediateGeometryHits)>100000);assert.equal(x.intermediateShadowHits,'0');
  await page.evaluate(()=>{const el=document.querySelector('#light-x');el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await final(page);x=await d();assert.equal(x.intermediateGeometryHits,'0');
  await page.evaluate(()=>document.querySelector('#toggle-still-cache').click());await page.evaluate(()=>document.querySelector('#dock-doppler').click());await final(page);x=await d();assert.equal(x.intermediateActive,'false');assert.equal(x.intermediateBytes,'0');assert.deepEqual(errors,[]);
});


test('cooperative Canvas reuses exact intermediates and clears them while a render is underway', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:4,cooperative:true,viewport:{width:800,height:500}});
  async function d(){return page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));}
  await page.evaluate(()=>document.querySelector('#dock-doppler').click());await final(page);let x=await d();
  assert.equal(x.worker,'false');assert.equal(x.renderer,'canvas');assert.equal(x.intermediateActive,'true');assert.ok(Number(x.intermediateGeometryHits)>50000,JSON.stringify(x));
  // Clear during a new, still-incomplete optical job. No partially filled
  // buffer can survive, and the final state must remain the latest one.
  await page.evaluate(()=>document.querySelector('#dock-shadows').click());
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='true');await page.waitForTimeout(80);
  await page.evaluate(()=>document.querySelector('#clear-still-cache').click());await final(page);x=await d();
  assert.equal(x.shadows,'false');assert.equal(x.intermediateBytes,'0');assert.equal(x.intermediateActive,'false');
  await page.evaluate(()=>{document.querySelector('#dock-doppler').click();document.querySelector('#toggle-still-cache').click();document.querySelector('[data-environment="harbor"]').click();});
  await final(page);x=await d();assert.equal(x.environment,'harbor');assert.equal(x.drawnEnvironment,'harbor');assert.equal(x.intermediateBytes,'0');assert.equal(x.intermediateActive,'false');assert.deepEqual(errors,[]);
});

test('worker discards in-flight intermediates and stale frames when disabled during rapid changes', {timeout:180000},async t=>{
  const {page,errors}=await pageFor(t,{memory:4,viewport:{width:800,height:500}});
  await page.evaluate(()=>document.querySelector('#dock-doppler').click());
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.renderPending==='true');await page.waitForTimeout(80);
  await page.evaluate(()=>{document.querySelector('#clear-still-cache').click();document.querySelector('#toggle-still-cache').click();document.querySelector('[data-environment="street"]').click();document.querySelector('[data-environment="harbor"]').click();});
  await final(page);const x=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));
  assert.equal(x.worker,'true');assert.equal(x.environment,'harbor');assert.equal(x.drawnEnvironment,'harbor');assert.equal(x.doppler,'false');assert.equal(x.intermediateActive,'false');assert.equal(x.intermediateBytes,'0');assert.deepEqual(errors,[]);
});
