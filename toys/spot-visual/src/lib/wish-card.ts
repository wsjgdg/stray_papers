// 志愿表导出 PNG：纯 canvas 2D（复用中国味道分享卡的零外链策略）
import QRCode from "qrcode";

export interface WishCardInput {
  prov: string;
  cat: string;
  year: number;
  score: number;
  items: {
    name: string;
    major: string;
    group: string;
    minScore?: number;
    rank?: string;
  }[];
}

const W = 720;
const H_HEADER = 180;
const ROW_H = 64;

export async function downloadWishCard(input: WishCardInput) {
  const rows = Math.min(input.items.length, 24);
  const H = H_HEADER + rows * ROW_H + 100;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return;

  // 背景
  g.fillStyle = "#F0FDF4";
  g.fillRect(0, 0, W, H);

  // 顶部色带
  const grad = g.createLinearGradient(0, 0, W, H_HEADER - 20);
  grad.addColorStop(0, "#065F46");
  grad.addColorStop(1, "#059669");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H_HEADER - 20);

  g.fillStyle = "rgba(255,255,255,.85)";
  g.font = "600 24px system-ui, sans-serif";
  g.fillText("我的志愿表 · 2026 届", 48, 60);

  g.fillStyle = "#FFFFFF";
  g.font = "700 56px system-ui, sans-serif";
  g.fillText(`${input.prov} · ${input.cat}`, 48, 130);

  g.fillStyle = "rgba(255,255,255,.9)";
  g.font = "500 22px system-ui, sans-serif";
  g.fillText(
    `${input.score} 分 · 共 ${input.items.length} 个志愿（${input.year} 年数据）`,
    48,
    164,
  );

  // 志愿行
  let y = H_HEADER;
  for (let i = 0; i < rows; i++) {
    const item = input.items[i];
    // 斑马纹
    if (i % 2 === 0) {
      g.fillStyle = "rgba(255,255,255,.7)";
      g.fillRect(40, y, W - 80, ROW_H);
    }
    // 序号圈
    g.fillStyle = "#059669";
    g.beginPath();
    g.arc(64, y + ROW_H / 2, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#FFFFFF";
    g.font = "700 14px system-ui, sans-serif";
    g.textAlign = "center";
    g.fillText(String(i + 1), 64, y + ROW_H / 2 + 5);
    g.textAlign = "left";
    // 院校名 + 专业
    g.fillStyle = "#1E293B";
    g.font = "600 18px system-ui, sans-serif";
    g.fillText(item.name.slice(0, 12), 96, y + 26);
    g.fillStyle = "#64748B";
    g.font = "400 14px system-ui, sans-serif";
    const groupText = item.group
      ? ` ${item.group.replace(/[（）()]/g, "")}组`
      : "";
    g.fillText(
      `${item.major.slice(0, 16)}${groupText}${item.minScore ? ` · ${item.minScore}分` : ""}`,
      96,
      y + 48,
    );
    // 软科排名（如有）
    if (item.rank) {
      g.fillStyle = "#818CF8";
      g.font = "500 13px system-ui, sans-serif";
      g.textAlign = "right";
      g.fillText(`软科${item.rank}`, W - 56, y + 36);
      g.textAlign = "left";
    }
    y += ROW_H;
  }

  // 底部说明
  g.fillStyle = "#64748B";
  g.font = "400 16px system-ui, sans-serif";
  g.fillText(
    "投档线为一校一专业组最低分归并；仅供演示参考，正式填报以考试院为准。",
    48,
    H - 56,
  );
  g.fillStyle = "#059669";
  g.font = "700 20px system-ui, sans-serif";
  g.fillText("#WorkBuddy  #1024程序员节", 48, H - 28);

  // 二维码
  try {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      const qr = await QRCode.toDataURL(url, {
        width: 120,
        margin: 1,
        color: { dark: "#064e3b", light: "#ffffff" },
      });
      const img = new Image();
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.src = qr;
      });
      g.fillStyle = "#ffffff";
      g.fillRect(W - 152, H - 152, 136, 136);
      g.drawImage(img, W - 148, H - 148, 120, 120);
    }
  } catch {}

  const a = document.createElement("a");
  a.download = `志愿表-${input.prov}-${input.score}分.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}
