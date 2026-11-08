// 复刻 particle-life.html 中矩阵"手动改值 → 物理读取"的整条链路（与原代码同构），做独立验证。
function makeMatrix(kind,n){
  const m=[];
  for(let i=0;i<n;i++)m[i]=new Array(n).fill(0);
  if(kind==='cluster'){ for(let i=0;i<n;i++)for(let j=0;j<n;j++)m[i][j]=(i===j)?-0.4:+(Math.random()*0.7+0.2).toFixed(2); }
  return m;
}
const G={species:5};
let nodes, edges;
function buildDefaultGraph(){
  nodes=[]; edges=[]; let nid=0;
  const add=(type,params)=>{const n={id:'n'+(++nid),type,params:params||{}};nodes.push(n);return n;};
  const src=add('particles',{count:3000,species:5});
  const matrix=add('matrix',{preset:'cluster',n:5,radius:90,m:makeMatrix('cluster',5)});
  add('damping',{friction:0.10}); add('render',{tail:0.88});
  for(const n of nodes){ if(n.type!=='particles'&&n.type!=='render'){ edges.push({from:src.id,to:n.id}); edges.push({from:n.id,to:'n3'}); } }
  for(const n of nodes){ if(n.type==='matrix'||n.type==='damping') n.enabled=true; }
  return matrix;
}
function reachableSet(){
  const src=nodes.find(z=>z.type==='particles'); const seen=new Set(); if(!src)return seen;
  seen.add(src.id); const st=[src.id];
  while(st.length){ const c=st.pop(); for(const e of edges){ if(e.from===c && !seen.has(e.to)){ seen.add(e.to); st.push(e.to);} } }
  return seen;
}
function activeBehaviors(){
  const seen=reachableSet(); const set=new Set();
  for(const n of nodes){ if(n.type!=='particles'&&n.type!=='render'&&seen.has(n.id)&&n.enabled!==false) set.add(n.id); }
  return set;
}
function collectBehaviors(){
  const active=activeBehaviors(); const act={};
  for(const id of active){ const z=nodes.find(z=>z.id===id); if(z)act[z.type]=z; }
  const has=k=>!!act[k];
  return { hasMatrix:has('matrix'), mat:act.matrix?act.matrix.params.m:null };
}
// 模拟 gpuStep 内的矩阵打包（L1154-1156 同构）
function packMatrix(b){
  const nn=b.mat?b.mat.length:0; const arr=new Float32Array(52); arr.fill(0);
  if(b.hasMatrix && b.mat){ for(let i=0;i<nn;i++)for(let j=0;j<nn;j++) arr[i*nn+j]=b.mat[i][j]; }
  return {arr,nn};
}
// 模拟点击矩阵格子 (L1930 同构)：p.m[i][j] +0.34 循环
function clickCell(p,i,j){
  let v=p.m[i][j]+0.34; if(v>1.01)v=-1; p.m[i][j]=+v.toFixed(2); return v;
}

let pass=true; const log=(ok,msg)=>{ console.log((ok?'PASS ':'FAIL ')+msg); if(!ok)pass=false; };

// ---- 场景1：默认图，手动改格子 ----
const M=buildDefaultGraph();
const before=M.params.m[1][2];
const v=clickCell(M.params,1,2);
const b=collectBehaviors();
const {arr,nn}=packMatrix(b);
log(b.hasMatrix===true,'默认场景下 matrix 行为被 activeBehaviors 纳入 (hasMatrix=true)');
log(b.mat===M.params.m,'collectBehaviors().mat 与编辑目标 p.m 是同一引用');
log(Math.abs(arr[1*nn+2]-v)<1e-3,'GPU 打包数组 [1][2] 含手动新值 '+v+' (Float32 精度内一致)');
log(arr[1*nn+2]!==before || before===-1,'GPU 打包数组 [1][2] 已偏离旧值 '+before+' (除非恰好相等)');

// ---- 场景2：断开 matrix 连线（用户误操作/删除边） ----
edges=edges.filter(e=>!(e.from===M.id||e.to===M.id));
const b2=collectBehaviors();
log(b2.hasMatrix===false,'断线后 matrix 不在 reachableSet → hasMatrix=false（面板仍照常可编辑，物理完全忽略矩阵）');
const {arr:arr2}=packMatrix(b2);
let nonzero=0; for(let k=0;k<arr2.length;k++) if(arr2[k]!==0)nonzero++;
log(nonzero===0,'断线时 GPU 矩阵全 0，手动修改对物理零影响 → 表现为"改了不起作用"');

console.log('\n==== '+(pass?'ALL PASS — 代码逻辑链正确':'SOME FAILED')+' ====');
