"""TS/Python parity for the Device Lab node simulation.

Vectors mirror src/lib/__tests__/device-nodes.test.ts — both engines must
produce identical results for the same inputs/config."""

from backend.engine.device import (
    DEVICE_COMPUTE,
    SIM_BLE_DEVICES,
    sim_wifi_connect,
    sim_wifi_scan,
)
from backend.engine.trigger_state import DEFAULT_PORTS, apply_trigger_state


def test_wifi_scan_fixture_parity():
    assert sim_wifi_scan("2.4") == ["HomeNet-2.4G", "CoffeeShop", "IoT-Sensors"]
    assert sim_wifi_scan("5") == ["HomeNet-5G", "Office-5G"]
    assert sim_wifi_scan("6") == ["HomeNet-6E"]
    assert len(sim_wifi_scan("all")) == 6
    assert sim_wifi_scan("nope") == []


def test_wifi_scan_trigger_and_reflect():
    config, ports = apply_trigger_state("wifiScan", {}, {"band": "2.4"}, "inTrigger")
    assert ports is DEFAULT_PORTS
    assert config["networks"] == ["HomeNet-2.4G", "CoffeeShop", "IoT-Sensors"]
    outputs = DEVICE_COMPUTE["wifiScan"]({}, config)
    assert outputs["count"] == 3


def test_wifi_scan_undriven_does_not_mutate():
    # Same rule as counterNode: an undriven entry point reflects, never scans.
    config, _ = apply_trigger_state("wifiScan", {}, {"band": "2.4"}, None)
    assert config is None


def test_wifi_connect_parity():
    assert sim_wifi_connect("HomeNet", "short")["connected"] is False
    assert sim_wifi_connect("", "longenough")["connected"] is False
    assert sim_wifi_connect("HomeNet", "longenough") == {
        "connected": True,
        "ip": "192.168.1.42",
        "rssi": -55,
    }
    config, _ = apply_trigger_state(
        "wifiConnect",
        {"ssid": "HomeNet", "password": "longenough"},
        {"security": "wpa2"},
        "inTrigger",
    )
    assert DEVICE_COMPUTE["wifiConnect"]({}, config)["connected"] is True


def test_ble_scan_parity():
    config, _ = apply_trigger_state("bleScan", {}, {"durationMs": 3000}, "inTrigger")
    assert config["devices"] == SIM_BLE_DEVICES
    assert DEVICE_COMPUTE["bleScan"]({}, config)["count"] == 3


def test_usb_serial_send_simulated_when_no_session():
    config, _ = apply_trigger_state(
        "usbSerialSend",
        {"text": "hello board"},
        {"port": "", "baud": 115200, "newline": True},
        "inTrigger",
    )
    assert config["sent"] is True
    assert config["lastText"] == "hello board"
    assert DEVICE_COMPUTE["usbSerialSend"]({}, config)["sent"] is True
