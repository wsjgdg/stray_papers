#!/usr/bin/env python3
"""① 关的「卡片铸造台」：整页正文就是这几件东西，不再另附一篇文章。

真源 p1 的两个区块（✋ 会动手的 / 💬 会动嘴的）变成台面上的两组卡；
导览卡变成台面说明，诚实声明与卡 5 并排，小结卡收在台面末尾；
real-cases-p1 的素材清单收成页尾一张链接表。除此之外不再有第二份正文。

  01 海报（印刷品，带票根）        02 朋友圈（手机里的那条草稿）
  03 账本对话（收银小票上的问答）  04 修老照片（修复前后示意图）
  05 微信问答（聊天气泡）

正面一律是真源原文的实物排版，背面是时间对比、能照抄的提示词、一句老实话
和可点的出处。翻面、压印、打字机、滚动进场都交给 GSAP（见 prototype-cards.js）。
"""

from __future__ import annotations

import html
import re

DOC = "p1-what-ai-can-do.md"
CASES = "real-cases-p1.md"

_STEP_NO = re.compile(r"^\d+[.、]\s*")
_CARD_NO = re.compile(r"卡\s*(\d+)")

# 真源里「现在就试」的行动链接写的是 academy.html（原正式站的提示词学院）。
# 那一页已经撤掉，但同一件事就是本仓库的第 ⑥ 关，所以旧路径逐个映射过去。
ACADEMY_FALLBACK = {
    "academy.html": "chapter-06.html",
}


# ------------------------------------------------------------------ 解析

def _sections(md: str) -> list[tuple[str, str]]:
    """按 `## ` 切段，返回 [(小节标题, 正文)]。"""
    chunks = re.split(r"^##\s+", md, flags=re.M)
    out = []
    for chunk in chunks[1:]:
        head, _, body = chunk.partition("\n")
        out.append((head.strip(), body))
    return out


def _blocks(body: str) -> list[tuple[str, str]]:
    """按 `### ` 切块（翻面卡 / 导览卡 / 诚实声明卡）。"""
    chunks = re.split(r"^###\s+", body, flags=re.M)
    out = []
    for chunk in chunks[1:]:
        head, _, rest = chunk.partition("\n")
        out.append((head.strip(), rest))
    return out


def _bullets(body: str) -> list[tuple[str, dict]]:
    """把一段卡正文拆成 [(key, {val, items, quote, note_extra})]。"""
    rows: list[tuple[str, dict]] = []
    cur: dict | None = None
    for raw in body.splitlines():
        line = raw.rstrip()
        if line.startswith("#"):      # 进入下一块，别把标题吞进上一条的值
            break
        if not line.strip() or line.strip() in {"**正面**", "**背面**"}:
            continue
        m = re.match(r"^-\s+(.*)$", line)
        if m:
            text = m.group(1).strip()
            key, sep, val = text.partition("：") if "：" in text else text.partition(": ")
            if not sep:
                key, val = text, ""
            cur = {"val": val.strip(), "items": [], "quote": []}
            rows.append((key.strip(), cur))
            continue
        if cur is None:
            continue
        m = re.match(r"^\s+(?:[-*]|\d+[.、])\s*(.*)$", line)
        if m:
            cur["items"].append(m.group(1).strip())
            continue
        m = re.match(r"^\s*>\s?(.*)$", line)
        if m:
            cur["quote"].append(m.group(1).strip())
            continue
        m = re.match(r"^（(.*)）$", line.strip())
        if m:
            cur["note_extra"] = m.group(1)
            continue
        if cur["val"]:
            cur["val"] += " " + line.strip()
        else:
            cur["val"] = line.strip()
    return rows


def _plain(text: str) -> str:
    return re.sub(r"[`*]", "", text or "").strip()


def _strip_md(text: str) -> str:
    return re.sub(r"[`*]", "", text or "").strip()


def _quote_text(quote: list[str]) -> list[str]:
    """引用行 → 段落列表（空行为界，段内按句接起来）。"""
    paras, cur = [], []
    for line in quote:
        if not line.strip():
            if cur:
                paras.append("".join(cur).strip())
                cur = []
            continue
        cur.append(line)
    if cur:
        paras.append("".join(cur).strip())
    return [p for p in paras if p]


def _links(rows) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for key, row in rows:
        blob = " ".join([row["val"]] + row["items"])
        for m in re.finditer(r"`([^`]+)`\s*（指向\s*<?([^>）\s]+)>?）", blob):
            out.append((_plain(m.group(1)), m.group(2).strip().strip("`")))
        for m in re.finditer(r"`([^`]+)`[^`]*<?(https?://[^\s>）]+)>?", blob):
            if m.group(2) not in {u for _, u in out}:
                out.append((_plain(m.group(1)), m.group(2)))
        for m in re.finditer(r"<(https?://[^\s>]+)>", blob):
            if m.group(1) not in {u for _, u in out}:
                out.append((m.group(1), m.group(1)))
    return out


def _report(row_val: str) -> tuple[str, list[tuple[str, str]]]:
    """「报道佐证行」：正文 + [(媒体名, url)]，用于把媒体名做成链接。"""
    if not row_val:
        return "", []
    names = [(m.group(1), m.group(2))
             for m in re.finditer(r'"([^"]+)"\s*指向\s*<?(https?://[^\s>）]+)>?', row_val)]
    ticked = re.findall(r"`([^`]+)`", row_val)
    return _strip_md(ticked[0] if ticked else row_val), names


def _parse_card(head: str, body: str, no: int, group: str) -> dict:
    clean = re.sub(r"（[^）]*）", "", head).strip()
    clean = re.sub(r"^卡\s*\d+\s*[：:]\s*", "", clean).strip()
    front_md, _, back_md = body.partition("**背面**")
    fr, bk = _bullets(front_md), _bullets(back_md)

    def pick(rows, *keys, field="val"):
        for key, row in rows:
            if any(k in key for k in keys):
                return row[field]
        return "" if field == "val" else []

    chat: list[dict] = []
    for item in pick(fr, "对话气泡", field="items"):
        who, sep, text = item.partition("：")
        if not sep:
            who, sep, text = item.partition(":")
        chat.append({"who": _plain(who), "text": _plain(text), "paras": []})
    chat_quote = pick(fr, "对话气泡", field="quote")
    for row in chat:
        if not row["text"] and chat_quote:
            row["paras"] = [_strip_md(x) for x in chat_quote if x.strip()]
            row["text"] = " ".join(row["paras"])
            break

    report_raw = next((row["val"] for key, row in fr if "报道" in key), "")
    report_text, report_links = _report(report_raw)

    demo = ""
    for key, row in bk:
        if row.get("note_extra"):
            demo = row["note_extra"]

    return dict(
        no=no, title=clean, group=group,
        tag=_plain(pick(fr, "标签")),
        hint=_plain(pick(fr, "提示行")),
        badge=_plain(pick(fr, "演示徽标")),
        poster=[_strip_md(x) for x in pick(fr, "文字内容", field="items")],
        chat=chat,
        quote=[_strip_md(x) for x in pick(fr, "正文", field="quote")],
        caption=_plain(pick(fr, "图注")),
        aria=_plain(pick(fr, "无障碍描述")),
        report=report_text, report_links=report_links,
        photo_labels=[_strip_md(x).split("（")[0]
                      for x in pick(fr, "图内文字", field="items")],
        compare=_plain(pick(bk, "时间对比")),
        prompt=" ".join(_strip_md(x) for x in pick(bk, "提示词", field="quote")),
        note=_plain(pick(bk, "说明")),
        steps=[_strip_md(x) for x in pick(bk, "步骤", field="items")],
        steps_quote=[_strip_md(x) for x in pick(bk, "步骤", field="quote")],
        remind=_plain(pick(bk, "提醒")),
        demo=demo,
        links=_links(bk),
    )


def parse_doc(md: str) -> dict:
    """p1 真源 → 台面结构：两组卡 + 导览 + 诚实声明 + 小结。"""
    doc = {"groups": [], "guide": None, "honest": None, "summary": None}
    no = 0
    for head, body in _sections(md):
        if head.startswith("结尾"):
            rows = _bullets(body)
            doc["summary"] = {
                "title": _plain(next((r["val"] for k, r in rows if "标题" in k), "")),
                "paras": _quote_text(next((r["quote"] for k, r in rows if "正文" in k), [])),
            }
            continue
        if not head.startswith("区块"):
            continue
        rows = _bullets(body)
        gtitle = _plain(next((r["val"] for k, r in rows if "区块标题" in k), head))
        gsub = _plain(next((r["val"] for k, r in rows if "区块副题" in k), ""))
        group = {"title": gtitle, "sub": gsub, "cards": [],
                 "honest": None, "guide": None}
        for chead, cbody in _blocks(body):
            if "翻面卡" in chead:
                no += 1
                group["cards"].append(_parse_card(chead, cbody, no, gtitle))
            elif "导览卡" in chead:
                drows = _bullets(cbody)
                gq = next((r["quote"] for k, r in drows if "正文" in k), [])
                title, chips, note = "", [], ""
                for line in gq:
                    if line.startswith("- "):
                        chips.append(_strip_md(line[2:]))
                    elif line.strip():
                        if not title and not chips:
                            title = _strip_md(line)
                        else:
                            note = _strip_md(line)
                group["guide"] = {"title": title, "chips": chips, "note": note}
            elif "诚实声明" in chead:
                hrows = _bullets(cbody)
                group["honest"] = {
                    "tag": _plain(next((r["val"] for k, r in hrows if k == "标签"), "诚实声明")),
                    "paras": _quote_text(next((r["quote"] for k, r in hrows if "正文" in k), [])),
                }
        if group["guide"] and not doc["guide"]:
            doc["guide"] = group["guide"]
        if group["honest"] and not doc["honest"]:
            doc["honest"] = group["honest"]
        doc["groups"].append(group)
    return doc


def parse_cases(md: str) -> list[dict]:
    """real-cases-p1 的素材表 → 链接表行。"""
    rows: list[dict] = []
    for head, body in _sections(md):
        if not head.startswith("场景"):
            continue
        scene = re.sub(r"^场景\s*\d+\s*[：:]\s*", "", head).strip()
        for line in body.splitlines():
            line = line.strip()
            if not line.startswith("|") or set(line) <= set("|-: "):
                continue
            cells = [c.strip() for c in re.split(r"(?<!\\)\|", line.strip("|"))]
            if len(cells) < 5 or cells[0].startswith("真实素材"):
                continue
            url_m = re.search(r"<(https?://[^\s>]+)>", cells[1])
            if not url_m:
                continue
            title = re.sub(r"（[^）]*）$", "", cells[0]).strip()
            status = re.sub(r"\*", "", cells[2]).strip()
            code = re.match(r"(\d{3})", status)
            note = ""
            paren = re.search(r"（([^）]*)）", status)
            if paren:
                note = paren.group(1)
            card = _CARD_NO.search(" ".join(cells[5:]))
            rows.append({
                "card": f"卡 {card.group(1)}" if card else scene,
                "title": title,
                "abstract": cells[4],
                "code": code.group(1) if code else "",
                "note": note,
                "url": url_m.group(1),
            })
    return rows


def parse_verify(md: str) -> list[dict]:
    """p1 里的「演示验证渠道」→ 链接表首行。"""
    out = []
    for head, body in _sections(md):
        if "本页来源" not in head:
            continue
        rows = _bullets(body)
        for key, row in rows:
            if "演示验证渠道" not in key:
                continue
            for item in row["items"]:
                url = re.search(r"<(https?://[^\s>]+)>", item)
                if not url:
                    continue
                label = _strip_md(re.split(r"：", item)[0])
                code = re.search(r"`?(\d{3}(?:→\d{3})?)`?", item)
                out.append({
                    "card": "五张卡",
                    "title": label,
                    "abstract": "卡上每一段演示对话，都可以用它照原句复现。",
                    "code": code.group(1) if code else "",
                    "note": "",
                    "url": url.group(1),
                })
    return out


# ------------------------------------------------------------------ 渲染

def _esc(t: str) -> str:
    return html.escape(t or "", quote=True)


def _rich(t: str) -> str:
    """转义后把真源里的 **强调** 变成 <strong>。"""
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", _esc(t))


def _kind(title: str) -> str:
    if "海报" in title:
        return "poster"
    if "照片" in title:
        return "photo"
    if "写作" in title or "朋友圈" in title:
        return "moments"
    if "账" in title:
        return "ledger"
    return "chat"


def _prompt_of(card: dict) -> str:
    """背面那可以照抄的一句话。照片卡的真源把它放在步骤第 3 条的引用里。"""
    text = card["prompt"] or (card["steps_quote"][0] if card["steps_quote"] else "")
    quoted = re.search(r'["“](.+?)["”]', text)
    if quoted:
        return quoted.group(1).strip()
    text = re.sub(r"^[^：:]{0,12}[：:]\s*", "", text).strip()
    return text.strip('"“”').strip()


# ---- 正面：五种真物件 ------------------------------------------------

def _poster(card: dict) -> str:
    lines = card["poster"]
    eyebrow = lines[0] if lines else ""
    title = lines[1] if len(lines) > 1 else card["title"]
    body = lines[2:-1] if len(lines) > 2 else []
    stub = lines[-1].split("：")[-1] if lines else ""
    return (
        '<div class="artifact art-poster" role="img" aria-label="'
        + _esc(card["aria"] or title) + '">'
        '<div class="poster-sheet">'
        f'<p class="poster-eyebrow">{_esc(eyebrow)}</p>'
        '<span class="poster-rule" aria-hidden="true"></span>'
        f'<h3 class="poster-title">{_esc(title)}</h3>'
        + "".join(f'<p class="poster-line">{_esc(x)}</p>' for x in body)
        + '<span class="poster-logos" aria-hidden="true">◆ ◆ ◆</span>'
        '<div class="poster-stub">'
        f'<p class="poster-stub-text">{_esc(stub)}</p>'
        '<i class="poster-notch" aria-hidden="true"></i>'
        "</div></div></div>"
    )


def _photo_pane(label: str, cls: str) -> str:
    scene = (
        '<circle cx="336" cy="34" r="16" fill="var(--ph-sun)"/>'
        '<path d="M0 112 L46 62 L92 108 L128 76 L182 116 L228 88 L276 118 L330 84 '
        'L400 112 L400 150 L0 150 Z" fill="var(--ph-hill)"/>'
        '<rect x="56" y="96" width="54" height="40" fill="var(--ph-house)"/>'
        '<path d="M48 96 L83 70 L118 96 Z" fill="var(--ph-roof)"/>'
        '<rect x="76" y="114" width="12" height="22" fill="var(--ph-light)"/>'
        '<path d="M196 136 L200 100" stroke="var(--ph-tree)" stroke-width="4"/>'
        '<circle cx="200" cy="94" r="14" fill="var(--ph-tree)"/>'
        '<circle cx="262" cy="106" r="8" fill="var(--ph-figure)"/>'
        '<path d="M262 115 q-11 8 -9 27 h18 q2 -19 -9 -27 Z" fill="var(--ph-figure)"/>'
        '<path d="M18 140 q22 -9 44 -1 q22 8 44 -1" stroke="var(--ph-line)" stroke-width="2" fill="none"/>'
    )
    return (
        f'<figure class="ph-pane {cls}">'
        '<span class="ph-frame" aria-hidden="true">'
        '<svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">'
        + scene +
        "</svg></span>"
        f'<figcaption class="ph-label">{_esc(label)}</figcaption></figure>'
    )


def _photo(card: dict) -> str:
    labels = card["photo_labels"] or ["修复前", "修复后"]
    before = labels[0] if labels else "修复前"
    after = labels[1] if len(labels) > 1 else "修复后"
    lead = " ".join(card["quote"]) or card["title"]
    report = ""
    if card["report"]:
        text = _esc(card["report"])
        for name, url in card["report_links"]:
            text = text.replace(
                _esc(name),
                f'<a href="{_esc(url)}" target="_blank" rel="noopener noreferrer">{_esc(name)}</a>',
                1,
            )
        report = f'<p class="ph-report">{text}</p>'
    return (
        '<div class="artifact art-photo">'
        f'<p class="art-lead">{_esc(lead)}</p>'
        '<div class="ph-strip" role="img" aria-label="' + _esc(card["aria"] or lead) + '">'
        + _photo_pane(before, "ph-before")
        + '<div class="ph-arrow" aria-hidden="true">→</div>'
        + _photo_pane(after, "ph-after")
        + "</div>"
        f'<p class="ph-cap">{_esc(card["caption"])}</p>'
        + report
        + "</div>"
    )


def _moments(card: dict) -> str:
    ask = next((c for c in card["chat"] if not c["who"].startswith("AI")), None)
    answer = next((c for c in card["chat"] if c["who"].startswith("AI")), None)
    paras = (answer or {}).get("paras") or []
    if not paras:
        body = (answer or {}).get("text", "")
        paras = [p.strip() for p in re.split(r"[。]", body) if p.strip()]
    lines = "".join(f"<p>{_esc(p)}</p>" for p in paras)
    ask_html = ""
    if ask:
        ask_html = (
            '<div class="mom-input">'
            f'<span class="mom-input-who">{_esc(ask["who"])}</span>'
            f'<span class="mom-input-text">{_esc(ask["text"])}</span>'
            '<i class="mom-caret" aria-hidden="true"></i></div>'
        )
    return (
        '<div class="artifact art-moments">'
        '<div class="mom-head">'
        '<span class="mom-avatar" aria-hidden="true">AI</span>'
        '<span class="mom-name">AI 写的朋友圈文案</span>'
        '<span class="mom-dots" aria-hidden="true">•••</span>'
        "</div>"
        f'<div class="mom-body">{lines}</div>'
        + ask_html
        + "</div>"
    )


def _bubble(msg: dict) -> str:
    side = "me" if msg["who"].startswith("我") else "ai"
    paras = msg["paras"] or [msg["text"]]
    if side == "ai" and len(paras) > 1:
        inner = "".join(f"<p>{_esc(p)}</p>" for p in paras)
    else:
        inner = f"<p>{_esc(msg['text'])}</p>"
    return (
        f'<div class="bubble-row bubble-row--{side}">'
        f'<span class="bubble-face" aria-hidden="true">{"我" if side == "me" else "AI"}</span>'
        f'<div class="bubble bubble--{side}">'
        f'<span class="bubble-who">{_esc(msg["who"])}</span>{inner}</div>'
        "</div>"
    )


def _chat_front(card: dict, kind: str) -> str:
    rows = "".join(_bubble(m) for m in card["chat"])
    badge = (f'<span class="art-badge">{_esc(card["badge"])}</span>'
             if card["badge"] else "")
    if kind == "ledger":
        return ('<div class="artifact art-ledger">'
                '<div class="ledger-top" aria-hidden="true"><span>账单截图 · 已上传</span></div>'
                f'<div class="ledger-roll">{badge}{rows}</div>'
                '<i class="ledger-tear" aria-hidden="true"></i></div>')
    return ('<div class="artifact art-wechat">'
            '<div class="wx-bar"><span class="wx-back" aria-hidden="true">‹</span>'
            '<span class="wx-name">AI</span>'
            '<span class="wx-more" aria-hidden="true">•••</span></div>'
            f'<div class="wx-body">{badge}{rows}</div></div>')


def _front(card: dict, kind: str) -> str:
    if kind == "poster":
        return _poster(card)
    if kind == "photo":
        return _photo(card)
    if kind == "moments":
        return _moments(card)
    return _chat_front(card, kind)


# ---- 背面：时间对比 / 提示词 / 老实话 / 出处 --------------------------

def _back(card: dict) -> str:
    bits = []
    if card["compare"]:
        bits.append(
            '<div class="back-compare">'
            '<span class="back-compare-k">真实耗时</span>'
            f'<span class="back-compare-v">{_esc(card["compare"])}</span></div>'
        )
    else:
        bits.append(
            '<div class="back-compare back-compare--real">'
            '<span class="back-compare-k">本卡</span>'
            '<span class="back-compare-v">真实可操作的教程，非演示</span></div>'
        )

    prompt = _prompt_of(card)
    if prompt:
        bits.append(
            '<div class="back-prompt">'
            '<div class="back-prompt-bar">'
            '<span class="back-label">给 AI 的话 · 可照抄</span>'
            '<button class="back-copy" type="button" data-copy>复制</button></div>'
            f'<p class="back-text" data-typewriter>{_esc(prompt)}</p>'
            f'<span class="back-plain" hidden>{_esc(prompt)}</span>'
            "</div>"
        )

    if card["steps"]:
        items = "".join("<li>%s</li>" % _esc(_STEP_NO.sub("", s)) for s in card["steps"])
        bits.append('<ol class="back-steps">%s</ol>' % items)

    if card["note"]:
        bits.append(f'<p class="back-note"><b>老实话</b>{_esc(card["note"])}</p>')
    if card["remind"]:
        bits.append(f'<p class="back-remind">{_esc(card["remind"])}</p>')

    def link_li(label: str, url: str) -> str:
        if url.startswith("http"):
            return (f'<li><a href="{_esc(url)}" target="_blank" rel="noopener noreferrer">'
                    f'{_esc(label)}</a></li>')
        # 真源里的行动链接指向 academy.html（提示词学院）。正式站撤掉了那一页，
        # 但它就是本仓库的第 ⑥ 关「提示词学院」——译成 chapter-06.html，别留不可点的死字。
        target = ACADEMY_FALLBACK.get(url.rsplit("/", 1)[-1], "")
        if target:
            return (f'<li><a class="back-go" href="{_esc(target)}">'
                    f'{_esc(label)}</a></li>')
        return f'<li><span class="back-go">{_esc(label)}</span></li>'

    links = "".join(link_li(l, u) for l, u in card["links"])
    bits.append(f'<ul class="back-links">{links}</ul>')

    if card["demo"]:
        bits.append(f'<p class="back-demo">{_esc(card["demo"])}</p>')

    return (f'<div class="fcard-back" id="card-{card["no"]}-back">'
            '<div class="back-scroll">' + "".join(bits) + "</div>"
            '<span class="stamp" aria-hidden="true"><b>已压印</b><i>已压印</i></span>'
            "</div>")


def _card_tile(card: dict) -> str:
    kind = _kind(card["title"])
    return (
        f'<article class="fcard fcard--{kind}" data-flipcard="{card["no"]}">'
        '<div class="fcard-inner">'
        '<div class="fcard-front">'
        f'<span class="fcard-tag">{_esc(card["tag"])}</span>'
        f'{_front(card, kind)}</div>'
        f'{_back(card)}'
        "</div>"
        f'<button class="fcard-flip" type="button" aria-expanded="false" '
        f'aria-controls="card-{card["no"]}-back">'
        f'<span class="fcard-flip-label">{_esc(card["hint"] or "点一下，看提示词与出处")}</span>'
        '<span class="fcard-flip-mark" aria-hidden="true">翻 →</span></button>'
        "</article>"
    )


def _honest_tile(honest: dict) -> str:
    paras = "".join(f"<p>{_rich(p)}</p>" for p in honest["paras"])
    return ('<aside class="honest-tile">'
            f'<span class="honest-tag">{_esc(honest["tag"])}</span>'
            f'<div class="honest-body">{paras}</div></aside>')


def _guide(guide: dict | None) -> str:
    if not guide:
        return ""
    chips = "".join(f"<li>{_rich(c)}</li>" for c in guide["chips"])
    note = (f'<p class="castfloor-note">{_rich(guide["note"])}</p>'
            if guide["note"] else "")
    return (
        '<div class="castfloor-guide">'
        f'<p class="castfloor-ask">{_rich(guide["title"])}</p>'
        f'<ul class="castfloor-chips">{chips}</ul>'
        + note
        + "</div>"
    )


def render_scene(doc: dict) -> str:
    total = sum(len(g["cards"]) for g in doc["groups"])
    groups = []
    for group in doc["groups"]:
        tiles = "".join(_card_tile(c) for c in group["cards"])
        if group.get("honest"):
            tiles += _honest_tile(group["honest"])
        groups.append(
            '<div class="floor-group">'
            '<div class="floor-group-head">'
            f'<h3 class="floor-group-title">{_esc(group["title"])}</h3>'
            f'<p class="floor-group-sub">{_esc(group["sub"])}</p>'
            "</div>"
            f'<div class="cardrail">{tiles}</div>'
            "</div>"
        )

    summary = ""
    if doc.get("summary"):
        paras = "".join(f"<p>{_rich(p)}</p>" for p in doc["summary"]["paras"])
        summary = ('<div class="floor-summary">'
                   f'<p class="floor-summary-k">{_esc(doc["summary"]["title"])}</p>'
                   f'<div class="floor-summary-body">{paras}</div></div>')

    return (
        '<section class="castfloor" id="castfloor" aria-labelledby="castfloor-title">'
        '<header class="castfloor-head">'
        '<span class="castfloor-kicker">THE CARD FLOOR / 卡片铸造台</span>'
        + _guide(doc.get("guide"))
        + '<div class="castfloor-meter">'
        f'<span class="meter-num"><b data-flip-count>0</b> / {total}</span>'
        '<span class="meter-word">张已压印</span>'
        '<i class="meter-track" aria-hidden="true"><i data-meter-fill></i></i>'
        "</div></header>"
        + "".join(groups)
        + '<p class="castfloor-done" data-flip-done hidden>'
        '五张都翻过了 —— 下面这句，是这一关想让你记住的。</p>'
        + summary
        + "</section>"
    )


def render_linktable(rows: list[dict], verify: list[dict] | None = None) -> str:
    if not rows and not verify:
        return ""
    body = []
    for row in (verify or []) + rows:
        badge = (f'<span class="kt-status" title="{_esc(row["note"])}">{_esc(row["code"])}</span>'
                 if row["code"] else "")
        host = re.sub(r"^https?://", "", row["url"]).split("/")[0]
        body.append(
            "<tr>"
            f'<th scope="row" class="kt-card">{_esc(row["card"])}</th>'
            '<td class="kt-material">'
            f'<span class="kt-title">{_esc(row["title"])}</span>'
            f'<span class="kt-abstract">{_esc(row["abstract"])}</span>'
            "</td>"
            f'<td class="kt-status-cell">{badge}</td>'
            '<td class="kt-link">'
            f'<a href="{_esc(row["url"])}" target="_blank" rel="noopener noreferrer">'
            f'{_esc(host)}<span aria-hidden="true"> ↗</span></a>'
            "</td>"
            "</tr>"
        )
    return (
        '<section class="ktable-sec" id="links" aria-labelledby="ktable-title">'
        '<h2 class="ktable-title" id="ktable-title">本页来源与演示验证渠道</h2>'
        '<p class="ktable-note">卡上的对话都是演示样例；下面这些是真人教程、官方工具和报道，'
        '点开就能看到别人怎么做的。访问日期 2026-11-06，状态码为当时跟随跳转的结果，'
        '标“反爬”的链接浏览器可以直接打开。</p>'
        '<div class="ktable-wrap">'
        '<table class="ktable"><thead><tr>'
        '<th scope="col">哪张卡</th><th scope="col">素材</th>'
        '<th scope="col">状态</th><th scope="col">链接</th>'
        "</tr></thead><tbody>" + "".join(body) + "</tbody></table></div>"
        "</section>"
    )
