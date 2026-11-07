#!/usr/bin/env python3
"""把交付物打成一个 zip：项目目录 + docs + README.md + 先读我.txt。

用法（仓库根目录或任意位置都行）：

    python3 ai-exploration-base/scripts/package.py

产物：仓库根目录下的 `AI探索基地.zip`（.gitignore 已忽略 *.zip，不会进版本库）。
zip 里的顶层只有四项：

    AI探索基地/
      ai-exploration-base/   站点本身 + 构建脚本 + 内容真源
      docs/                  过程文档，以及 先读我.md（txt 的源）
      README.md
      先读我.txt              由 docs/先读我.md 生成

`bak/`、`.git/`、`__pycache__/`、旧的 zip 都不进包。
"""

from __future__ import annotations

import re
import sys
import unicodedata
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]      # 仓库根
PROJECT = ROOT / "ai-exploration-base"
DOCS = ROOT / "docs"
README = ROOT / "README.md"
GUIDE_MD = DOCS / "先读我.md"

PACKAGE_NAME = "AI探索基地"
ZIP_PATH = ROOT / f"{PACKAGE_NAME}.zip"

SKIP_DIRS = {"__pycache__", ".git", "bak", ".arena", "node_modules", ".idea"}
SKIP_SUFFIX = {".pyc", ".zip"}


# ----------------------------------------------------------------- 先读我.txt

def _plain(text: str) -> str:
    """去掉行内 Markdown 记号，留下能直接读的字。"""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\((.*?)\)", r"\1", text)
    # 加粗去掉后常在中文标点后留一个空格，读起来是断裂的
    text = re.sub(r"(?<=[，。、；：？！）」』])\s+(?=[^\x00-\x7f])", "", text)
    return text.strip()


def _chunks(text: str) -> list[str]:
    """切成"不可再分"的片段：连续的英文/数字/URL 是一块，每个汉字单独一块，空格单独一块。"""
    out: list[str] = []
    buf = ""
    for ch in text:
        if ch.isspace():
            if buf:
                out.append(buf); buf = ""
            out.append(" ")
        elif ord(ch) < 128:                    # ASCII：单词与 URL 不劈断
            buf += ch
        else:
            if buf:
                out.append(buf); buf = ""
            out.append(ch)
    if buf:
        out.append(buf)
    return out


def _width(text: str) -> int:
    """显示宽度：全角算 2，半角算 1。"""
    return sum(2 if unicodedata.east_asian_width(c) in ("W", "F") else 1 for c in text)


NO_LINE_START = "，。、；：？！）】」』％…—·,.;:?!)]}"


def _wrap(text: str, width: int = 74, indent: str = "  ") -> str:
    """按显示宽度断行：中文断在字间、英文按词断，标点不落在行首。"""
    if not text.strip():
        return ""
    lines: list[str] = []
    line, used = "", 0
    for chunk in _chunks(_plain(text)):
        if chunk == " ":
            if line and not line.endswith(" "):
                line += " "; used += 1
            continue
        w = _width(chunk)
        closing = chunk[0] in NO_LINE_START
        if used and not closing and used + w > width:
            lines.append(line.rstrip())
            line, used = "", 0
        line += chunk
        used += w
        if closing and used > width:            # 标点被挤出去时，就地收行
            lines.append(line.rstrip())
            line, used = "", 0
    if line.strip():
        lines.append(line.rstrip())
    return ("\n" + indent).join(lines)


def guide_to_text(md: str) -> str:
    """docs/先读我.md → 先读我.txt。

    连续的多行正文先拼回一整段再断行，否则 Markdown 里为排版换的行会被切碎。
    """
    def unfold(text: str) -> list[str]:
        """把项目符号的续行并回上一条：`- 一句话` 下面缩进两格的行属于同一项。"""
        lines, in_code = [], False
        for line in text.splitlines():
            if line.startswith("```"):
                in_code = not in_code
                lines.append(line)
                continue
            if not in_code and lines:
                prev = lines[-1]
                if re.match(r"^\s{2,}\S", line) and prev.startswith("- "):
                    lines[-1] = prev.rstrip() + line.strip()
                    continue
            lines.append(line)
        return lines

    out: list[str] = []
    para: list[str] = []
    quote: list[str] = []
    in_code = False
    list_open = False
    table: list[list[str]] = []

    def join_para(pieces: list[str] | None = None) -> str:
        text = ""
        for piece in (para if pieces is None else pieces):
            piece = piece.strip()
            if not text:
                text = piece
            elif text[-1].isascii() and piece[0].isascii():
                text += " " + piece            # 英文之间补空格
            elif text[-1].isascii() or piece[0].isascii():
                text += " " + piece if text[-1].isascii() else piece
            else:
                text += piece                  # 中文直接拼
        return text

    def drop_quote() -> None:
        if quote:
            out.append("  " + _wrap(join_para(quote), 70, "  "))
            out.append("")
            quote.clear()

    def close_list() -> None:
        nonlocal list_open
        if list_open:
            out.append("")
            list_open = False

    def drop_para() -> None:
        close_list()
        drop_quote()
        if para:
            out.append("  " + _wrap(join_para(), 74, "  "))
            out.append("")
            para.clear()

    def flush_table() -> None:
        rows = [r for r in table if r]
        if rows and any(h in "".join(rows[0]) for h in ("关", "标题", "在做什么")):
            rows = rows[1:]                    # 表头不进 txt，下面按条目排
        for cells in rows:
            if len(cells) >= 3:
                out.append(f"  {cells[0]} {cells[1]}")
                out.append("      " + _wrap(cells[2], 70, "      "))
                out.append("")
            elif cells:
                out.append("  " + _wrap(" ".join(cells), 74, "  "))
        table.clear()

    for raw in unfold(md):
        line = raw.rstrip()

        if line.startswith("```"):
            drop_para(); flush_table()
            in_code = not in_code
            if not in_code:
                out.append("")
            continue
        if in_code:
            out.append("    " + line)
            continue

        if line.startswith("|"):
            drop_para()
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(set(c) <= set("-: ") for c in cells):
                continue                       # 表格分隔行
            table.append(cells)
            continue
        flush_table()

        if not line.strip():
            drop_para()
            continue

        if line.startswith("# "):
            drop_para()
            out.append(_plain(line[2:]))
            out.append("=" * 40)
            out.append("")
            continue
        if line.startswith("## "):
            drop_para()
            if out and out[-1].strip():
                out.append("")
            out.append("【" + _plain(line[3:]) + "】")
            continue
        if line.startswith(">"):
            if para:
                drop_para()
            quote.append(line.lstrip("> ").strip())
            continue
        if re.match(r"^\s*[-*]\s+", line):
            if para:                           # 只冲掉正文缓存，不要打断正在写的列表
                drop_para()
            if not list_open:
                if out and out[-1].strip():
                    out.append("")
                list_open = True
            out.append("  · " + _wrap(re.sub(r"^\s*[-*]\s+", "", line), 68, "    "))
            continue
        if re.match(r"^\s*\d+\.\s+", line):
            drop_para()
            out.append("  " + _wrap(line, 70, "    "))
            continue

        para.append(line)

    drop_para(); drop_quote(); flush_table()
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text


# ----------------------------------------------------------------- 打包

def wanted(path: Path) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return False
    return path.suffix.lower() not in SKIP_SUFFIX


def collect(base: Path) -> list[Path]:
    if base.is_file():
        return [base]
    files = []
    for item in sorted(base.rglob("*")):
        if item.is_file() and wanted(item.relative_to(ROOT)):
            files.append(item)
    return files


def main() -> int:
    if not GUIDE_MD.exists():
        print(f"✗ 找不到 {GUIDE_MD.relative_to(ROOT)}")
        return 1

    guide_txt = guide_to_text(GUIDE_MD.read_text(encoding="utf-8"))
    txt_path = ROOT / "先读我.txt"
    txt_path.write_text(guide_txt, encoding="utf-8-sig")   # BOM：老版记事本也不乱码

    entries: list[tuple[Path, str]] = []
    for path in collect(PROJECT):
        entries.append((path, f"{PACKAGE_NAME}/{path.relative_to(ROOT).as_posix()}"))
    for path in collect(DOCS):
        entries.append((path, f"{PACKAGE_NAME}/{path.relative_to(ROOT).as_posix()}"))
    entries.append((README, f"{PACKAGE_NAME}/README.md"))
    entries.append((txt_path, f"{PACKAGE_NAME}/先读我.txt"))
    entries.sort(key=lambda e: e[1])

    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path, arc in entries:
            zf.write(path, arc)

    size = ZIP_PATH.stat().st_size / 1024 / 1024
    print(f"✓ {ZIP_PATH.name}  {len(entries)} 个文件  {size:.2f} MB")
    print(f"  先读我.txt  {len(guide_txt)} 字（源：docs/先读我.md）")
    tops = sorted({e[1].split("/")[1] for e in entries})
    print("  包内顶层：" + " / ".join(tops))
    return 0


if __name__ == "__main__":
    sys.exit(main())
