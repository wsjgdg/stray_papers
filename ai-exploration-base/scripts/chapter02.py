#!/usr/bin/env python3
"""② 关「AI 趋势与行业」：时间线、人口示意、三个数字、柱状图、五张行业卡。

正文全部来自 docs/content/p2-trends.md；引文里那些"依据（[来源N]…）"
是维护备注，不再上页——它们变成页尾一张链接表。
"""

from __future__ import annotations

import re

import deckkit as K


def _timeline(body: str) -> list[dict]:
    items, cur = [], None
    for raw in body.splitlines():
        line = raw.rstrip()
        m = re.match(r"^\*\*(条目\s*\d+)\s*[—–-]\s*(.+?)\*\*$", line.strip())
        if m:
            cur = {"no": m.group(1), "when": m.group(2).strip(), "quote": []}
            items.append(cur)
            continue
        if cur is None or line.startswith("- "):
            continue
        q = re.match(r"^\s*>\s?(.*)$", line)
        if q:
            cur["quote"].append(q.group(1).strip())
    for item in items:
        item["paras"] = K.paras(item["quote"])
    return items


def _people(rows) -> dict:
    figure = K.strip_md(K.pick(rows, "图示"))
    m = re.search(r"aria-label）?[：:]\s*(.+)$", figure)
    return {
        "label": K.strip_md(K.pick(rows, "图下主文案")),
        "source": K.strip_md(K.pick(rows, "图下来源行")),
        "aria": (m.group(1).strip() if m else "") or figure,
        "figure": figure,
    }


def _stats(body: str) -> list[dict]:
    tables = K.md_tables(body)
    out = []
    for table in tables:
        for cells in table[1:]:
            if len(cells) < 3:
                continue
            out.append({"no": cells[0], "big": K.strip_md(cells[1]),
                        "small": K.strip_md(cells[2])})
    return out


def _chart(rows) -> dict:
    legend, axis = "", ""
    for key, row in rows:
        for item in ([row["val"]] if row["val"] else []) + row["items"]:
            label, _, value = item.partition("：")
            if "标题" in label or "图例" in label:
                legend = K.strip_md(value)
            elif "横轴" in label:
                axis = value
    points = [(lab, float(val)) for lab, val in
              re.findall(r"`([^`]+)`（([\d.]+)）", axis)]
    return {
        "legend": legend,
        "points": points,
        "source": " ".join(K.paras(K.pick(rows, "图下来源行", field="quote"))),
    }


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
        for bhead, bbody in K.blocks(body):
            brows = K.bullets(bbody)
            if "时间线" in bhead:
                group["items"].append({"type": "timeline", "entries": _timeline(bbody)})
            elif "人口图" in bhead:
                group["items"].append({"type": "people", **_people(brows)})
            elif "数字卡" in bhead:
                group["items"].append({"type": "stats", "stats": _stats(bbody)})
            elif "柱状图" in bhead:
                group["items"].append({"type": "chart", **_chart(brows)})
            elif "怎么读" in bhead:
                q = [ln.strip().lstrip(">").strip() for ln in bbody.splitlines()
                     if ln.strip().startswith(">")]
                group["items"].append({"type": "note", "paras": K.paras(q)})
            else:
                m = re.match(r"^卡\s*(\d+)\s*[：:]\s*(.+)$", bhead)
                if not m:
                    continue
                emoji = ""
                name = m.group(2).strip()
                mm = re.match(r"^(\S+)\s+(.*)$", name)
                if mm and not re.match(r"^[\u4e00-\u9fa5]", mm.group(1)):
                    emoji, name = mm.group(1), mm.group(2)
                wide = "通栏" in bhead
                name = re.sub(r"（[^）]*）$", "", name).strip()
                group["items"].append({
                    "type": "industry", "no": m.group(1), "emoji": emoji, "name": name,
                    "wide": wide,
                    "body": " ".join(K.paras(K.pick(brows, "正文", field="quote"))),
                    "fact": " ".join(K.paras(K.pick(brows, "微事", field="quote"))),
                })
        doc["groups"].append(group)
    return doc


# ------------------------------------------------------------------ 渲染

def _timeline_tile(entries: list[dict]) -> str:
    items = "".join(
        '<li class="tl-item">'
        f'<span class="tl-when">{K.esc(e["when"])}</span>'
        + "".join(f"<p>{K.rich(p)}</p>" for p in e["paras"])
        + "</li>"
        for e in entries
    )
    return K.tile("timeline", f'<ol class="tl">{items}</ol>', span=4, tag="时间线")


def _people_tile(people: dict) -> str:
    icons = []
    for i in range(10):
        fill = 1 if i < 3 else (0.6 if i == 3 else 0)
        style = f"--fill:{fill}"
        icons.append(f'<span class="pp-figure" style="{style}" aria-hidden="true"></span>')
    return K.tile(
        "people",
        '<div class="pp-grid" role="img" aria-label="' + K.esc(people["aria"]) + '">'
        + "".join(icons) + "</div>"
        f'<p class="pp-label">{K.rich(people["label"])}</p>'
        f'<p class="pp-source">{K.esc(people["source"])}</p>',
        span=2, tag="示意图",
    )


def _stat_tiles(stats: list[dict]) -> str:
    return "".join(
        K.tile("stat",
               f'<p class="st-big">{K.esc(s["big"])}</p>'
               f'<p class="st-small">{K.esc(s["small"])}</p>',
               span=2, tag=f"数字 {s['no']}")
        for s in stats
    )


def _chart_tile(chart: dict) -> str:
    top = max((v for _, v in chart["points"]), default=1)
    bars = "".join(
        '<div class="ch-col">'
        f'<span class="ch-val">{val:g} 亿</span>'
        '<i class="ch-track">'
        f'<i class="ch-bar" style="--h:{(val / top) * 100:.1f}%"></i></i>'
        f'<span class="ch-lab">{K.esc(lab)}</span>'
        "</div>"
        for lab, val in chart["points"]
    )
    return K.tile(
        "chart",
        f'<p class="ch-legend">{K.esc(chart["legend"])}</p>'
        f'<div class="ch-plot">{bars}</div>'
        f'<p class="ch-source">{K.rich(chart["source"])}</p>',
        span=4, tag="数据",
    )


def _note_tile(paras: list[str]) -> str:
    body = "".join(f"<p>{K.rich(p)}</p>" for p in paras)
    return K.tile("note", f'<div class="nt-body">{body}</div>', span=2, tag="怎么读")


def _industry_tile(card: dict) -> str:
    span = 6 if card["wide"] else 3
    fact = (f'<p class="in-fact">{K.rich(card["fact"])}</p>'
            if card["fact"] else "")
    return K.tile(
        "industry",
        '<div class="in-head">'
        f'<span class="in-emoji" aria-hidden="true">{K.esc(card["emoji"])}</span>'
        f'<h4 class="in-name">{K.esc(card["name"])}</h4>'
        f'<span class="in-no">{K.esc(card["no"])}</span></div>'
        f'<p class="in-body">{K.rich(card["body"])}</p>'
        + fact,
        span=span,
    )


def _group_tiles(group: dict) -> tuple[str, str]:
    """返回 (tiles_html, rail_class)。"""
    tiles = []
    for item in group["items"]:
        if item["type"] == "timeline":
            tiles.append(_timeline_tile(item["entries"]))
        elif item["type"] == "people":
            tiles.append(_people_tile(item))
        elif item["type"] == "stats":
            tiles.append(_stat_tiles(item["stats"]))
        elif item["type"] == "chart":
            tiles.append(_chart_tile(item))
        elif item["type"] == "note":
            tiles.append(_note_tile(item["paras"]))
        elif item["type"] == "industry":
            tiles.append(_industry_tile(item))
    return "".join(tiles), "cardrail"


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)
    groups = "".join(
        K.group(g["title"], g["sub"], *_group_tiles(g)[:1]) for g in doc["groups"]
    )
    head = K.head(
        "THE TREND DESK / 趋势台",
        "它不是一阵风，**是电**。",
        note="下面每一件都能自己看：一条时间线、一张示意图、三个数字、一张柱状图，"
             "还有五个行业里正在发生的事。",
    )
    floor = K.castfloor(head, groups,
                        K.summary(doc["summary"]["title"], doc["summary"]["paras"])
                        if doc.get("summary") else "")
    table = ""
    if sources_md:
        rows = K.source_rows(sources_md, ("P2",))
        table = K.linktable(rows, "本页来源",
                            "数字与事件都能点开核对；标“反爬”的链接浏览器可以直接打开。")
    return floor, table
