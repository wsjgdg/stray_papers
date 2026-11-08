'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../lightning-model.js'),A=require('../lightning-appearance.js');
function fixture(){const m=new L.Discharge({quality:'quick',eta:3.5,seed:19});assert.ok(m.solve().converged);for(let i=0;i<45;i++)assert.ok(m.step().ok);return m.snapshot();}
function close(a,b,tol=1e-6){assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);}
test('both views preserve grown bond endpoints while excluding the electrode scaffold',()=>{
  const d=fixture(),before=Array.from(d.segments),potential=Array.from(d.potential),detail=A.makePath(d,true),grid=A.makePath(d,false);
  assert.equal(detail.parts,4);assert.equal(grid.parts,1);assert.equal(detail.bonds,d.segments.length/2-d.seedSegmentCount);assert.equal(detail.edgeOffset,d.seedSegmentCount);
  assert.equal(detail.positions.length,detail.bonds*4*6);assert.equal(grid.positions.length,detail.bonds*6);
  for(let j=0;j<detail.bonds;j++){
    const start=A.node(d,d.segments[2*(j+d.seedSegmentCount)],4.8),end=A.node(d,d.segments[2*(j+d.seedSegmentCount)+1],4.8),base=j*4*6;
    for(let axis=0;axis<3;axis++){
      close(grid.positions[j*6+axis],start[axis]);close(grid.positions[j*6+3+axis],end[axis]);
      close(detail.positions[base+axis],start[axis]);close(detail.positions[base+3*6+3+axis],end[axis]);
      for(let k=1;k<4;k++)close(detail.positions[base+(k-1)*6+3+axis],detail.positions[base+k*6+axis]);
    }
    const v=end.map((x,i)=>x-start[i]),length=Math.hypot(...v),u=4.8/(d.ny-1);
    for(let k=1;k<4;k++){
      const p=Array.from(detail.positions.slice(base+k*6,base+k*6+3)),along=p.map((x,i)=>x-(start[i]+v[i]*k/4));
      assert.ok(Math.hypot(...along)<=.18*Math.SQRT2*u+1e-6);close(along.reduce((s,x,i)=>s+x*v[i],0)/length,0);
    }
  }
  assert.deepEqual(Array.from(d.segments),before);assert.deepEqual(Array.from(d.potential),potential);
  assert.deepEqual(A.makePath(d,true).positions,detail.positions,'sub-grid decoration is deterministic');
});
test('presentation capacity and empty trees are bounded independently of the solver',()=>{
  const empty={nx:17,ny:25,nz:17,segments:new Int32Array(0)};assert.equal(A.makePath(empty,true).positions.length,0);
  const segments=[];for(let i=0;i<A.MAX_BONDS+100;i++)segments.push(i,i+1);
  const path=A.makePath({...empty,segments:Int32Array.from(segments)},true);
  assert.equal(path.bonds,A.MAX_BONDS);assert.equal(path.radii.length,A.MAX_BONDS*A.DETAIL_PARTS);
  assert.ok(Array.from(path.positions).every(Number.isFinite));
});

test('straight grid can be subdivided for return-current samples without adding a visual bend',()=>{
  const d=fixture(),fine=A.makePath(d,false,4.8,4),grid=A.makePath(d,false,4.8);assert.equal(fine.parts,4);assert.equal(fine.bonds,grid.bonds);
  for(let e=0;e<fine.bonds;e++)for(let k=0;k<4;k++)for(let axis=0;axis<3;axis++){
    const a=grid.positions[6*e+axis],b=grid.positions[6*e+3+axis],p=fine.positions[24*e+6*k+axis],q=fine.positions[24*e+6*k+3+axis];
    close(p,a+(b-a)*k/4);close(q,a+(b-a)*(k+1)/4);
  }
});
