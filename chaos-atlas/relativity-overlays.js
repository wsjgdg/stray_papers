/* Same-event simultaneous-geometry reference, projected from actual 3D parts.
 * This is a diagram overlay, not a photograph and not an occlusion test. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-ray-space.js'));
  else root.RelativityOverlays=factory(root.RelativityModel,root.RelativityRaySpace);
})(typeof globalThis==='object'?globalThis:this,function(M,Space){
  'use strict';
  const add=M.add,sub=M.sub,dot=M.dot;
  function hull(points){
    const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    if(p.length<3)return p;
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const lower=[],upper=[];
    for(const x of p){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],x)<=0)lower.pop();lower.push(x);}
    for(let i=p.length-1;i>=0;i--){const x=p[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],x)<=0)upper.pop();upper.push(x);}
    lower.pop();upper.pop();return lower.concat(upper);
  }
  function mesh(shape,half,center=[0,0,0],axis=1){
    const vertices=[],edges=[];
    if(shape==='bevel'){
      const source=M.bevelMesh(half,axis);vertices.push(...source.vertices.map(p=>add(center,p)));edges.push(...source.edges);
    }else if(shape==='sphere'){
      // Convergent polyhedral approximation to the Lorentz-contracted sphere.
      for(let j=0;j<=16;j++)for(let i=0;i<32;i++){
        const lat=Math.PI*(j/16-.5),lon=2*Math.PI*i/32;
        vertices.push(add(center,[half[0]*Math.cos(lat)*Math.cos(lon),half[1]*Math.sin(lat),half[2]*Math.cos(lat)*Math.sin(lon)]));
        edges.push([j*32+i,j*32+(i+1)%32]);if(j)edges.push([(j-1)*32+i,j*32+i]);
      }
    }else if(shape==='cylinder'){
      const radial=[0,1,2].filter(i=>i!==axis),radius=half[radial[0]];
      for(let end=0;end<2;end++)for(let i=0;i<32;i++){
        const a=2*Math.PI*i/32,q=center.slice();q[axis]+=(end?1:-1)*half[axis];q[radial[0]]+=radius*Math.cos(a);q[radial[1]]+=radius*Math.sin(a);vertices.push(q);
        edges.push([end*32+i,end*32+(i+1)%32]);if(end)edges.push([i,32+i]);
      }
    }else{
      for(let i=0;i<8;i++){vertices.push(add(center,half.map((h,j)=>h*(i&(1<<j)?1:-1))));for(const bit of [1,2,4])if(!(i&bit))edges.push([i,i|bit]);}
    }
    return {vertices,edges};
  }
  function points(shape,half,center=[0,0,0],axis=1){return mesh(shape,half,center,axis).vertices;}
  // Convex component silhouettes; parts use their actual rest-space sizes.
  // The reference deliberately shows outlines through scene occluders.
  function project(state,event,width,height,effectiveFov){
    if(state.scenario!=='flyby'||!(width>0&&height>0))return [];
    const cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),sy=Math.sin(state.yaw),cy=Math.cos(state.yaw);
    const forward=[sy*cp,sp,cy*cp],right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],tan=Math.tan(effectiveFov*Math.PI/360),aspect=width/height,near=.02;
    const cameraPoint=local=>{const r=sub(add(event.center,Space.contracted(local,event.velocity)),event.camera);return [dot(r,right),dot(r,up),dot(r,forward)];};
    const screen=p=>[width*(.5+p[0]/(2*p[2]*aspect*tan)),height*(.5-p[1]/(2*p[2]*tan))];
    const shape=state.shape==='sphere'?'sphere':state.shape==='artifact'?'bevel':'box',parts=[{shape,half:M.objectHalf(state.environment,state.shape),center:[0,0,0],axis:M.objectBevel(state.environment,state.shape)}];
    if(shape!=='sphere')for(const part of M.objectParts(state.environment,state.shape))parts.push({shape:part.primitive==='cylinder'?'cylinder':'box',...part});
    return parts.map(part=>{
      const geometry=mesh(part.shape,part.half,part.center,part.axis),cam=geometry.vertices.map(cameraPoint),front=cam.filter(v=>v[2]>=near);
      // Clip actual mesh edges to the near plane. This stays bounded even if
      // the camera crosses a finely tessellated sphere during playback.
      for(const [i,j] of geometry.edges){const a=cam[i],b=cam[j];if((a[2]>=near)===(b[2]>=near))continue;const t=(near-a[2])/(b[2]-a[2]);front.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),near]);}
      return hull(front.map(screen));
    }).filter(poly=>poly.length>=3);
  }
  // Project a laboratory-simultaneous vector; it deliberately does not claim
  // to be emitted light or visible geometry, and may be drawn through objects.
  function velocityProjection(state,event,width,height,effectiveFov){
    const v=state.scenario==='flyby'?event.velocity:event.observerVelocity,n=M.length(v);
    if(n<1e-9)return null;
    const cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),sy=Math.sin(state.yaw),cy=Math.cos(state.yaw);
    const forward=[sy*cp,sp,cy*cp],right=[cy,0,-sy],up=[-sy*sp,cp,-cy*sp],tan=Math.tan(effectiveFov*Math.PI/360),aspect=width/height;
    // For a photograph, anchor the constant-velocity glyph at the centre's
    // past-cone event so it stays near the apparent subject. A geometry-only
    // view instead uses the simultaneous centre. The arrow remains a diagram.
    let anchor;
    if(state.scenario==='flyby'){
      anchor=event.center;
      if(state.view!=='geometry'){
        const r=M.sub(event.center,event.camera),b2=M.dot(v,v),bv=M.dot(r,v),den=Math.sqrt(bv*bv+(1-b2)*M.dot(r,r))+bv;
        if(den>1e-12)anchor=M.sub(event.center,M.scale(v,M.dot(r,r)/den));
      }
    }else{
      // The observer is at the eye; use an auxiliary point in front instead
      // of projecting a vector based at zero camera distance.
      const forwardLab=state.view==='geometry'?forward:M.observerToLab(forward,event.observerVelocity);
      anchor=M.add(event.camera,M.add(M.scale(forwardLab,5),M.scale(right,-1.3)));
    }
    const end=M.add(anchor,M.scale(v,2.2/n));
    function screen(p){let r=M.sub(p,event.camera);if(state.scenario==='observer'&&state.view!=='geometry')r=M.labToObserver(r,event.observerVelocity);const z=M.dot(r,forward);if(z<.00001)return null;return [width*(.5+M.dot(r,right)/(2*z*aspect*tan)),height*(.5-M.dot(r,up)/(2*z*tan))];}
    const a=screen(anchor),b=screen(end);if(!a||!b)return null;
    return {a,b,velocity:v.slice(),anchor,end};
  }
  function drawVelocity(ctx,state,event,width,height,effectiveFov){
    const p=velocityProjection(state,event,width,height,effectiveFov);if(!p)return;
    const [x,y]=p.a,[ex,ey]=p.b,dx=ex-x,dy=ey-y,len=Math.hypot(dx,dy);
    if(Math.max(Math.abs(x),Math.abs(y),Math.abs(ex),Math.abs(ey))>4*Math.max(width,height))return;
    function label(text,atX,atY,gap){
      ctx.font='600 11px "Noto Sans SC Variable", sans-serif';ctx.lineWidth=3;ctx.strokeStyle='#102327';ctx.fillStyle='#ffe3c2';
      const textWidth=ctx.measureText(text).width;let tx=atX+gap;if(tx+textWidth>width-4)tx=atX-gap-textWidth;
      tx=Math.max(4,Math.min(width-textWidth-4,tx));const ty=Math.max(13,Math.min(height-4,atY-7));
      ctx.strokeText(text,tx,ty);ctx.fillText(text,tx,ty);
    }
    if(len<5){
      // A vector exactly along the viewing ray has no 2D arrow length. Use
      // the conventional dot/cross end-on symbol instead of silently losing
      // the requested velocity indicator (out of / into the screen).
      const outward=dot(p.velocity,sub(p.anchor,event.camera))<0;
      ctx.save();ctx.lineCap='round';ctx.lineWidth=4;ctx.strokeStyle='#102327';ctx.beginPath();ctx.arc(x,y,7,0,2*Math.PI);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#ffc896';ctx.stroke();
      if(outward){ctx.beginPath();ctx.arc(x,y,2.3,0,2*Math.PI);ctx.fillStyle='#ffc896';ctx.fill();}
      else{ctx.beginPath();ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x+3,y-3);ctx.lineTo(x-3,y+3);ctx.stroke();}
      label('v · 向屏幕'+(outward?'外':'里'),x,y,11);ctx.restore();return;
    }
    const ux=dx/len,uy=dy/len,h=Math.min(12,len*.4);
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.moveTo(ex-ux*h-uy*h*.48,ey-uy*h+ux*h*.48);ctx.lineTo(ex,ey);ctx.lineTo(ex-ux*h+uy*h*.48,ey-uy*h-ux*h*.48);
    ctx.lineWidth=5;ctx.strokeStyle='rgba(9,24,27,.9)';ctx.stroke();ctx.lineWidth=2.2;ctx.strokeStyle='#ffc896';ctx.stroke();
    label('v · 实验室方向',ex,ey,7);ctx.restore();
  }
  function draw(canvas,state,event,effectiveFov){
    const width=canvas.clientWidth||canvas.width,height=canvas.clientHeight||canvas.height,dpr=Math.min(typeof devicePixelRatio==='number'?devicePixelRatio:1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const polygons=state.contour&&state.scenario==='flyby'&&state.view!=='geometry'?project(state,event,width,height,effectiveFov):[];
    const secondEvent=event.second?{...event,center:event.second.center,velocity:event.second.velocity,second:null}:null;
    if(secondEvent&&state.contour&&state.view!=='geometry')polygons.push(...project(state,secondEvent,width,height,effectiveFov));
    ctx.save();if(state.view==='split'){ctx.beginPath();ctx.rect(0,0,width*state.split,height);ctx.clip();}
    ctx.lineJoin='round';ctx.setLineDash([7,4]);
    for(const polygon of polygons){
      ctx.beginPath();ctx.moveTo(polygon[0][0],polygon[0][1]);for(let i=1;i<polygon.length;i++)ctx.lineTo(polygon[i][0],polygon[i][1]);ctx.closePath();
      ctx.lineWidth=3.6;ctx.strokeStyle='rgba(8,22,27,.9)';ctx.stroke();ctx.lineWidth=1.6;ctx.strokeStyle='#83f4e5';ctx.stroke();
    }ctx.restore();
    if(state.velocityArrow){drawVelocity(ctx,state,event,width,height,effectiveFov);if(secondEvent)drawVelocity(ctx,state,secondEvent,width,height,effectiveFov);}
    return polygons.length;
  }
  return Object.freeze({points,hull,project,velocityProjection,draw});
});
