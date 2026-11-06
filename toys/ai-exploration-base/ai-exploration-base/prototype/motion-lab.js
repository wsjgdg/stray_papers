/* One-scene motion study: a single progress value controls a spring-driven peel,
   DOM content, interaction state and a procedurally shaded WebGL surface.
   No assets, network calls, account data or completion state. */
(function () {
  'use strict';
  var stage = document.getElementById('lab-stage');
  var canvas = document.getElementById('shader-canvas');
  var grip = document.getElementById('grip');
  var front = document.getElementById('front-text');
  var back = document.getElementById('back-text');
  var seam = document.getElementById('seam');
  var range = document.getElementById('reveal-range');
  var value = document.getElementById('range-value');
  var resultIndex = document.getElementById('result-index');
  var resultText = document.getElementById('result-text');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var p = 0, target = 0, velocity = 0, impulse = 0, pointer = [0.86, 0.5], dragging = false;
  var pointerId, startX, startProgress, lastX, lastMoveTime, recentSpeed = 0, suppressClick = false;
  var visible = true, renderNeeded = true, raf = 0, lastFrame = 0, bucket = -1;
  var gl, program, uniforms, buffer, pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.6);

  var vertex = 'attribute vec2 aPos; varying vec2 vUv; void main(){vUv=(aPos+1.0)*0.5;gl_Position=vec4(aPos,0.0,1.0);}';
  var fragment = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec2 uResolution; uniform vec2 uPointer;',
    'uniform float uProgress; uniform float uTime; uniform float uImpulse;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}',
    'void main(){',
    'vec2 uv=vUv; float aspect=uResolution.x/uResolution.y;',
    'float grain=hash(gl_FragCoord.xy+floor(uTime*13.))*0.032;',
    'float small=noise(uv*vec2(18.,13.)+vec2(uTime*.09,0.));',
    'float micro=noise(uv*vec2(105.,70.));',
    'float fromPointer=length((uv-uPointer)*vec2(aspect,1.));',
    'float touchWave=sin(fromPointer*38.-uTime*9.)*exp(-fromPointer*7.)*uImpulse;',
    'float seamX=1.075-uProgress*1.16 + (uv.y-.5)*.065 + .008*sin(uv.y*29.+uTime*.5) + .018*(small-.5) + touchWave*.019;',
    'float reveal=smoothstep(seamX-.019,seamX+.018,uv.x);',
    // fake ledger surface: deep ink, editorial score lines, machined scratches
    'vec3 frontA=vec3(.018,.075,.096),frontB=vec3(.045,.185,.195);',
    'vec3 frontColor=mix(frontA,frontB,clamp(uv.x*.44+uv.y*.36+small*.34,0.,1.));',
    'float foil=pow(max(0.,sin(uv.x*14.8+uv.y*3.5+small*1.4-uTime*.16)),18.);',
    'frontColor+=vec3(.16,.23,.16)*foil*.24;',
    'float gridX=1.-smoothstep(0.,.008,fract(uv.x*11.));',
    'float gridY=1.-smoothstep(0.,.016,fract(uv.y*8.));',
    'frontColor+=vec3(.12,.22,.19)*(gridX+gridY)*.18;',
    'float trend=.19+.19*uv.x+.03*sin(uv.x*28.)+.02*sin(uv.x*57.);',
    'float graph=exp(-abs(uv.y-trend)*205.);',
    'frontColor+=vec3(.23,.59,.48)*graph*.68;',
    'float scan=1.-smoothstep(0.,.008,fract(uv.y*115.));frontColor+=vec3(.04,.055,.047)*scan*.12;',
    // the underlayer is deliberately not a celebratory reveal: security-paper red
    'vec3 backA=vec3(.09,.017,.027),backB=vec3(.27,.045,.041);',
    'vec3 backColor=mix(backA,backB,clamp(uv.y*.63+small*.4,0.,1.));',
    'float diag=1.-smoothstep(.04,.10,abs(fract((uv.x-uv.y*.36)*18.)-.5));',
    'backColor+=vec3(.22,.032,.024)*diag*.23;',
    'float grit=noise(uv*vec2(58.,48.)+vec2(0.,uTime*.03));backColor+=vec3(.05,.015,.012)*(grit-.5);',
    'vec3 col=mix(frontColor,backColor,reveal);',
    'float cut=exp(-abs(uv.x-seamX)*154.)*step(.003,uProgress)*step(uProgress,.995);',
    'col+=vec3(.95,.38,.13)*cut*.95+vec3(.9,.77,.39)*exp(-abs(uv.x-seamX)*410.)*cut*.5;',
    'col+=vec3(.16,.06,.025)*exp(-abs(uv.x-seamX)*17.)*cut;',
    'float vignette=1.-.38*pow(length((uv-.5)*vec2(.85,1.)),1.3);',
    'col=clamp((col+grain)*(vignette+micro*.045),0.,1.);',
    'gl_FragColor=vec4(pow(col,vec3(.88)),1.);',
    '}'
  ].join('\n');

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Motion study shader unavailable:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader); return null;
    }
    return shader;
  }
  function setupWebGL() {
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
      if (!gl) return false;
      var vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      if (!vs || !fs) return false;
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      var attribute = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
      uniforms = { resolution: gl.getUniformLocation(program,'uResolution'), pointer: gl.getUniformLocation(program,'uPointer'), progress: gl.getUniformLocation(program,'uProgress'), time: gl.getUniformLocation(program,'uTime'), impulse: gl.getUniformLocation(program,'uImpulse') };
      stage.classList.add('has-webgl');
      resizeCanvas(); return true;
    } catch (e) { console.warn('Motion study uses CSS fallback:', e); return false; }
  }
  function resizeCanvas() {
    if (!gl) return;
    var w = Math.max(1, Math.floor(stage.clientWidth * pixelRatio));
    var h = Math.max(1, Math.floor(stage.clientHeight * pixelRatio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); renderNeeded=true; }
  }
  function render(time) {
    if (!gl || !program || !visible || document.hidden || gl.isContextLost()) return;
    resizeCanvas(); gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointer[0], pointer[1]);
    gl.uniform1f(uniforms.progress, p); gl.uniform1f(uniforms.impulse, impulse);
    gl.uniform1f(uniforms.time, reduced.matches ? 0 : time*.001);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    renderNeeded=false;
  }
  function updateDOM(force) {
    // CSS clipping mirrors the shader's traveling diagonal seam; all text stays HTML.
    var top = clamp(107.5-p*116+3.25,0,100), bottom = clamp(107.5-p*116-3.25,0,100);
    front.style.clipPath = 'polygon(0 0,'+top+'% 0,'+bottom+'% 100%,0 100%)';
    back.style.clipPath = 'polygon('+top+'% 0,100% 0,100% 100%,'+bottom+'% 100%)';
    seam.style.left = ((top+bottom)*.5)+'%';
    seam.style.opacity = p>.04 && p<.96 ? 1 : 0;
    grip.style.left = 'calc('+clamp(89-p*74,10,89)+'% - 36px)';
    grip.style.opacity = p>.94 ? '0' : '1';
    grip.style.pointerEvents = p>.94 ? 'none' : 'auto';
    grip.tabIndex = p>.94 ? -1 : 0;
    if (p>=.999 && document.activeElement===grip) document.getElementById('reset-scene').focus({preventScroll:true});
    if (!dragging && document.activeElement !== range) range.value = String(Math.round(p*100));
    value.textContent = Math.round(p*100)+'%';
    front.setAttribute('aria-hidden', p>=.88 ? 'true' : 'false');
    back.setAttribute('aria-hidden', p<=.12 ? 'true' : 'false');
    var nextBucket = p<.14 ? 0 : p<.86 ? 1 : 2;
    if (force || nextBucket !== bucket) {
      bucket = nextBucket;
      resultIndex.textContent = ['01 / 表象','02 / 正在核验','03 / 真相'][bucket];
      resultText.textContent = [
        '显示盈利，不等于钱已到账。向左揭开，看看提现时对方提出了什么要求。',
        '你正在拨开账面数字。注意：要求先交钱才能取钱，是这里必须看清的条件。',
        '提现先交 20%“保证金”？这是骗局的关键信号。停止转账、保留证据，用独立渠道核验。'
      ][bucket];
    }
    renderNeeded=true;
  }
  function tick(t) {
    raf=0;
    if (!visible || document.hidden) return;
    var dt=lastFrame ? Math.min((t-lastFrame)/16.67,2) : 1; lastFrame=t;
    var moving=false;
    if (reduced.matches) { if (p !== target) { p=target; velocity=0; moving=true; } impulse=0; }
    else {
      var previous=p;
      velocity=(velocity+(target-p)*.18*dt)*Math.pow(.74,dt);
      p=clamp(p+velocity*dt,0,1);
      if (Math.abs(target-p)<.0006 && Math.abs(velocity)<.0005) { p=target; velocity=0; }
      impulse=Math.max(0,impulse-.025*dt);
      moving=Math.abs(p-previous)>.0001 || impulse>.005;
    }
    if (moving || renderNeeded) { updateDOM(false); render(t); }
    // The subtle shader glint runs only while the scene is visible; no offscreen render loop.
    if (moving || !reduced.matches && gl && program) schedule();
  }
  function schedule() { if (!raf && visible && !document.hidden) raf=requestAnimationFrame(tick); }
  function seek(next, kick) {
    target=next; impulse=kick;
    // Controls remain functional even before the observer sees the stage.
    if (reduced.matches || !visible) { p=target; velocity=0; updateDOM(true); }
    schedule();
  }
  function pointerPosition(e) {
    var r=stage.getBoundingClientRect();
    pointer=[clamp((e.clientX-r.left)/r.width,0,1), clamp(1-(e.clientY-r.top)/r.height,0,1)];
  }
  grip.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    dragging=true; pointerId=e.pointerId; startX=e.clientX; lastX=e.clientX;
    startProgress=p; target=p; velocity=0; lastMoveTime=performance.now(); recentSpeed=0;
    grip.setPointerCapture(e.pointerId); pointerPosition(e); impulse=1; schedule();
    e.preventDefault();
  });
  grip.addEventListener('pointermove', function (e) {
    pointerPosition(e);
    if (dragging && e.pointerId === pointerId) {
      var now=performance.now();
      var elapsed=Math.max(1,now-lastMoveTime);
      recentSpeed=(lastX-e.clientX)/elapsed;
      lastX=e.clientX; lastMoveTime=now;
      target=clamp(startProgress+(startX-e.clientX)/(stage.clientWidth*.72),0,1);
      impulse=clamp(Math.abs(recentSpeed)*.38+.27,.18,1);
      if (reduced.matches) p=target;
      updateDOM(false); schedule();
    } else { impulse=.2; schedule(); }
  });
  function release(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging=false;
    suppressClick=Math.abs(lastX-startX)>5;
    if (performance.now()-lastMoveTime>110) recentSpeed=0;
    // Movement carries through a short throw; slow partial pulls return to rest.
    target=(target>=.46 || recentSpeed>.9 && target>.18) ? 1 : 0;
    velocity=clamp(velocity+recentSpeed*.035,-.038,.038);
    impulse=.8; schedule();
  }
  grip.addEventListener('pointerup', release);
  grip.addEventListener('pointercancel', function (e) { if (dragging && e.pointerId === pointerId) { dragging=false; target=p>=.46?1:0; schedule(); } });
  grip.addEventListener('click', function () {
    // A click is also useful on touch/keyboard; a completed drag must not toggle twice.
    if (suppressClick) { suppressClick=false; return; }
    seek(target>.5?0:1,.8);
  });
  range.addEventListener('input', function () { p=target=Number(range.value)/100; velocity=0; impulse=.45; updateDOM(false); schedule(); });
  document.getElementById('reveal-all').addEventListener('click', function () { seek(1,.8); });
  document.getElementById('reset-scene').addEventListener('click', function () { seek(0,.5); });
  reduced.addEventListener('change', function () { if (reduced.matches) { p=target; velocity=0; impulse=0; updateDOM(true); render(0); } schedule(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible=entries[0].isIntersecting;
      if (visible) { lastFrame=0; renderNeeded=true; schedule(); }
      else if (raf) { cancelAnimationFrame(raf); raf=0; }
    }, {rootMargin:'100px'}).observe(stage);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame=0; renderNeeded=true; schedule(); } else if(raf) {cancelAnimationFrame(raf);raf=0;} });
  window.addEventListener('resize', function () { resizeCanvas(); updateDOM(true); schedule(); }, {passive:true});
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stage.classList.remove('has-webgl'); gl=null; program=null; });
  setupWebGL(); updateDOM(true); schedule();
})();
