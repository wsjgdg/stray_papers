/**
 * 设置弹层：文字速度四档、自动播放三档、音效开关、音量滑条、主题切换。
 * 设置/音效/主题全部经调用方传入的 handler 落盘（settings 走 naiwa-univ-settings-v1，
 * 音效开关沿用独立 key，主题沿用既有 ThemeSwitcher）。
 */
import { useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Download, Music, Upload, Volume2, VolumeX } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import {
  applyBackup,
  describeLocalProgress,
  downloadBackup,
  formatBackupTime,
  formatBytes,
  parseBackup,
  type BackupFile,
  type BackupSummary,
} from "@/lib/backup";
import {
  AUTO_SPEED_OPTIONS,
  TEXT_SPEED_OPTIONS,
  type GameSettings,
  type ThemeId,
} from "@/lib/gameSave";
import { applyBgmVolume, isBgmOn, setBgmOn } from "@/lib/bgm";
import { OverlayShell } from "./OverlayShell";
import { LeaveSchoolOverlay } from "./LeaveSchoolOverlay";

interface SettingsDialogProps {
  /** 本学期号（离校申请表的表头用） */
  playthrough: number;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  theme: ThemeId;
  onSwitchTheme: (themeId: ThemeId) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  /** 申请离校（批次 Z·行政化）：回到标题画面——用行政语言说退出 */
  onLeaveSchool: () => void;
}

function RowShell({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-card-foreground">{label}</h4>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const optionClass = (active: boolean) =>
  clsx(
    "flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
    active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground",
  );

/* 阅读舒适度（批次 CY-27）：字号三档 / 行距三档，选了当场生效（saveSettings 统一落到文档） */
const TEXT_SCALE_OPTIONS: Array<{ id: GameSettings["textScale"]; label: string; hint: string }> = [
  { id: "small", label: "小", hint: "整页缩一档，一屏看得更多" },
  { id: "normal", label: "适中", hint: "默认大小" },
  { id: "large", label: "大", hint: "整页放大一档，读起来省力" },
];
const LINE_SPACING_OPTIONS: Array<{ id: GameSettings["lineSpacing"]; label: string; hint: string }> = [
  { id: "snug", label: "紧凑", hint: "行与行挨得近" },
  { id: "normal", label: "正常", hint: "默认行距" },
  { id: "relaxed", label: "宽松", hint: "行与行拉开，长段落不串行" },
];

/**
 * 档案转移（批次 CY-106）：导出 = 下载一个 JSON 备份文件；导入 = 选文件 → 确认 → 覆盖 → 整页刷新。
 * 全程只碰 localStorage 快照，不动剧情内存态——导入成功后 location.reload() 重新加载一切。
 */
function BackupSection() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: BackupFile; summary: BackupSummary; fileName: string } | null>(null);
  const local = describeLocalProgress();

  const handleExport = () => {
    try {
      const fileName = downloadBackup();
      setImportError(null);
      setNotice(`已签发转移文件「${fileName}」，去浏览器的下载里查收。`);
    } catch {
      setNotice(null);
      setImportError("导出失败——浏览器拦下了文件签发，请重试。");
    }
  };

  const handlePickFile = async (picked: File | undefined) => {
    if (!picked) return;
    setNotice(null);
    setImportError(null);
    try {
      const text = await picked.text();
      const result = parseBackup(text);
      if (!result.ok) {
        setImportError(result.reason);
        return;
      }
      setPending({ file: result.file, summary: result.summary, fileName: picked.name });
    } catch {
      setImportError("文件读不出来——可能已损坏。");
    }
  };

  const handleConfirmImport = () => {
    if (!pending) return;
    applyBackup(pending.file);
    /* 覆盖完成，整页刷新让主题/设置/存档全部从新档加载 */
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        档案只记在这台浏览器里。签一份转移文件随身带走，换设备时呈交即可续档——当前进度约 {formatBytes(local.approxBytes)}（{local.keyCount} 项）。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Download size={14} aria-hidden />
          导出档案
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
        >
          <Upload size={14} aria-hidden />
          导入档案
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="选择档案转移文件"
          onChange={(event) => {
            void handlePickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      {notice && <p className="text-xs font-bold leading-relaxed text-primary">{notice}</p>}
      {importError && <p className="text-xs font-bold leading-relaxed text-destructive">{importError}</p>}
      {pending && (
        <div className="rounded-xl border border-border bg-muted/50 p-3">
          <p className="text-sm font-bold text-card-foreground">核验转移文件「{pending.fileName}」</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            签发于 {formatBackupTime(pending.summary.exportedAt)}，含 {pending.summary.keyCount} 项档案（约 {formatBytes(pending.summary.approxBytes)}）。
            呈交后，本浏览器现有进度将被整份覆盖——存档、图鉴、成就、周目全部换成文件里的样子，且不可撤回。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirmImport}
              className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-opacity duration-200 hover:opacity-90 focus-visible:shadow-focus focus-visible:outline-none"
            >
              确认覆盖并重启
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              先不呈交
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 舒适度开关（批次 CY-27）：与「未表态登记」同一颗小闸的样子 */function ComfortSwitch({ on, onToggle, label, hint }: { on: boolean; onToggle: () => void; label: string; hint: string }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-bold text-card-foreground">{label}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={clsx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform duration-200",
            on ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function SettingsDialog({
  playthrough,
  onClose,
  settings,
  onUpdateSettings,
  theme,
  onSwitchTheme,
  soundOn,
  onToggleSound,
  onLeaveSchool,
}: SettingsDialogProps) {
  /** BGM 开关由 bgm 模块自己持有并持久化（settings.bgmOn），这里只同步显示 */
  const [bgmOn, setBgmOnLocal] = useState(() => isBgmOn());
  const toggleBgm = () => setBgmOnLocal(setBgmOn(!isBgmOn()));
  /* 申请离校（批次 CH）：退出不是退出，是申请离校——填表才能走 */
  const [leaveOpen, setLeaveOpen] = useState(false);
  return (
    <OverlayShell
      title="行政规定"
      subtitle="《奶蛙大学行政规定》——每一条都有编号。规定跟着浏览器走，不写进剧情档案。"
      onClose={onClose}
      sizeClass="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <RowShell label="第四条 · 文本显示速度" hint="逐字展现的快慢，瞬间档整句直接显示">
          <div className="flex gap-2">
            {TEXT_SPEED_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.hint}
                aria-pressed={settings.textSpeed === option.id}
                onClick={() => onUpdateSettings({ textSpeed: option.id })}
                className={optionClass(settings.textSpeed === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </RowShell>

        <RowShell label="第三条 · 自动推进" hint="开启后，整句读完等多久往下走">
          <div className="flex gap-2">
            {AUTO_SPEED_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={settings.autoMs === option.ms}
                onClick={() => onUpdateSettings({ autoMs: option.ms })}
                className={optionClass(settings.autoMs === option.ms)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </RowShell>

        <RowShell label="第一条 · 声量调整" hint="推进轻嗒、选项咚声、雨声都在这里调">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={soundOn}
              onClick={onToggleSound}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                soundOn
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {soundOn ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
              {soundOn ? "已开启" : "已静音"}
            </button>
            <label className="flex min-w-40 flex-1 items-center gap-3">
              <span className="shrink-0 text-xs font-bold text-muted-foreground">音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.volume}
                disabled={!soundOn}
                onChange={(changeEvent) => onUpdateSettings({ volume: Number(changeEvent.target.value) })}
                aria-label="音量"
                className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-50"
              />
              <span className="w-10 shrink-0 text-right text-xs font-bold text-card-foreground">
                {Math.round(settings.volume * 100)}%
              </span>
            </label>
          </div>
        </RowShell>

        <RowShell label="第二条 · 校园广播" hint="配乐声量与提示音分开调，关卡里也各有开关">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-pressed={bgmOn}
              onClick={toggleBgm}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 focus-visible:shadow-focus focus-visible:outline-none",
                bgmOn
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Music size={14} aria-hidden />
              {bgmOn ? "播放中" : "已关闭"}
            </button>
            <label className="flex min-w-40 flex-1 items-center gap-3">
              <span className="shrink-0 text-xs font-bold text-muted-foreground">声量调整</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.bgmVolume}
                disabled={!bgmOn}
                onChange={(changeEvent) => {
                  onUpdateSettings({ bgmVolume: Number(changeEvent.target.value) });
                  applyBgmVolume();
                }}
                aria-label="BGM 声量调整"
                className="h-1.5 flex-1 cursor-pointer accent-primary disabled:cursor-default disabled:opacity-50"
              />
              <span className="w-10 shrink-0 text-right text-xs font-bold text-card-foreground">
                {Math.round(settings.bgmVolume * 100)}%
              </span>
            </label>
        <label className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold text-card-foreground">未表态登记</span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              个别关键场景，选项出现后一直不做选择，按「沉默」归档并自动推进。默认开。
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.idleWait}
            onClick={() => onUpdateSettings({ idleWait: !settings.idleWait })}
            className={clsx(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
              settings.idleWait ? "bg-primary" : "bg-muted",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform duration-200",
                settings.idleWait ? "translate-x-[22px]" : "translate-x-0.5",
              )}
            />
          </button>
        </label>
          </div>
        </RowShell>

        <RowShell label="第五条 · 已阅内容快速通过" hint="已读过的段落整句跳过，只停在新内容与抉择处">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs leading-relaxed text-muted-foreground">
              在顶栏随时开关；本栏只作说明，不设开关。
            </span>
          </div>
        </RowShell>

        <RowShell label="第六条 · 主题切换" hint="三套行政风格：奶白 · 档案纸 ／ 红头 · 喜报 ／ 深夜 · 灯下">
          <ThemeSwitcher theme={theme} onSwitch={onSwitchTheme} />
        </RowShell>

        <RowShell label="第七条 · 例外流程" hint="两项特殊流程默认不受理；开启后自担后果，本柜不回收">
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-card-foreground">未编目之后停止记录</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  集齐全部结局后启用：系统不再收真话、不再记档案、不再解锁新结局。角色仍记得你——系统不再记得。
                </span>
              </span>
              <span
                role="switch"
                aria-checked={settings.muteAfterSecret}
                onClick={() => onUpdateSettings({ muteAfterSecret: !settings.muteAfterSecret })}
                className={clsx(
                  "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                  settings.muteAfterSecret ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform duration-200",
                    settings.muteAfterSecret ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-bold text-card-foreground">沉默存档污染</span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  允许「以空白归档」：存一份没有内容的档。读它之后，柜子里会开始有格子变白——不可逆。
                </span>
              </span>
              <span
                role="switch"
                aria-checked={settings.blankInfection}
                onClick={() => onUpdateSettings({ blankInfection: !settings.blankInfection })}
                className={clsx(
                  "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
                  settings.blankInfection ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform duration-200",
                    settings.blankInfection ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </label>
          </div>
        </RowShell>

        <RowShell label="第九条 · 阅读舒适度" hint="字号、行距、动效、对比——选了当场生效，只记在这台浏览器里">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">字号</p>
              <div className="flex gap-2">
                {TEXT_SCALE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.hint}
                    aria-pressed={settings.textScale === option.id}
                    onClick={() => onUpdateSettings({ textScale: option.id })}
                    className={optionClass(settings.textScale === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-muted-foreground">行距</p>
              <div className="flex gap-2">
                {LINE_SPACING_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.hint}
                    aria-pressed={settings.lineSpacing === option.id}
                    onClick={() => onUpdateSettings({ lineSpacing: option.id })}
                    className={optionClass(settings.lineSpacing === option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <ComfortSwitch
              on={settings.reduceMotion}
              onToggle={() => onUpdateSettings({ reduceMotion: !settings.reduceMotion })}
              label="减少动效"
              hint="关掉页面里的呼吸、浮出与转场动画——眼睛只跟字走，不被旁边晃。"
            />
            <ComfortSwitch
              on={settings.highContrast}
              onToggle={() => onUpdateSettings({ highContrast: !settings.highContrast })}
              label="高对比文字"
              hint="把淡灰的辅助文字提亮成正文色，小字不再费劲。"
            />
            <ComfortSwitch
              on={settings.nightLamp}
              onToggle={() => onUpdateSettings({ nightLamp: !settings.nightLamp })}
              label="夜灯模式（护眼）"
              hint="整块画面蒙上一层暖黄柔光，四周微微收暗——夜里读剧情不刺眼，三套主题都能叠着用。"
            />
          </div>
        </RowShell>

        <RowShell label="第十条 · 快捷键" hint="手不离键盘也能翻这页纸；本条只作说明，不设开关">
          <ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-muted-foreground">
            {[
              { key: "Space", note: "推进台词——打字中先补完整句，再按落一句（与点击舞台同一条路）" },
              { key: "点击舞台", note: "同上，鼠标党的推进方式" },
              { key: "K", note: "鸣叫：没有理由的发声" },
              { key: "N", note: "跳到没读过：越过这一幕里的已读段" },
              { key: "P", note: "暂停（时间机器）——暂停里世界不跟你停" },
            ].map((item) => (
              <li key={item.key} className="flex items-baseline gap-2">
                <span className="inline-flex shrink-0 items-center rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-bold text-card-foreground">
                  {item.key}
                </span>
                <span>{item.note}</span>
              </li>
            ))}
          </ul>
        </RowShell>

        <RowShell label="第十一条 · 档案转移" hint="把全部进度签成一份文件带走，或呈交旧档续读">
          <BackupSection />
        </RowShell>

        <RowShell label="第八条 · 申请离校" hint="退出不是退出，是申请离校——要填表">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs leading-relaxed text-muted-foreground">
              事由四选一，档案不问真假。离校只是把窗口关掉——档案还在原位。
            </span>
            <button
              type="button"
              onClick={() => setLeaveOpen(true)}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
            >
              申请离校 · 回标题
            </button>
          </div>
        </RowShell>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        本柜档案随时待命。规定只记在浏览器里——换设备前，先按第十一条签一份档案带走。
      </p>

      {/* 离校申请表（批次 CH）：填完才走 */}
      {leaveOpen && (
        <LeaveSchoolOverlay
          playthrough={playthrough}
          onConfirm={() => {
            setLeaveOpen(false);
            onLeaveSchool();
          }}
          onClose={() => setLeaveOpen(false)}
        />
      )}
    </OverlayShell>
  );
}
