// 语音朗读音量（AI 指挥 TTS 的 speechSynthesis.volume）：0..1，默认 1。
// 「听感」面板写、指挥朗读读——两处共用这一份本地值，换设备随「数据备份」一起带走。
const VOICE_VOL_KEY = "so-voice-v1";

export function loadVoiceVol(): number {
  try {
    const raw = window.localStorage.getItem(VOICE_VOL_KEY);
    if (raw === null) return 1; // 未存过值 → 默认满音量（注意 Number(null)===0 会静音，必须显式判空）
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  } catch {
    return 1;
  }
}

export function saveVoiceVol(v: number): void {
  try {
    window.localStorage.setItem(VOICE_VOL_KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* 写失败 = 本会话内不持久 */
  }
}
