/**
 * 好感度系统 · 换算层
 * 存档里存的是每只蛙的「真话点数」；界面与阈值统一换算成 0-100 的坦诚度。
 * 每只蛙的满值 = 全部剧本里能从它身上赚到的正分之和 ——
 * 所以坦诚度读数就是「这只蛙的真话，你已经听到了几成」，
 * 不刷重复选项也能在一轮真话通关里走满，正贴合「真话只说一次」的产品设定。
 */
import {
  FROG_CAST,
  FROG_CHARACTERS,
  affinityTierOf,
  type AffinityTier,
  type FrogCharacterId,
} from "@/data/characters";
import { STORYLINES, STORY_SCRIPTS } from "@/data/storylines";
import { frogIndexOf, existenceTierOf } from "@/lib/gameSave";
import type { GameSaveData } from "@/lib/gameSave";

export const SELF_ID: FrogCharacterId = "naiBai";
/** 真话出口（沉默 ±0 的选项）给主角自己的坦诚度加分 */
export const SELF_TRUTH_DELTA = 2;
/** 触发真心话节点的两档阈值（按坦诚度） */
export const HEART_TALK_THRESHOLDS = [40, 80] as const;
export type HeartTalkLevel = (typeof HEART_TALK_THRESHOLDS)[number];
/** 「真心蛙友」称呼线，也是湖边全员真话收束段的门槛 */
export const TRUE_FRIEND_THRESHOLD = 85;

/** 树洞档门槛（番外篇批次）：到这一档的蛙开始把没说出口的话分你一半——番外在这一档解锁 */
export const TREE_HOLE_THRESHOLD = 55;

let poolsCache: Record<FrogCharacterId, number> | null = null;

/** 每只蛙的正分满值（从剧本数据自动统计，改剧本标注不用改这里） */
export function getAffinityPools(): Record<FrogCharacterId, number> {
  if (poolsCache) return poolsCache;
  const pools: Record<FrogCharacterId, number> = {
    naiBai: 0,
    moMo: 0,
    meiMei: 0,
    huiHui: 0,
    ganFanShu: 0,
    zaiZai: 0,
    geGe: 0,
    mianMian: 0,
  };
  for (const script of Object.values(STORY_SCRIPTS)) {
    if (!script) continue;
    const castIds = STORYLINES.find((line) => line.id === script.lineId)?.castIds ?? [];
    for (const act of script.acts) {
      for (const scene of act.scenes) {
        for (const choice of scene.choices ?? []) {
          if (choice.silenceDelta === 0) pools[SELF_ID] += SELF_TRUTH_DELTA;
          const delta = choice.affinityDelta ?? 0;
          if (!choice.affinityTarget || delta <= 0) continue;
          if (choice.affinityTarget === "all") {
            for (const id of castIds) {
              if (id !== SELF_ID) pools[id] += delta;
            }
          } else {
            pools[choice.affinityTarget] += delta;
          }
        }
      }
    }
  }
  poolsCache = pools;
  return pools;
}

/** 坦诚度：真话点数 → 0-100 的百分比 */
export function affinityPercent(charId: FrogCharacterId, points: number): number {
  const pool = getAffinityPools()[charId];
  if (pool <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((points / pool) * 100)));
}

/** 好感变化提示的数据形状（play 页 toast 用） */
export interface AffinityFlash {
  /** 受益蛙；"all" = 本线出场的全体 NPC 蛙 */
  charId: FrogCharacterId | "all";
  delta: number;
  /** 关系称呼升级时的新称呼 */
  tierLabel: string | null;
  stamp: number;
}

export interface AffinityRow {
  charId: FrogCharacterId;
  displayName: string;
  role: string;
  points: number;
  percent: number;
  tier: AffinityTier;
  blurb: string;
  isSelf: boolean;
  /** 在册蛙的固定编号（批次 BS：名字可以空，编号不空） */
  index: number;
  /** 编目（批次 BS）：该蛙被否认/自行降级——名册里那一行只剩编号，数值那格是空的 */
  existenceTier?: "none" | "footnote" | "demoted";
}

/** 好感名册：每只蛙各一行（地图页面板用，v2 扩充后七只） */
export function affinityRows(save: GameSaveData): AffinityRow[] {
  return FROG_CAST.map((character) => {
    const points = save.affinity[character.id] ?? 0;
    const percent = affinityPercent(character.id, points);
    const tier = affinityTierOf(percent);
    const isSelf = character.id === SELF_ID;
    return {
      charId: character.id,
      displayName: character.displayName,
      role: character.role,
      points,
      percent,
      tier,
      blurb: isSelf ? "每次选「真话出口」，你也离自己近一点" : tier.blurb,
      isSelf,
      /* 编目（批次 BS）：被否认/自行降级的蛙——名册里那一行只剩编号 */
      index: frogIndexOf(character.id),
      existenceTier: existenceTierOf(save, character.id, save.playthrough),
    };
  });
}

/** NPC 蛙里坦诚度最高的一只（湖边夜谈按它微调台词）；全员 0 时返回 null。
 *  restrictTo（CY-129）：限定候选池——湖边微调只该选湖边在场的蛙；
 *  棉棉/再再/格格不在湖边名单里，全表取最高会得到一个没有微调文案的 id，
 *  导致 LAKE_TOP_LINES 查表落空、微调整个静默跳过（四只在场蛙的专属开场也跟着丢）。 */
export function topTrueFrog(
  save: GameSaveData,
  restrictTo?: readonly FrogCharacterId[],
): FrogCharacterId | null {
  const candidates = restrictTo ?? FROG_CAST.map((character) => character.id);
  let top: FrogCharacterId | null = null;
  let topValue = 0;
  for (const id of candidates) {
    const character = FROG_CHARACTERS[id];
    if (!character || character.id === SELF_ID) continue;
    const value = affinityPercent(character.id, save.affinity[character.id] ?? 0);
    if (value > topValue) {
      topValue = value;
      top = character.id;
    }
  }
  return top;
}

/**
 * 「原来我们都在装」收束段条件：出场 NPC 蛙坦诚度全部达到真心蛙友线。
 * 只统计「有剧本、能赚到真话分」的 NPC——新扩线的蛙在正文填进来之前不计入门槛，
 * 免得门槛被一只满值 0 的蛙卡死；剧本一注册，它就自动进门槛。
 */
export function allTrueFriends(save: GameSaveData): boolean {
  const pools = getAffinityPools();
  return FROG_CAST.every((character) => {
    if (character.id === SELF_ID) return true;
    if (pools[character.id] <= 0) return true;
    return affinityPercent(character.id, save.affinity[character.id] ?? 0) >= TRUE_FRIEND_THRESHOLD;
  });
}
