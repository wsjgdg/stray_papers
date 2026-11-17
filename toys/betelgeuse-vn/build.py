#!/usr/bin/env python3
"""Inline style.css + scenario.js + engine.js into one standalone HTML file."""

import hashlib
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
    sprites_path = DIR / "props" / "sprites-data.js"
    # optional raster sprites (AI-generated webp); absent = SVG-only build
    sprites_data = (
        sprites_path.read_text(encoding="utf-8") if sprites_path.exists() else ""
    )
    bg_path = DIR / "props" / "bg-data.js"
    # optional raster backgrounds (AI-painted webp); absent = CSS-only build
    bg_data = bg_path.read_text(encoding="utf-8") if bg_path.exists() else ""
    cg_path = DIR / "props" / "cg-data.js"
    # optional story CGs (AI key visuals); absent = CG-free build
    cg_data = cg_path.read_text(encoding="utf-8") if cg_path.exists() else ""
    audio_path = DIR / "props" / "audio-data.js"
    # optional sampled beds (AI music/SFX); absent = synth-only build
    audio_data = (
        audio_path.read_text(encoding="utf-8") if audio_path.exists() else ""
    )
    voice_path = DIR / "props" / "voice-data.js"
    # optional line voices (AI TTS); absent = text-only build
    voice_data = (
        voice_path.read_text(encoding="utf-8") if voice_path.exists() else ""
    )
    engine = (DIR / "engine.js").read_text(encoding="utf-8")
    # Guard against '</script>' sequences inside inline JS.
    scenario = scenario.replace("</script>", "<\\/script>")
    art = art.replace("</script>", "<\\/script>")
    scenes_a = scenes_a.replace("</script>", "<\\/script>")
    scenes_b = scenes_b.replace("</script>", "<\\/script>")
    audio = audio.replace("</script>", "<\\/script>")
    props_data = props_data.replace("</script>", "<\\/script>")
    sprites_data = sprites_data.replace("</script>", "<\\/script>")
    bg_data = bg_data.replace("</script>", "<\\/script>")
    cg_data = cg_data.replace("</script>", "<\\/script>")
    audio_data = audio_data.replace("</script>", "<\\/script>")
    voice_data = voice_data.replace("</script>", "<\\/script>")
    amb_path = DIR / "props" / "amb-data.js"
    # optional ambient beds (E1 environment layer); absent = no ambience
    amb_data = amb_path.read_text(encoding="utf-8") if amb_path.exists() else ""
    amb_data = amb_data.replace("</script>", "<\\/script>")
    bgm2_path = DIR / "props" / "bgm2-data.js"
    # optional bgm2 series (one-track-per-scene); absent = synth fallback
    bgm2_data = (
        bgm2_path.read_text(encoding="utf-8") if bgm2_path.exists() else ""
    )
    bgm2_data = bgm2_data.replace("</script>", "<\\/script>")
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
        f"<script>\n{sprites_data}\n</script>\n"
        f"<script>\n{bg_data}\n</script>\n"
        f"<script>\n{cg_data}\n</script>\n"
        f"<script>\n{voice_data}\n</script>\n"
        f"<script>\n{audio_data}\n</script>\n"
        f"<script>\n{amb_data}\n</script>\n"
        f"<script>\n{bgm2_data}\n</script>\n"
        f"<script>\n{audio}\n</script>\n"
        f"<script>\n{engine}\n</script>\n"
        "<script>VN.start(window.SCENARIO);</script>\n</body>\n</html>\n"
    )
    out = DIR / "betelgeuse-vn.html"
    out.write_text(html, encoding="utf-8")
    print(f"built -> {out} ({out.stat().st_size} bytes)")

    # split build (#24): lite shell without voice/bgm inline + two pack files
    # fetched and IndexedDB-cached by pack-loader.js. The full single-file
    # build above stays the file://-friendly default; the lite set is for
    # hosted deployments where >50MB files bypass the HTTP cache.
    loader = (DIR / "props" / "pack-loader.js").read_text(encoding="utf-8")
    loader = loader.replace("</script>", "<\\/script>")
    # pack-cache stamp (#24 loader): sha1 of both pack payloads — IndexedDB
    # cached packs bust exactly when the pack contents actually change
    pack_stamp = hashlib.sha1((audio_data + voice_data).encode("utf-8")).hexdigest()[:10]
    loader = f"window.VN_PACK_BUILD = '{pack_stamp}';\n" + loader
    lite_scripts = "".join(
        f"<script>\n{part}\n</script>\n"
        for part in (
            scenario,
            art,
            scenes_a,
            scenes_b,
            props_data,
            sprites_data,
            bg_data,
            cg_data,
            loader,
            audio,
            engine,
        )
    )
    lite_html = (
        "<!doctype html>\n"
        '<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="参宿四还亮着 — 深夜天文台、三年前的'
        '定时邮件、一个 AI 关于记忆备份的追问。零依赖网页视觉小说。">\n'
        f'<link rel="icon" href="{favicon}">\n'
        "<title>参宿四还亮着 · 视觉小说</title>\n"
        f"<style>\n{css}\n</style>\n</head>\n<body>\n"
        f"{lite_scripts}"
        "<script>VN.start(window.SCENARIO);</script>\n</body>\n</html>\n"
    )
    lite_out = DIR / "betelgeuse-vn-lite.html"
    lite_out.write_text(lite_html, encoding="utf-8")
    print(f"built -> {lite_out} ({lite_out.stat().st_size} bytes)")
    for name, data in (
        ("betelgeuse-bgm-pack.js", audio_data),
        ("betelgeuse-voice-pack.js", voice_data),
        ("betelgeuse-bgm2-pack.js", bgm2_data),
    ):
        p = DIR / name
        p.write_text(data, encoding="utf-8")
        print(f"built -> {p} ({p.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
