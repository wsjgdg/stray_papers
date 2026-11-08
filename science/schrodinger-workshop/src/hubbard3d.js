/* hubbard3d.js — 哈伯德链的 3D 透视视图：相机 + 投影 + 拾取（纯数学，无 DOM / 无 canvas）
 *
 * 为什么单独一个模块：3D 的「对不对」是纯几何问题（正交基、透视缩放、深度排序、屏幕拾取），
 * 可以在 Node 里用解析式逐条对账（pot143），不必拖一个浏览器进来。页面只负责把算出来的
 * 屏幕坐标画成珠子/箭头/势刺。
 *
 * 坐标系（右手系）：
 *   x — 链的方向（格点 i 在 x_i 上，已归一化到固定跨度，见 hbSitePositions）
 *   y — 自旋：↑ 指向 +y，↓ 指向 −y
 *   z — 局域势 μ 的「出屏」方向：μ>0 沿 +z 长刺，μ<0 沿 −z（2D 视图里这条信息只能塞进一条色带）
 *
 * 相机：绕 y 轴 yaw、俯仰 pitch、到原点距离 dist。视线恒指原点（靶点在链中心）。
 */

export const CAM_DEFAULT = { yaw: -0.62, pitch: 0.34, dist: 7.6 };
/* pitch 钳到 ±76°：再往上 up 向量就从世界 y 轴旁边擦过去，屏幕会翻面 */
export const PITCH_LIM = 1.33;
export const DIST_MIN = 3.2, DIST_MAX = 20;
/* 链在 3D 里的固定横向跨度（世界单位）：不同 L 都铺满画面宽度，只是格距变密 */
export const CHAIN_SPAN = 6.0;

const clamp3 = (v, a, b) => (v < a ? a : (v > b ? b : v));

export function hbCamDefault(){ return { ...CAM_DEFAULT }; }
export function hbCamReset(){ return hbCamDefault(); }

/* 轨道旋转：dx/dy 是设备像素位移；pitch 钳制，yaw 不钳（2π 周期） */
export function hbOrbit(cam, dx, dy, k = 0.0075){
  return {
    yaw: cam.yaw + dx * k,
    pitch: clamp3(cam.pitch + dy * k, -PITCH_LIM, PITCH_LIM),
    dist: cam.dist,
  };
}

/* f>1 拉远、f<1 推近（滚轮 deltaY 换算见页面） */
export function hbZoom(cam, f){
  return { yaw: cam.yaw, pitch: cam.pitch, dist: clamp3(cam.dist * f, DIST_MIN, DIST_MAX) };
}

export function hbEye(cam){
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  return { x: cam.dist * cp * Math.sin(cam.yaw), y: cam.dist * sp, z: cam.dist * cp * Math.cos(cam.yaw) };
}

/* 视空间正交基（靶点 = 原点）：
     f = 视线方向 eye→靶点
     r = normalize(f × up)，up 取世界 +y
     u = r × f（屏幕向上）
   pitch 钳在 ±76° ⟹ |f×up| = cos(pitch) ≥ 0.24，不会退化。 */
export function hbCamBasis(cam){
  const eye = hbEye(cam);
  const n = Math.hypot(eye.x, eye.y, eye.z) || 1;
  const f = { x: -eye.x / n, y: -eye.y / n, z: -eye.z / n };
  const rx = -f.z, rz = f.x;                 /* f × (0,1,0) = (−f.z, 0, f.x) */
  const rn = Math.hypot(rx, 0, rz) || 1;
  const r = { x: rx / rn, y: 0, z: rz / rn };
  const u = {                             /* r × f */
    x: r.y * f.z - r.z * f.y,
    y: r.z * f.x - r.x * f.z,
    z: r.x * f.y - r.y * f.x,
  };
  return { f, r, u, eye };
}

/* 焦距：按画布宽度定，保证 CHAIN_SPAN 的链在默认距离下左右各留 ~15% 余量 */
export function hbFocal(W){ return 0.85 * W; }

/* 世界点 → 设备像素。k = 焦距/深度，用来缩放珠半径、线宽、箭头（透视缩放的唯一来源）。 */
export function hbProject(cam, W, H, p){
  const { f, r, u, eye } = hbCamBasis(cam);
  const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
  const depth = dx * f.x + dy * f.y + dz * f.z;
  const focal = hbFocal(W);
  const near = 1e-6;
  const d = Math.abs(depth) < near ? near : depth;
  return {
    x: W / 2 + (dx * r.x + dy * r.y + dz * r.z) / d * focal,
    y: H / 2 - (dx * u.x + dy * u.y + dz * u.z) / d * focal,
    depth: d,
    k: focal / d,
  };
}

/* 格点的世界 x：跨度固定、关于原点对称（mean(x)=0，span = CHAIN_SPAN） */
export function hbSitePositions(L, span = CHAIN_SPAN){
  const out = [];
  const d = L > 1 ? span / (L - 1) : 0;
  for (let i = 0; i < L; i++) out.push(-span / 2 + i * d);
  return out;
}

/* 屏幕点 → 格点下标。命中半径内取屏幕距离最近者；等距时取更靠近相机的那颗
   （两颗珠子在屏幕上叠住时，看见的应该是前面那颗）。 */
export function hbPick(cam, W, H, xs, sx, sy, rad){
  let best = -1, bd = Infinity, bz = Infinity;
  for (let i = 0; i < xs.length; i++){
    const p = hbProject(cam, W, H, { x: xs[i], y: 0, z: 0 });
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d > rad) continue;
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && p.depth < bz)){
      best = i; bd = d; bz = p.depth;
    }
  }
  return best;
}

/* 深度雾：把 [最近、最远] 归一化到 [0,1]（1 = 最近），页面用它给远处的珠子降透明度 */
export function hbDepthRange(cam, W, H, xs){
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < xs.length; i++){
    const p = hbProject(cam, W, H, { x: xs[i], y: 0, z: 0 });
    if (p.depth < lo) lo = p.depth;
    if (p.depth > hi) hi = p.depth;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-9) return { lo, hi, nearness: () => 1 };
  return {
    lo, hi,
    nearness: depth => clamp3(1 - (depth - lo) / (hi - lo), 0, 1),
  };
}
