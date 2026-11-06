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
# 排版沿用塞原文前那张趋势台：大标题两侧留白、细线分栏、数据展台压在纸上。
# 只是把原来台子自己的文案换成真源逐字。

def _lead(md: str) -> str:
    """页首导语：真源「页首标题与导语」里 lead 那两句，逐字。"""
    m = re.search(r"^(?:- )?导语[^\n]*\n((?:\s*>.*\n?)+)", md, flags=re.M)
    if not m:
        return ""
    lines = [ln.strip().lstrip(">").strip() for ln in m.group(1).splitlines()]
    return " ".join(x for x in lines if x)


def _h1(md: str) -> str:
    m = re.search(r"主标题（H1）[：:]\s*`?([^`\n]+)`?", md)
    return K.strip_md(m.group(1)) if m else ""


def _wire(entries: list[dict]) -> str:
    out = []
    for i, e in enumerate(entries):
        body = "".join(f"<p>{K.rich(p)}</p>" for p in e["paras"])
        out.append(
            '<li class="wire-item" data-reveal style="--d:%.2fs">' % min(i * 0.05, 0.3)
            + '<span class="wire-when">%s</span>' % K.esc(e["when"])
            + f'<div class="wire-body">{body}</div></li>'
        )
    return '<ol class="wire">' + "".join(out) + "</ol>"


def _people_block(people: dict) -> str:
    dots = []
    for i in range(10):
        fill = 1 if i < 3 else (0.6 if i == 3 else 0)
        dots.append(f'<span class="pp-dot" style="--fill:{fill}" aria-hidden="true"></span>')
    return (
        '<div class="trend-people" data-reveal>'
        '<div class="pp-row" role="img" aria-label="%s">%s</div>'
        '<p class="pp-caption">%s<small>%s</small></p></div>'
        % (K.esc(people["aria"]), "".join(dots),
           K.rich(people["label"]), K.esc(people["source"]))
    )


def _exhibit(stats: list[dict], chart: dict) -> str:
    top = max((v for _, v in chart["points"]), default=1)
    bars = "".join(
        '<div class="exhibit-bar%s"><span>%s</span>'
        '<b style="--length:%.0f%%">%s <small>亿人</small></b></div>'
        % (" late" if i else " early", K.esc(lab).replace(" 年 ", " / ").replace(" 月", ""),
           (val / top) * 100, ("%g" % val))
        for i, (lab, val) in enumerate(chart["points"])
    )
    metrics = "".join(
        '<span><b>%s</b><small>%s</small></span>' % (K.esc(s["big"]), K.esc(s["small"]))
        for s in stats
    )
    return (
        '<div class="data-exhibit" data-reveal>'
        f'<span class="exhibit-eyebrow">{K.esc(chart["legend"])}</span>'
        f'<div class="exhibit-metrics">{metrics}</div>'
        f'<div class="exhibit-axis">{bars}</div>'
        f'<p class="exhibit-source">{K.rich(chart["source"])}</p></div>'
    )


def _rows(items: list[dict]) -> str:
    out = []
    for i, item in enumerate(items):
        fact = (f'<p class="row-fact">{K.rich(item["fact"])}</p>' if item["fact"] else "")
        out.append(
            '<li class="trend-row" data-reveal style="--d:%.2fs">' % min(i * 0.06, 0.36)
            + f'<span class="row-no">{K.esc(item["no"]).zfill(2)}</span>'
            + '<div class="row-main">'
            + f'<h3><span aria-hidden="true">{K.esc(item["emoji"])}</span>{K.esc(item["name"])}</h3>'
            + f'<p class="row-body">{K.rich(item["body"])}</p>'
            + fact + "</div></li>"
        )
    return '<ul class="trend-rows">' + "".join(out) + "</ul>"


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)

    def group(key: str) -> dict:
        for g in doc["groups"]:
            if key in g["title"]:
                return g
        return {"title": "", "sub": "", "items": []}

    g_time, g_num, g_trade = group("这两年"), group("数字"), group("各行各业")

    def item(g: dict, kind: str) -> dict:
        for it in g["items"]:
            if it["type"] == kind:
                return it
        return {}

    timeline = _wire(item(g_time, "timeline").get("entries", []))
    people = _people_block(item(g_time, "people")) if item(g_time, "people") else ""
    exhibit = _exhibit(item(g_num, "stats").get("stats", []),
                       item(g_num, "chart") or {"legend": "", "points": [], "source": ""})
    note = item(g_num, "note")
    note_html = ""
    if note:
        note_html = ('<div class="trend-note" data-reveal>'
                     + "".join(f"<p>{K.rich(p)}</p>" for p in note["paras"]) + "</div>")

    head_one = g_time["title"] or "这两年，发生了什么"
    head_two = g_num["title"] or "数字最诚实：半年翻一番"
    head_three = g_trade["title"] or "各行各业，正在被改写"

    summary = ""
    if doc.get("summary"):
        summary = (
            '<section class="trend-close" data-reveal>'
            f'<span class="trend-kicker">{K.esc(doc["summary"]["title"])}</span>'
            + "".join(f"<p>{K.rich(p)}</p>" for p in doc["summary"]["paras"])
            + "</section>"
        )

    world = (
        '<div class="trend-world">'
        '<section class="trend-opening">'
        '<div class="opening-copy">'
        f'<span class="eyebrow"><span class="live-dot"></span>{K.esc(_h1(md))}</span>'
        "<h1>它不是风，<br><em>是电</em></h1>"
        "</div>"
        f'<p class="trend-lead">{K.rich(_lead(md))}</p>'
        "</section>"

        '<section class="trend-block" aria-labelledby="trend-t1">'
        '<header class="trend-block-head">'
        '<span class="trend-kicker">01 / TIMELINE</span>'
        f'<h2 id="trend-t1">{K.esc(head_one)}</h2></header>'
        + timeline + people +
        "</section>"

        '<section class="trend-block" aria-labelledby="trend-t2">'
        '<header class="trend-block-head">'
        '<span class="trend-kicker">02 / THE NUMBER</span>'
        f'<h2 id="trend-t2">{K.esc(head_two)}</h2></header>'
        f'<div class="trend-data">{exhibit}{note_html}</div>'
        "</section>"

        '<section class="trend-block" aria-labelledby="trend-t3">'
        '<header class="trend-block-head">'
        '<span class="trend-kicker">03 / INDUSTRIES</span>'
        f'<h2 id="trend-t3">{K.esc(head_three)}</h2></header>'
        + _rows(g_trade["items"]) +
        "</section>"

        + summary +
        "</div>"
    )

    table = ""
    if sources_md:
        rows = K.source_rows(sources_md, ("P2",))
        table = K.linktable(rows, "本页来源",
                            "数字与事件都能点开核对；标“反爬”的链接浏览器可以直接打开。")
    return world, table


# ------------------------------------------------- 老趋势台的数据层（分拣情报）

def desk_js(md: str) -> str:
    """把 p2 真源里「各行各业」五张卡 + 用户规模数字，导成老趋势台能吃的数据。

    每张行业卡给两条情报：报告里的观察（已查证）、能自己验证的一件小事（可小试）；
    再加一条全场共用的用户规模情报。文案全部逐字来自真源。
    """
    import json

    doc = parse(md)
    groups = {g["title"]: g for g in doc["groups"]}
    industries = [i for g in doc["groups"] for i in g["items"] if i["type"] == "industry"]
    note = ""
    for g in doc["groups"]:
        for it in g["items"]:
            if it["type"] == "note":
                note = " ".join(it["paras"])
    scale = ""
    for g in doc["groups"]:
        for it in g["items"]:
            if it["type"] == "stats":
                for st in it["stats"]:
                    pass
    # 用户规模那条：真源「怎么读这个数」里的原句
    m = re.search(r"(\d{4} 年底全国才 [^。]*。)", note)
    scale = m.group(1) if m else note.split("。")[0] + "。"

    shared = {
        "id": "users", "short": "用户规模",
        "title": scale,
        "source": "CNNIC · 2025 年报告",
        "correct": "fact",
    }
    slugs = ["ecom", "selfmedia", "finance", "office", "edu"]
    tracks = {}
    for slug, ind in zip(slugs, industries):
        body = ind["body"]
        obs, _, hint = body.partition("**对你的启示：**")
        obs = obs.strip().rstrip("。") + "。" if obs else body
        hint = hint.strip()
        cards = [
            shared,
            {"id": "obs", "short": "报告里的观察", "title": obs,
             "source": "CNNIC 报告 · 行业应用", "correct": "fact"},
            {"id": "try", "short": "能自己试一件", "title": ind["fact"],
             "source": "低风险 · 能自己验证", "correct": "test",
             "why": hint,
             "plan": [ind["fact"], hint] if hint else [ind["fact"]]},
        ]
        tracks[slug] = {
            "name": ind["name"],
            "caution": hint or "先用虚构素材试做一件小事；拿不准的，回真源核对。",
            "cards": cards,
        }
    payload = {
        "bins": {"fact": "已查证", "test": "可小试"},
        "tracks": tracks,
        "done": "两条都已核对 · 可以选一个试验",
        "count": "两条",
    }
    return ("/* 02 / 趋势台数据层：由 docs/content/p2-trends.md 生成，勿手改。 */\n"
            "window.TREND_DESK = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n")
