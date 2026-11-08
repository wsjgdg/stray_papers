'use strict';
// The preview root must open the chosen workbench rather than a directory listing.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const directory=path.resolve(__dirname,'..'),python=process.env.PYTHON||'python3';

async function start(t,...extra){
  const child=spawn(python,['serve.py','--bind','127.0.0.1','--port','0',...extra],{cwd:directory});
  t.after(()=>child.kill());
  const port=await new Promise((resolve,reject)=>{
    let output='',errors='';const timer=setTimeout(()=>reject(new Error('server did not start: '+errors)),10000);
    child.stderr.on('data',data=>{errors+=data;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited ${code}: ${errors}`));});
    child.stdout.on('data',data=>{output+=data;const match=output.match(/http:\/\/127\.0\.0\.1:(\d+)\//);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
  });
  return `http://127.0.0.1:${port}`;
}

test('default entry remains the spatial pendulum and sends no-cache headers',async t=>{
  const base=await start(t),response=await fetch(base+'/',{redirect:'manual'}),html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.doesNotMatch(html,/Directory listing for/);assert.match(html,/空间摆/);
  assert.equal((await fetch(base+'/lightning.html')).status,200);
});

test('custom preview entry redirects GET and HEAD to a working relativity page',async t=>{
  const base=await start(t,'--entry','relativity.html');
  for(const method of ['GET','HEAD']){
    const response=await fetch(base+'/?preview=1',{method,redirect:'manual'});
    assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/relativity.html');
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
  const response=await fetch(base+'/'),html=await response.text();
  assert.equal(response.status,200);assert.equal(new URL(response.url).pathname,'/relativity.html');
  assert.match(html,/光抵达的世界/);assert.doesNotMatch(html,/Directory listing for/);
  for(const file of ['relativity.js','relativity-renderer.js','relativity-worlds.js','assets/relativity-textures.js','index.html','lightning.html'])
    assert.equal((await fetch(base+'/'+file)).status,200,file);
});

test('overview can be the preview entry without replacing the spatial pendulum URL',async t=>{
  const base=await start(t,'--entry','overview.html');
  for(const method of ['GET','HEAD']){
    const redirect=await fetch(base+'/',{method,redirect:'manual'});
    assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/overview.html');
  }
  const overview=await fetch(base+'/'),html=await overview.text();
  assert.equal(new URL(overview.url).pathname,'/overview.html');assert.match(html,/一张图，看见联系/);
  const pendulum=await fetch(base+'/index.html');assert.equal(pendulum.status,200);assert.match(await pendulum.text(),/空间摆实验室/);
});

test('entry cannot escape the experiment directory or name a missing file',()=>{
  for(const entry of ['../README.md','../README.html','missing.html','/etc/passwd']){
    const result=spawnSync(python,['serve.py','--entry',entry],{cwd:directory,encoding:'utf8',timeout:5000});
    assert.equal(result.status,2,entry);assert.match(result.stderr,/--entry must be an existing HTML file inside chaos-atlas/);
  }
});
