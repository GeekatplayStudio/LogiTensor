import type { NodeEditorState } from "./types";
import { logEvent } from "@/lib/debug-log";

// Device Lab slice: the state that must survive navigating between the
// canvas and /device-lab (the store is a module singleton, so client-side
// routing preserves it). Transient poll results (port lists, job snapshots)
// live in the Device Lab components; what's kept here is selection,
// lesson progress, and the monitor ring buffers so captured serial output
// isn't lost when the user hops back to the canvas.

const MONITOR_RING = 500;

export interface DeviceMonitorState {
  baud: number;
  open: boolean;
  lines: string[];
}

export interface DeviceSlice {
  deviceSelectedBoardId: string;
  deviceSelectedPort: string | null;
  deviceLastBuildId: string | null;
  deviceActiveLessonId: string | null;
  deviceLessonStep: number;
  deviceMonitors: Record<string, DeviceMonitorState>;
  setDeviceBoard: (boardId: string) => void;
  setDevicePort: (port: string | null) => void;
  setDeviceLastBuildId: (buildId: string | null) => void;
  setDeviceLesson: (lessonId: string | null) => void;
  setDeviceLessonStep: (step: number) => void;
  setDeviceMonitorOpen: (port: string, baud: number, open: boolean) => void;
  appendDeviceMonitorLines: (port: string, lines: string[]) => void;
  clearDeviceMonitor: (port: string) => void;
}

export const createDeviceSlice = (
  set: (partial: Partial<NodeEditorState> | ((s: NodeEditorState) => Partial<NodeEditorState>)) => void
): DeviceSlice => ({
  deviceSelectedBoardId: "esp32",
  deviceSelectedPort: null,
  deviceLastBuildId: null,
  deviceActiveLessonId: null,
  deviceLessonStep: 0,
  deviceMonitors: {},

  setDeviceBoard: (boardId) => set({ deviceSelectedBoardId: boardId }),
  setDevicePort: (port) => set({ deviceSelectedPort: port }),
  setDeviceLastBuildId: (buildId) => set({ deviceLastBuildId: buildId }),
  setDeviceLesson: (lessonId) => set({ deviceActiveLessonId: lessonId, deviceLessonStep: 0 }),
  setDeviceLessonStep: (step) => set({ deviceLessonStep: Math.max(0, step) }),

  setDeviceMonitorOpen: (port, baud, open) => {
    logEvent("info", "device", `Monitor ${open ? "opened" : "closed"}: ${port} @ ${baud}`);
    set((s) => ({
      deviceMonitors: {
        ...s.deviceMonitors,
        [port]: { baud, open, lines: s.deviceMonitors[port]?.lines ?? [] },
      },
    }));
  },

  appendDeviceMonitorLines: (port, lines) => {
    if (lines.length === 0) return;
    set((s) => {
      const current = s.deviceMonitors[port];
      if (!current) return {};
      const merged = [...current.lines, ...lines];
      return {
        deviceMonitors: {
          ...s.deviceMonitors,
          [port]: { ...current, lines: merged.slice(Math.max(0, merged.length - MONITOR_RING)) },
        },
      };
    });
  },

  clearDeviceMonitor: (port) =>
    set((s) => ({
      deviceMonitors: {
        ...s.deviceMonitors,
        [port]: { ...(s.deviceMonitors[port] ?? { baud: 115200, open: false }), lines: [] },
      },
    })),
});
