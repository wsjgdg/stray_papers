# Topology · Persistent Homology & Topological Invariants

A zero-dependency, **pure HTML/CSS** interactive textbook (in Chinese) on topology and persistent homology — no JavaScript, no build step, no external assets. One self-contained file: `topology-persistent-homology.html`.

## What it covers

A full learning path from point clouds to topological signatures, in 14 chapters:

| # | Chapter |
|---|---|
| 00 | Overview: the full pipeline from point cloud to topological signature |
| 01 | Rubber-sheet geometry: allowed vs forbidden operations |
| 02 | Topological invariants: quantities unchanged under homeomorphism |
| 03 | Betti numbers: counting holes as integers (β₀, β₁, β₂) |
| 04 | Simplicial complexes & Rips filtration: turning point clouds into topology |
| 05 | Persistent homology: birth and death of every hole |
| 06 | Algorithm internals: matrix reduction and pairing |
| 07 | Barcodes & persistence diagrams: two readings of persistence |
| 08 | Worked experiment: full computation on a four-point "doorframe" |
| 09 | Surface classification: a gallery of topological signatures |
| 10 | Application map: where topological metrics shine |
| 11 | History: from the Seven Bridges of Königsberg to TDA |
| 12 | Self-test |
| 13 | Appendix: glossary & exercises |

## How interactivity works without JavaScript

All interactivity is CSS-only (`:checked` sibling selectors):

- **Theme switcher** — auto / light / dark via radio inputs
- **Reveal panels** — worked answers for example point sets (regular pentagon, 3×3 grid, double boxes)
- **Quiz sections** — radio-based self-check exercises
- **25 canvas/SVG figures** — static diagrams for complexes, barcodes and persistence diagrams

## Usage

Open the HTML file directly in any modern browser — no server, no install:

```
topology-persistent-homology.html
```

## Notes

- Single-file static textbook (~172 KB), suitable for offline reading or hosting on any static site.
- Language: Chinese (Simplified).
- Part of the `stray_papers` collection of self-contained one-off pages.
