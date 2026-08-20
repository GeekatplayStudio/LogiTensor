"""Per-device secret keys for the secured command channel.

Keys live in keys/device-keys.local.json (gitignored; .example.json is the
committed template) and are injected into firmware builds server-side as a
-D DEVICE_KEY define — the ash-mesh pattern. The reveal endpoint exists so
the Device Lab UI can show a pairing code/QR for the phone app ONCE at
setup; this is a local learning tool, in a shipped product the pairing
secret would come off the device itself (printed QR / display)."""

import json
import os
import re
import secrets
from typing import Dict, List

KEYS_PATH = os.path.join(os.path.dirname(__file__), "keys", "device-keys.local.json")
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")


def _load() -> Dict[str, str]:
    try:
        with open(KEYS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return {k: v for k, v in data.items() if isinstance(v, str) and len(v) == 64}
    except (OSError, json.JSONDecodeError):
        return {}


def _save(keys: Dict[str, str]) -> None:
    os.makedirs(os.path.dirname(KEYS_PATH), exist_ok=True)
    with open(KEYS_PATH, "w", encoding="utf-8") as fh:
        json.dump(keys, fh, indent=2)


def list_ids() -> List[str]:
    return sorted(_load().keys())


def get_key(device_id: str) -> str:
    key = _load().get(device_id)
    if not key:
        raise ValueError(f"no key for device: {device_id}")
    return key


def generate(device_id: str) -> str:
    """Creates (or returns the existing) 256-bit key for device_id.
    Existing keys are preserved — re-keying would orphan flashed devices."""
    if not _ID_RE.match(device_id):
        raise ValueError("device id must be 1-32 chars of A-Z a-z 0-9 _ -")
    keys = _load()
    if device_id not in keys:
        keys[device_id] = secrets.token_hex(32)
        _save(keys)
    return keys[device_id]
