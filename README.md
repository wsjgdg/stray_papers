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

Note: one file inside `procedural-3d-fantasy-planet` has a filename that is
invalid on Windows (contains `:`); it cannot be checked out on Windows machines.
