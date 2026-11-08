/**
 * 标题画面 · 入学档案（批次 AF）
 * 第一次打开游戏时，标题界面先变成一份档案条：姓名、学期、四项数值、状态——
 * 全是零或未归档。下面只有一个按钮：「开始被记录」。
 * 这不是打破第四面墙——第四面墙从一开始就不存在：玩家和角色一样，都是档案里的条目。
 */
import { saveEnrollSeen } from "@/lib/gameSave";

export function EnrollLedger({ onBegin }: { onBegin: () => void }) {
  const rows: Array<[string, string]> = [
    ["姓名", "奶白"],
    ["学期", "第一学期"],
    ["沉默值", "0"],
    ["印象分", "0"],
    ["被注意值", "0"],
    ["状态", "未归档"],
  ];
  const begin = () => {
    saveEnrollSeen();
    onBegin();
  };
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-foreground/90 px-4" role="dialog" aria-label="入学档案">
      <div className="anim-fade-up my-auto w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-center text-[10px] font-bold tracking-widest text-muted-foreground">奶蛙大学 · 入学登记</p>
        <dl className="mt-4 divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2">
              <dt className="text-xs font-bold tracking-widest text-muted-foreground">{label}</dt>
              <dd className="font-mono text-sm font-bold text-card-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
          本表随个人档案保存四年。交两份：电子版入系统，纸质版存柜。最下面一行小字：填错可以改，但改过的地方要盖校对章。
        </p>
        <button
          type="button"
          onClick={begin}
          className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          开始被记录
        </button>
      </div>
    </div>
  );
}
