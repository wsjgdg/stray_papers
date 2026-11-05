'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../relativity-model.js'),W=require('../relativity-worlds.js'),F=require('../relativity-foliage-mask.js');

// A deliberately brute-force reference: no group bounding-volume shortcut.
function naive(origin,ray,id,observer){
  let best=null;
  if(ray[1]<-1e-10){const d=-origin[1]/ray[1];if(d>1e-6)best={distance:d,kind:'floor',material:W.material.floor};}
  const groups=[...W.get(id),...(observer?[W.pedestal]:[])];
  for(const g of groups)for(const b of g.boxes){
    let h;
    if(b.primitive==='foliage'){
      const axis=b.axis,across=axis===2?0:2,t=Math.abs(ray[axis])<1e-8?-1:(b.center[axis]-origin[axis])/ray[axis];
      const u=(origin[across]+t*ray[across]-b.center[across])/(2*b.half[across])+.5,v=(origin[1]+t*ray[1]-b.center[1])/(2*b.half[1])+.5;
      if(t>1e-6&&F.solid(b.species,u,v)){const normal=[0,0,0];normal[axis]=ray[axis]>0?-1:1;h={distance:t,normal};}
    }else if(b.primitive==='cylinder')h=M.cylinderIntersection(M.sub(origin,b.center),ray,b.radius,b.half[b.axis],b.axis);
    else h=b.primitive==='triangle'?M.triangleIntersection(origin,ray,b.a,b.b,b.c):M.boxIntersection(M.sub(origin,b.center),ray,b.half);
    if(h&&(!best||h.distance<best.distance))best={...h,kind:b.kind,material:b.material};
  }
  return best;
}
function rng(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

// The original allocating slab traversal is an independent reference for the
// distance-only BVH shortcut. Surface intersections are deliberately shared.
function referenceBounds(origin,ray,id,observer=false){
  let best=null;
  if(ray[1]<-1e-10){const d=-origin[1]/ray[1];if(d>1e-6)best={distance:d,point:M.add(origin,M.scale(ray,d)),normal:[0,1,0],kind:'floor',material:W.material.floor};}
  function visit(node){
    const local=M.sub(origin,node.center),bound=M.boxIntersection(local,ray,node.half);
    if(!bound)return;
    const inside=local.every((v,k)=>Math.abs(v)<=node.half[k]);
    if(best&&!inside&&bound.distance>best.distance)return;
    if(node.boxes){for(const b of node.boxes){
      const h=W.intersection(origin,ray,b);
      if(h&&(!best||h.distance<best.distance))best={...h,point:M.add(origin,M.scale(ray,h.distance)),kind:b.kind,material:b.material,center:b.center,half:b.half};
    }}else{visit(node.left);visit(node.right);}
  }
  visit(W.tree(id));if(observer)visit(W.pedestal);return best;
}

test('five finite, different worlds use valid immutable geometry and conservative group bounds',()=>{
  assert.deepEqual(W.IDs,['station','street','corridor','mountain','harbor']);
  const histograms=[];
  for(const id of W.IDs){
    const groups=W.get(id),hist={};assert.ok(groups.length>=20,id);assert.ok(Object.isFrozen(groups));
    for(const group of groups){
      assert.ok(group.boxes.length>0);assert.ok(Object.isFrozen(group));
      for(const b of group.boxes){
        assert.ok(W.material[b.kind]>0);assert.equal(b.material,W.material[b.kind]);assert.ok(b.half.every(v=>v>0));
        for(let i=0;i<3;i++)assert.ok(Math.abs(b.center[i]-group.center[i])+b.half[i]<=group.half[i]+1e-10);
        hist[b.kind]=(hist[b.kind]||0)+1;
      }
    }
    function checkTree(node){
      assert.ok(Object.isFrozen(node));
      const descendants=node.boxes||[node.left,node.right];
      for(const child of descendants)for(let k=0;k<3;k++)assert.ok(Math.abs(child.center[k]-node.center[k])+child.half[k]<=node.half[k]+1e-9,`${id} BVH bound`);
      if(!node.boxes){checkTree(node.left);checkTree(node.right);}
    }
    checkTree(W.tree(id));histograms.push(JSON.stringify(hist));
  }
  assert.equal(new Set(histograms).size,5);assert.equal(W.get('unknown'),W.get('station'));
});

test('distinct world objects are finite-distance ray hits, not merely backgrounds',()=>{
  const o=[0,1.65,0],cases=[
    ['station',[0,1,0],'ceiling'],
    ['street',[1,.1,1],'building-glass'],
    ['corridor',[1,0,.3],'wall'],
    ['corridor',[0,1,0],'ceiling'],
    ['mountain',[4.695,-.81,6],'rail']
  ];
  for(const [env,dir,kind] of cases){const h=W.trace(o,M.normalize(dir),env);assert.ok(h,env);assert.equal(h.kind,kind,env);assert.ok(Number.isFinite(h.distance));assert.ok(h.point.every(Number.isFinite));}
  const ground=W.trace(o,[0,-1,0],'street');assert.equal(ground.kind,'floor');assert.ok(Math.abs(ground.distance-1.65)<1e-12);
  const train=W.trace([0,2,0],M.normalize([-6.28,0,8]),'station');assert.equal(train.kind,'train-door');
  const slope=W.trace([10,5,15],[0,-1,0],'mountain');assert.equal(slope.kind,'terrain');assert.ok(slope.point[1]>0&&slope.point[1]<5);assert.ok(slope.normal[1]>.9);
  const hills=W.get('mountain').flatMap(g=>g.boxes).filter(b=>b.primitive==='triangle');assert.equal(hills.length,32);for(const h of hills)assert.ok(M.cross(M.sub(h.b,h.a),M.sub(h.c,h.a))[1]>0);

});

test('accelerated world tracing equals brute-force intersections, including inside group bounds',()=>{
  const random=rng(0x5eed42),origins=[[0,1.65,0],[0,2.2,4.5],[4.95,2.55,4.5],[0,4.39,8.4],[2.35,.24,8.8]];
  let rays=0;
  for(const id of W.IDs)for(const origin of origins)for(const observer of [false,true])for(let k=0;k<500;k++){
    let d=[random()*2-1,random()*2-1,random()*2-1];if(M.length(d)<1e-9)d=[1,0,0];d=M.normalize(d);
    const a=W.trace(origin,d,id,observer),b=naive(origin,d,id,observer);rays++;
    assert.equal(a?.kind,b?.kind,`${id} ${origin} ${d}`);
    if(a&&b){assert.equal(a.material,b.material);assert.ok(Math.abs(a.distance-b.distance)<1e-9,`${id} ${origin} ${d}`);}
  }
  assert.equal(rays,W.IDs.length*5000);
});


test('conservative bounds match primitive hits on faces, inside origins and nearly parallel rays',()=>{
  const rays=[[0,0,0],[1e-13,0,0],[1e-12,0,0],[-1e-12,1e-12,0],
    [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    [1e-13,0,1],[-1e-13,0,-1],[1e-12,1,-1e-12],[1e-9,-1,0],[1,1,1]];
  let comparisons=0;
  for(const id of W.IDs){
    const nodes=[];function collect(node){nodes.push(node);if(!node.boxes){collect(node.left);collect(node.right);}}collect(W.tree(id));nodes.push(W.pedestal);
    for(const node of nodes){
      const origins=[node.center];
      for(let k=0;k<3;k++)for(const sign of [-1,1]){const point=node.center.slice();point[k]+=sign*node.half[k];origins.push(point);}
      for(const origin of origins)for(const ray of rays)for(const observer of [false,true]){
        const actual=W.trace(origin,ray,id,observer),previous=referenceBounds(origin,ray,id,observer);
        if(JSON.stringify(actual)!==JSON.stringify(previous)){
          // A boundary-rounded hierarchy box can place the origin 1 ulp
          // outside and make the old traversal cull its near surface. The
          // independent exhaustive primitives decide such disagreements.
          const exact=naive(origin,ray,id,observer);assert.equal(actual?.kind,exact?.kind,`${id} ${origin} ${ray}`);
          if(actual&&exact)assert.ok(Math.abs(actual.distance-exact.distance)<1e-9);
        }else assert.deepEqual(actual,previous);
        comparisons++;
      }
    }
  }
  assert.ok(comparisons>80000,`boundary comparisons: ${comparisons}`);
});

test('scene detail uses finite geometry, including wheel cylinders, pipes and shared cutout foliage',()=>{
  const parts=id=>W.get(id).flatMap(g=>g.boxes);
  for(const [id,kind,count] of [['station','bin',2],['station','platform-panel',2],['corridor','pipe',4],['corridor','cabinet',6],['street','car-body',4],['street','tire',8],['street','tree-deciduous',8],['mountain','tree-conifer',24]])
    assert.ok(parts(id).filter(p=>p.kind===kind).length>=count,`${id} ${kind}`);
  const tires=parts('street').filter(p=>p.kind==='tire');assert.ok(tires.every(p=>p.primitive==='cylinder'&&p.axis===0));
  const pipes=parts('corridor').filter(p=>p.kind==='pipe');assert.ok(pipes.every(p=>p.primitive==='cylinder'));assert.ok(pipes.filter(p=>p.axis===2).length>=4);assert.ok(pipes.some(p=>p.axis===1));
  for(const kind of ['tree-conifer','tree-deciduous']){
    const card=parts(kind==='tree-conifer'?'mountain':'street').find(p=>p.kind===kind&&p.axis===2);let opaque=null,hole=null;
    for(let y=5;y<F.HEIGHT-5;y++)for(let x=5;x<F.WIDTH-5;x++){
      const uv=[(x+.5)/F.WIDTH,1-(y+.5)/F.HEIGHT];
      if(F.solid(card.species,...uv)&&!opaque)opaque=uv;if(!F.solid(card.species,...uv)&&!hole)hole=uv;
    }
    assert.ok(opaque&&hole,kind);
    function hitAt(uv){const pos=[card.center[0]+(uv[0]-.5)*2*card.half[0],card.center[1]+(uv[1]-.5)*2*card.half[1],card.center[2]-2];return W.intersection(pos,[0,0,1],card);}
    assert.ok(hitAt(opaque),`${kind} opaque leaves must intersect`);assert.equal(hitAt(hole),null,`${kind} clear mask holes must not intersect`);
  }
});

test('finite cylinders report side and cap hits for all axes and non-unit rays',()=>{
  for(let axis=0;axis<3;axis++){
    const radial=(axis+1)%3,origin=[0,0,0],ray=[0,0,0];origin[radial]=-3;ray[radial]=2;
    const side=M.cylinderIntersection(origin,ray,1,2,axis);assert.ok(side);assert.ok(Math.abs(side.distance-1)<1e-12);assert.equal(side.normal[radial],-1);
    const capOrigin=[0,0,0],capRay=[0,0,0];capOrigin[axis]=4;capRay[axis]=-2;
    const cap=M.cylinderIntersection(capOrigin,capRay,1,2,axis);assert.ok(cap);assert.ok(Math.abs(cap.distance-1)<1e-12);assert.equal(cap.normal[axis],1);
    assert.equal(M.cylinderIntersection([4,4,4],[1,0,0],1,2,axis),null);
  }
});

test('first-hit shadow visibility agrees with full closest-hit tracing for all finite worlds',()=>{
  const random=rng(0xc9a731);let samples=0;
  for(const id of W.IDs)for(let i=0;i<5000;i++){
    const origin=[(random()-.5)*30,(random()-.1)*9,(random()-.1)*50];
    let ray=[random()-.5,random()-.5,random()-.5];ray=M.normalize(ray);
    if(i%37===0)ray[i%3]=0;if(i%71===0)ray[(i+1)%3]=1e-13;
    const state={sceneMirror:i%4===0,mirrorX:(random()-.5)*4,mirrorAngle:(random()-.5)*80,lightX:(random()-.5)*4,lightZ:(random()-.5)*4};
    const observer=i%2===0,limit=i%11===0?Infinity:random()*50,hit=W.traceWithFixture(origin,ray,id,observer,state);
    assert.equal(W.occluded(origin,ray,id,observer,state,limit),!!hit&&hit.distance<limit,`${id} ray ${i}`);samples++;
  }
  assert.equal(samples,25000);
});
