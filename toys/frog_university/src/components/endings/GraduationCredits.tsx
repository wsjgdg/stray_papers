/**
 * 毕业典礼 · 第三项议程：制作名单完整版（全梗收尾）
 * 把十条线里出现过的梗按工种归位：已老实、最终解释权、上岸、温馨提示、已熄灯、
 * 咱宿舍合格了、孔乙己的长衫、朋友圈精修、蛙生没有意义……收在一句「已老实，但不彻底」。
 */

/** 工种 → 署名。全梗名单，顺序即谢幕顺序 */
const CREDITS: { role: string; name: string }[] = [
  { role: "出品", name: "奶蛙大学（不是湖边那所，是每一所）" },
  { role: "原著", name: "湖（晴天照热闹，雨天照真话）" },
  { role: "导演", name: "开学第一课（它先教会所有蛙一件事：坐好）" },
  { role: "编剧", name: "已老实（笔名。真名在牌子背面，一挂二十年）" },
  { role: "数值策划", name: "教务处（沉默 +1 到 +3，理由公示期内可查，过期不补）" },
  { role: "好感度系统", name: "树洞管理处（只进不出）" },
  { role: "印象分系统", name: "宣传处（合影站中间，横幅上有名字）" },
  { role: "真话罐顾问", name: "一只空罐（它到现在还没满，怪你）" },
  { role: "天气预报", name: "今天仍然没有好消息（记得带伞，或者干脆别去）" },
  { role: "深夜场务", name: "凌晨四点的翻书声（枕头、褪黑素、一张写着自己名字的便利贴）" },
  { role: "照明", name: "绿色应急灯（十一点零五准时上岗，全年无休，绿光里不分蛙色）" },
  { role: "翻译", name: "格格（坏消息 → 温馨提示；译文改了七遍，原文失传）" },
  { role: "上岸辅导", name: "再再（再背一遍就睡。第三年，仍担任同一职务）" },
  { role: "美术", name: "朋友圈精修组（四十七次笑，每一次都在营业）" },
  { role: "道具", name: "半勺 · 规划表 · 最终解释权 · 孔乙己的长衫 · 褪色的横幅 · 宿舍签到表" },
  { role: "片尾曲", name: "《蛙生没有意义》（副歌部分：今天也先躺着吧）" },
  { role: "结局分档", name: "教务处（0-4 起步，13+ 收刀，全篇不和解）" },
  { role: "特别鸣谢", name: "每一位在「没关系哦」之前犹豫过一秒的蛙" },
  { role: "以及", name: "正在读这行字的你（档案不收的部分，你自己带走了）" },
];

export function GraduationCredits() {
  return (
    <section aria-label="制作名单" className="rounded-3xl border border-border bg-card p-6 shadow-lg sm:p-8">
      <header className="text-center">
        <p className="text-xs font-bold tracking-widest text-muted-foreground">制作名单 · 完整版</p>
        <h3 className="mt-2 text-3xl font-black tracking-tight text-foreground">《奶蛙大学》</h3>
      </header>

      <dl className="mx-auto mt-7 flex max-w-xl flex-col gap-3.5">
        {CREDITS.map((credit) => (
          <div key={credit.role} className="grid gap-0.5 text-center sm:grid-cols-[7rem_1fr] sm:gap-3 sm:text-left">
            <dt className="text-xs font-bold tracking-widest text-muted-foreground sm:pt-0.5 sm:text-right">
              {credit.role}
            </dt>
            <dd className="text-sm font-bold leading-relaxed text-card-foreground">{credit.name}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 text-center text-base font-black tracking-tight text-primary">
        —— 已老实，但不彻底 ——
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        名单念完了。礼堂的灯留给下一届，真话你自己带走。
      </p>
    </section>
  );
}
