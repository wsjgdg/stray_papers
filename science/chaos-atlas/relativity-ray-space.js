/* Third-person projection of the exact sampled events. No extra ray tracing. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'));
  else root.RelativityRaySpace=factory(root.RelativityModel);
})(typeof self!=='undefined'?self:this,function(M){
  'use strict';
  const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,s)=>a.map(v=>v*s);
  const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>{const n=Math.hypot(...a);return n?mul(a,1/n):[0,0,0];};
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // Transform a rest-frame offset to the laboratory's simultaneous spatial
  // section: contract only its projection along the actual velocity vector.
  function contracted(offset,velocity){
    const b2=dot(velocity,velocity);if(b2<1e-24)return offset.slice();
    const k=(Math.sqrt(1-b2)-1)*dot(offset,velocity)/b2;return add(offset,mul(velocity,k));
  }
  function build(state,current,reference,marker=null){
    const selected=reference?[["A",reference],...(current&&current!==reference?[["B",current]]:[])]:current?[["当前",current]]:[];
    const rays=selected.map(([id,ray])=>{
      const finite=!!ray.hit,valid=finite&&!(state.scenario==='flyby'&&!ray.photo);
      const body=finite&&!!(ray.hit.body||ray.hit.kind==='cube'||ray.hit.kind==='sphere');
      return {id,mode:!finite?'sky':valid?'photon':'slice',camera:ray.camera.slice(),direction:ray.labDirection.slice(),
        point:finite?ray.hit.point.slice():null,source:finite?ray.hit.kind:'sky',distance:finite?ray.hit.distance:null,
        emittedAt:valid?state.time-ray.hit.distance:null,body,bodyId:body?(ray.hit.bodyId||'A'):null,bodyVelocity:body?(ray.hit.velocity||ray.velocity||[0,0,0]).slice():null,centerAtEmission:valid&&body&&ray.hit.centerAtEmission?ray.hit.centerAtEmission.slice():null,
        normal:finite&&ray.hit.normal?ray.hit.normal.slice():null,restPoint:body&&ray.hit.restPoint?ray.hit.restPoint.slice():null};
    });
    const anchor=current||reference;
    const a=rays.find(r=>r.id==='A'),b=rays.find(r=>r.id==='B');
    const observation=anchor?{point:anchor.camera.slice(),time:state.time}:marker?{point:marker.observation.camera.slice(),time:marker.observation.time}:null;
    const center=anchor?anchor.center:marker?.center;
    return {rays,observation,
      object:center?{center:center.slice(),shape:state.shape,half:M.objectHalf(state.environment,state.shape).slice(),bevel:M.objectBevel(state.environment,state.shape),scenario:state.scenario,beta:state.scenario==='flyby'?state.beta:0,velocity:state.scenario==='flyby'?M.motionVelocity('flyby',state.beta,state.motionAngle||0,state.motionElevation||0):[0,0,0]}:null,
      objectB:anchor?.second?{center:anchor.second.center.slice(),velocity:anchor.second.velocity.slice(),shape:state.shape,half:M.objectHalf(state.environment,state.shape).slice(),bevel:M.objectBevel(state.environment,state.shape)}:null,
      observerVelocity:state.scenario==='observer'?M.motionVelocity('observer',state.beta,state.motionAngle||0,state.motionElevation||0):[0,0,0],
      marker:marker?{restPoint:marker.restPoint.slice(),simultaneous:{point:marker.simultaneous.point.slice(),time:marker.simultaneous.time,status:marker.simultaneous.status},emission:{point:marker.emission.point.slice(),time:marker.emission.time,distance:marker.emission.distance,status:marker.emission.status,visibility:{...marker.emission.visibility}},properNow:marker.properNow,properEmission:marker.properEmission}:null,
      delta:a&&b&&a.emittedAt!==null&&b.emittedAt!==null?b.emittedAt-a.emittedAt:null};
  }
  // Perspective projection is an actual camera in 3D world coordinates.
  function projector(points,width,height,view={}){
    const finite=points.filter(p=>p&&p.every(Number.isFinite));
    const lo=[0,1,2].map(i=>Math.min(...finite.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...finite.map(p=>p[i])));
    const target=lo.map((x,i)=>(x+hi[i])/2),span=Math.max(3,...hi.map((x,i)=>x-lo[i])),yaw=Number.isFinite(view.yaw)?view.yaw:-.7,pitch=clamp(Number.isFinite(view.pitch)?view.pitch:.55,.12,1.35),zoom=clamp(Number.isFinite(view.zoom)?view.zoom:1,.55,2.2);
    const distance=span*2.05/zoom,eye=add(target,[Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,-Math.cos(yaw)*Math.cos(pitch)*distance]);
    const forward=norm(sub(target,eye)),right=norm(cross([0,1,0],forward)),up=norm(cross(forward,right)),f=Math.min(width,height)*1.22;
    return {target,span,eye,project(p){const r=sub(p,eye),depth=dot(r,forward);if(depth<=.02)return null;return [width/2+f*dot(r,right)/depth,height*.52-f*dot(r,up)/depth,depth];}};
  }
  function draw(canvas,model,view={}){
    const w=Math.max(1,canvas.clientWidth||canvas.width),h=Math.max(1,canvas.clientHeight||canvas.height),dpr=Math.min(typeof devicePixelRatio==='number'?devicePixelRatio:1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#142b34');bg.addColorStop(1,'#0b171c');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const obs=model.observation?.point;
    if(!obs){ctx.fillStyle='#c3d1ce';ctx.font='13px "Noto Sans SC Variable", sans-serif';ctx.fillText('先在实验画面中采样一束光。',24,38);return;}
    const endpoints=model.rays.map(r=>r.point||add(r.camera,mul(r.direction,10)));
    const all=[obs,...endpoints];if(model.object)all.push(model.object.center);if(model.objectB)all.push(model.objectB.center);for(const r of model.rays)if(r.centerAtEmission)all.push(r.centerAtEmission);if(model.marker)all.push(model.marker.simultaneous.point,model.marker.emission.point);
    if(model.lightPath){const q=model.lightPath;all.push(q.surface,q.blockerPoint,q.status==='lit'?q.source:null,q.displayStart);}
    const cam=projector(all,w,h,view),P=cam.project;
    function line(a,b,color,width=1,dash=[]){const x=P(a),y=P(b);if(!x||!y)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.stroke();ctx.setLineDash([]);}
    function label(p,text,color,dx=8,dy=-9){const q=P(p);if(!q)return;ctx.font='600 12px "Noto Sans SC Variable", sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#102027';ctx.strokeText(text,q[0]+dx,q[1]+dy);ctx.fillStyle=color;ctx.fillText(text,q[0]+dx,q[1]+dy);}
    function point(p,color,size=4){const q=P(p);if(!q)return;ctx.fillStyle=color;ctx.beginPath();ctx.arc(q[0],q[1],size,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#102027';ctx.lineWidth=1.5;ctx.stroke();}
    function arrow(a,b,color){
      const q=P(mix(a,b,.62)),p=P(mix(a,b,.57));if(!q||!p)return;
      const a0=Math.atan2(q[1]-p[1],q[0]-p[0]);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(q[0]-8*Math.cos(a0-.48),q[1]-8*Math.sin(a0-.48));ctx.lineTo(q[0],q[1]);ctx.lineTo(q[0]-8*Math.cos(a0+.48),q[1]-8*Math.sin(a0+.48));ctx.stroke();
    }
    // Grid is a world-coordinate guide, not a reconstructed surface.
    const half=cam.span*.72,step=10**Math.floor(Math.log10(Math.max(half/4,.1))),cx=Math.round(cam.target[0]/step)*step,cz=Math.round(cam.target[2]/step)*step;
    for(let i=-5;i<=5;i++){const x=cx+i*step,z=cz+i*step;line([x,0,cz-half],[x,0,cz+half],'rgba(139,178,170,.12)');line([cx-half,0,z],[cx+half,0,z],'rgba(139,178,170,.12)');}
    line([cx,0,cz],[cx+step,0,cz],'rgba(188,209,199,.5)',1.2);line([cx,0,cz],[cx,step,cz],'rgba(188,209,199,.5)',1.2);line([cx,0,cz],[cx,0,cz+step],'rgba(188,209,199,.5)',1.2);
    label([cx+step,0,cz],'x','#9db6ad',3,0);label([cx,step,cz],'y','#9db6ad',3,0);label([cx,0,cz+step],'z','#9db6ad',3,0);
    function box(center,shape,velocity,color,dash,half=[1.22,1.22,1.22],bevel=0){
      const at=offset=>add(center,contracted(offset,velocity));
      if(shape==='artifact'&&bevel>0){
        const mesh=M.bevelMesh(half,bevel);for(const [a,b] of mesh.edges)line(at(mesh.vertices[a]),at(mesh.vertices[b]),color,1.2,dash);
      }else if(shape==='sphere'){
        for(let axis=0;axis<3;axis++){let previous=null;for(let k=0;k<=48;k++){const angle=k*Math.PI/24,q=[0,0,0];q[(axis+1)%3]=half[(axis+1)%3]*Math.cos(angle);q[(axis+2)%3]=half[(axis+2)%3]*Math.sin(angle);const p=at(q);if(previous)line(previous,p,color,1.2,dash);previous=p;}}
      }else{
        const corners=[];for(let i=0;i<8;i++)corners.push(at([half[0]*(i&1?1:-1),half[1]*(i&2?1:-1),half[2]*(i&4?1:-1)]));
        for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))line(corners[i],corners[i|bit],color,1.2,dash);
      }
    }
    if(model.object){
      box(model.object.center,model.object.shape,model.object.velocity,'rgba(213,226,218,.48)',[4,4],model.object.half,model.object.bevel);
      label(model.object.center,'t观察','#b8c9c4',8,18);
    }
    if(model.objectB){box(model.objectB.center,model.objectB.shape,model.objectB.velocity,'rgba(143,184,242,.62)',[4,4],model.objectB.half,model.objectB.bevel);label(model.objectB.center,'物体 B · t观察','#aacbf5',8,18);}
    const colors={'A':'#7ad9d1','B':'#ffbd87','当前':'#ffbd87'};
    for(const r of model.rays){
      const color=colors[r.id],end=r.point||add(r.camera,mul(r.direction,10));
      if(r.centerAtEmission&&model.object){box(r.centerAtEmission,model.object.shape,r.bodyVelocity||model.object.velocity,color,[3,3],model.object.half,model.object.bevel);}
      if(r.mode==='photon'){line(end,obs,color,2.6);arrow(end,obs,color);point(end,color,4.5);label(end,r.id+' 发射 t='+r.emittedAt.toFixed(2),color);}
      else{line(obs,end,color,1.6,[5,5]);if(r.point)point(end,color,3.5);label(end,r.id+(r.mode==='slice'?' 同时视线':' 无限远方向'),color);}
    }
    const path=model.lightPath;
    if(path?.surface){
      if(path.status==='lit'){
        const start=path.source||path.displayStart;
        line(start,path.surface,'#9fe9cc',2.5);arrow(start,path.surface,'#9fe9cc');point(start,'#9fe9cc',4);
        label(start,path.lightKind==='point'?'主光发出 t='+path.sourceTime.toFixed(2):'平行光（局部方向）','#9fe9cc');
      }else if(path.status==='blocked'){
        line(path.surface,path.blockerPoint,'#ec8c79',2,[5,4]);point(path.blockerPoint,'#ff9f87',5);
        label(path.blockerPoint,'遮挡 t='+path.blockerTime.toFixed(2),'#ffb09a');
      }
      point(path.surface,'#ffe2a8',4);label(path.surface,'表面 t='+path.surfaceTime.toFixed(2),'#ffe2a8',8,16);
    }
    if(model.marker){
      const m=model.marker,visible=m.emission.visibility.status==='visible';
      point(m.simultaneous.point,'#98e5d2',4);label(m.simultaneous.point,'M 同时位置','#98e5d2',8,16);
      point(m.emission.point,visible?'#ffe29b':'#a4ada8',4.5);label(m.emission.point,visible?'M 发射':'M 光锥交点（不可见）',visible?'#ffe29b':'#b8c4bf');
      if(visible){line(m.emission.point,obs,'#ffe29b',2);arrow(m.emission.point,obs,'#ffe29b');}
    }
    // A small three-dimensional camera marker at the one common observation event.
    const size=cam.span*.035;line(add(obs,[-size,-size,0]),add(obs,[size,-size,0]),'#e9f4ee',1.8);line(add(obs,[size,-size,0]),add(obs,[0,size,0]),'#e9f4ee',1.8);line(add(obs,[0,size,0]),add(obs,[-size,-size,0]),'#e9f4ee',1.8);point(obs,'#f1f6e9',4);label(obs,'观察 t='+model.observation.time.toFixed(2),'#f1f6e9',8,-11);
  }
  return Object.freeze({build,projector,draw,contracted});
});
