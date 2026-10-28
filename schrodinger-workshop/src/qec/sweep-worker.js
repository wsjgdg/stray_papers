/* sweep-worker.js — 扫描点的并行计算（R126 建立，R127 修取消语义）
 *
 * 协议（单向派发、逐点回传）：
 *   main → worker : { id, cfg }       算一整轮扫描
 *   main → worker : { cancel: true }  作废在途任务（换配置 / 离开 mode）
 *   worker → main : { id, i, n, row } 第 i 点算完（n = 总点数，用于进度）
 *   worker → main : { id, done }      整轮完成
 *   worker → main : { id, error }     失败 ⟹ 主线程接手
 *
 * ⚠ R127 修的**真缺陷**：首版循环是同步跑完的，而 Worker 只有在消息队列空闲时才处理
 *   下一条消息 ⟹ `{cancel:true}` 会排在整轮之后才被看到，**根本打断不了在途任务**
 *   （旧任务继续吃 CPU，而 cancel 的存在意义正是让它停）。修法：逐点 `await` 让出，
 *   让 cancel 有机会插入；每次继续前检查 dead。
 * ⚠ 让出后会出现「旧任务在跑时来了新任务」：此时**不能**直接开跑（两个循环会交错
 *   回传），也不能丢掉新任务（主线程在等它的 done ⟹ 扫描永远结束不了）。处理：
 *   置 dead 打断旧的，新任务进**单槽队列**，旧任务退出后接着跑。
 * ⚠ NaN 要走 null：CDP 的 returnByValue 不过 NaN（R116 已踩过），主线程回转成 NaN。
 * ⚠ Worker 在 file:// 与单文件 dist 下不可用 ⟹ 由调用方的回退路径兜住。 */
import { qecSweepPlan } from '../physics/qec.js';

let dead = false;      /* 打断在途任务 */
let busy = false;      /* 有任务在跑 */
let queued = null;     /* 单槽：只要最新的一条（旧的自然过期） */
const yield1 = () => new Promise(r => setTimeout(r, 0));

async function run(m){
  busy = true;
  dead = false;
  const id = m.id;
  try {
    const plan = qecSweepPlan(m.cfg || {});
    for (let i = 0; i < plan.length; i++){
      const r = plan.step(i);
      self.postMessage({ id, i, n: plan.length, row: {
        p: r.p, PL: r.PL,
        PLexact: Number.isFinite(r.PLexact) ? r.PLexact : null,
        Pun: r.Pun,
      } });
      await yield1();                 /* 让出 ⟹ cancel 才能被处理 */
      if (dead) return;               /* 被作废：不再发 done（主线程按 id 丢弃） */
    }
    self.postMessage({ id, done: true });
  } catch (err){
    self.postMessage({ id, error: String((err && err.message) || err) });
  } finally {
    busy = false;
    const nx = queued; queued = null;
    if (nx) run(nx);
  }
}

self.onmessage = e => {
  const m = e.data || {};
  if (m.cancel){ dead = true; return; }
  if (busy){ dead = true; queued = m; return; }   /* 打断旧的、排队新的 */
  run(m);
};
