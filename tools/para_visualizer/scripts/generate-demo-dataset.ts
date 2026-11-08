/**
 * Demo Dataset Generator
 * ------------------------------------------------------------------
 * Generates an InfoChartQA-like dataset of synthetic chart images
 * rendered as PNG bytes (via sharp from SVG), plus metadata fields.
 *
 * Output: public/demo/demo-dataset.json
 *   {
 *     name, files: [{ name, rows, schema, rows: [...] }]
 *   }
 *
 * Each row contains:
 *   - id, image (base64 PNG bytes), image_format, image_width, image_height
 *   - question, answer, question_type, year, source_url
 *   - extra_input_figure_bboxes (list of [x, y, w, h])
 *   - difficulty, language, tags
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------- RNG (deterministic) ----------
let seed = 20240901;
function rand(): number {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

// ---------- Color palette ----------
const PALETTES: string[][] = [
  ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16"],
  ["#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6"],
  ["#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e"],
  ["#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6"],
  ["#f59e0b", "#ea580c", "#dc2626", "#be185d", "#9333ea"],
  ["#16a34a", "#65a30d", "#ca8a04", "#d97706", "#ea580c"],
];

const BG_COLORS = ["#ffffff", "#fafafa", "#f8fafc", "#fff7ed", "#f0fdf4", "#fdf2f8"];

// ---------- Chart SVG generators ----------
const W = 480;
const H = 320;
const PAD = { l: 50, r: 24, t: 36, b: 44 };

function svgWrap(inner: string, title: string, bg = "#ffffff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${bg}"/>
    <text x="${W / 2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="700" fill="#0f172a">${escapeXml(
      title,
    )}</text>
    ${inner}
  </svg>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function axisX(labels: string[]) {
  const cw = W - PAD.l - PAD.r;
  const step = cw / labels.length;
  let s = "";
  labels.forEach((l, i) => {
    const x = PAD.l + step * i + step / 2;
    s += `<text x="${x.toFixed(1)}" y="${H - PAD.b + 18}" text-anchor="middle" font-size="10" fill="#64748b">${escapeXml(
      l,
    )}</text>`;
  });
  return s;
}

function axisY(max: number, ticks = 4) {
  let s = "";
  for (let i = 0; i <= ticks; i++) {
    const v = (max * i) / ticks;
    const y = H - PAD.b - ((H - PAD.t - PAD.b) * i) / ticks;
    s += `<line x1="${PAD.l}" y1="${y.toFixed(1)}" x2="${W - PAD.r}" y2="${y.toFixed(
      1,
    )}" stroke="#e2e8f0" stroke-width="1"/>`;
    s += `<text x="${PAD.l - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b">${v.toFixed(
      0,
    )}</text>`;
  }
  return s;
}

function genBarChart(): { svg: string; bboxes: number[]; meta: ChartMeta } {
  const palette = pick(PALETTES);
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const n = randInt(4, 8);
  const data = Array.from({ length: n }, () => randInt(15, 100));
  const max = Math.ceil(Math.max(...data) / 20) * 20;
  const cw = W - PAD.l - PAD.r;
  const bw = cw / n;
  let inner = axisY(max) + axisX(labels.slice(0, n));
  const bboxes: number[] = [];
  data.forEach((v, i) => {
    const h = ((H - PAD.t - PAD.b) * v) / max;
    const x = PAD.l + bw * i + bw * 0.18;
    const y = H - PAD.b - h;
    const w = bw * 0.64;
    inner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(
      1,
    )}" height="${h.toFixed(1)}" fill="${palette[i % palette.length]}" rx="3"/>`;
    inner += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(
      1,
    )}" text-anchor="middle" font-size="9" fill="#475569" font-weight="600">${v}</text>`;
    bboxes.push(...[x, y, w, h]);
  });
  const title = pick([
    "Monthly Revenue by Category",
    "Quarterly Sales Performance",
    "Year-over-Year Growth",
    "Product Sales by Region",
    "User Acquisition Trend",
  ]);
  return { svg: svgWrap(inner, title, pick(BG_COLORS)), bboxes, meta: { title, data, labels: labels.slice(0, n) } };
}

function genLineChart(): { svg: string; bboxes: number[]; meta: ChartMeta } {
  const palette = pick(PALETTES);
  const labels = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"];
  const n = randInt(5, 8);
  const data = Array.from({ length: n }, () => randInt(10, 100));
  const max = Math.ceil(Math.max(...data) / 20) * 20;
  const cw = W - PAD.l - PAD.r;
  const step = cw / (n - 1);
  let inner = axisY(max) + axisX(labels.slice(0, n));
  const bboxes: number[] = [];
  const pts = data.map((v, i) => {
    const x = PAD.l + step * i;
    const y = H - PAD.b - ((H - PAD.t - PAD.b) * v) / max;
    return [x, y];
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  inner += `<path d="${path}" fill="none" stroke="${palette[0]}" stroke-width="2.5" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => {
    inner += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#fff" stroke="${palette[0]}" stroke-width="2"/>`;
    bboxes.push(...[p[0] - 4, p[1] - 4, 8, 8]);
  });
  const title = pick([
    "Stock Price Trend",
    "Temperature Variation",
    "Energy Consumption Curve",
    "Web Traffic Over Time",
    "Profit Margin Evolution",
  ]);
  return { svg: svgWrap(inner, title, pick(BG_COLORS)), bboxes, meta: { title, data, labels: labels.slice(0, n) } };
}

function genPieChart(): { svg: string; bboxes: number[]; meta: ChartMeta } {
  const palette = pick(PALETTES);
  const n = randInt(4, 6);
  const raw = Array.from({ length: n }, () => randInt(10, 40));
  const total = raw.reduce((a, b) => a + b, 0);
  const cx = W / 2;
  const cy = H / 2 + 8;
  const r = 90;
  const labels = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
  let inner = "";
  const bboxes: number[] = [];
  let start = -Math.PI / 2;
  raw.forEach((v, i) => {
    const ang = (v / total) * Math.PI * 2;
    const end = start + ang;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = ang > Math.PI ? 1 : 0;
    inner += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(
      1,
    )} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${palette[i % palette.length]}" stroke="#fff" stroke-width="2"/>`;
    // bbox around slice center
    const midAng = (start + end) / 2;
    const bx = cx + (r * 0.6) * Math.cos(midAng);
    const by = cy + (r * 0.6) * Math.sin(midAng);
    bboxes.push(...[bx - 8, by - 8, 16, 16]);
    // label
    const lx = cx + (r + 18) * Math.cos(midAng);
    const ly = cy + (r + 18) * Math.sin(midAng);
    const pct = ((v / total) * 100).toFixed(0);
    inner += `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(
      1,
    )}" text-anchor="middle" font-size="10" fill="#475569" font-weight="600">${labels[i]} ${pct}%</text>`;
    start = end;
  });
  inner += `<circle cx="${cx}" cy="${cy}" r="34" fill="#fff"/>`;
  inner += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="#475569" font-weight="700">${total}</text>`;
  const title = pick([
    "Market Share by Segment",
    "Budget Allocation",
    "Traffic Source Distribution",
    "Revenue Composition",
    "Device Breakdown",
  ]);
  return { svg: svgWrap(inner, title, pick(BG_COLORS)), bboxes, meta: { title, data: raw, labels: labels.slice(0, n) } };
}

function genAreaChart(): { svg: string; bboxes: number[]; meta: ChartMeta } {
  const palette = pick(PALETTES);
  const labels = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10"];
  const n = randInt(6, 10);
  const data = Array.from({ length: n }, () => randInt(20, 100));
  const max = Math.ceil(Math.max(...data) / 20) * 20;
  const cw = W - PAD.l - PAD.r;
  const step = cw / (n - 1);
  let inner = axisY(max) + axisX(labels.slice(0, n));
  const bboxes: number[] = [];
  const pts = data.map((v, i) => {
    const x = PAD.l + step * i;
    const y = H - PAD.b - ((H - PAD.t - PAD.b) * v) / max;
    return [x, y];
  });
  const path =
    `M ${pts[0][0]} ${H - PAD.b} ` +
    pts.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") +
    ` L ${pts[pts.length - 1][0]} ${H - PAD.b} Z`;
  inner += `<path d="${path}" fill="${palette[0]}22" stroke="${palette[0]}" stroke-width="2"/>`;
  pts.forEach((p) => {
    inner += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${palette[0]}"/>`;
    bboxes.push(...[p[0] - 4, p[1] - 4, 8, 8]);
  });
  const title = pick([
    "Cumulative User Signups",
    "Server Load Profile",
    "Daily Active Users",
    "Inventory Build-up",
    "Cumulative Sales Volume",
  ]);
  return { svg: svgWrap(inner, title, pick(BG_COLORS)), bboxes, meta: { title, data, labels: labels.slice(0, n) } };
}

function genGroupedBar(): { svg: string; bboxes: number[]; meta: ChartMeta } {
  const palette = pick(PALETTES);
  const groups = ["A", "B", "C", "D", "E"];
  const gn = randInt(3, 5);
  const series = 2;
  const data: number[][] = Array.from({ length: series }, () =>
    Array.from({ length: gn }, () => randInt(10, 80)),
  );
  const max = Math.ceil(Math.max(...data.flat()) / 20) * 20;
  const cw = W - PAD.l - PAD.r;
  const gw = cw / gn;
  const bw = (gw * 0.7) / series;
  let inner = axisY(max) + axisX(groups.slice(0, gn));
  const bboxes: number[] = [];
  data.forEach((arr, s) => {
    arr.forEach((v, i) => {
      const h = ((H - PAD.t - PAD.b) * v) / max;
      const x = PAD.l + gw * i + gw * 0.15 + bw * s;
      const y = H - PAD.b - h;
      inner += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(
        1,
      )}" height="${h.toFixed(1)}" fill="${palette[s % palette.length]}" rx="2"/>`;
      bboxes.push(...[x, y, bw, h]);
    });
  });
  // legend
  const lx = W - PAD.r - 90;
  inner += `<rect x="${lx}" y="${PAD.t - 18}" width="10" height="10" fill="${palette[0]}"/>`;
  inner += `<text x="${lx + 14}" y="${PAD.t - 9}" font-size="10" fill="#475569">2023</text>`;
  inner += `<rect x="${lx + 50}" y="${PAD.t - 18}" width="10" height="10" fill="${palette[1 % palette.length]}"/>`;
  inner += `<text x="${lx + 64}" y="${PAD.t - 9}" font-size="10" fill="#475569">2024</text>`;
  const title = pick([
    "Comparative Quarterly Revenue",
    "Two-Year Product Comparison",
    "Regional Sales: 2023 vs 2024",
    "Department Budget by Year",
    "Traffic: Mobile vs Desktop",
  ]);
  return { svg: svgWrap(inner, title, pick(BG_COLORS)), bboxes, meta: { title, data: data.flat(), labels: groups.slice(0, gn) } };
}

interface ChartMeta {
  title: string;
  data: number[];
  labels: string[];
}

const GENERATORS = [
  { fn: genBarChart, type: "bar" },
  { fn: genLineChart, type: "line" },
  { fn: genPieChart, type: "pie" },
  { fn: genAreaChart, type: "area" },
  { fn: genGroupedBar, type: "grouped_bar" },
] as const;

// ---------- Metadata generators ----------
const QUESTION_TYPES = [
  "Data Retrieval",
  "Visual Comparison",
  "Pattern Recognition",
  "Trend Analysis",
  "Composition Analysis",
  "Distribution Query",
];

const LANGUAGES = ["en", "zh", "en", "en"]; // weighted english

const TAGS_POOL = [
  "finance",
  "marketing",
  "science",
  "education",
  "healthcare",
  "transport",
  "energy",
  "retail",
  "agriculture",
  "technology",
];

const DIFFICULTIES = ["easy", "medium", "hard"];

function genQuestion(chartType: string, meta: ChartMeta): { q: string; a: string } {
  const max = Math.max(...meta.data);
  const min = Math.min(...meta.data);
  const sum = meta.data.reduce((a, b) => a + b, 0);
  const avg = (sum / meta.data.length).toFixed(1);
  const maxIdx = meta.data.indexOf(max);
  const minIdx = meta.data.indexOf(min);

  const templates: Record<string, { q: string; a: (m: ChartMeta) => string }[]> = {
    bar: [
      { q: `What is the value of ${meta.labels[maxIdx]}?`, a: () => String(max) },
      { q: `Which category has the highest value?`, a: () => meta.labels[maxIdx] },
      { q: `Which category has the lowest value?`, a: () => meta.labels[minIdx] },
      { q: `What is the average value across all categories?`, a: () => avg },
      { q: `What is the difference between the highest and lowest values?`, a: () => String(max - min) },
    ],
    line: [
      { q: `What is the peak value in the trend?`, a: () => String(max) },
      { q: `In which period is the value lowest?`, a: () => meta.labels[minIdx] },
      { q: `Describe the overall trend.`, a: () => "The trend shows fluctuation with a peak around the middle period." },
      { q: `What is the highest observed value?`, a: () => String(max) },
    ],
    pie: [
      { q: `Which segment occupies the largest share?`, a: () => meta.labels[maxIdx] },
      { q: `Which segment has the smallest share?`, a: () => meta.labels[minIdx] },
      { q: `What is the total of all segments?`, a: () => String(sum) },
      { q: `What percentage does the largest segment represent?`, a: () => `${(((max / sum) * 100) as number).toFixed(0)}%` },
    ],
    area: [
      { q: `What is the maximum value reached?`, a: () => String(max) },
      { q: `When does the minimum occur?`, a: () => meta.labels[minIdx] },
      { q: `What is the cumulative total at the end?`, a: () => String(sum) },
    ],
    grouped_bar: [
      { q: `Which group has the highest value in 2024?`, a: () => meta.labels[maxIdx % meta.labels.length] },
      { q: `What is the overall maximum value?`, a: () => String(max) },
      { q: `Compare the two series - which year is larger overall?`, a: () => "2024" },
    ],
  };

  const list = templates[chartType] || templates.bar;
  const t = pick(list);
  return { q: t.q, a: t.a(meta) };
}

// ---------- Build dataset ----------
async function buildDataset() {
  const rows: any[] = [];
  const n = 96; // 96 sample rows
  for (let i = 0; i < n; i++) {
    const g: any = pick(GENERATORS as any);
    const { svg, bboxes, meta } = g.fn();
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = png.toString("base64");
    const { q, a } = genQuestion(g.type, meta);
    const year = randInt(2018, 2024);
    const tagCount = randInt(1, 3);
    const tags: string[] = [];
    for (let k = 0; k < tagCount; k++) {
      const t = pick(TAGS_POOL);
      if (!tags.includes(t)) tags.push(t);
    }
    const id = `chart_${String(i).padStart(3, "0")}`;
    rows.push({
      id,
      image: base64, // PNG bytes encoded as base64
      image_format: "png",
      image_width: W,
      image_height: H,
      image_source: `https://demo.infongraph.local/charts/${id}.png`,
      question: q,
      answer: a,
      question_type: pick(QUESTION_TYPES),
      chart_type: g.type,
      chart_title: meta.title,
      year,
      difficulty: pick(DIFFICULTIES),
      language: pick(LANGUAGES),
      tags,
      extra_input_figure_bboxes: bboxes,
      // A few extra numeric/text columns for richer filtering
      data_points: meta.data.length,
      max_value: Math.max(...meta.data),
      min_value: Math.min(...meta.data),
      mean_value: Number((meta.data.reduce((a, b) => a + b, 0) / meta.data.length).toFixed(2)),
      created_at: new Date(Date.UTC(year, randInt(0, 11), randInt(1, 28))).toISOString(),
    });
    if ((i + 1) % 12 === 0) {
      console.log(`  generated ${i + 1}/${n} rows`);
    }
  }

  // Mark ~6% of rows as having a "missing image" (simulate failures) -> image_source only, image=""
  for (let i = 0; i < rows.length; i++) {
    if (rand() < 0.06) {
      rows[i].image = ""; // simulate URL-only row (image not embedded)
      rows[i]._image_status = "url_only";
    }
  }
  // Mark ~3% of rows as having a "broken" image
  for (let i = 0; i < rows.length; i++) {
    if (rand() < 0.03) {
      rows[i].image = "___invalid_bytes___";
      rows[i]._image_status = "decode_error";
    }
  }

  const schema: { name: string; type: string; nullable: boolean; role: string }[] = [
    { name: "id", type: "string", nullable: false, role: "identifier" },
    { name: "image", type: "bytes", nullable: true, role: "image" },
    { name: "image_format", type: "string", nullable: true, role: "meta" },
    { name: "image_width", type: "int", nullable: true, role: "meta" },
    { name: "image_height", type: "int", nullable: true, role: "meta" },
    { name: "image_source", type: "string", nullable: true, role: "url" },
    { name: "question", type: "string", nullable: false, role: "text" },
    { name: "answer", type: "string", nullable: false, role: "text" },
    { name: "question_type", type: "string", nullable: false, role: "category" },
    { name: "chart_type", type: "string", nullable: false, role: "category" },
    { name: "chart_title", type: "string", nullable: false, role: "text" },
    { name: "year", type: "int", nullable: false, role: "category" },
    { name: "difficulty", type: "string", nullable: false, role: "category" },
    { name: "language", type: "string", nullable: false, role: "category" },
    { name: "tags", type: "list<string>", nullable: true, role: "meta" },
    { name: "extra_input_figure_bboxes", type: "list<float>", nullable: true, role: "meta" },
    { name: "data_points", type: "int", nullable: false, role: "numeric" },
    { name: "max_value", type: "int", nullable: false, role: "numeric" },
    { name: "min_value", type: "int", nullable: false, role: "numeric" },
    { name: "mean_value", type: "float", nullable: false, role: "numeric" },
    { name: "created_at", type: "datetime", nullable: false, role: "meta" },
  ];

  const dataset = {
    name: "Demo InfoChartQA Sample",
    description: "Synthetic chart QA dataset generated for browser demo",
    created_at: new Date().toISOString(),
    files: [
      {
        name: "demo_train.arrow",
        split: "train",
        size_bytes: rows.reduce((acc, r) => acc + (r.image?.length || 0), 0),
        rows_count: rows.length,
        schema,
        rows,
      },
    ],
  };

  const outDir = join(process.cwd(), "public", "demo");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "demo-dataset.json");
  writeFileSync(outPath, JSON.stringify(dataset));
  console.log(`Wrote dataset to ${outPath}`);
  console.log(`  files: ${dataset.files.length}`);
  console.log(`  rows: ${rows.length}`);
  console.log(`  size: ~${(rows.reduce((a, r) => a + (r.image?.length || 0), 0) / 1024 / 1024).toFixed(1)} MB base64`);
}

buildDataset().catch((e) => {
  console.error(e);
  process.exit(1);
});
