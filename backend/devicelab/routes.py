"""Device Lab API surface. Mounted from backend/main.py under /devicelab."""

import asyncio
import os
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.devicelab import build, flash, jobs, keystore, monitor, ports, secure_test, toolchain

router = APIRouter(prefix="/devicelab", tags=["devicelab"])


@router.get("/ports")
def get_ports():
    return {"ports": ports.list_serial_ports(), "uf2Drives": ports.list_uf2_drives()}


@router.get("/toolchain")
def get_toolchain():
    return toolchain.doctor()


@router.get("/boards")
def get_boards():
    return {
        "boards": [
            {"id": board_id, "label": profile["label"], "chip": profile["chip"]}
            for board_id, profile in build.BOARD_PROFILES.items()
        ]
    }


class BuildSource(BaseModel):
    kind: str = "hello"  # "hello" | "generated"
    code: Optional[str] = None


class BuildRequest(BaseModel):
    boardId: str
    source: BuildSource = Field(default_factory=BuildSource)
    # Compile-time -D defines (e.g. WIFI_SSID). Injected into argv only,
    # redacted from job logs, never persisted.
    defines: Dict[str, str] = Field(default_factory=dict)
    # Bake this device's secret key from the server-side keystore as
    # DEVICE_KEY — the key itself never crosses the API on the build path.
    deviceKeyId: Optional[str] = None


@router.post("/build")
def post_build(payload: BuildRequest):
    try:
        defines = dict(payload.defines)
        if payload.deviceKeyId:
            defines["DEVICE_KEY"] = keystore.get_key(payload.deviceKeyId)
        job = build.start_build(
            payload.boardId, payload.source.kind, payload.source.code, defines
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"jobId": job.id, "buildId": job.result.get("buildId")}


class FlashRequest(BaseModel):
    buildId: str
    port: str
    baud: int = 460800
    mode: str = "app"  # "merged" (@0x0, fresh boards) | "app" (@0x10000)


@router.post("/flash")
def post_flash(payload: FlashRequest):
    try:
        job = flash.start_flash(payload.buildId, payload.port, payload.baud, payload.mode)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"jobId": job.id}


class KeyGenerateRequest(BaseModel):
    deviceId: str


@router.get("/keys")
def get_keys():
    return {"deviceIds": keystore.list_ids()}


@router.post("/keys/generate")
def post_key_generate(payload: KeyGenerateRequest):
    """Creates (or returns) the device's key. The key is returned ONCE-style
    for the pairing step (QR/manual entry into the phone app) — this is a
    local learning tool; a shipped product pairs from the device itself."""
    try:
        key = keystore.generate(payload.deviceId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"deviceId": payload.deviceId, "key": key}


class SecureTestRequest(BaseModel):
    ip: str
    deviceId: str
    command: str = "led:toggle"
    # True deliberately corrupts the MIC — the device must answer 401.
    forge: bool = False


@router.post("/secure/test")
def post_secure_test(payload: SecureTestRequest):
    """Runs one authenticated command against a device over WiFi. The key
    stays server-side; the browser only names device + command."""
    try:
        key = keystore.get_key(payload.deviceId)
        return secure_test.run_command(payload.ip, key, payload.command, payload.forge)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # device unreachable / timeout
        raise HTTPException(status_code=502, detail=f"device unreachable: {exc}")


class IdentifyRequest(BaseModel):
    port: str
    baud: int = 115200


@router.post("/identify")
def post_identify(payload: IdentifyRequest):
    """Chip-level identification via esptool flash_id (works with any or no
    firmware). Returns a job — the chip type/MAC/flash size stream into it."""
    try:
        job = flash.start_identify(payload.port, payload.baud)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"jobId": job.id}


class ProbeRequest(BaseModel):
    port: str
    baud: int = 115200
    command: str = "info"  # ping | info | test


@router.post("/probe")
def post_probe(payload: ProbeRequest):
    """Ask the RUNNING firmware over serial (ping/info/test) and return its
    reply — the fastest 'is this device actually working?' check."""
    if payload.command not in ("ping", "info", "test"):
        raise HTTPException(status_code=400, detail="command must be ping, info or test")
    try:
        return monitor.probe(payload.port, payload.baud, payload.command)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pyserial SerialException on busy port
        raise HTTPException(status_code=409, detail=f"could not open port: {exc}")


class ReadRequest(BaseModel):
    port: str
    chip: str = "esp32"
    baud: int = 460800
    sizeMb: int = 4


@router.post("/read")
def post_read(payload: ReadRequest):
    """Load (back up) the device's flash contents into a downloadable .bin."""
    try:
        job = flash.start_read(payload.port, payload.chip, payload.baud, payload.sizeMb)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"jobId": job.id, "readId": job.result.get("readId")}


@router.get("/reads/{read_id}/download")
def download_read(read_id: str):
    try:
        path = flash.resolve_read(read_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return FileResponse(path, media_type="application/octet-stream", filename=os.path.basename(path))


@router.get("/builds/{build_id}/download")
def download_build(build_id: str, mode: str = "app"):
    try:
        image = build.resolve_image(build_id, mode)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return FileResponse(
        image["path"], media_type="application/octet-stream", filename=os.path.basename(image["path"])
    )


@router.get("/jobs/{job_id}")
def get_job(job_id: str, after: int = 0):
    job = jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="unknown job")
    return job.snapshot(after=after)


@router.post("/jobs/{job_id}/cancel")
def post_cancel(job_id: str):
    return {"cancelled": jobs.cancel_job(job_id)}


class MonitorOpenRequest(BaseModel):
    port: str
    baud: int = 115200


@router.post("/monitor/open")
def post_monitor_open(payload: MonitorOpenRequest):
    try:
        session = monitor.open_session(payload.port, payload.baud)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pyserial SerialException on busy port
        raise HTTPException(status_code=409, detail=f"could not open port: {exc}")
    return {"port": session.port, "baud": session.baud, "open": True}


class MonitorCloseRequest(BaseModel):
    port: str


@router.post("/monitor/close")
def post_monitor_close(payload: MonitorCloseRequest):
    return {"closed": monitor.close_session(payload.port)}


class MonitorSendRequest(BaseModel):
    port: str
    text: str
    newline: bool = True


@router.post("/monitor/send")
def post_monitor_send(payload: MonitorSendRequest):
    session = monitor.get_session(payload.port)
    if not session:
        raise HTTPException(status_code=404, detail="no open monitor for that port")
    return {"sent": session.write_line(payload.text, payload.newline)}


@router.get("/monitor/sessions")
def get_monitor_sessions():
    return {"sessions": monitor.list_sessions()}


@router.websocket("/ws/monitor/{port}")
async def ws_monitor(websocket: WebSocket, port: str):
    await websocket.accept()
    session = monitor.get_session(port)
    if not session:
        await websocket.send_json({"error": "no open monitor for that port"})
        await websocket.close()
        return
    seq = 0
    try:
        while True:
            snapshot = session.read_lines(after=seq)
            if snapshot["lines"]:
                seq = snapshot["lines"][-1]["seq"]
                await websocket.send_json(snapshot)
            if not snapshot["open"]:
                break
            await asyncio.sleep(0.15)
    except WebSocketDisconnect:
        pass
