#!/usr/bin/env python3
"""⑤ 关「骗局解剖室」：台面正中一台可以自己走一遍的骗局模拟器（八幕，
逐字取自 p5-anti-scam.md），旁边是五张心理开关、六句话术、三件工具、两张数字卡。
"""

from __future__ import annotations

import json
import re

import deckkit as K


def _quotes(body: str) -> list[str]:
    return K.paras([ln.strip().lstrip(">").strip() for ln in body.splitlines()
                    if ln.strip().startswith(">")])


def _named_items(body: str) -> list[dict]:
    items, cur = [], None
    for raw in body.splitlines():
        s = raw.strip()
        m = re.match(r"^\d+\.\s+\*\*(.+?)\*\*\s*(.*)$", s)
        if m:
            cur = {"name": m.group(1).strip(), "rest": m.group(2).strip(), "subs": {}}
            items.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r"^[-*]\s+(.+)$", s)
        if m:
            text = m.group(1).strip()
            key, sep, val = text.partition("：")
            if not sep:
                key, sep, val = text.partition(": ")
            cur["subs"][key.strip("* ")] = val.strip()
            continue
        if s.startswith(">"):
            cur["rest"] = (cur["rest"] + " " + s.lstrip(">").strip()).strip()
    return items


def _report(body: str) -> dict:
    """`- 真实报道（…）：标题 · 媒体——摘要：URL （验证 200）`"""
    m = re.search(r"真实报道[^\n]*", body)
    if not m:
        return {}
    line = m.group(0)
    url = ""
    um = re.search(r"https?://[^\s）)；;]+", line)
    if um:
        url = um.group(0)
    text = re.split(r"[：:]\s*https?://", line)[0]
    text = re.sub(r"^真实报道[^：:]*[：:]\s*", "", text)
    return {"src": text.replace("（验证 200）", "").strip(), "url": url}


def _exact(rows, name: str, field: str = "val"):
    for key, row in rows:
        if key.strip() == name:
            return row[field]
    return "" if field == "val" else []


def _acts(body: str) -> list[dict]:
    acts = []
    for head, chunk in K.blocks(body, level=4):
        m = re.match(r"^第\s*(\d+)\s*幕\s*[·.]\s*(.+)$", head)
        if not m:
            continue
        rows = K.bullets(chunk)
        acts.append({
            "no": int(m.group(1)),
            "name": re.sub(r"（[^）]*）$", "", m.group(2)).strip(),
            "speaker": K.strip_md(K.pick(rows, "说话人")),
            "line": " ".join(K.paras(K.pick(rows, "台词", field="quote"))),
            "aTitle": K.strip_md(K.pick(rows, "解剖卡标题")),
            "aBody": " ".join(K.paras(_exact(rows, "解剖", "quote"))),
            "right": " ".join(K.paras(K.pick(rows, "正确动作", field="quote"))),
            "report": _report(chunk),
        })
    return acts


def parse(md: str) -> dict:
    doc = {"sim": None, "acts": [], "sides": {}, "finish": {},
           "mech": [], "phrases": [], "tools": [], "numbers": [], "summary": None}
    for head, body in K.sections(md):
        if head.startswith("2."):
            rows = K.bullets(body)
            chain = []
            for key, row in rows:
                if "进度链条" in key:
                    chain = [x.strip() for x in "".join(row["quote"]).split("→") if x.strip()]
            badge = re.search(r"真实报道声明[^\n]*", body)
            doc["sim"] = {
                "title": K.strip_md(K.pick(rows, "H2 标题")),
                "chain": chain,
                "note": " ".join(K.paras(K.pick(rows, "操作提示卡", field="quote"))),
                "badge": (re.split(r"[：:]", badge.group(0), 1)[-1].strip() if badge else ""),
            }
            doc["acts"] = _acts(body)
            for bhead, bbody in K.blocks(body):
                brows = K.bullets(bbody)
                if "张姐" in bhead:
                    doc["sides"]["3"] = {
                        "label": re.sub(r"」.*$", "", K.strip_md(K.pick(brows, "按钮文字")).lstrip("「")),
                        "line": " ".join(K.paras(K.pick(brows, "张姐发言", field="quote"))),
                        "title": K.strip_md(K.pick(brows, "解剖卡标题")),
                        "body": " ".join(K.paras(K.pick(brows, "解剖正文", field="quote"))),
                    }
                elif "给儿子打电话" in bhead:
                    t = re.search(r"标题[：:]\s*(.+)", bbody)
                    doc["sides"]["7"] = {
                        "label": re.sub(r"」.*$", "", K.strip_md(K.pick(brows, "按钮文字")).lstrip("「")),
                        "title": K.strip_md(t.group(1)) if t else "",
                        "body": " ".join(K.paras([ln.strip().lstrip(">").strip()
                                                  for ln in bbody.splitlines()
                                                  if ln.strip().startswith(">")])),
                    }
                elif "提前下车" in bhead:
                    doc["finish"]["earlyTitle"] = K.strip_md(K.pick(brows, "标题"))
                    if not doc["finish"]["earlyTitle"]:
                        m2 = re.search(r"标题[：:]\s*(.+)", bbody)
                        if m2:
                            doc["finish"]["earlyTitle"] = K.strip_md(m2.group(1))
                    doc["finish"]["early"] = " ".join(_quotes(bbody).__class__(x) if False else
                                                     K.paras([ln.strip().lstrip(">").strip()
                                                              for ln in bbody.splitlines()
                                                              if ln.strip().startswith(">")]))
                elif "结束区" in bhead:
                    flat = [ln.strip() for ln in bbody.splitlines()]
                    for line in flat:
                        text = line.lstrip("-* ").strip()
                        if text.startswith("提前下车"):
                            doc["finish"]["earlyDone"] = K.strip_md(re.sub(r"^提前下车[：:]\s*", "", text))
                        elif text.startswith("走了") or "再投一点" in text:
                            doc["finish"]["bet"] = K.strip_md(re.sub(r"^[^：:]*[：:]\s*", "", text))
                        elif text.startswith("其他"):
                            doc["finish"]["plain"] = K.strip_md(re.sub(r"^其他[：:]\s*", "", text))
        elif head.startswith("3."):
            doc["mech"] = _named_items(body)
        elif head.startswith("4."):
            doc["phrases"] = _named_items(body)
        elif head.startswith("5."):
            doc["tools"] = _named_items(body)
        elif head.startswith("6."):
            for bhead, bbody in K.blocks(body):
                rows = K.bullets(bbody)
                big = K.strip_md(K.pick(rows, "大数字"))
                if not big:
                    continue
                doc["numbers"].append({
                    "big": re.split(r"\s*·|（|\(", big)[0].strip(),
                    "body": " ".join(K.paras(K.pick(rows, "正文", field="quote"))),
                    "source": " ".join(K.paras(K.pick(rows, "来源行", field="quote"))),
                })
        elif head.startswith("7."):
            rows = K.bullets(body)
            paras = []
            for para in K.paras(K.pick(rows, "正文", field="quote")):
                for piece in re.split(r"(?=②)", para):
                    if piece.strip():
                        paras.append(piece.strip())
            doc["summary"] = {"title": K.strip_md(K.pick(rows, "卡片标题")), "paras": paras}
    return doc


# ------------------------------------------------------------------ 渲染

def _sim_bay(doc: dict) -> str:
    sim = doc["sim"]
    chain = "".join(f"<li>{K.esc(x)}</li>" for x in sim["chain"])
    data = {
        "acts": doc["acts"],
        "sides": doc["sides"],
        "finish": doc["finish"],
        "chain": sim["chain"],
    }
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return (
        '<div class="floor-group floor-group--bay">'
        '<div class="floor-group-head">'
        f'<h3 class="floor-group-title">{K.esc(sim["title"])}</h3>'
        f'<p class="floor-group-sub">{K.rich(sim["badge"])}</p>'
        "</div>"
        f'<ol class="bay-chain" aria-label="八幕进度">{chain}</ol>'
        '<div class="sim" id="scam-sim">'
        '<div class="sim-bar">'
        '<span class="sim-act" id="sim-act">第 1 幕 · 共 8 幕</span>'
        '<span class="sim-badge">🎭 模拟演示 · 非真实群聊</span>'
        "</div>"
        '<div class="sim-feed" id="sim-feed" aria-live="polite" aria-atomic="false"></div>'
        '<div class="sim-anatomy" id="sim-anatomy" hidden></div>'
        '<div class="sim-actions" id="sim-actions">'
        '<button type="button" class="sim-next" id="sim-next">继续 →</button>'
        '<button type="button" class="sim-reset" id="sim-reset" hidden>重新走一遍</button>'
        "</div>"
        "<noscript><p class=\"sim-nojs\">这台模拟器需要脚本；下面是同一套剧本的文字版：第 1 幕专家人设 → 甜头 → 稀缺 → 下载 App → 账面诱惑 → 提现收费 → 情感施压 → 收网。</p></noscript>"
        "</div>"
        f'<script type="application/json" id="sim-data">{payload}</script>'
        f'<p class="bay-note">{K.rich(sim["note"])}</p>'
        "</div>"
    )


def _mech_tile(item: dict, idx: int) -> str:
    says = item["subs"].get("骗子会说", "")
    why = item["subs"].get("解释", item["rest"])
    return K.tile(
        "mech",
        f'<p class="mc-name">{K.esc(item["name"])}</p>'
        + (f'<p class="mc-says">骗子会说：{K.rich(says)}</p>' if says else "")
        + (f'<p class="mc-why">{K.rich(why)}</p>' if why else ""),
        span=2, tag=f"开关 {idx:02d}",
    )


def _phrase_tile(item: dict, idx: int) -> str:
    why = re.sub(r"^[—–-]+\s*", "", item["rest"])
    return K.tile(
        "phrase",
        f'<p class="ph-says">{K.esc(item["name"])}</p>'
        + (f'<p class="ph-why">{K.rich(why)}</p>' if why else ""),
        span=2, tag=f"话术 {idx:02d}",
    )


def _tool_tile(item: dict) -> str:
    url = ""
    for key, val in item["subs"].items():
        m = re.search(r"https?://[^\s）)；;]+", val)
        if m:
            url = m.group(0)
            break
    host = re.sub(r"^https?://", "", url).split("/")[0] if url else ""
    return K.tile(
        "tool",
        f'<p class="tk-name">{K.esc(item["name"])}</p>'
        + (f'<p class="tk-use">{K.rich(item["rest"])}</p>' if item["rest"] else "")
        + (f'<p class="tk-link"><a href="{K.esc(url)}" target="_blank" rel="noopener noreferrer">'
           f'官方来源：{K.esc(host)}<span aria-hidden="true"> ↗</span></a></p>' if url else ""),
        span=2,
    )


def _number_tile(num: dict) -> str:
    return K.tile(
        "stat",
        f'<p class="st-big">{K.esc(num["big"])}</p>'
        + f'<p class="st-small">{K.rich(num["body"])}</p>'
        + (f'<p class="st-src">{K.rich(num["source"])}</p>' if num["source"] else ""),
        span=3,
    )


def render(md: str, sources_md: str = "") -> tuple[str, str]:
    doc = parse(md)
    groups = []
    if doc["sim"] and doc["acts"]:
        groups.append(_sim_bay(doc))
    if doc["mech"]:
        tiles = "".join(_mech_tile(m, i + 1) for i, m in enumerate(doc["mech"]))
        groups.append(K.group("第二场：骗子心理学", "他们赌的就是“你想赚钱”", tiles))
    if doc["phrases"]:
        tiles = "".join(_phrase_tile(p, i + 1) for i, p in enumerate(doc["phrases"]))
        groups.append(K.group("第三场：话术词典", "听到这些词，先停三秒", tiles))
    if doc["tools"]:
        tiles = "".join(_tool_tile(t) for t in doc["tools"])
        groups.append(K.group("第四场：赚钱之前的 5 分钟", "查这三样，再决定", tiles))
    if doc["numbers"]:
        tiles = "".join(_number_tile(n) for n in doc["numbers"])
        groups.append(K.group("数字不会说谎", "为什么这一关最重要", tiles))
    head = K.head(
        "THE DISSECTION ROOM / 解剖室",
        "剧本是**模拟的**，套路是真的。",
        note="台面正中那台模拟器可以自己走一遍；旁边五张是骗子反复按的开关，"
             "六句话术、三件工具、两个数字，都是能查证的。",
    )
    summary = K.summary(doc["summary"]["title"], doc["summary"]["paras"]) if doc.get("summary") else ""
    floor = K.castfloor(head, "".join(groups), summary)
    table = ""
    if sources_md:
        rows = K.source_rows_urls(sources_md, "第⑤关")
        table = K.linktable(rows, "本页来源",
                            "每一幕底下都挂着一条真实案件报道；剧本本身是综合示意，不是某个具体案件。",
                            by="对应")
    return floor, table


# ------------------------------------------------------------------ 老引擎数据
# 塞原文前那套七幕决策室（prototype.js initScam）读 window.SCAM_SCRIPT。
# 现在把真源的八幕逐字喂给它：剧本、解剖、正确动作、每幕真实案件、可封存的话术。

CLUE_PHRASES = {
    "1": ["15年私募", "免费分享"],
    "2": ["先投500", "张姐都赚了小两千"],
    "3": ["国家扶持的量化基金项目", "保本保息", "今晚12点截止"],
    "4": ["发你安装包链接"],
    "5": ["养老金也转进来"],
    "6": ["需先缴纳20%保证金"],
    "7": ["就差这最后一笔"],
}


def _first_sentence(text: str) -> str:
    text = K.strip_md(text)
    m = re.match(r"^(.+?[。！？])", text)
    return m.group(1) if m else text


def legacy_js(md: str) -> str:
    doc = parse(md)
    acts, clues, reports = [], [], []
    for act in doc["acts"]:
        stage = int(act["no"])
        report = act.get("report") or {}
        if isinstance(report, str):
            try:
                report = json.loads(report)
            except Exception:
                report = {}
        acts.append({
            "stage": stage,
            "persona": act["speaker"],
            "me": "你" in act["speaker"],
            "message": act["line"],
            "hookTitle": act["aTitle"],
            "anatomy": K.strip_md(act["aBody"]),
            "correctMove": K.strip_md(act["right"]),
        })
        reports.append({"t": (report.get("src") or "").split("——")[0].strip(),
                        "u": report.get("url") or ""})
        phrases = CLUE_PHRASES.get(str(act["no"]), [])
        missing = [p for p in phrases if p not in act["line"]]
        assert not missing, (act["no"], missing)
        if stage == len(doc["acts"]):
            phrases = []          # 最后一幕是收网复盘，没有可封存的话术
        clues.append([{"phrase": p, "why": _first_sentence(act["aBody"])} for p in phrases])

    def dump(obj):
        return json.dumps(obj, ensure_ascii=False, indent=1)

    return (
        "/* 由 scripts/chapter05.py 从 docs/content/p5-anti-scam.md 生成，勿手改。\n"
        "   八幕剧本逐字来自真源；这里是老决策室引擎（prototype.js initScam）的数据层。 */\n"
        "window.SCAM_SCRIPT = " + dump(acts) + ";\n\n"
        "window.SCAM_CLUES = " + dump(clues[:-1]) + ";\n\n"
        "window.SCAM_REPORTS = " + dump(reports) + ";\n"
    )
