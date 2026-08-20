"""Device Lab backend unit tests: build argv safety, flash allowlists,
image resolution containment, and the job registry lifecycle."""

import time

import pytest

from backend.devicelab import build, flash, jobs


def test_build_argv_uses_compiler_cpp_extra_flags():
    argv = build.build_argv(
        "arduino-cli", "esp32s3", "sketchdir", "outdir", {"WIFI_SSID": "Home", "WIFI_PSK": "secret123"}
    )
    joined = " ".join(argv)
    # The ash-mesh lesson: compiler.cpp.extra_flags appends; build.extra_flags
    # REPLACES platform flags and silently kills USB CDC on native boards.
    assert "compiler.cpp.extra_flags=" in joined
    assert "build.extra_flags" not in joined
    assert '-DWIFI_SSID="Home"' in joined
    assert argv[0] == "arduino-cli"
    assert argv[-1] == "sketchdir"


def test_build_argv_rejects_bad_define_names():
    with pytest.raises(ValueError):
        build.build_argv("cli", "esp32", "s", "o", {"BAD NAME": "x"})
    with pytest.raises(ValueError):
        build.build_argv("cli", "esp32", "s", "o", {'X"; rm -rf /': "x"})


def test_define_values_are_escaped_not_executed():
    argv = build.build_argv("cli", "esp32", "s", "o", {"PSK": 'a"b\\c'})
    flag = next(a for a in argv if a.startswith("compiler.cpp.extra_flags="))
    assert '\\"' in flag  # embedded quote is escaped into the C literal


def test_start_build_rejects_unknown_board_and_empty_source():
    with pytest.raises(ValueError):
        build.start_build("nope", "hello", None, {})
    with pytest.raises(ValueError):
        build.start_build("esp32", "generated", "   ", {})
    with pytest.raises(ValueError):
        build.start_build("esp32", "weird", None, {})


def test_repo_sketch_registry_and_camera_profile():
    import os

    # esp32video ships in the repo and must stage as a directory whose name
    # matches its .ino (arduino-cli rule).
    src = build.REPO_SKETCHES["esp32video"]
    assert os.path.isdir(src)
    assert os.path.isfile(os.path.join(src, "esp32video.ino"))
    assert os.path.isfile(os.path.join(src, "camera_pins.h"))
    # Camera boards need the huge_app partition (camera+WiFi+BLE > default app slot).
    assert "PartitionScheme=huge_app" in build.BOARD_PROFILES["esp32cam"]["fqbn"]
    assert "PartitionScheme=huge_app" in build.BOARD_PROFILES["esp32s3cam"]["fqbn"]


def test_resolve_image_unknown_build():
    with pytest.raises(ValueError):
        build.resolve_image("nonexistent", "app")


def test_resolve_image_containment(tmp_path):
    stage = tmp_path / "stage"
    stage.mkdir()
    outside = tmp_path / "outside.bin"
    outside.write_bytes(b"x")
    build.BUILDS["testbuild"] = {
        "dir": str(stage),
        "boardId": "esp32",
        "chip": "esp32",
        "appAddress": 0x10000,
        "bin": str(outside),  # escaped the stage dir
        "merged": None,
    }
    try:
        with pytest.raises(ValueError):
            build.resolve_image("testbuild", "app")
    finally:
        del build.BUILDS["testbuild"]


def test_flash_allowlists():
    with pytest.raises(ValueError):
        flash.start_flash("any", "COM1", 1234, "app")  # bad baud
    with pytest.raises(ValueError):
        flash.start_flash("any", "COM1", 460800, "sideways")  # bad mode


def test_identify_allowlists():
    with pytest.raises(ValueError):
        flash.start_identify("COM1", 1234)  # bad baud
    with pytest.raises(ValueError):
        flash.start_identify("SURELY_NOT_A_PORT", 115200)  # port must exist now


def test_read_allowlists():
    with pytest.raises(ValueError):
        flash.start_read("COM1", "esp99", 460800, 4)  # bad chip
    with pytest.raises(ValueError):
        flash.start_read("COM1", "esp32", 460800, 3)  # bad size
    with pytest.raises(ValueError):
        flash.resolve_read("nonexistent")


def test_job_lifecycle_success_and_snapshot():
    import sys

    job = jobs.create_job("build")
    assert job.status == "queued"

    jobs.run_subprocess_job(job, [sys.executable, "-c", "print('line one'); print('line two')"])
    for _ in range(100):
        if job.status not in ("queued", "running"):
            break
        time.sleep(0.05)
    assert job.status == "ok"
    assert job.exit_code == 0
    snap = job.snapshot(after=0)
    assert any("line one" in l for l in snap["lines"])
    # Incremental tail: skip past everything, get nothing back.
    assert job.snapshot(after=snap["lineCount"])["lines"] == []


def test_job_failure_status():
    import sys

    job = jobs.create_job("flash")
    jobs.run_subprocess_job(job, [sys.executable, "-c", "raise SystemExit(3)"])
    for _ in range(100):
        if job.status not in ("queued", "running"):
            break
        time.sleep(0.05)
    assert job.status == "error"
    assert job.exit_code == 3


def test_job_redacted_display_argv():
    import sys

    job = jobs.create_job("build")
    jobs.run_subprocess_job(
        job,
        [sys.executable, "-c", "pass"],
        display_argv=["python", "-c", "<redacted>"],
    )
    for _ in range(100):
        if job.status not in ("queued", "running"):
            break
        time.sleep(0.05)
    assert job.lines[0] == "$ python -c <redacted>"
