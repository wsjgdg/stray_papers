// 讯飞（iFlytek）在线语音合成客户端。WebSocket + HMAC-SHA256 鉴权，每日 500 次免费。
//
// 协议要点（https://www.xfyun.cn/doc/tts/online_tts/API.html）：
//   1) 鉴权：signature_origin = "host: tts-api.xfyun.cn\ndate: <RFC1123>\nGET /v2/tts HTTP/1.1"
//      用 APISecret 做 HMAC-SHA256，base64 得 signature；再拼 authorization_origin 并 base64，
//      作为 wss URL 的 query 参数（authorization / date / host）。
//   2) 连接后发 JSON：common.app_id + business(aue=lame,sfl=1,vcn,speed,volume,pitch) + data(status:2,text:base64(utf8))。
//   3) 响应 JSON：code=0 成功；data.audio 为 base64 音频分片，data.status=2 表示结束；code!=0 为错误。

import type { CloudSpeakOptions } from "./ssml";
import type { CloudSpeakHandle } from "./edgeClient";

export interface XfyCreds {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

const HOST = "tts-api.xfyun.cn";
const REQUEST_LINE = "GET /v2/tts HTTP/1.1";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

async function buildAuthUrl(creds: XfyCreds): Promise<string> {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${HOST}\ndate: ${date}\n${REQUEST_LINE}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(creds.apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signatureOrigin));
  const signature = bytesToBase64(new Uint8Array(sigBuf));
  const authorizationOrigin = `api_key="${creds.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = bytesToBase64(new TextEncoder().encode(authorizationOrigin));
  return `wss://${HOST}/v2/tts?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${HOST}`;
}

export async function speakXunfei(
  opts: CloudSpeakOptions,
  creds: XfyCreds,
): Promise<CloudSpeakHandle> {
  const text = opts.text.length > 2000 ? opts.text.slice(0, 2000) : opts.text; // 讯飞单句 <8000 字节，留余量
  const url = await buildAuthUrl(creds);

  let settled = false;
  let stopped = false;
  let played = false;
  let audioEl: HTMLAudioElement | null = null;
  const chunks: Uint8Array[] = [];

  let resolveDone!: () => void;
  let rejectDone!: (e: Error) => void;
  const done = new Promise<void>((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  const settle = () => {
    if (settled) return;
    settled = true;
    resolveDone();
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

  ws.onopen = () => {
    const req = {
      common: { app_id: creds.appId },
      business: {
        aue: "lame",
        sfl: 1,
        vcn: opts.voice,
        // 讯飞 speed/volume/pitch 取值 0–100，默认 50；本地 rate/pitch 是倍率、volume 是 0–1
        speed: Math.min(100, Math.max(0, Math.round(opts.rate * 50))),
        volume: Math.min(100, Math.max(0, Math.round(opts.volume * 100))),
        pitch: Math.min(100, Math.max(0, Math.round(opts.pitch * 50))),
        tte: "UTF8",
      },
      data: {
        status: 2,
        text: utf8ToBase64(text),
      },
    };
    if (import.meta.env.DEV) {
      console.debug("[XunfeiTTS] vcn=", opts.voice, "speed=", req.business.speed, "pitch=", req.business.pitch);
    }
    try {
      ws.send(JSON.stringify(req));
    } catch {
      if (!settled) {
        settled = true;
        rejectDone(new Error("讯飞请求发送失败"));
      }
    }
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    let msg: { code?: number; message?: string; data?: { audio?: string; status?: number } | null };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.code !== 0) {
      if (!settled) {
        settled = true;
        rejectDone(new Error(`讯飞错误 ${msg.code}: ${msg.message ?? "未知错误"}`));
      }
      return;
    }
    const d = msg.data;
    // code=0 但 data 为空的帧可忽略；status=2 表示音频流结束
    if (!d || !d.audio) {
      if (d && d.status === 2) finalize();
      return;
    }
    chunks.push(base64ToBytes(d.audio));
    if (d.status === 2) finalize();
  };

  ws.onerror = () => {
    if (!played && chunks.length > 0) finalize();
    else if (!settled) {
      settled = true;
      rejectDone(new Error("讯飞 WebSocket 连接失败（检查 APPID/APIKey/APISecret 与网络）"));
    }
  };

  ws.onclose = () => {
    if (!played) finalize();
    else settle();
  };

  return { stop, done };
}
