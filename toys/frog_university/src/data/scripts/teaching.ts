/**
 * 《开学第一课》教学楼引导线剧本（v2 成熟化改写 + v4 真分支 + v5 二周目回响）
 * 1 幕 7 场：报到交表 → 盖章（分岔点）→ 三条分支段 → 开学第一课（汇流）→ 封箱
 * 批判点：制度如何让格式化显得合理——档案、公示、把反抗收编成作业、家长群里的注视。
 * v4 分岔点：fc-s2（空白表格与橡皮蛙）。三条支路各揭一个侧面：
 *   b1 代填表＝被代填的宏愿 vs 及格线级的真实愿望；b2 只看不语＝沉默的待遇；
 *   b3 替他问出口＝真话的连锁：缓刑、人情与一句只有你听见的真话。
 * 汇流场景 fc-s3 分支无关（三路都成立）；act quote 与结局 id/区间不变。
 * 面具钩子：fc-s3 增补 fc-l35~fc-l36（开学典礼集锦，掌声慢放，摄像在拍）。
 * v5 回响（纯叙事，不改数值）：分岔三选全配 echo（干饭叔更熟练 / 沉默被记同一格 / 他先背下了流程），
 *   非分岔表演选项 fc-c1a（干饭叔拆穿）与 fc-c3b（档案腔记素材）配 echo；
 *   记忆锚点 fc-l24（档案卷宗续在同一卷）——线性主路径、不带 merge、非 heart 节点。
 * CY-113 扩写：1 幕 → 3 幕。fc-a2《散场以后》（fc-s4 移入 + 新场景 fc-s5《床上》，
 *   回收 fc-l37 发「都挺好的」那只蛙与 fc-l54 草稿箱）；fc-a3《第二天早上》（新场景
 *   fc-s6《两张名单》，回收 fc-l21 体测公示与「那咋了」的语调变化，落点 fc-e3 的「我等」）。
 *   新选项 fc-c5 与 fc-c6 系全部无 branch——分岔仍只在 fc-s2，merge 目标 fc-l12 不动；
 *   结局 id/区间（0-4 / 5-12 / 13+）零改动；沉默经济学单周目最大 9→11，仍在 fc-e2 区间内。
 *   fc-c1a 补 coda，fc-c1b/c1c/c3a/c3c 补 coda+echo；b1/b2/b3 与 s1/s2/s3 各加厚；
 *   resonances 1→3（新锚点 fc-l15、fc-l29，均线性主路径、非 merge、非 heart）；
 *   新 CG：cg-four-glows（fc-l61）、cg-two-lists（fc-l66）。
 * CY-119 客串蛙网织密：fc-s3 尾部加 fc-l76/l77——手机蛙（食堂线）与橡皮蛙同教室同框，
 *   「两种字面朝下」，并为 cn-l87 食堂窗口前后排同框埋线。纯叙事、无数值、主路径。
 */
import type { StoryScript } from "@/data/storylines";

export const TEACHING_SCRIPT: StoryScript = {
  endingCg: "cg-same-sheet",
  lineId: "first-class",
  acts: [
    {
      id: "fc-a1",
      index: 1,
      title: "开学第一课",
      quote: "老实，就是不再问为什么的意思。",
      quoteBy: "ganFanShu",
      scenes: [
        {
          id: "fc-s1",
          lines: [
            {
              id: "fc-l1",
              cg: "cg-flyer-half",
              se: "se-flyer-tear",
              bg: "bg-class-gate",
              speakerId: "narration",
              text: "开学第一天，教学楼前挂着横幅：「欢迎新蛙入学——从这里开始，成为更好的蛙。」横幅边角卷了，像挂了很多年。底下的电线杆上，还贴着上一届撕剩的半张海报：「距四六级考试还有 87 天」。",
            },
            { id: "fc-l2", speakerId: "naiBai", text: "", innerVoice: "更好的蛙。那我现在算什么，预备役？" },
            {
              id: "fc-l3",
              speakerId: "narration",
              text: "一只系着围裙的蛙抱着一摞表格走过来，工牌在胸口晃：后勤部，干饭叔。他从最上面抽出一张，递给你。",
            },
            { id: "fc-l4", speakerId: "ganFanShu", text: "表。先填这个。" },
            {
              id: "fc-l5",
              pose: "hold",
              speakerId: "naiBai",
              text: "",
              innerVoice: "开学第一天，第一只跟我说话的蛙，先递给我一张表。他说话的样子有点像 NPC——台词很短，说完就等你在框里输入。",
            },
            {
              id: "fc-l6",
              speakerId: "narration",
              text: "《大学四年规划表（必填）》。交两份：电子版发教学科邮箱，纸质版存档。最下面一行小字：本表将随个人档案保存四年。",
              cg: "cg-plan-sheet",
            },
            {
              id: "fc-l24",
              speakerId: "naiBai",
              text: "",
              innerVoice: "四年之后，这张表会跟我的成绩单、奖惩记录放在一起。待遇跟我本人一样。",
              cg: "cg-plan-sheet",
            },
            {
              id: "fc-l25",
              pose: "lean",
              speakerId: "ganFanShu",
              text: "今晚十点前交。辅导员的原话——「交不上的，明早八点前补交，我等。」",
            },
            {
              id: "fc-l26",
              pose: "hold",
              se: "se-chair-scrape",
              speakerId: "naiBai",
              text: "",
              innerVoice: "他不催。他就把那个「等」放在这儿，像把一把椅子搬到桌边，然后看着你。",
              expression: "soft",
            },
            {
              id: "fc-l37",
              speakerId: "narration",
              text: "队伍在往前挪。前面那只蛙交完表往回走，边走边在手机上打了一段话，打完没发，盯着看了一会儿，删掉最后一句，发了。屏幕上剩下的是：「大学第一天，都挺好的。」后面跟一个句号。",
            },
            {
              id: "fc-l38",
              speakerId: "naiBai",
              text: "",
              innerVoice: "轮到我的时候，我先看了表。「你的目标」那一栏，印出来的框很大。大得不像让你填的，像让你看清楚自己填不满的。",
              expression: "frozen",
            },
            {
              id: "fc-l39",
              speakerId: "narration",
              text: "报到处的人龙从台阶排到香樟树下。喇叭每二十秒重复一遍：「请按序排队。你的大学，从这里开始。」说到第四遍，队伍里有蛙笑了一声，很快收住。它没说从哪里结束——喇叭不管结束的事。",
            },
            {
              id: "fc-l40",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我想拍照回去照着抄，拍出来最清楚的却是那只围裙蛙胸口的工牌：后勤部，0042。一只蛙在同一个号码上站了二十年，号码比名字先被记住。",
              expression: "frozen",
            },
            {
              id: "fc-l55",
              speakerId: "narration",
              text: "报到桌一共三个窗口，只开了中间一个。左右两个上面都贴着「暂停使用」——牌子是新的，四个角还很锋利，像今天早上才贴上去的。",
            },
            {
              id: "fc-l56",
              speakerId: "naiBai",
              text: "",
              innerVoice: "「暂停使用」的意思是它曾经用过。我没见过它用，但牌子比横幅新。这所学校换得最勤的不是设备，是通知。",
            },
          ],
          choices: [
            {
              id: "fc-c1a",
              text: "逐栏填满：绩点、保研、考公，全都要。",
              silenceDelta: 3,
              affinityTarget: "ganFanShu",
              affinityDelta: -2,
              coda: "你把绩点、保研、考公填成一条直线。桌上那份示例表就是这个顺序——你没看过示例，但你填对了。",
              echo: {
                speakerId: "ganFanShu",
                text: "（章先于话落）绩点、保研、考公。上学期你也是这个顺序。系统不嫌重复，我也没资格问。",
                innerVoice:
                  "（上学期他在这儿停过半秒。这学期那半秒被省掉了。省掉的那半秒，大概也算他学会的东西。）",
              },
            },
            {
              id: "fc-c1b",
              text: "在「你的目标」那一栏写：随便过过，反正没人看。",
              silenceDelta: 2,
              coda: "目标栏那句「随便过过」也拿到了合格章。这是全校对真话最宽容的地方——反正下一栏就把它归了档。",
              echo: {
                speakerId: "narration",
                text: "「反正没人看」这句，档案看过。上学期的批注是六个字：态度真实，可备案。这学期它续在同一卷里。",
              },
            },
            {
              id: "fc-c1c",
              text: "问那只围裙蛙：「交表之前，能先带我把校园逛一圈吗？」",
              silenceDelta: 0,
              affinityTarget: "ganFanShu",
              affinityDelta: 2,
              coda: "他没带你逛，但他指了哪栋楼的厕所不用排队、哪条路中午不晒。比逛有用。",
              echo: {
                speakerId: "ganFanShu",
                text: "（表还没递，他先抬了下下巴指路）上学期你也想先逛一圈。那天我指到一半，上课铃响了。",
                innerVoice: "（他记得哪只蛙想先逛。窗口站了二十年，这些事他都记得，只是不记在表上。）",
              },
            },
                      {
              id: "fc-c1-idle",
              text: "（三十秒过去，你一个字都没填。表格在桌上，笔在手里。）",
              silenceDelta: 1,
            },
          ],        },
        {
          id: "fc-s2",
          lines: [
            {
              id: "fc-l7",
              speakerId: "ganFanShu",
              text: "（收表，扫了一眼，落章）嗯。",
            },
            {
              id: "fc-l8",
              speakerId: "narration",
              text: "章上两个字：合格。你看见前一只蛙的表也被盖了同一个章——他写的跟你完全不一样。",
            },
            { id: "fc-l9", speakerId: "naiBai", text: "", innerVoice: "那我认真写和随便写，意义是什么？", cg: "cg-plan-sheet" },
            {
              id: "fc-l10",
              pose: "lean",
              speakerId: "ganFanShu",
              text: "（手没停）表不是让你写的，是让你交的。交表的意思是：你知道谁在等。",
              expression: "frozen",
            },
            {
              id: "fc-l11",
              speakerId: "naiBai",
              text: "",
              innerVoice: "这不是哲学。这是排班表。",
            },
            {
              id: "fc-l27",
              speakerId: "narration",
              text: "你旁边那只新蛙一直没动笔。他的表格空白着，橡皮被他捏出了指甲印。你瞟了一眼——橡皮上密密麻麻全是字：早六、单词、体测及格线，都快写满了。他发现你在看，把橡皮扣住：「看啥，那咋了。」",
            },
            {
              id: "fc-l28",
              speakerId: "naiBai",
              text: "",
              innerVoice: "他说「那咋了」的时候，手指还压在那块橡皮上，压得很实。",
            },
            {
              id: "fc-l41",
              speakerId: "narration",
              text: "干饭叔身后的墙上贴着《上课纪律须知（试行）》，一共十二条。最后一条不是内容，是两个字：「其他」。你没数错，十二条里有一条叫「其他」——它排在十一后面，像一道备用的口子。",
            },
            {
              id: "fc-l42",
              speakerId: "naiBai",
              text: "",
              innerVoice: "橡皮蛙把橡皮放进笔袋最里面那格。拉链拉到一半又拉开，把橡皮翻了个面——字面朝下——再拉上。他自己的东西，收的时候也要先看一眼旁边。",
              expression: "soft",
            },
            {
              id: "fc-l43",
              speakerId: "narration",
              text: "你身后那只蛙交表，干饭叔看了一眼，往回推了推：「目标栏空着。」那只蛙愣了两秒，接回笔，在那一栏里写了两个字：活着。干饭叔看了看，落章。合格。",
            },
            {
              id: "fc-l72",
              speakerId: "naiBai",
              text: "",
              innerVoice: "「活着」两个字，也拿到了「合格」。我这才明白：这个章不审内容，只确认你填了。填什么是你的事，填了是学校的事。",
              expression: "frozen",
            },
          ],
          choices: [
            {
              id: "fc-c2a",
              text: "把旁边那份空白的也勾满——用他的笔。反正答案就那几个。",
              silenceDelta: 3,
              branch: "fc-a1-b1-l1",
              coda: "两张表，一个章。他侧兜里那份替他写到了大四——档案记的是他，笔迹是你。",
              echo: {
                speakerId: "ganFanShu",
                text: "（笔还没递，章已经蘸好了）上学期你也接的这支笔，替旁边那只填到了第四年。这学期我省了一句劝——反正劝完你们都还是交。",
                innerVoice: "（他上学期说过一句什么来着？我没听清。这学期，连我没听清的那句都被他省了。）",
              },
            },
            {
              id: "fc-c2b",
              text: "把橡皮上的计划从头到尾看完，什么也没说。",
              silenceDelta: 1,
              branch: "fc-a1-b2-l1",
              coda: "「然后呢」他等着，你没问。橡皮字面朝下扣住之后，十一月的空白一学期没人提。",
              echo: {
                speakerId: "narration",
                text: "你的档案里，这个沉默已经出现过一次。第二次不另起一行，记在同一格——系统不觉得重复有什么问题。",
              },
            },
            {
              id: "fc-c2c",
              text: "替他问出口：「他还没想好，能不能缓两天？」",
              silenceDelta: -1,
              affinityTarget: "ganFanShu",
              affinityDelta: 3,
              branch: "fc-a1-b3-l1",
              coda: "值班本多了一行：缓两天，第四天收。他欠的期限变成两个：表，和替他开口的蛙。",
              echo: {
                speakerId: "ganFanShu",
                text: "（值班本没翻，直接记在原页）缓两天，第四天收。这套流程上学期我是现翻的，这学期背下来了——你没变，它也没变。",
                innerVoice: "（「你没变」三个字他说得很平。上学期他抬头看了一眼橡皮蛙。这学期他没抬头。）",
              },
            },
          ],
        },
        /* ---------- 分支段落（v4）：三选一，不嵌套选项，末尾由 merge 回汇流 ---------- */
        {
          id: "fc-a1-b1",
          lines: [
            {
              id: "fc-a1-b1-l1",
              speakerId: "narration",
              text: "你接过笔的动作快得连你自己都意外。笔杆还是温的，牙印正对着虎口。你在他那份空白表上填了三行：绩点、保研、考公，全都要。写到「四年规划」那栏你停了一下——自己的没想好，替他倒是一路填到了大四。",
            },
            {
              id: "fc-a1-b1-l2",
              speakerId: "narration",
              text: "交表的时候，干饭叔把两张表叠在一起，扫了一眼：「同一只手。」然后照常盖章。他说盖的是表，不是笔迹。表不问字是谁的。",
            },
            {
              id: "fc-a1-b1-l3",
              speakerId: "naiBai",
              text: "",
              innerVoice: "橡皮蛙把表拿回去看了很久。他橡皮上写的是：早六、单词、体测及格线。表上替他写的是：绩点、保研、考公。我替他许的愿，比他自己的大一号。他一个字都没改。",
            },
            {
              id: "fc-l69",
              speakerId: "narration",
              text: "他把表看完，用手把它抹平了一遍。从上往下，抹得很慢，像要把表里的什么东西抚下去。抹平之后，你替他写的那三行字，看起来比刚才更像印刷的了。",
            },
            {
              id: "fc-l44",
              speakerId: "narration",
              text: "递表之前，橡皮蛙忽然伸手按住你的手腕。不是抢，就是按着。他盯着那三行字看了两秒，把表往回抽了一点，用铅笔在页脚很小的地方写了一行字，写完又擦掉了。橡皮屑落在桌上，他用袖口拢了拢，拢进手心，倒进了桌角那只没有盖的笔筒里。",
            },
            {
              id: "fc-a1-b1-l4",
              speakerId: "narration",
              text: "「……那咋了。」他说。这一次，这三个字前面没有任何问题。他把表折成四折塞进侧兜，又把橡皮扣回桌面，扣得很轻，字面朝下，像怕压坏了里面的字。",
              merge: "fc-l12",
            },
          ],
        },
        {
          id: "fc-a1-b2",
          lines: [
            {
              id: "fc-a1-b2-l1",
              speakerId: "narration",
              text: "你把那块橡皮拿起来，从头看到尾。早六，单词，体测及格线，十一月前过四级——然后就没有了。十一月的后面是一小块被磨平的橡皮面，什么都没写。",
            },
            {
              id: "fc-a1-b2-l2",
              speakerId: "naiBai",
              text: "",
              innerVoice: "他一直看着你看。他在等一个「然后呢」。你没问。橡皮放回去的时候，他的手指压在上面，直到你收回目光才松开。",
            },
            {
              id: "fc-a1-b2-l3",
              speakerId: "narration",
              text: "「十一月以后的事，」他忽然开口，又停住，「到十一月再说吧。」橡皮被他翻了个面扣住，扣得很正，字面朝下。",
            },
            {
              id: "fc-l70",
              speakerId: "naiBai",
              text: "",
              innerVoice: "橡皮上那块磨平的地方，不是擦字擦出来的，是用手指压出来的。计划写了擦、擦了写，那一小块越来越短。他擦掉过什么，没人见过。",
            },
            {
              id: "fc-l45",
              speakerId: "naiBai",
              text: "",
              innerVoice: "下一个章落下去的时候，橡皮蛙抬头看了你一眼。不是质问，就是看一眼，像确认你看没看见。你看见了。你把目光挪回表上，装作在核对「姓名」栏。那一栏你其实早就核对过了——核对了两遍。",
              expression: "blush",
            },
            {
              id: "fc-a1-b2-l4",
              speakerId: "naiBai",
              text: "",
              innerVoice: "十一月之后是空白。他把前半段写满，是为了让后半段的空白看起来不像空白。你看见了，你什么也没说。看见了不说，是这所学校最先教会你的技能。",
              merge: "fc-l12",
            },
          ],
        },
        {
          id: "fc-a1-b3",
          lines: [
            {
              id: "fc-a1-b3-l1",
              speakerId: "narration",
              text: "说出口之前，你在心里数了三秒。队伍没有停，你后面还排着六只蛙。「他还没想好，」你说，「能不能缓两天？」",
            },
            {
              id: "fc-a1-b3-l2",
              speakerId: "ganFanShu",
              text: "干饭叔看了看你，又看了看那只一直没动笔的蛙。「可以。」他把值班本翻过来，在角上记了一笔。「缓两天。第四天我来收。」",
            },
            {
              id: "fc-a1-b3-l3",
              speakerId: "narration",
              text: "橡皮蛙抬起头。他嘴张了一下，最后说出来的还是那三个字：「那咋了。」声音比平时小。橡皮被他攥回手心，攥得比刚才紧。",
            },
            {
              id: "fc-a1-b3-l4",
              speakerId: "naiBai",
              text: "",
              innerVoice: "缓刑也是刑。他现在欠着两个期限：一份表，和一个替他开口的蛙。第四天之前，这两个都得还上。",
            },
            {
              id: "fc-l71",
              speakerId: "narration",
              text: "值班本上那行字写得很小，缩在页脚，但「缓两天」三个字压得很重，笔尖快把纸划破了。期限是写给别人看的，笔劲是留给自己的。",
            },
            {
              id: "fc-l46",
              speakerId: "narration",
              text: "队伍从你身后绕过去，像水绕开一块石头。排在第七位的那只蛙举起手机，对着队伍方向拍了一张——没拍你们，拍的是队伍。但取景框的两条边，正好把你们俩框在中间。",
            },
            {
              id: "fc-a1-b3-l5",
              speakerId: "ganFanShu",
              text: "（你转身要走，身后传来一句压得很低的话）「……想出来的，比填上去的值钱。」他低头继续盖章，像刚才什么也没说过。",
              merge: "fc-l12",
            },
          ],
        },
        /* ---------- 汇流场景（v4）：分支无关，三路都成立 ---------- */
        {
          id: "fc-s3",
          lines: [
            {
              id: "fc-l12",
              cg: "cg-timeline-flag",
              bg: "bg-class-room",
              speakerId: "narration",
              text: "晚上的大教室，开学第一课。台上没放课本，放了一份 PPT：《大学四年时间轴》。大一绩点，大二进组，大三分流，大四秋招。时间轴的尽头画着一面小旗。",
            },
            {
              id: "fc-l13",
              speakerId: "naiBai",
              text: "",
              innerVoice: "第一课没有第一课的内容。第一课教的是：后面每一课，都有人替你排好了。",
            },
            {
              id: "fc-l14",
              speakerId: "narration",
              text: "辅导员讲到作息的时候，大家低头看课表——「午休」两个字是用小号字体印的，缩在两门课中间，像一种不好意思。",
            },
            {
              id: "fc-l33",
              speakerId: "narration",
              text: "课表翻到最后，还附了一页《综合测评实施细则（试行）》。省级竞赛一等奖加 3 分；志愿时长满 50 小时封顶 1 分；讲座一场 0.2 分——要签到，要拍照，要写心得。最底下一行小字：本细则最终解释权归学生工作办公室。",
            },
            {
              id: "fc-l34",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我在心里算了道除法：一场讲座 0.2 分，一学期凑满一分要坐五十场。没算完，上课铃响了。铃也是要打卡的。",
              expression: "frozen",
            },
            {
              id: "fc-l15",
              speakerId: "narration",
              text: "就是那只橡皮蛙举了手。他站起来问：「老师，要是有人……不想保研呢？」教室安静了两秒。然后辅导员笑了：「这个问题很有精神。写成心得体会，周五前发我邮箱。」",
            },
            {
              id: "fc-l16",
              speakerId: "narration",
              text: "全班松了口气，笑出声。笑声很整齐，整齐得像提前排练过。橡皮蛙站也不是坐也不是，最后坐下了，耳朵红的。",
            },
            {
              id: "fc-l35",
              bgm: "fc-hall",
              se: "se-applause",
              speakerId: "narration",
              text: "课上放了一段上周开学典礼的集锦。镜头从横幅扫到主席台，最后停在观众席：掌声最响的三秒被慢放了两遍，配了字幕——「青春风采」。",
              cg: "cg-ceremony-hall",
            },
            {
              id: "fc-l36",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我在画面右下角找到了自己。掌拍得很响，脸是空的。我不记得那三秒为什么鼓掌。片尾滚动的工作人员名单里，摄像有两个，剪辑有一个。",
              cg: "cg-ceremony-hall",
            },
            {
              id: "fc-l17",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我也笑了。笑完才发现：问题是他问的，松一口气的是我们。",
              expression: "blush",
            },
            {
              id: "fc-l47",
              speakerId: "narration",
              text: "教室后墙挂了一块倒计时牌：距考研 1298 天。数字是打印的，一格一格贴上去。牌子最下面一行小字：由学习委员每日更新。最上面那格是今天早上撕掉的，撕痕很新，胶还粘着一块纸角。",
              cg: "cg-countdown-board",
            },
            {
              id: "fc-l48",
              speakerId: "naiBai",
              text: "",
              innerVoice: "座位按学号排，我是 036，橡皮蛙是 035。中间的 034 空着，桌面干净，没有书。教室里一共两个空位，034 和 052。点名的时候这两个号都被念到了，念完，教室安静了一秒，然后继续。",
              expression: "frozen",
            },
            {
              id: "fc-l73",
              speakerId: "narration",
              text: "学习委员清点人数，清到空位时手指在半空停了半秒，接着数。数完报数：「实到四十八。」名单上是五十。没有蛙问差的那两个去哪了——报数的时候，「实到」比「应到」好用。",
            },
            {
              id: "fc-l49",
              speakerId: "narration",
              text: "讲到「大一绩点」那页，PPT 角落有一行小字：本页适用于全体新生，不作个性化调整。台下没有蛙抬头看那一行。你看了。你看的时候，前排那只蛙把这一页拍下来，发进一个叫「大一互助群」的群里，配了四个字：先看后改。",
            },
            {
              id: "fc-l50",
              speakerId: "naiBai",
              text: "",
              innerVoice: "散场前，辅导员补了一句：「今天讲的不是建议，是流程。」她低头看了一眼提词器——提词器上应该也是这六个字，一个标点都不会差。",
              expression: "frozen",
            },
            {
              id: "fc-l74",
              speakerId: "narration",
              text: "出教室的时候，每只蛙领到一张《开学第一课反馈问卷》，匿名，当场填完投进箱子。最后一题「你对本课的感受」，三个选项：满意、非常满意，以及其他。",
            },
            {
              id: "fc-l75",
              speakerId: "naiBai",
              text: "",
              innerVoice: "「其他」又出现了。纪律十二条里有它，问卷三选一里也有它。这所学校所有的选择题，最后都留了同一个出口——并且希望没人走。",
              expression: "frozen",
            },
            /* CY-119 客串蛙网织密：手机蛙（食堂线 cn-l3/cn-s3b）与橡皮蛙（本线 fc-s2）同教室同框 */
            {
              id: "fc-l76",
              speakerId: "narration",
              text: "你身后有只蛙在桌子底下打手机的字——打一段，删一段，又打一段。第三遍他把手机收了，扣在桌面上。点名叫到他的号，他答「到」，声音不大不小。他的座位斜对着 035：035 的桌上扣着一块橡皮，他的桌上扣着一部手机。同一间教室，两种字面朝下。",
            },
            {
              id: "fc-l77",
              speakerId: "naiBai",
              text: "",
              innerVoice: "扣橡皮的蛙，计划写在橡皮上；扣手机的蛙，话打完就删。他们收东西的方式是一样的——字面朝下，日子朝上。后来在食堂窗口看见他们排在一前后，我一点都不意外。",
              expression: "soft",
            },
          ],
          choices: [
            {
              id: "fc-c3a",
              text: "举手：「老师，心得我替他写。」",
              silenceDelta: 1,
              coda: "「我替他写」四个字你说得很响。辅导员听见了，橡皮蛙也听见了——档案把发言人记成了「参与积极」。",
              echo: {
                speakerId: "narration",
                text: "上学期你也举了这只手。这学期辅导员直接翻到提词器「配合精神」那一页——她不是现翻的，那一页一直开着。",
              },
            },
            {
              id: "fc-c3b",
              text: "低头把时间轴抄进备忘录，连尽头那面小旗也照着画了一个。",
              silenceDelta: 3,
              echo: {
                speakerId: "narration",
                text: "上学期这堂课，你也是抄到一半抬的头。这学期镜头又扫过来一次——素材库里你「认真听讲」的片段，已经攒了两个。",
              },
            },
            {
              id: "fc-c3c",
              text: "散场时绕到收表窗口，问那只围裙蛙：「你一直站在这儿，累吗？」",
              silenceDelta: 0,
              affinityTarget: "ganFanShu",
              affinityDelta: 2,
              coda: "他说不累。说完停了两秒——那两秒比答案诚实。",
              echo: {
                speakerId: "ganFanShu",
                text: "（码表的手没停）上学期问这句话的，也是你。（他想了一会儿）累不累，箱子知道。表一份比一份沉，我站的地方没动过。",
              },
            },
          ],
        },
      ],
    },
    {
      id: "fc-a2",
      index: 2,
      title: "散场以后",
      quote: "加了一个句号，「提醒」就变成了「通知」。",
      quoteBy: "naiBai",
      scenes: [
        {
          id: "fc-s4",
          lines: [
            {
              id: "fc-l18",
              bg: "bg-class-corridor",
              speakerId: "narration",
              text: "散场时，橡皮蛙被辅导员叫去了走廊。你路过的时候听见：「不是批评你。这样的思考很有价值，写成书面材料更好。周五前，邮箱。」",
            },
            {
              id: "fc-l19",
              speakerId: "narration",
              text: "他回来说了句「那咋了」，声音不大。然后他打开电脑，新建文档，把标题字体换成了正式的那种。",
            },
            {
              id: "fc-l20",
              speakerId: "naiBai",
              text: "",
              innerVoice: "「那咋了」是挡箭牌。挡箭牌后面，文档已经建好了。",
            },
            {
              id: "fc-l21",
              speakerId: "narration",
              text: "公告栏贴出了新生体测初测名单。五十米不及格的号码用红笔圈着，橡皮蛙的号在里面。他看了一眼，说：「那咋了。」然后在去食堂的路上，逆着人流多跑了两个来回。",
            },
            {
              id: "fc-l22",
              speakerId: "naiBai",
              text: "",
              innerVoice: "原来在这所学校，连跑步都要公示。不合格是一种需要张贴的属性。",
            },
            {
              id: "fc-l23",
              speakerId: "narration",
              text: "收表窗口前，干饭叔把表格一张张码进箱子。箱子上贴着封条：「四年。请勿拆封。」他码得很平，没有一张是歪的。",
            },
            {
              id: "fc-l29",
              speakerId: "ganFanShu",
              text: "（你问他，工牌旁边那块「已老实」的牌子是什么意思。他码表的手停了一下，想了一会儿——真的想了一会儿。）……就是，不再问为什么的意思。",
              expression: "teary",
            },
            {
              id: "fc-l30",
              speakerId: "naiBai",
              text: "",
              innerVoice: "他说完继续码表，背影有点慢，但没有一步是乱的。我忽然不太想问他为什么了——你看，我学得很快。",
              expression: "frozen",
            },
            {
              id: "fc-l51",
              speakerId: "ganFanShu",
              text: "（把最后一摞表码进箱子，封条抹平）都齐了。（他把你那张从箱缝里抽出来，看了一眼目标栏，又放回去，位置没动）回去吧。路上慢点。",
              expression: "soft",
            },
            {
              id: "fc-l52",
              speakerId: "narration",
              text: "他去关灯。关灯之前，把窗口那块「已老实」的牌子翻过来擦了一遍。三个字比早上亮。整栋楼的灯一层一层灭下去，最后亮着的是公告栏那一小块——五十米不及格的号码还在，红圈被风吹得翘了一个角。",
            },
            {
              id: "fc-l31",
              speakerId: "narration",
              text: "回宿舍的路上，高中同学群弹出来一条转发：「恭喜我校学子上岸选调！」你妈在下面回：「看看人家。」你点开，又退出来，什么也没说。",
            },
            {
              id: "fc-l53",
              speakerId: "narration",
              text: "十一点四十六分，辅导员的头像在新生群里亮了：「再提醒一次，规划表明早八点前补交，晚交的我会单独@。」三秒后撤回，重发了一条一模一样的，只多了一个句号。",
            },
            {
              id: "fc-l54",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我盯着那个句号看了很久。加了一个句号，「提醒」就变成了「通知」。我草稿箱里也躺着一份改了四遍的东西，改到第四遍，里面一个「我」字都没有了。",
              expression: "frozen",
            },
            {
              id: "fc-l32",
              pose: "hold",
              bgm: "fc-wait",
              speakerId: "naiBai",
              text: "",
              innerVoice: "开学第一天结束。我交了两份表，笑了一次，学了一个新词。那个词的意思是，不再问为什么。",
            },
          ],
        },
        {
          id: "fc-s5",
          lines: [
            {
              id: "fc-l57",
              bg: "bg-dorm-room",
              speakerId: "narration",
              text: "宿舍四张床。你推门进去的时候，三张床帘已经拉上了，帘缝里漏着光，一道偏白，一道偏黄，还有一道一直在换颜色——大概在刷视频。",
            },
            {
              id: "fc-l58",
              speakerId: "narration",
              text: "斜对面那张床翻了个身，帘缝的光灭了，又亮。新生群里，「大学第一天，都挺好的」那条还挂在上面。你看了看发送时间，又看了看斜对面床帘顶端——对得上。",
            },
            {
              id: "fc-l59",
              speakerId: "naiBai",
              text: "",
              innerVoice: "原来是他。删掉最后一句才发出来的那条，就是他发的。他现在躺在帘子里面，手机举着，没睡，也没出声。帘缝那道光亮一下暗一下——刷屏幕也要蒙着被子刷。",
              expression: "soft",
            },
            {
              id: "fc-l60",
              speakerId: "narration",
              text: "十一点五十八，辅导员在群里发：「@全体成员 收到请回复明日课表确认。」三十秒里，「收到」排出去四十七条。有一只蛙发的是「收到」前面多打了一个「好的」，撤回，重发，排到队尾。",
            },
            {
              id: "fc-l61",
              cg: "cg-four-glows",
              speakerId: "naiBai",
              text: "",
              innerVoice: "四张床，四道光。每一道都在跟远处说话，没有一道在跟旁边的蛙说话。这个宿舍今晚离得最远的话，都走了同一台服务器。",
              expression: "frozen",
            },
          ],
          choices: [
            {
              id: "fc-c5a",
              text: "在家庭群里打「晚安」，发出去，又撤回，最后改发了一朵玫瑰。",
              silenceDelta: 0,
              coda: "撤回的那句「晚安」留在草稿箱里，跟那份改了四遍的东西排在一起。",
              echo: {
                speakerId: "narration",
                text: "上学期你也撤回过一次「晚安」。撤回记录系统留了底——你的诚实，在后台有一份完整的。",
              },
            },
            {
              id: "fc-c5b",
              text: "跟着回一条「收到」，排在第四十八个，句号也照抄了。",
              silenceDelta: 1,
              coda: "你是第四十八个「收到」。那个句号是你从辅导员那条里抄来的——标点也算队列。",
              echo: {
                speakerId: "narration",
                text: "上学期你的「收到」是第十二个到的。这学期你等到第三十二个发完才发——排队这件事，在群里也让人踏实。",
              },
            },
            {
              id: "fc-c5c",
              text: "敲敲斜对面的床板，小声说：诶，你发出去之前删掉的那句，可以说给我听。",
              silenceDelta: -1,
              affinityTarget: "all",
              affinityDelta: 2,
              coda: "帘子里安静了两秒，然后一个很小的声音：「……也没什么。」但那道光一直亮到你睡着。",
              echo: {
                speakerId: "narration",
                text: "你敲床板的那一下，记录系统没收到任何东西。有些事只能发生在宿舍——档案的手，伸不进床帘。",
              },
            },
            {
              id: "fc-c5-idle",
              text: "（你举着手机躺到屏幕自己变暗，又暗了一档。）",
              silenceDelta: 1,
              coda: "屏幕暗了两次，你都没锁屏。像在等谁回你，又像在等谁管你——哪个都行。",
            },
          ],
        },
      ],
    },
    {
      id: "fc-a3",
      index: 3,
      title: "第二天早上",
      quote: "交不上的，明早八点前补交，我等。",
      quoteBy: "ganFanShu",
      scenes: [
        {
          id: "fc-s6",
          lines: [
            {
              id: "fc-l62",
              bg: "bg-class-gate",
              speakerId: "narration",
              text: "早上七点五十，补交的队伍比昨天还长。辅导员抱着保温杯站在队尾，先看一眼手机，再看一眼排队的蛙。看见你的时候，她朝你点了点头：「来得早。」",
            },
            {
              id: "fc-l63",
              pose: "lean",
              speakerId: "ganFanShu",
              text: "（盖章，没抬头）今天来得早的，都是昨晚想明白的。想明白的不多话——交表的时候，纸是平的。",
            },
            {
              id: "fc-l64",
              cg: "cg-two-lists",
              speakerId: "narration",
              text: "橡皮蛙不在队伍里。他站在公告栏前面：五十米初测名单还贴着，红圈没褪；旁边新贴了一张《补测合格名单》。两张纸上，都有他的号。",
            },
            {
              id: "fc-l65",
              speakerId: "naiBai",
              text: "",
              innerVoice: "初测没过，补测过了，两张都贴着。学校不撕旧公告——旧公告是拿来证明进步的。他的不及格和他的及格并排挂着，像一副对联。",
              expression: "frozen",
            },
            {
              id: "fc-l66",
              pose: "hold",
              speakerId: "ganFanShu",
              text: "（他从窗口里出来，把带红圈的那张揭下来，对折，放进围裙内兜——不是垃圾桶。）名单用完了，进档案。（他拍了拍口袋）他跑的不是名单，是那两个来回。那两个，进他自己的。",
              expression: "soft",
            },
            {
              id: "fc-l67",
              speakerId: "narration",
              text: "橡皮蛙看着他收纸，嘴张了一下，出来的还是那三个字：「那咋了。」只是这一次，尾音里带了一点笑。",
            },
            {
              id: "fc-l68",
              speakerId: "naiBai",
              text: "",
              innerVoice: "我第一次知道「那咋了」是有语调的。昨天的是挡箭牌，今天的像句号——「都挺好的」后面那种，可以不撤回的。",
              expression: "soft",
            },
          ],
          choices: [
            {
              id: "fc-c6a",
              text: "直接去上课。第一节不能迟到——铃也是要打卡的。",
              silenceDelta: 0,
              coda: "你从公告栏前走过去，没停也没看。你已经知道哪张名单值得看，哪张只是贴着的。",
            },
            {
              id: "fc-c6b",
              text: "把两张名单拍进同一张照片，配文「新学期」，发出去。",
              silenceDelta: 1,
              coda: "相册九宫格，两张名单占了中间位。配文写的是新学期，发出去的是红圈。",
              echo: {
                speakerId: "narration",
                text: "两张名单的合影，上学期你也拍过。相册里两张的构图一模一样——连拍照的姿势，都是被系统训练过的。",
              },
            },
            {
              id: "fc-c6c",
              text: "对橡皮蛙说：那天课上你问的那个问题，我觉得问得好。",
              silenceDelta: -1,
              affinityTarget: "all",
              affinityDelta: 2,
              coda: "他愣了一秒，说了句「那咋了」，先走了。走得很快，但在教学楼拐角那儿，他等你了。",
              echo: {
                speakerId: "ganFanShu",
                text: "（他在窗口里，声音跟出来）这句话你是第二个跟他说的。（盖完一个章）第一个是我。二十年前——那时候，没蛙在拐角等我。",
              },
            },
            {
              id: "fc-c6-idle",
              text: "（你站在两张名单前面，站到人流散了，也没说话。）",
              silenceDelta: 1,
              coda: "红圈被揭走之前，你是最后一个站在它前面的蛙。看没被人看见，就多看了一会儿。",
            },
          ],
        },
      ],
    },
  ],
  endings: [
    {
      id: "fc-e1",
      title: "状况良好",
      settlement: {
        stamp: "状况良好",
        tierName: "真话档",
        caption:
          "规划表页脚批注「态度真实，心理状况良好」；你没配合的那些年，学校逐条替你记了分，记的全是好评。",
        art: ["book", "paper", "lamp"],
      },
      minSilence: 0,
      maxSilence: 4,
      text: "毕业前最后一次核对档案。大一那张规划表躺在里面，目标栏写着「随便过过，反正没人看」，页脚一行批注：态度真实，心理状况良好。四年里你举过一次手，问过一次为什么。那次提问归在《课堂互动记录》，评语四个字：参与积极。你没配合的那些年，这所学校逐条替你记了分，记的全是好评。出门的时候走廊灯坏了一半。你摸着墙往前走，走得很熟——这面墙你贴过公告，画过展板，也靠在等过名单。四年里它一直在这儿，比大多数同学待得久。",
      plus: "第二学期的规划表加了一栏：「真实想法（选填）」。你那句照填，批注栏不用另写——模板里备好了两个字：已阅。报到窗口的章照落，落点比上学期准。",
      thirdNote: "本栏转入免于统计。四年四份表合订一册，页码连续，不再逐份核对。",
    },
    {
      id: "fc-e2",
      title: "第四十一场",
      settlement: {
        stamp: "模板可用",
        tierName: "转述档",
        caption:
          "心得三百字，模板存了两个轮着用；你连教蛙省事，都教得很熟练。",
        art: ["stack", "stamp", "phone"],
      },
      minSilence: 5,
      maxSilence: 12,
      text: "大三下学期，你签到过的讲座是第四十一场，心得三百字一篇，模板存了两个轮着用。规划表第七次提交，目标栏那句「随便过过」被你自己删了，改成「踏实就好」。辅导员在群里@全员核对信息，你回「收到」用了四秒。你记不清是从第几份表开始不看的了。表格还在收，你还在交，两边都顺，没人觉得哪里不对，包括你。第五十一场那天，你给一个新来的学妹演示怎么快速签退。她问心得为什么能用模板。你说：反正没人看。说完两只蛙都笑了，笑完各自去赶下一场——你连教蛙省事，都教得很熟练。",
      plus: "第二学期起，讲座签到取消了确认弹窗，场次自动累计，没人再核对第几场。心得模板轮到第三版，审批意见固定成四个字：格式规范。辅导员那条@全员，你回「收到」的用时进了系统日志，备注栏两个字：熟练。",
      thirdNote: "签到记录按学期合并，第四十一场起不再另立新页。心得沿用第三版模板，纸数照旧。",
    },
    {
      id: "fc-e3",
      title: "细则第三条",
      settlement: {
        stamp: "照章执行",
        tierName: "沉默档",
        caption:
          "表箱贴着「四年。请勿拆封」，没有一张是歪的；细则新增的一条是你提的：讲座一场，0.2 分。",
        art: ["box", "stamp", "stack"],
      },
      minSilence: 13,
      text: "多年后的迎新日，收表的桌子后面是你。一只新蛙问：能不能先带我把校园逛一圈。你说：先交表。他站着没动，你补了两个字：我等。这两个字是当年别人对你说的，你记得很清。散场后你把新一批表码进箱子，贴上「四年。请勿拆封」，没有一张是歪的。今年你还在修订那份细则，新增的一条是你提的：讲座一场，0.2 分。迎新队伍里有只新蛙多问了一句：为什么表要交两份。你没抬头，手上在盖章。这个问题你大一问过——但站在桌子后面才发现，你早就不记得当年收表的蛙长什么样了。他大概也没记住你。",
      plus: "第二学期的迎新流程图改了版，收表那一格的示例话术多了一行：「我等」。出处栏空着——档案不记谁说的，只记它进了流程。这一档归进「示范卷宗」，编号接着上一届往下排。",
      thirdNote: "收表岗的培训材料改由在岗者自编，你那两个字印在第一页，落款是你的工号。",
    },
  ],
  /* ---------- v5 记忆锚点段（二周目起插在 fc-l24 之后，纯叙事）：
     锚点 fc-l24 在线性主路径上（fc-s1 不含分岔）、不带 merge、非 heart 节点；
     grep 自查「fc-l24」不出现在任何 branch:/merge: 目标里 ---------- */
  resonances: [
    {
      afterId: "fc-l24",
      lines: [
        {
          speakerId: "narration",
          text: "你的档案里，这张表已经存过一份。第二份不新开卷宗，续在同一卷——学校管这个叫连续性。",
        },
        {
          speakerId: "ganFanShu",
          text: "（他把新的一叠推过来，动作和上学期分毫不差）四年之后的事我没见过。第二学期还坐在这的蛙，我倒是见得多。",
          innerVoice: "（他说这话时没看我。看的是箱子。）",
        },
        {
          speakerId: "narration",
          text: "系统不觉得重复有什么问题。它只负责把两次都记下来，然后在备注栏里写：无异常。",
        },
      ],
    },
    {
      afterId: "fc-l15",
      lines: [
        {
          speakerId: "narration",
          text: "那只手，档案上学期也记过一次。《课堂互动记录》第二条，评语栏四个字：参与积极。",
        },
        {
          speakerId: "narration",
          text: "辅导员这次的笑和上次是同一个来源——提词器只有一页翻着，那页的标题叫「如何回应提问」。",
        },
        {
          speakerId: "naiBai",
          text: "",
          innerVoice: "（那只手举起来的时候，我差点也举了。上学期，我就是在这个位置把手放下的。）",
        },
      ],
    },
    {
      afterId: "fc-l29",
      lines: [
        {
          speakerId: "ganFanShu",
          text: "（他把牌子又擦了一遍，和上学期同一个动作）这个问题，你上学期问过。",
        },
        {
          speakerId: "narration",
          text: "他又想了一会儿。这所学校里还会「想一会儿」的蛙不多了——系统不记录思考，只记录响应时长。",
        },
      ],
    },
  ],
};
