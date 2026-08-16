# LogiTensor Roadmap — NL Builder, Code Panel, Visual Testing, UI Shell

Status: **IMPLEMENTED (2026-08-16)** — all phases below are built and verified
(lint + typecheck + 49 Vitest tests + 21 pytest parity tests + production
build all green). Deviations from plan: react-resizable-panels v4 ships a
`Group/Panel/Separator` API (not `PanelGroup`), and layout persistence uses
the library defaults rather than `autoSaveId`; the code panel highlights with
shiki as planned. This document is retained as the design record. Original
audit follows.

Status: audit complete (2026-08-16). This roadmap is grounded in a full audit of
this repo and of the reference implementation in `d:/ash-mesh/ai-mesh`
(Device Logic Studio). Facts below are verified, not assumed.

Standing rule for every implementation phase: each added line of code must be
justifiable — no speculative abstractions, no dead options, no code without a
consumer. PRs should note the "why" for anything non-obvious, per the Project
Inspector role in AGENTS.md.

---

## Phase 0 — Foundation verification & hardening (do first)

### 0.1 Tests & lint — current state (verified)

| Area | State |
|---|---|
| ESLint | ✅ `npm run lint`, clean |
| Vitest | ✅ 4 suites / 40 tests: `execution-helpers`, `safe-evaluator`, `trigger-bridge`, `hybrid-trigger-smoke` (store-level) |
| TypeScript build | ✅ `next build` type-checks; ❌ no standalone `typecheck` script |
| Python backend | ❌ **zero tests** — `execution_engine.py` (939 lines) fully untested |
| Store coverage | ⚠️ only the hybrid-trigger path; `runAll`, layers, hubs, serialization, copy/paste untested |
| CI | ❌ none (no `.github/`) |

Actions:
- Add `"typecheck": "tsc --noEmit"` script (fast feedback without a full build).
- Add `backend/tests/` with pytest: `execute_logic_computation` parity tests
  mirroring `execution-helpers.test.ts` case-for-case (the two engines are
  hand-mirrored — parity tests are the only guard against drift), plus
  `topo`/trigger-chain tests for `compile_and_run_graph`.
- Add GitHub Actions CI: lint + typecheck + vitest + pytest + build.
- Investigate the known transient vitest first-run failure
  (`Cannot read properties of undefined (reading 'config')` on first run,
  clean on rerun — seen repeatedly on this machine; likely a Vite cache race).

### 0.2 three.js — current state (verified)

**Not installed.** No `three`, `@react-three/fiber`, or `@react-three/drei`
anywhere. Existing "3D" is a hand-rolled 46-line projection module
(`src/lib/stack-3d-math.ts`) rendered two ways: HTML5 canvas-2D
(`dense-layer-3d-view.tsx`, 65k-connection sampling) and SVG
(`layers-stack-view.tsx`, `federation-scene.tsx`).

Action: add `three` + `@react-three/fiber` + `@react-three/drei` as
dependencies and introduce them behind a single new component boundary
(`src/components/three/`), with one small proof-of-life scene (e.g. re-render
the layer stack). Do **not** rip out `stack-3d-math.ts` views up front — they
work; port them one at a time only when a real 3D feature needs them, so the
dependency is proven before the migration cost is paid.

### 0.3 Modularization — 500-line guardrail audit (verified)

Over the limit today:

| File | Lines | Split plan |
|---|---|---|
| `src/components/node-editor/use-node-editor-store.ts` | **1601** | Zustand slices: `store/graph-slice.ts` (nodes/edges/CRUD/clipboard), `store/layers-slice.ts`, `store/hubs-slice.ts`, `store/execution-slice.ts` (`evaluateNode`/`triggerNode`/`runAll`/`runTriggerLogic`), `store/persistence-slice.ts`; pure helpers (`resolveNodeInputs`, `applyComputedOutputs`, edge styles, `formatEdgeValue`) move to `src/lib/graph-helpers.ts` + `src/lib/edge-styles.ts` |
| `backend/execution_engine.py` | **939** | package `backend/engine/`: `state.py`, `helpers.py`, `passive.py` (`execute_logic_computation`), `active.py` (`run_node_task`), `compile.py` (`compile_and_run_graph` + chain), `nn_math.py` (mulberry32/conv1d mirrors) |
| `src/types/nodes.ts` | **554** | `src/types/node-definitions/{inputs,logic,control-flow,math,data-text,outputs,ai-scripts,neural,ai-model}.ts` merged in `index.ts`; shared types stay in `nodes.ts` |
| `src/components/node-editor/ai-model-node-parts.tsx` | **514** | one file per node body (`image-grid-body.tsx`, `dense-layer-body.tsx`, …) |

Danger zone (split before adding to them): `execution-helpers.ts` (494),
`custom-nodes.tsx` (483), `node-config-panel.tsx` (478).

Do the store split **before** Phases 2–4 — every later phase touches the store,
and splitting first prevents the 1601-line file from growing further.

---

## Phase 1 — UI shell: resizable/collapsible layout (prerequisite for 2 & 3)

Current layout (verified, `src/app/page.tsx`): fixed `h-14` header (already
full), fixed-width sidebar, canvas, **no right panel**, no resizable-panel
machinery, floating layer controls pinned `top-4 right-4` (collides with a
future right panel).

- Add `react-resizable-panels` (the standard for this; small, no styling
  opinions). Compose: `[Sidebar | Canvas | CodePanel]` as horizontal panels,
  each collapsible with a drag handle; persist sizes to `localStorage`
  (ash-mesh precedent: `SIDE_WIDTH_KEY` pattern).
- **NL input bar above the workspace**: a second slim row under the header
  (input + submit + status), not crammed into the full `h-14` toolbar row.
- Minimal/iconic style: existing lucide icons + the existing
  `src/components/ui/tooltip.tsx` for hover labels; collapse toolbar text to
  icons-with-tooltips to reclaim space.
- Relocate the floating layer controls (into the toolbar or bottom-left) so
  the right panel owns the right edge.

---

## Phase 2 — Code panel with multi-language output

Reference verified in `d:/ash-mesh/ai-mesh` (your own project — pattern free to
reuse): `public/js/device-logic/codegen.js` + `graph.js` + `node-types.js`.

**How ash-mesh actually does it** (important correction): there is **no LLM
and no 8-language matrix**. It is local per-node template emission —
each node type has an `emit(ctx)` returning `{setup, loop, outputs}` with
expression strings threaded downstream; `generateCode(graph, target)` is a
pure function (topo-sort → emit → assemble). Only **Python and JavaScript are
native emitters**; C and C++ are derived from the JS output via a
deterministic regex line-adapter (`jsLineToC`) with honest
`// TODO(port by hand)` bailouts. The panel is a resizable `<textarea>` with a
plain `<select>` — no syntax highlighting.

Plan for LogiTensor (`src/lib/codegen/`):
1. **IR is free**: our store's `nodes`/`edges` already match ash-mesh's
   `NodeGraph` shape (typed nodes with config/widgets + port-to-port links).
   `generate(nodes, edges, target)` will be a pure function, unit-testable
   with golden-file tests per language.
2. **Native emitters: TypeScript/JavaScript and Python** (2 templates per node
   type, ~46 node types). These two cover our own runtimes, so generated code
   is actually runnable/verifiable against `computeNodeOutputs` /
   `execute_logic_computation` — that's the correctness anchor.
3. **Derived targets via line-adapters** (ash-mesh `jsLineToC` pattern):
   C, C++, Go, Rust, PHP from the JS emission. Each adapter is a small
   deterministic rule table + explicit `TODO(port by hand)` bailouts for
   constructs it can't map. This is the honest, credit-free, offline approach;
   an "AI polish" button per-language can come later as an optional Ollama
   pass, never as the primary path.
4. **Panel UI**: right resizable panel from Phase 1; language dropdown
   (existing `select.tsx`); syntax highlighting via **shiki** (build-time
   grammars, zero runtime deps, dark-theme native — an upgrade over
   ash-mesh's bare textarea); copy button; regenerate on store subscription
   (debounced).
5. Optional later: ash-mesh's Manual-mode round-trip (`custom-blocks.js`
   marker pattern) for hand-edited code blocks — explicitly out of scope for
   v1.

## Phase 3 — Natural-language → logic flow

Verified: the only LLM surface today is local Ollama inside the Python engine;
`backend/main.py` has exactly two routes. Everything here is new.

1. **Provider abstraction** (`backend/nl_builder.py` + `POST /nl-build`):
   start with Ollama (already installed/required by setup.js — zero new keys,
   zero credits), but behind a 2-function interface so a cloud provider
   (Anthropic API) can be slotted in via env var later.
2. **Contract, not freeform**: prompt = the user's sentence + a compact JSON
   schema derived from `NODE_DEFINITIONS` (types, ports, dataTypes, configs).
   The model must return the **existing save-file JSON format**
   (`saveToFile`/`loadFromFile` round-trip, `src/lib/serialization.ts`) —
   reusing a format that already has a loader means the LLM output path gets
   validation and undo (save current graph first) for free.
3. **Validate before apply**: schema-check every node type / port / edge
   against `NODE_DEFINITIONS`; reject or strip unknown nodes; never `eval`
   anything from the model.
4. **Auto-layout**: simple layered left-to-right placement by topological
   depth (no dagre dependency needed for v1 — our graphs are small).
5. **UI**: the Phase-1 input bar; modes "replace board" / "add to board";
   streaming status; toast + highlight of newly added nodes.

## Phase 4 — Visual run-through tests

Verified gaps: value labels on edges exist **only** in the `runAll` backend
path (applied all-at-once after the round-trip); the interactive
`evaluateNode`/`triggerNode` paths show colors/animation but no values; stale
labels are not cleared by `resetExecutionStates` (bug); three inconsistent
edge-decoration code paths.

1. **Extract one edge-decoration module** (`src/lib/edge-decorations.ts`):
   single source of truth for lit/idle/label styling, used by all three paths.
   Fixes the inconsistency and the stale-label bug in one move.
2. **Live values everywhere**: `evaluateNode` and `triggerNode` set
   `label: formatEdgeValue(...)` on data edges as values flow (they already
   compute the values — displaying them is nearly free).
3. **Trigger-pulse indication**: brief label ("⚡") or stroke pulse on trigger
   edges when they fire interactively.
4. **Test scenarios**: a small "Expected Output" assertion node (compare a
   wired value to an expected value; node turns green/red) + a "Run Tests"
   toolbar action that fires all Manual Triggers and reports pass/fail counts.
   This gives visual, in-canvas verification with values on connectors —
   built almost entirely from existing machinery (compare logic exists in
   `compareNode`; badges exist as executionState rings).
5. **Step mode**: `stepDelayMs` already exists; add a pause/step-forward
   control that gates `triggerNode`'s existing per-hop delay.

## Phase 5 — Radial node library polish

Verified: `radial-menu.tsx` is **already** a two-level circular library on
right-click (center hub → 9 category ring → node ring per category), matching
the request's shape. Remaining gaps to close:
- Category list + colors are hardcoded, duplicating `nodes.ts` — derive both
  from `NODE_DEFINITIONS` + `node-styles.ts` (single source of truth).
- No viewport clamping — menu renders off-screen near canvas edges.
- Outer ring crowds/overlaps at ~8+ nodes — adaptive radius or arc paging.
- No keyboard navigation or search; Escape-only.

---

## Code improvements backlog (found during audits)

1. `resetExecutionStates` resets `animated`/`style` but **not** `label` —
   stale run values persist on edges. (Fixed by Phase 4.1.)
2. Three duplicated edge-styling implementations. (Phase 4.1.)
3. `radial-menu.tsx` duplicates the category union and hardcodes per-category
   hex colors already defined in `node-styles.ts`. (Phase 5.)
4. No `typecheck` script; `prestart` runs full lint+build serially. (Phase 0.)
5. TS↔Python engine mirroring has no parity test harness. (Phase 0.)
6. Four files over the repo's own 500-line guardrail. (Phase 0.3.)
7. Floating layer controls occupy the future right-panel corner. (Phase 1.)

## Suggested sequence & sizing

| Order | Phase | Size |
|---|---|---|
| 1 | 0.1 tests/CI + 0.3 store & engine split | M — mechanical but wide |
| 2 | 1 UI shell (panels + NL bar slot) | M |
| 3 | 2 code panel (TS/JS + Python emitters first, adapters after) | L — largest single item (~46 node types × 2 templates) |
| 4 | 3 NL builder | M (Ollama path) |
| 5 | 4 visual run-through | M |
| 6 | 5 radial polish + 0.2 three.js proof-of-life | S |

Phases 2 and 3 are independent after Phase 1 and can proceed in parallel.
