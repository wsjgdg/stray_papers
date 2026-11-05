/* Reproject already-traced rays while a pinhole camera rotates in place.
 * This is only a temporary view preview: it cannot invent rays outside the
 * source frame, change an observation event, or replace a new physical render. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RelativityCamera=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function basis(camera){
    const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
    return {forward:[sy*cp,sp,cy*cp],right:[cy,0,-sy],up:[-sy*sp,cp,-cy*sp]};
  }
  function tangent(camera,width,height){return Math.tan(camera.fov*Math.PI/360)*Math.max(1,.95*height/width);}
  function overscan(fov){return Math.min(150,2*Math.atan(2*Math.tan(fov*Math.PI/360))*180/Math.PI);}
  function sideState(state,side){
    const photoSide=state.scenario==='observer'?1:0;
    return {...state,view:state.view==='split'?(side===photoSide?'photo':'geometry'):state.view,
      shadowTiming:state.shadowTiming==='split'?(side===0?'retarded':'instant'):state.shadowTiming,
      doppler:state.spectrumSplit?side===1:state.doppler,spectrumSplit:false};
  }
  function cacheBudget(state,split){
    const soft=state.shadows!==false&&state.softShadows===true,base=split?20000:36000;
    return Math.max(1200,Math.round(base*(soft?.55:1)*(state.shutter>0?.35:1)));
  }
  // CSS matrix3d maps a source pixel (x,y) to the target camera's screen.
  // Both images must describe the same observer position and physical event.
  function matrix(source,target,width,height){
    if(!(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0))throw new RangeError('Camera viewport must be positive');
    for(const c of [source,target])if(!c||![c.yaw,c.pitch,c.fov].every(Number.isFinite)||!(c.fov>0&&c.fov<180))throw new RangeError('Invalid camera');
    const hasPixels=Number.isFinite(source.pixelWidth)&&source.pixelWidth>0&&Number.isFinite(source.pixelHeight)&&source.pixelHeight>0;
    const sw=hasPixels?source.pixelWidth:width,sh=hasPixels?source.pixelHeight:height;
    const s=basis(source),t=basis(target),ts=tangent(source,sw,sh),tt=tangent(target,width,height),aspect=sw/sh;
    // Each ray buffer is stretched to the viewport before the CSS transform.
    const dx=s.right.map(v=>v*(2*aspect*ts/width)),dy=s.up.map(v=>-v*(2*ts/height));
    const origin=s.forward.map((v,i)=>v-s.right[i]*aspect*ts+s.up[i]*ts),h=height/(2*tt);
    function coefficients(axis,centre,scale){return [dx,dy,origin].map(v=>centre*dot(v,t.forward)+scale*dot(v,axis));}
    const x=coefficients(t.right,width/2,h),y=coefficients(t.up,height/2,-h),w=[dx,dy,origin].map(v=>dot(v,t.forward));
    return [x[0],y[0],0,w[0], x[1],y[1],0,w[1], 0,0,1,0, x[2],y[2],0,w[2]];
  }
  function map(m,x,y){const w=m[3]*x+m[7]*y+m[15];return {x:(m[0]*x+m[4]*y+m[12])/w,y:(m[1]*x+m[5]*y+m[13])/w,w};}
  function css(m){return 'matrix3d('+m.map(v=>Number(v.toPrecision(13))).join(',')+')';}
  // Detail is the last full still. The wider physical cache and newly traced
  // frames fill its margins; comparison halves never borrow the other model.
  function createPreview(stage,container,contour){
    function part(){
      const host=document.createElement('div'),image=document.createElement('canvas');
      host.className='camera-preview-half';image.className='camera-preview-image';host.append(image);return {host,image,context:image.getContext('2d')};
    }
    function layer(name){const host=document.createElement('div'),left=part(),right=part();host.className='camera-preview-layer camera-preview-'+name;host.hidden=true;host.append(left.host,right.host);container.append(host);return {host,left,right,pose:null,time:null,epoch:null,fullSides:false};}
    const base=layer('base'),cache=layer('cache'),detail=layer('detail'),layers=[base,cache,detail];let active=false,viewport=null,latestPose=null,updates=0,split=false,fraction=.5;
    function configure(){
      const left=split?'inset(0 '+((1-fraction)*100)+'% 0 0)':'none',right='inset(0 0 0 '+(fraction*100)+'%)';
      for(const l of layers){
        l.left.host.style.clipPath=left;l.left.image.style.clipPath=l.fullSides?'none':left;
        l.right.host.style.clipPath=right;l.right.image.style.clipPath=l.fullSides?'none':right;l.right.host.style.display=split?'':'none';
      }
      detail.host.classList.toggle('has-underlay',!!base.pose||(!cache.host.hidden&&!!cache.pose));
    }
    function copy(part,source){
      const width=source.width,height=source.height;if(!(width>0&&height>0))throw new Error('No complete camera source');
      part.image.width=width;part.image.height=height;
      if(source.data&&typeof source.data.length==='number')part.context.putImageData(source,0,0);
      else part.context.drawImage(source,0,0);
    }
    function capture(l,images,info,fullSides=false){
      const pair=Array.isArray(images)?images:[images];copy(l.left,pair[0]);
      if(split){if(fullSides){if(!pair[1])throw new Error('Missing comparison camera source');copy(l.right,pair[1]);}else copy(l.right,l.left.image);}
      l.pose={yaw:info.yaw,pitch:info.pitch,fov:info.fov,pixelWidth:pair[0].width,pixelHeight:pair[0].height};l.time=info.time;l.epoch=info.contentEpoch;l.fullSides=fullSides;l.host.hidden=false;
    }
    function clearLayer(l){l.pose=null;l.time=null;l.epoch=null;l.fullSides=false;l.host.hidden=true;for(const p of [l.left,l.right]){p.image.width=1;p.image.height=1;p.image.style.transform='';}}
    function update(target){
      if(!active)return;
      for(const l of layers)if(l.pose&&!l.host.hidden){const transform=css(matrix(l.pose,target,viewport.width,viewport.height));l.left.image.style.transform=transform;if(split)l.right.image.style.transform=transform;}
      // The outline is drawn at the CSS viewport aspect, not buffer aspect.
      if(latestPose)contour.style.transform=css(matrix({yaw:latestPose.yaw,pitch:latestPose.pitch,fov:latestPose.fov},target,viewport.width,viewport.height));
      stage.dataset.previewUpdates=String(++updates);stage.dataset.previewYaw=String(target.yaw);stage.dataset.previewPitch=String(target.pitch);
    }
    function end(){active=false;container.hidden=true;stage.dataset.cameraPreview='false';contour.style.transform='';clearLayer(base);clearLayer(detail);cache.host.hidden=true;viewport=null;latestPose=null;}
    function accept(images,info,target,fullSides){
      if(!active)return false;
      try{
        // Playback must not combine imagery from different observation times.
        if(detail.pose&&Math.abs(detail.time-info.time)>1e-7)clearLayer(detail);
        if(cache.pose&&Math.abs(cache.time-info.time)>1e-7)cache.host.hidden=true;
        capture(base,images,info,fullSides);latestPose=base.pose;stage.dataset.previewSourceTime=String(info.time);configure();update(target);return true;
      }catch(_){end();return false;}
    }
    return {
      get active(){return active;},
      begin(scene,info,target){
        if(active)return true;
        try{
          viewport=stage.getBoundingClientRect();if(!(viewport.width>0&&viewport.height>0))return false;
          split=target.view==='split'||target.shadowTiming==='split'||target.spectrumSplit;fraction=Math.max(0,Math.min(1,target.split));
          capture(detail,scene,info);cache.host.hidden=!(cache.pose&&cache.epoch===info.contentEpoch&&Math.abs(cache.time-info.time)<1e-7);
          configure();latestPose=detail.pose;active=true;container.hidden=false;stage.dataset.cameraPreview='true';stage.dataset.previewSourceTime=String(info.time);update(target);return true;
        }catch(_){end();return false;}
      },
      remember(images,info,target,fullSides=false){
        const previousSplit=split;
        try{
          // A cache is only a source of already-traced rays from this revision.
          split=target.view==='split'||target.shadowTiming==='split'||target.spectrumSplit;capture(cache,images,info,fullSides);cache.host.hidden=true;
          stage.dataset.cameraCache='true';stage.dataset.cameraCacheEpoch=String(info.contentEpoch);
        }catch(_){clearLayer(cache);stage.dataset.cameraCache='false';}
        finally{split=previousSplit;}
      },
      update,
      accept(scene,info,target){return accept(scene,info,target,false);},
      acceptPair(images,info,target){return accept(images,info,target,true);},
      end,
      invalidate(){end();clearLayer(cache);stage.dataset.cameraCache='false';}
    };
  }
  return Object.freeze({matrix,map,css,overscan,sideState,cacheBudget,createPreview});
});
