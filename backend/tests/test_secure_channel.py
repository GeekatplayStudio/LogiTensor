"""Secured command channel: keystore behaviour and HMAC signing.

The sign() vector here is the contract shared by three implementations —
firmware/esp32video/secure_channel.h, backend/devicelab/secure_test.py, and
mobile/esp32-companion/src/crypto.ts. If this value changes, all three move.
"""

import hashlib
import hmac

import pytest

from backend.devicelab import keystore, secure_test


def test_sign_is_hmac_sha256_of_nonce_pipe_command():
    key = "ab" * 32
    nonce = "00112233445566778899aabbccddeeff"
    cmd = "led:toggle"
    expected = hmac.new(
        bytes.fromhex(key), f"{nonce}|{cmd}".encode(), hashlib.sha256
    ).hexdigest()
    assert secure_test.sign(key, nonce, cmd) == expected
    # Canonical vector shared with src/lib/__tests__/device-transport.test.ts,
    # mobile/esp32-companion and firmware/esp32video/secure_channel.h. If this
    # value changes, every implementation must change with it.
    assert secure_test.sign(key, nonce, cmd) == (
        "4203b1a818832089e35a29e17ea510093776f35fe3aaf04ec899796ec3f1ff37"
    )


def test_forged_mic_differs_from_valid():
    key = "cd" * 32
    nonce = "ffee" * 8
    good = secure_test.sign(key, nonce, "led:on")
    forged = good[:-1] + ("0" if good[-1] != "0" else "1")
    assert forged != good


def test_run_command_rejects_bad_ip():
    with pytest.raises(ValueError):
        secure_test.run_command("not-an-ip", "ab" * 32, "led:on")


def test_run_command_rejects_empty_command():
    with pytest.raises(ValueError):
        secure_test.run_command("192.168.4.1", "ab" * 32, "")


def test_keystore_generate_is_stable_and_256bit(tmp_path, monkeypatch):
    path = tmp_path / "device-keys.local.json"
    monkeypatch.setattr(keystore, "KEYS_PATH", str(path))
    first = keystore.generate("cam-01")
    assert len(first) == 64  # 256 bits, hex
    # Re-generating the same id must NOT re-key (would orphan flashed devices).
    assert keystore.generate("cam-01") == first
    assert "cam-01" in keystore.list_ids()
    assert keystore.get_key("cam-01") == first


def test_keystore_rejects_bad_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(keystore, "KEYS_PATH", str(tmp_path / "k.json"))
    with pytest.raises(ValueError):
        keystore.generate("bad id!")
    with pytest.raises(ValueError):
        keystore.get_key("never-made")
