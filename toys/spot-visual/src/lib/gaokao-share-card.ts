// 志愿探索分享卡导出：纯 canvas 2D 绘制（同 share-card.ts 的零外链策略）。
import QRCode from 'qrcode';

export interface GaokaoShareCardInput {
  prov: string;
  cat: string;
  score: number;
  rank: number; // 0 = 无一分一段
  ctrl?: number; // 本科线
  year: number; // 数据年份
  counts: { reach: number; match: number; safe: number };
}

const W = 720;
const H = 760;
const TIER_COLORS = { reach: '#F59E0B', match: '#10B981', safe: '#3B82F6' } as const;

export async function downloadGaokaoShareCard(input: GaokaoShareCardInput) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return;

  // 背景
  g.fillStyle = '#F8FAFC';
  g.fillRect(0, 0, W, H);

  // 顶部色带
  const grad = g.createLinearGradient(0, 0, W, 240);
  grad.addColorStop(0, '#4338CA');
  grad.addColorStop(1, '#6366F1');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, 240);

  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = '600 26px system-ui, sans-serif';
  g.fillText('志愿探索 · 分数位次 · 冲稳保', 48, 72);

  g.fillStyle = '#FFFFFF';
  g.font = '700 60px system-ui, sans-serif';
  g.fillText(`${input.prov} · ${input.cat}`.slice(0, 14), 48, 152);

  g.fillStyle = 'rgba(255,255,255,.9)';
  g.font = '500 26px system-ui, sans-serif';
  const sub = input.rank
    ? `${input.score} 分 · 位次约 #${input.rank.toLocaleString()}`
    : `${input.score} 分`;
  g.fillText(sub, 48, 202);

  // 冲稳保三档统计
  const cards: [keyof typeof TIER_COLORS, string, string][] = [
    ['reach', '冲一冲', '投档线更高 0~18 分'],
    ['match', '稳一稳', '投档线更低 0~22 分'],
    ['safe', '保一保', '投档线更低 23~55 分'],
  ];
  let x = 48;
  for (const [k, label, hint] of cards) {
    g.fillStyle = '#FFFFFF';
    roundRect(g, x, 288, 192, 150, 16);
    g.fill();
    g.fillStyle = TIER_COLORS[k];
    roundRect(g, x + 20, 312, 44, 8, 4);
    g.fill();
    g.fillStyle = '#0F172A';
    g.font = '700 30px system-ui, sans-serif';
    g.fillText(label, x + 20, 362);
    g.font = '700 44px system-ui, sans-serif';
    g.fillStyle = TIER_COLORS[k];
    g.fillText(`${input.counts[k]} 所`, x + 20, 416);
    g.fillStyle = '#94A3B8';
    g.font = '400 15px system-ui, sans-serif';
    g.fillText(hint, x + 20, 432 - 4);
    x += 216;
  }

  // 本科线一行
  if (input.ctrl != null) {
    g.fillStyle = '#475569';
    g.font = '500 22px system-ui, sans-serif';
    g.fillText(`${input.prov}${input.cat} 本科线 ${input.ctrl} 分（GaokaoCompass ${input.year} 数据）`, 48, 490);
  }

  // 底部说明
  g.fillStyle = '#94A3B8';
  g.font = '400 19px system-ui, sans-serif';
  const lines = [
    '投档线为一校一专业组最低分归并；位次由一分一段表线性插值估算。',
    '第三方非官方数据（MIT），仅供演示参考，正式填报以省考试院为准。',
  ];
  let ly = 540;
  for (const line of lines) {
    wrapText(g, line, 48, ly, W - 220, 32);
    ly += 44;
  }

  // 角标
  g.fillStyle = '#4338CA';
  g.font = '700 24px system-ui, sans-serif';
  g.fillText('#WorkBuddy  #1024程序员节', 48, H - 44);

  // 右下角二维码：扫码直达当前省市科类分数
  try {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (url) {
      const qr = await QRCode.toDataURL(url, { width: 140, margin: 1, color: { dark: '#1e1b4b', light: '#ffffff' } });
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = qr; });
      g.fillStyle = '#ffffff';
      g.fillRect(W - 164, H - 164, 148, 148);
      g.drawImage(img, W - 160, H - 160, 140, 140);
      g.fillStyle = '#94a3b8';
      g.font = '400 14px system-ui, sans-serif';
      g.fillText('扫码直达', W - 152, H - 172);
    }
  } catch {}

  const a = document.createElement('a');
  a.download = `志愿探索-${input.prov}-${input.score}分.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, r, x + y, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW) {
      g.fillText(line, x, y);
      line = ch;
      y += lh;
    } else {
      line += ch;
    }
  }
  if (line) g.fillText(line, x, y);
}
