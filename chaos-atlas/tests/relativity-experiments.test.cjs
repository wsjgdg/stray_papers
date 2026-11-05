'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../relativity-experiments.js');
test('guided recipes are bounded complete states with distinct physical questions',()=>{
  assert.equal(E.presets.length,5);const ids=new Set();
  for(const preset of E.presets){ids.add(preset.id);const state=E.recipe(preset.id);assert.deepEqual(E.parameters(state),state);assert.ok(preset.steps.length>20);}
  assert.equal(ids.size,5);assert.equal(E.recipe('shadow').shadowTiming,'split');assert.equal(E.recipe('shutter').shutter,1.6);assert.throws(()=>E.recipe('missing'),RangeError);
});
test('snapshot parsing whitelists fields and rejects malformed, dangerous or incompatible data',()=>{
  const input={format:'relativity-observation',schema:1,parameters:{...E.BASE,unknown:'ignored'},measurements:{current:{u:.2,v:.8,aspect:1.5,extra:'archived'},reference:null}};
  const decoded=E.parse(JSON.stringify(input));assert.deepEqual(decoded.parameters,E.BASE);assert.deepEqual(decoded.current,{u:.2,v:.8,aspect:1.5});assert.equal(decoded.reference,null);
  for(const patch of [{beta:1},{beta:NaN},{environment:'unknown'},{shadowTiming:'split',view:'geometry'},{shutter:-1},{doppler:'true'}]){
    assert.throws(()=>E.parse(JSON.stringify({...input,parameters:{...input.parameters,...patch}})));
  }
  assert.throws(()=>E.parse(JSON.stringify({...input,schema:2})));assert.throws(()=>E.parse(JSON.stringify({...input,measurements:{current:{u:9,v:0,aspect:1}}})));assert.throws(()=>E.parse('x'.repeat(1048577)));
});


test('snapshots optionally preserve a validated fixed material point and accept old schema-1 files',()=>{
  const base={format:'relativity-observation',schema:1,parameters:{...E.BASE},measurements:{current:null,reference:null}};
  assert.equal(E.parse(JSON.stringify(base)).materialPoint,null);
  const p=[0,.43,-.42],saved={...base,measurements:{...base.measurements,materialPoint:p}};
  assert.deepEqual(E.parse(JSON.stringify(saved)).materialPoint,p);
  assert.throws(()=>E.parse(JSON.stringify({...base,measurements:{materialPoint:[99,0,0]}})),/材料点/);
  assert.throws(()=>E.parse(JSON.stringify({...base,measurements:{materialPoint:[0,0,0]}})),/材料点/);
});
