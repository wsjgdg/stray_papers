// 动态热词表：从历史会议档案（标签 / 标题 / 说话人标注 / 行动项负责人 / 实体）抽取专有名词，
// 按出现频次排序去重。两个消费方：
// ① contextText——开始实时转写 / 上传音频时透传给识别引擎（Whisper 系实现拿它当 initial_prompt
//    做上下文偏置；Web Speech API 没有注入口，浏览器识别引擎如实忽略，见 providers.ts）；
// ② 「补标点分段」的提示词词表——AI 修同音错别字时按历史写法校正产品名 / 项目代号 / 人名。
// 纯本地计算、免费、按需生成（开始录音 / 整理转写时才跑），不落盘、不进备份。

import type { Meeting } from "@/lib/store"

const MAX_HOTWORDS = 40
const MIN_LEN = 2
const MAX_LEN = 16

// 通用指代不算热词（「说话人1」「主持人」「客户」没有偏置价值）
const GENERIC_RE = /^(?:说话人|发言人|未知|主持|我|对方|客户|用户|大家|同事|经理|老板|老师)/i
// 转写稿行首的说话人标注：[00:12] 老王：… / 老王：…
const LABEL_SPEAKER_RE = /^[ \t]*(?:\[[^\]]*\][ \t]*)?([^:：[\]\n]{1,12})[:：]/gm
// 允许的字：中日韩文字、字母、数字、间隔号、连接号（含空格的长短语不是「一个词」，不收）
const VALID_WORD_RE = /^[一-鿿㐀-䶿A-Za-z0-9·•\-—_]+$/

export interface HotwordEntry {
  word: string
  count: number
}

export function collectHotwordEntries(meetings: Meeting[]): HotwordEntry[] {
  const freq = new Map<string, number>()
  const add = (raw: string | undefined | null) => {
    if (!raw) return
    const w = raw.trim().replace(/[。，,、；;：:！!？?…\s]+$/, "")
    if (w.length < MIN_LEN || w.length > MAX_LEN) return
    if (!VALID_WORD_RE.test(w)) return
    if (GENERIC_RE.test(w)) return
    if (/^\d+$/.test(w)) return // 纯数字（日期 / 编号）没有偏置价值
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }

  for (const m of meetings) {
    add(m.title)
    for (const t of m.tags) add(t)
    for (const a of m.actions) add(a.assignee)
    for (const a of m.pendingActions ?? []) add(a.assignee)
    for (const e of m.entities ?? []) add(e.name)
    // 转写稿里的说话人标注（清洗稿优先，格式更规整）
    const body = m.cleaned || m.transcript
    if (body) {
      LABEL_SPEAKER_RE.lastIndex = 0
      let mm: RegExpExecArray | null
      while ((mm = LABEL_SPEAKER_RE.exec(body)) !== null) add(mm[1])
    }
  }

  return [...freq.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "zh-CN"))
    .slice(0, MAX_HOTWORDS)
}

export function collectHotwords(meetings: Meeting[]): string[] {
  return collectHotwordEntries(meetings).map((e) => e.word)
}

// 上下文注入文本：Whisper 系引擎把 initial_prompt 当「刚刚听到的内容」，
// 因此写成一句自然的开场白而不是裸词表，偏置效果更好
export function buildContextPrompt(words: string[]): string {
  if (words.length === 0) return ""
  return `本次会议可能涉及以下人名与专有名词：${words.join("、")}。`
}
