'use strict';
// Optional browser regressions: install playwright-core and optionally axe-core,
// then supply CHROMIUM_PATH. No experiment should need a live server for the
// overview itself; file:// Worker limits in individual labs are documented.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const menus=require('./navigation-fixtures.cjs');let axe;try{axe=require('axe-core');}catch(_){}
const root=path.resolve(__dirname,'..');
const labs=[
  ['01','空间摆','index.html'],['02','相空间图谱','attractors.html'],['03','自由刚体','rigid-body.html'],
  ['04','势能地形','henon-heiles.html'],['05','涡环追逐','vortex-rings.html'],['06','球面图灵斑纹','turing-patterns.html'],
  ['07','闪电生长','lightning.html'],['08','三维自旋晶格','ising.html'],['09','近光速世界','relativity.html']
];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.jpg':'image/jpeg','.md':'text/plain; charset=utf-8'};
let server,base;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name==='/')name='/overview.html';
    const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>error?res.writeHead(404).end():res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function newContext(t,options={}){
  const args=['--no-sandbox','--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean));let browser;
  for(let i=0;i<3;i++){try{browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});break;}catch(e){if(i===2||!/signal=SIGSEGV/.test(String(e)))throw e;}}
  t.after(()=>browser.close());return browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce',...options});
}
async function loaded(page,url){await page.goto(url,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);}

test('the nine cards describe models, actions, concepts and limits without running simulations', {timeout:60000},async t=>{
  const context=await newContext(t),page=await context.newPage(),requests=[],errors=[];
  page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
  await loaded(page,base);assert.equal(await page.locator('script').count(),0);assert.equal(await page.locator('canvas, iframe').count(),0);
  assert.equal(await page.locator('.experiment-card').count(),9);assert.equal(await page.locator('.path-card').count(),3);
  for(const [number,name,file] of labs){
    const card=page.locator('#experiment-'+number);assert.equal(await card.locator('h3').innerText(),name);
    for(const selector of ['.card-model','.card-try p','.card-scope'])assert.ok((await card.locator(selector).innerText()).trim().length>8,number+' '+selector);
    assert.ok(await card.locator('.card-tags li').count()>=3,number);assert.equal(await card.locator('.card-link').getAttribute('href'),file);
    assert.equal(await card.locator('.card-image').getAttribute('href'),file);
    const image=await card.locator('img').getAttribute('src');assert.ok(image.startsWith('assets/overview/'));assert.ok(fs.existsSync(path.join(root,image)));
  }
  assert.equal(await page.locator('a[href="streamer.html"],a[href="vortex-filament.html"]').count(),0,'B pages stay in their parent consoles');
  assert.ok(!requests.some(url=>/\.(?:js)(?:\?|$)/.test(url)),'overview does not start the simulations');assert.deepEqual(errors,[]);
});

test('constellation works by pointer, native radio keyboard and touch at small sizes', {timeout:60000},async t=>{
  const context=await newContext(t),page=await context.newPage();await loaded(page,base);
  for(const [number,name] of labs){
    await page.locator('label[for="node-'+number+'"]').click();
    assert.equal(await page.locator('#node-'+number).isChecked(),true);
    assert.equal(await page.locator('.map-detail-'+number).isVisible(),true);
    assert.equal(await page.locator('.map-detail:visible h3').innerText(),name);
    assert.ok((await page.locator('.map-detail-'+number+' p').innerText()).trim().length>30);
    assert.equal(await page.locator('.map-detail:visible').count(),1);
    const related=await page.locator('.map-detail-'+number+' .map-related a').evaluateAll(as=>as.map(a=>a.getAttribute('href').slice(-2)));
    for(const other of related)assert.equal(await page.locator(`.map-edge[data-nodes~="${number}"][data-nodes~="${other}"]`).count(),1,number+' to '+other);
  }
  await page.locator('#node-01').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#node-02').isChecked(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'node-02');
  await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#node-01').isChecked(),true);
  const phone=await context.browser().newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'});t.after(()=>phone.close());
  const touchPage=await phone.newPage();await loaded(touchPage,base);
  for(const [number] of labs){await touchPage.locator('label[for="node-'+number+'"]').tap();assert.equal(await touchPage.locator('#node-'+number).isChecked(),true,number);}
  assert.equal(await touchPage.locator('.map-detail:visible h3').innerText(),'近光速世界');
});

test('all nine entries and returns work with scripts enabled', {timeout:120000},async t=>{
  const context=await newContext(t),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const [number,,file] of labs){
    await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('#experiment-'+number+' .card-link').click();
    await page.waitForURL('**/'+file);const link=page.locator('.overview-return');assert.equal(await link.count(),1,file);
    assert.equal(await link.getAttribute('href'),'overview.html');assert.equal(await link.evaluate(el=>el.nextElementSibling.id),'nav-toggle');
    assert.equal(await link.evaluate(el=>!!el.closest('#lab-navigation')),false);
    await link.focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'nav-toggle');
    await link.click();await page.waitForURL('**/overview.html');
  }
  for(const file of ['vortex-filament.html','streamer.html']){
    await page.goto(base+file,{waitUntil:'domcontentloaded'});const link=page.locator('.overview-return');
    assert.equal(await link.getAttribute('href'),'overview.html');assert.equal(await link.evaluate(el=>el.nextElementSibling.id),'nav-toggle');
    await link.click();await page.waitForURL('**/overview.html');
  }
  assert.deepEqual(errors,[]);
});

test('direct file opening remains useful without JavaScript or network', {timeout:120000},async t=>{
  const context=await newContext(t,{javaScriptEnabled:false,offline:true}),page=await context.newPage();
  const url=name=>pathToFileURL(path.join(root,name)).href;
  await loaded(page,url('overview.html'));
  assert.equal(await page.locator('.experiment-card').count(),9);
  await page.locator('label[for="node-08"]').click();assert.equal(await page.locator('#node-08').isChecked(),true);
  assert.equal(await page.locator('.map-detail-08').isVisible(),true);
  for(const [number] of labs)assert.equal(await page.locator('.map-node-'+number+' img').evaluate(img=>img.complete&&img.naturalWidth>0),true,number+' local thumbnail');
  for(const [number,,file] of labs){
    await page.locator('#experiment-'+number+' .card-link').click();assert.equal(page.url(),url(file));
    await page.locator('.overview-return').click();assert.equal(page.url(),url('overview.html'));
  }
});

test('overview and all eleven topbars fit narrow, landscape and long-status layouts', {timeout:120000},async t=>{
  const context=await newContext(t,{javaScriptEnabled:false}),page=await context.newPage();
  for(const [width,height] of [[320,568],[360,640],[390,844],[421,740],[520,320],[568,320],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await loaded(page,base);
    const layout=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert.ok(layout.scroll<=layout.inner&&layout.body<=layout.inner,`${width}×${height}: ${JSON.stringify(layout)}`);
    for(const [number] of labs)assert.equal(await page.locator('label[for="node-'+number+'"]').isVisible(),true,number);
  }
  for(const file of Object.keys(menus)){
    await loaded(page,base+file);
    await page.locator('#header-status').evaluate(el=>{el.textContent='粒子与电场演化中 / 后台继续求解模拟';});
    for(const [width,height] of [[320,568],[390,844],[421,740],[520,320],[568,320],[1440,900]]){
      await page.setViewportSize({width,height});
      // With page JavaScript disabled Chromium may defer media-query repaint
      // until the next frame; force that frame before measuring the layout.
      await page.screenshot();
      const sizes=await page.evaluate(()=>{
        const bar=document.querySelector('.topbar-inner'),brand=bar.querySelector('.brand'),back=bar.querySelector('.overview-return'),nav=bar.querySelector('#nav-toggle');
        const rect=el=>{const x=el.getBoundingClientRect();return {left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width};};
        return {bar:rect(bar),brand:rect(brand),back:rect(back),nav:rect(nav),brandScroll:brand.scrollWidth,brandClient:brand.clientWidth,doc:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      const {bar,brand,back,nav}=sizes,margin=.75;
      assert.ok(brand.left>=bar.left-margin&&brand.right<=back.left+margin,`${file} ${width}: ${JSON.stringify(sizes)}`);
      assert.ok(back.width>=44&&back.right<=nav.left+margin&&nav.right<=bar.right+margin,`${file} ${width}: ${JSON.stringify(sizes)}`);
      assert.ok(sizes.brandScroll<=sizes.brandClient+1,`${file} brand overlaps at ${width}: ${JSON.stringify(sizes)}`);
      assert.ok(sizes.doc<=sizes.viewport,`${file} overflows at ${width}: ${JSON.stringify(sizes)}`);
      if(width===320)assert.match(await page.locator('.topbar-inner').ariaSnapshot(),/粒子与电场演化中/,'small-screen status remains in the accessibility tree');
    }
  }
});

test('overview and return controls have no axe violations at desktop and mobile sizes', {timeout:120000,skip:!axe},async t=>{
  const context=await newContext(t),page=await context.newPage();await page.addInitScript({content:axe.source});
  for(const [width,height] of [[1440,900],[390,844],[320,568],[568,320]]){
    await page.setViewportSize({width,height});await loaded(page,base);
    for(const number of ['01','06','09']){
      await page.locator('label[for="node-'+number+'"]').click();
      const violations=await page.evaluate(async()=>{const r=await axe.run(document);return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});
      assert.deepEqual(violations,[],`overview ${width} node ${number}`);
    }
  }
  for(const file of Object.keys(menus)){
    await page.goto(base+file,{waitUntil:'domcontentloaded'});
    for(const [width,height] of [[1440,900],[320,568]]){
      await page.setViewportSize({width,height});
      const violations=await page.evaluate(async()=>{const r=await axe.run(document.querySelector('.topbar-inner'));return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}));});
      assert.deepEqual(violations,[],`${file} topbar ${width}`);
    }
  }
});
