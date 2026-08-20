"""esptool flash and read-back jobs. Chip/baud/address allowlisted; the
port must exist in a fresh enumeration; images to write come from
build.resolve_image (by id); read-backs land in the stage dir and are
served by read id only."""

import os
import uuid
from typing import Any, Dict

from backend.devicelab.build import STAGE_ROOT, resolve_image
from backend.devicelab.jobs import Job, create_job, run_subprocess_job
from backend.devicelab.monitor import close_session
from backend.devicelab.ports import is_known_port
from backend.devicelab.toolchain import resolve_esptool

ALLOWED_CHIPS = {"esp32", "esp32s3", "esp32c3", "esp32c6"}
ALLOWED_BAUDS = {115200, 230400, 460800, 921600}
ALLOWED_ADDRESSES = {0x0, 0x10000}


def start_flash(build_id: str, port: str, baud: int, mode: str) -> Job:
    if mode not in ("merged", "app"):
        raise ValueError("mode must be 'merged' or 'app'")
    if baud not in ALLOWED_BAUDS:
        raise ValueError(f"baud not allowed: {baud}")
    if not is_known_port(port):
        raise ValueError(f"port not present: {port}")

    image = resolve_image(build_id, mode)
    if image["chip"] not in ALLOWED_CHIPS:
        raise ValueError(f"chip not allowed: {image['chip']}")
    if image["address"] not in ALLOWED_ADDRESSES:
        raise ValueError(f"address not allowed: {image['address']:#x}")

    esptool = resolve_esptool()
    if not esptool:
        raise RuntimeError("esptool not found — see the toolchain doctor")

    # If a monitor session holds this port, release it first (ash-mesh
    # closes conflicting sessions before flashing for the same reason).
    close_session(port)

    argv = esptool + [
        "--chip",
        image["chip"],
        "--port",
        port,
        "--baud",
        str(baud),
        "write_flash",
        f"{image['address']:#x}",
        image["path"],
    ]
    job = create_job("flash")
    job.result.update({"buildId": build_id, "port": port, "mode": mode})
    run_subprocess_job(job, argv)
    return job


# Whole-chip read sizes (MB). 4 covers ESP32-CAM and most dev boards.
ALLOWED_READ_MB = {1, 2, 4, 8, 16}

# readId -> {path, port, chip, sizeMb}
READS: Dict[str, Dict[str, Any]] = {}


def start_read(port: str, chip: str, baud: int, size_mb: int) -> Job:
    """Back up the device's entire flash to a .bin (ash-mesh read-back
    pattern). The result can be re-flashed later as a merged image @0x0."""
    if chip not in ALLOWED_CHIPS:
        raise ValueError(f"chip not allowed: {chip}")
    if baud not in ALLOWED_BAUDS:
        raise ValueError(f"baud not allowed: {baud}")
    if size_mb not in ALLOWED_READ_MB:
        raise ValueError(f"read size not allowed: {size_mb} MB")
    if not is_known_port(port):
        raise ValueError(f"port not present: {port}")

    esptool = resolve_esptool()
    if not esptool:
        raise RuntimeError("esptool not found — see the toolchain doctor")

    read_id = uuid.uuid4().hex[:12]
    out_dir = os.path.join(STAGE_ROOT, "reads", read_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"device-{chip}-{size_mb}mb.bin")
    READS[read_id] = {"path": out_path, "port": port, "chip": chip, "sizeMb": size_mb}

    close_session(port)
    argv = esptool + [
        "--chip",
        chip,
        "--port",
        port,
        "--baud",
        str(baud),
        "read_flash",
        "0x0",
        f"{size_mb * 0x100000:#x}",
        out_path,
    ]
    job = create_job("read")
    job.result.update({"readId": read_id, "port": port, "sizeMb": size_mb})
    run_subprocess_job(job, argv)
    return job


def start_identify(port: str, baud: int) -> Job:
    """Ask the chip itself who it is: esptool flash_id auto-detects the chip
    type and reports MAC, flash manufacturer and size. Works on any ESP32
    regardless of what firmware (if any) is on it."""
    if baud not in ALLOWED_BAUDS:
        raise ValueError(f"baud not allowed: {baud}")
    if not is_known_port(port):
        raise ValueError(f"port not present: {port}")
    esptool = resolve_esptool()
    if not esptool:
        raise RuntimeError("esptool not found — see the toolchain doctor")
    close_session(port)
    job = create_job("identify")
    job.result.update({"port": port})
    run_subprocess_job(job, esptool + ["--port", port, "--baud", str(baud), "flash_id"])
    return job


def resolve_read(read_id: str) -> str:
    record = READS.get(read_id)
    if not record or not os.path.isfile(record["path"]):
        raise ValueError("unknown or incomplete read")
    return record["path"]


def flash_info() -> Dict[str, object]:
    return {
        "chips": sorted(ALLOWED_CHIPS),
        "bauds": sorted(ALLOWED_BAUDS),
        "addresses": [f"{a:#x}" for a in sorted(ALLOWED_ADDRESSES)],
    }
