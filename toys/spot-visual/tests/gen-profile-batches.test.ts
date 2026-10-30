// 档案批次生成器 + 守护：把「待补档案的 5A/4A 条目」切成 100 条/批的交接清单。
// 与 gen-desc-batches 同一套门控；生成：GEN_PROFILE_BATCHES=1 npx vitest run tests/gen-profile-batches.test.ts
// 守护（每次全量回归都会跑）：profile-batch1..48.json 的 id 并集必须等于
// 「当前待补全集」（5A/4A 且尚无档案数据的条目）且无重复——库发生清洗改名/删除
// 导致清单漂移时，守护会立刻失败，提示重跑生成器，避免外包按过期 id 白写。
//
// 行政区字段（province/city/district）由脚本从「id 城市 + 原始地址」解析：
// 名录地址常把「省+市+县」「市+县+详细地址」重复拼接（如
// 「安徽安庆市桐城市安徽安庆市天柱山景区」），旧版用正则截 city 会得到
// 「安徽安庆市桐」这种半截县名，外包照它推算交通字段会系统性填错。
// 现在 city = id 里的地级市（与页面城市筛选同口径），province/district
// 由地址逐级剥离解析，address 给出折叠重复段后的参考值。
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { SPOT_PROFILES } from "@/lib/spot-profiles.generated";
import { CITY_CENTERS } from "@/lib/city-centers.generated";

const BATCH_DIR = "docs/outsource";
const PER = 100;
const TOTAL_BATCHES = 48;

const MUNICIPALITIES = new Set(["北京", "上海", "天津", "重庆"]);

/**
 * 城市短名候选（来自应用自己的城市中心表）：名录里有少量条目没登记城市
 * （id 形如 scenic--262），但地址里带城市名（如「福建福建龙岩千鹭湖景区」），
 * 用城市表反查即可补上，比留空更可靠。
 */
const CITY_NAMES = Object.keys(CITY_CENTERS)
  .filter((k) => k.length >= 2 && k.length <= 4 && !/[区县州盟市]$/.test(k))
  .sort((a, b) => b.length - a.length);

/** 在地址里找最早出现、且最长的城市短名 */
function cityFromAddress(address: string): string {
  let best = "";
  let bestPos = Infinity;
  for (const name of CITY_NAMES) {
    const pos = address.indexOf(name);
    if (pos < 0) continue;
    if (pos < bestPos || (pos === bestPos && name.length > best.length)) {
      best = name;
      bestPos = pos;
    }
  }
  return best;
}

/** 相邻重复的行政区段折叠：「安徽省安徽省…」→「安徽省…」 */
function collapseRepeats(addr: string): string {
  const SEG = "[^省市区县旗盟]{1,8}?(?:自治区|[省市县旗盟区])";
  const re = new RegExp(`(${SEG})\\1+`, "g");
  let out = addr;
  for (;;) {
    const next = out.replace(re, "$1");
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * 解析行政区：返回 { province, city, district, address }
 * - city 取 id 里的地级市（scenic-安庆-1296 → 安庆），权威且稳定
 * - province 从地址头部「X省/X自治区」取；直辖市用市名
 * - district 从地址剥掉省、市之后的第一个「X区/X县/X旗/X盟/X市」段取
 */
export function resolveAdmin(id: string, rawAddress: string) {
  const idCity = id.match(/^(?:scenic|poi)-(.+?)-\d+$/)?.[1] ?? "";
  const address = collapseRepeats(rawAddress ?? "");

  let rest = address;
  let province = "";
  const pm = rest.match(/^([^省市区县旗盟]{1,8}?(?:省|自治区))/);
  if (pm) {
    province = pm[1];
    rest = rest.slice(pm[1].length);
  }

  let city = idCity;
  let district = "";
  if (idCity) {
    // 地址形如「安徽安庆市桐城市…」「北京北京市延庆区…」「山东青岛市市南区…」：
    // 先在地址里定位城市 token，其前的部分就是省，其后的第一段行政区就是区县。
    const idx = address.indexOf(idCity);
    if (idx >= 0) {
      if (!province) province = address.slice(0, idx);
      rest = address.slice(idx + idCity.length);
      // 「北京北京市延庆区…」：剥掉城市后地址仍以城市名开头（再写一遍），继续剥。
      // 注意只有「城市 token + 市/州/盟/地区」才算城市段——「长沙市长沙县」里的
      // 「长沙」是县名前缀，不能剥。
      const cityHead = (t: string) =>
        t.startsWith(idCity) &&
        /^(?:市|州|盟|地区)/.test(t.slice(idCity.length));
      while (cityHead(rest)) rest = rest.slice(idCity.length);
      // 城市后缀只剥一个（安庆市桐城市 → 桐城市；青岛市市南区 → 市南区）
      rest = rest.replace(/^(?:市|州|盟|地区)/, "");
      // 地址里可能又出现一次完整省市区前缀（「黑龙江伊春市黑龙江省伊春市嘉萌县…」），
      // 循环剥掉前缀里的省与城市，直到剩下的是区县段。
      for (let i = 0; i < 3; i++) {
        const before = rest;
        // 省名前缀不得跨过区县段（否则「越秀区…省总工会」里的「省」会被误当省名）
        const pm2 = rest.match(/^[^省市区县旗盟]{1,8}?(?:省|自治区)/);
        if (pm2) rest = rest.slice(pm2[0].length);
        if (cityHead(rest))
          rest = rest.slice(idCity.length).replace(/^(?:市|州|盟|地区)/, "");
        if (rest === before) break;
      }
    }
  } else {
    // 手工精选条目用数字 id（「1」「10」「14」…），或名录条目本身没登记城市
    // （id 形如 scenic--262）：从地址解析地级市（…市/州/盟/地区 段），
    // 解析不到就用城市中心表反查地址里的城市短名。
    const cm = rest.match(/^([^省市区县旗盟]{2,10}?(?:市|州|盟|地区))/);
    if (cm) {
      city = cm[1].replace(/(?:市|州|盟|地区)$/, "");
      rest = rest.slice(cm[1].length);
    } else {
      const byTable = cityFromAddress(address);
      if (byTable) {
        city = byTable;
        const at = address.indexOf(byTable);
        rest = address
          .slice(at + byTable.length)
          .replace(/^(?:市|州|盟|地区)/, "");
      }
    }
  }

  if (!province && MUNICIPALITIES.has(city)) province = city;

  // 余下的首个行政区段即区县（「桐城市」「市南区」「黄山区」「武陵源区」）。
  // 贪心匹配：黄山|区 要取到「黄山区」而不是「黄区」。
  const dm = rest.match(/^(市?[^省市区县旗盟]{1,10}(?:区|县|旗|盟|市))/);
  district = dm?.[1] ?? "";

  return { province, city, district, address };
}

/** 待补档案全集：5A/4A 且尚无档案数据、有地址的条目 */
function pendingPool() {
  return LIBRARY_SPOTS.filter(
    (s) =>
      (s.level === "5A" || s.level === "4A") &&
      !SPOT_PROFILES[s.id] &&
      s.address,
  ).sort((a, b) => {
    // 5A 优先（访问量最大），同级按 id 稳定排序
    if ((a.level === "5A") !== (b.level === "5A"))
      return a.level === "5A" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function loadBatches(): { ids: string[]; dups: string[]; files: number } {
  const ids: string[] = [];
  const dups: string[] = [];
  let files = 0;
  for (let n = 1; n <= TOTAL_BATCHES; n++) {
    const p = `${BATCH_DIR}/profile-batch${n}.json`;
    if (!existsSync(p)) continue;
    files++;
    const b = JSON.parse(readFileSync(p, "utf8"));
    for (const i of b.items) {
      if (ids.includes(i.id)) dups.push(i.id);
      ids.push(i.id);
    }
  }
  return { ids, dups, files };
}

describe("profile batches", () => {
  it("守护：48 批 id 并集 == 当前待补全集且无重复", () => {
    const { ids, dups, files } = loadBatches();
    expect(files, "交接清单应有 48 个批次文件").toBe(TOTAL_BATCHES);
    expect(dups, `清单内 id 重复: ${dups.slice(0, 5)}`).toEqual([]);

    const pool = pendingPool();
    const poolSet = new Set(pool.map((s) => s.id));
    const batchSet = new Set(ids);
    const missing = pool.filter((s) => !batchSet.has(s.id));
    const ghost = [...batchSet].filter((id) => !poolSet.has(id));
    expect(
      missing.map((s) => s.id),
      `库内待补条目未入清单（重跑生成器）: ${missing.length} 条`,
    ).toEqual([]);
    expect(
      ghost,
      `清单里的 id 已不在待补池（库已清洗/删除，重跑生成器）: ${ghost.slice(0, 5)}`,
    ).toEqual([]);
    expect(ids.length, "清单总数应等于待补池大小").toBe(pool.length);
  });

  it("守护：清单里的行政区字段与库重算结果一致", () => {
    // 旧版生成器用正则从地址截 city，会得到「安徽安庆市桐」这种半截县名，
    // 外包照它推算交通字段会系统性填错。这里按 id 回库重算一遍，
    // 逐字段比对清单里的 province/city/district——清单与算法漂移即失败。
    const byId = new Map(LIBRARY_SPOTS.map((s) => [s.id, s]));
    const bad: string[] = [];
    for (let n = 1; n <= TOTAL_BATCHES; n++) {
      const p = `${BATCH_DIR}/profile-batch${n}.json`;
      if (!existsSync(p)) continue;
      const b = JSON.parse(readFileSync(p, "utf8"));
      for (const it of b.items) {
        const spot = byId.get(it.id);
        if (!spot) {
          bad.push(`批${n} ${it.id} 不在库里`);
          continue;
        }
        const want = resolveAdmin(it.id, spot.address);
        if (it.city !== want.city)
          bad.push(`批${n} ${it.id} city="${it.city}" 应为 "${want.city}"`);
        if (it.province !== want.province)
          bad.push(
            `批${n} ${it.id} province="${it.province}" 应为 "${want.province}"`,
          );
        if (it.district !== want.district)
          bad.push(
            `批${n} ${it.id} district="${it.district}" 应为 "${want.district}"`,
          );
      }
    }
    expect(
      bad.slice(0, 8),
      `行政区字段与库不一致，重跑生成器: ${bad.length} 条`,
    ).toEqual([]);
  });

  it("生成器：GEN_PROFILE_BATCHES=1 时重写 48 批清单", () => {
    if (!process.env.GEN_PROFILE_BATCHES) {
      console.log("GEN_PROFILE_BATCHES 未设置，跳过生成");
      return;
    }
    const pool = pendingPool();
    let n = 0;
    for (let i = 0; i < pool.length; i += PER) {
      n++;
      const slice = pool.slice(i, i + PER);
      const out = {
        task: `景点档案结构化字段-批${n}（${n <= 4 ? "5A" : "4A"}）`,
        batch: n,
        count: slice.length,
        rules: "见 TASK-SPOT-PROFILE.md",
        items: slice.map((s) => {
          const admin = resolveAdmin(s.id, s.address);
          return {
            id: s.id,
            name: s.name,
            province: admin.province,
            city: admin.city,
            district: admin.district,
            level: s.level,
            address: admin.address,
            category: s.category,
          };
        }),
      };
      writeFileSync(
        `${BATCH_DIR}/profile-batch${n}.json`,
        JSON.stringify(out, null, 2),
        "utf8",
      );
    }
    console.log(`重写 ${n} 批（池 ${pool.length} 条）`);
    expect(n).toBe(TOTAL_BATCHES);
  });
});
