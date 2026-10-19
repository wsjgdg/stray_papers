// 任务档案导出：纯函数构建 JSON / TXT 存档文本 + 前端 Blob 下载（不走后端）。
// 由 useHome 的导出动作消费：日志流 + 阶段时间轴 + 警报处置记录 + 遥测摘要。

export interface ArchivePhaseMark {
  id: string;
  label: string;
  startedAtClock: string;
}

export interface ArchiveAlarmRecord {
  level: string;
  desc: string;
  clock: string;
  ackMode: "manual" | "auto";
  durationMs: number;
}

export interface ArchiveLogLine {
  clock: string;
  type: string;
  level: string;
  text: string;
}

export interface ArchiveTelemetryItem {
  key: string;
  label: string;
  value: string;
  unit: string;
}

export interface MissionArchiveInput {
  missionCode: string;
  missionTitle: string;
  /** ISO 时间戳 */
  generatedAt: string;
  /** 导出瞬间的任务钟读数（T-/T+） */
  clockText: string;
  phaseMarks: ArchivePhaseMark[];
  alarmRecords: ArchiveAlarmRecord[];
  logs: ArchiveLogLine[];
  telemetrySnapshot: ArchiveTelemetryItem[];
}

export function buildJsonArchive(input: MissionArchiveInput): string {
  const doc = {
    mission: `${input.missionCode} ${input.missionTitle}`,
    generatedAt: input.generatedAt,
    missionClockAtExport: input.clockText,
    phases: input.phaseMarks,
    alarms: input.alarmRecords,
    log: input.logs,
    telemetrySnapshot: Object.fromEntries(
      input.telemetrySnapshot.map((t) => [t.key, { label: t.label, value: t.value, unit: t.unit }]),
    ),
  };
  return JSON.stringify(doc, null, 2);
}

export function buildTxtArchive(input: MissionArchiveInput): string {
  const lines: string[] = [];
  lines.push(`════════ ${input.missionCode} ${input.missionTitle} · 任务档案 ════════`);
  lines.push(`导出时间: ${input.generatedAt}`);
  lines.push(`导出时任务钟: ${input.clockText}`);
  lines.push("");
  lines.push("── 飞行阶段时间轴 ──");
  if (input.phaseMarks.length === 0) lines.push("(尚无阶段推进记录)");
  for (const ph of input.phaseMarks) {
    lines.push(`${ph.startedAtClock}  进入「${ph.label}」(${ph.id})`);
  }
  lines.push("");
  lines.push("── 任务日志时间线 ──");
  for (const l of input.logs) {
    lines.push(`[${l.clock}] ${l.type} <${l.level}> ${l.text}`);
  }
  lines.push("");
  lines.push("── 警报处置记录 ──");
  if (input.alarmRecords.length === 0) lines.push("(本次任务无警报记录)");
  for (const a of input.alarmRecords) {
    const modeText = a.ackMode === "manual" ? "值班员处置" : "系统自动恢复";
    lines.push(
      `[${a.clock}] ${a.level.toUpperCase()} ${a.desc} · ${modeText} · 历时 ${Math.max(1, Math.round(a.durationMs / 1000))} 秒`,
    );
  }
  lines.push("");
  lines.push("── 遥测摘要（导出时各指标值） ──");
  for (const t of input.telemetrySnapshot) {
    lines.push(`${t.label}: ${t.value} ${t.unit}`);
  }
  lines.push("");
  lines.push("════════ 档案结束 · 由任务指挥墙前端生成 ════════");
  return lines.join("\n");
}

export function downloadArchive(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
