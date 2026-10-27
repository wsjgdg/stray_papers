/* sweep-worker.js — 扫描点的并行计算（R126）
 *
 * 协议（单向派发、逐点回传）：
 *   main → worker : { id, cfg }       算一整轮扫描
 *   main → worker : { cancel: true }  作废在途任务（换配置 / 离开 mode）
 *   worker → main : { id, i, n, row } 第 i 点算完（n = 总点数，用于进度）
 *   worker → main : { id, done }      整轮完成
 *   worker → main : { id, error }     失败 ⟹ 主线程接手
 *
 * ⚠ NaN 要走 null：CDP 的 returnByValue 不过 NaN（R116 已踩过），主线程回转成 NaN。
 * ⚠ Worker 在 file:// 与单文件 dist 下不可用 ⟹ 由调用方的回退路径兜住，这里不假设
 *   自己一定能被创建。 */
import { qecSweepPlan } from '../physics/qec.js';

let dead = false;
self.onmessage = e => {
  const m = e.data || {};
  if (m.cancel){ dead = true; return; }
  dead = false;
  const id = m.id;
  try {
    const plan = qecSweepPlan(m.cfg || {});
    for (let i = 0; i < plan.length; i++){
      if (dead) return;
      const r = plan.step(i);
      self.postMessage({ id, i, n: plan.length, row: {
        p: r.p, PL: r.PL,
        PLexact: Number.isFinite(r.PLexact) ? r.PLexact : null,
        Pun: r.Pun,
      } });
    }
    self.postMessage({ id, done: true });
  } catch (err){
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
