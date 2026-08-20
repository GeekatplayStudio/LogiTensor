# Device Lab — architecture and step-by-step guide

Device Lab is LogiTensor's hardware playground: build and flash ESP32
firmware, talk to a real device over WiFi *or* Bluetooth from a desktop
panel or a phone app, and watch an authenticated command get accepted — or
a forged one get rejected — in real time. This document explains how the
pieces fit together and how to extend them.

Companion doc: [`SECURITY_CASE_STUDY.md`](./SECURITY_CASE_STUDY.md) covers
*why* it's built this way, grounded in how real products have failed.

---

## The one idea everything else follows from

**Security lives above transport, not inside it.** WiFi and Bluetooth are
just two different ways to move bytes to a device. Neither is trusted to
provide authentication on its own — WPA2/WPA3 protects the *radio link*
(anyone with the network password is "in"), and BLE pairing has the same
problem (see the case study for why "Just Works" pairing is not an auth
mechanism). So authentication is a layer that sits *above* both transports
and is identical no matter which one is carrying the bytes.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application code                           │
│   (Secure commands panel, node graph, phone app screens)         │
└───────────────────────────┬───────────────────────────────────────┘
                             │  channel.execute("led:on")
                    ┌────────▼────────┐
                    │  CommandChannel   │   ← the ONLY thing app code calls
                    └────────┬────────┘
              ┌──────────────┴──────────────┐
    ┌─────────▼─────────┐         ┌─────────▼─────────┐
    │  BrokeredChannel    │         │   SignedChannel     │
    │  (desktop/web:       │         │  (mobile: this client │
    │  backend holds the   │         │  holds the key, signs │
    │  key, never sent to  │         │  locally)              │
    │  the browser)         │         └─────────┬─────────┘
    └─────────┬─────────┘                        │
              │                          ┌────────┴────────┐
              │ nonce + HMAC             │  DeviceTransport   │  ← bytes only,
              │ over HTTP                │  (WiFi | BLE | …)  │    never sees a key
              ▼                          └────────┬────────┘
    ┌─────────────────┐                           │
    │  backend keystore │                 ┌────────┴────────┐
    │  (never leaves     │                 │ WiFi (HTTP)  │ BLE (GATT) │
    │  the server)        │                 └──────────────┘─────────────┘
    └─────────────────┘                              │
                                                       ▼
                                        ┌───────────────────────────┐
                                        │   ESP32 firmware            │
                                        │   secure_channel.h          │
                                        │   (verifies nonce + HMAC)   │
                                        └───────────────────────────┘
```

Two clients, two ways of holding the authority to command a device, one
shared vocabulary of commands, one verification rule on the device. Adding
a transport can never quietly add a way in, because a transport never sees
the key.

---

## The abstraction, file by file

### Desktop / web — `src/lib/device-lab/transport/`

| File | Role |
|---|---|
| `types.ts` | The contracts: `DeviceTransport` (moves bytes), `CommandSigner` (produces a MIC), `CommandChannel` (what app code calls), `DEVICE_COMMANDS` (the shared vocabulary). |
| `signer.ts` | `LocalKeySigner` — signs with Web Crypto (`HMAC-SHA256`), key held in memory only, imported as non-extractable. |
| `wifi-transport.ts` | `WifiTransport` — the device's HTTP API. Implements `DeviceTransport` and nothing else; it has no idea what a key is. |
| `channels.ts` | `BrokeredChannel` (backend signs, for the desktop panel) and `SignedChannel` (this client signs, for anywhere a key is legitimately held client-side). |
| `index.ts` | Public surface + `createChannel()` factory. **Import from here, never from a concrete transport file.** |

### Mobile — `mobile/esp32-companion/src/transport/`

Same five files, same names, same shapes — `types.ts`, `signer.ts`,
`wifi-transport.ts`, `ble-transport.ts` (the one mobile-only addition),
`index.ts`. One architecture, two runtimes. The command vocabulary
(`DEVICE_COMMANDS`) is copy-identical, so a command added on one side is a
one-line change to mirror on the other.

### Firmware — `firmware/esp32video/`

| File | Role |
|---|---|
| `secure_channel.h` | Nonce issuing (`secureIssueNonce`) and verification (`secureVerify`) — the one place the actual security decision is made. |
| `led_control.h` | An example actuator command (`led:on`/`off`/`toggle`/`blink`). |
| `ble_announce.h` | The BLE GATT service: an INFO characteristic (read/notify) and a CONTROL characteristic (write) carrying the same command protocol as HTTP. |
| `esp32video.ino` | Wires it together: `executeNetworkCommand()` is the single choke point every network-originated command passes through, for every transport. |

### Backend — `backend/devicelab/`

| File | Role |
|---|---|
| `keystore.py` | Per-device 256-bit keys, generated once, stored in a gitignored local JSON file — never re-generated for an existing id (that would orphan flashed devices). |
| `secure_test.py` | Signs and sends a command on the backend's behalf — the Python twin of `LocalKeySigner`, used by `BrokeredChannel`. |
| `build.py` | Bakes a device's key into firmware as a `-D DEVICE_KEY=...` compiler define — the key is injected into the build's argv, never written to the `.ino` source, never echoed into the job log. |

---

## Step by step: pair a new device

1. **Generate a key.** Device Lab → Secure commands → type a device id (e.g.
   `cam-02`) → **New key**. `keystore.generate()` creates a 256-bit key and
   stores it locally. The key is created once; re-running for the same id
   returns the same key.
2. **Bake it into firmware.** Flash wizard → source "ESP32 Camera" → pick the
   device id from the **Device key** dropdown → Build → Flash. The key
   travels from `backend/devicelab/keys/device-keys.local.json` into the
   compiler's argv and nowhere else — it is never part of the HTTP request
   body, never logged.
3. **Reveal it once, for pairing.** Secure commands → **Show pairing key** —
   the 64-hex-character key is shown so you can type or scan it into the
   phone app. This is a *learning-tool* shortcut; a shipped product would
   have the device present this itself (a printed QR code, an on-device
   display) rather than a developer tool revealing it — see the case study's
   "what to add before shipping" section.
4. **Pair the phone.** Paste the key into ESP32 Companion → **Save to secure
   storage**. It's written to iOS Keychain / Android Keystore via
   `expo-secure-store` (`src/key-store.ts`) — never `AsyncStorage`, never a
   JS variable that could end up in a crash log.
5. **Connect and command.** Pick WiFi or Bluetooth, Connect, then any command
   button — `led:on`, `echo:...`, `info`, `test`. Same code path either way.
6. **Prove it's real.** Desktop → Secure commands → **Send FORGED command** —
   the same request with one bit of the signature flipped. Watch the device
   answer `401` instead of executing it.

## Step by step: add a new transport

Say you want raw USB serial from the browser (WebSerial) as a third option.

1. Implement `DeviceTransport` (`src/lib/device-lab/transport/types.ts`):
   `connect`, `disconnect`, `requestNonce`, `sendCommand`. Look at
   `wifi-transport.ts` for the shape — your serial version parses the same
   JSON line protocol the firmware already speaks over USB
   (`ping`/`info`/`test`/arbitrary command → JSON reply on the next line).
2. That's it. `SignedChannel` already works with any `DeviceTransport` — it
   doesn't know or care that this one is new. No change to the signer, no
   change to firmware, no change to the security model.
3. Add it to `createChannel()`'s options if you want the factory to build it,
   and to the UI's transport picker.

## Step by step: add a new command

1. **Firmware**: add a branch in `executeCommand()` (`esp32video.ino`) —
   follow `ledCommand()`'s pattern in `led_control.h` if it's an actuator.
2. **Vocabulary**: add the command string to `DEVICE_COMMANDS` in *both*
   `src/lib/device-lab/transport/types.ts` and
   `mobile/esp32-companion/src/transport/types.ts` — keep them byte-identical.
3. **UI**: wire a button to `channel.execute(DEVICE_COMMANDS.yourCommand)` in
   the Secure commands panel and/or `App.tsx`.

Nothing about authentication changes — every command, old or new, goes
through the same nonce-and-MIC gate, because that gate lives in
`executeNetworkCommand()`, not per-command.

---

## Testing this yourself

- **Unit tests**: `npm run test` runs `device-transport.test.ts` — signing
  determinism, replay defence (a fresh nonce is fetched for every command,
  never reused), forged-MIC detection, and a locked cross-language HMAC
  vector shared with the Python test suite. `python -m pytest` runs the
  Python twin (`test_secure_channel.py`) against the *same* vector — if the
  two ever disagree, one of the four implementations (firmware included) has
  drifted, and the tests catch it before hardware does.
- **Live, on real hardware**: this was verified end-to-end against an actual
  ESP32-S3 camera board — provisioned a key, built secured firmware, flashed
  it, and confirmed both a valid command (`led:blink` → LED changes) and a
  deliberately forged one (rejected with `401`) over the real WiFi AP.
- **Real bug this caught**: the first flash of the S3 build produced a board
  that printed nothing but ROM boot noise over serial. Root cause: the board
  profile had `CDCOnBoot=cdc`, which routes `Serial` to the chip's *native*
  USB port — but this board reaches its host through a CH343 UART bridge
  chip, so the actual COM port was listening to nothing. Fixed by adding a
  second board profile (`CDCOnBoot=default`) and picking the right one per
  board family in `backend/devicelab/build.py`. A board that "looks dead" is
  sometimes a serial-routing mismatch, not a hardware fault — worth knowing
  before you assume a chip is bricked.

---

## Node-graph integration

Device Lab connectivity nodes (WiFi Scan/Connect, BLE Scan, USB Serial Send)
live in the visual node editor as an ordinary category — see
`src/types/node-definitions/device-lab.ts`. They run a deterministic
simulation on the canvas (parity-tested against a Python mirror, same
convention as every other node type) and compile to real Arduino calls when
sent to a device via the flash wizard
(`src/lib/device-lab/firmware-codegen.ts`). The registration checklist for
adding a new node category is documented inline at the top of
`device-lab.ts` and in the codebase's own module-size guardrail (`AGENTS.md`).
