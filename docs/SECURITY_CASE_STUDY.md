# Case study: securing a consumer IoT device, and why

This document exists so future projects — mine and anyone else reading this
repo — start from the lessons the industry already paid for, instead of
re-discovering them the expensive way. It's written the same way this
project's `README.md` documents its own tradeoffs: plainly, including the
parts that aren't finished.

Scope: an ESP32 camera module, a desktop control panel, and a phone app
(iOS + Android), talking over WiFi and Bluetooth. The pattern generalizes to
any consumer device with a companion app.

---

## Part 1 — What actually goes wrong

These are widely reported, publicly documented incidents. Dates and figures
below are stated at the precision they're commonly reported in press/security
research; treat exact numbers as approximate where noted, the underlying
lesson is not in dispute.

**Mirai (2016).** The botnet that took down large parts of the internet's DNS
infrastructure was not a sophisticated exploit — it scanned the internet for
IoT devices (routers, DVRs, IP cameras) still using **factory default
username/password pairs** and logged in. Tens of thousands of devices,
zero exploits required.
→ *Lesson: a device with a shared or default credential is not "unlikely to
be found" — automated scanning finds it in hours, at internet scale.*

**Ring / Amazon (FTC settlement, 2023).** The FTC's complaint centered on
Ring's own practices — broad, poorly audited employee access to customer
video, and security practices around account takeover (credential stuffing:
attackers reusing passwords leaked from *other* breaches) that let outsiders
view people's home cameras before Ring added mandatory 2FA and stricter
access controls. Ring paid a settlement and agreed to stronger controls.
→ *Lesson: authentication that relies only on "a password the user chose" is
only as strong as every other website that password was ever used on — and
"trusted employee access" is itself an attack surface that needs its own
audit trail.*

**Wyze — two separate incidents.** In 2019, an internal database indexing
device and account metadata was left exposed without authentication. Longer
running: a local network authentication-bypass flaw in Wyze cameras (tracked
as **CVE-2019-9564**) that let an attacker on the same network access camera
functions without credentials went unpatched for an unusually long stretch
after initial disclosure. In 2024, a caching bug briefly let some users' apps
show camera feeds belonging to other households.
→ *Lesson: a locally-scoped vulnerability ("only exploitable on the LAN") is
still a real vulnerability — see "the LAN is not a security boundary" below —
and a known CVE left unpatched for years is a choice, not an accident.*

**Verkada (2021).** Attackers obtained credentials for a support tool with
broad administrative access to customer camera feeds — reportedly on the
order of 150,000 cameras across hospitals, schools, and companies — and used
it to browse live footage. The credential was a single point of failure with
far more reach than any one customer's data.
→ *Lesson: a support/admin backdoor that can see everything is a
company-ending liability if it's ever exposed. If a support tool needs broad
access, it needs its own hardened auth, audit logging, and least-privilege
scoping — not a shared password.*

**Eufy / Anker (2022–2023).** Eufy marketed its cameras as "local storage
only, nothing leaves your home" — but independent researchers (notably Paul
Moore) showed the cloud companion app fetched thumbnail images from
predictable, unauthenticated-feeling URLs, and that live streams could in
some configurations be pulled with a generic media player rather than only
through Eufy's authenticated app — i.e., the actual security of the stream
did not match the "local-only, encrypted" marketing claim. The gap between
*what the encryption architecture actually was* and *what the company said it
was* is the core failure.
→ *Lesson: don't market a security property you haven't verified end-to-end.
"It's encrypted" needs to mean the stream and its key material are
unreadable to anyone without the right credential — not just "it uses
HTTPS/TLS to our servers" while the URL itself is guessable.*

**BLE relay attacks (proximity-auth systems, e.g. NCC Group's 2022 research
on Tesla/BLE-based entry).** Many BLE-based "unlock when your phone is near"
systems (cars, smart locks) authenticate based on *signal proximity* — if the
phone can be reached over Bluetooth and answers, the device assumes it's
nearby. Researchers showed this proximity check can be defeated by relaying
BLE traffic between the real phone (anywhere) and the target device, tricking
it into thinking the key is present when it's kilometers away.
→ *Lesson: "is the phone answering over Bluetooth" is not the same claim as
"is the phone within arm's reach" — proximity inferred from radio signal
strength/latency is a spoofable signal, not a security boundary, unless the
protocol explicitly bounds round-trip time.*

**BLE pairing itself — a spec-level gap, not a single company's bug.** The
Bluetooth LE "Just Works" pairing mode (used by the overwhelming majority of
consumer BLE accessories, because it requires no PIN entry or display)
provides **encryption with no protection against a man-in-the-middle at
pairing time** — anything that can be near the device during initial pairing
can potentially intercept or complete that pairing itself. This is
documented, expected behavior of the mode, not a vulnerability report against
one product — but it means *link-layer BLE pairing alone is not
authentication*, and many products historically treated "the phone paired
successfully" as if it were.
→ *Lesson: never let "we're BLE-paired" be the entire authorization check for
a sensitive action (unlock, disable an alarm, control a camera). Pairing
proves you're near a radio, not who you are.*

**ESP32 / embedded firmware — the "the key is baked into flash" trap.**
Consumer devices are frequently sold without the microcontroller's flash
encryption or secure boot enabled — meaning anyone with brief physical access
(a $10 USB-to-serial adapter and 30 seconds) can read the entire firmware
image off the chip, including any credentials, Wi-Fi passwords, or API keys
hardcoded into the source. This is one of the single most common root causes
behind "a researcher extracted our device's secrets" writeups across the
industry, independent of any one CVE. Espressif's ESP32 (like most MCUs)
supports flash encryption and Secure Boot specifically to close this gap —
but only if the manufacturer turns them on.
→ *Lesson: if a secret only needs to exist on one specific device, it must be
unique per device — a shared key baked into every unit means extracting one
unit's firmware compromises the entire fleet, not just that one device.*

---

## Part 2 — The baseline everyone converges on

Independent of any one framework, industry guidance for consumer IoT
(OWASP's IoT Top Ten, ETSI's EN 303 645 baseline requirements, and NIST's
IoT device guidance) converges on the same handful of non-negotiables:

1. **No universal default credentials** — every device, or every device
   *identity*, must be unique.
2. **Securely store credentials and security-sensitive data** — on the
   device and in any companion app, not in plaintext, not in source code.
3. **Keep software updatable, and verify what you install** — signed
   firmware updates, or you don't have integrity at all.
4. **Minimize exposed attack surface** — don't open a port or a BLE
   characteristic that doesn't need to exist for the product to work.
5. **Ensure communications integrity/authenticity** at minimum, confidentiality
   where it matters — see "what this project does NOT do yet" below for where
   this project sits on that scale.
6. **Make it easy to determine device state and behavior** — a device
   should be diagnosable, not a black box (this is where Device Lab's
   `ping`/`info`/`test` commands come from).

Everything built in this repo's `firmware/esp32video/` +
`backend/devicelab/` + the two client apps is one concrete implementation of
points 1, 2, 4, and 6, and a **partial, explicitly incomplete** implementation
of 3 and 5 — see below.

---

## Part 3 — What this project actually does, mapped to each failure above

| Real-world failure pattern | What this repo does instead | Where |
|---|---|---|
| Shared/default credentials (Mirai) | Every device gets its own randomly generated 256-bit key at provisioning time; there is no factory default, no shared secret across devices | `backend/devicelab/keystore.py` |
| Password/credential-stuffing auth (Ring) | No password at all — authentication is a cryptographic proof-of-possession of the device's own unique key, immune to credentials leaked from unrelated services | `secure_channel.h`, `transport/signer.ts` |
| Replayable/static auth tokens | Every command requires a **fresh, single-use nonce** from the device (30 s TTL, consumed on use) — captured network traffic cannot be replayed | `secureIssueNonce()`/`secureVerify()` in `secure_channel.h` |
| Hardcoded/shared firmware secrets (ESP32 flash extraction) | The key is injected as a compiler `-D` define at build time, per device, and is never written into the `.ino` source or echoed into any log | `backend/devicelab/build.py` (`_define_flags`, redacted `display_argv`) |
| Key material stored insecurely in a companion app | The phone app stores the device key in **iOS Keychain / Android Keystore** via `expo-secure-store`, scoped `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (not backed up to a new device) — never `AsyncStorage`, never a JS constant | `mobile/esp32-companion/src/key-store.ts` |
| BLE pairing treated as authorization | BLE is used purely as a **transport** (`BleTransport`) — the same nonce+HMAC gate applies whether the bytes arrived over WiFi or Bluetooth; a successful BLE connection alone authorizes nothing | `secure_channel.h`'s BLE branch requires `secure:<cmd>|<nonce>|<mic>`, rejecting plain commands once a key is baked in |
| A support/admin backdoor with broad reach (Verkada) | There is no privileged bypass path in the firmware; the same verification function (`secureVerify`) gates every network command with no special case | `esp32video.ino`: `executeNetworkCommand()` is the single choke point |
| Marketing a security property that isn't real (Eufy) | The status JSON explicitly reports `"secure": false` when no key is baked in ("learning mode") rather than implying security that isn't there — and this document says outright what is and isn't covered | `statusJson()` in `esp32video.ino`; this document |
| Opaque devices, no way to verify health | `ping`/`info`/`test` give an operator a way to independently verify the device is alive and its camera actually works, without trusting a UI's claim | Device Check panel, `backend/devicelab/monitor.py::probe()` |

---

## Part 4 — What this project does *not* do yet (read this before shipping anything)

Matching this project's own house style of documenting tradeoffs honestly
rather than glossing over them:

- **No transport-layer confidentiality.** The HMAC scheme provides
  **integrity and authenticity** (a forged or replayed command is rejected)
  but **not confidentiality** — a network observer can still *read* the
  plaintext command (`led:on`) even though they can't forge or replay one
  that works. For a device whose commands or telemetry are sensitive, add
  TLS (`esp_https_ota`/`esp-tls` on the ESP32 side) or a lighter authenticated
  encryption layer (e.g. the Noise Protocol Framework, or straightforward
  AES-256-GCM keyed off the same device key) around the payload.
- **No ESP32 flash encryption or Secure Boot enabled.** As described above,
  this means physical possession of a device plus a serial connection can
  extract the firmware image, including the baked-in device key for *that
  specific unit*. Because keys are per-device, extracting one unit's key does
  not compromise the fleet — but it does compromise that unit. Before
  shipping physical hardware, enable Secure Boot v2 and flash encryption
  (both supported natively by the ESP32/ESP-IDF toolchain this project
  already uses).
- **No rate limiting or lockout on repeated failed commands.** A local
  attacker could send many guesses in quick succession; the nonce TTL (30 s)
  and single-use consumption limit the window, but there's no explicit
  backoff or temporary lockout after N consecutive failures yet.
- **No signed OTA updates.** Firmware is written over USB via `esptool`, not
  pushed wirelessly and cryptographically verified — this project's own
  ROADMAP-style "next phase" list already calls out signed, sha-verified OTA
  as future work; do that before any wireless update mechanism ships.
- **The "reveal pairing key" step is a developer convenience, not a shippable
  UX.** A real product would have the *device itself* present its pairing
  secret (a printed QR code, a code shown on an onboard display, NFC tap) so
  the key never passes through a developer tool at all — see how Matter's
  device attestation and passcode flow, or Apple HomeKit's setup-code model,
  solve this.
- **No mutual authentication.** The current model proves the *client* holds
  the right key; the device does not cryptographically prove its own identity
  back to the client beyond "it's the one that answered on this network path."
  For most local-network, physically-owned-hardware use cases (this project's
  scope) that's a reasonable and common tradeoff — it stops becoming
  reasonable the moment the device might be spoofed on a shared or public
  network.

None of this is a defect in what was built — it's an honest boundary of
scope for a **learning platform on a private network**, drawn the same way
this repo draws its other documented boundaries (see `README.md`'s
Tradeoffs section). Treat this list as the next project's starting checklist.

---

## Part 5 — The one-paragraph version, if you remember nothing else

Don't trust the transport (WiFi password, BLE pairing) to be the security
boundary — it wasn't designed to be, and every failure above traces back to
someone treating it as if it were. Give every device its own identity, prove
every command cryptographically with something that can't be replayed, keep
that proof-material out of source code and out of insecure app storage, and
say plainly — to yourself and to users — exactly which of these properties
you actually have, because the fastest way to end up in a "Company X failed
to secure Y" writeup is to claim a security property you never verified.

See [`DEVICE_LAB.md`](./DEVICE_LAB.md) for how the abstraction that
implements this is structured, and how to extend it.
