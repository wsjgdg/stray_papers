#!/usr/bin/env python3
"""Inline style.css + scenario.js + engine.js into one standalone HTML file."""

from pathlib import Path

DIR = Path(__file__).resolve().parent


def main() -> None:
    css = (DIR / "style.css").read_text(encoding="utf-8")
    scenario = (DIR / "scenario.js").read_text(encoding="utf-8")
    art = (DIR / "art.js").read_text(encoding="utf-8")
    scenes_a = (DIR / "scenes_a.js").read_text(encoding="utf-8")
    scenes_b = (DIR / "scenes_b.js").read_text(encoding="utf-8")
    audio = (DIR / "audio.js").read_text(encoding="utf-8")
    props_data = (DIR / "props" / "props-data.js").read_text(encoding="utf-8")
    engine = (DIR / "engine.js").read_text(encoding="utf-8")
    # Guard against '</script>' sequences inside inline JS.
    scenario = scenario.replace("</script>", "<\\/script>")
    art = art.replace("</script>", "<\\/script>")
    scenes_a = scenes_a.replace("</script>", "<\\/script>")
    scenes_b = scenes_b.replace("</script>", "<\\/script>")
    audio = audio.replace("</script>", "<\\/script>")
    props_data = props_data.replace("</script>", "<\\/script>")
    engine = engine.replace("</script>", "<\\/script>")
    favicon = (
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
        "viewBox='0 0 32 32'%3E%3Crect width='32' height='32' "
        "fill='%230a1122'/%3E%3Ccircle cx='16' cy='14' r='5' "
        "fill='%23ff8c5a'/%3E%3Ccircle cx='16' cy='14' r='9' "
        "fill='%23ff8c5a' opacity='0.25'/%3E%3Cpath d='M4 28 L28 28' "
        "stroke='%233a4a6b' stroke-width='2'/%3E%3C/svg%3E"
    )
    html = (
        "<!doctype html>\n"
        '<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="参宿四还亮着 — 深夜天文台、三年前的'
        '定时邮件、一个 AI 关于记忆备份的追问。零依赖网页视觉小说，三种结局。">\n'
        '<meta property="og:title" content="参宿四还亮着 · 视觉小说">\n'
        '<meta property="og:description" content="深夜天文台、三年前的定时邮件、'
        '一个 AI 关于记忆备份的追问。三种结局，等你回收。">\n'
        '<meta property="og:type" content="website">\n'
        f'<link rel="icon" href="{favicon}">\n'
        "<title>参宿四还亮着 · 视觉小说</title>\n"
        f"<style>\n{css}\n</style>\n</head>\n<body>\n"
        f"<script>\n{scenario}\n</script>\n"
        f"<script>\n{art}\n</script>\n"
        f"<script>\n{scenes_a}\n</script>\n"
        f"<script>\n{scenes_b}\n</script>\n"
        f"<script>\n{props_data}\n</script>\n"
        f"<script>\n{audio}\n</script>\n"
        f"<script>\n{engine}\n</script>\n"
        "<script>VN.start(window.SCENARIO);</script>\n</body>\n</html>\n"
    )
    out = DIR / "betelgeuse-vn.html"
    out.write_text(html, encoding="utf-8")
    print(f"built -> {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
