#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'..');
const executablePath=process.env.CHROME_BIN||process.env.CHROMIUM_PATH;
if(!executablePath||!fs.existsSync(executablePath)){
  console.error('Set CHROME_BIN (or CHROMIUM_PATH) to a Chromium/Chrome executable to run this browser test.');
  process.exit(2);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm'};
function serve(root){
  const server=http.createServer((req,res)=>{
    let urlPath;
    try{urlPath=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{res.writeHead(400).end();return;}
    const file=path.resolve(root,'.'+urlPath);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(err,body)=>{
      if(err){res.writeHead(404).end('not found');return;}
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
    });
  });
  return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server)));
}
const errors=[];
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],timeout:45000});
try{
  for(const [label,root] of [['source',repo],['standalone',path.join(repo,'dist')]]){
    const server=await serve(root);
    try{
      const address=server.address();
      const page=await browser.newPage();
      page.on('pageerror',e=>errors.push(`${label}: ${e.stack||e.message}`));
      page.on('console',m=>{if(m.type()==='error'&&!/favicon\.ico/.test(m.text()))errors.push(`${label} console: ${m.text()}`);});
      await page.goto(`http://127.0.0.1:${address.port}/qec.html?mode=surf&meas=circuit&d=3&p=0.005&trials=200&seed=7`,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForSelector('#sfCircuitModels button[data-v="t1t2-pauli-twirled"]',{timeout:45000});
      await page.waitForFunction(()=>document.querySelector('#hCfg')?.textContent.includes('T1/T2-twirled'),null,{timeout:45000});
      assert.equal(await page.locator('#sfCircuitModels button[data-v="t1t2-pauli-twirled"]').evaluate(e=>e.classList.contains('on')),true,`${label}: T1/T2 is the default model`);
      assert.notEqual(await page.locator('#sfT1T2Controls').evaluate(e=>getComputedStyle(e).display),'none',`${label}: T1/T2 controls are visible`);

      await page.locator('#sfT1').evaluate(e=>{e.value='40';e.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('#sfT1').value==='40'&&document.querySelector('#sfT2').value==='80');
      await page.waitForFunction(()=>document.querySelector('#hCfg')?.textContent.includes('T1/T2=40/80τ'),null,{timeout:45000});
      assert.match(await page.locator('#hCfg').textContent(),/40\/80τ/,`${label}: T2 is clamped to 2T1 and reflected in HUD`);
      await page.locator('#sfP').evaluate(e=>{e.value='0.009';e.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('#hCfg')?.textContent.includes('p₂=0.0090'));

      await page.locator('#sfCircuitModels button[data-v="depolarizing"]').click();
      assert.equal(await page.locator('#sfT1T2Controls').evaluate(e=>getComputedStyle(e).display),'none',`${label}: T1/T2 controls hide in legacy mode`);
      assert.match(await page.locator('#sfPLabel').textContent(),/统一位置/);
      assert.match(await page.locator('#hCfg').textContent(),/uniform depolarizing/);
      await page.locator('#sfCircuitModels button[data-v="t1t2-pauli-twirled"]').click();
      await page.locator('#sfPSPAM').evaluate(e=>{e.value='0.0025';e.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.querySelector('#hCfg')?.textContent.includes('SPAM=0.0025'));
      await page.waitForFunction(()=>window.__sf?.mc?.noiseModel==='t1t2-pauli-twirled'&&window.__sf.mc.p===0.009&&window.__sf.mc.pSPAM===0.0025&&window.__sf.mc.t1Layers===40&&window.__sf.mc.t2Layers===80,null,{timeout:45000});
      await page.waitForFunction(()=>document.querySelector('#hMCProgress')?.textContent==='200 / 200',null,{timeout:45000});
      assert.notEqual(await page.locator('#hCircuitResidualRow').evaluate(e=>getComputedStyle(e).display),'none',`${label}: residual counters are visible`);
      assert.match(await page.locator('#hCircuitResidual').textContent(),/\d+ \/ 200 逻辑 · \d+ \/ 200 syndrome/);
      assert.match(await page.locator('#hDec').textContent(),/联合\/安全单帧查表.*轴向边缘权重 MWPM/);
      await page.close();
      console.log(`${label} QEC T1/T2 controls, model switch, runMc configuration and residual HUD PASS`);
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
  assert.deepEqual(errors,[],`browser console/page errors:\n${errors.join('\n')}`);
}finally{await browser.close();}
