'use strict';
// Optional browser regressions: install playwright-core, optionally axe-core,
// and set CHROMIUM_PATH. Use SwiftShader flags when no hardware WebGL exists.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {createHash}=require('node:crypto'),{chromium}=require('playwright-core'),Model=require('../lightning-model.js'),Appearance=require('../lightning-appearance.js'),Thermal=require('../lightning-thermal.js'),Event=require('../lightning-event.js'),Study=require('../lightning-study.js');
let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/lightning.html';
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function watchWorker(page){
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__lightningEvents=[];window.__lightningSent=[];window.__lightningTerminated=0;
    window.Worker=function(...args){
      const w=new Original(...args),post=w.postMessage.bind(w),terminate=w.terminate.bind(w);
      w.postMessage=function(message,...rest){if(message.type==='init'&&Number.isFinite(window.__lightningWarmOverride))message={...message,warm:window.__lightningWarmOverride};window.__lightningSent.push(structuredClone(message));
        if(message.type==='capture'&&window.__delayLightningCapture){setTimeout(()=>post(message,...rest),window.__delayLightningCapture);return;}
        if(message.type==='advance'&&window.__delayLightningAdvance){setTimeout(()=>post(message,...rest),window.__delayLightningAdvance);return;}return post(message,...rest);};
      w.terminate=function(){window.__lightningTerminated++;return terminate();};
      w.addEventListener('message',event=>{
        const v=event.data;
        function copy(a){if(!a)return null;return {...a,potential:a.potential.slice(),mask:a.mask.slice(),segments:a.segments.slice(),
          sourceBody:a.sourceBody.slice(),targetBody:a.targetBody.slice(),candidateIds:a.candidateIds.slice(),probabilities:a.probabilities.slice(),drops:a.drops.slice(),faceLinks:a.faceLinks.slice(),diagonalLinks:a.diagonalLinks.slice(),links:a.links.slice()};}
        window.__lightningEvents.push({kind:v.kind,generation:v.generation,primary:copy(v.primary),reference:copy(v.reference),before:copy(v.before),message:v.message,payload:v.kind==='result'?structuredClone(v):null});
      });return w;
    };
  });
}
async function watchThree(page){
  await page.route('**/lightning.js*',async route=>{
    const response=await route.fetch(),source=await response.text();
    const spy=`if(window.THREE){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...args){const renderer=new Original(...args),render=renderer.render.bind(renderer);
      renderer.render=function(scene,camera){window.__lightningThree={renderer,scene,camera,count:(window.__lightningThree?.count||0)+1};return render(scene,camera);};return renderer;};}\n`;
    await route.fulfill({response,body:spy+source});
  });
}
async function disableWebGL(page){
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};});
}
async function open(page,url=base+'lightning.html'){
  await page.goto(url,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#lightning-stage').dataset.status),null,{timeout:60000});
  if(await page.locator('#lightning-stage').getAttribute('data-status')!=='ready')throw Error(await page.locator('#stage-error-text').innerText());
  await page.waitForFunction(()=>Number(document.querySelector('#lightning-stage').dataset.drawSegments)>0,null,{timeout:30000});await twoFrames(page);
}
async function twoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function requireWebGL(page,t){
  if(await page.locator('#lightning-stage').getAttribute('data-renderer')!=='webgl'){t.skip('WebGL unavailable; use a hardware or software WebGL implementation');return false;}
  return true;
}
async function generation(page){return page.evaluate(()=>Math.max(0,...window.__lightningEvents.filter(e=>e.kind==='ready').map(e=>e.generation)));}
async function waitReset(page,previous){
  await page.waitForFunction(g=>document.querySelector('#lightning-stage').dataset.status==='ready'&&window.__lightningEvents.some(e=>e.kind==='ready'&&e.generation>g),previous,{timeout:60000});
  await twoFrames(page);
}
async function latest(page,kind){
  return page.evaluate(kind=>{
    const e=window.__lightningEvents.findLast(v=>!kind||v.kind===kind);
    function field(a){if(!a)return null;return {...a,potential:Array.from(a.potential),mask:Array.from(a.mask),segments:Array.from(a.segments),sourceBody:Array.from(a.sourceBody),targetBody:Array.from(a.targetBody),candidateIds:Array.from(a.candidateIds),probabilities:Array.from(a.probabilities),drops:Array.from(a.drops),faceLinks:Array.from(a.faceLinks),diagonalLinks:Array.from(a.diagonalLinks),links:Array.from(a.links)};}
    return {kind:e.kind,generation:e.generation,primary:field(e.primary),reference:field(e.reference),before:field(e.before),payload:e.payload};
  },kind);
}
async function setRange(page,id,value){await page.locator(id).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function step(page){
  const n=Number(await page.locator('#lightning-stage').getAttribute('data-steps'));await page.locator('#step').click();
  await page.waitForFunction(n=>Number(document.querySelector('#lightning-stage').dataset.steps)===n+1,n,{timeout:30000});await twoFrames(page);
}
async function image(page){
  await twoFrames(page);const data=await page.locator('#lightning-scene').evaluate(el=>el.toDataURL('image/png'));
  const pixels=await page.locator('#lightning-scene').evaluate(async canvas=>{
    const image=new Image();image.src=canvas.toDataURL('image/png');await image.decode();const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
    const ctx=copy.getContext('2d');ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,copy.width,copy.height).data;let visible=0,bright=0;
    for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]>12)visible++;if(rgba[i+3]>32&&rgba[i]+rgba[i+1]+rgba[i+2]>420)bright++;}
    return {visible,bright};
  });
  assert.ok(pixels.visible>300,`not a blank canvas: ${JSON.stringify(pixels)}`);assert.ok(pixels.bright>15,`visible luminous features: ${JSON.stringify(pixels)}`);
  return createHash('sha256').update(data).digest('hex');
}
function maxDifference(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
function run(field,n){assert.ok(field.solve().converged);for(let i=0;i<n;i++){const r=field.step();assert.ok(r.ok);if(r.complete)break;}return field.snapshot();}
function close(a,b,tol=1e-6){assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (±${tol})`);}
async function sourceTip(page){
  await twoFrames(page);return page.evaluate(()=>{
    const data=window.__lightningEvents.findLast(e=>e.primary).primary,u=4.8/(data.ny-1),p=new THREE.Vector3((data.sourceX-(data.nx-1)/2)*u,2.4-data.rodLength*u,(data.sourceZ-(data.nz-1)/2)*u);
    p.project(window.__lightningThree.camera);const r=document.querySelector('#lightning-scene').getBoundingClientRect();return{x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  });
}

test('WebGL displays the actual 3D solved field and 120 reproducible stochastic steps', {timeout:120000},async t=>{
  const page=await newPage(t,{acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const result=(await latest(page,'ready')).primary,expected=run(new Model.Discharge({quality:'standard',eta:4,seed:19}),120);
  assert.equal(result.stats.steps,120);assert.deepEqual(result.segments,Array.from(expected.segments));assert.deepEqual(result.candidateIds,Array.from(expected.candidateIds));
  assert.ok(maxDifference(result.potential,expected.potential)<1e-6);assert.ok(maxDifference(result.probabilities,expected.probabilities)<1e-6);
  assert.ok(result.stats.residual<=1e-5);assert.equal(await page.locator('#play-text').innerText(),'播放');
  const geometry=await page.evaluate(()=>{
    const objects=[];window.__lightningThree.scene.traverse(o=>{if(o.isInstancedMesh){const m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();o.getMatrixAt(0,m);m.decompose(p,q,s);objects.push({count:o.count,position:p.toArray(),scale:s.toArray()});}});return objects;
  });
  assert.equal(geometry.length,3);assert.ok(geometry.every(o=>o.count===(result.segments.length/2-result.seedSegmentCount)*Appearance.DETAIL_PARTS));assert.ok(geometry.every(o=>o.scale[1]>0));
  const before=await image(page);assert.ok(before.length===64);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-image').click()]);const png=fs.readFileSync(await download.path());
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(png.readUInt32BE(16)>500);assert.deepEqual(errors,[]);
});

test('appearance modes retain the same solved tree and map every rendered subsegment to its source bond', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=await latest(page,'ready'),sent=await page.evaluate(()=>window.__lightningSent.length),glowImage=await image(page);
  async function checkMatrices(detail){
    const expected=Appearance.makePath(before.primary,detail).positions;
    const actual=await page.evaluate(detail=>{
      const mesh=window.__lightningThree.scene.getObjectByName('discharge-core'),m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),out=[];
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,m);m.decompose(p,q,s);const v=new THREE.Vector3(0,s.y/(2*(detail?1.035:1)),0).applyQuaternion(q);
        const a=p.clone().sub(v),b=p.clone().add(v);out.push(a.x,a.y,a.z,b.x,b.y,b.z);
      }
      return out;
    },detail);
    assert.equal(actual.length,expected.length);assert.ok(maxDifference(actual,expected)<2e-5);
  }
  await checkMatrices(true);assert.equal(await page.locator('button[data-appearance="glow"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#lightning-stage').evaluate(el=>getComputedStyle(el).backgroundImage),/lightning-storm-bg/);
  await page.locator('button[data-appearance="grid"]').click();await twoFrames(page);await checkMatrices(false);
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-appearance'),'grid');assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-render-segments')),before.primary.segments.length/2-before.primary.seedSegmentCount);
  assert.doesNotMatch(await page.locator('#lightning-stage').evaluate(el=>getComputedStyle(el).backgroundImage),/lightning-storm-bg/);assert.notEqual(await image(page),glowImage);
  assert.equal(await page.evaluate(()=>window.__lightningSent.length),sent);assert.deepEqual((await latest(page)).primary.segments,before.primary.segments);assert.deepEqual((await latest(page)).primary.potential,before.primary.potential);
  await page.locator('button[data-appearance="glow"]').click();await twoFrames(page);await checkMatrices(true);assert.equal(await image(page),glowImage);
  assert.match(await page.locator('.appearance-section .control-note').innerText(),/视觉表现/);assert.deepEqual(errors,[]);
});

test('real probabilities, multi-bond probe, field slice and arrows are coupled to worker data', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const initial=await latest(page,'ready'),before=await image(page);await page.locator('label[for="show-candidates"]').click();assert.notEqual(await image(page),before);
  await page.locator('#probe-strongest').click();const id=Number(await page.locator('#lightning-stage').getAttribute('data-probe-id'));
  const d=initial.primary,index=d.candidateIds.indexOf(id),best=d.probabilities.indexOf(Math.max(...d.probabilities));assert.equal(index,best);
  const face=d.faceLinks[index],diag=d.diagonalLinks[index],f=d.drops[index]/d.h;
  assert.equal(await page.locator('#probe-probability').innerText(),(d.probabilities[index]*100).toFixed(2)+'% / '+face+'·'+diag);
  assert.equal(await page.locator('#probe-field').innerText(),(face?f.toFixed(3):'—')+' / '+(diag?(f/Math.SQRT2).toFixed(3):'—'));
  assert.equal(await page.locator('#play-text').innerText(),'播放');
  // Click a distinct actual candidate's projected 3D coordinates, rather than
  // just invoking the strongest-candidate button.
  await page.locator('button[data-tool="probe"]').click();const pick=await page.evaluate(()=>{
    const d=window.__lightningEvents.findLast(e=>e.primary).primary,r=document.querySelector('#lightning-scene').getBoundingClientRect(),u=4.8/(d.ny-1),id=d.candidateIds[0];
    const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny,p=new THREE.Vector3((x-(d.nx-1)/2)*u,2.4-y*u,(z-(d.nz-1)/2)*u).project(window.__lightningThree.camera);
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  });await page.mouse.click(pick.x,pick.y);assert.ok(d.candidateIds.includes(Number(await page.locator('#lightning-stage').getAttribute('data-probe-id'))));
  const probeImage=await image(page);await page.locator('label[for="show-slice"]').click();assert.notEqual(await image(page),probeImage);
  const texture=await page.evaluate(()=>{
    let value;window.__lightningThree.scene.traverse(o=>{if(o.material&&o.material.map&&o.material.map.isDataTexture)value={data:Array.from(o.material.map.image.data),width:o.material.map.image.width,height:o.material.map.image.height};});return value;
  });
  assert.deepEqual([texture.width,texture.height],[d.nx,d.ny]);const z=Math.round((d.nz-1)/2),x=9,row=7,y=d.ny-1-row,i=x+d.nx*(y+d.ny*z),k=4*(x+row*d.nx),v=Math.max(0,Math.min(1,d.potential[i]));
  assert.deepEqual(texture.data.slice(k,k+4),[Math.round(25+190*v),Math.round(72+102*v),Math.round(92+24*v),104]);
  const slice=await image(page);await setRange(page,'#slice-z',67);assert.notEqual(await image(page),slice);
  const after=await latest(page);assert.deepEqual(after.primary.segments,d.segments);assert.deepEqual(after.primary.potential,d.potential);
  await page.locator('label[for="show-candidates"]').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-tool'),'orbit');assert.match(await page.locator('#stage-notice').textContent(),/切回旋转/);
  await page.locator('[data-note="growth"]').click();assert.match(await page.locator('[data-note-content="growth"]').textContent(),/电场屏蔽/);
  await page.locator('#growth-field-toggle').click();assert.equal(await page.locator('#show-slice').isChecked(),false);assert.equal(await page.locator('#growth-field-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#growth-field-toggle').click();assert.equal(await page.locator('#show-slice').isChecked(),true);
  assert.deepEqual(errors,[]);
});

test('single steps match the model, and η changes update probabilities without rewriting the field', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  const gen=await generation(page);await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);const zero=await latest(page,'ready');assert.equal(zero.primary.stats.steps,0);
  await step(page);const frame=await latest(page,'frame'),expected=run(new Model.Discharge({quality:'quick',eta:4,seed:19}),1);
  assert.deepEqual(frame.primary.segments,Array.from(expected.segments));assert.ok(maxDifference(frame.primary.potential,expected.potential)<1e-6);
  await setRange(page,'#eta',0);await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.solvedEta==='0',null,{timeout:30000});
  const changed=await latest(page,'configured');assert.equal(changed.primary.stats.steps,1);assert.deepEqual(changed.primary.segments,frame.primary.segments);assert.deepEqual(changed.primary.potential,frame.primary.potential);
  const p=changed.primary,links=p.candidateIds.map((_,i)=>p.faceLinks[i]+p.diagonalLinks[i]),total=links.reduce((a,b)=>a+b,0);
  p.probabilities.forEach((v,i)=>close(v,links[i]/total,1e-6));
  await setRange(page,'#eta',6);await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.solvedEta==='6',null,{timeout:30000});
  const changedAgain=await latest(page,'configured');assert.deepEqual(changedAgain.primary.segments,frame.primary.segments);assert.ok(maxDifference(changedAgain.primary.probabilities,p.probabilities)>.001);
  assert.deepEqual(errors,[]);
});


test('probing while a worker batch is in flight waits for the latest real field', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.evaluate(()=>{window.__delayLightningAdvance=700;});await page.locator('#play').click();
  await page.waitForFunction(()=>window.__lightningSent.some(m=>m.type==='advance'),null,{timeout:30000});await page.locator('#probe-strongest').click();
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-probe-pending'),'true');assert.match(await page.locator('#stage-notice').textContent(),/完成已提交/);
  await page.waitForFunction(()=>!document.querySelector('#lightning-stage').dataset.probePending&&document.querySelector('#lightning-stage').dataset.probeId,null,{timeout:30000});
  const data=(await latest(page,'frame')).primary,index=data.probabilities.indexOf(Math.max(...data.probabilities));
  assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-probe-id')),data.candidateIds[index]);
  close(Number(await page.locator('#lightning-stage').getAttribute('data-probe-probability')),data.probabilities[index]);assert.equal(await page.locator('#play-text').innerText(),'播放');
  const at=data.stats.steps;await page.waitForTimeout(250);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-steps')),at);assert.deepEqual(errors,[]);
});

test('equal-seed comparison evolves independently in lockstep and warns about mid-run changes', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  let gen=await generation(page);await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);await setRange(page,'#reference-eta',4);
  gen=await generation(page);await page.locator('#compare-toggle').click();await waitReset(page,gen);
  let event=await latest(page,'ready');assert.deepEqual(event.primary.potential,event.reference.potential);assert.equal(event.primary.stats.steps,0);assert.equal(event.reference.stats.steps,0);
  for(let i=0;i<5;i++)await step(page);event=await latest(page,'frame');assert.deepEqual(event.primary.segments,event.reference.segments);assert.deepEqual(event.primary.potential,event.reference.potential);
  await setRange(page,'#eta',4.5);await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.solvedEta==='4.5',null,{timeout:30000});
  for(let i=0;i<10;i++)await step(page);event=await latest(page,'frame');assert.equal(event.primary.stats.steps,event.reference.stats.steps);assert.notDeepEqual(event.primary.segments,event.reference.segments);
  assert.match(await page.locator('#compare-result').textContent(),/中途改变/);gen=await generation(page);await setRange(page,'#reference-eta',1.2);await waitReset(page,gen);
  event=await latest(page,'ready');assert.equal(event.primary.stats.steps,0);assert.equal(event.reference.stats.steps,0);close(event.reference.eta,1.2);assert.doesNotMatch(await page.locator('#compare-result').textContent(),/中途改变/);
  assert.deepEqual(errors,[]);
});

test('changed boundaries invalidate in-flight work, debounce resets, and preserve playback even when a preset interrupts', {timeout:120000},async t=>{
  const page=await newPage(t,{reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.waitForFunction(()=>Number(document.querySelector('#lightning-stage').dataset.steps)>120,null,{timeout:30000});const gen=await generation(page);
  await page.evaluate(()=>{
    for(const [id,value,type] of [['source-x','60','input'],['source-z','-30','input'],['grid-quality','quick','change'],['random-seed','701','change']]){
      const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event(type,{bubbles:true}));
    }
  });
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-status'),'loading');assert.equal(await page.locator('#lightning-scene').evaluate(el=>el.style.opacity),'0');
  assert.equal(await page.locator('#play').isDisabled(),true);assert.ok(await page.evaluate(()=>window.__lightningTerminated)>=1);await waitReset(page,gen);
  const fresh=await latest(page,'ready');assert.deepEqual([fresh.primary.nx,fresh.primary.ny,fresh.primary.nz],[17,25,17]);assert.equal(fresh.primary.seed,701);
  const coord=(v,n)=>Math.max(2,Math.min(n-3,Math.round(2+(v+100)*(n-5)/200)));
  assert.deepEqual([fresh.primary.sourceX,fresh.primary.sourceZ],[coord(60,17),coord(-30,17)]);assert.equal(await page.locator('#play-text').innerText(),'暂停');
  const nextGen=await generation(page);
  await page.evaluate(()=>{const el=document.querySelector('#target-x');el.value='-40';el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-preset="needle"]').click();});
  await waitReset(page,nextGen);const preset=await latest(page,'ready');assert.equal(preset.primary.seed,27);close(preset.primary.eta,4.6);assert.equal(preset.primary.stats.steps,42);
  assert.equal(await page.locator('#play-text').innerText(),'暂停');assert.deepEqual(errors,[]);
});


test('hiding the tab pauses even while a boundary reset is queued', {timeout:120000},async t=>{
  const page=await newPage(t,{reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.waitForFunction(()=>document.querySelector('#play-text').textContent==='暂停');const gen=await generation(page);
  await page.evaluate(()=>{
    const el=document.querySelector('#target-x');el.value='50';el.dispatchEvent(new Event('input',{bubbles:true}));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  });await waitReset(page,gen);assert.equal(await page.locator('#play-text').innerText(),'播放');const at=Number(await page.locator('#lightning-stage').getAttribute('data-steps'));
  await page.waitForTimeout(350);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-steps')),at);assert.deepEqual(errors,[]);
});

test('mouse and keyboard reposition the actual needle; grabbing its tip does not jump', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  await page.locator('[data-tool="source"]').click();const tip=await sourceTip(page),before=await latest(page,'ready');
  await page.mouse.click(tip.x,tip.y);await page.waitForTimeout(220);assert.equal(Number(await page.locator('#source-x').inputValue()),0);assert.equal(Number(await page.locator('#source-z').inputValue()),0);assert.equal(await generation(page),before.generation);
  await page.mouse.move(tip.x,tip.y);await page.mouse.down();await page.mouse.move(tip.x+35,tip.y+10,{steps:3});
  await page.locator('#lightning-scene').evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await page.mouse.up();
  assert.equal(Number(await page.locator('#source-x').inputValue()),0);assert.equal(await generation(page),before.generation);
  await page.mouse.move(tip.x,tip.y);await page.mouse.down();await page.mouse.move(tip.x+55,tip.y+18,{steps:5});
  assert.match(await page.locator('#stage-notice').textContent(),/旧通道隐藏/);assert.notEqual(Number(await page.locator('#source-x').inputValue()),0);await page.mouse.up();await waitReset(page,before.generation);
  let moved=await latest(page,'ready');assert.notDeepEqual([moved.primary.sourceX,moved.primary.sourceZ],[before.primary.sourceX,before.primary.sourceZ]);assert.equal(moved.primary.stats.steps,0);
  const x=moved.primary.sourceX,gen=moved.generation;await page.locator('#lightning-scene').focus();await page.keyboard.press('ArrowRight');await waitReset(page,gen);
  moved=await latest(page,'ready');assert.equal(moved.primary.sourceX,x+1);assert.equal(await page.evaluate(()=>document.activeElement.id),'lightning-scene');
  const next=moved.generation;await page.keyboard.press('ArrowRight');await waitReset(page,next);moved=await latest(page,'ready');assert.equal(moved.primary.sourceX,x+2);assert.deepEqual(errors,[]);
});

test('touch drag on mobile changes electrode boundaries and keeps the experiment usable', {timeout:120000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  assert.equal(await page.locator('#control-panel').isHidden(),true);await page.locator('#toggle-controls').click();await page.locator('[data-tool="source"]').click();assert.equal(await page.locator('#control-panel').isHidden(),true);
  const tip=await sourceTip(page),old=await latest(page,'ready'),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tip.x,y:tip.y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tip.x+45,y:tip.y+12,id:1}]});assert.match(await page.locator('#stage-notice').textContent(),/旧通道隐藏/);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await waitReset(page,old.generation);await page.waitForTimeout(400);
  const moved=await latest(page,'ready');assert.notDeepEqual([moved.primary.sourceX,moved.primary.sourceZ],[old.primary.sourceX,old.primary.sourceZ]);assert.equal(moved.primary.stats.steps,0);
  // A CDP touch sequence can suppress the next synthesized click in headless
  // Chromium; use an ordinary click to reopen the drawer, then touch the scene.
  await page.locator('#toggle-controls').click();await page.locator('button[data-tool="probe"]').click();await twoFrames(page);
  const spot=await page.evaluate(()=>{const d=window.__lightningEvents.findLast(e=>e.primary).primary,r=document.querySelector('#lightning-scene').getBoundingClientRect(),id=d.candidateIds[0],u=4.8/(d.ny-1),x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny;
    const v=new THREE.Vector3((x-(d.nx-1)/2)*u,2.4-y*u,(z-(d.nz-1)/2)*u).project(window.__lightningThree.camera);return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2};});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:spot.x,y:spot.y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.probeId,null,{timeout:10000});
  assert.ok(moved.primary.candidateIds.includes(Number(await page.locator('#lightning-stage').getAttribute('data-probe-id'))));
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-status'),'ready');assert.deepEqual(errors,[]);
});

test('the computed field stops on positive contact and reset restarts from the current conditions', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);let gen=await generation(page);
  await page.evaluate(()=>{
    for(const [id,value,type] of [['grid-quality','quick','change'],['eta','6','input'],['random-seed','3','change']]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event(type,{bubbles:true}));}
  });await waitReset(page,gen);await page.locator('[data-speed="2"]').click();await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.complete==='true',null,{timeout:60000});const finished=(await latest(page)).primary,child=finished.segments.at(-1);
  assert.equal(finished.mask[child],Model.TARGET);close(finished.potential[child],1);assert.equal(finished.candidateIds.length,0);
  assert.equal(await page.locator('#play').isDisabled(),true);assert.match(await page.locator('#stage-notice').innerText(),/接触/);
  const count=finished.stats.steps;await page.waitForTimeout(400);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-steps')),count);
  gen=await generation(page);await page.locator('#reset').click();await waitReset(page,gen);const reset=(await latest(page,'ready')).primary;
  assert.equal(reset.stats.steps,0);assert.equal(reset.seed,3);close(reset.eta,6);assert.equal(await page.locator('#play').isDisabled(),false);assert.deepEqual(errors,[]);
});

test('Canvas fallback uses the same model data, supports probe, slices, steps and PNG export', {timeout:120000},async t=>{
  const page=await newPage(t,{acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await disableWebGL(page);await watchWorker(page);await open(page);
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-renderer'),'canvas');assert.match(await page.locator('#stage-fallback').textContent(),/Canvas/);
  const d=(await latest(page,'ready')).primary,expected=run(new Model.Discharge({quality:'standard',eta:4,seed:19}),120);assert.deepEqual(d.segments,Array.from(expected.segments));
  const before=await image(page),sent=await page.evaluate(()=>window.__lightningSent.length);await page.locator('button[data-appearance=grid]').click();await twoFrames(page);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-render-segments')),d.segments.length/2-d.seedSegmentCount);assert.equal(await page.evaluate(()=>window.__lightningSent.length),sent);await page.locator('button[data-appearance=glow]').click();await twoFrames(page);await page.locator('#probe-strongest').click();assert.ok(Number(await page.locator('#lightning-stage').getAttribute('data-probe-probability'))>0);assert.notEqual(await image(page),before);
  const prior=await image(page);await page.locator('label[for="show-slice"]').click();assert.notEqual(await image(page),prior);await step(page);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-image').click()]);assert.equal(download.suggestedFilename(),'lightning-growth.png');
  const bytes=fs.readFileSync(await download.path());assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(bytes.readUInt32BE(16)>500);assert.ok(bytes.readUInt32BE(20)>400);assert.deepEqual(errors,[]);
});

test('a lost WebGL context switches to Canvas without losing the computed state', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=await latest(page,'ready');await page.locator('#lightning-scene').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.renderer==='canvas',null,{timeout:30000});assert.match(await page.locator('#stage-fallback').textContent(),/上下文丢失/);
  assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-steps')),before.primary.stats.steps);await image(page);await step(page);assert.equal((await latest(page,'frame')).primary.stats.steps,121);assert.deepEqual(errors,[]);
});

test('responsive framing keeps the model visible above transport, including a vertical comparison', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  for(const [width,height] of [[390,844],[320,568],[568,320],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForFunction(([w,h])=>Number(document.querySelector('#lightning-stage').dataset.drawWidth)===w&&Number(document.querySelector('#lightning-stage').dataset.drawHeight)===h,[width,height],{timeout:30000});await twoFrames(page);
    const box=await page.evaluate(()=>{
      const d=window.__lightningEvents.findLast(e=>e.primary).primary,camera=window.__lightningThree.camera,r=document.querySelector('#lightning-scene').getBoundingClientRect(),hud=document.querySelector('.lab-bottom').getBoundingClientRect();
      const w=(d.nx-1)*4.8/(d.ny-1)/2,z=(d.nz-1)*4.8/(d.ny-1)/2,points=[];
      for(const x of [-w,w])for(const y of [-2.4,2.4])for(const zz of [-z,z]){const v=new THREE.Vector3(x,y,zz).project(camera);points.push({x:(v.x+1)*r.width/2,y:(1-v.y)*r.height/2});}
      return{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y)),hud:hud.top-r.top};
    });
    assert.ok(box.left>=-2&&box.right<=width+2&&box.top>=0&&box.bottom<box.hud,`${width}×${height}: ${JSON.stringify(box)}`);await image(page);
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#toggle-controls').click();const gen=await generation(page);await page.locator('#compare-toggle').click();await waitReset(page,gen);await page.locator('#toggle-controls').click();
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-layout'),'vertical');assert.equal(await page.locator('#primary-label').isVisible(),true);assert.equal(await page.locator('#reference-label').isVisible(),true);
  const labels=await page.evaluate(()=>{const a=document.querySelector('#reference-label').getBoundingClientRect(),b=document.querySelector('#primary-label').getBoundingClientRect(),h=document.querySelector('.lab-bottom').getBoundingClientRect();return {a:a.toJSON(),b:b.toJSON(),hud:h.top};});
  assert.ok(labels.b.bottom<labels.a.top&&labels.a.bottom<labels.hud);assert.deepEqual(errors,[]);
});

test('local resources and Worker run without remote network; worker failure is explicit and retryable', {timeout:120000},async t=>{
  const page=await newPage(t),remote=[];await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(base)||url.startsWith('data:'))return route.continue();remote.push(url);return route.abort();});
  await open(page);assert.deepEqual(remote,[]);assert.ok(Number(await page.locator('#lightning-stage').getAttribute('data-steps'))===120);await image(page);
  const broken=await newPage(t);await broken.addInitScript(()=>{window.Worker=function(){throw Error('blocked for test');};});await broken.goto(base+'lightning.html');
  await broken.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.status==='error');assert.match(await broken.locator('#stage-error-text').innerText(),/无法启动后台求解器/);
  assert.equal(await broken.locator('#play').isDisabled(),true);assert.equal(await broken.locator('#reset').isDisabled(),false);await broken.locator('#reset').click();assert.match(await broken.locator('#stage-error-text').innerText(),/无法启动后台求解器/);
});

test('axe reports no violations across desktop cards, comparison, mobile and navigation', {timeout:120000,skip:!axe},async t=>{
  const page=await newPage(t);await page.addInitScript({content:axe.source});await open(page);
  async function audit(label){const violations=await page.evaluate(async()=>{const result=await axe.run(document);return result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],label);}
  await audit('desktop');for(const note of ['probe','compare','limits','thermal','event','stats']){await page.locator(`[data-note="${note}"]`).click();await audit(note);}
  await page.locator('#compare-toggle').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.status==='ready');await audit('comparison');
  await page.setViewportSize({width:390,height:844});await twoFrames(page);await audit('mobile');await page.locator('#toggle-controls').click();await audit('mobile controls');
  await page.locator('#nav-toggle').click();await audit('navigation');
});

test('post-contact circuit controls and WebGL instance colors use the separate real electrothermal model', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  assert.equal(await page.locator('#thermal-play').isDisabled(),true);let gen=await generation(page);await page.locator('#thermal-example').click();await waitReset(page,gen);
  const d=(await latest(page,'ready')).primary;assert.equal(d.stats.complete,true);assert.equal(d.stats.steps,69);assert.deepEqual([d.nx,d.ny,d.nz],[17,25,17]);
  const sent=await page.evaluate(()=>window.__lightningSent.length),model=new Thermal.Electrothermal(d,{voltage:2,cooling:.5});assert.ok(model.step(.04).ok);
  await page.locator('#thermal-step').click();close(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-time')),model.time,1e-12);
  close(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-current')),model.current,1e-9);close(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-temperature')),model.maxTemperature,1e-9);
  assert.ok(Math.abs(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-budget')))<1e-10);
  const edge=model.onPath.findIndex((yes,i)=>yes&&i>=model.seedSegmentCount),part=(edge-model.seedSegmentCount)*Appearance.DETAIL_PARTS;
  const tint=await page.evaluate(part=>{const m=window.__lightningThree.scene.getObjectByName('discharge-core'),c=new THREE.Color();m.getColorAt(part,c);return c.toArray();},part);
  const x=Math.max(0,Math.min(1,(model.temperature[edge]-1)/4));close(tint[0],.15+.85*Math.pow(x,.3),1e-6);close(tint[1],.12+.75*Math.pow(x,.6),1e-6);close(tint[2],.16+.55*x,1e-6);
  await page.locator('#thermal-encoding').selectOption('current');const currentTint=await page.evaluate(part=>{const m=window.__lightningThree.scene.getObjectByName('discharge-core'),c=new THREE.Color();m.getColorAt(part,c);return c.toArray();},part);
  close(currentTint[0],.15+.85*Math.pow(Math.min(1,model.current/3),.3),1e-6);await page.locator('#thermal-encoding').selectOption('temperature');
  await setRange(page,'#thermal-voltage',0);model.setParameters({voltage:0,cooling:.5});assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-current')),0);
  const old=model.maxTemperature;assert.ok(model.step(.04).ok);await page.locator('#thermal-step').click();close(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-temperature')),model.maxTemperature,1e-9);assert.ok(model.maxTemperature<old);
  await page.locator('#thermal-view').click();const hidden=await page.evaluate(part=>{const m=window.__lightningThree.scene.getObjectByName('discharge-core'),c=new THREE.Color();m.getColorAt(part,c);return c.toArray();},part);assert.deepEqual(hidden,[1,1,1]);
  assert.equal(await page.evaluate(()=>window.__lightningSent.length),sent,'thermal controls do not change the DBM field');
  gen=await generation(page);await page.locator('#electrode-shape').selectOption('blunt');await waitReset(page,gen);assert.equal(await page.locator('#lightning-stage').getAttribute('data-thermal'),'off');assert.deepEqual(errors,[]);
});

test('voxel electrode controls change the actual boundaries and rendered electrode, not just the shape label', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const old=(await latest(page,'ready')).primary,gen=await generation(page);await page.evaluate(()=>{
    for(const [id,value,type] of [['electrode-radius','.08','input'],['electrode-length','.16','input'],['electrode-shape','blunt','change']]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event(type,{bubbles:true}));}
  });await waitReset(page,gen);const d=(await latest(page,'ready')).primary;assert.equal(d.stats.steps,0);assert.equal(d.electrodeShape,'blunt');assert.equal(d.sourceBody.length,111);assert.equal(d.targetBody.length,111);
  assert.notDeepEqual(d.mask,old.mask);const expected=run(new Model.Discharge({quality:'standard',seed:19,eta:4,electrodeShape:'blunt',electrodeLength:.16,electrodeRadius:.08}),0);
  assert.deepEqual(d.mask,Array.from(expected.mask));assert.ok(maxDifference(d.potential,expected.potential)<1e-6);assert.match(await page.locator('#electrode-cells').innerText(),/111 个体素/);
  const visual=await page.evaluate(()=>{const a=window.__lightningThree.scene.getObjectByName('source-electrode-voxels'),b=window.__lightningThree.scene.getObjectByName('target-electrode-voxels'),path=window.__lightningThree.scene.getObjectByName('discharge-core');return [a.geometry.getAttribute('position').count,b.geometry.getAttribute('position').count,path.count];});
  assert.ok(visual[0]>36&&visual[1]>36);assert.equal(visual[2],0,'the electrode scaffold is not displayed as branching discharge');assert.deepEqual(errors,[]);
});

test('captured before/after slice, field probe and candidate probabilities match actual consecutive worker snapshots', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const previous=(await latest(page,'ready')).primary;await page.locator('#event-capture').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.event==='ready',null,{timeout:30000});
  const capture=await latest(page,'capture'),comparison=Event.compare(capture.before,capture.primary);assert.equal(capture.before.stats.steps,previous.stats.steps);assert.equal(capture.primary.stats.steps,previous.stats.steps+1);
  assert.deepEqual(capture.before.potential,previous.potential);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-event-after')),capture.primary.stats.steps);
  const id=Number(await page.locator('#lightning-stage').getAttribute('data-event-probe')),d=capture.primary,x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny,p=Event.sample(comparison,x,y,z);
  assert.ok(p.valid);close(Number(await page.locator('#lightning-stage').getAttribute('data-event-delta-phi')),p.deltaPhi);close(Number(await page.locator('#lightning-stage').getAttribute('data-event-delta-e')),p.deltaE);
  await page.locator('#event-view').selectOption('deltaE');await twoFrames(page);const expected=Event.slice(comparison,'deltaE',z).bytes;
  const actual=await page.evaluate(()=>{let data;window.__lightningThree.scene.traverse(o=>{if(o.material&&o.material.map&&o.material.map.isDataTexture)data=Array.from(o.material.map.image.data);});return data;});assert.deepEqual(actual,Array.from(expected));
  assert.match(await page.locator('#event-readout').innerText(),/候选概率/);await setRange(page,'#event-x',0);assert.notEqual(Number(await page.locator('#lightning-stage').getAttribute('data-event-probe')),id);
  await setRange(page,'#eta',3.5);assert.equal(await page.locator('#lightning-stage').getAttribute('data-event'),'off');assert.equal(await page.locator('#event-view').isDisabled(),true);assert.match(await page.locator('#event-readout').innerText(),/η 已变化/);assert.deepEqual(errors,[]);
});

test('a capture requested during an in-flight batch waits, and a contact event cannot invent an after-field', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.evaluate(()=>{window.__delayLightningAdvance=700;});await page.locator('#play').click();await page.waitForFunction(()=>window.__lightningSent.some(m=>m.type==='advance'),null,{timeout:30000});
  await page.locator('#event-capture').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-event'),'waiting');await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.event==='ready',null,{timeout:30000});
  let capture=await latest(page,'capture');assert.ok(capture.before.stats.steps>120);assert.equal(capture.primary.stats.steps,capture.before.stats.steps+1);assert.equal(await page.locator('#play-text').innerText(),'播放');
  const m=new Model.Discharge({quality:'quick',eta:6,seed:3});assert.ok(m.solve().converged);while(!m.complete)assert.ok(m.step().ok);const contact=m.steps;
  const gen=await generation(page);await page.evaluate(warm=>{window.__delayLightningAdvance=0;window.__lightningWarmOverride=warm;for(const [id,value,type] of [['grid-quality','quick','change'],['eta','6','input'],['random-seed','3','change']]){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event(type,{bubbles:true}));}},contact-1);
  await waitReset(page,gen);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-steps')),contact-1);await page.locator('#event-capture').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.complete==='true',null,{timeout:30000});
  capture=await latest(page,'capture');assert.equal(capture.primary.stats.complete,true);assert.deepEqual(capture.before.potential,capture.primary.potential);assert.equal(await page.locator('#lightning-stage').getAttribute('data-event'),'off');assert.match(await page.locator('#event-readout').innerText(),/未计算接触后的电势场/);assert.equal(await page.locator('#event-view').isDisabled(),true);assert.deepEqual(errors,[]);
});

test('background grid and paired-seed statistics show actual independent runs and can be cancelled without stale results', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);const original=(await latest(page,'ready')).primary;
  await page.locator('#grid-events').fill('4');await page.locator('#grid-study').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.gridStudy==='done',null,{timeout:60000});
  let result=(await latest(page,'result')).payload;for(let i=0;i<2;i++){const m=new Model.Discharge({quality:['quick','standard'][i],eta:4,seed:19});assert.ok(m.solve().converged);for(let k=0;k<4;k++)assert.ok(m.step().ok);close(result.results[i].length,Study.measure(m).length);}
  assert.match(await page.locator('#grid-results').innerText(),/17×25×17/);await page.locator('#stats-samples').fill('2');await page.locator('#stats-events').fill('12');await page.locator('#stats-run').click();
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.statsStudy==='done',null,{timeout:60000});result=(await latest(page,'result')).payload;assert.equal(result.mode,'stats');assert.equal(await page.locator('#lightning-stage').getAttribute('data-grid-study'),'done','separate study results remain available');
  for(let g=0;g<2;g++)for(let j=0;j<2;j++){const m=new Model.Discharge({quality:'quick',eta:g?1:4,seed:19+j});assert.ok(m.solve().converged);for(let k=0;k<12;k++)assert.ok(m.step().ok);close(result.samples[g][j].length,Study.measure(m).length);}
  assert.match(await page.locator('#stats-results').innerText(),/未接通 \/ 截尾/);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-stats-samples')),2);
  await page.locator('#stats-samples').fill('15');await page.locator('#stats-events').fill('250');await page.locator('#stats-run').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-stats-study'),'running');
  await page.locator('#stats-cancel').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-stats-study'),'idle');assert.match(await page.locator('#stats-results').innerText(),/已取消/);
  await page.locator('#stats-samples').fill('1');await page.locator('#stats-events').fill('2');await page.locator('#stats-eta').fill('1.24');await page.locator('#stats-run').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.statsStudy==='done',null,{timeout:60000});assert.match(await page.locator('#stats-results').innerText(),/± —/);assert.equal((await latest(page,'result')).payload.etas[1],1.2);assert.equal(await page.locator('#stats-eta').inputValue(),'1.2');
  const latestPrimary=await page.evaluate(()=>window.__lightningEvents.filter(e=>e.primary).at(-1).primary);assert.deepEqual(Array.from(latestPrimary.segments),original.segments);assert.deepEqual(errors,[]);
});

test('Canvas fallback supports real event-difference slices and electrothermal controls', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await disableWebGL(page);await watchWorker(page);await open(page);assert.equal(await page.locator('#lightning-stage').getAttribute('data-renderer'),'canvas');
  const before=await image(page);await page.locator('#event-capture').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.event==='ready',null,{timeout:30000});assert.notEqual(await image(page),before);
  const gen=await generation(page);await page.locator('#thermal-example').click();await waitReset(page,gen);const cold=await image(page);await page.locator('#thermal-step').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-thermal'),'paused');assert.notEqual(await image(page),cold);assert.deepEqual(errors,[]);
});

test('in-flight event capture is discarded on boundary reset, and background results are invalidated by model changes', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.evaluate(()=>{window.__delayLightningCapture=800;});await page.locator('#event-capture').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-event'),'capturing');
  const gen=await generation(page);await page.locator('#electrode-shape').selectOption('blunt');await waitReset(page,gen);await page.waitForTimeout(900);
  assert.equal(await page.locator('#lightning-stage').getAttribute('data-event'),'off');assert.equal(await page.locator('#event-view').isDisabled(),true);assert.match(await page.locator('#event-readout').innerText(),/重置|参数/);
  await page.locator('#stats-samples').fill('10');await page.locator('#stats-events').fill('200');await page.locator('#stats-run').click();assert.equal(await page.locator('#lightning-stage').getAttribute('data-stats-study'),'running');
  await setRange(page,'#eta',2.5);assert.equal(await page.locator('#lightning-stage').getAttribute('data-stats-study'),'idle');assert.match(await page.locator('#stats-results').innerText(),/参数已变化/);assert.deepEqual(errors,[]);
});

test('mobile knowledge-card actions reveal controls and run the event and statistics work without blocking the stage', {timeout:120000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="event"]').tap();await page.locator('#event-card-capture').tap();
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.event==='ready',null,{timeout:30000});assert.equal(await page.locator('#control-panel').isVisible(),true);assert.match(await page.locator('#event-readout').innerText(),/事件 120 → 121/);
  await page.evaluate(()=>{for(const [id,value] of [['stats-samples','2'],['stats-events','8']]){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));}});
  await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="stats"]').tap();await page.locator('#stats-card-run').tap();
  await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.statsStudy==='done',null,{timeout:60000});assert.equal(await page.locator('#control-panel').isVisible(),true);assert.match(await page.locator('#stats-results').innerText(),/未接通 \/ 截尾/);assert.deepEqual(errors,[]);
});

test('background tab pauses the independent post-contact thermal clock', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);const gen=await generation(page);await page.locator('#thermal-example').click();await waitReset(page,gen);
  await page.locator('#thermal-play').click();await page.waitForFunction(()=>Number(document.querySelector('#lightning-stage').dataset.thermalTime)>=.12,null,{timeout:30000});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const time=Number(await page.locator('#lightning-stage').getAttribute('data-thermal-time'));
  await page.waitForTimeout(300);assert.equal(Number(await page.locator('#lightning-stage').getAttribute('data-thermal-time')),time);assert.equal(await page.locator('#thermal-play').innerText(),'继续电热');assert.deepEqual(errors,[]);
});

test('high-density option and fine-versus-ultra comparison use the actual 41×61×41 solver grid', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  const gen=await generation(page);await page.locator('#grid-quality').selectOption('ultra');await waitReset(page,gen);const d=(await latest(page,'ready')).primary;
  assert.deepEqual([d.nx,d.ny,d.nz],[41,61,41]);assert.equal(d.stats.steps,0);assert.ok(d.stats.residual<=1e-5);
  const expected=new Model.Discharge({quality:'ultra',seed:19,eta:4});assert.ok(expected.solve().converged);assert.ok(maxDifference(d.potential,Array.from(expected.snapshot().potential))<1e-6);
  await page.locator('#grid-pair').selectOption('fine:ultra');await page.locator('#grid-events').fill('0');await page.locator('#grid-study').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.gridStudy==='done',null,{timeout:60000});
  const data=(await latest(page,'result')).payload;assert.deepEqual(data.results.map(x=>[x.nx,x.ny,x.nz]),[[33,49,33],[41,61,41]]);assert.ok(data.results.every(x=>x.steps===0&&x.residual<=1e-5));assert.match(await page.locator('#grid-results').innerText(),/41×61×41/);assert.deepEqual(errors,[]);
});

test('new studies stay local, and an unavailable analysis worker reports failure without corrupting the main model', {timeout:120000},async t=>{
  const page=await newPage(t),remote=[];await page.route('**/*',route=>{const u=route.request().url();if(!u.startsWith(base)&&!u.startsWith('data:')&&!u.startsWith('blob:')){remote.push(u);return route.abort();}return route.continue();});
  await watchWorker(page);await open(page);const before=(await latest(page,'ready')).primary;
  const block=route=>route.abort();await page.route('**/lightning-analysis-worker.js*',block);await page.locator('#stats-samples').fill('1');await page.locator('#stats-events').fill('2');await page.locator('#stats-run').click();
  await page.waitForFunction(()=>document.querySelector('#stats-results').textContent.includes('无法启动'),null,{timeout:30000});assert.equal(await page.locator('#lightning-stage').getAttribute('data-status'),'ready');assert.equal(await page.locator('#lightning-stage').getAttribute('data-stats-study'),'idle');
  await page.unroute('**/lightning-analysis-worker.js*',block);await page.locator('#stats-run').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.statsStudy==='done',null,{timeout:30000});
  await page.locator('#event-capture').click();await page.waitForFunction(()=>document.querySelector('#lightning-stage').dataset.event==='ready',null,{timeout:30000});const frame=(await latest(page,'capture')).before;
  assert.deepEqual(frame.segments,before.segments);assert.deepEqual(remote,[]);
});
