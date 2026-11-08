// 本地存档管理子 hook（从 useHome 渐进拆出）：读档 / 节流写档 / 卸载尾沿落盘 / 写失败标志。
// useHome 通过 collect 回调提供「当前内存态快照」, 本 hook 不感知任何业务 ref。
import { useCallback, useEffect, useRef, useState } from "react";
import { loadDscSave, writeDscSave, type DscSaveV1 } from "@/lib/dscSave";

export type SavePayload = Omit<DscSaveV1, "v" | "savedAt">;

const SAVE_THROTTLE_MS = 1000; // 本地存档节流写入间隔（两次落盘最小间隔）

export function useSaveState(collect: () => SavePayload) {
  // collect 每渲染刷新到 ref：写盘时机（节流尾沿/卸载）总拿最新闭包, 又不用把业务 ref 全列进依赖
  const collectRef = useRef(collect);
  collectRef.current = collect;

  // 挂载时读取一次; 存储不可用 / 结构不兼容返回 null 静默降级为内存态
  const initialSaveRef = useRef<DscSaveV1 | null | undefined>(undefined);
  if (initialSaveRef.current === undefined) initialSaveRef.current = loadDscSave();
  const initialSave = initialSaveRef.current;
  const saveLoadedRef = useRef(initialSave !== null);
  const saveMetaRef = useRef<{ savedAt: string | null }>({ savedAt: initialSave?.savedAt || null });

  const savePendingRef = useRef<number | null>(null);
  const lastSaveAtRef = useRef(0);
  // 存档写失败标志（配额满 / 隐私模式等）：置位后 View 显示常驻提示, 下次写成功自动消除
  const [saveFailed, setSaveFailed] = useState(false);

  /** 立即把当前内存态快照写盘（存储不可用时返回 false, 保持内存态） */
  const writeSaveNow = useCallback(() => {
    const ok = writeDscSave(collectRef.current());
    if (ok) {
      saveMetaRef.current.savedAt = new Date().toISOString();
      setSaveFailed(false);
    } else {
      setSaveFailed(true);
    }
  }, []);

  /** 存点调度：成就解锁 / 样品登记 / 结算出具 / 功勋变化 / 着陆 / 纪录刷新处调用, 节流 ≥1s 尾沿合并 */
  const scheduleSave = useCallback(() => {
    if (savePendingRef.current !== null) return;
    const wait = Math.max(0, SAVE_THROTTLE_MS - (Date.now() - lastSaveAtRef.current));
    savePendingRef.current = window.setTimeout(() => {
      savePendingRef.current = null;
      lastSaveAtRef.current = Date.now();
      writeSaveNow();
    }, wait);
  }, [writeSaveNow]);

  // 卸载时把待写入的尾沿存档立即落盘, 避免关页丢最后一个存点
  useEffect(() => {
    return () => {
      if (savePendingRef.current !== null) {
        window.clearTimeout(savePendingRef.current);
        savePendingRef.current = null;
        writeSaveNow();
      }
    };
  }, [writeSaveNow]);

  /** 清除存档后复位存档元信息（savedAt 归零 + 恢复播报不再触发） */
  const markSaveCleared = useCallback(() => {
    saveMetaRef.current.savedAt = null;
    saveLoadedRef.current = false;
  }, []);

  return { initialSave, saveLoadedRef, saveMetaRef, saveFailed, writeSaveNow, scheduleSave, markSaveCleared };
}
