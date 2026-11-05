/* Dedicated, cancellable Canvas worker for the two complete comparison frames.
 * Never substitutes camera reprojections for the independent physical rays. */
'use strict';
self.window=self;
let renderer=null,canvas=null,remaining=0,active=null,timer=0,failed=false;
try{importScripts('relativity-model.js?v=20261105-10','relativity-foliage-mask.js?v=20261105-10','relativity-worlds.js?v=20261105-10','relativity-geometry-pack.js?v=20261105-10','relativity-spectrum-data.js?v=20261105-10','relativity-spectrum.js?v=20261105-10','relativity-surface.js?v=20261105-10','relativity-measured-data.js?v=20261105-10','relativity-material-spectrum.js?v=20261105-10','relativity-optics.js?v=20261105-10','relativity-renderer.js?v=20261105-10');}catch(e){failed=true;postMessage({type:'error',message:String(e)});}
function cancel(){if(timer)clearTimeout(timer);timer=0;active=null;}
function run(){
  timer=0;if(!active||failed)return;
  try{
    const task=active,done=task.job.step(5);
    if(done){task.job.commit();const image=canvas.transferToImageBitmap();postMessage({type:'frame',id:task.id,index:task.index,width:canvas.width,height:canvas.height,image},[image]);task.index++;
      if(task.index===2){active=null;postMessage({type:'done',id:task.id});return;}
      task.job=renderer.beginRender(task.states[task.index],task.viewport);
    }else postMessage({type:'progress',id:task.id,index:task.index,progress:task.job.progress()});
    timer=setTimeout(run,8);
  }catch(e){failed=true;postMessage({type:'error',message:String(e&&e.message||e)});}
}
onmessage=e=>{
  const m=e.data||{};if(failed)return;
  if(m.type==='init'){
    try{
      self.RelativityTextures=m.textures;canvas=new OffscreenCanvas(1,1);canvas.dataset={};remaining=RelativityRenderer.assetNames.length;
      renderer=RelativityRenderer.createOffscreenCanvas(canvas,(name,status)=>{if(status==='error'){failed=true;postMessage({type:'error',message:'材质加载失败：'+name});return;}if(--remaining===0)postMessage({type:'ready'});});
    }catch(error){failed=true;postMessage({type:'error',message:String(error)});}
  }else if(m.type==='cancel')cancel();
  else if(m.type==='run'&&renderer){cancel();const viewport={width:m.width,height:m.height};active={id:m.id,states:m.states,index:0,viewport,job:renderer.beginRender(m.states[0],viewport)};run();}
};
