#!/usr/bin/env python3
"""④ 关「副业地图」：三层路线各摆成一组台面物件——每条路一张卡，
卡上有正文、三步路线、工具箱和一句风险提示。文案全部来自 p4-side-jobs.md。
"""

from __future__ import annotations

import re

import deckkit as K


def _clean(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "")).strip()


def _strip_label(t: str) -> str:
    """去掉 `工具行（🧰）：` 这类维护标签，只留页面上要说的话。"""
    t = re.sub(r"^\*\*[^*]+\*\*\s*[：:]\s*", "", t)
    t = re.sub(r"^[^：:]{0,12}[（(][^）)]{0,12}[）)]\s*[：:]\s*", "", t)
    t = re.sub(r"^[^：:]{1,8}[：:]\s*", "", t)
    return t.strip()


def _card(head: str, body: str) -> dict:
    name = ""
    m = re.search(r"「(.+?)」", head)
    if m:
        name = m.group(1)
    emoji, label = "", name
    mm = re.match(r"^(\S+)\s+(.+)$", name)
    if mm and not re.match(r"^[\u4e00-\u9fa5]", mm.group(1)):
        emoji, label = mm.group(1), mm.group(2)

    card = {"emoji": emoji, "name": label, "paras": [], "steps": [],
            "tools": "", "risk": "", "note": "", "warn": ""}
    para: list[str] = []
    mode = None

    def flush():
        if para:
            card["paras"].extend(K.paras(list(para)))
            para.clear()

    for raw in body.splitlines():
        line = raw.rstrip()
        s = line.strip()
        if not s:
            flush()
            mode = None
            continue
        if mode == "warn" and s.startswith(">"):
            card.setdefault("warnq", []).append(s.lstrip(">").strip())
            continue
        if s.startswith(">"):
            para.append(s.lstrip(">").strip())
            continue
        m = re.match(r"^\d+\.\s+(.*)$", s)
        if m:
            flush()
            card["steps"].append(m.group(1).strip())
            mode = "steps"
            continue
        m = re.match(r"^[-*]\s+(.*)$", s)
        if m:
            flush()
            text = m.group(1).strip()
            if "工具行" in text or text.startswith("**工具行"):
                card["tools"] = _clean(_strip_label(text))
                mode = "tools"
            elif "风险行" in text:
                card["risk"] = _clean(_strip_label(text))
                mode = "risk"
            elif "节奏备注" in text:
                card["note"] = _clean(_strip_label(text))
                mode = None
            elif "避坑警示框" in text:
                card["warn"] = "1"
                mode = "warn"
            else:
                mode = None
            continue
        if mode == "warn":
            card.setdefault("warnq", []).append(s.lstrip(">").strip())
            continue
        if para:
            para.append(s)
    flush()
    if card.get("warnq"):
        card["warn"] = " ".join(K.paras(card.pop("warnq")))
    return card


def parse(md: str) -> dict:
    doc = {"groups": [], "income": None, "warn": ""}
    for head, body in K.sections(md):
        if "层卡片" in head:
            rows = K.bullets(body)
            group = {
                "title": K.strip_md(K.pick(rows, "卡片标题")),
                "level": K.strip_md(K.pick(rows, "层级标签")),
                "lead": " ".join(K.paras(K.pick(rows, "层引导句", field="quote"))),
                "items": [],
            }
            for bhead, bbody in K.blocks(body):
                if "子卡" not in bhead:
                    continue
                card = _card(bhead, bbody)
                if card["warn"]:
                    doc["warn"] = card["warn"]
                    card["warn"] = ""
                doc["warn_text"] = doc.get("warn_text", "")
                group["items"].append(card)
            doc["groups"].append(group)
        elif "收入预期" in head:
            rows = K.bullets(body)
            paras = []
            for key, row in rows:
                for para in K.paras(row["quote"]):
                    para = re.split(r"\*\*编辑约定\*\*", para)[0].strip()
                    if para:
                        paras.append(para)
            doc["income"] = {"title": K.strip_md(K.pick(rows, "卡片标题")), "paras": paras}
    return doc


# ------------------------------------------------------------------ 渲染

def _steps(steps: list[str]) -> str:
    if not steps:
        return ""
    items = []
    for step in steps:
        m = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", step)
        if m:
            items.append(f'<li><b>{K.esc(m.group(1).rstrip("：:"))}</b>{K.rich(m.group(2))}</li>')
        else:
            items.append(f"<li>{K.rich(step)}</li>")
    return '<ol class="rt-steps">' + "".join(items) + "</ol>"


def _route_tile(card: dict, span: int = 3) -> str:
    body = "".join(f'<p class="rt-body">{K.rich(p)}</p>' for p in card["paras"])
    tools = f'<p class="rt-tools">🧰 {K.rich(card["tools"])}</p>' if card["tools"] else ""
    risk = f'<p class="rt-risk">⚠️ {K.rich(card["risk"])}</p>' if card["risk"] else ""
    note = f'<p class="rt-note">{K.rich(card["note"])}</p>' if card["note"] else ""
    return K.tile(
        "route",
        '<div class="in-head">'
        f'<span class="in-emoji" aria-hidden="true">{K.esc(card["emoji"])}</span>'
        f'<h4 class="in-name">{K.esc(card["name"])}</h4></div>'
        + body + _steps(card["steps"]) + tools + risk + note,
        span=span,
    )


def _warn_tile(text: str) -> str:
    return K.tile("warn", f'<p class="wn-text">{K.rich(text)}</p>', span=6)


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)
    groups = []
    for idx, g in enumerate(doc["groups"]):
        span = 2 if len(g["items"]) == 3 else 3
        tiles = ""
        if g["lead"]:
            tiles += K.tile("lead", f'<p class="ld-text">{K.rich(g["lead"])}</p>', span=6)
        tiles += "".join(_route_tile(c, span=span) for c in g["items"])
        if idx == 2 and doc.get("warn"):
            tiles += _warn_tile(doc["warn"])
        groups.append(K.group(g["title"], g["level"], tiles))
    if doc.get("income"):
        income = K.tile(
            "note",
            '<div class="nt-body">'
            + "".join(f"<p>{K.rich(p)}</p>" for p in doc["income"]["paras"])
            + "</div>",
            span=6, tag=doc["income"]["title"],
        )
        groups.append('<div class="floor-group floor-group--tail">'
                      '<div class="cardrail">' + income + "</div></div>")
    head = K.head(
        "THE ROUTE MAP / 路线图",
        "三条路都铺在台面上，**先挑，别急着决定**。",
        note="一层不用学，第二层学 1-3 个月，第三层值得下功夫。每张卡都写了第一步怎么走。",
    )
    floor = K.castfloor(head, "".join(groups))
    table = ""
    if sources_md:
        rows = K.source_rows_urls(sources_md, "第④关")
        table = K.linktable(rows, "本页工具与依据",
                            "工具都能免费开始用；两条合规依据是国家机关公开文件，点开可核对原文。",
                            by="工具 / 依据")
    return floor, table
