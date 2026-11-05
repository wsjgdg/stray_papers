/* Finite, stationary world geometry shared by the CPU probe and GPU renderer. */
(function (root, factory) {
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-model.js'),require('./relativity-foliage-mask.js'));
  else root.RelativityWorlds=factory(root.RelativityModel,root.RelativityFoliage);
})(typeof globalThis==='object'?globalThis:this,function(M,F){
  'use strict';
  const material=Object.freeze({floor:1,frame:2,'train-roof':2,'train-trim':2,pedestal:3,'bench-leg':3,cube:4,sphere:4,wall:5,bench:6,sign:7,building:8,sidewalk:9,pole:10,door:11,'train-door':46,ceiling:12,light:13,parapet:14,marker:15,terrain:16,'building-brick':17,'building-glass':18,train:19,rail:20,'tree-conifer':21,'tree-deciduous':22,pipe:23,cabinet:24,'car-body':25,'car-window':26,'train-window':47,tire:27,bin:28,'platform-panel':29,trunk:30,'luggage-handle':31,'parcel-tape':32,'equipment-vent':33,'crate-frame':34,'luggage-wheel':35,'luggage-rail':36,'equipment-switch':37,'equipment-foot':38,'key-light':39,'cargo-container':40,'gantry':41,'cargo-rail':42,'forklift':43,'drum':44,'cargo-moving-rail':45,'mirror-panel':48,'mirror-frame':49});
  const IDs=Object.freeze(['station','street','corridor','mountain','harbor']);
  const labels=Object.freeze({station:'车站站台',street:'城市街道',corridor:'工业长廊',mountain:'山间公路',harbor:'港口货场'});
  function box(kind,center,half){
    if(!material[kind]||center.length!==3||half.length!==3||center.some(v=>!Number.isFinite(v))||half.some(v=>!Number.isFinite(v)||v<=0))throw new Error('Invalid world box');
    return Object.freeze({kind,material:material[kind],center:Object.freeze(center),half:Object.freeze(half)});
  }
  function triangle(kind,a,b,c){
    if(!material[kind]||[a,b,c].some(v=>v.length!==3||v.some(x=>!Number.isFinite(x))))throw new Error('Invalid world triangle');
    const normal=M.cross(M.sub(b,a),M.sub(c,a));if(M.length(normal)<1e-10)throw new Error('Degenerate world triangle');
    // Terrain has an upward-facing normal, independently of left/right winding;
    // other triangles retain their supplied surface orientation.
    if(kind==='terrain'&&normal[1]<0)[b,c]=[c,b];
    const lo=[0,1,2].map(k=>Math.min(a[k],b[k],c[k])),hi=[0,1,2].map(k=>Math.max(a[k],b[k],c[k]));
    const center=lo.map((v,k)=>(v+hi[k])/2),half=lo.map((v,k)=>(hi[k]-v)/2+.00001);
    return Object.freeze({kind,material:material[kind],primitive:'triangle',a:Object.freeze(a),b:Object.freeze(b),c:Object.freeze(c),center:Object.freeze(center),half:Object.freeze(half)});
  }
  function cylinder(kind,center,radius,halfLength,axis){
    if(!material[kind]||!Number.isInteger(axis)||axis<0||axis>2||!(radius>0&&halfLength>0)||center.some(v=>!Number.isFinite(v)))throw new Error('Invalid world cylinder');
    const half=[radius,radius,radius];half[axis]=halfLength;
    return Object.freeze({kind,material:material[kind],primitive:'cylinder',center:Object.freeze(center),half:Object.freeze(half),radius,axis});
  }
  // Two intersecting cutout planes are a deliberately lightweight visual and
  // ray-intersection proxy for a tree, rather than a claimed volumetric canopy.
  function leafCard(kind,center,width,height,axis,species){
    if(!material[kind]||!(width>0&&height>0)||![0,2].includes(axis)||![0,1].includes(species))throw new Error('Invalid foliage card');
    const half=[width/2,height/2,width/2];half[axis]=.00002;
    return Object.freeze({kind,material:material[kind],primitive:'foliage',center:Object.freeze(center),half:Object.freeze(half),axis,species});
  }
  function foliageIntersection(origin,ray,b){
    if(Math.abs(ray[b.axis])<1e-8)return null;
    const distance=(b.center[b.axis]-origin[b.axis])/ray[b.axis];if(!(distance>1e-6))return null;
    const across=b.axis===2?0:2;
    const u=(origin[across]+distance*ray[across]-b.center[across])/(2*b.half[across])+.5;
    const v=(origin[1]+distance*ray[1]-b.center[1])/(2*b.half[1])+.5;
    if(!F.solid(b.species,u,v))return null;
    const normal=[0,0,0];normal[b.axis]=ray[b.axis]>0?-1:1;
    return {distance,normal};
  }
  // Same slab arithmetic as M.boxIntersection, but subtract the world-space
  // centre lazily rather than allocating an origin vector for every candidate.
  function worldBoxIntersection(origin,ray,center,half){
    let near=-Infinity,far=Infinity,nearAxis=-1,farAxis=-1,nearSign=0,farSign=0;
    for(let i=0;i<3;i++){
      const o=origin[i]-center[i],d=ray[i],h=half[i];
      if(Math.abs(d)<M.EPS){if(o<-h||o>h)return null;continue;}
      let a=(-h-o)/d,b=(h-o)/d,sa=-1,sb=1;
      if(a>b){const t=a;a=b;b=t;const u=sa;sa=sb;sb=u;}
      if(a>near){near=a;nearAxis=i;nearSign=sa;}if(b<far){far=b;farAxis=i;farSign=sb;}if(near>far)return null;
    }
    if(!(far>M.EPS))return null;
    const front=near>M.EPS,distance=front?near:far,axis=front?nearAxis:farAxis,sign=front?nearSign:farSign;if(axis<0)return null;
    const normal=[0,0,0];normal[axis]=sign;return {distance,normal};
  }
  function intersection(origin,ray,b){
    if(b.primitive==='foliage')return foliageIntersection(origin,ray,b);
    if(b.primitive==='cylinder')return M.cylinderIntersection(M.sub(origin,b.center),ray,b.radius,b.half[b.axis],b.axis);
    return b.primitive==='triangle'?M.triangleIntersection(origin,ray,b.a,b.b,b.c):worldBoxIntersection(origin,ray,b.center,b.half);
  }
  function makeTree(kind,x,y,z,height,width){
    const species=kind==='tree-conifer'?0:1,center=[x,y+height/2,z];
    return group(leafCard(kind,center.slice(),width,height,0,species),leafCard(kind,center.slice(),width,height,2,species),
      cylinder('trunk',[x,y+height*.12,z],Math.max(.09,width*.035),height*.12,1));
  }
  function group(...items){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const item of items)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],item.center[k]-item.half[k]);hi[k]=Math.max(hi[k],item.center[k]+item.half[k]);}
    const center=lo.map((v,k)=>(v+hi[k])/2),half=lo.map((v,k)=>(hi[k]-v)/2+.00001);
    return Object.freeze({center:Object.freeze(center),half:Object.freeze(half),boxes:Object.freeze(items)});
  }
  function station(){
    const g=[];
    for(let i=0;i<10;i++){
      const z=4.5+i*5.5;
      g.push(group(cylinder('frame',[-4.95,2.55,z],.26,2.55,1),cylinder('frame',[4.95,2.55,z],.26,2.55,1),box('frame',[0,5.1,z],[5.21,.16,.27])));
    }
    for(const side of [-1,1]){
      const lowWall=side<0;
      g.push(group(box('wall',[side*6.3,lowWall?.42:1.05,26],[.22,lowWall?.42:1.05,31])));
      g.push(group(box('rail',[side*6.3,lowWall?.88:2.12,26],[.12,.055,31])));
      g.push(group(box('frame',[side*4.95,5.1,26],[.17,.13,31])));
      if(lowWall)for(let i=0;i<4;i++){
        const z=6+i*11;g.push(group(box('train',[-7.28,1.66,z], [1.0,1.56,5.35])));
        // Shallow pitched roofs and end caps are genuine triangles; they
        // meet the carriage shells and remain visible from oblique viewpoints.
        const l0=[-8.28,3.22,z-5.35],m0=[-7.28,3.46,z-5.35],r0=[-6.28,3.22,z-5.35];
        const l1=[-8.28,3.22,z+5.35],m1=[-7.28,3.46,z+5.35],r1=[-6.28,3.22,z+5.35];
        g.push(group(triangle('train-roof',l0,m1,m0),triangle('train-roof',l0,l1,m1),
          triangle('train-roof',m0,r1,r0),triangle('train-roof',m0,m1,r1),
          triangle('train-roof',l0,m0,r0),triangle('train-roof',l1,r1,m1)));
        // Raised door and window mullions have actual thickness and occlude rays.
        for(const dz of [-2.4,2.4])g.push(group(box('frame',[-6.245,1.60,z+dz],[.035,1.12,.055])));
        if(i<2){
          // The two nearest carriages have protruding, closed door leaves and
          // individually intersectable opaque window surfaces. These sit in
          // front of the coarse carriage shell; glass is an illustrative
          // reflective surface, not simulated transmission or an interior.
          const details=[];
          // Positions match the carriage's shared facade atlas so the
          // photographic finish remains registered to the raised geometry.
          for(const dz of [-3.55,-1.23,-.40,.42,1.24,3.59])details.push(box('train-window',[-6.245,2.13,z+dz],[.035,.30,.32]));
          for(const dz of [-2.4,2.4]){
            details.push(box('train-door',[-6.235,1.88,z+dz],[.065,.84,.42]));
            for(const edge of [-1,1])details.push(box('train-trim',[-6.15,1.88,z+dz+edge*.42],[.035,.86,.025]));
            details.push(box('train-trim',[-6.15,2.74,z+dz],[.035,.025,.44]));
          }
          g.push(group(...details));
        }
      }
      for(let i=0;i<3;i++){
        const z=8+i*11,x=side*3.75;
        g.push(group(box('bench',[x,.68,z],[.58,.09,1.05]),box('bench',[x+side*.48,1.10,z],[.07,.42,1.05]),
          box('bench-leg',[x-.38,.30,z-.74],[.06,.30,.07]),box('bench-leg',[x+.38,.30,z-.74],[.06,.30,.07]),
          box('bench-leg',[x-.38,.30,z+.74],[.06,.30,.07]),box('bench-leg',[x+.38,.30,z+.74],[.06,.30,.07])));
      }
    }
    g.push(group(box('ceiling',[0,5.38,26],[5.18,.11,31])));
    // The first panel is the movable key fixture below, not a duplicate
    // stationary lamp. Remaining panels are decorative scene geometry.
    for(let i=1;i<5;i++)g.push(group(box('light',[0,5.22,5.4+i*11],[.78,.035,.25])));
    for(let i=0;i<3;i++){
      const z=8.6+i*11;
      g.push(group(box('sign',[0,4.12,z],[1.27,.31,.08]),box('frame',[-.9,4.61,z],[.035,.18,.05]),box('frame',[.9,4.61,z],[.035,.18,.05])));
    }
    // Visible column footings, service bins and information boards add scale.
    for(const side of [-1,1]){
      for(let i=0;i<3;i++)g.push(group(box('frame',[side*4.95,.17,4.5+i*11],[.36,.17,.36])));
      g.push(group(cylinder('bin',[side*4.20,.53,6.4],.28,.53,1),cylinder('frame',[side*4.20,1.08,6.4],.30,.035,1)));
    }
    for(const z of [12.8,32])g.push(group(box('platform-panel',[6.02,2.05,z],[.05,.72,.90])));
    g.push(group(box('rail',[-2.8,5.19,26],[.06,.06,31]),box('rail',[2.8,5.19,26],[.06,.06,31])));
    return g;
  }
  function street(){
    const g=[];
    for(const side of [-1,1]){
      g.push(group(box('sidewalk',[side*5.75,.11,26],[.75,.11,31])));
      for(let i=0;i<4;i++){
        const z=7+i*14,height=(side<0?[8,11,9,10]:[11,9,8,12])[i],x=side*(8.0+((i%2)*.35));
        const kind=(side<0?['building-brick','building','building-glass','building']:['building-glass','building-brick','building','building-glass'])[i];
        g.push(group(box(kind,[x,height/2,z],[1.7,height/2,6.92])));
      }
      for(let i=0;i<5;i++){
        const z=6+i*11,x=side*5.5;
        g.push(group(box('pole',[x,2.65,z],[.065,2.65,.065]),box('pole',[x-side*.58,5.25,z],[.58,.055,.06]),box('light',[x-side*1.12,5.18,z],[.18,.05,.13])));
      }
    }
    // Parked vehicles are simplified finite geometry: bodies, glazed cabins,
    // four finite cylindrical tires, all ray-intersected.
    for(const [x,z] of [[4.05,15.4],[-4.05,27.2]]){
      const wheels=[];
      for(const sx of [-1,1])for(const sz of [-1,1])wheels.push(cylinder('tire',[x+sx*.73,.34,z+sz*1.16],.31,.11,0));
      const blb=[x-.69,.93,z-1.25],brb=[x+.69,.93,z-1.25],blf=[x-.69,.93,z+1.35],brf=[x+.69,.93,z+1.35];
      const tlb=[x-.59,1.35,z-.60],trb=[x+.59,1.35,z-.60],tlf=[x-.59,1.35,z+.60],trf=[x+.59,1.35,z+.60];
      const quad=(a,b,c,d)=>[triangle('car-window',a,b,c),triangle('car-window',a,c,d)];
      const glazing=[...quad(blb,tlb,trb,brb),...quad(brf,trf,tlf,blf),...quad(blf,tlf,tlb,blb),...quad(brb,trb,trf,brf)];
      const headlights=[-1,1].map(side=>box('light',[x+side*.52,.67,z-1.925],[.16,.085,.025]));
      g.push(group(box('car-body',[x,.61,z],[.77,.32,1.90]),box('car-body',[x,1.38,z],[.59,.035,.60]),...glazing,...wheels,...headlights));
    }
    for(const [x,z,h,w] of [[-5.55,13.8,5.6,4.5],[-5.55,35,5.2,4.2],[5.55,19.4,5.8,4.7],[5.55,42,5.3,4.4]])g.push(makeTree('tree-deciduous',x,.22,z,h,w));
    // Two solid crossing-signal assemblies and traffic bollards break up the
    // repeated facades. They participate in world intersections and shadows.
    for(const side of [-1,1]){
      const x=side*5.05,z=10.6;
      g.push(group(cylinder('pole',[x,1.65,z],.065,1.65,1),box('marker',[x,3.17,z],[.18,.30,.12]),box('light',[x,3.17,z-.13],[.10,.16,.015])));
      g.push(group(cylinder('pole',[side*4.85,.40,12.2],.09,.40,1),cylinder('marker',[side*4.85,.77,12.2],.095,.055,1)));
    }
    return g;
  }
  function corridor(){
    const g=[];
    for(const side of [-1,1]){
      g.push(group(box('wall',[side*4.75,2.25,25],[.16,2.25,30])));
      g.push(group(box('rail',[side*4.51,3.40,25],[.055,.055,30])));
      g.push(group(box('rail',[side*4.51,3.17,25],[.035,.035,30])));
      for(let i=0;i<5;i++){
        const z=8+i*10;
        g.push(group(box('door',[side*4.56,1.18,z],[.07,1.12,1.02])));
      }
    }
    g.push(group(box('ceiling',[0,4.55,25],[4.91,.14,30])));
    g.push(group(box('wall',[0,2.25,55],[4.75,2.25,.12])));
    for(let i=0;i<10;i++){
      const z=3+i*5.4;
      g.push(group(box('frame',[-4.53,2.24,z],[.09,2.24,.09]),box('frame',[4.53,2.24,z],[.09,2.24,.09]),box('frame',[0,4.39,z],[4.53,.08,.09])));
      if(i>0)g.push(group(box('light',[0,4.34,z+1.2],[.78,.035,.19]))); // i=0 is the movable key fixture
    }
    // Real cylindrical pipes, support conduits and wall-mounted service units.
    for(const side of [-1,1]){
      g.push(group(cylinder('pipe',[side*3.38,4.08,25],.13,30,2)));
      g.push(group(cylinder('pipe',[side*4.43,2.82,25],.055,30,2)));
      for(const z of [5.5,25.5,45.5]){
        g.push(group(box('cabinet',[side*4.43,1.45,z],[.10,.65,.65])));
        g.push(group(box('frame',[side*3.38,4.08,z],[.20,.20,.055])));
      }
    }
    // Wall-mounted junction boxes and short conduits are finite objects.
    for(const side of [-1,1])for(const z of [12,32]){
      g.push(group(box('cabinet',[side*4.38,2.32,z],[.14,.28,.22]),cylinder('pipe',[side*4.37,1.61,z],.045,.42,1)));
    }
    // Raised door handles and small cable supports are actual occluding metal,
    // rather than lines painted over a wall texture.
    for(const side of [-1,1])for(const z of [8,18,28]){
      g.push(group(box('rail',[side*4.44,1.05,z-.63],[.035,.21,.035]),box('frame',[side*4.45,2.08,z],[.04,.035,.85])));
    }
    return g;
  }
  function mountain(){
    const g=[];
    for(const side of [-1,1]){
      g.push(group(box('parapet',[side*5.05,.28,26],[.30,.28,31])));
      g.push(group(box('rail',[side*4.77,.84,26],[.075,.07,31])));
      g.push(group(box('rail',[side*4.77,1.18,26],[.075,.07,31])));
      for(let i=0;i<14;i++){
        const z=1.5+i*4.2;
        g.push(group(box('pole',[side*4.77,.62,z],[.07,.62,.07])));
      }
      for(let i=0;i<3;i++){
        const z=14+i*18;
        g.push(group(box('pole',[side*5.25,1.05,z],[.055,1.05,.055]),box('marker',[side*5.25,1.82,z],[.42,.25,.055])));
      }
      for(const z of [5.7,18.3,30.9])g.push(group(box('marker',[side*4.70,1.03,z],[.025,.07,.10])));
    }
    // A triangulated, piecewise-planar hillside is actual finite world geometry,
    // not a warped photograph; the panorama still represents distant mountains.
    const x=[5.35,13,32],z=[-5,8,25,45,65];
    for(const side of [-1,1]){
      const heights=side<0?[[0,0,0,0,0],[.45,.8,1.35,1.2,.8],[3.0,4.2,6.0,5.0,3.5]]:[[0,0,0,0,0],[.35,1.2,.65,1.8,1.4],[3.5,5.2,4.1,6.2,4.5]];
      for(let i=0;i<x.length-1;i++)for(let j=0;j<z.length-1;j++){
        const a=[side*x[i],heights[i][j],z[j]],b=[side*x[i+1],heights[i+1][j],z[j]],c=[side*x[i+1],heights[i+1][j+1],z[j+1]],d=[side*x[i],heights[i][j+1],z[j+1]];
        g.push(group(triangle('terrain',a,b,c),triangle('terrain',a,c,d)));
      }
      // Place trunks on the same triangles that are used for ray tracing.
      function ground(ax,zz){
        const i=ax<x[1]?0:1,j=zz<z[1]?0:zz<z[2]?1:zz<z[3]?2:3;
        const fx=(ax-x[i])/(x[i+1]-x[i]),fz=(zz-z[j])/(z[j+1]-z[j]);
        const a=heights[i][j],b=heights[i+1][j],c=heights[i+1][j+1],d=heights[i][j+1];
        return fz<=fx?a+fx*(b-a)+fz*(c-b):a+fx*(c-d)+fz*(d-a);
      }
      const trees=side<0?[[8.4,9.5,6.8,3.5],[12.0,17,8.1,4.0],[8.1,24,5.6,3.0],[19,29,10.0,4.7],[10.2,37,6.7,3.5],[16.5,49,8.5,4.3]]:
        [[8.8,8.5,6.0,3.2],[12,15.5,8.0,4.0],[8.4,25,6.3,3.3],[18,28,9.5,4.6],[11,39,7.3,3.6],[17,51,9.2,4.3]];
      for(const [ax,zz,h,w] of trees)g.push(makeTree('tree-conifer',side*ax,ground(ax,zz),zz,h,w));
    }
    return g;
  }
  // A finite port yard, not a panorama substitute. Containers, door bars,
  // crane legs/beam, forklift parts, pallets and drums all enter the BVH and
  // therefore participate in primary rays and retarded shadow tests.
  function harbor(){
    const g=[];
    for(const side of [-1,1])for(const [i,z] of [8,16.5,25,33.5].entries()){
      const x=side*6.5;g.push(group(box('cargo-container',[x,1.31,z],[2.18,1.30,3.85])));
      if(i===1||i===2)g.push(group(box('cargo-container',[x,3.93,z],[2.18,1.30,3.85])));
      // Lock rods are small true boxes on the nearer end of each container.
      const near=z-3.88;
      for(const offset of [-.74,.74])g.push(group(box('cargo-rail',[x+offset,1.30,near],[.035,1.14,.035])));
    }
    for(const z of [18,36]){
      for(const side of [-1,1])g.push(group(box('gantry',[side*9,4.35,z],[.28,4.35,.38]),box('gantry',[side*9.0,.22,z],[.73,.22,.68])));
      g.push(group(box('gantry',[0,8.50,z],[9.3,.28,.45]),box('gantry',[0,8.01,z],[1.0,.25,.48])));
      g.push(group(cylinder('cargo-rail',[0,6.5,z],.055,1.25,1),box('gantry',[0,5.20,z],[.32,.12,.25])));
    }
    // Forklift: chassis, cab posts, raised mast and four cylindrical tyres.
    const x=4.35,z=6.2;g.push(group(box('forklift',[x,.66,z],[.78,.32,1.25]),box('forklift',[x,1.23,z+.35],[.68,.30,.58])));
    for(const dx of [-.62,.62]){
      g.push(group(box('gantry',[x+dx,1.73,z+.55],[.055,.65,.055]),box('gantry',[x+dx,1.73,z-.45],[.055,.65,.055])));
      for(const dz of [-.85,.85])g.push(group(cylinder('tire',[x+dx,.31,z+dz],.30,.12,0)));
    }
    g.push(group(box('gantry',[x,2.41,z+.05],[.70,.06,.60]),box('gantry',[x-.57,1.4,z-1.31],[.06,1.15,.06]),box('gantry',[x+.57,1.4,z-1.31],[.06,1.15,.06])));
    for(const dx of [-.46,.46])g.push(group(box('cargo-rail',[x+dx,.15,z-1.88],[.06,.06,.58])));
    // Exposed cab seat, steering column, engine grille and axle hubs remain
    // separate, finite shapes rather than painting a forklift silhouette.
    g.push(group(box('tire',[x,1.35,z+.28],[.43,.07,.40]),box('tire',[x,1.68,z+.58],[.43,.35,.055])));
    g.push(group(cylinder('cargo-rail',[x,1.42,z-.40],.05,.32,1),box('cargo-rail',[x,1.73,z-.40],[.25,.035,.08])));
    for(const dx of [-.46,-.23,0,.23,.46])g.push(group(box('cargo-rail',[x+dx,.83,z+1.26],[.035,.18,.018])));
    for(const sx of [-1,1])for(const dz of [-.85,.85])g.push(group(cylinder('cargo-rail',[x+sx*.76,.31,z+dz],.11,.025,0)));
    // Mast cross-members and a roof safety bar give the nearby forklift real
    // depth and can occlude both primary rays and the movable key light.
    for(const h of [.85,1.65,2.25])g.push(group(box('cargo-rail',[x,h,z-1.31],[.60,.045,.045])));
    g.push(group(box('gantry',[x,2.50,z+.05],[.65,.045,.06])));

    // Low pallet stacks, barrels and separate decorative floodlights.
    for(const [px,pz] of [[-3.8,5.0],[-3.9,12.8],[3.85,24.0]]){
      g.push(group(box('bench',[px,.15,pz],[.70,.15,.60]),box('cargo-rail',[px,.42,pz],[.64,.12,.54])));
    }
    for(const [dx,dz] of [[-3.8,5.0],[-3.2,5.0],[3.9,23.6],[4.5,23.6]])g.push(group(cylinder('drum',[dx,.84,dz],.26,.44,1)));
    for(const z0 of [27,39])g.push(group(box('light',[0,8.15,z0],[.65,.04,.22]),box('gantry',[0,8.38,z0],[.12,.18,.13])));
    return g;
  }
  const data=Object.freeze({station:Object.freeze(station()),street:Object.freeze(street()),corridor:Object.freeze(corridor()),mountain:Object.freeze(mountain()),harbor:Object.freeze(harbor())});
  const pedestal=group(box('pedestal',[2.35,.24,8.8],[1.35,.24,1.35]));
  function get(id){return data[Object.prototype.hasOwnProperty.call(data,id)?id:'station'];}
  // Median-split bounding-volume hierarchy; boxes remain the exact source of
  // truth. Splitting on centroid spread groups nearby props rather than the
  // very long rails or roof panels which span many repeated bays.
  function buildTree(items,depth=0,forcePairs=false){
    const bounds=group(...items);
    // The packed WebGL tree allows three primitives at depth six to fit the
    // 127-node shader budget. The CPU can use a deeper, tighter tree instead.
    if(items.length<=2||(!forcePairs&&depth>=6&&items.length<=3))return bounds;
    const spread=[0,1,2].map(k=>Math.max(...items.map(b=>b.center[k]))-Math.min(...items.map(b=>b.center[k])));
    let axis=0;if(spread[1]>spread[axis])axis=1;if(spread[2]>spread[axis])axis=2;
    const sorted=items.slice().sort((a,b)=>a.center[axis]-b.center[axis]),mid=Math.floor(sorted.length/2);
    return Object.freeze({center:bounds.center,half:bounds.half,left:buildTree(sorted.slice(0,mid),depth+1,forcePairs),right:buildTree(sorted.slice(mid),depth+1,forcePairs)});
  }
  const trees=Object.freeze(Object.fromEntries(IDs.map(id=>[id,buildTree(data[id].flatMap(g=>g.boxes))])));
  function tree(id){return trees[Object.prototype.hasOwnProperty.call(trees,id)?id:'station'];}
  // Flatten once in the original left-before-right order. This removes a
  // per-ray recursive closure and keeps boxes/split escape links in contiguous
  // scalar arrays; the actual primitive intersections remain unchanged.
  function flatten(root){
    const nodes=[],skip=[],leaves=[];
    function visit(node){
      const i=nodes.length;nodes.push(node);skip.push(0);leaves.push(node.boxes||null);
      if(!node.boxes){visit(node.left);visit(node.right);}skip[i]=nodes.length;
    }
    visit(root);const n=nodes.length,loX=new Float64Array(n),loY=new Float64Array(n),loZ=new Float64Array(n),hx=new Float64Array(n),hy=new Float64Array(n),hz=new Float64Array(n);
    for(let i=0;i<n;i++){const b=nodes[i];loX[i]=b.center[0];loY[i]=b.center[1];loZ[i]=b.center[2];hx[i]=b.half[0];hy[i]=b.half[1];hz[i]=b.half[2];}
    return {cx:loX,cy:loY,cz:loZ,hx,hy,hz,skip,leaves,count:n};
  }
  // Build a CPU-only hierarchy by the surface-area heuristic. The exact same
  // finite primitives are intersected; WebGL keeps its compact fixed tree.
  function buildCpuTree(items,depth=0){
    const bounds=group(...items);if(items.length<=2)return bounds;
    let choice=null,best=Infinity;
    const area=(lo,hi)=>{const x=hi[0]-lo[0],y=hi[1]-lo[1],z=hi[2]-lo[2];return x*y+y*z+z*x;};
    for(let axis=0;axis<3;axis++){
      const sorted=items.slice().sort((a,b)=>a.center[axis]-b.center[axis]),n=sorted.length,left=new Float64Array(n),right=new Float64Array(n);
      let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<n;i++){const b=sorted[i];for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.center[k]-b.half[k]);hi[k]=Math.max(hi[k],b.center[k]+b.half[k]);}left[i]=area(lo,hi);}
      lo=[Infinity,Infinity,Infinity];hi=[-Infinity,-Infinity,-Infinity];
      for(let i=n-1;i>=0;i--){const b=sorted[i];for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.center[k]-b.half[k]);hi[k]=Math.max(hi[k],b.center[k]+b.half[k]);}right[i]=area(lo,hi);}
      for(let mid=1;mid<n;mid++){const cost=left[mid-1]*mid+right[mid]*(n-mid);if(cost<best){best=cost;choice={sorted,mid};}}
    }
    // Keep worst-case construction depth bounded even for coincident centres.
    if(depth>=24){choice.sorted=items;choice.mid=Math.floor(items.length/2);}
    return Object.freeze({center:bounds.center,half:bounds.half,left:buildCpuTree(choice.sorted.slice(0,choice.mid),depth+1),right:buildCpuTree(choice.sorted.slice(choice.mid),depth+1)});
  }
  const flatTrees=Object.freeze(Object.fromEntries(IDs.map(id=>{
    const items=data[id].flatMap(g=>g.boxes),old=flatten(id==='station'?buildTree(items,0,true):trees[id]);
    // Preserve the previous hierarchy's first-hit choice for coincident faces.
    const priority=new Map();for(const leaf of old.leaves)if(leaf)for(const item of leaf)priority.set(item,priority.size);
    const result=flatten(buildCpuTree(items));result.priority=priority;return [id,result];
  })));
  function trace(origin,ray,id,observer=false){
    const tree=flatTrees[Object.prototype.hasOwnProperty.call(flatTrees,id)?id:'station'];
    const ox=origin[0],oy=origin[1],oz=origin[2],dx=ray[0],dy=ray[1],dz=ray[2],px=Math.abs(dx)<M.EPS,py=Math.abs(dy)<M.EPS,pz=Math.abs(dz)<M.EPS;
    let best=null,bestBox=null,bestDistance=Infinity;
    if(dy<-1e-10){const d=-oy/dy;if(d>1e-6){bestDistance=d;best={distance:d,normal:[0,1,0],kind:'floor',material:material.floor};}}
    for(let i=0;i<tree.count;){
      const x=ox-tree.cx[i],y=oy-tree.cy[i],z=oz-tree.cz[i],hx=tree.hx[i],hy=tree.hy[i],hz=tree.hz[i];
      const inside=Math.abs(x)<=hx&&Math.abs(y)<=hy&&Math.abs(z)<=hz;
      let near=-Infinity,far=Infinity,a,b;
      if(px){if(x<-hx||x>hx){i=tree.skip[i];continue;}}
      else{a=(-hx-x)/dx;b=(hx-x)/dx;if(a>b){const t=a;a=b;b=t;}near=a;far=b;}
      if(py){if(y<-hy||y>hy){i=tree.skip[i];continue;}}
      else{a=(-hy-y)/dy;b=(hy-y)/dy;if(a>b){const t=a;a=b;b=t;}if(a>near)near=a;if(b<far)far=b;}
      if(near>far+1e-9){i=tree.skip[i];continue;}
      if(pz){if(z<-hz||z>hz){i=tree.skip[i];continue;}}
      else{a=(-hz-z)/dz;b=(hz-z)/dz;if(a>b){const t=a;a=b;b=t;}if(a>near)near=a;if(b<far)far=b;}
      if((px&&py&&pz)||near>far+1e-9||!(far>M.EPS-1e-9)||(!inside&&near>M.EPS+1e-9&&near>bestDistance+1e-9)){i=tree.skip[i];continue;}
      const items=tree.leaves[i];
      if(items)for(let j=0;j<items.length;j++){
        const box=items[j],hit=intersection(origin,ray,box);
        if(hit&&(hit.distance<bestDistance||(hit.distance===bestDistance&&bestBox&&tree.priority.get(box)<tree.priority.get(bestBox)))){best=hit;bestBox=box;bestDistance=hit.distance;}
      }
      i++;
    }
    if(observer){const box=pedestal.boxes[0],hit=intersection(origin,ray,box);if(hit&&hit.distance<bestDistance){best=hit;bestBox=box;}}
    if(!best)return null;
    const point=M.add(origin,M.scale(ray,best.distance));
    return bestBox?{...best,point,kind:bestBox.kind,material:bestBox.material,center:bestBox.center,half:bestBox.half}:{...best,point};
  }
  // The fixture is immutable and a frame casts many rays with identical
  // source coordinates. Reuse it instead of validating/freezing a fresh box
  // for every primary and shadow ray. The cache is bounded to one per world.
  const fixtureCache=Object.create(null);
  function lightHalf(id,state={}){
    const width=state.lightWidthScale??1,depth=state.lightDepthScale??1;
    return [.78*width,(id==='station'?.25:.19)*depth];
  }
  function lightFixture(id,state={}){
    if(id!=='station'&&id!=='corridor'&&id!=='harbor')return null;
    const x=state.lightX||0,z=state.lightZ||0,width=state.lightWidthScale??1,depth=state.lightDepthScale??1,cached=fixtureCache[id];
    if(cached&&cached.x===x&&cached.z===z&&cached.width===width&&cached.depth===depth)return cached.fixture;
    const base=id==='station'?[0,5.17,5.4]:id==='harbor'?[0,7.38,10.8]:[0,4.28,4.2],dy=id==='station'?.05:.06,half=lightHalf(id,state);
    const fixture=box('key-light',[base[0]+x,base[1]+dy,base[2]+z],[half[0],.035,half[1]]);
    fixtureCache[id]={x,z,width,depth,fixture};return fixture;
  }
  // A stationary, finite teaching mirror and its real frame/stand. Geometry is
  // transformed into the mirror's local axes, so the same boxes cast shadows,
  // occlude primary rays and serve the CPU/GPU reflected-light path. This
  // instrument is present only when explicitly enabled; existing world BVHs
  // and the low-cost default path are unchanged.
  const mirrorParts=Object.freeze([
    Object.freeze({kind:'mirror-panel',material:48,center:[0,0,0],half:[1.05,1.25,.025]}),
    Object.freeze({kind:'mirror-frame',material:49,center:[-1.125,0,0],half:[.075,1.40,.06]}),
    Object.freeze({kind:'mirror-frame',material:49,center:[1.125,0,0],half:[.075,1.40,.06]}),
    Object.freeze({kind:'mirror-frame',material:49,center:[0,-1.325,0],half:[1.05,.075,.06]}),
    Object.freeze({kind:'mirror-frame',material:49,center:[0,1.325,0],half:[1.05,.075,.06]}),
    Object.freeze({kind:'mirror-frame',material:49,center:[0,-1.70,0],half:[.08,.41,.08]})
  ]);
  for(const part of mirrorParts){Object.freeze(part.center);Object.freeze(part.half);}
  function mirrorIntersection(origin,ray,state={},limit=Infinity){
    if(state.sceneMirror!==true)return null;
    const theta=(state.mirrorAngle||0)*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
    const center=[state.mirrorX??-2.25,2.10,9.5],p=M.sub(origin,center);
    const o=[c*p[0]-s*p[2],p[1],s*p[0]+c*p[2]],d=[c*ray[0]-s*ray[2],ray[1],s*ray[0]+c*ray[2]];
    let best=null;
    for(const part of mirrorParts){
      const hit=worldBoxIntersection(o,d,part.center,part.half);
      if(hit&&hit.distance<limit){
        limit=hit.distance;const n=hit.normal,normal=[c*n[0]+s*n[2],n[1],-s*n[0]+c*n[2]];
        best={distance:hit.distance,normal,point:M.add(origin,M.scale(ray,hit.distance)),kind:part.kind,material:part.material,
          center,half:part.half,mirrorLocal:M.add(o,M.scale(d,hit.distance)),movableFixture:true};
      }
    }
    return best;
  }
  // The selected panel follows the adjustable source; other fixtures are
  // decorative, not separately simulated sources. Use the same exact box for
  // camera hits, shadows and visibility without rebuilding the packed BVH.
  function traceWithFixture(origin,ray,id,observer=false,state={}){
    let best=trace(origin,ray,id,observer),fixture=lightFixture(id,state);
    if(fixture){const hit=intersection(origin,ray,fixture);if(hit&&(!best||hit.distance<=best.distance+1e-8))best={...hit,point:M.add(origin,M.scale(ray,hit.distance)),kind:fixture.kind,material:fixture.material,center:fixture.center,half:fixture.half,movableFixture:true};}
    const mirror=mirrorIntersection(origin,ray,state,best?best.distance:Infinity);if(mirror)best=mirror;
    return best;
  }
  // Shadow shading only needs visibility, not the nearest blocker's normal.
  // Stop at the first actual intersection before the finite light, while
  // retaining the same conservative BVH bounds and primitive tests as trace.
  function occluded(origin,ray,id,observer=false,state={},limit=Infinity){
    const ox=origin[0],oy=origin[1],oz=origin[2],dx=ray[0],dy=ray[1],dz=ray[2];
    if(dy<-1e-10){const d=-oy/dy;if(d>1e-6&&d<limit)return true;}
    if(state.sceneMirror===true&&mirrorIntersection(origin,ray,state,limit))return true;
    const fixture=lightFixture(id,state);if(fixture){const hit=intersection(origin,ray,fixture);if(hit&&hit.distance<limit)return true;}
    if(observer){const hit=intersection(origin,ray,pedestal.boxes[0]);if(hit&&hit.distance<limit)return true;}
    const tree=flatTrees[Object.prototype.hasOwnProperty.call(flatTrees,id)?id:'station'],px=Math.abs(dx)<M.EPS,py=Math.abs(dy)<M.EPS,pz=Math.abs(dz)<M.EPS;
    for(let i=0;i<tree.count;){
      const x=ox-tree.cx[i],y=oy-tree.cy[i],z=oz-tree.cz[i],hx=tree.hx[i],hy=tree.hy[i],hz=tree.hz[i];
      let near=-Infinity,far=Infinity,a,b;
      if(px){if(x<-hx||x>hx){i=tree.skip[i];continue;}}
      else{a=(-hx-x)/dx;b=(hx-x)/dx;if(a>b){const t=a;a=b;b=t;}near=a;far=b;}
      if(py){if(y<-hy||y>hy){i=tree.skip[i];continue;}}
      else{a=(-hy-y)/dy;b=(hy-y)/dy;if(a>b){const t=a;a=b;b=t;}if(a>near)near=a;if(b<far)far=b;}
      if(near>far+1e-9){i=tree.skip[i];continue;}
      if(pz){if(z<-hz||z>hz){i=tree.skip[i];continue;}}
      else{a=(-hz-z)/dz;b=(hz-z)/dz;if(a>b){const t=a;a=b;b=t;}if(a>near)near=a;if(b<far)far=b;}
      if((px&&py&&pz)||near>far+1e-9||!(far>M.EPS-1e-9)||near>limit+1e-9){i=tree.skip[i];continue;}
      const items=tree.leaves[i];if(items)for(let j=0;j<items.length;j++){
        const hit=intersection(origin,ray,items[j]);if(hit&&hit.distance<limit)return true;
      }
      i++;
    }
    return false;
  }
  return Object.freeze({IDs,labels,material,get,tree,trace,traceWithFixture,occluded,lightHalf,lightFixture,mirrorParts,mirrorIntersection,pedestal,intersection});
});
