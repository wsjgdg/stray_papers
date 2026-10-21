/* 演示入口：R78 量子纠错页（qec.html）。
   课程站嵌入同理：
     import { QecApp } from './src/qec.js';
     new QecApp(document.body, {}).mount();
*/
import { QecApp } from './qec.js';

const app = new QecApp(document.body, {});
app.mount();
window.__qe = app.debugHandle();
