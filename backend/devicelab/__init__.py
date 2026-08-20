"""Device Lab backend: serial ports, toolchain doctor, firmware build
(arduino-cli) and flash (esptool) jobs, and serial monitor sessions.

All subprocesses are spawned argv-only (never shell=True); ports, chips,
bauds and flash addresses are validated against allowlists; firmware
images are resolved by build id from the in-process manifest, never from
a client-supplied path.
"""
