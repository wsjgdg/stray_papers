// 玉兔号月面俯视场景: 环形山地表 + 确定性岩石散布 + 双层视差滚动 + 行驶轨迹
// + 机械臂伸出/收回动画与采样点脉冲圆圈。
// 颜色全部经 themeColors 运行时读取 :root token, 不硬编码色值。
import { useEffect, useRef } from "react";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";
import { getActivePerf, shouldSkipFrame } from "@/lib/perfTier";
import { playAckConfirm, playAlignConfirm, playLockTick, playPrecisionLock } from "@/lib/missionAudio";
import type { MissionVisual } from "@/lib/missions";
import { ROVER_CRATERS, TITAN_LAKES, type RoverSnapshot } from "@/pages/Home/useRover";

interface RoverCanvasProps {
  snap: RoverSnapshot;
  unlocked: boolean;
  /** 任务视觉参数：火星为尘土地表色（token 派生） */
  visual: MissionVisual;
  /** 撞击坑命名（火星地名 / 月球编号） */
  craterNamer: (id: number) => string;
  /** 火星沙尘暴强度 0..1：>0 时叠加尘土粒子横吹 + 天空变暗遮罩（仅火星场景） */
  dustIntensity: number;
  /** 泰坦甲烷浓雾浓度 0..1：>0 时叠加橙褐雾幕, 远处地貌随雾淡出（仅泰坦场景） */
  fogIntensity?: number;
  /** 闪电计数：每次 +1 时整个场景瞬间照亮 ~0.28s（全球风暴随机调度传入） */
  boltFx?: number;
}

const TAU = Math.PI * 2;

/** alpha 量化到 1/20 档, 防止 themeColors 颜色缓存随连续强度值膨胀 */
function quantAlpha(a: number): number {
  return Math.max(0, Math.min(1, Math.round(a * 20) / 20));
}

function cellRand(i: number, j: number, seed: number): number {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function RoverCanvas({ snap, unlocked, visual, craterNamer, dustIntensity, fogIntensity = 0, boltFx }: RoverCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef(snap);
  const unlockedRef = useRef(unlocked);
  const visualRef = useRef(visual);
  const craterNamerRef = useRef(craterNamer);
  const dustRef = useRef(dustIntensity);
  const fogRef = useRef(fogIntensity);
  // 闪电照亮：记录最近一次闪电时刻, draw 里按时间差衰减叠加亮幕
  const boltFlashAtRef = useRef(0);
  // S 级矿点「已对准」边沿检测：false→true 瞬间播一次确认音, 持续对准期间不连响
  const alignedLastRef = useRef(false);
  // 持续对准起始时刻：>2.5s 升级金色「已锁定」稀有变体（0 = 未对准）
  const alignedSinceRef = useRef(0);
  // 金色锁定态提示音只播一次（进入锁定上升沿）
  const lockAnnouncedRef = useRef(false);
  // 锁定倒计时已播读秒格数（每 0.5s 一格音阶升高, 对准上升沿/离开复位）
  const lockTickRef = useRef(0);
  // 高精度快锁金色粒子爆散（上升沿生成, 每帧更新衰减, 离开对准也继续淡出）
  const lockBurstRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number }[]>([]);

  useEffect(() => {
    if (boltFx !== undefined && boltFx > 0) boltFlashAtRef.current = performance.now();
  }, [boltFx]);

  useEffect(() => {
    snapRef.current = snap;
    unlockedRef.current = unlocked;
    visualRef.current = visual;
    craterNamerRef.current = craterNamer;
    dustRef.current = dustIntensity;
    fogRef.current = fogIntensity;
  }, [snap, unlocked, visual, craterNamer, dustIntensity, fogIntensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const trail: { x: number; y: number }[] = [];
    // 转向扬尘颗粒（屏幕坐标, 车始终在画布中心）+ 转向角速度平滑值
    const wheelDust: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    // 漂移胎痕（世界坐标环状擦痕, 约 4s 淡出; 旋转中每 ~120ms 落一枚）
    const driftMarks: { x: number; y: number; at: number }[] = [];
    let prevHeading = snapRef.current.heading;
    // 上一帧烂路颠簸档（1/1.5/2.2）——升档瞬间爆一小蓬扬尘
    let prevRough = 1;
    let turnSmooth = 0;
    // 沙尘暴粒子场（归一化坐标, 逐帧横吹 + 越界回卷）
    const dustParts: { x: number; y: number; r: number; sp: number; drift: number }[] = Array.from(
      { length: 90 },
      () => ({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.9,
        sp: 0.004 + Math.random() * 0.009,
        drift: (Math.random() - 0.5) * 0.0016,
      }),
    );

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const groundBase = tokenHsl("--background");
    const trailColor = tokenHsl("--primary", 0.35);
    const roverBody = tokenHsl("--primary");
    const roverDeck = tokenHsl("--foreground", 0.85);
    const wheelColor = tokenHsl("--muted-foreground", 0.9);
    const landerColor = tokenHsl("--foreground", 0.7);
    const armColor = tokenHsl("--foreground", 0.9);
    const armJoint = tokenHsl("--primary", 0.95);

    // 地表配色：月球 = 冷灰月壤；火星 = 尘土地色（destructive token 调相派生, 不写死色值）
    let palettePlanet = "";
    let soilFar = tokenHsl("--muted-foreground", 0.07);
    let rockColor = tokenHsl("--muted-foreground", 0.5);
    let craterFill = tokenHsl("--background", 0.85);
    let craterRim = tokenHsl("--muted-foreground", 0.42);
    const syncPalette = () => {
      const v = visualRef.current;
      if (v.planet === palettePlanet) return;
      palettePlanet = v.planet;
      if (v.planet === "mars") {
        soilFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.6, light: v.lightScale * 0.7 }, 0.13);
        rockColor = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 6, sat: v.satScale * 0.7, light: v.lightScale * 0.95 }, 0.5);
        craterFill = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.5, light: v.lightScale * 0.5 }, 0.5);
        craterRim = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 4, sat: v.satScale * 0.65, light: v.lightScale * 1.05 }, 0.45);
      } else if (v.planet === "venus") {
        // 金星：硫磺赭金地表（destructive 调相派生）, 酸雾蚀变岩土暖调
        soilFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.55, light: v.lightScale * 0.6 }, 0.15);
        rockColor = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 6, sat: v.satScale * 0.65, light: v.lightScale * 0.9 }, 0.52);
        craterFill = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.45, light: v.lightScale * 0.45 }, 0.52);
        craterRim = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 4, sat: v.satScale * 0.6, light: v.lightScale }, 0.46);
      } else if (v.planet === "titan") {
        // 泰坦：橙褐有机沙丘地表（destructive 调相派生）, 水冰冰砾冷调点缀
        soilFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.5, light: v.lightScale * 0.55 }, 0.14);
        rockColor = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 8, sat: v.satScale * 0.4, light: v.lightScale * 1.1 }, 0.55);
        craterFill = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.42, light: v.lightScale * 0.42 }, 0.5);
        craterRim = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 4, sat: v.satScale * 0.55, light: v.lightScale * 0.95 }, 0.44);
      } else {
        soilFar = tokenHsl("--muted-foreground", 0.07);
        rockColor = tokenHsl("--muted-foreground", 0.5);
        craterFill = tokenHsl("--background", 0.85);
        craterRim = tokenHsl("--muted-foreground", 0.42);
      }
    };
    syncPalette();

    // 帧率封顶跳帧：上一实际绘制帧的时间戳（fpsCap<=0 时永不跳帧）
    let lastDrawMs = 0;
    const draw = (now?: number) => {
      const perf = getActivePerf();
      const ts = now ?? performance.now();
      // 帧率封顶：均衡 ~45fps / 省电 ~30fps, 跳过的帧只做 raf 续期不清屏
      if (shouldSkipFrame(ts, lastDrawMs, perf.fpsCap)) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawMs = ts;
      // 粒子密度按档位：轮尘/胎痕/风暴尘土走 dustMult, 金色爆散走 burstMult
      const wheelDustCap = Math.max(4, Math.round(14 * perf.dustMult));
      const driftCap = Math.max(10, Math.round(40 * perf.dustMult));
      const dustDrawCount = Math.max(12, Math.round(dustParts.length * perf.dustMult));
      syncPalette();
      const s = snapRef.current;
      const ppm = Math.max(2.2, Math.min(4.6, height / 80));
      const cx = width / 2;
      const cy = height / 2;

      // 轨迹点采样（世界坐标, 相机跟随所以绘制时要换算）
      if (unlockedRef.current) {
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(last.x - s.x, last.y - s.y) > 0.9) {
          trail.push({ x: s.x, y: s.y });
          if (trail.length > 240) trail.shift();
        }
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = groundBase;
      ctx.fillRect(0, 0, width, height);

      // 远层月壤斑块（0.55x 视差）
      const farCell = 150;
      const farOx = -s.x * ppm * 0.55;
      const farOy = -s.y * ppm * 0.55;
      ctx.fillStyle = soilFar;
      for (let i = Math.floor(-farOx / farCell) - 1; i * farCell + farOx < width + farCell; i++) {
        for (let j = Math.floor(-farOy / farCell) - 1; j * farCell + farOy < height + farCell; j++) {
          const r1 = cellRand(i, j, 7);
          if (r1 < 0.42) continue;
          const px = i * farCell + farOx + cellRand(i, j, 13) * 70;
          const py = j * farCell + farOy + cellRand(i, j, 29) * 70;
          ctx.beginPath();
          ctx.arc(px, py, 24 + r1 * 46, 0, TAU);
          ctx.fill();
        }
      }

      // 近层碎石（1x 视差）
      const nearCell = 46;
      const nearOx = -s.x * ppm;
      const nearOy = -s.y * ppm;
      ctx.fillStyle = rockColor;
      for (let i = Math.floor(-nearOx / nearCell) - 1; i * nearCell + nearOx < width + nearCell; i++) {
        for (let j = Math.floor(-nearOy / nearCell) - 1; j * nearCell + nearOy < height + nearCell; j++) {
          const r1 = cellRand(i, j, 3);
          if (r1 < 0.58) continue;
          const px = i * nearCell + nearOx + cellRand(i, j, 5) * nearCell;
          const py = j * nearCell + nearOy + cellRand(i, j, 11) * nearCell;
          ctx.beginPath();
          ctx.arc(px, py, 1 + cellRand(i, j, 17) * 2.4, 0, TAU);
          ctx.fill();
        }
      }

      // 泰坦甲烷湖（深色镜面湖块 + 湖岸亮环 + 湖名标注; 湖岸带内采样出 HC 碳氢样品）
      if (visualRef.current.planet === "titan") {
        for (const lk of TITAN_LAKES) {
          const px = cx + (lk.x - s.x) * ppm;
          const py = cy + (lk.y - s.y) * ppm;
          const rr = lk.r * ppm;
          if (px < -rr - 30 || px > width + rr + 30 || py < -rr - 30 || py > height + rr + 30) continue;
          // 湖面: 近黑镜面（background 深调）, 椭圆压扁模拟俯视透视
          ctx.fillStyle = tokenHsl("--background", 0.92);
          ctx.beginPath();
          ctx.ellipse(px, py, rr, rr * 0.72, 0, 0, TAU);
          ctx.fill();
          // 湖面微光: 主色极淡反射带
          ctx.fillStyle = tokenHsl("--primary", 0.07);
          ctx.beginPath();
          ctx.ellipse(px - rr * 0.2, py - rr * 0.18, rr * 0.55, rr * 0.3, -0.4, 0, TAU);
          ctx.fill();
          // 湖岸亮环
          ctx.strokeStyle = tokenHsl("--muted-foreground", 0.5);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(px, py, rr, rr * 0.72, 0, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = tokenHsl("--muted-foreground", 0.75);
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(lk.name, px, py + 3);
        }
      }

      // 撞击坑（带编号, 驶入范围触发里程碑日志）
      for (const c of ROVER_CRATERS) {
        const px = cx + (c.x - s.x) * ppm;
        const py = cy + (c.y - s.y) * ppm;
        const rr = c.r * ppm;
        if (px < -rr - 20 || px > width + rr + 20 || py < -rr - 20 || py > height + rr + 20) continue;
        ctx.fillStyle = craterFill;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = craterRim;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = craterRim;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        // 撞击坑足够大时画 mission 风格地名, 小坑只画编号
        ctx.fillText(rr > 24 ? craterNamerRef.current(c.id) : `#${c.id}`, px, py + 3);
      }

      // 行驶轨迹（虚线）
      if (trail.length > 1) {
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        trail.forEach((pt, idx) => {
          const px = cx + (pt.x - s.x) * ppm;
          const py = cy + (pt.y - s.y) * ppm;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // 着陆器（世界原点）
      const lx = cx + -s.x * ppm;
      const ly = cy + -s.y * ppm;
      if (lx > -40 && lx < width + 40 && ly > -40 && ly < height + 40) {
        ctx.strokeStyle = landerColor;
        ctx.lineWidth = 1.6;
        const legs: [number, number][] = [
          [-10, -10],
          [10, -10],
          [-10, 10],
          [10, 10],
        ];
        for (const [dx, dy] of legs) {
          ctx.beginPath();
          ctx.moveTo(lx + dx * 0.5, ly + dy * 0.5);
          ctx.lineTo(lx + dx, ly + dy);
          ctx.stroke();
          ctx.fillStyle = landerColor;
          ctx.beginPath();
          ctx.arc(lx + dx, ly + dy, 1.8, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = landerColor;
        ctx.fillRect(lx - 7, ly - 7, 14, 14);
        ctx.fillStyle = roverBody;
        ctx.beginPath();
        ctx.arc(lx, ly, 3, 0, TAU);
        ctx.fill();
      }

      // 采样点脉冲圆圈（钻取期间, 世界坐标锚定）
      if (s.armDrilling && s.armSite) {
        const spx = cx + (s.armSite.x - s.x) * ppm;
        const spy = cy + (s.armSite.y - s.y) * ppm;
        const tNow = performance.now() / 1000;
        for (let k = 0; k < 2; k++) {
          const t = (tNow * 1.2 + k * 0.5) % 1;
          const alpha = Math.max(0.1, Math.round((1 - t) * 8) / 8); // 量化 alpha, 避免颜色缓存膨胀
          ctx.strokeStyle = tokenHsl("--primary", alpha);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(spx, spy, 3 + t * 11, 0, TAU);
          ctx.stroke();
        }
        ctx.strokeStyle = tokenHsl("--primary", 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(spx - 4, spy);
        ctx.lineTo(spx + 4, spy);
        ctx.moveTo(spx, spy - 4);
        ctx.lineTo(spx, spy + 4);
        ctx.stroke();
      }

      // 木卫二冰裂隙（事件期间世界坐标锚定的锯齿暗线, 车头前方随机出现）
      if (s.crack) {
        const kx = cx + (s.crack.x - s.x) * ppm;
        const ky = cy + (s.crack.y - s.y) * ppm;
        if (kx > -40 && kx < width + 40 && ky > -40 && ky < height + 40) {
          ctx.save();
          ctx.translate(kx, ky);
          ctx.rotate(s.crack.ang);
          ctx.strokeStyle = tokenHsl("--background", 0.9);
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.moveTo(-15, 0);
          ctx.lineTo(-8, -2.6);
          ctx.lineTo(-2, 1.6);
          ctx.lineTo(5, -1.8);
          ctx.lineTo(11, 1.2);
          ctx.lineTo(15, 0);
          ctx.stroke();
          ctx.strokeStyle = tokenHsl("--foreground", 0.3);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // 越野拉力赛检查点（世界坐标编号旗标——编号 = 通过顺序 seq, 已过点变暗打勾, 下一目标脉冲光环; 倒序航线旗号与物理顺序相反）
      if (s.rallyPoints) {
        const tNow = performance.now() / 1000;
        let nextI = -1;
        let nextSeq = Number.POSITIVE_INFINITY;
        s.rallyPoints.forEach((pt, i) => {
          if (!pt.got && pt.seq < nextSeq) {
            nextSeq = pt.seq;
            nextI = i;
          }
        });
        s.rallyPoints.forEach((pt, i) => {
          const px = cx + (pt.x - s.x) * ppm;
          const py = cy + (pt.y - s.y) * ppm;
          if (px < -30 || px > width + 30 || py < -30 || py > height + 30) return;
          if (pt.got) {
            ctx.strokeStyle = tokenHsl("--muted-foreground", 0.4);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(px, py, 7, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px - 3.4, py);
            ctx.lineTo(px - 1, py + 2.8);
            ctx.lineTo(px + 3.8, py - 2.6);
            ctx.stroke();
            return;
          }
          const isNext = i === nextI;
          if (isNext) {
            const pulse = (tNow * 1.1) % 1;
            ctx.strokeStyle = tokenHsl("--primary", quantAlpha(Math.max(0.12, (1 - pulse) * 0.6)));
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(px, py, 8 + pulse * 9, 0, TAU);
            ctx.stroke();
          }
          ctx.strokeStyle = isNext ? tokenHsl("--primary", 0.95) : tokenHsl("--primary", 0.45);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, TAU);
          ctx.stroke();
          // 旗杆 + 三角旗
          ctx.beginPath();
          ctx.moveTo(px, py - 7);
          ctx.lineTo(px, py - 16);
          ctx.stroke();
          ctx.fillStyle = isNext ? tokenHsl("--primary", 0.9) : tokenHsl("--primary", 0.4);
          ctx.beginPath();
          ctx.moveTo(px, py - 16);
          ctx.lineTo(px + 8, py - 13.4);
          ctx.lineTo(px, py - 10.8);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = tokenHsl("--foreground", 0.85);
          ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(String(pt.seq), px, py + 3);
        });
      }

      // 补给空投箱（世界坐标: 十字打包带箱体 + 脉冲信标光环 + 剩余秒数; 稀有物资箱金色调相 + 顶部星标）
      if (s.supply) {
        const spx = cx + (s.supply.x - s.x) * ppm;
        const spy = cy + (s.supply.y - s.y) * ppm;
        if (spx > -30 && spx < width + 30 && spy > -30 && spy < height + 30) {
          const tNowS = performance.now() / 1000;
          const rare = s.supply.rare;
          // 稀有箱最后 10 秒进入「争夺告急」: 信标环转红 + 脉冲加快
          const urgent = rare && s.supply.remainS <= 10;
          const pulseS = (tNowS * (urgent ? 2.6 : 1.2)) % 1;
          const goldShift = { hue: -168, sat: 0.85, light: 1.05 };
          const boxColor = rare ? tokenShiftHsl("--primary", goldShift, 0.9) : tokenHsl("--primary", 0.85);
          ctx.strokeStyle = urgent
            ? tokenHsl("--destructive", quantAlpha(Math.max(0.18, (1 - pulseS) * 0.75)))
            : rare
              ? tokenShiftHsl("--primary", goldShift, quantAlpha(Math.max(0.12, (1 - pulseS) * 0.6)))
              : tokenHsl("--primary", quantAlpha(Math.max(0.12, (1 - pulseS) * 0.55)));
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(spx, spy, 8 + pulseS * 10, 0, TAU);
          ctx.stroke();
          if (rare) {
            // 稀有箱外圈常驻微光环（远距离也醒目; 告急期转红）
            ctx.strokeStyle = urgent ? tokenHsl("--destructive", 0.35) : tokenShiftHsl("--primary", goldShift, 0.25);
            ctx.beginPath();
            ctx.arc(spx, spy, 12, 0, TAU);
            ctx.stroke();
          }
          ctx.fillStyle = boxColor;
          ctx.fillRect(spx - 6, spy - 5, 12, 10);
          ctx.strokeStyle = tokenHsl("--background", 0.9);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(spx, spy - 5);
          ctx.lineTo(spx, spy + 5);
          ctx.moveTo(spx - 6, spy);
          ctx.lineTo(spx + 6, spy);
          ctx.stroke();
          if (rare) {
            // 顶部五角星标记（金色）
            ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, 1);
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
              const aOut = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
              const aIn = aOut + Math.PI / 5;
              const ox = spx + Math.cos(aOut) * 4;
              const oy = spy - 12 + Math.sin(aOut) * 4;
              if (k === 0) ctx.moveTo(ox, oy);
              else ctx.lineTo(ox, oy);
              ctx.lineTo(spx + Math.cos(aIn) * 1.7, spy - 12 + Math.sin(aIn) * 1.7);
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = urgent
            ? tokenHsl("--destructive", 0.95)
            : rare
              ? tokenShiftHsl("--primary", goldShift, 0.95)
              : tokenHsl("--foreground", 0.8);
          ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(urgent ? `RARE 告急 ${s.supply.remainS}s` : rare ? `RARE ${s.supply.remainS}s` : `${s.supply.remainS}s`, spx, rare ? spy - 19 : spy - 10);
        }
      }

      // 稀有箱拾取庆祝特效：金色双冲击环外扩 + 六道星芒粒子飞散 + 「+50% ⚡」上浮（1.4s 淡出）
      if (s.supplyBurst) {
        const bx = cx + (s.supplyBurst.x - s.x) * ppm;
        const by = cy + (s.supplyBurst.y - s.y) * ppm;
        const age = Math.min(1, Math.max(0, 1 - (s.supplyBurst.until - Date.now()) / 1400));
        const fade = 1 - age;
        const goldBurst = { hue: -168, sat: 0.85, light: 1.05 };
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = tokenShiftHsl("--primary", goldBurst, quantAlpha(fade * 0.9));
        ctx.beginPath();
        ctx.arc(bx, by, 8 + age * 40, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, quantAlpha(fade * 0.7));
        ctx.beginPath();
        ctx.arc(bx, by, 4 + age * 24, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = tokenShiftHsl("--primary", goldBurst, quantAlpha(fade));
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3 + age * 1.2;
          const r = 10 + age * (k % 2 === 0 ? 44 : 30);
          ctx.beginPath();
          ctx.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r, 2.2 * fade + 0.6, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, quantAlpha(fade));
        ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText("+50% ⚡", bx, by - 14 - age * 22);
      }

      // 月球车（相机中心, 按航向旋转; 转向时车体侧倾剪切 + 尾部扬起尘土颗粒）
      let dTurn = s.heading - prevHeading;
      while (dTurn > Math.PI) dTurn -= TAU;
      while (dTurn < -Math.PI) dTurn += TAU;
      prevHeading = s.heading;
      turnSmooth += (dTurn - turnSmooth) * 0.25;
      if (Math.abs(turnSmooth) > 0.004 && s.moving && wheelDust.length < wheelDustCap) {
        const back = s.heading + Math.PI;
        wheelDust.push({
          x: cx + Math.cos(back) * 10,
          y: cy + Math.sin(back) * 10,
          vx: Math.cos(back) * 0.7 + (Math.random() - 0.5) * 0.5,
          vy: Math.sin(back) * 0.7 + (Math.random() - 0.5) * 0.5,
          life: 1,
        });
      }
      for (let i = wheelDust.length - 1; i >= 0; i--) {
        const d = wheelDust[i];
        d.x += d.vx;
        d.y += d.vy;
        d.life -= 0.03;
        if (d.life <= 0) {
          wheelDust.splice(i, 1);
          continue;
        }
        ctx.fillStyle = tokenHsl("--muted-foreground", quantAlpha(d.life * 0.5));
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1 + d.life * 1.8, 0, TAU);
        ctx.fill();
      }
      // 采样落点预览：静止 + 机械臂待命时, 沿航向前方 4.5m（臂展）画虚线预判圈 + 遥感预测评级小字（坐标散列, 仅供参考）
      if (s.armPhase === "idle" && s.speed < 0.05 && unlockedRef.current) {
        const wx = s.x + Math.cos(s.heading) * 4.5;
        const wy = s.y + Math.sin(s.heading) * 4.5;
        const ax = cx + Math.cos(s.heading) * 4.5 * ppm;
        const ay = cy + Math.sin(s.heading) * 4.5 * ppm;
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = tokenHsl("--primary", 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ax, ay, Math.max(4, 1 * ppm), 0, TAU);
        ctx.stroke();
        ctx.restore();
        // 遥感预测评级：世界坐标确定性散列 → S/A/B（与真实化验无关的趣味参考）
        const hsh = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453) % 1;
        const pred = hsh < 0.12 ? "S" : hsh < 0.4 ? "A" : "B";
        ctx.fillStyle = pred === "S" ? tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.85) : tokenHsl("--primary", 0.6);
        ctx.font = "bold 8px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`遥感预测 ${pred}`, ax, ay + 3);
      }

      // S 级矿点高亮：扫描车周 16 个方位的 4.5m 落点, 遥感预测 S 级处标金色小星+「S」角标; 最贴近车头的星画虚线引导线
      if (unlockedRef.current) {
        ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, 0.9);
        let guideX = 0;
        let guideY = 0;
        let guideDiff = 99;
        let guideSigned = 0;
        for (let k = 0; k < 16; k++) {
          const sa = (k * TAU) / 16;
          const wx = s.x + Math.cos(sa) * 4.5;
          const wy = s.y + Math.sin(sa) * 4.5;
          const hsh = Math.abs(Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5453) % 1;
          if (hsh >= 0.12) continue;
          const px = cx + Math.cos(sa) * 4.5 * ppm;
          const py = cy + Math.sin(sa) * 4.5 * ppm;
          ctx.beginPath();
          for (let j = 0; j < 5; j++) {
            const aOut = -Math.PI / 2 + (j * 2 * Math.PI) / 5;
            const aIn = aOut + Math.PI / 5;
            const ox = px + Math.cos(aOut) * 3.4;
            const oy = py + Math.sin(aOut) * 3.4;
            if (j === 0) ctx.moveTo(ox, oy);
            else ctx.lineTo(ox, oy);
            ctx.lineTo(px + Math.cos(aIn) * 1.4, py + Math.sin(aIn) * 1.4);
          }
          ctx.closePath();
          ctx.fill();
          ctx.font = "bold 7px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText("S", px, py + 11);
          // 与车头方位的夹角, 记录最顺路的矿点（带符号: 正 = 需右转）
          let dAng = sa - s.heading;
          while (dAng > Math.PI) dAng -= TAU;
          while (dAng < -Math.PI) dAng += TAU;
          if (Math.abs(dAng) < guideDiff) {
            guideDiff = Math.abs(dAng);
            guideSigned = dAng;
            guideX = px;
            guideY = py;
          }
        }
        if (guideDiff < 1.2) {
          // 对准判定：偏差 <8° 时引导线/箭头/读数整体转 primary「已对准」态, 否则金色引导
          const aligned = Math.round((Math.abs(guideSigned) * 180) / Math.PI) < 8;
          // 已对准确认音：false→true 上升沿播一次轻柔「叮-✓」（静音态自动无声）; 记录对准起始时刻供金色锁定升级
          if (aligned) {
            if (!alignedLastRef.current) {
              playAlignConfirm();
              alignedSinceRef.current = performance.now();
              lockAnnouncedRef.current = false;
              lockTickRef.current = 0;
            }
            alignedLastRef.current = true;
          } else {
            alignedLastRef.current = false;
            alignedSinceRef.current = 0;
            lockTickRef.current = 0;
          }
          const lineCol = aligned ? tokenHsl("--primary", 0.55) : tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.4);
          ctx.save();
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = lineCol;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(guideX, guideY);
          ctx.stroke();
          ctx.restore();
          // 偏差角读数 + 转向辅助箭头：引导线中点标读数, 车体旁画指向目标方位的弧箭头（对准后转 primary）
          const deg = Math.round((Math.abs(guideSigned) * 180) / Math.PI);
          if (aligned) {
            // 已对准呼吸脉冲光晕：中点光环随 sin 胀缩 + 文字 shadowBlur 呼吸, 确认感更强
            // 锁定时长随对准精度变化：偏差 <3° 高精度 1.8s 即锁定（读秒音阶同步加密）, 否则 2.5s
            const lockMs = deg < 3 ? 1800 : 2500;
            // 持续对准走满 lockMs 升级金色「已锁定 ✦」稀有变体（进入瞬间播双短哔, 只响一次）
            const lockGold = alignedSinceRef.current > 0 && performance.now() - alignedSinceRef.current > lockMs;
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (lockGold ? 170 : 240));
            const midX = (cx + guideX) / 2;
            const midY = (cy + guideY) / 2 - 4;
            if (lockGold && !lockAnnouncedRef.current) {
              lockAnnouncedRef.current = true;
              // 高精度快锁（<3°）配专属华丽音 + 金色粒子爆散庆祝, 普通锁定双短哔
              if (deg < 3) {
                playPrecisionLock();
                const burst = lockBurstRef.current;
                const burstN = Math.max(5, Math.round(14 * perf.burstMult));
                for (let i = 0; i < burstN; i++) {
                  const a = (i / burstN) * TAU + Math.random() * 0.4;
                  const sp = 0.8 + Math.random() * 1.4;
                  burst.push({ x: midX, y: midY + 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
                }
              } else {
                playAckConfirm();
              }
            }
            const glowCol = lockGold
              ? tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, 0.9)
              : tokenHsl("--primary", 0.9);
            ctx.save();
            ctx.strokeStyle = lockGold
              ? tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, quantAlpha(0.35 + 0.45 * pulse))
              : tokenHsl("--primary", quantAlpha(0.3 + 0.4 * pulse));
            ctx.lineWidth = lockGold ? 1.6 : 1.2;
            ctx.beginPath();
            ctx.arc(midX, midY + 4, (lockGold ? 10 : 8) + 4 * pulse, 0, TAU);
            ctx.stroke();
            if (lockGold) {
              // 锁定态外圈：第二道金色细环反向呼吸, 稀有感加倍
              ctx.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, quantAlpha(0.2 + 0.3 * (1 - pulse)));
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.arc(midX, midY + 4, 15 + 3 * (1 - pulse), 0, TAU);
              ctx.stroke();
            }
            ctx.shadowColor = glowCol;
            ctx.shadowBlur = (lockGold ? 8 : 5) + 7 * pulse;
            ctx.fillStyle = glowCol;
            ctx.font = "bold 8px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.textAlign = "center";
            ctx.fillText(lockGold ? "S · 已锁定 ✦" : "S · 已对准 ✓", midX, midY);
            if (!lockGold && alignedSinceRef.current > 0) {
              // 锁定倒计时：中点外圈画进度弧（lockMs 走满）+ 剩余秒数读秒小字（高精度带 ⚡）
              const held = performance.now() - alignedSinceRef.current;
              const prog = Math.min(1, held / lockMs);
              // 进度音阶：按锁定速度均分五格（高精度格距更密）, 每格只响一次
              const tickIdx = Math.floor(held / (lockMs / 5));
              if (tickIdx > lockTickRef.current && tickIdx <= 4) {
                lockTickRef.current = tickIdx;
                playLockTick(tickIdx);
              }
              ctx.strokeStyle = tokenHsl("--primary", 0.85);
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(midX, midY + 4, 14, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
              ctx.stroke();
              ctx.fillStyle = tokenHsl("--primary", 0.7);
              ctx.font = "bold 7px ui-monospace, SFMono-Regular, Menlo, monospace";
              ctx.fillText(`${Math.max(0, (lockMs - held) / 1000).toFixed(1)}s 锁定${deg < 3 ? " ⚡" : ""}`, midX, midY + 27);
            }
            ctx.restore();
          } else if (deg >= 2) {
            ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.75);
            ctx.font = "bold 8px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.textAlign = "center";
            ctx.fillText(`S · ${guideSigned > 0 ? "右" : "左"}偏 ${deg}°`, (cx + guideX) / 2, (cy + guideY) / 2 - 4);
            // 弧形转向箭头：从车头方位扫向矿点方位（半径 22px, 末端三角箭头）
            const aFrom = s.heading;
            const aTo = s.heading + guideSigned;
            ctx.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.6);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, aFrom, aTo, guideSigned < 0);
            ctx.stroke();
            const tipX = cx + Math.cos(aTo) * 22;
            const tipY = cy + Math.sin(aTo) * 22;
            const perpA = aTo + (guideSigned > 0 ? Math.PI / 2 : -Math.PI / 2);
            ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.8);
            ctx.beginPath();
            ctx.moveTo(tipX + Math.cos(perpA) * 5, tipY + Math.sin(perpA) * 5);
            ctx.lineTo(tipX + Math.cos(aTo) * 3.4, tipY + Math.sin(aTo) * 3.4);
            ctx.lineTo(tipX - Math.cos(perpA) * 3.4, tipY - Math.sin(perpA) * 3.4);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // 离开引导区（或本帧无 S 级矿点）: 复位对准边沿, 防下次进入误触确认音
          alignedLastRef.current = false;
          alignedSinceRef.current = 0;
          lockTickRef.current = 0;
        }
        // 高精度快锁金色粒子：每帧更新（微重力下坠 + 寿命衰减）, 离开对准也继续淡出到自然消散
        const burst = lockBurstRef.current;
        for (let i = burst.length - 1; i >= 0; i--) {
          const pt = burst[i];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.02;
          pt.life -= 0.025;
          if (pt.life <= 0) {
            burst.splice(i, 1);
            continue;
          }
          ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.15 }, quantAlpha(pt.life * 0.9));
          ctx.fillRect(pt.x - 1, pt.y - 1, 2.4, 2.4);
        }
      }

      // 速度线：行驶较快时车后拖三道短促流线（速度感）
      if (s.speed > 1.6) {
        const backA = s.heading + Math.PI;
        ctx.strokeStyle = tokenHsl("--foreground", 0.16);
        ctx.lineWidth = 1;
        for (let k = -1; k <= 1; k++) {
          const ox = cx + Math.cos(backA + Math.PI / 2) * k * 5;
          const oy = cy + Math.sin(backA + Math.PI / 2) * k * 5;
          ctx.beginPath();
          ctx.moveTo(ox + Math.cos(backA) * 12, oy + Math.sin(backA) * 12);
          ctx.lineTo(ox + Math.cos(backA) * (12 + s.speed * 6), oy + Math.sin(backA) * (12 + s.speed * 6));
          ctx.stroke();
        }
      }
      ctx.save();
      // 悬挂颠簸：行驶中车体小幅上下起伏（速度越快越明显）; 碾过撞击坑沿附近时颠簸加剧（烂路感）
      let roughBoost = 1;
      for (const c of ROVER_CRATERS) {
        const dEdge = Math.abs(Math.hypot(s.x - c.x, s.y - c.y) - c.r);
        if (dEdge < 5) {
          roughBoost = 2.2;
          break;
        }
        if (dEdge < 10) roughBoost = Math.max(roughBoost, 1.5);
      }
      // 碾过坑沿瞬间（颠簸升档到 2.2）爆一小蓬扬尘
      if (roughBoost >= 2.2 && prevRough < 2.2 && s.speed > 0.8 && wheelDust.length < wheelDustCap) {
        for (let k = 0; k < 5; k++) {
          const pa = Math.random() * TAU;
          wheelDust.push({
            x: cx + Math.cos(pa) * 8,
            y: cy + Math.sin(pa) * 8,
            vx: Math.cos(pa) * 1.4,
            vy: Math.sin(pa) * 1.4,
            life: 1,
          });
        }
      }
      prevRough = roughBoost;
      // 漂移胎痕：旋转中每 ~120ms 在世界坐标落一枚环状擦痕（4s 淡出）
      if (s.spin) {
        const lastMark = driftMarks[driftMarks.length - 1];
        if (!lastMark || performance.now() - lastMark.at >= 120) {
          driftMarks.push({ x: s.x, y: s.y, at: performance.now() });
          if (driftMarks.length > driftCap) driftMarks.shift();
        }
      }
      for (let i = driftMarks.length - 1; i >= 0; i--) {
        const mk = driftMarks[i];
        const mAge = (performance.now() - mk.at) / 4000;
        if (mAge >= 1) {
          driftMarks.splice(i, 1);
          continue;
        }
        const mkx = cx + (mk.x - s.x) * ppm;
        const mky = cy + (mk.y - s.y) * ppm;
        ctx.strokeStyle = tokenHsl("--muted-foreground", quantAlpha((1 - mAge) * 0.35));
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mkx, mky, 9, mAge * 3, mAge * 3 + 4.4);
        ctx.stroke();
      }
      const bounceY =
        s.speed > 0.15 ? Math.sin((performance.now() / 1000) * 14) * Math.min(1.3, s.speed * 0.55) * roughBoost : 0;
      ctx.translate(cx, cy + bounceY);
      ctx.rotate(s.heading);
      // 侧倾：转向角速度剪切车体（左转为正向倾, 回正即复位）
      const tilt = Math.max(-0.16, Math.min(0.16, turnSmooth * 9));
      ctx.transform(1, 0, tilt, 1, 0, 0);
      ctx.fillStyle = wheelColor;
      const wheels: [number, number][] = [
        [-6, -8],
        [-6, 8],
        [6, -8],
        [6, 8],
      ];
      for (const [wx, wy] of wheels) ctx.fillRect(wx - 3, wy - 1.6, 6, 3.2);
      ctx.fillStyle = roverBody;
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = roverDeck;
      ctx.fillRect(-6, -10, 12, 3);
      ctx.fillRect(-6, 7, 12, 3);
      ctx.beginPath();
      ctx.arc(6, 0, 2.2, 0, TAU);
      ctx.fill();

      // 机械臂（车体前缘伸出, 长度随 armExtension 展开/收回）
      if (s.armExtension > 0.02) {
        const ext = 4 + s.armExtension * 12;
        ctx.strokeStyle = armColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(7, -3);
        ctx.lineTo(7 + ext * 0.55, -3);
        ctx.lineTo(7 + ext, -1);
        ctx.stroke();
        ctx.fillStyle = armJoint;
        ctx.beginPath();
        ctx.arc(7, -3, 1.6, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(7 + ext, -1, 2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 喇叭声波环：honkRover 触发, 0.9s 双环外扩淡出
      if (s.hornAt > 0) {
        const hAge = (Date.now() - s.hornAt) / 900;
        if (hAge < 1) {
          ctx.strokeStyle = tokenHsl("--primary", quantAlpha((1 - hAge) * 0.7));
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(cx, cy, 10 + hAge * 34, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = tokenHsl("--primary", quantAlpha((1 - hAge) * 0.4));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, 6 + hAge * 20, 0, TAU);
          ctx.stroke();
        }
      }

      // 前照灯双闪：1.2s 内三次亮灭, 车头方向一团 primary 光晕
      if (Date.now() < s.flashUntil) {
        const fElapsed = 1200 - (s.flashUntil - Date.now());
        if (fElapsed % 400 < 200) {
          const fx = cx + Math.cos(s.heading) * 11;
          const fy = cy + Math.sin(s.heading) * 11;
          const fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, 20);
          fg.addColorStop(0, tokenHsl("--primary", 0.5));
          fg.addColorStop(1, tokenHsl("--primary", 0));
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(fx, fy, 20, 0, TAU);
          ctx.fill();
        }
      }

      // 摩斯灯语：前照灯按自定义短句的点划时间线闪烁（segs 查表, 播完自熄）
      if (s.morse) {
        const mElapsed = Date.now() - s.morse.startAt;
        let mAcc = 0;
        let mOn = false;
        for (const sg of s.morse.segs) {
          if (mElapsed < mAcc + sg.dur) {
            mOn = sg.on;
            break;
          }
          mAcc += sg.dur;
        }
        if (mOn) {
          const mx2 = cx + Math.cos(s.heading) * 11;
          const my2 = cy + Math.sin(s.heading) * 11;
          const mg = ctx.createRadialGradient(mx2, my2, 1, mx2, my2, 18);
          mg.addColorStop(0, tokenHsl("--primary", 0.55));
          mg.addColorStop(1, tokenHsl("--primary", 0));
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.arc(mx2, my2, 18, 0, TAU);
          ctx.fill();
        }
      }

      // 原地漂移尘环：旋转中 8 颗尘粒绕车体环飞（半径呼吸）
      if (s.spin) {
        const stN = performance.now() / 1000;
        ctx.fillStyle = tokenHsl("--muted-foreground", 0.4);
        for (let k = 0; k < 8; k++) {
          const sa = stN * 5 + (k * TAU) / 8;
          const sr = 13 + Math.sin(stN * 9 + k) * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(sa) * sr, cy + Math.sin(sa) * sr, 1.4, 0, TAU);
          ctx.fill();
        }
      }

      // 火星沙尘暴 / 金星酸雾: 天空变暗遮罩 + 尘土粒子横吹（颜色全部走 token 派生, alpha 量化防缓存膨胀）
      const dustNow = dustRef.current;
      if (dustNow > 0.02 && (visualRef.current.planet === "mars" || visualRef.current.planet === "venus")) {
        const qI = quantAlpha(dustNow);
        const v = visualRef.current;
        ctx.fillStyle = tokenHsl("--background", quantAlpha(0.5 * qI));
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = tokenShiftHsl(
          v.hueSourceVar,
          { hue: v.hueShift + 10, sat: v.satScale * 0.75, light: v.lightScale * 1.35 },
          quantAlpha(0.1 + qI * 0.32),
        );
        for (let di = 0; di < dustDrawCount; di++) {
          const pt = dustParts[di];
          pt.x += pt.sp * (0.4 + qI);
          pt.y += pt.drift;
          if (pt.x > 1.02) {
            pt.x = -0.02;
            pt.y = Math.random();
          }
          if (pt.y < -0.02) pt.y = 1.02;
          else if (pt.y > 1.02) pt.y = -0.02;
          ctx.beginPath();
          ctx.arc(pt.x * width, pt.y * height, pt.r * (0.6 + qI), 0, TAU);
          ctx.fill();
        }
      }

      // 泰坦甲烷浓雾: 橙褐雾幕遮罩 + 缓慢漂移雾团（颜色全部走 token 派生, alpha 量化防缓存膨胀）
      const fogNow = fogRef.current;
      if (fogNow > 0.02 && visualRef.current.planet === "titan") {
        const qF = quantAlpha(fogNow);
        const v = visualRef.current;
        ctx.fillStyle = tokenShiftHsl(
          v.hueSourceVar,
          { hue: v.hueShift + 6, sat: v.satScale * 0.8, light: v.lightScale * 1.1 },
          quantAlpha(0.12 + qF * 0.4),
        );
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = tokenShiftHsl(
          v.hueSourceVar,
          { hue: v.hueShift, sat: v.satScale * 0.6, light: v.lightScale * 1.35 },
          quantAlpha(0.05 + qF * 0.14),
        );
        for (let di = 0; di < dustDrawCount; di++) {
          const pt = dustParts[di];
          pt.x += pt.sp * 0.25;
          pt.y += pt.drift * 0.5;
          if (pt.x > 1.02) {
            pt.x = -0.02;
            pt.y = Math.random();
          }
          if (pt.y < -0.02) pt.y = 1.02;
          else if (pt.y > 1.02) pt.y = -0.02;
          ctx.beginPath();
          ctx.arc(pt.x * width, pt.y * height, pt.r * 3.2, 0, TAU);
          ctx.fill();
        }
      }

      // 闪电瞬间照亮整个场景（含巡视车剪影）: 0.28s 内线性衰减的白色亮幕
      const sinceBolt = performance.now() - boltFlashAtRef.current;
      if (boltFlashAtRef.current > 0 && sinceBolt < 280) {
        ctx.fillStyle = tokenHsl("--foreground", quantAlpha(0.32 * (1 - sinceBolt / 280)));
        ctx.fillRect(0, 0, width, height);
      }

      // 拍照快门白闪 + 取景框：0.25s 白幕后接续 1s 四角框线+中心十字+PHOTO 角标; 滤镜轮换染色（标准白/金色纪念/冰蓝）
      if (s.photoFlash > 0) {
        const since = Date.now() - s.photoFlash;
        const filt = s.photoFilter ?? 0;
        const goldShift = { hue: -168, sat: 0.85, light: 1.05 };
        const iceShift = { hue: -30, sat: 0.9, light: 1.15 };
        const retroShift = { hue: -168, sat: 0.4, light: 0.8 }; // 复古: 低饱和暗金棕调
        const pick = (a: number) =>
          filt === 1
            ? tokenShiftHsl("--primary", goldShift, a)
            : filt === 2
              ? tokenShiftHsl("--primary", iceShift, a)
              : filt === 3
                ? tokenShiftHsl("--primary", retroShift, a)
                : tokenHsl("--foreground", a);
        const flashCol = pick;
        const frameCol = (a: number) => (filt === 0 ? tokenHsl("--primary", a) : pick(a));
        const filtName = ["STD", "GOLD", "ICE", "RETRO"][filt] ?? "STD";
        if (since < 250) {
          ctx.fillStyle = flashCol(quantAlpha((1 - since / 250) * 0.55));
          ctx.fillRect(0, 0, width, height);
        }
        if (since < 1000) {
          const fa = since < 250 ? 1 : 1 - (since - 250) / 750;
          ctx.strokeStyle = frameCol(quantAlpha(fa * 0.7));
          ctx.lineWidth = 1.4;
          const fm = 26; // 取景框边距
          const fl = 22; // 角线长度
          const corners: [number, number, number, number][] = [
            [fm, fm, 1, 1],
            [width - fm, fm, -1, 1],
            [fm, height - fm, 1, -1],
            [width - fm, height - fm, -1, -1],
          ];
          for (const [cxx, cyy, sx, sy] of corners) {
            ctx.beginPath();
            ctx.moveTo(cxx + sx * fl, cyy);
            ctx.lineTo(cxx, cyy);
            ctx.lineTo(cxx, cyy + sy * fl);
            ctx.stroke();
          }
          // 中心十字准线
          ctx.beginPath();
          ctx.moveTo(cx - 7, cy);
          ctx.lineTo(cx + 7, cy);
          ctx.moveTo(cx, cy - 7);
          ctx.lineTo(cx, cy + 7);
          ctx.stroke();
          ctx.fillStyle = frameCol(quantAlpha(fa * 0.8));
          ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "left";
          ctx.fillText(`◉ PHOTO · ${filtName}`, fm + 6, fm + 14);
          // 复古滤镜颗粒质感：取景期间全屏闪烁噪点（每帧随机重撒; 密度由面板滑杆手动调节 0-200, 默认 110）
          if (filt === 3) {
            const grain = s.grainLevel ?? 110;
            ctx.fillStyle = tokenShiftHsl("--primary", retroShift, quantAlpha(fa * 0.16));
            for (let gi = 0; gi < grain; gi++) {
              ctx.fillRect(Math.random() * width, Math.random() * height, 1.2, 1.2);
            }
          }
        }
      }

      // 精细操作模式指示：车体周围旋转虚线环 + FINE 小字（速度上限 ×0.4 的可视化提示）
      if (s.fineMode) {
        const fN = performance.now() / 1000;
        ctx.save();
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = tokenHsl("--primary", 0.4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 17, fN * 1.2, fN * 1.2 + Math.PI * 1.7);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = tokenHsl("--primary", 0.75);
        ctx.font = "bold 8px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText("FINE", cx, cy + 28);
      }

      // 夜航无灯拉力：全场暗幕 + 巡视车头灯光晕（中心径向留洞）, 检查点旗标画成穿透暗幕的发光信标
      if (s.rallyNight && s.rallyPoints) {
        const nightGrad = ctx.createRadialGradient(cx, cy, 22, cx, cy, 96);
        nightGrad.addColorStop(0, tokenHsl("--background", 0));
        nightGrad.addColorStop(0.62, tokenHsl("--background", 0.58));
        nightGrad.addColorStop(1, tokenHsl("--background", 0.92));
        ctx.fillStyle = nightGrad;
        ctx.fillRect(0, 0, width, height);
        const tNowN = performance.now() / 1000;
        let nextIdxN = -1;
        let nextSeqN = Number.POSITIVE_INFINITY;
        s.rallyPoints.forEach((pt, i) => {
          if (!pt.got && pt.seq < nextSeqN) {
            nextSeqN = pt.seq;
            nextIdxN = i;
          }
        });
        s.rallyPoints.forEach((pt, i) => {
          const px = cx + (pt.x - s.x) * ppm;
          const py = cy + (pt.y - s.y) * ppm;
          if (px < -30 || px > width + 30 || py < -30 || py > height + 30) return;
          if (pt.got) {
            // 已过信标：暗绿芯 + 打勾
            ctx.strokeStyle = tokenHsl("--primary", 0.5);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px - 3.4, py);
            ctx.lineTo(px - 1, py + 2.8);
            ctx.lineTo(px + 3.8, py - 2.6);
            ctx.stroke();
            return;
          }
          const isNext = i === nextIdxN;
          // 信标脉冲光晕（下一目标更快更亮）
          const pulse = (tNowN * (isNext ? 1.4 : 0.8)) % 1;
          ctx.fillStyle = tokenHsl("--primary", quantAlpha(0.3 * (1 - pulse)));
          ctx.beginPath();
          ctx.arc(px, py, 6 + pulse * 15, 0, TAU);
          ctx.fill();
          // 信标亮核 + 编号
          ctx.fillStyle = tokenHsl("--primary", isNext ? 0.95 : 0.6);
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = tokenHsl("--background", 0.92);
          ctx.font = "bold 8px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(String(pt.seq), px, py + 2.8);
        });
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
