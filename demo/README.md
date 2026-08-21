# Demo gallery — messy code in, clear logic out

Files to show off the **Build Logic** analyzer and ready-made **workflow
boards**. Nothing here is wired into the app — copy, paste, load.

## `paste-in/` — code for the Build Logic analyzer

Drag one of these files onto the code panel (right side) — it opens the
editor with the file loaded — then click **Build Logic**. By hand instead:
click the **pencil**, paste the file, click **Build Logic**.

The point of both files is that they are *valid but unpleasant* code —
nested if/else, switches, loops, counters mutated from several branches —
exactly the kind of logic that is safer to modify visually than in text.

| File | What the tangle does |
|---|---|
| [`access-control.ts`](./paste-in/access-control.ts) | OAuth-style access check: token freshness with a retry loop, a role-tier switch, a scope-walking loop, a risk score accumulated in four places, and a four-level nested final verdict. |
| [`signal-triage.ts`](./paste-in/signal-triage.ts) | ESP32 fleet health: grades a list of RSSI readings (strong/weak/dead) in a loop + switch, tracks three counters and the worst reading, then folds BLE device presence into a fleet verdict. |

After the graph builds, the verification report (terminal at the bottom)
shows the wiring audit and per-node dry-run; the **shield** button re-runs it
any time, and the **flask** button generates a test file for the board.

Tip: pick a large coder model (e.g. `qwen2.5-coder:32b`) in the dropdown next
to Build Logic — small chat models produce much rougher graphs.

## `workflows/` — boards to load directly

Drag a file onto the canvas, or use Toolbar → **Load** → pick a file. Every
workflow was generated through the same validator the NL builder uses and
ships pre-verified (0 errors, 0 warnings).

| File | What it shows |
|---|---|
| [`wifi-ble-signal-monitor.json`](./workflows/wifi-ble-signal-monitor.json) | Scan WiFi → scan BLE → join the `esp32video` AP → RSSI to a 0–100 Gauge, quality branch (OK log vs weak-signal counter). Simulated on canvas; the same graph compiles to real `WiFi.scanNetworks()` / `WiFi.begin()` calls when sent to a board from the Device Lab. |
| [`digit-recognizer.json`](./workflows/digit-recognizer.json) | TensorFlow-style mini classifier from the AI Model nodes: 8×8 Image Input Grid → Dense(16, relu) → Dense(10, sigmoid) → Output Layer winner → text readout. Click the grid node, upload photos of different digits/letters, fire the trigger, compare winners. |
| [`image-preview-pipeline.json`](./workflows/image-preview-pipeline.json) | Image → features pipeline: 16×16 grid preview (drop in a webcam still) → Conv1D → Dense → winner index on a Gauge. A live webcam capture node is on the roadmap; today the grid node previews any uploaded frame. |

## Suggested demo script

1. Load `wifi-ble-signal-monitor.json`, hit the Manual Trigger, watch values
   travel the wires and the gauge fill.
2. Paste `access-control.ts` → Build Logic → walk the graph: the retry
   `while`, the role `switch`, the nested verdict — now visible.
3. Press the flask button: a runnable vitest file for the built board opens
   in the split pane below the code editor.
4. Load `digit-recognizer.json` and feed the grid different letter/number
   images.
