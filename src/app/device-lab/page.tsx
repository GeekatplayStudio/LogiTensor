"use client";

import dynamic from "next/dynamic";

// Device Lab talks to serial hardware and WebSockets — client-only.
const DeviceLabScreen = dynamic(
  () => import("@/components/device-lab/device-lab-screen"),
  { ssr: false }
);

export default function DeviceLabPage() {
  return <DeviceLabScreen />;
}
