'use strict';
// Optional browser regressions: install playwright-core and provide Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {createHash}=require('node:crypto'),{pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const M=require('../turing-model.js'),root=path.resolve(__dirname,'..');
let axe;try{axe=require('axe-core');}catch(_){}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/turing-patterns.html';
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}) {
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(error){if(i===2||!/signal=SIGSEGV/.test(String(error)))throw error;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function disableWebGL(page) {
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:original.call(this,kind,...args);};});
}
async function watchWorker(page) {
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__turingEvents=[];window.__turingSent=[];
    window.Worker=function(...args){
      const worker=new Original(...args),post=worker.postMessage.bind(worker);
      worker.postMessage=function(message,...rest){window.__turingSent.push(structuredClone(message));return post(message,...rest);};
      worker.addEventListener('message',event=>{
        const data=event.data,copy={kind:data.kind,generation:data.generation,message:data.message};
        function field(value){return value?{stats:value.stats,spectrum:value.spectrum,probe:value.probe,mode:value.mode?{...value.mode,values:new Float32Array(value.mode.values).slice()}:null,u:new Float32Array(value.u).slice(),v:new Float32Array(value.v).slice()}:null;}
        copy.primary=field(data.primary);copy.reference=field(data.reference);copy.warmHistory=data.warmHistory;
        if(data.mesh)copy.mesh={vertices:data.mesh.vertices,faces:data.mesh.faces,level:data.mesh.level};
        window.__turingEvents.push(copy);
      });return worker;
    };
  });
}
async function watchThree(page,mode='normal') {
  await page.route('**/turing.js*',async route=>{
    const response=await route.fetch(),source=await response.text();
    const spy=`if(window.THREE){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...args){const renderer=new Original(...args),render=renderer.render.bind(renderer);
      renderer.render=function(scene,camera){window.__turingThree={renderer,scene,camera,count:(window.__turingThree?.count||0)+1};const result=render(scene,camera);
        if(${JSON.stringify(mode)}==='shader'&&renderer.info.programs.length)renderer.info.programs[0].diagnostics={runnable:false};
        if(${JSON.stringify(mode)}==='blank'){const gl=renderer.getContext();gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
        return result;};return renderer;};}\n`;
    await route.fulfill({response,body:spy+source});
  });
}
async function open(page,url=base+'turing-patterns.html') {
  await page.goto(url,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#turing-stage').dataset.status),null,{timeout:45000});
  if(await page.locator('#turing-stage').getAttribute('data-status')!=='ready')throw new Error(await page.locator('#stage-error-text').innerText());
  await page.waitForTimeout(100);
}
async function readyAfter(page,generation) {
  await page.waitForFunction(g=>document.querySelector('#turing-stage').dataset.status==='ready'&&window.__turingEvents?.some(e=>e.kind==='ready'&&e.generation>g),generation,{timeout:45000});
}
async function generation(page){return page.evaluate(()=>Math.max(0,...window.__turingEvents.filter(e=>e.kind==='ready').map(e=>e.generation)));}
async function eventAfter(page,kind,count=0) {
  await page.waitForFunction(({kind,count})=>window.__turingEvents.filter(e=>e.kind===kind).length>count,{kind,count},{timeout:30000});
}
async function latest(page,kind) {
  return page.evaluate(kind=>{
    const e=window.__turingEvents.findLast(x=>!kind||x.kind===kind);
    const f=x=>x?{stats:x.stats,spectrum:x.spectrum,probe:x.probe,mode:x.mode?{...x.mode,values:Array.from(x.mode.values)}:null,u:Array.from(x.u),v:Array.from(x.v)}:null;
    return {kind:e.kind,generation:e.generation,primary:f(e.primary),reference:f(e.reference),mesh:e.mesh,warmHistory:e.warmHistory};
  },kind);
}
async function setRange(page,id,value) {
  await page.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
}
async function screenCenter(page,name='primary-surface') {
  await page.waitForFunction(()=>window.__turingThree?.scene.getObjectByName('primary-surface'),null,{timeout:15000});
  return page.evaluate(name=>{const {scene,camera}=window.__turingThree,object=scene.getObjectByName(name),p=new THREE.Vector3();object.getWorldPosition(p);p.project(camera);const r=document.querySelector('#turing-scene').getBoundingClientRect();return {x:r.left+(p.x*.5+.5)*r.width,y:r.top+(1-p.y)*.5*r.height};},name);
}
async function hash(page) {
  await page.waitForTimeout(120);
  const image=await page.locator('#turing-scene').evaluate(el=>el.toDataURL('image/png'));
  assert.ok(image.length>6000,'canvas contains rendered content');return createHash('sha256').update(image).digest('hex');
}
function maxDifference(a,b){assert.equal(a.length,b.length);let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
async function requireWebGL(page,t) {
  const supported=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl2'));
  if(!supported){t.skip('WebGL2 unavailable; use hardware or software WebGL');return false;}
  assert.equal(await page.locator('#turing-stage').getAttribute('data-renderer'),'webgl');return true;
}

test('WebGL renders the real prewarmed field, fixed concentration colors and contours', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const result=await latest(page,'ready'),mesh=M.makeSphere(4),model=new M.ReactionSphere(mesh,{b:1.8,ratio:20,kind:'noise',degree:10,amplitude:.03,seed:20261031});
  for(let i=0;i<32;i++)M.advanceTogether([model],.5);
  assert.equal(result.primary.stats.time,16);assert.equal(result.mesh.vertices,2562);assert.ok(maxDifference(result.primary.u,Array.from(model.u))<1e-6);
  assert.ok(maxDifference(result.primary.v,Array.from(model.v))<1e-6);assert.ok(Math.abs(result.primary.stats.stdU-model.statistics().stdU)<1e-10);
  const colors=await page.evaluate(()=>{const o=window.__turingThree.scene.getObjectByName('primary-surface'),a=o.geometry.getAttribute('color');return Array.from(a.array);});
  const lo=result.primary.u.indexOf(Math.min(...result.primary.u)),hi=result.primary.u.indexOf(Math.max(...result.primary.u));
  assert.ok(colors[3*hi]>colors[3*lo]+.1,'mesh colors correspond to actual concentration');
  await page.evaluate(()=>{window.__contourAttribute=window.__turingThree.scene.getObjectByName('primary-contour').geometry.getAttribute('position');});
  const uImage=await hash(page);await page.locator('[data-display="v"]').click();const vImage=await hash(page);assert.notEqual(uImage,vImage);
  assert.equal(await page.evaluate(()=>window.__contourAttribute===window.__turingThree.scene.getObjectByName('primary-contour').geometry.getAttribute('position')),true,'contour updates reuse the GPU buffer');
  assert.match(await page.locator('#color-scale-note').innerText(),/0.30–2.30.*范围外截色/);
  assert.equal(await page.locator('#legend-contour-text').innerText(),'V = 1.45');
  await page.locator('label[for="show-contours"]').click();assert.equal(await page.locator('#show-contours').isChecked(),false);
  assert.notEqual(await hash(page),vImage,'actual contour segments change the rendering');
  assert.equal(await page.locator('#play-text').innerText(),'播放','reduced-motion starts paused');assert.deepEqual(errors,[]);
});

test('matched A/B starts identically, mirrors a real poke, then separates under diffusion alone', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const gen=await generation(page);await page.locator('#compare-toggle').click();await readyAfter(page,gen);
  const initial=await latest(page,'ready');assert.equal(initial.primary.stats.time,0);assert.equal(initial.reference.stats.time,0);
  assert.equal(initial.primary.stats.ratio,20);assert.equal(initial.reference.stats.ratio,1);
  assert.deepEqual(initial.primary.u,initial.reference.u);assert.deepEqual(initial.primary.v,initial.reference.v);
  await page.locator('button[data-tool="paint"]').click();const center=await screenCenter(page);await page.mouse.click(center.x,center.y);await eventAfter(page,'poked');
  const poke=await latest(page,'poked');assert.equal(poke.primary.stats.pokes,1);assert.equal(poke.reference.stats.pokes,1);
  assert.deepEqual(poke.primary.u,poke.reference.u);assert.deepEqual(poke.primary.v,poke.reference.v);
  assert.ok(maxDifference(poke.primary.u,initial.primary.u)>.04,'surface gesture changes the underlying U field');
  await page.locator('button[data-tool="orbit"]').click();await page.locator('[data-speed="2"]').click();await page.locator('#play').click();
  await page.waitForFunction(()=>Number(document.querySelector('#turing-stage').dataset.time)>=16,null,{timeout:30000});await page.locator('#play').click();
  await page.waitForTimeout(120);const evolved=await latest(page);
  assert.equal(evolved.primary.stats.time,evolved.reference.stats.time);assert.equal(evolved.primary.stats.substeps,evolved.reference.stats.substeps);
  assert.ok(evolved.primary.stats.stdU>.4);assert.ok(evolved.reference.stats.stdU<.01);assert.ok(evolved.primary.stats.stdU>evolved.reference.stats.stdU*50);
  const configuredCount=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='configured').length);
  await setRange(page,'#diffusion-ratio',30);await eventAfter(page,'configured',configuredCount);const configured=await latest(page,'configured');
  assert.equal(configured.primary.stats.ratio,30);assert.equal(configured.reference.stats.ratio,1);assert.equal(configured.primary.stats.b,configured.reference.stats.b);
  assert.equal(configured.primary.stats.time,evolved.primary.stats.time);assert.deepEqual(configured.primary.u,evolved.primary.u);assert.deepEqual(configured.reference.u,evolved.reference.u);
  assert.match(await page.locator('#comparison-status').innerText(),/相同反应、初态和子步/);assert.deepEqual(errors,[]);
});

test('measured mode growth uses two actual projections and distinguishes finite-time data from theory', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  let gen=await generation(page);await page.locator('[data-preset="mode"]').click();await readyAfter(page,gen);await page.locator('[data-note="spectrum"]').click();await eventAfter(page,'inspected');
  const first=await latest(page,'inspected');assert.equal(first.primary.spectrum.time,0);assert.equal(await page.locator('#mode-rate-measured').innerText(),'等待采样');
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#turing-stage').dataset.measuredGrowth!=='',null,{timeout:20000});await page.locator('#play').click();
  const last=await page.evaluate(()=>window.__turingEvents.findLast(e=>e.kind==='frame'&&e.primary.spectrum).primary.spectrum);
  const mode=Number(await page.locator('#turing-stage').getAttribute('data-measured-mode'));
  const observed=Number(await page.locator('#turing-stage').getAttribute('data-measured-growth'));
  const expected=Math.log(last.power[mode]/first.primary.spectrum.power[mode])/(last.time-first.primary.spectrum.time);
  assert.equal(mode,10);assert.ok(Math.abs(observed-expected)<1e-9);assert.ok(Math.abs(observed-M.growthRate(1.8,20,mode))<.05);
  assert.match(await page.locator('#mode-rate-window').innerText(),/实测幅度比取对数/);
  assert.match(await page.locator('#spectrum-note').innerText(),/有限时间变化/);
  const count=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='configured').length);await setRange(page,'#reaction-b',1.75);await eventAfter(page,'configured',count);
  assert.equal(await page.locator('#mode-rate-measured').innerText(),'等待采样','parameter changes reset the measurement baseline');assert.deepEqual(errors,[]);
});

test('all six presets, independent reset semantics and actual mesh choices work', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  for(const [name,time,ratio,kind] of [['growth',0,20,'noise'],['uniform',0,1,'noise'],['critical',0,9,'mode'],['mode',0,20,'mode'],['strong',8,30,'noise'],['bloom',16,20,'noise']]) {
    const gen=await generation(page);await page.locator(`[data-preset="${name}"]`).click();await readyAfter(page,gen);
    const ready=await latest(page,'ready');assert.equal(ready.primary.stats.time,time,name);assert.equal(ready.primary.stats.ratio,ratio,name);assert.equal(await page.locator('#seed-kind').inputValue(),kind,name);
  }
  let gen=await generation(page);await page.locator('#reset').click();await readyAfter(page,gen);assert.equal((await latest(page,'ready')).primary.stats.time,0,'bottom reset starts at the initial disturbance');
  gen=await generation(page);await page.locator('#mesh-quality').selectOption('quick');await readyAfter(page,gen);assert.equal((await latest(page,'ready')).mesh.vertices,642);
  await page.locator('[data-note="spectrum"]').click();assert.match(await page.locator('#spectrum-note').innerText(),/快速网格的高阶投影误差较大/);
  gen=await generation(page);await page.locator('#mesh-quality').selectOption('high');await readyAfter(page,gen);assert.equal((await latest(page,'ready')).mesh.vertices,10242);
  assert.equal(await page.locator('#card-mesh').innerText(),'10242 / 20480');assert.deepEqual(errors,[]);
});

test('keyboard, view restoration, playback, panel dismissal and PNG export remain functional', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const initial=await hash(page);await page.locator('#turing-scene').focus();await page.keyboard.press('ArrowLeft');assert.notEqual(await hash(page),initial);
  await page.keyboard.press('+');assert.ok(Number(await page.locator('#camera-zoom').inputValue())>1);
  await page.locator('#reset-view').click();assert.equal(await page.locator('#camera-zoom-value').innerText(),'1.00×');
  const initialTime=Number(await page.locator('#turing-stage').getAttribute('data-time'));await page.locator('#step').click();
  await page.waitForFunction(t=>Number(document.querySelector('#turing-stage').dataset.time)>t,initialTime);const stepped=Number(await page.locator('#turing-stage').getAttribute('data-time'));assert.ok(Math.abs(stepped-initialTime-.2)<1e-8);
  await page.locator('#poke-center').click();await eventAfter(page,'poked');assert.equal((await latest(page,'poked')).primary.stats.pokes,1);
  await page.locator('#turing-scene').focus();await page.keyboard.press('Enter');await eventAfter(page,'poked',1);assert.equal((await latest(page,'poked')).primary.stats.pokes,2);
  await page.locator('#nav-toggle').click();assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),require('./navigation-fixtures.cjs')['turing-patterns.html']);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#lab-navigation').isVisible(),false);assert.equal(Number(await page.locator('#turing-stage').getAttribute('data-time')),stepped);
  const pending=page.waitForEvent('download');await page.locator('#save-image').click();const download=await pending;
  assert.equal(download.suggestedFilename(),'turing-pattern.png');assert.deepEqual(fs.readFileSync(await download.path()).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  await page.locator('#turing-scene').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#play-text').innerText(),'暂停');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await page.locator('#play-text').innerText(),'播放');assert.deepEqual(errors,[]);
});

test('Canvas fallback renders and perturbs the same numerical field without WebGL', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await disableWebGL(page);await watchWorker(page);await open(page);
  assert.equal(await page.locator('#turing-stage').getAttribute('data-renderer'),'canvas');assert.equal(await page.locator('#stage-fallback').isVisible(),true);
  const field=await latest(page,'ready');assert.equal(field.primary.stats.time,16);assert.ok(Math.abs(field.primary.stats.stdU-.7935788057)<1e-7);
  const before=await hash(page);await page.locator('[data-display="v"]').click();assert.notEqual(await hash(page),before);
  await page.locator('button[data-tool="paint"]').click();await page.mouse.click(710,410);await eventAfter(page,'poked');
  const poke=await latest(page,'poked');assert.ok(maxDifference(poke.primary.u,field.primary.u)>.02);
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#turing-stage').dataset.time)>16.4,null,{timeout:20000});await page.locator('#play').click();
  assert.deepEqual(errors,[]);
});

for(const mode of ['shader','blank','context'])test(`WebGL ${mode} failure preserves the field and switches to Canvas`,{timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page,mode==='context'?'normal':mode);await open(page);
  if(mode==='context') {
    if(!await requireWebGL(page,t))return;
    const lost=await page.evaluate(()=>{const gl=window.__turingThree.renderer.getContext(),ext=gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
    if(!lost){t.skip('WEBGL_lose_context unavailable');return;}
  }
  await page.waitForFunction(()=>document.querySelector('#turing-stage').dataset.renderer==='canvas',null,{timeout:15000});
  assert.equal(await page.locator('#stage-fallback').isVisible(),true);assert.equal(await page.locator('#turing-stage').getAttribute('data-time'),'16');
  assert.ok(Math.abs(Number(await page.locator('#turing-stage').getAttribute('data-std'))-.7935788057)<1e-7);await hash(page);assert.deepEqual(errors,[]);
});

test('small screens, scrollable navigation and a single-touch surface poke', {timeout:90000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  assert.equal(await page.locator('#control-panel').isVisible(),false);assert.equal(await page.locator('#knowledge-panel').isVisible(),false);
  await page.locator('#toggle-controls').tap();await page.locator('button[data-tool="paint"]').tap();await page.locator('#toggle-controls').tap();
  const point=await screenCenter(page);await page.touchscreen.tap(point.x,point.y);await eventAfter(page,'poked');assert.equal((await latest(page,'poked')).primary.stats.pokes,1);
  await page.locator('#toggle-controls').tap();let gen=await generation(page);await page.locator('#compare-toggle').tap();await readyAfter(page,gen);await page.locator('#toggle-controls').tap();
  for(const [width,height] of [[320,568],[390,844],[568,320],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(250);
    const geometry=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};};
return {w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,stage:{...document.querySelector('#turing-stage').dataset},labels:[...document.querySelectorAll('.sphere-label')].map(rect),hud:rect(document.querySelector('.lab-bottom'))};
    });
    assert.deepEqual([geometry.w,geometry.h],[width,height],`${width}×${height} has no document overflow`);
    for(const r of geometry.labels){assert.ok(r.left>=0&&r.top>=0&&r.right<=width&&r.bottom<=geometry.hud.top+1,`${width}×${height}: ${JSON.stringify(geometry)}`);}
    const [a,b]=geometry.labels;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${width}×${height}: labels must not overlap`);
    await page.locator('#nav-toggle').click();const links=await page.locator('#lab-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));assert.deepEqual(links,require('./navigation-fixtures.cjs')['turing-patterns.html']);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#lab-navigation').isVisible(),false);
  }
  assert.deepEqual(errors,[]);
});

test('local file entry works offline and worker failures are reported instead of faking a field', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await disableWebGL(page);await watchWorker(page);await page.context().setOffline(true);await open(page,pathToFileURL(path.join(root,'turing-patterns.html')).href);
  assert.equal(await page.locator('#turing-stage').getAttribute('data-renderer'),'canvas');assert.equal((await latest(page,'ready')).primary.stats.time,16);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  const gen=await generation(page);await page.locator('#reaction-model').selectOption('gray-scott');await readyAfter(page,gen);
  assert.equal((await latest(page,'ready')).primary.stats.model,'gray-scott');assert.equal((await latest(page,'ready')).primary.stats.time,200);assert.deepEqual(external,[]);
  await page.context().setOffline(false);await page.addInitScript(()=>{window.Worker=function(){throw new Error('blocked');};});
  await page.goto(base+'turing-patterns.html');await page.waitForFunction(()=>document.querySelector('#turing-stage').dataset.status==='error');
  assert.match(await page.locator('#stage-error-text').innerText(),/无法启动反应扩散后台线程/);assert.equal(await page.locator('#play').isDisabled(),true);
});

test('axe reports no accessibility violations in controls, cards and navigation at three sizes', {timeout:90000,skip:!axe},async t=>{
  const page=await newPage(t);await open(page);await page.addScriptTag({content:axe.source});
  async function audit(label){const results=await page.evaluate(()=>axe.run(document));assert.deepEqual(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label);}
  for(const [width,height] of [[1440,900],[390,844],[568,320]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(100);await audit(`${width}×${height} initial`);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();await audit(`${width}×${height} controls`);
    if(!await page.locator('#knowledge-panel').isVisible())await page.locator('#toggle-knowledge').click();
    for(const name of ['comparison','reaction','spectrum','nonlinear','limits']){await page.locator(`[data-note="${name}"]`).click();await audit(`${width}×${height} ${name}`);}
    await page.locator('#nav-toggle').click();await audit(`${width}×${height} navigation`);await page.keyboard.press('Escape');
  }
});

test('probe reads and draws actual local terms without changing either field in WebGL and Canvas', {timeout:120000},async t=>{
  for(const fallback of [false,true]) {
    const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(fallback)await disableWebGL(page);await watchWorker(page);if(!fallback)await watchThree(page);await open(page);
    if(!fallback&&!await requireWebGL(page,t))return;
    const before=await latest(page,'ready');
    await page.locator('#probe-center').click();await eventAfter(page,'probed');
    const probed=await latest(page,'probed');assert.ok(probed.primary.probe);assert.equal(probed.primary.stats.time,before.primary.stats.time);
    assert.equal(probed.primary.stats.pokes,0);assert.deepEqual(probed.primary.u,before.primary.u);assert.deepEqual(probed.primary.v,before.primary.v);
    assert.ok(await page.locator('[data-note-content="probe"]').isVisible());
    assert.match(await page.locator('#probe-u-terms').innerText(),/[+\-].*\/.*[+\-]/);
    assert.equal(Number(await page.locator('#turing-stage').getAttribute('data-probe-index')),probed.primary.probe.index);
    if(!fallback)assert.equal(await page.evaluate(()=>window.__turingThree.scene.getObjectByName('primary-probe').visible),true);
    await page.locator('#turing-scene').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await eventAfter(page,'probed',1);
    const gen=await generation(page);await page.locator('#compare-toggle').click();await readyAfter(page,gen);const comparison=await latest(page,'ready');
    assert.ok(comparison.reference.probe);assert.equal(comparison.reference.probe.index,comparison.primary.probe.index);
    assert.equal(comparison.primary.stats.pokes,0);assert.equal(comparison.reference.stats.pokes,0);assert.equal(await page.locator('#probe-reference').isVisible(),true);
    assert.deepEqual(errors,[]);
  }
});

test('radius comparison changes the solved diffusion and actual sphere size, retaining a fair paired initial state', {timeout:120000},async t=>{
  for(const fallback of [false,true]) {
    const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));if(fallback)await disableWebGL(page);await watchWorker(page);if(!fallback)await watchThree(page);await open(page);
    if(!fallback&&!await requireWebGL(page,t))return;
    let gen=await generation(page);await setRange(page,'#sphere-radius',1.35);await readyAfter(page,gen);
    assert.equal((await latest(page,'ready')).primary.stats.radius,1.35);assert.match(await page.locator('#card-radius').innerText(),/^1.35/);
    await page.locator('[data-comparison="radius"]').click();gen=await generation(page);await page.locator('#compare-toggle').click();await readyAfter(page,gen);
    let paired=await latest(page,'ready');assert.equal(paired.primary.stats.radius,1.35);assert.equal(paired.reference.stats.radius,1);assert.equal(paired.primary.stats.ratio,paired.reference.stats.ratio);
    assert.deepEqual(paired.primary.u,paired.reference.u);assert.equal(paired.primary.stats.time,0);assert.match(await page.locator('#comparison-status').innerText(),/同一扩散系数/);
    if(!fallback) {
      await page.waitForTimeout(150);
      const scales=await page.evaluate(()=>{const s=window.__turingThree.scene;return [s.getObjectByName('reference').scale.x,s.getObjectByName('primary').scale.x];});
      assert.deepEqual(scales,[1,1.35]);
    }
    await page.locator('#step').click();await eventAfter(page,'frame');paired=await latest(page,'frame');
    assert.equal(paired.primary.stats.time,paired.reference.stats.time);assert.equal(paired.primary.stats.substeps,paired.reference.stats.substeps);assert.ok(maxDifference(paired.primary.u,paired.reference.u)>1e-5);
    assert.match(await page.locator('#card-regions').innerText(),/^\d+ \/ \d+$/);assert.deepEqual(errors,[]);
  }
});

test('interactive spherical phase diagram drives both parameters and classifies the continuum boundary without resetting the field', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await open(page);
  const gen=await generation(page),before=await latest(page,'ready');await page.locator('#phase-card-action').click();
  assert.equal(await page.locator('#phase-chart').isVisible(),true);assert.equal(await page.locator('#turing-stage').getAttribute('data-phase-class'),'unstable');
  assert.ok(Math.abs(Number(await page.locator('#turing-stage').getAttribute('data-phase-critical'))-M.phaseBoundary(1.8,1).criticalRatio)<1e-9);
  const box=await page.locator('#phase-chart').boundingBox(),point=(b,r)=>({x:box.x+box.width*(36+(b-1.4)/.55*226)/280,y:box.y+box.height*(155-(r-1)/39*141)/190});
  const a=point(1.8,20),b=point(1.6,5);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>Number(document.querySelector('#turing-stage').dataset.b)===1.6&&Number(document.querySelector('#turing-stage').dataset.ratio)===5,null,{timeout:20000});
  assert.equal(await page.locator('#reaction-b').inputValue(),'1.6');assert.equal(await page.locator('#diffusion-ratio').inputValue(),'5');
  assert.equal(await page.locator('#turing-stage').getAttribute('data-phase-class'),'stable');assert.equal(await generation(page),gen);
  assert.equal((await latest(page,'configured')).primary.stats.time,before.primary.stats.time);
  await page.locator('#phase-chart').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
  await page.waitForFunction(()=>Number(document.querySelector('#turing-stage').dataset.b)===1.61&&Number(document.querySelector('#turing-stage').dataset.ratio)===6,null,{timeout:20000});
  assert.match(await page.locator('#phase-parameters').innerText(),/1.61 \/ 6/);assert.match(await page.locator('#phase-result').innerText(),/稳定/);
  assert.ok((await page.locator('#phase-boundary').getAttribute('d')).length>100);assert.deepEqual(errors,[]);
});

test('real signed mode projection and historical curves are derived from actual worker fields', {timeout:120000},async t=>{
  for(const fallback of [false,true]) {
    const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));if(fallback)await disableWebGL(page);await watchWorker(page);if(!fallback)await watchThree(page);await open(page);
    const ready=await latest(page,'ready');assert.equal(ready.warmHistory.length,17);assert.equal(ready.warmHistory[0].time,0);assert.equal(ready.warmHistory.at(-1).time,16);
    assert.equal(Number(await page.locator('#turing-stage').getAttribute('data-history-count')),17);
    await page.locator('[data-note="spectrum"]').click();await eventAfter(page,'inspected');
    assert.match(await page.locator('#history-range').innerText(),/17 个真实采样/);assert.ok((await page.locator('#history-mode').getAttribute('d')).length>100);
    const original=await latest(page,'inspected');await page.locator('#show-mode-action').click();await eventAfter(page,'mode');const shown=await latest(page,'mode');
    assert.equal(shown.primary.mode.degree,10);assert.ok(Math.min(...shown.primary.mode.values)<0);assert.ok(Math.max(...shown.primary.mode.values)>0);
    assert.deepEqual(shown.primary.u,original.primary.u);assert.deepEqual(shown.primary.v,original.primary.v);assert.match(await page.locator('#stage-caption').innerText(),/非浓度/);
    assert.equal(await page.locator('#legend-contour-text').innerText(),'投影 = 0');assert.match(await page.locator('#color-scale-note').innerText(),/不是浓度/);
    const reconstructed=M.projectMode(M.makeSphere(4),Float64Array.from(shown.primary.u),10);assert.ok(maxDifference(shown.primary.mode.values,Array.from(reconstructed.values))<1e-6);
    await setRange(page,'#history-degree-input',6);await eventAfter(page,'mode',1);assert.equal((await latest(page,'mode')).primary.mode.degree,6);
    assert.equal(await page.locator('#mode-degree').inputValue(),'6');assert.equal(await page.locator('#turing-stage').getAttribute('data-history-selected'),'6');
    await page.locator('[data-history-scale="linear"]').click();assert.equal(await page.locator('[data-history-scale="linear"]').getAttribute('aria-pressed'),'true');
    await page.locator('#step').click();await eventAfter(page,'frame');assert.ok(Number(await page.locator('#turing-stage').getAttribute('data-history-count'))>17);
    const count=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='configured').length);await setRange(page,'#reaction-b',1.75);await eventAfter(page,'configured',count);
    assert.ok(await page.locator('#history-events line').count()>=1);assert.equal(await page.locator('#turing-stage').getAttribute('data-history-start'),'0');
    assert.deepEqual(errors,[]);
  }
});

test('Gray–Scott is an independent real solver with finite seeds, correct baseline theory and explicit model comparison', {timeout:180000},async t=>{
  for(const fallback of [false,true]) {
    const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));if(fallback)await disableWebGL(page);await watchWorker(page);if(!fallback)await watchThree(page);await open(page);
    let gen=await generation(page);await page.locator('#reaction-model').selectOption('gray-scott');await readyAfter(page,gen);
    let gray=await latest(page,'ready');assert.equal(gray.primary.stats.model,'gray-scott');assert.equal(gray.primary.stats.time,200);
    assert.equal(gray.primary.stats.ratio,.5);assert.ok(gray.primary.stats.stdU>.15);assert.ok(gray.primary.stats.maxV>.3);assert.ok(gray.primary.stats.regions>1);
    assert.equal(gray.warmHistory[0].time,0);assert.equal(gray.warmHistory.at(-1).time,200);assert.equal(await page.locator('#turing-stage').getAttribute('data-display'),'v');
    assert.equal(await page.locator('#card-equilibrium').innerText(),'1.00 / 0.00');assert.equal(await page.locator('#card-critical').innerText(),'不适用');
    assert.equal(await page.locator('#growth-label').innerText(),'静息态增长率');assert.match(await page.locator('#color-scale-note').innerText(),/0.00–0.45/);
    const independent=new M.ReactionSphere(M.makeSphere(4),{model:'gray-scott',feed:.05,kill:.065,ratio:.5,kind:'patch',amplitude:.5});
    for(let i=0;i<400;i++)independent.advance(.5);assert.ok(maxDifference(gray.primary.u,Array.from(independent.u))<1e-6);assert.ok(maxDifference(gray.primary.v,Array.from(independent.v))<1e-6);
    await page.locator('#phase-card-action').click();assert.equal(await page.locator('#phase-chart').isVisible(),false);assert.match(await page.locator('#phase-gray').innerText(),/不适用/);
    await page.locator('[data-note="spectrum"]').click();assert.match(await page.locator('#spectrum-note').innerText(),/其他非零均匀态未分类/);assert.match(await page.locator('#theory-band').innerText(),/无正增长/);
    gen=await generation(page);await page.locator('[data-preset="gray-rest"]').click();await readyAfter(page,gen);gray=await latest(page,'ready');
    assert.equal(gray.primary.stats.time,0);assert.ok(gray.primary.u.every(x=>x===1));assert.ok(gray.primary.v.every(x=>x===0));
    await page.locator('#step').click();await eventAfter(page,'frame');gray=await latest(page,'frame');assert.equal(gray.primary.stats.time,1);assert.ok(gray.primary.v.every(x=>x===0));
    await page.locator('#poke-center').click();await eventAfter(page,'poked');gray=await latest(page,'poked');assert.ok(Math.max(...gray.primary.v)>.2);
    let count=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='configured').length);await setRange(page,'#gray-feed',.04);await eventAfter(page,'configured',count);
    assert.equal((await latest(page,'configured')).primary.stats.feed,.04);assert.equal((await latest(page,'configured')).primary.stats.time,1);
    await page.locator('[data-comparison="model"]').click();gen=await generation(page);await page.locator('#compare-toggle').click();await readyAfter(page,gen);
    let paired=await latest(page,'ready');assert.equal(paired.primary.stats.model,'gray-scott');assert.equal(paired.reference.stats.model,'brusselator');assert.equal(paired.primary.stats.radius,paired.reference.stats.radius);
    assert.match(await page.locator('#comparison-status').innerText(),/非单变量对照/);assert.match(await page.locator('#color-scale-note').innerText(),/不能跨模型直接比较/);
    await page.locator('#step').click();await eventAfter(page,'frame',1);paired=await latest(page,'frame');assert.equal(paired.primary.stats.time,paired.reference.stats.time);assert.equal(paired.primary.stats.substeps,paired.reference.stats.substeps);
    count=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='poked').length);await page.locator('#poke-center').click();await eventAfter(page,'poked',count);paired=await latest(page,'poked');
    assert.equal(paired.primary.stats.pokes,1);assert.equal(paired.reference.stats.pokes,0);
    gen=await generation(page);await page.locator('#reaction-model').selectOption('brusselator');await readyAfter(page,gen);paired=await latest(page,'ready');
    assert.equal(paired.primary.stats.model,'brusselator');assert.equal(paired.reference.stats.model,'gray-scott');assert.equal(paired.primary.stats.time,0);assert.deepEqual(errors,[]);
  }
});

test('touch moves the non-invasive probe and drags the two-dimensional phase point on mobile', {timeout:90000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);
  if(!await requireWebGL(page,t))return;const before=await latest(page,'ready');
  await page.locator('#toggle-controls').tap();await page.locator('button[data-tool="probe"]').tap();await page.locator('#toggle-controls').tap();
  const center=await screenCenter(page);await page.touchscreen.tap(center.x,center.y);await eventAfter(page,'probed');
  let probe=await latest(page,'probed');assert.ok(probe.primary.probe);assert.equal(probe.primary.stats.pokes,0);assert.deepEqual(probe.primary.u,before.primary.u);
  const session=await page.context().newCDPSession(page);const touch=async(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  const count=await page.evaluate(()=>window.__turingEvents.filter(e=>e.kind==='probed').length);
  await touch('touchStart',center.x,center.y);for(let i=1;i<=6;i++)await touch('touchMove',center.x+i*4,center.y);await touch('touchEnd');await eventAfter(page,'probed',count);
  probe=await latest(page,'probed');assert.equal(probe.primary.stats.pokes,0);assert.deepEqual(probe.primary.u,before.primary.u);
  // Chromium can deliver a delayed synthesized click after a CDP touch drag;
  // let the gesture settle and only open the drawer if it is still closed.
  await page.waitForTimeout(500);if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').tap();
  await page.locator('#control-panel').waitFor({state:'visible'});await page.locator('#phase-card-action').tap();const box=await page.locator('#phase-chart').boundingBox();
  const point=(b,r)=>({x:box.x+box.width*(36+(b-1.4)/.55*226)/280,y:box.y+box.height*(155-(r-1)/39*141)/190}),start=point(1.8,20),end=point(1.6,5);
  await touch('touchStart',start.x,start.y);for(let i=1;i<=8;i++)await touch('touchMove',start.x+(end.x-start.x)*i/8,start.y+(end.y-start.y)*i/8);await touch('touchEnd');
  await page.waitForFunction(()=>Number(document.querySelector('#turing-stage').dataset.b)===1.6&&Number(document.querySelector('#turing-stage').dataset.ratio)===5,null,{timeout:20000});
  assert.equal(await page.locator('#turing-stage').getAttribute('data-phase-class'),'stable');assert.deepEqual(errors,[]);
});

test('new probe, phase, Gray–Scott and filtered-field states pass accessibility checks', {timeout:120000,skip:!axe},async t=>{
  const page=await newPage(t);await watchWorker(page);await open(page);await page.addScriptTag({content:axe.source});
  async function audit(label){const results=await page.evaluate(()=>axe.run(document));assert.deepEqual(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label);}
  for(const [width,height] of [[1440,900],[390,844]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();
    await page.locator('#probe-center').click();if(!await page.locator('#knowledge-panel').isVisible())await page.locator('#toggle-knowledge').click();await audit(`${width} probe`);
    await page.locator('[data-note="phase"]').click();await audit(`${width} phase`);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();
    const gen=await generation(page);await page.locator('#reaction-model').selectOption('gray-scott');await readyAfter(page,gen);await audit(`${width} gray controls`);
    if(!await page.locator('#knowledge-panel').isVisible())await page.locator('#toggle-knowledge').click();
    await page.locator('[data-note="phase"]').click();await audit(`${width} gray phase limitation`);
    await page.locator('[data-note="spectrum"]').click();await audit(`${width} gray spectrum and history`);
    await page.locator('#show-mode-action').click();await page.waitForFunction(()=>document.querySelector('#turing-stage').dataset.modeReady==='true');
    await audit(`${width} signed mode`);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();
    const next=await generation(page);await page.locator('#reaction-model').selectOption('brusselator');await readyAfter(page,next);
  }
});

test('different-radius and different-model pairs keep labels inside the viewport on small screens and fallback', {timeout:120000},async t=>{
  for(const fallback of [false,true]) {
    const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));if(fallback)await disableWebGL(page);await watchWorker(page);await open(page);
    await page.locator('#toggle-controls').tap();let gen=await generation(page);await setRange(page,'#sphere-radius',.6);await readyAfter(page,gen);
    await page.locator('[data-comparison="radius"]').tap();gen=await generation(page);await page.locator('#compare-toggle').tap();await readyAfter(page,gen);await page.locator('#toggle-controls').tap();
    async function check(){for(const [width,height] of [[320,568],[390,844],[568,320],[768,1024],[1440,900]]){
      await page.setViewportSize({width,height});await page.waitForFunction(({width,height})=>{const s=document.querySelector('#turing-stage').dataset;return Number(s.drawWidth)===width&&Number(s.drawHeight)===height;},{width,height},{timeout:20000});
      await page.waitForTimeout(550); // allow mobile HUD and font/layout measurements to settle
      const g=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,labels:[...document.querySelectorAll('.sphere-label')].map(rect),hud:rect(document.querySelector('.lab-bottom'))};});
      assert.deepEqual([g.w,g.h],[width,height]);for(const r of g.labels)assert.ok(r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=g.hud.top+1,`${width}×${height}: ${JSON.stringify(g)}`);
      const [a,b]=g.labels;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`${width}×${height}: labels overlap ${JSON.stringify(g)}`);
    }}
    await check();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').tap();
    gen=await generation(page);await page.locator('[data-comparison="model"]').tap();await readyAfter(page,gen);await page.locator('#toggle-controls').tap();
    await check();assert.deepEqual(errors,[]);
  }
});

test('WebGL probe arrows encode the measured tangential flux with a shared, bounded scale', {timeout:60000},async t=>{
  const page=await newPage(t);await watchWorker(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  await page.locator('#probe-center').click();await eventAfter(page,'probed');await page.waitForTimeout(150);const p=(await latest(page,'probed')).primary.probe;
  const arrows=await page.evaluate(()=>{const group=window.__turingThree.scene.getObjectByName('primary-probe');return group.children.slice(1).map(a=>{const d=new THREE.Vector3(0,1,0).applyQuaternion(a.quaternion);return {visible:a.visible,direction:d.toArray(),length:a.cone.position.y,scale:group.parent.scale.x};});});
  for(const [i,flux] of [p.fluxU,p.fluxV].entries()) {
    const magnitude=Math.hypot(...flux),length=Math.min(.55,8*magnitude);
    if(length<=1e-5){assert.equal(arrows[i].visible,false);continue;}
    assert.equal(arrows[i].visible,true);const direction=arrows[i].direction,alignment=direction.reduce((sum,x,k)=>sum+x*flux[k]/magnitude,0);
    assert.ok(alignment>.999999,'arrow direction matches -D gradient');assert.ok(Math.abs(arrows[i].length*arrows[i].scale-length)<1e-6,'arrow length uses the stated common scale and cap');
  }
});
