/* 演示入口：R75 小规模量子线路页（qcircuit.html）。
   课程站嵌入同理：
     import { QCircuitApp } from './src/qcircuit.js';
     new QCircuitApp(document.body, {}).mount();
*/
import { QCircuitApp } from './qcircuit.js';

const app = new QCircuitApp(document.body, {});
app.mount();
window.__qc = app.debugHandle();
