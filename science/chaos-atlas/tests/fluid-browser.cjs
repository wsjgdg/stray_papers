'use strict';
// Optional browser regressions: install playwright-core and provide Chromium.
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), http=require('node:http'), path=require('node:path');
const {createHash}=require('node:crypto'), {pathToFileURL}=require('node:url'), {chromium}=require('playwright-core');
const Model=require('../fluid-model.js'), root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/vortex-rings.html';
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'}).end(data));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newPage(t,options={}) {
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function watchWorker(page) {
  await page.addInitScript(()=>{
    const Original=window.Worker;window.__fluidEvents=[];window.__fluidSent=[];
    window.Worker=function(...args){const worker=new Original(...args),post=worker.postMessage.bind(worker);
      worker.postMessage=function(message,...rest){window.__fluidSent.push(structuredClone(message));return post(message,...rest);};
      worker.addEventListener('message',event=>{const data=event.data,copy={kind:data.kind,generation:data.generation,dimensions:data.dimensions,stats:data.stats,message:data.message,appliedForce:data.appliedForce,recycled:data.recycled,bounds:data.bounds};
        if(data.density)copy.density=new Uint8Array(data.density).slice();
        if(data.slice)copy.slice={...data.slice,values:new Float32Array(data.slice.values).slice()};
        window.__fluidEvents.push(copy);});return worker;};
  });
}
async function watchThree(page,mode='normal') {
  await page.route('**/fluid.js*',async route=>{
    const response=await route.fetch(),source=await response.text();
    const spy=`if(window.THREE){const Original=THREE.WebGLRenderer;THREE.WebGLRenderer=function(...args){const renderer=new Original(...args),render=renderer.render.bind(renderer);
      renderer.render=function(scene,camera){window.__fluidThree={renderer,scene,camera,steps:Number(document.querySelector('#fluid-stage').dataset.steps),count:(window.__fluidThree?.count||0)+1};const result=render(scene,camera);
        if(${JSON.stringify(mode)}==='shader' && renderer.info.programs.length)renderer.info.programs[0].diagnostics={runnable:false};
        if(${JSON.stringify(mode)}==='blank'){const gl=renderer.getContext();gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
        return result;};return renderer;};}\n`;
    await route.fulfill({response,body:spy+source});
  });
}
async function hasWebGL2(page,t) {
  const available=await page.evaluate(()=>!!document.createElement('canvas').getContext('webgl2'));
  if(!available){t.skip('WebGL2 unavailable; use hardware or software WebGL2');return false;}return true;
}
async function open(page,url=base+'vortex-rings.html') {
  await page.goto(url,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.renderer==='unavailable'||document.querySelector('#stage-error').hidden,null,{timeout:30000});
}
async function waitReady(page) {
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.renderer==='webgl2'&&document.querySelector('#stage-error').hidden&&document.querySelector('#fluid-stage').dataset.steps!==undefined&&(!window.__fluidThree||window.__fluidThree.scene.children.some(o=>o.material&&o.material.uniforms&&o.material.uniforms.density&&o.material.uniforms.density.value)),null,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#play').disabled,null,{timeout:30000});
}
async function twoFrames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function hash(page){await twoFrames(page);const data=await page.locator('#fluid-scene').evaluate(c=>c.toDataURL());return createHash('sha256').update(data).digest('hex');}
async function setRange(page,selector,value){await page.locator(selector).evaluate((input,v)=>{input.value=String(v);input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function step(page,count=1){for(let i=0;i<count;i++){const n=Number(await page.locator('#fluid-stage').getAttribute('data-steps'));await page.locator('#step').click();await page.waitForFunction(n=>Number(document.querySelector('#fluid-stage').dataset.steps)===n+1,n,{timeout:30000});}}
async function waitReset(page,prevGeneration){await page.waitForFunction(n=>window.__fluidEvents.some(e=>e.kind==='ready'&&e.generation>n),prevGeneration,{timeout:30000});await waitReady(page);}
const close=(a,b,tol=1e-6)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tol,`${a} != ${b} ± ${tol}`);

test('WebGL2 volume contains the real worker-computed 3-D dye and a single step matches the numerical solver',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  assert.equal(await page.locator('#play-text').innerText(),'播放');assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'48x32x32');
  const first=await page.evaluate(()=>{const e=__fluidEvents.filter(e=>e.kind==='ready').at(-1),obj=__fluidThree.scene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.density),tex=obj.material.uniforms.density.value;
    const matches=tex.image.data.length===e.density.length&&tex.image.data.every((v,i)=>v===e.density[i]);let voxelMax=0;
    for(let i=0;i<e.density.length;i+=4)voxelMax=Math.max(voxelMax,(e.density[i]*256+e.density[i+1])/65535,(e.density[i+2]*256+e.density[i+3])/65535);
    return {stats:e.stats,dimensions:e.dimensions,matches,voxelMax,source:obj.material.fragmentShader,bytes:Array.from(e.density)};});
  assert.deepEqual(first.dimensions,[48,32,32]);assert.ok(first.matches&&first.voxelMax>.3);assert.match(first.source,/sampler3D/);
  const expected=new Model.Fluid3D({nx:48,ny:32,nz:32,h:.15,dt:.04,viscosity:.006,diffusivity:.0005,iterations:32});expected.initialize(Model.PRESETS.chase);
  const pixel=expected.densityPixels();let max=0;
  for(let i=0;i<pixel.length;i+=2){const d=Math.abs((pixel[i]*256+pixel[i+1])-(first.bytes[i]*256+first.bytes[i+1]));max=Math.max(max,d);}
  assert.ok(max<=2,`initial worker 16-bit field differs from CPU: max ${max}/65535`);
  const before=await hash(page);await step(page);expected.step();await page.waitForFunction(()=>window.__fluidEvents.some(e=>e.kind==='frame'&&e.stats.steps===1));await twoFrames(page);
  const live=await page.evaluate(()=>{const e=__fluidEvents.filter(e=>e.kind==='frame').at(-1),tex=__fluidThree.scene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.density).material.uniforms.density.value;return {stats:e.stats,matches:tex.image.data.every((v,i)=>v===e.density[i])};});
  close(live.stats.time,.04);close(live.stats.divergenceRms,expected.stats.divergenceRms,1e-5);close(live.stats.dyeMassA,expected.stats.dyeMassA,1e-5);assert.ok(live.matches);
  close(live.stats.dyeCenterA,expected.stats.dyeCenterA,1e-5);close(live.stats.dyeCenterB,expected.stats.dyeCenterB,1e-5);
  const gap=expected.stats.dyeCenterB-expected.stats.dyeCenterA;assert.equal(await page.locator('#dye-gap-readout').innerText(),(gap>0?'+':'')+gap.toFixed(2));
  assert.notEqual(await hash(page),before,'the computed field visibly changes the volume');assert.deepEqual(errors,[]);
});

test('movable velocity slices and arrows display the live solver field without resetting it',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  const before=await hash(page),resets=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length);
  await page.locator('#slice-toggle').click();await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.slice==='z'&&document.querySelector('#slice-readout').textContent.includes('最大'));
  await page.waitForFunction(()=>__fluidThree.scene.getObjectByName('velocity-slice').visible);await twoFrames(page);
  const first=await page.evaluate(()=>{const e=__fluidEvents.filter(e=>e.kind==='slice').at(-1),group=__fluidThree.scene.getObjectByName('velocity-slice');return {slice:e.slice,visible:group.visible,arrows:group.getObjectByName('in-plane-velocity').geometry.attributes.position.count};});
  const f=new Model.Fluid3D({nx:48,ny:32,nz:32,h:.15,dt:.04,viscosity:.006,diffusivity:.0005,iterations:32});f.initialize(Model.PRESETS.chase);
  const expected=f.sampleSlice('z',0);close(first.slice.maxVorticity,expected.maxVorticity,1e-5);close(first.slice.maxPlaneSpeed,expected.maxPlaneSpeed,1e-5);
  assert.ok(first.visible&&first.arrows>0);assert.notEqual(await hash(page),before);
  await page.locator('#slice-axis').selectOption('y');await setRange(page,'#slice-position',40);
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.slice==='y'&&Number(document.querySelector('#fluid-stage').dataset.slicePosition)>.8);
  assert.match(await page.locator('#slice-position-value').innerText(),/^Y =/);
  await page.locator('label[for="slice-arrows"]').click();assert.equal(await page.evaluate(()=>__fluidThree.scene.getObjectByName('in-plane-velocity').visible),false);
  assert.equal(await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length),resets);assert.equal(await page.locator('#time-readout').innerText(),'0.00');
  await step(page);await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.sliceTime)===.04);
  f.step();const expectedStep=f.sampleSlice('y',.4);close(Number(await page.locator('#fluid-stage').getAttribute('data-slice-vorticity')),expectedStep.maxVorticity,1e-5);
  await page.locator('#slice-toggle').click();assert.equal(await page.evaluate(()=>__fluidThree.scene.getObjectByName('velocity-slice').visible),false);
  assert.equal(await page.locator('#slice-axis').isDisabled(),true);assert.deepEqual(errors,[]);
});

test('packed worker volumes recycle transferred buffers and preserve the exact visible-field bounds',async t=>{
  const page=await newPage(t);await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);await step(page,2);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-buffer-reused'),'true');
  const live=await page.evaluate(()=>{const e=__fluidEvents.filter(x=>x.kind==='frame').at(-1),v=__fluidThree.scene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.density),bytes=v.material.uniforms.density.value.image.data;return {bounds:e.bounds,recycled:e.recycled,matches:bytes.every((x,i)=>x===e.density[i]),recycles:__fluidSent.filter(m=>m.type==='recycle').length};});
  const f=new Model.Fluid3D({nx:36,ny:24,nz:24,h:.2,dt:.04,viscosity:.006,diffusivity:.0005,iterations:32});f.initialize(Model.PRESETS.chase);f.step();f.step();
  assert.deepEqual(live.bounds,f.densityBounds(f.densityPixels()));assert.ok(live.recycled&&live.matches&&live.recycles>=1);
});

test('WebGL2 linearly filters the two packed 16-bit dye fields across byte boundaries',async t=>{
  const page=await newPage(t);if(!await hasWebGL2(page,t))return;
  const result=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const gl=canvas.getContext('webgl2',{antialias:false});
    const vert=`#version 300 es
      const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
      void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}`;
    const frag=`#version 300 es
      precision highp float;precision highp sampler3D;uniform sampler3D density;out vec4 color;
      void main(){vec4 p=texture(density,vec3(.5));vec2 d=vec2(p.r*256.+p.g,p.b*256.+p.a)/257.;
        vec2 q=floor(d*65535.+.5);color=vec4(floor(q.x/256.)/255.,mod(q.x,256.)/255.,floor(q.y/256.)/255.,mod(q.y,256.)/255.);}`;
    function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const data=new Uint8Array(2*2*2*4);for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){
      const a=x?32769:32767,b=x?50000:1000,q=4*(x+2*y+4*z);data[q]=a>>8;data[q+1]=a&255;data[q+2]=b>>8;data[q+3]=b&255;}
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,tex);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,data);gl.uniform1i(gl.getUniformLocation(program,'density'),0);
    gl.disable(gl.DITHER);gl.disable(gl.BLEND);gl.viewport(0,0,1,1);gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return {a:pixels[0]*256+pixels[1],b:pixels[2]*256+pixels[3],error:gl.getError()};
  });
  assert.equal(result.error,0);assert.ok(Math.abs(result.a-32768)<=2,JSON.stringify(result));assert.ok(Math.abs(result.b-25500)<=2,JSON.stringify(result));
});

test('contour, threshold and pixel quality change the view without restarting the fluid',async t=>{
  const page=await newPage(t,{viewport:{width:800,height:600},deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  await step(page,2);await page.waitForFunction(()=>__fluidThree.steps===2);
  await page.locator('#toggle-controls').click();await page.locator('#control-panel').waitFor({state:'visible'});await twoFrames(page);
  const initial=await page.evaluate(()=>{const mesh=__fluidThree.scene.children.find(o=>o.material?.uniforms?.density),u=mesh.material.uniforms,data=u.density.value.image.data;
    let peak=0;for(let q=0;q<data.length;q+=4)peak=Math.max(peak,data[q]*256+data[q+1]+data[q+2]*256+data[q+3]);
    const size=[u.density.value.image.width,u.density.value.image.height,u.density.value.image.depth],lo=u.dyeMin.value.toArray(),hi=u.dyeMax.value.toArray(),half=u.halfBox.value.toArray();
    let outside=0;const cutoff=Math.min(65535*.001,Math.max(1,peak*.01));
    for(let cell=0,q=0;q<data.length;cell++,q+=4){if(data[q]*256+data[q+1]+data[q+2]*256+data[q+3]<cutoff)continue;
      const x=cell%size[0],y=Math.floor(cell/size[0])%size[1],z=Math.floor(cell/(size[0]*size[1]));
      if([x,y,z].some((v,n)=>{const p=(2*(v+.5)/size[n]-1)*half[n];return p<lo[n]||p>hi[n];}))outside++;}
    return {steps:document.querySelector('#fluid-stage').dataset.steps,resets:__fluidSent.filter(m=>m.type==='reset').length,count:__fluidThree.count,
      peak:peak/65535,uniformPeak:u.densityPeak.value,mode:u.displayMode.value,level:u.contourLevel.value,outside,lo,hi,half};});
  assert.equal(initial.mode,1);close(initial.level,.4);close(initial.peak,initial.uniformPeak,1e-12);assert.equal(initial.outside,0);
  assert.ok(initial.lo.some((v,i)=>v> -initial.half[i])||initial.hi.some((v,i)=>v<initial.half[i]),'empty space is skipped');
  const contourHash=await hash(page);await page.locator('[data-render-mode="volume"]').click();
  await page.waitForFunction(n=>__fluidThree.count>n,initial.count);assert.equal(await page.locator('#contour-level').isDisabled(),true);
  const volumeHash=await hash(page);assert.notEqual(volumeHash,contourHash,'different transfer functions visibly change the same field');
  let count=await page.evaluate(()=>__fluidThree.count);await page.locator('[data-render-mode="contour"]').click();await setRange(page,'#contour-level',70);
  await page.waitForFunction(n=>__fluidThree.count>n,count);assert.equal(await page.locator('#contour-level-value').innerText(),'70%');
  close(await page.evaluate(()=>__fluidThree.scene.children.find(o=>o.material?.uniforms?.density).material.uniforms.contourLevel.value),.7);
  assert.notEqual(await hash(page),contourHash,'the contour is determined by the selected concentration');
  await page.locator('#render-quality').selectOption('fast');close(Number(await page.locator('#fluid-stage').getAttribute('data-render-scale')),.55,1e-10);
  const fastWidth=await page.locator('#fluid-scene').evaluate(c=>c.width);await page.locator('#render-quality').selectOption('sharp');
  close(Number(await page.locator('#fluid-stage').getAttribute('data-render-scale')),2,1e-10);
  assert.ok(await page.locator('#fluid-scene').evaluate(c=>c.width)>fastWidth*3);assert.match(await page.locator('#render-scale-hint').innerText(),/屏幕像素 100%/);
  await page.locator('#toggle-controls').click();await page.mouse.move(400,300);await page.mouse.down();
  close(Number(await page.locator('#fluid-stage').getAttribute('data-render-scale')),.60,1e-10);
  await page.mouse.move(420,310);await page.mouse.up();close(Number(await page.locator('#fluid-stage').getAttribute('data-render-scale')),2,1e-10);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),initial.steps);
  assert.equal(await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length),initial.resets);assert.deepEqual(errors,[]);
});

test('automatic drawing resolution recovers when motion is paused',async t=>{
  const page=await newPage(t,{viewport:{width:800,height:600},reducedMotion:'no-preference'});
  await page.addInitScript(()=>{const original=window.requestAnimationFrame;let offset=0;window.__forceSlowFrames=false;
    window.requestAnimationFrame=cb=>original(t=>{if(window.__forceSlowFrames)offset+=400;cb(t+offset);});});
  await watchWorker(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  const resets=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length);
  await page.evaluate(()=>{window.__forceSlowFrames=true;});
  await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.renderScale)<=.55,null,{timeout:30000});
  await page.evaluate(()=>{window.__forceSlowFrames=false;});await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#play-text').textContent==='播放'&&Number(document.querySelector('#fluid-stage').dataset.renderScale)===1,null,{timeout:30000});
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'48x32x32');assert.equal(await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length),resets);
});

test('controls rebuild actual initial velocity, preserve pause state and change the resolution',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await setRange(page,'#radius-a',1.1);await setRange(page,'#separation',1.6);await waitReset(page,gen);
  let sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));close(sent.initial.radiusA,1.1);close(sent.initial.gap,1.6);assert.equal(await page.locator('#play-text').innerText(),'播放');
  gen=sent.generation;await page.locator('[data-orientation="opposed"]').click();await waitReset(page,gen);
  sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));assert.ok(sent.initial.gammaB<0);assert.equal(await page.locator('[data-orientation="opposed"]').getAttribute('aria-pressed'),'true');
  gen=sent.generation;await setRange(page,'#viscosity',.02);await waitReset(page,gen);sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));close(sent.options.viscosity,.02);
  gen=sent.generation;await page.locator('#grid-quality').selectOption('high');await waitReset(page,gen);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'72x48x48');assert.equal(await page.locator('#time-readout').innerText(),'0.00');
  // Several new initializations while a worker is busy must not leave an old
  // high-resolution result on screen or queue obsolete work indefinitely.
  await page.evaluate(()=>{const select=document.querySelector('#grid-quality');for(const value of ['quick','high','quick']){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}});
  const final=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));
  await page.waitForFunction(g=>__fluidEvents.some(e=>e.kind==='ready'&&e.generation===g),final.generation,{timeout:30000});await waitReady(page);
  assert.equal(final.options.nx,36);assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'36x24x24');
  assert.deepEqual(errors,[]);
});

test('all twelve preset buttons load their actual initial fields and viscosity while preserving view settings',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  const names=Object.keys(Model.PRESETS);assert.equal(names.length,12);
  assert.deepEqual(await page.locator('[data-preset]').evaluateAll(buttons=>buttons.map(b=>b.dataset.preset)),names);
  await page.locator('[data-render-mode="volume"]').click();await page.locator('#render-quality').selectOption('fast');
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('#time-step').selectOption('0.02');await waitReset(page,gen);
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('#pressure-iterations').selectOption('64');await waitReset(page,gen);await step(page,2);
  for(const name of names){
    gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
    await page.locator(`[data-preset="${name}"]`).click();await waitReset(page,gen);
    const sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));
    assert.deepEqual(sent.initial,Model.PRESETS[name],name);close(sent.options.viscosity,Model.PRESET_VISCOSITY[name],1e-12);
    close(sent.options.dt,.02);assert.equal(sent.options.iterations,64,name);
    assert.equal(await page.locator(`[data-preset="${name}"]`).getAttribute('aria-pressed'),'true',name);
    assert.equal(await page.locator('[data-preset][aria-pressed="true"]').count(),1,name);
    assert.equal(await page.locator('#viscosity-value').innerText(),Model.PRESET_VISCOSITY[name].toFixed(3),name);
    assert.ok((await page.locator('#preset-description').innerText()).length>15,name);
    assert.equal(await page.locator('#time-readout').innerText(),'0.00',name);assert.equal(await page.locator('#play-text').innerText(),'播放',name);
    assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'36x24x24',name);
    assert.equal(await page.locator('#render-quality').inputValue(),'fast',name);assert.equal(await page.locator('[data-render-mode="volume"]').getAttribute('aria-pressed'),'true',name);
  }
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await setRange(page,'#viscosity',.023);await waitReset(page,gen);assert.equal(await page.locator('[data-preset][aria-pressed="true"]').count(),0);
  assert.match(await page.locator('#preset-description').innerText(),/自定义/);
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('[data-preset="chase"]').click();await waitReset(page,gen);
  close((await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1))).options.viscosity,.006);
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await setRange(page,'#radius-a',.90);await waitReset(page,gen);
  assert.equal(await page.locator('[data-preset][aria-pressed="true"]').count(),0);assert.match(await page.locator('#preset-description').innerText(),/自定义/);
  gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.evaluate(()=>['opposed','close','smallChase','viscous'].forEach(name=>document.querySelector(`[data-preset="${name}"]`).click()));
  await waitReset(page,gen);
  const last=await page.evaluate(()=>({sent:__fluidSent.filter(m=>m.type==='reset').at(-1),ready:__fluidEvents.filter(e=>e.kind==='ready').at(-1)}));
  assert.equal(last.sent.generation,gen+4);assert.equal(last.ready.generation,last.sent.generation);
  assert.deepEqual(last.sent.initial,Model.PRESETS.viscous);close(last.sent.options.viscosity,.030);
  assert.equal(await page.locator('[data-preset="viscous"]').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
});

test('force tool injects a bounded real force in the chosen slice and retains orbit mode',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);
  await page.locator('[data-note="compare"]').click();await page.locator('#save-reference').click();
  const resets=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length);
  await page.locator('button[data-tool="force"]').click();await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.slice==='z');
  assert.equal(await page.locator('#slice-toggle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#force-center').isEnabled(),true);
  await setRange(page,'#force-strength',2);await setRange(page,'#force-radius',.65);
  await page.locator('#force-center').click();await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.forceSteps==='1',null,{timeout:30000});
  const first=await page.evaluate(()=>({sent:__fluidSent.filter(m=>m.type==='step'&&m.force).at(-1),frame:__fluidEvents.filter(e=>e.kind==='frame').at(-1)}));
  assert.equal(first.sent.force.strength,2);assert.equal(first.sent.force.radius,.65);assert.deepEqual(first.sent.force.direction,[1,0,0]);
  const f=new Model.Fluid3D({nx:36,ny:24,nz:24,h:.2,dt:.04,viscosity:.006,diffusivity:.0005,iterations:32});f.initialize(Model.PRESETS.chase);f.step(first.sent.force);
  close(first.frame.stats.maxSpeed,f.stats.maxSpeed,1e-5);close(first.frame.stats.divergenceRms,f.stats.divergenceRms,1e-5);
  assert.match(await page.locator('#compare-context').innerText(),/交互外力/);assert.equal(await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length),resets);
  const geometry=await page.evaluate(()=>{const c=__fluidThree.camera,p=new THREE.Vector3(0,0,Number(document.querySelector('#fluid-stage').dataset.slicePosition)).project(c),r=document.querySelector('#fluid-scene').getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,camera:c.position.toArray()};});
  await page.mouse.move(geometry.x,geometry.y);await page.mouse.down();await page.mouse.move(geometry.x+70,geometry.y-15,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.forceSteps)>=2,null,{timeout:30000});
  const camera=await page.evaluate(()=>__fluidThree.camera.position.toArray());camera.forEach((v,i)=>close(v,geometry.camera[i],.05));
  await page.locator('#slice-toggle').click();assert.equal(await page.locator('button[data-tool="orbit"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#force-strength').isDisabled(),true);assert.deepEqual(errors,[]);
});

test('reference snapshots and telemetry compare different runs at the same simulation time',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);await step(page,3);
  const referenceGeneration=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('[data-note="compare"]').click();await page.locator('#save-reference').click();
  assert.match(await page.locator('#reference-meta').innerText(),/同向追逐/);assert.equal(await page.locator('#reference-image-time').innerText(),'t=0.12');
  assert.match(await page.locator('#reference-image').getAttribute('src'),/^data:image\/png;base64,/);
  assert.notEqual(await page.locator('#compare-reference-line').getAttribute('d'),'');
  gen=referenceGeneration;await page.locator('[data-preset="opposed"]').click();await waitReset(page,gen);
  assert.match(await page.locator('#compare-context').innerText(),/物理参数对照/);assert.equal(await page.locator('#current-image').isVisible(),false);
  await step(page,2);
  const values=await page.evaluate(ref=>{const e=__fluidEvents.filter(x=>x.kind==='frame');return {a:e.find(x=>x.generation===ref&&x.stats.steps===2).stats,b:e.filter(x=>x.generation>ref&&x.stats.steps===2).at(-1).stats};},referenceGeneration);
  const result=await page.locator('#compare-result').innerText();assert.match(result,/t=0\.08/);
  assert.ok(result.includes((values.a.dyeCenterB-values.a.dyeCenterA).toFixed(3)),result);
  assert.ok(result.includes((values.b.dyeCenterB-values.b.dyeCenterA).toFixed(3)),result);
  await page.locator('[data-compare-metric="maxSpeed"]').click();assert.equal(await page.locator('[data-compare-metric="maxSpeed"]').getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('#compare-result').innerText()).includes(values.b.maxSpeed.toFixed(3)));
  await step(page);await page.waitForFunction(()=>!document.querySelector('#current-image').hidden,null,{timeout:30000});
  assert.equal(await page.locator('#current-image-time').innerText(),'t=0.12');assert.match(await page.locator('#current-image').getAttribute('src'),/^data:image\/png;base64,/);
  assert.notEqual(await page.locator('#current-image').getAttribute('src'),await page.locator('#reference-image').getAttribute('src'));
  assert.notEqual(await page.locator('#compare-current-line').getAttribute('d'),await page.locator('#compare-reference-line').getAttribute('d'));
  await page.locator('#clear-reference').click();assert.match(await page.locator('#reference-meta').innerText(),/尚未保留/);assert.equal(await page.locator('#reference-image').isVisible(),false);assert.deepEqual(errors,[]);
});

test('time step, grid and pressure controls run real numerical refinements against a retained reference',async t=>{
  const page=await newPage(t);await watchWorker(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  let gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('#grid-quality').selectOption('quick');await waitReset(page,gen);await step(page,2);
  const referenceGeneration=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('[data-note="compare"]').click();await page.locator('#save-reference').click();
  await page.locator('#time-step').selectOption('0.02');await waitReset(page,referenceGeneration);
  let sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));close(sent.options.dt,.02);assert.equal(sent.options.iterations,32);assert.deepEqual(sent.initial,Model.PRESETS.chase);
  assert.match(await page.locator('#compare-context').innerText(),/数值设置不同/);assert.match(await page.locator('#step').getAttribute('aria-label'),/0\.02/);
  await step(page,3);assert.equal(await page.locator('#time-readout').innerText(),'0.06');
  const reference=await page.evaluate(g=>__fluidEvents.filter(e=>e.kind==='frame'&&e.generation===g).map(e=>e.stats),referenceGeneration);
  const interpolated=((reference[0].dyeCenterB-reference[0].dyeCenterA)+(reference[1].dyeCenterB-reference[1].dyeCenterA))/2;
  assert.ok((await page.locator('#compare-result').innerText()).includes(interpolated.toFixed(3)));
  await step(page);await page.waitForFunction(()=>!document.querySelector('#current-image').hidden);assert.equal(await page.locator('#current-image-time').innerText(),'t=0.08');
  gen=sent.generation;await page.locator('#pressure-iterations').selectOption('64');await waitReset(page,gen);sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));
  assert.equal(sent.options.iterations,64);close(sent.options.dt,.02);await step(page);
  const frame=await page.evaluate(()=>__fluidEvents.filter(e=>e.kind==='frame').at(-1));assert.equal(frame.stats.projectionLimit,64);assert.ok(frame.stats.projectionIterations<=64);
  assert.match(await page.locator('#card-grid').innerText(),/0\.02/);assert.match(await page.locator('#card-projection').innerText(),/64/);
  gen=sent.generation;await page.locator('#grid-quality').selectOption('standard');await waitReset(page,gen);
  sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));assert.equal(sent.options.nx,48);close(sent.options.dt,.02);assert.equal(sent.options.iterations,64);
  assert.match(await page.locator('#reference-meta').innerText(),/36×24×24/);assert.match(await page.locator('#compare-context').innerText(),/数值设置不同/);
});

test('selecting a preset while playing keeps the solver running with the new field',async t=>{
  const page=await newPage(t,{reducedMotion:'no-preference'});await watchWorker(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.steps)>=2,null,{timeout:30000});
  const gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('[data-preset="offset"]').click();await waitReset(page,gen);
  const sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));assert.deepEqual(sent.initial,Model.PRESETS.offset);
  assert.equal(await page.locator('#play-text').innerText(),'暂停');
  await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.steps)>=2,null,{timeout:30000});
});

test('opposed card loads a real negative-circulation initial field and remains usable',async t=>{
  const page=await newPage(t);await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  await page.locator('[data-note="rings"]').click();assert.equal(await page.locator('[data-note-content="rings"]').isVisible(),true);
  const gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);await page.locator('[data-try-preset="opposed"]').click();await waitReset(page,gen);
  const sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1));assert.deepEqual(sent.initial,Model.PRESETS.opposed);await step(page,3);
  assert.equal(await page.locator('#stage-notice').isVisible(),false);assert.equal(await page.locator('#play').isEnabled(),true);assert.equal(await page.locator('#time-readout').innerText(),'0.12');
});

test('camera interaction, cards, image export and scrollable navigation leave the fluid state intact',async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  await step(page,2);const steps=await page.locator('#fluid-stage').getAttribute('data-steps');
  await page.waitForFunction(()=>window.__fluidThree && __fluidThree.steps===2);const before=await page.evaluate(()=>__fluidThree.camera.position.toArray());
  await page.locator('#fluid-scene').focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(old=>__fluidThree.camera.position.toArray().some((value,i)=>Math.abs(value-old[i])>.01),before);
  const after=await page.evaluate(()=>__fluidThree.camera.position.toArray());assert.notDeepEqual(after,before);assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),steps);
  await page.locator('#reset-view').click();await page.waitForFunction(old=>__fluidThree.camera.position.toArray().every((value,i)=>Math.abs(value-old[i])<.05),before);
  const reset=await page.evaluate(()=>__fluidThree.camera.position.toArray());before.forEach((v,i)=>close(reset[i],v,.05));
  for(const note of ['equations','dye','rings','limits']){await page.locator(`[data-note="${note}"]`).click();assert.equal(await page.locator(`[data-note-content="${note}"]`).isVisible(),true);}
  const pending=page.waitForEvent('download');await page.locator('#save-image').click();const download=await pending;assert.equal(download.suggestedFilename(),'vortex-fluid.png');
  assert.deepEqual(fs.readFileSync(await download.path()).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  await page.locator('#nav-toggle').click();assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),require('./navigation-fixtures.cjs')['vortex-rings.html']);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#lab-navigation').isVisible(),false);assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),steps);assert.deepEqual(errors,[]);
});

test('normal motion advances the worker and hiding the tab pauses without resetting it',async t=>{
  const page=await newPage(t,{reducedMotion:'no-preference'});await watchWorker(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  assert.equal(await page.locator('#play-text').innerText(),'暂停');await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.steps)>=3,null,{timeout:30000});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#play-text').innerText(),'播放');await page.waitForFunction(()=>!document.querySelector('#step').disabled,null,{timeout:30000});
  const steps=await page.locator('#fluid-stage').getAttribute('data-steps');await page.waitForTimeout(400);assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),steps);
});

test('mobile uses the lighter true 3-D grid and touch rotates without altering the fluid',async t=>{
  const page=await newPage(t,{viewport:{width:320,height:568},isMobile:true,hasTouch:true});
  await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-grid'),'36x24x24');assert.equal(await page.locator('#control-panel').isVisible(),false);
  const before=await page.evaluate(()=>__fluidThree.camera.position.toArray()),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:260,id:1}]});
  for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160+i*7,y:260+i*3,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(old=>__fluidThree.camera.position.toArray().some((value,i)=>Math.abs(value-old[i])>.01),before);await twoFrames(page);
  assert.notDeepEqual(await page.evaluate(()=>__fluidThree.camera.position.toArray()),before);assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),'0');
  // Chromium's synthetic touch stream can suppress the first tap immediately after a simulated swipe.
  await page.waitForTimeout(500);
  await page.locator('#toggle-controls').tap();await page.locator('#control-panel').waitFor({state:'visible'});
  const resets=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length);
  await setRange(page,'#camera-zoom',1.4);await page.waitForFunction(()=>__fluidThree.camera.position.length()<9.5);
  assert.equal(await page.locator('#camera-zoom-value').innerText(),'1.40×');assert.equal(await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').length),resets);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-steps'),'0');
  const gen=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1).generation);
  await page.locator('[data-preset="smallChase"]').tap();await waitReset(page,gen);
  assert.equal(await page.locator('[data-preset="smallChase"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual((await page.evaluate(()=>__fluidSent.filter(m=>m.type==='reset').at(-1))).initial,Model.PRESETS.smallChase);
  assert.equal(await page.locator('#camera-zoom-value').innerText(),'1.40×');
  await page.locator('#slice-toggle').click();await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.slice==='z');await page.locator('#toggle-controls').click();
  const field=await page.evaluate(()=>{const f=document.querySelector('#field-hud').getBoundingClientRect(),c=document.querySelector('.vortex-caption').getBoundingClientRect(),b=document.querySelector('.lab-bottom').getBoundingClientRect();return {left:f.left,right:f.right,top:f.top,bottom:f.bottom,captionBottom:c.bottom,playbackTop:b.top};});
  assert.ok(field.left>=0&&field.right<=320&&field.top>=field.captionBottom&&field.bottom<=field.playbackTop,JSON.stringify(field));
  await page.locator('#toggle-knowledge').tap();await page.locator('#knowledge-panel').waitFor({state:'visible'});
  assert.equal(await page.locator('#control-panel').isVisible(),false);
  const boxes=await page.evaluate(()=>{const hud=document.querySelector('.lab-bottom').getBoundingClientRect(),top=document.querySelector('#lab-topbar').getBoundingClientRect();return {hud:[hud.left,hud.top,hud.right,hud.bottom],top:[top.left,top.top,top.right,top.bottom]};});
  assert.ok(boxes.hud[0]>=0&&boxes.hud[2]<=320&&boxes.hud[3]<=568&&boxes.top[2]<=320,JSON.stringify(boxes));
});

test('mobile touch can push the actual field while leaving the camera unchanged',async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);
  await page.locator('#toggle-controls').tap();await page.locator('button[data-tool="force"]').tap();
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.slice==='z');
  await page.locator('#toggle-controls').tap();await page.locator('#control-panel').waitFor({state:'hidden'});await twoFrames(page);
  const p=await page.evaluate(()=>{const c=__fluidThree.camera,p=new THREE.Vector3(0,0,Number(document.querySelector('#fluid-stage').dataset.slicePosition)).project(c),r=document.querySelector('#fluid-scene').getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2,camera:c.position.toArray()};});
  const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+i*5,y:p.y-i*2,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>Number(document.querySelector('#fluid-stage').dataset.forceSteps)>0,null,{timeout:30000});
  const sent=await page.evaluate(()=>__fluidSent.filter(m=>m.type==='step'&&m.force).at(-1));assert.ok(sent.force.strength>0);assert.equal(await page.locator('#play-text').innerText(),'播放');
  const camera=await page.evaluate(()=>__fluidThree.camera.position.toArray());camera.forEach((v,i)=>close(v,p.camera[i],.05));
});

test('without WebGL2 the page explains the limitation and offers the original model, not a fake fluid',async t=>{
  const page=await newPage(t);await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args);};});await watchWorker(page);await open(page);
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-renderer'),'unavailable');assert.match(await page.locator('#stage-error-text').innerText(),/不支持 WebGL2/);
  assert.equal(await page.locator('#play').isDisabled(),true);assert.equal(await page.locator('#radius-a').isDisabled(),true);
  assert.equal(await page.locator('[data-render-mode="contour"]').isDisabled(),true);assert.equal(await page.locator('#render-quality').isDisabled(),true);
  await page.locator('[data-note="dye"]').click();assert.equal(await page.locator('[data-note-content="dye"]').isVisible(),true);
  assert.equal(await page.locator('#stage-error a').count(),0);assert.equal(await page.locator('.engine-choice a').getAttribute('href'),'vortex-filament.html');assert.equal(await page.evaluate(()=>__fluidSent.length),0);
  await page.locator('.engine-choice a').click();await page.waitForURL('**/vortex-filament.html');
  await page.waitForFunction(()=>document.querySelector('#stage-error').hidden && ['webgl','canvas2d'].includes(document.querySelector('#vortex-stage').dataset.renderer),null,{timeout:30000});
});

test('a worker creation failure displays an actionable explanation',async t=>{
  const page=await newPage(t);await page.addInitScript(()=>{window.Worker=function(){throw new Error('worker blocked');};});await open(page);if(!await hasWebGL2(page,t))return;
  assert.equal(await page.locator('#fluid-stage').getAttribute('data-renderer'),'unavailable');assert.match(await page.locator('#stage-error-text').innerText(),/worker blocked/);assert.equal(await page.locator('#play').isDisabled(),true);
});

for(const mode of ['shader','blank'])test(`${mode} volume rendering failure is surfaced instead of a blank simulation`,async t=>{
  const page=await newPage(t);await watchThree(page,mode);await open(page);if(!await hasWebGL2(page,t))return;
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.renderer==='unavailable',null,{timeout:30000});
  assert.match(await page.locator('#stage-error-text').innerText(),mode==='shader'?/着色器编译失败/:/空白体积/);assert.equal(await page.locator('#play').isDisabled(),true);
});

test('WebGL2 context loss stops the worker and provides the comparison link',async t=>{
  const page=await newPage(t);await watchWorker(page);await watchThree(page);await open(page);if(!await hasWebGL2(page,t))return;await waitReady(page);await twoFrames(page);
  const supported=await page.evaluate(()=>{const ext=__fluidThree.renderer.getContext().getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;});
  if(!supported){t.skip('WEBGL_lose_context unavailable');return;}
  await page.waitForFunction(()=>document.querySelector('#fluid-stage').dataset.renderer==='unavailable',null,{timeout:30000});assert.match(await page.locator('#stage-error-text').innerText(),/上下文/);
  assert.equal(await page.locator('#stage-error a').count(),0);assert.equal(await page.locator('.engine-choice a').getAttribute('href'),'vortex-filament.html');
});

test('direct offline file entry and the idealized comparison remain available',async t=>{
  const page=await newPage(t),external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});await page.context().setOffline(true);
  await watchWorker(page);await open(page,pathToFileURL(path.join(root,'vortex-rings.html')).href);if(!await hasWebGL2(page,t))return;await waitReady(page);
  await page.locator('.engine-choice a').click();assert.ok(page.url().endsWith('/vortex-filament.html'));await page.waitForFunction(()=>document.querySelector('#stage-error').hidden,null,{timeout:30000});
  assert.equal(await page.locator('.fluid-mode-link').getAttribute('href'),'vortex-rings.html');assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
});
