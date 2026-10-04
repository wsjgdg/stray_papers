/**
 * 奶蛙大学 · 私档（批次 BV）
 * 五份「别人的档案」：不是好感度解锁的个人资料，是角色自己写的、或者别人写的、关于这只蛙的东西。
 * 获取方式不是刷好感，是在特定场景里找到——对应五份深夜事件（条件：本线走到第二幕，你们有过第一次具体的接触）。
 * 关键规则：你看了，角色就会知道。不是数值下降——是下一次见面，它不看你，说：「你翻我东西了。」
 * 这条线从此换了一种关系：你们之间多了一件不能提的事。调阅痕只进不退，读档不回退（restoreSlot 合并口径）。
 */
import type { FrogCharacterId } from "@/data/characters";
import type { StorylineId } from "@/data/storylines";

export interface PrivateDossier {
  id: string;
  frogId: FrogCharacterId;
  /** 文书名（调阅弹层标题） */
  docTitle: string;
  /** 发现地点（与深夜事件小注同款） */
  place: string;
  /** 调阅痕：被调阅的蛙第一次开口前的那一行——它不看你，先认账 */
  traceLine: string;
  /** 文书正文：档案腔逐段；段内 "\n" 分行，弹层逐行渲染 */
  pages: string[];
  /** 合上前的登记行 */
  coda: string;
  /** 对应的「知道版」异常卷宗 id（HIDDEN_ENDINGS 里，调阅后才解锁的那档） */
  endingId: string;
  /** 发现它的深夜事件 id */
  eventId: string;
}

export const PRIVATE_DOSSIERS: PrivateDossier[] = [
  {
    id: "pillow",
    frogId: "huiHui",
    docTitle: "本科生转学申请表",
    place: "宿舍 423 · 22:40",
    traceLine: "他没看你。「你翻我东西了。」（琴上还压着半个音，他接着弹。）",
    pages: [
      "转出学校：本校（已填）。\n转入学校：空白。\n申请日期：上学期十月十四日。\n家长签字：空白。",
      "申请理由一栏划掉了三行。最上面一行还能认出半句：\n「这里没有任何东西是——」\n后面涂掉了。涂得很用力，纸背起了毛。",
      "背面有铅笔字，两行：\n「问过了。转过去要重读一年。没人替我做这个决定。」\n下面另起一行，字更小：\n「再躺一个学期就交。」\n日期栏写的是这学期开学第一天。",
    ],
    coda: "表放回枕头底下了。压痕还在——这种压痕一学期一道，档案里没有科目。",
    endingId: "secret-transfer",
    eventId: "night-dossier-huihui",
  },
  {
    id: "screen",
    frogId: "geGe",
    docTitle: "聊天记录 · 锁屏留存",
    place: "学工办 · 21:50",
    traceLine: "她没看你。「档案的事，不用你替我记。」（说完把那页翻回去，编号朝外。）",
    pages: [
      "备注名：上一届的你。\n第一条（上学期十一月）：还在统计吗？\n第二条（当天）：在。\n第三条：这学期报了几个？\n第四条：三个。",
      "第五条（上学期十二月，对方）：我那届是五个。别把名字打进去，打了就收不回来。\n第六条（上学期十二月，她）：打了。\n时间戳在，撤回记录在，撤回之前的版本也在——撤回功能撤不掉锁屏。",
      "第七条（今天早晨，对方）：你把我也报上去了吗？\n发送状态：撤回过一次，锁屏还留着。\n输入框里存着一封草稿，只有两个字：\n「没有。」\n草稿日期是今天。删过一次，又恢复了。",
    ],
    coda: "手机照原样扣回玻璃桌面上了。屏幕朝下，光从玻璃底下漏出来——它还亮着。",
    endingId: "secret-restored",
    eventId: "night-dossier-gege",
  },
  {
    id: "form",
    frogId: "zaiZai",
    docTitle: "报名表 · 未交",
    place: "自习楼四楼 · 04:35",
    traceLine: "他没抬头。「柜门我锁了。是你没等它锁上。」",
    pages: [
      "表头：报名表。\n姓名：再再（已填，字很稳）。\n报名项目：照往年的抄——栏里写的是三年前的那个名字。\n日期：上学期五月。",
      "右上角有一行红笔字，两个字：\n「退出」。\n字是他自己的笔迹。红笔是新的，笔帽没拧紧。",
      "退出栏：签名空白。\n要退出，得先在报名表上签字。签名栏空了三年。\n同一张表一共四张，摞在一起，都写着退出，都没交。\n最早的日期是三年前的秋天。",
    ],
    coda: "表照原样压回褪黑素下面，柜门这次锁上了。锁扣的声音在四楼走了一格。",
    endingId: "secret-unsubmitted",
    eventId: "night-dossier-zaizai",
  },
  {
    id: "photo",
    frogId: "ganFanShu",
    docTitle: "食堂交接仪式 · 合影",
    place: "食堂后厨 · 20:50",
    traceLine: "他把勺子放下。「柜子里的东西，不归窗口管。」",
    pages: [
      "照片：《食堂交接仪式 · 合影》。\n后排右三是他，比现在瘦，围裙是白的。\n身后那块牌子上还没有「已老实」三个字，写的是：\n「三味食堂 · 按人头打饭」。",
      "他手里没有剪刀。剪刀在中间那只蛙手里——\n那只蛙后来调走了，档案里查不到去处。\n照片黄了，边角卷着，卷法是被压了三十年的那种。",
      "背面有一行钢笔字：\n「规矩是我定的：份量按人头，不按交情。哪天我自己破了这个例，就把牌子摘了。」\n下面另起一行，铅笔，字很轻：\n「牌子一直没摘。」",
    ],
    coda: "照片夹回书里，围裙照原样盖上了。压出来的印子，比照片上那道深。",
    endingId: "secret-backside",
    eventId: "night-dossier-ganfanshu",
  },
  {
    id: "note",
    frogId: "mianMian",
    docTitle: "病假条 · 未盖章",
    place: "医务室 · 23:30",
    traceLine: "她没看你。「没章的条子，不算数。」（说完把条子收了回去。白大褂的口袋朝外翻着。）",
    pages: [
      "一张病假条，和她开出去的那种同款。三栏：事由、有效期、签发人。\n纸被折过又展开过很多次，折痕发白，快断了。",
      "事由栏：填了。\n就四个字：「撑不住了。」\n字是她自己的，写得很小，挤在栏里——登记表上那个「其他」栏，她一张一张描宽过。这一张不用描，它本来就写在这张条子上。",
      "有效期栏：空白。\n签发人栏：空白——章就在她手边，这一张一直没盖。\n条子最下面有一行很淡的铅笔字，像写过，又像擦过：\n「批给自己：再撑一天。」",
    ],
    coda: "条子折回原样，放回了白大褂口袋。口袋朝外翻着——像随时准备拿出来，又像在等哪只蛙来盖这个章。",
    endingId: "secret-unstamped",
    eventId: "night-dossier-mianmian",
  },
];

/** 按蛙取私档 */
export function privateDossierOfFrog(frogId: FrogCharacterId): PrivateDossier | undefined {
  return PRIVATE_DOSSIERS.find((item) => item.frogId === frogId);
}

/** 各私档对应的剧情线：走到第二幕（你们有过第一次具体的接触）之后，深夜才可能发现 */
export const DOSSIER_LINE_OF: Partial<Record<string, StorylineId>> = {
  "night-dossier-huihui": "lawn",
  "night-dossier-gege": "administration",
  "night-dossier-zaizai": "self-study",
  "night-dossier-ganfanshu": "canteen",
  "night-dossier-mianmian": "sick-note",
};

/** 私档所属线的主蛙：该线「不知道」档的关闭判定用（与 DOSSIER_LINE_OF 互为倒表） */
export const TRACE_FROG_OF_LINE: Partial<Record<StorylineId, FrogCharacterId>> = {
  lawn: "huiHui",
  administration: "geGe",
  "self-study": "zaiZai",
  canteen: "ganFanShu",
  "sick-note": "mianMian",
};
