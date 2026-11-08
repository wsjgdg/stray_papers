/* Two-ended ideal light clock with rest-synchronised end clocks. Units c=1.
 * At each reflection an independent secondary flash is emitted to a stationary
 * detector; its arrival is not the reflection event or the proper clock tick. */
(function(root,factory){
  'use strict';if(typeof module==='object'&&module.exports)module.exports=factory();else root.RelativityLightClock=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],length=a=>Math.hypot(...a);
  function boostEvent(t,r,v,offset){
    const b2=dot(v,v),g=1/Math.sqrt(1-b2),vr=dot(v,r),labTime=g*(t+vr),labSpace=b2<1e-24?add(offset,r):add(offset,add(r,mul(v,(g-1)*vr/b2+g*t)));
    return {time:labTime,position:labSpace};
  }
  function simultaneous(r,v){const b2=dot(v,v);return b2<1e-24?r.slice():add(r,mul(v,(Math.sqrt(1-b2)-1)*dot(v,r)/b2));}
  function create({beta=.6,angle=90,arm=3,origin=[6,0,0],detector=[0,0,0],cycles=2}={}){
    if(!Number.isFinite(beta)||Math.abs(beta)>=1||!Number.isFinite(angle)||!Number.isFinite(arm)||arm<=0||!Number.isInteger(cycles)||cycles<1||cycles>20||![origin,detector].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))throw new RangeError('Invalid light-clock parameters');
    const theta=angle*Math.PI/180,axis=[Math.cos(theta),0,Math.sin(theta)],velocity=[beta,0,0],g=1/Math.sqrt(1-beta*beta),restB=mul(axis,arm),events=[];
    for(let i=0;i<=2*cycles;i++){
      const proper=i*arm,end=i%2?'B':'A',rest=end==='A'?[0,0,0]:restB,event=boostEvent(proper,rest,velocity,origin),distance=length(sub(event.position,detector));
      events.push({index:i,end,proper,time:event.time,position:event.position,arrival:event.time+distance,distance});
    }
    function at(time){
      if(!Number.isFinite(time)||time<0)throw new RangeError('Lab time must be nonnegative');
      const a=add(origin,mul(velocity,time)),b=add(a,simultaneous(restB,velocity)),clockA=time/g,clockB=time/g-dot(velocity,restB);
      let photon=null,leg=null;
      for(let i=0;i<events.length-1;i++)if(time>=events[i].time-1e-10&&time<=events[i+1].time+1e-10){
        const from=events[i],to=events[i+1],f=Math.max(0,Math.min(1,(time-from.time)/(to.time-from.time)));photon=add(from.position,mul(sub(to.position,from.position),f));leg=i;break;
      }
      const flashes=events.filter(e=>time>=e.time&&time<e.arrival).map(e=>({index:e.index,position:add(e.position,mul(sub(detector,e.position),(time-e.time)/(e.arrival-e.time)))}));
      return {time,a,b,clockA,clockB,photon,leg,flashes};
    }
    return {beta,angle,arm,origin:origin.slice(),detector:detector.slice(),velocity,axis,gamma:g,restB,events,at,roundTripProper:2*arm,roundTripLab:2*g*arm,simultaneityOffset:-dot(velocity,restB)};
  }
  return Object.freeze({add,sub,mul,dot,length,boostEvent,simultaneous,create});
});
