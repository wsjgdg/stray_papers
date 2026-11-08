#!/usr/bin/env python3
"""Build a single offline HTML file from the maintained Algorithm Lab sources."""
from base64 import b64encode
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "styles.css").read_text(encoding="utf-8")


def embed_font(match):
    relative = match.group(1)
    font = (ROOT / relative).read_bytes()
    encoded = b64encode(font).decode("ascii")
    return f"url('data:font/woff2;base64,{encoded}')"


css = re.sub(r"url\('(assets/fonts/[^']+\.woff2)'\)", embed_font, css)
stylesheet = '<link rel="stylesheet" href="styles.css">'
scripts = [
    '<script defer src="model.js"></script>',
    '<script defer src="practice.js"></script>',
    '<script defer src="studio-model.js"></script>',
    '<script defer src="knapsack-model.js"></script>',
    '<script defer src="more-model.js"></script>',
    '<script defer src="garden-model.js"></script>',
    '<script defer src="beat-model.js"></script>',
    '<script defer src="sound-model.js"></script>',
    '<script defer src="sound.js"></script>',
    '<script defer src="app.js"></script>',
    '<script defer src="studio.js"></script>',
    '<script defer src="knapsack.js"></script>',
    '<script defer src="more.js"></script>',
    '<script defer src="garden.js"></script>',
    '<script defer src="beat.js"></script>',
]
if stylesheet not in html or any(script not in html for script in scripts):
    raise RuntimeError("The source page no longer has the expected stylesheet/script tags")
html = html.replace(stylesheet, f"<style>\n{css}\n</style>", 1)
for script in scripts:
    pattern = r"(?m)^[ \t]*" + re.escape(script) + r"[ \t]*(?:\n|$)"
    html, removed = re.subn(pattern, "", html, count=1)
    if not removed:
        raise RuntimeError(f"Expected a script tag on its own line: {script}")
inline_scripts = []
for name in ("model.js", "practice.js", "studio-model.js", "knapsack-model.js", "more-model.js", "garden-model.js", "beat-model.js", "sound-model.js", "sound.js", "app.js", "studio.js", "knapsack.js", "more.js", "garden.js", "beat.js"):
    source = (ROOT / name).read_text(encoding="utf-8")
    if re.search(r"</script", source, re.IGNORECASE):
        raise RuntimeError(f"{name} contains a closing script tag and needs safe escaping")
    inline_scripts.append(f"<script>\n{source}\n</script>")
html = html.replace("</body>", "\n".join(inline_scripts) + "\n</body>", 1)
out = ROOT / "standalone.html"
out.write_text(html, encoding="utf-8")
print(f"Wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")
