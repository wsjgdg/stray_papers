/* 演示入口：R77 开放量子系统页（noise.html）。
   课程站嵌入同理：
     import { NoiseApp } from './src/noise.js';
     new NoiseApp(document.body, {}).mount();
*/
import { NoiseApp } from './noise.js';

const app = new NoiseApp(document.body, {});
app.mount();
window.__nz = app.debugHandle();
