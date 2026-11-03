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
    engine = (DIR / "engine.js").read_text(encoding="utf-8")
    # Guard against '</script>' sequences inside inline JS.
    scenario = scenario.replace("</script>", "<\\/script>")
    art = art.replace("</script>", "<\\/script>")
    scenes_a = scenes_a.replace("</script>", "<\\/script>")
    scenes_b = scenes_b.replace("</script>", "<\\/script>")
    audio = audio.replace("</script>", "<\\/script>")
    engine = engine.replace("</script>", "<\\/script>")
    html = (
        "<!doctype html>\n"
        '<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<title>参宿四还亮着 · 视觉小说</title>\n"
        f"<style>\n{css}\n</style>\n</head>\n<body>\n"
        f"<script>\n{scenario}\n</script>\n"
        f"<script>\n{art}\n</script>\n"
        f"<script>\n{scenes_a}\n</script>\n"
        f"<script>\n{scenes_b}\n</script>\n"
        f"<script>\n{audio}\n</script>\n"
        f"<script>\n{engine}\n</script>\n"
        "<script>VN.start(window.SCENARIO);</script>\n</body>\n</html>\n"
    )
    out = DIR / "betelgeuse-vn.html"
    out.write_text(html, encoding="utf-8")
    print(f"built -> {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
