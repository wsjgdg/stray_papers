#!/usr/bin/env python3
"""把 docs/content 的文字真源直接渲染成每一关的页面正文。

以前的作法是：页面照旧，页尾挂一个折叠的「原始文案，与全部出处」附页。
那样原文和页面割裂，读者要点开六七层折叠才看得到真源。

现在改成：每一页的 main 就是内容真源的全文（分节、可见、可读、链接可点），
页面上原来手写的说明文字不再重复出现；可玩的交互台整体挪到正文之后，
标成「亲手试一下」，它的 DOM 原样保留，所以脚本和动效都不用改。

    python3 ai-exploration-base/scripts/build-source-pages.py
"""

from __future__ import annotations

import html
import importlib.util
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROTO = ROOT / "prototype"
DOCS = ROOT / "docs" / "content"


# Markdown → HTML 的小渲染器（从旧的 dossier 生成器里搬过来，规则没变）
DEAD_LINKS = (
    "https://agi.taobao.com",
    "https://kf.qq.com/product/wx_app.html",
    "https://kf.qq.com/touch/product/weixin_app.html",
    "https://www.bilibili.com/video/BV1YB6EB6Ekv",
)
DEAD_NOTE = "原链接已标注不采用 / 404，不接入"

SEEN_LINKS: list[str] = []


def _load_module(name: str):
    path = pathlib.Path(__file__).with_name(name + ".py")
    spec = importlib.util.spec_from_file_location("_" + name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["_" + name] = mod
    spec.loader.exec_module(mod)
    return mod


def _load_chapter01():
    return _load_module("chapter01")


def _anchor(text: str, url: str) -> str:
    url = url.strip().rstrip("，。；,;")
    if not url.startswith("http") or url.endswith(".md"):
        return f'<span class="dossier-ref">{text}</span>'
    if url.startswith(DEAD_LINKS):
        return (f'<span class="dossier-ref" title="{DEAD_NOTE}">{text}</span>'
                f'<span class="dossier-dead">（{DEAD_NOTE}）</span>')
    SEEN_LINKS.append(url)
    return (f'<a href="{url}" target="_blank" rel="noopener noreferrer">{text}</a>')


def inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: _anchor(m.group(1), m.group(2)), s)
    s = re.sub(r"&lt;(https?://[^\s&]+)&gt;", lambda m: _anchor(m.group(1), m.group(1)), s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w])_([^_<>]{1,60})_(?![\w])", r"<em>\1</em>", s)
    # 裸 URL（表格单元格、清单里直接写的地址）：只处理不在链接/代码里的片段
    pieces = re.split(r"(<a\s[^>]*>.*?</a>|<code>.*?</code>)", s)
    s = "".join(p if p.startswith(("<a ", "<code>")) else _autolink(p) for p in pieces)
    return s


def _autolink(seg: str) -> str:
    def repl(m: "re.Match[str]") -> str:
        url = m.group(1).rstrip(".,;:，。；、|*")
        tail = m.group(1)[len(url):]
        return _anchor(url, url) + tail
    return re.sub(r"(https?://[^\s<>&\"'）】]+)", repl, seg)


def _cells(row: str) -> list[str]:
    return [c.strip() for c in row.strip().strip("|").split("|")]


def md_html(text: str) -> str:
    """Markdown → HTML，够用即可（标题、段落、列表、引用、代码、表格）。"""
    out: list[str] = []
    lines = text.splitlines()
    i = 0
    para: list[str] = []
    quote: list[str] = []
    list_stack: list[str] = []
    ol_next: dict[int, int] = {}
    fence = False
    fence_buf: list[str] = []

    def flush_para() -> None:
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    def flush_quote() -> None:
        if not quote:
            return
        # 引用块里可能是段落，也可能是“- ”/“1.” 开头的清单
        buf: list[str] = []
        inner: list[str] = []
        mode = None  # None / "ul" / "ol"

        def flush_buf() -> None:
            if buf:
                inner.append(f"<p>{inline(' '.join(buf))}</p>")
                buf.clear()

        def close_mode() -> None:
            nonlocal mode
            if mode:
                inner.append(f"</{mode}>")
                mode = None

        for line in quote:
            m = re.match(r"^([-*+]|\d+\.)\s+(.*)$", line)
            if m:
                flush_buf()
                kind = "ol" if m.group(1)[0].isdigit() else "ul"
                if mode != kind:
                    close_mode()
                    inner.append(f"<{kind}>")
                    mode = kind
                inner.append(f"<li>{inline(m.group(2))}</li>")
            else:
                close_mode()
                buf.append(line)
        flush_buf()
        close_mode()
        out.append(f'<blockquote class="dossier-quote-block">{"".join(inner)}</blockquote>')
        quote.clear()

    def flush_list() -> None:
        while list_stack:
            out.append(f"</{list_stack.pop()}>")

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        if line.startswith("```"):
            if fence:
                out.append('<pre class="dossier-code"><code>' + html.escape("\n".join(fence_buf)) + "</code></pre>")
                fence_buf.clear()
                fence = False
            else:
                flush_para(); flush_quote(); flush_list()
                fence = True
            i += 1
            continue
        if fence:
            fence_buf.append(raw)
            i += 1
            continue
        stripped = line.strip()
        if not stripped or stripped in {"---", "***", "___"}:
            flush_para(); flush_quote(); flush_list()
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and set(lines[i + 1].strip()) <= set("|-: "):
            flush_para(); flush_quote(); flush_list()
            head = _cells(stripped)
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(_cells(lines[i].strip()))
                i += 1
            th = "".join(f"<th>{inline(c)}</th>" for c in head)
            tb = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows)
            out.append(f'<div class="dossier-table"><table><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>')
            continue
        if stripped.startswith(">"):
            flush_para(); flush_list()
            quote.append(stripped.lstrip("> ").strip())
            i += 1
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", stripped)
        if m:
            flush_para(); flush_quote(); flush_list()
            lv = min(len(m.group(1)) + 1, 5)  # ### → h4，### 之上不会出现
            out.append(f"<h{lv}>{inline(m.group(2))}</h{lv}>")
            i += 1
            continue
        m = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", raw)
        if m:
            flush_para(); flush_quote()
            indent = len(m.group(1).replace("\t", "  "))
            kind = "ol" if m.group(2)[0].isdigit() else "ul"
            depth = max(1, indent // 2 + 1)
            while len(list_stack) > depth:
                out.append(f"</{list_stack.pop()}>")
            while len(list_stack) < depth:
                start = ol_next.get(len(list_stack) + 1, 1) if kind == "ol" else 1
                out.append(f'<ol start="{start}">' if kind == "ol" and start > 1 else f"<{kind}>")
                list_stack.append(kind)
            if kind == "ol":
                num = int(m.group(2).rstrip("."))
                ol_next[depth] = num + 1
            out.append(f"<li>{inline(m.group(3))}</li>")
            i += 1
            continue
        flush_quote(); flush_list()
        para.append(stripped)
        i += 1
    flush_para(); flush_quote(); flush_list()
    return "\n".join(out)



# ------------------------------------------------------------------ DOM utils

def find_element(text: str, tag: str, pred) -> int:
    for m in re.finditer(r"<%s\b[^>]*>" % tag, text):
        if pred(m.group(0)):
            return m.start()
    return -1


def balanced(text: str, start: int, tag: str) -> str:
    depth = 0
    for m in re.finditer(r"<(/?)%s\b[^>]*>" % tag, text[start:]):
        if m.group(1) == "":
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                return text[start:start + m.end()]
    raise SystemExit(f"unbalanced <{tag}> at {start}")


def take(text: str, tag: str, pred) -> tuple[str, str]:
    """取出第一个匹配的元素，返回 (元素, 剩余文本)。"""
    i = find_element(text, tag, pred)
    if i < 0:
        return "", text
    chunk = balanced(text, i, tag)
    return chunk, text[:i] + text[i + len(chunk):]


def keep(*specs):
    """specs: ('section', 'id="forge"') 之类，按子串匹配开标签。"""
    def pred(tag_html: str) -> bool:
        return all(s in tag_html for s in specs[1:]) if len(specs) > 1 else True
    return specs


def grab(text: str, tag: str, *needles: str) -> tuple[str, str]:
    def pred(t: str) -> bool:
        return all(n in t for n in needles)
    return take(text, tag, pred)


# ------------------------------------------------------------------ docs

def hero_from_doc(md: str) -> tuple[str, str]:
    """从真源里找页面自己的 H1 与导语（各文档写法略有差别）。"""
    lines = md.splitlines()
    title = ""
    for line in lines:
        if re.search(r"(H1|主标题)", line):
            m = re.search(r"[：:]\s*(.+)$", line)
            if not m:
                continue
            cand = m.group(1).strip().strip("`*\" ")
            cand = re.sub(r"^\*\*|\*\*$", "", cand).strip()
            if cand and len(cand) <= 40:
                title = cand
                break
    if not title:
        m = re.search(r"^#\s+(.+)$", md, re.M)
        title = m.group(1).strip() if m else ""
    lead = ""
    for i, line in enumerate(lines):
        if "导语" in line:
            buf: list[str] = []
            for nxt in lines[i + 1:i + 9]:
                t = nxt.strip()
                if t.startswith(">"):
                    buf.append(t.lstrip(">").strip())
                elif buf:
                    break
            if buf:
                lead = " ".join(buf)
                break
    return title, lead


def section_html(no: int, title: str, body: str) -> str:
    return (
        f'<section class="src-section" id="src-{no:02d}">'
        f'<h2 class="src-h2"><span class="src-no">{no:02d}</span>'
        f"<span>{inline(title)}</span></h2>"
        f'<div class="src-body">{body}</div></section>'
    )


def meta_from_doc(md: str) -> str:
    """页面元信息里的浏览器标题 / 描述，收成页首下面的一行小字。"""
    out = []
    for line in md.splitlines():
        m = re.search(r"(浏览器标题|页面描述|meta description)[^：:]*[：:]\s*(.+)$", line, re.I)
        if m:
            val = m.group(2).strip().replace("`", "")
            out.append(f"<span><b>{m.group(1).strip()}</b> {html.escape(val)}</span>")
    return "".join(out)



def decorate_card(html_s: str) -> str:
    """把卡里的「海报文字」「对话」这两种内容按它本来的样子排出来。"""
    html_s = re.sub(r"<li>([^<]{0,24}文字内容[^<]{0,40})<ul>(.*?)</ul></li>",
                    lambda m: ('<div class="cardposter"><span class="cardposter-cap">'
                               + m.group(1).strip("：: ")
                               + "</span><ul>" + m.group(2) + "</ul></div>"),
                    html_s, flags=re.S)
    html_s = re.sub(r"<li>(我|AI)([^：<]{0,12})：",
                    lambda m: ('<li class="chat-row"><span class="chat-who">'
                               + m.group(1) + m.group(2) + "</span>"),
                    html_s)
    return html_s


def flip_card_html(no: int, title: str, body_md: str) -> str:
    """「翻面卡」：正面是正文原话，翻过来是提示词与出处 —— 卡本身就是内容。"""
    front, _, back = body_md.partition("**背面**")
    front = re.sub(r"^\s*\*\*正面\*\*\s*$", "", front, flags=re.M)
    back = re.sub(r"^-\s*标签[：:]\s*`背面[^`]*`\s*$", "", back, flags=re.M)
    front_html = decorate_card(md_html(front.strip())) if front.strip() else ""
    back_html = decorate_card(md_html(back.strip())) if back.strip() else ""
    return (
        f'<article class="flipcard" data-flipcard="{no}">'
        f'<header class="flipcard-head"><span class="flipcard-no">卡 {no}</span>'
        f"<h3>{inline(title)}</h3></header>"
        f'<div class="flipcard-face flipcard-front">{front_html}</div>'
        f'<div class="flipcard-face flipcard-back" hidden>{back_html}</div>'
        f'<button class="flipcard-toggle" type="button" aria-expanded="false">'
        f'<span class="flipcard-toggle-label">翻过来 · 看提示词与出处</span>'
        f'<span class="flipcard-toggle-mark" aria-hidden="true">↗</span></button>'
        "</article>"
    )


def md_html_with_cards(body_md: str, counter: list[int]) -> str:
    """按 ### 切块；标了「翻面卡」的块渲染成可翻的卡，其余照常。"""
    chunks = re.split(r"^###\s+", body_md, flags=re.M)
    out = [md_html(chunks[0])] if chunks[0].strip() else []
    for chunk in chunks[1:]:
        head, _, rest = chunk.partition("\n")
        title = head.strip()
        if "翻面卡" in title:
            counter[0] += 1
            clean = re.sub(r"（[^）]*）", "", title).strip()
            clean = re.sub(r"^卡\s*\d+\s*[：:]\s*", "", clean).strip()
            out.append(flip_card_html(counter[0], clean, rest))
        else:
            out.append(f'<section class="src-sub"><h3>{inline(title)}</h3>'
                       f"{md_html(rest.strip())}</section>")
    return "".join(out)


def article_for(docs: list[str], stage_html: str = "", anchor: str = "",
                with_cards: bool = False,
                md_overrides: dict | None = None) -> tuple[str, str, str, str]:
    md_overrides = md_overrides or {}
    md = "\n\n".join(md_overrides.get(d) or (DOCS / d).read_text(encoding="utf-8")
                       for d in docs)
    title, lead = hero_from_doc(md)
    chunks = re.split(r"^##\s+", md, flags=re.M)
    parts: list[tuple[str, str]] = []
    card_no = [0]
    for n, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        if n == 0:
            body_md = re.sub(r"^#\s+.*$", "", chunk, count=1, flags=re.M)
            body_md = re.sub(r"^>.*$", "", body_md, flags=re.M)
            title_txt = "关于这份内容"
        else:
            head, _, rest = chunk.partition("\n")
            title_txt, body_md = head.strip(), rest
        body_md = body_md.strip()
        if body_md:
            body_html = (md_html_with_cards(body_md, card_no) if with_cards
                         else md_html(body_md))
            body_html = re.sub(r"<table>(.*?)</table>",
                               r'<div class="src-tablewrap"><table>\1</table></div>',
                               body_html, flags=re.S)
            parts.append((title_txt, body_html))
    skip_rx = re.compile(r"页面元信息|页首|英雄区")
    kept = [(t, b) for t, b in parts
            if not skip_rx.search(t)
            and len(re.sub(r"<[^>]+>|\s", "", b)) > 20]
    # 交互台放在讲它的那一节后面；找不到就放到第一节之后
    anchor_rx = re.compile(anchor) if anchor else None
    insert_at = 0
    if anchor_rx:
        for i, (t, _) in enumerate(kept):
            if anchor_rx.search(t):
                insert_at = i
                break
    chunks_out = []
    for i, (t, b) in enumerate(kept):
        chunks_out.append(section_html(i + 1, t, b))
        if stage_html and i == insert_at:
            chunks_out.append(stage_html)
    sections = "".join(chunks_out)
    source_note = "、".join(f"<code>docs/content/{d}</code>" for d in docs)
    foot = (
        f'<p class="src-colophon">以上正文逐字来自内容真源 {source_note}，'
        "没有缩写、没有改写；改文案请先改真源，再跑 "
        "<code>scripts/build-source-pages.py</code> 重新生成。</p>"
    )
    meta = meta_from_doc(md)
    return title, lead, meta, f'<article class="src-article">{sections}{foot}</article>'


# 正文即页面：交互台不单独占一块，而是嵌进对应的正文小节里
WITH_STAGE = True


# ------------------------------------------------------------------ page spec

PAGES = [
    dict(file="index.html", stage_anchor=r"英雄区|两张引导卡|探索地图", key="00", docs=["p0-index-graduation.md"],
         stage=[("section", 'id="mission"')], no_article=True,
         kicker="PLAYABLE PROTOTYPE / 可玩原型 · 六个频道"),
    dict(file="chapter-01.html", key="01", docs=["p1-what-ai-can-do.md", "real-cases-p1.md"],
         cards=True, stage=[]),
    dict(file="chapter-02.html", key="02", docs=["p2-trends.md", "sources-p123.md"],
         deck="chapter02", deck_sources="sources-p123.md",
         world=True, deck_js=["prototype-reveal.js?v=reveal-01"], stage=[]),
    dict(file="chapter-03.html", key="03", docs=["p3-lab.md", "sources-p123.md"],
         deck="chapter03", deck_sources="sources-p123.md", stage=[]),
    dict(file="chapter-04.html", key="04", docs=["p4-side-jobs.md", "sources-p456.md"],
         deck="chapter04", deck_sources="sources-p456.md", stage=[]),
    dict(file="chapter-05.html", key="05", docs=["p5-anti-scam.md", "real-cases-p5.md",
                                                 "sources-p456.md"],
         deck="chapter05", deck_sources="sources-p456.md",
          deck_js=["prototype-scam-sim.js?v=sim-01"], stage=[]),
    dict(file="chapter-06.html", key="06", docs=["p6-academy.md"],
         deck="chapter06", deck_js=["prototype-academy-quiz.js?v=quiz-01"], stage=[]),
]


def strip_dossier(text: str) -> str:
    text = re.sub(r"<!-- DOSSIER:START -->[\s\S]*?<!-- DOSSIER:END -->", "", text)
    while True:
        i = find_element(text, "section", lambda t: 'id="content-dossier"' in t)
        if i < 0:
            return text
        text = text[:i] + text[i + len(balanced(text, i, "section")):]


def build(spec: dict) -> str:
    path = PROTO / spec["file"]
    src = path.read_text(encoding="utf-8")

    head = src[: src.index("</head>") + len("</head>")]
    body_open = re.search(r'<body[^>]*>', src)
    topbar, _ = grab(src, "header", "topbar")
    tail = re.sub(r"^[\s\S]*?</main>", "", src)  # </main> 之后原样保留
    skip = ""
    m = re.search(r'<a class="skip-link"[^>]*>[^<]*</a>', src)
    if m:
        skip = m.group(0)
    grain = '<div class="grain" aria-hidden="true"></div>' if 'class="grain"' in src else ""
    onward, _ = grab(src, "nav", "onward")

    # 已经是新结构就用里面现成的交互台（脚本可重复跑），否则从旧页面里取。
    existing, rest = (("", src) if spec.get("cards")
                      else take(src, "div", lambda t: 'class="src-play-body"' in t))
    if existing:
        stage_bits = [re.sub(r'^<div[^>]*>|</div>$', "", existing.strip())]
        src = rest
    elif spec.get("cards"):
        src = re.sub(r"<!-- DOSSIER:START -->[\s\S]*?<!-- DOSSIER:END -->", "", src)
        stage_bits = []
    else:
        src = re.sub(r"<!-- DOSSIER:START -->[\s\S]*?<!-- DOSSIER:END -->", "", src)
        found = []
        for tag, needle in spec["stage"]:
            pos = src.find(needle)
            chunk, src = take(src, tag, lambda t, n=needle: n in t)
            if chunk:
                found.append((pos, chunk))
        stage_bits = [c for _, c in sorted(found, key=lambda x: x[0])]

    stage = "" if not stage_bits else (
        '<section class="src-embed" id="play" aria-label="这一关的交互台">'
        '<header class="src-embed-head"><span class="src-embed-kicker">PLAY IT / 亲手试一下</span>'
        "<p>上面这一节讲的做法，这里可以直接动手试；规则、动效、按钮与正文说的是同一件事。</p>"
        "</header>"
        f'<div class="src-play-body">{"".join(stage_bits)}</div></section>'
    )

    scene = ""
    if spec.get("no_article"):
        # 首页不排正文：交互台（拨盘）本身就是这一页
        scene = "".join(stage_bits)
        stage = ""
    links = ""
    if spec.get("deck"):
        deck = _load_module(spec["deck"])
        deck_md = (DOCS / spec["docs"][0]).read_text(encoding="utf-8")
        src_md = ""
        if spec.get("deck_sources"):
            src_md = (DOCS / spec["deck_sources"]).read_text(encoding="utf-8")
        scene, links = deck.render(deck_md, src_md)
        if "<!--PLAY-->" in scene and stage_bits:
            # 交互台 DOM 原样留在台面正中（脚本、动效、id 都不动）
            scene = scene.replace(
                "<!--PLAY-->",
                '<div class="src-play-body tear-interlude" data-bay>'
                f'{"".join(stage_bits)}</div>',
            )
            stage = ""
            stage_bits = []
    if spec.get("cards"):
        # ① 关：正文＝卡片本身，后面不再跟一遍文章，只补一张链接表
        c1 = _load_chapter01()
        p1_md = (DOCS / spec["docs"][0]).read_text(encoding="utf-8")
        cases_md = (DOCS / "real-cases-p1.md").read_text(encoding="utf-8")
        scene = c1.render_scene(c1.parse_doc(p1_md))
        links = c1.render_linktable(c1.parse_cases(cases_md), c1.parse_verify(p1_md))

    title, lead, meta, article = article_for(spec["docs"], stage,
                                             spec.get("stage_anchor", ""),
                                             with_cards=False)

    nav = ""
    if spec.get("deck"):
        # 台面页统一一条页尾导航：下一关最大，回到拨盘在右；来源索引表沉在它下面
        order = [("01", "chapter-01.html", "① AI 能做什么"),
                 ("02", "chapter-02.html", "② AI 趋势与行业"),
                 ("03", "chapter-03.html", "③ 儿子的 AI 实验室"),
                 ("04", "chapter-04.html", "④ 副业地图"),
                 ("05", "chapter-05.html", "⑤ 骗局解剖室"),
                 ("06", "chapter-06.html", "⑥ 提示词学院")]
        key = spec["key"]
        idx = next((i for i, row in enumerate(order) if row[0] == key), -1)
        prev_link = ""
        if idx > 0:
            _, f, t = order[idx - 1]
            prev_link = f'<a class="deck-onward-prev" href="{f}?v=deck-01">← {t}</a>'
        next_bit = ""
        if 0 <= idx < len(order) - 1:
            _, f, t = order[idx + 1]
            next_bit = ('<span class="deck-onward-main">'
                        '<span class="deck-onward-k">下一关 / '
                        f'{int(key) + 1:02d} OF 06</span>'
                        f'<a class="deck-onward-next" href="{f}?v=deck-01">'
                        f'{t} <b aria-hidden="true">↗</b></a></span>')
        else:
            next_bit = ('<span class="deck-onward-main">'
                        '<span class="deck-onward-k">六关走完 / 06 OF 06</span>'
                        '<a class="deck-onward-next" href="index.html?v=switch-14">'
                        '回到探索地图 <b aria-hidden="true">↗</b></a></span>')
        nav = ('<nav class="deck-onward" aria-label="原型导航">'
               + next_bit + prev_link
               + '<a class="deck-onward-home" href="index.html?v=switch-14">回到原型拨盘 ↗</a>'
               + "</nav>")
    elif onward:
        nav = onward

    if spec.get("cards"):
        # ① 关：正文＝卡片本身，后面不再跟一遍文章，只补一张链接表
        c1 = _load_chapter01()
        p1_md = (DOCS / spec["docs"][0]).read_text(encoding="utf-8")
        cases_md = (DOCS / "real-cases-p1.md").read_text(encoding="utf-8")
        scene = c1.render_scene(c1.parse_doc(p1_md))
        links = c1.render_linktable(c1.parse_cases(cases_md), c1.parse_verify(p1_md))

    title, lead, meta, article = article_for(spec["docs"], stage,
                                             spec.get("stage_anchor", ""),
                                             with_cards=False)

    # 真源样式表只留一份（历次构建在同一张页面上追加过很多份）
    head = re.sub(r'<link rel="stylesheet" href="prototype-source\.css[^"]*">', "", head)
    head = head.replace(
        "</head>", '<link rel="stylesheet" href="prototype-source.css?v=source-04"></head>'
    )

    body_class = body_open.group(0) if body_open else "<body>"

    hero = "" if spec.get("world") else (
        '<section class="src-hero">'
        f'<p class="src-kicker">{spec.get("kicker") or ("SOURCE TEXT / 内容真源 · 第 " + spec["key"] + " 关")}</p>'
        f"<h1>{inline(title)}</h1>"
        + (f'<p class="src-lead">{inline(lead)}</p>' if lead else "")
        # 台面页面不再排「浏览器标题 / 页面描述」这类维护元信息
        + (f'<p class="src-meta">{meta}</p>'
           if meta and not (spec.get("cards") or spec.get("deck") or spec.get("no_article")) else "")
        + "</section>"
    )

    if spec.get("cards") or spec.get("deck") or spec.get("no_article"):
        article = ""          # 台面已经把正文吃进去了，别再来一份
    if spec.get("deck") or spec.get("cards"):
        # 先给跳转按钮，再沉一张来源索引表当附录
        body_parts = hero + scene + nav + links + article
    else:
        body_parts = hero + scene + links + article + nav
    main_class = "src-main src-main--world" if spec.get("world") else "src-main"
    main = f'<main class="{main_class}" id="source-{spec["key"]}">{body_parts}</main>'

    out = strip_dossier(
        head
        + "\n"
        + body_class
        + "\n"
        + skip
        + grain
        + topbar
        + "\n"
        + main
        + tail
    )
    if not WITH_STAGE:
        # 只留正文时，交互脚本没有可挂的 DOM，留着只会抛 null 错误
        out = re.sub(r"<script\b[\s\S]*?</script>", "", out)
        out = re.sub(r"<noscript>[\s\S]*?</noscript>", "", out)
        # 顶栏 / 页脚 / 跳转锚点都改成“正文”的说法
        out = re.sub(r'(<span class="prototype-tag">)交互原型', r"\1正文", out)
        out = out.replace("/ PLAYABLE LAB", "/ 正文 READER")
        out = re.sub(r'<a class="skip-link" href="[^"]*">[^<]*</a>',
                     f'<a class="skip-link" href="#source-{spec["key"]}">跳到正文</a>', out)
        out = re.sub(r"AI 探索基地 / 可玩原型", "AI 探索基地 / 正文", out)
        out = out.replace("只展示原型 · 不更改正式打卡进度", "只有正文 · 不更改正式打卡进度")
        out = out.replace("返回原型拨盘 ↗", "返回目录 ↗")
    # 跳转锚点若指向已被摘掉的旧舞台，就改指正文主体，别留死链
    skip_m = re.search(r'<a class="skip-link" href="#([^"]+)">[^<]*</a>', out)
    main_m = re.search(r'<main[^>]*\bid="([^"]+)"', out)
    if skip_m and main_m and f'id="{skip_m.group(1)}"' not in out:
        out = out.replace(
            skip_m.group(0),
            f'<a class="skip-link" href="#{main_m.group(1)}">跳到正文</a>',
            1,
        )
        out = re.sub(r'(跳到正文</a>)[^<]*</a>', r'\1', out)

    if spec.get("cards") or spec.get("deck"):
        # 旧铸造台的脚本没有可挂的 DOM，全部摘掉，只留台面脚本
        out = re.sub(
            r'<script\b(?![^>]*type="application/json")[^>]*>[\s\S]*?</script>',
            "", out)
        # 历次构建塞进来的 noscript 兜底样式先清干净，避免越堆越多
        out = re.sub(
            r"<noscript><style>\.fcard\{block-size:auto!important\}"
            r"[\s\S]*?</style></noscript>", "", out)
        # 旧铸造台（#forge）已退场，跳转锚点要指向卡片铸造台
        out = out.replace('href="#forge">跳到提示词铸造台', 'href="#castfloor">跳到卡片铸造台')
        out = out.replace("</head>",
                          "<noscript><style>"
                          ".fcard{block-size:auto!important}"
                          ".fcard-inner{transform:none!important;position:static}"
                          ".fcard-front,.fcard-back{position:static!important;"
                          "transform:none!important;backface-visibility:visible}"
                          ".back-scroll{overflow:visible!important}"
                          ".fcard-flip,.stamp{display:none}"
                          "</style></noscript></head>")
        extra = "".join(
            f'<script src="{js}" defer></script>' for js in spec.get("deck_js", [])
        )
        if spec.get("deck") and "prototype-deck-motion" not in extra:
            extra += '<script src="prototype-deck-motion.js?v=deck-01" defer></script>'
        out = out.replace("</body>",
                          '<script src="../assets/vendor/gsap.min.js"></script>'
                          '<script src="../assets/vendor/ScrollTrigger.min.js" defer></script>'
                          '<script src="../assets/vendor/TextPlugin.min.js" defer></script>'
                          '<script src="prototype-cards.js?v=cards-03" defer></script>'
                          + extra + '</body>')

    return out


def main() -> None:
    for spec in PAGES:
        out = build(spec)
        (PROTO / spec["file"]).write_text(out, encoding="utf-8")
        print(f'{spec["file"]}: {len(out):>7} 字节 · {len(spec["docs"])} 份真源 · '
              f'{len(spec["stage"])} 块交互')


if __name__ == "__main__":
    main()
