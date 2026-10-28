# Algorithm Lab

A **standalone, dependency-free** visual playground for learning computer science algorithms and data structures. This folder is an independent project: it does not need any sibling project, server API, account, or network connection.

For a one-file download, open `standalone.html` in a modern browser; it embeds the styles, scripts, and fonts and works offline. You can also open `index.html` directly as long as the rest of this folder stays alongside it. To serve the project instead:

```sh
# From this folder:
python3 -m http.server 4173
# Open http://localhost:4173/
```

## What you can explore

| Concept | What to try | What the model demonstrates |
| --- | --- | --- |
| **Sorting** | Step through bubble, selection, or insertion sort; change the array size and generate a new array. | Comparisons, swaps and ordered regions. The implementations have O(n²) worst-case time and O(1) algorithmic extra space. Bubble sort stops early after an unchanged pass. |
| **Pathfinding** | Draw walls, clear or randomize them, then compare breadth-first and depth-first search. The focused grid also accepts arrow keys and Space. | BFS uses a queue and finds a shortest path in this unweighted grid; DFS uses a stack and may find a longer route. Both core searches are O(V + E). |
| **Binary search** | Set a target from 0–99, including one not in the sorted list. | Each comparison discards half the remaining range. Iterative search takes O(log n) time and O(1) algorithmic extra space. |
| **Stacks & queues** | Push/enqueue, pop/dequeue, and peek at up to seven values. | Last-in-first-out versus first-in-first-out. Switching modes starts a fresh example. |
| **Recursion** | Choose 0! through 8! and step through calls and returns. | Factorial reduces to a smaller call until the base case 0! = 1, then unwinds the call stack. |
| **Hash tables** | Insert `BA` when `AB` is already present; find and delete keys. | The toy hash sums Unicode code points modulo 11. Collisions use linear probing, and deleted slots leave tombstones so searches continue correctly. |

**Run** animates real recorded steps; **Step** advances one decision; **Reset** returns the current example to its starting state. For the path grid, Reset preserves the current walls, while Clear walls removes them. The playback snapshots consume additional memory; the complexity labels refer to the underlying algorithms, not the visualization's trace storage. Hash-table expected O(1) performance assumes a suitable hash and controlled load; the deliberately simple teaching hash is not production-ready.

## Files and tests

- `index.html`, `styles.css`, `app.js`: responsive interface, controls and Canvas 2D renderers.
- `standalone.html`: generated, single-file offline version. Rebuild it after source changes with `python3 scripts/build-standalone.py` from this folder.
- `model.js`: algorithms and data-structure operations, shared by the page and tests.
- `tests/models.test.js`: correctness checks for sorting, search, recursion, queues/stacks and collision handling.
- `assets/fonts/`: locally hosted DM Sans and Instrument Serif, with their SIL Open Font License texts.

With Node.js 18 or later:

```sh
node --test tests/*.test.js
```

All computation and assets remain local to the browser. No data is uploaded or saved between sessions.
