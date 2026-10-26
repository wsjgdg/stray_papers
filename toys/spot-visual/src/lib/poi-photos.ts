// 景点详情相册（多图）按需加载。
//
// 为什么单独拆出来：1356 个 POI 的多图共约 237KB，只在详情弹窗的相册里用到。
// 放在 city-pois.generated.ts 里会随首页一起进主包，首屏白背一坨用不上的数据
// （实测首页最大 chunk 1157KB / 354KB gzip）。现在封面图仍在主包（网格要用），
// 多图走 /data/poi-photos.json 懒加载，打开第一个详情时拉一次并常驻内存。
import { withSharecode } from "./share-link";

type PhotoMap = Record<string, string[]>;

let cache: PhotoMap | null = null;
let inflight: Promise<PhotoMap> | null = null;

/** 拉取（或复用）多图表；失败返回空对象，不阻塞弹窗 */
export function loadPoiPhotos(): Promise<PhotoMap> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(withSharecode("/data/poi-photos.json"))
    .then((r) => (r.ok ? r.json() : ({} as PhotoMap)))
    .catch(() => ({}) as PhotoMap)
    .then((m: PhotoMap) => {
      cache = m ?? {};
      inflight = null;
      return cache;
    });
  return inflight;
}

/** 已加载则同步取；未加载返回 undefined（调用方按「只有封面」处理） */
export function peekPoiPhotos(key?: string): string[] | undefined {
  if (!cache || !key) return undefined;
  return cache[key];
}
