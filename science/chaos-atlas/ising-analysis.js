/* Geometry-only diagnostics for an actual periodic Ising microstate.
 * A boundary site has at least one oppositely oriented nearest neighbour.
 * This is a lattice classification, not a measured material domain wall. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IsingInsights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function interfaces(size, spins) {
    if (!Number.isInteger(size) || size < 2 || size > 32) throw new Error('晶格尺寸必须为 2–32 的整数。');
    const n=size, plane=n*n, count=plane*n;
    if (!spins || spins.length!==count) throw new Error('自旋数量与晶格尺寸不一致。');
    const mask=new Uint8Array(count), opposite=new Uint8Array(count);
    let sites=0, bonds=0;
    for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=x+n*y+plane*z, s=spins[i];
      if(s!==1&&s!==-1)throw new Error('自旋必须为 +1 或 −1。');
      const xp=(x+1)%n+n*y+plane*z,xm=(x+n-1)%n+n*y+plane*z;
      const yp=x+n*((y+1)%n)+plane*z,ym=x+n*((y+n-1)%n)+plane*z;
      const zp=x+n*y+plane*((z+1)%n),zm=x+n*y+plane*((z+n-1)%n);
      const dp=Number(spins[xp]!==s)+Number(spins[yp]!==s)+Number(spins[zp]!==s);
      const other=dp+Number(spins[xm]!==s)+Number(spins[ym]!==s)+Number(spins[zm]!==s);
      bonds+=dp;opposite[i]=other;if(other){mask[i]=1;sites++;}
    }
    return {mask,opposite,sites,siteFraction:sites/count,bonds,bondFraction:bonds/(3*count),count};
  }
  return {interfaces};
});
