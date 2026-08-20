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

These are widely reported, publicly documented incidents, fact-checked
against primary sources (FTC filings, CVE/NVD records, the original research)
and reputable secondary reporting where a primary source blocked automated
verification — sourced individually below each entry.

**Mirai (2016).** The botnet behind the October 21, 2016 attack on Dyn — which
disrupted Twitter, Spotify, Amazon, Netflix, PayPal, GitHub, and dozens of
other major services for hours — was not a sophisticated exploit. It scanned
the internet for IoT devices (network cameras, routers, DVRs) still reachable
over Telnet/SSH with one of 68 **hardcoded factory default username/password
pairs**, and logged in. Dyn's own contemporaneous analysis attributed the
attack to on the order of 100,000 compromised devices; the botnet's
documented lifetime peak was roughly 600,000 infections.
→ *Lesson: a device with a shared or default credential is not "unlikely to
be found" — automated scanning finds it in hours, at internet scale.*
[[Krebs on Security]](https://krebsonsecurity.com/2016/10/who-makes-the-iot-things-under-attack/) ·
[[Antonakakis et al., USENIX Security 2017]](https://www.usenix.org/system/files/conference/usenixsecurity17/sec17-antonakakis.pdf) ·
[[CISA Alert]](https://www.cisa.gov/news-events/alerts/2016/10/14/heightened-ddos-threat-posed-mirai-and-other-botnets)

**Ring / Amazon (FTC settlement, 2023).** The FTC's complaint (May 31, 2023)
covered two distinct failures over 2017–2020: (a) Ring gave **every employee
and hundreds of third-party contractors unrestricted access to every
customer's video**, with no job-need restriction, used footage to train
algorithms without consent, and didn't require internal authorization for
human review of recordings until 2018 — one employee was found to have
viewed thousands of recordings, including from women's bedrooms and
bathrooms, undetected for months; (b) Ring allegedly ignored internal and
external warnings and failed to add basic anti-credential-stuffing
protections or mandatory 2FA despite experiencing account-takeover attacks
in 2017–2018, with the complaint citing over 55,000 US customer accounts
compromised between January 2019 and March 2020. Ring paid a $5.8M
settlement; the FTC distributed $5.6M of it back to affected customers.
→ *Lesson: authentication that relies only on "a password the user chose" is
only as strong as every other website that password was ever used on — and
"trusted employee access" is itself an attack surface that needs its own
audit trail, not an honor system.*
[[FTC press release]](https://www.ftc.gov/news-events/news/press-releases/2023/05/ftc-says-ring-employees-illegally-surveilled-customers-failed-stop-hackers-taking-control-users) ·
[[TechCrunch]](https://techcrunch.com/2023/05/31/amazon-ring-ftc-settlement-lax-security/) ·
[[EFF]](https://www.eff.org/deeplinks/2023/06/ftc-forces-ring-take-user-privacy-seriously)

**Wyze — three separate incidents.** In December 2019, an internal test
database indexing ~2.4 million users' emails, device nicknames, WiFi SSIDs,
and internal/external IP addresses was left reachable without authentication
(discovered by security firm Twelve Security). Separately, **CVE-2019-9564**
— a critical (CVSS 9.8) authentication-bypass letting anyone on the same
local network take control of a Wyze Cam without credentials — was reported
privately by Bitdefender in March 2019, patched for the Cam v2 by September
2019, but **not publicly disclosed until March 2022**, a three-year gap; the
original Cam v1 was never patched at all — it was discontinued instead,
leaving existing units permanently vulnerable by design. In February 2024, a
third-party caching library Wyze had just integrated mismapped device IDs to
user IDs during a post-outage reconnection surge, and roughly 13,000 users
briefly saw thumbnails or video from other households' cameras in their app
(1,504 users tapped through to view something) before the ~40-minute-long bug
was caught.
→ *Lesson: a locally-scoped vulnerability ("only exploitable on the LAN") is
still a real vulnerability — this project's own threat model, in Part 4, has
to make that same call explicitly rather than assuming it away — and a
three-year gap between a private vulnerability report and public disclosure,
or a permanently-unpatched discontinued product still in active use, are
choices a company makes, not accidents that happen to it.*
[[NVD: CVE-2019-9564]](https://nvd.nist.gov/vuln/detail/CVE-2019-9564) ·
[[The Record]](https://therecord.media/three-vulnerabilities-found-in-wyze-cam-devices-allow-for-outside-access) ·
[[The Register, 2024 incident]](https://www.theregister.com/2024/02/20/wyze_admits_13000_users_allowed_feed_access/)

**Verkada (2021).** Attackers found a Verkada Super Admin account's
credentials publicly exposed on the internet, used them to reach an internal
support tool with root-level access to essentially every customer camera,
and reportedly had live-feed access for about 36 hours before it was cut off
— shortly after Bloomberg contacted the company. Coverage at the time named
Tesla, Cloudflare, hospitals, schools (including Sandy Hook Elementary), and
a county jail among the organizations whose feeds were exposed, out of a
reported ~150,000 cameras. One exposed credential, with disproportionate
reach.
→ *Lesson: a support/admin tool that can see everything is a
company-ending liability if its credential is ever exposed. If a support
tool needs broad access, it needs its own hardened auth, audit logging, and
least-privilege scoping — not a single admin password.*
[[Bloomberg]](https://www.bloomberg.com/news/articles/2021-03-09/hackers-expose-tesla-jails-in-breach-of-150-000-security-cams) ·
[[Security Magazine]](https://www.securitymagazine.com/articles/94789-verkada-breach-exposed-live-feeds-of-150000-surveillance-cameras-inside-schools-hospitals-and-more) ·
[[BeyondTrust technical analysis]](https://www.beyondtrust.com/blog/entry/dangers-of-iot-privilege-management-blind-spots-exposed-in-verkada-security-camera-breach)

**Eufy / Anker (2022–2023).** Eufy marketed its cameras as "local storage
only, nothing leaves your home." In November 2022, security researcher Paul
Moore showed a Eufy Doorbell Dual — with cloud storage switched *off* —
still uploading facial-recognition thumbnails to Eufy's AWS servers. The
Verge's Sean Hollister then showed the live-stream URL was built from a
serial number, a timestamp, and an access token **that Eufy's server never
actually validated**, plus a 4-hex-digit value brute-forceable in under
65,536 tries — and used it to watch his own camera's live feed in plain VLC
media player from across the country. Anker's PR team first flatly denied
this was possible; two months later, in February 2023, Anker admitted the
cameras were not end-to-end encrypted as claimed and committed to a real
encryption rollout, an external audit, and a bug bounty.
→ *Lesson: don't market a security property you haven't verified end-to-end
— and when a customer's PR team denies a specific, reproducible technical
claim before checking it, that denial becomes its own liability once someone
publishes the video.*
[[Paul Moore, original report]](https://x.com/paul_reviews/status/1595421705996042240) ·
[[MacRumors, Anker's admission]](https://www.macrumors.com/2023/01/31/anker-eufy-camera-security/)

**BLE relay attacks (NCC Group, May 2022).** BLE-based "unlock when your
phone is near" systems — NCC Group demonstrated this against a 2020 Tesla
Model 3's phone-as-key passive entry, and noted the same design in Kwikset
and Weiser Kevo smart locks — authenticate based on *signal proximity*: if
the phone answers over Bluetooth, the device assumes it's physically nearby.
NCC Group's relay tool forwarded raw link-layer BLE responses between a
phone (anywhere) and the target vehicle with as little as 8 milliseconds of
added latency — low enough to defeat the round-trip-time checks products
were already using as a countermeasure — unlocking and driving off a car
whose actual key was tested up to 80 ms of relay latency away.
→ *Lesson: "is the phone answering over Bluetooth" is not the same claim as
"is the phone within arm's reach" — proximity inferred from radio signal
strength/latency is a spoofable signal, not a security boundary, unless the
protocol cryptographically bounds round-trip time at a layer an attacker
can't shortcut.*
[[NCC Group technical advisory]](https://www.nccgroup.com/research-blog/technical-advisory-tesla-ble-phone-as-a-key-passive-entry-vulnerable-to-relay-attacks/)

**BLE pairing itself — a spec-level gap, not one company's bug.** NIST's own
Bluetooth security guidance is explicit: *"The Just Works pairing method
results in an unauthenticated LTK because no MITM protection is provided
during pairing"* — unlike Passkey Entry, Numeric Comparison, or Out-of-Band
pairing, which do protect against a man-in-the-middle. Just Works is what
the overwhelming majority of consumer BLE accessories use, because it needs
no PIN entry or display. This is documented, intended behavior of the mode —
but it means *link-layer BLE pairing alone is not authentication*. A concrete
consequence: the Tapplock Bluetooth padlock (CVE-2018-20958) derived its
unlock key by hashing the lock's own Bluetooth MAC address — which the lock
broadcast openly to anyone nearby — letting a researcher unlock one in about
two seconds with no interaction with the owner's phone at all; the FTC later
took enforcement action over Tapplock's "unbreakable" marketing claims.
→ *Lesson: never let "we're BLE-paired" be the entire authorization check for
a sensitive action (unlock, disable an alarm, control a camera). Pairing
proves you're near a radio, not who you are.*
[[NIST SP 800-121r2, §3.2.2.4]](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-121r2.pdf) ·
[[NVD: CVE-2018-20958]](https://nvd.nist.gov/vuln/detail/CVE-2018-20958) ·
[[Forbes, Tapplock 2-second hack]](https://www.forbes.com/sites/thomasbrewster/2018/06/13/tapplock-smart-lock-hacked-in-2-seconds/)

**ESP32 / embedded firmware — the "the key is baked into flash" trap.**
Espressif's ESP32 supports Flash Encryption and Secure Boot specifically so
physical possession of a device doesn't mean physical possession of its
secrets — but both are **off by default**, opt-in via one-way eFuse burns,
and a well-documented, easily reproduced technique (a USB-to-serial adapter,
holding BOOT while tapping RESET, then `esptool.py read_flash`) pulls the
entire firmware image — including any WiFi credentials or API keys hardcoded
into it — off a chip that never had them enabled. The protections themselves
aren't bulletproof either: **CVE-2019-15894**, published independently by
LimitedResults and two Riscure researchers, showed physical fault-injection
(voltage/clock glitching during boot) could bypass ESP32 Secure Boot v1
outright; Espressif's fix was to force Flash Encryption on whenever Secure
Boot is enabled, closing that specific gap (later fault-injection research
continued to probe Secure Boot v2). Separately, in March 2025 researchers at
Tarlogic found 29 undocumented vendor debug commands in the ESP32's
Bluetooth controller (CVE-2025-27840) — briefly reported in tech press as a
"backdoor," a framing Tarlogic itself retracted within days once Espressif
and independent researchers pointed out the CVSS vector requires **physical
or already-compromised-host access** to the chip's low-level interface, not
anything reachable over a normal Bluetooth connection or the internet. Real
finding, overstated headline — worth knowing both halves.
→ *Lesson: if a secret only needs to exist on one specific device, it must be
unique per device — a shared key baked into every unit means extracting one
unit's firmware compromises the entire fleet, not just that one device — and
"physical access required" doesn't mean "no risk," it means the threat model
determines whether it matters.*
[[Espressif: Flash Encryption docs]](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/security/flash-encryption.html) ·
[[Espressif Secure Boot advisory, CVE-2019-15894]](https://www.espressif.com/en/news/Espressif_Security_Advisory_Concerning_Fault_Injection_and_Secure_Boot) ·
[[Tarlogic writeup]](https://www.tarlogic.com/blog/esp32-hidden-hci-vendor-commands/) ·
[[Espressif's response]](https://www.espressif.com/en/news/response_esp32_bluetooth)

---

## Part 2 — The baseline everyone converges on

Independent of any one framework, industry guidance for consumer IoT
converges on the same handful of non-negotiables. Two of the standards
behind that convergence, cited precisely:

- **OWASP IoT Top 10** (2018 edition — a stable, still-current reference
  rather than an annually refreshed list): weak/guessable/hardcoded
  passwords, insecure network services, insecure ecosystem interfaces, lack
  of a secure update mechanism, insecure/outdated components, insufficient
  privacy protection, insecure data transfer/storage, lack of device
  management, insecure default settings, and lack of physical hardening.
  [[owasp.org]](https://owasp.org/www-project-internet-of-things/)
- **ETSI EN 303 645**, "Cyber Security for Consumer IoT: Baseline
  Requirements" (v2.1.1, 2020) — 13 provisions, starting explicitly with *no
  universal default passwords* (provision 1), then: a vulnerability-disclosure
  process, keeping software updated, securely storing security parameters,
  communicating securely, minimizing attack surfaces, ensuring software
  integrity, protecting personal data, resilience to outages, examining
  telemetry, easy data deletion, easy install/maintenance, and validating
  input data.
  [[ETSI]](https://www.etsi.org/deliver/etsi_en/303600_303699/303645/02.01.01_60/en_303645v020101p.pdf)

Distilled to what actually drove this project's design:

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
