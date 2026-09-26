// 翻译通道：默认引擎实现 + 调用门面。
//
// 默认引擎「大模型翻译」复用 AI 纪要通道（ai.translateTranscript：分块 + 模型降级链 +
// 账本可观测），实现放本文件而非 providers.ts——它依赖 ai.ts，而 ai.ts 依赖 providers.ts，
// 放一起会成环；故走运行时注册（registerTranslateProvider，口径同 embeddingClient）。
//
// 外部翻译引擎（DeepL / OpenAI-compatible / 自托管翻译 API）实现 TranslateProvider 契约、
// 在本文件同法注册（或 fork 后新增实现文件），即可在「设置 → 服务商」里切换接管全部翻译调用点。
// 平台边界如实说明见 providers.ts 头注释：沙箱内页面不能直连任意第三方 http(s)。
//
// 注册发生在模块加载时：消费方（转写页 hook / 设置页）import 本文件即保证注册表非空。

import { translateTranscript } from "@/lib/ai"
import {
  LLM_TRANSLATE_ID,
  TRANSLATE_LANGUAGES,
  getActiveTranslate,
  getProviderConfig,
  registerTranslateProvider,
  type TranslateOptions,
  type TranslateOutcome,
  type TranslateProvider,
} from "@/lib/providers"

/** 语言代码 → 展示名（"en" → "英语"）；未知代码原样返回 */
export function translateLangLabel(code: string): string {
  return TRANSLATE_LANGUAGES.find((l) => l.value === code)?.label ?? code
}

function resolveTargetLang(optsLang: string | undefined, configTargetLang: unknown): string {
  if (optsLang && optsLang.trim()) return optsLang.trim()
  if (typeof configTargetLang === "string" && configTargetLang.trim()) return configTargetLang.trim()
  return "en"
}

export const llmTranslate: TranslateProvider = {
  meta: {
    id: LLM_TRANSLATE_ID,
    name: "大模型翻译",
    kind: "translate",
    runtime: "cloud",
    description:
      "复用 AI 纪要通道做整稿翻译，按实际 token 扣费；译文保留时间戳、说话人标注与分行结构，长稿自动分块，模型与附加指令在「翻译 Agent」设置中调整",
    configSchema: [
      {
        key: "targetLang",
        label: "目标语言",
        type: "select",
        default: "en",
        options: TRANSLATE_LANGUAGES,
        help: "转写页点「翻译」时预填的目标语言，每次翻译前可临时改",
      },
    ],
  },
  supported: () => true,
  async translate(text, config, opts) {
    const targetLang = resolveTargetLang(opts.targetLang, config.targetLang)
    const res = await translateTranscript(text, translateLangLabel(targetLang), opts.model, {
      ...(opts.agentPrompt ? { agentPrompt: opts.agentPrompt } : {}),
      ...(opts.hotwords && opts.hotwords.length > 0 ? { hotwords: opts.hotwords } : {}),
      ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
    })
    return {
      text: res.data,
      engine: res.usedModel,
      fellBack: res.fellBack,
      durationMs: res.durationMs,
      attempts: res.attempts,
      ...(res.tokens ? { tokens: res.tokens } : {}),
    }
  },
}

registerTranslateProvider(llmTranslate)

/**
 * 统一翻译入口：解析当前生效的翻译 Provider + 其持久化配置后调用。
 * targetLang 可临时覆盖（UI 每次翻译可改）；缺省用 Provider 配置里的目标语言。
 * 无可用引擎时抛 no_translate_provider（调用方转成面向用户的提示）。
 */
export async function translateViaProvider(
  text: string,
  opts?: Partial<TranslateOptions>,
): Promise<TranslateOutcome> {
  const provider = getActiveTranslate()
  if (!provider) throw new Error("no_translate_provider")
  const config = getProviderConfig("translate", provider.meta.id)
  const targetLang = resolveTargetLang(opts?.targetLang, config.targetLang)
  return provider.translate(text, config, { ...opts, targetLang })
}
