'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../crystal-model.js');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} ± ${t}`);
const vecdot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function degree(model,element){return [...new Set(model.sites.map((s,i)=>s.element===element?model.neighbors[i].length:null).filter(x=>x!==null))];}
function count(model,element){return model.sites.filter(s=>s.element===element).length;}

test('fourteen Bravais lattices cover seven families and center multiplicities',()=>{
  assert.equal(C.BRAVAIS.length,14);assert.equal(new Set(C.BRAVAIS.map(x=>x.id)).size,14);assert.equal(new Set(C.BRAVAIS.map(x=>x.family)).size,7);
  for(const b of C.BRAVAIS){const m=C.build(C.preset(b.id));assert.equal(m.sites.length,{P:1,C:2,I:2,F:4}[b.center]);assert.ok(m.nearest>0);assert.ok(m.neighbors.every(a=>a.length>0));}
});

test('direct and reciprocal vectors are dual for skew triclinic cells',()=>{
  for(const id of ['aP','mC','oF','hP','hR','cF']){const m=C.build(C.preset(id)),{A,B,C:cc,reciprocal}=m.vectors,axes=[A,B,cc];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(vecdot(axes[i],reciprocal[j]),Number(i===j));assert.ok(m.volume>0);}
  const cubic=C.build(C.preset('cP'));near(C.reflection(cubic,1,1,1).d,1/Math.sqrt(3));
});

test('simple, body-centered and face-centered cubic first shells match analytic geometry',()=>{
  for(const [id,n,d,z] of [['cP',1,1,6],['cI',2,Math.sqrt(3)/2,8],['cF',4,1/Math.sqrt(2),12]]){
    const m=C.build(C.preset(id),1.001);assert.equal(m.sites.length,n);near(m.nearest,d);assert.ok(m.neighbors.every(a=>a.length===z));
    for(let i=0;i<m.sites.length;i++)for(const e of m.neighbors[i]){const reverse=m.neighbors[e.site].find(r=>r.site===i&&r.offset.every((x,k)=>x===-e.offset[k]));assert.ok(reverse);near(reverse.distance,e.distance);}
  }
});

test('HCP, diamond, graphite and hexagonal diamond have physically expected ideal first shells',()=>{
  for(const [id,element,z,d] of [['hcp','Mg',12,1],['diamond','C',4,Math.sqrt(3)/4],['graphite','C',3,1/Math.sqrt(3)],['hexdiamond','C',4,Math.sqrt(3/8)]]){
    const m=C.build(C.preset(id),1.001);near(m.nearest,d,1e-8);assert.deepEqual(degree(m,element),[z],id);
  }
});

test('compound prototypes have correct stoichiometry and ideal nearest-neighbour geometry',()=>{
  for(const [id,counts,degrees] of [
    ['nacl',{Na:4,Cl:4},{Na:6,Cl:6}],['cscl',{Cs:1,Cl:1},{Cs:8,Cl:8}],
    ['zincblende',{Zn:4,S:4},{Zn:4,S:4}],['wurtzite',{Zn:2,S:2},{Zn:4,S:4}],
    ['caf2',{Ca:4,F:8},{Ca:8,F:4}],['li2o',{O:4,Li:8},{O:8,Li:4}],
    ['rutile',{Ti:2,O:4},{Ti:6,O:3}],['perovskite',{Sr:1,Ti:1,O:3},{Sr:0,Ti:6,O:2}],
    ['mos2',{Mo:2,S:4},{Mo:6,S:3}]
  ]){
    const m=C.build(C.preset(id),1.08);for(const [e,n] of Object.entries(counts))assert.equal(count(m,e),n,`${id} ${e}`);for(const [e,z] of Object.entries(degrees))assert.deepEqual(degree(m,e),[z],`${id} ${e}`);
  }
});

test('CsCl is a primitive cubic lattice plus two distinct basis atoms, not a body-centered Bravais lattice',()=>{
  const p=C.preset('cscl'),m=C.build(p);assert.equal(p.bravais,'cP');assert.equal(p.center,'P');assert.deepEqual(m.sites.map(s=>s.element),['Cs','Cl']);
  assert.ok(m.neighbors[0].every(n=>m.sites[n.site].element==='Cl'));assert.ok(m.neighbors[1].every(n=>m.sites[n.site].element==='Cs'));
});

test('every named prototype is finite, has distinct periodic sites and can be replicated',()=>{
  assert.ok(C.PROTOTYPES.length>=15);
  for(const p of C.PROTOTYPES){const m=C.build(C.preset(p.id)),s=C.supercell(m,2);assert.equal(s.actual,8*m.sites.length);assert.equal(s.atoms.length,s.actual+s.ghosts);assert.ok(s.edges.length>0,p.id);for(const e of s.edges){assert.ok(e.a<e.b);const a=s.atoms[e.a].cart,b=s.atoms[e.b].cart;near(Math.hypot(...a.map((x,i)=>x-b[i])),e.distance,1e-8);}}
});

test('boundary atoms are visual periodic copies and are not counted as independent cell sites',()=>{
  const m=C.build(C.preset('cP'),1.001),one=C.supercell(m,1),two=C.supercell(m,2);
  assert.equal(one.actual,1);assert.equal(one.ghosts,7);assert.equal(one.atoms.length,8);assert.equal(one.edges.length,12);
  assert.equal(two.actual,8);assert.equal(two.ghosts,19);assert.equal(two.atoms.length,27);assert.equal(two.edges.length,54);
  assert.equal(m.neighbors[0].length,6);
});

test('structure factors reproduce BCC and FCC reflection selection rules',()=>{
  const bcc=C.build(C.preset('cI')),fcc=C.build(C.preset('cF'));
  for(let h=-3;h<=3;h++)for(let k=-3;k<=3;k++)for(let l=-3;l<=3;l++){
    if(!h&&!k&&!l)continue;const bi=C.reflection(bcc,h,k,l).intensity,fi=C.reflection(fcc,h,k,l).intensity;
    near(bi,(Math.abs(h+k+l)%2===0)?4:0,1e-9);const parity=[h,k,l].map(v=>Math.abs(v)%2);near(fi,parity.every(x=>x===parity[0])?16:0,1e-9);
  }
});

test('binary scattering weights distinguish an ordered CsCl basis from a monatomic BCC lattice',()=>{
  const m=C.build(C.preset('cscl'));near(C.reflection(m,1,0,0,'equal').intensity,0);near(C.reflection(m,1,0,0,'z').intensity,(55-17)**2);near(C.reflection(m,2,0,0,'z').intensity,(55+17)**2);
});

test('structure-factor intensity is invariant under a common change of fractional origin',()=>{
  const p=C.preset('perovskite'),m=C.build(p),r=C.reflection(m,1,2,3,'z');for(const a of p.basis){a.x=(a.x+.137)%1;a.y=(a.y+.291)%1;a.z=(a.z+.411)%1;}
  const moved=C.build(p),s=C.reflection(moved,1,2,3,'z');near(r.intensity,s.intensity,1e-8);near(r.d,s.d);
});

test('cell, basis, reflection and complexity validation is explicit and non-mutating',()=>{
  const p=C.preset('cP'),before=JSON.stringify(p);for(const change of [x=>x.cell=[1,1,1,45,45,130],x=>x.cell[0]=0,x=>x.basis[0].x=1,x=>x.basis[0].element='NotAnElement',x=>x.center='Q',x=>x.basis.push({...x.basis[0]})]){const bad=structuredClone(p);change(bad);assert.throws(()=>C.build(bad));}
  assert.equal(JSON.stringify(p),before);const m=C.build(p);assert.throws(()=>C.reflection(m,0,0,0));assert.throws(()=>C.reflection(m,9,0,0));assert.throws(()=>C.supercell(m,5));assert.throws(()=>C.build(p,1.9));
});

test('skew periodic neighbor shells agree with an independent wide brute-force image search',()=>{
  // Includes images more than one cell away: componentwise minimum-image wrapping fails here.
  for(const cell of [[.45,3,2,90,90,35],[.5,4,3,75,105,45],[1,3,1.7,110,110,50]]){
    const p=C.preset('aP');p.cell=cell;p.basis=[{element:'Na',x:0,y:0,z:0},{element:'Cl',x:.42,y:.72,z:.33},{element:'O',x:.87,y:.02,z:.51}];
    const m=C.build(p,1.7),expected=Array.from({length:m.sites.length},()=>[]);let nearest=Infinity;
    for(let i=0;i<m.sites.length;i++)for(let j=0;j<m.sites.length;j++)for(let x=-10;x<=10;x++)for(let y=-10;y<=10;y++)for(let z=-10;z<=10;z++){
      if(i===j&&!x&&!y&&!z)continue;
      const f=m.sites[j].fraction.map((v,k)=>v-m.sites[i].fraction[k]+[x,y,z][k]),q=C.point(m.vectors,f),d=Math.hypot(...q);
      nearest=Math.min(nearest,d);if(d<=m.cutoff*(1+1e-9))expected[i].push([j,x,y,z].join(','));
    }
    near(m.nearest,nearest,1e-10);
    for(let i=0;i<expected.length;i++)assert.deepEqual(m.neighbors[i].map(n=>[n.site,...n.offset].join(',')).sort(),expected[i].sort());
    assert.ok(m.neighbors.flat().some(n=>n.offset.some(v=>Math.abs(v)>1)),`expected a nontrivial periodic image for ${cell}`);
  }
});

test('all chemical symbols have valid, distinct deterministic custom-element colors',()=>{
  assert.equal(C.ELEMENTS.length,118);assert.equal(new Set(C.ELEMENTS).size,118);
  for(const e of C.ELEMENTS){assert.equal(C.validElement(e),true);assert.match(C.color(e),/^#[0-9a-f]{6}$/i);assert.equal(C.weight(e,'z'),C.Z[e]);}
  assert.equal(new Set(C.ELEMENTS.map(C.color)).size,118);assert.equal(C.validElement('X2'),true);assert.equal(C.validElement('x2'),false);
});

test('realistic low-symmetry and polymorph presets cover all seven families with the intended compositions',()=>{
  const families=new Set(C.PROTOTYPES.map(p=>C.preset(p.id).family));assert.deepEqual([...families].sort(),['三方','三斜','六方','单斜','四方','正交','立方'].sort());
  for(const [id,counts,degrees] of [
    ['blackp',{P:8},{P:[3]}],['arsenic',{As:2},{As:[3]}],['tehp',{Te:4},{Te:[3]}],['cfhp',{Cf:4},{Cf:[2]}],
    ['anatase',{Ti:4,O:8},{Ti:[6],O:[3]}],['feas',{Fe:4,As:4},{Fe:[6],As:[6]}],['pyrite',{Fe:4,S:8},{Fe:[6],S:[4]}],
    ['baddeleyite',{Zr:4,O:8},{Zr:[5],O:[2,3]}],['albite',{Na:2,Al:2,Si:6,O:16},{Na:[0],Al:[0],Si:[4],O:[1,2]}]
  ]){
    const m=C.build(C.preset(id));for(const [e,n] of Object.entries(counts))assert.equal(count(m,e),n,`${id} ${e}`);
    for(const [e,z] of Object.entries(degrees))assert.deepEqual(degree(m,e).sort(),z.sort(),`${id} ${e}`);
  }
  const rutile=C.build(C.preset('rutile')),anatase=C.build(C.preset('anatase'));
  assert.equal(rutile.sites.length,6);assert.equal(anatase.sites.length,12);assert.equal(rutile.config.center,'P');assert.equal(anatase.config.center,'I');
  const albite=C.build(C.preset('albite'));assert.equal(albite.config.center,'P');assert.equal(albite.sites.length,26);
  for(const a of albite.sites){const inverse=a.fraction.map(x=>(1-x)%1);assert.ok(albite.sites.some(b=>b.element===a.element&&b.fraction.every((v,i)=>Math.abs(v-inverse[i])<1e-8)));}
});

test('common metal, quartz and spinel prototypes use physical bases, not just different colors',()=>{
  assert.equal(C.PROTOTYPES.length,32);
  for(const [id,family,counts,degrees] of [
    ['alpha-iron','立方',{Fe:2},{Fe:[8]}],['copper','立方',{Cu:4},{Cu:[12]}],
    ['beta-tin','四方',{Sn:4},{Sn:[6]}],['quartz','三方',{Si:3,O:6},{Si:[4],O:[2]}],
    ['spinel','立方',{Mg:8,Al:16,O:32},{Mg:[4],Al:[6],O:[4]}]
  ]){
    const m=C.build(C.preset(id));assert.equal(m.config.family,family,id);
    for(const [e,n] of Object.entries(counts))assert.equal(count(m,e),n,`${id} ${e}`);
    for(const [e,z] of Object.entries(degrees))assert.deepEqual(degree(m,e),z,`${id} ${e}`);
  }
  // Trigonal α-quartz uses a hexagonal-coordinate primitive lattice and a
  // screw-symmetric basis: 00l vanishes for l not divisible by 3.
  const quartz=C.build(C.preset('quartz'));assert.equal(quartz.config.bravais,'hP');
  near(C.reflection(quartz,0,0,1,'z').intensity,0);near(C.reflection(quartz,0,0,2,'z').intensity,0);assert.ok(C.reflection(quartz,0,0,3,'z').intensity>1);
  // F centering and the basis of ordered spinel both contribute extinctions.
  const spinel=C.build(C.preset('spinel'));near(C.reflection(spinel,1,0,0,'z').intensity,0);near(C.reflection(spinel,2,0,0,'z').intensity,0);assert.ok(C.reflection(spinel,4,0,0,'z').intensity>1);
  assert.equal(C.supercell(spinel,4).actual,3584);
});
