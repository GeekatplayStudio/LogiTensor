"""Firmware builds via arduino-cli, as polled jobs.

Board identity and user defines are injected server-side into the compile
argv via `--build-property compiler.cpp.extra_flags=...`.

CRITICAL (learned from ash-mesh build-firmware.mjs): never use
`build.extra_flags` — it REPLACES the platform's own flags, including
ARDUINO_USB_CDC_ON_BOOT, which silently kills the USB serial port on
native-CDC boards. `compiler.cpp.extra_flags` appends instead.
"""

import glob
import os
import re
import shutil
import uuid
from typing import Any, Dict, List, Optional

from backend.devicelab.jobs import Job, create_job, run_subprocess_job
from backend.devicelab.toolchain import resolve_arduino_cli

STAGE_ROOT = os.path.join(os.path.dirname(__file__), "stage")

# FQBN per supported family. min_spiffs maximizes app space like ash-mesh.
BOARD_PROFILES: Dict[str, Dict[str, Any]] = {
    "esp32": {
        "label": "ESP32 (classic DevKit)",
        "fqbn": "esp32:esp32:esp32",
        "chip": "esp32",
        "appAddress": 0x10000,
    },
    "esp32cam": {
        # AI-Thinker ESP32-CAM (classic ESP32 + OV2640). huge_app partition:
        # camera + WiFi + BLE do not fit the default scheme.
        "label": "ESP32-CAM (AI-Thinker)",
        "fqbn": "esp32:esp32:esp32:PartitionScheme=huge_app",
        "chip": "esp32",
        "appAddress": 0x10000,
    },
    "esp32s3": {
        "label": "ESP32-S3",
        "fqbn": "esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc",
        "chip": "esp32s3",
        "appAddress": 0x10000,
    },
    "esp32s3cam": {
        # ESP32-S3 camera boards with a UART BRIDGE (Freenove S3 CAM uses
        # CH343). CDCOnBoot must stay `default` so Serial goes to UART0 —
        # with CDCOnBoot=cdc the sketch prints to the native USB port and
        # the bridge COM port shows only ROM boot noise.
        "label": "ESP32-S3 camera — UART bridge (Freenove)",
        "fqbn": "esp32:esp32:esp32s3:CDCOnBoot=default,PartitionScheme=huge_app,PSRAM=opi",
        "chip": "esp32s3",
        "appAddress": 0x10000,
    },
    "esp32s3camusb": {
        # ESP32-S3 camera boards on NATIVE USB (XIAO Sense, S3-EYE): the
        # chip itself is the COM port, so Serial must be the USB CDC.
        "label": "ESP32-S3 camera — native USB (XIAO Sense / S3-EYE)",
        "fqbn": "esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,PartitionScheme=huge_app,PSRAM=opi",
        "chip": "esp32s3",
        "appAddress": 0x10000,
    },
    "esp32c3": {
        "label": "ESP32-C3",
        "fqbn": "esp32:esp32:esp32c3:CDCOnBoot=cdc",
        "chip": "esp32c3",
        "appAddress": 0x10000,
    },
    "esp32c6": {
        "label": "ESP32-C6",
        "fqbn": "esp32:esp32:esp32c6:CDCOnBoot=cdc",
        "chip": "esp32c6",
        "appAddress": 0x10000,
    },
}

HELLO_SKETCH = """// Device Lab hello-world: proves the build+flash+monitor loop end to end.
void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.println("Hello from LogiBoard Device Lab!");
  delay(1000);
}
"""

# Multi-file sketches shipped in the repo, buildable by name. The staged
# copy keeps the directory name equal to the .ino name (arduino-cli rule).
REPO_SKETCHES: Dict[str, str] = {
    "esp32video": os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "..", "firmware", "esp32video")
    ),
}

# buildId -> {dir, boardId, chip, appAddress, bin, merged}
BUILDS: Dict[str, Dict[str, Any]] = {}

_DEFINE_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")


def _define_flags(defines: Dict[str, str]) -> List[str]:
    flags = []
    for name, value in defines.items():
        if not _DEFINE_NAME.match(name):
            raise ValueError(f"invalid define name: {name!r}")
        # Escape for a C string literal; the value never touches a shell.
        escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
        flags.append(f'-D{name}="{escaped}"')
    return flags


def build_argv(
    cli_path: str, board_id: str, sketch_dir: str, out_dir: str, defines: Dict[str, str]
) -> List[str]:
    profile = BOARD_PROFILES[board_id]
    argv = [
        cli_path,
        "compile",
        "--fqbn",
        profile["fqbn"],
        "--output-dir",
        out_dir,
    ]
    if defines:
        extra = " ".join(_define_flags(defines))
        # compiler.cpp.extra_flags, NEVER build.extra_flags (see module docstring).
        argv += ["--build-property", f"compiler.cpp.extra_flags={extra}"]
    argv.append(sketch_dir)
    return argv


def _register_outputs(job: Job, build_id: str, out_dir: str) -> None:
    bins = glob.glob(os.path.join(out_dir, "*.ino.bin"))
    merged = glob.glob(os.path.join(out_dir, "*.merged.bin"))
    record = BUILDS.get(build_id)
    if record is None:
        return
    record["bin"] = bins[0] if bins else None
    record["merged"] = merged[0] if merged else None
    job.result.update(
        {
            "buildId": build_id,
            "bin": os.path.basename(record["bin"]) if record["bin"] else None,
            "merged": os.path.basename(record["merged"]) if record["merged"] else None,
        }
    )


def start_build(
    board_id: str, kind: str, code: Optional[str], defines: Dict[str, str]
) -> Job:
    if board_id not in BOARD_PROFILES:
        raise ValueError(f"unknown board: {board_id}")
    if kind not in ("hello", "generated") and kind not in REPO_SKETCHES:
        raise ValueError(f"unknown source kind: {kind}")

    build_id = uuid.uuid4().hex[:12]
    stage_dir = os.path.join(STAGE_ROOT, build_id)
    out_dir = os.path.join(stage_dir, "out")
    os.makedirs(out_dir, exist_ok=True)

    if kind in REPO_SKETCHES:
        # Multi-file repo sketch: copy the whole directory, keeping its name
        # (arduino-cli requires dir name == .ino name).
        src = REPO_SKETCHES[kind]
        if not os.path.isdir(src):
            raise ValueError(f"repo sketch missing on disk: {kind}")
        sketch_dir = os.path.join(stage_dir, os.path.basename(src))
        shutil.copytree(src, sketch_dir)
    else:
        source = HELLO_SKETCH if kind == "hello" else (code or "")
        if not source.strip():
            raise ValueError("empty sketch source")
        # Sketch dir name must match the .ino name for arduino-cli.
        sketch_dir = os.path.join(stage_dir, "sketch")
        os.makedirs(sketch_dir, exist_ok=True)
        with open(os.path.join(sketch_dir, "sketch.ino"), "w", encoding="utf-8") as fh:
            fh.write(source)

    profile = BOARD_PROFILES[board_id]
    BUILDS[build_id] = {
        "dir": stage_dir,
        "boardId": board_id,
        "chip": profile["chip"],
        "appAddress": profile["appAddress"],
        "bin": None,
        "merged": None,
    }

    cli_path = resolve_arduino_cli()
    if not cli_path:
        raise RuntimeError("arduino-cli not found — see the toolchain doctor")

    argv = build_argv(cli_path, board_id, sketch_dir, out_dir, defines)
    # Defines may carry secrets (WiFi credentials): redact them from the log.
    display = [a if not a.startswith("compiler.cpp.extra_flags=") else "compiler.cpp.extra_flags=<redacted defines>" for a in argv]
    job = create_job("build")
    job.result["buildId"] = build_id
    run_subprocess_job(
        job,
        argv,
        display_argv=display,
        on_success=lambda j: _register_outputs(j, build_id, out_dir),
    )
    return job


def resolve_image(build_id: str, mode: str) -> Dict[str, Any]:
    """Resolve a flashable image strictly by build id + mode; the client
    never supplies a filesystem path."""
    record = BUILDS.get(build_id)
    if not record:
        raise ValueError("unknown buildId")
    path = record["merged"] if mode == "merged" else record["bin"]
    if not path or not os.path.isfile(path):
        raise ValueError(f"no {mode} image for this build")
    # Path containment: image must live inside this build's stage dir.
    if os.path.commonpath([os.path.abspath(path), os.path.abspath(record["dir"])]) != os.path.abspath(record["dir"]):
        raise ValueError("image path escaped the stage directory")
    address = 0x0 if mode == "merged" else record["appAddress"]
    return {"path": path, "address": address, "chip": record["chip"]}


def clear_stage() -> None:
    BUILDS.clear()
    shutil.rmtree(STAGE_ROOT, ignore_errors=True)
