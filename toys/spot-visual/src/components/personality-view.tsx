"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Heart, Share2, RotateCcw, Star, MapPin } from "lucide-react";
import { useAppStore } from "@/lib/store";

/* ═══ 分类 → 人格维度映射 ═══ */
const CATEGORY_PERSONALITY: Record<
  string,
  { trait: string; emoji: string; color: string }
> = {
  自然风光: { trait: "自然", emoji: "🌲", color: "#10B981" },
  自然风景: { trait: "自然", emoji: "🌲", color: "#10B981" },
  历史人文: { trait: "人文", emoji: "📜", color: "#D97706" },
  历史文化: { trait: "人文", emoji: "📜", color: "#D97706" },
  主题乐园: { trait: "冒险", emoji: "🎡", color: "#EC4899" },
  城市地标: { trait: "都市", emoji: "🏙️", color: "#6366F1" },
  海滨度假: { trait: "海洋", emoji: "🌊", color: "#0EA5E9" },
  山岳景区: { trait: "探险", emoji: "⛰️", color: "#84CC16" },
  古镇村落: { trait: "田园", emoji: "🏘️", color: "#F97316" },
  宗教寺庙: { trait: "禅意", emoji: "⛩️", color: "#8B5CF6" },
  美食小吃: { trait: "美食", emoji: "🍜", color: "#EF4444" },
  轻运动: { trait: "活力", emoji: "🚴", color: "#14B8A6" },
};

/* ═══ trait → 分类反查表（真实推荐用） ═══ */
const TRAIT_CATEGORIES: Record<string, string[]> = {};
for (const [cat, { trait }] of Object.entries(CATEGORY_PERSONALITY)) {
  (TRAIT_CATEGORIES[trait] ??= []).push(cat);
}

/* ═══ 人格组合名称（Top2 trait → 趣味称号） ═══ */
const PERSONA_NAMES: Record<
  string,
  { title: string; desc: string; advice: string }
> = {
  "自然+人文": {
    title: "森林考古学家",
    desc: "你在千年古树下解读石碑铭文，在溪流边还原历史的拼图。你相信每一片落叶都藏着故事。",
    advice: "推荐目的地：武夷山、庐山、泰山",
  },
  "自然+冒险": {
    title: "丛林特攻队",
    desc: "别人逛景区，你闯秘境。悬崖上的玻璃栈道是你的日常，瀑布后的洞穴才是你的目的地。",
    advice: "推荐目的地：张家界、恩施大峡谷、虎跳峡",
  },
  "自然+海洋": {
    title: "海岛隐士",
    desc: "椰林、海风、日落——你追求的不是打卡，而是与自然独处的静谧时光。手机没信号反而让你安心。",
    advice: "推荐目的地：涠洲岛、蜈支洲岛、南麂列岛",
  },
  "自然+探险": {
    title: "山顶的守望者",
    desc: "你的旅途永远在向上。别人看云，你站在云上面。最高峰从来不是终点，只是下一站的起点。",
    advice: "推荐目的地：华山、贡嘎山、四姑娘山",
  },
  "人文+田园": {
    title: "时光漫步者",
    desc: "你用脚步丈量岁月的厚度。青石板路上的每一道车辙，都是你与古人无声的对话。",
    advice: "推荐目的地：丽江古城、平遥古城、西塘",
  },
  "人文+禅意": {
    title: "菩提下的旅人",
    desc: "你在香火中寻找内心的宁静，在古刹钟声里听见自己的心跳。旅行对你而言，是一场修行。",
    advice: "推荐目的地：少林寺、普陀山、法门寺",
  },
  "冒险+活力": {
    title: "肾上腺素猎人",
    desc: "过山车？那是热身。你的人生信条是：活着就是为了体验失重的感觉。",
    advice: "推荐目的地：欢乐谷、长隆、方特",
  },
  "都市+美食": {
    title: "街头美食家",
    desc: "你的旅行攻略就是一张美食地图。什么景点不景点的，好吃才是第一生产力。",
    advice: "推荐目的地：成都、广州、长沙",
  },
  "海洋+活力": {
    title: "浪尖舞者",
    desc: "冲浪、帆船、潜水——海是你的游乐场。别人怕浪，你追浪。",
    advice: "推荐目的地：三亚、厦门、青岛",
  },
  "田园+美食": {
    title: "田园老饕",
    desc: '你最懂"从田间到餐桌"的距离。别人的旅行带纪念品，你的旅行带一整箱土特产。',
    advice: "推荐目的地：婺源、阳朔、宏村",
  },
  "都市+冒险": {
    title: "城市冒险家",
    desc: "摩天大楼是你攀岩墙，城市天际线是你的跑酷赛道。你眼中的城市，是一个巨大的游乐场。",
    advice: "推荐目的地：上海迪士尼、珠海长隆、北京环球影城",
  },
  "自然+都市": {
    title: "天际线下的森林",
    desc: "白天逛公园，晚上数霓虹。你既要绿意也要繁华，中央公园式城市是你的本命。",
    advice: "推荐目的地：武汉东湖、深圳湾公园、贵阳观山湖",
  },
  "自然+田园": {
    title: "山水田居图",
    desc: "采菊东篱下，悠然见南山——你连旅行都要带点烟火气和稻香。",
    advice: "推荐目的地：婺源、龙脊梯田、普者黑",
  },
  "自然+禅意": {
    title: "山寺隐者",
    desc: "你爬的不是山，是心境。钟声与鸟鸣同时入耳，你两个都要。",
    advice: "推荐目的地：峨眉山、九华山、天台山",
  },
  "自然+美食": {
    title: "赏味山水客",
    desc: "看完雪山吃烤全羊，逛完竹海喝竹筒饭——你的行程表一半是风景一半是干饭。",
    advice: "推荐目的地：阳朔、恩施、延吉",
  },
  "自然+活力": {
    title: "风一样的背包客",
    desc: "徒步、溯溪、露营、桨板——你的行李箱里没有一件闲衣服。",
    advice: "推荐目的地：武功山、漓江、喀拉峻",
  },
  "人文+冒险": {
    title: "遗迹探秘者",
    desc: "别人看文物隔着玻璃，你偏要上城墙、钻石窟、走古道。",
    advice: "推荐目的地：敦煌、交河故城、剑门关",
  },
  "人文+都市": {
    title: "博物馆城市游民",
    desc: "你的 citywalk 路线是：上午看展，下午逛民国老街，晚上听爵士。",
    advice: "推荐目的地：上海、天津、南京",
  },
  "人文+海洋": {
    title: "海上丝路迷",
    desc: "泉州的簪花、青岛的老教堂、鼓浪屿的老别墅——你要的是有故事的海风。",
    advice: "推荐目的地：泉州、青岛、鼓浪屿",
  },
  "人文+美食": {
    title: "舌尖上的史学家",
    desc: "一条老街你先查它的建城史，再查它的小吃排行榜。",
    advice: "推荐目的地：西安、扬州、潮州",
  },
  "人文+活力": {
    title: "行走的百科全书",
    desc: "导游讲到一半发现你比他熟，讲解器在你手里就是个摆设。",
    advice: "推荐目的地：北京中轴线、洛阳、开封",
  },
  "冒险+海洋": {
    title: "追浪探险家",
    desc: "浮潜、冲浪、海钓、跳岛——平静的海面可满足不了你。",
    advice: "推荐目的地：万宁、涠洲岛、平潭",
  },
  "冒险+田园": {
    title: "乡野探险队",
    desc: "你连逛个古镇都要找野路，稻田里能玩出拓展基地的效果。",
    advice: "推荐目的地：阳朔十里画廊、莫干山、清远",
  },
  "冒险+禅意": {
    title: "红尘修行者",
    desc: "上山礼佛，下山漂流——你信的是动静皆宜。",
    advice: "推荐目的地：青城山、齐云山、武当山",
  },
  "冒险+美食": {
    title: "辣度挑战者",
    desc: "辣椒浓度和过山车高度是你的两大 KPI。",
    advice: "推荐目的地：重庆、贵阳、乐山",
  },
  "都市+海洋": {
    title: "滨海都会控",
    desc: "你选城市先看海不看 GDP，维多利亚港和上海外滩都是你的菜。",
    advice: "推荐目的地：厦门、大连、香港",
  },
  "都市+田园": {
    title: "城郊漫游者",
    desc: "你的理想生活：工作日在 CBD，周末在民宿——连旅行都是这个节奏。",
    advice: "推荐目的地：成都、杭州、昆明",
  },
  "都市+禅意": {
    title: "城市放空师",
    desc: "你在写字楼里敲键盘，在寺庙里数香客，动静之间切换自如。",
    advice: "推荐目的地：杭州、南京、西安",
  },
  "都市+活力": {
    title: "城市夜行者",
    desc: "别人的旅行九点回酒店，你的旅行九点刚开始——夜市、livehouse、江边夜跑。",
    advice: "推荐目的地：长沙、重庆、广州",
  },
  "海洋+田园": {
    title: "渔村慢游客",
    desc: "你要的海边不是人挤人的浴场，是能看日落的安静渔村。",
    advice: "推荐目的地：霞浦、东极岛、涠洲岛",
  },
  "海洋+禅意": {
    title: "观海听涛者",
    desc: "面朝大海不一定要春暖花开，发呆两小时就是你的正式行程。",
    advice: "推荐目的地：南澳岛、枸杞岛、北海",
  },
  "海洋+美食": {
    title: "海鲜原教旨主义者",
    desc: "你的海边旅行只有一个主题：刚上岸的海鲜去哪家吃。",
    advice: "推荐目的地：湛江、舟山、烟台",
  },
  "人文+探险": {
    title: "古道攀登者",
    desc: "你专挑有故事的雪山与古道——茶马古道、徽杭古道都想走一遍。",
    advice: "推荐目的地：四姑娘山、哈巴雪山、梅里雪山",
  },
  "冒险+探险": {
    title: "极限双修",
    desc: "过山车只是热身，真正的肾上腺素要往山里找。",
    advice: "推荐目的地：玉龙雪山、稻城亚丁、贡嘎",
  },
  "探险+都市": {
    title: "高空景观控",
    desc: "每到一个城市先爬最高的山——既能看全景又算了登山，一举两得。",
    advice: "推荐目的地：重庆南山、广州白云山、杭州北高峰",
  },
  "探险+海洋": {
    title: "海岸线徒步者",
    desc: "你的理想路线：一边是悬崖，一边是大海。",
    advice: "推荐目的地：香港麦理浩径、威海成山头、大连滨海路",
  },
  "探险+田园": {
    title: "高山梯田党",
    desc: "别人拍梯田用无人机，你直接爬到田埂上。",
    advice: "推荐目的地：龙脊梯田、元阳梯田、加榜梯田",
  },
  "探险+禅意": {
    title: "雪山朝圣者",
    desc: "转山是你的旅行方式，海拔五千米也要带着虔诚。",
    advice: "推荐目的地：梅里雪山、冈仁波齐、鸡足山",
  },
  "探险+美食": {
    title: "登高下馆子",
    desc: "上午登顶看云海，下山必须涮一顿火锅犒劳自己。",
    advice: "推荐目的地：泰安、乐山、都江堰",
  },
  "探险+活力": {
    title: "高原体能怪",
    desc: "别人有高原反应，你有高原兴奋。",
    advice: "推荐目的地：香格里拉、稻城、川西",
  },
  "田园+禅意": {
    title: "桃源隐士",
    desc: "你的旅行不打卡，找个古村住三天，听雨、喝茶、看云。",
    advice: "推荐目的地：宏村、沙溪、查济",
  },
  "田园+活力": {
    title: "乡野骑行派",
    desc: "你逛田园的方式是骑行——稻香里蹬车的快乐，城里人不懂。",
    advice: "推荐目的地：千岛湖、阳朔、大理",
  },
  "禅意+美食": {
    title: "素斋品味家",
    desc: "你能在一碗素面里吃出仪式感，寺庙的斋饭是你的隐藏菜单。",
    advice: "推荐目的地：杭州灵隐寺、厦门南普陀、扬州大明寺",
  },
  "禅意+活力": {
    title: "晨钟暮鼓晨跑者",
    desc: "你在寺庙里最早起——为了听早课，也为了绕寺晨跑。",
    advice: "推荐目的地：五台山、普陀山、武当山",
  },
  "美食+活力": {
    title: "干饭特快专列",
    desc: "你的旅行节奏：一天五顿，中间穿插两万步消食。",
    advice: "推荐目的地：顺德、自贡、徐州",
  },
};

/* ═══ 单 trait 称号（只有一个分类时） ═══ */
const SOLO_PERSONA: Record<
  string,
  { title: string; desc: string; advice: string }
> = {
  自然: {
    title: "自然之子",
    desc: "山川湖海是你的故乡，花草树木是你的朋友。你不需要导航，风会指引方向。",
    advice: "九寨沟、稻城亚丁、喀纳斯在等你",
  },
  人文: {
    title: "时空旅人",
    desc: "你走过的不是路，是历史。每块砖瓦都在对你诉说千年的故事。",
    advice: "故宫、兵马俑、莫高窟值得反复品味",
  },
  冒险: {
    title: "快乐追风者",
    desc: '你的字典里没有"无聊"二字。旋转、跳跃、起飞——你永远活在快乐的巅峰。',
    advice: "所有主题乐园都是你的主场",
  },
  都市: {
    title: "天际线收藏家",
    desc: "你迷恋城市的天际线，每座高楼都是一枚勋章。你的旅行相册，是一部城市高度编年史。",
    advice: "上海、深圳、香港的天际线不容错过",
  },
  海洋: {
    title: "蔚蓝信徒",
    desc: "你相信所有烦恼都能被海浪带走。沙子、盐味、潮汐——这些是你最好的处方。",
    advice: "从北海到三亚，沿海公路任你驰骋",
  },
  探险: {
    title: "山巅行者",
    desc: "你与山的对话，用脚步书写。海拔每升高100米，你的灵魂就轻盈一分。",
    advice: "黄山、峨眉山、玉龙雪山在召唤",
  },
  田园: {
    title: "归园田居",
    desc: "你理想中的旅行没有行程表。醒来，推开窗，看到的是稻田和远山——这就够了。",
    advice: "婺源、乌镇、凤凰古城是你的精神故乡",
  },
  禅意: {
    title: "云水禅心",
    desc: "你在旅行中放空，在放空中遇见自己。最远的旅途，是通往内心的路。",
    advice: "普陀山、五台山、拉卜楞寺值得一去",
  },
  美食: {
    title: "味蕾探险家",
    desc: "你用舌头丈量世界。每座城市的灵魂，都藏在它最不起眼的小巷子里。",
    advice: "成都、西安、长沙、顺德是必选项",
  },
  活力: {
    title: "永动机旅人",
    desc: "你的体力是个谜。别人累瘫了你在骑车，别人回酒店你在夜跑。你是不是偷偷充电了？",
    advice: "环青海湖骑行、漓江漂流随你选",
  },
};

/* ═══ 人格卡配色方案 ═══ */
const CARD_THEMES = [
  {
    bg: "from-emerald-400 via-teal-500 to-cyan-500",
    text: "text-white",
    badge: "bg-white/20",
  },
  {
    bg: "from-violet-500 via-purple-500 to-fuchsia-500",
    text: "text-white",
    badge: "bg-white/20",
  },
  {
    bg: "from-amber-400 via-orange-500 to-red-500",
    text: "text-white",
    badge: "bg-white/20",
  },
  {
    bg: "from-blue-400 via-indigo-500 to-purple-500",
    text: "text-white",
    badge: "bg-white/20",
  },
  {
    bg: "from-rose-400 via-pink-500 to-red-500",
    text: "text-white",
    badge: "bg-white/20",
  },
  {
    bg: "from-cyan-400 via-blue-500 to-indigo-500",
    text: "text-white",
    badge: "bg-white/20",
  },
];

/* ═══════════════════════════════════════════════════
   塔罗牌翻牌动画组件
   ═══════════════════════════════════════════════════ */
function TarotCard({
  trait,
  emoji,
  percent,
  index,
  total,
  onClick,
  revealed,
}: {
  trait: string;
  emoji: string;
  percent: number;
  index: number;
  total: number;
  onClick: () => void;
  revealed: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center"
      style={{ animationDelay: `${index * 0.15}s` }}
    >
      <motion.div
        className="w-28 h-40 cursor-pointer"
        style={{ perspective: 800 }}
        onClick={onClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
      >
        <motion.div
          className="relative w-full h-full"
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{
            duration: 0.7,
            delay: index * 0.15,
            ease: [0.4, 0, 0.2, 1],
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* 正面（背面）- 神秘花纹 */}
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center border-2 border-amber-300/50"
            style={{
              backfaceVisibility: "hidden",
              background: "linear-gradient(135deg, #1E293B, #334155)",
            }}
          >
            <div className="text-4xl mb-2">✨</div>
            <div className="text-amber-300/60 text-[10px] font-bold tracking-widest">
              PERSONA
            </div>
            <div className="mt-2 w-12 h-px bg-amber-300/30" />
            <div className="text-amber-300/40 text-[9px] mt-1">点击揭示</div>
          </div>
          {/* 背面（正面）- 人格维度 */}
          <div
            className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center border-2 border-white/30 shadow-xl"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: "linear-gradient(135deg, #F0FDF4, #ECFDF5)",
            }}
          >
            <motion.span
              className="text-5xl mb-2"
              animate={
                revealed ? { scale: [0, 1.3, 1], rotate: [0, 10, -10, 0] } : {}
              }
              transition={{ duration: 0.5, delay: index * 0.15 + 0.5 }}
            >
              {emoji}
            </motion.span>
            <div className="text-sm font-black text-gray-800">{trait}系</div>
            <motion.div
              className="text-3xl font-black mt-1"
              style={{
                color:
                  CATEGORY_PERSONALITY[
                    Object.keys(CATEGORY_PERSONALITY).find(
                      (k) => CATEGORY_PERSONALITY[k].trait === trait,
                    ) || ""
                  ]?.color || "#10B981",
              }}
              initial={{ opacity: 0 }}
              animate={revealed ? { opacity: 1 } : {}}
              transition={{ delay: index * 0.15 + 0.7 }}
            >
              {percent}%
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   人格结果卡（可分享）
   ═══════════════════════════════════════════════════ */
function PersonalityCard({
  title,
  desc,
  advice,
  traits,
  themeIdx,
  favCount,
  recs,
  contrast,
}: {
  title: string;
  desc: string;
  advice: string;
  traits: { trait: string; emoji: string; percent: number }[];
  themeIdx: number;
  favCount: number;
  recs: { id: string; name: string; level?: string }[];
  contrast: { hits: number; topTrait: string; latestName: string } | null;
}) {
  const theme = CARD_THEMES[themeIdx % CARD_THEMES.length];
  const [showShare, setShowShare] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `我是「${title}」`,
          text: `我在「景点览胜」测出旅人人格是「${title}」！${advice}`,
        });
        return;
      } catch {
        /* 用户取消 */
      }
    }
    // 降级：复制文字
    const text = `🏔️ 景点览胜 · 旅人人格测试\n\n我是「${title}」\n${desc}\n\n${advice}\n\n${traits.map((t) => `${t.emoji} ${t.trait}系 ${t.percent}%`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setShowShare(true);
      setTimeout(() => setShowShare(false), 2000);
    } catch {
      /* 静默 */
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", damping: 20, stiffness: 200 }}
      className="max-w-sm mx-auto"
    >
      {/* 卡片主体 */}
      <div
        className={`bg-gradient-to-br ${theme.bg} rounded-3xl p-6 shadow-2xl text-white relative overflow-hidden`}
      >
        {/* 装饰圆 */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative z-10">
          {/* 顶部标签 */}
          <div className="flex items-center justify-between mb-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${theme.badge}`}
            >
              旅人人格测试
            </span>
            <span className="text-white/60 text-xs">
              基于 {favCount} 个收藏
            </span>
          </div>

          {/* 人格称号 */}
          <motion.h2
            className="text-2xl font-black mb-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            「{title}」
          </motion.h2>

          {/* 描述 */}
          <motion.p
            className="text-sm leading-relaxed text-white/90 mb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {desc}
          </motion.p>

          {/* 维度条 */}
          <div className="space-y-2.5 mb-5">
            {traits.map((t, i) => (
              <motion.div
                key={t.trait}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>
                    {t.emoji} {t.trait}系
                  </span>
                  <span className="font-bold">{t.percent}%</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white/80 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${t.percent}%` }}
                    transition={{
                      duration: 0.8,
                      delay: 0.7 + i * 0.1,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </motion.div>
            ))}
          </div>

          {/* 真实推荐：统一库按 trait 挑选，点击直达详情 */}
          <motion.div
            className={`rounded-xl ${theme.badge} p-3 mb-5`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <div className="text-xs font-bold text-white/80 mb-1.5">
              📍 下一站推荐 · 来自景点库的真实收录
            </div>
            {recs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recs.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      const spot = useAppStore
                        .getState()
                        .spots.find((x) => x.id === s.id);
                      if (spot) {
                        useAppStore.getState().setSelectedSpot(spot);
                        useAppStore.getState().setActiveView("spots");
                      }
                    }}
                    className="text-left text-xs font-medium bg-white/15 hover:bg-white/30 active:scale-95 rounded-full px-2.5 py-1 transition-colors"
                  >
                    {s.name}
                    {s.level ? (
                      <span className="text-white/60 ml-1">{s.level}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm font-medium">{advice}</div>
            )}
          </motion.div>

          {/* 反差维度：收藏口味 vs 翻车日记 */}
          {contrast && (
            <motion.div
              className="rounded-xl bg-black/20 p-3 mb-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
            >
              <div className="text-xs font-bold text-white/80 mb-0.5">
                😏 口嫌体正直预警
              </div>
              <div className="text-xs text-white/70 leading-relaxed">
                你偏爱「{contrast.topTrait}」系，但翻车日记里有 {contrast.hits}{" "}
                条也是{contrast.topTrait}
                类景点（最近一条：{contrast.latestName}）——是真爱没错了。
              </div>
            </motion.div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleShare}
              className="flex-1 py-2.5 bg-white/20 hover:bg-white/30 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" /> 分享人格卡
            </motion.button>
          </div>

          {/* 复制成功提示 */}
          <AnimatePresence>
            {showShare && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute inset-0 bg-black/40 rounded-3xl flex items-center justify-center"
              >
                <div className="bg-white text-gray-900 px-6 py-3 rounded-2xl font-bold text-sm shadow-xl">
                  ✅ 已复制到剪贴板
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   旅人人格测试主页面
   ═══════════════════════════════════════════════════ */
export default function PersonalityView() {
  const { spots, favorites, trip, dissuasionRecords, lastPersona } =
    useAppStore();
  const [phase, setPhase] = useState<"intro" | "cards" | "result">("intro");
  const [revealedCount, setRevealedCount] = useState(0);
  const [cardThemeIdx] = useState(() =>
    Math.floor(Math.random() * CARD_THEMES.length),
  );

  // 计算收藏景点的分类分布
  const analysis = useMemo(() => {
    // 分析输入 = 收藏 ∪ 行程（有行程没收藏的用户也能测）
    const pool = new Set([...favorites, ...trip]);
    const favSpots = spots.filter((s) => pool.has(s.id));
    if (favSpots.length === 0) return null;

    // 按 trait 汇总
    const traitMap = new Map<
      string,
      { count: number; emoji: string; color: string }
    >();
    favSpots.forEach((s) => {
      const mapping = CATEGORY_PERSONALITY[s.category];
      if (mapping) {
        const existing = traitMap.get(mapping.trait);
        if (existing) {
          existing.count++;
        } else {
          traitMap.set(mapping.trait, {
            count: 1,
            emoji: mapping.emoji,
            color: mapping.color,
          });
        }
      }
    });

    // 排序取 Top N
    const sorted = Array.from(traitMap.entries())
      .map(([trait, data]) => ({
        trait,
        ...data,
        percent: Math.round((data.count / favSpots.length) * 100),
      }))
      .sort((a, b) => b.percent - a.percent);

    // 取前三
    const top = sorted.slice(0, 3);

    // 确定人格称号
    let persona: { title: string; desc: string; advice: string };
    if (top.length >= 2) {
      const key1 = `${top[0].trait}+${top[1].trait}`;
      const key2 = `${top[1].trait}+${top[0].trait}`;
      persona = PERSONA_NAMES[key1] ||
        PERSONA_NAMES[key2] ||
        SOLO_PERSONA[top[0].trait] || {
          title: "全能旅人",
          desc: "你的旅行品味非常多元，既爱山川湖海，也爱市井烟火。世界那么大，你全都要！",
          advice: "打开地图随便指一个地方，出发就对了",
        };
    } else {
      persona = SOLO_PERSONA[top[0]?.trait || "自然"] || SOLO_PERSONA["自然"]!;
    }

    return {
      top,
      persona,
      favCount: favSpots.length,
      totalTraits: sorted.length,
    };
  }, [spots, favorites]);

  // ═══ 真实推荐：从统一库按主导 trait 挑未收藏的真实景点（5A 优先 → 评分） ═══
  const recs = useMemo(() => {
    if (!analysis) return [];
    const pool = new Set([...favorites, ...trip]);
    const picked: typeof spots = [];
    for (const t of analysis.top) {
      const cats = TRAIT_CATEGORIES[t.trait];
      if (!cats) continue;
      const candidates = spots
        .filter((s) => cats.includes(s.category) && !pool.has(s.id))
        .sort((a, b) => {
          const lv = (x: typeof a) =>
            x.level === "5A" ? 0 : x.level === "4A" ? 1 : 2;
          return lv(a) - lv(b) || (b.rating ?? 0) - (a.rating ?? 0);
        });
      // 每个 trait 取 2 条，轮换填充避免只出第一批
      picked.push(...candidates.slice(0, 2));
    }
    return picked.slice(0, 6);
  }, [analysis, spots, favorites, trip]);

  // ═══ 反差维度：翻车日记与主导 trait 的交叉 ═══
  const contrast = useMemo(() => {
    if (!analysis || dissuasionRecords.length === 0) return null;
    const topTrait = analysis.top[0]?.trait;
    if (!topTrait) return null;
    const traitCats = TRAIT_CATEGORIES[topTrait] ?? [];
    const catByName = new Map(spots.map((s) => [s.name, s.category]));
    let hits = 0;
    let latestName = "";
    for (const r of dissuasionRecords) {
      if (traitCats.includes(catByName.get(r.spotName) ?? "")) {
        hits++;
        if (!latestName) latestName = r.spotName;
      }
    }
    if (hits < 2) return null;
    return { hits, topTrait, latestName };
  }, [analysis, dissuasionRecords, spots]);

  const startTest = useCallback(() => {
    setPhase("cards");
    setRevealedCount(0);
  }, []);

  const revealNext = useCallback(() => {
    if (!analysis) return;
    if (revealedCount < analysis.top.length) {
      setRevealedCount((prev) => prev + 1);
    }
    // 全部翻完自动跳结果
    if (revealedCount + 1 >= analysis.top.length) {
      setTimeout(() => setPhase("result"), 1200);
    }
  }, [analysis, revealedCount]);

  const reset = useCallback(() => {
    setPhase("intro");
    setRevealedCount(0);
  }, []);

  // 进入结果页时落盘本次人格（持久化），供下次「上次测试」对比
  useEffect(() => {
    if (phase === "result" && analysis) {
      const prev = useAppStore.getState().lastPersona;
      if (prev?.title !== analysis.persona.title) {
        useAppStore.getState().setLastPersona({
          title: analysis.persona.title,
          date: new Date().toLocaleDateString("zh-CN"),
        });
      }
    }
  }, [phase, analysis]);

  // ═══ 空状态 ═══
  if (favorites.length === 0 && trip.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mb-6"
        >
          <Heart className="w-10 h-10 text-amber-400" />
        </motion.div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">还没有收藏景点</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          去「景点览胜」中收藏你心仪的景点，
          <br />
          再来测试你的旅人人格吧！
        </p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => useAppStore.getState().setActiveView("spots")}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
        >
          <MapPin className="w-4 h-4" /> 去收藏景点
        </motion.button>
      </div>
    );
  }

  // ═══ 开始页 ═══
  if (phase === "intro") {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12 }}
          className="w-28 h-28 rounded-3xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center shadow-2xl mb-8"
        >
          <Sparkles className="w-14 h-14 text-white" />
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-black text-gray-900 mb-3"
        >
          你是什么型的旅人？
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-sm text-gray-500 text-center mb-2 max-w-xs"
        >
          基于你收藏与行程的{" "}
          <span className="font-bold text-gray-700">{analysis!.favCount}</span>{" "}
          个景点
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-gray-500 text-center mb-8 max-w-xs"
        >
          解锁你的专属旅人人格卡
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          whileTap={{ scale: 0.95 }}
          onClick={startTest}
          className="px-10 py-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-2xl font-bold text-base shadow-lg shadow-violet-200"
        >
          开始测试 →
        </motion.button>
      </div>
    );
  }

  // ═══ 翻牌阶段 ═══
  if (phase === "cards" && analysis) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-6 py-8">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-gray-500 mb-8"
        >
          点击卡牌揭示你的旅人基因 ({revealedCount}/{analysis.top.length})
        </motion.p>
        <div className="flex gap-5 mb-8">
          {analysis.top.map((t, i) => (
            <TarotCard
              key={t.trait}
              trait={t.trait}
              emoji={t.emoji}
              percent={t.percent}
              index={i}
              total={analysis.top.length}
              onClick={revealNext}
              revealed={i < revealedCount}
            />
          ))}
        </div>
        {revealedCount < analysis.top.length && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileTap={{ scale: 0.95 }}
            onClick={revealNext}
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm"
          >
            揭示下一张
          </motion.button>
        )}
        {revealedCount >= analysis.top.length && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-gray-400"
          >
            正在生成你的人格卡...
          </motion.div>
        )}
      </div>
    );
  }

  // ═══ 结果阶段 ═══
  if (phase === "result" && analysis) {
    return (
      <div className="min-h-full flex flex-col items-center px-4 py-8">
        {lastPersona && lastPersona.title !== analysis.persona.title && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full px-3 py-1.5"
          >
            上次测试（{lastPersona.date}）：{lastPersona.title} →
            你的旅行口味变了
          </motion.div>
        )}
        <PersonalityCard
          title={analysis.persona.title}
          desc={analysis.persona.desc}
          advice={analysis.persona.advice}
          traits={analysis.top}
          themeIdx={cardThemeIdx}
          favCount={analysis!.favCount}
          recs={recs.map((s) => ({ id: s.id, name: s.name, level: s.level }))}
          contrast={contrast}
        />

        {/* 底部操作 */}
        <div className="flex gap-3 mt-8">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={reset}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> 重新测试
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => useAppStore.getState().setActiveView("spots")}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-colors"
          >
            <MapPin className="w-4 h-4" /> 去收藏更多
          </motion.button>
        </div>

        {/* 收藏统计 */}
        <div className="mt-8 grid grid-cols-3 gap-3 w-full max-w-sm">
          {[
            {
              label: "已收藏",
              value: analysis.favCount,
              icon: Heart,
              color: "text-red-500",
            },
            {
              label: "涉及分类",
              value: analysis.totalTraits,
              icon: Star,
              color: "text-amber-500",
            },
            {
              label: "主导类型",
              value: analysis.top[0]?.trait || "-",
              icon: Sparkles,
              color: "text-violet-500",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-xl border border-gray-100 p-3 text-center"
            >
              <stat.icon className={`w-4 h-4 ${stat.color} mx-auto mb-1`} />
              <div className={`text-lg font-black ${stat.color}`}>
                {stat.value}
              </div>
              <div className="text-[10px] text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
