"""Serial monitor sessions — multiple ports open at once, each with a
reader thread filling a sequence-numbered ring buffer. The WebSocket route
in routes.py streams new lines; REST clients can poll read_lines()."""

import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional

try:
    import serial  # pyserial
except ImportError:
    serial = None  # type: ignore[assignment]

from backend.devicelab.ports import is_known_port

RING_SIZE = 2000


class MonitorSession:
    def __init__(self, port: str, baud: int) -> None:
        if serial is None:
            raise RuntimeError("pyserial not installed")
        self.port = port
        self.baud = baud
        self.seq = 0
        self.lines: deque = deque(maxlen=RING_SIZE)  # (seq, text)
        self.lock = threading.Lock()
        self.closed = False
        self.serial = serial.Serial(port, baud, timeout=0.25)
        self.thread = threading.Thread(target=self._reader, daemon=True)
        self.thread.start()

    def _append(self, text: str) -> None:
        with self.lock:
            self.seq += 1
            self.lines.append((self.seq, text))

    def _reader(self) -> None:
        buffer = b""
        while not self.closed:
            try:
                chunk = self.serial.read(256)
            except Exception:
                self._append("[monitor] port read failed — closing")
                break
            if chunk:
                buffer += chunk
                while b"\n" in buffer:
                    line, _, buffer = buffer.partition(b"\n")
                    self._append(line.decode("utf-8", errors="replace").rstrip("\r"))
        self.closed = True
        try:
            self.serial.close()
        except Exception:
            pass

    def write_line(self, text: str, newline: bool = True) -> bool:
        if self.closed:
            return False
        data = text.encode("utf-8") + (b"\n" if newline else b"")
        try:
            self.serial.write(data)
            return True
        except Exception:
            return False

    def read_lines(self, after: int = 0) -> Dict[str, Any]:
        with self.lock:
            fresh: List[Dict[str, Any]] = [
                {"seq": s, "text": t} for (s, t) in self.lines if s > after
            ]
            return {"port": self.port, "baud": self.baud, "seq": self.seq, "lines": fresh, "open": not self.closed}

    def close(self) -> None:
        self.closed = True


SESSIONS: Dict[str, MonitorSession] = {}
_SESSIONS_LOCK = threading.Lock()


def open_session(port: str, baud: int) -> MonitorSession:
    if not is_known_port(port):
        raise ValueError(f"port not present: {port}")
    with _SESSIONS_LOCK:
        existing = SESSIONS.get(port)
        if existing and not existing.closed:
            if existing.baud == baud:
                return existing
            existing.close()
        session = MonitorSession(port, baud)
        SESSIONS[port] = session
        return session


def get_session(port: str) -> Optional[MonitorSession]:
    session = SESSIONS.get(port)
    return session if session and not session.closed else None


def close_session(port: str) -> bool:
    with _SESSIONS_LOCK:
        session = SESSIONS.pop(port, None)
    if session:
        session.close()
        # Give the OS a beat to release the handle before esptool opens it.
        time.sleep(0.3)
        return True
    return False


def probe(port: str, baud: int, command: str, wait_s: float = 2.0) -> Dict[str, Any]:
    """Send one test command ("ping", "info", "test") to the firmware over
    serial and collect its reply lines. Reuses an open monitor session, or
    opens a temporary one and closes it afterwards."""
    had_session = get_session(port) is not None
    session = open_session(port, baud)
    since = session.seq
    if not session.write_line(command):
        raise RuntimeError("could not write to the port")
    deadline = time.time() + wait_s
    lines: List[str] = []
    while time.time() < deadline:
        time.sleep(0.15)
        fresh = session.read_lines(after=since)["lines"]
        if fresh:
            since = fresh[-1]["seq"]
            lines.extend(l["text"] for l in fresh)
            # A JSON reply or a pong is complete — stop early.
            if any(l.startswith("{") or l.startswith("pong") for l in lines):
                break
    if not had_session:
        close_session(port)
    return {"port": port, "command": command, "lines": lines, "replied": len(lines) > 0}


def list_sessions() -> List[Dict[str, Any]]:
    return [
        {"port": s.port, "baud": s.baud, "open": not s.closed}
        for s in SESSIONS.values()
        if not s.closed
    ]
