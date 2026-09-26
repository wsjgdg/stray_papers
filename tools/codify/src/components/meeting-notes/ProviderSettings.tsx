// 「服务商」设置区：按 configSchema 自动渲染每个 Provider 的配置表单。
// 新增 Provider 只需在注册表里加实现文件，本组件不改一行——
// runtime 标签（本机/云端）、可用性检测、连接测试都由 meta 驱动。

import { useEffect, useState } from "react"
import { Cloud, Cpu, Languages, Loader2, Mic, Play, PlugZap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { listLlmModels } from "@/lib/llm"
// import 即完成默认翻译引擎（大模型翻译）的运行时注册——本组件渲染列表前注册表已就绪
import { translateLangLabel, translateViaProvider } from "@/lib/translate"
import {
  ASR_PROVIDERS,
  EMBEDDING_PROVIDERS,
  LLM_PROVIDERS,
  TRANSLATE_PROVIDERS,
  TTS_PROVIDERS,
  getActiveAsr,
  getActiveTts,
  getProviderConfig,
  loadProvidersConfig,
  setActiveProvider,
  setProviderConfigValue,
  type AsrProvider,
  type ConfigField,
  type EmbeddingProvider,
  type LlmProvider,
  type ProviderKind,
  type TranslateProvider,
  type TtsProvider,
  type TtsVoice,
} from "@/lib/providers"

type AnyProvider = AsrProvider | TtsProvider | LlmProvider | EmbeddingProvider | TranslateProvider

const KIND_SECTIONS: { kind: ProviderKind; title: string; note: string }[] = [
  { kind: "asr", title: "语音识别（实时转写）", note: "把麦克风说的话实时变成带时间戳的文字" },
  { kind: "tts", title: "语音合成（朗读）", note: "把纪要读出来；音色与语速可配" },
  { kind: "llm", title: "大模型（AI 纪要）", note: "摘要、行动项抽取、问答、补标点分段；模型与降级链在上方「AI 模型」里选" },
  { kind: "translate", title: "翻译（整稿译文）", note: "把转写稿整份翻译成目标语言；译文是独立副本，不覆盖原文。fork / 自托管后可注册 DeepL 等外部翻译引擎接管" },
  // 注册表为空时整节自动隐藏；fork 注册 embedding 实现后这里自动出现
  { kind: "embed", title: "语义索引（Embedding）", note: "会议内容向量化后支持纯本地语义检索；未注册实现时维持关键词 + AI 检索路线" },
]

function providersFor(kind: ProviderKind): AnyProvider[] {
  if (kind === "asr") return ASR_PROVIDERS
  if (kind === "tts") return TTS_PROVIDERS
  if (kind === "embed") return EMBEDDING_PROVIDERS
  if (kind === "translate") return TRANSLATE_PROVIDERS
  return LLM_PROVIDERS
}

function RuntimeBadge({ runtime }: { runtime: "local" | "cloud" }) {
  return runtime === "local" ? (
    <span className="flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
      <Cpu className="h-2.5 w-2.5" />
      本机 · 免费
    </span>
  ) : (
    <span className="flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-primary/10 px-1.5 py-px text-[10px] text-primary">
      <Cloud className="h-2.5 w-2.5" />
      云端 · 按量计费
    </span>
  )
}

function FieldInput({
  field,
  value,
  voices,
  onChange,
}: {
  field: ConfigField
  value: string | number | boolean | undefined
  voices: TtsVoice[]
  onChange: (v: string | number | boolean) => void
}) {
  const base =
    "h-7 rounded-[var(--radius-sm)] border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary focus-visible:shadow-[var(--focus-ring)]"
  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value ?? field.default)}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[hsl(var(--primary))]"
      />
    )
  }
  if (field.type === "select") {
    const options =
      field.dynamic === "voices"
        ? voices.map((v) => ({ label: `${v.name}（${v.language}）`, value: v.id as string | number }))
        : (field.options ?? [])
    return (
      <select
        value={String(value ?? field.default ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className={cn(base, "min-w-0 flex-1")}
      >
        {field.dynamic === "voices" ? <option value="">系统默认音色</option> : null}
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
      value={String(value ?? field.default ?? "")}
      placeholder={field.placeholder}
      min={field.min}
      max={field.max}
      step={field.step}
      onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
      className={cn(base, field.type === "number" ? "w-20" : "min-w-0 flex-1")}
    />
  )
}

export function ProviderSettings() {
  const [, forceRender] = useState(0)
  const refresh = () => forceRender((n) => n + 1)
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [testing, setTesting] = useState("")
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})
  const cfg = loadProvidersConfig()

  useEffect(() => {
    const tts = getActiveTts()
    if (tts) void tts.listVoices().then(setVoices)
  }, [])

  const runTest = async (kind: ProviderKind, id: string) => {
    setTesting(id)
    setTestMsg((prev) => ({ ...prev, [id]: "" }))
    let msg = ""
    try {
      if (kind === "tts") {
        const tts = getActiveTts()
        if (!tts) {
          msg = "当前浏览器不支持语音合成"
        } else {
          tts.speak("你好，这是一段朗读试听。", getProviderConfig("tts", id))
          msg = "正在试听…（若没声音请检查系统音量）"
        }
      } else if (kind === "asr") {
        if (!getActiveAsr()) {
          msg = "当前浏览器不支持实时识别，请使用 Chrome 或 Edge"
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((t) => t.stop())
          msg = "麦克风就绪，权限正常"
        }
      } else if (kind === "translate") {
        // 真实试译一句（走当前生效引擎与其配置里的目标语言）：能同时验证连通性与产出质量；消耗极少量 token
        const lang = String(getProviderConfig("translate", id).targetLang || "en")
        const out = await translateViaProvider("大家好，这是一次翻译连通性测试。", { targetLang: lang })
        msg = out.text.trim()
          ? `试译成${translateLangLabel(lang)}成功（引擎 ${out.engine}）：${out.text.trim().slice(0, 80)}`
          : "引擎连通但返回了空译文，请检查登录状态后重试"
      } else {
        // LLM 连接测试：拉一次真实模型清单（免费只读请求，能同时验证登录态与网络）
        const models = await listLlmModels()
        msg =
          models.length > 0
            ? `已读取模型清单 · ${models.length} 个：${models
                .slice(0, 3)
                .map((x) => x.model)
                .join("、")}${models.length > 3 ? "…" : ""}（实际连通性在首次生成时验证）`
            : "未读到模型清单；请在「AI 模型」填写你的接口支持的模型名（本测试只读清单，不发起真实请求）"
      }
    } catch (e) {
      msg =
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器权限设置里允许后重试"
          : "测试失败，请检查网络或登录状态后重试"
    } finally {
      setTesting("")
      setTestMsg((prev) => ({ ...prev, [id]: msg }))
    }
  }

  return (
    <>
      {KIND_SECTIONS.filter(({ kind }) => providersFor(kind).length > 0).map(({ kind, title, note }) => (
        <section key={kind}>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <PlugZap className="h-3 w-3" />
            {title}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
          <div className="mt-2 space-y-2">
            {providersFor(kind).map((p) => {
              const active = cfg[kind].active === p.meta.id
              const unavailable = !p.supported()
              const instance = getProviderConfig(kind, p.meta.id)
              return (
                <div
                  key={p.meta.id}
                  className={cn(
                    "rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors",
                    active ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-background",
                  )}
                >
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`provider-${kind}`}
                      checked={active}
                      disabled={unavailable}
                      onChange={() => {
                        setActiveProvider(kind, p.meta.id)
                        refresh()
                      }}
                      className="accent-[hsl(var(--primary))]"
                    />
                    <span className="text-[13px] font-medium text-foreground">{p.meta.name}</span>
                    <RuntimeBadge runtime={p.meta.runtime} />
                    {unavailable ? (
                      <span className="rounded-[var(--radius-pill)] bg-destructive/10 px-1.5 py-px text-[10px] text-destructive">
                        当前浏览器不可用
                      </span>
                    ) : null}
                    {active && !unavailable ? (
                      <span className="ml-auto text-[10px] text-primary">使用中</span>
                    ) : null}
                  </label>
                  <p className="mt-1 pl-6 text-[11px] leading-relaxed text-muted-foreground">
                    {p.meta.description}
                  </p>

                  {active && !unavailable && p.meta.configSchema.length > 0 ? (
                    <div className="mt-2 space-y-1.5 pl-6">
                      {p.meta.configSchema.map((field) => (
                        <div key={field.key}>
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                              {field.label}
                            </span>
                            <FieldInput
                              field={field}
                              value={instance[field.key]}
                              voices={voices}
                              onChange={(v) => {
                                setProviderConfigValue(kind, p.meta.id, field.key, v)
                                refresh()
                              }}
                            />
                          </div>
                          {field.help ? (
                            <p className="mt-0.5 pl-[72px] text-[10px] leading-relaxed text-muted-foreground/80">
                              {field.help}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2 flex items-center gap-2 pl-6">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unavailable || testing === p.meta.id}
                      onClick={() => void runTest(kind, p.meta.id)}
                      className="h-6 gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      {testing === p.meta.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : kind === "asr" ? (
                        <Mic className="h-3 w-3" />
                      ) : kind === "translate" ? (
                        <Languages className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {kind === "tts" ? "试听" : kind === "asr" ? "检测麦克风" : kind === "translate" ? "试译一句" : "测试连接"}
                    </Button>
                    {testMsg[p.meta.id] ? (
                      <span
                        className="min-w-0 truncate text-[11px] text-muted-foreground"
                        title={testMsg[p.meta.id]}
                      >
                        {testMsg[p.meta.id]}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
