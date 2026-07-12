import { safeEvaluate } from "./safe-evaluator";

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
    let condition = false;
    const condVal = inputs.condition;
    if (typeof condVal === "string") {
      const trimmed = condVal.trim().toLowerCase();
      if (trimmed === "true" || trimmed === "1" || trimmed === "yes") {
        condition = true;
      } else if (trimmed === "false" || trimmed === "0" || trimmed === "no" || trimmed === "") {
        condition = false;
      } else {
        try {
          condition = Boolean(safeEvaluate(trimmed, {}));
        } catch {
          condition = false;
        }
      }
    } else {
      condition = Boolean(condVal);
    }
    nextTriggerPort = condition ? "onTrue" : "onFalse";
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
