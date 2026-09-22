// Edge 免费云端 TTS（无需密钥）。
//
// 协议要点（来自 edge-tts 浏览器实现）：
//   1) 连接 wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
//   2) 鉴权不在 WebSocket 头里，而是 URL 查询参数：Sec-MS-GEC（SHA256(windowsTicks + 可信令牌)）、
//      Sec-MS-GEC-Version、ConnectionId、TrustedClientToken —— 浏览器允许在 WS URL 上带查询参数，
//      所以纯前端就能用，不需要后端代理。
//   3) onopen 后先发 speech.config（JSON），再发 SSML（Path:ssml）。
//   4) 音频以二进制帧返回，首帧带 "Path:audio\r\n" 文本头需剥离，后续帧为纯音频。
//   5) 收到 "Path:turn.end" 文本消息即合成结束，拼接成 MP3 Blob 用 <audio> 播放。

import { buildSSML, safeText, type CloudSpeakOptions } from "./ssml";

export interface CloudSpeakHandle {
  /** 立即停播并中断连接 / 音频播放 */
  stop: () => void;
  /** 在音频播放结束（或被 stop）后 resolve */
  done: Promise<void>;
}

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const SEC_MS_GEC_VERSION = "1-140.0.0.0";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

function uuidNoDash(): string {
  const u =
    crypto.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  return u.replace(/-/g, "");
}

// Sec-MS-GEC：把当前时间（向下取整到 300 秒）换算成 Windows 文件时间刻度，拼上可信令牌后 SHA-256。
// 服务端用相同算法 + 当前时间校验，5 分钟窗口内有效。浏览器用 crypto.subtle 即可复现。
async function generateSecMsGec(token: string): Promise<string> {
  const ticks = Math.floor(Date.now() / 1000) + 11644473600; // 秒 → Windows 纪元（1601）
  const rounded = ticks - (ticks % 300); // 向下取整到 5 分钟
  const windowsTicks = rounded * 10_000_000; // 转成 100 纳秒刻度
  const data = new TextEncoder().encode(`${windowsTicks}${token}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0) return 0;
  let i = 0;
  while (i <= haystack.length - needle.length) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
    i++;
  }
  return -1;
}

export async function speakEdge(opts: CloudSpeakOptions): Promise<CloudSpeakHandle> {
  const text = safeText(opts.text);
  const reqId = uuidNoDash();
  const secMsGec = await generateSecMsGec(TRUSTED_CLIENT_TOKEN);
  const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${reqId}`;

  let settled = false;
  let stopped = false;
  let played = false;
  let audioEl: HTMLAudioElement | null = null;
  const chunks: Uint8Array[] = [];

  let resolveDone!: () => void;
  const done = new Promise<void>((res) => {
    resolveDone = res;
  });

  const settle = () => {
    if (settled) return;
    settled = true;
    resolveDone();
  };

  const finalize = () => {
    if (played || stopped) return;
    played = true;
    if (chunks.length === 0) {
      settle();
      return;
    }
    const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
    const urlObj = URL.createObjectURL(blob);
    const audio = new Audio(urlObj);
    audioEl = audio;
    audio.volume = Math.min(1, Math.max(0, opts.volume));
    audio.onended = () => {
      URL.revokeObjectURL(urlObj);
      settle();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(urlObj);
      settle();
    };
    audio.play().catch(() => {
      URL.revokeObjectURL(urlObj);
      settle();
    });
  };

  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    if (audioEl) {
      try {
        audioEl.pause();
      } catch {
        /* ignore */
      }
    }
    settle();
  };

  ws.onopen = () => {
    try {
      const ts = new Date().toUTCString();
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"${OUTPUT_FORMAT}"}}}}`,
      );
      const ts2 = new Date().toUTCString();
      const ssml = buildSSML({ ...opts, text });
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts2}\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    } catch {
      stop();
    }
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      const msg = ev.data as string;
      if (msg.includes("Path:turn.end") || msg.includes("TurnEnd")) {
        finalize();
      } else if (/Path:response/i.test(msg) && /Error/i.test(msg)) {
        stopped = true;
        settle();
      }
      return;
    }
    const buf = new Uint8Array(ev.data as ArrayBuffer);
    const needle = new TextEncoder().encode("Path:audio\r\n");
    const idx = indexOf(buf, needle);
    if (idx !== -1) {
      chunks.push(buf.subarray(idx + needle.length));
    } else {
      chunks.push(buf);
    }
  };

  ws.onerror = () => {
    if (!played && chunks.length > 0) finalize();
    else settle();
  };

  ws.onclose = () => {
    if (!played) finalize();
    else settle();
  };

  return { stop, done };
}
