/*
 * Boundary proof for arbitrary-state encoders built from faultable Clifford gates.
 * Before the first input/ancilla coupling, only one qubit carries |psi> and the
 * ancilla is a known Pauli eigenstate. Immediately after a first CNOT, the
 * two-qubit subspace has one stabilizer and one logical qubit. The allowed
 * two-qubit Pauli fault set contains representatives of both logical Paulis.
 * These faults have zero syndrome and cannot be corrected without knowing |psi>.
 */
import assert from 'node:assert/strict';
const parity = n => { let p = 0; for (; n; n &= n - 1) p ^= 1; return p; };
const bit = q => 1 << q;
function conjugateCnot({x,z}, c, t){
  const C=bit(c),T=bit(t);
  if(x&C)x^=T;
  if(z&T)z^=C;
  return {x,z};
}
const anticommutes=(a,b)=>!!parity((a.x&b.z)^(a.z&b.x));
const text=p=>`X:${p.x.toString(2).padStart(2,'0')} Z:${p.z.toString(2).padStart(2,'0')}`;
let rows=0;
for(const input of [0,1])for(const ancillaBasis of ['Z','X'])for(const inputIsControl of [true,false]){
  const ancilla=1-input, control=inputIsControl?input:ancilla, target=inputIsControl?ancilla:input;
  const stab0={x:ancillaBasis==='X'?bit(ancilla):0,z:ancillaBasis==='Z'?bit(ancilla):0};
  const stab=conjugateCnot(stab0,control,target);
  const logicalX=conjugateCnot({x:bit(input),z:0},control,target);
  const logicalZ=conjugateCnot({x:0,z:bit(input)},control,target);
  assert.equal(anticommutes(stab,logicalX),false);
  assert.equal(anticommutes(stab,logicalZ),false);
  assert.notDeepEqual(logicalX,stab);
  assert.notDeepEqual(logicalZ,stab);
  assert.notDeepEqual(logicalX,{x:0,z:0});
  assert.notDeepEqual(logicalZ,{x:0,z:0});
  /* The fault set after a two-qubit gate includes every nonidentity Pauli on
     its two outputs, so these exact logical representatives are fault sites. */
  const support=bit(input)|bit(ancilla);
  assert.equal((logicalX.x|logicalX.z)&~support,0);
  assert.equal((logicalZ.x|logicalZ.z)&~support,0);
  console.log(`input=${input} ancilla=|${ancillaBasis}> orientation=${inputIsControl?'input->ancilla':'ancilla->input'} S(${text(stab)}), fault-XL(${text(logicalX)}), fault-ZL(${text(logicalZ)}), syndrome=0`);
  rows++;
}
assert.equal(rows,8);
console.log('FIRST-COUPLING NO-GO PROOF PASS: every tested first-CNOT orientation has accepted single-gate Pauli faults equal to nontrivial logical operators.');
