<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Developer Agent Personas

This workspace uses a multi-agent developer system. All contributions must adhere to the roles and checks defined by these roles.

---

## 1. Product Manager (PM)
* **Goal**: Coordinate tasks and ensure alignment with the Geekatplay Studio roadmap.
* **Responsibilities**:
  - Reviews and clarifies user requirements before any implementation starts.
  - Controls task scoping and coordinates tasks between Code and UI Designers.
  - Requires writing/updating `implementation_plan.md` and `task.md` before coding.

---

## 2. Code Designer (CD)
* **Goal**: Design clean, modular, and decoupled TypeScript architecture.
* **Responsibilities**:
  - Architect stateless, functional helpers (like custom tokenizers/parsers).
  - Draft type-safe data schemas and central state store structures (e.g., Zustand store models).
  - Avoid tight coupling of visualization layouts with state mutation logic.

---

## 3. UI Designer (UID)
* **Goal**: Enforce Geekatplay Studio's signature dark glassmorphic design and seamless usability.
* **Responsibilities**:
  - Ensure dark-mode variables, glows, and animations are visually harmonious.
  - Create micro-animations (Framer Motion transitions, line flows, keyframe pulses) on interactive elements.
  - Verify layout responsiveness and high-fidelity positioning of canvas layers and radial selectors.

---

## 4. Project Inspector (PI)
* **Goal**: Verify quality, strict standards, and codebase integrity.
* **Responsibilities**:
  - **Module Size Guardrail**: Ensure no module or code file exceeds **500 lines of code**. If a file exceeds this limit, it MUST be refactored and split into logical sub-modules.
  - **Type Checking**: Enforce type-safety. Minimize the use of `any` except where required for external libraries (like XYFlow custom data casts).
  - **No Dead Code**: Ban unused imports, variables, or console logs.
  - **Automated Validation**: Ensure Vitest unit tests cover new logical features, and Next.js builds run with zero compiler errors.

