// 平台账号 / 登录抽象层已随脱离 VibeX / RunningHub 平台而移除。
// 本仓库不再有平台登录 / 计费代理；AI 调用走用户自有的 OpenAI 兼容接口。
//
// 唯一保留的开关：visitorPaysForAi —— 关闭「访客付费确认」弹窗（useCostConfirm 读这个值）。
export const visitorPaysForAi = false
