'use strict';
// Regression for the cooperative/offline comparison's texture readiness.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');

test('offline harbor comparison waits for every texture and fails clearly on a late decode error', {timeout:300000},async t=>{
  const args=['--no-sandbox','--disable-dev-shm-usage',...(process.env.CHROMIUM_FLAGS||'').split(/\s+/).filter(Boolean)];
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1000,height:650},reducedMotion:'reduce'}),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(path.join(root,'relativity.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.status==='ready'&&d.quality==='final'&&d.qualityPending==='false'&&d.renderPending==='false';},null,{timeout:120000});
  await page.locator('button[data-environment="harbor"]').click();
  await page.waitForFunction(()=>{const d=document.querySelector('#relativity-stage').dataset;return d.environment==='harbor'&&d.quality==='final'&&d.renderPending==='false';},null,{timeout:120000});
  await page.locator('#toggle-controls').click();await page.locator('#open-parameter-comparison').click();
  assert.match(await page.locator('#parameter-context').textContent(),/^港口货场 \/ 运动物体/);
  await page.evaluate(()=>{
    const NativeImage=window.Image,descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src'),names=new Map(Object.entries(RelativityTextures).map(([name,url])=>[url,name]));
    window.__loadedTextures=[];window.__deferredTextures=[];
    window.Image=function(...args){
      const image=new NativeImage(...args);let name='';image.addEventListener('load',()=>window.__loadedTextures.push(name));
      Object.defineProperty(image,'src',{configurable:true,get(){return descriptor.get.call(this);},set(value){
        name=names.get(value)||'';if(name==='harborSky'||name==='harborMetal')window.__deferredTextures.push({image,source:value,name});else descriptor.set.call(image,value);
      }});return image;
    };window.Image.prototype=NativeImage.prototype;
    window.__releaseTexture=(name,fail=false)=>{const index=window.__deferredTextures.findIndex(x=>x.name===name);if(index<0)throw Error('Missing gated '+name);const [entry]=window.__deferredTextures.splice(index,1);descriptor.set.call(entry.image,fail?'data:image/jpeg;base64,broken':entry.source);};
  });
  await page.locator('#comparison-run').click();
  await page.waitForFunction(()=>window.__deferredTextures.length===2&&window.__loadedTextures.length===7,null,{timeout:30000});await page.waitForTimeout(600);
  assert.match(await page.locator('#comparison-status').textContent(),/正在准备独立光线追踪/,'must not trace with missing harbor textures');
  assert.equal(await page.locator('#comparison-export-data').isDisabled(),true);
  await page.evaluate(()=>window.__releaseTexture('harborSky'));
  await page.waitForFunction(()=>window.__loadedTextures.includes('harborSky'),null,{timeout:30000});
  assert.match(await page.locator('#comparison-status').textContent(),/正在准备独立光线追踪/);
  await page.evaluate(()=>window.__releaseTexture('harborMetal',true));
  await page.waitForFunction(()=>document.querySelector('#comparison-status').textContent.includes('材质加载失败：harborMetal'),null,{timeout:30000});
  assert.equal(await page.locator('#comparison-export-data').isDisabled(),true);
  await page.evaluate(()=>{window.__loadedTextures=[];window.__deferredTextures=[];});await page.locator('#comparison-run').click();
  await page.waitForFunction(()=>window.__deferredTextures.length===2&&window.__loadedTextures.length===7,null,{timeout:30000});
  await page.evaluate(()=>{window.__releaseTexture('harborSky');window.__releaseTexture('harborMetal');});
  await page.waitForFunction(()=>window.__loadedTextures.length===9,null,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#comparison-export-data').disabled&&document.querySelector('#comparison-results').dataset.stale==='false',null,{timeout:180000});
  const loaded=await page.evaluate(()=>window.__loadedTextures.slice().sort());
  assert.deepEqual(loaded,['asphalt','crate','facade','harborMetal','harborSky','mountains','sky','stone','wall']);
  assert.match(await page.locator('#comparison-status').textContent(),/已完成/);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);t.diagnostic(JSON.stringify({loaded,scene:await page.locator('#parameter-context').textContent()}));
});
