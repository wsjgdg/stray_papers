// 值班呼号应答：北京发来一句呼号/口令, 从四个选项里挑出正确应答——测值班守则功底, 答对赚功勋。
// 题库前端静态（任务通联主题 16 题）, spawn 时 useHome 抽题并打乱选项。主视口顶部居中弹入, primary 描边。
import { useState } from "react";
import { Radio } from "lucide-react";

/** 题库原始条目（正确答案 + 三个干扰项, 展示时打乱; 共 16 题） */
export const QUIZ_BANK: { q: string; correct: string; wrong: string[] }[] = [
  {
    q: "收到「北京收到, 请报告器状态」时, 规范复电的开头是？",
    correct: "「北京, 这里是巡视器, 报告如下」",
    wrong: ["「收到收到, 完毕」", "「你哪位？先自报呼号」", "「信号不好, 你说啥？」"],
  },
  {
    q: "点火倒计时前的口令复诵确认, 不包括以下哪一项？",
    correct: "操作员今天的心情",
    wrong: ["推进剂贮箱压力", "塔架安全净空", "遥测链路状态"],
  },
  {
    q: "再入黑障期间, 航天器的遥测信号会怎样？",
    correct: "被等离子体鞘套遮蔽, 暂时收不到",
    wrong: ["自动切换备用频率持续下传", "被电离层反射增强一倍", "转入加密模式仅地面可解"],
  },
  {
    q: "地面通话里收到「copy」, 意思是？",
    correct: "对方已清晰收到并理解内容",
    wrong: ["对方要求你重发一遍", "对方不同意你的请求", "对方申请结束本次通话"],
  },
  {
    q: "中继星在任务链路里的主要职责是？",
    correct: "在地面站与航天器之间转发数据",
    wrong: ["对行星表面做高分辨率成像", "运送乘组往返地月空间", "监测深空空间天气预报"],
  },
  {
    q: "critical 级警报在值守面板上通常如何标识？",
    correct: "红色标识 + 连续音响提醒",
    wrong: ["绿色常亮表示安全", "蓝色闪烁表示待查", "不做标识只记日志"],
  },
  {
    q: "样品封装入舱后, 清单编号必须与什么严格一致？",
    correct: "样品罐实物一一对应",
    wrong: ["运载火箭的出厂编号", "乘组人员的工号顺序", "地面站设备的序列号"],
  },
  {
    q: "任务时间线里的「T-」在倒数什么？",
    correct: "距计划点火时刻的剩余时间",
    wrong: ["着陆完成后已过的时间", "整个任务计划的总时长", "地火通信的单程时延"],
  },
  {
    q: "确认着陆成功后, 值守席第一时间要上报的是？",
    correct: "着陆点坐标与各系统状态",
    wrong: ["乘组今天的食谱安排", "对外发布的宣传文案", "下一班的值勤表"],
  },
  {
    q: "再入返回时通信黑障的主要成因是？",
    correct: "高速压缩气体电离形成等离子体鞘套",
    wrong: ["天线被指令收进舱内", "地面站例行停机检修", "发射机备份电力不足"],
  },
  {
    q: "通话里发出「Mayday」呼号意味着？",
    correct: "器身遇险, 请求立即救援",
    wrong: ["例行通信链路检查", "任务成功的祝贺用语", "新频段设备的测试"],
  },
  {
    q: "深空大口径天线接收的信号有多微弱？",
    correct: "抵达地面时已衰减到接近噪声电平",
    wrong: ["强到能直接点亮灯泡", "和手机通话信号一样强", "弱到任何设备都无法处理"],
  },
  {
    q: "航天器跨中继星切换时通常要完成什么动作？",
    correct: "天线重新指向并确认链路切换",
    wrong: ["把全部单机重启一遍", "抛掉压载物减轻重量", "临时关闭遥测发射机"],
  },
  {
    q: "遥测下行通常优先传输哪类数据？",
    correct: "姿态、电源、温控等状态参数",
    wrong: ["乘组的生活纪录影像", "科普直播的高清画面", "存档的旧任务照片"],
  },
  {
    q: "「太阳翼展开」指令完成后的最直接效果是？",
    correct: "航天器获得主电力来源",
    wrong: ["舱内温度立即升高", "着陆影像开始录制", "对地天线增益翻倍"],
  },
];

/** spawn 时抽题并打乱选项后的成品题 */
export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
}

/** 从题库随机抽一题并打乱选项顺序（useHome spawn 时调用） */
export function rollQuiz(): QuizQuestion {
  const base = QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)];
  const options = [...base.wrong];
  const answer = Math.floor(Math.random() * (base.wrong.length + 1));
  options.splice(answer, 0, base.correct);
  return { q: base.q, options, answer };
}

interface QuizCardProps {
  question: QuizQuestion;
  /** 剩余应答秒数（超时由 useHome 收卡） */
  remainS: number;
  /** 作答回调（对错都立即上报, 收卡由 useHome 稍延迟执行以便看反馈色） */
  onAnswer: (ok: boolean) => void;
}

const OPT_TAG = ["A", "B", "C", "D"];

export function QuizCard({ question, remainS, onAnswer }: QuizCardProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    onAnswer(i === question.answer);
  };
  return (
    <div className="pointer-events-auto absolute left-1/2 top-12 z-40 w-80 max-w-[92%] -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="overflow-hidden rounded-lg border-2 border-primary/60 bg-card/95 shadow-xl backdrop-blur" role="dialog" aria-label="北京呼号抽问">
        <div className="flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-1.5">
          <Radio className="h-4 w-4 shrink-0 animate-pulse text-primary" aria-hidden="true" />
          <p className="font-display text-xs font-bold text-primary">北京呼号 · 值班抽问</p>
          <span className="ml-auto rounded-sm border border-primary/50 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
            T-{remainS}s
          </span>
        </div>
        <div className="px-3 py-2.5">
          <p className="text-xs font-medium leading-relaxed text-card-foreground">{question.q}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {question.options.map((opt, i) => {
              const isAnswer = i === question.answer;
              const isPicked = picked === i;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => choose(i)}
                  disabled={picked !== null}
                  aria-label={`选项 ${OPT_TAG[i]} ${opt}`}
                  className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-all duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-focus ${
                    picked === null
                      ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 active:scale-[0.98]"
                      : isAnswer
                        ? "border-primary bg-primary text-primary-foreground"
                        : isPicked
                          ? "border-destructive bg-destructive/15 text-destructive"
                          : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span className="mr-1.5 font-mono font-bold">{OPT_TAG[i]}</span>
                  {opt}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-center font-mono text-[9px] tracking-widest text-muted-foreground">
            {picked === null ? "QUIZ · 单选即交卷" : question.options[picked] === question.options[question.answer] ? "回答正确 ✓" : "答错了 ✗"}
          </p>
        </div>
      </div>
    </div>
  );
}
