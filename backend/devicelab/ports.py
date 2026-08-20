"""Serial port enumeration, board guessing, and UF2 drive detection.

Ports are always re-enumerated at validation time so a flash/monitor
request can only name a port that physically exists right now (ash-mesh
device-flash-routes.js pattern).
"""

import os
import string
import sys
from typing import Any, Dict, List, Optional

try:
    from serial.tools import list_ports
except ImportError:  # pyserial not installed yet — doctor will flag it
    list_ports = None  # type: ignore[assignment]

# VID -> human guess. 0x303A is Espressif native USB (S2/S3/C3/C6 CDC).
VID_GUESSES = {
    0x303A: "ESP32 (native USB)",
    0x10C4: "CP210x bridge (ESP32 DevKit)",
    0x1A86: "CH340 bridge (ESP32 clone)",
    0x0403: "FTDI bridge",
    0x239A: "Adafruit board",
    0x2E8A: "Raspberry Pi RP2040",
}


def list_serial_ports() -> List[Dict[str, Any]]:
    if list_ports is None:
        return []
    found = []
    for p in sorted(list_ports.comports(), key=lambda p: p.device):
        found.append(
            {
                "device": p.device,
                "description": p.description or "",
                "vid": p.vid,
                "pid": p.pid,
                "serialNumber": p.serial_number,
                "boardGuess": VID_GUESSES.get(p.vid or -1),
            }
        )
    return found


def is_known_port(device: str) -> bool:
    return any(p["device"] == device for p in list_serial_ports())


def _read_uf2_info(root: str) -> Optional[Dict[str, str]]:
    path = os.path.join(root, "INFO_UF2.TXT")
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(2048)
    except OSError:
        return None
    info: Dict[str, str] = {}
    for line in text.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            info[key.strip()] = value.strip()
    return info


def list_uf2_drives() -> List[Dict[str, Any]]:
    """Boards in UF2 bootloader mode (Adafruit/RP2040) mount as removable
    drives holding INFO_UF2.TXT. Phase 1 detects and explains; the actual
    UF2 copy-flash lands in a later phase."""
    drives: List[Dict[str, Any]] = []
    if sys.platform == "win32":
        import ctypes

        DRIVE_REMOVABLE = 2
        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for i, letter in enumerate(string.ascii_uppercase):
            if not bitmask & (1 << i):
                continue
            root = f"{letter}:\\"
            if ctypes.windll.kernel32.GetDriveTypeW(root) != DRIVE_REMOVABLE:
                continue
            info = _read_uf2_info(root)
            if info:
                drives.append(
                    {
                        "root": root,
                        "boardId": info.get("Board-ID", "unknown"),
                        "model": info.get("Model", ""),
                        "guidance": (
                            "This board uses UF2 bootloader flashing (drag-and-drop a "
                            ".uf2 file onto the drive) instead of esptool. CircuitPython "
                            "support is planned for a later Device Lab phase."
                        ),
                    }
                )
    else:  # POSIX: common mount roots
        for base in ("/media", "/Volumes", "/run/media"):
            if not os.path.isdir(base):
                continue
            for entry in os.listdir(base):
                root = os.path.join(base, entry)
                info = _read_uf2_info(root)
                if info:
                    drives.append(
                        {
                            "root": root,
                            "boardId": info.get("Board-ID", "unknown"),
                            "model": info.get("Model", ""),
                            "guidance": "UF2 bootloader drive detected — copy-flash lands in a later phase.",
                        }
                    )
    return drives
