// TTS 引擎门面：本地(Web Speech) / Edge 免费云端 / 讯飞云端 三选一。
// 本地走浏览器自带语音合成（ConductorPanel 内已有完整逻辑）；云端走 speakCloud，返回可停止的句柄。

import type { Persona } from "@/lib/persona";
import { cloudVoiceFor, cloudVoiceLabelFor as voiceLabelFor } from "./voices";
import { speakEdge, type CloudSpeakHandle } from "./edgeClient";
import { speakXunfei } from "./xunfeiClient";
import { loadVoiceVol } from "../voiceVolume";

export type TtsEngineId = "local" | "edge" | "xunfei";

export const TTS_ENGINES: {
  id: TtsEngineId;
  label: string;
  cloud: boolean;
  needsKey: boolean;
  hint: string;
}[] = [
  {
    id: "local",
    label: "本地语音",
    cloud: false,
    needsKey: false,
    hint: "浏览器自带，零依赖；但本机中文语音听感无差别",
  },
  {
    id: "edge",
    label: "Edge 免费云端",
    cloud: true,
    needsKey: false,
    hint: "微软神经语音，无需密钥，按性格分音色",
  },
  {
    id: "xunfei",
    label: "讯飞云端",
    cloud: true,
    needsKey: true,
    hint: "需讯飞 APPID/APIKey/APISecret（每日 500 次免费）",
  },
];

export const TTS_ENGINE_KEY = "so-conductor-tts-engine-v1";

export function loadTtsEngine(): TtsEngineId {
  try {
    const v = window.localStorage.getItem(TTS_ENGINE_KEY);
    return TTS_ENGINES.some((x) => x.id === v) ? (v as TtsEngineId) : "local";
  } catch {
    return "local";
  }
}

export function isCloudEngine(id: TtsEngineId): boolean {
  return id !== "local";
}

export function cloudVoiceLabelFor(persona: Persona, engine: "edge" | "xunfei"): string {
  return voiceLabelFor(persona, engine);
}

export function xunfeiConfigured(
  appId?: string,
  apiKey?: string,
  apiSecret?: string,
): boolean {
  return Boolean(appId && apiKey && apiSecret);
}

export interface SpeakArgs {
  text: string;
  persona: Persona;
  rate: number;
  pitch: number;
  engine: TtsEngineId;
  xfyAppId?: string;
  xfyApiKey?: string;
  xfyApiSecret?: string;
}

// 云端合成统一入口：根据引擎分派到 Edge 或 讯飞，返回可停止句柄。
// 本地引擎不在此处理（ConductorPanel 用 Web Speech 直接播）。
export async function speakCloud(args: SpeakArgs): Promise<CloudSpeakHandle> {
  const opts = {
    text: args.text,
    voice: cloudVoiceFor(args.persona, args.engine === "xunfei" ? "xunfei" : "edge"),
    rate: args.rate,
    pitch: args.pitch,
    volume: loadVoiceVol(),
  };
  if (args.engine === "xunfei") {
    if (!args.xfyAppId || !args.xfyApiKey || !args.xfyApiSecret) {
      throw new Error(
        "未配置讯飞密钥：在 .env 填入 AI_XFYUN_APPID / AI_XFYUN_API_KEY / AI_XFYUN_API_SECRET 后重启 dev server",
      );
    }
    return speakXunfei(opts, {
      appId: args.xfyAppId,
      apiKey: args.xfyApiKey,
      apiSecret: args.xfyApiSecret,
    });
  }
  return speakEdge(opts);
}
