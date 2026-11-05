'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),{Ising3D}=require('../ising-model.js'),root=path.resolve(__dirname,'..');
let axe;try{axe=require('axe-core');}catch(_){}
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+(name==='/'?'/ising.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(error){if(i===2||!/signal=SIGSEGV/.test(String(error)))throw error;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function watch(page,slow=false){
  await page.addInitScript(({slow})=>{window.__isingEvents=[];const Native=window.Worker;
    window.Worker=function(url,...args){const w=new Native(url,...args);if(String(url).includes('ising-worker.js')){
      w.addEventListener('message',e=>{if(e.data&&e.data.kind!=='progress')window.__isingEvents.push(structuredClone(e.data));});
      if(slow){const post=w.postMessage.bind(w);w.postMessage=function(m,...rest){if(m.type==='advance'&&window.__slowAdvance){setTimeout(()=>post(m,...rest),700);return;}return post(m,...rest);};}
    }return w;};
  },{slow});
}
async function watchThree(page){
  await page.route('**/vendor/three.min.js*',async route=>{const response=await route.fetch(),text=await response.text();await route.fulfill({response,body:text+`\n;(function(){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...a){const r=new Original(...a);window.__isingRenderer=r;const render=r.render;r.render=function(s,c){window.__isingScene=s;window.__isingCamera=c;return render.call(this,s,c);};return r;};})();`});});
}
async function open(page){await page.goto(base+'ising.html');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.status==='ready',null,{timeout:60000});await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins,null,{timeout:30000});}
async function ds(page){return page.locator('#ising-stage').evaluate(e=>({...e.dataset}));}
async function requireWebGL(page,t){if((await ds(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return false;}return true;}
async function latest(page,kind){return page.evaluate(k=>{const e=window.__isingEvents.findLast(x=>!k||x.kind===k);return e?{...e,spins:[...new Int8Array(e.spins)]}:null;},kind);}
async function eventCount(page,kind){return page.evaluate(k=>window.__isingEvents.filter(e=>e.kind===k).length,kind);}
async function afterEvent(page,kind,n){await page.waitForFunction(({kind,n})=>window.__isingEvents.filter(e=>e.kind===kind).length>n,{kind,n},{timeout:30000});}
async function setRange(page,selector,value){await page.locator(selector).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function readyAfter(page,old){await page.waitForFunction(g=>{const e=document.querySelector('#ising-stage');return e.dataset.status==='ready'&&Number(e.dataset.generation)>g;},old,{timeout:60000});}
async function twoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function near(a,b,tol=1e-9){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} ± ${tol}`);}
function refWarm(options,warm){const ref=new Ising3D(options);for(let i=0;i<warm;i++)ref.sweep(1,false);ref.clearSamples();return ref;}

test('prewarmed 3D lattice, readouts and WebGL arrows are derived from the actual seeded Metropolis state', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);
  const data=await latest(page,'ready'),s=await ds(page),ref=refWarm({size:20,temperature:4.51,field:0,seed:20261031,initial:'random'},120);
  assert.deepEqual(data.spins,[...ref.spins]);near(data.stats.energy,ref.energy,1e-8);near(Number(s.magnetization),ref.stats().magnetization);assert.equal(s.sweeps,'120');assert.equal(s.sampleCount,'0');
  if(!await requireWebGL(page,t))return;assert.equal(s.drawSpins,'5600');assert.equal(await page.locator('#play-text').textContent(),'播放');
  const visual=await page.evaluate(()=>{const m=window.__isingScene.getObjectByName('ising-arrows'),indices=[0,3,201,3010,5599];return {count:m.count,visible:m.visible,up:new THREE.Color('#ffc08f').toArray(),down:new THREE.Color('#7de2df').toArray(),items:indices.map(i=>({i,yScale:m.instanceMatrix.array[i*16+5],x:m.instanceMatrix.array[i*16+12],y:m.instanceMatrix.array[i*16+13],z:m.instanceMatrix.array[i*16+14],rgb:[...m.instanceColor.array.slice(i*3,i*3+3)]}))};});
  assert.equal(visual.count,5600);assert.equal(visual.visible,true);const d=3.6/19;
  for(const p of visual.items){const i=p.i,x=i%20,y=Math.floor(i/20)%20,z=Math.floor(i/400);assert.equal(Math.sign(p.yScale),data.spins[i]);near(p.x,(x-9.5)*d,1e-6);near(p.y,(y-9.5)*d,1e-6);near(p.z,(z-9.5)*d,1e-6);for(let k=0;k<3;k++)near(p.rgb[k],data.spins[i]>0?visual.up[k]:visual.down[k],1e-6);}
  assert.deepEqual(errors,[]);
});

test('all presets publish the actual warm-up state and clearly distinguish zero-step and prewarmed starts', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);
  for(const [name,T,h,initial,warm] of [['cold',2.5,0,'up',0],['hot',7,0,'random',30],['quench',2.8,0,'random',0],['field',5.5,.6,'random',60],['critical',4.51,0,'random',120]]){
    const old=Number((await ds(page)).generation);await page.locator(`[data-preset="${name}"]`).click();await readyAfter(page,old);
    const data=await latest(page,'ready'),ref=refWarm({size:20,temperature:T,field:h,seed:20261031,initial},warm);
    assert.equal(data.stats.sweeps,warm,name);assert.equal(data.stats.sampleCount,0,name);assert.deepEqual(data.spins,[...ref.spins],name);
    near(data.stats.energyPerSpin,ref.stats().energyPerSpin,1e-9);assert.equal(await page.locator(`[data-preset="${name}"]`).getAttribute('aria-pressed'),'true');
  }
  const old=Number((await ds(page)).generation);await page.locator('#reset').click();await readyAfter(page,old);assert.equal(Number((await ds(page)).sweeps),0);assert.deepEqual(errors,[]);
});

test('live temperature and field changes preserve the full microstate and reset only the statistical window', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);
  await page.locator('#play').click();await page.waitForFunction(()=>Number(document.querySelector('#ising-stage').dataset.sampleCount)>=18,null,{timeout:30000});await page.locator('#play').click();await page.waitForTimeout(250);
  const before=await latest(page),sweep=before.stats.sweeps,count=await eventCount(page,'configured');
  await page.evaluate(()=>{const t=document.querySelector('#temperature'),h=document.querySelector('#field');t.value='6.00';t.dispatchEvent(new Event('input',{bubbles:true}));h.value='-0.70';h.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.temperature==='6'&&d.field==='-0.7';},null,{timeout:30000});
  const after=await latest(page,'configured');assert.ok((await eventCount(page,'configured'))>count);assert.deepEqual(after.spins,before.spins);assert.equal(after.stats.sweeps,sweep);assert.equal(after.stats.sampleCount,0);
  near(after.stats.energy,before.stats.energy+.7*before.stats.magnetization*before.stats.count,1e-7);assert.equal(await page.locator('#card-fluctuation').textContent(),'— / —');
  assert.match(await page.locator('#parameter-status').textContent(),/保留当前自旋/);assert.deepEqual(errors,[]);
});

test('seed and coordinate drafts survive playback; selecting and manually flipping a real spin updates energy without advancing', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);
  let gen=Number((await ds(page)).generation);await page.locator('[data-preset="cold"]').click();await readyAfter(page,gen);await page.locator('#play').click();
  await page.locator('#seed').fill('99');await page.locator('#probe-x').fill('1');await page.locator('#probe-y').fill('2');await page.locator('#probe-z').fill('3');
  await page.waitForFunction(()=>Number(document.querySelector('#ising-stage').dataset.sweeps)>=5,null,{timeout:20000});
  assert.equal(await page.locator('#seed').inputValue(),'99');assert.equal(await page.locator('#probe-x').inputValue(),'1');assert.equal(await page.locator('#probe-y').inputValue(),'2');assert.equal(await page.locator('#probe-z').inputValue(),'3');
  await page.locator('#play').click();gen=Number((await ds(page)).generation);await page.locator('#apply-seed').click();await readyAfter(page,gen);assert.match(await page.locator('#seed-status').textContent(),/99/);
  await page.locator('#probe-x').fill('1');await page.locator('#probe-y').fill('2');await page.locator('#probe-z').fill('3');let n=await eventCount(page,'probed');await page.locator('#set-probe').click();await afterEvent(page,'probed',n);
  const before=await latest(page,'probed');assert.equal(before.probe.index,1241);assert.equal(before.probe.spin,1);near(before.probe.deltaEnergy,12);assert.equal(before.stats.sweeps,0);
  n=await eventCount(page,'flipped');await page.locator('#flip-probe').click();await afterEvent(page,'flipped',n);const after=await latest(page,'flipped');
  assert.equal(after.probe.spin,-1);assert.equal(after.stats.sweeps,0);assert.equal(after.stats.sampleCount,0);assert.equal(after.stats.manualFlips,1);near(after.stats.energy-before.stats.energy,12);near(after.stats.magnetization,1-2/8000);
  const changed=after.spins.reduce((a,s,i)=>a+(s!==before.spins[i]),0);assert.equal(changed,1);assert.deepEqual(errors,[]);
});

test('layers and voxel/arrow display change only the rendering, including restored hidden spins', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=await latest(page,'ready');await setRange(page,'#layers',6);await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawLayers==='6');
  let state=await ds(page);assert.equal(state.visibleSpins,'2400');assert.equal(state.magnetization,String(before.stats.magnetization));assert.equal(state.sweeps,String(before.stats.sweeps));
  await page.locator('button[data-view="voxels"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='voxels');
  assert.equal(await page.locator('button[data-view="voxels"]').getAttribute('aria-pressed'),'true');
  let visual=await page.evaluate(()=>{const m=window.__isingScene.getObjectByName('ising-voxels');return {count:m.count,visible:m.visible,rgb:[...m.instanceColor.array.slice(100*3,100*3+3)]};});assert.equal(visual.count,2400);assert.equal(visual.visible,true);assert.ok(visual.rgb.some(x=>x>0));
  await setRange(page,'#layers',20);await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawLayers==='20');
  visual=await page.evaluate(()=>{const m=window.__isingScene.getObjectByName('ising-voxels');return {count:m.count,rgb:[...m.instanceColor.array.slice(7999*3,7999*3+3)]};});assert.equal(visual.count,8000);assert.ok(visual.rgb.some(x=>x>0));
  state=await ds(page);assert.equal(state.magnetization,String(before.stats.magnetization));assert.equal(state.sampleCount,'0');assert.deepEqual(errors,[]);
});

test('clicking the 3D lattice selects a computed spin and reports its actual local energy', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;await page.locator('button[data-tool="probe"]').click();
  const site=await page.evaluate(()=>{const mesh=window.__isingScene.getObjectByName('ising-arrows'),n=20,index=18+n*18+n*n*13,m=new THREE.Matrix4(),p=new THREE.Vector3();mesh.getMatrixAt(index,m);p.setFromMatrixPosition(m).project(window.__isingCamera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
  const count=await eventCount(page,'probed');await page.mouse.click(site.x,site.y);await afterEvent(page,'probed',count);const data=await latest(page,'probed');
  assert.ok(data.probe.index>=0&&data.probe.index<5600);const ref=new Ising3D({size:20,temperature:data.stats.temperature,field:data.stats.field,spins:data.spins});
  const actual=ref.local(data.probe.index);for(const key of ['index','x','y','z','spin','neighborSum','deltaEnergy'])assert.equal(data.probe[key],actual[key],key);near(data.probe.probability,actual.probability,1e-14);assert.equal((await ds(page)).probeIndex,String(data.probe.index));assert.match(await page.locator('#probe-readout').textContent(),/六邻居之和/);assert.deepEqual(errors,[]);
});

test('queued changes coalesce behind an in-flight sweep without losing state or applying stale parameters', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page,true);await open(page);
  await page.evaluate(()=>{window.__slowAdvance=true;});await page.locator('#step').click();await setRange(page,'#temperature',5.7);await setRange(page,'#temperature',6.1);await setRange(page,'#field',-.5);
  await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.temperature==='6.1'&&d.field==='-0.5'&&d.sweeps==='121';},null,{timeout:30000});
  const result=await latest(page,'configured'),ref=refWarm({size:20,temperature:4.51,field:0,seed:20261031,initial:'random'},120);ref.sweep(1);ref.configure({temperature:6.1,field:-.5});
  assert.deepEqual(result.spins,[...ref.spins]);near(result.stats.energy,ref.energy,1e-7);assert.equal(result.stats.sampleCount,0);assert.deepEqual(errors,[]);
});

test('Canvas fallback keeps the real state, supports probing and exports a labeled PNG', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};});await watch(page);await open(page);
  let state=await ds(page);assert.equal(state.renderer,'canvas');assert.equal(await page.locator('#stage-fallback').isVisible(),true);const before=await latest(page,'ready');
  await setRange(page,'#layers',6);await page.locator('button[data-view="voxels"]').click();await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.drawLayers==='6'&&d.drawView==='voxels';});state=await ds(page);assert.equal(state.visibleSpins,'2400');assert.equal(state.energy,String(before.stats.energyPerSpin));assert.equal(state.sweeps,'120');
  await setRange(page,'#layers',14);await page.locator('button[data-view="arrows"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawLayers==='14');
  await page.locator('#ising-scene').focus();await page.keyboard.press('ArrowRight');await twoFrames(page);assert.equal((await ds(page)).sweeps,'120');
  let count=await eventCount(page,'probed');await page.locator('button[data-tool="probe"]').click();await page.locator('#ising-scene').focus();await page.keyboard.press('Enter');await afterEvent(page,'probed',count);
  const probed=await latest(page,'probed');assert.deepEqual(probed.spins,before.spins);assert.equal(probed.probe.x,10);assert.equal(probed.probe.y,10);
  count=await eventCount(page,'probed');await page.mouse.click(720,400);await afterEvent(page,'probed',count);const clicked=await latest(page,'probed');assert.deepEqual(clicked.spins,before.spins);assert.ok(clicked.probe.index>=0&&clicked.probe.index<5600);
  const promise=page.waitForEvent('download');await page.locator('#save-image').click();const download=await promise;assert.equal(download.suggestedFilename(),'ising-lattice.png');assert.deepEqual(fs.readFileSync(await download.path()).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));assert.deepEqual(errors,[]);
});

test('WebGL context loss switches to Canvas without changing the microstate or sampling clock', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);if(!await requireWebGL(page,t))return;
  const before=await ds(page);await page.locator('#ising-scene').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.renderer==='canvas');
  let after=await ds(page);for(const key of ['sweeps','magnetization','energy','probeIndex'])assert.equal(after[key],before[key],key);await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.sweeps==='121');assert.deepEqual(errors,[]);
});

test('hiding the tab stops sampling and it does not resume on return', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);await page.locator('#play').click();
  await page.waitForFunction(()=>Number(document.querySelector('#ising-stage').dataset.sweeps)>120,null,{timeout:20000});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal((await ds(page)).playing,'false');
  await page.waitForTimeout(250);const after=(await ds(page)).sweeps;await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(400);
  assert.equal((await ds(page)).sweeps,after);assert.equal(await page.locator('#play-text').textContent(),'播放');assert.deepEqual(errors,[]);
});

test('mobile controls, knowledge actions, responsive layout and axe checks work at narrow and landscape sizes', {timeout:120000},async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);if(axe)await page.addScriptTag({content:axe.source});
  for(const [width,height] of [[390,844],[320,568],[568,320]]){
    await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);assert.equal(await page.locator('#control-panel').isHidden(),true);
    if(width===390){assert.equal(await page.locator('[data-quick-view="points"]').isVisible(),true);await page.locator('[data-quick-view="points"]').tap();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='points');await page.locator('[data-quick-view="arrows"]').tap();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='arrows');}
    else assert.equal(await page.locator('[data-quick-view="points"]').isHidden(),true);
    await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="critical"]').tap();if(axe){const violations=await page.evaluate(async()=>{const r=await axe.run(document);return r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],`${width}×${height}`);}
    await page.locator('#toggle-knowledge').tap();
  }
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawWidth==='390'&&document.querySelector('#ising-stage').dataset.drawHeight==='844');
  await page.locator('#toggle-controls').tap();await page.locator('button[data-tool="probe"]').tap();assert.equal(await page.locator('#control-panel').isHidden(),true);assert.match(await page.locator('#stage-caption').textContent(),/点选晶格/);
  const count=await eventCount(page,'probed');await page.locator('#ising-scene').tap({position:{x:195,y:430}});await afterEvent(page,'probed',count);
  await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="domains"]').tap();await page.locator('#card-slice').tap();
  assert.equal((await ds(page)).layers,'10');assert.equal(await page.locator('#knowledge-panel').isHidden(),true);assert.equal(await page.locator('#control-panel').isHidden(),true);
  await page.locator('#toggle-knowledge').tap();await page.locator('[data-note="critical"]').tap();const old=Number((await ds(page)).generation);await page.locator('#card-critical').tap();await readyAfter(page,old);
  assert.equal((await ds(page)).sweeps,'120');assert.equal(await page.locator('#knowledge-panel').isHidden(),true);assert.deepEqual(errors,[]);
});

test('all assets and worker are local; no network access is needed', {timeout:90000},async t=>{
  const page=await pageFor(t),external=[],failed=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());route.abort();}else route.continue();});page.on('requestfailed',r=>failed.push(r.url()));await watch(page);await open(page);await page.locator('#step').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.sweeps==='121');
  assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
});

test('starting in a background tab does not silently begin sampling', {timeout:90000},async t=>{
  const page=await pageFor(t,{reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});});await watch(page);await open(page);
  assert.equal((await ds(page)).playing,'false');assert.equal((await ds(page)).sweeps,'120');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(400);
  assert.equal((await ds(page)).playing,'false');assert.equal((await ds(page)).sweeps,'120');assert.deepEqual(errors,[]);
});

test('rebuilding while an old sweep is in flight prevents stale worker results overwriting the new preset', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page,true);await open(page);await page.evaluate(()=>{window.__slowAdvance=true;});
  await page.locator('#step').click();const old=Number((await ds(page)).generation);await page.locator('[data-preset="hot"]').click();await readyAfter(page,old);
  const snapshot=await latest(page,'ready'),ref=refWarm({size:20,temperature:7,field:0,seed:20261031,initial:'random'},30);assert.deepEqual(snapshot.spins,[...ref.spins]);
  await page.waitForTimeout(1000);const after=await ds(page);assert.equal(after.temperature,'7');assert.equal(after.sweeps,'30');assert.equal(Number(after.generation),old+1);assert.deepEqual(errors,[]);
});

test('a missing worker reports the failure instead of showing invented spin evolution', {timeout:90000},async t=>{
  const page=await pageFor(t);await page.route('**/ising-worker.js*',route=>route.abort());await page.goto(base+'ising.html');
  await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.status==='error',null,{timeout:30000});
  assert.match(await page.locator('#stage-error-text').textContent(),/后台采样线程/);assert.equal(await page.locator('#play').isDisabled(),true);assert.equal(await page.locator('#step').isDisabled(),true);
});

test('independent initial arrangement rebuilds the actual spins, preserves controls and playback, and presets can replace it', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await open(page);
  assert.equal(await page.locator('#initial-spins').inputValue(),'random');
  let old=Number((await ds(page)).generation);await page.locator('#initial-spins').selectOption('down');await readyAfter(page,old);
  let data=await latest(page,'ready');assert.equal(data.stats.sweeps,0);assert.equal(data.stats.magnetization,-1);assert.equal(data.stats.energyPerSpin,-3);assert.ok(data.spins.every(s=>s===-1));assert.equal((await ds(page)).playing,'false');
  assert.deepEqual(await page.locator('#magnetization-track').evaluate(e=>[e.dataset.sign,e.style.getPropertyValue('--bar-start'),e.style.getPropertyValue('--bar-width')]),['down','0%','50%']);
  assert.equal(await page.locator('[data-preset][aria-pressed="true"]').count(),0);
  old=Number((await ds(page)).generation);await page.locator('#initial-spins').selectOption('domains');await readyAfter(page,old);data=await latest(page,'ready');
  assert.equal(data.stats.magnetization,0);near(data.stats.energyPerSpin,-2.8,1e-12);for(let i=0;i<data.spins.length;i++)assert.equal(data.spins[i],i%20<10?1:-1);assert.deepEqual(await page.locator('#magnetization-track').evaluate(e=>[e.dataset.sign,e.style.getPropertyValue('--bar-start'),e.style.getPropertyValue('--bar-width')]),['zero','50%','0%']);
  let count=await eventCount(page,'configured');await page.locator('#temperature').fill('3.2');await afterEvent(page,'configured',count);
  count=await eventCount(page,'configured');await page.locator('#field').fill('0.2');await afterEvent(page,'configured',count);
  old=Number((await ds(page)).generation);await page.locator('#initial-spins').selectOption('up');await readyAfter(page,old);data=await latest(page,'ready');
  assert.ok(data.spins.every(s=>s===1));assert.equal(data.stats.sweeps,0);near(data.stats.energyPerSpin,-3.2,1e-12);assert.equal(data.stats.temperature,3.2);assert.equal(data.stats.field,.2);assert.deepEqual(await page.locator('#magnetization-track').evaluate(e=>[e.dataset.sign,e.style.getPropertyValue('--bar-start'),e.style.getPropertyValue('--bar-width')]),['up','50%','50%']);
  count=await eventCount(page,'frame');await page.locator('#step').click();await afterEvent(page,'frame',count);data=await latest(page,'frame');const ref=refWarm({size:20,temperature:3.2,field:.2,seed:20261031,initial:'up'},0);ref.sweep(1);assert.deepEqual(data.spins,[...ref.spins]);
  old=Number((await ds(page)).generation);await page.locator('#reset').click();await readyAfter(page,old);data=await latest(page,'ready');assert.equal(data.stats.sweeps,0);assert.ok(data.spins.every(s=>s===1));
  await page.locator('#seed').fill('99');old=Number((await ds(page)).generation);await page.locator('#apply-seed').click();await readyAfter(page,old);
  old=Number((await ds(page)).generation);await page.locator('#initial-spins').selectOption('random');await readyAfter(page,old);data=await latest(page,'ready');
  assert.deepEqual(data.spins,[...refWarm({size:20,temperature:3.2,field:.2,seed:99,initial:'random'},0).spins]);
  await page.locator('[data-note="domains"]').click();old=Number((await ds(page)).generation);await page.locator('#card-domains').click();await readyAfter(page,old);data=await latest(page,'ready');
  assert.equal(data.stats.magnetization,0);near(data.stats.energyPerSpin,-2.8,1e-12);assert.equal((await ds(page)).view,'voxels');assert.equal((await ds(page)).layers,'20');assert.equal((await ds(page)).temperature,'3.2');assert.equal((await ds(page)).field,'0.2');
  old=Number((await ds(page)).generation);await page.locator('[data-preset="cold"]').click();await readyAfter(page,old);assert.equal(await page.locator('#initial-spins').inputValue(),'up');
  old=Number((await ds(page)).generation);await page.locator('[data-preset="hot"]').click();await readyAfter(page,old);assert.equal(await page.locator('#initial-spins').inputValue(),'random');
  await page.locator('#play').click();old=Number((await ds(page)).generation);await page.locator('#initial-spins').selectOption('down');await readyAfter(page,old);
  data=await latest(page,'ready');assert.ok(data.spins.every(s=>s===-1));assert.equal(data.stats.sweeps,0);assert.equal((await ds(page)).playing,'true');
  await page.waitForFunction(()=>Number(document.querySelector('#ising-stage').dataset.sweeps)>0);await page.locator('#play').click();assert.equal((await ds(page)).playing,'false');assert.deepEqual(errors,[]);
});

test('the new point view and scene shortcuts show the same actual spins without changing sampling', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const snapshot=await latest(page,'ready'),before=await ds(page);await page.locator('[data-quick-view="points"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='points');
  assert.equal(await page.locator('button[data-view="points"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-quick-view="points"]').getAttribute('aria-pressed'),'true');
  const result=await page.evaluate(()=>{const m=window.__isingScene.getObjectByName('ising-points'),g=m.geometry,ids=[0,3,201,3010,5599];return {visible:m.visible,count:g.drawRange.count,up:new THREE.Color('#ffc08f').toArray(),down:new THREE.Color('#7de2df').toArray(),sites:ids.map(i=>({i,xyz:[...g.attributes.position.array.slice(i*3,i*3+3)],rgb:[...g.attributes.color.array.slice(i*3,i*3+3)]}))};});
  assert.equal(result.visible,true);assert.equal(result.count,5600);const d=3.6/19;
  for(const p of result.sites){const i=p.i,xyz=[i%20,Math.floor(i/20)%20,Math.floor(i/400)];for(let k=0;k<3;k++){near(p.xyz[k],(xyz[k]-9.5)*d,1e-6);near(p.rgb[k],snapshot.spins[i]>0?result.up[k]:result.down[k],1e-6);}}
  const after=await ds(page);for(const key of ['sweeps','magnetization','energy','sampleCount','generation'])assert.equal(after[key],before[key],key);
  const target=await page.evaluate(()=>{const n=20,i=18+n*18+n*n*13,p=new THREE.Vector3((18-9.5)*3.6/19,(18-9.5)*3.6/19,(13-9.5)*3.6/19).project(window.__isingCamera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,i};});
  await page.locator('button[data-tool="probe"]').click();const n=await eventCount(page,'probed');await page.mouse.click(target.x,target.y);await afterEvent(page,'probed',n);const selected=await latest(page,'probed');
  assert.deepEqual(selected.spins,snapshot.spins);assert.ok(selected.probe.index>=0&&selected.probe.index<5600);const ref=new Ising3D({size:20,temperature:selected.stats.temperature,field:selected.stats.field,spins:selected.spins});
  assert.equal(selected.probe.deltaEnergy,ref.local(selected.probe.index).deltaEnergy);assert.deepEqual(errors,[]);
});

test('cutaway outline tracks the actual displayed Z boundary, not the full-lattice observables', {timeout:90000},async t=>{
  const page=await pageFor(t);await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;const snapshot=await latest(page,'ready');
  for(const layers of [14,6,1,20]){
    await setRange(page,'#layers',layers);await page.waitForFunction(l=>Number(document.querySelector('#ising-stage').dataset.drawLayers)===l,layers);
    const cut=await page.evaluate(()=>{const a=window.__isingScene.getObjectByName('ising-cut-outline'),b=window.__isingScene.getObjectByName('ising-cut-plane');return {line:a.visible,plane:b.visible,z:a.position.z,planeZ:b.position.z};});
    assert.equal(cut.line,layers<20);assert.equal(cut.plane,layers<20);near(cut.z,-1.8+(layers-.5)*3.6/19,1e-9);near(cut.planeZ,cut.z,1e-9);
    const s=await ds(page);assert.equal(s.sweeps,'120');assert.equal(s.magnetization,String(snapshot.stats.magnetization));assert.equal(s.energy,String(snapshot.stats.energyPerSpin));
  }
});

test('probe highlights only actual visible periodic neighbours and omits misleading wraparound lines', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  const snapshot=await latest(page,'ready');await page.locator('button[data-tool="probe"]').click();await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.neighborSites==='6'&&d.neighborLinks==='6';});
  const view=await page.evaluate(()=>{const m=window.__isingScene.getObjectByName('ising-neighbor-markers'),g=window.__isingScene.getObjectByName('ising-neighbor-links').geometry,mat=new THREE.Matrix4(),pos=new THREE.Vector3();return{count:m.count,lines:g.drawRange.count/2,up:new THREE.Color('#ffc08f').toArray(),down:new THREE.Color('#7de2df').toArray(),items:Array.from({length:m.count},(_,i)=>{m.getMatrixAt(i,mat);pos.setFromMatrixPosition(mat);return{xyz:pos.toArray(),rgb:[...m.instanceColor.array.slice(i*3,i*3+3)]};})};});
  const indices=[3011,3009,3030,2990,3410,2610],step=3.6/19;assert.equal(view.count,6);assert.equal(view.lines,6);
  for(let j=0;j<indices.length;j++){const i=indices[j],xyz=[i%20,Math.floor(i/20)%20,Math.floor(i/400)];for(let k=0;k<3;k++){near(view.items[j].xyz[k],(xyz[k]-9.5)*step,1e-6);near(view.items[j].rgb[k],snapshot.spins[i]>0?view.up[k]:view.down[k],1e-6);}}
  assert.match(await page.locator('#probe-overlay-position').textContent(),/10, 10, 7/);
  await page.locator('#probe-x').fill('0');await page.locator('#probe-y').fill('0');await page.locator('#probe-z').fill('0');const n=await eventCount(page,'probed');await page.locator('#set-probe').click();await afterEvent(page,'probed',n);
  await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.probeIndex==='0'&&d.neighborSites==='5'&&d.neighborLinks==='3';});
  await setRange(page,'#layers',20);await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.drawLayers==='20'&&d.neighborSites==='6'&&d.neighborLinks==='3';});
  assert.match(await page.locator('#probe-overlay-position').textContent(),/0, 0, 0/);assert.deepEqual(errors,[]);
});

test('change flashes are a bounded subset of real net spin differences and do not change the model', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watch(page);await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  assert.equal(await page.locator('#show-flashes').isChecked(),false);await page.locator('#show-flashes').check();assert.equal((await ds(page)).flashesEnabled,'true');const original=await latest(page,'ready');
  let n=await eventCount(page,'flipped');await page.locator('#flip-probe').click();await afterEvent(page,'flipped',n);const flipped=await latest(page,'flipped');
  await page.waitForFunction(()=>{const d=document.querySelector('#ising-stage').dataset;return d.flashChanged==='1'&&d.flashSites==='1';});
  assert.equal(flipped.stats.sweeps,original.stats.sweeps);assert.equal(flipped.spins.filter((s,i)=>s!==original.spins[i]).length,1);
  let flash=await page.evaluate(()=>{const g=window.__isingScene.getObjectByName('ising-net-changes').geometry;return{count:g.drawRange.count,xyz:[...g.attributes.position.array.slice(0,3)]};});
  const i=flipped.probe.index,step=3.6/19,xyz=[i%20,Math.floor(i/20)%20,Math.floor(i/400)];assert.equal(flash.count,1);for(let k=0;k<3;k++)near(flash.xyz[k],(xyz[k]-9.5)*step,1e-6);
  n=await eventCount(page,'frame');await page.locator('#step').click();await afterEvent(page,'frame',n);const frame=await latest(page,'frame');await page.waitForFunction(s=>document.querySelector('#ising-stage').dataset.drawSweeps===String(s),frame.stats.sweeps);
  const changed=frame.spins.map((s,j)=>s!==flipped.spins[j]),all=changed.filter(Boolean).length,visible=changed.slice(0,5600).filter(Boolean).length,d=await ds(page);
  assert.equal(Number(d.flashChanged),all);assert.equal(Number(d.flashEligible),visible);assert.ok(Number(d.flashSites)<=260);assert.ok(Number(d.flashSites)<=visible);
  flash=await page.evaluate(()=>{const g=window.__isingScene.getObjectByName('ising-net-changes').geometry;return{count:g.drawRange.count,points:[...g.attributes.position.array.slice(0,g.drawRange.count*3)]};});
  assert.equal(flash.count,Number(d.flashSites));const marked=new Set();for(let j=0;j<flash.count;j++){const c=flash.points.slice(j*3,j*3+3).map(v=>Math.round(v/step+9.5)),index=c[0]+20*c[1]+400*c[2];assert.ok(changed[index]);assert.ok(index<5600);marked.add(index);}assert.equal(marked.size,flash.count);
  await page.locator('#show-flashes').uncheck();assert.equal((await ds(page)).flashesEnabled,'false');assert.equal((await ds(page)).sweeps,String(frame.stats.sweeps));
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#show-flashes').check();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('#show-flashes').checked);assert.deepEqual(errors,[]);
});

test('Canvas point view and probe overlay retain the same actual data', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};});await watch(page);await open(page);
  const before=await latest(page,'ready');await page.locator('[data-quick-view="points"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='points');await page.locator('button[data-tool="probe"]').click();
  await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.neighborSites==='6');assert.equal(await page.locator('#probe-overlay').isVisible(),true);
  const state=await ds(page);assert.equal(state.renderer,'canvas');assert.equal(state.sweeps,'120');assert.equal(state.magnetization,String(before.stats.magnetization));assert.deepEqual(errors,[]);
});

test('rebuilding the lattice reuses visual textures and releases obsolete geometry', {timeout:90000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchThree(page);await open(page);if(!await requireWebGL(page,t))return;
  await page.locator('[data-quick-view="points"]').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawView==='points');
  const memory=()=>page.evaluate(()=>({geometries:window.__isingRenderer.info.memory.geometries,textures:window.__isingRenderer.info.memory.textures}));const before=await memory();
  for(let i=0;i<3;i++){const old=Number((await ds(page)).generation);await page.locator('#reset').click();await readyAfter(page,old);await page.waitForFunction(g=>{const d=document.querySelector('#ising-stage').dataset;return Number(d.generation)===g&&d.drawSweeps==='0'&&d.drawView==='points';},old+1);await twoFrames(page);}
  const after=await memory();assert.ok(after.geometries<=before.geometries,`${JSON.stringify(before)} → ${JSON.stringify(after)}`);assert.equal(after.textures,before.textures);assert.deepEqual(errors,[]);
});
