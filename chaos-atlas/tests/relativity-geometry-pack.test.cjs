'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../relativity-worlds.js'),M=require('../relativity-model.js'),G=require('../relativity-geometry-pack.js');
const {pixels,layout,usedPixels}=G.pack();
const word=(pixel,pair)=>pixels[pixel*4+pair*2]*256+pixels[pixel*4+pair*2+1];
const number=(pixel,pair)=>(word(pixel,pair)-G.BIAS)/G.SCALE;
function bounds(p){return {center:[number(p,0),number(p,1),number(p+1,0)],half:[number(p+1,1),number(p+2,0),number(p+2,1)]};}
function near(a,b,message){assert.ok(Math.abs(a-b)<=.5/G.SCALE+1e-9,`${message}: ${a} vs ${b}`);}

test('all shared geometry fits the sign atlas with stable scene layouts',()=>{
  assert.ok(usedPixels<=G.WIDTH*G.ROWS);assert.deepEqual(Object.keys(layout),W.IDs);
  let end=0;for(const id of W.IDs){const v=layout[id];assert.equal(v.nodeBase,end);assert.equal(v.primitiveBase,v.nodeBase+G.NODE_STRIDE*v.nodeCount);assert.ok(v.nodeCount<=128);assert.equal(v.partBase,v.primitiveBase+G.PRIMITIVE_STRIDE*v.primitiveCount);assert.equal(v.artifactBase,v.partBase+G.PART_STRIDE*v.partCount);end=v.artifactBase+G.PART_STRIDE*v.artifactCount;}
  assert.equal(end,usedPixels);assert.equal(G.pack(),G.pack());
});

test('stackless nodes preserve every leaf, primitive, escape pointer and conservative bounds',()=>{
  for(const id of W.IDs){
    const l=layout[id],nodes=[],items=[];
    function visit(node){const i=nodes.length;nodes.push(null);let start=0,count=0;
      if(node.boxes){start=items.length;count=node.boxes.length;items.push(...node.boxes);}
      else{visit(node.left);visit(node.right);}
      nodes[i]={node,escape:nodes.length,start,count};
    }visit(W.tree(id));assert.equal(nodes.length,l.nodeCount);assert.equal(items.length,l.primitiveCount);
    for(let i=0;i<nodes.length;i++){
      const {node,escape,start,count}=nodes[i],p=l.nodeBase+i*G.NODE_STRIDE,b=bounds(p),packed=word(p+3,1);
      assert.equal(word(p+3,0),escape,`${id} node ${i} escape`);
      assert.equal(packed,count?32768+(count-1)*8192+start:0,`${id} node ${i} leaf`);
      for(let k=0;k<3;k++){
        // Leave enough margin for both a quantized node and a quantized child.
        assert.ok(b.center[k]-b.half[k]<=node.center[k]-node.half[k]-.00249);
        assert.ok(b.center[k]+b.half[k]>=node.center[k]+node.half[k]+.00249);
      }
    }
    for(let i=0;i<items.length;i++){
      const item=items[i],p=l.primitiveBase+i*G.PRIMITIVE_STRIDE,b=bounds(p),m=p*4+12;
      for(let k=0;k<3;k++){near(b.center[k],item.center[k],`${id} primitive ${i} center`);near(b.half[k],item.half[k],`${id} primitive ${i} half`);}
      assert.equal(pixels[m],item.primitive==='triangle'?1:item.primitive==='cylinder'?2:item.primitive==='foliage'?3:0);
      assert.equal(pixels[m+1],item.material);assert.equal(pixels[m+2],item.axis||0);assert.equal(pixels[m+3],item.species||0);
      if(item.primitive==='triangle'){
        const actual=[number(p+4,0),number(p+4,1),number(p+5,0),number(p+5,1),number(p+6,0),number(p+6,1),number(p+7,0),number(p+7,1),number(p+8,0)];
        item.a.concat(item.b,item.c).forEach((v,k)=>near(actual[k],v,`${id} triangle ${i}/${k}`));
      }
    }
  }
});


test('scene object parts, including real cylinder wheels, are packed with primitive and material metadata',()=>{
  for(const id of W.IDs){
    const l=layout[id],parts=M.objectParts(id,'artifact');assert.equal(l.artifactCount,parts.length);assert.ok(parts.length<=12);
    for(let i=0;i<parts.length;i++){
      const part=parts[i],p=l.artifactBase+i*G.PART_STRIDE,b=bounds(p),m=(p+3)*4;
      for(let k=0;k<3;k++){near(b.center[k],part.center[k],id+' artifact center');near(b.half[k],part.half[k],id+' artifact half');}
      assert.equal(pixels[m],part.primitive==='cylinder'?2:0);assert.equal(pixels[m+1],W.material[part.kind]);assert.equal(pixels[m+2],part.axis||0);
    }
  }
  assert.equal(M.objectParts('station','artifact').filter(p=>p.primitive==='cylinder').length,2);
});

test('moving detail boxes and their different materials are packed in the shared atlas',()=>{
  for(const id of W.IDs){
    const l=layout[id],parts=M.objectParts(id);assert.equal(l.partCount,parts.length);
    for(let i=0;i<parts.length;i++){
      const part=parts[i],p=l.partBase+i*G.PART_STRIDE,b=bounds(p);
      for(let k=0;k<3;k++){near(b.center[k],part.center[k],id+' part center');near(b.half[k],part.half[k],id+' part half');}
      assert.equal(pixels[(p+3)*4+1],W.material[part.kind]);
    }
  }
});
