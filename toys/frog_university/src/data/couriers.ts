/**
 * 奶蛙大学 · 递件（批次 CB）
 * 加入没有免费的——团体要你办的第一件事，是替它把一份表交上去。
 * 被反映人一栏写着 036。事由一栏写的是你自己。
 * 你写的报告进了柜子；你经手的这份，也会进去——区别只在署名栏：署名的不是你，经手的是你。
 */
import type { FrogCharacterId } from "@/data/characters";
import { FACTION_REQUESTER, type FactionId } from "@/data/factions";

export interface CourierScript {
  factionId: FactionId;
  /** 来托你的那只 */
  requester: FrogCharacterId;
  /** 请求（第一次） */
  ask: string;
  /** 请求（递过一次之后，它说话就顺了） */
  askRepeat: string;
  /** 表名 */
  formName: string;
  /** 拿到表之后、决定之前的那一句 */
  atWindow: string;
  /** 递上去的回执 */
  deliveredNote: string;
  /** 压下去的回执 */
  heldNote: string;
  /** 它看到结果之后的反应：递了 / 压了 */
  replyDelivered: string;
  replyHeld: string;
}

export const COURIERS: Record<FactionId, CourierScript> = {
  curfew: {
    factionId: "curfew",
    requester: FACTION_REQUESTER.curfew,
    ask: "「帮我递一下。」她把一张折好的表推过来，动作很轻，像递一张收据。「柜台认你的字。」",
    askRepeat: "「又来一份。」她说得比上学期顺——顺得像在还一件上次借的东西。「柜台认你的字。」",
    formName: "情况反映",
    atWindow: "你把表展开看了一遍。表格和你的档案是同一批印的——抬头、编号、事由、经手，每一栏的位置你都认得。",
    deliveredNote: "表递进去了。窗口没抬头——它认的是格式，不是笔迹。经手那一栏，是你的学号。",
    heldNote: "表在你手里。你没交，也没扔。它现在是柜子外唯一一份写你的报告——私扣不在流程里，所以没有任何一栏收它。",
    replyDelivered: "她看了一眼收据，把折痕抚平：「就这样。以后有你的。」",
    replyHeld: "她没追问。她只是把笔收了回去——收笔比递笔快。",
  },
  bulletin: {
    factionId: "bulletin",
    requester: FACTION_REQUESTER.bulletin,
    ask: "「跑一趟呗。」她把表对折，折痕压得很平。「我贴东西的手不能去窗口——你懂的。」",
    askRepeat: "「还是那张。」她把表往你这边推了推，笑着。「你懂规矩。这活儿现在是你的了。」",
    formName: "情况反映",
    atWindow: "你把表展开看了一遍。落款那枚章是有的，盖得很齐；署名那一栏，空着。",
    deliveredNote: "表递进去了。窗口收表的那只看了你一眼——第一眼。以后它认得你了。",
    heldNote: "表在你手里。你没交，也没扔。公告栏上那张海报还贴着——它不知道自己那张，现在压在你手里。",
    replyDelivered: "莓莓冲你比了个手势，没有出声——公示栏那边的规矩：不出声。",
    replyHeld: "莓莓的笑容没变。她只是没再看你——笑容没变，眼睛先收了。",
  },
  ledger: {
    factionId: "ledger",
    requester: FACTION_REQUESTER.ledger,
    ask: "他把一张表压在盘底递出来：「顺路。」两个字的理由，说得很稳。",
    askRepeat: "「顺路。」他把表压在盘底，还是那两个字。窗口那边排队的蛙在看你。",
    formName: "情况反映",
    atWindow: "你把表展开看了一遍。纸有点油——不是脏，是常年放在灶台边的那种。",
    deliveredNote: "表递进去了。窗口没抬头。你转身的时候，队伍里有只蛙小声说了句「是那个窗口的」——它认得你的盘子，现在也认得你的名字。",
    heldNote: "表在你手里。你没交，也没扔。三号窗口的牌子还翻着——压在你手里的这一份，比翻过去的那一块牌子重。",
    replyDelivered: "他把勺子搁下，给你多打了半勺。谁也没说这半勺是为什么。",
    replyHeld: "他把勺子搁下，照常打饭。规矩还是规矩——只是他给你打饭的时候，没再抬头。",
  },
};

/** 按团体取递件脚本 */
export function courierScriptOf(factionId: string): CourierScript | undefined {
  return (COURIERS as Record<string, CourierScript | undefined>)[factionId];
}
