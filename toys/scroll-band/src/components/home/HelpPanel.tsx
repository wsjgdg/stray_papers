import { useEffect, useRef, useState } from "react";
import type { useHome } from "@/pages/Home/useHome";
import { usePanelEntrance } from "./usePanelMotion";

const PERFORM_KEYS: { keys: string; desc: string }[] = [
  { keys: "移动", desc: "音阶量化 · 音随横轴 亮随纵轴" },
  { keys: "按下", desc: "完整音符 + 冲击波" },
  { keys: "按住", desc: "持续音 + 光柱" },
  { keys: "打字", desc: "鼓组 · 速度驱动节奏 · 点 HUD「打·鼓 / 打·钢」切玩法" },
  { keys: "K", desc: "钢琴模式下让位琴键，切回鼓组点 HUD「打·鼓 / 打·钢」" },
  { keys: "键位", desc: "HUD「键位」chip 切两种钢琴映射——横向：26 个字母从左到右 = 26 个白键（Shift / 黑键模式弹右邻黑键）；钢琴：经典琴键排布，中排 A S D F G H J K L = 白键、上排 W E T Y U O P = 直按黑键（不再需要 Shift）；选择记在本地" },
  { keys: "黑键", desc: "HUD「黑键」chip 或按一下 Caps Lock 切换黑键模式：开着时全部字母键直接弹各自右邻的黑键（等效常驻 Shift，没有 Shift 组合键冲突）；Caps Lock 灯亮 = 黑键模式开；Shift+字母 临时黑键照常可用" },
  { keys: "分区", desc: "字母区 = 琴键、数字区 = 踏板：0/9 只当延音/弱音踏板，任何键位布局下都不会被当成琴键，两边永不重叠" },
  { keys: "0", desc: "钢琴模式：长按踩延音踏板，松开统一收束（鼓组模式下照常打鼓）" },
  { keys: "9", desc: "钢琴模式：长按踩弱音器踏板，音色变暗变轻，松开恢复（鼓组模式下照常打鼓）" },
  { keys: "R", desc: "开始 / 停止录音；钢琴模式下让位琴键，录音用 HUD ● 按钮" },
  { keys: "A", desc: "乐句宏：循环 关 → 琶音 → 音阶；开启后鼠标触发音自动向上扫过和弦音 / 音阶跑动，即兴立刻变华丽；钢琴模式下用 HUD「宏」chip" },
  { keys: "动色", desc: "HUD「动色」chip 点开菜单直选档位：自动 = 鼠标越慢音色越柔（玻璃）、中速拨弦、越快越锋利（锯齿Lead），像从音乐盒滑向失真合成器；也可锁定 玻璃/拨弦/锯齿Lead 任一档固定用；开启时作曲画线笔位实时发声，落笔前就能听见这条线的音色" },
  { keys: "遥测表", desc: "右下角实时仪表：竖条 = 当下按键力度（白刻线停在最近一下的峰值），圆环 = 滤波明暗（环心数字 = 截止频率），演奏的每一下轻重与明暗都看得见；作曲画线时同样驱动——竖条 = 笔速即将编译成的力度，环随手上下扫；开「动色」时环下浮出当前音色档（玻璃/拨弦/锯齿Lead），画线当场听见音色切换" },
  { keys: "L", desc: "循环录音台：按 L 录一层 → 再按循环 → 循环中按 L 叠新层、再按合并；HUD「－1层」撤销最上层、「×」或 Shift+L 清空；钢琴模式下用 HUD「↻ 循环台」按钮" },
  { keys: "空格", desc: "播放 / 暂停循环：把最近一次录音（含合奏时 AI 的接话）从头到尾完整循环，录了多长循环多长；循环台运行中让位（由 L / HUD 管理）" },
  { keys: "静音", desc: "HUD「静音」chip 或 Shift+M：一键让整页安静（演奏、循环、鼓、垫音全部不出声），再点/再按恢复当前音量——深夜练琴或临时安静一下用它；静音时画布循环连发声都省掉，顺带减轻卡顿（钢琴玩法里 Shift+M 仍是黑键，请用 HUD chip）" },
  { keys: "听感", desc: "HUD「更多」→「听感」面板：主音量 / 音乐 / 语音三条推子各管各的——音乐推子调琴鼓与循环伴奏的轻重，语音推子调指挥朗读的响度，深夜想听人声不想听琴就把音乐拉低；下面还有挑战判定校准：总觉得「明明踩中却判早晚」就点「开始校准」，听到 8 声「哒」按 8 次空格，自动量出这台设备声音到耳朵的延迟补进判定窗（蓝牙耳机常需 +100ms 上下，也可滑杆手动微调）" },
  { keys: "性能", desc: "HUD「更多」→「性能」chip 三态循环：自动（默认，每秒实测画面帧率，连续 3 秒低于 30 FPS 自动降级——粒子减半、光带拖尾与鼓点抖动关闭、判定文字等关键视觉保留；回到 55 FPS 以上又自动恢复完整）/ 完整（永不降级）/ 省电（手动常驻降级，老电脑或投屏用）；chip 悬停可看当前实测 FPS，降级生效时前面亮 ⚡；选择记在本地" },
  { keys: "无障碍", desc: "HUD「更多」→「无障碍」面板三项：色盲友好配色（音级颜色换成红绿色盲也能分辨的色盘并加明暗差，Miss 红闪与判定字换朱红，作曲线/琴键/下落块同步）；纯视觉节奏模式（完全靠看打挑战——击符声与练习节拍器静音，判定线增亮加粗、Miss 闪加强、判定文字放大，判定与计分规则不变）；导出画布轨迹文字描述（把线与锚点翻译成「线 1：8 个音，D4 → A4，走向总体上行」式中文，复制进剪贴板可交屏幕朗读念出，剪贴板被拦自动存 txt）。另外作曲模式「单击落锚点」本就是拖拽画线的替代，不方便按住拖动也能摆音符；开关都记在本地" },
  { keys: "合奏", desc: "HUD「更多」→「合奏」面板：开启 AI 合奏伙伴后（演奏模式生效），你弹一句——鼠标旋律、打字钢琴、触屏键盘都算——它听下你最近一句的音高轮廓/节奏快慢/轻重，停一拍用同一个音阶、相近的音区回你一句（节奏型不会照抄）。四种人格随切：模仿型（学你的旋律换个节奏回）、对比型（反着来：你低它高、你密它疏、你响它轻）、推进型（越接越激烈，力度密度逐级抬，你慢下来它也降温）、卡农型（不改你的旋律——原样按原节奏跟读；你这句不超过六拍时自动转轮唱：回声错开两拍逐层进入，面板里「轮唱层数」1-4 层随选，多个回声声部交叠接力；配「和声声部」开时回声自带和声，最像多轨录音）。你停下它就不出声；你抢在它开口前弹，它把话头当场让回给你；它接话时琴键亮起、每个音浮一枚蓝色 ♪ 标记（和你的音符区分开），回应全部吸附节拍网格、起音对齐整拍——速度跟 HUD 的 BPM 走，合奏踩得住拍子；chip 前也浮 ♪；开着录音（R）时它的接话按排程时刻一并入带——整段合奏停止录音就能存历史、生成分享链接（循环台不掺 AI，不会自叠加）；「和声声部」开关让它每个回音轻垫一个三度和声，对话变双声部（蓝色 ♪ 只标旋律，和声一并入带）；开关与人格记在本地" },
  { keys: "循环伴奏", desc: "画布循环在作曲与演奏模式持续响——切回演奏可以叠着自己的伴奏即兴，不会断；伴奏自动比演奏区低一个八度，你弹的旋律浮在伴奏上方，互不糊在一起；HUD「伴奏 播放/暂停」chip 可临时停掉循环（相位冻住，再点从暂停的那刻继续，不影响你弹琴）；只有挑战模式里自动安静不干扰击符。临时想全安静用「静音」chip 或 Shift+M" },
  { keys: "1-6", desc: "直达音阶：五声 大调 小调 布鲁斯 都节 全音；切换时正在响的音与画好的线保持原音高不变，只有新弹/新画的用新音阶" },
  { keys: "S", desc: "循环切换音阶" },
  { keys: "T", desc: "循环切换音色：玻璃 芯片 锯齿Lead 拨弦 钟 贝斯 吉他 弦乐（只在预设里转，「自造」不会被误切走）" },
  { keys: "造音色", desc: "HUD「音色」chip 点开菜单：除直选 8 种预设和「自造」档，末尾「造音色…」打开音色编辑器——双振荡器（波形各选 + 失谐 + 八度）、滤波器 ADSR、放大器 ADSR、失真/合唱/延迟/混响效果链、LFO 调制全给你拧，滑杆拖一下当场听见；面板里「试听」弹两音小乐句、「恢复出厂」回默认，还有 暖垫 Pad / 拨拨 Pluck / 尖叫 Lead 三个起点模板一键灌参数；自造音色存本地，刷新还在，选中后 chip 显示「音色·自造」" },
  { keys: "G", desc: "循环切换鼓组风格包：原声 电子808 Lo-fi 金属" },
  { keys: "指挥", desc: "HUD「指挥」chip：唤出常驻的乐团指挥——说一种你想要的感觉（雨夜 / 晨光 / 街机…），他把音阶、画法、BPM、音色翻成站内立刻能做的操作；也能聊乐理、给编曲和练习建议，多轮对话不断片；他给的设置类建议会把要动的参数逐条高亮列出来（音阶→五声、BPM→92 这样的清单），每条单独「✓ 上台」也单独「↺ 撤销」（撤销回到你原来的设置），想省事就点「全部上台」；输入框上方的「画布体检报告」会把你在作曲模式画的线和锚点交给他，他看谱后当场出一张报告：评级 + 听感 + 亮点 + 隐患 + 下一步，能一键修的隐患旁边直接长「一键修复」按钮（其余可一键复制报告）；提问框上方有搜索框——按关键词过滤 132 条快捷提问，还能搜出你自己问过的话（问过的问题在题库里也会标「问过」并沉底）；聊天记录会替你留着（刷新也在），顶栏「导出」可把这段对话存成 .txt 换设备带走，点「重开」可另起一段；每条回复下的「朗读 ♪」能用语音念给你听（再点即停，关面板自动停），旁边的「复制文字」可把这条回复（不含设置暗码）单独摘走记到笔记里，「朗读设置」滑杆可调语速（0.5–2 倍）和音高，调慢适合逐句跟读，「自动朗读」开关一开，每条回复讲完就自动念给你听（适合边画边听）；每条回复还能「复制文字」单独摘走；「人格」行可换指挥性格：默认 / 严格导师（直言点破+给练习量）/ 轻松伙伴（松弛多鼓励）/ 实验先锋（专出反常规主意），换人格立即生效且记得住；提问按钮行有「给我灵感」——随机抽一个你还没问过的话题直接替你先问出口；每条稍长的回复末尾还会长出两颗「↳」追问按钮，顺着指挥递的话头点一下就能续聊不断线" },
  { keys: "更多", desc: "HUD 右端「更多 / 收起」：折叠垫音 / 画廊 / 指挥 / 空间 / 琴键 / 动色 / 宏 / 循环台这些次级开关，让顶栏只留最常用的；手机默认收起、电脑默认展开，收起时若里面有需要 / 有功能开着，「更多」会亮起提醒你" },
  { keys: "琴键", desc: "HUD「琴键」开关：屏幕底部浮出触屏键盘（26 白键 + 黑键），手机没键盘也能弹琴，多指可同按" },
  { keys: "MIDI", desc: "HUD「MIDI」开关：插上外接 MIDI 键盘点一下授权，之后钢琴玩法直接用它弹（26 键内的音都认，黑白键自动映射），挑战模式的下落音符也能用真琴键打——判定规则和电脑键盘完全一样；已连设备数会标在按钮上" },
  { keys: "?", desc: "显示 / 隐藏本面板" },
];

const COMPOSE_KEYS: { keys: string; desc: string }[] = [
  { keys: "Tab / M", desc: "切换 演奏 / 作曲 模式" },
  { keys: "拖动", desc: "作曲模式画一条线 = 循环旋律；画布音区固定 E2–C6 大区（纵轴从低到高约 3 个八度半），一屏装下整个音域" },
  { keys: "单击", desc: "作曲模式放下一个锚点音符" },
  { keys: "卷帘", desc: "HUD「卷帘」：选中一条线后打开钢琴卷帘——横轴时间、纵轴音高，笔迹自动量化成可拖拽的音符方块（1/4 拍网格）。点方块选中、Shift 点加选、空白处拖动画框=框选一批，选中的音符可以整组一起拖（贴边时相对间距不变）；右键弹菜单：删除、复制（后移 1 拍）、量化（半拍/整拍）、变调（升/降一级、升/降八度），作用于一组选中（没选就作用于全部）；面板底部力度条每个音一根竖条，按住竖直拖可单独调这个音的力度；滚轮缩放音高范围、Shift+滚轮缩放时间、Ctrl+滚轮两轴同缩，拖顶部时间标尺/左侧音高标尺平移视图，「适应」一键回到全景；双击删音、点空处加音也保留。改动即时进循环；「回到笔迹」一键清掉卷帘编辑恢复原曲线；注意改动线本体（拖动/拉伸/换音阶）会自动清回笔迹，卷帘编辑整段可撤销" },
  { keys: "变形", desc: "HUD「变形」（选中一条线或锚点后点亮）：一键出变体——逆行（时间轴倒转，末音变首音）、倒影（以首音为轴上下翻转）、加密（每两音之间插经过音）、稀疏（删掉偶数位的音）、移调（沿音阶上/下一级或升降整八度，永远不出调）、节奏缩放（快 2×/慢 2×，循环时长同步伸缩）；每个变形都是一步撤销（Ctrl+Z 反悔），选中卷帘编辑过的线时变形直接作用于音符；面板顶部还有「生成变体副本」——勾上后原线保留、变形结果往右错开生成新线，连着点逆行/加密/移调，一条线立刻生出一排变体（副本同样一步撤销）；配双击复制，一条线能生出十条线" },
  { keys: "曲线自动化", desc: "HUD「曲线」菜单（作曲模式）：选一个参数（音量 / 滤波 / 声像 / 混响）后横着拖一笔，画出一条虚线曲线——横轴时间、纵轴参数值（上=大），松手即生效：这段循环时间里该参数随曲线起伏（比如画条下坡线让某段渐渐变轻、给某段加更多混响）。曲线和音符线同权：可点选、可整体拖动、Ctrl/Cmd+D 复制、Delete 删除、拖右端手柄只拉长/压短作用时间段；四种曲线各配固定颜色（金=音量、青=滤波、蓝=声像、紫=混响），互不混淆。重叠时后画的说了算；覆盖段之外参数保持原样（音量满值、滤波全开、居中、混响不加料）。画的时候不出声预览；导出 MIDI / 卷帘 / 变形不作用于曲线（它们只属于发声对象），接龙里曲线照常生效。切回「关」回到画笔迹" },
  { keys: "哼唱", desc: "HUD「哼」chip（作曲模式专属）：点「开始哼」对着话筒哼一段旋律（戴耳机更准——外放会被话筒听到），面板里的实时曲线会把你哼的走向画出来——横轴时间纵轴音高，每行是半音格、左侧亮点列是当前音阶的合法音位；点「停止哼」浮出识别摘要（约几个音、几拍、平均音区），「落进画布」把整段哼唱编译成一条阶梯折线乐句循环播放，和手画的线完全同权：可拖动、可卷帘、可变形、可接龙本棒、可发布；「贴音阶」开关让音高吸附当前音阶合法级（关了保留滑音轮廓）、「对拍子」开关把音起止对齐 1/4 拍网格，默认都开；循环时长取哼唱拍数向上取整（接龙态自动压进 4 拍），落谱一步可撤销（Ctrl+Z 反悔）；授权被拒不循环请求，切模式/切走标签页自动停止拾音" },
  { keys: "AI", desc: "HUD「AI」chip（作曲模式专属）：打开右侧「AI 指挥台」，四个页签——「混音」逐条体检画布（谁太响、哪两条打架、动态太平、低频堆积、总线过载），每条建议写明对象名和具体做法，可逐条应用/忽略也可一键全部应用；「编曲」围绕选中（或音符最多的）主旋律给出和弦锚点组、鼓律动轨、换乐器、重复升一级变奏，生成的对象和手画的完全同权；「风格」五个预设（爵士/8-bit/管弦乐/Lo-fi/合成流行）整曲换装，迁移前自动存原样、随时「还原原样」，分享链接带风格标记、收到的人打开就是迁移后的效果。全部分析在浏览器本地完成；所有应用都进撤销栈可 Ctrl+Z 反悔；接龙态下建议可看、应用要等传完这棒" },
  { keys: "歌词", desc: "AI 指挥台第四页签「歌词」（作曲模式，选中一条旋律线后出现）：给个主题（留空 = 按旋律情绪自动定题）、选语言（中文/英文/日文），文本生成会返回与这条线一字（词）一音对齐的分词歌词——画布下方浮出「歌词条」，循环播放时随乐曲逐字点亮（与画布排程同一个时钟），点整行或小「改写」按钮可整行改写（按字数自动重新对齐）；歌词挂在这条旋律线上随它走：删除随删、Ctrl+Z 可撤销、刷新不丢、分享链接带着走（旧链接照常打开），但复制派生的副本不带词（防假对齐）；鼓律动轨 / 自动化曲线 / 锚点没有配词入口，少于 8 个音的短句会温和提示先多画几个音；接龙态入口照常可看、生成要等传完这棒；生成会调用平台文本生成（需先用右上角 RunningHub 登录，访客自付），失败按提示再试一次或换个主题" },
  { keys: "双击", desc: "复制选中对象（音高 +1 级）" },
  { keys: "拖本体", desc: "上下改音高 · 左右改时间" },
  { keys: "拖手柄", desc: "选中后拖右端方块改循环时长；松手后选「按比例缩放」（音符时间位置随比值拉伸）或「重复填充」（原音符保持原长、整段重复铺满新时长），勾「记住」后不再问" },
  { keys: "画圈预览", desc: "画线时终点快到起点（进入闭合判定范围）会实时浮出「终点→起点」虚线圈，提示松手将闭合成琶音；不显示就是普通开口线" },
  { keys: "↑ ↓ ← →", desc: "移动选中对象（音高 / 时间）" },
  { keys: "Enter", desc: "在光标处放置锚点" },
  { keys: "Delete", desc: "删除选中对象" },
  { keys: "Ctrl+D", desc: "复制选中对象" },
  { keys: "Ctrl+Z / Ctrl+Y", desc: "撤销 / 重做：画线、锚点、删除、拖动、清空全能反悔；方向键连按自动合并成一步" },
  { keys: "历史", desc: "HUD「历史」面板：列出画布全部编辑步骤（同类连按合并成一条），当前位置高亮；点任意一步直接跳到那时的画布，重做栈保留、可再前进回未来状态；深度上限 80 步" },
  { keys: "存档", desc: "HUD「存档」面板：当前画布存成命名档（最多 12 个），可载入 / 覆写 / 删除；载入前自动留一步撤销" },
  { keys: "存档复制", desc: "存档面板每档「复制」：把那份存档里的线/锚点勾选（默认整档全选）粘贴为新对象追加进当前画布——位置自动错开、整体一步撤销，原存档分毫不动" },
  { keys: "接龙", desc: "HUD「接龙」chip：像传纸条一样多人写歌，不用同时在线——你画一段（循环固定 4 小节），点「传给下一位」生成链接发给朋友；对方打开就进入接龙态：能听到之前所有人声音的累积，画布上前人的段落是淡影（锁定改不了，只有最后一棒的最后 2 小节提亮给你当参考，锚点点照样能重响），他只能画自己的新段，画完再往下传。面板里能看每一棒是谁画的、点「单听这段」独奏某一段；「清空画布」在接龙态只清你自己这一棒。链接有长度守护，太长会自动从最早的棒截断；作曲模式空着手也能起局。录音 / 循环台照常可用，录下的就是累积加你这一段；整条接力曲还能「发布到画廊」——画廊里带「接力 N 棒」徽标的就是接力曲，点「接力」直接接过棒续写（存进画廊的是全曲，不受传棒链接长度守护影响）" },
  { keys: "BPM", desc: "HUD「BPM」面板：滑杆 / ±2 / 连点「打拍定速」改画布循环速度，MIDI 导出同速；打字鼓组不受影响（仍按手速自动定）" },
  { keys: "MIDI", desc: "HUD「MIDI」菜单：把画好的多层循环导出成 .mid 文件（选 1/2/4 遍，含力度与人性化抖动），可拖进任何音乐软件续编" },
  { keys: "音频", desc: "HUD「音频」菜单：把你听到的一切（循环、鼓、钢琴、垫音、动色音色）实时录成通用 .wav 音频文件——选 1/2/4 遍，录完自动下载到你的设备，任何播放器都能开；画布是空的就按 8 秒现场窗录，随手弹的也留得住" },
  { keys: "混音", desc: "HUD「混音」：分轨混音台——画布上每条线 / 每个锚点一行，独立音量（0–150%）、声像（左↔右）、M 静音、S 独奏（任意轨独奏时其余轨自动闭嘴）；改动即时生效，鼓太吵拉低它就行，不用删线重画；混音设置随画布存在本地" },
  { keys: "封面图", desc: "HUD「封面图」：把画布上的线与锚点渲染成一张 16:9 分享卡 PNG（票根边框 + 音阶参考线 + 你的昵称 + 音阶/音色/BPM 信息行），配着导出的 .wav 一起发正合适" },
  { keys: "1-6", desc: "直达音阶（参考线 = 画布音区 E2–C6 内的全部合法音级）" },
  { keys: "S / T", desc: "循环切换 音阶 / 音色" },
  { keys: "G", desc: "循环切换鼓组风格包（只换打字鼓，不换旋律）" },
  { keys: "K", desc: "钢琴模式下让位琴键，切回鼓组点 HUD「打·鼓 / 打·钢」（钢琴模式下字母键全部弹琴）" },
  { keys: "0", desc: "钢琴玩法时：长按踩延音踏板" },
  { keys: "9", desc: "钢琴玩法时：长按踩弱音器踏板，音色变暗变轻" },
];

const CHALLENGE_KEYS: { keys: string; desc: string }[] = [
  { keys: "Tab", desc: "三态循环：演奏 → 作曲 → 挑战 → 演奏；也可点 HUD「挑战」chip 直达" },
  { keys: "字母", desc: "看下落轨道按对应字母击符——字母 = 背景白键，轨道在哪按哪" },
  { keys: "Shift+字母", desc: "命中带描边的黑键音符（白键右邻黑键），只按白字母算 Miss" },
  { keys: "MIDI 琴键", desc: "HUD「MIDI」连上外接键盘后，下落音符可直接在真琴键上打（音号对上即命中），判定/计分与电脑键盘一致" },
  { keys: "分享演奏", desc: "结算面板「分享演奏」：把本局你亲手命中的音符（含真实手抖时值）编成回放链接，别人打开就能看到并听到你的这次表现" },
  { keys: "空格", desc: "选关页快速开始 / 游玩中暂停与继续（暂停时音符与声音一起冻结）" },
  { keys: "自定义", desc: "关卡卡末尾「自定义乐谱」→ 导入：粘贴一拍一音的文本谱（音名按拍排开，. 休止、+音名 同拍双音，可写 曲名: / BPM: 头行），编辑框下方会实时报「N 音 · 约 M 拍 · 几个越界会被跳过」边写边核对，或点「选 .mid 开玩」/ 把 .mid 文件直接拖进面板（可一次挑多份、拖多份；支持标准 MIDI Format 0/1 + PPQ 分辨率，不支持 SMPTE 时间码）——本地解析你手头的 MIDI 钢琴谱（自动取速度），当场编译成下落关卡直接开玩；谱里有超出琴键的音会先弹预览「移调整体入域 / 删减域外音 / 保留贴边」，你选完才开玩（多份共用这一次选择）；导入撞见谱架已有同名谱会先问一句「覆盖老谱 / 各留一份（自动改名《X·2》）」，不再默默顶掉你的老谱；文本谱可「复制文本谱」一键进剪贴板或「导出 .txt」备份分享，别人发你的 .txt 也能直接拖进面板载入编辑框续写，谱架里每条也能单独复制（♪ 谱复制的是自动生成的文本草稿）；谱架分「♪ MIDI 谱 / 文本谱」两个标签页，各自独立管理、独立清空、各存 8 份，标签行右上「↕」可切排序（最新在前 / 音多在前 / 音少在前，想练短的就把音少在前点上），标签行下方有搜谱名的过滤框（这一页没命中会提示另一边还有几份），标签行还能「⬇ 备份」把整架存成一个「谱架备份.json」（♪ 谱连精确拍轴一起带走），换设备后「⬆ 还原」或直接把备份文件拖进面板就能整架复活，鼠标停在谱上还会浮出大约能弹多久、哪天存的，串烧的「开串」按钮直接预告整串总时长；♪ 谱攒够两份还会出现「▶ 串烧」——进选曲模式后点 ♪ 谱勾选要哪几首（默认全选），勾够两首「开串」就把它们首尾接排成一关连续打完（段间留两拍呼吸、速度按谱长加权），可开「统一调性」让各首自动移调对齐第一首（估不准的不移）；不计解锁与天梯，随时可换谱" },
  { keys: "?", desc: "显示 / 隐藏本面板（挑战中其余快捷键全部让位击符）" },
];

const INTRO_STEPS: { step: string; desc: string }[] = [
  { step: "① 唤醒", desc: "进入页面先点一下屏幕——浏览器要求手势才能出声，黑屏里的圆会炸开成全屏粒子" },
  { step: "② 演奏", desc: "演奏模式下移动鼠标就发声：左右是音高（左低右高），上下是明暗；怎么移动都落在五声音阶里，乱动也好听；打字触发鼓组节奏，点 HUD「打·钢」切成钢琴——26 个字母就是 26 个互不重复的琴键（从低到高排开），HUD「键位」chip 还能切成钢琴键盘式布局（中排 A S D F…= 白键，上排 W E T Y U O P = 直按黑键，不用 Shift）；黑键可以按 Shift，也可以按一下 Caps Lock 或点「黑键」chip 开黑键模式（开着时全部字母直接弹黑键），画面底部的背景琴键会跟着你按；长按 0 踩延音踏板，琴音相互交融，松开统一收束；长按 9 = 弱音器，音色变轻变暗——注意 0/9 只是踏板区，不会当成琴键" },
  { step: "③ 作曲", desc: "按 Tab 或 M 切到作曲模式：按住拖一条线，松手它就变成循环旋律——上高下低，画得快就亮而密，画闭合圈变琶音（快闭合时会有虚线预告）；单击落单音，多画几条叠成编曲；画好的循环是常驻伴奏——切回演奏继续响，可以叠着即兴（挑战模式自动安静，全局想安静用「静音」）" },
  { step: "④ 编辑", desc: "画好的线可以继续改：单击选中后拖着改音高和进入时间，拖右端小方块改循环长短，Delete 删除，Ctrl+D 复制出派生句；刷新页面画布不丢" },
  { step: "⑤ 分享", desc: "按 R 录一段，停止后生成链接——别人打开能看到你的线在自动演奏，他还能接着画、接着即兴；生成链接时可勾选「只读模式」，别人就只能看和听、改不动你的画布，他顶部会出现「复制继续创作」按钮，复制后随意改" },
  { step: "⑥ 挑战", desc: "按 Tab 三转到挑战模式（或点 HUD「挑战」chip)：五关公版名曲——小星星、致爱丽丝、卡农、茉莉花、土耳其进行曲，下落音符块面直接印着要按的字母（⇧ 开头 = 按住 Shift 打黑键，块下小字是音名）；到达贴着键盘上沿的判定线时按下——Perfect / Good / Miss 实时判定计分，结算按准确率给 S / A / B / C 评级；每张已解锁关卡卡都能点「演示」让系统自动完整弹奏本关（不计分；演示中空格暂停/继续，←→ 逐小节跳转，画面底部控制条也能跳小节或「结束演示」回关卡卡），结算面板也能「看演示」重看或「慢速练习本关」上手；「练习 · 慢速逐小节」是真人实操陪练——0.5×/0.75×/1× 三档变速（切换后回到当前小节小节头），弹完一个小节自动暂停等你继续，可开「循环本小节」反复磨同一段、连弹两遍全中会提示「已练顺」去下一小节，练习中下落块音名旁与控制条「本小节指法」行会给出指法建议（1 = 拇指…5 = 小指，R 右手 / L 左手，可用「指法」开关关掉），←→ 跳小节、空格暂停/继续，练习只给实时判定反馈、不计分不写评级；打完一关解锁下一关，最高评级存在本地；列表最前的「生存模式」卡随时可玩不占解锁进度——音符无限下落、每 20 个正确音提速 5%（越弹越快，到上限不再快）、每 50 音触发一段 16 音双倍分数，3 次 Miss 当局结束，按坚持时长给评级（满 60 秒 B、120 秒 A、240 秒 S），最佳时长存本地并可看生存榜；空格暂停照常可用（暂停不计入坚持时长），中途切走标签页当局作废不上成绩；生存卡上还有「每日挑战」——当天所有人弹同一套音符流（由日期定谱、零点自动换新谱，再玩不换序列），单独记今日最佳并进每日榜，作废与暂停规则同普通生存；「热门自定义」区能玩全站玩家发布的关卡——点「从我的画布出关」把画布循环编成下落谱，或到谱架把 MIDI / 文本谱「发布」成关卡，发布前自动给 ★1–5 难度评级（星级越高判定窗越紧、下落略快），分享链接（?lid=）朋友点开自动进挑战直接开打，自定义关只计游玩数不上天梯" },
];

// ---- 数据备份：本地存储里全部应用数据（so-* 前缀：谱架/闯关进度/听感/指挥记录…）一键成 JSON ----
function exportAllData(): { body: string; count: number } {
  const data: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith("so-")) continue;
    const v = window.localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  return {
    body: JSON.stringify({ schema: 1, app: "rolling-orchestra", data }, null, 2),
    count: Object.keys(data).length,
  };
}

// 导入：只认字符串值 + so- 前缀，坏条目跳过；导完要刷新才各家读到新值
function importAllData(body: string): string {
  try {
    const d = JSON.parse(body) as { data?: unknown };
    if (!d || !d.data || typeof d.data !== "object") return "这文件不像应用数据备份";
    let n = 0;
    for (const [k, v] of Object.entries(d.data as Record<string, unknown>)) {
      if (!k.startsWith("so-") || typeof v !== "string") continue;
      try {
        window.localStorage.setItem(k, v);
        n += 1;
      } catch {
        /* 单条写不进（超大）跳过 */
      }
    }
    return n > 0 ? `已导入 ${n} 条数据——刷新页面后全面生效` : "备份里没有可导入的数据";
  } catch {
    return "这份备份读不开";
  }
}

// ---- 快捷键体检：试按检测，报这键站内有没有用、会不会撞浏览器/系统保留 ----
const APP_KEYS: Record<string, string> = {
  " ": "播放/暂停循环",
  Tab: "演奏/作曲/挑战切换",
  M: "演奏/作曲切换",
  R: "录音开始/停止",
  L: "循环录音台",
  S: "音阶循环",
  T: "音色循环",
  G: "鼓组循环",
  K: "钢琴模式让位琴键",
  A: "乐句宏",
  "0": "延音踏板",
  "9": "弱音踏板",
  "?": "本帮助面板",
  Delete: "删除选中对象",
  Enter: "放置锚点",
  CapsLock: "黑键模式",
  ArrowUp: "移动选中对象",
  ArrowDown: "移动选中对象",
  ArrowLeft: "移动选中对象",
  ArrowRight: "移动选中对象",
};
const APP_COMBOS: Record<string, string> = {
  "Ctrl+D": "复制选中（浏览器可能同时加书签，留意）",
  "Ctrl+Z": "撤销",
  "Ctrl+Y": "重做",
};

function probeKey(e: KeyboardEvent): string {
  const mods = `${e.ctrlKey ? "Ctrl+" : ""}${e.metaKey ? "⌘/Win+" : ""}${e.altKey ? "Alt+" : ""}${
    e.shiftKey && e.key !== "?" ? "Shift+" : ""
  }`;
  const name = e.key === " " ? "空格" : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  const combo = `${mods}${name}`;
  if (APP_COMBOS[combo]) return `「${combo}」站内在用：${APP_COMBOS[combo]}`;
  if (APP_KEYS[name]) return `「${combo}」站内在用：${APP_KEYS[name]}`;
  if (e.ctrlKey || e.metaKey || e.altKey)
    return `「${combo}」⚠️ 与 Ctrl/⌘/Alt 组合——大多被浏览器或系统保留（新开页、关闭页、搜索等）`;
  if (/^F\d{1,2}$/.test(name)) return `「${name}」⚠️ 功能键大多被浏览器/系统占用（刷新、搜索、开发者工具）`;
  return `「${combo}」站内暂未占用，可放心使用`;
}

export function HelpPanel(p: ReturnType<typeof useHome>) {
  const rootRef = usePanelEntrance<HTMLDivElement>();
  const [dataMsg, setDataMsg] = useState("");
  const [probe, setProbe] = useState(false);
  const [probeMsg, setProbeMsg] = useState("");
  const backupFileRef = useRef<HTMLInputElement>(null);

  // 试按检测开启中：捕获阶段截住按键，只描述不外泄给站内快捷键
  useEffect(() => {
    if (!probe) return;
    const on = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setProbeMsg(probeKey(e));
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [probe]);

  const exportAll = () => {
    try {
      const { body, count } = exportAllData();
      if (count === 0) {
        setDataMsg("还没有可备份的数据");
        return;
      }
      const blob = new Blob([body], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "乐团数据备份.json";
      a.click();
      URL.revokeObjectURL(a.href);
      setDataMsg(`已备份 ${count} 条数据（谱架/闯关进度/听感/指挥记录…）`);
    } catch {
      setDataMsg("导出失败——浏览器拦下了文件");
    }
  };
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={p.onCloseHelp}
    >
      <div
        data-panel-card
        className="max-h-[85vh] w-full max-w-md overflow-y-auto border border-border bg-card p-6 text-card-foreground shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mono text-2xl font-bold">使用说明</h2>

        <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground">怎么玩</p>
        <div className="mt-2 grid grid-cols-1 gap-2.5">
          {INTRO_STEPS.map((s) => (
            <div key={s.step} className="border-l border-border pl-3">
              <div className="font-mono text-xs text-primary">{s.step}</div>
              <div className="mt-0.5 font-mono text-xs leading-relaxed text-muted-foreground">
                {s.desc}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 font-mono text-xs tracking-widest text-muted-foreground">
          快捷键 · 演奏模式
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
          {PERFORM_KEYS.map((s) => (
            <div key={s.keys} className="flex items-center gap-2">
              <span className="shrink-0 border border-border px-1.5 py-0.5 text-card-foreground">
                {s.keys}
              </span>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground">
          快捷键 · 作曲模式
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
          {COMPOSE_KEYS.map((s) => (
            <div key={s.keys} className="flex items-center gap-2">
              <span className="shrink-0 border border-border px-1.5 py-0.5 text-card-foreground">
                {s.keys}
              </span>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground">
          快捷键 · 挑战模式
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
          {CHALLENGE_KEYS.map((s) => (
            <div key={s.keys} className="flex items-center gap-2">
              <span className="shrink-0 border border-border px-1.5 py-0.5 text-card-foreground">
                {s.keys}
              </span>
              <span className="text-muted-foreground">{s.desc}</span>
            </div>
          ))}
        </div>

        <p className="mt-5 font-mono text-xs tracking-widest text-muted-foreground">数据备份与迁移</p>
        <div className="mt-2 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportAll}
              className="border border-border px-2 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              ⬇ 导出全部数据
            </button>
            <button
              type="button"
              onClick={() => backupFileRef.current?.click()}
              className="border border-border px-2 py-1 text-muted-foreground hover:border-primary/60 hover:text-primary focus-visible:shadow-[var(--focus-ring)]"
            >
              ⬆ 导入备份
            </button>
            <input
              ref={backupFileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="选择数据备份文件"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void f.text().then((t) => setDataMsg(importAllData(t)));
              }}
            />
          </div>
          {dataMsg && <p className="mt-1.5 text-primary">{dataMsg}</p>}
          <p className="mt-1.5 leading-relaxed text-muted-foreground">
            乐谱谱架、闯关进度、听感设置、指挥聊天记录……全部存在这台设备的浏览器里。清浏览器数据或换设备前，导出一份 JSON 带走，回来导入即原样复活（导入后刷新页面生效）。
          </p>
        </div>

        <p className="mt-5 font-mono text-xs tracking-widest text-muted-foreground">快捷键体检</p>
        <div className="mt-2 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setProbe((v) => !v);
                setProbeMsg("");
              }}
              aria-pressed={probe}
              className={`border px-2 py-1 focus-visible:shadow-[var(--focus-ring)] ${
                probe
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
              }`}
            >
              {probe ? "检测中…按任意键（再点结束）" : "▶ 试按检测"}
            </button>
          </div>
          {probeMsg && <p className="mt-1.5 text-primary">{probeMsg}</p>}
          <p className="mt-1.5 leading-relaxed text-muted-foreground">
            想知道某个键会不会和浏览器/系统快捷键打架？开检测按一下就报。常见雷区：Ctrl+D 会连带加书签、Ctrl+T/W
            是浏览器新页与关页、F5/F12 系统保留。自定义键位暂未开放——先了解冲突，避免误触。
          </p>
        </div>

        <button
          type="button"
          onClick={p.onCloseHelp}
          className="mt-6 border border-primary px-3 py-1.5 font-mono text-xs text-primary hover:bg-primary/10 focus-visible:shadow-[var(--focus-ring)]"
        >
          关闭（再按 ?）
        </button>
      </div>
    </div>
  );
}
