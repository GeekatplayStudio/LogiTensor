import type { CodeLine, GraphNode } from "./types";
import type { EmitCtx } from "./expressions";
import { addSetup, inputExpr, outputExpr, stateVar } from "./expressions";
import { indentLines, tag } from "./lines";
import { literal } from "./profiles";
import { requireHelper } from "./runtime-helpers";
import { flushPending, nodeComment, scoped, withoutMaterialization } from "./materialize";
import { deviceStepInto } from "./chains-device";

// Turns trigger wiring into sequential statements — the codegen mirror of
// runTriggerLogic in the store. Each Manual Trigger node becomes one function;
// following a trigger edge inlines the target node's action and then its own
// onward chain, exactly like the runtime's recursive triggerNode walk.

const INDENT = { javascript: "  ", python: "    " } as const;

/** Statements for everything downstream of one trigger output port. */
export function chainFrom(ctx: EmitCtx, node: GraphNode, outPort: string, seen: Set<string>): CodeLine[] {
  const lines: CodeLine[] = [];
  for (const edge of ctx.graph.edgesFrom(node.id, outPort)) {
    const target = edge.target ? ctx.graph.node(edge.target) : undefined;
    if (!target) continue;
    const key = `${edge.target}:${edge.targetHandle}`;
    if (seen.has(key)) {
      // Trigger loops exist on the canvas (runtime caps them); sequential
      // code can't inline them infinitely, so cut with an honest marker.
      lines.push(...tag([ctx.profile.comment(`recursion into ${target.data.label} cut (trigger loop)`)], target.id));
      continue;
    }
    seen.add(key);
    lines.push(...stepInto(ctx, target, edge.targetHandle ?? "", seen));
    seen.delete(key);
  }
  return lines;
}

/** One node's action when its trigger input fires, plus its onward chain. */
export function stepInto(ctx: EmitCtx, node: GraphNode, inPort: string, seen: Set<string>): CodeLine[] {
  // Records that this node is covered by a trigger chain, so the assembler
  // doesn't also emit it as an unreached node.
  ctx.emitted.add(node.id);
  const p = ctx.profile;
  const unit = INDENT[p.id];
  const cfg = node.data.config ?? {};
  const out: CodeLine[] = [];
  // Everything this emitter writes itself belongs to this node; statements
  // spliced in from chainFrom keep the tag of the node that produced them.
  // Each emit first flushes the named-variable assignments its own input
  // expressions just produced (they must land above the statement reading
  // them), then — once — a comment naming this node.
  let named = false;
  const emit = (...texts: string[]): void => {
    out.push(...flushPending(ctx));
    if (!named) {
      named = true;
      out.push(...tag([p.comment(nodeComment(node))], node.id));
    }
    out.push(...tag(texts, node.id));
  };
  const own = (texts: string[]) => tag(texts, node.id);
  // Nested blocks get their own naming scope so a variable assigned in one
  // branch is never referenced from outside it.
  const body = (port: string): CodeLine[] =>
    scoped(ctx, () => {
      const b = chainFrom(ctx, node, port, seen);
      return b.length ? b : own([p.emptyBody]);
    });

  switch (node.type) {
    case "delayNode":
      emit(p.sleepMs(p.num(inputExpr(ctx, node, "delayMs"))));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    case "loggerNode":
    case "textOutputNode":
      emit(p.print(inputExpr(ctx, node, "value")));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    case "randomNode": {
      const v = stateVar(ctx, node, "value");
      emit(p.assign(v, p.randomInt(inputExpr(ctx, node, "min"), inputExpr(ctx, node, "max"))));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "counterNode": {
      const v = stateVar(ctx, node, "count");
      if (inPort === "incTrigger") emit(p.assign(v, `${v} + 1`));
      else if (inPort === "decTrigger") emit(p.assign(v, `${v} - 1`));
      else emit(p.assign(v, "0"));
      break;
    }
    case "rangeNode": {
      const v = stateVar(ctx, node, "count");
      if (inPort === "resetTrigger") {
        emit(p.assign(v, literal(p, Number(cfg.initialCount ?? 0))));
      } else {
        emit(p.ifLine(outputExpr(ctx, node, "inRange")));
        out.push(...indentLines(own([p.assign(v, `${v} + 1`)]), unit));
        emit(p.elseLine);
        out.push(...indentLines(own([p.assign(v, `${v} - 1`)]), unit));
        if (p.blockClose) emit(p.blockClose);
      }
      break;
    }
    case "ifElseTrigger": {
      emit(p.ifLine(conditionExpr(ctx, node)));
      out.push(...indentLines(body("onTrue"), unit));
      emit(p.elseLine);
      out.push(...indentLines(body("onFalse"), unit));
      if (p.blockClose) emit(p.blockClose);
      break;
    }
    case "forLoopNode": {
      const idx = stateVar(ctx, node, "index");
      const iter = `i_${ctx.names.nameFor(node)}`;
      emit(p.forRange(iter, p.num(inputExpr(ctx, node, "count"))));
      out.push(...indentLines([...own([p.assign(idx, iter)]), ...body("loopBody")], unit));
      if (p.blockClose) emit(p.blockClose);
      out.push(...chainFrom(ctx, node, "done", seen));
      break;
    }
    case "whileLoopNode": {
      const iter = stateVar(ctx, node, "iteration");
      // 1000-iteration cap mirrors the runtime's safety cap. The condition is
      // kept inline: a hoisted variable would be evaluated once and the loop
      // would never end.
      emit(p.whileLine(p.and(withoutMaterialization(ctx, () => conditionExpr(ctx, node)), `${iter} < 1000`)));
      out.push(...indentLines([...body("loopBody"), ...own([p.assign(iter, `${iter} + 1`)])], unit));
      if (p.blockClose) emit(p.blockClose);
      out.push(...chainFrom(ctx, node, "done", seen));
      break;
    }
    case "leakyIntegrateFire": {
      const v = stateVar(ctx, node, "potential");
      const leak = Math.min(Math.max(Number(cfg.leak ?? 0.2), 0), 1);
      emit(p.assign(v, `${v} * ${1 - leak} + ${p.num(inputExpr(ctx, node, "input"))}`));
      emit(p.ifLine(`${v} >= ${Number(cfg.threshold ?? 1)}`));
      out.push(...indentLines([...own([p.assign(v, String(Number(cfg.resetValue ?? 0)))]), ...body("spike")], unit));
      if (p.blockClose) emit(p.blockClose);
      break;
    }
    case "toggleNode": {
      const v = stateVar(ctx, node, "state");
      emit(p.assign(v, inPort === "resetTrigger" ? p.bool(false) : p.not(v)));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "latchNode": {
      const v = stateVar(ctx, node, "state");
      // Set holds true, Reset holds false — the latch has only two commands.
      if (inPort === "resetTrigger") emit(p.assign(v, p.bool(false)));
      else emit(p.assign(v, p.bool(true)));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "listAppendNode": {
      const v = stateVar(ctx, node, "items");
      if (inPort === "resetTrigger") emit(p.assign(v, literal(p, [])));
      else emit(p.listPush(v, inputExpr(ctx, node, "value")));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "valueListNode": {
      const v = stateVar(ctx, node, "values");
      emit(p.listPush(v, inputExpr(ctx, node, "value")));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "gateNode": {
      // Open uses the text-aware truthiness the runtime applies (toBool).
      emit(p.ifLine(`${requireHelper(ctx, "lb_to_bool")}(${inputExpr(ctx, node, "open")})`));
      out.push(...indentLines(body("outTrigger"), unit));
      if (p.blockClose) emit(p.blockClose);
      break;
    }
    case "onceNode": {
      const fired = stateVar(ctx, node, "fired");
      if (inPort === "resetTrigger") {
        emit(p.assign(fired, p.bool(false))); // re-arm; Reset fires nothing on
        break;
      }
      emit(p.ifLine(p.not(fired)));
      out.push(...indentLines([...own([p.assign(fired, p.bool(true))]), ...body("outTrigger")], unit));
      if (p.blockClose) emit(p.blockClose);
      break;
    }
    case "sequenceNode": {
      const step = stateVar(ctx, node, "step");
      if (inPort === "resetTrigger") {
        emit(p.assign(step, "0"));
        break;
      }
      // One output per incoming trigger, cycling. Emitted as three separate
      // `if`s (the profile has no else-if) reading the step captured before
      // the advance below, so exactly one branch runs.
      const ports = ["out1", "out2", "out3"];
      ports.forEach((port, i) => {
        emit(p.ifLine(`${step} % ${ports.length} == ${i}`));
        out.push(...indentLines(body(port), unit));
        if (p.blockClose) emit(p.blockClose);
      });
      emit(p.assign(step, `(${step} + 1) % ${ports.length}`));
      break;
    }
    case "pythonScript": {
      const v = stateVar(ctx, node, "result");
      if (p.id === "python") {
        // Native target: the node's code runs as-is with x/y bound first.
        emit(p.assign("x", inputExpr(ctx, node, "x")));
        emit(p.assign("y", inputExpr(ctx, node, "y")));
        emit(...String(cfg.code ?? "").split("\n").filter((l) => l.trim() !== ""));
        emit(p.assign(v, "result"));
      } else {
        emit(p.comment("Python Script node — port this block by hand:"));
        emit(...String(cfg.code ?? "").split("\n").filter((l) => l.trim() !== "").map((l) => p.comment(l)));
      }
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "ollamaLLM":
    case "ollamaVLM": {
      const v = stateVar(ctx, node, "response");
      emitOllamaHelper(ctx);
      const model = literal(p, String(cfg.model ?? (node.type === "ollamaLLM" ? "llama3" : "llava")));
      emit(p.assign(v, `${p.id === "python" ? "ollama_generate" : "await ollamaGenerate"}(${model}, ${p.str(inputExpr(ctx, node, "prompt"))})`));
      if (node.type === "ollamaVLM") emit(p.comment("VLM image payload omitted — attach images via the Ollama API"));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    default: {
      // Device Lab connectivity nodes (see chains-device.ts).
      const device = deviceStepInto(ctx, node, inPort, seen);
      if (device) {
        out.push(...device);
        break;
      }
      // Already names the node, so it bypasses emit's automatic label comment.
      out.push(...tag([p.comment(`${node.data.label}: trigger port "${inPort}" has no code mapping`)], node.id));
      break;
    }
  }
  return out;
}

// If/Else and While read their condition from a wired boolean or a static
// string. Wired → real expression. Static truthy strings resolve at codegen
// time; anything else (a free-form "a > b") can't resolve identifiers outside
// the graph, so it's surfaced as a warning instead of emitting broken code.
function conditionExpr(ctx: EmitCtx, node: GraphNode): string {
  const edge = ctx.graph.edgeInto(node.id, "condition");
  if (edge?.source && edge.sourceHandle) {
    const src = ctx.graph.node(edge.source);
    if (src) return outputExpr(ctx, src, edge.sourceHandle);
  }
  const raw = String(ctx.graph.staticValue(node.id, "condition") ?? "true").trim().toLowerCase();
  if (["true", "1", "yes"].includes(raw)) return ctx.profile.bool(true);
  if (["false", "0", "no", ""].includes(raw)) return ctx.profile.bool(false);
  ctx.warnings.push(`${node.data.label}: static condition "${raw}" can't be compiled — emitted as false.`);
  return ctx.profile.bool(false);
}

// Ollama runs locally (http://localhost:11434) — the generated helper is a
// real, runnable call, not a placeholder, because the target environment is
// the same machine the canvas already requires Ollama on.
function emitOllamaHelper(ctx: EmitCtx): void {
  if (ctx.profile.id === "python") {
    addSetup(ctx, [
      "def ollama_generate(model, prompt):",
      '    req = urllib.request.Request("http://localhost:11434/api/generate",',
      '        data=json.dumps({"model": model, "prompt": prompt, "stream": False}).encode(),',
      '        headers={"Content-Type": "application/json"})',
      "    with urllib.request.urlopen(req) as res:",
      '        return json.loads(res.read()).get("response", "")',
    ]);
  } else {
    addSetup(ctx, [
      "async function ollamaGenerate(model, prompt) {",
      '  const res = await fetch("http://localhost:11434/api/generate", {',
      '    method: "POST",',
      "    body: JSON.stringify({ model, prompt, stream: false }),",
      "  });",
      '  return (await res.json()).response ?? "";',
      "}",
    ]);
  }
}
