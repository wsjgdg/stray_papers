// 城市包 POI 的「相册多图」已从主包搬到 public/data/poi-photos.json。
// 这里守住三条不变量，避免以后重新生成 POI 包时把多图又写回 JS（首屏会白白变重）：
//   1) LIBRARY_SPOTS 里的 POI 只有 photosKey，没有内联 photos；
//   2) 每个 photosKey 都能在 poi-photos.json 里找到；
//   3) 相册里的图不与封面重复。
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIBRARY_SPOTS } from "@/lib/spot-data";
import { CITY_POI_PACKS } from "@/lib/city-pois.generated";

const PHOTOS = JSON.parse(
  fs.readFileSync(path.resolve("public/data/poi-photos.json"), "utf8"),
) as Record<string, string[]>;

describe("POI 相册懒加载数据", () => {
  const poiSpots = LIBRARY_SPOTS.filter((s) => s.photosKey);

  it("城市包 POI 带 photosKey 且不再内联 photos", () => {
    expect(poiSpots.length).toBeGreaterThan(1000);
    for (const s of poiSpots) {
      expect(typeof s.photosKey).toBe("string");
      expect(s.photosKey).toContain("::");
      expect(s.photos).toBeUndefined();
    }
  });

  it("poi-photos.json 的键都能对应到真实 POI（无过期键），覆盖率高", () => {
    // 注意：LIBRARY_SPOTS 会剔除与手工精选景点同名的 POI，所以键集合要用原始城市包算
    const keys = new Set(
      Object.entries(CITY_POI_PACKS).flatMap(([city, list]) =>
        list.map((p) => `${city}::${p.name}`),
      ),
    );
    // 没有多余键：JSON 里不该留下已经不存在的 POI
    const stale = Object.keys(PHOTOS).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
    // 少数 POI 只有一张图（封面即全部），因此相册为空是合法的；但覆盖率要够高
    const covered = poiSpots.filter(
      (s) => (PHOTOS[s.photosKey!] ?? []).length > 0,
    );
    expect(covered.length / poiSpots.length).toBeGreaterThan(0.95);
  });

  it("相册图不与封面重复，且都是 http(s) 直链", () => {
    const bad: string[] = [];
    for (const s of poiSpots) {
      for (const url of PHOTOS[s.photosKey!] ?? []) {
        if (url === s.image) bad.push(`dup:${s.photosKey}`);
        if (!/^https?:\/\//.test(url)) bad.push(`bad:${s.photosKey}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("未拆分版本不会回流：源文件里不应再出现 photos 字段声明", () => {
    const src = fs.readFileSync(
      path.resolve("src/lib/city-pois.generated.ts"),
      "utf8",
    );
    expect(src.includes("photos: string[]")).toBe(false);
    // 数据体里也不应有 "photos": [...]
    expect(/"photos"\s*:/.test(src)).toBe(false);
  });
});
