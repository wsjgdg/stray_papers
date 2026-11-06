/* Old tear scene v2: a subdivided printed ledger, local fold, lighting and a
   custom printed texture. One progress state drives physics, geometry, grip,
   shadow, warning reveal and text. No network, account or progress access. */
(function () {
  'use strict';
  var stage=document.getElementById('theater'), canvas=document.getElementById('paper-canvas');
  var grip=document.getElementById('paper-grip'), fallback=document.getElementById('paper-fallback');
  var underlay=document.getElementById('underlay'), scene=document.getElementById('scene');
  var titleButton=document.getElementById('title-reveal'), step=document.getElementById('insight-step'), copy=document.getElementById('insight-copy');
  var reset=document.getElementById('restore'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  var p=0,target=0,v=0,speed=0,grabY=0,pointer=[.5,.5],lastX=0,startX=0,startP=0,lastTime=0,recentSpeed=0;
  var dragging=false,activePointer=null,suppressClick=false,bucket=-1,visible=true,raf=0,lastFrame=0;
  var paperW=0,paperH=0,stageW=0,stageH=0,uvSize=[.78,.7],mobile=false,centerX=.70,centerY=.44;
  var gl,program,loc={},mesh,tex,textureCanvas,textureContext,indicesCount=0,hasWebGL=false;
  var vertex=[
    'attribute vec2 aUv; varying vec2 vUv; varying vec3 vNormal; varying float vCurl; varying float vDepth;',
    'uniform float uP,uGrabY,uSpeed,uTime,uShadow; uniform vec2 uSize,uPointer,uOrigin;',
    'void main(){',
    'vUv=aUv; float x=aUv.x*2.-1.; float y=aUv.y*2.-1.;',
    'float fold=1.14-uP*2.29 + uP*(y-uGrabY)*.19 + uP*.025*sin(y*10.+uGrabY*4.);',
    'float d=max(0.,x-fold); float r=.19+uSpeed*.085;',
    'float theta=min(3.14159,d/r); float xp=x; float z=0.;',
    'if(d>0.){if(d<3.14159*r){xp=fold+r*sin(theta);z=r*(1.-cos(theta));}',
    'else{xp=fold-(d-3.14159*r)*.73;z=2.*r+.04*(d-3.14159*r);}}',
    'float affected=smoothstep(.0,.18,d)*exp(-d*1.7);',
    'float flutter=uSpeed*.042*affected*sin(y*16.+uTime*12.);',
    'z+=flutter; y+=flutter*.3;',
    'vNormal=normalize(d==0.?vec3(0.,0.,1.):d<3.14159*r?vec3(-sin(theta),.09*sin(y*9.),cos(theta)):vec3(-.04,.03,-1.));',
    'vCurl=clamp(d/(3.14159*r),0.,1.);vDepth=z;',
    'if(uShadow>.5){xp+=.07+uP*.07;y-=.09;z=-.2;}',
    'xp-=smoothstep(.55,1.,uP)*2.7;',
    'vec2 cam=(uPointer-vec2(.5))*.065*(1.-uP*.65);',
    'float w=1.-max(0.,z)*.33;',
    'gl_Position=vec4(vec2(xp,y)*uSize+cam+uOrigin*w,-z*.22+(uShadow>.5?.66:0.),w);',
    '}'
  ].join('\n');
  var fragment=[
    'precision highp float; varying vec2 vUv; varying vec3 vNormal; varying float vCurl,vDepth;',
    'uniform sampler2D uPaper; uniform float uSpeed,uP,uShadow,uTime;',
    'void main(){',
    'if(uShadow>.5){gl_FragColor=vec4(.0,.012,.019,.24*(1.-uP*.32));return;}',
    'float edge=1.-max(abs(vUv.x-.5),abs(vUv.y-.5))*2.;',
    'float fiber=fract(sin(dot(floor(vUv*vec2(1032.,786.)),vec2(12.9898,78.233)))*43758.5453);',
    'float rag=.003+(.0035*sin(vUv.y*115.)+.002*sin(vUv.y*231.))*smoothstep(.1,1.,uP);',
    'if(vUv.x>1.-rag || vUv.y<.003 || vUv.y>.997) discard;',
    'vec3 ink=texture2D(uPaper,vUv).rgb;',
    'vec3 norm=normalize(vNormal); float light=.67+.36*max(-.25,dot(norm,normalize(vec3(-.55,.62,.7))));',
    'float underside=1.-smoothstep(-.18,.06,norm.z);',
    'vec3 back=mix(vec3(.38,.51,.47),ink*.50+vec3(.29,.39,.34),.42);',
    'vec3 col=mix(ink*light,back*(.76+.28*abs(norm.z)),underside);',
    'float spec=pow(max(0.,dot(reflect(normalize(vec3(.5,-.6,-.8)),norm),normalize(vec3(0.,0.,1.)))),20.);',
    'col+=vec3(.41,.33,.19)*spec*.27*(1.-underside);',
    'col*=1.-.23*exp(-edge*48.);',
    'col+=vec3(.08,.05,.023)*(fiber-.5);',
    'col+=vec3(.24,.11,.04)*exp(-abs(vCurl-.51)*18.)*.24;',
    'gl_FragColor=vec4(clamp(col,0.,1.),1.);',
    '}'
  ].join('\n');
  function clamp(a,lo,hi){return Math.max(lo,Math.min(hi,a));}
  function compile(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.warn('Material shader fallback:',gl.getShaderInfoLog(s));gl.deleteShader(s);return null;}return s;}
  function setup(){
    try{
      gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:true,powerPreference:'low-power'});
      if(!gl)return;
      var vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
      if(!vs||!fs)return;
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS)){console.warn('Material program fallback:',gl.getProgramInfoLog(program));return;}
      gl.useProgram(program);
      var positions=[],indices=[],cols=80,rows=48;
      for(var j=0;j<=rows;j++)for(var i=0;i<=cols;i++)positions.push(i/cols,j/rows);
      for(var y=0;y<rows;y++)for(var x=0;x<cols;x++){var a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;indices.push(a,b,c,b,d,c);}
      mesh={vertex:gl.createBuffer(),index:gl.createBuffer()};
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vertex);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);indicesCount=indices.length;
      var attr=gl.getAttribLocation(program,'aUv');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
      ['uP','uGrabY','uSpeed','uTime','uShadow','uSize','uPointer','uOrigin','uPaper'].forEach(function(k){loc[k]=gl.getUniformLocation(program,k);});
      tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.uniform1i(loc.uPaper,0);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
      hasWebGL=true;
      resize();
      // Keep the readable paper fallback visible until local Chinese glyphs are ready.
      if(document.fonts && document.fonts.load)document.fonts.load('400 24px "Tear Noto"','账户显示盈利尚未提现教学模拟').then(function(){if(hasWebGL){paintTexture();stage.classList.add('has-webgl');request();}}).catch(function(){if(hasWebGL){paintTexture();stage.classList.add('has-webgl');request();}});
      else stage.classList.add('has-webgl');
    }catch(err){console.warn('WebGL unavailable; the paper uses a CSS fallback.',err);hasWebGL=false;stage.classList.remove('has-webgl');}
  }
  function paintTexture(){
    if(!hasWebGL)return;
    var w=mobile?768:1200,h=mobile?1040:840;
    textureCanvas=textureCanvas||document.createElement('canvas');textureCanvas.width=w;textureCanvas.height=h;
    var c=textureCanvas.getContext('2d');
    var g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#38616a');g.addColorStop(.55,'#1a4149');g.addColorStop(1,'#102e39');
    c.fillStyle=g;c.fillRect(0,0,w,h);
    var seed=8404;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
    for(var i=0;i<2400;i++){var px=rnd()*w,py=rnd()*h;c.fillStyle='rgba(221,232,201,'+(rnd()*.065)+')';c.fillRect(px,py,1+rnd()*3,.6+rnd());}
    c.strokeStyle='rgba(221,237,213,.39)';c.lineWidth=2;c.strokeRect(31,31,w-62,h-62);
    c.strokeStyle='rgba(196,226,207,.15)';c.lineWidth=1;c.strokeRect(43,43,w-86,h-86);
    var left=mobile?68:84,right=w-left;
    c.fillStyle='#bcd6c7';c.font='700 '+(mobile?17:19)+'px ui-monospace,monospace';c.fillText('SIMULATED LEDGER / ACT 04',left,mobile?93:93);
    c.textAlign='right';c.fillText('DISPLAY  /  NOT WITHDRAWN',right,mobile?93:93);c.textAlign='left';
    c.strokeStyle='rgba(224,238,217,.42)';c.beginPath();c.moveTo(left,112);c.lineTo(right,112);c.stroke();
    c.fillStyle='#f3f0df';c.font='700 '+(mobile?40:50)+'px "Tear Noto","Microsoft YaHei",sans-serif';c.fillText('账户显示盈利',left,mobile?196:205);
    c.fillStyle='#b3cfc2';c.font='500 '+(mobile?19:22)+'px "Tear Noto","Microsoft YaHei",sans-serif';c.fillText('屏幕上的数字，不是到账记录',left,mobile?236:250);
    c.save();c.translate(w*.66,h*.52);c.rotate(-.22);c.textAlign='center';c.fillStyle='rgba(227,236,210,.055)';c.font='800 '+(mobile?116:150)+'px "Tear Noto",sans-serif';c.fillText('教学模拟',0,0);c.restore();
    var moneyY=mobile?425:445;
    c.fillStyle='#fcf4dc';c.font='750 '+(mobile?126:185)+'px ui-monospace,monospace';c.fillText('+6,000',left-10,moneyY);
    c.fillStyle='#e3ad83';c.font='700 '+(mobile?20:25)+'px ui-monospace,monospace';c.fillText('CNY  /  DISPLAYED PROFIT',left,moneyY+39);
    // Guilloche and an engraved, non-metric chart: texture, not a promise of returns.
    var y0=mobile?580:570;
    for(var k=0;k<11;k++){
      c.strokeStyle='rgba(188,223,204,'+(.12+k*.008)+')';c.lineWidth=1;c.beginPath();
      for(var n=0;n<=145;n++){var xx=left+(right-left)*n/145;var yy=y0+k*7+Math.sin(n*.22+k*.48)*11+Math.sin(n*.061)*12;n?c.lineTo(xx,yy):c.moveTo(xx,yy);}c.stroke();
    }
    var rowY=mobile?786:703;
    c.strokeStyle='rgba(213,232,207,.36)';c.beginPath();c.moveTo(left,rowY-45);c.lineTo(right,rowY-45);c.stroke();
    c.fillStyle='#d8e6d3';c.font='600 '+(mobile?20:21)+'px "Tear Noto",sans-serif';
    c.fillText('提现状态',left,rowY);c.textAlign='right';c.fillText('尚未核验',right,rowY);c.textAlign='left';
    if(mobile){c.fillText('账户金额',left,rowY+75);c.textAlign='right';c.fillText('仅为显示',right,rowY+75);c.textAlign='left';}
    c.fillStyle='#c8dbc6';c.font='700 '+(mobile?15:17)+'px ui-monospace,monospace';c.fillText('NO WITHDRAWAL CONFIRMED',left,h-64);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureCanvas);
  }
  function resize(){
    stageW=stage.clientWidth;stageH=stage.clientHeight;mobile=stageW<650;
    var ratio=mobile?768/1040:1200/840;
    centerX=stageW<=720?.5:.71;centerY=stageW<=720?.52:.46;
    paperW=Math.min(stageW*(stageW<=720?.82:.50),stageH*(mobile?.47:stageW<=720?.59:.68)*ratio);
    paperH=paperW/ratio;
    uvSize=[paperW/stageW,paperH/stageH];
    [underlay,fallback].forEach(function(el){el.style.width=paperW+'px';el.style.height=paperH+'px';el.style.left=(centerX*100)+'%';el.style.top=(centerY*100)+'%';el.style.transform='translate(-50%,-50%)';});
    if(hasWebGL){var dpr=Math.min(devicePixelRatio||1,mobile?1.15:1.5);canvas.width=Math.round(stageW*dpr);canvas.height=Math.round(stageH*dpr);gl.viewport(0,0,canvas.width,canvas.height);paintTexture();}
    update();request();
  }
  function paperEdge(){
    var x=1,y=grabY;
    var fold=1.14-p*2.29+p*(y-grabY)*.19+p*.025*Math.sin(y*10+grabY*4);
    var d=Math.max(0,x-fold),r=.19+speed*.085;
    var xp=x,z=0;if(d>0){if(d<Math.PI*r){xp=fold+r*Math.sin(d/r);z=r*(1-Math.cos(d/r));}else{xp=fold-(d-Math.PI*r)*.73;z=2*r+.04*(d-Math.PI*r);}}
    xp-=((function(t){return t*t*(3-2*t);})(clamp((p-.55)/.45,0,1)))*2.7;
    var cameraX=(pointer[0]-.5)*.065*(1-p*.65),cameraY=(pointer[1]-.5)*.065*(1-p*.65);
    var w=1-Math.max(0,z)*.33;
    return {x:centerX*100+(xp*uvSize[0]+cameraX)/w*50,y:centerY*100-(y*uvSize[1]+cameraY)/w*50};
  }
  function update(){
    var edge=paperEdge();grip.style.left=clamp(edge.x,0,100)+'%';grip.style.top=clamp(edge.y,5,95)+'%';
    var gripGone=p>.86||edge.x<4;grip.style.opacity=gripGone?'0':'1';grip.style.pointerEvents=gripGone?'none':'auto';grip.tabIndex=gripGone?-1:0;
    if(p>=.999 && document.activeElement===grip)reset.focus({preventScroll:true});
    underlay.style.setProperty('--truth',String(clamp(.09+p*.91,.09,1)));
    stage.style.setProperty('--reveal',String(p));
    if(!hasWebGL){fallback.style.transform='translate(calc(-50% - '+(p*paperW*2)+'px),-50%) rotate('+(p*-18-2)+'deg) scale('+(1-p*.15)+')';fallback.style.opacity=String(clamp(1-p*.55,0,1));}
    titleButton.classList.toggle('revealed',p>=.82);
    titleButton.setAttribute('aria-pressed',p>=.82?'true':'false');
    var next=p<.12?0:p<.82?1:2;
    if(next!==bucket){
      if(next===2 && !reduced.matches){scene.classList.remove('impact');void scene.offsetWidth;scene.classList.add('impact');titleButton.classList.add('cracking');}
      else {scene.classList.remove('impact');titleButton.classList.remove('cracking');}
      bucket=next;step.textContent=['01 / 账面','02 / 正在撕开','03 / 提现条件'][bucket];copy.textContent=[
      '账面上的盈利不是已经取出的现金。向左揭开，看看提现时对方又提出了什么要求。',
      '账面正被撕开。数字和提现要求不在同一层；继续核对，或者放手观察纸边的余势。',
      '提现前先交 20%“保证金”？停止转账、保存证据，通过独立渠道核验。'
    ][bucket];}
  }
  function draw(t){
    if(!hasWebGL||!visible||document.hidden||gl.isContextLost())return;
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.vertex);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
    gl.uniform1f(loc.uP,p);gl.uniform1f(loc.uGrabY,grabY);gl.uniform1f(loc.uSpeed,speed);gl.uniform1f(loc.uTime,reduced.matches?0:t*.001);
    gl.uniform2f(loc.uSize,uvSize[0],uvSize[1]);gl.uniform2f(loc.uPointer,pointer[0],pointer[1]);gl.uniform2f(loc.uOrigin,centerX*2-1,1-centerY*2);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.uniform1f(loc.uShadow,1);gl.drawElements(gl.TRIANGLES,indicesCount,gl.UNSIGNED_SHORT,0);
    gl.uniform1f(loc.uShadow,0);gl.drawElements(gl.TRIANGLES,indicesCount,gl.UNSIGNED_SHORT,0);
  }
  function request(){if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(tick);}
  function tick(t){raf=0;if(!visible||document.hidden)return;var dt=lastFrame?Math.min((t-lastFrame)/16.67,2):1;lastFrame=t;
    if(reduced.matches){p=target;v=0;speed=0;}
    else {v=(v+(target-p)*.17*dt)*Math.pow(.73,dt);p=clamp(p+v*dt,0,1);if(Math.abs(p-target)<.001&&Math.abs(v)<.0005){p=target;v=0;}
      speed=clamp(speed*.83+Math.abs(v)*3.1,.0,1.4);}
    update();draw(t);
    if(dragging||Math.abs(target-p)>.001||Math.abs(v)>.0005||speed>.025)request();
  }
  function seek(next){target=next;if(reduced.matches||!visible){p=target;v=0;speed=0;update();}request();}
  function setPointer(e){var rect=stage.getBoundingClientRect();pointer=[clamp((e.clientX-rect.left)/rect.width,0,1),clamp(1-(e.clientY-rect.top)/rect.height,0,1)];}
  grip.addEventListener('pointerdown',function(e){if(e.button!==undefined&&e.button!==0)return;
    dragging=true;activePointer=e.pointerId;startX=e.clientX;lastX=e.clientX;startP=p;lastTime=performance.now();recentSpeed=0;v=0;
    setPointer(e);grabY=clamp(((1-centerY)-pointer[1])*2*stageH/paperH,-.8,.8);
    grip.setPointerCapture(e.pointerId);request();e.preventDefault();});
  grip.addEventListener('pointermove',function(e){setPointer(e);if(!dragging||e.pointerId!==activePointer){if(visible)request();return;}
    var now=performance.now(),ms=Math.max(1,now-lastTime);recentSpeed=(lastX-e.clientX)/ms;lastTime=now;lastX=e.clientX;
    target=clamp(startP+(startX-e.clientX)/(paperW*.82),0,1);speed=clamp(Math.abs(recentSpeed)*.55,.1,1.4);
    if(reduced.matches)p=target;update();request();});
  function release(e){if(!dragging||e.pointerId!==activePointer)return;dragging=false;suppressClick=Math.abs(lastX-startX)>5;
    if(performance.now()-lastTime>120)recentSpeed=0;
    target=target>.47||recentSpeed>1.1&&target>.18?1:0;
    v=clamp(v+recentSpeed*.035,-.045,.045);request();}
  grip.addEventListener('pointerup',release);
  grip.addEventListener('pointercancel',function(e){if(dragging&&e.pointerId===activePointer){dragging=false;target=p>.47?1:0;request();}});
  grip.addEventListener('click',function(){if(suppressClick){suppressClick=false;return;}seek(target>.5?0:1);});
  titleButton.addEventListener('click',function(){seek(target>.5?0:1);});
  document.getElementById('show-truth').addEventListener('click',function(){seek(1);});
  reset.addEventListener('click',function(){seek(0);});
  // Three physical faces repeat every full revolution: 1 → 2 → 3 → 1.
  // Only the displayed word changes; every interpretation identifies the same transfer demand.
  var drum=document.getElementById('word-drum'),cylinder=document.getElementById('drum-cylinder');
  var drumExplanation=document.getElementById('drum-explanation'),drumPosition=document.getElementById('drum-position');
  var prevWord=document.getElementById('drum-prev'),nextWord=document.getElementById('drum-next');
  var words=['保证金','解冻费','最后一笔'];
  var explanations=[
    '所谓“保证金”：把额外转账包装成提现门槛。先交钱才能取钱，应立即停下。',
    '所谓“解冻费”：用账户冻结制造紧迫感。不要按对方给的号码核实，改走独立渠道。',
    '所谓“最后一笔”：用过去的投入逼你继续。不要为了追回旧钱，再汇一笔新钱。'
  ];
  var drumAngle=0,drumTarget=0,drumVelocity=0,drumRaf=0,drumIndex=-1,targetTurn=0;
  var drumDragging=false,drumPointer=null,drumStartY=0,drumStartAngle=0,drumLastY=0,drumLastT=0,drumSpeed=0;
  function wrap(n){return (n%3+3)%3;}
  function renderDrum(){
    cylinder.style.setProperty('--angle',drumAngle+'deg');
    var index=wrap(Math.round(-drumAngle/120));
    if(index!==drumIndex){
      drumIndex=index;drum.setAttribute('aria-valuenow',String(index+1));drum.setAttribute('aria-valuetext',words[index]);
      drumExplanation.textContent=explanations[index];drumPosition.textContent='0'+(index+1)+' / 03';
    }
  }
  function normalizeDrum(){
    var whole=Math.floor(targetTurn/3);
    if(whole){drumAngle+=whole*360;targetTurn-=whole*3;drumTarget=-targetTurn*120;renderDrum();}
  }
  function drumFrame(){drumRaf=0;if(drumDragging)return;
    if(reduced.matches){drumAngle=drumTarget;drumVelocity=0;renderDrum();normalizeDrum();return;}
    drumVelocity=(drumVelocity+(drumTarget-drumAngle)*.13)*.75;
    drumAngle+=drumVelocity;
    if(Math.abs(drumTarget-drumAngle)<.04&&Math.abs(drumVelocity)<.04){drumAngle=drumTarget;drumVelocity=0;renderDrum();normalizeDrum();return;}
    renderDrum();drumRaf=requestAnimationFrame(drumFrame);
  }
  function spinTo(turn){
    targetTurn=turn;drumTarget=-targetTurn*120;
    if(reduced.matches){drumAngle=drumTarget;drumVelocity=0;renderDrum();normalizeDrum();return;}
    if(!drumRaf)drumRaf=requestAnimationFrame(drumFrame);
  }
  drum.addEventListener('pointerdown',function(e){
    if(e.button!==undefined&&e.button!==0)return;
    drumDragging=true;drumPointer=e.pointerId;drumStartY=drumLastY=e.clientY;drumStartAngle=drumAngle;
    drumLastT=performance.now();drumSpeed=0;drumVelocity=0;
    if(drumRaf){cancelAnimationFrame(drumRaf);drumRaf=0;}
    drum.setPointerCapture(e.pointerId);e.preventDefault();
  });
  drum.addEventListener('pointermove',function(e){
    if(!drumDragging||e.pointerId!==drumPointer)return;
    var now=performance.now(),dt=Math.max(1,now-drumLastT);
    drumSpeed=(e.clientY-drumLastY)/dt;drumLastY=e.clientY;drumLastT=now;
    drumAngle=drumStartAngle+(e.clientY-drumStartY)*1.05;renderDrum();
  });
  function releaseDrum(e){
    if(!drumDragging||e.pointerId!==drumPointer)return;
    drumDragging=false;
    if(performance.now()-drumLastT>110)drumSpeed=0;
    var travel=Math.abs(drumLastY-drumStartY);
    spinTo(travel<6?targetTurn+1:Math.round(-(drumAngle+drumSpeed*34)/120));
  }
  drum.addEventListener('pointerup',releaseDrum);
  drum.addEventListener('pointercancel',function(e){if(drumDragging&&e.pointerId===drumPointer){drumDragging=false;spinTo(Math.round(-drumAngle/120));}});
  drum.addEventListener('keydown',function(e){
    var next=e.key==='ArrowDown'||e.key==='ArrowRight'?targetTurn+1:e.key==='ArrowUp'||e.key==='ArrowLeft'?targetTurn-1:e.key==='Home'?0:e.key==='End'?2:null;
    if(next===null)return;e.preventDefault();spinTo(next);
  });
  prevWord.addEventListener('click',function(){spinTo(targetTurn-1);});
  nextWord.addEventListener('click',function(){spinTo(targetTurn+1);});
  reduced.addEventListener('change',function(){if(reduced.matches){if(drumRaf)cancelAnimationFrame(drumRaf);drumRaf=0;drumAngle=drumTarget;drumVelocity=0;renderDrum();normalizeDrum();}});
  renderDrum();
  if('IntersectionObserver' in window){var reading=document.querySelector('.reading');
    var inView=new IntersectionObserver(function(entries){if(entries[0].isIntersecting){reading.classList.add('is-in-view');inView.disconnect();}},{threshold:.1});inView.observe(reading);}
  reduced.addEventListener('change',function(){if(reduced.matches){p=target;v=0;speed=0;update();}request();});
  if('IntersectionObserver' in window)new IntersectionObserver(function(entries){visible=entries[0].isIntersecting;if(visible){lastFrame=0;request();}else if(raf){cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'}).observe(stage);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){lastFrame=0;request();}else if(raf){cancelAnimationFrame(raf);raf=0;}});
  window.addEventListener('resize',resize,{passive:true});
  canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();hasWebGL=false;stage.classList.remove('has-webgl');gl=null;update();});
  setup();resize();update();request();
})();
