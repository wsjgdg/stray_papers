/**
 * 毕业典礼 · 第二项议程：毕业证与成绩单
 * 证书质感：bg-card 双层边框（外实内虚）+ 圆形验讫章，三主题全 token 适配。
 * 成绩单全部由现有存档聚合：沉默学学位按本学期沉默值四档命名；
 * 印象分复用公示栏五档评语；离真心最近的蛙、全员真话徽章、真话罐 n/N、岔路册 n/48、第 N 学期。
 */
import { BadgeCheck, GitBranch, GraduationCap, ScrollText } from "lucide-react";
import { Stamp } from "@/components/system/Stamp";
import type { GraduationDiplomaData } from "@/pages/Endings/useEndings";
import { RichText } from "@/components/common/RichText";

/** 沉默学学位四档：沉默值越高学位越高——学校按它自己的标准授勋 */
const SILENCE_DEGREES: { min: number; label: string; blurb: string }[] = [
  { min: 0, label: "沉默学 · 肄业", blurb: "培养目标未达成：在校期间真话超额，沉默不达标。" },
  { min: 15, label: "沉默学 · 学士", blurb: "已掌握在正确场合闭嘴的基本功。毕业后请保持。" },
  { min: 35, label: "沉默学 · 优等学士", blurb: "能在被点名之前就安静下来。本项技能市场估价高于绩点。" },
  { min: 60, label: "沉默学 · 终身荣誉研究员", blurb: "本学位免答辩。沉默到这个程度，已经没有问题可问了。" },
];

function silenceDegreeOf(value: number): { label: string; blurb: string } {
  let matched = SILENCE_DEGREES[0];
  for (const tier of SILENCE_DEGREES) {
    if (value >= tier.min) matched = tier;
  }
  return matched;
}

/** 真话罐空罐与集齐各有专属句；其余数量给中性句 */
function truthJarLine(data: GraduationDiplomaData): string {
  if (data.truthComplete) return "你把所有真话都说完了。游戏里做不到的事。";
  if (data.truthCollected === 0) {
    return "罐子还空着。一条真话都还没有。四年的话都记在档案里，一句没带在身上。";
  }
  return `罐里有 ${data.truthCollected} 句真话，是你自己带走的——档案不收的部分。`;
}

/** 岔路册完成度：空册、进行中、走完各给一句；口径与图鉴岔路册一致（档案不清零，开新档也留着） */
function branchLine(data: GraduationDiplomaData): string {
  if (data.branchComplete) return "五十四条岔路，你全部走过一遍。这一项按满分记，档案没有异议。";
  if (data.branchWalked === 0) {
    return "一条岔路都还没记进档案。这门课不设补考，但档案也不清零——走过了，就一直记着。";
  }
  const missing = Math.max(0, data.branchTotal - data.branchWalked);
  return `你走过 ${data.branchWalked} 条岔路，档案各记了一笔。剩下 ${missing} 条在原地——换条路，档案再记一笔。`;
}

export function GraduationDiploma({ data }: { data: GraduationDiplomaData }) {
  const degree = silenceDegreeOf(data.silenceValue);

  return (
    <section aria-label="毕业证与成绩单">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
        {/* 验讫章 */}
        <div
          aria-hidden
          className="absolute right-5 top-5 flex h-16 w-16 rotate-6 flex-col items-center justify-center rounded-full border-2 border-primary/50 text-primary sm:h-20 sm:w-20"
        >
          <span className="text-lg font-bold leading-none sm:text-xl">蛙大</span>
          <span className="mt-0.5 text-[10px] font-bold leading-none">验讫</span>
        </div>

        <div className="m-2.5 rounded-2xl border border-dashed border-primary/30 p-5 sm:m-3 sm:p-7">
          {/* 证书抬头 */}
          <header className="text-center">
            <GraduationCap size={26} className="mx-auto text-primary" aria-hidden />
            <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">奶蛙大学</h3>
            <p className="mt-1 text-xs font-bold tracking-widest text-muted-foreground">
              毕业证书 · 附成绩单
            </p>
            <span className="mt-3 inline-block rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
              第 {data.playthrough} 学期
            </span>
          </header>

          {/* 兹证明（批次 AP：提前毕业的学期，证明段换口径——结束也是流程里的一种） */}
          <p className="mt-6 text-sm leading-loose text-card-foreground sm:text-base">
            {data.earlyGraduated ? (
              <>
                兹证明<span className="font-bold text-primary"> {data.displayName ?? "该蛙未登记姓名"} </span>
                同学在本校未完成全部课程（已修 {data.linesCompleted}/{data.linesTotal} 条线）。毕业申请受理之后，
                不需要再等任何一节课——你选了结束，学校照发证：结束也是流程里的一种，而且是最省纸的一种。
              </>
            ) : (
              <>
                兹证明<span className="font-bold text-primary"> {data.displayName ?? "该蛙未登记姓名"} </span>
                同学在本校完成全部剧情线九条，修满四个学期里最难的一门课：在学校里保持是一只蛙。
              </>
            )}
          </p>

          {/* 沉默学学位（批次 CK：成绩单也是档案——数字照写，旁边盖一枚章） */}
          <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center sm:p-5">
            <p className="flex items-center justify-center gap-2 text-xs font-bold tracking-widest text-muted-foreground">
              <Stamp glyph="默" value={data.silenceValue} step={4} size="sm" />
              沉默学学位 · 本学期累计沉默值 {data.silenceValue}
            </p>
            <RichText className="mt-2 text-xl font-black tracking-tight text-primary sm:text-2xl" text={degree.label} />
            <RichText className="mt-2 text-sm leading-relaxed text-muted-foreground" text={degree.blurb} />
          </div>

          {/* 成绩单 */}
          <dl className="mt-5 flex flex-col gap-3 text-left">
            {data.playthrough >= 3 && (
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <dt className="text-xs font-bold tracking-widest text-muted-foreground">学籍状态</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                  免检。本学期起各栏免于逐项核对，按上学期出样直接结转；有异议，异议栏也免填。
                </dd>
              </div>
            )}
            {/* 学籍备注：按被注意值两档（0–7 / 8+），与结局分档无关 */}
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <dt className="text-xs font-bold tracking-widest text-muted-foreground">学籍备注</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                {data.attention >= 8 ? "重点关注名单在列。" : "无异常记录。"}
              </dd>
            </div>
            {/* 提前毕业（批次 AP）：成绩单如实写——你选了结束，学校照发证 */}
            {data.earlyGraduated && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <dt className="text-xs font-bold tracking-widest text-muted-foreground">课程完成度</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                  该蛙未完成全部课程（已修 {data.linesCompleted}/{data.linesTotal} 条线）。补考科目栏空白——
                  不走的路占不了格子，但申请那一栏，你签了字。
                </dd>
              </div>
            )}
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <dt className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted-foreground">
                <ScrollText size={13} aria-hidden />
                <Stamp glyph="良" value={data.impressionPercent} step={24} size="sm" />
                印象分 {data.impressionPercent} · {data.impressionTierLabel}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                公示栏最终评语：「{data.bulletinReview}」
              </dd>
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <dt className="text-xs font-bold tracking-widest text-muted-foreground">
                离真心最近的蛙
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                {data.closestFrog
                  ? `${data.closestFrog.name} · ${data.closestFrog.role} · ${data.closestFrog.tierLabel}（坦诚度 ${data.closestFrog.percent}%）`
                  : "暂无。档案里的你，谁也没能走近——下学期可以从食堂窗口开始。"}
              </dd>
            </div>

            {data.lockedRoute && (
              <div className="rounded-2xl border border-border bg-background/60 p-4">
                <dt className="text-xs font-bold tracking-widest text-muted-foreground">
                  毕业去向 · 路线认定：{data.lockedRoute.name}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                  {data.lockedRoute.note}
                </dd>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <dt className="text-xs font-bold tracking-widest text-muted-foreground">
                真话罐 · {data.truthCollected}/{data.truthTotal} 句
              </dt>
              <dd className="mt-1.5 flex flex-col gap-2 text-sm leading-relaxed text-card-foreground">
                <span>{truthJarLine(data)}</span>
                {(data.truthTaken ?? 0) > 0 && (
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    其中 {data.truthTaken} 句被抽走了。罐子照旧——像它没被写过。
                  </span>
                )}
                {data.allTrueFriends && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                    <BadgeCheck size={13} aria-hidden />
                    全员真话徽章 · 原来我们都在装，谢谢你没有拆穿
                  </span>
                )}
              </dd>
            </div>

            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <dt className="text-xs font-bold tracking-widest text-muted-foreground">
                岔路册 · {data.branchWalked}/{data.branchTotal} 条
              </dt>
              <dd className="mt-1.5 flex flex-col gap-2 text-sm leading-relaxed text-card-foreground">
                <span>{branchLine(data)}</span>
                {data.branchComplete && (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                    <GitBranch size={13} aria-hidden />
                    岔路全走徽章 · 十八处分岔，一处没绕
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {/* 附注 */}
          <p className="mt-5 border-t border-dashed border-border pt-4 text-center text-xs leading-relaxed text-muted-foreground">
            附注：结局图鉴存档 {data.endingsCollected}/{data.endingsTotal} 种。证书只发一次，图鉴记得每一次。
          </p>
        </div>
      </div>
    </section>
  );
}
