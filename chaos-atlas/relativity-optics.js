/* Direct-light shadow rays in the same flat-spacetime light-cone model. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-worlds.js'),require('./relativity-surface.js'));
  else root.RelativityOptics=factory(root.RelativityModel,root.RelativityWorlds,root.RelativitySurface);
})(typeof globalThis==='object'?globalThis:this,function(M,W,Surface){
  'use strict';
  const HALF=1.22,EPS=.003,DEFAULT_SUN_RADIUS=4.58;
  const SHADOW_SAMPLES=Object.freeze([4,8,16]);
  const sun=M.normalize([-.45,.83,-.55]);
  function lightDirection(state={}){
    const yaw=(state.lightYaw||0)*Math.PI/180,elevation=(state.lightElevation||0)*Math.PI/180;
    if(!yaw&&!elevation)return sun;
    const a=Math.atan2(sun[0],sun[2])+yaw,b=Math.max(5*Math.PI/180,Math.min(85*Math.PI/180,Math.asin(sun[1])+elevation));
    return [Math.sin(a)*Math.cos(b),Math.sin(b),Math.cos(a)*Math.cos(b)];
  }
  function lightPosition(environment,state={}){
    const base=environment==='station'?[0,5.17,5.4]:environment==='harbor'?[0,7.38,10.8]:[0,4.28,4.2];
    return [base[0]+(state.lightX||0),base[1],base[2]+(state.lightZ||0)];
  }
  function keyLight(environment,point,state={}){
    if(environment==='station'||environment==='corridor'||environment==='harbor'){
      // An independently adjustable, stationary laboratory point source.
      const position=lightPosition(environment,state);
      const to=M.sub(position,point),distance=M.length(to);
      if(distance<=EPS)return {direction:[0,1,0],distance:0,kind:'point',position};
      return {direction:M.scale(to,1/distance),distance,kind:'point',position};
    }
    // A directional, effectively infinite-distance source in the lab frame.
    return {direction:lightDirection(state),distance:1e20,kind:'directional'};
  }
  function shadowSampleCount(state={}){return SHADOW_SAMPLES.includes(state.shadowSamples)?state.shadowSamples:4;}
  // Equal-weight stratified quadrature. Rectangular lamp samples lie inside
  // the exact, adjustable fixture footprint. The outdoor samples cover equal
  // solid-angle sectors of a uniform circular source (no limb darkening).
  // At 4.58° the four-point pattern approximately preserves the old widened
  // demonstration; the actual Sun is about 0.27° in angular *radius*.
  function areaLights(environment,point,state={},preparedBase=null){
    const base=preparedBase||keyLight(environment,point,state),count=shadowSampleCount(state);
    if(base.kind==='point'){
      const half=W.lightHalf(environment,state),columns=count===4?2:4,rows=count/columns;
      return Array.from({length:count},(_,i)=>{
        const x=(2*((i%columns)+.5)/columns-1)*half[0],z=(2*(Math.floor(i/columns)+.5)/rows-1)*half[1];
        const position=M.add(base.position,[x,0,z]),delta=M.sub(position,point),distance=M.length(delta);
        return {position,direction:distance>EPS?M.scale(delta,1/distance):[0,1,0],distance,kind:'area'};
      });
    }
    const direction=base.direction,a=M.normalize(M.cross([0,1,0],direction)),b=M.normalize(M.cross(direction,a));
    const columns=count===16?8:4,rows=count/columns,angle=(state.sunAngularRadius??DEFAULT_SUN_RADIUS)*Math.PI/180;
    return Array.from({length:count},(_,i)=>{
      const s=Math.sin(angle/2)*Math.sqrt((Math.floor(i/columns)+.5)/rows),cosine=1-2*s*s,sine=2*s*Math.sqrt(Math.max(0,1-s*s));
      let x,y;
      if(count===4){x=(i===0||i===2?-1:1)*Math.SQRT1_2;y=(i<2?-1:1)*Math.SQRT1_2;}
      else{const phi=2*Math.PI*((i%columns)+.5)/columns;x=Math.cos(phi);y=Math.sin(phi);}
      return {direction:M.add(M.scale(direction,cosine),M.add(M.scale(a,sine*x),M.scale(b,sine*y))),distance:1e20,kind:'extended-directional'};
    });
  }
  // Frequency factors for an elastic, grey reflecting surface. Both incoming
  // and outgoing photon directions are lab directions FROM the receiver
  // towards the corresponding source. The incoming illumination is lab-fixed.
  // Only the central light ray determines its spectral shift in soft mode.
  function frequencyFactors(state,ray){
    if(state.scenario==='flyby'&&!ray.photo)return null;
    const body=!!(ray.hit&&(ray.hit.body||ray.hit.kind==='cube'||ray.hit.kind==='sphere'));
    const source=state.scenario==='flyby'&&body?(ray.hit?.velocity||ray.velocity):[0,0,0];
    const observer=state.scenario==='observer'&&ray.photo?(ray.observerVelocity||M.motionVelocity('observer',state.beta,state.motionAngle||0,state.motionElevation||0)):[0,0,0];
    // Across a stationary mirror the source-to-mirror and mirror-to-observer
    // directions differ. Only the moving observer factor uses the latter.
    const outgoing=M.dopplerFactor(state.scenario==='observer'?(ray.observerLabDirection||ray.labDirection):ray.labDirection,source,observer);
    const reflected=state.surfaceMode==='reflection'&&state.scenario==='flyby'&&body;
    const light=reflected?keyLight(state.environment||'station',ray.hit.point,state):null;
    const incident=reflected?M.dopplerFactor(light.direction,[0,0,0],source):1;
    return {incident,outgoing,total:incident*outgoing,reflected,lightDirection:light?light.direction:null};
  }
  function frequencyRatio(state,ray){const factors=frequencyFactors(state,ray);return factors?factors.total:null;}
  function illumination(state,ray,lightOverride=null,cacheSlot=-1){
    const hit=ray.hit;
    if(!hit)return {status:'sky',shadowed:false};
    if(hit.kind==='light'||hit.kind==='key-light')return {status:'emissive',shadowed:false};
    const light=lightOverride||keyLight(state.environment||'station',hit.point,state),cosine=M.dot(hit.normal,light.direction);
    if(light.distance<=EPS||cosine<=0)return {status:'unlit',shadowed:false,light,cosine};
    // A geometry slice is at t_obs; a photographic surface is reached at
    // t_obs - primary distance. Shadow rays run further into the past.
    const surfaceTime=state.scenario==='flyby'&&!ray.photo?state.time:state.time-hit.distance;
    const start=M.add(hit.point,M.scale(light.direction,EPS)),startTime=surfaceTime-EPS;
    // Comparison mode freezes the blocker at the surface event. This is a
    // deliberate non-propagating reference, not a physical photon path.
    const instant=ray.shadowInstant===undefined?state.shadowTiming==='instant':ray.shadowInstant;
    const bodyTime=instant?surfaceTime:startTime,bodyCenter=M.sub(ray.center,M.scale(ray.velocity,state.time-bodyTime));
    // Only cache the *static* blocker for this stationary surface and light.
    // Both moving worldlines below are still evaluated at every retarded event.
    const slot=lightOverride?cacheSlot:0,shadows=slot>=0?ray.staticEntry?.shadows:null;
    let env=shadows?shadows[slot]:undefined;
    if(env===undefined){env=W.traceWithFixture(start,light.direction,state.environment,state.scenario==='observer',state);if(shadows){shadows[slot]=env||null;ray.staticCache.recordShadow(false);}}
    else ray.staticCache.recordShadow(true);
    const bodyShape=state.shape==='artifact'?'cube':state.shape,kernels=ray.kernels;
    const bodyArgs=kernels?null:{origin:start,direction:light.direction,center:bodyCenter,beta:ray.velocity,shape:bodyShape,halfSize:M.objectHalf(state.environment,state.shape),radius:HALF,bevel:M.objectBevel(state.environment,state.shape),lightCone:!instant,time:bodyTime,details:M.objectParts(state.environment||'station',state.shape)};
    let body=kernels?kernels.a.hit(start,light.direction,bodyCenter,!instant,bodyTime):M.movingObjectHit(bodyArgs),bodyId='A';
    if(ray.second){
      const center=M.sub(ray.second.center,M.scale(ray.second.velocity,state.time-bodyTime));
      const other=kernels?kernels.b.hit(start,light.direction,center,!instant,bodyTime):M.movingObjectHit({...bodyArgs,center,beta:ray.second.velocity});
      if(other&&(!body||other.distance<body.distance)){body=other;bodyId='B';}
    }
    const limit=light.distance-EPS,chosen=body&&(!env||body.distance<env.distance)?{...body,kind:body.part||bodyShape,body:true,bodyId}:env;
    const blocked=!!chosen&&chosen.distance<limit;
    return {status:blocked?'shadow':'lit',shadowed:blocked,blocker:blocked?chosen.kind:null,blockerBody:blocked?chosen.bodyId||null:null,blockingDistance:blocked?chosen.distance+EPS:null,
      blockingTime:blocked?(instant?surfaceTime:startTime-chosen.distance):null,surfaceTime,light,cosine,timing:instant?'instant':'retarded'};
  }
  function softIllumination(state,ray){
    if(!ray.hit||ray.hit.kind==='light'||ray.hit.kind==='key-light')return illumination(state,ray);
    const samples=areaLights(state.environment||'station',ray.hit.point,state).map((light,index)=>illumination(state,ray,light,index+1));
    const blocked=samples.filter(x=>x.status==='shadow'),lit=samples.filter(x=>x.status==='lit');
    const direct=samples.reduce((sum,x)=>sum+Math.max(0,x.cosine||0),0)/samples.length;
    const visible=samples.reduce((sum,x)=>sum+(x.status==='lit'?Math.max(0,x.cosine||0):0),0)/samples.length;
    const weightedDirect=samples.reduce((sum,x)=>sum+Math.max(0,x.cosine||0)*Surface.attenuation(x.light),0)/samples.length;
    const weightedVisible=samples.reduce((sum,x)=>sum+(x.status==='lit'?Math.max(0,x.cosine||0)*Surface.attenuation(x.light):0),0)/samples.length;
    const first=blocked[0],status=blocked.length?(lit.length?'partial':'shadow'):(lit.length?'lit':'unlit');
    return {status,shadowed:blocked.length>0,blocked:blocked.length,sampleCount:samples.length,direct,visible,weightedDirect,weightedVisible,samples,
      blocker:first?.blocker||null,blockerBody:first?.blockerBody||null,blockingTime:first?.blockingTime??null,blockingDistance:first?.blockingDistance??null,
      surfaceTime:samples[0].surfaceTime,cosine:direct};
  }
  // A rendering-only visibility query. It is equivalent to illumination's
  // shadowed flag but may stop at the first blocker; diagnostics still call
  // illumination and retain the nearest blocker and exact retarded event.
  function shadingIllumination(state,ray,preparedLight=null){
    if(!ray.hit||ray.hit.kind==='light'||ray.hit.kind==='key-light')return illumination(state,ray);
    function sample(light,slot){
      const cosine=M.dot(ray.hit.normal,light.direction);
      if(light.distance<=EPS||cosine<=0)return {status:'unlit',shadowed:false,light,cosine};
      const surfaceTime=state.scenario==='flyby'&&!ray.photo?state.time:state.time-ray.hit.distance;
      const start=M.add(ray.hit.point,M.scale(light.direction,EPS)),startTime=surfaceTime-EPS;
      const instant=ray.shadowInstant===undefined?state.shadowTiming==='instant':ray.shadowInstant,bodyTime=instant?surfaceTime:startTime,limit=light.distance-EPS;
      const entry=ray.staticEntry,slots=entry?.occlusion||(entry?(entry.occlusion=[]):null);let blocked=slots?slots[slot]:undefined;
      if(blocked===undefined){blocked=W.occluded(start,light.direction,state.environment,state.scenario==='observer',state,limit);if(slots){slots[slot]=blocked;ray.staticCache.recordShadow(false);}}
      else ray.staticCache.recordShadow(true);
      if(!blocked){
        const center=M.sub(ray.center,M.scale(ray.velocity,state.time-bodyTime)),a=ray.kernels.a.hit(start,light.direction,center,!instant,bodyTime);
        blocked=!!a&&a.distance<limit;
        if(!blocked&&ray.second){const otherCenter=M.sub(ray.second.center,M.scale(ray.second.velocity,state.time-bodyTime)),b=ray.kernels.b.hit(start,light.direction,otherCenter,!instant,bodyTime);blocked=!!b&&b.distance<limit;}
      }
      return {status:blocked?'shadow':'lit',shadowed:blocked,light,cosine};
    }
    // The renderer already computed this exact centre light for diffuse and
    // specular shading. Reusing it avoids a second point-to-light length and
    // allocation per pixel without changing any visibility ray or event.
    if(!state.softShadows)return sample(preparedLight||keyLight(state.environment||'station',ray.hit.point,state),0);
    const samples=areaLights(state.environment||'station',ray.hit.point,state,preparedLight).map((light,index)=>sample(light,index+1));
    const blocked=samples.filter(x=>x.shadowed),lit=samples.filter(x=>x.status==='lit');
    const direct=samples.reduce((sum,x)=>sum+Math.max(0,x.cosine||0),0)/samples.length;
    const visible=samples.reduce((sum,x)=>sum+(x.status==='lit'?Math.max(0,x.cosine||0):0),0)/samples.length;
    const weightedDirect=samples.reduce((sum,x)=>sum+Math.max(0,x.cosine||0)*Surface.attenuation(x.light),0)/samples.length;
    const weightedVisible=samples.reduce((sum,x)=>sum+(x.status==='lit'?Math.max(0,x.cosine||0)*Surface.attenuation(x.light):0),0)/samples.length;
    return {status:blocked.length?(lit.length?'partial':'shadow'):(lit.length?'lit':'unlit'),shadowed:blocked.length>0,sampleCount:samples.length,direct,visible,weightedDirect,weightedVisible};
  }
  function shadowFactor(info,environment){
    if(info.sampleCount){const ambient=environment==='station'||environment==='corridor'?.48:.38;return (ambient+.62*(info.weightedVisible??info.visible))/(ambient+.62*(info.weightedDirect??info.direct));}
    if(!info.shadowed)return 1;
    const ambient=environment==='station'||environment==='corridor'?.48:.38;
    const direct=.62*Math.max(0,info.cosine)*Surface.attenuation(info.light);
    return ambient/(ambient+direct);
  }
  return Object.freeze({HALF,EPS,DEFAULT_SUN_RADIUS,SHADOW_SAMPLES,sun,lightDirection,lightPosition,keyLight,shadowSampleCount,areaLights,frequencyFactors,frequencyRatio,illumination,softIllumination,shadingIllumination,shadowFactor});
});
