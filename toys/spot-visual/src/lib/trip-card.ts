// 行程卡导出：纯 canvas 2D 绘制（与 share-card.ts 同思路，不依赖外部资源，避免 CORS 污染画布）。
import QRCode from "qrcode";
import { guessPrice } from "./spot-data";

export interface TripCardSpot {
  name: string;
  address: string;
  projects: string[];
}

export interface TripCardInput {
  spots: TripCardSpot[];
  customPriceOf?: (spotName: string, project: string) => number | undefined;
}

const W = 720;

export async function downloadTripCard(input: TripCardInput) {
  const list = input.spots.slice(0, 8);
  const H = 300 + list.length * 88 + 150;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return;

  // 背景
  g.fillStyle = "#F0FDF4";
  g.fillRect(0, 0, W, H);

  // 顶部色带
  const grad = g.createLinearGradient(0, 0, W, 220);
  grad.addColorStop(0, "#059669");
  grad.addColorStop(1, "#0D9488");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, 220);

  g.fillStyle = "rgba(255,255,255,.85)";
  g.font = "600 26px system-ui, sans-serif";
  g.fillText("景点览胜 · 我的行程单", 48, 72);

  g.fillStyle = "#FFFFFF";
  g.font = "700 64px system-ui, sans-serif";
  const date = new Date();
  g.fillText(`${list.length} 站行程`, 48, 160);

  g.fillStyle = "rgba(255,255,255,.9)";
  g.font = "500 24px system-ui, sans-serif";
  g.fillText(
    `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} 规划`,
    48,
    200,
  );

  // 行程列表
  let y = 300;
  let estTotal = 0;
  list.forEach((s, i) => {
    const spotEst = s.projects.reduce((sum, p) => {
      const custom = input.customPriceOf?.(s.name, p);
      return sum + (custom !== undefined ? custom : guessPrice(p));
    }, 0);
    estTotal += spotEst;

    g.fillStyle = "#065F46";
    g.font = "700 26px system-ui, sans-serif";
    g.fillText(`${i + 1}. ${s.name.slice(0, 14)}`, 48, y);

    g.fillStyle = "#78716C";
    g.font = "400 20px system-ui, sans-serif";
    g.fillText(s.address.slice(0, 22), 48, y + 32);

    if (s.projects.length > 0) {
      g.fillStyle = "#059669";
      g.font = "500 20px system-ui, sans-serif";
      g.fillText(s.projects.slice(0, 3).join(" / ").slice(0, 20), 320, y);
    }
    g.fillStyle = "#57534E";
    g.font = "600 22px system-ui, sans-serif";
    g.fillText(spotEst > 0 ? `约¥${spotEst}` : "免费", 600, y);
    y += 88;
  });

  // 合计
  g.fillStyle = "#065F46";
  g.font = "700 28px system-ui, sans-serif";
  g.fillText(`估算合计 约¥${estTotal}`, 48, y + 20);
  // 截断提示：8 站以上的行程卡上不显示全部站点，明示而非静默丢弃
  const omitted = input.spots.length - list.length;
  if (omitted > 0) {
    g.fillStyle = "#B91C1C";
    g.font = "600 20px system-ui, sans-serif";
    g.fillText(`+${omitted} 站未在卡上展示（共 ${input.spots.length} 站，详见行程单）`, 48, y + 56);
  }
  g.fillStyle = "#78716C";
  g.font = "400 18px system-ui, sans-serif";
  g.fillText("价格为按项目名推断的估算值，实际以景区公示为准", 48, y + 52);

  // 角标
  g.fillStyle = "#059669";
  g.font = "700 26px system-ui, sans-serif";
  g.fillText("#WorkBuddy  #1024程序员节", 48, H - 48);

  // 右下角二维码：扫码直达当前页面
  try {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      const qr = await QRCode.toDataURL(url, {
        width: 140,
        margin: 1,
        color: { dark: "#064e3b", light: "#ffffff" },
      });
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.src = qr;
      });
      g.fillStyle = "#ffffff";
      g.fillRect(W - 164, H - 164, 148, 148);
      g.drawImage(img, W - 160, H - 160, 140, 140);
      g.fillStyle = "#a8a29e";
      g.font = "400 14px system-ui, sans-serif";
      g.fillText("扫码直达", W - 152, H - 172);
    }
  } catch {}

  const a = document.createElement("a");
  a.download = `行程单-${list.length}站.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}
