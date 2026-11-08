/* A single optional helper lane for a Canvas interaction frame. It renders
 * only complete horizontal rows of the same full-resolution ray grid. A lane
 * is never responsible for the displayed image or for changing the event. */
'use strict';
self.window=self;
let loadError=null;
try{
  importScripts('relativity-model.js?v=20261105-10','relativity-foliage-mask.js?v=20261105-10',
    'relativity-worlds.js?v=20261105-10','relativity-geometry-pack.js?v=20261105-10',
    'relativity-spectrum-data.js?v=20261105-10','relativity-spectrum.js?v=20261105-10','relativity-surface.js?v=20261105-10','relativity-measured-data.js?v=20261105-10','relativity-material-spectrum.js?v=20261105-10',
    'relativity-optics.js?v=20261105-10','relativity-scheduler.js?v=20261105-10','relativity-camera.js?v=20261105-10','relativity-renderer.js?v=20261105-10');
}catch(error){loadError=String(error&&error.message||error);}
let renderer=null,active=null,timer=0,generation=0,remaining=9,broken=false;
let burst=0;
const channel=typeof MessageChannel==='function'?new MessageChannel():null;
if(channel)channel.port1.onmessage=event=>{if(event.data===generation)run();};
function enqueue(){if(channel&&++burst%4!==0)channel.port2.postMessage(generation);else timer=setTimeout(run,0);}
function cancel(){generation++;if(timer)clearTimeout(timer);timer=0;active=null;}
function fail(error){cancel();if(broken)return;broken=true;postMessage({type:'error',message:String(error&&error.message||error)});}
function run(){
  timer=0;if(!active||broken)return;
  try{
    const task=active,t=performance.now(),done=task.job.step(4),elapsed=performance.now()-t;
    task.computeMs+=elapsed;task.slices++;task.maxSliceMs=Math.max(task.maxSliceMs,elapsed);
    if(done){
      active=null;const data=task.job.result().data;
      postMessage({type:'done',token:task.token,width:task.job.width,height:task.job.height,
        regionStart:task.job.regionStart,regionHeight:task.job.regionHeight,
        computeMs:task.computeMs,slices:task.slices,maxSliceMs:task.maxSliceMs,data:data.buffer},[data.buffer]);
    }else enqueue();
  }catch(error){fail(error);}
}
onmessage=event=>{
  const msg=event.data||{};if(broken)return;
  if(msg.type==='init'){
    if(loadError){fail(loadError);return;}
    try{
      self.RelativityTextures=msg.textures;
      const canvas=new OffscreenCanvas(1,1);canvas.dataset={};
      renderer=RelativityRenderer.createOffscreenCanvas(canvas,(name,status)=>{
        if(status==='error'){fail('Cannot decode scene texture: '+name);return;}
        if(--remaining===0&&!broken)postMessage({type:'ready'});
      });
      self.RelativityTextures=null;
    }catch(error){fail(error);}
  }else if(msg.type==='cancel')cancel();
  else if(msg.type==='render'&&renderer){
    cancel();
    try{
      const job=renderer.beginRender(msg.state,msg.viewport,{region:msg.region});
      active={token:msg.token,job,computeMs:0,slices:0,maxSliceMs:0};run();
    }catch(error){fail(error);}
  }
};
