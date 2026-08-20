"""Device Lab node behaviour — Python mirror of src/lib/device-node-compute.ts.

The canvas simulation is mirrored exactly (parity-tested) so both engines
agree; usbSerialSend additionally does REAL serial I/O here when a Device
Lab monitor session holds the configured port — the same "real work happens
backend-side" contract pythonScript/ollamaLLM follow.
"""

from typing import Any, Dict, Optional, Tuple

from backend.engine.values import to_list, to_num

# Deterministic fixtures — keep byte-identical with SIM_WIFI_NETWORKS /
# SIM_BLE_DEVICES in src/lib/device-node-compute.ts.
SIM_WIFI_NETWORKS = {
    "2.4": ["HomeNet-2.4G", "CoffeeShop", "IoT-Sensors"],
    "5": ["HomeNet-5G", "Office-5G"],
    "6": ["HomeNet-6E"],
}

SIM_BLE_DEVICES = ["ESP32-S3 DevKit", "Feather nRF52", "SmartBulb-01"]


def sim_wifi_scan(band: str) -> list:
    if band == "all":
        return [*SIM_WIFI_NETWORKS["2.4"], *SIM_WIFI_NETWORKS["5"], *SIM_WIFI_NETWORKS["6"]]
    return list(SIM_WIFI_NETWORKS.get(band, []))


def sim_wifi_connect(ssid: str, password: str) -> Dict[str, Any]:
    # WPA2/WPA3 passphrases must be at least 8 characters.
    connected = ssid.strip() != "" and len(password) >= 8
    return {
        "connected": connected,
        "ip": "192.168.1.42" if connected else "",
        "rssi": -55 if connected else 0,
    }


# ---- passive reflection (config -> data outputs) ----

def _wifi_scan_compute(_inputs, config) -> Dict[str, Any]:
    networks = to_list(config.get("networks"))
    return {"networks": networks, "count": len(networks)}


def _wifi_connect_compute(_inputs, config) -> Dict[str, Any]:
    return {
        "connected": bool(config.get("connected")),
        "ip": str(config.get("ip", "")),
        "rssi": to_num(config.get("rssi", 0)),
    }


def _ble_scan_compute(_inputs, config) -> Dict[str, Any]:
    devices = to_list(config.get("devices"))
    return {"devices": devices, "count": len(devices)}


def _usb_serial_send_compute(_inputs, config) -> Dict[str, Any]:
    return {"sent": bool(config.get("sent"))}


DEVICE_COMPUTE = {
    "wifiScan": _wifi_scan_compute,
    "wifiConnect": _wifi_connect_compute,
    "bleScan": _ble_scan_compute,
    "usbSerialSend": _usb_serial_send_compute,
}


# ---- trigger-driven state transitions (trigger_state.py conventions) ----

TriggerResult = Tuple[Optional[Dict[str, Any]], Any]


def _real_serial_send(port: str, text: str, newline: bool) -> Optional[bool]:
    """Write over the real port if a Device Lab monitor session has it open.
    Returns None when no session exists (fall back to the simulation)."""
    if not port:
        return None
    try:
        from backend.devicelab.monitor import get_session
    except ImportError:
        return None
    session = get_session(port)
    if session is None:
        return None
    return session.write_line(text, newline)


def device_trigger_ops(default_ports: Any) -> Dict[str, Any]:
    """Trigger ops keyed by node type, built against the engine's
    DEFAULT_PORTS sentinel (passed in to avoid a circular import)."""

    def _wifi_scan(inputs, config, port) -> TriggerResult:
        return {**config, "networks": sim_wifi_scan(str(config.get("band", "all")))}, default_ports

    def _wifi_connect(inputs, config, port) -> TriggerResult:
        result = sim_wifi_connect(str(inputs.get("ssid") or ""), str(inputs.get("password") or ""))
        return {**config, **result}, default_ports

    def _ble_scan(inputs, config, port) -> TriggerResult:
        return {**config, "devices": list(SIM_BLE_DEVICES)}, default_ports

    def _usb_serial_send(inputs, config, port) -> TriggerResult:
        text = str(inputs.get("text") or "")
        real = _real_serial_send(str(config.get("port", "")), text, bool(config.get("newline", True)))
        sent = True if real is None else real  # no session -> simulated success
        return {**config, "sent": sent, "lastText": text}, default_ports

    return {
        "wifiScan": _wifi_scan,
        "wifiConnect": _wifi_connect,
        "bleScan": _ble_scan,
        "usbSerialSend": _usb_serial_send,
    }


DEVICE_TRIGGER_TYPES = {"wifiScan", "wifiConnect", "bleScan", "usbSerialSend"}
