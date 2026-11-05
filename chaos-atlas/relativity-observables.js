/* Exact worldlines for a material point fixed in the object's rest frame.
 * Both its retarded photon event and the laboratory simultaneous section use
 * the same Lorentz-contracted offset. Scene visibility is tested separately. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-worlds.js'));
  else root.RelativityObservables=factory(root.RelativityModel,root.RelativityWorlds);
})(typeof globalThis==='object'?globalThis:this,function(M,W){
  'use strict';
  const {add,sub,scale,dot,length,normalize}=M;
  function contracted(offset,velocity){
    const b2=dot(velocity,velocity);M.gamma(velocity);if(b2<1e-24)return offset.slice();
    return add(offset,scale(velocity,(Math.sqrt(1-b2)-1)*dot(offset,velocity)/b2));
  }
  function atTime(event,restPoint,observationTime,time){
    return add(add(event.center,contracted(restPoint,event.velocity)),scale(event.velocity,time-observationTime));
  }
  // Solve |R-v*s|=s for s>=0. The stable rational form avoids cancellation
  // for a point moving away, and the fallback handles the coincident event.
  function retarded(event,restPoint,observationTime){
    const simultaneous=atTime(event,restPoint,observationTime,observationTime),R=sub(simultaneous,event.camera),r2=dot(R,R),b2=dot(event.velocity,event.velocity);
    M.gamma(event.velocity);if(!(r2>1e-24))return {time:observationTime,distance:0,point:simultaneous};
    const bv=dot(R,event.velocity),root=Math.sqrt(bv*bv+(1-b2)*r2),denominator=root+bv;
    const distance=denominator>1e-14?r2/denominator:(root-bv)/(1-b2);
    return {time:observationTime-distance,distance,point:add(simultaneous,scale(event.velocity,-distance))};
  }
  function onSurface(environment,shape,point,tolerance=1e-5){
    if(!Array.isArray(point)||point.length!==3||point.some(v=>!Number.isFinite(v)))return false;
    const half=M.objectHalf(environment,shape),r=M.objectBevel(environment,shape),a=point.map(Math.abs);
    if(shape==='sphere')return Math.abs(length(point)-1.22)<=tolerance;
    const planes=[a[0]-half[0],a[1]-half[1],a[2]-half[2]];
    if(r>0)planes.push(a[0]+a[1]-half[0]-half[1]+r,a[0]+a[2]-half[0]-half[2]+r,a[1]+a[2]-half[1]-half[2]+r);
    if(planes.every(q=>q<=tolerance)&&planes.some(q=>Math.abs(q)<=tolerance))return true;
    return M.objectParts(environment,shape).some(part=>{
      const q=sub(point,part.center),inside=q.every((x,i)=>Math.abs(x)<=part.half[i]+tolerance);if(!inside)return false;
      if(part.primitive==='cylinder'){
        const radial=[0,1,2].filter(i=>i!==part.axis),radius=Math.hypot(q[radial[0]],q[radial[1]]);
        return radius<=part.radius+tolerance&&(Math.abs(radius-part.radius)<=tolerance||Math.abs(Math.abs(q[part.axis])-part.half[part.axis])<=tolerance);
      }
      return q.some((x,i)=>Math.abs(Math.abs(x)-part.half[i])<=tolerance);
    });
  }
  function visibility(state,event,restPoint,target,lightCone){
    const displacement=sub(target,event.camera),distance=length(displacement);
    if(!(distance>1e-9))return {status:'coincident',distance};
    const direction=scale(displacement,1/distance),shape=state.shape==='artifact'?'cube':state.shape;
    const body=M.movingObjectHit({origin:event.camera,direction,center:event.center,beta:event.velocity,shape,halfSize:M.objectHalf(state.environment,state.shape),radius:1.22,bevel:M.objectBevel(state.environment,state.shape),lightCone,time:state.time,details:M.objectParts(state.environment,state.shape)});
    const second=event.second||M.secondaryMotion(state);
    const other=second?M.movingObjectHit({origin:event.camera,direction,center:second.center,beta:second.velocity,shape,halfSize:M.objectHalf(state.environment,state.shape),radius:1.22,bevel:M.objectBevel(state.environment,state.shape),lightCone,time:state.time,details:M.objectParts(state.environment,state.shape)}):null;
    const world=W.traceWithFixture(event.camera,direction,state.environment,state.scenario==='observer',state),eps=2e-5*Math.max(1,distance);
    if(other&&other.distance<distance-eps&&(!body||other.distance<body.distance-eps)&&(!world||other.distance<world.distance-eps))return {status:'world',distance,blocker:'moving-B'};
    if(world&&world.distance<distance-eps&&(!body||world.distance<body.distance-eps))return {status:'world',distance,blocker:world.kind};
    if(body&&body.distance<distance-eps)return {status:'self',distance,blocker:body.part||shape};
    if(!body||Math.abs(body.distance-distance)>eps||length(sub(body.restPoint,restPoint))>eps*4)return {status:'off-surface',distance};
    if(world&&world.distance<distance-eps)return {status:'world',distance,blocker:world.kind};
    return {status:'visible',distance};
  }
  // Convert a lab source direction to the requested view at the same event.
  // The observer scenario's 'photo' side is aberrated; its comparison side is
  // the momentarily co-located lab observer, not a simultaneous object slice.
  function project(state,event,point,width,height,photo){
    if(!(width>0&&height>0))return {status:'outside',x:null,y:null};
    const d=sub(point,event.camera);if(length(d)<1e-12)return {status:'coincident',x:null,y:null};
    let ray=normalize(d);if(state.scenario==='observer'&&photo)ray=M.labToObserver(ray,event.observerVelocity);
    const cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),sy=Math.sin(state.yaw),cy=Math.cos(state.yaw),forward=[sy*cp,sp,cy*cp],right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp];
    const z=dot(ray,forward);if(z<=1e-8)return {status:'behind',x:null,y:null};
    const aspect=width/height,tan=Math.tan(state.fov*Math.PI/360)*Math.max(1,.95/aspect);
    const x=width*(.5+dot(ray,right)/(2*z*aspect*tan)),y=height*(.5-dot(ray,up)/(2*z*tan));
    return {status:x>=0&&x<=width&&y>=0&&y<=height?'inside':'outside',x,y};
  }
  function sideStatus(state,screen,physical,photo){
    const enabled=state.view==='split'||(photo?state.view==='photo':state.view==='geometry');
    if(!enabled)return 'not-shown';
    if(screen.status!=='inside')return screen.status;
    if(state.view==='split'){
      const photoLeft=state.scenario==='flyby',left=screen.x/screen.width<state.split;
      if(left!==(photo?photoLeft:!photoLeft))return 'comparison';
    }
    return physical.status;
  }
  function evaluate(state,event,restPoint,width,height){
    if(!onSurface(state.environment,state.shape,restPoint,2e-4))return null;
    const point=restPoint.slice(),t=state.time,simultaneous=atTime(event,point,t,t),emission=retarded(event,point,t);
    const pVis=visibility(state,event,point,emission.point,true),gVis=state.scenario==='observer'?pVis:visibility(state,event,point,simultaneous,false);
    const pScreen=project(state,event,emission.point,width,height,true),gScreen=project(state,event,simultaneous,width,height,false);
    pScreen.width=width;gScreen.width=width;
    const photo={...emission,screen:pScreen,visibility:pVis,status:sideStatus(state,pScreen,pVis,true)};
    const geometry={time:t,point:simultaneous,screen:gScreen,visibility:gVis,status:sideStatus(state,gScreen,gVis,false)};
    return {restPoint:point,observation:{time:t,camera:event.camera.slice()},velocity:event.velocity.slice(),center:event.center.slice(),
      simultaneous:geometry,emission:photo,properNow:M.properTime(t,event.velocity,point),properEmission:M.properTime(emission.time,event.velocity,point)};
  }
  return Object.freeze({contracted,atTime,retarded,onSurface,visibility,project,evaluate});
});
