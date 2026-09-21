import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 浮层面板入场：遮罩淡入 → 卡体带轻微回弹升起 → 卡内 [data-panel-item] 逐项错峰浮出。
// 用法：返回的 ref 挂到浮层根节点；内层卡加 data-panel-card，列表项加 data-panel-item。
// 关闭即卸载（无退场动画），revert 由 hook 自动处理。
export function usePanelEntrance<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useGSAP(() => {
    const root = ref.current;
    if (!root) return;
    const rm = prefersReducedMotion();
    const tl = gsap.timeline();
    tl.from(root, { autoAlpha: 0, duration: rm ? 0 : 0.28, ease: "power1.out" });
    const card = root.querySelector("[data-panel-card]");
    if (card)
      tl.from(
        card,
        {
          autoAlpha: 0,
          y: rm ? 0 : 22,
          scale: rm ? 1 : 0.95,
          duration: rm ? 0 : 0.5,
          ease: rm ? "power2.out" : "back.out(1.3)",
        },
        rm ? 0 : "-=0.12",
      );
    const items = root.querySelectorAll("[data-panel-item]");
    if (items.length)
      tl.from(
        items,
        {
          autoAlpha: 0,
          y: rm ? 0 : 14,
          duration: rm ? 0 : 0.38,
          ease: "power3.out",
          stagger: rm ? 0 : 0.05,
        },
        rm ? 0 : "-=0.3",
      );
  }, { scope: ref });
  return ref;
}

// HUD 顶栏：进入舞台的那一刻（active 首次为 true）从上方滑入一次
export function useHudEntrance<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useGSAP(() => {
    const el = ref.current;
    if (!el || !active) return;
    const rm = prefersReducedMotion();
    gsap.from(el, {
      autoAlpha: 0,
      y: rm ? 0 : -18,
      duration: rm ? 0 : 0.55,
      ease: "power3.out",
    });
  }, { scope: ref, dependencies: [active] });
  return ref;
}
