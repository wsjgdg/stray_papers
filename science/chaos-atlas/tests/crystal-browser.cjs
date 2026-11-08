'use strict';
// Optional browser integration tests. Supply playwright-core and Chromium as in README.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),C=require('../crystal-model.js');
let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(root,'.'+(name==='/'?'/ising.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(e,data)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function captureThree(page){
  await page.route('**/vendor/three.min.js*',async route=>{const response=await route.fetch(),body=(await response.text())+`\n;(function(){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...a){const r=new Original(...a),render=r.render;r.render=function(s,c){if(s.getObjectByName('crystal-atoms')){window.__crystalRenderer=r;window.__crystalScene=s;window.__crystalCamera=c;}return render.call(this,s,c);};return r;};})();`;await route.fulfill({response,body});});
}
async function loadMain(page){
  await page.goto(base+'ising.html');await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.status==='ready',null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.drawSpins!==undefined,null,{timeout:30000});
}
async function openCrystal(page){
  if(!await page.locator('#crystal-open').isVisible())await page.locator('#toggle-controls').click();
  await page.locator('#crystal-open').click();await page.waitForFunction(()=>document.querySelector('#crystal-lab').dataset.drawn==='true',null,{timeout:30000});
  assert.equal((await data(page)).status,'ready');
}
async function data(page){return page.locator('#crystal-lab').evaluate(e=>({...e.dataset}));}
async function mainData(page){return page.locator('#ising-stage').evaluate(e=>({...e.dataset}));}
async function setRange(page,id,value){await page.locator(id).evaluate((e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
function near(a,b,t=1e-8){assert.ok(Math.abs(Number(a)-b)<=t,`${a} != ${b} ± ${t}`);}

test('opening the independent atlas pauses Ising and does not change its configuration or sampled state', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);
  await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#ising-stage').dataset.playing==='true');
  await openCrystal(page);await page.waitForFunction(()=>!document.querySelector('#step').disabled);const before=await mainData(page);
  assert.equal(before.playing,'false');assert.equal(await page.evaluate(()=>document.activeElement.id),'crystal-close');
  await page.locator('#crystal-preset').selectOption('nacl');await setRange(page,'#crystal-repeat',3);await setRange(page,'#crystal-cutoff',1.4);
  await page.locator('#crystal-preset').selectOption('albite');await page.locator('#crystal-next-site').click();
  const after=await mainData(page);for(const key of ['generation','sweeps','size','temperature','field','magnetization','energy','sampleCount','probeIndex'])assert.equal(after[key],before[key],key);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#crystal-lab').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'crystal-open');assert.equal((await mainData(page)).playing,'false');assert.deepEqual(errors,[]);
});

test('the entire library drives real geometry, species, periodic neighbors and reflection values', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);await openCrystal(page);
  const options=await page.locator('#crystal-preset option:not([disabled])').count();assert.equal(options,C.BRAVAIS.length+C.PROTOTYPES.length);
  for(const id of [...C.BRAVAIS,...C.PROTOTYPES].map(p=>p.id)){
    await page.locator('#crystal-preset').selectOption(id);const d=await data(page),m=C.build(C.preset(id)),sc=C.supercell(m,2),i=Number(d.selectedSite);
    assert.equal(d.preset,id);assert.equal(Number(d.sites),m.sites.length,id);assert.equal(Number(d.actual),sc.actual,id);assert.equal(Number(d.ghosts),sc.ghosts,id);
    assert.equal(Number(d.degree),m.neighbors[i].length,id);near(d.nearest,m.nearest);near(d.intensity,C.reflection(m,1,0,0).intensity);near(d.spacing,C.reflection(m,1,0,0).d);
    assert.deepEqual(d.species.split(','),[...new Set(m.sites.map(s=>s.element))],id);assert.equal(Number(d.edges),sc.edges.length,id);
    assert.equal(await page.locator('#crystal-preset').inputValue(),id);
  }
  assert.deepEqual(errors,[]);
});

test('repeat count, boundary images, distance shells and display links have distinct meanings', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);await openCrystal(page);await page.locator('#crystal-preset').selectOption('cP');
  await setRange(page,'#crystal-repeat',1);let d=await data(page);assert.equal(d.actual,'1');assert.equal(d.ghosts,'7');assert.equal(d.edges,'12');assert.equal(d.degree,'6');
  await page.locator('#crystal-show-ghosts').uncheck();d=await data(page);assert.equal(d.ghosts,'0');assert.equal(d.edges,'0');assert.equal(d.degree,'6');
  await setRange(page,'#crystal-repeat',4);d=await data(page);assert.equal(d.actual,'64');assert.equal(d.ghosts,'0');assert.equal(d.edges,'144');assert.equal(d.degree,'6');
  await page.locator('#crystal-show-ghosts').check();assert.equal((await data(page)).edges,'300');await page.locator('#crystal-show-links').uncheck();assert.equal((await data(page)).edges,'0');
  await setRange(page,'#crystal-cutoff',1.42);d=await data(page);assert.equal(d.degree,'18');assert.match(await page.locator('#crystal-neighbor-shells').textContent(),/1\.000 × 6.*1\.414 × 12/);
  await setRange(page,'#crystal-cutoff',1.75);assert.equal((await data(page)).degree,'26');await page.locator('#crystal-show-links').check();assert.ok(Number((await data(page)).edges)>300);assert.deepEqual(errors,[]);
});

test('site navigation and point-scattering controls show computed values, not element color changes alone', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);await openCrystal(page);
  let d=await data(page);assert.equal(d.preset,'perovskite');assert.equal(d.selectedSite,'1');assert.equal(d.degree,'6');assert.match(await page.locator('#crystal-neighbor-species').textContent(),/O 6/);
  await page.locator('#crystal-previous-site').click();d=await data(page);assert.equal(d.selectedSite,'0');assert.equal(d.degree,'0');assert.match(await page.locator('#crystal-selection').textContent(),/Sr/);
  await page.locator('#crystal-next-site').click();assert.equal((await data(page)).degree,'6');
  await page.locator('#crystal-preset').selectOption('cscl');d=await data(page);assert.equal(d.sites,'2');assert.equal(d.degree,'8');near(d.intensity,0);
  assert.match(await page.locator('#crystal-fact-description').textContent(),/不是体心立方/);await page.locator('#crystal-weight').selectOption('z');near((await data(page)).intensity,38**2);
  await page.locator('#crystal-h').fill('2');await page.locator('#crystal-reflection-apply').click();d=await data(page);assert.equal(d.reflection,'2,0,0');near(d.intensity,72**2);near(d.spacing,.5);
  await page.locator('#crystal-h').fill('0');await page.locator('#crystal-reflection-apply').click();assert.equal((await data(page)).reflection,'2,0,0');assert.match(await page.locator('#crystal-reflection-status').textContent(),/前向散射/);
  await page.locator('#crystal-h').fill('9');await page.locator('#crystal-reflection-apply').click();assert.equal((await data(page)).reflection,'2,0,0');assert.match(await page.locator('#crystal-reflection-status').textContent(),/整数/);
  await page.locator('#crystal-reflections').click({position:{x:37,y:30}});assert.notEqual((await data(page)).reflection,'2,0,0');assert.deepEqual(errors,[]);
});

test('custom editing validates first, rolls back on errors and can restore the same preset', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);await openCrystal(page);await page.locator('#crystal-preset').selectOption('cP');
  await page.locator('#crystal-controls details').nth(0).locator('summary').click();await page.locator('#crystal-controls details').nth(1).locator('summary').click();
  const before=await data(page);await page.locator('#crystal-gamma').fill('180');await page.locator('#crystal-apply').click();assert.match(await page.locator('#crystal-edit-status').textContent(),/未应用/);
  let d=await data(page);for(const key of ['preset','sites','nearest','actual','degree'])assert.equal(d[key],before[key],key);
  await page.locator('#crystal-gamma').fill('90');await page.locator('#crystal-center').selectOption('F');await page.locator('#crystal-add-basis').click();
  const row=page.locator('#crystal-basis-rows .crystal-basis-row').nth(1);await row.locator('[data-field="element"]').fill('O');await page.locator('#crystal-apply').click();
  d=await data(page);assert.equal(d.preset,'custom');assert.equal(d.sites,'8');assert.equal(d.actual,'64');assert.equal(d.species,'X1,O');assert.equal(await page.locator('#crystal-preset').inputValue(),'custom');
  assert.match(await page.locator('#crystal-stage-subtitle').textContent(),/自定义几何/);assert.match(await page.locator('#crystal-edit-status').textContent(),/空间群/);
  await page.locator('#crystal-preset').selectOption('cP');d=await data(page);assert.equal(d.preset,'cP');assert.equal(d.sites,'1');assert.equal(await page.locator('#crystal-basis-rows .crystal-basis-row').count(),1);
  await page.locator('#crystal-center').selectOption('F');await page.locator('#crystal-add-basis').click();const duplicate=page.locator('#crystal-basis-rows .crystal-basis-row').nth(1);
  await duplicate.locator('[data-field="x"]').fill('0.5');await duplicate.locator('[data-field="y"]').fill('0.5');await duplicate.locator('[data-field="z"]').fill('0');await page.locator('#crystal-apply').click();
  assert.match(await page.locator('#crystal-edit-status').textContent(),/重复位置/);assert.equal((await data(page)).preset,'cP');assert.equal((await data(page)).sites,'1');
  await duplicate.locator('[data-field="element"]').fill('NoSuch');await page.locator('#crystal-apply').click();assert.match(await page.locator('#crystal-edit-status').textContent(),/元素符号无效/);assert.equal((await data(page)).preset,'cP');assert.deepEqual(errors,[]);
});

test('3D ray picking, orbit, zoom and keyboard selection manipulate the same periodic model', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await captureThree(page);await loadMain(page);await openCrystal(page);
  if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await page.locator('#crystal-preset').selectOption('nacl');await settle(page);
  const target=await page.evaluate(()=>{
    const scene=window.__crystalScene,cam=window.__crystalCamera,mesh=scene.getObjectByName('crystal-atoms'),ghosts=scene.getObjectByName('crystal-ghosts'),canvas=document.querySelector('#crystal-canvas'),rect=canvas.getBoundingClientRect();
    const G=window.CrystalGeometry,sc=G.supercell(G.build(G.preset('nacl')),2),selected=Number(document.querySelector('#crystal-lab').dataset.selectedSite),matrix=new THREE.Matrix4(),ray=new THREE.Raycaster();
    for(let n=0;n<mesh.count;n++){
      mesh.getMatrixAt(n,matrix);const v=new THREE.Vector3().setFromMatrixPosition(matrix).project(cam);if(Math.abs(v.x)>.82||Math.abs(v.y)>.82)continue;
      ray.setFromCamera(new THREE.Vector2(v.x,v.y),cam);const hit=ray.intersectObjects([mesh,ghosts].filter(Boolean),false)[0];if(!hit)continue;
      const index=hit.object.userData.indices[hit.instanceId],site=sc.atoms[index].site;if(site===selected)continue;
      return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2,site};
    }return null;
  });assert.ok(target,'a visible atom with a different site should be pickable');await page.mouse.click(target.x,target.y);assert.equal(Number((await data(page)).selectedSite),target.site);
  const beforeCamera=await page.evaluate(()=>window.__crystalCamera.position.toArray());const box=await page.locator('#crystal-canvas').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.6+55,box.y+box.height*.6+28,{steps:4});await page.mouse.up();await settle(page);
  assert.notDeepEqual(await page.evaluate(()=>window.__crystalCamera.position.toArray()),beforeCamera);const distance=await page.evaluate(()=>window.__crystalCamera.position.length());await page.locator('#crystal-zoom-in').click();await settle(page);assert.ok(await page.evaluate(()=>window.__crystalCamera.position.length())<distance);
  const site=Number((await data(page)).selectedSite),total=Number((await data(page)).sites);await page.locator('#crystal-canvas').focus();await page.keyboard.press('Enter');assert.equal(Number((await data(page)).selectedSite),(site+1)%total);
  await page.keyboard.press('Home');await settle(page);const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#crystal-save').click()]);const bytes=await fs.promises.readFile(await download.path());assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.deepEqual(errors,[]);
});

test('Canvas fallback paints the same atoms, supports controls and exports a PNG', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{
    const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};
    const proto=CanvasRenderingContext2D.prototype,clear=proto.clearRect,fill=proto.fill;window.__crystalPaint=0;
    proto.clearRect=function(...args){if(this.canvas.id==='crystal-canvas')window.__crystalPaint=0;return clear.apply(this,args);};
    proto.fill=function(...args){if(this.canvas.id==='crystal-canvas')window.__crystalPaint++;return fill.apply(this,args);};
  });await loadMain(page);await openCrystal(page);assert.equal((await data(page)).renderer,'canvas');assert.equal(await page.locator('#crystal-fallback').isVisible(),true);
  await page.locator('#crystal-preset').selectOption('cP');await setRange(page,'#crystal-repeat',1);await settle(page);assert.equal(await page.evaluate(()=>window.__crystalPaint),8);
  await page.locator('#crystal-show-ghosts').uncheck();await settle(page);assert.equal(await page.evaluate(()=>window.__crystalPaint),1);assert.equal((await data(page)).degree,'6');
  await page.locator('#crystal-preset').selectOption('albite');await settle(page);assert.equal(await page.evaluate(()=>window.__crystalPaint),26);assert.equal((await data(page)).species,'Al,Na,O,Si');
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#crystal-save').click()]);assert.equal(download.suggestedFilename(),'crystal-structure.png');const bytes=await fs.promises.readFile(await download.path());assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.deepEqual(errors,[]);
});

test('WebGL context loss switches to Canvas without losing the crystal, selection or controls', {timeout:90000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await captureThree(page);await loadMain(page);await openCrystal(page);
  if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await page.locator('#crystal-preset').selectOption('wurtzite');await page.locator('#crystal-next-site').click();await settle(page);const before=await data(page);
  const available=await page.evaluate(()=>{const ext=window.__crystalRenderer.getContext().getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});if(!available){t.skip('WEBGL_lose_context unavailable');return;}
  await page.waitForFunction(()=>document.querySelector('#crystal-lab').dataset.renderer==='canvas');const after=await data(page);for(const key of ['preset','sites','degree','selectedSite','actual','nearest','intensity'])assert.equal(after[key],before[key],key);
  assert.equal(await page.locator('#crystal-fallback').isVisible(),true);await page.locator('#crystal-preset').selectOption('cI');assert.equal((await data(page)).degree,'8');await page.locator('#crystal-zoom-in').click();assert.deepEqual(errors,[]);
});

test('compact layouts, modal focus, drawers and accessibility remain usable at four sizes', {timeout:120000},async t=>{
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
    const page=await newPage(t,{viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));await loadMain(page);await openCrystal(page);
    const size=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,width:innerWidth,height:innerHeight}));assert.equal(size.scrollWidth,size.width,JSON.stringify(viewport));assert.equal(size.scrollHeight,size.height,JSON.stringify(viewport));
    const overflow=await page.locator('.crystal-tools').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify({viewport,overflow}));
    assert.equal(await page.locator('#crystal-zoom-in').isVisible(),true);await page.locator('#crystal-zoom-in').click();
    if(!await page.locator('#crystal-controls').isVisible())await page.locator('#crystal-toggle-left').click();assert.equal(await page.locator('#crystal-preset').isVisible(),true);
    if(!await page.locator('#crystal-notes').isVisible())await page.locator('#crystal-toggle-right').click();assert.equal(await page.locator('#crystal-next-site').isVisible(),true);
    if(viewport.width<=1100||viewport.width/viewport.height<=1.25)assert.equal(await page.locator('#crystal-controls').isHidden(),true);
    if(axe){await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const violations=await page.evaluate(async()=>{const r=await axe.run(document.querySelector('#crystal-lab'));return r.violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)}));});assert.deepEqual(violations,[],JSON.stringify(viewport));}
    await page.locator('#crystal-close').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.querySelector('#crystal-lab').contains(document.activeElement)),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#crystal-lab').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'crystal-open');assert.deepEqual(errors,[]);await page.close();
  }
});

test('real touch dragging rotates the 3D view and mobile zoom buttons work', {timeout:90000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await captureThree(page);await loadMain(page);await openCrystal(page);
  if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await page.locator('#crystal-toggle-left').tap();await page.locator('#crystal-preset').selectOption('hcp');await page.locator('#crystal-toggle-left').tap();await settle(page);
  // Test the native touch button before a manual CDP drag: mixing CDP and
  // Playwright touch emulation can suppress the first synthetic click afterwards.
  const distance=await page.evaluate(()=>window.__crystalCamera.position.length());await page.locator('#crystal-zoom-in').tap();await settle(page);assert.ok(await page.evaluate(()=>window.__crystalCamera.position.length())<distance);
  const before=await page.evaluate(()=>window.__crystalCamera.position.toArray()),box=await page.locator('#crystal-canvas').boundingBox(),x=box.x+box.width*.45,y=box.y+box.height*.48,cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+55,y:y+25,id:0}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);
  assert.notDeepEqual(await page.evaluate(()=>window.__crystalCamera.position.toArray()),before);assert.deepEqual(errors,[]);
});

test('repeated redraws of a dense multi-element supercell dispose old WebGL geometries', {timeout:90000},async t=>{
  const page=await newPage(t);await captureThree(page);await loadMain(page);await openCrystal(page);if((await data(page)).renderer!=='webgl'){t.skip('WebGL unavailable');return;}
  await setRange(page,'#crystal-repeat',4);
  for(const [id,count] of [['albite',1664],['spinel',3584]]){
    await page.locator('#crystal-preset').selectOption(id);await settle(page);assert.equal(Number((await data(page)).actual),count);
    const before=await page.evaluate(()=>window.__crystalRenderer.info.memory.geometries);for(let i=0;i<6;i++){await page.locator('#crystal-show-links').click();await settle(page);}
    const after=await page.evaluate(()=>window.__crystalRenderer.info.memory.geometries);assert.ok(after<=before+1,`${id}: ${before} -> ${after}`);assert.equal(Number((await data(page)).actual),count);
  }
});

test('the mobile Canvas fallback notice does not obscure the structure title', {timeout:90000},async t=>{
  const page=await newPage(t,{viewport:{width:320,height:568}});await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};});
  await loadMain(page);await openCrystal(page);assert.equal((await data(page)).renderer,'canvas');const info=await page.evaluate(()=>{const a=document.querySelector('.crystal-stage-title').getBoundingClientRect(),b=document.querySelector('#crystal-fallback').getBoundingClientRect();return {overlap:a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom};});assert.equal(info.overlap,false);
  await page.locator('#crystal-zoom-in').click();await page.locator('#crystal-zoom-out').click();
});

test('all atlas assets work offline with only the local static server', {timeout:90000},async t=>{
  const page=await newPage(t),external=[],failed=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());route.abort();}else route.continue();});page.on('requestfailed',r=>failed.push(r.url()));await loadMain(page);await openCrystal(page);await page.locator('#crystal-preset').selectOption('albite');await settle(page);
  assert.equal((await data(page)).sites,'26');assert.deepEqual(external,[]);assert.deepEqual(failed,[]);
});
