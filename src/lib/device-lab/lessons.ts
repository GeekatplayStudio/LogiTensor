// Guided learning content shown in the Device Lab lesson panel. Static data
// on purpose: lessons are versioned with the code that implements them.

export interface LessonStep {
  title: string;
  text: string;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  steps: LessonStep[];
}

export const LESSONS: Lesson[] = [
  {
    id: "first-flash",
    title: "Flash your first ESP32",
    summary: "Build the hello-world firmware and put it on a real board over USB.",
    steps: [
      {
        title: "Check the toolchain",
        text: "The Toolchain panel must show arduino-cli, the ESP32 board core, and esptool all green. If anything is red, follow its install hint, then refresh.",
      },
      {
        title: "Plug in the board",
        text: "Connect the ESP32 over USB. It appears in the Ports panel — the description tells you the USB bridge chip (CP210x/CH340) or native USB (ESP32-S3/C3/C6). If nothing shows, you may need the bridge driver, or the cable is power-only.",
      },
      {
        title: "Build",
        text: "In the Flash wizard pick your board model and the Hello World source, then Build. arduino-cli compiles the sketch; watch the log stream. The first build downloads the core toolchain and takes a few minutes.",
      },
      {
        title: "Flash",
        text: "Pick the board's port and flash. Use 'merged @0x0' for a brand-new board (writes bootloader + partitions + app); 'app @0x10000' is enough afterwards and is faster. Some boards need the BOOT button held while flashing starts.",
      },
      {
        title: "See it run",
        text: "Open the serial monitor at 115200 baud. You should see 'Hello from LogiBoard Device Lab!' once per second. That loop — edit, build, flash, monitor — is the core of all firmware work.",
      },
    ],
  },
  {
    id: "serial-monitor",
    title: "Read and talk over USB serial",
    summary: "Serial is the debug lifeline of embedded work — learn to read and write it.",
    steps: [
      {
        title: "What serial is",
        text: "A byte pipe between the board and your PC over USB, at an agreed speed (baud). 115200 baud is the ESP32 convention. Mismatched baud shows as garbage characters.",
      },
      {
        title: "Open a monitor",
        text: "Select the port and open the monitor. Multiple monitors on different ports can run at the same time — that's how you watch two boards talk to each other.",
      },
      {
        title: "Send a line",
        text: "Type in the monitor's send box. The firmware sees it on Serial.read(). Note: opening a monitor holds the port, so the flasher closes it automatically before writing firmware.",
      },
    ],
  },
  {
    id: "graph-to-device",
    title: "Send your logic to the device",
    summary: "Turn a node graph from the canvas into real firmware.",
    steps: [
      {
        title: "Build a graph",
        text: "On the canvas, wire a Manual Trigger to Device Lab nodes — e.g. Trigger → WiFi Scan → USB Serial Send. On the canvas these run as a simulation; on the device they become real radio calls.",
      },
      {
        title: "Generate firmware",
        text: "In the Flash wizard choose 'Current graph' as the source. LogiBoard walks your trigger chains and emits a real Arduino sketch — open the preview to read it; unsupported nodes become TODO comments rather than broken code.",
      },
      {
        title: "Secrets stay out of the code",
        text: "If your graph uses WiFi Connect, the wizard asks for SSID/password and injects them as compile-time defines. They are never written into the sketch file or the build log — the same pattern commercial firmware pipelines use.",
      },
      {
        title: "Flash and verify",
        text: "Build, flash, open the monitor. Your graph's output prints from the real hardware. Congratulations — you have a visual-programming-to-firmware pipeline.",
      },
    ],
  },
  {
    id: "wifi-security",
    title: "WiFi bands and security",
    summary: "2.4 vs 5 vs 6 GHz, and why WPA versions matter for products.",
    steps: [
      {
        title: "Bands",
        text: "Classic ESP32/S3/C3 radios are 2.4 GHz only — long range, crowded spectrum. 5 GHz needs newer silicon; WiFi 6/6E (the ESP32-C6 speaks WiFi 6 on 2.4 GHz) adds efficiency for many-device networks. The WiFi Scan node's band filter mirrors this.",
      },
      {
        title: "WPA2 vs WPA3",
        text: "WPA2-PSK is the floor for anything you ship; WPA3-SAE resists offline password cracking. Passphrases are minimum 8 characters — the WiFi Connect node simulation enforces exactly that rule.",
      },
      {
        title: "Consumer-product hygiene",
        text: "Never hard-code credentials in source or ship them in a repo. Device Lab bakes them in at compile time from your input, and Phase 2 adds provisioning: per-device keys in a local keystore, injected server-side, with physical-consent arming before key-bearing firmware can be flashed.",
      },
    ],
  },
];
