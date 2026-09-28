// 音频转码工具：把任意浏览器可解码的音频 Blob（webm/opus、ogg、mp4…）解码后
// 重采样成 16kHz 单声道 16bit PCM 的 WAV。用于把保底录音（MediaRecorder 的 webm/opus 产物）
// 喂给对 opus 容器敏感的云端识别接口（如 SiliconFlow SenseVoice：opus 切片会让服务端转码 500）。
// 本地 Whisper 服务能直接吃 webm/opus，无需此步骤——只在 engine.runtime === "cloud" 时调用。

export async function decodeToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  if (
    typeof AudioContext === "undefined" &&
    typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === "undefined"
  ) {
    throw new Error("当前环境不支持 Web Audio，无法解码音频")
  }
  const Ctx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new Ctx()
  try {
    const arrayBuf = await blob.arrayBuffer()
    const decoded = await audioCtx.decodeAudioData(arrayBuf)
    // 多声道按等权混为单声道
    const numCh = decoded.numberOfChannels
    const len = decoded.length
    const merged = new Float32Array(len)
    for (let c = 0; c < numCh; c++) {
      const ch = decoded.getChannelData(c)
      for (let i = 0; i < len; i++) merged[i] += ch[i] / numCh
    }
    // 线性插值重采样到目标采样率
    const inRate = decoded.sampleRate
    const outLen = Math.max(0, Math.floor(merged.length * (targetRate / inRate)))
    const out = new Float32Array(outLen)
    const ratio = inRate / targetRate
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio
      const idx = Math.floor(pos)
      const frac = pos - idx
      const a = merged[idx] ?? 0
      const b = merged[idx + 1] ?? 0
      out[i] = a + (b - a) * frac
    }
    return encodeWav(out, targetRate)
  } finally {
    void audioCtx.close().catch(() => {})
  }
}

// 单声道 16bit PCM 封装成标准 WAV（RIFF/WAVE，targetRate，单声道，16bit）
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const numChannels = 1
  const blockAlign = bytesPerSample * numChannels
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  // RIFF chunk
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  // fmt sub-chunk
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // audio format = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  // data sub-chunk
  writeString(36, "data")
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: "audio/wav" })
}
