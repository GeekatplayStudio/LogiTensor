import { safeEvaluate } from "./safe-evaluator";

// Numeric-looking strings become numbers so the Formula node does math on
// them; everything else stays as-is so `+` concatenates and comparisons work
// lexically — this is the number-vs-string awareness of the Formula node.
function coerceOperand(v: any): any {
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "" && !isNaN(Number(t))) return Number(t);
  }
  return v;
}

/**
 * Resolves any condition-ish value (booleans, "true"/"1"/"yes" strings, or a
 * safe expression string) to a boolean. Shared by If/Else and While Loop.
 */
export function resolveConditionFlag(condVal: any): boolean {
  if (typeof condVal !== "string") return Boolean(condVal);
  const trimmed = condVal.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "1" || trimmed === "yes") return true;
  if (trimmed === "false" || trimmed === "0" || trimmed === "no" || trimmed === "") return false;
  try {
    return Boolean(safeEvaluate(trimmed, {}));
  } catch {
    return false;
  }
}

/**
 * Computes data output port values based on the node's type, inputs, and config parameters.
 */
export function computeNodeOutputs(
  type: string,
  inputs: Record<string, any>,
  config: Record<string, any> = {}
): Record<string, any> {
  const outputs: Record<string, any> = {};

  switch (type) {
    case "constNum":
      outputs.value = Number(config.value ?? 0);
      break;
    case "constBool":
      outputs.value = Boolean(config.value ?? true);
      break;
    case "constString":
      outputs.value = String(config.value ?? "");
      break;
    case "andGate":
      outputs.out = Boolean(inputs.a && inputs.b);
      break;
    case "orGate":
      outputs.out = Boolean(inputs.a || inputs.b);
      break;
    case "notGate":
      outputs.out = !inputs.a;
      break;
    case "xorGate":
      outputs.out = inputs.a !== inputs.b;
      break;
    case "norGate":
      outputs.out = !(inputs.a || inputs.b);
      break;
    case "nandGate":
      outputs.out = !(inputs.a && inputs.b);
      break;
    case "condValue":
      outputs.out = inputs.condition ? inputs.trueVal : inputs.falseVal;
      break;
    case "compareNode": {
      const op = config.op ?? "==";
      const a = inputs.a;
      const b = inputs.b;
      let res = false;
      switch (op) {
        case "==":
          res = a == b;
          break;
        case "!=":
          res = a != b;
          break;
        case ">":
          res = Number(a) > Number(b);
          break;
        case ">=":
          res = Number(a) >= Number(b);
          break;
        case "<":
          res = Number(a) < Number(b);
          break;
        case "<=":
          res = Number(a) <= Number(b);
          break;
      }
      outputs.out = res;
      break;
    }
    case "expressionNode": {
      const expr = config.expression ?? "x * 2 + y";
      outputs.out = safeEvaluate(expr, inputs);
      break;
    }
    case "mathNode": {
      const expr = config.expression ?? "a + b";
      const ctx: Record<string, any> = {};
      for (const key of Object.keys(inputs)) ctx[key] = coerceOperand(inputs[key]);
      outputs.out = safeEvaluate(expr, ctx);
      break;
    }
    case "mathFunctionNode": {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 0);
      const op = config.op ?? "abs";
      const fns: Record<string, () => number> = {
        abs: () => Math.abs(a),
        round: () => Math.round(a),
        floor: () => Math.floor(a),
        ceil: () => Math.ceil(a),
        sqrt: () => Math.sqrt(a),
        pow: () => Math.pow(a, b),
        min: () => Math.min(a, b),
        max: () => Math.max(a, b),
        mod: () => (b === 0 ? 0 : ((a % b) + b) % b),
      };
      outputs.out = (fns[op] ?? fns.abs)();
      break;
    }
    case "filterNode": {
      const val = inputs.value;
      const search = String(inputs.search ?? "");
      const hay = typeof val === "object" && val !== null ? JSON.stringify(val) : String(val ?? "");
      const found = config.caseSensitive
        ? hay.includes(search)
        : hay.toLowerCase().includes(search.toLowerCase());
      const pass = (config.mode ?? "include") === "include" ? found : !found;
      outputs.match = pass;
      outputs.out = pass ? val : null;
      break;
    }
    case "stringOpNode": {
      const text = String(inputs.text ?? "");
      const op = config.op ?? "uppercase";
      if (op === "uppercase") outputs.out = text.toUpperCase();
      else if (op === "lowercase") outputs.out = text.toLowerCase();
      else if (op === "trim") outputs.out = text.trim();
      else if (op === "length") outputs.out = text.length;
      else if (op === "reverse") outputs.out = [...text].reverse().join("");
      else outputs.out = text;
      break;
    }
    case "replaceTextNode": {
      const text = String(inputs.text ?? "");
      const find = String(inputs.find ?? "");
      outputs.out = find === "" ? text : text.split(find).join(String(inputs.replace ?? ""));
      break;
    }
    case "forLoopNode":
      outputs.index = Number(config.index ?? 0);
      break;
    case "whileLoopNode":
      outputs.iteration = Number(config.iteration ?? 0);
      break;
    case "counterNode":
      outputs.count = Number(config.count ?? 0);
      break;
    case "randomNode": {
      const minVal = Number(inputs.min ?? 0);
      const maxVal = Number(inputs.max ?? 100);
      const min = Math.min(minVal, maxVal);
      const max = Math.max(minVal, maxVal);
      outputs.value = Math.floor(Math.random() * (max - min + 1)) + min;
      break;
    }
    case "textOutputNode":
      outputs.value = inputs.value;
      break;
    default:
      break;
  }

  return outputs;
}

/**
 * Handles operations executed during active trigger signals (like delay timers, log updates, counters).
 * Returns the next port in the execution chain and any config modifications.
 */
export async function handleTriggerOperation(
  type: string,
  inputs: Record<string, any>,
  config: Record<string, any> = {},
  targetPortId: string
): Promise<{
  nextTriggerPort: string | null;
  updatedConfig?: Record<string, any>;
}> {
  let nextTriggerPort: string | null = null;
  let updatedConfig: Record<string, any> | undefined = undefined;

  if (type === "loggerNode") {
    const valToLog = inputs.value;
    const logStr = `[${new Date().toLocaleTimeString()}] ${
      typeof valToLog === "object" ? JSON.stringify(valToLog) : valToLog
    }`;
    const logs = [...(config.logs ?? []), logStr];
    updatedConfig = { ...config, logs };
    nextTriggerPort = "outTrigger";
  } 
  else if (type === "delayNode") {
    const delayMs = Number(inputs.delayMs ?? 1000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    nextTriggerPort = "outTrigger";
  }
  else if (type === "randomNode") {
    nextTriggerPort = "outTrigger";
  }
  else if (type === "textOutputNode") {
    nextTriggerPort = "outTrigger";
  } 
  else if (type === "ifElseTrigger") {
    nextTriggerPort = resolveConditionFlag(inputs.condition) ? "onTrue" : "onFalse";
  }
  else if (type === "counterNode") {
    let change = 0;
    if (targetPortId === "incTrigger") change = 1;
    else if (targetPortId === "decTrigger") change = -1;

    const currentCount =
      targetPortId === "resetTrigger"
        ? 0
        : Number(config.count ?? 0) + change;

    updatedConfig = { ...config, count: currentCount };
  }

  return { nextTriggerPort, updatedConfig };
}
