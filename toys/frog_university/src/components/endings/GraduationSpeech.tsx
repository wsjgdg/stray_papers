/**
 * 毕业典礼 · 第一项议程：七蛙上台 + 结业致辞
 * 台上一排蛙保持各自默认表情——奶白在笑，灰灰还是没醒的样子，仪式只够把蛙聚齐，改不了蛙。
 * 致辞用制度语言说深情的话：不煽情、不卖萌，句子里全是这四条线里发生过的具体的事。
 */
import { ScrollText } from "lucide-react";
import { FROG_CAST } from "@/data/characters";
import { FROG_BY_CHARACTER } from "@/components/frog/Frog";
import { RichText } from "@/components/common/RichText";

/** 结业致辞全文（奶蛙大学教务处 · 代读） */
const SPEECH_PARAGRAPHS: string[] = [
  "各位毕业生：按照流程，我念完这份稿子，你们就算从这里毕业了。稿子不长，两分钟——比你们在这里熬过的任何一个凌晨都短。",
  "入学那天，你们每只蛙填过一张《大学四年规划表》。现在可以结项了：填上的格子，没有一栏完全兑现；空着的格子，反而都用上了。教务处对此早有预判，所以表格背面印着「最终解释权」。这一条今天生效——解释权归你们。",
  "你们在这所学校沉默过很多次。每一次都记入档案：第几幕、第几个选项、加几分，一页不缺。档案是这所学校唯一做完整的东西，请原谅它只有这一项做完整。",
  "你们也说过一些档案不收的话。食堂窗口的半勺，草坪上没说完的下半句，自习楼凌晨替别人守着的那个问题。真话罐不归教务处验收——学校管不了它，所以它归你们。请带走，别落在礼堂。",
  "你们中的多数，下学期会坐进别的礼堂，听别的致辞，学着把坏消息翻译成「温馨提示」，把不敢翻译成「再背一遍」。这不需要劝阻，劝阻也没有用。学校只提醒一句：哪天你发现自己念这种稿子毫不费力了，请记得——你今天坐在台下，听得心里一紧。",
];

/** 收束句单独放大：全篇最重要的一行 */
const SPEECH_KEYLINE =
  "你们的沉默，学校都记在档案里。你们的真话，档案不收——所以带走了。";

/** 二周目起追加的一段：档案对「重复」的处理（锚定学期本身，不依赖「第二次走到哪个结局」） */
const SPEECH_REPLAY_PARAGRAPH =
  "这份名单上有几个名字是第二次出现的。档案把你们记了两遍：第一遍记沉默，第二遍记沉默的复读。学校管重复叫「稳定」，管稳定叫「培养成功」。你们说过的真话，档案两遍都没收——它不收重复，这一条倒是一直很稳定。";

/** 三周目起再追加的一段：免检第三学期——比复读段更短、更干燥，连复读这道手续也免了 */
const SPEECH_THIRD_PARAGRAPH =
  "第三学期，连复读这道手续也省了。名单并进模板，沉默按惯例视为已读，真话罐免验封条。你们今天听的这一版致辞也进了模板——明年这一届听到的，就是这一份。";

const SPEECH_CLOSING = "本次结业典礼到此结束。已老实，但不彻底。";

interface GraduationSpeechProps {
  /** 当前第几个学期（二周目起追加档案复读段） */
  playthrough?: number;
}

export function GraduationSpeech({ playthrough = 1 }: GraduationSpeechProps) {
  const paragraphs =
    playthrough >= 3
      ? [...SPEECH_PARAGRAPHS.slice(0, 2), SPEECH_REPLAY_PARAGRAPH, SPEECH_THIRD_PARAGRAPH, ...SPEECH_PARAGRAPHS.slice(2)]
      : playthrough >= 2
        ? [...SPEECH_PARAGRAPHS.slice(0, 2), SPEECH_REPLAY_PARAGRAPH, ...SPEECH_PARAGRAPHS.slice(2)]
        : SPEECH_PARAGRAPHS;
  return (
    <section aria-label="上台与结业致辞" className="flex flex-col gap-5">
      {/* 礼堂台面：七蛙按出场顺序站成一排 */}
      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-primary/10 via-card to-card p-5 shadow-lg sm:p-6">
        <p className="text-center text-xs font-bold tracking-widest text-muted-foreground">
          奶蛙大学礼堂 · 台上
        </p>
        <div className="mt-5 flex flex-wrap items-end justify-center gap-x-5 gap-y-4">
          {FROG_CAST.map((character, index) => {
            const Sprite = FROG_BY_CHARACTER[character.id];
            return (
              <div key={character.id} className="flex flex-col items-center gap-1.5">
                {Sprite && <Sprite size={index === 0 ? 58 : 50} />}
                <span className="text-xs font-bold text-card-foreground">
                  {character.displayName}
                </span>
                <span className="text-xs text-muted-foreground">{character.role}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 h-1.5 rounded-full bg-primary/20" aria-hidden />
      </div>

      {/* 结业致辞 */}
      <article className="rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-primary">
            <ScrollText size={14} aria-hidden />
            结业致辞
          </p>
          <p className="text-xs text-muted-foreground">奶蛙大学教务处 · 代读</p>
        </header>

        <div className="mt-5 flex flex-col gap-4">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="text-left text-sm leading-loose text-card-foreground sm:text-base">
              {paragraph}
            </p>
          ))}
          <blockquote className="rounded-2xl border-l-4 border-primary bg-primary/5 px-5 py-4 text-left">
            {/* 全篇最重要的一行（批次 CY-79）：升到最重字黑、收紧字距 */}
            <RichText className="text-xl font-black tracking-tight leading-snug text-card-foreground sm:text-2xl" text={SPEECH_KEYLINE} />
          </blockquote>
          <RichText className="text-left text-sm leading-loose text-muted-foreground sm:text-base" text={SPEECH_CLOSING} />
        </div>

        <p className="mt-6 text-right text-xs font-bold text-muted-foreground">
          —— 奶蛙大学 教务处
        </p>
      </article>
    </section>
  );
}
