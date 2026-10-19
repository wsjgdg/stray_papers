/* 归一化高斯波包（CPU 端初始场生成）——薛定谔/NLS 等标量内核共用。
   返回 { data, sum }：data 为 grid²×2 的 Float32Array（Re/Im 交错），
   sum 为原始总范数 Σ|ψ|²（≈2πσ²），由引擎做归一化与叠加缩放。 */
export function gaussianWave(grid, { fx, fy, kx, ky, sigma }){
  const data = new Float32Array(grid*grid*2);
  const cx = fx*grid, cy = fy*grid;
  let sum = 0;
  for (let y=0; y<grid; y++){
    for (let x=0; x<grid; x++){
      const dx = x-cx, dy = y-cy;
      const env = Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));
      const ph = kx*dx + ky*dy;
      const i = (y*grid+x)*2;
      data[i] = env*Math.cos(ph);
      data[i+1] = env*Math.sin(ph);
      sum += env*env;
    }
  }
  return { data, sum };
}
