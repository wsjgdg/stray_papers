/* Periodic crystal geometry and point-scatterer structure factors.
 * These idealized structures are not molecular dynamics or material predictions. */
(function(root,factory){
  'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CrystalGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const ELEMENTS=('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  const Z=Object.fromEntries(ELEMENTS.map((symbol,i)=>[symbol,i+1]));
  const CENTERS={P:[[0,0,0]],C:[[0,0,0],[.5,.5,0]],I:[[0,0,0],[.5,.5,.5]],F:[[0,0,0],[0,.5,.5],[.5,0,.5],[.5,.5,0]]};
  const COLORS={X1:'#f5c58e',X2:'#7cddd5',X3:'#cf9fe8',C:'#c7d2d2',Si:'#e3bf91',Al:'#8cb4ed',Fe:'#e9a66a',Mg:'#f2b77e',Na:'#c9a3f0',Cl:'#98d683',Cs:'#edae80',Zn:'#85c6f0',S:'#f2d273',O:'#f58f84',F:'#9bd7bc',Ca:'#a9a1ef',Li:'#e9a4cc',Sr:'#f5c18a',Ti:'#74c8e7',Ni:'#87ced1',As:'#dda1cd',B:'#f1bf8e',N:'#8ca6ef',Mo:'#8bc8d5'};
  const atom=(element,x=0,y=0,z=0)=>({element,x,y,z});
  const BRAVAIS=[
    {id:'cP',name:'简单立方 P',family:'立方',center:'P',cell:[1,1,1,90,90,90]},
    {id:'cI',name:'体心立方 I',family:'立方',center:'I',cell:[1,1,1,90,90,90]},
    {id:'cF',name:'面心立方 F',family:'立方',center:'F',cell:[1,1,1,90,90,90]},
    {id:'tP',name:'简单四方 P',family:'四方',center:'P',cell:[1,1,1.4,90,90,90]},
    {id:'tI',name:'体心四方 I',family:'四方',center:'I',cell:[1,1,1.4,90,90,90]},
    {id:'oP',name:'简单正交 P',family:'正交',center:'P',cell:[1,1.25,1.55,90,90,90]},
    {id:'oC',name:'底心正交 C',family:'正交',center:'C',cell:[1,1.25,1.55,90,90,90]},
    {id:'oI',name:'体心正交 I',family:'正交',center:'I',cell:[1,1.25,1.55,90,90,90]},
    {id:'oF',name:'面心正交 F',family:'正交',center:'F',cell:[1,1.25,1.55,90,90,90]},
    {id:'hP',name:'六方 P',family:'六方',center:'P',cell:[1,1,1.4,90,90,120]},
    {id:'hR',name:'菱方 R（原胞表示）',family:'三方',center:'P',cell:[1,1,1,75,75,75]},
    {id:'mP',name:'简单单斜 P',family:'单斜',center:'P',cell:[1,1.2,1.5,90,105,90]},
    {id:'mC',name:'底心单斜 C',family:'单斜',center:'C',cell:[1,1.2,1.5,90,105,90]},
    {id:'aP',name:'三斜 P',family:'三斜',center:'P',cell:[1,1.2,1.45,78,83,74]}
  ];
  const byId=Object.fromEntries(BRAVAIS.map(v=>[v.id,v]));
  const q=1/4,u=.305,ideal=Math.sqrt(8/3),mod=x=>(x%1+1)%1;
  // These helpers expand a few *predefined* prototype coordinates only; the
  // editor does not infer or generate arbitrary space-group symmetry.
  const inversePair=(e,x,y,z)=>[atom(e,x,y,z),atom(e,mod(-x),mod(-y),mod(-z))];
  const monoclinic14=(e,x,y,z)=>[atom(e,x,y,z),atom(e,mod(-x),mod(y+.5),mod(.5-z)),atom(e,mod(-x),mod(-y),mod(-z)),atom(e,x,mod(.5-y),mod(z+.5))];
  const ortho62=(e,x,z)=>[atom(e,x,.25,z),atom(e,mod(.5-x),.75,mod(z+.5)),atom(e,mod(-x),.75,mod(-z)),atom(e,mod(x+.5),.25,mod(.5-z))];
  const PROTOTYPES=[
    {id:'alpha-iron',name:'体心立方 · α-Fe',group:'单元素结构',bravais:'cI',basis:[atom('Fe')],note:'α-Fe 的体心立方几何原型；长度归一化，不模拟铁的真实磁参数。'},
    {id:'copper',name:'面心立方 · Cu',group:'单元素结构',bravais:'cF',basis:[atom('Cu')],note:'铜的面心立方几何原型；常规胞含 4 个 Cu，长度归一化。'},
    {id:'beta-tin',name:'白锡 · β-Sn',group:'单元素结构',bravais:'tI',cell:[1,1,3.1819/5.8318,90,90,90],basis:[atom('Sn',0,.75,.125),atom('Sn',.5,.75,.375)],note:'白锡的体心四方 A5 型结构；常规胞 4 个 Sn，体心平移之外有额外基元；c/a 为近似值。'},
    {id:'hcp',name:'六方密排 · Mg 型',group:'单元素结构',bravais:'hP',cell:[1,1,ideal,90,90,120],basis:[atom('Mg'),atom('Mg',2/3,1/3,.5)],note:'理想 c/a = √(8/3)，每格点有 12 个等距最近邻。'},
    {id:'diamond',name:'金刚石 · C',group:'单元素结构',bravais:'cF',basis:[atom('C'),atom('C',q,q,q)],note:'两个相同原子的面心立方子格；最近邻呈四面体几何。'},
    {id:'silicon',name:'金刚石结构 · Si',group:'单元素结构',bravais:'cF',basis:[atom('Si'),atom('Si',q,q,q)],note:'与金刚石同一结构原型，但组元为硅；长度为归一化示意。'},
    {id:'graphite',name:'六方石墨 · C',group:'单元素结构',bravais:'hP',cell:[1,1,6.71/2.46,90,90,120],basis:[atom('C'),atom('C',1/3,2/3,0),atom('C',0,0,.5),atom('C',2/3,1/3,.5)],note:'四原子胞、AB 堆垛；近似 c/a，层内最近邻为三个。'},
    {id:'hexdiamond',name:'六方金刚石 · C',group:'单元素结构',bravais:'hP',cell:[1,1,ideal,90,90,120],basis:[atom('C'),atom('C',2/3,1/3,.5),atom('C',0,0,3/8),atom('C',2/3,1/3,7/8)],note:'理想四面体基元与六方层状堆垛；不是普通六方密排。'},
    {id:'blackp',name:'黑磷 · P',group:'单元素结构',bravais:'oC',cell:[1,10.478/3.3136,4.3763/3.3136,90,90,90],basis:[atom('P',0,.10168,.08056),atom('P',0,.39832,.58056),atom('P',0,.60168,.41944),atom('P',0,.89832,.91944)],note:'正交黑磷的折皱层结构；胞参数与原子坐标取近似值。'},
    {id:'arsenic',name:'灰砷 · As',group:'单元素结构',bravais:'hR',cell:[1,1,1,54.167,54.167,54.167],basis:inversePair('As',.226,.226,.226),note:'A7 型三方结构，采用含两个 As 的菱方原胞；参数为近似值。'},
    {id:'tehp',name:'高压单斜 · Te',group:'单元素结构',bravais:'mP',cell:[1,7.513/3.104,4.760/3.104,90,92.71,90],basis:[atom('Te',.25,.23,.48),atom('Te',.75,.73,.52),atom('Te',.48,0,.02),atom('Te',.52,.5,.98)],note:'按约 4.5 GPa 的高压 Te 结构给出近似几何；不表示常压稳定相。'},
    {id:'cfhp',name:'高压三斜 · Cf',group:'单元素结构',bravais:'aP',cell:[1,7.412/3.307,2.793/3.307,89.06,85.15,85.70],basis:[atom('Cf'),atom('Cf',0,.5,0),...inversePair('Cf',.572,.259,.433)],note:'高压 Cf 的三斜几何近似示例；不代表常压结构。'},
    {id:'nacl',name:'岩盐型 · NaCl',group:'二元结构',bravais:'cF',basis:[atom('Na'),atom('Cl',.5,0,0)],note:'两个错开的面心立方子格；理想 Na—Cl 最近邻各为 6 个。'},
    {id:'cscl',name:'氯化铯型 · CsCl',group:'二元结构',bravais:'cP',basis:[atom('Cs'),atom('Cl',.5,.5,.5)],note:'不同元素位于角与体心：布拉菲点阵是简单立方，不是体心立方。'},
    {id:'zincblende',name:'闪锌矿型 · ZnS',group:'二元结构',bravais:'cF',basis:[atom('Zn'),atom('S',q,q,q)],note:'立方 ZnS 原型；Zn 与 S 的理想最近邻各为 4 个。'},
    {id:'wurtzite',name:'纤锌矿型 · ZnS',group:'二元结构',bravais:'hP',cell:[1,1,ideal,90,90,120],basis:[atom('Zn'),atom('Zn',2/3,1/3,.5),atom('S',0,0,3/8),atom('S',2/3,1/3,7/8)],note:'理想 c/a = √(8/3)、u = 3/8；四面体最近邻与层堆垛不同于闪锌矿。'},
    {id:'zno',name:'纤锌矿型 · ZnO',group:'二元结构',bravais:'hP',cell:[1,1,1.602,90,90,120],basis:[atom('Zn'),atom('Zn',2/3,1/3,.5),atom('O',0,0,.382),atom('O',2/3,1/3,.882)],note:'近似 c/a 和 u 的 ZnO 几何示例；并非温度、压力或实验数据拟合。'},
    {id:'caf2',name:'萤石型 · CaF₂',group:'二元结构',bravais:'cF',basis:[atom('Ca'),atom('F',q,q,q),atom('F',.75,.75,.75)],note:'每常规胞 4 个 Ca 与 8 个 F；几何截断不自动识别化学键。'},
    {id:'li2o',name:'反萤石型 · Li₂O',group:'二元结构',bravais:'cF',basis:[atom('O'),atom('Li',q,q,q),atom('Li',.75,.75,.75)],note:'反萤石结构与萤石型的占位物种相反。'},
    {id:'quartz',name:'α-石英 · SiO₂',group:'二元结构',family:'三方',bravais:'hP',cell:[1,1,5.406/4.914,90,90,120],basis:[
      atom('Si',.4699,0,1/3),atom('Si',0,.4699,2/3),atom('Si',.5301,.5301,0),
      atom('O',.413,.2668,.214),atom('O',.7332,.1462,.214+1/3),atom('O',.8538,.587,.214+2/3),
      atom('O',.2668,.413,1-.214),atom('O',.1462,.7332,2/3-.214),atom('O',.587,.8538,1/3-.214)
    ],note:'α-石英采用三方晶体、六方坐标胞；3 Si + 6 O，示意一类手性结构，参数为近似值。'},
    {id:'rutile',name:'金红石型 · TiO₂',group:'二元结构',bravais:'tP',cell:[1,1,2.959/4.593,90,90,90],basis:[atom('Ti'),atom('Ti',.5,.5,.5),atom('O',u,u,0),atom('O',1-u,1-u,0),atom('O',.5+u,.5-u,.5),atom('O',.5-u,.5+u,.5)],note:'四方胞含 2 Ti + 4 O，取近似 c/a 与氧位置 u；两种 Ti—O 距离略有不同。'},
    {id:'anatase',name:'锐钛矿型 · TiO₂',group:'二元结构',bravais:'tI',cell:[1,1,9.514/3.785,90,90,90],basis:[atom('Ti',0,.75,.125),atom('Ti',.5,.75,.375),atom('O',0,.25,.0836),atom('O',0,.75,.3336),atom('O',.5,.25,.4164),atom('O',.5,.75,.1664)],note:'与金红石相同化学式、不同晶胞和原子排列；晶胞参数为近似值。'},
    {id:'baddeleyite',name:'斜锆石型 · ZrO₂',group:'二元结构',bravais:'mP',cell:[1,5.2116/5.1505,5.3173/5.1505,90,99.23,90],basis:[...monoclinic14('Zr',.7246,.0395,.7917),...monoclinic14('O',.9300,.3317,.6553),...monoclinic14('O',.5504,.7569,.5208)],note:'单斜 ZrO₂，胞内 4 Zr + 8 O；位置和胞参数为归一化近似值。'},
    {id:'feas',name:'斜方砷化铁 · FeAs',group:'二元结构',bravais:'oP',cell:[1,3.325/5.454,6.029/5.454,90,90,90],basis:[...ortho62('Fe',.0058,.1993),...ortho62('As',.2005,.5741)],note:'正交 FeAs 原型，胞内 4 Fe + 4 As；采用近似参数。'},
    {id:'pyrite',name:'黄铁矿型 · FeS₂',group:'二元结构',bravais:'cP',basis:[atom('Fe'),atom('Fe',0,.5,.5),atom('Fe',.5,0,.5),atom('Fe',.5,.5,0),atom('S',.384,.384,.384),atom('S',.116,.616,.884),atom('S',.616,.884,.116),atom('S',.884,.116,.616),atom('S',.616,.616,.616),atom('S',.884,.384,.116),atom('S',.384,.116,.884),atom('S',.116,.884,.384)],note:'立方 FeS₂ 原型，胞内含 Fe 子格与 S–S 二聚体；不同于相同组元的其他多晶型。'},
    {id:'nias',name:'镍砷型 · NiAs',group:'二元结构',bravais:'hP',cell:[1,1,1.39,90,90,120],basis:[atom('Ni'),atom('Ni',0,0,.5),atom('As',1/3,2/3,.25),atom('As',2/3,1/3,.75)],note:'六方 NiAs 原型；c/a 采用近似示例。'},
    {id:'hbn',name:'六方氮化硼 · BN',group:'二元结构',bravais:'hP',cell:[1,1,2.66,90,90,120],basis:[atom('B'),atom('N',1/3,2/3,0),atom('B',1/3,2/3,.5),atom('N',0,0,.5)],note:'六方层状 AA′ 型示意；层间间距用近似比值。'},
    {id:'mgb2',name:'AlB₂ 型 · MgB₂',group:'二元结构',bravais:'hP',cell:[1,1,1.14,90,90,120],basis:[atom('Mg'),atom('B',1/3,2/3,.5),atom('B',2/3,1/3,.5)],note:'Mg 层与硼蜂窝层交替；c/a 为近似示例。'},
    {id:'mos2',name:'2H 层状 · MoS₂',group:'二元结构',bravais:'hP',cell:[1,1,3.89,90,90,120],basis:[atom('Mo',1/3,2/3,.25),atom('Mo',2/3,1/3,.75),atom('S',2/3,1/3,.121),atom('S',2/3,1/3,.379),atom('S',1/3,2/3,.621),atom('S',1/3,2/3,.879)],note:'2H 层状原型；c/a 与硫的层间参数为近似示意。'},
    {id:'albite',name:'钠长石 · NaAlSi₃O₈',group:'多元结构',bravais:'aP',cell:[1,7.42359/7.1576,7.69762/7.1576,115.11511,107.37724,100.55864],basis:[
      ...inversePair('Al',.20773,.84122,.17670),...inversePair('Na',.14441,.27518,.25422),
      ...inversePair('O',.96644,.87658,.13472),...inversePair('O',.72111,.40891,.41381),...inversePair('O',.80981,.29530,.07942),...inversePair('O',.74076,.03210,.32928),
      ...inversePair('O',.26814,.70828,.31212),...inversePair('O',.22592,.32857,.71731),...inversePair('O',.38942,.10112,.31914),...inversePair('O',.43708,.31682,.05324),
      ...inversePair('Si',.23701,.18228,.82490),...inversePair('Si',.68677,.41955,.19963),...inversePair('Si',.64040,.20300,.43920)
    ],note:'三斜钠长石的四组元示例；采用 26 点位原胞与近似坐标，不包含无序或缺陷。'},
    {id:'spinel',name:'尖晶石 · MgAl₂O₄',group:'三元结构',bravais:'cF',basis:[
      atom('Mg',.375,.375,.375),atom('Mg',.625,.625,.625),atom('Al'),atom('Al',.25,.25,0),atom('Al',.25,0,.25),atom('Al',0,.25,.25),
      atom('O',.2376,.2376,.2376),atom('O',.0124,.0124,.2376),atom('O',.0124,.2376,.0124),atom('O',.2376,.0124,.0124),
      atom('O',.4876,.4876,.7624),atom('O',.7624,.7624,.7624),atom('O',.4876,.7624,.4876),atom('O',.7624,.4876,.4876)
    ],note:'理想有序正尖晶石：常规胞 8 Mg、16 Al、32 O；近似氧位置，不包含反位或无序。'},
    {id:'perovskite',name:'立方钙钛矿 · SrTiO₃',group:'三元结构',bravais:'cP',basis:[atom('Sr'),atom('Ti',.5,.5,.5),atom('O',.5,.5,0),atom('O',.5,0,.5),atom('O',0,.5,.5)],note:'理想立方 ABO₃ 原型，胞内 1 Sr + 1 Ti + 3 O；不包含结构畸变。'}
  ];
  const prototypeById=Object.fromEntries(PROTOTYPES.map(p=>[p.id,p]));
  function copy(v){return JSON.parse(JSON.stringify(v));}
  function preset(id){
    const p=prototypeById[id],b=byId[p?p.bravais:id];if(!b)throw new Error('未知结构原型。');
    const cell=(p&&p.cell||b.cell).slice(),basis=copy(p?p.basis:[atom('X1')]);
    return {id,name:p?p.name:b.name,family:(p&&p.family)||b.family,bravais:b.id,center:b.center,cell,basis,note:p?p.note:'布拉菲点阵示例：X1 是格点占位符，不代表特定元素。',prototype:!!p};
  }
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],scale=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>Math.sqrt(dot(a,a));
  const wrap=x=>{const y=x-Math.floor(x);return y<1e-9||y>1-1e-9?0:y;};
  function validElement(e){return e==='X1'||e==='X2'||e==='X3'||Object.prototype.hasOwnProperty.call(Z,e);}
  function weight(e,mode){return mode==='equal'?1:Z[e]||({X1:1,X2:2,X3:3}[e]);}
  // Golden-angle hues avoid assigning exactly the same swatch to many custom elements.
  function color(e){
    if(COLORS[e])return COLORS[e];const n=Z[e]||1,h=(n*137.508)%360,s=.52+(n%3)*.06,l=.63+(n%2)*.055;
    const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
    const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
  }
  function vectors(cell){
    if(!Array.isArray(cell)||cell.length!==6||cell.some(v=>!Number.isFinite(v)))throw new Error('晶胞参数必须为有限数字。');
    const [a,b,c,alpha,beta,gamma]=cell;if([a,b,c].some(v=>v<.4||v>5))throw new Error('边长须在 0.4–5 之间。');
    if([alpha,beta,gamma].some(v=>v<35||v>145))throw new Error('夹角须在 35°–145° 之间。');
    const rad=Math.PI/180,ca=Math.cos(alpha*rad),cb=Math.cos(beta*rad),cg=Math.cos(gamma*rad),sg=Math.sin(gamma*rad);
    const cy=(ca-cb*cg)/sg,cz2=1-cb*cb-cy*cy;if(cz2<=.04)throw new Error('晶胞过于扁平或角度不相容，请调整参数。');
    const A=[a,0,0],B=[b*cg,b*sg,0],C=[c*cb,c*cy,c*Math.sqrt(cz2)],vol=dot(A,cross(B,C));
    return {A,B,C,volume:vol,reciprocal:[scale(cross(B,C),1/vol),scale(cross(C,A),1/vol),scale(cross(A,B),1/vol)]};
  }
  function point(v,f){return add(add(scale(v.A,f[0]),scale(v.B,f[1])),scale(v.C,f[2]));}
  function enumerateNeighbors(sites,v,radius,maxOps=12000000){
    const reciprocal=v.reciprocal.map(norm),adj=Array.from({length:sites.length},()=>[]);let operations=0,nearest=Infinity;
    for(let i=0;i<sites.length;i++)for(let j=0;j<sites.length;j++){
      const df=sites[j].fraction.map((x,k)=>x-sites[i].fraction[k]),limits=reciprocal.map((r,k)=>[Math.ceil(-radius*r-df[k]-1e-10),Math.floor(radius*r-df[k]+1e-10)]);
      const count=limits.reduce((n,[lo,hi])=>n*Math.max(0,hi-lo+1),1);operations+=count;if(operations>maxOps)throw new Error('当前晶胞或截断范围过于复杂，请减少基元或收窄距离。');
      for(let x=limits[0][0];x<=limits[0][1];x++)for(let y=limits[1][0];y<=limits[1][1];y++)for(let z=limits[2][0];z<=limits[2][1];z++){
        if(i===j&&x===0&&y===0&&z===0)continue;
        const cart=point(v,[df[0]+x,df[1]+y,df[2]+z]),d=norm(cart);if(d<1e-8)throw new Error('不同原子占据同一周期位置，请调整基元。');
        if(d<=radius*(1+1e-9)){adj[i].push({site:j,offset:[x,y,z],distance:d});nearest=Math.min(nearest,d);}
      }
    }
    return {adj,nearest,operations};
  }
  function build(config,cutoffFactor=1.08){
    if(!config||!CENTERS[config.center])throw new Error('未知的晶胞中心化方式。');
    if(!Array.isArray(config.basis)||!config.basis.length||config.basis.length>32)throw new Error('基元须有 1–32 个原子。');
    if(!Number.isFinite(cutoffFactor)||cutoffFactor<1||cutoffFactor>1.8)throw new Error('邻居距离倍率须在 1–1.8 之间。');
    const v=vectors(config.cell),sites=[],seen=new Set();
    for(let j=0;j<config.basis.length;j++){
      const a=config.basis[j];if(!a||!validElement(a.element))throw new Error('元素符号无效；可用化学元素或 X1/X2/X3。');
      const frac=[a.x,a.y,a.z];if(frac.some(x=>!Number.isFinite(x)||x<0||x>=1))throw new Error('基元分数坐标须满足 0 ≤ x,y,z < 1。');
      CENTERS[config.center].forEach((center,k)=>{const f=frac.map((x,i)=>wrap(x+center[i])),key=f.map(x=>Math.round(x*1e8)).join(',');if(seen.has(key))throw new Error('基元与中心化平移产生重复位置。');seen.add(key);sites.push({element:a.element,fraction:f,basisIndex:j,centerIndex:k});});
    }
    // One translation along any cell vector is always a neighbour candidate.
    // Reciprocal-vector bounds rigorously include every candidate within that radius.
    const first=enumerateNeighbors(sites,v,Math.min(...config.cell.slice(0,3))),nearest=first.nearest;
    if(!Number.isFinite(nearest))throw new Error('无法计算周期邻居。');
    const all=enumerateNeighbors(sites,v,nearest*cutoffFactor);
    return {config:copy(config),vectors:v,sites,neighbors:all.adj,nearest,cutoff:nearest*cutoffFactor,cutoffFactor,volume:v.volume};
  }
  function supercell(model,copies){
    if(!Number.isInteger(copies)||copies<1||copies>4)throw new Error('复制数须为 1–4。');
    const B=model.sites.length;if(B*copies**3>8192)throw new Error('显示原子过多，请减少复制数或基元。');
    const atoms=[],map=new Map();
    for(let b=0;b<B;b++){
      const site=model.sites[b],f=site.fraction,ends=f.map(x=>x===0?copies:copies-1);
      for(let x=0;x<=ends[0];x++)for(let y=0;y<=ends[1];y++)for(let z=0;z<=ends[2];z++){
        const ghost=x===copies||y===copies||z===copies,cell=[x,y,z],cart=point(model.vectors,[x+f[0],y+f[1],z+f[2]]),key=[b,x,y,z].join(',');
        map.set(key,atoms.length);atoms.push({site:b,cell,cart,ghost,element:site.element});
      }
    }
    const edges=[];for(let i=0;i<atoms.length;i++){
      const a=atoms[i];for(const n of model.neighbors[a.site]){const k=[n.site,a.cell[0]+n.offset[0],a.cell[1]+n.offset[1],a.cell[2]+n.offset[2]].join(','),j=map.get(k);if(j!==undefined&&i<j)edges.push({a:i,b:j,distance:n.distance});}
    }
    return {atoms,edges,actual:B*copies**3,ghosts:atoms.filter(a=>a.ghost).length,copies};
  }
  function reflection(model,h,k,l,mode='equal'){
    if(![h,k,l].every(Number.isInteger)||[h,k,l].some(n=>Math.abs(n)>8))throw new Error('Miller 指数须为 −8 到 8 的整数。');
    if(h===0&&k===0&&l===0)throw new Error('(000) 是前向散射，不是晶面反射。');
    if(mode!=='equal'&&mode!=='z')throw new Error('未知散射权重。');
    let real=0,imag=0;for(const site of model.sites){const f=site.fraction,w=weight(site.element,mode),phase=2*Math.PI*(h*f[0]+k*f[1]+l*f[2]);real+=w*Math.cos(phase);imag+=w*Math.sin(phase);}
    const r=model.vectors.reciprocal,g=add(add(scale(r[0],h),scale(r[1],k)),scale(r[2],l)),invD=norm(g),intensity=real*real+imag*imag;
    return {h,k,l,real,imag,intensity:Math.abs(intensity)<1e-20?0:intensity,invD,d:1/invD,mode};
  }
  return {ELEMENTS,Z,CENTERS,BRAVAIS,PROTOTYPES,preset,vectors,point,build,supercell,reflection,validElement,color,weight};
});
