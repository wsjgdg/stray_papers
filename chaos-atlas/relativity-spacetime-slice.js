/* A genuine 2+1 slice: one fixed laboratory spatial plane through observation O
 * and time. The displayed 3D image is a projection of that 2+1 slice, NOT a
 * projection of the whole 3+1 spacetime. Geometric cone/body intersections are
 * candidates, not a visibility test; the main convex body excludes accessories. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-ray-space.js'));
  else root.RelativitySpacetimeSlice=factory(root.RelativityModel,root.RelativityRaySpace);
})(typeof globalThis==='object'?globalThis:this,function(M,Space){
  'use strict';const {add,sub,scale,dot,cross,length,normalize}=M;
  function events(space){
    if(!space?.observation)return [];
    const found=[];for(const r of space.rays||[])if(r.point)found.push({id:r.id,point:r.point.slice(),time:r.mode==='photon'?r.emittedAt:space.observation.time,kind:r.mode==='photon'?'emission':'simultaneous',body:r.body});
    if(space.marker)found.push({id:'M',point:space.marker.emission.point.slice(),time:space.marker.emission.time,kind:space.marker.emission.visibility.status==='visible'?'emission':'blocked',body:true});
    return found;
  }
  function basis(space,mode='xz'){
    let u,v,selection=null;
    if(mode==='xy'){u=[1,0,0];v=[0,1,0];}
    else if(mode==='yz'){u=[0,1,0];v=[0,0,1];}
    else if(['A','B','M','当前'].includes(mode)){
      selection=events(space).find(e=>e.id===mode);const d=selection?sub(selection.point,space.observation.point):null;
      if(d&&length(d)>1e-9){u=normalize(d);const up=Math.abs(u[1])>.95?[1,0,0]:[0,1,0];v=normalize(sub(up,scale(u,dot(up,u))));}
      else{u=[1,0,0];v=[0,0,1];}
    }else{u=[1,0,0];v=[0,0,1];}
    return {u,v,normal:normalize(cross(u,v)),mode,selection};
  }
  function signed(point,object,time,at){
    const vel=object.velocity,center=add(object.center,scale(vel,time-at)),r=sub(point,center),b2=dot(vel,vel),q=b2>1e-24?add(r,scale(vel,(1/Math.sqrt(1-b2)-1)*dot(r,vel)/b2)):r;
    if(object.shape==='sphere')return length(q)-1.22;
    const h=object.half,b=object.bevel||0,x=Math.abs(q[0]),y=Math.abs(q[1]),z=Math.abs(q[2]);
    return Math.max(x-h[0],y-h[1],z-h[2],...(b>0?[x+y-h[0]-h[1]+b,x+z-h[0]-h[2]+b,y+z-h[1]-h[2]+b]:[]));
  }
  // Sample one 2D section of the body's actual convex surface at fixed t.
  function contour(fn,cx,cy,radius,n=48){
    const step=2*radius/n,values=new Float64Array((n+1)*(n+1)),lines=[];
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)values[j*(n+1)+i]=fn(cx-radius+i*step,cy-radius+j*step);
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const x=cx-radius+i*step,y=cy-radius+j*step,vals=[values[j*(n+1)+i],values[j*(n+1)+i+1],values[(j+1)*(n+1)+i+1],values[(j+1)*(n+1)+i]],pts=[[x,y],[x+step,y],[x+step,y+step],[x,y+step]],hits=[];
      for(let k=0;k<4;k++){const l=(k+1)%4,a=vals[k],b=vals[l];if((a<0)!==(b<0)){const f=a/(a-b);hits.push([pts[k][0]+f*(pts[l][0]-pts[k][0]),pts[k][1]+f*(pts[l][1]-pts[k][1])]);}}
      if(hits.length===2)lines.push(hits);else if(hits.length===4){lines.push([hits[0],hits[1]],[hits[2],hits[3]]);}
    }return lines;
  }
  function build(space,state,mode='xz',{angularSamples=720,layers=18,grid=48}={}){
    if(!space?.observation||!space.object)return {observation:null,events:[],near:[],far:[],sections:[]};
    const obs=space.observation,object=space.object,b=basis(space,mode),toUV=p=>{const r=sub(p,obs.point);return [dot(r,b.u),dot(r,b.v)];},toWorld=(u,v)=>add(obs.point,add(scale(b.u,u),scale(b.v,v)));
    const ev=events(space).map(e=>({...e,offset:dot(sub(e.point,obs.point),b.normal)}));for(const e of ev){e.inSlice=Math.abs(e.offset)<1e-6;e.uv=toUV(e.point);}
    const shape=object.shape==='sphere'?'sphere':'cube',radius=1.22,common={beta:object.velocity,shape,halfSize:object.half,radius,bevel:object.bevel,lightCone:true,details:[]},near=[],far=[];
    for(let i=0;i<angularSamples;i++){
      const a=2*Math.PI*i/angularSamples,d=add(scale(b.u,Math.cos(a)),scale(b.v,Math.sin(a)));
      const first=M.movingObjectHit({...common,origin:obs.point,direction:d,center:object.center,time:obs.time});
      if(!first){near.push(null);far.push(null);continue;}
      near.push({u:dot(sub(first.point,obs.point),b.u),v:dot(sub(first.point,obs.point),b.v),age:first.distance});
      // Continue the same past-directed ray just inside the convex primary
      // body. This finds its far surface, without claiming scene visibility.
      const advance=first.distance+1e-6,origin=add(obs.point,scale(d,advance)),center=sub(object.center,scale(object.velocity,advance));
      const second=M.movingObjectHit({...common,origin,direction:d,center,time:obs.time-advance});
      if(second){const p=second.point;far.push({u:dot(sub(p,obs.point),b.u),v:dot(sub(p,obs.point),b.v),age:advance+second.distance});}else far.push(null);
    }
    const roots=[...near,...far].filter(Boolean),eventAges=ev.map(e=>obs.time-e.time).filter(a=>a>=0),R=shape==='sphere'?radius:Math.hypot(...object.half),fallback=length(sub(object.center,obs.point))/(1-Math.min(.98,length(object.velocity)));
    const depth=Math.min(200,Math.max(4,...roots.map(p=>p.age),...eventAges,(roots.length?0:Math.min(fallback,100)))+Math.max(2,R*1.5));
    const sections=[];
    for(let k=0;k<=layers;k++){
      const age=depth*k/layers,time=obs.time-age,center=sub(object.center,scale(object.velocity,age)),uv=toUV(center),off=dot(sub(center,obs.point),b.normal);
      if(Math.abs(off)>R+1e-6)continue;
      const lines=contour((u,v)=>signed(toWorld(u,v),object,time,obs.time),uv[0],uv[1],R*1.05,grid);
      if(lines.length)sections.push({age,lines,index:k});
    }
    return {observation:obs,object,basis:b,events:ev,near,far,sections,depth,toUV,toWorld,angularSamples,layers};
  }
  function draw(canvas,model,view={}){
    const w=Math.max(1,canvas.clientWidth||canvas.width),h=Math.max(1,canvas.clientHeight||canvas.height),dpr=Math.min(typeof devicePixelRatio==='number'?devicePixelRatio:1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#142b34');bg.addColorStop(1,'#0b171c');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.font='11px "Noto Sans SC Variable",sans-serif';
    if(!model.observation){ctx.fillStyle='#d7e4dc';ctx.fillText('等待与主画面一致的观察事件…',20,35);return;}
    const D=model.depth,origin=[0,0,0],sample=[origin,[-D,-D,-D],[D,-D,D]],P=Space.projector(sample,w,h,view).project;
    function line(a,b,color,width=1,dash=[]){const x=P(a),y=P(b);if(!x||!y)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.stroke();ctx.setLineDash([]);}
    function point(a,label,color,open=false){const q=P(a);if(!q)return;ctx.beginPath();ctx.arc(q[0],q[1],4,0,2*Math.PI);ctx.fillStyle=open?'#102027':color;ctx.fill();ctx.strokeStyle=color;ctx.stroke();ctx.font='600 11px "Noto Sans SC Variable",sans-serif';ctx.fillStyle=color;ctx.fillText(label,q[0]+6,q[1]-6);}
    // Actual cross-sections of the cone t = t_O - sqrt(u²+v²).
    for(let k=1;k<=7;k++){const age=D*k/7;let prev=null;for(let i=0;i<=64;i++){const a=2*Math.PI*i/64,p=[age*Math.cos(a),-age,age*Math.sin(a)];if(prev)line(prev,p,'#69928b55',.8);prev=p;}}
    for(let i=0;i<12;i++){const a=2*Math.PI*i/12;line(origin,[D*Math.cos(a),-D,D*Math.sin(a)],'#769e9555',.8,[4,4]);}
    function extrema(layer){
      const points=layer.lines.flat();if(!points.length)return [];
      return [0,1,2,3].map(which=>points.reduce((best,p)=>which===0?p[0]<best[0]?p:best:which===1?p[0]>best[0]?p:best:which===2?p[1]<best[1]?p:best:p[1]>best[1]?p:best));
    }
    for(let i=0;i<model.sections.length;i++){
      const layer=model.sections[i];for(const segment of layer.lines)line([segment[0][0],-layer.age,segment[0][1]],[segment[1][0],-layer.age,segment[1][1]],'#d7e4d08c',1.2);
      const previous=model.sections[i-1];
      if(previous&&layer.index===previous.index+1){const a=extrema(previous),b=extrema(layer);for(let k=0;k<a.length;k++)line([a[k][0],-previous.age,a[k][1]],[b[k][0],-layer.age,b[k][1]],'#d7e4d04d',.8);}
    }
    for(const [array,color] of [[model.near,'#ffca93'],[model.far,'#e9896e']]){
      for(let i=0;i<array.length;i++){const a=array[i],b=array[(i+1)%array.length];if(a&&b&&Math.abs(a.age-b.age)<D*.35)line([a.u,-a.age,a.v],[b.u,-b.age,b.v],color,2.2);}
    }
    for(const e of model.events)if(e.inSlice)point([e.uv[0],e.time-model.observation.time,e.uv[1]],e.id+(e.kind==='blocked'?' ×':e.kind==='simultaneous'?' 同时':''),e.id==='A'?'#7ad9d1':e.id==='M'?'#f4d38a':'#ffbd87',e.kind!=='emission');
    point(origin,'O','#f1f5e9');line(origin,[D*.35,0,0],'#a4c8bd',1.3);line(origin,[0,0,D*.35],'#a4c8bd',1.3);line(origin,[0,-D*.35,0],'#c2d2c2',1.3);
    ctx.fillStyle='#bfd6cb';ctx.fillText('u / v：空间切片　ct：向上为未来',12,19);
  }
  return Object.freeze({events,basis,signed,contour,build,draw});
});
