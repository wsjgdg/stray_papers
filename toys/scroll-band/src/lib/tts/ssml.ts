// 构造发给云端 TTS 的 SSML。Edge 免费 与 Azure 共用同一份 SSML 格式。
// rate / pitch 用百分比（相对值），与本地 Web Speech 的 rate/pitch 语义一致：
// rate=1.05 → +5%，pitch=1 → 0%，pitch=1.05 → +5%。

export interface CloudSpeakOptions {
  text: string;
  voice: string;
  rate: number; // 0.5 – 2
  pitch: number; // 0.5 – 1.5
  volume: number; // 0 – 1
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSSML(opts: CloudSpeakOptions): string {
  const ratePct = Math.round((opts.rate - 1) * 100);
  const pitchPct = Math.round((opts.pitch - 1) * 100);
  // 微软 prosody 接受 "+5%" / "-10%" 形式；0 写作 "0%"
  const rate = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`;
  const pitch = pitchPct >= 0 ? `+${pitchPct}%` : `${pitchPct}%`;
  const vol = Math.round(opts.volume * 100);
  const escaped = escapeXml(opts.text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="${opts.voice}"><prosody rate="${rate}" pitch="${pitch}" volume="${vol}">${escaped}</prosody></voice></speak>`;
}

// 云端对单次合成文本长度有限制（经验值 ~4000 字符），超出则截断避免 4xx。
export function safeText(text: string, limit = 4000): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "…";
}
