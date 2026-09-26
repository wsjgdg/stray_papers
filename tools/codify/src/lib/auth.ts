// 平台账号 / 登录抽象层（auth 槽位的前端稳定契约）。
//
// aigc / llm / pb 等平台 lib 一律从本文件取鉴权能力，**不要**直接 import 具体
// 登录实现 —— 更换登录提供方时只需替换本文件的绑定，其余平台 lib 零改动。
//
// 稳定契约（任何登录提供方都必须实现并在此绑定）：
//   getAuthHeaders(): Record<string, string>  请求鉴权头（未登录返回 {}，可安全展开）
//   redirectToLogin(): void                   触发登录流程
//   visitorPaysForAi: boolean                 访客是否为 AI 调用付费（决定计费确认弹窗）
//
// 页面顶部的账号入口组件（组件名约定以 AccountMenu 结尾）由登录能力自带，
// import 语句见对应登录写页技能 / 安装工具返回值，不经过本文件。
//
// 当前绑定：RunningHub 主站登录（rhLogin.ts）。
export {
  vibexAuthHeaders as getAuthHeaders,
  redirectToRhLogin as redirectToLogin,
} from "./rhLogin"

// 脱离 RunningHub 平台后，AI 调用走用户自己的 OpenAI 兼容接口（自费 / 自有额度），
// 不再有平台计费墙，因此关闭「访客付费确认」弹窗（useCostConfirm 读这个值）。
export const visitorPaysForAi = false
