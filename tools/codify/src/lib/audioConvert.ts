// 音频转码工具：把浏览器可解码的音频 Blob 转成 16kHz 单声道 16bit PCM 的 WAV，供云端识别接口使用
// （云端 SenseVoice 对 opus 容器直发不稳；本地 Whisper 能直接吃 webm/opus，无需此步骤）。
//
// 解码策略（流式优先）：
// - 输入是 webm/opus（保底录音的 MediaRecorder 产物，正是主场景）时，走 WebCodecs AudioDecoder：
//   自己做一个最小 webm/opus demuxer 抽出 opus 包，逐帧 decode → 逐帧混单声道 → 逐帧重采样到 16k →
//   逐帧写出 16bit PCM。整段 PCM 从不会同时驻留内存（3 小时录音的 decode 峰值从数百 MB 降到几帧），
//   且可直接写出分块 Blob，避免一次性拼出巨型 ArrayBuffer。
// - 任何解析/解码异常、或 WebCodecs 不可用、或非 webm 输入（mp4/ogg 上传文件），一律回退到 decodeAudioData
//   整段解码（内存占用更高，但健壮性最好）。回退保证：流式路径只要抛错就落到 legacy，不会产出静默错误音频。

type AnyCtor = new (cfg: unknown) => unknown

function webCodecsAvailable(): boolean {
  const g = globalThis as Record<string, unknown>
  return typeof g.AudioDecoder === "function" && typeof g.EncodedAudioChunk === "function"
}

// ── EBML / WebM 最小解析（仅覆盖 MediaRecorder 产物：单音轨 A_OPUS + SimpleBlock）──

function readVint(view: DataView, offset: number): { value: number; length: number } | null {
  if (offset < 0 || offset >= view.byteLength) return null
  const b0 = view.getUint8(offset)
  // EBML vint：首字节顶位是长度标记，长度 L = 从顶位往下数第一个置位的位序（1..8）
  let len = 1
  while (len < 8 && (b0 & (0x80 >> (len - 1))) === 0) len++
  if (len > 7) return null // 长度 8（含全 0 未知长度）本解析不支持
  let value = b0 & ((1 << (8 - len)) - 1)
  for (let i = 1; i < len; i++) {
    if (offset + i >= view.byteLength) return null
    value = (value << 8) | view.getUint8(offset + i)
  }
  return { value, length: len }
}

interface EltHeader {
  id: number
  size: number
  dataOffset: number
  headerLen: number
}

function readElt(view: DataView, offset: number): EltHeader | null {
  const idv = readVint(view, offset)
  if (!idv) return null
  const sv = readVint(view, offset + idv.length)
  if (!sv) return null
  return {
    id: idv.value,
    size: sv.value,
    dataOffset: offset + idv.length + sv.length,
    headerLen: idv.length + sv.length,
  }
}

function forEachChild(
  view: DataView,
  dataOffset: number,
  dataSize: number,
  cb: (h: EltHeader) => boolean,
): void {
  let pos = dataOffset
  const end = dataOffset + dataSize
  while (pos + 1 <= end) {
    const h = readElt(view, pos)
    if (!h) break
    if (cb(h)) break
    pos = h.dataOffset + h.size
    if (pos <= 0 || pos > end) break
  }
}

function readUint(view: DataView, off: number, len: number): number {
  let v = 0
  for (let i = 0; i < len && i < 4; i++) v = (v << 8) | view.getUint8(off + i)
  return v
}

function utf8(view: DataView, off: number, len: number): string {
  return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset + off, len))
}

function sliceCopy(view: DataView, off: number, len: number): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset + off, view.byteOffset + off + len))
}

interface OpusTrack {
  codecPrivate: Uint8Array
  channels: number
}

// 在 Segment 内找音轨的 TrackNumber / CodecPrivate / 声道数（仅认 A_OPUS 音轨）
function findOpusTrack(view: DataView, seg: EltHeader): { track: OpusTrack; trackNumber: number } | null {
  let result: { track: OpusTrack; trackNumber: number } | null = null
  forEachChild(view, seg.dataOffset, seg.size, (child) => {
    if (child.id !== 0x1654ae6b) return false // Tracks
    forEachChild(view, child.dataOffset, child.size, (entry) => {
      if (entry.id !== 0xae) return false // TrackEntry
      let trackType = 0
      let channels = 1
      let codecId = ""
      let codecPrivate: Uint8Array | null = null
      let trackNumber = 0
      forEachChild(view, entry.dataOffset, entry.size, (field) => {
        if (field.id === 0xd7) trackNumber = readUint(view, field.dataOffset, field.size)
        else if (field.id === 0x83) trackType = readUint(view, field.dataOffset, field.size)
        else if (field.id === 0x86) codecId = utf8(view, field.dataOffset, field.size)
        else if (field.id === 0x63a2) codecPrivate = sliceCopy(view, field.dataOffset, field.size)
        else if (field.id === 0xe1)
          forEachChild(view, field.dataOffset, field.size, (af) => {
            if (af.id === 0x9f) channels = readUint(view, af.dataOffset, af.size)
            return false
          })
        return false
      })
      if (trackType === 2 && codecId === "A_OPUS" && codecPrivate) {
        result = { track: { codecPrivate, channels }, trackNumber }
        return true
      }
      return false
    })
    return true
  })
  return result
}

// 把 SimpleBlock/Block 的帧数据按 lacing 拆成若干 opus 包。
// lacing=0：单帧，无长度前缀；lacing=1(Xiph)：n-1 个「255 续接」长度字节（末帧长度由剩余字节推出）；
// lacing=3(EBML)：首帧长度 = 1 字节(uint8)，其后 n-1 个是「相对前帧的带符号 vint 增量」。
// 任何不支持/解析失败的 lacing（含 Fixed lacing=2）一律返回 null，由上层回退到 decodeAudioData。
function splitLaced(frame: Uint8Array, lacing: number): Uint8Array[] | null {
  if (lacing === 0) return [frame]
  if (frame.length === 0) return null
  const n = frame[0] + 1
  if (n === 1) return [frame] // 单帧无长度域（理论上 lacing=0，这里兜底）
  const sizes: number[] = []
  let pos = 1
  if (lacing === 1) {
    // Xiph lacing
    for (let f = 0; f < n - 1; f++) {
      let size = 0
      while (pos < frame.length) {
        const b = frame[pos++]
        size += b
        if (b !== 0xff) break
      }
      sizes.push(size)
    }
  } else if (lacing === 3) {
    // EBML lacing：首帧长度 = 1 字节(uint8)，其余 n-1 个是带符号 vint 增量（delta）
    if (pos >= frame.length) return null
    let prev = frame[pos++]
    sizes.push(prev)
    const dv = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    for (let f = 1; f < n - 1; f++) {
      const v = readSignedVint(dv, pos)
      if (!v) return null
      prev += v.value
      sizes.push(prev)
      pos += v.length
    }
  } else {
    return null // Fixed lacing(2) 罕见，不支持 → 触发回退
  }
  const frames: Uint8Array[] = []
  for (let f = 0; f < n - 1; f++) {
    const s = sizes[f]
    frames.push(frame.subarray(pos, pos + s))
    pos += s
  }
  frames.push(frame.subarray(pos))
  return frames
}

// 带符号 EBML vint（EBML lacing 的增量用）：最高有效位是符号位，余下 7*len-1 位是幅值
function readSignedVint(view: DataView, offset: number): { value: number; length: number } | null {
  const u = readVint(view, offset)
  if (!u) return null
  const bits = 7 * u.length - 1
  const signBit = 1 << bits
  const mask = signBit - 1
  let value = u.value & mask
  if (u.value & signBit) value -= signBit
  return { value, length: u.length }
}

function parseBlock(view: DataView, h: EltHeader, audioTrackNumber: number | null): Uint8Array[] | null {
  let off = h.dataOffset
  const tnv = readVint(view, off)
  if (!tnv) return null
  if (audioTrackNumber != null && tnv.value !== audioTrackNumber) return null
  off += tnv.length
  if (off + 3 > view.byteLength) return null
  off += 2 // 跳过 16bit 相对时间戳
  const flags = view.getUint8(off)
  off += 1
  const lacing = (flags & 0x06) >> 1
  const dataEnd = h.dataOffset + h.size
  const remaining = sliceCopy(view, off, dataEnd - off)
  return splitLaced(remaining, lacing)
}

// 遍历所有 Cluster 抽取 opus 包（按出现顺序）
function extractOpusPackets(
  view: DataView,
  seg: EltHeader,
  audioTrackNumber: number | null,
): Uint8Array[] {
  const packets: Uint8Array[] = []
  forEachChild(view, seg.dataOffset, seg.size, (child) => {
    if (child.id !== 0x1f43b675) return false // Cluster
    forEachChild(view, child.dataOffset, child.size, (c2) => {
      if (c2.id === 0xa3) {
        const frames = parseBlock(view, c2, audioTrackNumber)
        if (frames) packets.push(...frames)
      } else if (c2.id === 0xa0) {
        // BlockGroup
        forEachChild(view, c2.dataOffset, c2.size, (c3) => {
          if (c3.id === 0xa1) {
            const frames = parseBlock(view, c3, audioTrackNumber)
            if (frames) packets.push(...frames)
          }
          return false
        })
      }
      return false
    })
    return false
  })
  return packets
}

// ── WebCodecs 流式解码 ──

function audioDataToMono(audioData: unknown, targetRate: number): Float32Array {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ad = audioData as any
  const format: string = ad.format
  const ch = ad.numberOfChannels as number
  const frames = ad.numberOfFrames as number
  const inRate = ad.sampleRate as number
  const isS16 = format.startsWith("s16")
  const planar = format.endsWith("planar")
  const mono = new Float32Array(frames)
  if (planar) {
    const planes: Array<Float32Array | Int16Array> = []
    for (let c = 0; c < ch; c++) planes.push(ad.channelData(c))
    for (let i = 0; i < frames; i++) {
      let s = 0
      for (let c = 0; c < ch; c++) {
        s += isS16 ? (planes[c] as Int16Array)[i] / 32768 : (planes[c] as Float32Array)[i]
      }
      mono[i] = s / ch
    }
  } else {
    const buf = ad.channelData(0) as Float32Array | Int16Array
    for (let i = 0; i < frames; i++) {
      let s = 0
      for (let c = 0; c < ch; c++) {
        s += isS16 ? (buf as Int16Array)[i * ch + c] / 32768 : (buf as Float32Array)[i * ch + c]
      }
      mono[i] = s / ch
    }
  }
  if (!Number.isFinite(inRate) || inRate <= 0 || targetRate <= 0) return mono
  if (Math.round(inRate) === targetRate) return mono
  const ratio = inRate / targetRate
  const outLen = Math.max(0, Math.floor(frames * (targetRate / inRate)))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = mono[idx] ?? 0
    const b = mono[idx + 1] ?? 0
    out[i] = a + (b - a) * frac
  }
  return out
}

function floatMonoToPcmBytes(mono: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(mono.length * 2)
  const view = new DataView(out.buffer)
  for (let i = 0; i < mono.length; i++) {
    let s = mono[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return out
}

function assembleWav(chunks: Uint8Array<ArrayBuffer>[], dataSize: number, sampleRate: number): Blob {
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, dataSize, true)
  return new Blob([header, ...chunks], { type: "audio/wav" })
}

async function decodeWebmOpusToWav(blob: Blob, targetRate: number): Promise<Blob> {
  const buf = await blob.arrayBuffer()
  const view = new DataView(buf)
  // 定位 Segment
  let seg: EltHeader | null = null
  let pos = 0
  while (pos < view.byteLength) {
    const h = readElt(view, pos)
    if (!h) break
    if (h.id === 0x18538067) {
      seg = h
      break
    }
    pos = h.dataOffset + h.size
    if (pos <= 0 || pos > view.byteLength) break
  }
  if (!seg) throw new Error("webm: no segment")
  const found = findOpusTrack(view, seg)
  if (!found) throw new Error("webm: no opus track")
  const packets = extractOpusPackets(view, seg, found.trackNumber)
  if (packets.length === 0) throw new Error("webm: no opus packets")

  const g = globalThis as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AudioDecoderCtor = g.AudioDecoder as AnyCtor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EncodedAudioChunkCtor = g.EncodedAudioChunk as AnyCtor
  const cfg = {
    codec: "opus",
    sampleRate: 48000,
    numberOfChannels: found.track.channels,
    description: found.track.codecPrivate,
  }
  try {
    const support = await (AudioDecoderCtor as unknown as {
      isConfigSupported?: (c: unknown) => Promise<{ supported?: boolean }>
    }).isConfigSupported?.(cfg)
    if (support && !support.supported) throw new Error("opus: not supported")
  } catch {
    // isConfigSupported 异常 → 交给下方 configure 再判
  }

  const wavChunks: Uint8Array<ArrayBuffer>[] = []
  let totalBytes = 0
  let decodedFrames = 0
  let decodeError: unknown = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoder = new AudioDecoderCtor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output: (audioData: any) => {
      const mono = audioDataToMono(audioData, targetRate)
      audioData.close()
      const pcm = floatMonoToPcmBytes(mono)
      wavChunks.push(pcm)
      totalBytes += pcm.byteLength
      decodedFrames++
    },
    error: (e: unknown) => {
      decodeError = e
    },
  }) as unknown as {
    configure: (c: unknown) => void
    decode: (c: unknown) => void
    flush: () => Promise<void>
    close: () => void
    readonly decodeQueueSize: number
  }
  decoder.configure(cfg)
  for (const pkt of packets) {
    decoder.decode(new EncodedAudioChunkCtor({ type: "key", timestamp: 0, duration: 0, data: pkt }))
    if (decoder.decodeQueueSize > 16) await new Promise((r) => setTimeout(r, 0))
  }
  await decoder.flush()
  decoder.close()
  if (decodeError) throw decodeError
  if (decodedFrames === 0 || totalBytes === 0) throw new Error("opus: nothing decoded")
  return assembleWav(wavChunks, totalBytes, targetRate)
}

// 云端识别单请求体积上限远小于整段 WAV：把已解码好的 16k 单声道 WAV 按体积切成若干
// 自带 RIFF 头、可直接 POST 的小片。基于 Blob.slice 零拷贝引用原字节，不会把整段 PCM 再物化一遍。
// 每片时长由目标体积预算推出（16k/16bit 下 15MB ≈ 7.8 分钟）。
export const CLOUD_TRANSCRIBE_CHUNK_BYTES = 15 * 1024 * 1024

function makeWavHeader(dataSize: number, sampleRate: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(44)
  const view = new DataView(header.buffer)
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, dataSize, true)
  return header
}

export async function splitWavChunks(wav: Blob, maxChunkBytes: number): Promise<Blob[]> {
  const dataStart = 44
  if (wav.size <= maxChunkBytes + dataStart || maxChunkBytes <= dataStart) return [wav]
  const head = new DataView(await wav.slice(0, dataStart).arrayBuffer())
  const sampleRate = head.getUint32(24, true) || 16000
  const totalData = wav.size - dataStart
  const maxPcm = Math.max(2, maxChunkBytes - dataStart)
  const result: Blob[] = []
  let off = 0
  while (off < totalData) {
    const pcmLen = Math.min(maxPcm, totalData - off)
    const pcmLenEven = pcmLen - (pcmLen % 2)
    if (pcmLenEven <= 0) break
    const pcm = wav.slice(dataStart + off, dataStart + off + pcmLenEven)
    result.push(new Blob([makeWavHeader(pcmLenEven, sampleRate), pcm], { type: "audio/wav" }))
    off += pcmLenEven
  }
  return result.length > 0 ? result : [wav]
}

// ── 回退：整段解码（健壮性最好，但整段 PCM 会同时驻留内存）──

async function decodeToWavLegacy(blob: Blob, targetRate = 16000): Promise<Blob> {
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
    const numCh = decoded.numberOfChannels
    const len = decoded.length
    const merged = new Float32Array(len)
    for (let c = 0; c < numCh; c++) {
      const ch = decoded.getChannelData(c)
      for (let i = 0; i < len; i++) merged[i] += ch[i] / numCh
    }
    const inRate = decoded.sampleRate
    const outLen = Math.max(0, Math.floor(merged.length * (targetRate / inRate)))
    const out = new Float32Array(outLen)
    const ratio = inRate / targetRate
    for (let i = 0; i < outLen; i++) {
      const p = i * ratio
      const idx = Math.floor(p)
      const frac = p - idx
      const a = merged[idx] ?? 0
      const b = merged[idx + 1] ?? 0
      out[i] = a + (b - a) * frac
    }
    return encodeWav(out, targetRate)
  } finally {
    void audioCtx.close().catch(() => {})
  }
}

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
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
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

/**
 * 把任意浏览器可解码的音频 Blob 解码并重采样成 16kHz 单声道 16bit WAV。
 * webm/opus 优先走 WebCodecs 流式解码（内存友好）；其余 / 异常回退 decodeAudioData。
 */
export async function decodeToWav(blob: Blob, targetRate = 16000): Promise<Blob> {
  if (webCodecsAvailable() && (blob.type.includes("webm") || blob.type.includes("opus"))) {
    try {
      return await decodeWebmOpusToWav(blob, targetRate)
    } catch {
      // 流式解码失败 → 回退整段解码（保证正确性，绝不产出静默错误音频）
    }
  }
  return await decodeToWavLegacy(blob, targetRate)
}
