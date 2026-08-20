# Build Logic — from pasted code to a verified node graph

Paste any source code into the editor, click **Build Logic**, and LogiBoard
rebuilds it as a detailed, verified node flow on the canvas — using the
existing node library, with every node's logic dry-run before it lands, and
optionally a runnable test file for the whole board.

## How to use it, step by step

1. **Open edit mode.** In the code panel (right side), click the **pencil**.
   The panel detaches from the canvas and becomes a free-form editor.
2. **Paste your code.** Any language — the analyzer reads the logic, not the
   syntax dialect.
3. **Pick options** (toolbar, left of the button):
   - **Model** — which local Ollama model analyzes the code. Larger coder
     models (`qwen2.5-coder:32b` etc.) map logic far more faithfully.
   - **Replace / Add** — start a fresh board, or add the flow alongside the
     existing graph.
4. **Click Build Logic.** Progress is narrated in the bottom terminal:
   request sent → model reply → validation → verification → apply.
5. **Read the verdict.** The toast summarizes nodes/edges built and the
   verification result; every rejected item, wiring issue, and per-node
   finding is listed in the terminal.
6. **Verify again any time** with the **shield** button (view mode), e.g.
   after hand-editing the board.
7. **Generate tests** with the **flask** button. The test file opens in a
   split pane below the code editor — copy it out, or hit regenerate after
   changing the board.

## The pipeline (`src/lib/code-import.ts`)

```
pasted code
   │  POST /nl-build  mode:"code"  (+ node-catalog schema, chosen model)
   ▼
local Ollama proposal  ──  backend/nl_builder.py CODE_SYSTEM_PROMPT
   │
   ▼
materializeNlGraph()   ──  src/lib/nl-apply.ts
   │   every node type, port, config key and edge checked against
   │   NODE_DEFINITIONS; invalid items dropped WITH a reported reason
   ▼
verifyGraph()          ──  src/lib/graph-verify.ts   (see below)
   │
   ▼
canvas (replace or add) + one evaluation pass so wires show live values
```

The model only ever *proposes* — it cannot invent ports, inject code, or
reach the canvas unvalidated. That is the same trust boundary the
natural-language builder uses.

### What the analysis prompt demands

`CODE_SYSTEM_PROMPT` (backend/nl_builder.py) instructs the model to produce a
**detailed** flow, not a summary:

- one node per meaningful step — each initialization, computation, condition,
  loop, and output;
- constructs map to their natural families: literals → constants, arithmetic
  → math/formula nodes holding the exact expression, comparisons → compare
  nodes, branches → If/Else, loops → loop nodes with the real bounds,
  prints → logger/output nodes;
- **every literal value from the code is preserved exactly** in config or
  input ports — never invented, never dropped;
- if no catalog node can express a step, the closest scripting node carries
  the original code text so nothing is lost;
- wiring mirrors the code's data flow, starting from one Manual Trigger.

## Verification (`src/lib/graph-verify.ts`)

Three passes, run before a built graph is applied and on demand via the
shield button:

1. **Wiring audit** (`auditConnectivity`) — unconnected nodes, trigger-driven
   nodes nothing fires, unfed inputs, missing Manual Trigger.
2. **Per-node dry-run** — every *passive* node is executed for real through
   `computeNodeOutputs` in data-dependency order, fed actual upstream values.
   Compute throws are errors; data-wire cycles and nodes that resolve to no
   output values are warnings. Trigger-driven nodes can't run without a
   trigger, so they are checked statically only.
3. **Codegen check** — the graph is regenerated as TypeScript and Python and
   any emitter warnings are surfaced, so "the generated code is clean" is
   checked, not assumed.

Findings are per-node (`[error] Formula: compute threw: …`) and the summary
counts errors/warnings. Everything goes to the terminal log.

## Generated tests (`src/lib/codegen/testgen.ts`)

The flask button captures the board's live resolved values into one test per
passive node:

- code panel language **Python** → a **pytest** file importing
  `execute_logic_computation` from `backend/engine` (run:
  `pytest <file>` from the repo root);
- any other language → a **vitest** file importing `computeNodeOutputs` from
  `@/lib/execution-helpers` (run: `npx vitest run <file>`).

Both engines are parity-locked, so the vectors are identical either way.
Nodes that can't be turned into a deterministic test — trigger-driven ones,
or nodes with random/time-dependent outputs — are listed in a
"Not covered" footer rather than silently skipped.

The pane below the code editor (`test-panel.tsx`) shows the file with syntax
highlighting and per-line node mapping, plus copy, regenerate (re-captures
from the current board), and close.

## Files

| File | Role |
|---|---|
| `src/lib/code-import.ts` | Build Logic pipeline (fetch → validate → verify → apply) |
| `src/lib/graph-verify.ts` | wiring audit + per-node dry-run + codegen check |
| `src/lib/codegen/testgen.ts` | vitest/pytest generation from live board values |
| `src/components/node-editor/code-panel.tsx` | toolbar: model, mode, Build Logic, shield, flask |
| `src/components/node-editor/test-panel.tsx` | split test pane below the editor |
| `backend/nl_builder.py` | `CODE_SYSTEM_PROMPT` — the detailed-analysis rules |
| `src/lib/__tests__/graph-verify.test.ts`, `testgen.test.ts` | unit tests |
