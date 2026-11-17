# stray_papers

A monorepo that consolidated a set of formerly separate personal experiment
repos into one place, with every repo's full commit history preserved
(each import is a two-parent merge commit).

## Why

Individual one-off repos scattered the experiments across GitHub. This repo
keeps them together, backed by a single history and one clone.

## How to use

1. Clone the repo; every project lives in its own self-contained folder.
2. To work on one project, just edit files under its folder and commit as usual.
3. To inspect a project's original history (from before the consolidation):
   `git log -- <project-folder>` — history is fully preserved, nothing squashed.
4. To import a new repo into the monorepo:
   `git filter-repo --to-subdirectory-filter <target-folder>/<name>` on a bare
   clone, fetch it here, and merge with two parents (see existing merge commits
   for the pattern).

## Windows pull/update pitfall

`toys/procedural-3d-fantasy-planet/width: 495pxheight: 754px;` contains a
colon — a character Windows filenames cannot carry. The clone/pull itself
succeeds (all data arrives), but any checkout that touches the file fails:

```
error: invalid path 'toys/procedural-3d-fantasy-planet/width: 495pxheight: 754px;'
```

Workarounds, in order of preference:

1. **Sparse-checkout, exclude the folder** — everything else lands on disk:
   ```
   git clone --no-checkout https://github.com/wsjgdg/stray_papers.git
   cd stray_papers
   git sparse-checkout set --no-cone '/*' '!/toys/procedural-3d-fantasy-planet/'
   git checkout main
   ```
2. **Stay out of the working tree entirely** (plumbing only — this is how the
   repo's own maintenance, e.g. the betelgeuse-vn snapshot update, operates):
   `read-tree` / `ls-tree` / `commit-tree` / `push` all work, but pass
   `-c core.protectNTFS=false` so the index accepts the invalid path.
   Never checkout that path on Windows even with protection off: Git would
   write the colon as an NTFS alternate data stream, not a normal file.
3. **WSL / Linux**: no issue at all.

Also note `toys/betelgeuse-vn/betelgeuse-vn.html` is ~91 MB — GitHub warns
above 50 MB per file but accepts up to 100 MB, so it passes today; if the
full build grows further, Git LFS becomes necessary.
