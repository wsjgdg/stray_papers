/* A separate, dimensionless post-contact circuit/thermal teaching model.
 * The DBM tree defines the topology, NOT a current or a return stroke. After
 * contact, each edge becomes a lumped resistor. A voltage source with a series
 * ballast drives the unique root-to-target path. Open branches carry no DC
 * current. Per-edge heat capacity and linear cooling evolve temperature.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LightningThermal=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function number(value,fallback,min,max){value=Number(value);return Number.isFinite(value)?clamp(value,min,max):fallback;}
  function coord(d,id){const x=id%d.nx,j=(id-x)/d.nx,y=j%d.ny,z=(j-y)/d.ny;return [x,y,z];}
  class Electrothermal {
    constructor(data,options={}){
      if(!data||!data.stats||!data.stats.complete||!data.segments||data.segments.length<2||data.segments.length%2)throw Error('需要一棵已接触目标的计算树');
      this.nx=data.nx;this.ny=data.ny;this.nz=data.nz;this.count=data.nx*data.ny*data.nz;
      this.segments=Int32Array.from(data.segments);this.edges=this.segments.length/2;this.seedSegmentCount=clamp(Math.floor(Number(data.seedSegmentCount)||0),0,this.edges);this.root=this.segments[0];this.target=this.segments[this.segments.length-1];
      if(!data.mask||data.mask[this.target]!==2)throw Error('最终节点不是目标电极');
      const parent=new Int32Array(this.count);parent.fill(-1);const seen=new Uint8Array(this.count);seen[this.root]=1;
      this.lengths=new Float64Array(this.edges);this.onPath=new Uint8Array(this.edges);this.temperature=new Float64Array(this.edges);this.temperature.fill(1);
      this.power=new Float64Array(this.edges);this.currents=new Float64Array(this.edges);this.nodeVoltage=new Float64Array(this.count);
      const unit=1/(data.ny-1);
      for(let e=0;e<this.edges;e++){
        const a=this.segments[2*e],b=this.segments[2*e+1];
        if(a<0||a>=this.count||b<0||b>=this.count||!seen[a]||seen[b])throw Error('击穿树连接无效');
        seen[b]=1;parent[b]=e;const p=coord(data,a),q=coord(data,b);this.lengths[e]=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])*unit;
        if(!(this.lengths[e]>0))throw Error('零长度通道');
      }
      let p=this.target,steps=0;while(p!==this.root){const e=parent[p];if(e<0||steps++>this.edges)throw Error('目标未连接到起点');this.onPath[e]=1;p=this.segments[2*e];}
      this.voltage=number(options.voltage,2,0,5);this.cooling=number(options.cooling,.5,0,3);this.ballast=number(options.ballast,.5,.1,5);
      this.alpha=.15;this.heatCapacity=1;this.time=0;this.input=0;this.lost=0;this.halt='';this.solve();
    }
    setParameters(options={}){this.voltage=number(options.voltage,this.voltage,0,5);this.cooling=number(options.cooling,this.cooling,0,3);this.ballast=number(options.ballast,this.ballast,.1,5);this.solve();}
    resistance(e){return e<this.seedSegmentCount?0:this.lengths[e]*(1+this.alpha*Math.max(0,this.temperature[e]-1));}
    solve(){
      let resistance=0;for(let e=0;e<this.edges;e++)if(this.onPath[e])resistance+=this.resistance(e);
      this.resistanceTotal=resistance;this.current=this.voltage/(this.ballast+resistance);this.channelPower=this.current*this.current*resistance;
      this.sourcePower=this.current*this.voltage;this.ballastPower=this.current*this.current*this.ballast;this.nodeVoltage.fill(0);this.nodeVoltage[this.root]=this.current*resistance;
      let max=1;for(let e=0;e<this.edges;e++){
        const a=this.segments[2*e],b=this.segments[2*e+1],I=this.onPath[e]&&e>=this.seedSegmentCount?this.current:0,R=this.resistance(e);
        this.currents[e]=I;this.power[e]=I*I*R;this.nodeVoltage[b]=this.nodeVoltage[a]-I*R;max=Math.max(max,this.temperature[e]);
      }
      this.maxTemperature=max;
    }
    step(dt=.04){
      if(this.halt)return {ok:false,reason:this.halt};dt=number(dt,.04,.0001,.08);
      // Explicit bounded update; accumulators use the same pre-step quantities
      // so thermal energy = deposited energy - cooling up to roundoff.
      this.solve();let heat=0,lost=0;const next=new Float64Array(this.edges);
      for(let e=0;e<this.edges;e++){
        const capacity=this.heatCapacity*this.lengths[e],loss=this.cooling*capacity*(this.temperature[e]-1);
        next[e]=this.temperature[e]+dt*(this.power[e]-loss)/capacity;heat+=this.power[e]*dt;lost+=loss*dt;
        if(!Number.isFinite(next[e])||next[e]>20||next[e]<.999999){this.halt='达到无量纲温度安全上限；不是物理击穿判据';return {ok:false,reason:this.halt};}
      }
      this.temperature.set(next);this.input+=heat;this.lost+=lost;this.time+=dt;this.solve();return {ok:true};
    }
    stats(){let stored=0;for(let e=0;e<this.edges;e++)stored+=this.heatCapacity*this.lengths[e]*(this.temperature[e]-1);
      return {time:this.time,current:this.current,channelPower:this.channelPower,sourcePower:this.sourcePower,ballastPower:this.ballastPower,resistance:this.resistanceTotal,maxTemperature:this.maxTemperature,stored,input:this.input,lost:this.lost,budget:stored-this.input+this.lost,halt:this.halt};}
  }
  return {Electrothermal};
});
