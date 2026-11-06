#!/usr/bin/env python3
"""把真源正文直接填进塞原文之前那套老页面的各个小节里。

原则：老页的 DOM、动效、排版全留着；老页自己写的叙述文字换成真源的逐字正文，
真源里有、老页没有的小节，用老页自己的版式补出来。页尾不再单独排一张「正文纸」。

    from legacy_pages import fill
    scene = fill("03", scene, md_text)
"""

from __future__ import annotations

import html
import re

# ------------------------------------------------------------------ md 取词


def _slice(md: str, start: str, stops: tuple[str, ...]) -> str:
    i = md.find(start)
    if i < 0:
        raise SystemExit(f"真源里找不到：{start}")
    rest = md[i + len(start):]
    cut = len(rest)
    for s in stops:
        j = rest.find(s)
        if 0 <= j < cut:
            cut = j
    return rest[:cut]


def quotes(md: str, start: str, stops: tuple[str, ...]) -> list[str]:
    """取一段里的引用块，按空行切成若干条。"""
    seg = _slice(md, start, stops)
    out, buf = [], []
    for line in seg.splitlines():
        t = line.strip()
        if t.startswith(">"):
            buf.append(t.lstrip("> ").strip())
        elif buf:
            out.append(" ".join(buf))
            buf = []
    if buf:
        out.append(" ".join(buf))
    return out


def modes(md: str, start: str, stops: tuple[str, ...]) -> list[tuple[str, str]]:
    """「三个玩法」那种 `**🎨 生命画布**` + 引用块的写法。"""
    seg = _slice(md, start, stops)
    out: list[tuple[str, str]] = []
    name, buf = "", []
    for line in seg.splitlines():
        t = line.strip()
        m = re.match(r"^\*\*(.+?)\*\*$", t)
        if m:
            if name and buf:
                out.append((name, " ".join(buf)))
            name, buf = m.group(1), []
            continue
        if t.startswith(">") and name:
            buf.append(t.lstrip("> ").strip())
    if name and buf:
        out.append((name, " ".join(buf)))
    return out


def rich(text: str) -> str:
    """真源里的 **粗体** 还原成 strong，其余原样转义。"""
    out, pos = [], 0
    for m in re.finditer(r"\*\*(.+?)\*\*", text):
        out.append(html.escape(text[pos:m.start()]))
        out.append(f"<strong>{html.escape(m.group(1))}</strong>")
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return "".join(out)


def paras(lines: list[str], cls: str = "") -> str:
    attr = f' class="{cls}"' if cls else ""
    return "".join(f"<p{attr}>{rich(x)}</p>" for x in lines)


# ------------------------------------------------------------------ ③ 关

def fill_03(scene: str, md: str) -> str:
    """③ 儿子的 AI 实验室：老实验台不动，页里的叙述换成真源正文。"""
    import chapter03 as _C3

    doc = _C3.parse(md)
    lead = quotes(md, "导语（lead）：", ("分工声明条",))
    split = quotes(md, "分工声明条（accent 高亮框）：", ("---",))
    group0, group1 = doc["groups"][0], doc["groups"][1]
    plays = [i for i in group0["items"] if i["type"] == "plays"][0]["plays"]
    embed = [i for i in group0["items"] if i["type"] == "embed"][0]
    projects = [i for i in group1["items"] if i["type"] == "project"]
    summary = doc["summary"]

    # 1) 页首导语
    m = re.search(r'(<div class="opening-text">[\s\S]*?<h1[\s\S]*?</h1>)([\s\S]*?)(</div>)', scene)
    if not m:
        raise SystemExit("③ 页首结构变了，找不到 opening-text")
    scene = scene[: m.start(2)] + paras(lead) + scene[m.end(2):]

    # 2) 「完整实验室」那一节：真源的引导正文 + 三个玩法
    m = re.search(r"(<p>)上面的规则调试台是这次新做的教学原型[\s\S]*?(</p>)", scene)
    if not m:
        raise SystemExit("③ 页里找不到那段「完整实验室」的说明")
    modes_html = "".join(
        f"<p><strong>{html.escape(p['emoji'])} {html.escape(p['name'])}</strong>"
        f"<span>{rich(' '.join(p['paras']))}</span></p>" for p in plays)
    frame = (
        '<figure class="lab-embed">'
        f'<iframe src="../{html.escape(embed["src"])}" title="{html.escape(embed["title"])}"'
        ' loading="lazy" referrerpolicy="no-referrer"></iframe>'
        f'<figcaption>{rich(embed["hint"])}'
        f' 打不开就<a href="../{html.escape(embed["src"])}" target="_blank" rel="noopener">新窗口打开</a>，'
        f'源码在 <a href="{html.escape(embed["repo"])}" target="_blank" rel="noopener noreferrer">'
        'GitHub · stray_papers</a>。'
        '</figcaption></figure>')
    scene = (scene[: m.start()]
             + '<div class="lab-fill">' + paras([embed["lead"]])
             + f'<div class="lab-modes">{modes_html}</div>{frame}</div>'
             + scene[m.end():])

    # 3) 作品索引：三张卡的说明换成真源正文
    for proj in projects:
        name = proj["name"]
        rx = re.compile(r"<strong>" + re.escape(name) + r"</strong><span>[\s\S]*?</span>")
        m = rx.search(scene)
        if not m:
            raise SystemExit(f"③ 作品索引里找不到：{name}")
        scene = (scene[: m.start()] + f"<strong>{html.escape(name)}</strong>"
                 f"<span>{rich(proj['body'])}</span>" + scene[m.end():])

    # 4) 页脚那句分工声明 + 收尾
    m = re.search(r"<small>这些是原关卡提到的项目[\s\S]*?</small>", scene)
    if not m:
        raise SystemExit("③ 作品索引页脚变了")
    scene = (scene[: m.start()]
             + f'<small class="lab-fill-note">{rich(" ".join(split))}</small>'
             + scene[m.end():])

    coda = ('<div class="lab-coda">'
            f'<span class="panel-kicker">THE WHOLE POINT / {html.escape(summary["title"])}</span>'
            + paras(summary["paras"]) + "</div>")
    m = re.search(r'</section>\s*(?=<nav|<section class="ktable)', scene)
    if m:
        scene = scene[: m.start()] + coda + scene[m.start():]
    else:
        scene = scene.rstrip() + coda
    return scene


# ------------------------------------------------------------------ ② 关

def fill_02(scene: str, md: str) -> str:
    """② 关：老趋势台就是这一页的主体；分拣用的情报全部来自真源。"""
    import chapter02 as _C2

    doc = _C2.parse(md)
    lead = _C2._lead(md)
    timeline = [i for i in doc["groups"][0]["items"] if i["type"] == "timeline"][0]["entries"]
    note = [i for i in doc["groups"][1]["items"] if i["type"] == "note"][0]["paras"]
    industries = [i for i in doc["groups"][2]["items"] if i["type"] == "industry"]
    summary = doc["summary"]
    slugs = ["ecom", "selfmedia", "finance", "office", "edu"]

    # 1) 页首导语（老页那句换成真源）
    m = re.search(r'(<h1 id="trends-title">[\s\S]*?</h1>)<p>[\s\S]*?</p>', scene)
    if not m:
        raise SystemExit("② 页首结构变了")
    scene = scene[: m.end(1)] + paras([lead], "opening-lead") + scene[m.end():]

    # 2) 领域按钮：真源五张行业卡，替换老页那三个写死的领域
    buttons = "".join(
        f'<button type="button" data-track="{slugs[n]}" aria-pressed="{"true" if n == 0 else "false"}">'
        f'<span>{n + 1:02d} / FIELD</span><strong>{html.escape(i["name"])}</strong>'
        f'<small>能自己试一件</small></button>'
        for n, i in enumerate(industries))
    m = re.search(r'<div class="track-chooser"[\s\S]*?</div>', scene)
    if not m:
        raise SystemExit("② 领域选择器变了")
    scene = scene[: m.start()] + f'<div class="track-chooser" role="group" aria-label="选择要判断的领域">{buttons}</div>' + scene[m.end():]

    # 3) 档案格：两条去处（已查证 / 可小试）
    bins_html = (
        '<button class="bin" type="button" data-bin="fact"><span class="bin-symbol">✓</span>'
        '<span class="bin-name">已查证</span><small>报告里有来源的观察，不乱推断</small>'
        '<span class="bin-count" id="count-fact">00</span>'
        '<span class="bin-contents" id="contents-fact">还没有情报</span></button>'
        '<button class="bin" type="button" data-bin="test"><span class="bin-symbol">↗</span>'
        '<span class="bin-name">可小试</span><small>低风险、能自己验证的一件小事</small>'
        '<span class="bin-count" id="count-test">00</span>'
        '<span class="bin-contents" id="contents-test">还没有情报</span></button>')
    m = re.search(r'<div class="bins">[\s\S]*?</div>', scene)
    if not m:
        raise SystemExit("② 档案格变了")
    scene = scene[: m.start()] + f'<div class="bins">{bins_html}</div>' + scene[m.end():]

    # 4) 数据展台那句话换成真源「怎么读这个数」
    m = re.search(r"<p><strong>人数增长 ≠ 你的行业一定赚钱。[\s\S]*?</p>", scene)
    if not m:
        raise SystemExit("② 数据展台那段变了")
    scene = scene[: m.start()] + "".join(f"<p>{rich(x)}</p>" for x in note) + scene[m.end():]

    # 5) 时间线：真源五条，排在台面之前
    rows = "".join(
        f'<li><span class="tl-when">{html.escape(e["when"])}</span>'
        f'<p>{rich(" ".join(e["paras"]))}</p></li>' for e in timeline)
    tl = ('<section class="trend-fill trend-timeline" aria-label="这两年，发生了什么">'
          '<div class="fill-head"><span>THE LAST THREE YEARS / 这两年，发生了什么</span>'
          '<h2>时间线，比口号诚实。</h2></div>'
          f'<ol class="tl-rows">{rows}</ol></section>')
    m = re.search(r'(<section class="trend-opening"[\s\S]*?</section>)', scene)
    if not m:
        raise SystemExit("② 页首 section 找不到")
    scene = scene[: m.end()] + tl + scene[m.end():]

    # 6) 收尾一句，放在来源抽屉之前
    coda = ('<div class="trend-fill trend-coda"><span class="fill-kicker">'
            f'{html.escape(summary["title"])}</span>' + paras(summary["paras"]) + "</div>")
    m = re.search(r'<details class="source-drawer"', scene)
    if not m:
        raise SystemExit("② 来源抽屉找不到")
    scene = scene[: m.start()] + coda + scene[m.start():]

    # 7) 老页的叙述文案跟上新数量
    scene = scene.replace("这四句话，<i>哪句能信？</i>", "这几句话，<i>哪句能信？</i>")
    scene = scene.replace("把四张情报投进正确的格子", "把情报分进正确的档案格")
    scene = scene.replace("ARCHIVE / 三个档案格", "ARCHIVE / 两个档案格")
    scene = scene.replace("四张情报都有去处后", "情报都有去处后")
    scene = scene.replace("四张情报", "情报")
    return scene


FILLERS = {"03": fill_03, "02": fill_02}


def fill(key: str, scene: str, md: str) -> str:
    fn = FILLERS.get(key)
    return fn(scene, md) if fn else scene
