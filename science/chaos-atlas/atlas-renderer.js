/* GPU-backed drawing of the reference orbit, coordinate guide, and live
   paths. The numerical integration stays in model.js; this only projects. */
(function (root) {
  'use strict';

  const vertexSource = `
    attribute vec3 aPoint;
    uniform vec3 uCenter;
    uniform vec4 uRotation;
    uniform float uDistance;
    uniform vec2 uMid;
    uniform float uScale;
    uniform vec2 uScreenCenter;
    uniform vec2 uResolution;
    uniform float uPointSize;
    varying float vColorMix;
    void main() {
      vec3 delta = aPoint - uCenter;
      float horizontal = uRotation.x * delta.x - uRotation.y * delta.y;
      float depth0 = uRotation.y * delta.x + uRotation.x * delta.y;
      float vertical = uRotation.z * delta.z - uRotation.w * depth0;
      float depth = uRotation.w * delta.z + uRotation.z * depth0;
      float perspective = clamp(uDistance / (uDistance - depth), 0.35, 2.5);
      vec2 pixel = vec2(
        uScreenCenter.x + (horizontal * perspective - uMid.x) * uScale,
        uScreenCenter.y - (vertical * perspective - uMid.y) * uScale
      );
      vColorMix = clamp(0.65 * pixel.x / uResolution.x + 0.35 * (1.0 - pixel.y / uResolution.y), 0.0, 1.0);
      gl_PointSize = uPointSize;
      gl_Position = vec4(pixel.x / uResolution.x * 2.0 - 1.0,
                         1.0 - pixel.y / uResolution.y * 2.0, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying float vColorMix;
    uniform float uIsLive;
    uniform vec4 uLiveColor;
    uniform float uRoundPoint;
    void main() {
      if (uRoundPoint > 0.5 && length(gl_PointCoord - vec2(0.5)) > 0.5) discard;
      vec3 peach = vec3(0.94, 0.61, 0.52);
      vec3 violet = vec3(0.70, 0.67, 0.86);
      gl_FragColor = uIsLive > 0.5 ? uLiveColor : vec4(mix(peach, violet, vColorMix), 0.48);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Unable to create the orbit shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Orbit shader did not compile.';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function create(canvas, onContextLost) {
    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    } catch (_) { return null; }
    if (!gl) return null;

    const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error('Unable to create the orbit program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Orbit program did not link.';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const buffer = gl.createBuffer(), grid = gl.createBuffer(), axes = gl.createBuffer(), glints = gl.createBuffer();
    const live = [0, 1].map(function () {
      return { buffer: gl.createBuffer(), trail: null, revision: -1, points: null };
    });
    if (!buffer || !grid || !axes || !glints || live.some(item => !item.buffer)) throw new Error('Unable to create the orbit buffers.');
    const attribute = gl.getAttribLocation(program, 'aPoint');
    const uniforms = {};
    ['uCenter', 'uRotation', 'uDistance', 'uMid', 'uScale', 'uScreenCenter', 'uResolution', 'uPointSize', 'uIsLive', 'uLiveColor', 'uRoundPoint'].forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });
    let uploaded = null, gridView = null, glintCount = 0, verified = false;
    canvas.addEventListener('webglcontextlost', function () {
      // The app immediately replaces this layer with its Canvas 2D fallback;
      // it does not need the browser to restore this context in the background.
      if (onContextLost) onContextLost();
    });

    function resize(width, height) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    function drawSolid(buffer, count, mode, color, roundPoint) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uniforms.uIsLive, 1);
      gl.uniform1f(uniforms.uRoundPoint, roundPoint ? 1 : 0);
      gl.uniform4f(uniforms.uLiveColor, color[0], color[1], color[2], color[3]);
      gl.drawArrays(mode, 0, count);
    }
    function uploadGrid(view) {
      if (gridView === view) return;
      const center = view.center, e = view.extent, floor = center[2] - e * 0.91, lines = [];
      for (let i = -5; i <= 5; i++) {
        const a = e * i / 4;
        lines.push(center[0] - e * 1.25, center[1] + a, floor, center[0] + e * 1.25, center[1] + a, floor);
        lines.push(center[0] + a, center[1] - e * 1.25, floor, center[0] + a, center[1] + e * 1.25, floor);
      }
      const x = center[0] - e * 0.93, y = center[1] - e * 0.93, z = floor;
      const guide = [x, y, z, x + e * 0.29, y, z, x, y, z, x, y + e * 0.29, z, x, y, z, x, y, z + e * 0.29];
      gl.bindBuffer(gl.ARRAY_BUFFER, grid);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, axes);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(guide), gl.STATIC_DRAW);
      gridView = view;
    }
    function drawLive(trail, index, color, interacting) {
      if (!trail || trail.count < 2) return;
      const item = live[index], stride = interacting ? Math.max(1, Math.ceil(trail.count / 320)) : 1;
      gl.bindBuffer(gl.ARRAY_BUFFER, item.buffer);
      if (item.trail !== trail || item.revision !== trail.revision || item.stride !== stride) {
        if (!item.points || item.points.length !== trail.capacity * 3) item.points = new Float32Array(trail.capacity * 3);
        const first = trail.count === trail.capacity ? trail.next : 0;
        let count = 0;
        function sample(i) {
          const from = ((first + i) % trail.capacity) * 3, to = count++ * 3;
          item.points[to] = trail.data[from];
          item.points[to + 1] = trail.data[from + 1];
          item.points[to + 2] = trail.data[from + 2];
        }
        for (let i = 0; i < trail.count; i += stride) sample(i);
        if ((trail.count - 1) % stride) sample(trail.count - 1);
        gl.bufferData(gl.ARRAY_BUFFER, item.points.subarray(0, count * 3), gl.DYNAMIC_DRAW);
        item.trail = trail;
        item.revision = trail.revision;
        item.stride = stride;
        item.count = count;
      }
      drawSolid(item.buffer, item.count, gl.LINE_STRIP, color, false);
    }
    function draw(reference, projection, view, width, height, probe, trailA, trailB, interacting) {
      if (gl.isContextLost()) throw new Error('Orbit WebGL context lost.');
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      const needsUpload = uploaded !== reference;
      if (needsUpload) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(reference.points), gl.STATIC_DRAW);
        const samples = [];
        for (let i = 0; i < reference.points.length; i += 381) {
          samples.push(reference.points[i], reference.points[i + 1], reference.points[i + 2]);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, glints);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(samples), gl.STATIC_DRAW);
        glintCount = samples.length / 3;
        uploaded = reference;
      }
      uploadGrid(view);
      gl.enableVertexAttribArray(attribute);
      const r = projection.rotation;
      gl.uniform3f(uniforms.uCenter, view.center[0], view.center[1], view.center[2]);
      gl.uniform4f(uniforms.uRotation, r.cy, r.sy, r.cp, r.sp);
      gl.uniform1f(uniforms.uDistance, r.distance);
      gl.uniform2f(uniforms.uMid, projection.midX, projection.midY);
      gl.uniform1f(uniforms.uScale, projection.scale);
      gl.uniform2f(uniforms.uScreenCenter, projection.centerX, projection.centerY);
      gl.uniform2f(uniforms.uResolution, width, height);
      gl.uniform1f(uniforms.uPointSize, Math.max(2, 2.2 * canvas.width / width));
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawSolid(grid, 44, gl.LINES, [0.694, 0.561, 0.604, 0.14], false);
      drawSolid(axes, 6, gl.LINES, [0.84, 0.682, 0.65, 0.48], false);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uniforms.uIsLive, 0);
      gl.uniform1f(uniforms.uRoundPoint, 0);
      gl.drawArrays(gl.LINE_STRIP, 0, reference.points.length / 3);
      drawSolid(glints, glintCount, gl.POINTS, [1, 0.8, 0.718, 0.65], true);
      drawLive(trailA, 0, [1, 0.714, 0.55, 0.78], interacting);
      drawLive(trailB, 1, [0.62, 0.87, 0.79, 0.78], interacting);
      if (gl.isContextLost() || ((!verified || needsUpload) && gl.getError() !== gl.NO_ERROR)) throw new Error('Orbit WebGL drawing failed.');

      // Some drivers provide a context but silently fail to draw. Probe a few
      // pixels near a known reference sample once; if readback is blocked by a
      // privacy setting, leave the renderer enabled instead of guessing.
      if (!verified && probe) {
        const x = Math.round(probe[0] * canvas.width / width);
        const y = Math.round(canvas.height - probe[1] * canvas.height / height);
        if (x >= 3 && x < canvas.width - 3 && y >= 3 && y < canvas.height - 3) {
          const pixels = new Uint8Array(7 * 7 * 4);
          let readable = false;
          try {
            gl.readPixels(x - 3, y - 3, 7, 7, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            readable = gl.getError() === gl.NO_ERROR;
          } catch (_) { /* Readback can be disallowed independently of drawing. */ }
          if (readable && !pixels.some((value, i) => i % 4 === 3 && value > 0)) throw new Error('Orbit WebGL produced an empty frame.');
          verified = true;
        }
      }
    }
    function dispose() {
      try {
        [buffer, grid, axes, glints].forEach(item => gl.deleteBuffer(item));
        live.forEach(item => gl.deleteBuffer(item.buffer));
        gl.deleteProgram(program);
      } catch (_) { /* The context may already be gone. */ }
    }
    return { canvas: canvas, resize: resize, draw: draw, dispose: dispose };
  }

  root.AtlasOrbitRenderer = { create: create };
})(window);
