/* 演示入口：R81 综合提取容错页（flag.html）。
   课程站嵌入同理：
     import { FlagApp } from './src/flag.js';
     new FlagApp(document.body, {}).mount();
*/
import { FlagApp } from './flag.js';

const app = new FlagApp(document.body, {});
app.mount();
window.__fl = app.debugHandle();
