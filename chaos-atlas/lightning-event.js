/* Compare two snapshots of the SAME single, non-contact DBM growth event.
 * Gradients are central differences in free interior cells only. No field is
 * invented after electrical contact, where the DBM solver intentionally stops.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightningEvent=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function compare(before,after){
    if(!before||!after||!before.stats||!after.stats||after.stats.complete)throw Error('接触事件没有可比较的后场');
    if(before.stats.complete||after.stats.steps!==before.stats.steps+1||before.nx!==after.nx||before.ny!==after.ny||before.nz!==after.nz||before.eta!==after.eta||before.seed!==after.seed)throw Error('快照不是同一条件下的相邻生长事件');
    for(const key of ['sourceX','sourceZ','targetX','targetZ','electrodeShape','electrodeLength','electrodeRadius','h'])if(before[key]!==after[key])throw Error('电极或网格参数已改变');
    if(after.segments.length!==before.segments.length+2||!before.segments.every((v,i)=>v===after.segments[i]))throw Error('生长树快照不连续');
    const n=before.nx*before.ny*before.nz;if(before.potential.length!==n||after.potential.length!==n)throw Error('场数组尺寸不一致');
    const eb=new Float32Array(n),ea=new Float32Array(n),deltaPhi=new Float32Array(n),deltaE=new Float32Array(n),valid=new Uint8Array(n);eb.fill(NaN);ea.fill(NaN);deltaE.fill(NaN);
    let best=-1,maxE=0,maxPhi=0;
    const nx=before.nx,ny=before.ny,nz=before.nz,stride=nx*ny,inv=1/(2*before.h);
    function mag(p,i){return Math.hypot((p[i+1]-p[i-1])*inv,(p[i+nx]-p[i-nx])*inv,(p[i+stride]-p[i-stride])*inv);}
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const i=x+nx*(y+ny*z);if(before.mask[i]!==0||after.mask[i]!==0)continue;
      const a=mag(before.potential,i),b=mag(after.potential,i);eb[i]=a;ea[i]=b;deltaPhi[i]=after.potential[i]-before.potential[i];deltaE[i]=b-a;valid[i]=1;
      maxPhi=Math.max(maxPhi,Math.abs(deltaPhi[i]));if(Math.abs(deltaE[i])>maxE){maxE=Math.abs(deltaE[i]);best=i;}
    }
    return {before,after,eb,ea,deltaPhi,deltaE,valid,best,maxE,maxPhi};
  }
  function sample(c,x,y,z){
    const d=c.before;x=clamp(Math.round(x),0,d.nx-1);y=clamp(Math.round(y),0,d.ny-1);z=clamp(Math.round(z),0,d.nz-1);
    const id=x+d.nx*(y+d.ny*z),a=d.candidateIds.indexOf(id),b=c.after.candidateIds.indexOf(id);
    return {id,x,y,z,valid:!!c.valid[id],phiBefore:d.potential[id],phiAfter:c.after.potential[id],deltaPhi:c.after.potential[id]-d.potential[id],
      fieldBefore:c.eb[id],fieldAfter:c.ea[id],deltaE:c.deltaE[id],probBefore:a<0?null:d.probabilities[a],probAfter:b<0?null:c.after.probabilities[b]};
  }
  function slice(c,mode,z){
    const d=c.before,nx=d.nx,ny=d.ny;z=clamp(Math.round(z),0,d.nz-1);const diff=mode==='deltaPhi'||mode==='deltaE',arr=mode==='deltaE'?c.deltaE:c.deltaPhi;
    let scale=0;if(diff)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=x+nx*(y+ny*z);if(c.valid[i])scale=Math.max(scale,Math.abs(arr[i]));}
    const bytes=new Uint8Array(nx*ny*4);
    for(let row=0;row<ny;row++)for(let x=0;x<nx;x++){
      const y=ny-1-row,i=x+nx*(y+ny*z),k=4*(x+row*nx);let r,g,b,a;
      if(diff){
        if(!c.valid[i]){a=0;r=g=b=0;}else{const t=scale?clamp(arr[i]/scale,-1,1):0,mag=Math.pow(Math.abs(t),.3);r=Math.round(48+(t>0?207:-30)*mag);g=Math.round(58+(t>0?37:100)*mag);b=Math.round(62+(t<0?193:-30)*mag);a=Math.round(35+220*mag);}
      }else{const v=clamp((mode==='before'?d:c.after).potential[i],0,1);r=Math.round(25+190*v);g=Math.round(72+102*v);b=Math.round(92+24*v);a=104;}
      bytes[k]=r;bytes[k+1]=g;bytes[k+2]=b;bytes[k+3]=a;
    }
    return {bytes,scale};
  }
  return {compare,sample,slice};
});
