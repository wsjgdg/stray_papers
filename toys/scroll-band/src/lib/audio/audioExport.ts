// 滚动乐团 · 演奏导出为音频文件
// 思路：不重跑合成器（那会复制整套音色逻辑），而是从主总线抽一路 MediaStream，
//   用 MediaRecorder 实时录下听到的声音 → 解码 → 重编码成 16-bit PCM WAV（任何播放器/剪辑软件都能用）。
// 录的是「当下这一段时间窗内总线上的全部声音」：画布循环、打字鼓、钢琴、垫音、动色音色都一视同仁。

export interface AudioExportResult {
  ok: boolean;
  /** 失败时的中文原因；成功时留空 */
  reason?: string;
}

/** 录 seconds 秒的 stream，转成 WAV 触发下载；返回结果供上层播报 */
export async function recordStreamToWavFile(
  stream: MediaStream,
  seconds: number,
  fileName: string,
  onProgress?: (phase: "recording" | "encoding") => void,
): Promise<AudioExportResult> {
  if (typeof MediaRecorder === "undefined") {
    return { ok: false, reason: "这台设备的浏览器不支持录音导出" };
  }
  const mime = pickMime();
  if (!mime) {
    return { ok: false, reason: "这台设备的浏览器不支持任何录音格式" };
  }

  const chunks: BlobPart[] = [];
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128000 });
  } catch {
    try {
      rec = new MediaRecorder(stream);
    } catch {
      return { ok: false, reason: "录音器启动失败，再试一次" };
    }
  }
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  onProgress?.("recording");
  try {
    rec.start();
  } catch {
    return { ok: false, reason: "录音器启动失败，再试一次" };
  }

  await sleep(Math.max(1, seconds) * 1000);
  // 收尾留一点余音，别把循环尾巴切掉
  await sleep(250);
  if (rec.state !== "inactive") rec.stop();
  await stopped;

  const blob = new Blob(chunks, { type: mime });
  if (blob.size === 0) {
    return { ok: false, reason: "没录到声音，先弹一段再导出" };
  }

  onProgress?.("encoding");
  try {
    const wav = await blobToWav(blob);
    downloadBlob(wav, fileName.endsWith(".wav") ? fileName : `${fileName}.wav`);
    return { ok: true };
  } catch {
    return { ok: false, reason: "音频转换失败，再试一次" };
  }
}

function pickMime(): string | null {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder.isTypeSupported !== "function") return "audio/webm";
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}

async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const audio = await ctx.decodeAudioData(arrayBuf);
    return encodeWav(audio);
  } finally {
    // 用完即关，避免多个 AudioContext 抢硬件
    void ctx.close();
  }
}

/** AudioBuffer → 16-bit PCM 交错 WAV（立体声，采样率与解码一致） */
function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  let p = 0;
  const str = (s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(p++, s.charCodeAt(i));
  };
  const u32 = (v: number) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };

  str("RIFF");
  u32(36 + dataSize);
  str("WAVE");
  str("fmt ");
  u32(16);
  u16(1); // PCM
  u16(numCh);
  u32(sampleRate);
  u32(sampleRate * blockAlign);
  u16(blockAlign);
  u16(16);
  str("data");
  u32(dataSize);

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c += 1) chans.push(buffer.getChannelData(c));

  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < numCh; c += 1) {
      let s = chans[c][i];
      if (!Number.isFinite(s)) s = 0;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }

  return new Blob([out], { type: "audio/wav" });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
