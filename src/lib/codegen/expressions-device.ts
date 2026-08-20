import type { GraphNode } from "./types";
import type { EmitCtx } from "./expressions";
import { stateVar } from "./expressions";

// Data-output emitters for the Device Lab nodes (500-line guardrail overflow
// of expressions.ts, following expressions-extra.ts). Like the other stateful
// trigger-driven nodes, every output reads a state variable that the trigger
// chain (chains-device.ts) mutates — the generated code mirrors the canvas
// simulation; real hardware calls live in the firmware sketch generator
// (src/lib/device-lab/firmware-codegen.ts) used by the flash wizard.

export function deviceOutputExpr(ctx: EmitCtx, node: GraphNode, portId: string): string | null {
  const p = ctx.profile;
  switch (node.type) {
    case "wifiScan":
      return portId === "count"
        ? p.strLen(stateVar(ctx, node, "networks"))
        : stateVar(ctx, node, "networks");
    case "wifiConnect":
      if (portId === "ip") return stateVar(ctx, node, "ip");
      if (portId === "rssi") return stateVar(ctx, node, "rssi");
      return stateVar(ctx, node, "connected");
    case "bleScan":
      return portId === "count"
        ? p.strLen(stateVar(ctx, node, "devices"))
        : stateVar(ctx, node, "devices");
    case "usbSerialSend":
      return stateVar(ctx, node, "sent");
    default:
      return null;
  }
}
