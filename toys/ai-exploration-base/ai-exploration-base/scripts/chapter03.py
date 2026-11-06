#!/usr/bin/env python3
"""③ 关「儿子的 AI 实验室」：一张可玩的台面（内嵌整个程序）、一张真实截图、
三步上手、三张作品卡。文案全部来自 docs/content/p3-lab.md。
"""

from __future__ import annotations

import re

import deckkit as K


def _quotes(body: str) -> list[str]:
    lines = [ln.strip().lstrip(">").strip() for ln in body.splitlines()
             if ln.strip().startswith(">")]
    return K.paras(lines)


def _plays(body: str) -> list[dict]:
    out, cur = [], None
    for raw in body.splitlines():
        line = raw.strip()
        m = re.match(r"^\*\*(.+?)\*\*$", line)
        if m:
            emoji, name = "", m.group(1)
            mm = re.match(r"^(\S+)\s+(.+)$", name)
            if mm and not re.match(r"^[\u4e00-\u9fa5。，：]", mm.group(1)):
                emoji, name = mm.group(1), mm.group(2)
            cur = {"emoji": emoji, "name": name, "quote": []}
            out.append(cur)
            continue
        q = re.match(r"^>\s?(.*)$", line)
        if q and cur is not None:
            cur["quote"].append(q.group(1).strip())
    for item in out:
        item["paras"] = K.paras(item["quote"])
    return out


def _shot(rows, body: str) -> dict:
    alt = K.pick(rows, "alt")
    cap = K.paras(K.pick(rows, "图注", field="quote"))
    nature = K.strip_md(K.pick(rows, "性质标注"))
    path = ""
    m = re.search(r"`(assets/media/[^`]+)`", body)
    if m:
        path = m.group(1)
    return {"alt": K.strip_md(alt), "cap": " ".join(cap), "nature": nature, "path": path}


def _embed(rows, fail_body: str, src_body: str) -> dict:
    val = ""
    for key, row in rows:
        if "内嵌文件" in key:
            val = row["val"]
    src = ""
    m = re.search(r"`(assets/embed/[^`]+)`", val)
    if m:
        src = m.group(1)
    title = ""
    m = re.search(r"iframe 标题文字：`([^`]+)`", val)
    if m:
        title = m.group(1)
    hint = " ".join(_quotes(rows and "" or "") or [])  # placeholder, filled below
    hint = ""
    for key, row in rows:
        if "加载提示" in key:
            hint = " ".join(K.paras(row["quote"]))
    fail = " ".join(_quotes(fail_body))
    fail = re.sub(r"`([^`]+)`", r"\1", fail)
    repo = ""
    m = re.search(r"<https://github\.com/[^>]+>", src_body)
    if m:
        repo = m.group(0).strip("<>")
    return {"src": src, "title": title, "hint": hint, "fail": fail, "repo": repo}


def parse(md: str) -> dict:
    doc = {"groups": [], "summary": None}
    for head, body in K.sections(md):
        if head.startswith("页首") or head.startswith("页面元信息"):
            continue
        if head.startswith("结尾"):
            rows = K.bullets(body)
            doc["summary"] = {
                "title": K.strip_md(K.pick(rows, "标题")),
                "paras": K.paras(K.pick(rows, "正文", field="quote")),
            }
            continue
        if not head.startswith("区块"):
            continue
        rows = K.bullets(body)
        group = {"title": K.strip_md(K.pick(rows, "区块标题") or head),
                 "sub": K.strip_md(K.pick(rows, "区块副题")), "items": []}
        lead = ""
        for bhead, bbody in K.blocks(body):
            brows = K.bullets(bbody)
            if "引导正文" in bhead:
                lead = " ".join(_quotes(bbody))
            elif "三个玩法" in bhead:
                group["items"].append({"type": "plays", "plays": _plays(bbody)})
            elif "真实截图 1" in bhead:
                group["items"].append({"type": "shot", **_shot(brows, bbody)})
            elif "内嵌可玩程序" in bhead:
                fail_body = ""
                for h2, b2 in K.blocks(body):
                    if "内嵌失败回退" in h2:
                        fail_body += b2 + "\n"
                src_body = ""
                for h2, b2 in K.blocks(body):
                    if "源码链接行" in h2:
                        src_body += b2
                embed = _embed(brows, fail_body, src_body)
                embed["lead"] = lead
                group["items"].append({"type": "embed", **embed})
            else:
                m = re.match(r"^卡\s*(\d+)\s*[：:]\s*(.+)$", bhead)
                if not m:
                    continue
                name = m.group(2).strip()
                emoji = ""
                mm = re.match(r"^(\S+)\s+(.*)$", name)
                if mm and not re.match(r"^[\u4e00-\u9fa5]", mm.group(1)):
                    emoji, name = mm.group(1), mm.group(2)
                skill_raw = K.pick(brows, "技能标签行")
                skill_raw = re.sub(r"^[^：:]*[：:]", "", skill_raw) if "：" in skill_raw else skill_raw
                skills = [x.strip() for x in re.split(r"\u3000+", K.strip_md(skill_raw))
                          if x.strip() and not x.startswith("它用了")]
                repo = ""
                for key, row in brows:
                    if "仓库链接" in key:
                        raw = K.strip_md(row["val"])
                        mm2 = re.search(r"github\.com/[\w.-]+/[\w.-]+", raw)
                        if mm2:
                            repo = "https://" + mm2.group(0)
                group["items"].append({
                    "type": "project", "no": m.group(1), "emoji": emoji, "name": name,
                    "body": " ".join(K.paras(K.pick(brows, "正文", field="quote"))),
                    "skills": skills, "repo": repo,
                })
        doc["groups"].append(group)
    return doc


# ------------------------------------------------------------------ 渲染

def _lead_tile(lead: str) -> str:
    return K.tile("lead", f'<p class="ld-text">{K.rich(lead)}</p>', span=6, tag="为什么能玩")


def _embed_tile(item: dict) -> str:
    src = "../" + item["src"] if item["src"] else ""
    fail_text = item["fail"]
    if "或" in fail_text and "点这里" in fail_text:
        fail_text = fail_text.split("或")[0].rstrip("，。 ") + "。"
    fail = f'<p class="fr-alt">{K.rich(fail_text)}'
    if src:
        fail += (f' <a href="{K.esc(src)}" target="_blank" rel="noopener">'
                 "点这里在新窗口打开 ↗</a>")
    fail += "</p>"
    if item.get("repo"):
        host = re.sub(r"^https?://", "", item["repo"]).rstrip("/")
        fail += ('<p class="fr-src">源码在 GitHub（联网时点开）：'
                 f'<a href="{K.esc(item["repo"])}" target="_blank" rel="noopener noreferrer">'
                 f'{K.esc(host)}<span aria-hidden="true"> ↗</span></a></p>')
    return K.tile(
        "frame",
        (f'<p class="fr-lead">{K.rich(item.get("lead", ""))}</p>'
         if item.get("lead") else "")
        + f'<div class="fr-embed"><iframe src="{K.esc(src)}" title="{K.esc(item["title"])}"'
          ' loading="lazy" allow="fullscreen"></iframe></div>'
        + (f'<p class="fr-cap">{K.rich(item["hint"])}</p>' if item.get("hint") else "")
        + fail,
        span=6, tag="可玩 · 整个程序就在这个文件里",
    )


ALT_FIX = {
    "assets/media/lab-canvas.png":
        "算法实验室「生命画布」真实界面截图：深色 24×16 网格上散布着浅绿色的细胞图案，"
        "有 ✕ 与 ✚ 两种形状。",
}


def _shot_tile(shot: dict) -> str:
    alt = ALT_FIX.get(shot["path"], shot["alt"])
    img = (f'<img class="fg-img" src="../{K.esc(shot["path"])}" '
           f'alt="{K.esc(alt)}" loading="lazy">')
    return K.tile(
        "figure", img
        + (f'<p class="fg-cap">{K.rich(shot["cap"])}</p>' if shot["cap"] else "")
        + (f'<p class="fg-note">{K.esc(shot["nature"])}</p>' if shot["nature"] else ""),
        span=3, tag="真实界面截图",
    )


def _plays_tile(plays: list[dict]) -> str:
    items = "".join(
        '<li class="sp-item">'
        f'<span class="sp-emoji" aria-hidden="true">{K.esc(p["emoji"])}</span>'
        f'<span class="sp-name">{K.esc(p["name"])}</span>'
        + "".join(f'<p>{K.rich(x)}</p>' for x in p["paras"])
        + "</li>"
        for p in plays
    )
    return K.tile("steps", f'<ol class="sp">{items}</ol>', span=3, tag="三步上手")


def _project_tile(card: dict) -> str:
    skills = "".join(f"<li>{K.esc(s)}</li>" for s in card["skills"])
    host = re.sub(r"^https?://", "", card["repo"]).rstrip("/")
    return K.tile(
        "project",
        '<div class="in-head">'
        f'<span class="in-emoji" aria-hidden="true">{K.esc(card["emoji"])}</span>'
        f'<h4 class="in-name">{K.esc(card["name"])}</h4></div>'
        f'<p class="in-body">{K.rich(card["body"])}</p>'
        + (f'<ul class="pj-skill">{skills}</ul>' if skills else "")
        + (f'<a class="pj-link" href="{K.esc(card["repo"])}" target="_blank" rel="noopener noreferrer">'
           f'{K.esc(host)}<span aria-hidden="true"> ↗</span></a>' if card["repo"] else ""),
        span=2, tag=f"作品 {card['no']}",
    )


def _group_tiles(group: dict) -> str:
    out = []
    for item in group["items"]:
        if item["type"] == "embed":
            out.append(_embed_tile(item))
        elif item["type"] == "shot":
            out.append(_shot_tile(item))
        elif item["type"] == "plays":
            out.append(_plays_tile(item["plays"]))
        elif item["type"] == "project":
            out.append(_project_tile(item))
    return "".join(out)


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)
    lead = ""
    for head, body in K.sections(md):
        if head.startswith("页首"):
            rows = K.bullets(body)
            lead = " ".join(K.paras(K.pick(rows, "分工声明", field="quote")))
    parts = []
    for idx, g in enumerate(doc["groups"]):
        tiles = _group_tiles(g)
        if idx == 0 and lead:
            tiles = _lead_tile(lead) + tiles
        parts.append(K.group(g["title"], g["sub"], tiles))
    head = K.head(
        "THE BENCH / 实验台",
        "他做的这些，**AI 陪着一行一行写出来的**。",
        note="台面上这一个可以现在就玩；旁边那张是它真的跑起来的样子，再往下是三件已经做完的作品。",
    )
    floor = K.castfloor(head, "".join(parts),
                        K.summary(doc["summary"]["title"], doc["summary"]["paras"])
                        if doc.get("summary") else "")
    table = ""
    if sources_md:
        rows = K.source_rows(sources_md, ("P3",))
        rows = [r for r in rows if r["no"] in {"23", "24", "25", "26"}]
        table = K.linktable(rows, "本页来源",
                            "四个仓库都能点开逐项核对；截图来自本页内嵌程序的真实运行画面。")
    return floor, table
