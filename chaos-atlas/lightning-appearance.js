/* Presentation geometry for the DBM tree. The solver's graph is never changed.
 * Both modes preserve every grown bond endpoint and branch connection; the
 * internal equipotential electrode scaffold is rendered as electrode voxels.
 * "Glow" inserts deterministic, bounded sub-grid bends for visual texture;
 * those bends, widths and brightness are NOT computed plasma or current.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightningAppearance=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MAX_BONDS=5000,DETAIL_PARTS=4;
  function node(d,index,height){
    const x=index%d.nx,j=(index-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny,u=height/(d.ny-1);
    return [(x-(d.nx-1)/2)*u,height/2-y*u,(z-(d.nz-1)/2)*u];
  }
  function noise(a,b,k){
    let h=(Math.imul(a+1,0x9e3779b1)^Math.imul(b+1,0x85ebca6b)^Math.imul(k+1,0xc2b2ae35))>>>0;
    h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
    return (h>>>0)/4294967295*2-1;
  }
  function makePath(d,detail=true,height=4.8,subdivide){
    const total=d.segments.length/2,start=Math.min(total,Math.max(0,Math.floor(Number(d.seedSegmentCount)||0)));
    const n=Math.min(total-start,MAX_BONDS),parts=Number.isInteger(subdivide)&&subdivide>=1&&subdivide<=DETAIL_PARTS?subdivide:detail?DETAIL_PARTS:1;
    const positions=new Float32Array(n*parts*6),radii=new Float32Array(n*parts),subtree=new Uint32Array(d.nx*d.ny*d.nz);
    for(let j=n-1;j>=0;j--){const a=d.segments[2*(j+start)],b=d.segments[2*(j+start)+1];subtree[a]+=1+subtree[b];}
    const u=height/(d.ny-1);let out=0,r=0;
    for(let j=0;j<n;j++){
      const a=d.segments[2*(j+start)],b=d.segments[2*(j+start)+1],p=node(d,a,height),q=node(d,b,height);
      const dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],length=Math.hypot(dx,dy,dz)||1;
      // Two unit vectors perpendicular to the actual bond. Sub-grid bends stay
      // within a small radius and are exactly zero at both physical endpoints.
      const vx=dx/length,vy=dy/length,vz=dz/length;
      const ax=Math.abs(vy)<.85?0:1,ay=Math.abs(vy)<.85?1:0;
      let n1x=vy*0-vz*ay,n1y=vz*ax-vx*0,n1z=vx*ay-vy*ax;
      const nl=Math.hypot(n1x,n1y,n1z)||1;n1x/=nl;n1y/=nl;n1z/=nl;
      const n2x=vy*n1z-vz*n1y,n2y=vz*n1x-vx*n1z,n2z=vx*n1y-vy*n1x;
      const radius=.0045+Math.min(.006,Math.log2(1+subtree[b])*.0013);
      let previous=p;
      for(let k=1;k<=parts;k++){
        const t=k/parts,amount=detail&&k<parts?.18*u*Math.sin(Math.PI*t):0;
        const d1=amount*noise(a,b,k*2),d2=amount*noise(a,b,k*2+1);
        const next=k===parts?q:[p[0]+dx*t+n1x*d1+n2x*d2,p[1]+dy*t+n1y*d1+n2y*d2,p[2]+dz*t+n1z*d1+n2z*d2];
        positions[out++]=previous[0];positions[out++]=previous[1];positions[out++]=previous[2];
        positions[out++]=next[0];positions[out++]=next[1];positions[out++]=next[2];radii[r++]=radius;previous=next;
      }
    }
    return {positions,radii,parts,bonds:n,edgeOffset:start};
  }
  return {makePath,node,MAX_BONDS,DETAIL_PARTS};
});
