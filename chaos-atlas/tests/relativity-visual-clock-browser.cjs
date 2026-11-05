'use strict';
// Optional real-browser regression. Requires playwright-core and Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/relativity.html';const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,data)=>err?res.writeHead(404).end():res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port+'/';});
test.after(async()=>{if(server)await new Promise(r=>server.close(r));});
async function pageFor(t,options={}){const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());return browser.newPage({viewport:{width:900,height:600},reducedMotion:'reduce',...options});}
async function open(page,url=base+'relativity.html'){await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>document.querySelector('#relativity-stage').dataset.status==='ready',null,{timeout:120000});}
async function final(page){await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:180000});}
const near=(actual,expected,tolerance,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} != ${expected} ± ${tolerance}`);

test('CPU bilinear texture sampling agrees with a real WebGL sampler', {timeout:180000},async t=>{
  const page=await pageFor(t);await open(page);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  const result=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL unavailable');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision highp float;uniform sampler2D image;uniform vec2 uv;uniform int repeatMode;void main(){vec2 q=repeatMode==1?fract(uv):clamp(uv,0.0,1.0);gl_FragColor=texture2D(image,q);}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const a=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const w=5,h=3,pixels=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){pixels[4*i]=(i*53+7)%256;pixels[4*i+1]=(i*97+31)%256;pixels[4*i+2]=(i*29+111)%256;pixels[4*i+3]=255;}
    const flipped=new Uint8Array(pixels.length);for(let y=0;y<h;y++)flipped.set(pixels.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,flipped);
    const image={w,h,pixels},out=new Uint8Array(4),uv=gl.getUniformLocation(program,'uv'),repeat=gl.getUniformLocation(program,'repeatMode');let seed=4723,max=0,sum=0,count=0,worst=null;
    const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    for(let i=0;i<400;i++){const u=random()*6-3,v=random()*6-3,wrap=i%2===0;gl.uniform2f(uv,u,v);gl.uniform1i(repeat,wrap?1:0);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,out);const cpu=RelativityRenderer.sampleTexture(image,u,v,wrap);for(let k=0;k<3;k++){const d=Math.abs(cpu[k]-out[k]);sum+=d;count++;if(d>max){max=d;worst={u,v,wrap,k,cpu:cpu[k],gpu:out[k]};}}}
    return {max,mean:sum/count,count,worst};
  });
  t.diagnostic(JSON.stringify(result));assert.ok(result.max<1.6,JSON.stringify(result));assert.ok(result.mean<.55,JSON.stringify(result));
});

test('low frame rate keeps wall-clock pace, changes speed continuously, and excludes hidden time', {timeout:240000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=cb=>window.setTimeout(()=>cb(performance.now()),240);window.cancelAnimationFrame=id=>clearTimeout(id);});await open(page);
  const start=await page.evaluate(()=>{
    const stage=document.querySelector('#relativity-stage');window.__clockEvents=[];new MutationObserver(()=>window.__clockEvents.push({wall:performance.now(),time:Number(stage.dataset.time),rate:Number(stage.dataset.playbackRate),playing:stage.dataset.playing})).observe(stage,{attributes:true,attributeFilter:['data-time']});
    const slider=document.querySelector('#event-time');slider.value='-2.80';slider.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('#playback-rate');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));
    const wall=performance.now();document.querySelector('#play').click();return {wall,time:Number(stage.dataset.time)};
  });
  await page.waitForFunction(()=>window.__clockEvents.filter(x=>x.playing==='true'&&x.rate===1&&x.time>-2.8).length>=4,null,{timeout:30000});
  const first=await page.evaluate(()=>window.__clockEvents.filter(x=>x.playing==='true'&&x.rate===1&&x.time>-2.8));assert.ok(first.length>=4);
  for(const event of first)near(event.time,start.time+.65*(event.wall-start.wall)/1000,.055,'1× at 4 fps');
  const change=await page.evaluate(()=>{const stage=document.querySelector('#relativity-stage'),el=document.querySelector('#playback-rate');el.value='0.5';const wall=performance.now();el.dispatchEvent(new Event('change',{bubbles:true}));return {wall,time:Number(stage.dataset.time),rate:Number(stage.dataset.playbackRate)};});
  assert.equal(change.rate,.5);near(change.time,start.time+.65*(change.wall-start.wall)/1000,.055,'rate-change continuity');
  await page.waitForFunction(c=>window.__clockEvents.filter(x=>x.playing==='true'&&x.rate===.5&&x.wall>c.wall+200).length>=3,change,{timeout:30000});
  const slower=await page.evaluate(c=>window.__clockEvents.filter(x=>x.playing==='true'&&x.rate===.5&&x.wall>c.wall+200),change);for(const event of slower)near(event.time,change.time+.325*(event.wall-change.wall)/1000,.055,'0.5× at 4 fps');
  const hidden=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});const wall=performance.now();document.dispatchEvent(new Event('visibilitychange'));return wall;});await page.waitForTimeout(1400);
  const resumed=await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});const wall=performance.now();document.dispatchEvent(new Event('visibilitychange'));return {wall,time:Number(document.querySelector('#relativity-stage').dataset.time)};});
  near(resumed.time,change.time+.325*(hidden-change.wall)/1000,.055,'hidden time must not be counted');
  await page.waitForFunction(r=>window.__clockEvents.some(x=>x.rate===.5&&x.wall>r.wall+500),resumed,{timeout:30000});
  const after=await page.evaluate(r=>window.__clockEvents.filter(x=>x.rate===.5&&x.wall>r.wall+500).at(-1),resumed);near(after.time,resumed.time+.325*(after.wall-resumed.wall)/1000,.055,'resumed pace');
  await page.evaluate(()=>{document.querySelector('#play').click();const slider=document.querySelector('#event-time');slider.value='2.90';slider.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('#playback-rate');select.value='2';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#play').click();});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.playing==='false'&&Number(d.time)===3;},null,{timeout:30000});await final(page);
  const endpoint=await page.locator('#relativity-stage').evaluate(e=>({...e.dataset}));near(Number(endpoint.drawnTime),3,.000001,'endpoint physical frame');assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({first:first.slice(0,4),change,hidden,resumed,after,endpointTime:endpoint.drawnTime}));
});

test('rate is saved and restored, with old snapshots defaulting to 1×', {timeout:240000},async t=>{
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await final(page);
  await page.locator('#playback-rate').selectOption('0.25');await page.evaluate(()=>document.querySelector('#save-local').click());
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('relativity-observation-v1')));assert.equal(saved.parameters.playbackRate,.25);
  await page.locator('#playback-rate').selectOption('2');await page.evaluate(()=>document.querySelector('#restore-local').click());await final(page);assert.equal(await page.locator('#playback-rate').inputValue(),'0.25');
  await page.evaluate(()=>{const key='relativity-observation-v1',saved=JSON.parse(localStorage.getItem(key));delete saved.parameters.playbackRate;localStorage.setItem(key,JSON.stringify(saved));document.querySelector('#restore-local').click();});await final(page);assert.equal(await page.locator('#playback-rate').inputValue(),'1');assert.deepEqual(errors,[]);
});

test('offline mobile transport remains reachable, responsive and accessible when collapsed', {timeout:240000},async t=>{
  const page=await pageFor(t,{viewport:{width:320,height:700},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await open(page,pathToFileURL(path.join(root,'relativity.html')).href);await final(page);
  const layout=await page.evaluate(()=>{const ids=['experiment-dock','event-time','playback-rate'],out={width:document.documentElement.scrollWidth};for(const id of ids){const r=document.getElementById(id).getBoundingClientRect();out[id]={x:r.x,right:r.right,width:r.width,height:r.height};}return out;});
  assert.equal(layout.width,320,JSON.stringify(layout));for(const id of ['experiment-dock','event-time','playback-rate'])assert.ok(layout[id].x>=0&&layout[id].right<=320&&layout[id].width>0&&layout[id].height>0,JSON.stringify(layout));assert.ok(layout['event-time'].width>=35,JSON.stringify(layout));
  assert.equal(await page.locator('#playback-rate').getAttribute('aria-label'),'时间播放速率');assert.match(await page.locator('#playback-rate-note').textContent(),/不改变物体速度/);
  await page.locator('#playback-rate').selectOption('0.5');assert.equal(await page.locator('#relativity-stage').getAttribute('data-playback-rate'),'0.5');
  await page.locator('#toggle-dock').click();assert.equal(await page.locator('#dock-content').isHidden(),true);await page.locator('#toggle-dock').click();assert.equal(await page.locator('#playback-rate').inputValue(),'0.5');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify(layout));
});
