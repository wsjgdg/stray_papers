'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{electronIsoLines}=require('../streamer-geometry.js'),{Streamer}=require('../streamer-model.js');
test('tetrahedral electron contour lies on a known linearly interpolated plane',()=>{
  const nx=3,ny=3,nz=3,electrons=new Float32Array(nx*ny*nz);for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)electrons[x+nx*(y+ny*z)]=y;
  const points=electronIsoLines({nx,ny,nz,electrons,stats:{maxElectron:2}},.25,4.8);assert.ok(points.length>0&&points.length%6===0);
  for(let i=0;i<points.length;i+=3){assert.ok(Math.abs(points[i+1]-1.2)<1e-6);assert.ok(Math.abs(points[i])<=2.4+1e-6);assert.ok(Math.abs(points[i+2])<=2.4+1e-6);}
});
test('zero field data has no spurious surface; actual contours change with evolving densities',()=>{
  const m=new Streamer({quality:'quick'});assert.ok(m.solve().converged);const a=electronIsoLines(m.snapshot());assert.ok(a.length>0);for(let i=0;i<30;i++)assert.ok(m.step().ok);
  const b=electronIsoLines(m.snapshot());assert.ok(b.length>0);assert.notDeepEqual(a,b);
  assert.equal(electronIsoLines({nx:2,ny:2,nz:2,electrons:new Float32Array(8),stats:{maxElectron:0}}).length,0);
});

test('triangulated isosurface exactly covers an analytic density plane with smooth finite normals',()=>{
  const {electronIsoMesh}=require('../streamer-geometry.js'),nx=3,ny=3,nz=3,electrons=new Float32Array(nx*ny*nz);
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)electrons[x+nx*(y+ny*z)]=y;
  const mesh=electronIsoMesh({nx,ny,nz,electrons,stats:{maxElectron:2}},.25,4.8),p=mesh.positions,n=mesh.normals;
  assert.ok(p.length>0&&p.length%9===0);assert.equal(n.length,p.length);let area=0;
  for(let i=0;i<p.length;i+=3){assert.ok(Math.abs(p[i+1]-1.2)<1e-6);assert.ok(Math.abs(n[i])<1e-6&&Math.abs(n[i+1]-1)<1e-6&&Math.abs(n[i+2])<1e-6);}
  for(let i=0;i<p.length;i+=9){const a=[p[i+3]-p[i],p[i+4]-p[i+1],p[i+5]-p[i+2]],b=[p[i+6]-p[i],p[i+7]-p[i+1],p[i+8]-p[i+2]];
    area+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2;}
  assert.ok(Math.abs(area-4.8*4.8)<1e-4,`plane area ${area}`);
});
test('mesh follows the evolving density and contains no surface for zero density',()=>{
  const {electronIsoMesh}=require('../streamer-geometry.js'),m=new Streamer({quality:'quick'});assert.ok(m.solve().converged);
  const a=electronIsoMesh(m.snapshot());for(let i=0;i<30;i++)assert.ok(m.step().ok);const b=electronIsoMesh(m.snapshot());
  assert.ok(a.positions.length>0&&b.positions.length>0);assert.notDeepEqual(a.positions,b.positions);
  for(let i=0;i<b.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(b.normals[i],b.normals[i+1],b.normals[i+2])-1)<1e-5);
  const empty=electronIsoMesh({nx:2,ny:2,nz:2,electrons:new Float32Array(8),stats:{maxElectron:0}});assert.equal(empty.positions.length,0);assert.equal(empty.normals.length,0);
});
