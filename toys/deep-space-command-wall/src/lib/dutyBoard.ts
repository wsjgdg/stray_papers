// 全球值班网络模拟排行榜席位（纯前端虚构, 分数固定; 玩家总分插入后重排名次）。
// 独立成 lib 模块: 结算单组件按需分包后, 主逻辑层构建结算数据仍需该常量, 避免把弹层 UI 拖回主包。
export const GLOBAL_DUTY_BOARD: { name: string; score: number }[] = [
  { name: "佳木斯 · 苍鹰", score: 98 },
  { name: "喀什 · 夜莺", score: 95 },
  { name: "布宜诺斯艾利斯 · 探戈", score: 93 },
  { name: "鹊桥 · 守夜人", score: 90 },
  { name: "天问中继 · 灯塔", score: 88 },
  { name: "冰桥 · 极光哨", score: 85 },
  { name: "文昌 · 海风", score: 82 },
  { name: "西昌 · 山鹰", score: 78 },
  { name: "酒泉 · 铁翼", score: 74 },
  { name: "三亚 · 听涛", score: 69 },
  { name: "纳米比亚 · 星桥", score: 64 },
  { name: "基律纳 · 北极光", score: 58 },
];
