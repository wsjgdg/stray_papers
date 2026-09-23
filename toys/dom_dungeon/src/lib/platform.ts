// 独立构建下的平台契约。
//
// 原项目依赖 VibeX / RunningHub 的账号、鉴权、云存档、AI 网关。脱离该环境后，这些
// 能力降级为纯本地实现：不联网、不登录、不弹计费。游戏本体（战斗 / 词条 / 路线 /
// 每日挑战本地种子 / 本机存档）完全本地运行；排行榜、幽灵对照、云存档等依赖服务端
// 的功能在离线状态下降级为本地无操作。
//
// 业务代码只依赖这里导出的稳定类型；平台相关的函数实现已改为本地无操作。

export type RhJwtPayload = {
  sub?: string
  user_name?: string
  username?: string
  nickName?: string
  mobile?: string
  exp?: number
}

export type RhAccountInfo = {
  userId: string
  displayName: string
  avatar?: string
  totalCoin?: string
  walletBalance?: string
}
