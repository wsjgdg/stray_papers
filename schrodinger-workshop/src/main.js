/* 演示入口：注册物理内核 → 按 URL ?kernel= 参数挂载 QuantumField。
   课程站嵌入时复制这三行即可（见 README「课程站嵌入」）：
     import { QuantumField } from './src/core/app.js';
     import './src/physics/schrodinger.js';   // 以及任何其他内核
     new QuantumField('#qf', { kernel: 'schrodinger' }).mount();
*/
import { QuantumField } from './core/app.js';
import './physics/schrodinger.js';
import './physics/nls.js';
import './physics/gp.js';
import './physics/pauli.js';
import './physics/dirac.js';

const kernel = new URLSearchParams(location.search).get('kernel') || 'schrodinger';
new QuantumField(document.body, { kernel }).mount();
