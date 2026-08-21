// DEMO PASTE-IN #2 — WiFi/BLE signal triage for a fleet of ESP32 devices.
//
// Same idea as access-control.ts: valid, runnable TypeScript whose logic is
// hard to follow as text — a classification switch, per-device loops, and
// three counters mutated in different branches. Paste it into the code
// panel and Build Logic to see the triage as a flow.

const RSSI_READINGS = [-42, -67, -71, -88, -55, -93, -60];
const WEAK_THRESHOLD = -75;
const DEAD_THRESHOLD = -90;
const BLE_DEVICES_SEEN = 4;
const EXPECTED_BLE_DEVICES = 5;

let strongCount = 0;
let weakCount = 0;
let deadCount = 0;
let worstRssi = 0;
let reconnectsNeeded = 0;

for (let i = 0; i < RSSI_READINGS.length; i++) {
  const rssi = RSSI_READINGS[i];
  if (rssi < worstRssi) {
    worstRssi = rssi;
  }

  let grade = "";
  if (rssi <= DEAD_THRESHOLD) {
    grade = "dead";
  } else {
    if (rssi <= WEAK_THRESHOLD) {
      grade = "weak";
    } else {
      grade = "strong";
    }
  }

  switch (grade) {
    case "strong":
      strongCount = strongCount + 1;
      break;
    case "weak":
      weakCount = weakCount + 1;
      if (weakCount > 2) {
        reconnectsNeeded = reconnectsNeeded + 1;
      }
      break;
    case "dead":
      deadCount = deadCount + 1;
      reconnectsNeeded = reconnectsNeeded + 1;
      break;
    default:
      break;
  }
}

let bleHealthy = false;
if (BLE_DEVICES_SEEN >= EXPECTED_BLE_DEVICES) {
  bleHealthy = true;
} else {
  if (EXPECTED_BLE_DEVICES - BLE_DEVICES_SEEN === 1) {
    // one missing device is tolerable, but log it
    bleHealthy = true;
    console.log("BLE: one device missing from the mesh");
  } else {
    bleHealthy = false;
  }
}

if (deadCount > 0 || !bleHealthy) {
  console.log("FLEET DEGRADED: " + deadCount + " dead links, worst RSSI " + worstRssi + " dBm");
} else {
  if (weakCount > strongCount) {
    console.log("FLEET MARGINAL: " + weakCount + " weak vs " + strongCount + " strong");
  } else {
    console.log("FLEET OK: " + strongCount + " strong links");
  }
}
console.log("reconnects needed: " + reconnectsNeeded);
