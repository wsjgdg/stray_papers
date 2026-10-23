// ════════════════════════════════════════════════════════════════════════
// 菜品图片接入位
//
// 现状：等待人工供图。图片一律放在 public/dishes/，随前端本地打包，
// 不引用任何境外图床（Wikimedia 等在国内不可达，实测 upload.wikimedia.org 直接 000）。
//
// 供图方式：
//   1. 把图片放进 public/dishes/，文件名带上菜名即可，如 `麻婆豆腐.jpg`、`四川-麻婆豆腐.jpg`
//   2. 需要署名/协议的，写 public/dishes/credits.json
//   3. 跑 `npm run photos`，自动生成 dish-photos.generated.ts
// 没有照片的菜继续走本地生成的口味卡面，不会出现裂图。
// ════════════════════════════════════════════════════════════════════════
import { GENERATED_DISH_PHOTOS } from './dish-photos.generated';

export interface DishPhoto {
  /** 图片地址，/dishes/xxx.jpg（本地静态资源） */
  src: string;
  /** 作者 / 来源，用于署名（CC-BY-SA 等协议要求） */
  credit?: string;
  /** 许可协议，如 CC0 / CC-BY-SA-4.0 / 已获授权 */
  license?: string;
  /** 焦点位置，用于 object-position，默认 50% 50% */
  focus?: string;
}

/** 手工覆盖位：需要临时替换某道菜的图时写在这里，优先级高于自动生成清单。 */
export const DISH_PHOTOS: Record<string, DishPhoto> = {
  ...GENERATED_DISH_PHOTOS,
};

export function getDishPhoto(dish: string): DishPhoto | undefined {
  return DISH_PHOTOS[dish];
}
