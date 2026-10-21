/* 演示入口：R82 多轮提取页（rounds.html）。
   课程站嵌入同理：
     import { RoundsApp } from './src/rounds.js';
     new RoundsApp(document.body, {}).mount();
*/
import { RoundsApp } from './rounds.js';

const app = new RoundsApp(document.body, {});
app.mount();
window.__rd = app.debugHandle();
