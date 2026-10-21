/* 演示入口：R79 Shor 9 比特码页（shor.html）。
   课程站嵌入同理：
     import { ShorApp } from './src/shor.js';
     new ShorApp(document.body, {}).mount();
*/
import { ShorApp } from './shor.js';

const app = new ShorApp(document.body, {});
app.mount();
window.__sh = app.debugHandle();
