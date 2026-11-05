'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Ising3D}=require('../ising-model.js'),{interfaces}=require('../ising-analysis.js');
function near(a,b,t=1e-12){assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);}

test('aligned and half-domain states have the exact periodic interface sites and bonds',()=>{
  for(const n of [4,12,20,24]){
    let m=new Ising3D({size:n,initial:'up'}),a=interfaces(n,m.spins);
    assert.equal(a.sites,0);assert.equal(a.bonds,0);assert.ok(a.mask.every(v=>v===0));
    m=new Ising3D({size:n,initial:'domains'});a=interfaces(n,m.spins);
    assert.equal(a.sites,4*n*n);assert.equal(a.bonds,2*n*n);near(a.siteFraction,4/n);near(a.bondFraction,2/(3*n));
    for(let i=0;i<m.count;i++){const x=i%n;assert.equal(a.mask[i],Number([0,n/2-1,n/2,n-1].includes(x)));assert.equal(a.opposite[i],a.mask[i]);}
  }
});

test('a single reversed spin produces seven boundary sites and six oppositely aligned bonds',()=>{
  const n=8,m=new Ising3D({size:n,initial:'up'});m.flip(0);const a=interfaces(n,m.spins);
  assert.equal(a.sites,7);assert.equal(a.bonds,6);assert.equal(a.opposite[0],6);
  for(const i of [1,n-1,n,n*(n-1),n*n,n*n*(n-1)])assert.equal(a.mask[i],1);
  near(a.bondFraction,(1-m.stats().neighborCorrelation)/2);
});

test('interface statistics use the full periodic lattice and agree with neighbour correlation after real sweeps',()=>{
  for(const n of [2,3,8,12])for(const initial of ['random','up','domains']){
    const m=new Ising3D({size:n,initial,seed:117,temperature:4.4,field:.2});m.sweep(20);const a=interfaces(n,m.spins);
    near(a.bondFraction,(1-m.stats().neighborCorrelation)/2,1e-12);
    let count=0;for(let i=0;i<m.count;i++){assert.equal(a.opposite[i],(6-m.spins[i]*m.neighborSum(i))/2);assert.equal(a.mask[i],Number(a.opposite[i]>0));count+=a.mask[i];}
    assert.equal(a.sites,count);assert.ok(a.siteFraction>=0&&a.siteFraction<=1);
  }
});

test('invalid dimensions, spin counts and spin values are rejected',()=>{
  assert.throws(()=>interfaces(1,new Int8Array(1)));assert.throws(()=>interfaces(33,new Int8Array(33**3)));assert.throws(()=>interfaces(4,new Int8Array(3)));
  const spins=new Int8Array(64).fill(1);spins[7]=0;assert.throws(()=>interfaces(4,spins));
});
