import { useEffect, useRef } from "react";
import { tokenHsl, tokenShiftHsl } from "@/lib/themeColors";
import { getActivePerf, shouldSkipFrame } from "@/lib/perfTier";
import type { MissionVisual } from "@/lib/missions";

interface Star {
  x: number;
  y: number;
  r: number;
  depth: number;
  tw: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** 金色稀有流星（仅流星雨窗口内低概率出现: 更慢更长寿, 点击记录功勋更高） */
  gold: boolean;
}

interface OrbitDef {
  rx: number;
  ry: number;
  rot: number;
  speed: number;
}

interface CraterDef {
  dx: number;
  dy: number;
  rr: number;
}

// 月面环形山（相对月心坐标, 半径比例）
const CRATERS: CraterDef[] = [
  { dx: -0.32, dy: -0.28, rr: 0.16 },
  { dx: 0.22, dy: -0.42, rr: 0.1 },
  { dx: 0.4, dy: 0.08, rr: 0.13 },
  { dx: -0.12, dy: 0.3, rr: 0.2 },
  { dx: 0.18, dy: 0.42, rr: 0.09 },
  { dx: -0.48, dy: 0.12, rr: 0.08 },
  { dx: 0.02, dy: -0.08, rr: 0.07 },
];

// 极光窗口星座连线彩蛋的虚构星座名（每次开窗随机挑一个）
const CONSTELLATIONS = ["海鲸骨", "罗盘座", "风筝锚", "冰犁座", "长庚座", "断桥座", "听潮座", "孤帆座"];

// 星座许愿的愿望文字池（许愿流星回应时浮字显示, 随机挑一句）
const WISH_TEXTS = ["愿轨道常晴", "愿信号永不掉线", "愿电池常满", "愿着陆腿永远稳", "愿样品全是 S 级", "愿沙尘暴绕道走", "愿链路零延迟", "愿值班无警报"];

interface StarfieldCanvasProps {
  /** 0 = 地球视角, 1 = 目标星球视角（月球/火星）, 中间平滑过渡 */
  moonMix: number;
  /** 当前任务的星野视觉参数（火星为红橙色球体 + 暖尘星空） */
  visual: MissionVisual;
  /** 流星雨观测窗口激活：流星密集生成, 点击流星头部即记录（回调 useHome 加功勋; gold = 命中金色稀有流星） */
  showerActive?: boolean;
  onMeteorHit?: (gold: boolean) => void;
  /** 极光观测窗口激活：星野上方绘制三条极光光幕, 点击光幕带附近即记录光谱（回调 useHome 加功勋） */
  auroraActive?: boolean;
  /** 红色罕见极光（光谱记录翻倍）：光幕改用 destructive 血红调 */
  auroraRare?: boolean;
  onAuroraHit?: () => void;
  /** 星座连线彩蛋点击许愿（极光窗口内点中星座星点, 每窗限一次） */
  onConstellationHit?: () => void;
}

export function StarfieldCanvas({ moonMix, visual, showerActive, onMeteorHit, auroraActive, auroraRare, onAuroraHit, onConstellationHit }: StarfieldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mixTargetRef = useRef(moonMix);
  const mixRef = useRef(moonMix);
  const visualRef = useRef(visual);
  const showerRef = useRef(showerActive ?? false);
  const onHitRef = useRef(onMeteorHit);
  const auroraRef = useRef(auroraActive ?? false);
  const auroraRareRef = useRef(auroraRare ?? false);
  const onAuroraHitRef = useRef(onAuroraHit);
  const onConstellationHitRef = useRef(onConstellationHit);
  // 三条极光带的当前中心 x（draw 每帧写入, onClick 命中判定读取）
  const auroraBandXRef = useRef<number[]>([]);
  // 流星雨窗口内被点击命中的流星（画一次爆散闪光; gold = 金色稀有流星, 画金色双环）
  const burstRef = useRef<{ x: number; y: number; at: number; gold: boolean }[]>([]);

  useEffect(() => {
    mixTargetRef.current = moonMix;
  }, [moonMix]);

  useEffect(() => {
    visualRef.current = visual;
  }, [visual]);

  useEffect(() => {
    showerRef.current = showerActive ?? false;
  }, [showerActive]);

  useEffect(() => {
    onHitRef.current = onMeteorHit;
  }, [onMeteorHit]);

  useEffect(() => {
    auroraRef.current = auroraActive ?? false;
  }, [auroraActive]);

  useEffect(() => {
    auroraRareRef.current = auroraRare ?? false;
  }, [auroraRare]);

  useEffect(() => {
    onAuroraHitRef.current = onAuroraHit;
  }, [onAuroraHit]);

  useEffect(() => {
    onConstellationHitRef.current = onConstellationHit;
  }, [onConstellationHit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const stars: Star[] = [];
    // 流星：随机间隔生成, 带渐隐拖尾划过星野
    const meteors: Meteor[] = [];
    // 极光窗口星座连线彩蛋（开窗时从上半天区随机挑 6 颗亮星生成, 关窗清空）
    let constellation: { pts: { x: number; y: number }[]; name: string } | null = null;
    // 许愿浮字（愿望文字随回应流星浮现, 2.4s 上浮淡出）
    const wishTexts: { x: number; y: number; at: number; text: string }[] = [];
    let nextMeteorAt = 2 + Math.random() * 3;
    let lastNow = performance.now();
    // 帧率封顶跳帧：上一实际绘制帧的时间戳（fpsCap<=0 时永不跳帧）
    let lastDrawMs = 0;

    // 星野按性能档位密度生成（saver 0.75x）; 档位切换时重建
    let starMultBuilt = -1;
    const buildStars = (mult: number) => {
      stars.length = 0;
      const count = Math.max(60, Math.round(240 * mult));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: Math.random() * 1.4 + 0.3,
          depth: Math.random() * 0.8 + 0.2,
          tw: Math.random() * Math.PI * 2,
        });
      }
      starMultBuilt = mult;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (stars.length === 0 && width > 0) {
        buildStars(getActivePerf().starMult);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // 点击命中判定：流星雨窗口距流星头 34px（金色 42px）内算记录; 极光窗口点在光幕带横向 70px 内且上半屏算记录光谱
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (showerRef.current) {
        for (let i = meteors.length - 1; i >= 0; i--) {
          const mt = meteors[i];
          if (Math.hypot(mx - mt.x, my - mt.y) < (mt.gold ? 42 : 34)) {
            burstRef.current.push({ x: mt.x, y: mt.y, at: performance.now(), gold: mt.gold });
            meteors.splice(i, 1);
            onHitRef.current?.(mt.gold);
            return;
          }
        }
      }
      // 星座连线彩蛋许愿：点中星座星点 24px 内优先触发（每窗一次由 useHome 侧限制）——金色爆散 + 回应流星划落
      if (auroraRef.current && constellation) {
        for (const cp of constellation.pts) {
          if (Math.hypot(mx - cp.x, my - cp.y) < 24) {
            burstRef.current.push({ x: mx, y: my, at: performance.now(), gold: true });
            // 许愿回应：从许愿点上方划过一颗金色长尾流星（纯视觉, 回应许愿）+ 愿望浮字
            const dirW = Math.random() < 0.5 ? -1 : 1;
            meteors.push({
              x: Math.min(width - 20, Math.max(20, mx - dirW * 150)),
              y: -8,
              vx: dirW * 170,
              vy: 160,
              life: 0,
              maxLife: 3.4,
              gold: true,
            });
            wishTexts.push({ x: mx, y: my, at: performance.now(), text: WISH_TEXTS[Math.floor(Math.random() * WISH_TEXTS.length)] });
            onConstellationHitRef.current?.();
            return;
          }
        }
      }
      if (auroraRef.current && my < height * 0.5) {
        for (const bx of auroraBandXRef.current) {
          if (Math.abs(mx - bx) < 70) {
            burstRef.current.push({ x: mx, y: my, at: performance.now(), gold: false });
            onAuroraHitRef.current?.();
            break;
          }
        }
      }
    };
    canvas.addEventListener("click", onClick);

    const starColor = tokenHsl("--foreground");
    const glowNear = tokenHsl("--primary", 0.1);
    const glowFar = tokenHsl("--primary", 0);
    const planetCore = tokenHsl("--secondary");
    const planetRim = tokenHsl("--primary", 0.35);
    const planetDark = tokenHsl("--background");
    const orbitColor = tokenHsl("--border");
    const satColor = tokenHsl("--primary");
    const moonLight = tokenHsl("--foreground", 0.62);
    const moonMid = tokenHsl("--muted-foreground", 0.45);
    const moonDark = tokenHsl("--background");
    const craterColor = tokenHsl("--muted-foreground", 0.3);
    const meteorHead = tokenHsl("--foreground", 0.9);
    const meteorTail = tokenHsl("--primary", 0);
    // 金色稀有流星：--primary 调相派生金黄（不写死色值）, 头亮尾透
    const goldHead = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.98);
    const goldTail = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0);
    const goldGlow = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, 0.3);
    // 极光光幕：--primary 调相派生极光绿（213°→140°, 不写死色值）, 纵向渐变上淡中亮下隐
    const auroraA0 = tokenShiftHsl("--primary", { hue: -73, sat: 0.9, light: 1.1 }, 0.02);
    const auroraA1 = tokenShiftHsl("--primary", { hue: -73, sat: 0.9, light: 1.1 }, 0.13);
    const auroraA2 = tokenShiftHsl("--primary", { hue: -73, sat: 0.9, light: 1.1 }, 0);
    // 红色罕见极光：destructive 血红调（token 派生）, 同三段渐变
    const auroraR0 = tokenHsl("--destructive", 0.03);
    const auroraR1 = tokenHsl("--destructive", 0.16);
    const auroraR2 = tokenHsl("--destructive", 0);
    // 行星表面光泽扫过带（两端全透明, 中间极淡 foreground）
    const shineEdge = tokenHsl("--foreground", 0);
    const shineMid = tokenHsl("--foreground", 0.07);

    // 火星目标星球配色：由 mission visual 的 token + HSL 偏移派生（不写死色值）
    let targetPlanet = "";
    let targetLight = moonLight;
    let targetMid = moonMid;
    let targetDark = moonDark;
    let targetCrater = craterColor;
    let dustNear = glowFar;
    let dustFar = glowFar;
    const syncTargetColors = () => {
      const v = visualRef.current;
      if (v.planet === targetPlanet) return;
      targetPlanet = v.planet;
      if (v.planet === "mars") {
        targetLight = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale * 1.5 }, 0.9);
        targetMid = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale * 1.05 }, 0.82);
        targetDark = tokenHsl("--background");
        targetCrater = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 8, sat: v.satScale * 0.7, light: v.lightScale * 0.7 }, 0.34);
        dustNear = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.8, light: v.lightScale * 1.2 }, v.dustAlpha);
        dustFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.8, light: v.lightScale * 1.2 }, 0);
      } else if (v.planet === "venus") {
        // 金星：硫磺赭金球体（destructive 调相派生）+ 暖尘大气辉光, 酸云地貌低对比
        targetLight = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale * 1.45 }, 0.9);
        targetMid = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale }, 0.84);
        targetDark = tokenHsl("--background");
        targetCrater = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 10, sat: v.satScale * 0.6, light: v.lightScale * 0.65 }, 0.36);
        dustNear = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.85, light: v.lightScale * 1.25 }, v.dustAlpha);
        dustFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.85, light: v.lightScale * 1.25 }, 0);
      } else if (v.planet === "europa") {
        // 木卫二：冰蓝白球体（primary 调相派生）, 冰脊纹用低透明冷色
        targetLight = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale * 1.4 }, 0.92);
        targetMid = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale }, 0.78);
        targetDark = tokenHsl("--background");
        targetCrater = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 12, sat: v.satScale * 1.5, light: v.lightScale * 0.8 }, 0.42);
        dustNear = glowFar;
        dustFar = glowFar;
      } else if (v.planet === "titan") {
        // 泰坦：橙褐雾霾球体（destructive 调相派生）, 浓密大气辉光, 表面地貌被雾霭抹平
        targetLight = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale, light: v.lightScale * 1.35 }, 0.88);
        targetMid = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.9, light: v.lightScale * 0.95 }, 0.8);
        targetDark = tokenHsl("--background");
        targetCrater = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift + 6, sat: v.satScale * 0.5, light: v.lightScale * 0.6 }, 0.2);
        dustNear = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.85, light: v.lightScale * 1.2 }, v.dustAlpha);
        dustFar = tokenShiftHsl(v.hueSourceVar, { hue: v.hueShift, sat: v.satScale * 0.85, light: v.lightScale * 1.2 }, 0);
      } else {
        targetLight = moonLight;
        targetMid = moonMid;
        targetDark = moonDark;
        targetCrater = craterColor;
        dustNear = glowFar;
        dustFar = glowFar;
      }
    };
    syncTargetColors();

    const t0 = performance.now();
    const draw = (now: number) => {
      const perf = getActivePerf();
      // 帧率封顶：均衡 ~45fps / 省电 ~30fps, 跳过的帧只做 raf 续期不清屏
      if (shouldSkipFrame(now, lastDrawMs, perf.fpsCap)) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawMs = now;
      if (starMultBuilt !== perf.starMult && width > 0) buildStars(perf.starMult);
      const t = (now - t0) / 1000;
      syncTargetColors();
      // 视角混合系数向目标平滑逼近
      mixRef.current += (mixTargetRef.current - mixRef.current) * 0.02;
      const mix = mixRef.current;
      const minDim = Math.min(width, height);
      ctx.clearRect(0, 0, width, height);

      // 星云辉光（随目标星球视角轻微增强）
      const glow = ctx.createRadialGradient(
        width * 0.78, height * 0.18, 8,
        width * 0.78, height * 0.18, Math.max(width, height) * (0.55 + mix * 0.15),
      );
      glow.addColorStop(0, glowNear);
      glow.addColorStop(1, glowFar);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // 火星任务：星野叠加暖尘色辉光（token 派生, 强度随视角增强）
      if (visualRef.current.dustAlpha > 0) {
        const dust = ctx.createRadialGradient(
          width * 0.2, height * 0.86, 10,
          width * 0.2, height * 0.86, Math.max(width, height) * (0.6 + mix * 0.25),
        );
        dust.addColorStop(0, dustNear);
        dust.addColorStop(1, dustFar);
        ctx.fillStyle = dust;
        ctx.fillRect(0, 0, width, height);
      }

      // 视差星野
      for (const s of stars) {
        s.x -= s.depth * 0.06;
        s.y += s.depth * 0.02;
        if (s.x < -2) s.x = width + 2;
        if (s.y > height + 2) s.y = -2;
        ctx.globalAlpha = (0.55 + 0.45 * Math.sin(t * 1.6 + s.tw)) * s.depth;
        ctx.fillStyle = starColor;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 极光观测窗口：三条缓慢摆动的极光光幕（波浪边缘 + 纵向渐变, 点击带内记录光谱; 红色罕见变体走 destructive 调）
      if (auroraRef.current) {
        const aStops = auroraRareRef.current ? [auroraR0, auroraR1, auroraR2] : [auroraA0, auroraA1, auroraA2];
        const auroraBases = [0.2, 0.5, 0.8];
        for (let i = 0; i < auroraBases.length; i++) {
          const bx = width * auroraBases[i] + Math.sin(t * 0.45 + i * 2.3) * 30;
          auroraBandXRef.current[i] = bx;
          const halfW = 44 + Math.sin(t * 0.8 + i * 1.7) * 12;
          const hgt = height * 0.46;
          const ag = ctx.createLinearGradient(0, 0, 0, hgt);
          ag.addColorStop(0, aStops[0]);
          ag.addColorStop(0.45, aStops[1]);
          ag.addColorStop(1, aStops[2]);
          ctx.fillStyle = ag;
          ctx.beginPath();
          ctx.moveTo(bx - halfW, -10);
          for (let yy = 0; yy <= hgt; yy += 14) {
            const wob = Math.sin(yy * 0.028 + t * 1.3 + i * 2) * (8 + yy * 0.05);
            ctx.lineTo(bx - halfW + wob, yy);
          }
          for (let yy = hgt; yy >= 0; yy -= 14) {
            const wob = Math.sin(yy * 0.028 + t * 1.3 + i * 2 + 1.2) * (8 + yy * 0.05);
            ctx.lineTo(bx + halfW + wob, yy);
          }
          ctx.lineTo(bx + halfW, -10);
          ctx.closePath();
          ctx.fill();
        }
        // 星座连线彩蛋：极光期间从上半天区随机挑 6 颗亮星连成折线, 标注虚构星座名（每次开窗重新生成）
        if (!constellation) {
          const pool = stars.filter((s) => s.y < height * 0.45 && s.r > 0.8);
          if (pool.length >= 6) {
            const copy = [...pool];
            const picks: Star[] = [];
            for (let k = 0; k < 6; k++) picks.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
            picks.sort((a, b) => a.x - b.x);
            constellation = {
              pts: picks.map((s) => ({ x: s.x, y: s.y })),
              name: CONSTELLATIONS[Math.floor(Math.random() * CONSTELLATIONS.length)],
            };
          }
        }
        if (constellation) {
          ctx.strokeStyle = tokenHsl("--foreground", 0.22);
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          constellation.pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.stroke();
          ctx.fillStyle = tokenHsl("--primary", 0.55);
          constellation.pts.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
            ctx.fill();
          });
          const cp0 = constellation.pts[0];
          ctx.fillStyle = tokenHsl("--foreground", 0.4);
          ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.textAlign = "left";
          ctx.fillText(constellation.name, cp0.x + 5, cp0.y - 5);
        }
      } else if (constellation) {
        constellation = null;
      }

      // 流星：常态每 2.5–7s 随机一颗; 流星雨窗口内 0.2–0.6s 一颗且更慢更长寿（可点击记录, 14% 金色稀有流星更慢更亮）
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      const showerNow = showerRef.current;
      if (t >= nextMeteorAt) {
        // 极光窗口内流星加密（伴生流星雨, 纯视觉氛围——点击记功勋仅流星雨窗口有效）; 红色罕见极光期间金色流星占比更高
        const auroraNow = auroraRef.current;
        // 流星密度按档位：balanced 减半 / saver 三分之一（间隔除以 meteorMult）
        const meteorGap = (showerNow ? 0.22 + Math.random() * 0.4 : auroraNow ? 0.9 + Math.random() * 1.5 : 2.5 + Math.random() * 4.5) / Math.max(0.05, perf.meteorMult);
        nextMeteorAt = t + meteorGap;
        const gold = showerNow ? Math.random() < 0.14 : auroraNow && auroraRareRef.current && Math.random() < 0.3;
        const speed = (showerNow ? 260 + Math.random() * 160 : 460 + Math.random() * 300) * (gold ? 0.72 : 1);
        const dir = Math.random() < 0.5 ? -1 : 1;
        meteors.push({
          x: dir > 0 ? width * (0.15 + Math.random() * 0.6) : width * (0.35 + Math.random() * 0.6),
          y: -8,
          vx: dir * speed * 0.72,
          vy: speed * 0.52,
          life: 0,
          maxLife: (showerNow ? 2.4 : 1.6) + Math.random() * 0.6 + (gold ? 0.8 : 0),
          gold,
        });
      }
      ctx.lineCap = "round";
      for (let i = meteors.length - 1; i >= 0; i--) {
        const mt = meteors[i];
        mt.life += dt;
        mt.x += mt.vx * dt;
        mt.y += mt.vy * dt;
        if (mt.life > mt.maxLife || mt.x < -60 || mt.x > width + 60 || mt.y > height + 60) {
          meteors.splice(i, 1);
          continue;
        }
        const tailX = mt.x - mt.vx * 0.14;
        const tailY = mt.y - mt.vy * 0.14;
        const grad = ctx.createLinearGradient(mt.x, mt.y, tailX, tailY);
        grad.addColorStop(0, mt.gold ? goldHead : meteorHead);
        grad.addColorStop(1, mt.gold ? goldTail : meteorTail);
        ctx.globalAlpha = Math.max(0, Math.min(1, (1 - mt.life / mt.maxLife) * 1.4));
        ctx.lineWidth = mt.gold ? 2.6 : 1.6;
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(mt.x, mt.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        // 金色流星头部：轨迹预告虚线（沿速度方向前伸, 提示落点好预判）+ 呼吸光晕 + 亮核（醒目易点）
        if (mt.gold) {
          const gp = 0.6 + 0.4 * Math.sin(t * 7 + mt.x);
          const vLen = Math.hypot(mt.vx, mt.vy) || 1;
          const aheadX = mt.x + (mt.vx / vLen) * 110;
          const aheadY = mt.y + (mt.vy / vLen) * 110;
          ctx.save();
          ctx.setLineDash([5, 7]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = goldGlow;
          ctx.beginPath();
          ctx.moveTo(mt.x, mt.y);
          ctx.lineTo(aheadX, aheadY);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = goldGlow;
          ctx.beginPath();
          ctx.arc(mt.x, mt.y, 7 + gp * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = goldHead;
          ctx.beginPath();
          ctx.arc(mt.x, mt.y, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // 流星雨点击命中：爆散闪光圆环 0.45s 淡出（金色流星画金色双环）
      for (let i = burstRef.current.length - 1; i >= 0; i--) {
        const b = burstRef.current[i];
        const age = (performance.now() - b.at) / 450;
        if (age >= 1) {
          burstRef.current.splice(i, 1);
          continue;
        }
        const a = Math.round((1 - age) * 16) / 16;
        if (b.gold) {
          ctx.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, a * 0.95);
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 6 + age * 30, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, a * 0.5);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3 + age * 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = tokenShiftHsl("--primary", { hue: -168, sat: 0.85, light: 1.05 }, a);
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3 * (1 - age), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = tokenHsl("--primary", a * 0.9);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 6 + age * 24, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = tokenHsl("--foreground", a * 0.8);
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2.4 * (1 - age), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 许愿浮字：愿望文字从许愿点上浮淡出（2.4s, 金色, 随回应流星同帧出现）
      for (let i = wishTexts.length - 1; i >= 0; i--) {
        const w = wishTexts[i];
        const age = (performance.now() - w.at) / 2400;
        if (age >= 1) {
          wishTexts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, 1 - age * age);
        ctx.fillStyle = goldHead;
        ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillText(w.text, w.x, w.y - 12 - age * 34);
        ctx.globalAlpha = 1;
      }

      // 地球: 随 mix 缩小并移向左上角, 最终成为一粟蓝点
      const ex = width * (0.74 - 0.62 * mix);
      const ey = height * (0.66 - 0.44 * mix);
      const er = minDim * (0.22 * (1 - mix) + 0.028 * mix);
      if (er > 0.5) {
        const eg = ctx.createRadialGradient(ex - er * 0.35, ey - er * 0.4, er * 0.1, ex, ey, er);
        eg.addColorStop(0, planetRim);
        eg.addColorStop(0.55, planetCore);
        eg.addColorStop(1, planetDark);
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, Math.PI * 2);
        ctx.fill();

        // 轨道线 + 轨道器（随离场淡出）
        if (mix < 0.96) {
          const orbits: OrbitDef[] = [
            { rx: er * 1.7, ry: er * 0.5, rot: -0.35, speed: 0.22 },
            { rx: er * 2.45, ry: er * 0.74, rot: -0.18, speed: 0.12 },
          ];
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1 - mix;
          for (const o of orbits) {
            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(o.rot);
            ctx.strokeStyle = orbitColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, Math.PI * 2);
            ctx.stroke();
            const a = t * o.speed + o.rot * 2;
            ctx.fillStyle = satColor;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * o.rx, Math.sin(a) * o.ry, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
      }

      // 目标星球（月球/火星）: 从右侧滑入并放大, 带环形山/地貌
      if (mix > 0.02) {
        const mx = width * (1.35 - 0.73 * mix);
        const my = height * (0.52 + 0.06 * mix);
        const mr = minDim * (0.03 + 0.33 * mix);
        ctx.globalAlpha = Math.min(1, mix * 1.4);
        const mg = ctx.createRadialGradient(mx - mr * 0.4, my - mr * 0.42, mr * 0.08, mx, my, mr);
        mg.addColorStop(0, targetLight);
        mg.addColorStop(0.6, targetMid);
        mg.addColorStop(1, targetDark);
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.fill();

        // 环形山 / 火星地貌：整体随时间缓慢自转 + 一道大气光泽周期扫过表面
        ctx.save();
        ctx.beginPath();
        ctx.arc(mx, my, mr, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(mx, my);
        ctx.rotate(t * 0.035);
        ctx.fillStyle = targetCrater;
        for (const c of CRATERS) {
          ctx.beginPath();
          ctx.arc(c.dx * mr, c.dy * mr, Math.max(1, c.rr * mr), 0, Math.PI * 2);
          ctx.fill();
        }
        // 光泽带（抵消自转, 保持水平横扫）
        ctx.rotate(-t * 0.035);
        const shineX = (((t * 0.05) % 1.5) - 0.25) * 2 * mr;
        const shine = ctx.createLinearGradient(shineX - mr * 0.32, 0, shineX + mr * 0.32, 0);
        shine.addColorStop(0, shineEdge);
        shine.addColorStop(0.5, shineMid);
        shine.addColorStop(1, shineEdge);
        ctx.fillStyle = shine;
        ctx.fillRect(-mr, -mr, mr * 2, mr * 2);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${showerActive || auroraActive ? "cursor-crosshair" : ""}`}
      aria-hidden="true"
    />
  );
}
