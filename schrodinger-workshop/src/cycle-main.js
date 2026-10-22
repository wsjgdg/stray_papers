/* 演示入口：R84 循环 EC 页（cycle.html）。
   课程站嵌入同理：
     import { CycleApp } from './src/cycle.js';
     new CycleApp(document.body, {}).mount();
*/
import { CycleApp } from './cycle.js';

const app = new CycleApp(document.body, {});
app.mount();
window.__cy = app.debugHandle();
