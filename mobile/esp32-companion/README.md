# ESP32 Companion — iPhone + Android (one Expo codebase)

Sends **authenticated commands** (LED on/off/blink, data echo, info, self-test) to
your esp32video board over **WiFi or Bluetooth**, using the same
HMAC-SHA256 nonce/MIC protocol as the firmware and LogiBoard's Secure
commands panel. One React Native codebase builds both apps.

## Security in one paragraph

Every command needs a fresh single-use nonce from the device plus
`HMAC-SHA256(deviceKey, nonce + "|" + command)`. Without the 256-bit device
key — provisioned in LogiBoard's Device Lab and baked into the firmware at
flash time — commands are rejected with 401, and captured traffic can't be
replayed. If the firmware was built with no key ("learning mode") everything
runs open so you can compare the two worlds.

## Build (on your Mac — iPhone; any machine — Android)

```bash
cd mobile/esp32-companion
npm install
# BLE needs a native build (Expo Go can't do it):
npx expo prebuild
npx expo run:ios        # iPhone plugged in, your Apple dev team selected
npx expo run:android    # or an Android phone/emulator
```

Permissions (Bluetooth, local network) are pre-declared in `app.json`.

## Use

1. In LogiBoard → Device Lab → **Secure commands**: create a device key
   (e.g. `cam-01`), pick it in the flash wizard's "Device key" dropdown for
   the ESP32 Camera source, and flash.
2. **Pair**: Secure commands → "Show pairing key" → type/paste the 64-hex-char
   key into the app's Pair section → **Save to secure storage**. It's written
   to iOS Keychain / Android Keystore (`src/key-store.ts`), not app memory or
   `AsyncStorage` — closing and reopening the app keeps it paired.
3. **Connect**: pick WiFi (join `esp32video` / `testESP32`, or the board's LAN
   IP if it also joined your home network) or Bluetooth (Scan & connect).
   Same commands, same code path, either way — compare round-trip times.
4. **Command**: LED on/off/blink, echo, info, self-test.
5. Leave the key field empty to run in unsigned "learning mode" (only works
   against firmware built with no device key) and compare the two worlds.
6. Try a wrong key: every command bounces with `auth failed` — that's the
   consumer-security lesson working. See
   [`../../docs/SECURITY_CASE_STUDY.md`](../../docs/SECURITY_CASE_STUDY.md)
   for why this is built this way.

## Architecture

This app and the desktop Device Lab panel share one design — see
[`../../docs/DEVICE_LAB.md`](../../docs/DEVICE_LAB.md) for the full picture.
In short: `App.tsx` never touches WiFi or Bluetooth directly — it builds a
`DeviceTransport` (`WifiTransport` or `BleTransport`), wraps it in a
`SignedChannel` that knows how to sign commands, and only ever calls
`channel.execute(command)`. Adding a third transport means implementing one
small interface; it can't accidentally weaken authentication because
transports never see the device key.

## Files

- `App.tsx` — pairing, transport switch, command buttons, log.
- `src/key-store.ts` — device key in Keychain/Keystore via `expo-secure-store`.
- `src/transport/types.ts` — the `DeviceTransport`/`CommandSigner`/`CommandChannel` contracts + shared command vocabulary.
- `src/transport/signer.ts` — HMAC-SHA256 signing (mirrors `secure_channel.h`).
- `src/transport/wifi-transport.ts` — nonce + `/cmd` over HTTP.
- `src/transport/ble-transport.ts` — same protocol over the GATT control/info characteristics.
- `src/transport/index.ts` — `SignedChannel` + `createChannel()` — import from here.
