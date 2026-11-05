'use strict';
// Optional browser regressions: install playwright-core and provide Chromium.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright-core'),menus=require('./navigation-fixtures.cjs'),root=path.resolve(__dirname,'..');
let axe;try{axe=require('axe-core');}catch(_){}
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.jpg':'image/jpeg'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/index.html';
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
async function openTuring(page) {
  await page.goto(base+'turing-patterns.html',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('#turing-stage').dataset.status==='ready',null,{timeout:45000});
}
async function position(page){return page.locator('#nav-scroll-list').evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight,height:el.clientHeight}));}
async function fullyVisible(page,selector) {
  return page.locator(selector).evaluate(el=>{
    const a=el.getBoundingClientRect(),b=document.querySelector('#nav-scroll-list').getBoundingClientRect();
    return a.left>=b.left-.5&&a.right<=b.right+.5&&a.top>=b.top-.5&&a.bottom<=b.bottom+.5;
  });
}

test('visible scrollbar, wheel and keyboard stay synchronized and preserve live state', {timeout:60000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await openTuring(page);
  const time=await page.locator('#turing-stage').getAttribute('data-time');await page.locator('#nav-toggle').click();
  assert.equal(await page.locator('#nav-position').isVisible(),true);assert.equal(await page.locator('#nav-position').isEnabled(),true);
  assert.equal(await page.locator('#lab-navigation a').count(),8);assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),menus['turing-patterns.html']);
  let p=await position(page);assert.ok(p.max>0);assert.equal(Number(await page.locator('#nav-position').inputValue()),0);
  const box=await page.locator('#nav-position').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height-3,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#nav-scroll-list').scrollTop>=document.querySelector('#nav-scroll-list').scrollHeight-document.querySelector('#nav-scroll-list').clientHeight-1);
  assert.equal(Number(await page.locator('#nav-position').inputValue()),100);assert.equal(await fullyVisible(page,'#lab-navigation a[href="relativity.html"]'),true);
  const list=await page.locator('#nav-scroll-list').boundingBox();await page.mouse.move(list.x+list.width/2,list.y+list.height/2);await page.mouse.wheel(0,-400);
  await page.waitForFunction(()=>document.querySelector('#nav-scroll-list').scrollTop===0);await page.waitForFunction(()=>document.querySelector('#nav-position').value==='0');
  await page.locator('#nav-position').focus();await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>Number(document.querySelector('#nav-position').value)>99);
  await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>document.querySelector('#nav-position').value==='0');
  await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#nav-position').value==='100');
  await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#nav-position').value==='0');
  // Tabbing to an off-screen link must scroll it into view, not strand keyboard users.
  await page.locator('#nav-toggle').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'nav-scroll-list');
  for(let i=0;i<8;i++)await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'relativity.html');assert.equal(await fullyVisible(page,'#lab-navigation a[href="relativity.html"]'),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#lab-navigation').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'nav-toggle');
  assert.equal(await page.locator('#turing-stage').getAttribute('data-time'),time);assert.deepEqual(errors,[]);
});

test('touch can drag the thumb and swipe the list on a narrow screen', {timeout:60000},async t=>{
  const page=await newPage(t,{viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await openTuring(page);
  await page.locator('#nav-toggle').tap();const cdp=await page.context().newCDPSession(page),slider=await page.locator('#nav-position').boundingBox();
  async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});}
  const x=slider.x+slider.width/2,start=slider.y+12,end=slider.y+slider.height-4;
  await touch('touchStart',x,start);for(let i=1;i<=8;i++)await touch('touchMove',x,start+(end-start)*i/8);await touch('touchEnd',x,end);
  await page.waitForFunction(()=>Number(document.querySelector('#nav-position').value)>98,null,{timeout:10000});assert.equal(await fullyVisible(page,'#lab-navigation a[href="relativity.html"]'),true);
  await page.locator('#nav-position').focus();await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#nav-position').value==='0');
  const list=await page.locator('#nav-scroll-list').boundingBox(),sx=list.x+20,sy=list.y+list.height-10;
  await touch('touchStart',sx,sy);for(let i=1;i<=8;i++)await touch('touchMove',sx,sy-i*7);await touch('touchEnd',sx,sy-56);
  await page.waitForFunction(()=>document.querySelector('#nav-scroll-list').scrollTop>10,null,{timeout:10000});
  await page.waitForFunction(()=>Number(document.querySelector('#nav-position').value)>10);
  assert.equal(await page.locator('#lab-navigation').isVisible(),true);assert.deepEqual(errors,[]);
});

test('chapter navigation has only numbered experiments on every workbench', {timeout:120000},async t=>{
  const page=await newPage(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [file,links] of Object.entries(menus)) {
    await page.goto(base+file,{waitUntil:'load'});await page.locator('#nav-toggle').click();
    assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(a=>a.map(el=>el.getAttribute('href'))),links,file);
    assert.equal(links.length,file==='streamer.html'||file==='vortex-filament.html'?9:8);assert.ok(!links.includes(file));assert.ok(!links.includes('streamer.html')&&!links.includes('vortex-filament.html'));assert.ok(links.every(href=>fs.existsSync(path.join(root,href))));
    assert.equal(await page.locator('#nav-position').isVisible(),true);const p=await position(page);assert.ok(p.max>0,file);
    const last=links.at(-1),link=page.locator(`#lab-navigation a[href="${last}"]`);await link.scrollIntoViewIfNeeded();assert.equal(await fullyVisible(page,`#lab-navigation a[href="${last}"]`),true);
    await link.click();assert.ok(page.url().endsWith('/'+last),`${file} → ${last}`);
  }
  assert.deepEqual(errors,[]);
});

test('B comparisons are linked only inside their parent consoles and return from their own consoles', {timeout:120000},async t=>{
  const page=await newPage(t);await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args);};});
  for(const file of Object.keys(menus)){
    await page.goto(base+file);const bad=await page.evaluate(()=>[...document.querySelectorAll('a[href="streamer.html"],a[href="vortex-filament.html"]')].filter(a=>!a.closest('#control-panel')).map(a=>a.outerHTML));assert.deepEqual(bad,[],file);
  }
  for(const [width,height] of [[1440,900],[390,844]])for(const [parent,child] of [['vortex-rings.html','vortex-filament.html'],['lightning.html','streamer.html']]){
    await page.setViewportSize({width,height});await page.goto(base+parent);if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();
    const link=page.locator(`#control-panel a[href="${child}"]`);assert.equal(await link.count(),1);await link.click();await page.waitForURL('**/'+child);
    if(!await page.locator('#control-panel').isVisible())await page.locator('#toggle-controls').click();const back=page.locator(`#control-panel a[href="${parent}"]`);assert.equal(await back.count(),1);await back.click();await page.waitForURL('**/'+parent);
  }
});

test('the navigation and its scrollbar have no axe violations at desktop and mobile sizes', {timeout:90000,skip:!axe},async t=>{
  const page=await newPage(t);await page.addInitScript({content:axe.source});
  for(const file of Object.keys(menus)) {
    await page.goto(base+file,{waitUntil:'load'});
    for(const [width,height] of [[1440,900],[320,568],[568,320]]) {
      await page.setViewportSize({width,height});await page.locator('#nav-toggle').click();
      const violations=await page.evaluate(async()=>{
        const results=await axe.run(document.querySelector('#lab-navigation'));
        return results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));
      });
      assert.deepEqual(violations,[],`${file} at ${width}×${height}`);await page.keyboard.press('Escape');
    }
  }
});
