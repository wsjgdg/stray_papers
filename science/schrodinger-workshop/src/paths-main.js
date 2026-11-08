/* 演示入口：R74 费曼路径求和页（paths.html）。
   课程站嵌入同理：
     import { PathsApp } from './src/paths.js';
     new PathsApp(document.body, {}).mount();
*/
import { PathsApp } from './paths.js';

const app = new PathsApp(document.body, {});
app.mount();
window.__pv = app.debugHandle();
