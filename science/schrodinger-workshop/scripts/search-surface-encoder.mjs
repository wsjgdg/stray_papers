/* Experimental search over linear Clifford decompositions; never a production test. */
import { scBuild } from '../src/physics/surfacecode.js';
const B=q=>1n<<BigInt(q);
const parity=v=>{let p=0;while(v){p^=Number(v&1n);v>>=1n;}return p;};
function rankBasis(values){const piv=new Map(),out=[];for(const value of values){let v=value;for(let q=127;q>=0;q--)if(v&B(q)){if(piv.has(q))v^=piv.get(q);else{piv.set(q,v);out.push(v);break;}}}return out;}
function shuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeRng(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)>>>0)/4294967296;}
function randomIndependentCompletion(cols,n,rng){
  let tries=0;
  while(cols.length<n&&tries++<n*n*30){
    let v=0n;const w=1+Math.floor(rng()*Math.min(6,n));
    for(const q of shuffle(Array.from({length:n},(_,i)=>i),rng).slice(0,w))v^=B(q);
    if(rankBasis([...cols,v]).length>cols.length)cols.push(v);
  }
  if(cols.length<n)for(let q of shuffle(Array.from({length:n},(_,i)=>i),rng)){const v=B(q);if(rankBasis([...cols,v]).length>cols.length)cols.push(v);if(cols.length===n)break;}
  return cols;
}
function synth(code,seed){
  const rng=makeRng(seed),xBasis=shuffle(rankBasis(code.X.map(s=>s.mask)),rng);
  const cols=randomIndependentCompletion([code.xl,...xBasis],code.n,rng);
  const rows=Array.from({length:code.n},(_,r)=>cols.reduce((m,c,j)=>c&B(r)?m|B(j):m,0n));
  const reduce=[],order=Array.from({length:code.n},(_,q)=>q);
  for(let k=0;k<code.n;k++){
    const col=order[k];let p=k;while(p<code.n&&!(rows[p]&B(col)))p++;
    if(p===code.n)return null;
    if(p!==k){[rows[p],rows[k]]=[rows[k],rows[p]];reduce.push({swap:[p,k]});}
    for(let r=0;r<code.n;r++)if(r!==k&&(rows[r]&B(col))){rows[r]^=rows[k];reduce.push({cx:[k,r]});}
  }
  const gates=[];for(let q=1;q<=xBasis.length;q++)gates.push({h:q});
  for(const op of reduce.reverse())if(op.swap){const[a,t]=op.swap;gates.push({c:a,t},{c:t,t:a},{c:a,t});}else gates.push({c:op.cx[0],t:op.cx[1]});
  return {gates,xBasis,cols};
}
function conjugate(frame,g){
  if(g.h!==undefined){const m=B(g.h),x=!!(frame.x&m),z=!!(frame.z&m);if(x!==z){if(x)frame.x^=m;else frame.x|=m;if(z)frame.z^=m;else frame.z|=m;}}
  else{const c=B(g.c),t=B(g.t);if(frame.x&c)frame.x^=t;if(frame.z&t)frame.z^=c;}
}
function applyPauli(f,q,p){const m=B(q);if(p==='X'||p==='Y')f.x^=m;if(p==='Z'||p==='Y')f.z^=m;}
function inSpan(value,gens){return rankBasis([...gens,value]).length===rankBasis(gens).length;}
function validate(code,e){
  const apply=(x,z)=>{const f={x,z};for(const g of e.gates)conjugate(f,g);return f;};
  if(apply(B(0),0n).x!==code.xl)return false;
  const iz=apply(0n,B(0));if(iz.x!==0n||code.X.some(s=>parity(s.mask&iz.z))||parity(code.xl&iz.z)!==1)return false;
  for(let q=1;q<=e.xBasis.length;q++){const f=apply(0n,B(q));if(f.x!==e.cols[q]||f.z!==0n||!code.X.some(s=>s.mask===f.x))return false;}
  for(let q=e.xBasis.length+1;q<code.n;q++){const f=apply(0n,B(q));if(f.x!==0n||!inSpan(f.z,code.Z.map(s=>s.mask)))return false;}
  return true;
}
function audit(code,seed){
  const e=synth(code,seed);if(!e||!validate(code,e))return null;const faults=[];
  for(let q=1;q<code.n;q++)faults.push({prep:q});
  let firstCoupling=e.gates.findIndex(g=>g.c===0||g.t===0);if(firstCoupling<0)return null;
  e.gates.forEach((g,i)=>{if(g.h!==undefined)for(const p of['X','Y','Z'])faults.push({gate:i,p});else for(const a of['I','X','Y','Z'])for(const z of['I','X','Y','Z'])if(a!=='I'||z!=='I')faults.push({gate:i,p:a+z});
    /* One-qubit idle faults on lines not occupied by this operation. The input
       line q=0 is trusted only up to its first data-ancilla coupling. */
    const active=new Set(g.h!==undefined?[g.h]:[g.c,g.t]);
    for(let q=0;q<code.n;q++)if(!active.has(q)&&(q!==0||i>=firstCoupling))for(const p of['X','Y','Z'])faults.push({idle:i,q,p});
  });
  const groups=new Map([['0,0',{cls:'0,0',count:0,amb:false}]]);
  for(const f of faults){const frame={x:0n,z:0n};if(f.prep!==undefined)applyPauli(frame,f.prep,f.prep<=e.xBasis.length?'Z':'X');
    for(let i=0;i<e.gates.length;i++){conjugate(frame,e.gates[i]);if(i===f.gate){const g=e.gates[i];if(g.h!==undefined)applyPauli(frame,g.h,f.p);else{applyPauli(frame,g.c,f.p[0]);applyPauli(frame,g.t,f.p[1]);}}if(f.idle===i)applyPauli(frame,f.q,f.p);}
    const sx=code.xg.stab.reduce((m,s,i)=>parity(s.mask&frame.x)?m|1<<i:m,0),sz=code.zg.stab.reduce((m,s,i)=>parity(s.mask&frame.z)?m|1<<i:m,0);
    const cls=`${parity(frame.x&code.zl)},${parity(frame.z&code.xl)}`,key=`${sx},${sz}`;let g=groups.get(key);if(!g)groups.set(key,g={cls,count:0,amb:false});else if(g.cls!==cls)g.amb=true;g.count++;
  }
  const ambiguous=[...groups.values()].filter(g=>g.amb),bad=ambiguous.reduce((n,g)=>n+g.count,0);
  return {seed,gates:e.gates.length,faults:faults.length,signatures:groups.size,ambiguous:ambiguous.length,bad};
}
const rounds=Number(process.argv[2]||3000);
for(const d of[3,5]){const code=scBuild(d);let best=null;for(let s=1;s<=rounds;s++){const r=audit(code,s+d*100000);if(r&&(!best||r.bad<best.bad||(r.bad===best.bad&&r.gates<best.gates)))best=r;if(r?.bad===0)break;}console.log(`d=${d} samples=${rounds} best=${JSON.stringify(best)}`);}
