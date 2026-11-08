/**
 * 结局档案复印件（批次 CY-41 从结局弹层抽出共用）：
 * 在屏幕外誊一份干净的档案纸——纸上没有一颗按钮，正文去掉加粗记号，有页边批注就一并誊上——
 * 再走统一导出通道（盖章、垫底色、下载）。结局弹层与「钉过的结局打包存图」共用这一份誊抄手艺。
 */
import { capturePng } from "@/lib/exportPng";

export interface EndingPaperInfo {
  lineTitle: string;
  tierLabel?: string;
  title: string;
  text: string;
  note?: string;
}

export async function exportEndingPaper(info: EndingPaperInfo): Promise<boolean> {
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    holder.appendChild(line);
  };
  piece(
    "p",
    "text-xs font-bold text-primary",
    info.tierLabel ? `${info.lineTitle} · ${info.tierLabel}` : info.lineTitle,
  );
  piece("h3", "mt-2 text-2xl font-bold text-card-foreground", info.title);
  piece("p", "mt-4 whitespace-pre-line text-base leading-loose text-card-foreground", info.text.replace(/\*\*/g, ""));
  if (info.note) {
    piece("p", "mt-5 border-t border-border pt-3 text-xs font-bold text-muted-foreground", "页边批注");
    piece("p", "mt-1 text-sm leading-relaxed text-card-foreground", info.note);
  }
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·结局《${info.title}》.png`);
  holder.remove();
  return ok;
}



export interface WordBookEntry {
  place: string;
  meaning: string;
  text: string;
}

/**
 * 词义册 · 存图（批次 CY-143）：把翻到的那几条释义誊成一页词卡。
 * 口径：只誊已翻到的——没翻到的不剧透；凑齐才能说的那一次，纸上只记「已说过」或「还没说」。
 */
export async function exportWordBookPaper(entries: WordBookEntry[], missing: number, wordSaid: boolean): Promise<boolean> {
  if (entries.length === 0) return false;
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string, into: HTMLElement = holder) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    into.appendChild(line);
  };
  piece("p", "text-xs font-bold text-primary", "词 义 册");
  piece(
    "p",
    "mt-1 font-mono text-xs tracking-widest text-muted-foreground",
    `翻到 ${entries.length} 条${missing > 0 ? ` · 还差 ${missing} 条` : " · 都翻到了"} · ${
      wordSaid ? "已说过一次" : "还没说过"
    }`,
  );
  for (const entry of entries) {
    piece("p", "mt-5 text-xs font-bold tracking-widest text-primary", entry.place);
    piece("p", "mt-1 text-sm font-bold leading-loose text-card-foreground", entry.meaning);
    piece("p", "mt-1 whitespace-pre-line text-xs leading-loose text-muted-foreground", entry.text);
  }
  if (missing > 0) {
    piece(
      "p",
      "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
      `还有 ${missing} 条没翻到——纸不催，词会来。`,
    );
  } else {
    piece(
      "p",
      "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
      "都翻到了。说过的那次，词就不再是词了。",
    );
  }
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·词义册.png`);
  holder.remove();
  return ok;
}

export interface TruthJarPaperGroup {
  lineTitle: string;
  texts: string[];
}

/**
 * 真话罐 · 存图（批次 CY-142）：把说出口的真话按线誊成一页罐面。
 * 口径：说出口的，表上没有它们的栏，开新档也清不掉；消迹的那几句计数还在、内容没了，不在这张纸上。
 */
export async function exportTruthJarPaper(
  groups: TruthJarPaperGroup[],
  collected: number,
  total: number,
  taken: number,
): Promise<boolean> {
  if (collected <= 0) return false;
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string, into: HTMLElement = holder) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    into.appendChild(line);
  };
  piece("p", "text-xs font-bold text-primary", "真 话 罐");
  piece(
    "p",
    "mt-1 font-mono text-xs tracking-widest text-muted-foreground",
    `收藏 ${collected}/${total}${taken > 0 ? ` · 另有 ${taken} 句计数在、内容没了` : ""}`,
  );
  for (const group of groups) {
    if (group.texts.length === 0) continue;
    piece("p", "mt-5 text-xs font-bold tracking-widest text-primary", group.lineTitle);
    for (const text of group.texts) {
      piece("p", "mt-1.5 whitespace-pre-line text-sm leading-loose text-card-foreground", text);
    }
  }
  piece(
    "p",
    "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
    "说出口的，表上没有它们的栏。开新档也清不掉。",
  );
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·真话罐.png`);
  holder.remove();
  return ok;
}

export interface SideStoryPaperInfo {
  frogName: string;
  /** 名册附页的档位章：树洞 · 番外 / 真心蛙友 · 专属番外 */
  tierLabel: string;
  title: string;
  place: string;
  /** 收档时的档案行（名册附页记：《……》。……） */
  archive: string;
}

/**
 * 名册附页复印件（批次 CY-137）：把讲过的番外誊成一页附页图。
 * 口径与图鉴重读一致：档案只记一次——这张纸是重印的，不另记。
 * 与结局档案复印件共用同一誊抄手艺与导出通道。
 */
export async function exportSideStoryPaper(info: SideStoryPaperInfo): Promise<boolean> {
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    holder.appendChild(line);
  };
  piece("p", "text-xs font-bold text-primary", `名册附页 · ${info.tierLabel}`);
  piece("h3", "mt-2 text-2xl font-bold text-card-foreground", `《${info.title}》`);
  piece("p", "mt-1 text-xs text-muted-foreground", `${info.frogName} · ${info.place}`);
  piece(
    "p",
    "mt-4 whitespace-pre-line text-sm leading-loose text-card-foreground",
    info.archive.replace(/^名册附页记：/, ""),
  );
  piece(
    "p",
    "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
    "档案只记一次——这一页是重印的，不另记。",
  );
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·名册附页《${info.title}》.png`);
  holder.remove();
  return ok;
}

/**
 * 真话收藏卡 · 合集（批次 CY-140）：说出口的那几句拼进同一页——一本小册，一次下载。
 * 口径同收藏卡本身：这几句话不进册子，也不进台账——只在你这儿。
 */
export interface TruthCardAlbumItem {
  index: number;
  stamp: string;
  text: string;
  coda: string;
}

export async function exportTruthCardAlbum(items: TruthCardAlbumItem[], total: number): Promise<boolean> {
  if (items.length === 0) return false;
  const holder = document.createElement("div");
  holder.className = "w-[860px] max-w-[92vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string, into: HTMLElement = holder) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    into.appendChild(line);
  };
  /* 封面页 */
  const cover = document.createElement("div");
  cover.className = "rounded-3xl border border-primary/30 bg-primary/5 px-8 py-8 text-center";
  holder.appendChild(cover);
  piece("p", "text-xs font-bold tracking-[0.3em] text-primary", "医 务 室", cover);
  piece("h2", "mt-3 text-3xl font-bold text-card-foreground", "收藏卡合集", cover);
  piece("p", "mt-3 text-xs leading-relaxed text-muted-foreground", "这几句话不进册子，也不进台账。它们在你这儿。", cover);
  piece(
    "p",
    "mt-2 font-mono text-xs tracking-widest text-muted-foreground",
    `收卡 ${items.length}/${total} · 重印 · 不另记`,
    cover,
  );
  /* 目录页 */
  const toc = document.createElement("div");
  toc.className = "mt-6 rounded-3xl border border-dashed border-border px-6 py-5";
  holder.appendChild(toc);
  piece("p", "text-xs font-bold tracking-widest text-primary", "目 录", toc);
  const tocList = document.createElement("ol");
  tocList.className = "mt-3 space-y-1.5";
  toc.appendChild(tocList);
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "flex items-baseline gap-2 text-xs leading-relaxed";
    const no = document.createElement("span");
    no.className = "font-mono text-[10px] font-bold text-muted-foreground";
    no.textContent = String(item.index).padStart(2, "0");
    const main = document.createElement("span");
    main.className = "font-bold text-card-foreground";
    main.textContent = item.text;
    const meta = document.createElement("span");
    meta.className = "text-muted-foreground";
    meta.textContent = item.stamp;
    li.append(no, main, meta);
    tocList.appendChild(li);
  });
  /* 卡页：一卡一格，正面原文 + 背面收束语 */
  const grid = document.createElement("div");
  grid.className = "mt-6 grid grid-cols-2 gap-3";
  holder.appendChild(grid);
  for (const item of items) {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-border p-4";
    grid.appendChild(card);
    piece("p", "text-[10px] font-bold text-primary", `第 ${item.index} 张 · ${item.stamp}`, card);
    piece("p", "mt-2 whitespace-pre-line text-sm font-bold leading-loose text-card-foreground", item.text, card);
    piece("p", "mt-3 border-t border-border pt-2 text-[10px] font-bold text-muted-foreground", "背面 · 收束语", card);
    piece("p", "mt-1 whitespace-pre-line text-xs leading-loose text-card-foreground", item.coda || "——", card);
  }
  piece(
    "p",
    "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
    "这几句话不进册子，也不进台账——这本册子也是重印的。",
  );
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·收藏卡合集.png`);
  holder.remove();
  return ok;
}

export interface TruthCardPaperInfo {
  /** 第 N 张（1 起） */
  index: number;
  /** 主题章（撑不住 / 退了几只 / …） */
  stamp: string;
  /** 正面：说出口的那句真话 */
  text: string;
  /** 背面：收束语 */
  coda: string;
}

/**
 * 真话收藏卡复印件（批次 CY-138）：把说出口的那句誊成一张卡。
 * 口径同收藏卡本身：这几句话不进册子、不进台账——只在你这儿。
 */
export async function exportTruthCardPaper(info: TruthCardPaperInfo): Promise<boolean> {
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    holder.appendChild(line);
  };
  piece("p", "text-xs font-bold text-primary", `医务室 · 收藏卡 · 第 ${info.index} 张 · ${info.stamp}`);
  piece("p", "mt-6 whitespace-pre-line text-lg leading-loose text-card-foreground", info.text);
  piece("p", "mt-8 border-t border-border pt-4 text-xs font-bold text-muted-foreground", "背面 · 收束语");
  piece("p", "mt-2 whitespace-pre-line text-sm leading-loose text-card-foreground", info.coda || "——");
  piece(
    "p",
    "mt-6 text-[10px] font-bold tracking-widest text-muted-foreground",
    "这几句话不进册子，也不进台账。它们在你这儿。",
  );
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·收藏卡第${info.index}张.png`);
  holder.remove();
  return ok;
}

export interface PresetBookLine {
  name: string;
}

/**
 * 图鉴组合 · 小本（批次 CY-145）：把存下的筛选组合整本誊成一页——每行就是一句能念回的口令。
 * 口径：口令就是组合名本身，抄给谁、谁念回来，筛选就落回同一页；空本不誊。
 */
export async function exportGalleryPresetBook(lines: PresetBookLine[]): Promise<boolean> {
  if (lines.length === 0) return false;
  const holder = document.createElement("div");
  holder.className = "w-[620px] max-w-[86vw] rounded-3xl border border-border bg-card p-8";
  holder.setAttribute("style", "position:fixed;left:-10000px;top:0;z-index:-1;");
  const piece = (tag: string, cls: string, text: string) => {
    const line = document.createElement(tag);
    line.className = cls;
    line.textContent = text;
    holder.appendChild(line);
  };
  piece("p", "text-xs font-bold text-primary", "图 鉴 组 合");
  piece(
    "p",
    "mt-1 font-mono text-xs tracking-widest text-muted-foreground",
    `存了 ${lines.length} 组 · 念一句回来，筛选落回那一页`,
  );
  const list = document.createElement("div");
  list.className = "mt-5 flex flex-col gap-2";
  holder.appendChild(list);
  lines.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "flex items-baseline gap-2";
    const no = document.createElement("span");
    no.className = "shrink-0 font-mono text-[10px] font-bold text-muted-foreground";
    no.textContent = String(index + 1).padStart(2, "0");
    const name = document.createElement("span");
    name.className = "text-sm font-bold text-card-foreground";
    name.textContent = item.name;
    row.append(no, name);
    list.appendChild(row);
  });
  piece(
    "p",
    "mt-6 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground",
    "一句一句抄吧——纸不催。",
  );
  document.body.appendChild(holder);
  const ok = await capturePng(holder, `奶蛙大学·图鉴组合小本.png`);
  holder.remove();
  return ok;
}
