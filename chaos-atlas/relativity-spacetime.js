/* A 1+1-dimensional projection of actual laboratory events. Discarding two
 * spatial coordinates means a projected photon need not lie on a 45° line. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'));
  else root.RelativitySpacetime=factory(root.RelativityModel);
})(typeof globalThis==='object'?globalThis:this,function(M){
  'use strict';
  const colors={observer:'#f1f4e9',center:'#9bb7b0',M:'#f4d38a',A:'#7ad9d1',B:'#ffbd87','当前':'#ffbd87'};
  const dot=M.dot,add=M.add,scale=M.scale,sub=M.sub;
  function axisVector(axis,space){
    if(axis==='y')return [0,1,0];if(axis==='z')return [0,0,1];
    if(axis==='sight'){
      const ray=space.rays.find(r=>r.id==='B')||space.rays.find(r=>r.mode==='photon')||space.rays[0];
      if(ray&&ray.direction&&M.length(ray.direction)>1e-12)return M.normalize(ray.direction);
      if(space.marker&&space.observation){const d=sub(space.marker.emission.point,space.observation.point);if(M.length(d)>1e-12)return M.normalize(d);}
    }
    return [1,0,0];
  }
  function build(space,axis='x'){
    if(!space||!space.observation)return {observation:null,axis,lines:[],events:[],photons:[],timeline:[]};
    const observation={point:space.observation.point.slice(),time:space.observation.time},at=observation.time,unit=axisVector(axis,space);
    const lines=[{id:'observer',point:observation.point.slice(),time:at,velocity:(space.observerVelocity||[0,0,0]).slice()}],events=[{id:'O',point:observation.point.slice(),time:at,kind:'observation'}],photons=[];
    if(space.object)lines.push({id:'center',point:space.object.center.slice(),time:at,velocity:space.object.velocity.slice()});
    for(const ray of space.rays){
      if(!ray.point)continue;
      if(ray.mode==='photon'){
        const sourceVelocity=ray.body&&space.object?space.object.velocity:[0,0,0];
        lines.push({id:ray.id,point:ray.point.slice(),time:ray.emittedAt,velocity:sourceVelocity.slice()});
        const start={id:ray.id,point:ray.point.slice(),time:ray.emittedAt,kind:'emission'};events.push(start);photons.push({id:ray.id,start,end:events[0]});
      }else if(ray.mode==='slice'){
        // A slice hit has a valid material/scene worldline, but no emission
        // event and no photon connecting it to the observer.
        const sourceVelocity=ray.body&&space.object?space.object.velocity:[0,0,0];
        lines.push({id:ray.id,point:ray.point.slice(),time:at,velocity:sourceVelocity.slice()});
        events.push({id:ray.id,point:ray.point.slice(),time:at,kind:'slice'});
      }
    }
    if(space.marker){
      const marker=space.marker,v=space.object?.velocity||[0,0,0],visible=marker.emission.visibility.status==='visible';
      lines.push({id:'M',point:marker.simultaneous.point.slice(),time:at,velocity:v.slice()});
      events.push({id:'M同时',point:marker.simultaneous.point.slice(),time:at,kind:'simultaneous'});
      const start={id:'M',point:marker.emission.point.slice(),time:marker.emission.time,kind:visible?'emission':'blocked'};events.push(start);
      if(visible)photons.push({id:'M',start,end:events[0]});
    }
    const relevant=events.filter(e=>e.kind==='emission'||e.kind==='blocked'||e.kind==='observation'),earliest=Math.min(at,...relevant.map(e=>e.time)),span=Math.max(2,at-earliest);
    const minTime=earliest-.12*span,maxTime=at+.20*span;
    const coordinate=point=>dot(sub(point,observation.point),unit),position=(line,time)=>add(line.point,scale(line.velocity,time-line.time));
    const xs=events.map(e=>coordinate(e.point));for(const line of lines){xs.push(coordinate(position(line,minTime)),coordinate(position(line,maxTime)));}
    // Include the bounding 45-degree lines of the projected past light cone.
    xs.push(-(at-minTime),at-minTime);
    let minX=Math.min(...xs),maxX=Math.max(...xs);const margin=Math.max(1,(maxX-minX)*.08);minX-=margin;maxX+=margin;
    const timeline=relevant.map(e=>({id:e.id,time:e.time,kind:e.kind})).sort((a,b)=>a.time-b.time);
    return {observation,axis,unit,lines,events,photons,timeline,minTime,maxTime,minX,maxX,coordinate};
  }
  function draw(canvas,model){
    const w=Math.max(1,canvas.clientWidth||canvas.width),h=Math.max(1,canvas.clientHeight||canvas.height),dpr=Math.min(typeof devicePixelRatio==='number'?devicePixelRatio:1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#142b34');bg.addColorStop(1,'#0b171c');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.font='11px "Noto Sans SC Variable",sans-serif';
    if(!model.observation){ctx.fillStyle='#d6e3dc';ctx.fillText('等待与画面一致的观察事件…',20,35);return;}
    const left=54,right=w-18,top=22,bottom=h-70,width=Math.max(1,right-left),height=Math.max(1,bottom-top),sx=model.maxX-model.minX,st=model.maxTime-model.minTime;
    const zoom=Math.min(width/sx,height/st),cx=(model.minX+model.maxX)/2,ct=(model.minTime+model.maxTime)/2;
    const px=x=>(left+right)/2+(x-cx)*zoom,py=t=>(top+bottom)/2-(t-ct)*zoom;
    function xy(e){return [px(model.coordinate(e.point)),py(e.time)];}
    function line(a,b,color,thickness=1,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);}
    function point(e,color,open=false){const q=xy(e);ctx.beginPath();ctx.arc(q[0],q[1],open?4.5:4,0,2*Math.PI);ctx.fillStyle=open?'#142b34':color;ctx.fill();ctx.lineWidth=1.6;ctx.strokeStyle=color;ctx.stroke();}
    const occupied=[];
    function label(e,text,color,dx=7,dy=-7){
      const q=xy(e),tw=ctx.measureText(text).width;
      const choices=[[dx,dy],[7,12],[-tw-7,-7],[-tw-7,12],[7,-21],[-tw-7,-21],[7,26],[-tw-7,26]];
      let chosen=null;
      for(const [ox,oy] of choices){
        const x=Math.max(left,Math.min(right-tw,q[0]+ox)),y=Math.max(top+11,Math.min(bottom-2,q[1]+oy)),rect={x:x-2,y:y-11,w:tw+4,h:13};
        if(!occupied.some(r=>rect.x<r.x+r.w&&rect.x+rect.w>r.x&&rect.y<r.y+r.h&&rect.y+rect.h>r.y)){chosen={x,y,rect};break;}
      }
      if(!chosen){const x=Math.max(left,Math.min(right-tw,q[0]+dx)),y=Math.max(top+11,Math.min(bottom-2,q[1]+dy));chosen={x,y,rect:{x:x-2,y:y-11,w:tw+4,h:13}};}
      occupied.push(chosen.rect);ctx.fillStyle=color;ctx.lineWidth=3;ctx.strokeStyle='#102027';ctx.strokeText(text,chosen.x,chosen.y);ctx.fillText(text,chosen.x,chosen.y);
    }
    ctx.save();ctx.beginPath();ctx.rect(left,top,width,height);ctx.clip();
    // One common scale for x and ct: the projected cone boundaries are 45°.
    const obs=model.observation,age=obs.time-model.minTime,O=xy({point:obs.point,time:obs.time});
    ctx.fillStyle='rgba(121,171,164,.07)';ctx.beginPath();ctx.moveTo(...O);ctx.lineTo(px(-age),py(model.minTime));ctx.lineTo(px(age),py(model.minTime));ctx.closePath();ctx.fill();
    line(O,[px(-age),py(model.minTime)],'rgba(163,195,182,.24)',1,[4,5]);line(O,[px(age),py(model.minTime)],'rgba(163,195,182,.24)',1,[4,5]);
    line([left,py(obs.time)],[right,py(obs.time)],'rgba(205,222,209,.28)',1,[3,5]);
    for(const worldline of model.lines){
      const at=t=>({point:add(worldline.point,scale(worldline.velocity,t-worldline.time)),time:t}),color=colors[worldline.id]||'#ffbd87';
      line(xy(at(model.minTime)),xy(at(model.maxTime)),color,worldline.id==='observer'||worldline.id==='M'?1.8:1,worldline.id==='center'?[3,5]:worldline.id==='observer'?[]:[5,5]);
    }
    for(const photon of model.photons)line(xy(photon.start),xy(photon.end),colors[photon.id]||'#ffbd87',2.1);
    for(const e of model.events){const color=colors[e.id]||((e.id==='M同时')?colors.M:colors.observer);point(e,color,e.kind==='blocked'||e.kind==='slice'||e.kind==='simultaneous');label(e,e.id+(e.kind==='blocked'?' ×':''),color,e.id==='O'?7:6,e.id==='M同时'?14:-7);}
    ctx.restore();
    ctx.fillStyle='#b8d2c7';ctx.fillText('ct',12,26);ctx.fillText(model.axis==='sight'?'视线投影 →':model.axis+' →',Math.max(left,right-60),bottom+17);
    ctx.fillText('t='+obs.time.toFixed(2),7,Math.max(top+12,Math.min(bottom-2,py(obs.time)+4)));
    // Separate, chronological ruler. It shares event times with the plot,
    // but is not a second spatial axis or an animation of photon travel.
    const y=h-27,x1=left,x2=right,begin=Math.min(...model.timeline.map(e=>e.time)),end=obs.time,denom=Math.max(1e-9,end-begin);
    line([x1,y],[x2,y],'#728e82',1);ctx.fillStyle='#c2d9ce';ctx.fillText('过去',x1,y+16);ctx.fillText('观察',x2-27,y+16);
    // Nearby events share a time ruler but their names need separate lanes;
    // never move their ticks or change the actual time coordinates.
    const laneEnds=[-Infinity,-Infinity,-Infinity,-Infinity];
    model.timeline.forEach(e=>{
      const x=x1+(e.time-begin)/denom*(x2-x1),color=colors[e.id]||colors.observer,text=e.id+(e.kind==='blocked'?'×':''),tw=ctx.measureText(text).width,tx=Math.max(x1,Math.min(x2-tw,x-tw/2));
      line([x,y-5],[x,y+5],color,2);let lane=laneEnds.findIndex(end=>tx>=end+4);if(lane<0)lane=laneEnds.indexOf(Math.min(...laneEnds));laneEnds[lane]=tx+tw;
      ctx.fillStyle=color;ctx.fillText(text,tx,y-8-lane*12);
    });
  }
  return Object.freeze({build,draw,axisVector});
});
