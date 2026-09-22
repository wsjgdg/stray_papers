// 性格 → 云端神经语音 映射。
//
// 为什么需要云端：
//   本机 Windows 旧 SAPI 中文语音（Huihui/Yaoyao/Kangkang）是同一引擎别名，听感无差别；
//   而 Web Speech API 又播不出「Online/Natural」神经语音（它们是 Azure/Edge 云端专属）。
//   所以“不同性格不同音色”只能走云端 TTS——Edge 免费 或 Azure 付费，都用同一套
//   微软神经语音（zh-CN-*Neural），听感可明确区分。
//
// 选这四个是因为它们都是「Chinese (Mandarin, Simplified)」标准普通话神经语音，规避方言/粤语/台语。

import type { Persona } from "@/lib/persona";

export type CloudVoiceId =
  | "zh-CN-XiaoxiaoNeural"
  | "zh-CN-YunxiNeural"
  | "zh-CN-XiaoyiNeural"
  | "zh-CN-YunyangNeural"
  | "zh-CN-YunjianNeural"
  | "zh-CN-YunxiaNeural";

// 性格 → 云端音色
export const CLOUD_VOICE: Record<Persona, CloudVoiceId> = {
  default: "zh-CN-XiaoxiaoNeural", // 晓晓：温润女声
  mentor: "zh-CN-YunxiNeural", // 云希：沉稳男声
  buddy: "zh-CN-XiaoyiNeural", // 晓伊：活泼女声
  explorer: "zh-CN-YunyangNeural", // 云扬：清亮男声
};

// 神经语音中文显示名（下拉/状态行用）
export const CLOUD_VOICE_LABEL: Record<CloudVoiceId, string> = {
  "zh-CN-XiaoxiaoNeural": "晓晓",
  "zh-CN-YunxiNeural": "云希",
  "zh-CN-XiaoyiNeural": "晓伊",
  "zh-CN-YunyangNeural": "云扬",
  "zh-CN-YunjianNeural": "云健",
  "zh-CN-YunxiaNeural": "云夏",
};

// 标准普通话（Mandarin Simplified）神经语音全集（下拉可选，不限于四种性格默认）
export const ZH_CN_NEURAL_VOICES: { id: CloudVoiceId; label: string; gender: "male" | "female" }[] = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓", gender: "female" },
  { id: "zh-CN-YunxiNeural", label: "云希", gender: "male" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊", gender: "female" },
  { id: "zh-CN-YunyangNeural", label: "云扬", gender: "male" },
  { id: "zh-CN-YunjianNeural", label: "云健", gender: "male" },
  { id: "zh-CN-YunxiaNeural", label: "云夏", gender: "female" },
];

export function cloudVoiceLabel(id: string): string {
  return (CLOUD_VOICE_LABEL as Record<string, string>)[id] ?? id;
}
