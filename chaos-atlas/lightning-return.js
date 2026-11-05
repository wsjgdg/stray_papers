/*
 * A separate, precharged, branched transmission-line return-stroke model.
 *
 * The DBM supplies ONLY a connected tree geometry; it does not supply SI
 * dimensions, leader charge, conductor parameters, or a plasma solution. We
 * assign a plate spacing H and a uniform negative initial voltage -V0. The
 * source-electrode scaffold is collapsed into one ideal node; the last grown
 * bond is connected at t=0 to ground through Rg. The cloud end and dangling
 * branches are otherwise open. Every grown bond is divided into line elements:
 *
 *   L_e dI_e/dt = V_a - V_b - R_e I_e
 *   C_i dV_i/dt = -sum(outgoing I_e) + sum(incoming I_e)
 *
 * C_i is assembled from half the shunt capacitance of each incident element.
 * Ground is an algebraic boundary: for the last element V_b=0 and its series
 * resistance is R_e+Rg. This is an RLC ladder, NOT a 3-D Maxwell solver. R',
 * L', and C' are constant effective parameters; the return path and mutual
 * capacitance/inductance are not spatially resolved. Electron motion, optical
 * emission, ionization, shock waves and gas thermodynamics are not solved.
 *
 * Voltage is at whole time steps, current at staggered half steps. Trapezoidal
 * resistance and a conservative leapfrog update give an EXACT discrete energy
 * identity for fixed dt:
 *   H_n = 1/2 sum C V_n^2 + 1/2 sum L I_{n-1/2}^2
 *       + dt/2 sum I_{n-1/2} (V_a^n - V_b^n)
 *   H_{n+1} - H_n = -dt sum R ((I_{n+1/2}+I_{n-1/2})/2)^2.
 * The cross term is the staggered-grid correction, not physical heat.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.LightningReturn=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LIGHT_SPEED=299792458,DEFAULT_PARTS=4,MAX_GROWTH_EDGES=3000;
  function number(value,fallback,min,max,name){
    const n=value===undefined?fallback:Number(value);
    if(!Number.isFinite(n)||n<min||n>max)throw Error((name||'参数')+'超出允许范围');
    return n;
  }
  function xyz(d,id){const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny;return [x,y,z];}
  class ReturnStroke {
    constructor(data,options={}){
      if(!data||!data.stats||!data.stats.complete||!data.segments||data.segments.length<2||data.segments.length%2)throw Error('需要一棵已接触目标的计算树');
      if(!Number.isInteger(data.nx)||!Number.isInteger(data.ny)||!Number.isInteger(data.nz)||data.nx<2||data.ny<2||data.nz<1)throw Error('无效的网格尺寸');
      const count=data.nx*data.ny*data.nz;if(!Number.isSafeInteger(count)||count>1000000||!data.mask||data.mask.length!==count)throw Error('无效的电极边界');
      this.height=number(options.height,2000,100,10000,'极板间距');
      this.voltageMagnitude=number(options.voltage,10e6,1e3,100e6,'初始电压');
      this.rPerM=number(options.resistance,.10,0,5,'单位长度电阻');
      this.lPerM=number(options.inductance,2e-6,0.1e-6,50e-6,'单位长度电感');
      this.cPerM=number(options.capacitance,50e-12,1e-12,1000e-12,'单位长度电容');
      this.groundResistance=number(options.groundResistance,10,0,1000,'接地电阻');
      this.parts=number(options.parts,DEFAULT_PARTS,1,16,'每键划分');
      if(!Number.isInteger(this.parts))throw Error('每键划分必须为整数');
      this.waveSpeed=1/Math.sqrt(this.lPerM*this.cPerM);
      if(this.waveSpeed>LIGHT_SPEED)throw Error('等效传播速度超过光速，请调整电感或电容');
      this.impedance=Math.sqrt(this.lPerM/this.cPerM);
      const segments=Int32Array.from(data.segments),total=segments.length/2;
      const rawSeed=data.seedSegmentCount===undefined?0:Number(data.seedSegmentCount);
      if(!Number.isInteger(rawSeed)||rawSeed<0||rawSeed>=total)throw Error('电极骨架无效');
      this.seedSegmentCount=rawSeed;this.growthEdges=total-rawSeed;
      if(this.growthEdges>MAX_GROWTH_EDGES)throw Error('通道超过回击模型的计算容量');
      const root=segments[0],target=segments[segments.length-1];
      if(root<0||root>=count||target<0||target>=count||data.mask[target]!==2)throw Error('末端不是目标电极');
      // Validate the parent-before-child tree before collapsing the source body.
      const seen=new Uint8Array(count),parentEdge=new Int32Array(count),seedMask=new Uint8Array(count),map=new Int32Array(count);
      parentEdge.fill(-1);map.fill(-1);seen[root]=1;seedMask[root]=1;map[root]=0;
      const grownLengths=new Float64Array(this.growthEdges);
      for(let e=0;e<total;e++){
        const a=segments[2*e],b=segments[2*e+1];
        if(a<0||a>=count||b<0||b>=count||!seen[a]||seen[b])throw Error('击穿树连接无效');
        const p=xyz(data,a),q=xyz(data,b),dx=Math.abs(p[0]-q[0]),dy=Math.abs(p[1]-q[1]),dz=Math.abs(p[2]-q[2]);
        if(dx>1||dy>1||dz>1||dx+dy+dz===0||dx+dy+dz>2)throw Error('击穿连接不是相邻网格点');
        if(e<rawSeed){seedMask[b]=1;map[b]=0;}
        else{
          if(b===target&&e!==total-1)throw Error('目标只能作为最终接触端');
          grownLengths[e-rawSeed]=Math.hypot(dx,dy,dz)*this.height/(data.ny-1);
        }
        seen[b]=1;parentEdge[b]=e;
      }
      // Construct a pi-ladder. No capacitor is assigned to the ground node;
      // the last half-cell is on the grounded side of the terminal boundary.
      const from=[],to=[],length=[],caps=[0];let nodes=1;
      for(let e=rawSeed;e<total;e++){
        const a=segments[2*e],b=segments[2*e+1];let u=map[a];
        if(u<0)throw Error('通道源端未连接');
        const len=grownLengths[e-rawSeed]/this.parts;
        for(let k=0;k<this.parts;k++){
          const isGround=e===total-1&&k===this.parts-1;
          const v=isGround?-1:nodes++;
          if(v>=0)caps[v]=0;
          from.push(u);to.push(v);length.push(len);
          caps[u]+=this.cPerM*len/2;if(v>=0)caps[v]+=this.cPerM*len/2;
          u=v;
        }
        if(e!==total-1)map[b]=u;
      }
      this.edges=from.length;this.nodes=nodes;this.groundEdge=this.edges-1;
      this.from=Int32Array.from(from);this.to=Int32Array.from(to);this.lengths=Float64Array.from(length);this.capacitance=Float64Array.from(caps);
      if(this.capacitance.some(c=>!(c>0)))throw Error('无效的节点电容');
      this.inductance=new Float64Array(this.edges);this.resistance=new Float64Array(this.edges);
      const sumInvL=new Float64Array(this.nodes);let resistiveBound=Infinity;
      for(let e=0;e<this.edges;e++){
        const len=this.lengths[e],ind=this.lPerM*len,res=this.rPerM*len;this.inductance[e]=ind;this.resistance[e]=res;
        const inv=1/ind;sumInvL[this.from[e]]+=inv;if(this.to[e]>=0)sumInvL[this.to[e]]+=inv;
        const effective=res+(e===this.groundEdge?this.groundResistance:0);
        if(effective>0)resistiveBound=Math.min(resistiveBound,.8*ind/effective);
      }
      // Gershgorin upper bound for the eigenvalues of C^-1 B L^-1 B^T.
      // A safety factor also keeps the discrete energy positive definite.
      let eigenBound=0;for(let i=0;i<this.nodes;i++)eigenBound=Math.max(eigenBound,2*sumInvL[i]/this.capacitance[i]);
      this.maxDt=Math.min(.65*2/Math.sqrt(eigenBound),resistiveBound);
      if(!(this.maxDt>0&&Number.isFinite(this.maxDt)))throw Error('无法建立稳定时间步');
      this.current=new Float64Array(this.edges);this.nextCurrent=new Float64Array(this.edges);
      this.voltage=new Float64Array(this.nodes);this.voltage.fill(-this.voltageMagnitude);this.nextVoltage=new Float64Array(this.nodes);
      this.heat=new Float64Array(this.edges);this.heatDelta=new Float64Array(this.edges);this.net=new Float64Array(this.nodes);
      this.alpha=new Float64Array(this.edges);this.beta=new Float64Array(this.edges);
      this.time=0;this.steps=0;this.dt=0;this.groundCharge=0;this.groundLoss=0;this.channelHeat=0;this.halt='';
      this.initialEnergy=0;this.initialCharge=0;
      for(let i=0;i<this.nodes;i++){this.initialEnergy+=.5*this.capacitance[i]*this.voltageMagnitude**2;this.initialCharge-=this.capacitance[i]*this.voltageMagnitude;}
      // Ordered path from ground to the source-electrode body, in actual
      // arc-length, not geometric height. Used only for a selectable probe.
      const path=[];let node=target,guard=0;
      while(!seedMask[node]){
        const e=parentEdge[node];if(e<rawSeed||e<0||guard++>total)throw Error('接地点与源电极不连通');
        path.push(e);node=segments[2*e];
      }
      const indices=[],distances=[];let distance=0;
      for(const e of path)for(let k=this.parts-1;k>=0;k--){
        const idx=(e-rawSeed)*this.parts+k,len=this.lengths[idx];indices.push(idx);distances.push(distance+len/2);distance+=len;
      }
      this.mainIndices=Int32Array.from(indices);this.mainDistances=Float64Array.from(distances);this.mainLength=distance;
      this.totalLength=this.lengths.reduce((a,b)=>a+b,0);
    }
    // Choose an integer number of stable internal steps per output interval.
    setOutputInterval(interval){
      if(this.steps)throw Error('开始后不能改变积分步长');
      interval=number(interval,0,1e-12,1,'输出间隔');
      const steps=Math.max(1,Math.ceil(interval/this.maxDt));this.setDt(interval/steps);return steps;
    }
    setDt(dt){
      if(this.steps)throw Error('开始后不能改变积分步长');
      dt=number(dt,0,1e-15,this.maxDt*(1+1e-12),'积分步长');this.dt=dt;
      for(let e=0;e<this.edges;e++){
        const R=this.resistance[e]+(e===this.groundEdge?this.groundResistance:0),L=this.inductance[e],den=L+.5*dt*R;
        this.alpha[e]=(L-.5*dt*R)/den;this.beta[e]=dt/den;
      }
    }
    step(){
      if(this.halt)return {ok:false,reason:this.halt};if(!(this.dt>0))throw Error('尚未设置积分步长');
      const dt=this.dt,v=this.voltage,old=this.current,next=this.nextCurrent,net=this.net;net.fill(0);
      let channel=0,ground=0;
      for(let e=0;e<this.edges;e++){
        const a=this.from[e],b=this.to[e],voltage=v[a]-(b<0?0:v[b]);
        const current=this.alpha[e]*old[e]+this.beta[e]*voltage,mid=.5*(old[e]+current);
        if(!Number.isFinite(current)||Math.abs(current)>1e12){this.halt='回击数值安全停机；不是物理击穿判据';return {ok:false,reason:this.halt};}
        next[e]=current;net[a]+=current;if(b>=0)net[b]-=current;
        const heat=dt*this.resistance[e]*mid*mid;this.heatDelta[e]=heat;channel+=heat;
        if(e===this.groundEdge)ground=dt*this.groundResistance*mid*mid;
      }
      for(let i=0;i<this.nodes;i++){
        const value=v[i]-dt*net[i]/this.capacitance[i];
        if(!Number.isFinite(value)||Math.abs(value)>this.voltageMagnitude*1e4){this.halt='回击数值安全停机；不是物理击穿判据';return {ok:false,reason:this.halt};}
        this.nextVoltage[i]=value;
      }
      // Commit only after every candidate is finite; a safety stop preserves
      // the previous valid current, voltage, accumulated heat and clock.
      this.current=this.nextCurrent;this.nextCurrent=old;this.voltage=this.nextVoltage;this.nextVoltage=v;
      for(let e=0;e<this.edges;e++)this.heat[e]+=this.heatDelta[e];
      this.channelHeat+=channel;this.groundLoss+=ground;this.groundCharge-=dt*this.current[this.groundEdge];this.time+=dt;this.steps++;
      return {ok:true};
    }
    stats(){
      let electric=0,magnetic=0,cross=0,charge=0,power=0;
      for(let i=0;i<this.nodes;i++){const v=this.voltage[i],c=this.capacitance[i];electric+=.5*c*v*v;charge+=c*v;}
      for(let e=0;e<this.edges;e++){
        const i=this.current[e],a=this.from[e],b=this.to[e];magnetic+=.5*this.inductance[e]*i*i;
        cross+=.5*this.dt*i*(this.voltage[a]-(b<0?0:this.voltage[b]));power+=this.resistance[e]*i*i;
      }
      const stored=electric+magnetic+cross;
      return {time:this.time,steps:this.steps,groundCurrent:-this.current[this.groundEdge],groundCharge:this.groundCharge,charge,
        chargeError:charge-this.initialCharge-this.groundCharge,electric,magnetic,cross,stored,channelHeat:this.channelHeat,groundLoss:this.groundLoss,power,
        energyError:this.initialEnergy-stored-this.channelHeat-this.groundLoss,halt:this.halt};
    }
    // Write one full frame; currents are at t - dt/2, voltage at t. The
    // terminal voltage is the resistive ground drop (current is oriented from
    // source to ground); no charge is assigned to the grounded endpoint.
    capture(currents,heating,voltage,offset=0){
      for(let e=0;e<this.edges;e++){
        const a=this.from[e],b=this.to[e],I=this.current[e],vb=b<0?this.groundResistance*I:this.voltage[b];
        currents[offset+e]=I;heating[offset+e]=this.heat[e]/this.lengths[e];voltage[offset+e]=.5*(this.voltage[a]+vb);
      }
    }
  }
  return {ReturnStroke,LIGHT_SPEED,DEFAULT_PARTS,MAX_GROWTH_EDGES};
});
