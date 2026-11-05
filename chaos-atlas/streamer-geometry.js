/* Isolines and a triangulated isosurface from the actual electron grid.
 * Each lattice cube is decomposed into six tetrahedra. Vertices lie on the
 * linearly interpolated n_e = fraction * max(n_e) surface, not a drawn shape.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StreamerGeometry=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]],edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  function electronIsoLines(d,fraction=.25,height=4.8){
    const {nx,ny,nz,electrons}=d,max=d.stats.maxElectron,threshold=max*fraction;if(!(threshold>0))return new Float32Array(0);
    const positions=[],plane=nx*ny,u=height/(ny-1),indexOffsets=[0,1,1+nx,nx,plane,plane+1,plane+nx+1,plane+nx];
    const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],ids=new Int32Array(8),values=new Float64Array(8);
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const base=x+nx*(y+ny*z);let lo=Infinity,hi=-Infinity;
      for(let c=0;c<8;c++){ids[c]=base+indexOffsets[c];values[c]=electrons[ids[c]];lo=Math.min(lo,values[c]);hi=Math.max(hi,values[c]);}
      if(lo>=threshold||hi<threshold)continue;
      for(const tet of tetra){const crossed=[];
        for(const [a,b] of edges){const i=tet[a],j=tet[b],vi=values[i],vj=values[j];if((vi>=threshold)===(vj>=threshold))continue;
          const t=(threshold-vi)/(vj-vi),p=corners[i],q=corners[j];
          crossed.push([(x+p[0]+t*(q[0]-p[0])-(nx-1)/2)*u,height/2-(y+p[1]+t*(q[1]-p[1]))*u,(z+p[2]+t*(q[2]-p[2])-(nz-1)/2)*u]);
        }
        if(crossed.length<3)continue;
        // Show one segment from each planar tetrahedral intersection. This
        // sparse contour avoids visually obscuring the underlying volume.
        positions.push(...crossed[0],...crossed[1]);
      }
    }
    return Float32Array.from(positions);
  }
  // The same piecewise-linear tetrahedral surface, as triangles. Vertex normals
  // are interpolated finite-difference density gradients used for shading only;
  // they do not change the iso-value or the simulated state.
  function electronIsoMesh(d,fraction=.25,height=4.8){
    const {nx,ny,nz,electrons}=d,threshold=d.stats.maxElectron*fraction;
    if(!(threshold>0))return {positions:new Float32Array(0),normals:new Float32Array(0)};
    const plane=nx*ny,u=height/(ny-1),grad=new Float32Array(electrons.length*3);
    const index=(x,y,z)=>x+nx*(y+ny*z);
    for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const i=index(x,y,z),left=Math.max(0,x-1),right=Math.min(nx-1,x+1),top=Math.max(0,y-1),bottom=Math.min(ny-1,y+1),near=Math.max(0,z-1),far=Math.min(nz-1,z+1);
      grad[3*i]=-(electrons[index(right,y,z)]-electrons[index(left,y,z)])/(right-left||1);
      grad[3*i+1]=(electrons[index(x,bottom,z)]-electrons[index(x,top,z)])/(bottom-top||1);
      grad[3*i+2]=-(electrons[index(x,y,far)]-electrons[index(x,y,near)])/(far-near||1);
    }
    const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],offsets=[0,1,1+nx,nx,plane,plane+1,plane+nx+1,plane+nx];
    const ids=new Int32Array(8),values=new Float64Array(8),positions=[],normals=[];
    for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const base=index(x,y,z);let lo=Infinity,hi=-Infinity;
      for(let c=0;c<8;c++){ids[c]=base+offsets[c];values[c]=electrons[ids[c]];lo=Math.min(lo,values[c]);hi=Math.max(hi,values[c]);}
      if(lo>=threshold||hi<threshold)continue;
      function intersection(i,j){
        const t=(threshold-values[i])/(values[j]-values[i]),a=corners[i],b=corners[j],ia=3*ids[i],ib=3*ids[j];
        const px=(x+a[0]+t*(b[0]-a[0])-(nx-1)/2)*u,py=height/2-(y+a[1]+t*(b[1]-a[1]))*u,pz=(z+a[2]+t*(b[2]-a[2])-(nz-1)/2)*u;
        let gx=grad[ia]+t*(grad[ib]-grad[ia]),gy=grad[ia+1]+t*(grad[ib+1]-grad[ia+1]),gz=grad[ia+2]+t*(grad[ib+2]-grad[ia+2]);
        const len=Math.hypot(gx,gy,gz);if(len>1e-20){gx/=len;gy/=len;gz/=len;}else{gx=0;gy=1;gz=0;}
        return [px,py,pz,gx,gy,gz];
      }
      function triangle(a,b,c){for(const v of [a,b,c]){positions.push(v[0],v[1],v[2]);normals.push(v[3],v[4],v[5]);}}
      for(const tet of tetra){
        const inside=[],outside=[];for(const k of tet)(values[k]>=threshold?inside:outside).push(k);
        if(!inside.length||!outside.length)continue;
        if(inside.length===1){const a=inside[0];triangle(intersection(a,outside[0]),intersection(a,outside[1]),intersection(a,outside[2]));}
        else if(outside.length===1){const a=outside[0];triangle(intersection(a,inside[0]),intersection(a,inside[1]),intersection(a,inside[2]));}
        else{const a=intersection(inside[0],outside[0]),b=intersection(inside[0],outside[1]),c=intersection(inside[1],outside[0]),e=intersection(inside[1],outside[1]);triangle(a,b,c);triangle(c,b,e);}
      }
    }
    return {positions:Float32Array.from(positions),normals:Float32Array.from(normals)};
  }
  return {electronIsoLines,electronIsoMesh};
});
