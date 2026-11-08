'use strict';
// Run with NODE_PATH / CHROMIUM_PATH as the other optional Chromium tests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg','.md':'text/plain'};
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,options={}){const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());return browser.newPage({viewport:{width:1100,height:720},reducedMotion:'reduce',...options});}
async function ready(p,url=base){await p.goto(url,{waitUntil:'load'});await p.waitForFunction(()=>document.querySelector('#relativity-stage')?.dataset.status==='ready',null,{timeout:120000});}
async function final(p){await p.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:240000});}
async function sampleReflectedBody(page,params={}){
  const pos=await page.evaluate(params=>{const rect=document.querySelector('#relativity-scene').getBoundingClientRect(),W=110,H=Math.max(1,Math.round(W*rect.height/rect.width));
    const state={...RelativityExperiments.BASE,sceneMirror:true,...params},hits=[];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const ray=RelativityRenderer.trace(state,x+.5,y+.5,W,H),bounce=RelativityRenderer.traceReflection(state,ray);if(bounce?.ray.hit?.body)hits.push([x+.5,y+.5]);}
    if(!hits.length)throw Error('No reflected body visible at this aspect');const p=hits[Math.floor(hits.length/2)];return {x:p[0]/W,y:p[1]/H,count:hits.length};},params);
  const r=await page.locator('#relativity-scene').boundingBox();await page.locator('#relativity-scene').click({position:{x:r.width*pos.x,y:r.height*pos.y}});
  await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumSample==='ready',null,{timeout:120000});return pos;
}
async function axeCheck(page){if(!axe)return;await page.addScriptTag({content:axe.source});const violations=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[]);}

test('real mirror rays, retarded events, shadows and spectra agree between WebGL and Canvas', {timeout:240000},async t=>{
  const p=await pageFor(t,{viewport:{width:600,height:400}});await ready(p);await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const data=await p.evaluate(async()=>{
    const R=RelativityRenderer,E=RelativityExperiments,O=RelativityOptics,T=RelativityMaterialSpectrum,width=96,height=60,view={width,height,dpr:1};let g,c;
    await Promise.all([new Promise((ok,bad)=>{let n=0;g=R.create(document.createElement('canvas'),{onAsset:(name,status)=>status==='error'?bad(Error(name)):++n===9&&ok()});}),new Promise((ok,bad)=>{let n=0;c=R.createOffscreenCanvas(document.createElement('canvas'),(name,status)=>status==='error'?bad(Error(name)):++n===9&&ok());})]);
    if(g.kind!=='webgl')return {unavailable:true};const gl=g.canvas.getContext('webgl'),read=()=>{const a=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
    const cases=[];for(const environment of RelativityWorlds.IDs)for(const mirrorAngle of [-20,0,20])cases.push({environment,mirrorAngle,beta:.72,time:0,secondEnabled:true,secondBeta:-.45,secondAngle:25});
    cases.push({environment:'station',scenario:'observer',beta:.7,time:0},{environment:'station',view:'split',beta:.5,time:.5,mirrorAngle:-10},{environment:'station',beta:.6,time:0,softShadows:true,shadowSamples:4},{environment:'station',beta:.6,time:3,mirrorX:2,mirrorAngle:40,secondEnabled:true,secondBeta:-.9});
    const results=[];for(const config of cases){
      const state={...E.BASE,sceneMirror:true,shape:'sphere',...config,renderBudget:width*height};g.render(state,1,view);const mat=read();g.render(state,8,view);const secondary=read();g.render(state,2,view);const optical=read();g.render(state,false,view);const gp=read();c.render(state,false,view);const cp=c.canvas.getContext('2d').getImageData(0,0,width,height).data;
      let panel=0,body=0,bodyB=0,primaryBad=0,targetBad=0,errD=0,colorSum=0,colorBad=0;const dist=[];
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const j=((height-1-y)*width+x)*4,i=(y*width+x)*4,ray=R.trace(state,x+.5,y+.5,width,height),bounce=R.traceReflection(state,ray);
        if((ray.hit?.material||0)!==mat[j])primaryBad++;
        if(bounce){panel++;if(bounce.ray.hit?.body)body++;if(bounce.ray.hit?.bodyId==='B')bodyB++;
          const expected=bounce.ray.hit?.material||0;if(secondary[j]-1!==expected)targetBad++;
          else{
            if(bounce.ray.hit){const d=(secondary[j+1]*256+secondary[j+2])/256;dist.push(Math.abs(d-bounce.ray.hit.distance));}
            const D=O.frequencyRatio(bounce.state,bounce.ray),encoded=optical[j+1]*256+optical[j+2],gpuD=.1*100**(encoded/65535);if(D)errD=Math.max(errD,Math.abs(Math.log(Math.max(.1,Math.min(10,D))/gpuD)));
          }
          for(let k=0;k<3;k++){const diff=Math.abs(cp[i+k]-gp[j+k]);colorSum+=diff;colorBad+=diff>30;}
        }else if(secondary[j]!==0)targetBad++;
      }
      dist.sort((a,b)=>a-b);results.push({config,panel,body,bodyB,primaryBad,targetBad,dist95:dist[Math.floor(dist.length*.95)]||0,errD,colorMean:colorSum/(3*panel||1),colorBad:colorBad/(3*panel||1)});
    }
    const spectra=[];for(const material of T.measuredIds)for(const model of ['blackbody','line'])for(const beta of [0,.6,.86])for(const line of (model==='line'?[486.1,656.3,730]:[656.3])){
      const state={...E.BASE,sceneMirror:true,shape:'sphere',materialSpectrum:material,spectrumModel:model,lineWavelength:line,beta,renderBudget:width*height};g.render(state,6,view);const pixel=read();let n=0,sum=0,max=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const ray=R.trace(state,x+.5,y+.5,width,height);if(!ray.hit?.body)continue;const f=O.frequencyFactors(state,ray),rgb=T.shift([.2,.4,.7],material,model,6500,line,f.total,f.outgoing),j=((height-1-y)*width+x)*4;
        for(let k=0;k<3;k++){const e=Math.abs(pixel[j+k]-rgb[k]*255);sum+=e;max=Math.max(max,e);}n++;
      }spectra.push({material,model,line,beta,n,mean:sum/(3*n),max});
    }
    return {results,spectra,programs:g.programNames()};
  });
  if(data.unavailable){t.skip('WebGL unavailable');return;}
  t.diagnostic(JSON.stringify(data));assert.deepEqual(data.programs,['shared','mirror','mirror-line']);
  // Static scene BVHs are quantized to millimetres; at long grazing angles
  // this amplifies into a few hundredths in path length. Distance debug output
  // itself is quantized at 1/256; compare matched targets and bound the 95th.
  for(const x of data.results){assert.ok(x.panel>10,JSON.stringify(x));assert.ok(x.primaryBad<20&&x.targetBad<4,JSON.stringify(x));assert.ok(x.dist95<.035&&x.errD<.01,JSON.stringify(x));assert.ok(x.colorMean<7&&x.colorBad<.05,JSON.stringify(x));}
  assert.ok(data.results.some(x=>x.body>50));assert.ok(data.results.some(x=>x.bodyB>0));
  for(const x of data.spectra){assert.ok(x.n>100,JSON.stringify(x));assert.ok(x.mean<1&&x.max<3,JSON.stringify(x));}
});

test('desktop controls, reflected probe, measured graph and snapshots describe the same path', {timeout:240000},async t=>{
  const p=await pageFor(t),errors=[];p.on('pageerror',e=>errors.push(e.message));await ready(p);await final(p);await p.locator('#toggle-controls').click();await p.locator('#advanced-physics > summary').click();
  await p.locator('#toggle-scene-mirror').click();await p.locator('#material-spectrum').selectOption('usgs-pine');
  await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.sceneMirror==='true');await final(p);
  assert.equal(await p.locator('#toggle-scene-mirror').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('#material-spectrum').inputValue(),'usgs-pine');
  await p.locator('#toggle-controls').click();await p.locator('#toggle-knowledge').click();await p.locator('#probe-center').click();
  await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probe!==undefined);await p.locator('#pin-ray').click();
  const position=await sampleReflectedBody(p,{materialSpectrum:'usgs-pine'});
  const stage=await p.locator('#relativity-stage').evaluate(e=>({...e.dataset}));assert.equal(stage.probe,'mirror-panel');assert.equal(stage.probeMirrorSource,'cube');assert.ok(Number(stage.probeMirrorSourceTime)<Number(stage.probeMirrorTime));
  assert.match(await p.locator('#probe-summary').textContent(),/两段光程/);assert.match(await p.locator('#spectrum-status').textContent(),/镜中来源.*USGS 实测 GDS365/);
  assert.equal(await p.locator('#spectrum-plot').getAttribute('data-measured'),'true');assert.equal(await p.locator('#open-ray-space').isDisabled(),true);assert.equal(await p.locator('#pin-ray').isDisabled(),true);assert.match(await p.locator('#pair-status').textContent(),/镜面折线路径暂不支持/);
  await p.locator('#toggle-controls').click();await p.locator('#save-local').click();const saved=await p.evaluate(()=>JSON.parse(localStorage.getItem('relativity-observation-v1')));assert.equal(saved.parameters.sceneMirror,true);assert.equal(saved.parameters.materialSpectrum,'usgs-pine');
  const measurement=saved.measurements.current,reflection=measurement.reflection;assert.equal(measurement.source,'cube');assert.equal(measurement.body,true);assert.equal(measurement.bodyId,'A');
  assert.equal(reflection.kind,'stationary-ideal-plane');assert.ok(Math.abs(reflection.mirrorTime-Number(stage.probeMirrorTime))<1e-6);
  assert.ok(Math.abs(reflection.sourceTime-Number(stage.probeMirrorSourceTime))<1e-6);assert.equal(measurement.emissionTime,reflection.sourceTime);
  assert.ok(Math.abs(measurement.doppler-Number(stage.probeDoppler))<1e-6);assert.ok(Math.abs(reflection.observerToMirror+reflection.mirrorToSource-reflection.totalDistance)<1e-9);
  assert.equal(measurement.distance,reflection.totalDistance);assert.ok(saved.measurements.reference);assert.equal(saved.measurements.emissionDelta,null);
  await p.locator('#toggle-scene-mirror').click();await p.locator('#material-spectrum').selectOption('fabric');await p.locator('#restore-local').click();await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.sceneMirror==='true'&&document.querySelector('#relativity-stage').dataset.materialSpectrum==='usgs-pine');await final(p);
  await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.probeMirrorSource==='cube',null,{timeout:120000});assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({position,sourceTime:stage.probeMirrorSourceTime,mirrorTime:stage.probeMirrorTime}));
});

test('offline 320px layout retains mirror, measured spectrum, probe and accessibility', {timeout:240000},async t=>{
  const p=await pageFor(t,{viewport:{width:320,height:700},isMobile:true,hasTouch:true}),errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await ready(p,pathToFileURL(path.join(root,'relativity.html')).href);await final(p);
  await p.locator('#toggle-controls').click();await p.locator('#advanced-physics > summary').click();await p.locator('#toggle-scene-mirror').click();await p.locator('#material-spectrum').selectOption('usgs-nylon');await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.sceneMirror==='true');await final(p);
  await axeCheck(p);await p.locator('#toggle-controls').click();const rect=await p.evaluate(()=>[document.documentElement.clientWidth,document.documentElement.scrollWidth]);assert.deepEqual(rect,[320,320]);
  const pos=await sampleReflectedBody(p,{materialSpectrum:'usgs-nylon'});assert.match(await p.locator('#spectrum-status').textContent(),/USGS 实测 GDS431/);assert.equal(await p.locator('#spectrum-plot').getAttribute('data-measured'),'true');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);t.diagnostic(JSON.stringify({position:pos,viewport:rect}));
});

test('optional WebGL worker compiles mirror lazily and returns to the default program', {timeout:300000},async t=>{
  const p=await pageFor(t,{viewport:{width:900,height:600}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window.__RELATIVITY_FORCE_WORKER_WEBGL__=true;});await ready(p);await final(p);
  const initial=await p.locator('#relativity-stage').evaluate(e=>({...e.dataset}));if(initial.renderer!=='webgl'){t.skip('WebGL worker unavailable');return;}
  assert.equal(await p.locator('#relativity-scene').getAttribute('data-shader-programs'),'1');
  await p.locator('#toggle-controls').click();await p.locator('#advanced-physics > summary').click();await p.locator('#toggle-scene-mirror').click();await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.sceneMirror==='true');await final(p);
  assert.equal(await p.locator('#relativity-scene').getAttribute('data-shader-programs'),'2');await p.locator('#toggle-controls').click();await sampleReflectedBody(p);assert.match(await p.locator('#probe-summary').textContent(),/镜中来源/);
  await p.locator('#toggle-controls').click();await p.locator('#toggle-scene-mirror').click();await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.sceneMirror==='false');await final(p);
  assert.equal(await p.locator('#relativity-stage').getAttribute('data-renderer'),'webgl');
  await p.locator('#spectrum-model').selectOption('line');await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumModel==='line');await final(p);
  assert.equal(await p.locator('#relativity-scene').getAttribute('data-shader-programs'),'3');
  await p.locator('#spectrum-model').selectOption('rgb');await p.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.spectrumModel==='rgb');await final(p);
  assert.equal(await p.locator('#relativity-stage').getAttribute('data-renderer'),'webgl');assert.deepEqual(errors,[]);
});
