/* Independent interactive two-ended light clock, in lab-simultaneous 3D. */
(function(){
  'use strict';const C=window.RelativityLightClock,$=id=>document.getElementById(id),dialog=$('clock-dialog'),canvas=$('clock-canvas'),ctx=canvas.getContext('2d');
  let model=null,yaw=-.65,pitch=.5,drag=null,playing=false,frame=0,last=0;const n=x=>Number.isFinite(x)?(Math.abs(x)<.0005?0:x).toFixed(3):'—';
  function endTime(){return Math.max(...model.events.map(e=>e.arrival),model.events.at(-1).time)*1.04;}
  function update(){
    const beta=Number($('clock-beta').value),angle=Number($('clock-angle').value),arm=Number($('clock-arm').value);
    $('clock-beta-value').textContent=(beta>0?'+':'')+beta.toFixed(2);$('clock-angle-value').textContent=angle+'°';$('clock-arm-value').textContent=arm.toFixed(1);
    model=C.create({beta,angle,arm});dialog.dataset.beta=String(beta);dialog.dataset.angle=String(angle);dialog.dataset.roundProper=n(model.roundTripProper);dialog.dataset.roundLab=n(model.roundTripLab);
    $('clock-events').innerHTML=model.events.map((e,i)=>'<tr data-clock-event="'+i+'"><td>'+(i===0?'发射 A':e.end+' 反射 '+i)+'</td><td>'+n(e.proper)+'</td><td>'+n(e.time)+'</td><td>'+n(e.arrival)+'</td></tr>').join('');draw();
  }
  function draw(){
    if(!dialog.open||!model)return;canvas.dataset.cameraYaw=yaw.toFixed(4);canvas.dataset.cameraPitch=pitch.toFixed(4);const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height)),dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#142d32');g.addColorStop(1,'#09181e');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const time=endTime()*Number($('clock-time').value)/1000,instant=model.at(time);$('clock-time-label').textContent=n(time);dialog.dataset.time=n(time);dialog.dataset.clockA=n(instant.clockA);dialog.dataset.clockB=n(instant.clockB);
    $('clock-readout').innerHTML='<strong>两端同时读数</strong><br>A = '+n(instant.clockA)+'　B = '+n(instant.clockB)+'<br>B − A = '+n(instant.clockB-instant.clockA)+'<br><strong>A → B → A</strong><br>固有周期 2L = '+n(model.roundTripProper)+'<br>实验室周期 2γL = '+n(model.roundTripLab)+'<br>γ = '+n(model.gamma);
    for(const e of model.events){const row=$('clock-events').children[e.index];if(row)row.classList.toggle('is-now',time>=e.time&&time<e.arrival);}
    const tangent=[-model.axis[2],0,model.axis[0]],vertical=[0,1,0];
    const plate=center=>[-1,1].flatMap(a=>[-1,1].map(b=>C.add(center,C.simultaneous(C.add(C.mul(tangent,a*.55),C.mul(vertical,b*.65)),model.velocity))));
    const plateA=plate(instant.a),plateB=plate(instant.b),future=model.events.map(e=>e.position),points=[model.detector,...plateA,...plateB,...future,...(instant.photon?[instant.photon]:[]),...instant.flashes.map(f=>f.position)];
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),rotate=p=>{const x=cy*p[0]-sy*p[2],z=sy*p[0]+cy*p[2];return [x,cp*p[1]-sp*z];};
    const q=points.map(rotate),xs=q.map(x=>x[0]),ys=q.map(x=>x[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=Math.min((w-70)/Math.max(3,xmax-xmin),(h-70)/Math.max(3,ymax-ymin)),cx=(xmin+xmax)/2,cy0=(ymin+ymax)/2;
    const P=p=>{const v=rotate(p);return [w/2+(v[0]-cx)*scale,h/2-(v[1]-cy0)*scale];};
    function line(a,b,color,width=1,dash=[]){const x=P(a),y=P(b);ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(...x);ctx.lineTo(...y);ctx.stroke();ctx.restore();}
    function dot(p,color,label,r=4){const [x,y]=P(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();if(label){ctx.font='11px "Noto Sans SC Variable",sans-serif';ctx.fillText(label,x+7,y-7);}}
    function mirror(p){ctx.fillStyle='#8bc7c751';ctx.strokeStyle='#b5e2dd';ctx.lineWidth=1.2;ctx.beginPath();[0,1,3,2].forEach((i,k)=>{const q=P(p[i]);k?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.closePath();ctx.fill();ctx.stroke();}
    for(let z=-3;z<=3;z++)line([0,-1.3,z*2],[Math.max(10,...future.map(p=>p[0])),-1.3,z*2],'#315057',.6);
    for(const e of model.events)if(time>=e.time)line(e.position,model.detector,time<e.arrival?'#d5a17a99':'#806d6066',1,[4,5]);
    for(let i=0;i<model.events.length-1;i++)line(model.events[i].position,model.events[i+1].position,'#4e8c8999',1,[3,5]);
    line(instant.a,instant.b,'#bdddd5',2);mirror(plateA);mirror(plateB);dot(instant.a,'#c8eeeb','A  '+n(instant.clockA),5);dot(instant.b,'#c8eeeb','B  '+n(instant.clockB),5);
    if(instant.photon)dot(instant.photon,'#8bf0e6','镜间脉冲',4);for(const flash of instant.flashes)dot(flash.position,'#ffc08e','',3);dot(model.detector,'#f5c09b','静止接收器',5);
    ctx.fillStyle='#bed3ce';ctx.font='10px "Noto Sans SC Variable",sans-serif';ctx.fillText('实验室同时位置  ·  c = 1',12,19);
  }
  function tick(ts){if(!playing||!dialog.open){frame=0;return;}if(last){const x=Number($('clock-time').value)+(ts-last)*.12;$('clock-time').value=x>=1000?0:x;draw();}last=ts;frame=requestAnimationFrame(tick);}
  function stop(){playing=false;last=0;if(frame)cancelAnimationFrame(frame);frame=0;$('clock-animate').textContent='播放';}
  $('open-light-clock').addEventListener('click',()=>{stop();$('clock-beta').value=$('beta').value;$('clock-time').value=0;if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');update();if(document.fonts?.load)document.fonts.load('11px "Noto Sans SC Variable"','实验室同时位置镜间脉冲静止接收器').then(draw).catch(()=>{});});
  $('close-light-clock').addEventListener('click',()=>{stop();dialog.close?dialog.close():dialog.removeAttribute('open');});dialog.addEventListener('close',stop);
  for(const id of ['beta','angle','arm'])$('clock-'+id).addEventListener('input',update);document.querySelectorAll('[data-clock-angle]').forEach(b=>b.addEventListener('click',()=>{$('clock-angle').value=b.dataset.clockAngle;update();}));
  $('clock-time').addEventListener('input',()=>{stop();draw();});$('clock-animate').addEventListener('click',()=>{if(playing){stop();return;}playing=true;last=0;$('clock-animate').textContent='暂停';frame=requestAnimationFrame(tick);});
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.01;pitch=Math.max(-1.3,Math.min(1.3,drag.pitch+(e.clientY-drag.y)*.01));draw();});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')yaw-=.12;else if(e.key==='ArrowRight')yaw+=.12;else if(e.key==='ArrowUp')pitch=Math.max(-1.3,pitch-.12);else if(e.key==='ArrowDown')pitch=Math.min(1.3,pitch+.12);else if(e.key==='Home'){yaw=-.65;pitch=.5;}else return;e.preventDefault();draw();});
  if('ResizeObserver'in window)new ResizeObserver(()=>draw()).observe(canvas);
})();
