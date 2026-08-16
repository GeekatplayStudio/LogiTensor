import { toBool, toList } from "./node-value-utils";

export interface TriggerResult {
  nextTriggerPort: string | null;
  updatedConfig?: Record<string, any>;
}

type TriggerOp = (
  inputs: Record<string, any>,
  config: Record<string, any>,
  targetPortId: string
) => TriggerResult;

const SEQUENCE_PORTS = ["out1", "out2", "out3"];

/**
 * Trigger-driven behaviour for the stateful nodes added on top of the
 * original library. Following the existing convention (see counterNode), the
 * frontend owns the state — it lives in node.data.config and is returned via
 * updatedConfig; the Python engine only reflects whatever config holds.
 */
export const EXTRA_TRIGGER_OPS: Record<string, TriggerOp> = {
  toggleNode: (_inputs, config, port) => ({
    nextTriggerPort: "outTrigger",
    updatedConfig: { ...config, state: port === "resetTrigger" ? false : !config.state },
  }),

  latchNode: (_inputs, config, port) => {
    // Anything other than Reset is a Set — the latch only has two commands.
    if (port !== "setTrigger" && port !== "resetTrigger") {
      return { nextTriggerPort: "outTrigger" };
    }
    return {
      nextTriggerPort: "outTrigger",
      updatedConfig: { ...config, state: port === "setTrigger" },
    };
  },

  listAppendNode: (inputs, config, port) => {
    const items = port === "resetTrigger" ? [] : [...toList(config.items), inputs.value];
    return { nextTriggerPort: "outTrigger", updatedConfig: { ...config, items } };
  },

  gateNode: (inputs) => ({ nextTriggerPort: toBool(inputs.open) ? "outTrigger" : null }),

  onceNode: (_inputs, config, port) => {
    if (port === "resetTrigger") {
      return { nextTriggerPort: null, updatedConfig: { ...config, fired: false } };
    }
    if (config.fired) return { nextTriggerPort: null };
    return { nextTriggerPort: "outTrigger", updatedConfig: { ...config, fired: true } };
  },

  sequenceNode: (_inputs, config, port) => {
    if (port === "resetTrigger") {
      return { nextTriggerPort: null, updatedConfig: { ...config, step: 0 } };
    }
    const step = Math.max(0, Math.trunc(Number(config.step) || 0));
    return {
      nextTriggerPort: SEQUENCE_PORTS[step % SEQUENCE_PORTS.length],
      updatedConfig: { ...config, step: (step + 1) % SEQUENCE_PORTS.length },
    };
  },

  valueListNode: (inputs, config) => ({
    nextTriggerPort: "outTrigger",
    updatedConfig: { ...config, values: [...toList(config.values), inputs.value] },
  }),
};
