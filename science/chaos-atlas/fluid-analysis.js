/* Small, bounded records of actual solver telemetry for finite-time comparisons. */
(function (root, factory) {
  'use strict';
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.FluidAnalysis=api;
})(typeof window!=='undefined'?window:globalThis,function () {
  'use strict';
  const MAX_POINTS=1200;
  function sample(stats) {
    return {time:stats.time,gap:stats.dyeCenterB-stats.dyeCenterA,maxSpeed:stats.maxSpeed,divergence:stats.divergenceRms};
  }
  function append(points,stats) {
    const p=sample(stats);
    if (![p.time,p.gap,p.maxSpeed,p.divergence].every(Number.isFinite)) throw new Error('Invalid comparison sample');
    const last=points[points.length-1];
    if (last && p.time<last.time-1e-9) throw new Error('Comparison time must not run backward');
    if (last && Math.abs(p.time-last.time)<1e-9) points[points.length-1]=p;
    else points.push(p);
    // Keep the endpoints and periodically decimate old telemetry. This is a
    // display history, not an independent integration or full-state archive.
    if (points.length>MAX_POINTS) {
      const reduced=[];
      for(let i=0;i<points.length;i+=2)reduced.push(points[i]);
      if(reduced[reduced.length-1]!==points[points.length-1])reduced.push(points[points.length-1]);
      points.splice(0,points.length,...reduced);
    }
    return p;
  }
  function at(points,time) {
    if (!points.length || !Number.isFinite(time) || time<points[0].time-1e-9 || time>points[points.length-1].time+1e-9) return null;
    let lo=0,hi=points.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].time<=time)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi];
    if(Math.abs(time-a.time)<1e-9 || hi===lo)return {...a,time};
    if(Math.abs(time-b.time)<1e-9)return {...b,time};
    const f=(time-a.time)/(b.time-a.time);
    return {time,gap:a.gap+f*(b.gap-a.gap),maxSpeed:a.maxSpeed+f*(b.maxSpeed-a.maxSpeed),divergence:a.divergence+f*(b.divergence-a.divergence)};
  }
  function sameInitial(a,b) {
    if (!a || !b || !a.initial || !b.initial) return false;
    return ['radiusA','radiusB','gap','gammaA','gammaB','perturbation'].every(k=>Math.abs((a.initial[k]||0)-(b.initial[k]||0))<1e-10) &&
      Math.abs(a.viscosity-b.viscosity)<1e-10 && Math.abs(a.diffusivity-b.diffusivity)<1e-10;
  }
  function context(reference,current) {
    if (!reference || !current) return '请先保留一组实验作为参考。';
    if (reference.forced || current.forced) return '至少一组包含交互外力；外力历史可能不同，不能作为纯粹的网格收敛验证。';
    if (!sameInitial(reference,current)) return '两组初态或黏度不同；这是物理参数对照，不是网格收敛检查。';
    if (reference.grid!==current.grid || Math.abs(reference.dt-current.dt)>1e-10 || reference.iterations!==current.iterations)
      return '初态相同，数值设置不同：可比较有限时间差异；两档对照本身并非收敛证明。';
    return '两组初态与数值设置相同；可检查重复运行是否一致。';
  }
  return {MAX_POINTS,sample,append,at,sameInitial,context};
});
