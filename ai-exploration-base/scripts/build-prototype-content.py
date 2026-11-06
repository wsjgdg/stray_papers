#!/usr/bin/env python3
"""Render the reader-facing copy of ai-exploration-base/docs/content into the
playable prototypes, as a collapsible "原始文案与出处" dossier per chapter.

Source of truth: ai-exploration-base/docs/content/*.md (verified links, status
codes and visit dates are quoted from sources-p123.md / sources-p456.md).
Re-run after the content docs change:

    python3 ai-exploration-base/scripts/build-prototype-content.py

The script rewrites everything between the DOSSIER markers in each prototype
page; the story/interaction markup around it stays hand-written.
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROTO = ROOT / "prototype"

VISIT = "访问日期 2026-11-05"

# ---------------------------------------------------------------- link registry


class Page:
    def __init__(self, key: str, file: str, chapter: str, meta: str, lead: str):
        self.key = key
        self.file = file
        self.chapter = chapter
        self.meta = meta
        self.lead = lead
        self.blocks: list[str] = []
        self.source_links: list[tuple[str, str, str]] = []
        self.source_note = ""
        self.parts: list[tuple[str, list[tuple[str, str, str]]]] = []  # (文档名, 小节)

    # -- builders ---------------------------------------------------------
    def block(self, no: str, title: str, body: str, wide: bool = False) -> None:
        cls = "dossier-block is-wide" if wide else "dossier-block"
        self.blocks.append(
            f'<article class="{cls}"><span class="dossier-no">{no}</span>'
            f"<h3>{title}</h3>{body}</article>"
        )

    def link(self, name: str, url: str, meta: str, mark: str = "↗") -> str:
        if all(existing != url for _, existing, _ in self.source_links):
            self.source_links.append((name, url, meta))
        return (
            f'<li><span class="mark">{mark}</span><span>'
            f'<a href="{url}" target="_blank" rel="noopener noreferrer">{name}</a>'
            f"<small>{meta}</small></span></li>"
        )

    def links(self, rows: list[tuple[str, str, str]], intro: str = "") -> str:
        body = "".join(self.link(*row) for row in rows)
        head = f'<p class="dossier-tag">{intro}</p>' if intro else ""
        return f'{head}<ul class="dossier-links">{body}</ul>'

    # -- render -----------------------------------------------------------
    def render(self) -> str:
        sources = "".join(
            f'<li><a href="{url}" target="_blank" rel="noopener noreferrer">{html.escape(name)}</a>'
            f"<small>{html.escape(meta)}</small></li>"
            for name, url, meta in self.source_links
        )
        return f"""<!-- DOSSIER:START -->
<section class="dossier" id="content-dossier" aria-labelledby="dossier-{self.key}">
  <details>
    <summary>
      <span class="dossier-kicker">SOURCE DOSSIER / 内容真源 · {self.chapter}</span>
      <strong id="dossier-{self.key}">原始文案，与<em>全部出处</em>。</strong>
      <small>{self.meta} · 全文 {sum(len(parts) for _, parts in self.parts)} 节 · {len(self.source_links)} 条外链</small>
    </summary>
    <div class="dossier-body">
      <p class="dossier-lead">{self.lead} 往后是按文件分节、逐字接入的<strong>全文</strong>——正式站这一关写下的每一句都在里面，可直接对照或照抄。</p>
      <div class="dossier-grid">
        {''.join(self.blocks)}
      </div>
      {self.render_full()}
      <div class="dossier-sources">
        <h3>本关全部外链 <span>{len(self.source_links)} LINKS / {VISIT}</span></h3>
        <p>{self.source_note or '链接均取自 <code>docs/content</code> 的来源清单：状态码为清单记录值，403 / 521 为官方站点反爬，浏览器可正常打开；外部页面需要联网。'}</p>
        <ul class="dossier-source-list">{sources}</ul>
      </div>
      <p class="dossier-foot">上面这段文字与正式站第 {self.chapter} 关同源（<code>docs/content</code>）；改文案先改内容真源，再同步到页面。原型玩法不替代正文，也不改写原文里“演示样例”和“（示意）”的标注。</p>
    </div>
  </details>
</section>
<!-- DOSSIER:END -->"""



# ---------------------------------------------------------------- markdown in
#
# 附页后半部分逐字接入 docs/content 的原文：把 Markdown 原样转成网页，
# 不缩写、不改写、不删段。转换只处理文档里实际用到的语法。

DOCS = ROOT / "docs" / "content"

# 文档里明确标注“不采用 / 404 / 验证码拦截”的地址：保留文字，不做成死链。
DEAD_LINKS = (
    "https://agi.taobao.com",
    "https://kf.qq.com/product/wx_app.html",
    "https://kf.qq.com/touch/product/weixin_app.html",
    "https://www.bilibili.com/video/BV1YB6EB6Ekv",
)
DEAD_NOTE = "原链接已标注不采用 / 404，不接入"

SEEN_LINKS: list[str] = []


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


def md_parts(md: str) -> list[tuple[str, str, str]]:
    """按 ## 切成小节：返回 (标题, HTML, 统计)。"""
    chunks = re.split(r"^##\s+", md, flags=re.M)
    parts: list[tuple[str, str, str]] = []
    for n, chunk in enumerate(chunks):
        if not chunk.strip():
            continue
        if n == 0:
            title = "页首：标题与导语"
            body_md = re.sub(r"^#\s+.*$", "", chunk, count=1, flags=re.M)
        else:
            head, _, rest = chunk.partition("\n")
            title = head.strip()
            body_md = rest
        body_md = body_md.strip()
        if not body_md:
            continue
        html_body = md_html(body_md)
        count = f"{html_body.count('<p>') + html_body.count('<li>')} 段 / 条"
        parts.append((title, html_body, count))
    return parts


def _render_full(self: "Page") -> str:
    if not self.parts:
        return ""
    groups = []
    n = 0
    for doc, parts in self.parts:
        items = []
        for title, body, count in parts:
            n += 1
            items.append(
                f'<details class="dossier-part"><summary>'
                f'<span class="dossier-part-no">{n:02d}</span>'
                f"<strong>{inline(title)}</strong></summary>"
                f'<div class="dossier-part-body">{body}</div></details>'
            )
        groups.append(
            f'<section class="dossier-doc"><h4>{doc}</h4>{"".join(items)}</section>'
            if items else ""
        )
    total = sum(int(c.split(" ")[0]) for _, parts in self.parts for _, _, c in parts)
    return f"""
      <div class="dossier-full">
        <h3>全文 · 逐字接入 <span>FULL TEXT / {n} 节 · {total} 段</span></h3>
        <p class="dossier-tag">下面是内容真源里的原文，按小节折叠，没有缩写、没有改写；小节顺序与文件一致，文件名即出处。</p>
        {''.join(groups)}
      </div>"""


def full(self: "Page", *names: str) -> None:
    for name in names:
        path = DOCS / name
        parts = md_parts(path.read_text(encoding="utf-8"))
        self.parts.append((name, parts))
PAGES: dict[str, Page] = {}


Page.render_full = _render_full
Page.full = full


def page(*args, **kwargs) -> Page:
    p = Page(*args, **kwargs)
    PAGES[p.key] = p
    return p


# =====================================================================
# ① AI 能做什么
# =====================================================================
p1 = page(
    "p1", "chapter-01.html", "① AI 能做什么",
    "第 ① 关 · 5 张卡 · 演示与真人教程分开标注",
    "上面是可玩版本；这里保留正式版第 ① 关的完整文案、可照抄的提示词和每条真实案例链接。"
    "句子里写明“演示”的地方，原文就写着“演示”——改了字也要改标注。",
)

p1.block(
    "01", "五件事，<em>五种本事</em>",
    """<p>先说一个事实：<strong>你现在看的这个网站——每一页代码、每一句文案、每一处动画——都是 AI 写的。</strong>
    下面这几张卡片，每张都是一个真实的本事。点一下卡片，翻过来看它怎么做的。</p>
    <div class="dossier-quote"><p><strong>怎么玩：</strong>每张卡都能点一下翻面，背面藏着三样东西——一句能照抄的提示词、一个“现在就试”的入口、一句老实话：哪些是演示，哪些是真的。</p>
    <p>本页没有一张伪装成实拍的照片——画出来的图，都明明白白标着“示意”。</p></div>""",
    wide=True,
)

p1.block(
    "02", "AI 会做海报",
    """<p>社区活动需要一张海报？先让 AI 帮你确定配色、字体、版式，再把文字排出来。这里看到的海报是网页里的 CSS 排版示例，不是假装从图像模型生成的图片。</p>
    <div class="dossier-quote"><p>READ · SHARE · AUTUMN<br>秋日读书会<br>带一本你爱读的书 · 换一段别人的故事<br>本周六 下午 3 点 · 社区活动室<br>免费参加 ◆ 欢迎带朋友</p></div>
    <p><strong>给 AI 的话（你可以照抄）：</strong>“帮我做一张社区读书会海报的文字排版方案：主题‘秋日读书会’，暖色调，要有时间地点和一句话标语。”</p>
    <p>找设计师排版：约 3 小时 → AI：3 分钟（示意）。这张海报的版式，是 AI 写代码直接渲染出来的——你看不到任何一个手工调过的像素。</p>
    <span class="dossier-tag">演示作品 · 非实拍</span><span class="dossier-tag">3 小时 → 3 分钟（示意）</span>"""
    + p1.links(
        [
            ("万相营造：阿里官方电商 AI 制图", "https://www.wanxiang.art/", "官方工具 · 200 · 2026-11-06"),
            ("人民网：万相营造入选 2025 服贸会示范案例", "http://finance.people.com.cn/n1/2025/0920/c1004-40568186.html", "权威报道 · 200 · 2026-11-06"),
            ("豆包（照抄提示词的验证渠道）", "https://www.doubao.com", "官方站点 · 302→200 · 2026-11-05"),
        ],
        "照抄之后，去这两个地方各试一次",
    ),
)

p1.block(
    "03", "AI 会写作",
    """<p>这是一篇预置的文案示意。内容主意还是你出，AI 帮你把它整理成能发出去的话。自己憋文案：1 小时 → AI 辅助：30 秒（示意）。</p>
    <div class="dossier-quote"><p>55 岁才想明白：钱不是攒出来的，是管出来的 💰<br>年轻时只敢把钱放银行，后来才懂，让钱闲着也是一种亏。<br>现在我把家里的账分成三份：要用的、应急的、长期打算的。<br>不追高、不贪快，睡得着觉的理财才是好理财。<br>姐妹们，什么时候开始都不晚 🌱<br>#中年理财 #普通人的钱 #生活感悟</p></div>
    <p><strong>给 AI 的话（你可以照抄）：</strong>“我想给 50-60 岁的姐妹分享稳健理财心得，不推销任何产品，只分享生活感悟。请写一篇小红书笔记，口语化，带表情，300 字以内，最后加话题标签。”</p>
    <p>你可以把这句话发给豆包，看看它给你写什么；每次的回答不一定相同。</p>
    <span class="dossier-tag">演示文案 · 非真实发布</span>"""
    + p1.links(
        [
            ("火山引擎开发者社区：我用豆包批量做小红书，1 天产出 30 篇", "https://developer.volcengine.com/articles/7545105759953289254", "真人教程 · 200 · 2026-11-06"),
            ("B 站：一套可直接照抄的 AI 写小红书文案提示词", "https://www.bilibili.com/video/BV15w4m1v7Hv/", "视频教程 · 200 · 2026-11-06"),
            ("知乎：小红书博主在用的 AI 工具（含同款提示词句式）", "https://zhuanlan.zhihu.com/p/24440012751", "社区记录 · 403 反爬，浏览器可访问 · 2026-11-06"),
        ],
        "别人真的这么用",
    ),
)

p1.block(
    "04", "AI 会看账",
    """<p>你做了三十年财务，看账的本事比 AI 深。但 AI 一分钟就能替你做完初筛——这就是“老手 + AI”的用法：它跑腿，你判断。</p>
    <div class="dossier-quote"><p>我：把我家的月度开支表拍给你了，帮我看看哪几项最不合理？说人话。</p>
    <p>AI：看了你发的表，说三点：<br>1. 通讯费偏高——同档位多半有更便宜的套餐，值得打个电话问问；<br>2. 打车费里短途占比不小，几步路的车换骑车或公交，能省下不少；<br>3. 好几个自动续费的会员，有的已经一两个月没打开过，先关掉不亏。<br>想让我陪你把每一项都过一遍吗？</p></div>
    <p><strong>给 AI 的话：</strong>“把我家的月度开支表拍给你了，帮我看看哪几项最不合理？说人话。”</p>
    <p>对着表格看半天 → AI：1 分钟，还带建议（示意）。给 AI 看账时记得遮住姓名、账号等个人信息。</p>
    <span class="dossier-tag">演示对话 · 数字为示意</span>"""
    + p1.links(
        [
            ("CSDN：普通家庭如何借助 AI 进行记账", "https://blog.csdn.net/sinat_28750229/article/details/163530184", "真人分享 · 200 · 2026-11-06"),
            ("离别歌：AI 记账的最佳实践", "https://www.leavesongs.com/THINK/ai-bookkeeping-best-practices.html", "一手记录 · 200 · 2026-11-06"),
            ("网易·AI 新榜：半年百万用户的 AI 记账应用", "https://www.163.com/dy/article/K41NUAC605567EZL.html", "媒体报道 · 403 反爬，浏览器可访问 · 2026-11-06"),
        ],
        "真实案例对照",
    ),
)

p1.block(
    "05", "AI 会修照片",
    """<p><strong>泛黄的老照片、模糊的合影、缺了一角的旧照</strong>——AI 能把它们修得清清楚楚，还能上色。</p>
    <p>这里不摆一张假“修复前后图”；找一张自己的旧照，试一次才最有说服力。四步：① 手机相册里找一张老照片（或先翻拍）；② 打开豆包，点相机，把照片拍给它；③ 发这句话——“帮我把这张老照片修复清楚，把划痕去掉，再上个自然的颜色。”；④ 等几秒，看看结果，发给亲戚群，他们大概会问你是找谁修的。</p>
    <p>修好后记得把原图留档。AI 修的是“看起来”，原片才是底。</p>
    <span class="dossier-tag">真实可操作 · 非演示</span>"""
    + p1.links(
        [
            ("央视网：他们用 AI 技术修复照片，为走失孩子照亮回家路", "https://people.cctv.com/2023/12/05/ARTIhd6fhEgEJjk2s88tUN3O231205.shtml", "权威报道 · 200 · 2026-11-06"),
            ("凤凰网：AI 修复岁月影像，让泛黄记忆鲜活如初", "https://feng.ifeng.com/c/8xh1XDSNfRP", "权威报道 · 200 · 2026-11-06"),
            ("天极下载：豆包 AI 老照片修复实操教学", "https://mydown.yesky.com/news/317462.html", "图文教程 · 200 · 2026-11-06"),
            ("知乎：4 款免费“傻瓜式”AI 修复工具实测", "https://zhuanlan.zhihu.com/p/1982019771814920972", "工具清单 · 403 反爬，浏览器可访问 · 2026-11-06"),
        ],
        "同一件事，别人已经做过",
    ),
)

p1.block(
    "06", "AI 随时问",
    """<p>这就是 AI 最日常的用法：它不烦、不嫌问题小、24 小时在线。手机上任何不明白的事，都可以先问它。</p>
    <div class="dossier-quote"><p>我：手机总提示内存不够，微信里的照片怎么清理才不会误删？</p>
    <p>AI：三步，不误删：① 微信里点 我→设置→通用→存储空间，先清理缓存（缓存删了不影响聊天记录）；② 选“聊天记录管理”，只清理那些大视频群；③ 重要照片先存进手机相册再清微信。照这个做，一般能腾出好几个 G。</p></div>
    <p><strong>给 AI 的话：</strong>“手机总提示内存不够，微信里的照片怎么清理才不会误删？”</p>
    <p>网上搜半天，广告一大堆 → AI：直接给你步骤（示意）。操作路径以微信当前版本为准。</p>"""
    + p1.links(
        [
            ("新华报业网：微信存储一下少了 10G，亲测有效", "https://www.xhby.net/content/s68cd560de4b0b6a4ec2506f3.html", "媒体亲测 · 200 · 2026-11-06"),
            ("腾讯客服：微信官方帮助专区", "https://kf.qq.com/product/weixin.html", "官方入口 · 200 · 2026-11-06"),
            ("知乎：微信太占空间，怎样清理不丢聊天记录", "https://zhuanlan.zhihu.com/p/307904391", "社区教程 · 403 反爬，浏览器可访问 · 2026-11-06"),
        ],
        "清理之前，先看一眼官方路径",
    ),
)

p1.block(
    "07", "诚实声明 · 本关小结",
    """<div class="dossier-quote"><p>对话和数字是<strong>演示样例</strong>，方法是真的——每张卡背面都附了<strong>真人教程或报道链接</strong>，点开就能看到别人怎么做的。</p>
    <p>欢迎照着提示词发给<strong>豆包</strong>，亲自验证。真实的东西也有：这个网站本身、每句提示词、还有你亲手试出来的结果。</p></div>
    <p><strong>这一关想让你记住的一句话：</strong>AI 不是“以后会有用的东西”——<strong>今天、现在、这部手机上，它就能帮你干活</strong>。下一页我们看看它这两年跑得有多快。</p>
    <p>演示延伸渠道（本页未直接出现，供后续使用）：即梦、剪映——都免费，入门够用。</p>"""
    + p1.links(
        [
            ("即梦：AI 图像 / 视频创作", "https://jimeng.jianying.com", "官方站点 · 200 · 2026-11-05"),
            ("剪映：视频剪辑与“图文成片”", "https://www.capcut.cn", "官方站点 · 200 · 2026-11-05"),
        ]
    ),
    wide=True,
)

p1.full("p1-what-ai-can-do.md", "real-cases-p1.md", "sources-p123.md")

# =====================================================================
# ② AI 趋势与行业
# =====================================================================
p2 = page(
    "p2", "chapter-02.html", "② AI 趋势与行业",
    "第 ② 关 · 5 个时间点 · 4 个数字 · 5 个行业",
    "这一关是全站唯一引用统计数据的一页。下面每个数字都能点开原始报告或权威报道核对；"
    "分拣台上的情报卡是练习，不是报道原文。",
)

p2.block(
    "01", "这两年，<em>发生了什么</em>",
    """<p>有人觉得 AI 是“一阵风”。看完这一页你会发现：它不是风，<strong>是电</strong>——二十年前你学了电脑，就领先了同事一大步；这一次，机会摆在你面前。</p>
    <div class="dossier-quote">
      <p><strong>2022 年 11 月</strong>　ChatGPT 发布。<strong>两个月用户破一亿</strong>——成为当时史上用户增长最快的应用。AI 第一次被普通人用上了。</p>
      <p><strong>2024 年 5 月</strong>　GPT-4o 发布：AI 能听、能说、能看图——它开始“长出眼睛和耳朵”。</p>
      <p><strong>2024 年 12 月</strong>　Sora 视频生成开放：一句话，AI 拍出一段像模像样的视频。视频制作第一次不再需要摄像机。<br><small>诚实备注：OpenAI 已于 2026 年 3 月宣布逐步淘汰 Sora 独立应用；“一句话生成视频”的能力已经普及到各家产品。</small></p>
      <p><strong>2025 年 1 月</strong>　国产大模型 <strong>DeepSeek-R1</strong> 开源发布，震动全球科技圈——中国 AI 追上了第一梯队，而且免费、人人可用。</p>
      <p><strong>2025 年</strong>　“智能体（Agent）”成为行业主线：AI 从“你说一句它答一句”，进化到“给它目标，它自己干完整件事”。</p>
    </div>
    <p>时间线只用来呈现趋势先后，日期均为公开报道口径，不作为精确时间依据。</p>"""
    + p2.links(
        [
            ("新华网：ChatGPT，变革与风险（两个月破亿的来源）", "http://www.news.cn/2023-02/13/c_1129359575.htm", "200 · 2026-11-05"),
            ("新华网：新版 ChatGPT 在哪些方面“更像人”", "http://www.xinhuanet.com/tech/20240515/9a91d194f1114752bf38cc2cf6f9741f/c.html", "200 · 2026-11-05"),
            ("人民日报海外版：GPT-4o 直播演示", "http://paper.people.com.cn/rmrbhwb/html/2024-05/17/content_26058298.htm", "200 · 2026-11-05"),
            ("OpenAI：Hello GPT-4o（官方原始出处）", "https://openai.com/index/hello-gpt-4o/", "403 官方域名，浏览器可访问"),
            ("新华网：Sora 的突破与风险", "http://www.news.cn/tech/20240220/92a8a5bcb35c4e09bfd7ee0e5393d5ac/c.html", "200 · 2026-11-05"),
            ("OpenAI：Sora is here（官方原始出处）", "https://openai.com/index/sora-is-here/", "403 官方域名，浏览器可访问"),
            ("新华网：OpenAI 宣布放弃视频生成应用 Sora", "https://www.news.cn/world/20260325/20c661ac2f5542d8b8eccd5c764af5c8/c.html", "200 · 2026-11-05"),
            ("DeepSeek：DeepSeek-R1 发布公告", "https://api-docs.deepseek.com/news/news250120", "200 · 2026-11-05"),
            ("DeepSeek-R1 开源权重（GitHub）", "https://github.com/deepseek-ai/DeepSeek-R1", "200 · 2026-11-05"),
        ],
        "每一条都能自己点开核",
    ),
    wide=True,
)

p2.block(
    "02", "数字最诚实：<em>半年翻了一番</em>",
    """<div class="dossier-quote"><p><strong>5.15 亿</strong>　2025 年 6 月　我国生成式 AI 用户<br>
    <strong>+2.66 亿</strong>　比半年前　增加的用户数<br>
    <strong>36.5%</strong>　每 10 个中国人里　3.6 个在用</p></div>
    <p>柱状图口径：2024 年 12 月 2.49 亿 → 2025 年 6 月 5.15 亿（亿人）。图下原句：数据来源中国互联网络信息中心（CNNIC）《生成式人工智能应用发展报告（2025）》，2025 年 10 月发布，新华网、人民日报均有报道。</p>
    <p><strong>怎么读这个数：</strong>2024 年底全国才 2.49 亿人用，半年后就 5.15 亿——翻了一番。意思是，你身边的人一多半还在观望，<strong>现在开始一点都不晚</strong>；等到人人都在用的时候，才真的没有先发优势了。</p>
    <span class="dossier-tag">数据 · 非估算</span><span class="dossier-tag">每 10 人 3.6 个为 36.5% 的换算</span>"""
    + p2.links(
        [
            ("CNNIC：《生成式人工智能应用发展报告（2025）》发布页", "https://www.cnnic.net.cn/n4/2025/1021/c88-11391.html", "第一来源 · 200 · 2026-11-05"),
            ("新华网：我国生成式人工智能用户规模达 5.15 亿", "http://www.news.cn/tech/20251020/c7c8f6c858c249e2bb69515f40eeab8b/c.html", "200 · 2026-11-05"),
            ("新华网：报告发布报道", "https://www.news.cn/fortune/20251018/95ddc306f29f494fb188ed41ad8e5cca/c.html", "200 · 2026-11-05"),
            ("人民日报海外版：用户规模半年翻番", "http://paper.people.com.cn/rmrbhwb/pc/content/202510/21/content_30110422.html", "200 · 2026-11-05"),
            ("世界互联网大会官网：较 2024 年 12 月激增 2.66 亿", "https://cn.wicinternet.org/2025-10/20/content_38354748.htm", "200 · 2026-11-05"),
            ("CNNIC 官网（报告原文查询入口）", "https://www.cnnic.net.cn/", "200 · 2026-11-05"),
        ],
        "同一个数字，四处可对",
    ),
)

p2.block(
    "03", "各行各业，<em>正在被改写</em>",
    """<p>🛒 <strong>电商与销售</strong>：商品图、详情页文案、客服回复，越来越多交给 AI 生成；小商家一个人就能撑起过去一个小团队的活儿。<strong>对你的启示：</strong>做销售出身的人，懂客户 + 会用 AI 出内容，就是新打法。<br>
    比如：淘宝商家后台就有“AI 生成商品图”这类公开功能，点几下就能换背景、改构图，不用请美工。</p>
    <p>📱 <strong>自媒体与内容</strong>：写稿、配音、剪辑、画图，全流程都有 AI 工具；门槛从“会技能”变成“会表达”。<strong>对你的启示：</strong>你会讲保险、会算账，正好是 AI 替代不了的“真话”，缺的只是把内容做出来的手——AI 补上这只手。<br>
    比如：剪映的“图文成片”——贴一段文字进去，自动配上画面和配音，几分钟出一条视频。</p>
    <p>💼 <strong>金融与保险</strong>：产品解读、朋友圈文案、短视频脚本，这些“第一稿”越来越多交给 AI；银行的智能客服背后也越来越多是 AI。<strong>对你的启示：</strong>获客打法正在从“熟人推销”转向“内容获客”（第 4 关细讲）。<br>
    微事实：越来越多保险公司用 AI 做客户答疑和获客内容。<em>（定性表述，不点名具体公司）</em></p>
    <p>📊 <strong>财务与办公</strong>：发票识别、报表摘要、合同审阅，AI 几分钟出初稿（示意），人做最终把关。<strong>对你的启示：</strong>三十年财务经验是“最终把关”的资格——老经验 + 新工具，比纯新手强得多。</p>
    <p>🎓 <strong>教育与健康</strong>：孩子用 AI 答疑解惑，老人用 AI 问诊导诊、读懂体检报告。AI 正在成为每个家庭的新“家庭教师”和“导诊台”。<em>关键结论仍要听医生的。</em></p>"""
    + p2.links(
        [
            ("万相营造：一张商品图生成营销图", "https://www.wanxiang.art/", "200 · 2026-11-06"),
            ("新华网：淘宝星辰·图生视频向商家开放", "http://www.xinhuanet.com/tech/20250115/ad0511a9bd8746399f196800e5b47bee/c.html", "200 · 2026-11-05"),
            ("中国日报网：剪映“图文成片”，输入文字一键生成视频", "https://cn.chinadaily.com.cn/a/202104/01/WS606584cca3101e7ce97471f7.html", "200 · 2026-11-05"),
            ("剪映官网（图文成片入口）", "https://www.capcut.cn", "200 · 2026-11-05"),
            ("新华网：生成式人工智能应用场景持续拓展", "http://www.news.cn/tech/20251029/b02bdb2d8bce4275ad12cab941c00c86/c.html", "200 · 2026-11-05"),
        ],
        "行业功能都有出处",
    ),
    wide=True,
)

p2.block(
    "04", "口径与边界",
    """<p><strong>这一关想让你记住的一句话：</strong>用户半年翻一番的行业，<strong>你正站在它最快的那一段</strong>。不用焦虑，先逛完 6 关——你已经比观望的大多数人先出发了。</p>
    <p>“人数增长”不等于“你的行业一定赚钱”，也不等于“你一定能接到单”。本页把它当作有来源的观察，不拿它推算任何个人收入、职业替代率或成交率；分拣台与试验票完全在浏览器本地运行。</p>
    <p>行业应用描述来自报告“各领域应用”章节的定性描述；ChatGPT 两个月破亿为公开报道口径（优步约 6 年、Instagram 约 2.5 个月为媒体普遍引用的对比口径）。</p>""",
    wide=True,
)

p2.full("p2-trends.md")

# =====================================================================
# ③ 儿子的 AI 实验室
# =====================================================================
p3 = page(
    "p3", "chapter-03.html", "③ 儿子的 AI 实验室",
    "第 ③ 关 · 1 个可玩程序 · 4 个开源仓库",
    "这一关没有统计数字：所有能力描述都是对自家项目的第一手描述，点开 GitHub 就能逐项核对。"
    "原型里的规则调试台是新做的教学切片，不冒充原作。",
)

p3.block(
    "01", "先玩一个：<em>算法实验室</em>",
    """<p>下面这个就是其中之一，<strong>整个程序塞在这一个网页文件里，已经装进这个网站了</strong>。它是儿子和 AI 一起做的“算法游乐场”——你现在就可以玩。</p>
    <div class="dossier-quote"><p>🎨 <strong>生命画布</strong>：用画笔在画布上随手涂几笔，点 <strong>Play</strong>——涂过的地方会像细胞一样自己“生长”，GENERATION / ALIVE 数字实时跳动。</p>
    <p>🥁 <strong>节拍制作器</strong>：逐格点亮几个，编一小段节奏，点 <strong>Play loop</strong> 循环听效果，满意了还能导出音频文件。</p>
    <p>📐 <strong>算法工作室</strong>：写一小段指令点运行，它会一步一步把“一列数字怎么排好队”画给你看。</p></div>
    <p>真实界面截图：黑色画布上长出彩色的细胞图案，顶部显示 0 GENERATION、46 ALIVE——这些会“生长”的图案，是随手涂几笔点 Play 长出来的。</p>
    <p>内嵌打不开？直接双击文件夹里的 <code>assets/embed/algorithm-lab-standalone.html</code>，或在新窗口打开。</p>"""
    + p3.links(
        [("stray_papers：算法实验室所在仓库（README 有每个子项目入口）", "https://github.com/wsjgdg/stray_papers", "200 · 2026-11-05")],
        "源码在 GitHub（联网时点开）",
    ),
    wide=True,
)

p3.block(
    "02", "分工声明",
    """<p>这些项目里，<strong>绝大部分代码是 AI 写的</strong>，儿子负责出想法、定方向、验收效果、把不对的地方说清楚——就这么循环。</p>
    <p>不是 AI 给了一点点帮助，而是 AI 写代码、儿子定方向，一个功能一个功能磨出来的。你现在看的这个网站，也是同样做出来的。</p>
    <span class="dossier-tag">第一手陈述 · 非外部数据</span>""",
)

p3.block(
    "03", "再看三个“正经”的",
    """<p>🎼 <strong>乐谱识别器</strong>　拍一张乐谱照片，程序把上面的音符全部“读”出来，变成可编辑的数字乐谱。图像识别 + 音乐知识，两层 AI 技术叠在一起。</p>
    <p>📚 <strong>科研文献挖掘助手</strong>　帮材料科学家读论文的工具：一个人一年读不完的文献量，AI 辅助筛出有用的那些。科学家的活，AI 已经能打下手了。</p>
    <p>👀 <strong>视觉分析网站</strong>　一个能“看”东西的网站——把图片交给它分析。AI 的眼睛，就是这么一步步教出来的。</p>"""
    + p3.links(
        [
            ("score-transcriber：乐谱识别器", "https://github.com/wsjgdg/score-transcriber", "200 · 2026-11-05"),
            ("matlit-miner：科研文献挖掘助手", "https://github.com/wsjgdg/matlit-miner", "200 · 2026-11-05"),
            ("spot-visual：视觉分析网站", "https://github.com/wsjgdg/spot-visual", "200 · 2026-11-05"),
        ],
        "三个仓库，三条可核对的记录",
    ),
)

p3.block(
    "04", "这一关想让你记住的一句话",
    """<p>这些项目没有一个是“天才写出来的”。就是<strong>每天和 AI 聊：让它写，我来试，哪里不对说清楚，再让它改</strong>。这个方法，你已经会了——聊天谁不会呢？差的就是开始。下一关我们看看，这个方法能怎么帮你赚钱。</p>
    <p>本页没有伪造的在线演示：原型里的规则调试台是这次新做的教学切片，原作是上面那个完整 Algorithm Lab；两边不会同步进度。</p>""",
    wide=True,
)

p3.full("p3-lab.md")

# =====================================================================
# ④ 副业地图
# =====================================================================
p4 = page(
    "p4", "chapter-04.html", "④ 副业地图",
    "第 ④ 关 · 3 层路线 · 10 个免费工具",
    "三条路线、每一步、每个工具、每条合规红线都在下面；本关<strong>不引用任何收入数字</strong>——"
    "没有可验证的报道就不编。路线编织台只是按你的条件换轨，不预测收入。",
)

p4.block(
    "01", "第一层 · 今天就能做：<em>不用学，先赢一次</em>",
    """<p>🌱 <strong>AI 图文发朋友圈 / 小红书</strong>　用豆包生成一张节日图或一段走心文案，发出去。<strong>这一步不为赚钱，为的是跑通第一次</strong>——你会发现“我也能做出别人点赞的东西”。</p>
    <p>🎯 <strong>第一周目标</strong>　发 3 条 AI 帮你做的内容。不用告诉别人是 AI 做的——也别不好意思说，重点是体会一遍“想法 → AI → 成品”这条路有多短。</p>
    <p>⚠️ 别急着接任何“付费教程”，会用免费工具就够了。</p>
    <span class="dossier-tag">工具：豆包（写文案）· 即梦（配图）</span>"""
    + p4.links(
        [
            ("豆包（写文案）", "https://www.doubao.com", "200 · 2026-11-05"),
            ("即梦（配图）", "https://jimeng.jianying.com", "200 · 2026-11-05"),
        ],
        "都有免费额度，入门够用",
    ),
)

p4.block(
    "02", "第二层 · 学 1-3 个月：<em>学一点，正儿八经做起来</em>",
    """<p>🎬 <strong>保险知识短视频获客</strong>　不做熟人推销，做内容获客。把客户常问的问题做成一条条小视频，让陌生人主动来问你。<br>
    第 1 周：让 AI 写口播脚本，剪映“图文成片”一键出视频；第 2-3 周：发 10 条，看看哪类问题最有人问；第 2 个月：固定栏目，比如每周讲一个“保险误区”。<br>
    ⚠️ 合规红线：不承诺收益、不夸大保障、不贬低同业——AI 写完的稿子你要把关。</p>
    <p>🎨 <strong>AI 绘图 / 排版接单</strong>　社区小店的海报、菜单、朋友圈配图——很多小店主不会做也不愿花钱请设计。<br>
    第 1 周：学会即梦出图 + 修图，做 3 张样图；第 2 周：给两三家熟识的店免费做一次，换一句“能不能介绍”；之后：按单接活，随缘不囤货。<br>
    ⚠️ 单价不高，赚的是细水长流；不用 AI 生成名人头像，避免版权麻烦。</p>
    <p>📊 <strong>财务知识付费</strong>　三十年财务经验是你真正的护城河，AI 替代不了。把你最熟的东西做成小课：《家庭账本怎么记》《退休金规划避坑》。<br>
    第 1-2 周：对着手机语音说，AI 整理成文章；第 3-4 周：攒 5 篇，让 AI 排成一本小册子（PDF）；之后：朋友圈免费分享攒口碑，有人问再谈收费。<br>
    ⚠️ 合规红线：不荐股、不代客理财、不说“保证收益”——讲认知不讲产品。</p>
    <p>合规依据：《互联网保险业务监管办法》第十五条要求互联网保险营销宣传“不得进行不实陈述或误导性描述……不得片面或夸大宣传，不得违规承诺收益”；向公众提供证券投资分析、建议属持牌业务。</p>"""
    + p4.links(
        [
            ("《互联网保险业务监管办法》官方全文", "https://www.nfra.gov.cn/cn/view/pages/rulesDetail.html?docId=949137", "国家金融监督管理总局 · 200 · 2026-11-05"),
            ("北京证监局：防范互联网非法证券期货投资者咨询活动的风险警示", "https://www.csrc.gov.cn/beijing/c105537/c7643305/content.shtml", "200 · 2026-11-05"),
            ("证监会：证券投资咨询机构名录（查牌照）", "https://www.csrc.gov.cn/csrc/c101900/c1029656/content.shtml", "200 · 2026-11-05"),
            ("剪映（图文成片 / 剪辑）", "https://www.capcut.cn", "200 · 2026-11-05"),
            ("DeepSeek 开放平台（脚本 / API）", "https://platform.deepseek.com", "GET 200，HEAD 405 · 2026-11-05"),
            ("即梦（出图）", "https://jimeng.jianying.com", "200 · 2026-11-05"),
            ("可灵 AI（出图）", "https://klingai.kuaishou.com", "200 · 2026-11-05"),
            ("稿定设计（排版）", "https://www.gaoding.com", "200 · 2026-11-05"),
            ("WPS（排版成册）", "https://www.wps.cn", "200 · 2026-11-05"),
        ],
        "红线不是吓人，是原文写着的",
    ),
    wide=True,
)

p4.block(
    "03", "第三层 · 学 3-12 个月：<em>值得下功夫的技能投资</em>",
    """<p>这一层前期没有收入，但<strong>学会之后天花板最高</strong>——它让 AI 从“工具”变成“帮你干活的员工”。</p>
    <p>🔗 <strong>AI 工作流搭建</strong>　不用写代码，用扣子（Coze）这类拖拽工具，把“AI 写 → AI 查 → AI 发”串成自动流水线。比如每天自动生成一条养生知识发朋友圈。</p>
    <p>🤖 <strong>Agent 开发入门</strong>　Python 基础（1-2 月）→ 大模型 API（1 月）→ 做出第一个自动化小助手（1-2 月）。资源全免费：B 站视频课 + 官方文档。<strong>等你走到这一步，咱们母子一起做一个 agent。</strong></p>
    <div class="dossier-quote"><p>⚠️ <strong>第三层最重要的避坑：</strong>凡是让你“先交钱、保证学会、包赚钱”的培训班——回去看第 5 关骗局解剖室。这一层所有要学的东西，<strong>免费资源都学得会</strong>。</p></div>"""
    + p4.links(
        [
            ("扣子 Coze（免费入门）", "https://www.coze.cn", "200 · 2026-11-05"),
            ("B 站（工作流教程 / Python 视频课）", "https://www.bilibili.com", "200 · 2026-11-05"),
            ("Python 官方中文教程", "https://docs.python.org/zh-cn/3/tutorial/", "200 · 2026-11-05"),
        ],
        "这一层要学的东西，免费资源都学得会",
    ),
)

p4.block(
    "04", "关于收入，<em>说句实话</em>",
    """<p>三层里任何一条路，<strong>收入都和投入的时间、精力强相关，没有人能保证你赚多少</strong>——谁保证，谁就是骗子。第一目标永远是：跑通一次，拿到第一个反馈（一个赞、一个客户、一句谢谢）。钱是随之而来的事。</p>
    <p>三层里每条路都有人做成，也都有人半途放下——差别不在运气，在“走完第一步之后还走不走第二步”。这里不编收入数字。</p>
    <p><strong>节奏备注：</strong>上面写的“第几周”“第几个月”只是参考节奏，按自己的速度来。本页的路线排序是本地、可读的定性规则，不是成功概率；没有采集成本、市场供需、客户来源，也无法预测收入。</p>
    <span class="dossier-tag">无收入数字 · 编辑约定</span>""",
    wide=True,
)

p4.full("p4-side-jobs.md")

# =====================================================================
# ⑤ 骗局解剖室
# =====================================================================
p5 = page(
    "p5", "chapter-05.html", "⑤ 骗局解剖室",
    "第 ⑤ 关 · 8 幕剧本 · 每幕一条真实报道",
    "剧本是模拟的，但每一幕都有真实案件报道：下面逐幕给出原台词、解剖、正确动作和可点开的警方通报或报道。"
    "八幕剧本为典型杀猪盘手法的综合示意，非特定案件改编。",
)

p5.block(
    "01", "剧本与链条",
    """<p>先说清楚：<strong>想赚钱，完全没有错</strong>——这一关不是劝你别想钱，是带你把骗子的<strong>完整剧本</strong>看一遍。你要演一次“差点上当的人”。放心，花的是假钱，学到的是真本事。</p>
    <p>八幕链条：专家人设 → 甜头 → 稀缺 → 下载 App → 账面诱惑 → 提现收费 → 情感施压 → 收网。</p>
    <p>🛡️ <strong>铁律：</strong>任何让你先交钱才能取钱的，100% 是骗局；拿不准的时候，先给儿子打个电话，5 分钟后再决定。这不是不独立——这是最聪明的风控。</p>
    <span class="dossier-tag">综合示意 · 非特定案件改编</span><span class="dossier-tag">真实报道逐幕可查</span>""",
    wide=True,
)

ACTS = [
    (
        "第 1 幕 · 专家人设",
        "李老师（投资交流群）：欢迎新朋友进群！我做了 15 年私募，每天晚上 8 点免费分享大盘解读。进群福利：今晚荐一只票，跟上操作的这周都吃到肉了！",
        "群里晒收益截图的“群友”，很多是托。真正的私募经理公开荐股给陌生人免费带操作？这本身就不合规矩。",
        "查他的“牌照”：证监会官网查不到的“私募”，一律是假的。",
        ("深圳市公安局：短视频里的“股神”主动找你？当心！这是 80 万骗局的开始", "https://ga.sz.gov.cn/gkmlpt/content/12/12287/post_12287269.html", "警方拆解“股神”广告引流 → 拉群 → 群演造势 · 200 · 2026-11-06"),
    ),
    (
        "第 2 幕 · 甜头",
        "李老师：新来的姐妹先别大资金，先投 500 试试水，就当交个朋友。三个月下来群里的张姐都赚了小两千了！",
        "让你先小赚是剧本里的固定情节。你看到的“盈利数字”是平台后台画的，不是真钱。钓鱼先下饵，才好收竿。",
        "记住：稳赚不赔的“试水”，本身就是骗局的信号。",
        ("新浪财经：“2724 人的炒股群，除了自己全是托”", "https://finance.sina.com.cn/jjxw/2026-08-14/doc-ininfrtz9564749.shtml", "“托”晒虚假盈利截图，利用从众心理 · 200 · 2026-11-06"),
    ),
    (
        "第 2 幕 · 甜头（同题报道另见）",
        "东方财富网转载同一案件：“2724 人的炒股群，除了自己全是托”。",
        "同一个骗局会被不同媒体反复报道——这本身就是可以交叉验证的地方：搜到两条独立报道，比只信一个截图可靠。",
        "换一个来源再读一遍，看数字和细节是否对得上。",
        ("东方财富网：同题报道（另见）", "https://wap.eastmoney.com/a/202608143841062771.html", "同题转载 · 200 · 2026-11-06"),
    ),
    (
        "第 3 幕 · 稀缺",
        "李老师：机会来了！我们对接了一个“国家扶持的量化基金项目”，年化 18%，保本保息。名额只剩最后 7 个，今晚 12 点截止。",
        "“国家扶持”+“名额有限”+“今晚截止”——稀缺和权威同时压上来，让你来不及思考。真项目不会催你今晚交钱。",
        "任何“保本保息”都是违规承诺，正规产品法律上不允许这么说。",
        ("人民网：公安部公布十大高发电信网络诈骗类型", "http://society.people.com.cn/n1/2024/0625/c1008-40263971.html", "虚假投资理财类的官方定性 · 200 · 2026-11-06"),
    ),
    (
        "第 4 幕 · 下载 App",
        "李老师：群里的都下载我们平台的 App 操作，比股票软件方便，我发你安装包链接，手机上也方便随时看收益。",
        "这个“平台 App”是骗子自己做的：假行情、假账户，里面每一分“盈利”都是后台随手画的数字。官方应用商店搜不到的 App，一律不装。",
        "只从手机官方应用商店装 App；任何人发来的链接和安装包，一律不点、不装。",
        ("北京市公安局：警方揭秘投资理财诈骗新套路", "https://gaj.beijing.gov.cn/xxfb/fjjx/202412/t20241211_3963464.html", "克隆炒股 App，“一‘提现’就露馅” · 200 · 2026-11-06"),
    ),
    (
        "第 5 幕 · 账面诱惑（岔路口）",
        "（你投入了 2 万元）好像真的在赚钱？要不要把养老金也转进来？——假面板：鑫汇量化基金 · 账户总览，余额 26,000 元，今日收益 +6,000 元。",
        "屏幕上的数字可以随便改，提现出来才是钱。此刻你开始想的“养老金”，正是他们等的那句话。",
        "只看一条：钱能不能顺利取出来。取不出来，数字再好看都是零。",
        ("新京报：北京虚假网络投资理财电诈主要受害者为中老年人，最大 88 岁", "https://m.bjnews.com.cn/detail/1761656258168910.html", "发案占电诈 7%、被骗金额占 38% · 200 · 2026-11-06"),
    ),
    (
        "第 6 幕 · 提现收费",
        "平台客服：尊敬的用户，您申请提现需先缴纳 20% 保证金以完成账户解冻，解冻后本金收益将一并到账。",
        "“提现要交钱”，无论理由叫保证金、税费还是解冻金，100% 是骗局。这是整场骗局的目的地。",
        "铁律：任何让你先交钱才能取钱的，直接认定是骗局，停止转账。",
        ("上海市公安局松江分局：真实案例里“需缴纳 2 万元保证金解冻提现”", "https://gaj.sh.gov.cn/sjga/list/toGjDetail?lmName=%E8%AD%A6%E6%96%B9%E6%96%B0%E9%97%BB&lmUrl=list/toGjIndex?type=jwbd&pa=c756679f93e8708fd4be8289ef26c15542fe1f419a5529d4590b5b7bd83f5296", "与剧本台词同款话术 · 200 · 2026-11-06"),
    ),
    (
        "第 7 幕 · 情感施压",
        "李老师：姐，我知道你一个人带孩子不容易，这钱对你很重要。就差这最后一笔了，做完这次咱们就真正落袋为安，我在群里等你。",
        "前几步是专家，这一步是“懂你的家人”。硬的不行来软的——这套感情牌是针对多少人排练过的话术，不是真的懂你。",
        "越是这时候越要停。给儿子或家人打个电话，五分钟后再决定。",
        ("深圳市龙华区公安分局：骗子专挑“离异带娃”，日常嘘寒问暖后再引其下载假 App", "https://www.szlhq.gov.cn/bmxxgk/gafj/dtxx_124565/gzdt_124566/content/post_11932588.html", "套路分析第 2 条即“情感攻势” · 200 · 2026-11-06"),
    ),
    (
        "第 8 幕 · 收网",
        "——模拟结束。这不是编剧的想象力，这是全国每天都在真实发生的剧本。",
        "整条链：专家人设 → 小额甜头 → 制造稀缺 → 下载 App → 账面诱惑 → 提现收费 → 情感施压 → 收网。每一步都有名字，你走的时候看得见，就赢了一半。",
        "转发给群里的朋友，你还能救别人。",
        ("中国长安网：单亲妈妈 10 天被骗 150 万全过程（真实聊天记录）", "https://www.chinapeace.gov.cn/chinapeace/c100059/2021-09/06/content_12533425.shtml", "整条链条都有真实判例与警方通报 · 200 · 2026-11-06"),
    ),
]

for i, (title, line, anatomy, move, report) in enumerate(ACTS, start=2):
    p5.block(
        f"{i:02d}", title,
        f"""<div class="dossier-quote"><p>{line}</p></div>
        <p><strong>解剖：</strong>{anatomy}</p>
        <p><strong>✓ 正确动作：</strong>{move}</p>"""
        + p5.links([report], "这一幕在真实案件里"),
    )

p5.block(
    "10", "骗子心理学：<em>五个开关</em>",
    """<p>下面五张牌，是骗子反复使用的心理开关。<strong>不是让你不赚钱，是让你认得出这些开关被按下的瞬间。</strong></p>
    <div class="dossier-quote">
      <p><strong>1. 沉没成本</strong>　“都投这么多了，现在退出就全亏了。”——已经花掉的钱让人不甘心放手；想赚钱不是错，但已经亏的部分不该决定下一步。</p>
      <p><strong>2. 稀缺紧迫</strong>　“名额只剩最后 7 个，今晚 12 点截止。”——倒计时让你来不及思考、来不及问家人。真机会不会怕你冷静一晚。</p>
      <p><strong>3. 权威包装</strong>　“国家扶持项目”“15 年私募老师”“内部渠道”——帽子越大越唬人。真权威可以查证：证监会官网、企业查查，5 分钟见真伪。</p>
      <p><strong>4. 社会认同</strong>　“群里的张姐都赚了小两千了！”——晒单截图可以批量伪造。大家都赚了的群，恰恰是托最多的群。</p>
      <p><strong>5. 情感哄骗</strong>　“姐，我知道你不容易，就差这最后一笔。”——先做专家再做知心人，是排练好的剧本。真感情不会催你转账。</p>
    </div>""",
    wide=True,
)

p5.block(
    "11", "话术词典：<em>听到这些词，先停三秒</em>",
    """<div class="dossier-quote">
      <p><strong>“稳赚不赔”</strong>——正规投资产品法律上禁止承诺保本。说这话的，不是无知就是骗子——多数是后者。</p>
      <p><strong>“内部渠道 / 内部消息”</strong>——真有稳赚的内部渠道，他不会拉陌生人进群分享。</p>
      <p><strong>“国家扶持项目”</strong>——真扶持项目走官方渠道公开申报，不会在微信群里募资。上证监会官网一查便知。</p>
      <p><strong>“名额有限，今晚截止”</strong>——倒计时是让你跳过思考的开关。关掉它：任何好项目都经得起你睡一觉再决定。</p>
      <p><strong>“老师带你操作”</strong>——持牌投顾不会私下带人炒股。所谓“带你”，是带你进剧本。</p>
      <p><strong>“先交税 / 保证金 / 解冻金才能提现”</strong>——这是骗局的目的地。记住铁律：让你先交钱才能取钱的，100% 是骗局。</p>
    </div>"""
    + p5.links(
        [("人民网：公安部公布十大高发电信网络诈骗类型（六条话术的统一来源）", "http://society.people.com.cn/n1/2024/0625/c1008-40263971.html", "200 · 2026-11-06")]
    ),
    wide=True,
)

p5.block(
    "12", "赚钱之前的 5 分钟：<em>三件工具</em>",
    """<p>想赚钱没问题。<strong>赚钱之前，先花 5 分钟查这三样——这不是不信任机会，是保护你的本金。</strong></p>
    <div class="dossier-quote">
      <p>🛡️ <strong>国家反诈中心 App</strong>：手机应用商店搜“国家反诈中心”官方下载，开启来电预警——它能提前识别诈骗电话和 App。</p>
      <p>🛡️ <strong>反诈专线 96110</strong>：接到可疑电话、拿不准一件事，先拨 96110 问一句。这是公安的反诈劝阻专线，不收咨询费。如果 96110 打电话给你，一定要接——那是公安在劝阻你。</p>
      <p>🛡️ <strong>证监会官网 + 企业查查</strong>：www.csrc.gov.cn 查基金 / 投顾牌照；企业查查看公司注册时间和经营异常。</p>
    </div>"""
    + p5.links(
        [
            ("国家反诈中心 App 官方下载页", "https://fzapph5.gjfzpt.cn/QRCode/", "公安部反诈平台官方域名 · 200 · 2026-11-05"),
            ("应用宝：国家反诈中心 App（开发者“公安部刑侦局”）", "https://sj.qq.com/appdetail/com.hicorenational.antifraud", "200 · 2026-11-05"),
            ("公安部：反诈“国家队”推出七大反诈利器", "https://www.mps.gov.cn/n2256342/n6594994/c9081538/content.html", "官方域名 · 521 反爬，浏览器可访问"),
            ("深圳市公安局：96110 反诈预警劝阻专线说明", "https://ga.sz.gov.cn/JMHD/YWZSK/XJGL_ZS/content/post_13026457.html", "200 · 2026-11-06"),
            ("公安部：给反诈插上科技之翼（96110 三大功能）", "https://www.mps.gov.cn/n2255079/n4876594/n5104076/n5104077/c10117761/content.html", "官方域名 · 521 反爬，浏览器可访问"),
            ("证监会官网（查牌照）", "https://www.csrc.gov.cn", "200 · 2026-11-05"),
            ("证监会：公募基金管理机构名录", "https://www.csrc.gov.cn/csrc/c101900/c1029657/content.shtml", "200 · 2026-11-05"),
            ("企业查查", "https://www.qcc.com", "200 · 2026-11-05"),
        ],
        "三件工具，四个官方入口",
    ),
    wide=True,
)

p5.block(
    "13", "数字不会说谎：<em>为什么这一关最重要</em>",
    """<p><strong>400 余人 · 3000 万+</strong>　北京警方打掉过一个专骗老年人的团伙：以<strong>免费按摩</strong>引流，聊天摸清哪些老人“子女不在身边、经济条件好”，再用假“专家体检”虚构病症，一个项目收 1-2 万元——400 多位老人，被骗 3000 万余元。<strong>套路不在网上才叫骗局，哄你上钩的，都是同一套剧本。</strong></p>
    <p><strong>36 亿次</strong>　2025 年一年，全国公安会同有关部门<strong>拦截的诈骗电话有 36 亿次</strong>、诈骗短信 33 亿条，全年侦破电诈案件 25.8 万起。平均每 9 秒，就有 1000 多个诈骗电话被打出（按年度拦截量折算）。<strong>骗子的“客服团队”比你想的忙得多——他们不是碰运气，是工业化的。</strong></p>"""
    + p5.links(
        [
            ("公安部发布会：通报当前电信网络诈骗犯罪的最新形势（涉老健康养生诈骗案）", "https://www.mps.gov.cn/n2253534/n2253875/n2253877/c10493019/content.html", "官方通报 · 521 反爬，浏览器可访问 · 2026-06"),
            ("腾讯新闻：北京 400 多老人遭遇健康养生诈骗（同案可直连）", "https://news.qq.com/rain/a/20260612A0460300", "200 · 2026-11-05"),
            ("南方新闻网：免费按摩诈骗案，涉案 3000 万余元", "https://static.nfnews.com/content/202606/12/c12520500.html?enterColumnId=3766", "200 · 2026-11-05"),
            ("新华网客户端：打着“养生馆”的幌子招揽老年顾客敛财", "https://app.xinhuanet.com/news/article.html?articleId=202606301a9acf32f8174e47a35ac9923e7712c9", "200 · 2026-11-05"),
            ("新华网：公安部 2025 年侦破电诈案件 25.8 万起、拦截诈骗电话 36 亿次", "https://www.xinhuanet.com/law/20260109/e5ac1ba872f244d9b01f53f9935c9f45/c.html", "200 · 2026-01-09"),
            ("中国经济周刊：涉资 2 亿多元的跨境“杀猪盘”团伙落网", "http://paper.people.com.cn/zgjjzk/html/2020-10/30/content_2017567.htm", "200 · 2026-11-06"),
            ("财联社：卧底股票“杀猪盘”，群里 10 个人 9 个托", "https://www.cls.cn/detail/2012300", "200 · 2026-11-06"),
        ],
        "数字都能自己查",
    ),
    wide=True,
)

p5.block(
    "14", "支线与页尾声明",
    """<p><strong>张姐晒单（第 3 幕触发）：</strong>“李老师带得准！我上周投的 8000，这周账户上已经 9400 了。妹妹你放心跟。”——晒单是“托”的日常工作：数字可以随便改，账户本来就是假面板，“大家都赚了”的群，恰恰是托最多的群。</p>
    <p><strong>给儿子打电话（第 7 幕触发）：</strong>儿子也许不懂投资，但旁边多一双眼睛、多一句“妈，先别转”，骗子就没了办法。真感情经得起商量；越催你“别告诉家人”的，越有鬼。</p>
    <p><strong>提前下车：</strong>现实里，走到岔路口还能停的人不多。不过把剧本剩下的部分也看完，下次你就不是“恰好躲过”，而是“一眼看穿”。</p>
    <p>本页剧本为典型杀猪盘手法的综合示意（演示样例），非特定案件改编；剧本是模拟的，但每一幕都有真实案件报道——链接见各幕解剖卡底部。现实中遇到可疑转账，请暂停，保留证据，通过独立渠道联系家人、警方或 96110。</p>""",
    wide=True,
)


p5.block(
    "15", "更多可核验的真实报道",
    """<p>以下是内容真源 <code>real-cases-p5.md</code> 里逐条验证过的延伸素材：它们不直接挂在某一幕，但都对应同一套手法——杀猪盘、荐股群、虚假投资理财。看不完没关系，挑一条最像你身边情况的看。</p>"""
    + p5.links(
        [
            ("央视网：网恋暗藏“杀猪盘”，女研究生被骗 77 万余元", "http://news.cctv.com/2020/07/02/ARTIxT6PgMuyxQtrBEWDL6e8200702.shtml", "200 · 2020-07-02"),
            ("经济观察网：荐股“杀猪盘”调查，“股神”卷走 4500 万跑路", "https://m.eeo.com.cn/2025/0817/745317.shtml", "200 · 2025-08-17"),
            ("中国新闻网：27 亿“荐股”骗局，受害者超 11 万人", "https://www.chinanews.com/cj/2021/03-20/9436565.shtml", "200 · 2021-03-20"),
            ("澎湃新闻：以爱行骗，“杀猪盘”如何趁虚而入", "https://www.thepaper.cn/newsDetail_forward_24741116", "403 HEAD / 200 GET，浏览器可访问"),
            ("澎湃新闻：网上交友 20 天被骗近 300 万，聊天记录全是套路", "https://www.thepaper.cn/newsDetail_forward_14378844", "403 HEAD / 200 GET，浏览器可访问"),
            ("新华网客户端：揭秘“杀猪盘”背后的心理控制术", "https://app.xinhuanet.com/news/article.html?articleId=b0503525-28bd-4149-9426-a10922d7bd00", "200"),
            ("湖南省公安厅：警惕虚假投资理财诈骗", "https://gat.hunan.gov.cn/gat/ztzl2/qfqz/202604/t20260416_33956050.html", "200 · 2026-04-16"),
            ("福建省公安厅：警惕“虚假投资理财诈骗”，小心一夜暴“负”", "https://gat.fujian.gov.cn/ztzl/fjjffpzxrx/zhxx/202502/t20250211_6713317.htm", "403 HEAD / 200 GET，浏览器可访问"),
            ("国家反诈中心：2025 版防范电信网络诈骗宣传手册（PDF）", "https://www.hsbc.com.cn/content/dam/hsbc/cn/docs/customer-education/anti-telecom-fraud-brochure-2025.pdf", "官方编印 · 银行反诈专区托管"),
            ("公安部：十大高发电信网络诈骗类型（原文，手机版）", "https://m.mps.gov.cn/n6935718/n7579327/c9077933/content.html", "官方域名 · 521 反爬，浏览器可访问"),
            ("白银市平川区政府：电诈典型案例·141，投资理财类诈骗", "https://www.bypc.gov.cn/zfxxgk/bmdwxzjd/xzjd/xpljdbsc/fdzdgknr/jwgk/dzsq/cwgk/art/2024/art_dc86266dafdc4c6eaf1c16cf2d654fc7.html", "200 · 2024"),
            ("中国网：快速识别虚假投资理财类诈骗，记住这三招", "https://www.zgwg.gov.cn/contents/14961/362296.html", "200 · 政府门户反诈专栏"),
        ],
        "内容真源里的延伸素材",
    ),
    wide=True,
)

p5.full("p5-anti-scam.md", "real-cases-p5.md", "sources-p456.md")

# =====================================================================
# ⑥ 提示词学院
# =====================================================================
p6 = page(
    "p6", "chapter-06.html", "⑥ 提示词学院",
    "第 ⑥ 关 · 3 个要素 · 3 档预写样例",
    "这一关不引用统计数字，也没有数据脚注；需要核对的只有一件事：A／B／C 三档回答都是<strong>为教学预写的演示样例</strong>，"
    "不是真实模型输出实录。",
)

p6.block(
    "01", "第一课：<em>好提示词只有三个要素</em>",
    """<p>① <strong>角色</strong>　告诉 AI 它是谁。<br>② <strong>背景</strong>　告诉它给谁看、什么场合。<br>③ <strong>要求</strong>　写多少字、什么口吻。</p>
    <div class="dossier-quote"><p>你是一位有 20 年经验的保险顾问<strong>（角色）</strong>。我想给 50-60 岁的客户讲重疾险的价值<strong>（背景）</strong>。请帮我写一段 300 字的口语化开场白<strong>（要求）</strong>。</p></div>
    <p>就多说了这三句，AI 的回答立刻从“网上抄的套话”变成“专为你定制”。这一个示例同时是结业页“今天（5 分钟）”行动卡的提示词。</p>
    <span class="dossier-tag">可照抄 · 非演示数据</span>""",
    wide=True,
)

p6.block(
    "02", "第二课：<em>亲手改一条烂提示词</em>",
    """<p>有人对 AI 只说了这句话——“帮我写点东西。”你觉得怎么问，AI 才能帮上忙？三个都可以点，看看差别。</p>
    <p><strong>A：</strong>写得好看一点，要感人。<br>
    预写回答：“好的！我可以帮您写很多东西，比如文章、诗歌、祝福语、自我介绍……请问您想要什么主题？大概多少字？给谁看的呢？”<br>
    点评：AI 只好把问题原样退回来——它根本不知道你要什么。这就是不说明白的结果。</p>
    <p><strong>B：</strong>帮我写一篇关于秋天的文章，500 字。<br>
    预写回答：“秋天来了，树叶黄了，风里带着一丝凉意。走在街上，脚下的落叶沙沙作响……”（以下是一段谁都能写的通用散文，共 500 字）<br>
    点评：这次 AI 写出来了，但这段话拿给任何人都能用——也就意味着它不属于你。</p>
    <p><strong>C：</strong>你是社区读书会主持人。下周活动的听众是 50-60 岁的邻居，主题是“读书让退休生活更有味”。请写 200 字口语化开场白，结尾要带动大家鼓掌互动。<br>
    预写回答：“各位邻居、各位书友，下午好！人到中年才明白，最好的养生不是保健品，是心里有个盼头……来，先把掌声送给愿意来的自己！”<br>
    点评：角色、听众、字数、口吻、结尾动作全都交代了——AI 一次就能给出几乎能直接用的话。</p>
    <span class="dossier-tag">A / B / C 均为演示样例</span><span class="dossier-tag">非真实模型输出</span>""",
    wide=True,
)

p6.block(
    "03", "第三课：<em>它会自己干活（Agent）</em>",
    """<p><strong>普通 AI：</strong>你问一句，它答一句——像打电话问客服。<br>
    <strong>AI Agent（智能体）：</strong>你给它一个目标，它<strong>自己拆步骤、自己干活、干完汇报</strong>——像雇了一个助理。</p>
    <p>比如你对 Agent 说：“帮我把下个月的朋友圈内容排出来”——① 查日历（找出下个月的节日）→ ② 写内容（生成 12 条文案）→ ③ 配图（为每条画好配图）→ ④ 汇报（排成表格交给你）。</p>
    <p>看懂了这个，你就比大多数人更懂 AI 的下一步。想学做这个的，回<strong>副业地图第三层</strong>——那是值得学的方向。</p>
    <p>注意：原型里的四步只是教学示意，没有连接智能体，也不会自动写文案或发朋友圈。</p>""",
    wide=True,
)

p6.block(
    "04", "毕业探索任务：<em>L1–L5</em>",
    """<p>不用一次做完，每完成一件，你就比昨天更进一步：</p>
    <p>🌱 <strong>L1 · 提一个好问题</strong>　打开豆包，用今天的“三要素”问一个你真正关心的问题。这是毕业作业的第一件。</p>
    <p>🎨 <strong>L2 · 完成一个作品</strong>　用 AI 做出一样东西：一张图、一段文案、一个小视频，做完整，别半途而废。</p>
    <p>🤖 <strong>L3 · 试一次“智能体式”体验</strong>　手机语音助手（Siri / 小爱）或豆包的“帮我做”功能：给它一个完整任务，看它自己拆步骤。</p>
    <p>🔍 <strong>L4 · 看懂儿子的一个项目</strong>　回第 3 关实验室，挑一个项目玩一遍，然后问儿子一句：“这个是 AI 怎么帮你做的？”</p>
    <p>🚀 <strong>L5 · 远期：和儿子一起做一个 Agent</strong>　等你走完副业地图第三层的学习路线——这一天不会太远。到时候我们做一个真正属于你的 AI 助手。</p>"""
    + p6.links(
        [
            ("豆包：从 L1 开始", "https://www.doubao.com", "官方站点 · 200 · 2026-11-05"),
            ("第 3 关实验室（L4 要回去的地方）", "chapter-03.html?v=lab-05", "站内原型 · 本地打开"),
            ("副业地图第三层（L5 的前置）", "chapter-04.html?v=weave-06", "站内原型 · 本地打开"),
        ],
        "两处站内去处，一处外部工具",
    ),
)

p6.block(
    "05", "这一关想让你记住的一句话",
    """<p>AI 就是最有耐心的学生——<strong>你把它要什么说清楚，它就把你要什么做出来</strong>。</p>
    <p>本关不引用任何统计数字，页面自身也没有来源区块；改动 A／B／C 文案须同时改页面内嵌脚本与内容真源。</p>""",
    wide=True,
)

p6.full("p6-academy.md")

# =====================================================================
# 00 拨盘 / 结业
# =====================================================================
p0 = page(
    "p0", "index.html", "00 拨盘 · 启动页 / 结业页",
    "启动页 · 结业证书 · 先读我",
    "拨盘不参与打卡，但站点的开场话、六关索引、结业证书和那封信都在这里，逐字保留。"
    "六关各自的完整文案，点进每一关底部的“原始文案与出处”即可。",
)

letter = """妈妈：<br><br>
这是一个专门为你做的网站，里面每一页都是 AI 帮忙做的。<br>
你正在读的这个文件，也是 AI 写的。<br><br>
怎么打开：<br>
1. 解压这个压缩包（右键 → 全部解压缩）<br>
2. 打开解压出来的文件夹，双击 index.html<br>
3. 它会在你的浏览器里打开（Edge 或 Chrome 都行）<br><br>
怎么玩：<br>
- 里面一共有 6 关，按顺序看效果最好，跳着看也没关系<br>
- 每看完一页，点页面顶部的「完成打卡」<br>
- 6 关全部通关后，最后一页有一份给你的结业证书<br><br>
有一页叫「骗局解剖室」，请一定走完一遍——<br>
那是儿子最想让你看的一页。不是吓你，<br>
是想让你看看骗子的完整剧本，看完你就再也不会上当了。<br><br>
想赚钱完全没问题，儿子支持你。<br>
里面写的每一条路，都是帮你把想法变成真本事。<br><br>
爱你的儿子<br><br>
最后一个小提醒：<br>
双击网页时，如果浏览器弹出“安全警告”，别慌——<br>
点「详细信息」，再点「仍然运行」就好。<br>
因为这是个本地文件，不是网站，放心用。"""

p0.block(
    "01", "给妈妈的信 · <em>先读我</em>",
    f'<div class="dossier-quote"><p>{letter}</p></div>',
    wide=True,
)

p0.block(
    "02", "启动页：<em>开场话与怎么玩</em>",
    """<p><strong>AI 探索基地</strong>　一座专门为你建的探索站：看看 AI 能做什么、它正在怎样改变各行各业、你能用它做点什么——还有一堂最重要的防骗课。</p>
    <p><strong>先看这封信 📩</strong>　和这个网页在同一个文件夹里的「先读我」，是儿子写给你的一封短信——30 秒就能读完。如果浏览器提示安全警告，点「详细信息」，再点「仍然运行」就行——这是个本地文件，不是网站。</p>
    <p><strong>怎么玩 🎮</strong>　下面是 6 个探索关卡。按顺序走效果最好，跳着看也完全可以。每看完一页，点页面顶部的「完成打卡」按钮——6 关全部通关，最后有一份给你的结业证书 🎓。进度会自动记在这个浏览器里，关掉再打开也不会丢。</p>
    <p><strong>原型版的区别：</strong>这六关在这里是可玩原型，不写正式站的打卡进度；正式站的六页与它们的文案同源。</p>""",
)

p0.block(
    "03", "六关索引",
    """<p>① AI 能做什么 · 亲眼看看 AI 做出来的东西<br>
    ② AI 趋势与行业 · 这两年发生了什么，机会在哪<br>
    ③ 儿子的 AI 实验室 · 这些项目全是 AI 陪着写出来的<br>
    ④ 副业地图 · 三条路：今天就能做 → 深度方向<br>
    ⑤ 骗局解剖室 · 儿子最想让你看的一页<br>
    ⑥ 提示词学院 · 学会提问，AI 才真正好用</p>
    <p>每关底部的折叠附页里，保留该关全部正文与出处。左卡“已经开始探索了吗？”通到结业证书；右卡“不知道从哪开始？”从第 1 关出发。</p>""",
)

p0.block(
    "04", "结业证书 · <em>证书正文</em>",
    """<p>CERTIFICATE OF EXPLORATION　结 业 证 书</p>
    <div class="dossier-quote"><p>兹证明<br><strong>妈妈</strong><br>已走完「AI 探索基地」全部六关，见证了 AI 能做什么、它正往哪里去、以及骗子用 AI 耍的花招。从今天起，你也可以让 AI 帮你干活了。<br>颁发人：<strong>爱你的儿子</strong>（和 AI 一起）<br>颁发日期：打开页面当天的日期</p></div>
    <p>🎉 恭喜！这一路你不是看客，是把六关都走完的探索者。</p>
    <p>未集齐时显示：证书还没解锁 🔒　当前进度：{已打卡数} / 6　还差这几关：……　按钮“回到探索地图继续 →”。</p>""",
)

p0.block(
    "05", "行动清单：<em>不用等结业，今天就能开始</em>",
    """<p>📅 <strong>今天（5 分钟）</strong>　在手机上装一个豆包（应用商店搜“豆包”，免费的），或者浏览器打开 doubao.com。然后把这句话发给它：<br>
    “你是一位有 20 年经验的保险顾问。我想给 50-60 岁的客户讲重疾险的价值，请帮我写一段 300 字的口语化开场白。”<br>
    这是提示词学院教的第一课：告诉 AI 它是谁、你要什么、给谁看。</p>
    <p>📦 <strong>本周（半小时）</strong>　用 AI 做<strong>一件小作品</strong>发到朋友圈：让 AI 帮你画一张节日祝福图、写一段配文，或者把今天想发的内容先请 AI 润色一遍再发。发完你会得到一个结论：<strong>原来我也能做出这种东西。</strong></p>
    <p>🗓️ <strong>本月（选一条路）</strong>　回到副业地图，从三条路里挑一条最顺眼的，只要求自己走完<strong>第一步</strong>。不用想太远，先走一步。</p>"""
    + p0.links(
        [
            ("豆包（今天就能开始）", "https://www.doubao.com", "官方站点 · 200 · 2026-11-05"),
            ("④ 副业地图（本月选一条路）", "chapter-04.html?v=weave-06", "站内原型 · 本地打开"),
            ("⑥ 提示词学院（三要素原课）", "chapter-06.html?v=calibrate-07", "站内原型 · 本地打开"),
        ],
        "今天的工具，本月的路",
    ),
    wide=True,
)

p0.block(
    "06", "给儿子的话（妈妈可以不点开）",
    """<p>① 演示建议：当面陪她把「骗局解剖室」走一遍，尤其是第 4 关让她自己选“继续投资”，体验上头的感觉比说教有效。</p>
    <p>② 帮她把豆包装进手机，第一次打开时陪她发第一条提示词。</p>
    <p>③ 她的进度存在浏览器里，换设备会重置——如果她换手机看，陪她重新打卡一次当复习。</p>
    <p>④ 后续迭代方向：真实 AI 成果素材替换占位展示、增加视频讲解、部署在线版。</p>""",
    wide=True,
)


p0.full("README.md", "p0-index-graduation.md")


# ---------------------------------------------------------------- inject

def _wordcount(p: Page) -> int:
    return sum(len(re.sub(r"<[^>]+>", "", body))
               for _, parts in p.parts for _, body, _ in parts)


MARK = re.compile(r"<!-- DOSSIER:START -->.*?<!-- DOSSIER:END -->", re.S)


def main() -> None:
    for p in PAGES.values():
        target = PROTO / p.file
        text = target.read_text(encoding="utf-8")
        if not MARK.search(text):
            raise SystemExit(f"{p.file}: dossier markers not found")
        text = MARK.sub(lambda _: p.render(), text, count=1)
        target.write_text(text, encoding="utf-8")
        print(f"{p.file}: {len(p.blocks)} blocks, {len(p.source_links)} links, "
              f"{sum(len(x[1]) for x in p.parts)} 原文小节, {_wordcount(p)} 字")


if __name__ == "__main__":
    main()
