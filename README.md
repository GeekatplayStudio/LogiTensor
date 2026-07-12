# Geekatplay Studio: LogiTensor

**LogiTensor turns "if this then that" into something you can see, drag, and watch run.** Snap together math, AI calls, loops, and conditions like circuit components — no code required. Every workflow lives in its own *dimension*, dimensions stack into a 3D-navigable *hub*, and hubs link into a *federation* of workflows sharing live data across your entire universe of logic — genuinely multi-dimensional, the way an AI model's tensors are, not just a flat board or a stack of them. Prototype an automation, teach computational thinking, or build a genuinely alive-feeling control system — LogiTensor makes the invisible plumbing of software visible, and fun to build.

Branded and developed by **Geekatplay Studio**.

---

## Key Features

### 1. Unified Next.js + LangGraph Runtime
- **Frontend Canvas**: Driven by `@xyflow/react` (XYFlow) with a sleek, dark glassmorphic UI.
- **Stateful Python Backend**: Powered by FastAPI and **LangGraph (`StateGraph`)**, compiling visual nodes and connections into stateful execution threads.
- **Asynchronous & Loop Runs**: Run workflows asynchronously, including looping runs (1-100 loops) staggered in real-time by a Delay Slider. Unreachable/orphaned nodes are skipped with a log line instead of failing the whole run.

### 2. Multi-Dimensional Workspaces (3D Layers)
- **Parallel Spaces**: Organize workflows into separate workspaces ("dimensions") that compile and execute in parallel. Add, duplicate, rename, and delete dimensions from the layer selector; step between them with prev/next arrows.
- **3D X-Ray Dimension Stack**: Every dimension renders as a translucent plane in real 3D world space — drag to orbit, scroll to zoom, click a plane to pull it forward and inspect its actual nodes and wiring; neighboring dimensions stay visible but dimmed, blurred, and desaturated ("x-rayed") behind it.
- **Dimensional Bridges**: Toggle any node's globe icon to make it "multi-dimensional":
  - It's cloned into every other dimension (same position, same config) and glows with a cyan ring, with a glowing connector threading vertically through the stack between every copy.
  - Each dimension's copy is evaluated together: matching input ports are combined across all dimensions (numbers sum, booleans OR, strings join), the node computes once, and the single result is broadcast back to every dimension's output.
  - Unchecking removes every clone and leaves the node living only in its original dimension — regardless of which copy you toggled it from.

### 3. Federation (Hubs)
- **Hubs**: A hub is a complete, named multi-dimensional workflow — a collection of dimensions. Create, duplicate, rename, and delete hubs just like dimensions.
- **Zoom out to the Federation**: Scroll far enough out of the dimension stack (or click the Federation toggle) and hubs collapse into glowing wireframe cubes floating in 3D, each showing its dimensions as glass slices inside.
- **Federation Endpoints**: Mark a node as a federation link (network icon) to connect it, by name, to matching endpoints in other hubs — a live channel connection rendered as a pulsing curve between hub cubes.

### 4. Smart Canvas Sockets & Collapsible Palette
- **Color-Coded Node Palette**: Sidebar category groups and node cards share the exact color family as the node headers they add to the canvas. Every category header is now **collapsible** (with a live count badge) for a cleaner sidebar — search automatically expands matching groups.
- **Double-Socket Architecture**:
  - *Trigger Sockets (Chevron ▷)*: Pulsating amber flow path.
  - *Data Sockets (Circle ○)*: Type-specific colored connections carrying numbers, text, or booleans.
- **Hover Help Tooltips**: Hover over any connector socket to read its name, data type expectations, and routing behavior.
- **Right-Click Disconnection**: Right-click on any socket instantly disconnects all linked wires.
- **Concentric Radial Menu**: Right-click anywhere on the canvas to open a radial category selector to drop nodes exactly where clicked.

### 5. Advanced Node Library
- **Inputs**: Manual Trigger, Constants (Number, Boolean, String).
- **Logic Gates**: AND, OR, NOT, XOR, NOR, NAND.
- **Control Flow**: Delay, Increment/Decrement Counter, If-Else (branches trigger flow), Conditional Value (switches data value), **For Loop** (fires its Body trigger a fixed number of times with a live Index), **While Loop** (fires Body while a Condition stays true, re-evaluated every pass, with a 1000-iteration safety cap).
- **Math & Compare**: Compare Values (`==`, `!=`, `<`, `<=`, `>`, `>=`), Safe Expression, **Formula** (free-form expressions over inputs that grow new lettered ports — a, b, c… — automatically as you wire them up; numbers compute, strings concatenate), **Math Function** (abs, round, floor, ceil, sqrt, pow, min, max, mod), Random Number.
- **Data & Text**: **Filter** (passes a value through only if it includes/excludes a search term, case-sensitive optional), Text Transform (uppercase/lowercase/trim/length/reverse), Text Replace.
- **Outputs**: Console Logger, Text Output (resizable display).
- **AI & Scripts**:
  - *Python Script*: Executes sandboxed scripts. Injects inputs `x` and `y` and retrieves `result`.
  - *Ollama LLM*: Queries local models (e.g. `llama3`) with prompt templates.
  - *Ollama VLM*: Queries local vision models (e.g. `llava`) with prompts and image references.

### 6. Multi-Layer Sandbox Security
- **Python AST Scanner**: Custom scripts are statically scanned using Python's Abstract Syntax Tree parser. Blocks dangerous modules (`os`, `sys`, `subprocess`, `requests`), builtins (`eval`, `exec`, `open`), and dunder properties.
- **JS/Python Expression Sandbox**: Math and Formula nodes run a token-based Shunting-yard calculator, isolating execution threads from window/interpreter global spaces, mirrored identically on both the frontend and the backend.

### 7. In-App Help & About
- A **Help** panel (top toolbar) walks through building flows, the node library, dimensions, the 3D stack, and federation.
- An **About** panel carries the LogiTensor pitch and Geekatplay Studio background, plus a link back to this repository.

---

## Installation & Setup

### Prerequisites
1. **Node.js** (v18+) & npm.
2. **Python** (v3.10+) with `pip`.
3. **Ollama** installed and running locally.

### Setup Stack
Run our automatic bootstrapper to build the Python virtual environment and configure models:
```bash
npm run setup
```

### Launch Development Stack
Launch Next.js (port 3000) and the FastAPI backend (port 8000) in parallel:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. The page fills the browser window responsively (using dynamic viewport height) and reflows live as you resize it.

### Verification tests
To verify front-end calculations and backend security scanners:
```bash
npm run test
```
Also available: `npx tsc --noEmit` (TypeScript check) and `npm run lint` (ESLint).

---
*Branded and developed by Geekatplay Studio.*
