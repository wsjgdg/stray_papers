// 性格 → 云端音色 映射。
//
// 为什么需要云端：
//   本机 Windows 旧 SAPI 中文语音（Huihui/Yaoyao/Kangkang）是同一引擎别名，听感无差别；
//   而 Web Speech API 又播不出「Online/Natural」神经语音（它们是云端专属）。
//   所以“不同性格不同音色”只能走云端 TTS。
//
// 两条云端路线各有自己的音色名：
//   - Edge 免费：微软神经语音 zh-CN-*Neural（晓晓/云希/晓伊/云扬）
//   - 讯飞：中文发音人（晓燕/究许/静儿/小萍）

import type { Persona } from "@/lib/persona";

export type EdgeVoiceId =
  | "zh-CN-XiaoxiaoNeural"
  | "zh-CN-YunxiNeural"
  | "zh-CN-XiaoyiNeural"
  | "zh-CN-YunyangNeural";

export type XfyVoiceId = "xiaoyan" | "aisjiuxu" | "aisjinger" | "aisxping";

// Edge 免费（微软神经语音）
export const EDGE_VOICE: Record<Persona, EdgeVoiceId> = {
  default: "zh-CN-XiaoxiaoNeural", // 晓晓：温润女声
  mentor: "zh-CN-YunxiNeural", // 云希：沉稳男声
  buddy: "zh-CN-XiaoyiNeural", // 晓伊：活泼女声
  explorer: "zh-CN-YunyangNeural", // 云扬：清亮男声
};

export const EDGE_VOICE_LABEL: Record<EdgeVoiceId, string> = {
  "zh-CN-XiaoxiaoNeural": "晓晓",
  "zh-CN-YunxiNeural": "云希",
  "zh-CN-XiaoyiNeural": "晓伊",
  "zh-CN-YunyangNeural": "云扬",
};

// 讯飞（中文发音人）
export const XFY_VOICE: Record<Persona, XfyVoiceId> = {
  default: "xiaoyan", // 晓燕：女声
  mentor: "aisjiuxu", // 究许：男声
  buddy: "aisjinger", // 静儿：女声（情感）
  explorer: "aisxping", // 小萍：男声
};

export const XFY_VOICE_LABEL: Record<XfyVoiceId, string> = {
  xiaoyan: "晓燕",
  aisjiuxu: "究许",
  aisjinger: "静儿",
  aisxping: "小萍",
};

export function cloudVoiceFor(persona: Persona, engine: "edge" | "xunfei"): string {
  return engine === "edge" ? EDGE_VOICE[persona] : XFY_VOICE[persona];
}

export function cloudVoiceLabelFor(
  persona: Persona,
  engine: "edge" | "xunfei",
): string {
  const v = cloudVoiceFor(persona, engine);
  const map = engine === "edge" ? EDGE_VOICE_LABEL : XFY_VOICE_LABEL;
  return (map as Record<string, string>)[v] ?? v;
}
