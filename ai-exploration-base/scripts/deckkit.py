#!/usr/bin/env python3
"""②–⑥ 共用的「台面」零件：解析真源、拼分组台面、拼页尾链接表。

① 关（chapter01.py）是这套玩法的样板，这里的函数与它同一套类名，
所以视觉、动效、断点都跟着走：`.castfloor` / `.floor-group` / `.tile` /
`.floor-summary` / `.ktable-sec`。
"""

from __future__ import annotations

import html
import re


# ------------------------------------------------------------------ 通用解析

def sections(md: str) -> list[tuple[str, str]]:
    chunks = re.split(r"^##\s+", md, flags=re.M)
    out = []
    for chunk in chunks[1:]:
        head, _, body = chunk.partition("\n")
        out.append((head.strip(), body))
    return out


def blocks(body: str, level: int = 3) -> list[tuple[str, str]]:
    hashes = "#" * level
    chunks = re.split(r"^%s\s+" % hashes, body, flags=re.M)
    out = []
    for chunk in chunks[1:]:
        head, _, rest = chunk.partition("\n")
        out.append((head.strip(), rest))
    return out


def bullets(body: str) -> list[tuple[str, dict]]:
    """一段正文 → [(key, {val, items, quote, note_extra})]（与 chapter01 同规则）。"""
    rows: list[tuple[str, dict]] = []
    cur: dict | None = None
    for raw in body.splitlines():
        line = raw.rstrip()
        if line.startswith("#"):
            break
        if not line.strip():
            continue
        m = re.match(r"^-\s+(.*)$", line)
        if m:
            text = m.group(1).strip()
            key, sep, val = text.partition("：")
            if not sep:
                key, sep, val = text.partition(": ")
            if not sep:
                key, val = text, ""
            cur = {"val": val.strip(), "items": [], "quote": []}
            rows.append((key.strip(" *#"), cur))
            continue
        if cur is None:
            continue
        m = re.match(r"^\s+[-*]\s+(.*)$", line)
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


def pick(rows, *keys, field="val"):
    for key, row in rows:
        if any(k in key for k in keys):
            return row[field]
    return "" if field == "val" else []


def strip_md(text: str) -> str:
    return re.sub(r"[`*]", "", text or "").strip()


def esc(t: str) -> str:
    return html.escape(t or "", quote=True)


def rich(t: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", esc(t))


def paras(quote: list[str]) -> list[str]:
    out, cur = [], []
    for line in quote:
        if not line.strip():
            if cur:
                out.append("".join(cur).strip())
                cur = []
            continue
        cur.append(line)
    if cur:
        out.append("".join(cur).strip())
    return [p for p in out if p]


def md_tables(body: str) -> list[list[list[str]]]:
    """把正文里的 markdown 表格都抽出来（每张表是行→单元格）。"""
    tables, cur = [], []
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("|"):
            if set(s) <= set("|-: "):
                continue
            cells = [c.strip() for c in re.split(r"(?<!\\)\|", s.strip("|"))]
            cur.append(cells)
        elif cur:
            tables.append(cur)
            cur = []
    if cur:
        tables.append(cur)
    return tables


def anchors(text: str) -> list[tuple[str, str]]:
    """正文里的 <url> 与 [文字](url)。"""
    out = []
    for m in re.finditer(r"<https?://[^>]+>", text):
        url = m.group(0).strip("<>")
        out.append((url, url))
    return out


# ------------------------------------------------------------------ 台面

def castfloor(head: str, groups: str, summary: str = "", floor_id: str = "castfloor") -> str:
    return (
        f'<section class="castfloor" id="{floor_id}">'
        f'<header class="castfloor-head">{head}</header>'
        + groups
        + summary
        + "</section>"
    )


def head(kicker: str, ask: str, chips: list[str] | None = None,
         note: str = "", meter: str = "") -> str:
    chip_html = ""
    if chips:
        chip_html = ('<ul class="castfloor-chips">'
                     + "".join(f"<li>{rich(c)}</li>" for c in chips)
                     + "</ul>")
    note_html = f'<p class="castfloor-note">{rich(note)}</p>' if note else ""
    return (
        f'<span class="castfloor-kicker">{esc(kicker)}</span>'
        f'<p class="castfloor-ask">{rich(ask)}</p>'
        + chip_html + note_html + meter
    )


def group(title: str, sub: str, tiles: str, rail_class: str = "cardrail") -> str:
    return (
        '<div class="floor-group">'
        '<div class="floor-group-head">'
        f'<h3 class="floor-group-title">{rich(title)}</h3>'
        f'<p class="floor-group-sub">{rich(sub)}</p>'
        "</div>"
        f'<div class="{rail_class}">{tiles}</div>'
        "</div>"
    )


def summary(title: str, body_paras: list[str]) -> str:
    ps = "".join(f"<p>{rich(p)}</p>" for p in body_paras)
    return ('<div class="floor-summary">'
            f'<p class="floor-summary-k">{esc(title)}</p>'
            f'<div class="floor-summary-body">{ps}</div></div>')


def tile(kind: str, inner: str, span: int = 2, tag: str = "") -> str:
    tag_html = f'<span class="tile-tag">{esc(tag)}</span>' if tag else ""
    return (f'<article class="tile tile--{kind}" style="--span:{span}">'
            f"{tag_html}{inner}</article>")


# ------------------------------------------------------------------ 链接表

def source_rows(sources_md: str, wanted: tuple[str, ...]) -> list[dict]:
    """从 sources-pXXX.md 的 `| # | 名称 | URL | 状态码 | 用途 |` 表里挑出本页用的行。"""
    rows: list[dict] = []
    for head, body in sections(sources_md):
        if "403" in head or "剔除" in head or "分布" in head:
            continue
        for table in md_tables(body):
            for cells in table:
                if len(cells) < 4 or not cells[0].strip().isdigit():
                    continue
                url_m = re.search(r"<(https?://[^\s>]+)>", " ".join(cells))
                if not url_m:
                    continue
                use = re.sub(r"^P\d+\s*", "", cells[-1])
                if wanted and not any(w in cells[-1] for w in wanted):
                    continue
                rows.append({
                    "no": cells[0].strip(),
                    "title": strip_md(cells[1]),
                    "url": url_m.group(1),
                    "code": strip_md(cells[3]) if len(cells) > 3 else "",
                    "use": strip_md(use),
                })
    return rows


def source_rows_urls(sources_md: str, section_hint: str, limit: int = 0) -> list[dict]:
    """sources-p456.md 那种 `| URL | 状态码 | 用途 | 访问日期 |` 表：按小节标题挑行。"""
    rows: list[dict] = []
    active = False
    table: list[list[str]] = []

    def flush(table):
        for cells in table:
            if len(cells) < 3:
                continue
            url = strip_md(cells[0])
            if not url.startswith("http"):
                continue
            use = strip_md(cells[2])
            title = re.split(r"[（(]", use)[0].strip() or re.sub(r"^https?://", "", url).split("/")[0]
            rows.append({"no": "", "title": title, "url": url,
                         "code": strip_md(cells[1]), "use": use})

    for line in sources_md.splitlines():
        head_m = re.match(r"^#{2,4}\s+(.*)$", line)
        if head_m:
            flush(table)
            table = []
            active = section_hint in head_m.group(1)
            continue
        if not active:
            continue
        s = line.strip()
        if s.startswith("|"):
            if set(s) <= set("|-: "):
                continue
            table.append([c.strip() for c in re.split(r"(?<!\\)\|", s.strip("|"))])
        elif table:
            flush(table)
            table = []
    flush(table)
    return rows[:limit] if limit else rows


def extra_rows(items: list[tuple[str, str, str]]) -> list[dict]:
    return [{"no": "", "title": t, "url": u, "code": c, "use": ""} for t, u, c in items]


def linktable(rows: list[dict], title: str = "本页来源", note: str = "",
              by: str = "来源") -> str:
    if not rows:
        return ""
    # 每行都贴同一个标签（"对应""工具 / 依据"）等于没有信息——这种首列直接不排
    show_by = any(row.get("no") for row in rows)
    body = []
    for row in rows:
        badge = (f'<span class="kt-status">{esc(row["code"])}</span>'
                 if row.get("code") else "")
        host = re.sub(r"^https?://", "", row["url"]).split("/")[0]
        label = f'来源{row["no"]}' if row.get("no") else by
        body.append(
            "<tr>"
            + (f'<th scope="row" class="kt-card">{esc(label)}</th>' if show_by else "")
            +
            '<td class="kt-material">'
            f'<span class="kt-title">{esc(row["title"])}</span>'
            + (f'<span class="kt-abstract">{esc(row["use"])}</span>' if row.get("use") else "")
            + "</td>"
            f'<td class="kt-status-cell">{badge}</td>'
            '<td class="kt-link">'
            f'<a href="{esc(row["url"])}" target="_blank" rel="noopener noreferrer">'
            f'{esc(host)}<span aria-hidden="true"> ↗</span></a></td>'
            "</tr>"
        )
    note_html = f'<p class="ktable-note">{rich(note)}</p>' if note else ""
    return (
        '<section class="ktable-sec" id="links" aria-labelledby="ktable-title">'
        f'<h2 class="ktable-title" id="ktable-title">{esc(title)}</h2>'
        + note_html +
        '<div class="ktable-wrap"><table class="ktable"><thead><tr>'
        + (f'<th scope="col">{esc(by)}</th>' if show_by else "")
        + '<th scope="col">素材</th>'
        '<th scope="col">状态</th><th scope="col">链接</th>'
        "</tr></thead><tbody>" + "".join(body) + "</tbody></table></div></section>"
    )
