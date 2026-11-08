/* Special-relativity geometry for the light-cone workbench. Units: c = 1. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RelativityModel = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const EPS = 1e-12;
  const ZERO_BETA2 = 1e-24;
  const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const scale = (v,s) => [v[0]*s,v[1]*s,v[2]*s];
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const length = v => Math.hypot(v[0],v[1],v[2]);
  function normalize(v) { const n=length(v); if (!(n>EPS)) throw new RangeError('A nonzero direction is required'); return scale(v,1/n); }
  function speedSquared(beta) {
    if (!Array.isArray(beta) || beta.length!==3 || beta.some(x=>!Number.isFinite(x))) throw new RangeError('Velocity must be a finite three-vector');
    const b2=dot(beta,beta); if (b2>=1) throw new RangeError('Speed must be strictly below c'); return b2;
  }
  function gamma(beta) { return 1/Math.sqrt(1-speedSquared(beta)); }
  // Signed speed, laboratory horizontal heading and elevation form a 3D
  // inertial velocity. At zero elevation this is exactly the original model.
  function motionAxis(scenario,angleDegrees=0,elevationDegrees=0){
    if(!Number.isFinite(angleDegrees)||!Number.isFinite(elevationDegrees))throw new RangeError('Motion angles must be finite');
    const a=angleDegrees*Math.PI/180,e=elevationDegrees*Math.PI/180,c=Math.cos(a)*Math.cos(e),s=Math.sin(a)*Math.cos(e),y=Math.sin(e);
    return scenario==='observer'?[s,y,c]:[c,y,s];
  }
  function motionVelocity(scenario,beta,angleDegrees=0,elevationDegrees=0){
    if(!Number.isFinite(beta)||Math.abs(beta)>=1)throw new RangeError('Speed must be strictly below c');
    return scale(motionAxis(scenario,angleDegrees,elevationDegrees),beta);
  }
  // A source direction points FROM the camera TOWARD the source, opposite to
  // the photon's momentum. A moving observer's direction is transformed to
  // the inertial laboratory frame by boosting the past light ray.
  function observerToLab(direction, beta) {
    const n=normalize(direction),b2=speedSquared(beta);if(b2<ZERO_BETA2)return n;
    const g=1/Math.sqrt(1-b2),nb=dot(n,beta),denom=g*(1-nb);
    return normalize(scale(add(n,scale(beta,(g-1)*nb/b2-g)),1/denom));
  }
  function labToObserver(direction, beta) {
    const n=normalize(direction),b2=speedSquared(beta);if(b2<ZERO_BETA2)return n;
    const g=1/Math.sqrt(1-b2),nb=dot(n,beta),denom=g*(1+nb);
    return normalize(scale(add(n,scale(beta,(g-1)*nb/b2+g)),1/denom));
  }
  // For a photon emitted by a LAB-STATIONARY source with frequency nu_lab.
  function stationarySourceDoppler(labSourceDirection,beta) {
    return gamma(beta)*(1+dot(normalize(labSourceDirection),beta));
  }
  // n points from observer towards the source, opposite to photon momentum.
  // The ratio combines the source and observer four-velocity contractions.
  function dopplerFactor(labSourceDirection,sourceBeta=[0,0,0],observerBeta=[0,0,0]) {
    const n=normalize(labSourceDirection);
    return gamma(observerBeta)*(1+dot(n,observerBeta))/(gamma(sourceBeta)*(1+dot(n,sourceBeta)));
  }
  // Coordinates of a camera ray relative to a rigid object in its own rest
  // frame. center is the object's LAB center at the single observation event.
  // At parameter distance s the photon came from lab time t_observe - s.
  // The alternative omits that time difference and is a simultaneous lab
  // geometry section, deliberately NOT a photograph.
  function restRay(origin,direction,center,beta,lightCone=true) {
    const n=normalize(direction),r=sub(origin,center),b2=speedSquared(beta);
    if(b2<ZERO_BETA2)return {origin:r,direction:n};
    const g=1/Math.sqrt(1-b2),q=(g-1)/b2;
    return {
      origin:add(r,scale(beta,q*dot(r,beta))),
      direction:add(n,scale(beta,q*dot(n,beta)+(lightCone?g:0)))
    };
  }
  function boxIntersection(ro,rd,half) {
    let near=-Infinity,far=Infinity,nearAxis=-1,farAxis=-1,nearSign=0,farSign=0;
    for(let i=0;i<3;i++){
      if(Math.abs(rd[i])<EPS){if(ro[i]<-half[i]||ro[i]>half[i])return null;continue;}
      let a=(-half[i]-ro[i])/rd[i],b=(half[i]-ro[i])/rd[i],sa=-1,sb=1;
      if(a>b){[a,b]=[b,a];[sa,sb]=[sb,sa];}
      if(a>near){near=a;nearAxis=i;nearSign=sa;}
      if(b<far){far=b;farAxis=i;farSign=sb;}
      if(near>far)return null;
    }
    if(!(far>EPS))return null;
    const s=near>EPS?near:far,axis=near>EPS?nearAxis:farAxis,sign=near>EPS?nearSign:farSign;
    const normal=[0,0,0];if(axis<0)return null;normal[axis]=sign;
    return {distance:s,normal};
  }
  // Convex chamfered box: 6 face planes and 12 diagonal edge planes.
  // Unlike a normal-map trick its cut corners change primary and shadow hits.
  function beveledBoxIntersection(ro,rd,half,bevel){
    if(!(bevel>0))return boxIntersection(ro,rd,half);
    if(!boxIntersection(ro,rd,half))return null;
    let near=-Infinity,far=Infinity,nearNormal=null,farNormal=null;
    function clip(n,limit){
      const den=dot(n,rd),gap=limit-dot(n,ro);
      if(Math.abs(den)<EPS)return gap>=-EPS;
      const t=gap/den;
      if(den<0){if(t>near){near=t;nearNormal=n;}}
      else if(t<far){far=t;farNormal=n;}
      return near<=far+EPS;
    }
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const n=[0,0,0];n[axis]=sign;if(!clip(n,half[axis]))return null;}
    for(const [a,b] of [[0,1],[0,2],[1,2]])for(const sa of [-1,1])for(const sb of [-1,1]){
      const n=[0,0,0];n[a]=sa;n[b]=sb;if(!clip(n,half[a]+half[b]-bevel))return null;
    }
    if(!(far>EPS))return null;const distance=near>EPS?near:far,normal=near>EPS?nearNormal:farNormal;
    return normal?{distance,normal:normalize(normal)}:null;
  }
  // Vertices/edges of the same 18-plane convex solid for diagram overlays.
  function bevelMesh(half,bevel){
    if(!(bevel>0))throw new RangeError('A positive bevel is required');
    const vertices=[],edges=[];
    for(let bits=0;bits<8;bits++){
      const signs=[0,1,2].map(i=>bits&(1<<i)?1:-1),base=vertices.length;
      vertices.push(half.map((v,i)=>signs[i]*(v-bevel/2)));
      for(let axis=0;axis<3;axis++){
        vertices.push(half.map((v,i)=>signs[i]*(v-(i===axis?0:bevel))));edges.push([base,base+1+axis]);
      }
    }
    for(let bits=0;bits<8;bits++)for(let axis=0;axis<3;axis++)for(let flip=0;flip<3;flip++)if(axis!==flip&&!(bits&(1<<flip)))edges.push([bits*4+1+axis,(bits|(1<<flip))*4+1+axis]);
    return {vertices,edges};
  }
  // Double-sided Möller–Trumbore intersection. The distance parameter
  // matches the input ray (the caller supplies a unit ray for world hits).
  function triangleIntersection(ro,rd,a,b,c) {
    const e1=sub(b,a),e2=sub(c,a),p=cross(rd,e2),det=dot(e1,p);
    if(Math.abs(det)<EPS)return null;
    const inv=1/det,tvec=sub(ro,a),u=dot(tvec,p)*inv;if(u<0||u>1)return null;
    const q=cross(tvec,e1),v=dot(rd,q)*inv;if(v<0||u+v>1)return null;
    const distance=dot(e2,q)*inv;if(!(distance>EPS))return null;
    return {distance,normal:normalize(cross(e1,e2))};
  }
  function sphereIntersection(ro,rd,radius) {
    const a=dot(rd,rd),b=dot(ro,rd),c=dot(ro,ro)-radius*radius,disc=b*b-a*c;
    if(!(a>EPS)||disc<0)return null;
    const d=Math.sqrt(Math.max(0,disc)),near=(-b-d)/a,far=(-b+d)/a;
    const s=near>EPS?near:far>EPS?far:null;if(s===null)return null;
    return {distance:s,normal:normalize(add(ro,scale(rd,s)))};
  }
  // Finite, closed, axis-aligned cylinder; rd need not be normalized, so the
  // returned parameter is in the same units as the caller's ray.
  function cylinderIntersection(ro,rd,radius,halfLength,axis=1) {
    const radial=[0,1,2].filter(i=>i!==axis),i=radial[0],j=radial[1];
    const a=rd[i]*rd[i]+rd[j]*rd[j],b=ro[i]*rd[i]+ro[j]*rd[j],c=ro[i]*ro[i]+ro[j]*ro[j]-radius*radius;
    let distance=Infinity,normal=null;
    if(a>EPS){
      const disc=b*b-a*c;
      if(disc>=0){
        const s=Math.sqrt(Math.max(0,disc));
        for(const t of [(-b-s)/a,(-b+s)/a]){
          if(t>EPS&&t<distance&&Math.abs(ro[axis]+t*rd[axis])<=halfLength){
            const n=[0,0,0];n[i]=ro[i]+t*rd[i];n[j]=ro[j]+t*rd[j];distance=t;normal=normalize(n);
          }
        }
      }
    }
    if(Math.abs(rd[axis])>EPS)for(const sign of [-1,1]){
      const t=(sign*halfLength-ro[axis])/rd[axis],x=ro[i]+t*rd[i],y=ro[j]+t*rd[j];
      if(t>EPS&&t<distance&&x*x+y*y<=radius*radius){distance=t;normal=[0,0,0];normal[axis]=sign;}
    }
    return normal?{distance,normal}:null;
  }
  // Small rest-frame protrusions are actual boxes, not a shared handle decal.
  // They move rigidly with the body and participate in primary and shadow rays.
  // Coordinates below are in the same c=1 scene units as the 1.22-half-size box.
  const bodyParts=Object.freeze({
    station:Object.freeze([
      {kind:'luggage-handle',center:[-.325,.86,-1.245],half:[.065,.095,.025]},
      {kind:'luggage-handle',center:[.325,.86,-1.245],half:[.065,.095,.025]},
      {kind:'luggage-handle',center:[0,.86,-1.275],half:[.30,.045,.030]}
    ]),
    street:Object.freeze([
      // Shallow tape follows the material's horizontal strip; the gap leaves
      // the address label exposed rather than putting a dark cross over it.
      {kind:'parcel-tape',center:[-.475,0,-1.2275],half:[.705,.235,.0075]},
      {kind:'parcel-tape',center:[1.065,0,-1.2275],half:[.115,.235,.0075]}
    ]),
    corridor:Object.freeze([
      // Four finite slats align with the grille in the underlying material.
      {kind:'equipment-vent',center:[0,.26,-1.245],half:[.29,.0275,.025]},
      {kind:'equipment-vent',center:[0,.145,-1.245],half:[.29,.0275,.025]},
      {kind:'equipment-vent',center:[0,.025,-1.245],half:[.29,.0275,.025]},
      {kind:'equipment-vent',center:[0,-.085,-1.245],half:[.29,.0275,.025]}
    ]),
    mountain:Object.freeze([
      {kind:'crate-frame',center:[-1.10,0,-1.24],half:[.055,1.14,.02]},
      {kind:'crate-frame',center:[1.10,0,-1.24],half:[.055,1.14,.02]},
      {kind:'crate-frame',center:[0,1.07,-1.24],half:[1.05,.055,.02]},
      {kind:'crate-frame',center:[0,-1.07,-1.24],half:[1.05,.055,.02]}
    ]),
    harbor:Object.freeze([
      {kind:'cargo-moving-rail',center:[-.72,0,-1.245],half:[.035,1.03,.025]},
      {kind:'cargo-moving-rail',center:[.72,0,-1.245],half:[.035,1.03,.025]}
    ])
  });
  for(const parts of Object.values(bodyParts))for(const part of parts){Object.freeze(part.center);Object.freeze(part.half);Object.freeze(part);}
  // Keep the ideal cube/sphere as controlled comparisons. Scene objects use
  // different actual rest-frame dimensions and intersectable parts, not just
  // a different texture on the same cube. They are still simplified props.
  const STANDARD_HALF=Object.freeze([1.22,1.22,1.22]);
  const artifacts=Object.freeze({
    station:Object.freeze({half:Object.freeze([.88,1.00,.42]),contact:1.18,bevel:.12}),
    street:Object.freeze({half:Object.freeze([1.02,.89,.82]),contact:.90,bevel:.045}),
    corridor:Object.freeze({half:Object.freeze([.72,1.13,.54]),contact:1.18,bevel:.075}),
    mountain:Object.freeze({half:Object.freeze([1.10,.89,.97]),contact:.99,bevel:.055}),
    harbor:Object.freeze({half:Object.freeze([1.02,.92,.76]),contact:.95,bevel:.035})
  });
  function artifact(environment){return artifacts[environment]||artifacts.station;}
  function objectHalf(environment,shape='cube'){return shape==='artifact'?artifact(environment).half:STANDARD_HALF;}
  function objectContact(environment,shape='cube'){return shape==='artifact'?artifact(environment).contact:1.22;}
  function objectBevel(environment,shape='cube'){return shape==='artifact'?artifact(environment).bevel:0;}
  // Second inertial body has its own worldline and velocity. Its anchor is
  // chosen near a visible retarded position, not a collision or force model.
  function secondaryMotion(state){
    if(!state.secondEnabled||state.scenario!=='flyby')return null;
    const velocity=motionVelocity('flyby',Number.isFinite(state.secondBeta)?state.secondBeta:-.6,state.secondAngle||0,state.secondElevation||0),time=Number.isFinite(state.time)?state.time:0;
    let center=add([2.8,objectContact(state.environment,state.shape),8.4],scale(velocity,8.2+time));
    if(state.lockedEvent?.secondCenter)center=add(state.lockedEvent.secondCenter,scale(velocity,time-state.lockedEvent.time));
    return {id:'B',center,velocity};
  }
  // A small dial is printed on the object's front surface. The clock's zero
  // is the rest-frame event at the body centre when laboratory t=0.
  function clockAnchor(environment,shape='cube'){
    const h=objectHalf(environment,shape),x=0,y=.43*h[1],z=shape==='sphere'?-Math.sqrt(1.22**2-x*x-y*y):-h[2];
    return {point:[x,y,z],radius:.23*Math.min(h[0],h[1])};
  }
  // Default M is separate from the clock so its ring does not cover the dial.
  function materialAnchor(environment,shape='cube'){
    const h=objectHalf(environment,shape),x=.40*h[0],y=-.38*h[1],z=shape==='sphere'?-Math.sqrt(1.22**2-x*x-y*y):-h[2];
    return [x,y,z];
  }
  // At laboratory time t, x=x_center(t)+contract(restOffset,beta), so the
  // rest-frame synchronized clock reads t/gamma - beta·restOffset (c=1).
  function properTime(t,beta,restOffset){
    if(!Number.isFinite(t)||!Array.isArray(restOffset)||restOffset.length!==3||restOffset.some(x=>!Number.isFinite(x)))throw new RangeError('Invalid clock event');
    return t/gamma(beta)-dot(beta,restOffset);
  }
  // 0: not on the dial, 1: metal rim, 2: face, 3: ink/hands.
  // The drawing is part of the moving surface material; intersections are
  // still those of the actual body, not an independent screen-space sticker.
  function clockInk(restPoint,restNormal,half,tau){
    if(!restPoint||!restNormal||restNormal[2]>=-.5)return 0;
    const radius=.23*Math.min(half[0],half[1]),x=restPoint[0]/radius,y=(restPoint[1]-.43*half[1])/radius,r=Math.hypot(x,y);
    if(r>1)return 0;if(r>.90)return 1;
    if(r>.77&&Math.abs(Math.sin(6*Math.atan2(x,y)))<.22)return 3;
    const hand=(period,len,width)=>{const a=2*Math.PI*tau/period,ux=Math.sin(a),uy=Math.cos(a),along=x*ux+y*uy,across=Math.abs(x*uy-y*ux);return along>=-.06&&along<=len&&across<width;};
    if(r<.07||hand(12,.75,.035)||hand(120,.50,.055))return 3;
    return 2;
  }
  function remapPart(part,half){
    const sx=half[0]/1.22,sy=half[1]/1.22;
    return {kind:part.kind,center:[part.center[0]*sx,part.center[1]*sy,-half[2]+part.center[2]+1.22],half:[part.half[0]*sx,part.half[1]*sy,part.half[2]]};
  }
  function boxPart(kind,center,half){return {kind,center,half};}
  function cylinderPart(kind,center,radius,halfLength,axis){
    const half=[radius,radius,radius];half[axis]=halfLength;
    return {kind,primitive:'cylinder',center,half,radius,axis};
  }
  const artifactParts=Object.freeze(Object.fromEntries(Object.keys(artifacts).map(id=>{
    const half=artifact(id).half,parts=bodyParts[id].map(part=>remapPart(part,half));
    if(id==='station'){
      // Two solid wheels and a raised carrying bar change the real silhouette.
      for(const x of [-.64,.64])parts.push(cylinderPart('luggage-wheel',[x,-1.04,-.16],.14,.08,0));
      for(const x of [-.32,.32])parts.push(boxPart('luggage-rail',[x,1.06,.02],[.035,.075,.035]));
      parts.push(boxPart('luggage-rail',[0,1.15,.02],[.355,.035,.04]));
      // External protective piping and horizontal seams are solid thin extrusions.
      for(const x of [-.71,.71])parts.push(boxPart('luggage-rail',[x,-.08,-.431],[.022,.70,.018]));
      for(const y of [-.64,.64])parts.push(boxPart('luggage-rail',[0,y,-.431],[.69,.018,.018]));
    }else if(id==='street'){
      parts.push(boxPart('parcel-tape',[0,.90,0],[.115,.01,.78]));
      // Strapping wraps onto the top and side; it is not a painted-on line.
      for(const x of [-.68,.68])parts.push(boxPart('parcel-tape',[x,.898,0],[.055,.014,.73]));
      for(const x of [-1.0275,1.0275])parts.push(boxPart('parcel-tape',[x,0,0],[.0125,.15,.75]));
    }else if(id==='corridor'){
      parts.push(boxPart('equipment-switch',[.31,.57,-.568],[.075,.075,.028]));
      for(const x of [-.48,.48])parts.push(boxPart('equipment-foot',[x,-1.145,0],[.15,.035,.43]));
      for(const x of [-.61,.61])parts.push(boxPart('equipment-vent',[x,0,-.551],[.025,.75,.015]));
      parts.push(cylinderPart('equipment-switch',[.39,1.17,.16],.055,.08,1));
    }else if(id==='mountain'){
      for(const x of [-.72,.72])parts.push(boxPart('crate-frame',[x,-.94,0],[.16,.05,.78]));
      for(const y of [-.43,.12])parts.push(boxPart('crate-frame',[0,y,-.983],[.92,.035,.018]));
      for(const x of [-1.025,1.025])parts.push(boxPart('crate-frame',[x,0,0],[.04,.70,.85]));
    }else if(id==='harbor'){
      for(const y of [-.72,.72])parts.push(boxPart('cargo-moving-rail',[0,y,-.785],[.95,.035,.025]));
      for(const x of [-.96,.96])parts.push(boxPart('cargo-moving-rail',[x,0,-.785],[.035,.78,.025]));
      parts.push(boxPart('cargo-moving-rail',[0,.96,0],[.25,.035,.20]));
    }
    for(const part of parts){Object.freeze(part.center);Object.freeze(part.half);Object.freeze(part);}
    return [id,Object.freeze(parts)];
  })));
  function objectParts(environment,shape='cube'){
    if(shape==='artifact')return artifactParts[environment]||artifactParts.station;
    return bodyParts[environment]||bodyParts.station;
  }
  // A cached conservative rest-space envelope avoids intersecting every
  // small moving part when the ray cannot reach any of them. It never changes
  // the exact per-part intersection or the winning surface.
  const detailBoundsCache=new WeakMap();
  function detailBounds(details){
    let result=detailBoundsCache.get(details);if(result)return result;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const part of details)for(let k=0;k<3;k++){min[k]=Math.min(min[k],part.center[k]-part.half[k]);max[k]=Math.max(max[k],part.center[k]+part.half[k]);}
    result={min,max};detailBoundsCache.set(details,result);return result;
  }
  function intersectsDetailBounds(origin,direction,bounds,limit){
    let near=0,far=limit;
    for(let k=0;k<3;k++){
      const d=direction[k],o=origin[k],lo=bounds.min[k]-1e-9,hi=bounds.max[k]+1e-9;if(Math.abs(d)<EPS){if(o<lo||o>hi)return false;continue;}
      const a=(lo-o)/d,b=(hi-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(far<near)return false;
    }
    return far>EPS;
  }
  function movingObjectHit({origin,direction,center,beta=[0,0,0],shape='cube',halfSize=[1,1,1],radius=1,bevel=0,lightCone=true,time=0,details=[]}) {
    if(!Number.isFinite(time)||!Array.isArray(origin)||!Array.isArray(center))throw new RangeError('Invalid observation event');
    if(!['cube','sphere'].includes(shape))throw new RangeError('Unknown object shape');
    if(!Array.isArray(halfSize)||halfSize.length!==3||halfSize.some(v=>!Number.isFinite(v)||v<=0)||!(Number.isFinite(radius)&&radius>0))throw new RangeError('Invalid object dimensions');
    if(!(Number.isFinite(bevel)&&bevel>=0&&bevel<Math.min(...halfSize)))throw new RangeError('Invalid object bevel');
    const n=normalize(direction),ray=restRay(origin,n,center,beta,lightCone);
    if(shape==='cube'){
      // A conservative sphere contains the entire rest-frame box and every
      // protruding part. A line missing it cannot hit any component. Unlike a
      // screen-space shortcut this culls the same Lorentz-transformed ray and
      // leaves the exact primitive tests and their winning distances intact.
      const bounds=details.length?detailBounds(details):null;
      const rx=Math.max(halfSize[0],bounds?Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0])):0),
        ry=Math.max(halfSize[1],bounds?Math.max(Math.abs(bounds.min[1]),Math.abs(bounds.max[1])):0),
        rz=Math.max(halfSize[2],bounds?Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2])):0);
      const o=ray.origin,d=ray.direction,a=d[0]*d[0]+d[1]*d[1]+d[2]*d[2],b=o[0]*d[0]+o[1]*d[1]+o[2]*d[2];
      const radius2=rx*rx+ry*ry+rz*rz,origin2=o[0]*o[0]+o[1]*o[1]+o[2]*o[2],tolerance=1e-10*Math.max(1,radius2,origin2);
      if(a>0&&origin2>radius2+tolerance&&(b>=0||origin2-b*b/a>radius2+tolerance))return null;
    }
    let hit=shape==='sphere'?sphereIntersection(ray.origin,ray.direction,radius):beveledBoxIntersection(ray.origin,ray.direction,halfSize,bevel),part=null;
    if(shape==='cube'&&details.length&&intersectsDetailBounds(ray.origin,ray.direction,detailBounds(details),hit?hit.distance:Infinity))for(const detail of details){
      const local=sub(ray.origin,detail.center);
      const candidate=detail.primitive==='cylinder'?cylinderIntersection(local,ray.direction,detail.radius,detail.half[detail.axis],detail.axis):boxIntersection(local,ray.direction,detail.half);
      if(candidate&&(!hit||candidate.distance<hit.distance)){hit=candidate;part=detail.kind;}
    }
    if(!hit)return null;
    const s=hit.distance,point=add(origin,scale(n,s)),restPoint=add(ray.origin,scale(ray.direction,s));
    const emittedAt=lightCone?time-s:null,centerAtEmission=lightCone?sub(center,scale(beta,s)):null;
    const b2=speedSquared(beta),g=b2<ZERO_BETA2?1:1/Math.sqrt(1-b2);
    const normal=b2<ZERO_BETA2?hit.normal:normalize(add(hit.normal,scale(beta,(g-1)*dot(hit.normal,beta)/b2)));
    return {distance:s,point,restPoint,restNormal:hit.normal,normal,emittedAt,centerAtEmission,observationTime:time,lightCone,part};
  }
  // The renderer traces thousands of rays against an unchanged object during
  // one observation. Validate and precompute its rest-space envelope once;
  // each ray still uses the same Lorentz transform and exact primitive tests.
  function prepareMovingObject({beta=[0,0,0],shape='cube',halfSize=[1,1,1],radius=1,bevel=0,details=[]}={}){
    const b2=speedSquared(beta);
    if(!['cube','sphere'].includes(shape))throw new RangeError('Unknown object shape');
    if(!Array.isArray(halfSize)||halfSize.length!==3||halfSize.some(v=>!Number.isFinite(v)||v<=0)||!(Number.isFinite(radius)&&radius>0))throw new RangeError('Invalid object dimensions');
    if(!(Number.isFinite(bevel)&&bevel>=0&&bevel<Math.min(...halfSize)))throw new RangeError('Invalid object bevel');
    const g=b2<ZERO_BETA2?1:1/Math.sqrt(1-b2),q=b2<ZERO_BETA2?0:(g-1)/b2,bounds=shape==='cube'&&details.length?detailBounds(details):null;
    const rx=Math.max(halfSize[0],bounds?Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0])):0),
      ry=Math.max(halfSize[1],bounds?Math.max(Math.abs(bounds.min[1]),Math.abs(bounds.max[1])):0),
      rz=Math.max(halfSize[2],bounds?Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2])):0),radius2=rx*rx+ry*ry+rz*rz;
    function hit(origin,direction,center,lightCone=true,time=0){
      const n=normalize(direction),nn=normalize(n),r=sub(origin,center);
      const ray=b2<ZERO_BETA2?{origin:r,direction:nn}:{origin:add(r,scale(beta,q*dot(r,beta))),direction:add(nn,scale(beta,q*dot(nn,beta)+(lightCone?g:0)))};
      if(shape==='cube'){
        const o=ray.origin,d=ray.direction,a=d[0]*d[0]+d[1]*d[1]+d[2]*d[2],b=o[0]*d[0]+o[1]*d[1]+o[2]*d[2];
        const origin2=o[0]*o[0]+o[1]*o[1]+o[2]*o[2],tolerance=1e-10*Math.max(1,radius2,origin2);
        if(a>0&&origin2>radius2+tolerance&&(b>=0||origin2-b*b/a>radius2+tolerance))return null;
      }
      let result=shape==='sphere'?sphereIntersection(ray.origin,ray.direction,radius):beveledBoxIntersection(ray.origin,ray.direction,halfSize,bevel),part=null;
      if(shape==='cube'&&bounds&&intersectsDetailBounds(ray.origin,ray.direction,bounds,result?result.distance:Infinity))for(const detail of details){
        const local=sub(ray.origin,detail.center);
        const candidate=detail.primitive==='cylinder'?cylinderIntersection(local,ray.direction,detail.radius,detail.half[detail.axis],detail.axis):boxIntersection(local,ray.direction,detail.half);
        if(candidate&&(!result||candidate.distance<result.distance)){result=candidate;part=detail.kind;}
      }
      if(!result)return null;
      const s=result.distance,point=add(origin,scale(n,s)),restPoint=add(ray.origin,scale(ray.direction,s));
      const emittedAt=lightCone?time-s:null,centerAtEmission=lightCone?sub(center,scale(beta,s)):null;
      const normal=b2<ZERO_BETA2?result.normal:normalize(add(result.normal,scale(beta,(g-1)*dot(result.normal,beta)/b2)));
      return {distance:s,point,restPoint,restNormal:result.normal,normal,emittedAt,centerAtEmission,observationTime:time,lightCone,part};
    }
    return Object.freeze({hit});
  }
  function cameraRay(x,y,width,height,yaw,pitch,fovDegrees) {
    if(!(width>0&&height>0))throw new RangeError('Camera dimensions must be positive');
    const cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp];
    const right=[Math.cos(yaw),0,-Math.sin(yaw)];
    const up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
    const sx=(2*x/width-1)*(width/height),sy=1-2*y/height,t=Math.tan(fovDegrees*Math.PI/360);
    return normalize(add(forward,add(scale(right,sx*t),scale(up,sy*t))));
  }
  // False-color key for emission age t_observe - t_emit = distance/c.
  // The range is fixed, not automatically normalized per image, so colors
  // remain comparable across frames. The sky has no finite emission age.
  function emissionColor(distance){
    if(!(Number.isFinite(distance)&&distance>=0))throw new RangeError('Finite nonnegative light travel time required');
    const q=Math.min(distance/20,1),a=q<.5?[1,.34,.12]:[1,.82,.35],b=q<.5?[1,.82,.35]:[.05,.44,.85],t=q<.5?q*2:(q-.5)*2;
    return a.map((v,i)=>v*(1-t)+b[i]*t);
  }
  // Four midpoint samples of a rectangular shutter, centred on the chosen
  // laboratory observation time. Zero duration is exactly one instant.
  function shutterTimes(time,duration){
    if(!Number.isFinite(time)||!Number.isFinite(duration)||duration<0)throw new RangeError('Invalid shutter interval');
    if(duration===0)return [time];
    return Array.from({length:4},(_,i)=>time+duration*((i+.5)/4-.5));
  }
  return Object.freeze({EPS,add,sub,scale,dot,cross,length,normalize,gamma,motionAxis,motionVelocity,observerToLab,labToObserver,stationarySourceDoppler,dopplerFactor,restRay,boxIntersection,beveledBoxIntersection,bevelMesh,triangleIntersection,sphereIntersection,cylinderIntersection,movingObjectHit,prepareMovingObject,objectParts,objectHalf,objectContact,objectBevel,secondaryMotion,clockAnchor,materialAnchor,properTime,clockInk,cameraRay,emissionColor,shutterTimes});
});
