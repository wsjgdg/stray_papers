/**
 * 志愿探索数据管线的共享纯函数（供三个 fetch 脚本与单元测试使用）。
 * 无副作用：只导出函数，不做任何 IO。
 */

export const SLUGS = {
  anhui: "安徽",
  beijing: "北京",
  chongqing: "重庆",
  fujian: "福建",
  gansu: "甘肃",
  guangdong: "广东",
  guangxi: "广西",
  guizhou: "贵州",
  hainan: "海南",
  hebei: "河北",
  heilongjiang: "黑龙江",
  henan: "河南",
  hubei: "湖北",
  hunan: "湖南",
  jiangsu: "江苏",
  jiangxi: "江西",
  jilin: "吉林",
  liaoning: "辽宁",
  neimenggu: "内蒙古",
  ningxia: "宁夏",
  shaanxi: "陕西",
  shandong: "山东",
  shanghai: "上海",
  sichuan: "四川",
  tianjin: "天津",
  xinjiang: "新疆",
  yunnan: "云南",
  zhejiang: "浙江",
};

/** 本科普通批批次过滤：含「本科」且不含艺体/提前/专项，或含「一段」 */
export const isKeepBatch = (b) =>
  (b.includes("本科") &&
    !b.includes("艺术") &&
    !b.includes("体育") &&
    !b.includes("提前") &&
    !b.includes("专项")) ||
  b.includes("一段");

/** 空串 → null（Number('') 是 0，不能直接用） */
export const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** 跨源校名匹配：去掉全角/半角括号内容与空白 */
export const normName = (n) =>
  String(n)
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/\s+/g, "");

/** 最小 CSV 解析（处理引号包裹与转义引号；无多行字段） */
export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (cell !== "" || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter(
    (r) => r.length > 1 || (r.length === 1 && r[0] !== ""),
  );
  return body.map((r) =>
    Object.fromEntries(head.map((h, j) => [h, (r[j] ?? "").trim()])),
  );
}

/** 一分一段表插值：curve 为分降序 [score, cumRank]，线性插值 */
export function rankFromCurve(curve, score) {
  if (!curve.length) return null;
  if (score >= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (score <= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [s1, r1] = curve[i - 1],
      [s2, r2] = curve[i];
    if (score >= s2)
      return Math.round(r1 + ((s1 - score) / (s1 - s2)) * (r2 - r1));
  }
  return last[1];
}
