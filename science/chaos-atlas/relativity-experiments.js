/* Offline experiment recipes and strictly validated observation snapshots. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-observables.js'));else root.RelativityExperiments=factory(root.RelativityObservables);
})(typeof globalThis==='object'?globalThis:this,function(Observables){
  'use strict';
  const BASE=Object.freeze({environment:'station',scenario:'flyby',shape:'artifact',view:'photo',beta:.6,motionAngle:0,motionElevation:0,secondEnabled:false,secondBeta:-.6,secondAngle:0,secondElevation:0,velocityArrow:true,time:0,playbackRate:1,split:.5,yaw:0,pitch:-.025,fov:58,doppler:true,shadows:true,softShadows:false,shadowSamples:4,shadowTiming:'retarded',lightX:0,lightZ:0,lightYaw:0,lightElevation:0,lightWidthScale:1,lightDepthScale:1,sunAngularRadius:4.58,antialias:false,dynamicQuality:'balanced',spectrumSplit:false,roughnessScale:1,shutter:0,contour:false,emissionMap:false,surfaceMode:'reflection',materialSpectrum:'texture',sceneMirror:false,mirrorX:-2.25,mirrorAngle:0,toneMap:'reinhard',spectrumModel:'rgb',temperature:6500,lineWavelength:656.3,exposure:0,wavelength:550});
  const playbackRates=Object.freeze([.25,.5,1,2]);
  // One-times playback advances 0.65 laboratory time units per wall-clock
  // second. Anchor to elapsed time rather than summing capped animation-frame
  // deltas: a slow renderer skips intermediate events, not simulation time.
  function playbackTime(anchorTime,anchorMs,nowMs,rate,max){
    if(!Number.isFinite(anchorTime)||!Number.isFinite(anchorMs)||!Number.isFinite(nowMs)||!playbackRates.includes(rate)||!Number.isFinite(max))throw new RangeError('无效播放时钟');
    return Math.min(max,anchorTime+Math.max(0,nowMs-anchorMs)*.00065*rate);
  }
  const presets=Object.freeze([
    {id:'terrell',title:'照片与同时形状',steps:'青色虚线是观察时刻的同时轮廓，照片中的物体来自过去光锥；切换「左右对照」再比较。采样不同位置的发射时刻，同时几何不是照片。',parameters:{shape:'cube',beta:.86,time:-2,view:'photo',contour:true}},
    {id:'aberration',title:'迎面与远离',steps:'左右分别是同一事件的静止与高速视野。采样右侧，记录夹角和 D；将运动轴改为 180°，再比较同一方向。',parameters:{scenario:'observer',environment:'street',beta:.86,view:'split'}},
    {id:'shadow',title:'延迟阴影',steps:'左侧沿光线回溯运动物体，右侧把物体冻结在表面时刻。移动分界线扫过地面阴影，或调整光方向再采样；冻结参考并非真实传播。',parameters:{environment:'mountain',shape:'artifact',beta:.94,motionAngle:-45,pitch:-.18,view:'photo',shadowTiming:'split',lightYaw:45,lightElevation:-15,doppler:false}},
    {id:'spectrum',title:'谱线的红移与蓝移',steps:'采样物体表面，比较 Hα 的发射与观察频谱；改变运动方向或速度，验证观察波长 λ = λ源 / D。谱线宽度为教学设定。',parameters:{beta:.6,motionAngle:-90,spectrumModel:'line',lineWavelength:656.3,wavelength:656.3}},
    {id:'shutter',title:'有限快门与时间',steps:'这张图由四个不同时刻真实追踪并平均。把快门改回 0 再比较；探针只读取快门中心事件。此实验会降低预览分辨率。',parameters:{beta:.86,shutter:1.6,doppler:false}}
  ].map(p=>Object.freeze({...p,parameters:Object.freeze(p.parameters),procedure:Object.freeze({
    terrell:{operate:'载入后打开左右对照；暂停并等待完整画面，在照片一侧采样并固定一束光，再选择另一处。',observe:'比较照片、青色同时轮廓和两个发射时刻；轮廓可以透过遮挡，仅是示意。',verify:'将速度调为 0：几何轮廓应与同时切片一致，但钟面仍可因光行时不同；比较 A/B 的发射时差。'},
    aberration:{operate:'在高速观察者的右侧采样，记录实验室角与观察者角；将水平轴从 0° 改为 180° 后重新采样同一屏幕方向。',observe:'对照静止与高速视野中场景的方向和聚集；两侧是同一观察事件。',verify:'检查探针上的频率比 D；恢复 β=0 时两种方向与 D=1 应重合。远景天空不提供有限发射时刻。'},
    shadow:{operate:'载入后在地面寻找延迟与冻结两侧的阴影，可移动分界线或调整光源方向。',observe:'延迟阴影沿入射光追踪运动物体过去的位置；冻结参考忽略传播时间。',verify:'把速度调为 0 并保持其他光源参数：两种遮挡时序应一致。用探针核对是否受阻与遮挡时刻。'},
    spectrum:{operate:'选择物体表面采样 Hα 参考波长，展开进阶设置并切换灰反射 / 自发光，或改变运动方向。',observe:'记录探针的入射、出射与合成频率比，比较参考谱线的观察波长；部分颜色可能落到可见范围外。',verify:'灰反射下核对 D=D入×D出 与 λ观察=λ源/D；β=0 时两项均为 1。光谱与线宽为教学假设。'},
    shutter:{operate:'观察 Δt=1.6 的四样本画面，等待完整帧后采样；将快门改为瞬时并再次采样同一方向。',observe:'有限快门混合四个不同时刻；探针始终报告快门中心事件，不是平均发射时刻。',verify:'同一中心事件的探针读数不应因为快门宽度改变；中点位于 t±Δt/8 和 t±3Δt/8，在线性光强空间平均。'}
  }[p.id])})));
  const choices={environment:['station','street','corridor','mountain','harbor'],scenario:['flyby','observer'],shape:['artifact','cube','sphere'],view:['photo','geometry','split'],playbackRate:playbackRates,dynamicQuality:['responsive','balanced','sharp'],shadowSamples:[4,8,16],shadowTiming:['retarded','instant','split'],surfaceMode:['reflection','emission'],materialSpectrum:['texture','fabric','wood','metal','usgs-paint','usgs-pine','usgs-nylon'],toneMap:['reinhard','filmic'],spectrumModel:['rgb','blackbody','line']};
  const ranges={mirrorX:[-4,4],mirrorAngle:[-45,45],beta:[-.98,.98],motionAngle:[-180,180],motionElevation:[-90,90],secondBeta:[-.98,.98],secondAngle:[-180,180],secondElevation:[-90,90],roughnessScale:[.5,1.5],time:[-3,8],split:[.1,.9],yaw:[-1000000,1000000],pitch:[-1.25,1.25],fov:[35,100],lightX:[-3,3],lightZ:[-3,3],lightYaw:[-180,180],lightElevation:[-40,35],lightWidthScale:[.25,2.5],lightDepthScale:[.25,2.5],sunAngularRadius:[.1,8],shutter:[0,1.6],temperature:[2500,12000],lineWavelength:[380,780],exposure:[-8,4],wavelength:[380,780]};
  const booleans=['doppler','shadows','softShadows','antialias','contour','emissionMap','velocityArrow','spectrumSplit','secondEnabled','sceneMirror'];
  function parameters(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('缺少实验参数');
    const result={};
    for(const key of Object.keys(BASE)){
      const value=input[key]===undefined&&key==='surfaceMode'?'emission':input[key]===undefined&&['motionElevation','velocityArrow','materialSpectrum','toneMap','dynamicQuality','spectrumSplit','secondEnabled','secondBeta','secondAngle','secondElevation','roughnessScale','playbackRate','shadowSamples','lightWidthScale','lightDepthScale','sunAngularRadius','sceneMirror','mirrorX','mirrorAngle'].includes(key)?BASE[key]:input[key];
      if(key in choices){if(!choices[key].includes(value))throw new RangeError('无效参数：'+key);}
      else if(key in ranges){const [lo,hi]=ranges[key];if(typeof value!=='number'||!Number.isFinite(value)||value<lo||value>hi)throw new RangeError('无效参数：'+key);}
      else if(booleans.includes(key)){if(typeof value!=='boolean')throw new TypeError('无效参数：'+key);}
      result[key]=value;
    }
    if(result.scenario==='flyby'&&result.time>3||result.scenario==='observer'&&result.time<0)throw new RangeError('观察时间超出该场景范围');
    if(result.shadowTiming==='split'&&result.view!=='photo')throw new RangeError('阴影左右对照必须使用照片视图');
    if(result.spectrumSplit&&(result.view!=='photo'||result.shadowTiming==='split'))throw new RangeError('光谱对照必须使用单一照片和阴影时序');
    return result;
  }
  function recipe(id){const p=presets.find(x=>x.id===id);if(!p)throw new RangeError('未知实验');return {...BASE,...p.parameters};}
  function samplePosition(value){
    if(value===null||value===undefined)return null;
    if(typeof value!=='object'||Array.isArray(value)||!Number.isFinite(value.u)||!Number.isFinite(value.v)||!Number.isFinite(value.aspect)||value.u<0||value.u>1||value.v<0||value.v>1||value.aspect<.1||value.aspect>10)throw new RangeError('无效采样位置');
    return {u:value.u,v:value.v,aspect:value.aspect};
  }
  function parse(text){
    if(typeof text!=='string'||text.length>1048576)throw new RangeError('快照文件过大或无效');
    const data=JSON.parse(text);
    if(!data||data.format!=='relativity-observation'||data.schema!==1)throw new RangeError('不支持的快照格式');
    const state=parameters(data.parameters),m=data.measurements;
    if(!m||typeof m!=='object'||Array.isArray(m))throw new TypeError('缺少采样记录');
    let materialPoint=null;
    if(m.materialPoint!==undefined&&m.materialPoint!==null){
      if(!Observables.onSurface(state.environment,state.shape,m.materialPoint,2e-4))throw new RangeError('材料点不在所选物体表面');
      materialPoint=m.materialPoint.slice();
    }
    return {parameters:state,current:samplePosition(m.current),reference:samplePosition(m.reference),materialPoint};
  }
  return Object.freeze({BASE,playbackRates,playbackTime,presets,parameters,recipe,parse});
});
