/**
 * 校园地图 · 签收（批次 AR「你的位置」之一）
 * 本学期由种子派生的某一天，有一份东西到了，等你签收。
 * 签了：档案一行「该蛙签收了它自己都不知道是什么的东西」。
 * 不签：第三天起它被替你签了——签收人栏的字迹不是你的。
 * 你的名字会被别人使用，没有人问过你。
 */
import { useState } from "react";
import { FileSignature } from "lucide-react";
import type { PackageItem } from "@/lib/gameSave";
import { RichText } from "@/components/common/RichText";

interface PackageOverlayProps {
  /** 替签版：你不签的东西，第三天起有人替你签了 */
  replaced: boolean;
  /** 那份东西（待签版用；替签版不关心内容——内容从来不是重点） */
  item: PackageItem;
  /** 名字被使用的累计次数（亲手签 + 被代签，跨学期保留） */
  signings: number;
  /** 亲手签收（待签版） */
  onSign?: () => boolean;
  /** 替签落档（替签版：弹出即落档，这里只负责收浮层） */
  onAck?: () => void;
  /** 先放着（待签版：关掉浮层——窗口期内它会再等你） */
  onClose: () => void;
}

/** 待签版：那份东西的封面页 */
function PackageFront({ item, signings, onSign, onClose }: { item: PackageItem; signings: number; onSign?: () => boolean; onClose: () => void }) {
  const [signed, setSigned] = useState(false);
  if (signed) {
    return (
      <>
        <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-3 text-sm leading-relaxed text-card-foreground">
          你签了。字迹是你的——档案里存着你的字，这一笔是你的。
        </p>
        <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
          该蛙签收了它自己都不知道是什么的东西。（累计 {signings} 次）
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          签收人不需要知道内容——流程里没有「内容」这一栏，只有「签收」。
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
          >
            知道了
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
        <RichText className="text-xs font-bold tracking-widest text-primary" text={item.title} />
        <RichText className="mt-2 text-sm leading-relaxed text-card-foreground" text={item.text} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        到达的那天它就在这了。没有人催你——催这个动作需要一个收件人，而收件人一栏写的是你的名字。
        不签也行：不签的东西不会被扔掉，只会被处理。
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-muted-foreground transition-colors duration-200 hover:text-card-foreground focus-visible:shadow-focus focus-visible:outline-none"
        >
          先放着
        </button>
        <button
          type="button"
          onClick={() => {
            if (!onSign?.()) return;
            setSigned(true);
          }}
          className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          签收
        </button>
      </div>
    </>
  );
}

/** 替签版：你不签的东西，有人替你签了 */
function PackageReplaced({ signings, onAck }: { signings: number; onAck: () => void }) {
  return (
    <>
      <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs font-bold tracking-widest text-primary">签收人栏有字</p>
        <p className="mt-2 text-sm leading-relaxed text-card-foreground">
          不是你的字。你的字你认得，这一笔不是。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-card-foreground">
          替你签的那一位没问过你，也没有问过自己——流程里没有「问」这一栏，只有「签收」。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          档案里这一行写的是你：该蛙已签收。字迹不是你的，名字是你的。
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        你的名字会被别人使用。没有人问过你。（累计 {signings} 次）
      </p>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onAck}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
        >
          知道了
        </button>
      </div>
    </>
  );
}

export function PackageOverlay({ replaced, item, signings, onSign, onAck, onClose }: PackageOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10"
      role="dialog"
      aria-label={replaced ? "已被代签" : "待签收"}
    >
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <FileSignature size={13} aria-hidden />
            收发室 · {replaced ? "已签收" : "签收"}
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {replaced ? "它被替你签了" : "有一份东西等你"}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {replaced
              ? "第三天起，不签的东西会被处理——处理的方式是签收。没有人等你，但流程不需要等你。"
              : "收件人：该蛙。这份东西不是你订的，也不需要是你订的——收件人一栏写的是你，这就够了。"}
          </p>
          {replaced ? <PackageReplaced signings={signings} onAck={() => onAck?.()} /> : <PackageFront item={item} signings={signings} onSign={onSign} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
