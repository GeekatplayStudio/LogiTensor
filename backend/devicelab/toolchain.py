"""Toolchain doctor: verify arduino-cli, the ESP32 board core, and esptool.

Check-only in Phase 1 — returns install guidance instead of mutating the
system (ash-mesh setup.mjs does auto-install; that lands later behind an
explicit user confirmation).
"""

import json
import os
import shutil
import subprocess
import sys
from typing import Any, Dict, List, Optional

_ARDUINO_CLI_CANDIDATES = [
    "arduino-cli",
    os.path.expandvars(r"%ProgramFiles%\Arduino CLI\arduino-cli.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Arduino15\arduino-cli.exe"),
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Arduino CLI\arduino-cli.exe"),
]


def _run(argv: List[str], timeout: int = 30) -> Optional[str]:
    try:
        out = subprocess.run(
            argv, capture_output=True, text=True, timeout=timeout, check=False
        )
        return out.stdout if out.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def resolve_arduino_cli() -> Optional[str]:
    for candidate in _ARDUINO_CLI_CANDIDATES:
        path = shutil.which(candidate) or (candidate if os.path.isfile(candidate) else None)
        if path:
            return path
    return None


def resolve_esptool() -> Optional[List[str]]:
    """esptool discovery order mirrors ash-mesh: python -m esptool, then
    the standalone scripts/exes."""
    if _run([sys.executable, "-m", "esptool", "version"]):
        return [sys.executable, "-m", "esptool"]
    for name in ("esptool.py", "esptool"):
        path = shutil.which(name)
        if path and _run([path, "version"]):
            return [path]
    return None


def esp32_core_status(cli_path: str) -> Dict[str, Any]:
    out = _run([cli_path, "core", "list", "--json"], timeout=60)
    if out is None:
        return {"ok": False, "version": None}
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return {"ok": False, "version": None}
    platforms = data.get("platforms", data if isinstance(data, list) else [])
    for platform in platforms or []:
        pid = platform.get("id") or platform.get("ID")
        if pid == "esp32:esp32":
            version = (
                platform.get("installed_version")
                or platform.get("installed")
                or (platform.get("releases") and "installed")
            )
            return {"ok": bool(version), "version": version}
    return {"ok": False, "version": None}


def doctor() -> Dict[str, Any]:
    guidance: List[str] = []

    cli_path = resolve_arduino_cli()
    cli_version = _run([cli_path, "version"]) if cli_path else None
    arduino = {"ok": bool(cli_version), "path": cli_path, "version": (cli_version or "").strip() or None}
    if not arduino["ok"]:
        guidance.append(
            "Install arduino-cli: winget install ArduinoSA.CLI (Windows) or brew install arduino-cli."
        )

    core = esp32_core_status(cli_path) if cli_path else {"ok": False, "version": None}
    if arduino["ok"] and not core["ok"]:
        guidance.append(
            "Install the ESP32 board core: arduino-cli core update-index && arduino-cli core install esp32:esp32"
        )

    esptool_argv = resolve_esptool()
    esptool = {
        "ok": esptool_argv is not None,
        "how": "module" if esptool_argv and esptool_argv[0] == sys.executable else ("exe" if esptool_argv else None),
    }
    if not esptool["ok"]:
        guidance.append("Install esptool: pip install esptool")

    return {
        "arduinoCli": arduino,
        "esp32Core": core,
        "esptool": esptool,
        "ready": arduino["ok"] and core["ok"] and esptool["ok"],
        "guidance": guidance,
    }
