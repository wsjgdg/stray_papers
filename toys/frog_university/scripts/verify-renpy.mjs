/**
 * 奶蛙大学 · 迁移管线验证（Demo 优先原则的机检延伸）
 *
 * 读 docs/renpy-data.json（引擎无关中间格式），对每条线各跑一次全量可达性遍历（当前十条）：
 *   1. 死行检测 —— 每个行 / 选项节点都必须从线入口可达（不可达 = 内容白写，迁移后也白占包）
 *   2. 环检测 —— 汇流目标回指更早节点会让新引擎死循环
 *   3. 结局区间衔接 —— 三档结局的沉默值区间必须从 0 起无缝相接、无重叠（引擎把全局沉默值
 *      clamp 到 0 后按区间判定，没匹配上还有「落最后一个结局」的兜底——所以区间上写出的洞
 *      不会让玩家卡死，但会让本该进低档的玩家被兜底送进最高档，这正是引擎注释里点名的坑）
 *   4. 兜底提示 —— 单线口径下未命中任何区间的可达值会被引擎兜底落进最后一档，只提示不判失败
 *      （真实判定用的是学期全局沉默值，随走线顺序浮动，单线模拟刻意不做这个猜测）
 *
 * 推进语义与现有引擎一致：场景内行按顺序播完（行可带 merge 跳汇流），场景收尾的选项组是
 * 一次分岔——玩家只选一项：带 branch 的选项进分支，不带 branch 的选项顺序进下一场景。
 *
 * 纯读取，不改任何剧本：
 *   node scripts/verify-renpy.mjs
 */
import { readFileSync } from "node:fs";

const data = JSON.parse(readFileSync(new URL("../docs/renpy-data.json", import.meta.url), "utf8"));
const files = [...new Set(data.lines.map((line) => line.file))].sort();

const report = [];
const problems = [];

for (const file of files) {
  const nodes = [
    ...data.lines.filter((line) => line.file === file),
    ...data.choices.filter((choice) => choice.file === file),
  ].sort((a, b) => a.playOrder - b.playOrder);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ordered = nodes.map((node) => node.id);
  const indexOf = new Map(ordered.map((id, index) => [id, index]));
  const choiceScenes = new Map(); // sceneId → 该场景收尾的选项组（一次分岔，玩家只选一项）
  for (const node of nodes) {
    if (node.silenceDelta !== undefined) {
      if (!choiceScenes.has(node.sceneId)) choiceScenes.set(node.sceneId, []);
      choiceScenes.get(node.sceneId).push(node.id);
    }
  }

  /* 选项的后继：带 branch 进分支；不带 branch 进下一场景首行（选项组互斥，玩家只选一项——
   * 选项在静态序列里彼此相邻，直接 +1 会串到同组下一个选项，必须按场景边界找下一个场景） */
  const nextSceneStart = (choiceId) => {
    const option = byId.get(choiceId);
    return ordered.find((id) => {
      const node = byId.get(id);
      return node.playOrder > option.playOrder && node.sceneId !== option.sceneId;
    });
  };
  const choiceSuccessors = (choiceId, silence) => {
    const choice = byId.get(choiceId);
    const nextSilence = silence + (choice.silenceDelta ?? 0);
    if (choice.branch) return [{ id: choice.branch, silence: nextSilence }];
    const next = nextSceneStart(choiceId);
    return next ? [{ id: next, silence: nextSilence }] : [];
  };

  const seen = new Set();
  const reachable = new Set();
  const silences = new Set();
  let loops = 0;
  const queue = [{ id: ordered[0], silence: 0 }];
  while (queue.length > 0) {
    const { id, silence } = queue.shift();
    const key = `${id}|${silence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reachable.add(id);

    const node = byId.get(id);
    const successors = [];
    const isChoiceNode = node.silenceDelta !== undefined;
    if (isChoiceNode) {
      /* 选项节点：只走自己这一项（组内其余选项由场景末尾的组入口全量展开，互斥不串联） */
      successors.push(...choiceSuccessors(id, silence));
    } else if (node.merge) {
      successors.push({ id: node.merge, silence });
    } else {
      const nextIndex = indexOf.get(id) + 1;
      if (nextIndex < ordered.length) {
        const nextId = ordered[nextIndex];
        if (byId.get(nextId).silenceDelta !== undefined) {
          /* 走到场景末尾：收尾选项组是一次分岔，全量展开互斥选项（玩家只选一项）。
             选项节点本身从不入队——判定值在选项的后继上携带。若某选项在线末
             没有后继（脚本到此结束），它的增量必须在展开处就地记入沉默集：
             引擎 chooseOption 先 addSilence(delta) 再到线末判定，漏记会让
             可达上界系统性少算最后一组选项的 delta。 */
          const sceneId = byId.get(nextId).sceneId;
          let expandedAny = false;
          for (const optionId of choiceScenes.get(sceneId)) {
            reachable.add(optionId);
            const optionSuccessors = choiceSuccessors(optionId, silence);
            if (optionSuccessors.length === 0) {
              silences.add(silence + (byId.get(optionId).silenceDelta ?? 0));
            }
            expandedAny = expandedAny || optionSuccessors.length > 0;
            successors.push(...optionSuccessors);
          }
          if (!expandedAny) {
            /* 整组都到线末：判定值已含各选项增量（逐项记过了），本节点处理完毕 */
            continue;
          }
        } else {
          successors.push({ id: nextId, silence });
        }
      }
    }
    if (successors.length === 0) silences.add(silence); // 非选项线末 = 结局判定点
    for (const successor of successors) {
      const target = byId.get(successor.id);
      if (!target) {
        problems.push(`${file}: 跳转目标不存在 ${id} → ${successor.id}`);
        continue;
      }
      if (node?.merge && indexOf.has(successor.id) && indexOf.get(successor.id) < indexOf.get(id)) loops += 1;
      queue.push(successor);
    }
  }

  const deadNodes = ordered.filter((id) => !reachable.has(id));
  const silentValues = [...silences];
  const silentMin = Math.min(...silentValues);
  const silentMax = Math.max(...silentValues);

  /* 结局区间衔接：按 minSilence 排序后必须从 0 起无缝相接、无重叠（引擎 clamp 到 0 后按区间判定） */
  const endings = data.endings.filter((ending) => ending.file === file);
  const orderedEndings = [...endings].sort((a, b) => (a.minSilence ?? 0) - (b.minSilence ?? 0));
  let prevMax = -1;
  const intervalGaps = [];
  for (const ending of orderedEndings) {
    const min = ending.minSilence ?? 0;
    if (min !== prevMax + 1) intervalGaps.push(`${ending.id} 区间起点 ${min}，前档收在 ${prevMax}`);
    prevMax = ending.maxSilence ?? Infinity;
  }
  /* 单线口径下未命中任何区间的值：负值会被引擎 clamp 到 0（第一档接住），正值在全局口径下
   * 也可能直接命中区间——所以这条只提示、不判失败。真实判定用的是学期全局沉默值。 */
  const fallbackOnly = silentValues.filter((value) => {
    return !endings.some((ending) => value >= (ending.minSilence ?? -Infinity) && value <= (ending.maxSilence ?? Infinity));
  });

  report.push({
    file,
    lines: data.lines.filter((line) => line.file === file).length,
    choices: data.choices.filter((choice) => choice.file === file).length,
    reachable: reachable.size,
    deadNodes,
    loops,
    silenceRange: silentValues.length > 0 ? `${silentMin} ~ ${silentMax}（${silentValues.length} 个可达值）` : "无",
    endings: endings.map((ending) => `${ending.id}(${ending.minSilence ?? "*"}~${ending.maxSilence ?? "*"})`).join(" / "),
    uncovered: fallbackOnly,
    intervalGaps,
  });
  for (const id of deadNodes) problems.push(`${file}: 死行（不可达）${id}`);
  if (loops > 0) problems.push(`${file}: 汇流回指 ${loops} 处（新引擎会死循环）`);
  for (const gap of intervalGaps) problems.push(`${file}: 结局区间有洞或重叠 → ${gap}`);
  if (fallbackOnly.length > 0) {
    const negatives = fallbackOnly.filter((value) => value < 0);
    const others = fallbackOnly.filter((value) => value >= 0);
    if (negatives.length > 0) {
      console.log(`[verify] ${file.padEnd(14)} 提示：真话选项把单线沉默压到 ${negatives.join(" / ")}，引擎会 clamp 到 0 落第一档（口径一致，无需处理）`);
    }
    if (others.length > 0) {
      console.log(`[verify] ${file.padEnd(14)} 提示：沉默值 ${others.join(" / ")} 单线口径不落在任何区间，全局口径下也可能直接命中（终章线尤其如此）`);
    }
  }
}

/* ---------- 汇报 ---------- */
let pass = true;
for (const row of report) {
  const flag = row.deadNodes.length === 0 && row.loops === 0 && row.intervalGaps.length === 0;
  if (!flag) pass = false;
  console.log(
    `[verify] ${row.file.padEnd(14)} 行 ${row.lines} · 选项 ${row.choices} · 可达 ${row.reachable} · ` +
      `死行 ${row.deadNodes.length} · 环 ${row.loops} · 沉默值 ${row.silenceRange} · 结局 ${row.endings}` +
      (flag ? " ✅" : " ❌"),
  );
}
console.log(`[verify] 共通日程 ${data.commonDays.length} 天 / 深夜事件 ${data.nightEvents.length} 起（静态数据，无流式跳转）`);
console.log(`[verify] 问题总计: ${problems.length}`);
for (const problem of problems) console.warn(`[verify][fail] ${problem}`);
if (pass) console.log(`[verify] ${files.length} 条线全部通过：无死行、无环、三档结局区间从 0 起无缝相接`);
