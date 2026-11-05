/* Two parameter sets, one laboratory observation event and camera. The L/R
 * endpoints are fixed rest-frame surface points; their past-cone intersections
 * are candidates even when the surface is occluded. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-observables.js'),require('./relativity-experiments.js'));
  else root.RelativityComparison=factory(root.RelativityModel,root.RelativityObservables,root.RelativityExperiments);
})(typeof globalThis==='object'?globalThis:this,function(M,V,E){
  'use strict';
  function group(g){
    if(!g||typeof g!=='object')throw new TypeError('缺少参数组');
    const ranges={beta:[-.98,.98],motionAngle:[-180,180],motionElevation:[-90,90]},r={};
    for(const [key,[lo,hi]] of Object.entries(ranges)){const n=g[key];if(typeof n!=='number'||!Number.isFinite(n)||n<lo||n>hi)throw new RangeError('无效对照参数：'+key);r[key]=n;}
    return r;
  }
  function lockedEvent(value){
    if(!value||!Number.isFinite(value.time)||Math.abs(value.time)>1000||!Array.isArray(value.camera)||!Array.isArray(value.center)||value.camera.length!==3||value.center.length!==3||[...value.camera,...value.center].some(v=>!Number.isFinite(v)||Math.abs(v)>1000))throw new RangeError('无效固定观察事件');
    if(value.secondCenter!==undefined&&(!Array.isArray(value.secondCenter)||value.secondCenter.length!==3||value.secondCenter.some(v=>!Number.isFinite(v)||Math.abs(v)>1000)))throw new RangeError('无效第二物体中心');
    return {time:value.time,camera:value.camera.slice(),center:value.center.slice(),...(value.secondCenter?{secondCenter:value.secondCenter.slice()}:{})};
  }
  function endpoints(base){
    if(base.shape==='sphere'){const r=1.22,x=.58*r,y=.48*r,z=-Math.sqrt(r*r-x*x-y*y);return [[-x,y,z],[x,y,z]];}
    const h=M.objectHalf(base.environment,base.shape),bevel=M.objectBevel(base.environment,base.shape),x=Math.max(.01,h[0]-bevel-.025),y=Math.max(.01,h[1]-bevel-.025);
    return [[-x,y,-h[2]],[x,y,-h[2]]];
  }
  function scenario(base,g,lock){
    const state={...base,...g,view:'photo',spectrumSplit:false,shadowTiming:base.shadowTiming==='split'?'retarded':base.shadowTiming,lockedEvent:lock,playing:false,interacting:false,velocityArrow:false,contour:false};
    const velocity=M.motionVelocity(state.scenario,state.beta,state.motionAngle,state.motionElevation),flyby=state.scenario==='flyby';
    return {state,event:{camera:lock.camera.slice(),center:lock.center.slice(),velocity:flyby?velocity:[0,0,0],observerVelocity:flyby?[0,0,0]:velocity,second:M.secondaryMotion(state)}};
  }
  function measurement(base,g,lock,width,height){
    const {state,event}=scenario(base,g,lock),points=endpoints(base),a=V.evaluate(state,event,points[0],width,height),b=V.evaluate(state,event,points[1],width,height);
    if(!a||!b)throw new Error('对照点不在物体表面');
    const point=result=>({rest:result.restPoint,emissionTime:result.emission.time,distance:result.emission.distance,emissionPoint:result.emission.point,status:result.emission.status,visibility:result.emission.visibility.status,screen:result.emission.screen});
    const left=point(a),right=point(b);return {parameters:g,left,right,delta:right.emissionTime-left.emissionTime};
  }
  function curve(base,g,lock,count=81){
    if(!Number.isInteger(count)||count<2||count>501)throw new RangeError('无效曲线样本数');
    const points=endpoints(base),out=[];
    for(let i=0;i<count;i++){
      const beta=-.98+1.96*i/(count-1),{event}=scenario(base,{...g,beta},lock),left=V.retarded(event,points[0],base.time),right=V.retarded(event,points[1],base.time);
      out.push({beta,delta:right.time-left.time});
    }return out;
  }
  function build(base,groups,lock,width=360,height=225){
    base=E.parameters(base);lock=lockedEvent(lock);
    if(Math.abs(lock.time-base.time)>1e-9)throw new RangeError('固定事件时间与参数不一致');
    if(!Array.isArray(groups)||groups.length!==2)throw new RangeError('需要两组参数');groups=groups.map(group);
    if(!(Number.isInteger(width)&&Number.isInteger(height)&&width>=32&&height>=32&&width<=1024&&height<=1024))throw new RangeError('无效图像尺寸');
    return {base,groups,lock,width,height,measurements:groups.map(g=>measurement(base,g,lock,width,height)),curves:groups.map(g=>curve(base,g,lock))};
  }
  function serialize(result){
    return {format:'relativity-parameter-comparison',schema:1,implementationVersion:'20261105-10',generatedAt:new Date().toISOString(),units:'laboratory coordinates; c=1',base:result.base,lockedEvent:result.lock,groups:result.groups,image:{width:result.width,height:result.height,mode:'independent Canvas light-cone frames',view:'photo',spatialSamples:1,shadowTiming:result.base.shadowTiming==='split'?'retarded':result.base.shadowTiming},measurements:result.measurements,curves:result.curves,
      assumptions:'Same lab observation event, camera orientation and simultaneous body centre. Candidate L/R emission events may be occluded; not necessarily received photons. Four midpoint shutter samples if nonzero. USGS reflectances are measured samples, not textures or BRDFs; RGB source spectra and lighting are approximations.'};
  }
  function parse(text){
    if(typeof text!=='string'||text.length>1048576)throw new RangeError('对照文件过大或无效');const data=JSON.parse(text);
    if(!data||data.format!=='relativity-parameter-comparison'||data.schema!==1)throw new RangeError('不支持的对照文件');
    return build(data.base,data.groups,data.lockedEvent,data.image?.width,data.image?.height);
  }
  return Object.freeze({group,lockedEvent,endpoints,scenario,measurement,curve,build,serialize,parse});
});
