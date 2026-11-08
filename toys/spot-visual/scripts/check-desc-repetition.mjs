/**
 * 描述重复度门禁：专抓「机器兜底模板」这种内容农场式的失败。
 *
 * 为什么需要：六十七轮实测——外部 agent 额度耗尽时，把大批低知名度条目写成
 * 同一句模板尾巴（「近年陆续完善了停车、公厕与标识等游览设施」等 5 句各重复 60 次，
 * 占全批 20%），机器校验（长度/禁写词/id 对齐）**全部通过**，但用户看到的是
 * 成片重复的机器文案。只靠现有验收器抓不住，必须单独加一道重复度门禁。
 *
 * 用法：
 *   node scripts/check-desc-repetition.mjs docs/outsource/out-desc-4a-batch2.json
 *   node scripts/check-desc-repetition.mjs <file...> --max-repeat=3 --max-low-ratio=0.5
 *
 * 检查项：
 *   1. 同一句（按「。」「；」切分）在全批内出现 ≥ max-repeat 次 → 违规；
 *   2. 两条描述完全相同 → 违规；
 *   3. confidence=low 的占比 > max-low-ratio → 违规（low 是「没把握」，不是「批量兜底」）；
 *   4. 开头 12 字重复 ≥5 次 → 提示（开头模板化）。
 *
 * 退出码：0 = 通过；1 = 有违规（逐条打印）；2 = 用法错误。
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const numOpt = (k, d) => {
  const v = args.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  return v ? Number(v) : d;
};
const maxRepeat = numOpt("max-repeat", 3);
const maxLowRatio = numOpt("max-low-ratio", 0.5);

if (!files.length) {
  console.error(
    "用法: node scripts/check-desc-repetition.mjs <out-desc-*.json> [--max-repeat=N] [--max-low-ratio=0.x]",
  );
  process.exit(2);
}

const splitSentences = (d) =>
  d
    .split(/[。；]/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`✗ 找不到文件 ${file}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = Array.isArray(raw) ? raw : (raw.items ?? []);
  if (!items.length) {
    console.error(`✗ ${file} 里没有 items`);
    process.exit(1);
  }

  const problems = [];

  // 1) 高频重复句
  const counts = new Map();
  for (const it of items) {
    for (const s of splitSentences(String(it.desc ?? ""))) {
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
  }
  const reps = [...counts.entries()]
    .filter(([, n]) => n >= maxRepeat)
    .sort((a, b) => b[1] - a[1]);
  for (const [s, n] of reps) {
    problems.push(
      `句子重复 ${n} 次（≥${maxRepeat}，占全批 ${((n / items.length) * 100).toFixed(0)}%）：${s.slice(0, 40)}`,
    );
  }

  // 2) 完全相同的整条描述
  const whole = new Map();
  for (const it of items) {
    const d = String(it.desc ?? "");
    whole.set(d, (whole.get(d) ?? 0) + 1);
  }
  for (const [d, n] of [...whole.entries()].filter(([, n]) => n > 1)) {
    problems.push(`整条描述重复 ${n} 次：${d.slice(0, 30)}`);
  }

  // 3) low 占比（low 是「没把握」，不是「批量兜底」）
  const low = items.filter((i) => i.confidence === "low").length;
  const lowRatio = low / items.length;
  if (lowRatio > maxLowRatio) {
    problems.push(
      `low confidence 占比 ${(lowRatio * 100).toFixed(0)}%（上限 ${(maxLowRatio * 100).toFixed(0)}%）：` +
        `整批 ${low} 条都是兜底，等于没写。宁可写得更短更泛，也不要批量套模板。`,
    );
  }

  // 4) 开头模板化（提示级）
  const heads = new Map();
  for (const it of items) {
    const h = String(it.desc ?? "").slice(0, 12);
    if (h.length < 12) continue;
    heads.set(h, (heads.get(h) ?? 0) + 1);
  }
  const dupHeads = [...heads.entries()].filter(([, n]) => n >= 5);

  console.log(
    `── ${file}：${items.length} 条｜low ${low}（${(lowRatio * 100).toFixed(0)}%）｜重复句 ${reps.length} 种`,
  );
  if (dupHeads.length)
    console.log(
      `   提示：开头 12 字重复 ≥5 次的写法 ${dupHeads.length} 种（例：${dupHeads[0][0]} ×${dupHeads[0][1]}）`,
    );

  if (problems.length) {
    console.error(`✗ ${problems.length} 处违规：`);
    problems.slice(0, 25).forEach((p) => console.error(`   - ${p}`));
    if (problems.length > 25)
      console.error(`   … 另有 ${problems.length - 25} 处`);
    process.exitCode = 1;
  } else {
    console.log("✓ 重复度门禁通过");
  }
}
