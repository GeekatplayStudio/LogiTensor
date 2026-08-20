import type { CodeLine, GraphNode } from "./types";
import type { EmitCtx } from "./expressions";
import { inputExpr, stateVar } from "./expressions";
import { tag } from "./lines";
import { literal } from "./profiles";
import { chainFrom } from "./chains";
import { flushPending, nodeComment } from "./materialize";
import { simWifiScan, SIM_BLE_DEVICES } from "../device-node-compute";

// Trigger-chain statements for the Device Lab nodes (500-line guardrail
// overflow of chains.ts). The emitted code mirrors the canvas simulation —
// deterministic fixture scans, the 8-char WPA password rule — with a comment
// naming the real on-device call. Actual hardware code is produced by the
// firmware sketch generator the flash wizard uses.

export function deviceStepInto(
  ctx: EmitCtx,
  node: GraphNode,
  _inPort: string,
  seen: Set<string>
): CodeLine[] | null {
  const p = ctx.profile;
  const cfg = node.data.config ?? {};
  const out: CodeLine[] = [];
  let named = false;
  const emit = (...texts: string[]): void => {
    out.push(...flushPending(ctx));
    if (!named) {
      named = true;
      out.push(...tag([p.comment(nodeComment(node))], node.id));
    }
    out.push(...tag(texts, node.id));
  };

  switch (node.type) {
    case "wifiScan": {
      const v = stateVar(ctx, node, "networks");
      emit(p.comment("on-device: WiFi.scanNetworks()"));
      emit(p.assign(v, literal(p, simWifiScan(String(cfg.band ?? "all")))));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      return out;
    }
    case "wifiConnect": {
      const connected = stateVar(ctx, node, "connected");
      const ip = stateVar(ctx, node, "ip");
      const rssi = stateVar(ctx, node, "rssi");
      const ssid = inputExpr(ctx, node, "ssid");
      const password = inputExpr(ctx, node, "password");
      emit(p.comment("on-device: WiFi.begin(ssid, password) — WPA passwords need 8+ chars"));
      emit(p.assign(connected, p.and(`${p.str(ssid)} != ${literal(p, "")}`, `${p.strLen(p.str(password))} >= 8`)));
      emit(p.ifLine(connected));
      out.push(
        ...tag(
          [
            `${INDENT[p.id]}${p.assign(ip, literal(p, "192.168.1.42"))}`,
            `${INDENT[p.id]}${p.assign(rssi, "-55")}`,
          ],
          node.id
        )
      );
      if (p.blockClose) emit(p.blockClose);
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      return out;
    }
    case "bleScan": {
      const v = stateVar(ctx, node, "devices");
      emit(p.comment(`on-device: NimBLE scan for ${Number(cfg.durationMs ?? 3000)} ms`));
      emit(p.assign(v, literal(p, [...SIM_BLE_DEVICES])));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      return out;
    }
    case "usbSerialSend": {
      const sent = stateVar(ctx, node, "sent");
      emit(p.comment(`on-device: Serial.println() at ${Number(cfg.baud ?? 115200)} baud`));
      emit(p.print(inputExpr(ctx, node, "text")));
      emit(p.assign(sent, p.bool(true)));
      out.push(...chainFrom(ctx, node, "outTrigger", seen));
      return out;
    }
    default:
      return null;
  }
}

const INDENT = { javascript: "  ", python: "    " } as const;
