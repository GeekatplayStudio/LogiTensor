# Geekatplay Studio: LogiBoard

LogiBoard is a multi-dimensional, node-driven visual logic editor and execution environment similar to ComfyUI, branded and developed by **Geekatplay Studio**. It features a hybrid local/server execution model combining standard logical components with Python script execution, local Ollama LLMs/VLMs, and 3D multi-layered workspaces.

---

## Key Features

### 1. Unified Next.js + LangGraph Runtime
- **Frontend Canvas**: Driven by `@xyflow/react` (XYFlow) with a sleek, dark glassmorphic UI.
- **Stateful Python Backend**: Powered by FastAPI and **LangGraph (`StateGraph`)**, compiling visual nodes and connections into stateful execution threads.
- **Asynchronous & Loop Runs**: Run workflows asynchronously, including looping runs (1-100 loops) staggered in real-time by a Delay Slider.

### 2. Multi-Dimensional Workspaces (3D Layers)
- **Parallel Spaces**: Organize workflows into separate workspaces ("layers") that compile and execute in parallel.
- **Dimension Layers Deck**: A large, borderless, glassy 3D carousel overlay — the active page renders full-size and sharp, while neighboring dimensions are visibly shifted, rotated, and "x-rayed" (dimmed, blurred, desaturated) behind it.
  - Navigate using keyboard **Arrow Keys**, click a page to focus, and press **Enter** to load.
  - Prev/next chevron arrows next to the layer counter in the floating top-right control let you step through dimensions without opening the full deck.
  - **Duplicate** any dimension into a new layer (clones its nodes/edges with remapped ids so backend execution never collides) or **collapse** (delete) one, right from the deck.
- **Dimensional Bridges**: Toggle any node's globe icon to make it "multi-dimensional":
  - It's cloned into every other layer (same position, same config) and glows with a cyan ring.
  - Each dimension's copy is evaluated together: matching input ports are combined across all dimensions (numbers sum, booleans OR, strings join), the node computes once, and the single result is broadcast back to every dimension's output.
  - Unchecking removes every clone and leaves the node living only in its original dimension — regardless of which copy you toggled it from.

### 3. Smart Canvas Sockets & Controls
- **Color-Coded Node Palette**: The left sidebar's category groups and node cards share the exact color family (blue/teal/purple/amber/rose/violet) as the node headers they add to the canvas, so a node's category is recognizable before you ever drop it.
- **Double-Socket Architecture**:
  - *Trigger Sockets (Chevron ▷)*: Pulsating amber flow path.
  - *Data Sockets (Circle ○)*: Type-specific colored connections carrying numbers, text, or booleans.
- **Hover Help Tooltips**: Hover over any connector socket to read its name, data type expectations, and routing behavior.
- **Right-Click Disconnection**: Right-click on any socket instantly disconnects all linked wires, stopping event propagation.
- **Concentric Radial Menu**: Right-click anywhere on the canvas to open a radial category selector to drop nodes exactly where clicked.

### 4. Advanced Node Library
- **Inputs**: Manual Trigger, Constants (Number, Boolean, String).
- **Logic Gates**: AND, OR, NOT, XOR, NOR, NAND.
- **Control Flow**: Delay, Increment/Decrement Counter, If-Else (branches trigger flow), Conditional Value (switches data value).
- **Math & Compare**: Compare Values (`==`, `!=`, `<`, `<=`, `>`, `>=`), Safe Expression (algebraic formulas).
- **Outputs**: Console Logger, **Text Output** (resizable display).
- **AI & Scripts**:
  - *Python Script*: Executes sandboxed scripts. Injects inputs `x` and `y` and retrieves `result`.
  - *Ollama LLM*: Queries local models (e.g. `llama3`) with prompt templates.
  - *Ollama VLM*: Queries local vision models (e.g. `llava`) with prompts and image references.

### 5. Multi-Layer Sandbox Security
- **Python AST Scanner**: Custom scripts are statically scanned using Python's Abstract Syntax Tree parser. Blocks dangerous modules (`os`, `sys`, `subprocess`, `requests`), builtins (`eval`, `exec`, `open`), and dunder properties.
- **JS Expression Sandbox**: Math nodes run a token-based Shunting-yard calculator, isolating execution threads from window global spaces.

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
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Verification tests
To verify front-end calculations and backend security scanners:
```bash
npm run test
```

---
*Branded and developed by Geekatplay Studio.*
