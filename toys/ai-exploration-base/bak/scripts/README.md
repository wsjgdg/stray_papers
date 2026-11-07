# bak/scripts

这里是两个**已经退出构建流程**的渲染器，2026-11 从 `ai-exploration-base/scripts/` 移过来：

| 文件 | 原用途 | 为什么退役 |
|---|---|---|
| `chapter04.py` | ④ 关「副业地图」从 `p4-side-jobs.md` 渲染正文 | 现在 ④ 关由 `legacy/chapter-04.html` 直接出页，`legacy_pages.fill_04()` 不再 import 它 |
| `chapter06.py` | ⑥ 关「提示词学院」从 `p6-academy.md` 渲染正文 | 同上，`fill_06()` 不再 import 它 |

**还留在 `scripts/` 的两个同族文件不是死代码**，别一起搬：

- `chapter02.py`、`chapter03.py` 仍被 `legacy_pages.py` 的 `fill_02()` / `fill_03()` import，构建时会用来把真源正文灌进老页面。

回退方式：`git mv bak/scripts/chapter04.py ai-exploration-base/scripts/` 后在 `legacy_pages.py` 里恢复 `import chapter04 as _C4`。
这两个文件 import 的是 `deckkit`（仍在 `ai-exploration-base/scripts/deckkit.py`），所以真要单独跑，需要先把 `scripts/` 加进 `sys.path`。
