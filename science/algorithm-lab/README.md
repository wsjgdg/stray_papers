# Algorithm Lab

A **standalone, dependency-free** playground for creating and exploring computer science algorithms and data structures. Draw evolving art on the Living Canvas, compose rhythms in the Beat Maker, write and test your own algorithms, build knapsack problems, design weighted maps, encode messages, or learn from the guided visualizations and challenges. This folder is an independent project: it does not need any sibling project, server API, account, or network connection.

For a one-file download, open `standalone.html` in a modern browser; it embeds the styles, scripts, and fonts and works offline. You can also open `index.html` directly as long as the rest of this folder stays alongside it. To serve the project instead:

```sh
# From this folder:
python3 -m http.server 4173
# Open http://localhost:4173/
```

## Optional music and interaction sounds

The **Sound** button stays in the lower-right corner while you explore. Open it to turn on **Background music**, **Interaction sounds**, or both; choose one of three locally synthesized sound palettes and adjust their shared volume. **Turn both off** silences the soundscape in one action. Both switches start off on every page load. No audio starts without your choice, and both turn off if the page is hidden. Return and enable them again when you want sound.

With interaction sounds enabled, painting higher on the Living Canvas plays higher notes, erasing has a softer sound, and growth uses the living-cell count to choose a note. Guided visualizations, the Algorithm Studio, the knapsack table, weighted search, and Huffman coding also sound their real steps; pitches are mapped to the chosen scale from values such as the active array value, table value, route score, or merged frequency. Practice answers have different cues for a correct answer and another attempt. These cues are optional and supplement, rather than replace, the visual and written feedback. Rapid notes are rate-limited.

The soundscape pauses while the **Beat Maker** is playing, then returns when that loop is paused or stopped. Its sound previews, playback, and WAV export use separate controls and are not changed by the soundscape volume. If Web Audio is unavailable, the rest of the lab remains usable. All sounds are generated in the browser; no microphone, audio files, or network access are needed.

## Living Canvas: make a tiny world

The Living Canvas is a creative, interactive **cellular-automaton art studio**. Its starting artwork is editable, not a prerecorded animation:

1. Pick one of four inks or the eraser. Drag across the 24×16 canvas to draw, choose a broad brush, or place glider, pulse, heart, and flower stamps. **Clear** and **Surprise me** are undoable.
2. Press **Play** or **Step** to grow the pattern. **Back** revisits up to 120 recent generations, and **Reset** returns to your starting design. Drawing during playback pauses it and turns the visible frame into the new starting design. **Keep this moment** does the same without drawing. Undo/redo remembers up to 30 design edits; restoring an edit clears the temporary generation history.
3. Pick Life, HighLife, or Seeds, or expand **Invent your own rule** and choose the neighbor counts that cause a cell to be born or survive. Choose whether the edges stop or wrap around, and change the palette and cell shape. Changing a growth rule returns the simulation to the starting design so the comparison is reproducible; visual styling preserves the current frame.
4. Name and **Save design** to keep the starting design, rules, palette, and shape in this browser. The saved project does **not** include temporary playback history or the current generation; use **Keep this moment** first if you want to save the visible frame. **Export artwork** downloads the visible frame as a 1152×768 PNG; under **Saved designs & backups**, JSON download/import provides a portable, editable project. Up to 20 named designs can be stored locally. Browser storage can be blocked or cleared and is tied to the current browser/origin, so download a backup for important work.

Each generation updates cells **simultaneously** based on their eight neighbors. In Life, an empty cell is born with exactly three living neighbors, and a living cell survives with two or three. All four inks count equally for the rule. A newly born cell inherits the most common neighboring ink; ties favor the lowest-numbered tied ink, and birth with zero neighbors uses ink 1. One step takes O(width × height) time and space; the bounded playback and edit histories use extra memory. Changing a rule is a creative experiment, not arbitrary JavaScript execution.

For keyboard use, focus the canvas, move with arrow keys, and apply the selected brush or stamp with Space or Enter. **Precise & keyboard editing** also offers numeric coordinates and a text representation that distinguishes empty cells and all four inks. Play advances a single generation per click when reduced motion is requested; a running animation pauses when the page is hidden.

## Beat Maker: compose and remix a loop

Make an original four-track, 16-step loop. Tap a step to cycle through **off → soft → accent**; drag across steps to paint the same state. Select a track using its heading or the numbered picker above the rhythm wheel. The wheel is interactive too: tap a dot to change that step in the selected track. Select a sound (kick, snare, hi-hat, or chime), and choose a pitch for chime tracks. Multiple tracks can use chimes at different pitches to build a melody.

Press **Play loop** to hear your composition, edit while it plays, pause and resume, or stop to return to the beginning. Sound is generated locally and starts only after an interaction. Uncheck **Hear new notes as I edit** to turn off note previews. If Web Audio is unavailable, the editor and WAV export still work. Playback pauses when the page is hidden; its live timing can be affected by browser load, while the exported audio is rendered at precise sample positions.

The rhythm generator spreads 0–16 hits as evenly as possible over the loop, then rotates them by the chosen number of steps. **Spread hits** replaces the selected track with that pattern; **Remix track** changes three steps. Undo/redo remembers up to 30 edits, including clearing, generating, changing sounds, muting, and tempo. The loop is in 4/4, with each step a sixteenth note and tempo adjustable from 60–180 BPM. On the grid, arrow keys move between tracks and steps; Space or Enter changes a step. The wheel also supports arrow keys and Space or Enter.

**Save beat** stores up to 20 named compositions in this browser, including notes, sounds, tempo, and mute settings. **Download project JSON** and **Import project JSON** provide editable backups; storage is local to the browser/origin and can be blocked or cleared. **Export audio** renders four loops plus a short tail to a mono, 16-bit, 22,050 Hz WAV using the current sounds, accents, tempo, and mutes. It does not export MIDI or depend on a microphone. All four voices are synthesized locally; no audio or project data is uploaded.

## Array Algorithm Studio

The Studio is a creation workspace, not just a collection of preset animations. You can:

1. Name a project and enter your own starting array, either as text or by adding, editing, moving, and removing individual values.
2. Write an original algorithm in the editor. Start with a blank program, modify a starter, or insert editable instruction blocks. The advanced **Heap sort** starter builds a max heap and sorts in place; you can inspect and change its loops and swaps. The algorithm uses O(n log n) time and O(1) extra array space, excluding this interpreter's stored playback snapshots.
3. Run it, pause, step forward or backward, jump to the end, or seek through the recorded trace. The chart, current source line, variables, return value, and counters show what your program actually did. Editing the program or starting data invalidates the old trace without discarding your work. With reduced motion enabled, Run jumps to the end; manual stepping remains available.
4. Open **Test your algorithm** and add up to 10 cases with the example builder, or edit the case JSON directly. Click **Add test** to include a builder example in the project. An expected array checks the final array; an expected number checks the program's returned value. For example:

   ```json
   [
     { "input": [-2, 5, -1], "expect": [-4, 5, -2] },
     { "input": [-2, 5, -1], "expect": -1 }
   ]
   ```

5. **Save project** keeps up to 20 named projects in this browser's local storage; **Download JSON** and **Import JSON** provide a portable backup. Incomplete code, data, and tests can be saved as drafts. Opening another project or starting over warns about unsaved changes; navigation warnings depend on browser support. Saves are explicit, not automatic: browser storage is tied to the current browser/origin, can be cleared or blocked, and may not be shared between `index.html`, a server, and `standalone.html`. Download a backup for important work.

### Writing programs

The Studio uses a small, bounded **array language**, not JavaScript or a general-purpose programming environment. Programs are parsed and interpreted; they are never evaluated as JavaScript and cannot access the DOM or network. Array indexes start at 0, `n` is the array length, and `a[i]` reads a value. For example, this program doubles negative values and returns the resulting sum:

```text
set sum = 0
for i = 0 to n - 1
  if a[i] < 0
    write i, a[i] * 2
  end
  set sum = sum + a[i]
end
return sum
```

Instructions are `set name = expression`, `for name = start to end` (optionally `step value`), `while condition`, `if condition` / `else`, `swap index, index`, `write index, value`, `mark index`, and `return` or `return value`. Every `for`, `while`, and `if` block ends with `end`; `#` starts a comment. For-loop endpoints are inclusive, and the start, end, and step are evaluated on entry. The loop assigns its variable each iteration, so changing it inside the body does not change the next iteration. Arithmetic is integer-only; division truncates toward zero. Comparisons and the short-circuiting operators `and`, `or`, and `not` form conditions. Program and runtime errors report their line when applicable.

To keep execution and stored traces bounded, arrays have at most 24 whole numbers in the range −1,000,000 to 1,000,000; arithmetic results must stay in that range. Programs have at most 12,000 characters, 200 lines, 12 nested blocks, 32 variables, and 3,000 executed steps. Names begin with an ASCII letter and contain at most 20 letters, digits, or underscores. The editor also includes a concise language guide.

## Advanced lab: 0/1 knapsack

Build a problem by naming items, setting their integer weights and values, and choosing a bag capacity. Each item can be taken **once** or skipped. The dynamic-programming table finds the maximum total value that fits, then traces backward to recover one optimal set. The default example illustrates why choosing the highest value per weight first is not always optimal: the greedy choice gives 30, while the best pair gives 48.

Use **Step**, **Back**, the timeline, or **Run** to inspect each cell; **Finish** jumps to the answer. Gold marks the current cell and green marks previous-row dependencies. The accompanying text explains the choices without relying on color. Editing an item or capacity invalidates the old trace but leaves your inputs intact. The lab accepts up to 8 items, capacity 0–20, weights 1–20, and values 0–99. Ties are resolved by skipping the current item, so the trace produces one deterministic optimum even when several sets are equally good.

For item `i` and capacity `c`, the recurrence compares the best value without the item, `dp[i-1][c]`, to the item's value plus `dp[i-1][c-weight]` when it fits. Both alternatives come from the previous row, preventing reuse. For positive `n` and `C`, filling the table takes O(n × C) time and O(n × C) space. The bound depends on the **numeric** capacity, so it is pseudo-polynomial rather than polynomial in the input's bit length. Stored playback snapshots consume additional memory.

Scenarios are independent of Studio projects. **Save scenario** explicitly keeps up to 20 named scenarios in local browser storage; JSON download/import makes portable backups. Incomplete fields can be saved as drafts, but are validated before solving. Browser storage may be blocked, cleared, or isolated by origin, so download important scenarios.

## Beyond sorting: weighted search and Huffman coding

### Dijkstra’s shortest path

Paint an 8×5 map with entry costs of 1, 3, or 6, add walls, and move the start and goal. Activate individual cells with a mouse, touch, or keyboard; on narrow screens the map scrolls sideways. Use arrow keys to move between cells and Enter or Space to apply the chosen tool. Each move enters a neighboring cell (not diagonally); the starting cell itself costs zero. Imported maps may be as large as 12×8 and can use any whole-number entry cost from 1–9, or 0 for a wall.

Run **Dijkstra** to minimize total entry cost, or **breadth-first search** (BFS) to minimize the number of moves. Both searches can be stepped, reversed, or explored with the timeline; open the comparison to see their results on the same map. The default example has a tempting seven-move route costing 37; a nine-move detour costs only 9. The cells display `g` for best-known cost in Dijkstra or `d` for moves from the start in BFS. Colors and accessible labels identify the current cell, frontier, explored cells, and final route.

Dijkstra settles the least-cost frontier cell using a binary min-heap. With nonnegative costs it finds a minimum-cost route, while BFS finds a fewest-move route but ignores terrain prices. On this bounded-degree grid, Dijkstra takes O((V + E) log V) time and O(V + E) space, and BFS takes O(V + E) time and space, excluding stored playback snapshots. Comparison counts depend on the map and deterministic neighbor/tie ordering; they are not timing benchmarks.

### Huffman coding

Enter a message and watch the two least-frequent nodes merge until a single prefix-coding tree remains. The queue and tree show each recorded merge; the final codebook, encoded bit string, and round-trip check come from the actual input. Edges to the left encode `0`, and edges to the right encode `1`. Ties use first-seen/creation order, so the same input produces the same code. A one-symbol input uses `0` for that symbol.

The editor accepts up to 128 Unicode **code points** and 16 distinct symbols, with a 256-UTF-16-code-unit editing limit; a visual emoji can contain multiple code points. Spaces and line breaks are symbols. Empty text and inputs exceeding the algorithm limits can be saved as drafts but must be corrected before running. The textarea uses LF line endings; JSON imports containing carriage returns are rejected to avoid silently changing a message. A complete tree takes O(n + k log k) time, plus time proportional to the encoded output, for `n` input symbols and `k` distinct symbols, excluding playback snapshot work.

The displayed comparison is **UTF-8 input bits versus encoded payload bits**. It excludes the codebook/tree, framing, and byte padding, so it is not the size of a complete compressed file. The workshop verifies decoding, but does not create or read a standard compressed-file format.

Each workshop has its own shelf of up to 20 explicitly saved, named projects, plus JSON download and import. Edits invalidate an old trace without discarding the new inputs. Replacement and deletion use in-page confirmations; saves and deletes recheck cross-tab changes. Storage is local to the browser and origin, may be unavailable or cleared, and is not synchronized; download JSON for important work. All computation stays in the browser. With reduced motion enabled, Run jumps to the end while manual stepping remains available.

## What you can explore

| Concept | What to try | What the model demonstrates |
| --- | --- | --- |
| **Sorting** | Step through bubble, selection, insertion, or merge sort; change the array size or compare all four on the same starting array. | Bubble, selection, and insertion sort use O(n²) worst-case time and O(1) algorithmic extra space. Merge sort uses O(n log n) time and O(n) extra space. Bubble sort stops early after an unchanged pass. |
| **Pathfinding** | Draw walls, clear or randomize them, and compare breadth-first search, depth-first search, and A*. The focused grid also accepts arrow keys and Space. | BFS and A* find a shortest path on this unweighted grid; DFS may find a longer route. A* uses Manhattan distance as its heuristic. |
| **Binary search** | Set a target from 0–99, including one not in the sorted list. | Each comparison discards half the remaining range. Iterative search takes O(log n) time and O(1) algorithmic extra space. |
| **Stacks & queues** | Push/enqueue, pop/dequeue, and peek at up to seven values. | Last-in-first-out versus first-in-first-out. Switching modes starts a fresh example. |
| **Recursion** | Choose 0! through 8! and step through calls and returns. | Factorial reduces to a smaller call until the base case 0! = 1, then unwinds the call stack. |
| **Hash tables** | Insert `BA` when `AB` is already present; find and delete keys. | The toy hash sums Unicode code points modulo 11. Collisions use linear probing, and deleted slots leave tombstones so searches continue correctly. |

**Run** animates real recorded steps; **Step** and **Back** move one decision at a time, and the timeline jumps to any recorded step. These trace controls are available for sorting, pathfinding, binary search, and recursion; stacks/queues and hashing respond directly to operations instead. **Reset** returns the current example to its starting state. For the path grid, Reset preserves the current walls, while Clear walls removes them. The playback snapshots consume additional memory; the complexity labels refer to the underlying algorithms, not the visualization's trace storage. Hash-table expected O(1) performance assumes a suitable hash and controlled load; the deliberately simple teaching hash is not production-ready.

## Comparing sorts

Open **Compare the sorting algorithms** under the sorting sandbox to see each algorithm's final comparison and array-write counts for the same starting array. Selecting an algorithm in the table loads its trace. One swap counts as two main-array writes; merge sort counts each copy back from its temporary buffer, but not writes to the buffer itself. Counts describe this particular input and are not a timing benchmark. The displayed asymptotic bounds exclude the visualization's stored trace snapshots. During merge sort, the main array is left unchanged while the temporary buffer is built, then the entire merged range is copied back in one visual step.

## Comparing searches

In the pathfinding sandbox, open **Compare the searches** to run BFS, DFS, and A* on the same walls and compare visited cells and route lengths. Selecting a row loads that search without changing the walls. All moves have unit cost and are horizontal or vertical. A* prioritizes `f = g + h`, where `g` is the number of moves so far and `h` is the Manhattan distance to the goal, ignoring walls. That heuristic is consistent on this grid, so A* finds a shortest route when one exists. Ties are resolved by smaller `h`, then discovery order; visited counts include the goal and are not timings. BFS and DFS take O(V + E) time. This binary-heap A* takes O((V + E) log V) time and O(V) auxiliary space on the bounded-degree grid, excluding stored trace snapshots.

## Practice desk

Try 20 short prediction challenges, including ones for merge sort and A*. Choose an answer, request a hint if you need one, and check your reasoning against an explanation. **Try this in the sandbox** loads the challenge's example into the corresponding visualization, replacing that topic's current example so you can explore it. The six topic buttons and numbered question buttons let you move around freely; the next button advances through the set. Progress is counted only for the current browser session, and refreshing the page clears it. **Practice again** clears that challenge's solved state so it can be attempted anew.

The challenge choices and timeline support keyboard input. Canvas descriptions expose current values and structures to assistive technology; the pathfinding grid can also be edited with the keyboard. On touch devices, controls have larger targets and the compact stack and recursion diagrams are enlarged for small screens.

## Frontend performance

Inactive guided visualizations initialize their traces on first visit; the closed Huffman workshop also defers its preview until opened. Comparison tables are calculated only when opened and reuse the most recent unchanged input; editing the array or map invalidates the relevant result. Comparisons run the same algorithms without keeping every animation snapshot, while the labs retain complete traces for playback. The canvas caches its static background and coalesces resize redraws. These choices reduce repeated work without changing the displayed results or requiring a network connection.

## Files and tests

- `index.html`, `styles.css`, `app.js`: responsive interface, guided controls and Canvas 2D renderers.
- `studio-model.js`, `studio.js`: bounded array-language parser/interpreter and creation workspace, tests, playback, and project handling.
- `knapsack-model.js`, `knapsack.js`: 0/1 knapsack dynamic-programming trace, editable scenarios, playback, and local/JSON project handling.
- `more-model.js`, `more.js`: weighted Dijkstra/BFS and Huffman models, editable workshops, playback, and local/JSON project handling.
- `garden-model.js`, `garden.js`: coloured cellular-automaton model and interactive art canvas, tools, editable rules, PNG export, undo/redo, and project handling.
- `beat-model.js`, `beat.js`: rhythm generator, synthesized sounds and WAV renderer, interactive sequencer, playback, undo/redo, and project handling.
- `sound-model.js`, `sound.js`: opt-in synthesized soundscapes, interaction cues, audio lifecycle and volume controls.
- `standalone.html`: generated, single-file offline version. Rebuild it after source changes with `python3 scripts/build-standalone.py` from this folder.
- `model.js`: guided algorithms and data-structure operations, shared by the page and tests.
- `practice.js`: challenge prompts, explanations, answers and reproducible sandbox presets.
- `tests/*.test.js`: correctness checks for the guided models, challenges, Studio language, knapsack, weighted search, Huffman, cellular automata, rhythms, soundscapes, and WAV synthesis (including independent cross-checks).
- `tests/*.browser.cjs`: optional browser regressions for creation, algorithms, project handling, touch layouts, sound controls, media export, and offline use.
- `assets/fonts/`: locally hosted DM Sans and Instrument Serif, with their SIL Open Font License texts.

With Node.js 18 or later:

```sh
node --test tests/*.test.js
```

The optional browser checks need `playwright-core` and Chromium installed separately; they do not add a runtime dependency to the app. For example, with those already available:

```sh
# Run from this folder. CHROMIUM_PATH may be omitted if Playwright's browser is installed.
CHROMIUM_PATH=/path/to/chromium node tests/frontend.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/frontend.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/studio.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/studio.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/knapsack.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/knapsack.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/more.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/more.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/garden.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/garden.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/beat.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/beat.browser.cjs 320
CHROMIUM_PATH=/path/to/chromium node tests/sound.browser.cjs 1440
CHROMIUM_PATH=/path/to/chromium node tests/sound.browser.cjs 320
```

If `playwright-core` is installed outside the project, set `NODE_PATH` to its `node_modules` directory. For environments needing extra browser flags, set `CHROMIUM_ARGS` to a JSON array of arguments.

All computation and assets remain local to the browser; no data is uploaded. Living Canvas designs, Beat Maker compositions, Studio projects, knapsack scenarios, weighted maps, and Huffman projects are saved between sessions only when you explicitly save them. Guided examples and Practice Desk progress are not persisted.
