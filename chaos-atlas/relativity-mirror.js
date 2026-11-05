/* Finite ideal inertial mirror, one incident null ray, c = 1.
 * The plane's angle and aperture are defined in the mirror rest frame. */
(function(root,factory){
  'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.RelativityMirror=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,k)=>a.map(v=>v*k),length=a=>Math.hypot(...a);
  const unit=a=>{const l=length(a);if(!(l>1e-12))throw new RangeError('Direction must be nonzero');return mul(a,1/l);};
  function transformSpatial(r,v){const b2=dot(v,v);if(b2<1e-24)return r.slice();const g=1/Math.sqrt(1-b2);return add(r,mul(v,(g-1)*dot(v,r)/b2));}
  // Rest-frame material vector to simultaneous lab displacement.
  function simultaneous(r,v){const b2=dot(v,v);if(b2<1e-24)return r.slice();return add(r,mul(v,(Math.sqrt(1-b2)-1)*dot(v,r)/b2));}
  function photonToRest(direction,v){
    const n=unit(direction),b2=dot(v,v),g=1/Math.sqrt(1-b2),bn=dot(v,n),frequency=g*(1-bn);
    const p=b2<1e-24?n:add(n,mul(v,(g-1)*bn/b2-g));return {frequency,direction:unit(mul(p,1/frequency))};
  }
  function photonToLab(direction,v,frequency=1){
    const n=unit(direction),b2=dot(v,v),g=1/Math.sqrt(1-b2),bn=dot(v,n),factor=g*(1+bn);
    const p=b2<1e-24?n:add(n,mul(v,(g-1)*bn/b2+g));return {frequency:frequency*factor,direction:unit(mul(p,1/factor))};
  }
  function solve({beta=0,mirrorAngle=0,velocityAngle=0,incidentAngle=0,distance=6,halfWidth=3,halfHeight=2,wavelength=550}={}){
    for(const x of [beta,mirrorAngle,velocityAngle,incidentAngle,distance,halfWidth,halfHeight,wavelength])if(!Number.isFinite(x))throw new RangeError('Parameters must be finite');
    if(Math.abs(beta)>=1||distance<=0||halfWidth<=0||halfHeight<=0||wavelength<=0)throw new RangeError('Invalid mirror parameters');
    const rad=Math.PI/180,theta=mirrorAngle*rad,phi=velocityAngle*rad,alpha=incidentAngle*rad;
    const velocity=[beta*Math.cos(phi),0,beta*Math.sin(phi)],normal=[Math.cos(theta),0,Math.sin(theta)],tangent=[-Math.sin(theta),0,Math.cos(theta)],vertical=[0,1,0],incoming=[Math.cos(alpha),0,Math.sin(alpha)];
    const origin=[0,0,0],center0=[distance,0,0],g=1/Math.sqrt(1-beta*beta),delta0=sub(origin,center0);
    const a=transformSpatial(delta0,velocity),b=transformSpatial(sub(incoming,velocity),velocity),den=dot(normal,b),numerator=-dot(normal,a);
    const result={beta,mirrorAngle,velocityAngle,incidentAngle,velocity,normal,tangent,vertical,incoming,origin,center0,halfWidth,halfHeight,wavelength,gamma:g};
    if(Math.abs(den)<1e-12)return {...result,status:'parallel',meeting:null,reflected:null,detector:null};
    const t=numerator/den;if(!(t>1e-9))return {...result,status:'past',meeting:null,reflected:null,detector:null};
    const point=add(origin,mul(incoming,t)),center=add(center0,mul(velocity,t)),restPoint=transformSpatial(sub(point,center),velocity),u=dot(restPoint,tangent),v=dot(restPoint,vertical);
    const restTime=g*(t-dot(velocity,sub(point,center0))),meeting={time:t,point,center,restPoint,restTime,u,v};
    if(Math.abs(u)>halfWidth+1e-10||Math.abs(v)>halfHeight+1e-10)return {...result,status:'miss',meeting,reflected:null,detector:null};
    const incidentRest=photonToRest(incoming,velocity),outRest=unit(sub(incidentRest.direction,mul(normal,2*dot(incidentRest.direction,normal)))),outLab=photonToLab(outRest,velocity,incidentRest.frequency);
    const reflected={restIncoming:incidentRest.direction,restOutgoing:outRest,restFrequency:incidentRest.frequency,outgoing:outLab.direction,frequencyRatio:outLab.frequency,wavelength:wavelength/outLab.frequency};
    let detector=null;
    if(outLab.direction[0]<-1e-12){const dt=-point[0]/outLab.direction[0];if(dt>=0)detector={time:t+dt,point:add(point,mul(outLab.direction,dt)),delay:dt};}
    return {...result,status:'hit',meeting,reflected,detector};
  }
  return Object.freeze({dot,add,sub,mul,length,unit,transformSpatial,simultaneous,photonToRest,photonToLab,solve});
});
