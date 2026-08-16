import type { GraphNode } from "./types";
import type { EmitCtx } from "./expressions";
import { addSetup, inputExpr, outputExpr, stateVar } from "./expressions";
import { indent } from "./graph";
import { literal } from "./profiles";

// Turns trigger wiring into sequential statements — the codegen mirror of
// runTriggerLogic in the store. Each Manual Trigger node becomes one function;
// following a trigger edge inlines the target node's action and then its own
// onward chain, exactly like the runtime's recursive triggerNode walk.

const INDENT = { javascript: "  ", python: "    " } as const;

/** Statements for everything downstream of one trigger output port. */
export function chainFrom(ctx: EmitCtx, node: GraphNode, outPort: string, seen: Set<string>): string[] {
  const lines: string[] = [];
  for (const edge of ctx.graph.edgesFrom(node.id, outPort)) {
    const target = edge.target ? ctx.graph.node(edge.target) : undefined;
    if (!target) continue;
    const key = `${edge.target}:${edge.targetHandle}`;
    if (seen.has(key)) {
      // Trigger loops exist on the canvas (runtime caps them); sequential
      // code can't inline them infinitely, so cut with an honest marker.
      lines.push(ctx.profile.comment(`recursion into ${target.data.label} cut (trigger loop)`));
      continue;
    }
    seen.add(key);
    lines.push(...stepInto(ctx, target, edge.targetHandle ?? "", seen));
    seen.delete(key);
  }
  return lines;
}

/** One node's action when its trigger input fires, plus its onward chain. */
export function stepInto(ctx: EmitCtx, node: GraphNode, inPort: string, seen: Set<string>): string[] {
  // Records that this node is covered by a trigger chain, so the assembler
  // doesn't also emit it as an unreached node.
  ctx.emitted.add(node.id);
  const p = ctx.profile;
  const unit = INDENT[p.id];
  const cfg = node.data.config ?? {};
  const out: string[] = [];
  const body = (port: string) => {
    const b = chainFrom(ctx, node, port, seen);
    return b.length ? b : [p.emptyBody];
  };

  switch (node.type) {
    case "delayNode":
      out.push(p.sleepMs(p.num(inputExpr(ctx, node, "delayMs"))));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    case "loggerNode":
    case "textOutputNode":
      out.push(p.print(inputExpr(ctx, node, "value")));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    case "randomNode": {
      const v = stateVar(ctx, node, "value");
      out.push(p.assign(v, p.randomInt(inputExpr(ctx, node, "min"), inputExpr(ctx, node, "max"))));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "counterNode": {
      const v = stateVar(ctx, node, "count");
      if (inPort === "incTrigger") out.push(p.assign(v, `${v} + 1`));
      else if (inPort === "decTrigger") out.push(p.assign(v, `${v} - 1`));
      else out.push(p.assign(v, "0"));
      break;
    }
    case "rangeNode": {
      const v = stateVar(ctx, node, "count");
      if (inPort === "resetTrigger") {
        out.push(p.assign(v, literal(p, Number(cfg.initialCount ?? 0))));
      } else {
        out.push(p.ifLine(outputExpr(ctx, node, "inRange")));
        out.push(...indent([p.assign(v, `${v} + 1`)], unit));
        out.push(p.elseLine);
        out.push(...indent([p.assign(v, `${v} - 1`)], unit));
        if (p.blockClose) out.push(p.blockClose);
      }
      break;
    }
    case "ifElseTrigger": {
      out.push(p.ifLine(conditionExpr(ctx, node)));
      out.push(...indent(body("onTrue"), unit));
      out.push(p.elseLine);
      out.push(...indent(body("onFalse"), unit));
      if (p.blockClose) out.push(p.blockClose);
      break;
    }
    case "forLoopNode": {
      const idx = stateVar(ctx, node, "index");
      const iter = `i_${ctx.names.nameFor(node)}`;
      out.push(p.forRange(iter, p.num(inputExpr(ctx, node, "count"))));
      out.push(...indent([p.assign(idx, iter), ...body("loopBody")], unit));
      if (p.blockClose) out.push(p.blockClose);
      out.push(...chainFrom(ctx, node, "done", seen));
      break;
    }
    case "whileLoopNode": {
      const iter = stateVar(ctx, node, "iteration");
      // 1000-iteration cap mirrors the runtime's safety cap.
      out.push(p.whileLine(p.and(conditionExpr(ctx, node), `${iter} < 1000`)));
      out.push(...indent([...body("loopBody"), p.assign(iter, `${iter} + 1`)], unit));
      if (p.blockClose) out.push(p.blockClose);
      out.push(...chainFrom(ctx, node, "done", seen));
      break;
    }
    case "leakyIntegrateFire": {
      const v = stateVar(ctx, node, "potential");
      const leak = Math.min(Math.max(Number(cfg.leak ?? 0.2), 0), 1);
      out.push(p.assign(v, `${v} * ${1 - leak} + ${p.num(inputExpr(ctx, node, "input"))}`));
      out.push(p.ifLine(`${v} >= ${Number(cfg.threshold ?? 1)}`));
      out.push(...indent([p.assign(v, String(Number(cfg.resetValue ?? 0))), ...body("spike")], unit));
      if (p.blockClose) out.push(p.blockClose);
      break;
    }
    case "pythonScript": {
      const v = stateVar(ctx, node, "result");
      if (p.id === "python") {
        // Native target: the node's code runs as-is with x/y bound first.
        out.push(p.assign("x", inputExpr(ctx, node, "x")));
        out.push(p.assign("y", inputExpr(ctx, node, "y")));
        out.push(...String(cfg.code ?? "").split("\n").filter((l) => l.trim() !== ""));
        out.push(p.assign(v, "result"));
      } else {
        out.push(p.comment("Python Script node — port this block by hand:"));
        out.push(...String(cfg.code ?? "").split("\n").filter((l) => l.trim() !== "").map((l) => p.comment(l)));
      }
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    case "ollamaLLM":
    case "ollamaVLM": {
      const v = stateVar(ctx, node, "response");
      emitOllamaHelper(ctx);
      const model = literal(p, String(cfg.model ?? (node.type === "ollamaLLM" ? "llama3" : "llava")));
      out.push(p.assign(v, `${p.id === "python" ? "ollama_generate" : "await ollamaGenerate"}(${model}, ${p.str(inputExpr(ctx, node, "prompt"))})`));
      if (node.type === "ollamaVLM") out.push(p.comment("VLM image payload omitted — attach images via the Ollama API"));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      break;
    }
    default:
      out.push(p.comment(`${node.data.label}: trigger port "${inPort}" has no code mapping`));
      break;
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
