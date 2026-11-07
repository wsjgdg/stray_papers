#!/usr/bin/env python3
"""⑥ 关「提示词学院」：三要素芯片、示例提示词、一道可以亲手点的测验、
Agent 四步流程图、五张毕业任务卡。文案全部来自 docs/content/p6-academy.md。
"""

from __future__ import annotations

import json
import re

import deckkit as K


def _quotes(body: str) -> list[str]:
    return K.paras([ln.strip().lstrip(">").strip() for ln in body.splitlines()
                    if ln.strip().startswith(">")])


def _numbered(body: str) -> list[dict]:
    out, cur = [], None
    for raw in body.splitlines():
        s = raw.strip()
        m = re.match(r"^\d+\.\s+(.*)$", s)
        if m:
            text = m.group(1).strip()
            key, sep, val = text.partition("——")
            if not sep and " · " not in text:
                key, sep, val = text.partition("：")
            cur = {"head": key.strip("* "), "body": val.strip(), "quote": []}
            out.append(cur)
            continue
        if cur is None:
            continue
        if s.startswith(">"):
            cur["quote"].append(s.lstrip(">").strip())
        elif s.startswith("（") and not cur["body"]:
            cur["body"] = s.strip("（）")
    for item in out:
        item["paras"] = K.paras(item["quote"])
    return out


def _split_emoji(text: str) -> tuple[str, str]:
    m = re.match(r"^(\S+)\s+(.+)$", text)
    if m and not re.match(r"^[\u4e00-\u9fa5]", m.group(1)):
        return m.group(1), m.group(2)
    return "", text


def _numbered_lines(body: str) -> list[str]:
    out = []
    for raw in body.splitlines():
        m = re.match(r"^\s+\d+\.\s+(.*)$", raw)
        if m:
            out.append(K.strip_md(m.group(1).strip()))
    return out


def _plain_links(text: str) -> str:
    return re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text or "")


def parse(md: str) -> dict:
    doc = {"lesson1": {}, "quiz": {}, "lesson3": {}, "tasks": [], "summary": None}
    for head, body in K.sections(md):
        rows = K.bullets(body)
        if head.startswith("2."):
            chips = _numbered_lines(body)
            doc["lesson1"] = {
                "title": K.strip_md(K.pick(rows, "H2 标题")),
                "chips": chips,
                "lead": " ".join(K.paras(K.pick(rows, "示例卡引导句", field="quote"))),
                "example": " ".join(K.paras(K.pick(rows, "示例气泡", field="quote"))),
                "foot": " ".join(K.paras(K.pick(rows, "示例卡脚注", field="quote"))),
            }
        elif head.startswith("3."):
            quiz = {"title": K.strip_md(K.pick(rows, "H2 标题")),
                    "lead": " ".join(K.paras(K.pick(rows, "题目引导", field="quote"))),
                    "options": [], "answers": {}}
            for key, row in rows:
                if "选项" in key:
                    text = K.strip_md(row["val"])
                    text = re.split(r"\s*点击后的", text)[0].rstrip("。 ")
                    quiz["options"].append(text)
            for bhead, bbody in K.blocks(body):
                m = re.match(r"^([ABC])\s*档", bhead)
                if not m:
                    continue
                brows = K.bullets(bbody)
                note = " ".join(K.paras(K.pick(brows, "点评", field="quote")))
                note = re.split(r"\*{0,2}编辑约定", note)[0].strip()
                quiz["answers"][m.group(1)] = {
                    "reply": " ".join(K.paras(K.pick(brows, "AI 回答气泡", field="quote"))),
                    "note": note,
                }
            doc["quiz"] = quiz
        elif head.startswith("4."):
            steps = _numbered_lines(body)
            doc["lesson3"] = {
                "title": K.strip_md(K.pick(rows, "H2 标题")),
                "plain": " ".join(K.paras(K.pick(rows, "概念对比", field="quote"))),
                "steps": steps,
                "close": " ".join(K.paras(K.pick(rows, "收尾段", field="quote"))),
            }
        elif head.startswith("5."):
            doc["tasks_title"] = K.strip_md(K.pick(rows, "H2 标题"))
            lead_buf = []
            for raw in body.splitlines():
                line = raw.strip()
                if re.match(r"^\d+\.\s", line):
                    break
                if line.startswith(">"):
                    lead_buf.append(line.lstrip(">").strip())
            doc["tasks_lead"] = " ".join(K.paras(lead_buf))
            for item in _numbered(body):
                emoji, rest = _split_emoji(item["head"])
                name, _, tagline = rest.partition(" · ")
                body_text = " ".join(item["paras"]) or item["body"]
                code, sep, label = rest.partition(" · ")
                if not sep:
                    code, label = tagline or name, name
                doc["tasks"].append({
                    "emoji": emoji, "code": code.strip(),
                    "name": re.sub(r"\*\*|（[^）]*）$", "", label).strip(),
                    "body": _plain_links(K.strip_md(body_text)),
                    "accent": code.strip() == "L5",
                })
        elif head.startswith("6."):
            doc["summary"] = {
                "title": K.strip_md(K.pick(rows, "卡片标题")),
                "paras": K.paras(K.pick(rows, "正文", field="quote")),
            }
    return doc


# ------------------------------------------------------------------ 渲染

def _chips_tiles(chips: list[str]) -> str:
    out = []
    for idx, chip in enumerate(chips):
        num = re.match(r"^([①②③④])\s*(.*)$", chip)
        mark = num.group(1) if num else str(idx + 1)
        rest = num.group(2) if num else chip
        name, _, tail = rest.partition("——")
        out.append(K.tile(
            "chip",
            f'<span class="cp-mark" aria-hidden="true">{K.esc(mark)}</span>'
            f'<p class="cp-name">{K.esc(name.strip())}</p>'
            + (f'<p class="cp-why">{K.rich(tail.strip())}</p>' if tail.strip() else ""),
            span=2,
        ))
    return "".join(out)


def _prompt_tile(l1: dict) -> str:
    return K.tile(
        "prompt",
        (f'<p class="pr-lead">{K.rich(l1["lead"])}</p>' if l1["lead"] else "")
        + f'<p class="pr-body">{K.rich(l1["example"])}</p>'
        + (f'<p class="pr-foot">{K.rich(l1["foot"])}</p>' if l1["foot"] else ""),
        span=6, tag="示例 · 正是你用得上的",
    )


def _quiz_piece(quiz: dict) -> str:
    data = {
        "answers": quiz["answers"],
        "labels": [K.strip_md(o.split("：", 1)[-1]) if "：" in o else o for o in quiz["options"]],
        "grades": [o.split("：")[0].strip() for o in quiz["options"]],
    }
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    opts = ""
    for idx, opt in enumerate(quiz["options"]):
        grade = data["grades"][idx][:1].strip()
        label = data["labels"][idx]
        opts += (f'<button type="button" class="qz-opt" data-grade="{K.esc(grade)}">'
                 f'<span class="qz-key">{K.esc(grade)}</span>{K.esc(label)}</button>')
    return (
        '<div class="floor-group">'
        '<div class="floor-group-head">'
        f'<h3 class="floor-group-title">{K.esc(quiz["title"])}</h3>'
        "</div>"
        '<div class="cardrail">'
        '<article class="tile tile--quiz" style="--span:6">'
        '<span class="tile-tag">点一个试试 · 三个都能点</span>'
        f'<p class="qz-lead">{K.rich(quiz["lead"])}</p>'
        f'<div class="qz-opts" role="group" aria-label="三种问法">{opts}</div>'
        '<div class="qz-reply" id="qz-reply" hidden>'
        '<p class="qz-who">AI 的回答 <span class="qz-demo">演示样例 · 非真实模型输出</span></p>'
        '<p class="qz-text" id="qz-text"></p>'
        '<p class="qz-note" id="qz-note"></p>'
        "</div>"
        '<noscript><p class="qz-nojs">这一题需要脚本才能点；三档答案分别是：A 只说要「感人」——AI 只好反问你要什么；B 说了主题和字数——写出来却是谁都能用的通用文章；C 说了角色、听众、字数、口吻和结尾动作——一次就能用。</p></noscript>'
        f'<script type="application/json" id="qz-data">{payload}</script>'
        "</article></div></div>"
    )


def _agent_group(l3: dict) -> str:
    plain = re.sub(r"\s*\*\*AI Agent", "\n\n**AI Agent", l3["plain"] or "")
    compare = "".join(
        f'<p class="ag-line">{K.rich(p)}</p>' for p in plain.split("\n\n") if p.strip()
    )
    steps = ""
    for step in l3["steps"]:
        m = re.match(r"^([①②③④])\s*(.*)$", step)
        mark = m.group(1) if m else ""
        rest = m.group(2) if m else step
        head, _, tail = rest.partition("——")
        steps += ('<li class="ag-step">'
                  f'<span class="ag-mark" aria-hidden="true">{K.esc(mark)}</span>'
                  f'<span class="ag-head">{K.esc(head.strip())}</span>'
                  f'<span class="ag-tail">{K.rich(tail.strip())}</span></li>')
    tiles = (
        K.tile("agent", f'<div class="ag-compare">{compare}</div>', span=3)
        + K.tile("agent", f'<ol class="ag-flow">{steps}</ol>', span=3)
    )
    return K.group(l3["title"], "你给它一个目标，它自己拆步骤", tiles)


def _task_tiles(tasks: list[dict]) -> str:
    out = []
    for task in tasks:
        out.append(K.tile(
            "task" + (" task--accent" if task["accent"] else ""),
            '<div class="in-head">'
            f'<span class="in-emoji" aria-hidden="true">{K.esc(task["emoji"])}</span>'
            f'<h4 class="in-name">{K.esc(task["name"])}</h4>'
            f'<span class="tk-code">{K.esc(task["code"])}</span></div>'
            f'<p class="tk-body">{K.rich(task["body"])}</p>',
            span=2,
        ))
    return "".join(out)


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)
    groups = []
    l1 = doc.get("lesson1") or {}
    if l1.get("chips"):
        groups.append(K.group(l1["title"], "一句话说清三件事，AI 立刻不一样",
                              _chips_tiles(l1["chips"]) + _prompt_tile(l1)))
    if doc.get("quiz"):
        groups.append(_quiz_piece(doc["quiz"]))
    if doc.get("lesson3"):
        groups.append(_agent_group(doc["lesson3"]))
    if doc.get("tasks"):
        groups.append(K.group(doc.get("tasks_title", "毕业探索任务"),
                              doc.get("tasks_lead", ""), _task_tiles(doc["tasks"])))
    head = K.head(
        "THE ACADEMY / 提示词学院",
        "同一个 AI，问法不同，**结果差十倍**。",
        note="台面上三块芯片是公式，中间那道题你可以亲手点三遍；"
             "最下面五张卡，是毕业前要做的五件事。",
    )
    summary = K.summary(doc["summary"]["title"], doc["summary"]["paras"]) if doc.get("summary") else ""
    floor = K.castfloor(head, "".join(groups), summary)
    return floor, ""
