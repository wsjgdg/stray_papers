// 分享卡导出：纯 canvas 2D 绘制，不依赖外部资源，避免 CORS 污染画布。
import { TASTE_KEYS } from './food-data';

export interface ShareCardInput {
  title: string;
  cuisine: string;
  taste: Record<string, number>;
  tier: string;
  note?: string;
}

const W = 720;
const H = 980;

export function downloadShareCard(input: ShareCardInput) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) return;

  // 背景
  g.fillStyle = '#FAF7F2';
  g.fillRect(0, 0, W, H);

  // 顶部色带
  const grad = g.createLinearGradient(0, 0, W, 220);
  grad.addColorStop(0, '#B91C1C');
  grad.addColorStop(1, '#EA580C');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, 220);

  g.fillStyle = 'rgba(255,255,255,.85)';
  g.font = '600 26px system-ui, sans-serif';
  g.fillText('中国味道 · 一省一菜 → 一市一味', 48, 72);

  g.fillStyle = '#FFFFFF';
  g.font = '700 64px system-ui, sans-serif';
  g.fillText(input.title.slice(0, 12), 48, 160);

  g.fillStyle = 'rgba(255,255,255,.9)';
  g.font = '500 24px system-ui, sans-serif';
  g.fillText(`${input.cuisine} · ${input.tier}`, 48, 200);

  // 口味条
  let y = 280;
  g.font = '600 24px system-ui, sans-serif';
  for (const k of TASTE_KEYS) {
    const v = Math.max(0, Math.min(100, input.taste[k] ?? 0));
    g.fillStyle = '#57534E';
    g.fillText(k, 48, y + 6);

    g.fillStyle = '#E7E5E4';
    roundRect(g, 100, y - 12, 460, 26, 13);
    g.fill();

    g.fillStyle = '#B91C1C';
    roundRect(g, 100, y - 12, Math.max(26, (460 * v) / 100), 26, 13);
    g.fill();

    g.fillStyle = '#78716C';
    g.font = '500 22px system-ui, sans-serif';
    g.fillText(String(v), 580, y + 6);
    g.font = '600 24px system-ui, sans-serif';
    y += 74;
  }

  // 底部说明
  g.fillStyle = '#78716C';
  g.font = '400 20px system-ui, sans-serif';
  const lines = [
    input.note ?? '口味数值为本项目按公开锚点定标，不是实测；数据来源见详情页「依据？」。',
    '钠/糖：中国菜肴数据集（CC BY 4.0）· USDA FoodData Central · 中国食物成分表第 6 版',
  ];
  let ly = y + 30;
  for (const line of lines) {
    wrapText(g, line, 48, ly, W - 96, 30);
    ly += 60;
  }

  // 角标
  g.fillStyle = '#B91C1C';
  g.font = '700 26px system-ui, sans-serif';
  g.fillText('#WorkBuddy  #1024程序员节', 48, H - 48);

  const a = document.createElement('a');
  a.download = `中国味道-${input.title}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
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
