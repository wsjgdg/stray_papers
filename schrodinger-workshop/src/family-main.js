/* 演示入口：R85 码族与真阈值页（family.html）。
   课程站嵌入同理：
     import { FamilyApp } from './src/family.js';
     new FamilyApp(document.body, {}).mount();
*/
import { FamilyApp } from './family.js';

const app = new FamilyApp(document.body, {});
app.mount();
window.__fm = app.debugHandle();
