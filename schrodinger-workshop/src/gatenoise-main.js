/* 演示入口：R80 线路级门噪声页（gatenoise.html）。
   课程站嵌入同理：
     import { GateNoiseApp } from './src/gatenoise.js';
     new GateNoiseApp(document.body, {}).mount();
*/
import { GateNoiseApp } from './gatenoise.js';

const app = new GateNoiseApp(document.body, {});
app.mount();
window.__gn = app.debugHandle();
