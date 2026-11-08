/* Central direct-light path for one sampled photographic surface event.
 * c=1. The diagnostic always uses retarded shadow rays, independently of
 * whether the visual shadow switch or the frozen comparison is selected. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-optics.js'));
  else root.RelativityLightPath=factory(root.RelativityModel,root.RelativityOptics);
})(typeof globalThis==='object'?globalThis:this,function(M,O){
  'use strict';
  function build(state,ray){
    if(!ray?.hit)return {status:'sky',reason:'无限远天空没有有限表面事件'};
    if(state.scenario==='flyby'&&!ray.photo)return {status:'slice',reason:'同时几何不是光锥照片'};
    const surface=ray.hit.point.slice(),surfaceTime=state.time-ray.hit.distance,observation=ray.camera.slice();
    const base={surface,surfaceTime,observation,observationTime:state.time,outgoingDistance:ray.hit.distance,sourceKind:ray.hit.kind};
    if(ray.hit.kind==='light'||ray.hit.kind==='key-light')return {...base,status:'emissive',reason:'直接看到灯面，不假定一次反射'};
    const physical={...state,shadowTiming:'retarded'},sample={...ray,shadowInstant:false},info=O.illumination(physical,sample),light=info.light||O.keyLight(state.environment||'station',surface,physical);
    if(info.status==='unlit')return {...base,status:'unlit',lightKind:light.kind,reason:'背向主光或距离过近，无直接入射'};
    if(info.status==='shadow'){
      // This is a backwards visibility diagnostic, NOT a photon that reached
      // the surface. Do not draw an unverified source-to-blocker segment.
      const point=M.add(surface,M.scale(light.direction,info.blockingDistance));
      return {...base,status:'blocked',lightKind:light.kind,blocker:info.blocker,blockerBody:info.blockerBody,blockerPoint:point,blockerTime:info.blockingTime,blockingDistance:info.blockingDistance,source:light.position?light.position.slice():null};
    }
    if(light.kind==='point')return {...base,status:'lit',lightKind:'point',source:light.position.slice(),sourceTime:surfaceTime-light.distance,incomingDistance:light.distance};
    // A finite drawn segment is only a direction cue for an infinite source.
    return {...base,status:'lit',lightKind:'directional',source:null,sourceTime:null,direction:light.direction.slice(),displayStart:M.add(surface,M.scale(light.direction,8))};
  }
  return Object.freeze({build});
});
