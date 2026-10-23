// ════════════════════════════════════════════════════════════════════════
// 菜品图片接入位
//
// 现状：暂无真实菜品照片。
// 已核查的可选图源与结论：
// - Wikimedia Commons / upload.wikimedia.org：本机与沙箱网络不可达（HTTP 000）
// - Unsplash / Pexels 搜索 API：接口可达（api.unsplash.com / api.pexels.com），
//   但项目未配置 UNSPLASH_ACCESS_KEY / PEXELS_API_KEY，且其图库对「麻婆豆腐」
//   这类具体中国菜品的命中率很低，硬套会造成「图不对菜」的错误信息
// - GitHub 上的中文菜品数据集（ChineseFoodNet / Food-530 等）：SATA 等研究许可，
//   体积 20GB 级，不提供可直接引用的图片直链，不适合随前端发布
//
// 因此这里只保留数据契约：往 DISH_PHOTOS 里按菜名补一条 { src, credit, license }，
// 详情面板就会自动把卡面替换为真实照片，无需改动组件逻辑。
// src 建议放 public/dishes/ 下的本地文件，避免依赖外网与防盗链。
// ════════════════════════════════════════════════════════════════════════

export interface DishPhoto {
  /** 图片地址，建议 /dishes/xxx.jpg（本地静态资源） */
  src: string;
  /** 作者 / 来源，用于署名（CC-BY-SA 等协议要求） */
  credit?: string;
  /** 许可协议，如 CC0 / CC-BY-SA-4.0 */
  license?: string;
  /** 焦点位置，用于 object-position，默认 50% 50% */
  focus?: string;
}

/** 菜名 → 照片。为空即全部走本地生成卡面（当前状态）。 */
export const DISH_PHOTOS: Record<string, DishPhoto> = {};

export function getDishPhoto(dish: string): DishPhoto | undefined {
  return DISH_PHOTOS[dish];
}
