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

ROOT = pathlib.Path(__file__).resolve().parent.parent
PROTO = ROOT / "prototype"
DOCS = ROOT / "docs" / "content"


def _load_helpers():
    """复用 build-prototype-content.py 里的 Markdown 渲染（同一套规则）。"""
    path = pathlib.Path(__file__).with_name("build-prototype-content.py")
    spec = importlib.util.spec_from_file_location("_bpc", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.md_html, mod.inline


md_html, inline = _load_helpers()


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


def article_for(docs: list[str]) -> tuple[str, str, str, str]:
    md = "\n\n".join((DOCS / d).read_text(encoding="utf-8") for d in docs)
    title, lead = hero_from_doc(md)
    chunks = re.split(r"^##\s+", md, flags=re.M)
    parts: list[tuple[str, str]] = []
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
            body_html = md_html(body_md)
            body_html = re.sub(r"<table>(.*?)</table>",
                               r'<div class="src-tablewrap"><table>\1</table></div>',
                               body_html, flags=re.S)
            parts.append((title_txt, body_html))
    skip_rx = re.compile(r"页面元信息|页首|英雄区")
    kept = [(t, b) for t, b in parts
            if not skip_rx.search(t)
            and len(re.sub(r"<[^>]+>|\s", "", b)) > 20]
    sections = "".join(section_html(i + 1, t, b) for i, (t, b) in enumerate(kept))
    source_note = "、".join(f"<code>docs/content/{d}</code>" for d in docs)
    foot = (
        f'<p class="src-colophon">以上正文逐字来自内容真源 {source_note}，'
        "没有缩写、没有改写；改文案请先改真源，再跑 "
        "<code>scripts/build-source-pages.py</code> 重新生成。</p>"
    )
    meta = meta_from_doc(md)
    return title, lead, meta, f'<article class="src-article">{sections}{foot}</article>'


# ------------------------------------------------------------------ page spec

PAGES = [
    dict(file="index.html", key="00", docs=["p0-index-graduation.md"],
         stage=[("section", 'id="mission"')]),
    dict(file="chapter-01.html", key="01", docs=["p1-what-ai-can-do.md", "real-cases-p1.md"],
         stage=[("section", 'id="forge"')]),
    dict(file="chapter-02.html", key="02", docs=["p2-trends.md", "sources-p123.md"],
         stage=[("section", 'class="feed"'),
                ("section", 'id="verdict"'),
                ("section", 'class="editing-room"')]),
    dict(file="chapter-03.html", key="03", docs=["p3-lab.md"],
         stage=[("section", 'id="lab-proof"'),
                ("section", 'class="lab-onward"'),
                ("section", 'class="lab-history"'),
                ("section", 'class="lab-deck"')]),
    dict(file="chapter-04.html", key="04", docs=["p4-side-jobs.md"],
         stage=[("section", 'id="week-planner"'),
                ("section", 'class="path-panel"'),
                ("section", 'class="profile-panel"'),
                ("section", 'id="route-stage"')]),
    dict(file="chapter-05.html", key="05", docs=["p5-anti-scam.md", "real-cases-p5.md",
                                                 "sources-p456.md"],
         stage=[("section", 'class="phrases"'),
                ("section", 'class="reading"'),
                ("section", 'id="scene"'),
                ("details", 'id="tear-interlude"'),
                ("section", 'id="decision-room"')]),
    dict(file="chapter-06.html", key="06", docs=["p6-academy.md"],
         stage=[("details", 'id="sample-expand"'),
                ("details", 'id="after-expand"'),
                ("section", 'id="sample-station"'),
                ("section", 'class="after-station"'),
                ("section", 'id="trial-bay"'),
                ("section", 'id="calibration"')]),
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
    existing, rest = take(src, "div", lambda t: 'class="src-play-body"' in t)
    if existing:
        stage_bits = [re.sub(r'^<div[^>]*>|</div>$', "", existing.strip())]
        src = rest
    else:
        src = re.sub(r"<!-- DOSSIER:START -->[\s\S]*?<!-- DOSSIER:END -->", "", src)
        found = []
        for tag, needle in spec["stage"]:
            pos = src.find(needle)
            chunk, src = take(src, tag, lambda t, n=needle: n in t)
            if chunk:
                found.append((pos, chunk))
        stage_bits = [c for _, c in sorted(found, key=lambda x: x[0])]

    title, lead, meta, article = article_for(spec["docs"])

    nav = ""
    if onward:
        nav = onward

    head = head.replace(
        '<link rel="stylesheet" href="prototype-dossier.css?v=dossier-08">',
        '<link rel="stylesheet" href="prototype-dossier.css?v=dossier-08">'
        '<link rel="stylesheet" href="prototype-source.css?v=source-01">',
    )
    if "prototype-source.css" not in head:
        head = head.replace("</head>", '<link rel="stylesheet" href="prototype-source.css?v=source-01"></head>')

    body_class = body_open.group(0) if body_open else "<body>"
    stage = (
        '<section class="src-play" id="play">'
        '<header class="src-play-head"><span class="src-play-kicker">PLAY IT / 亲手试一下</span>'
        f'<h2>这一关的可玩部分</h2>'
        "<p>交互台原样保留：规则、动效、按钮都没动。它的文案与下面的正文同源"
        "（<code>docs/content</code>），要改就改真源，然后重新生成。</p></header>"
        f'<div class="src-play-body">{"".join(stage_bits)}</div></section>'
    )

    hero = (
        '<section class="src-hero">'
        f'<p class="src-kicker">SOURCE TEXT / 内容真源 · 第 {spec["key"]} 关</p>'
        f"<h1>{inline(title)}</h1>"
        + (f'<p class="src-lead">{inline(lead)}</p>' if lead else "")
        + (f'<p class="src-meta">{meta}</p>' if meta else "")
        + "</section>"
    )

    main = (
        f'<main class="src-main" id="source-{spec["key"]}">{hero}{stage}{article}{nav}</main>'
    )

    return strip_dossier(
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


def main() -> None:
    for spec in PAGES:
        out = build(spec)
        (PROTO / spec["file"]).write_text(out, encoding="utf-8")
        print(f'{spec["file"]}: {len(out):>7} 字节 · {len(spec["docs"])} 份真源 · '
              f'{len(spec["stage"])} 块交互')


if __name__ == "__main__":
    main()
