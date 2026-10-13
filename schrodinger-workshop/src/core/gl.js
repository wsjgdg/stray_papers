/* WebGL2 引导、着色器编译、全屏三角形与渲染目标。
   所有函数显式接收 gl 参数——不持有模块级 GL 状态，多实例安全。 */
export const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

/* 纯拷贝 shader：resize 时把旧 dispA（历史余晖）blit 进新 dispA */
export const FS_BLIT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTex;
void main(){ o = texture(uTex, vUv); }`;

/* 创建 WebGL2 上下文；失败时返回 { gl:null, error } 由调用方展示诊断 */
export function createContext(canvas){
  const gl = canvas.getContext('webgl2', { antialias:false, alpha:false, depth:false, stencil:false, powerPreference:'high-performance' });
  if (!gl) return { gl:null, error:'no webgl2' };
  if (!gl.getExtension('EXT_color_buffer_float')) return { gl:null, error:'no EXT_color_buffer_float' };
  return { gl, error:null };
}

export function compileShader(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
  return s;
}

/* 编译 program：全屏三角形 VS + 调用方提供的 FS */
export function createProgram(gl, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

/* 全屏大三角形（覆盖 NDC，比 quad 少一次插值对角线） */
export class Quad {
  constructor(gl){
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  bind(gl){ gl.bindVertexArray(this.vao); }
  draw(gl){ gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }
}

/* RG32F / RGBA32F 浮点场目标（量子波函数，NEAREST） */
export function makeTarget(gl, w, h, internalFormat, format, filter){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.FLOAT, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

/* RGBA16F 显示目标（拖尾历史，LINEAR 兼做 resize 重采样） */
export function makeRGBA16F(gl, w, h){
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, w, h };
}

/* 32^2 归约目标（MRT 三附件，各 RGBA32F）：
   tex  (location 0)：(Σp, uK·ΣT, Σp², ΣVp)
   tex2 (location 1)：(Σx·p, Σy·p, Σx²·p, Σy²·p)（世界坐标概率矩，
      供不确定原理 HUD 的 Δx/Δy 与质心使用）。
   tex3 (location 2)：(uK·ΣT_x, uK·ΣT_y, Σ⟨p_x⟩, Σ⟨p_y⟩)（分轴动能 + 梯度版
      均值动量——per-axis 紧致界 Δx·Δk_x ≥ ½；若只给总 Δk，2D 高斯波包单向
      宽度配双向展宽仅得保守界 √2·½=0.707，呈现不出「高斯是不确定原理饱和态」
      这一关键物理；均值 ⟨p⟩ 与 ⟨p²⟩ 同用 4 阶算子，Δk 全 Fourier 一致）。
   调用方须 gl.drawBuffers([COLOR_ATTACHMENT0,1,2]) 后绘制；
   读取时对每个附件分别 gl.readBuffer + readPixels。 */
export function makeReduce(gl){
  const mk = () => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 32, 32, 0, gl.RGBA, gl.FLOAT, null);
    return tex;
  };
  const tex = mk(), tex2 = mk(), tex3 = mk();
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex2, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, tex3, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE){
    throw new Error('makeReduce: MRT framebuffer incomplete');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, tex2, tex3 };
}
