/**
 * 页面截图导出（批次 CY-39 从纪念册抽出共用；CY-40 统一盖蛙校印章）：
 * 把一坨页面节点拍成高清 PNG 下载。
 * 约定：标了 data-export-ui="1" 的按钮只活在屏幕里，不进出图的纸面；
 * 主题变量挂在 body 上，垫底色与印泥色都从节点自己的计算样式取，从 html 取会落空。
 * 出图前自动在右下角盖一枚「奶蛙大学」朱印——档案柜的章，不是装饰。
 */
import { toPng } from "html-to-image";
import { loadSettings, saveSettings } from "./gameSave";

/** 出图成功后的全局广播（批次 CY-42）：蛙在桌边挥手道别的那一声，各页都能听见 */
export const EXPORT_DONE_EVENT = "naiwa-export-done";

/** 出档登记（批次 CY-42）：纸出了门，柜子在登记簿上留一个墨点 */
function logExport(filename: string): void {
  try {
    const settings = loadSettings();
    saveSettings({ exportLog: [...settings.exportLog, { name: filename, stamp: Date.now() }].slice(-20) });
  } catch {
    /* 登记尽力而为，不拦出图 */
  }
}

/** 给拍好的图盖蛙校印章（批次 CY-40）：印泥用主题主色；盖砸了退回无章原图，绝不拦下载 */
async function stampPng(dataUrl: string, inkColor: string): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("stamp-image-failed"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const s = Math.max(56, Math.round(canvas.width * 0.11));
  const pad = Math.round(s * 0.5);
  ctx.save();
  ctx.translate(canvas.width - s - pad, canvas.height - s - pad);
  ctx.rotate(-0.18);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = Math.max(2, s * 0.07);
  ctx.strokeRect(-s / 2, -s / 2, s, s);
  ctx.fillStyle = inkColor;
  ctx.font = `bold ${Math.round(s * 0.3)}px "Noto Serif SC", "Songti SC", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("奶蛙", 0, -s * 0.17);
  ctx.fillText("大学", 0, s * 0.19);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

export async function capturePng(node: HTMLElement, filename: string): Promise<boolean> {
  try {
    const styles = getComputedStyle(node);
    const solid = styles.getPropertyValue("--card").trim() || "white";
    const ink = styles.getPropertyValue("--primary").trim() || "brown";
    const dataUrl = await toPng(node, {
      pixelRatio: 2,
      backgroundColor: solid,
      filter: (element) => !(element instanceof HTMLElement && element.dataset.exportUi === "1"),
    });
    let finalUrl = dataUrl;
    try {
      finalUrl = await stampPng(dataUrl, ink);
    } catch {
      /* 章盖砸了就发无章件，下载优先 */
    }
    const link = document.createElement("a");
    link.href = finalUrl;
    link.download = filename;
    link.click();
    /* 出图成功：柜上登记一笔，再吼一声（批次 CY-42）——App 层的蛙听到就挥手道别 */
    logExport(filename);
    window.dispatchEvent(new CustomEvent(EXPORT_DONE_EVENT, { detail: { filename } }));
    return true;
  } catch {
    return false;
  }
}
