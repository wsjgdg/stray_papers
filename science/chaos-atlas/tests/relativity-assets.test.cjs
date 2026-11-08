'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assets=path.resolve(__dirname,'../assets');
test('the individual HTTP JPEGs match the embedded origin-clean file:// textures',()=>{
  const window={};vm.runInNewContext(fs.readFileSync(path.join(assets,'relativity-textures.js'),'utf8'),{window});
  assert.deepEqual(Object.keys(window.RelativityTextures),['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal']);
  for(const [name,url] of Object.entries(window.RelativityTextures)){
    assert.match(url,/^data:image\/jpeg;base64,/);
    assert.deepEqual(fs.readFileSync(path.join(assets,'relativity',name+'.jpg')),Buffer.from(url.slice(url.indexOf(',')+1),'base64'),name);
  }
});

test('page, worker, imported models and both texture paths share one cache version',()=>{
  const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
  const html=read('relativity.html');
  const refs=[...html.matchAll(/(?:src|href)="(relativity[^"?]+)\?v=([^"&]+)"/g)];
  const version=refs.find(([,name])=>name==='relativity.js')?.[2];
  assert.ok(version,'entry script must be versioned');
  for(const [,name,value] of refs){assert.equal(value,version,name);assert.ok(fs.existsSync(path.join(root,name)),name);}
  for(const name of ['relativity.css','relativity-assets.js','relativity-model.js','relativity-worlds.js',
    'relativity-foliage-mask.js','relativity-geometry-pack.js','relativity-spectrum-data.js','relativity-spectrum.js','relativity-surface.js','relativity-material-spectrum.js','relativity-probe-spectrum.js','relativity-mirror.js','relativity-mirror-ui.js','relativity-light-clock.js','relativity-light-clock-ui.js','relativity-optics.js','relativity-light-path.js','relativity-camera.js','relativity-renderer.js','relativity-observables.js','relativity-ray-space.js','relativity-spacetime-slice.js','relativity-spacetime.js','relativity-overlays.js','relativity-experiments.js','relativity-comparison.js','relativity-comparison-ui.js'])
    assert.ok(refs.some(([,file])=>file===name),name);
  const workerRefs=[...read('relativity-render-worker.js').matchAll(/'(relativity-[a-z-]+\.js)\?v=([^']+)'/g)];
  for(const [,name,value] of workerRefs){assert.equal(value,version,name);assert.ok(fs.existsSync(path.join(root,name)),name);}
  assert.ok(workerRefs.some(([,name])=>name==='relativity-scheduler.js'),'scheduler imported by worker');
  assert.ok(workerRefs.some(([,name])=>name==='relativity-material-spectrum.js'),'material spectrum imported by worker');
  assert.ok(workerRefs.some(([,name])=>name==='relativity-surface.js'),'surface response imported by worker');
  assert.ok(read('relativity-render-worker.js').includes(`relativity-render-lane.js?v=${version}`),'optional helper URL');
  const laneRefs=[...read('relativity-render-lane.js').matchAll(/'(relativity-[a-z-]+\.js)\?v=([^']+)'/g)];
  assert.ok(laneRefs.some(([,name])=>name==='relativity-material-spectrum.js'),'material spectrum imported by helper');
  assert.ok(laneRefs.some(([,name])=>name==='relativity-surface.js'),'surface response imported by helper');
  assert.ok(laneRefs.some(([,name])=>name==='relativity-renderer.js'),'renderer imported by helper');
  for(const [,name,value] of laneRefs){assert.equal(value,version,name);assert.ok(fs.existsSync(path.join(root,name)),name);}
  assert.ok(read('relativity-renderer.js').includes(`relativity-render-worker.js?v=${version}`),'worker URL');
  assert.ok(read('relativity-comparison-ui.js').includes(`relativity-comparison-worker.js?v=${version}`),'comparison worker URL');
  assert.ok(read('relativity-comparison.js').includes(`implementationVersion:'${version}'`),'reproduction metadata version');
  const comparisonRefs=[...read('relativity-comparison-worker.js').matchAll(/'(relativity-[a-z-]+\.js)\?v=([^']+)'/g)];
  assert.ok(comparisonRefs.some(([,name])=>name==='relativity-renderer.js'),'comparison renderer imported');
  assert.ok(comparisonRefs.some(([,name])=>name==='relativity-surface.js'),'comparison surface response imported');
  for(const [,name,value] of comparisonRefs){assert.equal(value,version,name);assert.ok(fs.existsSync(path.join(root,name)),name);}
  const textureVersions=[...read('relativity-assets.js').matchAll(/\?v=(\d{8}-\d+)/g)];
  assert.equal(textureVersions.length,2,'HTTP JPEG and file:// bundle URLs');
  for(const [,value] of textureVersions)assert.equal(value,version);
});
