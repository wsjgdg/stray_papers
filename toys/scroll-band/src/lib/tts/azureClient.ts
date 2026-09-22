// Azure Speech 云端 TTS（需要 AI_SPEECH_KEY + AI_SPEECH_REGION）。
//
// 与 Edge 免费不同，Azure 走官方 Speech SDK，靠订阅密钥鉴权。本应用是零后端个人工具，
// 密钥直接出现在浏览器包里（和现有 AI_API_KEY 一个性质），仅适合自用、别用生产密钥。
//
// SDK 在浏览器里用 WebSocket 直连微软语音服务，神经语音（zh-CN-*Neural）听感可明确区分，
// 正好满足“不同性格不同音色”。SDK 用动态 import 懒加载，不用 Azure 就不进包。

import { buildSSML, safeText, type CloudSpeakOptions } from "./ssml";
import type { CloudSpeakHandle } from "./edgeClient";

export async function speakAzure(
  opts: CloudSpeakOptions,
  key: string,
  region: string,
): Promise<CloudSpeakHandle> {
  const sdk = await import("microsoft-cognitiveservices-speech-sdk");
  const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = opts.voice;
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
  const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

  let settled = false;
  let stopped = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });
  const settle = () => {
    if (settled) return;
    settled = true;
    resolveDone();
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      synthesizer.close();
    } catch {
      /* ignore */
    }
    settle();
  };

  const ssml = buildSSML({ ...opts, text: safeText(opts.text) });
  synthesizer.speakSsmlAsync(
    ssml,
    () => {
      try {
        synthesizer.close();
      } catch {
        /* ignore */
      }
      settle();
    },
    () => {
      try {
        synthesizer.close();
      } catch {
        /* ignore */
      }
      settle();
    },
  );

  return { stop, done };
}
