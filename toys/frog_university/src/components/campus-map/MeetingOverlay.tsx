/**
 * 校园地图 · 会议（批次 BG「会议」之一：列席 / 执笔）
 * 列席：可以听，不能说。座次表上写着「列席：一」，没有名字——椅子给你坐了，纸上没有。
 * 一致：「一致通过」的时候有一只手举到一半。没人记它——不是被改掉了，是没被记下来。
 *   改了会留痕；没记不留。
 * 执笔：轮到你当记录员。那只蛙再次反对，这次看着你说。你选：记，或不记。
 *   记了会被退回重写（「与会议实际情况不符」）；不记，它就没发生过。
 *   定稿都一样——区别不在纸上，在你这里。
 */
import { useState } from "react";
import { PenLine, Users } from "lucide-react";
import type { MeetingRoster } from "@/lib/gameSave";

interface MeetingOverlayProps {
  /** 列席 / 执笔 */
  role: "list" | "recorder";
  /** 会议名册：议题、主持人、与会成员（种子派生） */
  roster: MeetingRoster;
  /** 会议上的那只蛙：举到一半的手是它的（好感最高的非主角） */
  objectorName: string;
  /** 档案行的天数 */
  day: number;
  /** 列席过了（落档口径：开没开口） */
  onAckList: (spoke: boolean) => void;
  /** 执笔完了（落档口径：那句反对记了还是没记） */
  onAckRecord: (objection: "kept" | "dropped") => void;
}

/** 一只成员的名字（名册取不到时给一只在座的） */
function memberAt(members: string[], index: number): string {
  return members[index] ?? "在座的一只";
}

/** 列席：可以听，不能说——椅子给你坐了，纸上没有 */
function ListMeeting({
  roster,
  objectorName,
  day,
  onAckList,
}: Omit<MeetingOverlayProps, "role" | "onAckRecord">) {
  const [step, setStep] = useState(0);
  const [spoke, setSpoke] = useState(false);

  const roomLines = [
    `会议室的门上贴着议程：${roster.topic}。与会人员按座次表就座——${roster.host}主持，${roster.members.join("、")}在座。`,
    `${roster.host}：「这个事大家都清楚了吧。按流程过一遍——有没有补充的？」`,
    `${memberAt(roster.members, 0)}：「流程上没问题。」`,
    `${memberAt(roster.members, 1)}：「那就按这个来。」`,
    `${roster.host}：「好。一致通过。」`,
    `「一致」两个字出来的时候，${objectorName}的手举到一半。没有人看它。记录员的笔在纸上，从头到尾没有抬起来过。`,
    `你进门时看过一张座次表。与会人员各有名字，最后一行写着：列席：一。没有名字。椅子给你坐了，纸上没有。`,
  ];
  const inRoom = step >= 1 && step <= roomLines.length;

  return (
    <div className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10" role="dialog" aria-label="列席">
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <Users size={13} aria-hidden />
            行政楼 · 二层会议室
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "会议通知" : "列席"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                议题：{roster.topic}。主持人：{roster.host}。与会成员：{roster.members.join("、")}。回避：无。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                通知的最后一行写着：列席——你。列席不是出席。可以听，不能说。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                没有谁解释为什么叫你列席。有时候流程需要一双眼睛——证明这间会议室开过。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  进会议室
                </button>
              </div>
            </>
          )}

          {inRoom && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">{roomLines[step - 1]}</p>
              {step < roomLines.length ? (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    继续
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSpoke(true);
                      setStep(roomLines.length + 1);
                    }}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    你想说点什么
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(roomLines.length + 2)}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    散会
                  </button>
                </div>
              )}
            </>
          )}

          {/* 开了口（说了也没被记录） */}
          {step === roomLines.length + 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你说了。声音不大，但这间会议室的每一只蛙都听见了。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">记录员没有抬笔。</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                散会后纪要被收走。上面没有你的话。不是被改掉了，是没被记下来——改了会留痕，没记不留。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                出门的时候，{objectorName}在走廊里等你。它说：「下次开会我还举。举到有蛙记下来为止。」
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙列席。列席人员不记录发言。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAckList(spoke)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}

          {/* 没开口（散会） */}
          {step === roomLines.length + 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                散会。蛙们按座次表的顺序出门，没有谁看你。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                出门的时候，{objectorName}在走廊里等你。它说：「下次开会我还举。举到有蛙记下来为止。」
              </p>
              <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙列席。列席人员不记录发言。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAckList(spoke)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 执笔：轮到你写纪要——那只蛙再次反对，这次看着你说 */
function RecorderMeeting({
  roster,
  objectorName,
  day,
  onAckRecord,
}: Omit<MeetingOverlayProps, "role" | "onAckList">) {
  const [step, setStep] = useState(0);
  const [decision, setDecision] = useState<"kept" | "dropped" | null>(null);

  const roomLines = [
    `会议室的门上贴着议程：${roster.topic}。你的位置在最前面——记录员座，面对全体。`,
    `${roster.host}：「还是那个事。这次要定稿。」`,
    `${memberAt(roster.members, 0)}：「流程上没有障碍。」`,
    `${objectorName}：「我反对。这一条把所有的蛙都装进去了——不区分是谁。」`,
    `${roster.host}：「反对……记录在案。」`,
    `说完它看着你。它记得上一次——上一次没人记。这一次，笔在你手里。`,
    `纸上那一行空着。你的笔尖悬在上面。`,
  ];
  const inRoom = step >= 1 && step <= roomLines.length;

  return (
    <div className="fixed inset-0 z-[85] overflow-y-auto bg-foreground/90 px-4 py-10" role="dialog" aria-label="会议记录员">
      <div className="mx-auto flex min-h-full max-w-lg items-start justify-center">
        <div className="anim-fade-up my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground">
            <PenLine size={13} aria-hidden />
            行政楼 · 二层会议室
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-card-foreground">
            {step === 0 ? "会议通知" : "记录员"}
          </h2>

          {step === 0 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                议题：{roster.topic}。主持人：{roster.host}。与会成员：{roster.members.join("、")}、{objectorName}。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                通知上写着：记录——你。上一次列席之后，有蛙发现你记得全：整间会议室的话，你一个字没漏。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                这一场不设列席。你是记录员。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  进会议室
                </button>
              </div>
            </>
          )}

          {inRoom && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">{roomLines[step - 1]}</p>
              {step < roomLines.length ? (
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(step + 1)}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    继续
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("dropped");
                      setStep(roomLines.length + 2);
                    }}
                    className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-bold text-card-foreground shadow-sm transition-shadow duration-200 hover:shadow-md focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    不记
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision("kept");
                      setStep(roomLines.length + 1);
                    }}
                    className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                  >
                    记下来
                  </button>
                </div>
              )}
            </>
          )}

          {/* 记了：被退回重写——你亲手把那行反对划掉 */}
          {step === roomLines.length + 1 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                你记了。那一行是你的字：{objectorName}反对。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                第二天纪要被退回来。页边一行批注：与会议实际情况不符，请按会议实际情况修改。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                「实际情况」的意思是：主持人说的那个版本。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                你改了。那一行没有了。定稿上还是你的名字——记录：你。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                {objectorName}后来看到定稿。它没有提那行字。它说：「字挺好看的。」
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAckRecord("kept")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}

          {/* 没记：那一句等于没有发生过 */}
          {step === roomLines.length + 2 && (
            <>
              <p className="anim-fade-up mt-4 text-sm leading-relaxed text-card-foreground">
                笔尖没有落下去。你写的是主持人的版本——那个版本里没有反对。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">一致通过。散会。</p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                出门的时候{objectorName}在门口等你。它说：「我讲过了。」然后走了，没有回头。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAckRecord("dropped")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}

          {/* 收尾：两种处理都落在同一份定稿上 */}
          {(step === roomLines.length + 3 || (decision && step > roomLines.length + 2)) && (
            <>
              <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-widest text-muted-foreground">
                档案：第 {day} 天，该蛙担任会议记录员。记录规范。
              </p>
              <p className="mt-2 text-sm leading-relaxed text-card-foreground">
                周报里提了一句：会议记录规范。没有谁解释「规范」是什么意思——大概就是：纸面上没有多余的东西。
              </p>
              <p className="mt-3 text-sm leading-relaxed text-card-foreground">
                定稿都是一样的。区别不在纸上——在你这里。
              </p>
              <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                它不缺笔。它缺的是愿意用这支笔的蛙。现在你愿意了。
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => onAckRecord(decision ?? "dropped")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:shadow-focus focus-visible:outline-none"
                >
                  收好
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function MeetingOverlay(props: MeetingOverlayProps) {
  return props.role === "list" ? <ListMeeting {...props} /> : <RecorderMeeting {...props} />;
}
