/* Interactive third-person view of the independent moving-mirror experiment. */
(function(){
  'use strict';
  const M=window.RelativityMirror,$=id=>document.getElementById(id),dialog=$('mirror-dialog'),canvas=$('mirror-canvas'),ctx=canvas.getContext('2d');
  let model=null,yaw=-.65,pitch=.52,drag=null,playing=false,frame=0,last=0;const ids=['beta','angle','velocity-angle','incident-angle'];
  const num=x=>Number.isFinite(x)?(Math.abs(x)<.0005?0:x).toFixed(3):'—',vec=v=>'('+v.map(x=>num(x)).join(', ')+')';
  function params(){return {beta:Number($('mirror-beta').value),mirrorAngle:Number($('mirror-angle').value),velocityAngle:Number($('mirror-velocity-angle').value),incidentAngle:Number($('mirror-incident-angle').value),wavelength:Number($('wavelength').value)};}
  function endTime(){return model.detector?.time||model.meeting?.time*1.5||12;}
  function update(){
    ids.forEach(id=>{$('mirror-'+id+'-value').textContent=(id==='beta'?(Number($('mirror-'+id).value)>0?'+':'')+Number($('mirror-'+id).value).toFixed(2):$('mirror-'+id).value+'°');});
    model=M.solve(params());const out=$('mirror-readout');dialog.dataset.status=model.status;dialog.dataset.frequency=model.reflected?num(model.reflected.frequencyRatio):'';dialog.dataset.meeting=model.meeting?num(model.meeting.time):'';
    if(model.status==='parallel')out.textContent='光线与镜面世界管平行：没有相遇。';
    else if(model.status==='past')out.textContent='无限延拓平面的相遇事件在发射前；未来不发生反射。';
    else if(model.status==='miss')out.textContent='光线在 t = '+num(model.meeting.time)+' 穿过无限延拓平面，但位于有限镜片外；没有反射。';
    else{
      const r=model.reflected,d=model.detector,normalCase=Math.abs(model.mirrorAngle)<1e-12&&Math.abs(model.velocityAngle)<1e-12&&Math.abs(model.incidentAngle)<1e-12;
      out.innerHTML='<strong>相遇事件</strong> t = '+num(model.meeting.time)+'<br>x = '+vec(model.meeting.point)+'<br>静止系入射 → 反射<br>'+vec(r.restIncoming)+' → '+vec(r.restOutgoing)+'<br><strong>双程频率比</strong> '+num(r.frequencyRatio)+'<br>观察波长 '+num(r.wavelength)+' nm<br>'+(d?'接收面到达 t = '+num(d.time)+'<br>接收位置 '+vec(d.point):'反射光没有前向穿过 x=0 接收面')+(normalCase?'<br>解析值 (1−β)/(1+β) = '+num((1-model.beta)/(1+model.beta)):'');
    }draw();
  }
  function draw(){
    if(!dialog.open||!model)return;canvas.dataset.cameraYaw=yaw.toFixed(4);canvas.dataset.cameraPitch=pitch.toFixed(4);const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height)),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#142d32');gradient.addColorStop(1,'#09181e');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    const t=endTime()*Number($('mirror-time').value)/1000; $('mirror-time-label').textContent=num(t);dialog.dataset.time=num(t);
    const center=M.add(model.center0,M.mul(model.velocity,t));
    const corners=c=>[-1,1].flatMap(a=>[-1,1].map(b=>M.add(c,M.simultaneous(M.add(M.mul(model.tangent,a*model.halfWidth),M.mul(model.vertical,b*model.halfHeight)),model.velocity))));
    const plate=corners(center),ghost=model.meeting?corners(model.meeting.center):[],phit=model.meeting?.point,det=model.detector?.point;
    const outgoingEnd=model.reflected?M.add(phit,M.mul(model.reflected.outgoing,(model.detector?.delay||Math.max(model.meeting.time*.5,4)))):null;
    let photon=M.mul(model.incoming,t);if(model.status==='hit'&&t>=model.meeting.time)photon=M.add(phit,M.mul(model.reflected.outgoing,Math.min(t-model.meeting.time,model.detector?.delay||Infinity)));
    const pts=[model.origin,...plate,...ghost,...(phit?[phit]:[]),...(det?[det]:[]),...(outgoingEnd?[outgoingEnd]:[]),photon];
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const rotate=p=>{const x=cy*p[0]-sy*p[2],z=sy*p[0]+cy*p[2];return [x,cp*p[1]-sp*z];};
    const projected=pts.map(rotate),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=Math.min((w-70)/Math.max(2,xmax-xmin),(h-70)/Math.max(2,ymax-ymin)),cx=(xmin+xmax)/2,cy0=(ymin+ymax)/2;
    const P=p=>{const q=rotate(p);return [w/2+(q[0]-cx)*scale,h/2-(q[1]-cy0)*scale];};
    function line(a,b,color,width=1,dash=[]){const x=P(a),y=P(b);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(...x);ctx.lineTo(...y);ctx.stroke();ctx.restore();}
    function dot(p,color,label){const [x,y]=P(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();if(label){ctx.font='11px "Noto Sans SC Variable",sans-serif';ctx.fillText(label,x+7,y-7);}}
    function polygon(c,color,stroke,dash=[]){ctx.save();ctx.fillStyle=color;ctx.strokeStyle=stroke;ctx.setLineDash(dash);ctx.beginPath();[0,1,3,2].forEach((i,n)=>{const p=P(c[i]);n?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
    for(let i=-3;i<=3;i++)line([0,-2,i*2],[Math.max(8,model.meeting?.point[0]||8),-2,i*2],'#315057',.6);
    line(model.origin,phit||M.add(model.origin,M.mul(model.incoming,endTime())),'#74cbd0',2,[6,4]);
    if(outgoingEnd)line(phit,outgoingEnd,'#efaa79',2,[6,4]);
    if(ghost.length)polygon(ghost,'#d9f3ef0a','#b1d4d3',[4,3]);polygon(plate,'#85c3c759','#c7eeee');
    dot(model.origin,'#8adad8','发射');if(phit)dot(phit,model.status==='hit'?'#ffce9e':'#b6c2bb',model.status==='hit'?'相遇':'越过延拓面');if(det)dot(det,'#e6ab7f','接收面');dot(photon,'#fff2ce','光脉冲');
    const arrow=M.add(center,M.mul(model.velocity,Math.min(5,Math.max(1,Math.abs(model.beta)*5))));line(center,arrow,'#f3c6a4',2);dot(arrow,'#f3c6a4','v');
    ctx.fillStyle='#bed3ce';ctx.font='10px "Noto Sans SC Variable",sans-serif';ctx.fillText('实验室同时空间  ·  c = 1',12,19);
  }
  function tick(ts){if(!playing||!dialog.open){frame=0;return;}if(last){const x=Number($('mirror-time').value)+(ts-last)*.12;$('mirror-time').value=x>=1000?0:x;draw();}last=ts;frame=requestAnimationFrame(tick);}
  function stop(){playing=false;last=0;if(frame)cancelAnimationFrame(frame);frame=0;$('mirror-animate').textContent='播放';}
  $('open-mirror-lab').addEventListener('click',()=>{stop();$('mirror-beta').value=$('beta').value;$('mirror-time').value=0;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');update();if(document.fonts?.load)document.fonts.load('11px "Noto Sans SC Variable"','实验室同时空间发射相遇越过延拓面接收光脉冲').then(draw).catch(()=>{});});
  $('close-mirror-lab').addEventListener('click',()=>{stop();dialog.close?dialog.close():dialog.removeAttribute('open');});dialog.addEventListener('close',stop);
  ids.forEach(id=>$('mirror-'+id).addEventListener('input',update));$('mirror-time').addEventListener('input',()=>{stop();draw();});
  $('mirror-normal-case').addEventListener('click',()=>{for(const id of ['angle','velocity-angle','incident-angle'])$('mirror-'+id).value=0;update();});
  $('mirror-animate').addEventListener('click',()=>{if(playing){stop();return;}playing=true;last=0;$('mirror-animate').textContent='暂停';frame=requestAnimationFrame(tick);});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.01;pitch=Math.max(-1.3,Math.min(1.3,drag.pitch+(e.clientY-drag.y)*.01));draw();});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')yaw-=.12;else if(e.key==='ArrowRight')yaw+=.12;else if(e.key==='ArrowUp')pitch=Math.max(-1.3,pitch-.12);else if(e.key==='ArrowDown')pitch=Math.min(1.3,pitch+.12);else if(e.key==='Home'){yaw=-.65;pitch=.52;}else return;e.preventDefault();draw();});
  if('ResizeObserver'in window)new ResizeObserver(()=>draw()).observe(canvas);
})();
