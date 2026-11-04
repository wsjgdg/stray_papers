// Reads one downloaded `aetheris-performance-v1` report and prints what it can and cannot support.
// This is a reader, not a test: it never fails the bench and never turns a measurement into an acceptance.
// The page's own recorder keeps the live scene running; this only re-sums the JSON it wrote, so every
// number below is either copied from the file or a plain statistic over its samples.
//
// Usage: node analyze_device_report.mjs /path/to/return.json [more.json ...]
// Exit code is 0 even for a thin report; an unreadable or foreign file is a usage error (exit 2).
import fs from 'node:fs';

const PERF_FIELDS = ['rafIntervalMs', 'cameraWallMs', 'worldWallMs', 'patchWallMs', 'qualityWallMs',
  'renderCallWallMs', 'codexScanWallMs', 'gpuMs'];
// Stride hypotheses that exist in the page's loop: shadow refresh (`shadowStride` per tier/mode),
// flora geometry swap (`frame % 12`), marker update (`frame % 2`).
const STRIDES = [2, 3, 8, 10, 12, 14, 20];

const round = (v, digits = 2) => (Number.isFinite(v) ? Number(v.toFixed(digits)) : null);
/** Same order statistic the page's `perfStats` uses, so these numbers reconcile with the file's summary. */
const p95 = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : null;
};
const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b), n = sorted.length;
  if (!n) return null;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
const column = values => {
  const present = values.filter(Number.isFinite);
  return { count: present.length, median: median(present), p95: p95(present), max: present.length ? Math.max(...present) : null };
};
const fmt = stat => (stat.count
  ? `n=${String(stat.count).padStart(4)}  med=${String(round(stat.median)).padStart(7)}  p95=${String(round(stat.p95)).padStart(7)}  max=${String(round(stat.max)).padStart(7)}`
  : 'n=   0  (no samples)');
const list = values => values.join(', ') || 'none';

function analyze(file) {
  let report;
  try { report = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { console.error(`cannot read ${file}: ${error.message}`); process.exit(2); }
  if (report?.schema !== 'aetheris-performance-v1' || !Array.isArray(report.samples)) {
    console.error(`${file}: not an aetheris-performance-v1 report`); process.exit(2);
  }

  const samples = report.samples, frames = samples.length;
  const raf = samples.map(s => s.rafIntervalMs).filter(Number.isFinite);
  const drops = samples.filter(s => Number.isFinite(s.rafIntervalMs) && s.rafIntervalMs > 17.5);
  const stageSum = samples.map(s => (s.cameraWallMs ?? 0) + (s.worldWallMs ?? 0) + (s.patchWallMs ?? 0) +
    (s.qualityWallMs ?? 0) + (s.renderCallWallMs ?? 0));

  console.log(`\n══ ${file}`);
  console.log(`  build ${report.build}  status ${report.status}${report.reason ? ' (' + report.reason + ')' : ''}  ` +
    `sampled ${round(report.sampledDurationMs, 1)} ms of ${report.requestedDurationMs} ms  at ${report.startedAt}`);

  // ── Integrity: what makes a report usable at all, before any judgement about speed.
  const modes = [...new Set(samples.map(s => s.mode))];
  const tiers = [...new Set(samples.map(s => s.tier))];
  const checks = [
    ['status is completed', report.status === 'completed'],
    ['sampled the requested duration', report.sampledDurationMs >= report.requestedDurationMs],
    ['one RAF interval per frame after the first', raf.length === frames - 1],
    ['no transition frames inside the sample', samples.every(s => !s.transition)],
    ['every sample reports a render wall time', samples.every(s => Number.isFinite(s.renderCallWallMs))],
    ['frames below the 8192 sample cap', frames < 8192]
  ];
  for (const [name, ok] of checks) console.log(`  ${ok ? 'OK  ' : 'BAD '} ${name}`);
  console.log(`  scene: mode=[${list(modes)}] tier=[${list(tiers)}] weather=[${list([...new Set(samples.map(s => s.weather))])}]` +
    `  canvas ${samples[0]?.canvasWidth}×${samples[0]?.canvasHeight} @PR ${samples[0]?.pixelRatio}` +
    `  viewport ${samples[0]?.viewportWidth}×${samples[0]?.viewportHeight}`);
  const env = report.environment || {};
  console.log(`  browser: ${env.browser}\n  gpu:     ${env.gpu}`);
  console.log(`  antialias: requested=${env.antialiasRequested} actual=${env.antialiasActual} mode=${env.antialiasMode}` +
    `  three=${env.three}`);
  const gpuTimer = report.gpuTimer || {};
  console.log(`  gpu timer: supported=${gpuTimer.supported} issued=${gpuTimer.issued} completed=${gpuTimer.completed}` +
    ` skipped=${gpuTimer.skippedPendingLimit} dropped=${gpuTimer.dropped} disjoint=${gpuTimer.disjointEvents}`);

  // ── Read-out. RAF is a callback interval, not presentation; the page's notes say so too.
  console.log('\n  ── stage wall times (ms, this callback) ──');
  for (const field of PERF_FIELDS) console.log(`  ${field.padEnd(18)} ${fmt(column(samples.map(s => s[field])))}`);
  console.log(`  ${'cpuStageSum'.padEnd(18)} ${fmt(column(stageSum))}   ← camera+world+patch+quality+renderCall`);
  console.log(`  ${'drawCalls'.padEnd(18)} ${fmt(column(samples.map(s => s.drawCalls)))}`);
  console.log(`  ${'triangles'.padEnd(18)} ${fmt(column(samples.map(s => s.triangles)))}`);

  // ── How the misses look. One 60 Hz deadline missed shows up as ≈33.4 ms, not as a smooth slowdown.
  const buckets = { '≤17.5 (kept 60 Hz)': 0, '17.5–25': 0, '25–35 (one vsync missed)': 0, '35–60': 0, '>60': 0 };
  for (const v of raf) {
    if (v <= 17.5) buckets['≤17.5 (kept 60 Hz)']++;
    else if (v <= 25) buckets['17.5–25']++;
    else if (v <= 35) buckets['25–35 (one vsync missed)']++;
    else if (v <= 60) buckets['35–60']++;
    else buckets['>60']++;
  }
  console.log('\n  ── RAF interval distribution ──');
  for (const [name, count] of Object.entries(buckets)) {
    if (count) console.log(`  ${name.padEnd(26)} ${String(count).padStart(5)}  ${(100 * count / raf.length).toFixed(1)}%`);
  }
  const runs = [];
  let run = 0;
  for (const s of samples) {
    if (Number.isFinite(s.rafIntervalMs) && s.rafIntervalMs > 17.5) run++;
    else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);
  const runLengthsTaken = [...new Set(runs)].sort((a, b) => a - b).map(n => `${n}×${runs.filter(r => r === n).length}`);
  console.log(`  dropped frames ${drops.length} in ${runs.length} runs (run length: ${list(runLengthsTaken)})`);
  const firstSecond = drops.filter(s => s.elapsedMs < 1000).length;
  const firstSecondFrames = samples.filter(s => Number.isFinite(s.rafIntervalMs) && s.elapsedMs < 1000).length;
  if (drops.length) {
    console.log(`  first second: ${firstSecond} dropped of ${firstSecondFrames} intervals` +
      ` (${(100 * firstSecond / Math.max(1, firstSecondFrames)).toFixed(0)}%)` +
      `; rest: ${round((drops.length - firstSecond) / ((report.sampledDurationMs - 1000) / 1000), 1)}/s`);
  }

  // ── Candidate periodic sources. If a burst of misses lines up with one residue class far above chance,
  // that cadence is worth a controlled check; if it does not, the misses are not explained by it.
  const dropIndices = samples.map((s, i) => (Number.isFinite(s.rafIntervalMs) && s.rafIntervalMs > 17.5 ? i : -1))
    .filter(i => i >= 0);
  const starts = dropIndices.filter((i, k) => k === 0 || dropIndices[k - 1] !== i - 1);
  console.log('\n  ── alignment of miss bursts with in-page cadences ──');
  console.log('  (chance line = 1/stride; only clearly above it would suggest that cadence)');
  for (const stride of STRIDES) {
    const counts = new Map();
    for (const i of starts) counts.set(i % stride, (counts.get(i % stride) ?? 0) + 1);
    const top = Math.max(0, ...counts.values());
    console.log(`  frame % ${String(stride).padStart(2)}  top residue share ${(top / Math.max(1, starts.length)).toFixed(2)}` +
      `  (chance ${(1 / stride).toFixed(2)})`);
  }

  // ── Drift check: a short window cannot prove thermal or long-run stability, only whether it is visible here.
  console.log('\n  ── 5 s windows (gpu median only where queries completed) ──');
  for (let start = 0; start < report.sampledDurationMs; start += 5000) {
    const seg = samples.filter(s => s.elapsedMs >= start && s.elapsedMs < start + 5000);
    if (seg.length < 2) continue;
    const segRaf = seg.map(s => s.rafIntervalMs).filter(Number.isFinite);
    const segDrops = segRaf.filter(v => v > 17.5).length;
    console.log(`  ${String(start / 1000).padStart(2)}–${String(start / 1000 + 5).padStart(2)} s  frames=${String(seg.length).padStart(4)}` +
      `  drops=${String(segDrops).padStart(3)}  gpuMed=${String(round(median(seg.map(s => s.gpuMs)))).padStart(6)}` +
      `  renderMed=${String(round(median(seg.map(s => s.renderCallWallMs)))).padStart(6)}`);
  }

  // ── Plain-language limits, restated per report so a quote never travels without them.
  console.log(`\n  ── what this file is not ──`);
  console.log(`  • RAF interval is a callback spacing, and a miss is visible only as one dropped vsync.`);
  console.log(`  • renderCallWallMs is JS time inside the render call, not GPU completion.`);
  console.log(`  • GPU queries completed ${gpuTimer.completed ?? 0} of ${gpuTimer.issued ?? 0} issued; each covers submitted WebGL work only.`);
  console.log(`  • mode=[${list(modes)}] — a verdict needs orbit and ground captured separately.`);
  if (!/Android|iPhone|iPad|Mobile|HarmonyOS/i.test(env.browser || '')) {
    console.log(`  • the user agent is not a phone, so none of the mobile items in DEVICE_ACCEPTANCE.md are covered.`);
  }
  console.log('');
}

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node analyze_device_report.mjs <return.json> [more.json ...]'); process.exit(2); }
for (const file of files) analyze(file);
