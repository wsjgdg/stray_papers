// TTS 引擎门面：本地(Web Speech) / Edge 免费云端 / Azure 云端 三选一。
// 本地走浏览器自带语音合成（ConductorPanel 内已有完整逻辑）；云端走 speakCloud，返回可停止的句柄。

import type { Persona } from "@/lib/persona";
import { CLOUD_VOICE, cloudVoiceLabel } from "./voices";
import { speakEdge, type CloudSpeakHandle } from "./edgeClient";
import { speakAzure } from "./azureClient";
import { loadVoiceVol } from "../voiceVolume";

export type TtsEngineId = "local" | "edge" | "azure";

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
    id: "azure",
    label: "Azure 云端",
    cloud: true,
    needsKey: true,
    hint: "需 AI_SPEECH_KEY，神经语音更稳定",
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

export function cloudVoiceFor(persona: Persona): string {
  return CLOUD_VOICE[persona];
}

export function cloudVoiceLabelFor(persona: Persona): string {
  return cloudVoiceLabel(CLOUD_VOICE[persona]);
}

export function azureConfigured(speechKey?: string, speechRegion?: string): boolean {
  return Boolean(speechKey && speechRegion);
}

export interface SpeakArgs {
  text: string;
  persona: Persona;
  rate: number;
  pitch: number;
  engine: TtsEngineId;
  speechKey?: string;
  speechRegion?: string;
}

// 云端合成统一入口：根据引擎分派到 Edge 或 Azure，返回可停止句柄。
// 本地引擎不在此处理（ConductorPanel 用 Web Speech 直接播）。
export async function speakCloud(args: SpeakArgs): Promise<CloudSpeakHandle> {
  const opts = {
    text: args.text,
    voice: CLOUD_VOICE[args.persona],
    rate: args.rate,
    pitch: args.pitch,
    volume: loadVoiceVol(),
  };
  if (args.engine === "azure") {
    if (!args.speechKey || !args.speechRegion) {
      throw new Error(
        "未配置 Azure 语音密钥：在 .env 填入 AI_SPEECH_KEY 与 AI_SPEECH_REGION 后重启 dev server",
      );
    }
    return speakAzure(opts, args.speechKey, args.speechRegion);
  }
  return speakEdge(opts);
}
