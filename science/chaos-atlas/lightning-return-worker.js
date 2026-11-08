'use strict';
// Independent and cancellable precomputation of a branched RLC return-stroke
// example. Each time slice contains actual numerical states; the UI can seek or
// replay them without inventing a moving highlight. Terminating this Worker
// cancels a calculation without changing the DBM or the separate DC circuit.
importScripts('lightning-return.js?v=20261031-30');
const ReturnModel=self.LightningReturn;
let running=false;
self.onmessage=function(event){
  const request=event.data||{};if(request.type!=='compute'||running)return;running=true;
  let model,frames,period,perFrame,currents,heating,voltages,times,metrics,frame=0,lastReport=0;
  const keys=['groundCurrent','groundCharge','charge','chargeError','electric','magnetic','stored','channelHeat','groundLoss','energyError','power'];
  function error(reason){running=false;self.postMessage({kind:'return-error',message:String(reason&&reason.message||reason)});}
  try{
    model=new ReturnModel.ReturnStroke(request.tree,request.options||{});
    const duration=Number(request.duration),count=request.frames===undefined?241:Number(request.frames);
    if(!Number.isFinite(duration)||duration<1e-6||duration>200e-6||!Number.isInteger(count)||count<2||count>241)throw Error('回击时长或采样数量超出范围');
    frames=count;period=duration/(frames-1);perFrame=model.setOutputInterval(period);
    const cells=frames*model.edges;if(cells>4000000)throw Error('回击采样超过内存预算');
    currents=new Float32Array(cells);heating=new Float32Array(cells);voltages=new Float32Array(cells);times=new Float64Array(frames);
    metrics={};for(const key of keys)metrics[key]=new Float64Array(frames);
    self.postMessage({kind:'return-progress',frame:0,total:frames-1,edges:model.edges,dt:model.dt,internalSteps:perFrame*(frames-1)});
  }catch(e){error(e);return;}
  function record(){
    const offset=frame*model.edges;model.capture(currents,heating,voltages,offset);const s=model.stats();times[frame]=s.time;
    for(const key of keys)metrics[key][frame]=s[key];
  }
  function chunk(){
    try{
      const start=performance.now();let iterations=0;
      while(frame<frames&&(iterations===0||performance.now()-start<18)){
        if(frame>0)for(let k=0;k<perFrame;k++){const r=model.step();if(!r.ok)throw Error(r.reason);}
        record();frame++;iterations++;
      }
      if(frame<frames){
        const now=performance.now();if(now-lastReport>120){lastReport=now;self.postMessage({kind:'return-progress',frame:frame-1,total:frames-1,edges:model.edges,dt:model.dt,internalSteps:perFrame*(frames-1)});}
        setTimeout(chunk,0);return;
      }
      const result={kind:'return-result',frames,edges:model.edges,parts:model.parts,seedSegmentCount:model.seedSegmentCount,
        dt:model.dt,dtMax:model.maxDt,perFrame,times,currents,heating,voltages,metrics,
        mainIndices:model.mainIndices,mainDistances:model.mainDistances,mainLength:model.mainLength,totalLength:model.totalLength,
        initialEnergy:model.initialEnergy,initialCharge:model.initialCharge,waveSpeed:model.waveSpeed,impedance:model.impedance,
        options:{height:model.height,voltage:model.voltageMagnitude,resistance:model.rPerM,inductance:model.lPerM,capacitance:model.cPerM,groundResistance:model.groundResistance}};
      const transfer=[times.buffer,currents.buffer,heating.buffer,voltages.buffer,model.mainIndices.buffer,model.mainDistances.buffer,...keys.map(key=>metrics[key].buffer)];
      running=false;self.postMessage(result,transfer);
    }catch(e){error(e);}
  }
  chunk();
};
