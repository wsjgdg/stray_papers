'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),L=require('../lightning-model.js');
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b} (tolerance ${tol})`);
function create(o={}) {const m=new L.Discharge({quality:'quick',seed:19,...o});assert.ok(m.solve().converged);return m;}
function run(m,n){for(let i=0;i<n;i++){const s=m.step();assert.equal(s.ok,true,JSON.stringify(s));if(s.complete)break;}}

test('voltage plates and movable tips are real 3D Dirichlet boundary cells',()=>{
  const m=create({sourceX:5,sourceZ:7,targetX:11,targetZ:9});
  for(let z=0;z<m.nz;z++)for(let x=0;x<m.nx;x++){
    near(m.potential[m.index(x,0,z)],0);near(m.potential[m.index(x,m.ny-1,z)],1);
  }
  for(let y=0;y<=m.rodLength;y++)assert.equal(m.mask[m.index(5,y,7)],L.CHANNEL);
  for(let y=m.ny-1-m.rodLength;y<m.ny;y++)assert.equal(m.mask[m.index(11,y,9)],L.TARGET);
  assert.ok(m.potential.every(v=>Number.isFinite(v)&&v>=-1e-5&&v<=1+1e-5));
  assert.ok(m.solveInfo.converged);assert.ok(m.residual()<=m.tolerance);
});

test('18-neighbour weighted graph Laplacian uses insulating sides and converges to an independent tighter solve',()=>{
  const m=create();let worst=0;
  for(let z=0;z<m.nz;z++)for(let y=1;y<m.ny-1;y++)for(let x=0;x<m.nx;x++){
    const i=m.index(x,y,z);if(m.mask[i]!==L.EMPTY)continue;
    let sum=0,degree=0;
    // Rebuild the graph independently, including missing Neumann wall bonds.
    for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const d=Math.abs(dx)+Math.abs(dy)+Math.abs(dz),xx=x+dx,yy=y+dy,zz=z+dz;
      if(d<1||d>2||xx<0||xx>=m.nx||yy<0||yy>=m.ny||zz<0||zz>=m.nz)continue;
      const w=1/d;sum+=w*m.potential[m.index(xx,yy,zz)];degree+=w;
    }
    const avg=sum/degree;worst=Math.max(worst,Math.abs(avg-m.potential[i]));
  }
  near(m.residual(),worst,1e-14);assert.ok(worst<=m.tolerance);
  const old=Float64Array.from(m.potential);assert.ok(m.solve(10000,1e-9).converged);
  const max=Math.max(...old.map((v,i)=>Math.abs(v-m.potential[i])));assert.ok(max<.001,`finite-iteration initial voltage difference ${max}`);
});

test('after growth the residual is checked before subsequent growth and tight solve remains close',()=>{
  const m=create({eta:2.8});run(m,45);assert.ok(m.residual()<=m.tolerance);
  const old=Float64Array.from(m.potential),result=m.solve(10000,1e-9);assert.ok(result.converged);
  let max=0;for(let i=0;i<m.count;i++)max=Math.max(max,Math.abs(old[i]-m.potential[i]));
  assert.ok(max<.002,`finite-iteration post-growth voltage difference ${max}`);
});

test('growth probabilities are normalized site sums over actual conductor bonds',()=>{
  for(const eta of [0,1,2.8,8]){
    const m=create({eta});run(m,8);const {ids,probabilities,drops,faceLinks,diagonalLinks}=m.candidates();assert.ok(ids.length>5);
    near(Array.from(probabilities).reduce((a,b)=>a+b,0),1,2e-6);
    let sum=0;const weights=[];
    for(let k=0;k<ids.length;k++){
      const id=ids[k],d=drops[k],weight=(faceLinks[k]+diagonalLinks[k]*Math.pow(Math.SQRT1_2,eta))*(eta===0?1:d**eta);
      weights.push(weight);sum+=weight;
      assert.ok(m.mask[id]!==L.CHANNEL&&m.mask[id]!==L.SOURCE);assert.ok(d>=0&&d<=1);
      const c=m.coords(id);let faces=0,diagonals=0;
      for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const d=Math.abs(dx)+Math.abs(dy)+Math.abs(dz),x=c.x+dx,y=c.y+dy,z=c.z+dz;
        if(d<1||d>2||x<0||x>=m.nx||y<0||y>=m.ny||z<0||z>=m.nz)continue;
        if(m.mask[m.index(x,y,z)]===L.CHANNEL){if(d===1)faces++;else diagonals++;}
      }
      assert.equal(faces,faceLinks[k]);assert.equal(diagonals,diagonalLinks[k]);assert.equal(faces+diagonals,m.links[id]);
    }
    for(let k=0;k<ids.length;k++)near(probabilities[k],weights[k]/sum,3e-7);
  }
});

test('eta can change growth probabilities without changing existing geometry or the solved field',()=>{
  const m=create({eta:1});run(m,20);const old=m.snapshot(),first=m.candidates();m.eta=4;const next=m.candidates();
  assert.deepEqual(m.snapshot().segments,old.segments);assert.deepEqual(m.snapshot().potential,old.potential);
  assert.deepEqual(first.ids,next.ids);assert.ok(first.probabilities.some((p,i)=>Math.abs(p-next.probabilities[i])>.0001));
});

test('seed, geometry and parameters make the actual random growth exactly repeatable',()=>{
  const a=create({seed:37,eta:2.8}),b=create({seed:37,eta:2.8}),c=create({seed:38,eta:2.8});run(a,55);run(b,55);run(c,55);
  assert.deepEqual(a.segments,b.segments);assert.deepEqual(a.potential,b.potential);assert.notDeepEqual(a.segments,c.segments);
  assert.deepEqual(a.snapshot().probabilities,b.snapshot().probabilities);
});

test('each stochastic addition attaches once to a face or edge-diagonal neighbour',()=>{
  const m=create({eta:2.4});let diagonals=0,old=new Set();for(let i=0;i<m.count;i++)if(m.mask[i]===L.CHANNEL)old.add(i);
  for(let k=0;k<100;k++){
    const before=m.segments.length,s=m.step();assert.ok(s.ok);assert.equal(m.segments.length,before+2);
    const parent=m.segments.at(-2),child=m.segments.at(-1);assert.ok(old.has(parent));assert.equal(old.has(child),false);
    const a=m.coords(parent),b=m.coords(child),dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y),dz=Math.abs(a.z-b.z),d=dx+dy+dz;
    assert.ok(dx<=1&&dy<=1&&dz<=1&&(d===1||d===2));if(d===2)diagonals++;
    if(s.complete){assert.equal(m.mask[child],L.TARGET);break;}
    old.add(child);assert.equal(m.mask[child],L.CHANNEL);assert.equal(m.parent[child],parent);
  }
  assert.ok(diagonals>0,'the diagonal bonds are genuinely used');
});


test('a multi-parent candidate chooses its face and diagonal bonds with the correct length weighting',()=>{
  function choose(diagonal){
    const m=create({eta:2.8,seed:67});run(m,15);const c=m.candidates();
    let at=-1;for(let i=0;i<c.ids.length;i++)if(c.faceLinks[i]&&c.diagonalLinks[i]&&c.probabilities[i]>1e-5&&m.mask[c.ids[i]]===L.EMPTY){at=i;break;}
    assert.ok(at>=0,'a candidate has both types of bond');
    let position=0;for(let i=0;i<at;i++)position+=c.probabilities[i];position+=c.probabilities[at]/2;
    const threshold=c.faceLinks[at]/(c.faceLinks[at]+c.diagonalLinks[at]*Math.pow(Math.SQRT1_2,m.eta));
    const draws=[position,threshold+(diagonal?1:-1)*1e-7];m.random.next=()=>draws.shift();
    const r=m.step();assert.ok(r.ok);assert.equal(m.lastChoice.site,c.ids[at]);
    return m.lastChoice.distance;
  }
  near(choose(false),1);near(choose(true),Math.SQRT2);
});

test('contact ends growth before attempting incompatible voltage conditions',()=>{
  const m=create({eta:6,seed:3});run(m,300);
  assert.equal(m.complete,true);const child=m.segments.at(-1);assert.equal(m.mask[child],L.TARGET);near(m.potential[child],1);
  assert.equal(m.candidates().ids.length,0);const before=m.segments.length;assert.equal(m.step().reason,'complete');assert.equal(m.segments.length,before);
  assert.ok(m.solveInfo.converged);assert.ok(m.residual()<=m.tolerance);
});

test('moving a target needle changes the solved field, not merely its rendering',()=>{
  const a=create({sourceX:8,sourceZ:8,targetX:8,targetZ:8}),b=create({sourceX:8,sourceZ:8,targetX:3,targetZ:3});
  assert.notDeepEqual(a.mask,b.mask);let difference=0;for(let i=0;i<a.count;i++)difference=Math.max(difference,Math.abs(a.potential[i]-b.potential[i]));
  assert.ok(difference>.1,`change ${difference}`);
});

test('failed convergence blocks growth and is surfaced instead of using an unverified field',()=>{
  const m=new L.Discharge({quality:'quick',maxSweeps:1,tolerance:1e-7});
  assert.equal(m.step().reason,'unconverged');const r=m.solve();assert.equal(r.converged,false);assert.equal(m.step().reason,'unconverged');assert.equal(m.steps,0);
});

test('quality levels retain the same box aspect ratio while discretizing the tips',()=>{
  for(const g of Object.values(L.GRIDS)){near((g.nx-1)/(g.ny-1),2/3);near((g.nz-1)/(g.ny-1),2/3);}
  const a=create({quality:'quick'}),b=create({quality:'standard'});
  assert.ok(Math.abs(a.rodLength*a.h-b.rodLength*b.h)<=(a.h+b.h)/2);
  assert.notEqual(a.h,b.h); // tip length snaps to a grid cell and its width is one cell
});

test('extreme legal eta and off-center electrodes stay finite over actual growth',()=>{
  for(const eta of [0,8])for(const [sx,sz,tx,tz] of [[2,2,14,14],[14,2,2,14],[8,8,8,8]]){
    const m=create({eta,sourceX:sx,sourceZ:sz,targetX:tx,targetZ:tz,seed:103});run(m,60);
    assert.ok(m.potential.every(Number.isFinite));assert.ok(m.solveInfo.converged);assert.ok(m.residual()<=m.tolerance);
  }
});

test('electrode shapes and physical sizes change actual fixed-potential voxels and the field',()=>{
  const options={quality:'standard',electrodeRadius:.08,electrodeLength:.16,seed:12};
  const needle=create({...options,electrodeShape:'needle'}),blunt=create({...options,electrodeShape:'blunt'}),longer=create({...options,electrodeShape:'needle',electrodeLength:.2});
  assert.ok(blunt.sourceBody.length>needle.sourceBody.length);assert.ok(blunt.targetBody.length>needle.targetBody.length);
  assert.notDeepEqual(needle.mask,blunt.mask);assert.notDeepEqual(needle.mask,longer.mask);
  let diff=0;for(let i=0;i<needle.count;i++)diff=Math.max(diff,Math.abs(needle.potential[i]-blunt.potential[i]));assert.ok(diff>.02,`field difference ${diff}`);
  for(const m of [needle,blunt,longer]){
    assert.ok(m.sourceBody.every(i=>m.mask[i]===L.CHANNEL&&m.potential[i]===0));
    assert.ok(m.targetBody.every(i=>m.mask[i]===L.TARGET&&m.potential[i]===1));
    assert.equal(m.stats().junctions,0,'electrode scaffold is not a branching discharge');assert.equal(m.steps,0);assert.equal(m.seedSegmentCount,m.sourceBody.length-1);
    const seen=new Set([m.segments[0]]);for(let j=0;j<m.segments.length;j+=2){assert.ok(seen.has(m.segments[j]));assert.ok(!seen.has(m.segments[j+1]));seen.add(m.segments[j+1]);}
  }
  // One concrete experiment, not a universal assertion about every geometry.
  assert.ok(Math.max(...needle.candidates().drops)>Math.max(...blunt.candidates().drops));
});
test('target electrode dimensions remain physical across grids with explicit voxel snapping',()=>{
  for(const quality of ['quick','standard','fine','ultra']){
    const m=create({quality,electrodeShape:'blunt',electrodeRadius:.08,electrodeLength:.16,sourceX:0,sourceZ:0});
    assert.ok(Math.abs(m.rodLength*m.h-.16)<=m.h/2+1e-12);assert.equal(m.electrodeRadius,.08);
    assert.ok(m.sourceX>=Math.ceil(m.electrodeRadius/m.h));assert.ok(m.sourceZ>=Math.ceil(m.electrodeRadius/m.h));
    assert.ok(m.solveInfo.converged&&m.residual()<=m.tolerance);
  }
});


test('an electrode that cannot fit a custom narrow domain is rejected before indexing',()=>{
  assert.throws(()=>new L.Discharge({nx:7,ny:61,nz:7,electrodeRadius:.10}),/半径超过/);
});

test('extreme allowed voxel electrodes stay finite across all four actual grids',()=>{
  for(const quality of ['quick','standard','fine','ultra'])for(const electrodeShape of ['needle','blunt']){
    const g=L.GRIDS[quality],h=1/(g.ny-1),margin=Math.max(2,Math.ceil(.1/h));
    const m=create({quality,electrodeShape,electrodeRadius:.1,electrodeLength:.2,sourceX:margin,sourceZ:margin,targetX:g.nx-1-margin,targetZ:g.nz-1-margin,eta:8,seed:33});
    run(m,4);assert.ok(m.solveInfo.converged&&m.residual()<=m.tolerance);assert.ok(m.potential.every(Number.isFinite));
    assert.equal(m.sourceBody.length,m.seedSegmentCount+1);assert.ok(m.sourceBody.every(i=>i>=0&&i<m.count));
  }
});
