/**
 * 验收两条外包流水线（描述 / 档案）：正向能合入、反向必须整批拒绝。
 *
 * 为什么现在就验：外部 AI 的 15 批描述 + 48 批档案还没交回来，
 * 但合并器已经落地了。等到真数据回来再验，一旦合并器有 bug，
 * 那 63 批的返工成本是几十倍。现在用合成数据把两条链走通，
 * 真数据回来时只需要跑一遍 merge，不用再碰代码。
 *
 * 用法: node scripts/verify-outsource-pipelines.mjs
 * 用完会把仓库状态完整还原（两张生成表 + 两份累积存档 + 合并器写出的
 * qc 抽检文件），可以放心反复跑。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
/** 固定文件：两张生成表 + 两份累积存档 */
const BACKUPS = {
  "src/lib/scenic-desc-outsource.generated.ts": null,
  "src/lib/spot-profiles.generated.ts": null,
  "docs/outsource/out-desc-4a-merged.json": null,
  "docs/outsource/out-profile-merged.json": null,
};
/**
 * 合并器写出的 qc 抽检文件：按 glob 全量纳入，而不是写死 batch1。
 * 写死的话，批 2+ 交付后跑一次验收就会留下 qc-desc-batch2.json 等残留，
 * 内容是合成数据的 id，足以让人误判「该批已交付」并去抽检假数据。
 */
const QC_GLOB = /^qc-(desc|profile)-batch\d+\.json$/;

const listQcFiles = () =>
  fs
    .readdirSync(path.resolve("docs/outsource"))
    .filter((f) => QC_GLOB.test(f))
    .map((f) => `docs/outsource/${f}`);

const backup = () => {
  for (const f of Object.keys(BACKUPS)) {
    const p = path.resolve(f);
    BACKUPS[f] = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }
  for (const f of listQcFiles()) {
    const p = path.resolve(f);
    BACKUPS[f] = fs.readFileSync(p, "utf8");
  }
};
const restore = () => {
  for (const [f, content] of Object.entries(BACKUPS)) {
    const p = path.resolve(f);
    if (content === null) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      fs.writeFileSync(p, content, "utf8");
    }
  }
  // 运行期新产生的 qc 文件（备份时还不存在）也要删掉，否则会留下「该批已交付」的假信号
  for (const f of listQcFiles()) {
    if (!(f in BACKUPS)) fs.unlinkSync(path.resolve(f));
  }
};

const run = (script, arg) => {
  try {
    execFileSync(process.execPath, [script, arg], { stdio: "pipe" });
    return { code: 0 };
  } catch (e) {
    return { code: e.status ?? -1, out: String(e.stdout || "").slice(0, 200) };
  }
};

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
};

// ── 合成数据 ──────────────────────────────────────────────────────────────
const descBatch = JSON.parse(
  fs.readFileSync("docs/outsource/desc-4a-batch1.json", "utf8"),
);
const profBatch = JSON.parse(
  fs.readFileSync("docs/outsource/profile-batch1.json", "utf8"),
);

const N = descBatch.items.length; // 合并器按整批验收条数，合成数据必须整批
const PN = profBatch.items.length;
const descItems = descBatch.items;
const profItems = profBatch.items;
// 60–110 字、不含禁写词的合规描述（模板 + 名字，不足则补、超了则截）
const goodDesc = (name) => {
  let s =
    `${name}地处所在区域的山水之间，主体景观与周边村落、植被共同构成完整的游览面，` +
    `四季皆有可观之处，是当地代表性的游览目的地。`;
  const pad = [
    "区域内步道与观景平台等配套设施较为完善。",
    "周边村落保留了较完整的传统格局与生活方式。",
    "山体、水体与植被共同构成层次分明的景观结构。",
  ];
  let i = 0;
  while (s.length < 60 && i < pad.length) s += pad[i++];
  return s.length > 110 ? s.slice(0, 110) : s;
};

const writeDesc = (file, items, mutate = () => {}) => {
  const out = {
    task: descBatch.task,
    batch: 1,
    count: items.length,
    items: items.map((it) => {
      const o = { id: it.id, name: it.name, desc: goodDesc(it.name) };
      mutate(o, it);
      return o;
    }),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
};
const writeProf = (file, items, mutate = () => {}) => {
  const out = {
    task: profBatch.task,
    batch: 1,
    count: items.length,
    items: items.map((it) => {
      const o = {
        id: it.id,
        name: it.name,
        profile: {
          ticketPeak: 60,
          ticketOff: 40,
          ticketNote: "内部索道另计",
          freePolicy: "学生半价",
          openHours: "08:30-17:00（16:00停止入园）",
          suggestedHours: 3,
          bestMonths: "4-5月、9-10月",
          nearestAirport: null,
          nearestRail: null,
          driveFromCityMin: 45,
          accessibility: ["无障碍通道"],
          needReservation: false,
          reservationNote: null,
          officialSite: null,
          tel: null,
          notices: null,
        },
        confidence: "high",
      };
      mutate(o, it);
      return o;
    }),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
};

const TMP = "C:/tmp";
const D_OK = `${TMP}/out-desc-4a-batch1.json`;
const P_OK = `${TMP}/out-profile-batch1.json`;

backup();

try {
  // ══ 正向：合规批次必须合入 ══
  writeDesc(D_OK, descItems);
  let r = run("scripts/merge-out-desc.mjs", D_OK);
  const mergedDesc = JSON.parse(
    fs.readFileSync("docs/outsource/out-desc-4a-merged.json", "utf8"),
  );
  check(
    "描述·正向合入 5 条",
    r.code === 0 && Object.keys(mergedDesc).length === N,
    `exit=${r.code} 落键 ${Object.keys(mergedDesc).length}`,
  );

  writeProf(P_OK, profItems);
  r = run("scripts/merge-out-profile.mjs", P_OK);
  const mergedProf = JSON.parse(
    fs.readFileSync("docs/outsource/out-profile-merged.json", "utf8"),
  );
  check(
    "档案·正向合入 5 条",
    r.code === 0 && Object.keys(mergedProf).length === PN,
    `exit=${r.code} 落键 ${Object.keys(mergedProf).length}`,
  );

  // 落键必须是 id 而不是名字（同名跨市串写的根子就在这里）
  const keysAreIds = Object.keys(mergedDesc).every((k) =>
    descItems.some((it) => it.id === k),
  );
  check("描述·按 id 落键（不是按名字）", keysAreIds);
  const profKeysAreIds = Object.keys(mergedProf).every((k) =>
    profItems.some((it) => it.id === k),
  );
  check("档案·按 id 落键（不是按名字）", profKeysAreIds);

  // 幂等：再跑一次不该炸也不该翻倍
  r = run("scripts/merge-out-desc.mjs", D_OK);
  const again = JSON.parse(
    fs.readFileSync("docs/outsource/out-desc-4a-merged.json", "utf8"),
  );
  check("描述·重复运行幂等", r.code === 0 && Object.keys(again).length === N);

  // ══ 反向：任一硬违规必须整批拒绝 ══
  const cases = [
    ["条数不足", (o, it, arr) => arr.splice(1, 1)],
    ["id 未回填", (o) => delete o.id],
    ["name 改了一个字", (o) => (o.name = o.name + "区")],
    ["描述过短", (o) => (o.desc = "很短")],
    [
      "描述含禁写词",
      (o) => (o.desc = o.desc.slice(0, 50) + "门票60元开放时间8点"),
    ],
  ];
  for (const [label, mutate] of cases) {
    const f = `${TMP}/bad-desc.json`;
    const items = descBatch.items.map((it) => ({
      id: it.id,
      name: it.name,
      desc: goodDesc(it.name),
    }));
    if (label === "条数不足") items.splice(1, 1);
    else mutate(items[0]);
    fs.writeFileSync(
      f,
      JSON.stringify(
        { task: descBatch.task, batch: 1, count: items.length, items },
        null,
        2,
      ),
    );
    const before = Object.keys(
      JSON.parse(
        fs.readFileSync("docs/outsource/out-desc-4a-merged.json", "utf8"),
      ),
    ).length;
    const rr = run("scripts/merge-out-desc.mjs", f);
    const after = Object.keys(
      JSON.parse(
        fs.readFileSync("docs/outsource/out-desc-4a-merged.json", "utf8"),
      ),
    ).length;
    check(
      `描述·拒绝「${label}」`,
      rr.code === 1 && after === before,
      `exit=${rr.code} 落键 ${before}→${after}`,
    );
  }

  const pcases = [
    ["id 未回填", (o) => delete o.id],
    ["name 改了一个字", (o) => (o.name = o.name + "景区")],
    ["票价为负", (o) => (o.profile.ticketPeak = -5)],
    ["时长越界 40h", (o) => (o.profile.suggestedHours = 40)],
    ["车程越界 9999", (o) => (o.profile.driveFromCityMin = 9999)],
    ["闭集外词", (o) => (o.profile.accessibility = ["海底隧道"])],
    ["必填为空未标 low", (o) => (o.profile.ticketPeak = null)],
  ];
  for (const [label, mutate] of pcases) {
    const f = `${TMP}/bad-prof.json`;
    const items = profBatch.items.map((it) => ({
      id: it.id,
      name: it.name,
      profile: {
        ticketPeak: 60,
        ticketOff: 40,
        openHours: "08:30-17:00",
        suggestedHours: 3,
        driveFromCityMin: 45,
        accessibility: ["无障碍通道"],
        needReservation: false,
      },
      confidence: "high",
    }));
    mutate(items[0]);
    fs.writeFileSync(
      f,
      JSON.stringify(
        { task: profBatch.task, batch: 1, count: items.length, items },
        null,
        2,
      ),
    );
    const before = Object.keys(
      JSON.parse(
        fs.readFileSync("docs/outsource/out-profile-merged.json", "utf8"),
      ),
    ).length;
    const rr = run("scripts/merge-out-profile.mjs", f);
    const after = Object.keys(
      JSON.parse(
        fs.readFileSync("docs/outsource/out-profile-merged.json", "utf8"),
      ),
    ).length;
    check(
      `档案·拒绝「${label}」`,
      rr.code === 1 && after === before,
      `exit=${rr.code} 落键 ${before}→${after}`,
    );
  }
} finally {
  restore();
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} 通过` +
    (failed.length ? `\n失败项：${failed.map((f) => f.name).join("、")}` : ""),
);
process.exit(failed.length ? 1 : 0);
