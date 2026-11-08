/* 演示入口：R98 QEC hub 页（qec.html）——八模式单页（重复码/Shor/门噪声/Flag/多轮/循环/码族/表面码）。
   课程站嵌入同理：
     import { QecHub } from './src/qechub.js';
     new QecHub(document.body).mount();
   ?mode=shor&p=0.02 直达模式（八模式 id：rep/shor/gate/flag/rounds/cycle/family/surf）。
*/
import { QecHub } from './qechub.js';

new QecHub(document.body).mount();
