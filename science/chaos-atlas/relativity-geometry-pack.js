/* Pack the shared world BVHs into the unused bottom rows of the sign atlas.
 * Coordinates use signed 16-bit fixed point (1/400 scene unit). Each node
 * stores a skip pointer, allowing stackless traversal in one compact shader. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-worlds.js'),require('./relativity-model.js'));
  else root.RelativityGeometryPack=factory(root.RelativityWorlds,root.RelativityModel);
})(typeof globalThis==='object'?globalThis:this,function(W,M){
  'use strict';
  const WIDTH=1024,ROWS=24,SCALE=400,BIAS=32768,NODE_STRIDE=4,PRIMITIVE_STRIDE=9,PART_STRIDE=4;
  let cached;
  function pack(){
    if(cached)return cached;
    const pixels=new Uint8Array(WIDTH*ROWS*4),layout={};let cursor=0;
    const encode=value=>{
      const result=Math.round(value*SCALE)+BIAS;
      if(result<0||result>65535)throw new RangeError('World coordinate exceeds fixed-point atlas range');
      return result;
    };
    function words(pixel,a,b){
      if(pixel>=WIDTH*ROWS)throw new RangeError('World geometry atlas is full');
      const i=pixel*4;pixels[i]=a>>8;pixels[i+1]=a&255;pixels[i+2]=b>>8;pixels[i+3]=b&255;
    }
    const pair=(pixel,a,b)=>words(pixel,encode(a),encode(b));
    function vectors(pixel,center,half){pair(pixel,center[0],center[1]);pair(pixel+1,center[2],half[0]);pair(pixel+2,half[1],half[2]);}
    for(const id of W.IDs){
      const nodes=[],primitives=[];
      function visit(node){
        const i=nodes.length;nodes.push(null);let packed=0;
        if(node.boxes){const start=primitives.length,count=node.boxes.length;
          if(count<1||count>3||start>=8192)throw new RangeError('Invalid BVH leaf');
          packed=32768+(count-1)*8192+start;primitives.push(...node.boxes);
        }else{visit(node.left);visit(node.right);}
        nodes[i]={node,escape:nodes.length,packed};
      }
      visit(W.tree(id));if(nodes.length>128)throw new RangeError('BVH exceeds shader traversal limit');
      const nodeBase=cursor,primitiveBase=nodeBase+nodes.length*NODE_STRIDE,parts=M.objectParts(id),partBase=primitiveBase+primitives.length*PRIMITIVE_STRIDE;
      const artifactParts=M.objectParts(id,'artifact'),artifactBase=partBase+parts.length*PART_STRIDE;
      cursor=artifactBase+artifactParts.length*PART_STRIDE;
      if(cursor>WIDTH*ROWS)throw new RangeError('World geometry atlas is full');
      for(let i=0;i<nodes.length;i++){
        const {node,escape,packed}=nodes[i],offset=nodeBase+i*NODE_STRIDE;
        // Quantized child bounds can expand slightly while a node can shrink.
        // Conservatively pad nodes so rounding never clips an enclosed hit.
        vectors(offset,node.center,node.half.map(v=>v+2/SCALE));words(offset+3,escape,packed);
      }
      for(let i=0;i<primitives.length;i++){
        const b=primitives[i],offset=primitiveBase+i*PRIMITIVE_STRIDE;
        vectors(offset,b.center,b.half);
        const j=(offset+3)*4;pixels[j]=b.primitive==='triangle'?1:b.primitive==='cylinder'?2:b.primitive==='foliage'?3:0;
        pixels[j+1]=b.material;pixels[j+2]=b.axis||0;pixels[j+3]=b.species||0;
        if(b.primitive==='triangle'){
          pair(offset+4,b.a[0],b.a[1]);pair(offset+5,b.a[2],b.b[0]);pair(offset+6,b.b[1],b.b[2]);
          pair(offset+7,b.c[0],b.c[1]);pair(offset+8,b.c[2],0);
        }
      }
      function writeParts(list,base){
        for(let i=0;i<list.length;i++){
          const part=list[i],offset=base+i*PART_STRIDE;vectors(offset,part.center,part.half);
          const j=(offset+3)*4;pixels[j]=part.primitive==='cylinder'?2:0;pixels[j+1]=W.material[part.kind];pixels[j+2]=part.axis||0;
        }
      }
      writeParts(parts,partBase);writeParts(artifactParts,artifactBase);
      layout[id]=Object.freeze({nodeBase,primitiveBase,partBase,partCount:parts.length,artifactBase,artifactCount:artifactParts.length,nodeCount:nodes.length,primitiveCount:primitives.length});
    }
    cached=Object.freeze({pixels,layout:Object.freeze(layout),usedPixels:cursor});return cached;
  }
  return Object.freeze({pack,WIDTH,ROWS,SCALE,BIAS,NODE_STRIDE,PRIMITIVE_STRIDE,PART_STRIDE});
});
