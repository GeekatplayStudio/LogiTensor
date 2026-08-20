"""Client side of the secured command channel, used to test devices over
WiFi from this computer. The device key never leaves the backend — the
browser only names the device and the command.

Protocol (mirror of firmware/esp32video/secure_channel.h):
  1. GET http://<ip>/auth/nonce            -> {"nonce": "<32 hex>"}
  2. mic = HMAC-SHA256(key, nonce + "|" + cmd), hex
  3. GET http://<ip>/cmd?c=<cmd>&n=<nonce>&m=<mic>
"""

import hashlib
import hmac
import json
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Dict

_IP_RE = re.compile(r"^[0-9]{1,3}(\.[0-9]{1,3}){3}$")


def sign(key_hex: str, nonce_hex: str, command: str) -> str:
    message = f"{nonce_hex}|{command}".encode("utf-8")
    return hmac.new(bytes.fromhex(key_hex), message, hashlib.sha256).hexdigest()


def _get_json(url: str, timeout: float = 6.0) -> Dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8", errors="replace"))


def run_command(ip: str, key_hex: str, command: str, forge: bool = False) -> Dict[str, Any]:
    """Executes one authenticated command against a device. With forge=True
    the MIC is deliberately corrupted — the device MUST reject it; that
    rejection is the security lesson."""
    if not _IP_RE.match(ip):
        raise ValueError("ip must be a plain IPv4 address")
    if len(command) == 0 or len(command) > 120:
        raise ValueError("command must be 1-120 chars")

    t0 = time.time()
    nonce = _get_json(f"http://{ip}/auth/nonce").get("nonce", "")
    mic = sign(key_hex, nonce, command)
    if forge:
        # Flip the last hex digit — a syntactically valid but wrong MIC.
        mic = mic[:-1] + ("0" if mic[-1] != "0" else "1")
    url = (
        f"http://{ip}/cmd?c={urllib.parse.quote(command)}"
        f"&n={urllib.parse.quote(nonce)}&m={urllib.parse.quote(mic)}"
    )
    try:
        body = _get_json(url)
        status = 200
    except urllib.error.HTTPError as exc:  # device answers 401 on bad MIC
        body = json.loads(exc.read().decode("utf-8", errors="replace"))
        status = exc.code
    return {
        "command": command,
        "forged": forge,
        "status": status,
        "response": body,
        "roundTripMs": round((time.time() - t0) * 1000),
    }
